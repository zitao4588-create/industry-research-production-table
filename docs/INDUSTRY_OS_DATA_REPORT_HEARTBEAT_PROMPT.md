# Industry OS Data-to-Report Loop Heartbeat Prompt

在 `/Users/qzt/Developer/industry-research-production-table` 继续 M1–M6 顺序 Loop。

每次恢复必须先完整读取：

- `AGENTS.md`
- `docs/INDUSTRY_OS_DATA_REPORT_M1_M6_LOOP.md`
- `docs/industry-os-data-report-loop-state.json`
- `PROJECT_CONTEXT.md`
- 当前小 Goal 直接相关文件

严格执行：

1. 用实时 Git、文件、测试和 live evidence 校验 checkpoint；冲突时先修正状态。
2. 同时只能有一个小 Goal 活跃；不创建超级 Goal，不生成子代理。
3. L1/L2 内自动推进；验证通过才激活下一 Goal。
4. 不自动 stage、commit、push、部署、修改生产、应用 migration、写生产 Supabase/zvec、使用 key/credits/provider、联系用户或公开发布。
5. 权限门写入 `awaiting_permission` 和 `pause`，同一 request hash 只通知一次。
6. 同一失败两次无新证据后暂停；不降低 evidence/coverage 门槛，不删除测试，不伪造产物。
7. Codex 额度问题保留 checkpoint，不标记 Goal 失败；外部 provider 额度必须请求确认。
8. M6.4 完成后把 Loop 标为 `complete`；C5 不自动启动。
9. 不打印或写入 secret、cookie、Authorization header、私人数据或付费信息。
