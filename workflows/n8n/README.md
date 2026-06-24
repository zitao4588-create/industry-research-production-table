# n8n workflow 草案

本目录只保存 agent-factory 侧的 n8n workflow 合约和可导入草案。当前不要求公网 n8n 可用，也不在本仓库保存任何 n8n 密码、encryption key、服务器 IP 或 SSH 信息。

## 当前 workflow

- `industry-research-intake.json`
  - 入口：n8n Webhook `POST /webhook/industry-research/intake`
  - 动作：调用 agent-factory `POST /api/industry-research/run`
  - 回调：调用 agent-factory `POST /api/industry-research/webhooks/n8n-run-complete`
  - 状态：v0.3 草案；等待自部署 n8n 完成备案 / webblock 解除后再导入验证

## agent-factory 环境变量

```bash
AGENT_FACTORY_BASE_URL=https://api.example.com
AGENT_FACTORY_INTERNAL_API_KEY=replace-with-server-secret
AGENT_FACTORY_N8N_WEBHOOK_SECRET=replace-with-webhook-secret
AGENT_FACTORY_N8N_ENABLED=false
```

`AGENT_FACTORY_INTERNAL_API_KEY` 用于 n8n 调用 `/api/industry-research/run`。  
`AGENT_FACTORY_N8N_WEBHOOK_SECRET` 用于 n8n 回调 `/api/industry-research/webhooks/n8n-run-complete`。

## webhook 合约

n8n 回调 agent-factory 时必须带其中一个 header：

```http
x-agent-factory-webhook-secret: <AGENT_FACTORY_N8N_WEBHOOK_SECRET>
```

请求体：

```json
{
  "runId": "industry-research-run-id",
  "status": "completed",
  "n8nExecutionId": "optional-n8n-execution-id",
  "deliveryPackageApiPath": "/api/industry-research/runs/<runId>/download",
  "message": "optional summary"
}
```

当前 route 只确认事件，不写 Supabase；后续接持久化时应写入 `run_logs` 或自动化事件表。

## 与轻量服务器项目的衔接

自部署 n8n 仍以 `/Users/qzt/Developer/轻量服务器/compose/n8n/` 为准。当前已知边界：

- 等备案 / DNSPod webblock 解除前，不启动公网 n8n。
- n8n 不能直接暴露 `5678`，未来必须走 Caddy 反向代理和 HTTPS。
- 真实 `.env`、`N8N_ENCRYPTION_KEY`、登录密码只放服务器，不写入 agent-factory。
- 未来推荐域名规划：`n8n.<domain>` 指向 n8n，`api.<domain>` 指向 agent-factory API 或内部部署环境。

## 导入前检查

1. n8n 已在服务器内网容器启动，外部只通过 Caddy HTTPS 访问。
2. Caddy 能为 n8n 域名签发证书。
3. workflow 中使用的环境变量已经在 n8n 运行环境中配置。
4. agent-factory 的 `/api/health` 返回 `status=ok`。
5. 先用本地或内网样例跑通，再考虑定时触发。
