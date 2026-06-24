# 行业研究生产台 v0.3 边界扩展说明

更新时间：2026-06-18

v0.3 的目标不是完整 SaaS，而是把 v0.2 的行业研究生产台推进到“可交付、可留档、可准备内部部署和自动化”的边界版本。仍然不做登录注册、支付、多租户、代理池爬虫、公开生产发布或生产数据库迁移。

## 1. 交付包 / run 管理

每次行业研究 run 的本地交付包标准文件：

- `input.json`：原始研究输入
- `raw_documents.json`：公开采集文档和 `sourceQuality`
- `databases.json`：九类数据库快照、evidence、research_sources
- `review_items.json`：人工审核队列
- `report.md`：交付级运行报告
- `reviewed_report.md`：人工审核版报告
- `run_log.json`：运行日志、采集失败、质量摘要
- `manifest.json`：v0.3 交付包清单

Studio/API 最小入口：

- `POST /api/industry-research/run`：运行成功后默认写入本地交付包，可通过 `AGENT_FACTORY_PERSIST_INDUSTRY_RESEARCH_RUNS=false` 关闭
- `GET /api/industry-research/runs`：读取本地 run 列表
- `GET /api/industry-research/runs/:runId`：读取单个 run 详情
- `GET /api/industry-research/runs/:runId/download`：下载 JSON 交付包附件

当前下载包先用 JSON 聚合，不引入 zip 依赖。后续如果需要客户交付 zip，再在此基础上做压缩层。

## 2. 采集质量扩展

public_web 仍坚持保守采集：

- 只抓公开 `http/https` URL。
- 不绕过登录、验证码、付费墙、robots 边界或私人数据。
- 不使用代理池。
- RSS、collection、product、blog 只从真实页面、robots 或 sitemap 链接进入，不默认猜测未验证路径。

v0.3 增强点：

- `crawl_runs.summary` 增加稳定失败前缀，例如 `HTTP_ERROR`、`FETCH_ERROR`、`MISSING_SOURCE`、`UNSUPPORTED_PUBLIC_TARGET`。
- `run_log.json` 增加 `crawlFailureSummary`，便于审计失败类型分布。
- `sourceDiscoveryNotes` 增加探测数量、可访问数量、失败数量和目标类型分布。

## 3. 数据库边界扩展

本轮只实现最小持久化边界，不切运行时存储：

- TypeScript repository contract：`IndustryResearchRepository`
- 本地 JSON 兼容 adapter：`createIndustryResearchLocalJsonRepository`
- 最小对象：research runs、raw documents、review items、reports、run logs

Supabase 后续接入原则：

- 不能直接应用现有 migration 草案。
- 必须先补 deny-by-default RLS。
- 服务端写入必须走受控 service role，客户端不能直接写行业研究表。
- 本地 JSON/Markdown 留档能力必须继续保留，不能被数据库替代掉。

## 4. 内部部署边界扩展

新增内部部署预留：

- `GET /api/health`
- `AGENT_FACTORY_INTERNAL_API_KEY`
- `AGENT_FACTORY_PERSIST_INDUSTRY_RESEARCH_RUNS`
- `AGENT_FACTORY_INDUSTRY_RESEARCH_RUNS_DIR`
- `AGENT_FACTORY_N8N_WEBHOOK_SECRET`

部署边界：

- 可以部署到自有轻量服务器或 Vercel 内部环境。
- 不能公开成 SaaS。
- 不做登录、支付、多租户。
- 不把 API key、服务器 IP、SSH 私钥、n8n 密码或 `N8N_ENCRYPTION_KEY` 写入仓库。
- 生产环境必须配置 shared secret；无 secret 时行业研究 API 应拒绝运行。

Caddy/API 域名规划只做预留：

- `api.<domain>`：未来指向 agent-factory API 或内部部署环境。
- `n8n.<domain>`：未来指向自部署 n8n。
- 当前备案 / webblock 未解除前，不启动公网 n8n。

## 5. n8n 自动化边界扩展

当前只预留合约和草案：

- workflow：`workflows/n8n/industry-research-intake.json`
- 说明：`workflows/n8n/README.md`
- n8n 入口：`POST /webhook/industry-research/intake`
- agent-factory 回调：`POST /api/industry-research/webhooks/n8n-run-complete`

安全规则：

- n8n 不能直接暴露 `5678`。
- 未来必须走 Caddy HTTPS 反向代理。
- n8n 调用 agent-factory run API 使用 `x-internal-key`。
- n8n 回调 agent-factory 使用 `x-agent-factory-webhook-secret`。
- 本轮不要求真实 n8n 服务启动，不要求公网 webhook 可访问。

## 当前未做

- 不生成 `v02-summary.md`。
- 不接生产 Supabase。
- 不启动公网 n8n。
- 不 Docker 化 agent-factory。
- 不接登录、支付、多租户。
- 不做代理池或验证码绕过。
