#!/usr/bin/env bash
# 轻量服务器部署脚本（T10）：把 DECISIONS 2026-06-29 记录的手工 runbook 固化。
#
# 流程：git archive HEAD → 服务器备份 → 非删除式 rsync（固定排除清单）→
#       pnpm install --frozen-lockfile → pnpm build → doctor 三件套 →
#       systemctl restart → health 检查。
#
# 安全边界：
# - 默认 --dry-run：只打印计划和 rsync -n 结果，不改动服务器。
# - 真实执行必须显式传 --execute，并逐步确认。
# - 永不删除远端文件（rsync 不带 --delete）；生产 env、node_modules、
#   运行数据、备份目录都在排除清单里（对齐 DECISIONS 2026-06-29）。
# - 本脚本不读取、不打印任何密钥。
set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-lighthouse-lab}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/playgamelab/industry-research}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://research.playgamelab.cn/api/health}"
SERVICE_NAME="${DEPLOY_SERVICE_NAME:-industry-research.service}"
MODE="dry-run"

for arg in "$@"; do
  case "$arg" in
    --execute) MODE="execute" ;;
    --dry-run) MODE="dry-run" ;;
    *)
      echo "未知参数：$arg（支持 --dry-run / --execute）" >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE_DIR="$(mktemp -d /tmp/industry-research-deploy.XXXXXX)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
trap 'rm -rf "$STAGE_DIR"' EXIT

# 排除清单：与 DECISIONS 2026-06-29「非删除式同步」一致。
# git archive 只包含已提交文件，因此 .git/.env.local/node_modules 天然不进包；
# rsync 侧再显式排除远端不可覆盖路径，双保险。
RSYNC_EXCLUDES=(
  --exclude ".git"
  --exclude ".env.local"
  --exclude "industry-research.env*"
  --exclude "node_modules"
  --exclude ".next"
  --exclude ".cache"
  --exclude "outputs"
  --exclude ".deploy-backups"
  --exclude ".claude"
  --exclude ".codebuddy"
  --exclude ".workbuddy"
  --exclude "remotion-videos"
)

echo "== 行业研究生产台部署（mode=$MODE）=="
echo "repo:        $REPO_ROOT"
echo "ssh host:    $SSH_HOST"
echo "remote dir:  $REMOTE_DIR"
echo "service:     $SERVICE_NAME"
echo "health:      $HEALTH_URL"
echo

echo "[1/8] git archive HEAD → 暂存目录"
git -C "$REPO_ROOT" archive --format=tar HEAD | tar -x -C "$STAGE_DIR"
echo "  staged files: $(find "$STAGE_DIR" -type f | wc -l | tr -d ' ')"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
echo "  HEAD: $HEAD_SHA"

if [[ "$MODE" == "dry-run" ]]; then
  echo
  echo "[2/8] （dry-run）远端备份计划："
  echo "  ssh $SSH_HOST \"cd $REMOTE_DIR && tar -czf .deploy-backups/pre-$HEAD_SHA-$TIMESTAMP.tar.gz --exclude node_modules --exclude .next --exclude .deploy-backups .\""
  echo
  echo "[3/8] （dry-run）rsync 变更预览（-n，不落盘）："
  if ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" true 2>/dev/null; then
    rsync -avzn "${RSYNC_EXCLUDES[@]}" "$STAGE_DIR/" "$SSH_HOST:$REMOTE_DIR/" | tail -20
  else
    echo "  （跳过：ssh $SSH_HOST 当前不可达，仅展示本地打包结果）"
  fi
  echo
  echo "[4/8..8/8] （dry-run）后续步骤计划："
  echo "  ssh $SSH_HOST \"cd $REMOTE_DIR && pnpm install --frozen-lockfile\""
  echo "  ssh $SSH_HOST \"cd $REMOTE_DIR && pnpm build\""
  echo "  ssh $SSH_HOST \"cd $REMOTE_DIR && sudo -u ubuntu bash -lc 'set -a; source $REMOTE_DIR/industry-research.env; set +a; pnpm server:doctor && pnpm supabase:doctor && pnpm supabase:smoke'\""
  echo "  ssh $SSH_HOST \"sudo systemctl restart $SERVICE_NAME && systemctl is-active $SERVICE_NAME\""
  echo "  curl -fsS $HEALTH_URL"
  echo
  echo "确认无误后运行：bash deploy/lightweight-server/deploy.sh --execute"
  exit 0
fi

echo
echo "[2/8] 远端备份 → .deploy-backups/pre-$HEAD_SHA-$TIMESTAMP.tar.gz"
ssh "$SSH_HOST" "mkdir -p $REMOTE_DIR/.deploy-backups && cd $REMOTE_DIR && tar -czf .deploy-backups/pre-$HEAD_SHA-$TIMESTAMP.tar.gz --exclude node_modules --exclude .next --exclude .deploy-backups ."

echo "[3/8] 非删除式 rsync 同步"
rsync -avz "${RSYNC_EXCLUDES[@]}" "$STAGE_DIR/" "$SSH_HOST:$REMOTE_DIR/"

echo "[4/8] pnpm install --frozen-lockfile"
ssh "$SSH_HOST" "cd $REMOTE_DIR && pnpm install --frozen-lockfile"

echo "[5/8] pnpm build"
ssh "$SSH_HOST" "cd $REMOTE_DIR && pnpm build"

echo "[6/8] doctor 检查（按 systemd env 加载）"
ssh "$SSH_HOST" "cd $REMOTE_DIR && sudo -u ubuntu bash -lc 'set -a; source $REMOTE_DIR/industry-research.env; set +a; cd $REMOTE_DIR && pnpm server:doctor && pnpm supabase:doctor'"

echo "[7/8] 重启服务"
ssh "$SSH_HOST" "sudo systemctl restart $SERVICE_NAME && systemctl is-active $SERVICE_NAME"

echo "[8/8] 公网 health 检查"
curl -fsS "$HEALTH_URL"
echo
echo "== 部署完成：$HEAD_SHA =="
