# Industry OS G8 跨模块综合与报告契约

更新时间：2026-07-12

## 结果

G8 新增：

- `industry_claim_ledger.v1`：区分 fact、signal、inference、hypothesis；
- `industry_knowledge_map.v1`：保存 module、coverage、source、raw、evidence、claim、gap 和 counterexample 节点/边；
- `industry_report_bundle.v1`：保存 12 章报告、claim ledger、知识地图与旧交付兼容声明。

## 综合门禁

- 只有 G7 module complete、claim confirmed、相关 coverage rows 全部 pass 且 source/raw/evidence/quote trace 完整的直接声明，才有资格进入 fact/signal 基础。
- blocked module/claim 继续保留为 blocked，不能支持 inference 或 hypothesis。
- inference 至少绑定两个真实 supporting claims 和两个实际来源模块；声明的 module IDs 必须与 supporting claims 完全一致。
- hypothesis 必须有 validation plan；所有 opportunity 必须是 hypothesis，不能标成 fact、signal 或 inference。
- `contract_fixture` 模式下所有 entries 状态强制为 `contract_only`、`externalFactEligible=false`；报告逐条标记 `CONTRACT_ONLY / 非行业事实`。

## 12 章结构

1. 研究范围、定义和证据边界；
2. 子市场与分类体系；
3. 产业链和商业模式；
4. 市场规模、增速和渠道结构；
5. 竞争格局与品牌集群；
6. 产品、功效和价格带；
7. 消费者人群、需求和痛点；
8. 搜索关键词、内容与流量生态；
9. 监管、技术、成分和趋势；
10. 可执行机会假设；
11. 反例、证据缺口和待验证问题；
12. 知识地图与持续监控计划。

每章固定输出 status 和 coverage。任一所需模块 blocked 时，该章显示 `BLOCKED：证据或覆盖不足，本章不生成完整结论性正文`，但保留 claim/gap 索引用于后续补证。

## 知识地图

知识地图至少保留 `source -> raw document -> evidence -> claim` 支持链、module/coverage 归属、跨 claim derived-from、gap 和 counterexample。eligible claim 必须存在完整 trace；blocked 内容不会被删除。

## 本地 fixture

- 命令：`pnpm synthesize:industry:fixture`
- 目录：`outputs/industry-synthesis/skincare/`
- `claim-ledger.json`：`4467d9119a1bad6511c7cccfd8ab2a52c8db22805e50bf7b3c3217c5255fa8a4`
- `industry-report.md`：`884899949d204c491256b1e9add361ab44e96a775dcb8ed0dae57e29909ec65e`
- `knowledge-map.json`：`b4db86265ef21750ce054367c8a2036b9526698dd15f42cad2cd2c6e8d649013`
- `report-bundle.json`：`873a2d03db2d8f41deb5fe477b9cb68ee4682147de333909f0351a2059974a2d`

四个产物连续两次哈希一致。fixture 包含 9 fact-form、2 signal、1 inference 和 1 opportunity hypothesis，但全部 13 条均为 contract-only，eligible 外部事实为 0。知识地图为 75 nodes / 93 edges，live provider calls 为 0。

## 兼容与验收

- G3 synthesis/reporting artifact types 仍分别为 `claim_ledger` / `industry_report`。
- `industry_research_delivery_manifest.v1` 和现有 8 文件清单保持原样；G8 不把新产物塞入旧生产交付包，不改变对外字段边界。
- `pnpm check`：24 个测试文件、248 条测试，workspace typecheck 与 Biome 全绿。
- `git diff --check` 与敏感信息模式扫描通过；旧 benchmark runner 保持 62 additions / 22 deletions。
- 未联网、未调用 provider/key/credits、未写数据库或生产状态，未 commit、push 或部署。
