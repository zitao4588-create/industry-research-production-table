# Industry OS G7 六模块研究契约

更新时间：2026-07-12

## 结果

G7 新增 `industry_module_result.v1` 与固定顺序的 `industry_module_results.v1`。市场、监管、消费者需求、电商竞品、内容流量、商业模式/供应链六个模块分别产出 claims、coverage、gaps 和模块状态；单模块 blocked 不会修改或移除其他模块的结果。

## 确认门禁

- 每条 confirmed claim 必须回溯到 evidence、正式 source、raw document 和唯一 quote。
- runner 会重新执行 G6 source-role / claim-role 授权与 quote 校验，不信任已有 `sourceAccepted=true`。
- coverage 同时核对独立来源数、来源角色数、代表样本数和每个轴项；要求样本的 coverage row 只有在样本确实覆盖该轴时才计入。
- 样本必须属于模块允许的行业关系；content actor、supply-chain actor、channel actor 和 business-model analogy 不能跨模块冒充。
- 内容/流量指标不能直接支持转化结论；商业模式盈利判断必须含 financial report；品牌级结论不能外推为全行业结论。
- 无来源、角色错误、quote/claim 不完整、样本或轴覆盖不足时保持 blocked，并记录结构化 gaps。

## 顺序检查点

1. G7.1 市场：3 条 coverage row；至少两类授权市场来源。
2. G7.2 监管：监管/标准原文覆盖全部问题；品牌来源不能替代。
3. G7.3 消费者需求：至少两类需求来源、直接用户证据和两个代表样本。
4. G7.4 电商竞品：taxonomy、price tier、channel 三类覆盖与样本轴绑定。
5. G7.5 内容流量：至少两类内容/趋势来源和两个 content actors；禁止转化外推。
6. G7.6 商业模式/供应链：产业链与商业模式覆盖；盈利必须有财报。

## 本地 fixture

- 命令：`pnpm research:modules:fixture`
- 产物：`outputs/industry-module-results/skincare/module-results.json`
- SHA-256：`f9c36410b8187f6cc9785d605040c6b067437a96cc62e73fadd1f5f439072f26`（连续两次一致）
- 结果：6/6 modules complete、11 confirmed contract claims、11/11 coverage rows pass、0 blocked modules。
- 边界：全部内容明确为 `contract-only`，`contractFixtureTreatedAsExternalFact=false`、`synthesisAllowed=false`、`liveProviderCalls=0`；这不是实际护肤品研究事实或完整行业报告。

## 验收

- `pnpm check`：23 个测试文件、239 条测试通过，workspace typecheck 与 Biome 全绿。
- `git diff --check` 与敏感信息模式扫描通过。
- 旧 benchmark runner 保持 62 additions / 22 deletions。
- 未联网、未调用 provider/key/credits、未写数据库或生产状态，未 commit、push 或部署。

G8 才允许把已通过模块结果转成 fact/signal/inference/hypothesis claim ledger，并生成本地报告/知识地图；blocked 内容和 contract fixture 仍不得伪造成行业事实。
