#!/usr/bin/env bash
# 把 workflows/n8n/industry-research-weekly-rerun.json 导入生产 n8n（T7 订阅模式）。
#
# 流程（对齐 DECISIONS 2026-06-29 的 n8n 导入纪律）：
#   备份现有全部 workflow → docker cp 导入 JSON → n8n import:workflow →
#   激活 → 重启 n8n 容器刷新触发器注册 → 手动执行一次做 smoke。
#
# 安全边界：
# - 默认 --dry-run，只打印计划。
# - 新 workflow id 是 industryResearchWeeklyRerun，与现有 intake（
#   industryResearchV03Intake）不同 id，不会覆盖现有 workflow。
# - JSON 内不含任何 secret（有合约测试守着）；本脚本也不读取 env 密钥。
# - smoke 会触发一次真实 public_web run（不调用 LLM，成本可忽略）。
set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-lighthouse-lab}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n}"
WORKFLOW_ID="industryResearchWeeklyRerun"
LOCAL_JSON="workflows/n8n/industry-research-weekly-rerun.json"
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

if [[ ! -f "$LOCAL_JSON" ]]; then
  echo "找不到 $LOCAL_JSON（请在仓库根目录运行）" >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"

echo "== n8n 周报 workflow 导入（mode=$MODE）=="
echo "ssh host:  $SSH_HOST"
echo "container: $N8N_CONTAINER（可用 N8N_CONTAINER=<name> 覆盖；先 docker ps 确认）"
echo "workflow:  $WORKFLOW_ID"
echo

if [[ "$MODE" == "dry-run" ]]; then
  echo "（dry-run）将执行："
  echo "  1. ssh $SSH_HOST docker exec $N8N_CONTAINER n8n export:workflow --all --output=/home/node/.n8n/workflow-backups/all-$TIMESTAMP.json"
  echo "  2. scp $LOCAL_JSON $SSH_HOST:/tmp/ && ssh $SSH_HOST docker cp /tmp/industry-research-weekly-rerun.json $N8N_CONTAINER:/tmp/"
  echo "  3. ssh $SSH_HOST docker exec $N8N_CONTAINER n8n import:workflow --input=/tmp/industry-research-weekly-rerun.json"
  echo "  4. ssh $SSH_HOST docker exec $N8N_CONTAINER n8n update:workflow --id=$WORKFLOW_ID --active=true"
  echo "  5. ssh $SSH_HOST docker restart $N8N_CONTAINER（刷新 Schedule Trigger 注册）"
  echo "  6. ssh $SSH_HOST docker exec $N8N_CONTAINER n8n execute --id=$WORKFLOW_ID（手动 smoke：会真实触发一次 public_web run）"
  echo "  7. 人工核查：n8n UI 执行记录 + /api/industry-research/runs 出现新 run + Supabase n8n events 四态"
  echo
  echo "导入前建议编辑 Subscription List 节点内的订阅清单（当前内置宠物益生菌样例）。"
  echo "确认后运行：bash deploy/lightweight-server/import-weekly-workflow.sh --execute"
  exit 0
fi

echo "[1/6] 备份现有全部 workflow"
ssh "$SSH_HOST" "docker exec $N8N_CONTAINER sh -lc 'mkdir -p /home/node/.n8n/workflow-backups' && docker exec $N8N_CONTAINER n8n export:workflow --all --output=/home/node/.n8n/workflow-backups/all-$TIMESTAMP.json"

echo "[2/6] 传输 workflow JSON"
scp "$LOCAL_JSON" "$SSH_HOST:/tmp/industry-research-weekly-rerun.json"
ssh "$SSH_HOST" "docker cp /tmp/industry-research-weekly-rerun.json $N8N_CONTAINER:/tmp/industry-research-weekly-rerun.json && rm /tmp/industry-research-weekly-rerun.json"

echo "[3/6] 导入 workflow"
ssh "$SSH_HOST" "docker exec $N8N_CONTAINER n8n import:workflow --input=/tmp/industry-research-weekly-rerun.json"

echo "[4/6] 激活 workflow"
ssh "$SSH_HOST" "docker exec $N8N_CONTAINER n8n update:workflow --id=$WORKFLOW_ID --active=true"

echo "[5/6] 重启 n8n 容器"
ssh "$SSH_HOST" "docker restart $N8N_CONTAINER"
echo "  等待容器就绪..."
ssh "$SSH_HOST" "until docker exec $N8N_CONTAINER n8n --version >/dev/null 2>&1; do sleep 2; done"

echo "[6/6] 手动执行一次 smoke（触发真实 public_web run）"
ssh "$SSH_HOST" "docker exec $N8N_CONTAINER n8n execute --id=$WORKFLOW_ID" || {
  echo "手动执行返回非零：请在 n8n UI 查看执行记录定位节点错误。" >&2
  exit 1
}

echo
echo "完成。请人工核查："
echo "  - n8n UI 执行记录（intake workflow 应有一次新执行）"
echo "  - 带内部 key 调用 /api/industry-research/runs 应出现新 run"
echo "  - Supabase industry_research_n8n_events 应有 queued/running/completed 事件"
