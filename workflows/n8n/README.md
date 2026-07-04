# n8n workflow

本目录保存行业研究生产台的 n8n workflow 合约和可导入 workflow。仓库不保存任何 n8n 密码、encryption key、服务器 IP、内部 API key 或 webhook secret。

## 当前 workflow

- `industry-research-intake.json`
  - 入口：n8n Webhook `POST /webhook/industry-research/intake`
  - 动作：调用行业研究 `POST /api/industry-research/run`
  - 回调：调用行业研究 `POST /api/industry-research/webhooks/n8n-run-complete`
  - 状态：2026-06-29 四态版本已导入轻量服务器 n8n，同 id 更新 `industryResearchV03Intake`，并验证 `public_web` 默认业务流可跑通。
- `industry-research-weekly-rerun.json`（T7 订阅模式）
  - 入口：Schedule Trigger，每周一 09:00（n8n 实例时区）。
  - 动作：读取 Code 节点内嵌的订阅品类清单，逐项 POST 到生产 intake webhook；复用现有四态 intake workflow，不直接调用 run API，因此本 workflow 不需要任何凭据。
  - 周报：交付层会把本次 run 与上一次同项目（industry+category+market）run 的 databases.json 做 diff，写入 `weekly_intelligence_reports` 和报告的「本期新增与变化」节。
  - 状态：JSON 已入库，**默认 `active: false`，尚未导入生产 n8n**。
  - 导入步骤（沿用 DECISIONS 2026-06-29 的同 id 流程）：先备份现有 workflow → 导入本 JSON（新 id `industryResearchWeeklyRerun`，不会与 intake 冲突）→ 编辑 `Subscription List` Code 节点里的订阅清单 → publish → 手动执行一次验证 intake webhook 接收成功 → 确认无误后再 activate。
  - 回滚：deactivate 该 workflow 即停止定时触发，不影响 intake workflow。

默认模式：

- workflow 未传 `mode` 时使用 `public_web`，不调用 LLM，优先保证业务流稳定产出交付包。
- 如要走 9router，可在请求体显式传 `mode: "public_web_9router"` 或 `mode: "9router"`。
- 当前 MiMo Free / `mmf/mimo-auto` 有上游 `risk_control` 风险，不能作为稳定默认链路。

## n8n 凭据

生产 n8n 使用两个 Header Auth credentials，而不是在 workflow JSON 中写 secret：

- `Industry Research Internal Header`：发送 `x-internal-key`
- `Industry Research n8n Webhook Header`：发送 `x-agent-factory-webhook-secret`

凭据值只保存在 n8n 加密存储和服务器本地 env 中，不进入 Git。

## webhook 合约

n8n 回调 agent-factory 时必须带其中一个 header：

```http
x-agent-factory-webhook-secret: <AGENT_FACTORY_N8N_WEBHOOK_SECRET>
```

请求体：

```json
{
  "runId": "industry-research-run-id",
  "status": "queued | running | completed | failed",
  "n8nExecutionId": "optional-n8n-execution-id",
  "deliveryPackageApiPath": "/api/industry-research/runs/<runId>/download",
  "message": "optional summary"
}
```

`deliveryPackageApiPath` 只要求在 `completed` 事件中存在；`queued` / `running` / `failed` 可只带 runId、status、execution id 和 message。

当前 route 在 `AGENT_FACTORY_SUPABASE_ENABLED=true` 时会把事件写入 `industry_research_n8n_events`；未启用 Supabase 时只确认鉴权和 payload 校验。

## 与轻量服务器项目的衔接

自部署 n8n 仍以 `/Users/qzt/Developer/轻量服务器/compose/n8n/` 为准。当前已知边界：

- n8n 已通过 Caddy 暴露为 HTTPS 入口。
- n8n 不能直接暴露 `5678`，容器端口只绑定本机回环。
- 真实 `.env`、`N8N_ENCRYPTION_KEY`、登录密码只放服务器，不写入 agent-factory。
- 行业研究生产台入口和 9router 入口以轻量服务器项目文档为准。

## 验证记录

- 2026-06-25：n8n workflow 已导入并 active。
- 2026-06-25：不传 `mode` 的 `public_web` webhook 请求返回 `industry_research_n8n_run_complete_ack.v1`。
- 2026-06-25：生成交付包目录，包含 `input.json`、`raw_documents.json`、`databases.json`、`review_items.json`、`report.md`、`reviewed_report.md`、`run_log.json`、`manifest.json`。
- 2026-06-25：下载 API 使用内部 key 可返回该 run 的交付包 JSON。
- 2026-06-29：四态 workflow 已导入生产 n8n；首次 smoke 暴露 Run 节点读取 callback ack 的表达式问题，已改为读取 `$('Webhook Intake').item.json`。
- 2026-06-29：修正后 execution `12` 完成 queued / running / completed 三事件落库；completed runId 为 `n8n-four-state-smoke-fixed-2026-06-29T16-17-15-732Z`。
