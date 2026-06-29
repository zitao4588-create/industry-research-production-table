# 轻量服务器运行架构

更新时间：2026-06-29

## 结论

行业研究生产台的生产运行面固定在轻量服务器上。前端可由 Claude Code 继续简化，但正式 API、run 执行、n8n 回调、本地交付包、zvec 缓存和 provider gateway 都以轻量服务器为主。

## 运行组件

- `research.playgamelab.cn`：行业研究 Next/API 入口，经 Caddy 反代到 `127.0.0.1:3010`。
- `n8n.playgamelab.cn`：n8n production webhook 入口，负责触发行业研究 run。
- `router.playgamelab.cn`：9router / OpenAI-compatible provider gateway。
- Supabase：权威运行记录库，保存 run metadata、artifact、n8n event、zvec chunk metadata；只由服务器 service role 写入。
- zvec：轻量服务器本地检索缓存，索引历史交付包，目录默认为 `/var/lib/industry-research/zvec/chunks`。
- 本地交付包：仍保留在 `/var/lib/industry-research/runs`，作为调试、恢复和 zvec 重建来源。

## 数据流

1. n8n 或内部调用方请求 `POST https://research.playgamelab.cn/api/industry-research/run`，带 `x-internal-key`。
2. Next/API 在轻量服务器本机执行 `public_web` 或显式 LLM 模式。
3. run 产物先写入 `/var/lib/industry-research/runs/<runId>/` 的 8 文件交付包。
4. 如果 `AGENT_FACTORY_SUPABASE_ENABLED=true`，同一份交付包写入 Supabase。
5. n8n 回调 `POST /api/industry-research/webhooks/n8n-run-complete`，启用 Supabase 时写入 `industry_research_n8n_events`。
6. `pnpm zvec:index` 从本地交付包重建 zvec 缓存；timer 可定期刷新。

## 非目标

- 不把生产 API 放到 Vercel。
- 不把本机开发目录当生产运行目录。
- 不做登录、支付、多租户。
- 不让浏览器直接读写 Supabase 表。
- 不把 zvec 当权威数据库。

## 部署资产

模板在 `deploy/lightweight-server/`：

- `industry-research.env.example`
- `industry-research.service`
- `industry-research-zvec-index.service`
- `industry-research-zvec-index.timer`
- `Caddyfile.example`

服务端检查命令：

```bash
pnpm server:doctor
pnpm supabase:doctor
pnpm zvec:index
pnpm zvec:search --query="Amazon"
```

`pnpm server:doctor` 会检查轻量服务器运行所需 env、端口、目录、内部 key、n8n secret、Supabase 和 zvec 状态；不会打印 secret。

手动在服务器上运行 `pnpm server:doctor`、`pnpm zvec:index` 或
`pnpm zvec:search` 时，脚本会默认尝试读取
`/etc/industry-research/industry-research.env`。如果临时使用别的 env 文件，
可以设置 `AGENT_FACTORY_ENV_FILE=/path/to/file`。

Supabase 当前专用 project：

- ref：`ghsyjdipofnyokbbbrdb`
- URL：`https://ghsyjdipofnyokbbbrdb.supabase.co`
- 服务器 env：`AGENT_FACTORY_SUPABASE_ENABLED=true`
- secret：`SUPABASE_SERVICE_ROLE_KEY` 只放服务器 env，不写入 repo。
