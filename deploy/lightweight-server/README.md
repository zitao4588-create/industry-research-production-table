# 轻量服务器部署模板

本目录只放可审查模板，不放真实密钥、服务器 IP、SSH 私钥、n8n 密码或 Supabase service role key。

## 一键脚本（2026-07-05 起）

三个脚本都默认 `--dry-run`（只打印计划），确认后加 `--execute` 真实执行；均不打印任何密钥。SSH host 默认 `lighthouse-lab`（可用 `DEPLOY_SSH_HOST` 覆盖）。推荐执行顺序：

```bash
# 1. 把本机 .env.local 的 AGENT_FACTORY_LLM_*（DeepSeek）写入服务器 env（自动备份）
bash deploy/lightweight-server/configure-llm-env.sh --dry-run   # 复核计划
bash deploy/lightweight-server/configure-llm-env.sh --execute

# 2. 部署已提交代码（git archive → 备份 → 非删除式 rsync → build → doctor → restart → health）
bash deploy/lightweight-server/deploy.sh --dry-run              # 复核变更预览
bash deploy/lightweight-server/deploy.sh --execute

# 3. 导入并激活 n8n 周报 workflow（备份现有 → 导入新 id → 激活 → 重启 → 手动 smoke）
docker_name=$(ssh lighthouse-lab "sudo -n docker ps --format '{{.Names}}' | grep -i n8n")  # 先确认容器名
N8N_CONTAINER="$docker_name" bash deploy/lightweight-server/import-weekly-workflow.sh --dry-run
N8N_CONTAINER="$docker_name" bash deploy/lightweight-server/import-weekly-workflow.sh --execute

# 4. 部署后 LLM 生产复核（服务器上执行，一次廉价 DeepSeek 调用）
ssh lighthouse-lab "set -a; eval \"\$(sudo cat /opt/playgamelab/industry-research/industry-research.env | grep -v '^#' | grep '=')\"; set +a; cd /opt/playgamelab/industry-research && pnpm verify:9router"
```

生产运行面固定为轻量服务器：

- 公网入口：`https://research.playgamelab.cn`
- Next/API 本机监听：`127.0.0.1:3010`
- n8n 入口：`https://n8n.playgamelab.cn/webhook/industry-research/intake`
- 9router / OpenAI-compatible gateway：轻量服务器本机服务或 HTTPS gateway
- 本地交付包：`/var/lib/industry-research/runs`
- zvec 缓存：`/var/lib/industry-research/zvec/chunks`
- repo 工作目录：建议 `/opt/industry-research-production-table`

安装顺序：

1. 在服务器创建专用运行用户和目录。
2. 把 repo 部署到 `/opt/industry-research-production-table`。
3. 复制 `industry-research.env.example` 到 `/etc/industry-research/industry-research.env`，只在服务器上填真实 secret。
4. 执行 `pnpm install --frozen-lockfile && pnpm build`。
5. 安装 `industry-research.service` 到 systemd，并启动服务。
6. 把 `Caddyfile.example` 中的片段合并到服务器 Caddy 配置。
7. 串行运行 `pnpm server:doctor`、`pnpm supabase:doctor`、`pnpm zvec:index`。
8. 如需定期刷新 zvec，安装 `industry-research-zvec-index.service` 和 `industry-research-zvec-index.timer`。

注意：

- 不在轻量服务器之外承载生产 API。
- Vercel 或本机只能作为预览/开发，不承载正式运行、数据目录或 n8n 回调。
- `SUPABASE_SERVICE_ROLE_KEY` 只能存在于服务器 env，不进入浏览器，不进入 Git。
- Supabase project ref / URL 已可写入模板；`SUPABASE_SERVICE_ROLE_KEY` 需要从 Supabase Dashboard 的项目 API keys 页面复制到服务器 env。
- zvec 是缓存，删除后可用 `pnpm zvec:index` 从 run artifacts 重建。
