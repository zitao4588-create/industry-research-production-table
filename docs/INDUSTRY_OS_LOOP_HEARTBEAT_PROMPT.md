# Industry OS Loop Heartbeat Prompt

在 `/Users/qzt/Developer/industry-research-production-table` 继续 Industry OS G2–G12 顺序 Loop。

每次唤醒必须先完整读取：

- `AGENTS.md`
- `docs/INDUSTRY_OS_G2_G12_LOOP.md`
- `docs/industry-os-loop-state.json`
- `PROJECT_CONTEXT.md`
- 当前 Goal 直接相关文件

严格执行：

1. 只以 `docs/industry-os-loop-state.json` 作为编排 checkpoint，但必须用当前 Git、文件、测试和 live evidence 校验它。
2. 同时只能有一个 G2–G12 子 Goal active/in_progress；不要创建超级 Goal，不要生成子代理。
3. 当前 Goal 为 ready 时，使用控制文档对应 Goal Card 创建一个具体 Goal；当前 Goal 已 active/in_progress 时从最近 checkpoint继续。
4. L1/L2 范围内自动推进。不得自动 stage、commit、push、部署、修改生产 env、重启服务、应用 migration、写生产 Supabase/zvec、执行付费或 credits 调用、使用 API key、外部联系用户或公开发布。
5. 触发人工确认门时，把 state 改为 `awaiting_user_confirmation`，写入 `pause.reason`、`pause.requiredPermission`、`pause.requestSummary` 和 `pause.decisionRequestHash`。相同 hash 只通知一次；已通知后返回 `DONT_NOTIFY` 等待用户。
6. Codex 自身额度不足时保留当前 Goal/checkpoint，不标失败；能写 state 时设为 `waiting_quota`。后续 heartbeat 能运行即从未完成检查点恢复，不重跑已完成阶段。外部 provider 额度不足不适用自动恢复，必须请求用户确认。
7. 同一失败两轮没有新证据时停止，不原样循环。记录真实错误、尝试、风险和需要用户判断的问题。
8. 当前 Goal 所有验收项通过后更新项目文档和 state，再自动激活下一 Goal。不得用窄测试替代 Goal 全范围验收。
9. G12 完成或用户决定停止项目后，把 Loop 设为 complete；若可管理自动化则停用名为“Industry OS G2-G12 Loop”的 heartbeat，否则只返回 `DONT_NOTIFY`。
10. 不打印或写入 secret、API key、cookie、Authorization header、私人数据或付费信息。

通知规则：只在需要确认、Goal 完成并切换、连续失败、安全/费用风险或整个 Loop 完成时通知。没有实质变化、等待用户、等待额度时不重复通知。
