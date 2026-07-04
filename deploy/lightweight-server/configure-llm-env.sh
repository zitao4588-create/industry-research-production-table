#!/usr/bin/env bash
# 把本机 .env.local 里的 AGENT_FACTORY_LLM_* 三个变量写入轻量服务器生产 env。
#
# 安全边界：
# - 默认 --dry-run：只说明将执行的动作，不连接服务器、不打印任何 key。
# - --execute：先备份远端 env（root:600 权限保持），再幂等更新三个变量
#   （已存在则替换，不存在则追加）；key 经管道传输，不落中间文件、不回显。
# - 有过双 JWT 粘贴事故（BUG_NOTES 2026-06-29），所以逐个变量单行写入。
set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-lighthouse-lab}"
REMOTE_ENV="${DEPLOY_REMOTE_ENV:-/opt/playgamelab/industry-research/industry-research.env}"
LOCAL_ENV="${LOCAL_ENV_FILE:-.env.local}"
MODE="dry-run"

for arg in "$@"; do
  case "$arg" in
    --execute) MODE="execute" ;;
    --dry-run) MODE="dry-run" ;;
    *)
      echo "未知参数：${arg}（支持 --dry-run / --execute）" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "找不到本地 env 文件：$LOCAL_ENV" >&2
  exit 1
fi

VARS=(AGENT_FACTORY_LLM_API_KEY AGENT_FACTORY_LLM_BASE_URL AGENT_FACTORY_LLM_MODEL)

for var in "${VARS[@]}"; do
  if ! grep -q "^${var}=." "$LOCAL_ENV"; then
    echo "本地 $LOCAL_ENV 缺少 ${var}，先补齐再执行。" >&2
    exit 1
  fi
done

echo "== 服务器 LLM env 配置（mode=${MODE}）=="
echo "ssh host:   $SSH_HOST"
echo "remote env: $REMOTE_ENV"
echo "local env:  ${LOCAL_ENV}（只读取 ${VARS[*]}，不打印值）"
echo

if [[ "$MODE" == "dry-run" ]]; then
  echo "（dry-run）将执行："
  echo "  1. ssh $SSH_HOST sudo cp $REMOTE_ENV $REMOTE_ENV.bak-<timestamp>（保留 root:600）"
  echo "  2. 对每个变量：远端 sudo sed 删除旧行 + sudo tee -a 追加新行（值经 stdin 管道，不回显）"
  echo "  3. ssh $SSH_HOST sudo grep -c '^AGENT_FACTORY_LLM_' $REMOTE_ENV 校验为 3"
  echo "  4. 重启服务由 deploy.sh 或 sudo systemctl restart industry-research.service 完成"
  echo
  echo "确认后运行：bash deploy/lightweight-server/configure-llm-env.sh --execute"
  exit 0
fi

TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
echo "[1/3] 备份远端 env → $REMOTE_ENV.bak-$TIMESTAMP"
ssh "$SSH_HOST" "sudo cp -p $REMOTE_ENV $REMOTE_ENV.bak-$TIMESTAMP"

echo "[2/3] 幂等写入 ${#VARS[@]} 个变量（值不回显）"
for var in "${VARS[@]}"; do
  line="$(grep "^${var}=" "$LOCAL_ENV" | head -1)"
  printf '%s\n' "$line" | ssh "$SSH_HOST" "sudo sed -i '/^${var}=/d' $REMOTE_ENV && sudo tee -a $REMOTE_ENV > /dev/null && sudo chmod 600 $REMOTE_ENV"
  echo "  ${var}: 已写入"
done

echo "[3/3] 校验变量行数"
count="$(ssh "$SSH_HOST" "sudo grep -c '^AGENT_FACTORY_LLM_' $REMOTE_ENV")"
echo "  远端 AGENT_FACTORY_LLM_* 行数：${count}（期望 3）"

if [[ "$count" != "3" ]]; then
  echo "行数不符合预期，请人工核查 ${REMOTE_ENV}（备份在 .bak-${TIMESTAMP}）。" >&2
  exit 1
fi

echo "完成。重启服务后生效：ssh $SSH_HOST 'sudo systemctl restart industry-research.service'"
