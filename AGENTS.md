# 协作规则

- 始终用中文沟通。
- 这是独立的行业研究生产台项目，不再包含 agent-factory 的通用脚手架能力。
- 当前优先级是电商竞品研究工作流。
- 不要提交 `.env.local` 或任何 API Key。
- 改代码后运行 `pnpm check`。
- 生产 / 付费交付不要使用免费 9router / Kiro 路由，必须切自付费 provider。
- Supabase migration 当前仍是草案，应用前必须复核 RLS、owner_id 和 policy。

## 当前边界

- 不做登录。
- 不做支付。
- 不做复杂多租户。
- 不绕过登录、验证码或付费墙。
- 不采集私人数据、支付信息或联系方式。
