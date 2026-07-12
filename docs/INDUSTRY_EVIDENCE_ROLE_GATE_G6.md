# Industry OS G6 source-role / claim-role 证据门禁

更新时间：2026-07-12

## 结果

G6 把 Planner 中的来源角色授权正式接入既有证据链。角色信息现在可以从 `ResearchSource.industrySourceRole` 传到 `RawDocument.industrySourceRole`，结构化抽取会给 evidence 写入 `sourceRole`、`claimRole` 和角色校验结果，交付报告会重新计算门禁而不是信任已有的 `sourceAccepted=true`。

## fail-closed 规则

- 新的 role-aware 数据缺少 source role 或 claim role时拒绝确认。
- source 与 raw document 的角色冲突时拒绝绑定。
- `industrySourceRolePolicy` 未授权的 source-role / claim-role 映射拒绝确认。
- 正式确认仍必须同时满足 `acceptedForReport`、quote 唯一绑定、claim 完整性、高风险数字直接引用和人工 approved；角色授权只增加约束，不替代任何旧门禁。
- 旧数据完全没有角色元数据时维持原行为，避免破坏既有交付包；一旦链路进入 role-aware 模式就不能降级绕过。

## 接线位置

- source/raw：mock 与 public crawler 都继承正式来源角色，source database 保留该字段。
- structured claim：GLM 结构化抽取按声明类型设置 claim role，并将统一 validator 的结果写入 evidence validation。
- review/report：review item 保留 claim role；报告确认区重新核对 source、raw 和 evidence 的角色映射，伪造 accepted 标志不能绕过。
- 统一入口：`evidence-role-gate.ts` 提供授权判断、角色一致性检查、raw 绑定和 evidence 门禁应用。

## 验收证据

- 角色专项与结构化抽取测试覆盖：授权/未授权映射、缺失/冲突角色、crawler 传播、quote 校验、伪造 accepted、人工 approved 正负路径、旧数据兼容。
- 现有测试继续覆盖 acceptedForReport、quote 歧义、claim completeness、高风险直接引用和人工审核。
- G6 未联网、未调用 provider/key/credits，未写数据库或生产状态，未 commit、push 或部署。

## G7 恢复边界

G7 可以依赖本门禁逐个实现六个 module result，但不能并行修改共享 contract。每个模块没有可授权来源、唯一 quote 或完整 claim 时必须独立 fail-closed；contract-only fixture 不能写成真实护肤品结论。
