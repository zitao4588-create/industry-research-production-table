# 新会话可复制的 Codex `/goal`

> 状态：**已完成的第一阶段执行 Prompt，保留用于审计，不要重复执行。**
>
> Industry Planner 第一切片已在 2026-07-12 完成本地 C2。当前恢复入口是 `docs/CODEX_INDUSTRY_OS_HANDOFF.md`；下一步是 G2“校准护肤品 Planner 与覆盖目标”，不是重新实现本文件中的第一阶段。

下面的 Goal 只覆盖 Industry OS 的第一阶段：建立 Industry Planner 的本地可运行切片。它不会把 PRD、全量采集、最终报告、部署和商业验证混成一个超级任务。

## 可直接复制

```text
/goal 在 `/Users/qzt/Developer/industry-research-production-table` 中完成 Industry OS 第一阶段：实现一个本地可运行、可测试的 Industry Planner，使用户只输入“护肤品”这样的完整大行业和研究坐标后，系统能自动生成可执行的行业研究计划与覆盖矩阵。最终用权威 PRD、可序列化的 `industry-plan` 产物、护肤品离线 fixture、自动化测试和 `pnpm check` 证明完成。

这是一个项目、一个阶段、一个最终结果。不要在本 Goal 中继续扩展完整采集、生成最终护肤品行业报告、部署生产或恢复商业化测试。

一、开始前先阅读，不要立即改文件

必须先阅读：

- `AGENTS.md`
- `README.md`
- `PROJECT_CONTEXT.md`
- `TODO.md`
- `DECISIONS.md`
- `BUG_NOTES.md`
- `docs/CODEX_INDUSTRY_OS_HANDOFF.md`
- `docs/prds/ecommerce-competitor-research-prd.md`
- `docs/benchmarks/industry-research-evidence-benchmark-v1.md`
- `docs/benchmarks/industry-research-evidence-benchmark-v2.md`
- `scripts/run-industry-research-evidence-benchmark-v2.ts` 及其当前 Git diff
- `packages/industry-research` 中的输入类型、模板、工作流、source registry、source quality、evidence validator、数据库 builder 和报告组装代码

同时核对：

- 当前分支、HEAD 和 `git status --short`；
- 当前是否存在 benchmark、pnpm、Next、Vitest 或相关后台进程；
- 当前生产状态只能从已有文档或只读 live state 核对，不能把历史结论写成当前事实；
- 现有未提交 `scripts/run-industry-research-evidence-benchmark-v2.ts` 修改属于已有 worktree，必须保留，不覆盖、不重置。

读完后先用中文输出“执行前确认卡”，包括：

1. 当前产品目标、技术栈、已完成能力和当前限制；
2. 旧方向与新方向的冲突；
3. 本阶段唯一目标和完成等级；
4. 准备新增/修改的文件及原因；
5. Industry Planner 的建议数据契约；
6. 验证方式；
7. 明确不做；
8. 风险、停止条件和需要用户判断的问题。

输出确认卡后暂停，等用户确认再修改文件。

二、权威产品方向

- “护肤品”是合法且正确的行业级输入，不是默认负例；不得要求用户把它缩小成某个 SKU 或窄品类。
- 市场/地区、时间范围和研究目标是研究坐标，不是缩小行业。
- 系统负责内部拆解子市场、价格带、渠道、消费者需求、品牌集群、产业链、监管和研究模块。
- “电商竞品研究”保留为 Industry OS 的一个模块，不再作为整个产品的上位定义。
- 原始方法论来自《如何用 Codex 在 1 小时内进入一个陌生行业（完整版）》：先建行业数据库和知识地图，再分析同行如何赚钱、内容生态、供应链、监管、趋势和机会，并形成持续更新系统。
- 旧 Goal objective、旧 benchmark runner 中 `skincare-broad-negative` 和 post-kill scorecard 的“护肤品应缩小”是已经被用户推翻的旧假设。保留运行证据，但不得继续沿用该产品结论。

三、本阶段实现范围

实现 Industry Planner 第一可运行切片。具体文件位置可以在读完代码后做最小调整，但产物必须包括：

1. 一份新的权威 Industry OS PRD，建议为 `docs/prds/industry-research-os-prd.md`，至少定义：
   - 产品定位；
   - 行业级输入与研究坐标；
   - 行业研究链条；
   - 研究模块；
   - 来源角色策略；
   - 覆盖与完成标准；
   - 阶段化运行方式；
   - 电商竞品模块与上位 Industry OS 的关系；
   - 明确不做和安全边界。

2. 一个可序列化、可验证的 Industry Plan 数据契约，至少覆盖：
   - scope / definition；
   - taxonomy / subsegments；
   - value chain；
   - price tiers；
   - channels；
   - consumer needs；
   - business models；
   - regulation and risk questions；
   - research questions；
   - research modules；
   - source role policy；
   - coverage matrix；
   - representative sampling plan；
   - budget / risks / stop conditions；
   - evidence gaps / planner status。

3. 一个最小 planner 实现或可替换接口：
   - 输入大行业和研究坐标；
   - 输出 `industry-plan`；
   - 第一版可以使用确定性规则、fixture 或可注入规划器，不要求 live LLM；
   - 不把规划阶段生成的内容冒充外部事实或证据；
   - 缺失项要明确标记，不能用 mock 结论补满。

4. 一个“护肤品”离线 fixture 和最小 CLI/脚本入口：
   - 只输入大行业与研究坐标；
   - 生成可检查的 `industry-plan.json`；
   - fixture 必须体现产品功能、价格、渠道、需求、产业链、监管和来源角色等多个分类轴；
   - Baleaf、lululemon 等运动服饰品牌不得作为护肤品竞争者；跨行业案例如确有必要，只能明确标记为 business-model analogy。

5. 自动化测试：
   - 证明“护肤品”被接受为大行业输入；
   - 证明不会返回“请缩小品类”作为默认结果；
   - 证明电商竞品研究是模块而不是上位产品；
   - 证明每个研究模块都有研究问题、来源角色、覆盖要求和状态；
   - 证明品牌官网不能被授权支持全行业规模/需求结论；
   - 证明输出可以稳定序列化和复现；
   - 证明缺口 fail-closed，不生成伪造事实。

四、来源角色契约

不要只给来源一个全局可信度。Industry Plan 必须表达来源能支持的 claim roles，至少覆盖：

- 市场规模/增速：政府统计、协会、可信研究机构、财报；
- 监管/标准：监管机构、法规和标准组织；
- 品牌定位/产品：品牌官网、官方商城、可信零售渠道；
- 用户痛点/需求：评论、社区、用户调研、搜索信号；
- 内容/流量趋势：内容平台、创作者数据、搜索趋势；
- 商业模式/供应链：财报、公司资料、产业媒体和供应链企业。

来源角色必须能阻断这些错误外推：

- 单个品牌官网 -> 全行业市场规模；
- 品牌功能文案 -> 已验证消费者需求；
- 单条评论 -> 全市场需求规模；
- 内容标题/互动数字 -> 已验证转化率；
- 营销自述 -> 盈利能力。

五、权限和明确不做

本 Goal 最高权限为 L2：允许本地修改，但不 commit、不 push、不部署。

不要：

- 调用 live LLM、Tavily、Firecrawl、Amazon 或其他付费/免费额度；
- 运行新的 12 品类 benchmark；
- 新增 provider、数据库、n8n、Docker、登录、支付、微服务或复杂多租户；
- 应用 Supabase migration；
- 改生产 env、服务器或线上服务；
- 放宽 `acceptedForReport`、quote 唯一绑定、claim 完整性或人工审核门禁；
- 删除、覆盖或重写已有 benchmark 产物；
- 为了测试通过而硬编码一整份最终护肤品报告；
- 使用脚本批量删除文件或目录；
- 生成子代理或并行代理，除非用户另行明确授权。

六、验证与完成标准

必须全部满足：

1. 新 PRD 明确 Industry OS 是上位产品，电商竞品研究是模块。
2. `护肤品` 输入产生结构化 Industry Plan，不被拒绝为“过宽”。
3. Industry Plan 覆盖分类、产业链、价格、渠道、需求、商业模式、监管、研究模块、来源角色、覆盖矩阵和抽样计划。
4. 每个模块都有研究问题、允许来源角色、覆盖目标、当前状态和缺口。
5. 来源角色策略能通过自动化测试阻断错误 claim-role 映射。
6. fixture/CLI 只生成研究计划，不伪造市场规模、增长率、需求强度或机会确定性。
7. 现有 evidence/cleaner/review 诚实性规则没有被削弱。
8. 现有用户 worktree 修改保持不丢失。
9. `pnpm check` 通过；如果确实修改 UI，再额外运行 `pnpm build`，否则说明未运行 build 的原因。
10. `git diff --check` 通过，并人工检查 diff 中没有 secret、`.env.local`、API key 或无关文件。

完成等级只能写为 C2：Industry Planner 本地可运行。不能写成完整护肤品行业报告完成、生产已升级、商业化解冻或用户已可交付。

七、迭代和停止条件

按小检查点推进并记录：当前状态、证据、修改、验证、下一步和阻塞。

出现以下任一情况必须停止并汇报，不得自行扩范围：

- 新旧权威文档仍存在会改变实现的数据契约冲突；
- 必须调用 live provider 或修改生产环境才能继续；
- 需要新增数据库/migration、登录、支付或新基础设施；
- 需要覆盖、删除或重置当前未提交 worktree；
- 两轮实现或测试失败但没有新证据；
- 上下文膨胀到必须重读大量历史；
- 工作开始漂移到完整采集、最终报告或部署阶段；
- 需要用户决定分类体系、默认市场或输出边界且不同选择会显著改变实现。

停止时记录：停止原因、已尝试内容、真实输出、风险、需要用户判断的问题和下一步建议。

八、完成后的收尾

完成后更新：

- `PROJECT_CONTEXT.md`
- `TODO.md`
- `DECISIONS.md`
- `BUG_NOTES.md`（仅当本轮出现真实报错、失败尝试或新限制）

最终汇报必须包含：

- 修改文件；
- Industry Plan 数据契约；
- 护肤品 fixture 输出摘要；
- 测试和命令的真实结果；
- 未验证内容；
- 保留的旧 worktree diff；
- 剩余风险；
- 下一阶段建议，但不要自动开始下一阶段。
```

## Goal Lint

- 单一结果：Industry Planner 第一可运行切片。
- 有明确输入：项目文档、旧 PRD、benchmark、当前代码和 Git diff。
- 有权限边界：L2、本地、零 live API、零部署。
- 有可见验证：PRD、JSON 产物、fixture、自动化测试、`pnpm check`、diff 审计。
- 有反指标投机约束：不得缩小护肤品、伪造最终报告、放宽证据门禁或删除失败样例。
- 有停止条件和文档收尾。
- 没有要求子代理；没有把后续采集、最终报告和部署塞入当前 Goal。
