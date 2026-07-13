# Industry OS Data-to-Report M1–M6 顺序 Loop

更新时间：2026-07-13

## 1. Loop 目标

在同一个项目中，把现有 Industry Planner、公开采集、证据门禁、模块研究、报告和生产 UI 串成一条数据驱动的研究闭环。

这不是一个超级 Goal。控制器只负责顺序激活小 Goal、监督验证、记录 checkpoint、处理暂停/恢复和权限门。任何时刻只允许一个小 Goal 为 `ready`、`in_progress`、`verifying`、`retryable_failure` 或 `awaiting_permission`。

旧的 `docs/industry-os-loop-state.json` 已记录完成的 G2–G12 历史，不覆盖、不复用为新 Loop 状态。

## 2. 唯一状态源

- 控制规则：`docs/INDUSTRY_OS_DATA_REPORT_M1_M6_LOOP.md`
- 机器 checkpoint：`docs/industry-os-data-report-loop-state.json`
- 恢复提示：`docs/INDUSTRY_OS_DATA_REPORT_HEARTBEAT_PROMPT.md`
- 产品方向：`docs/prds/industry-research-os-prd.md`
- 当前事实：`PROJECT_CONTEXT.md`
- 项目规则：`AGENTS.md`

checkpoint 与 Git、文件、测试或 live evidence 冲突时，以实时证据为准；先修正 checkpoint，再继续。

## 3. 固定执行算法

1. 读取项目规则、本文和机器 checkpoint。
2. 核对唯一仓库、分支、HEAD、dirty state、当前小 Goal 和最近证据。
3. 只有 `ready` 可以进入 `in_progress`。
4. 一个小 Goal 只完成一个具体结果；实现后进入 `verifying`。
5. 涉及代码时先跑针对性测试，再跑 `pnpm check`；数据 Goal 还要验证 schema、来源、覆盖、成本和产物。
6. 只有全部验收通过才标记 `complete`，并自动把下一个小 Goal设为 `ready`。
7. 验证失败只重试当前小 Goal；同一失败两次没有新证据后暂停。
8. 触发权限门时改为 `awaiting_permission`，记录精确动作、风险、预算和权限，不执行后续 Goal。用户已对本 Loop 的 `live_budget` 给出 standing authorization：后续预算 Goal 不再重复询问，但每个 Goal 或 wave 仍必须先声明并在代码中执行有限硬上限、保留审计；该授权不包含 commit、push、部署、生产/数据库写入或外联。
9. M6.4 通过后 Loop 才为 `complete`；C5 商业结果不属于本 Loop。

## 4. 自动权限边界

默认权限上限 L2：允许本地文件修改、离线 fixture、测试和构建；不自动 stage、commit、push、部署、应用 migration、写生产、使用 key/credits、联系用户或公开发布。

必须暂停确认：

- `live_budget`：搜索 API、Firecrawl、LLM/provider、付费或免费 credits、任何需要 API key 的 live 调用；
- `L3`：stage 或 commit；
- `L4`：push、生产部署、服务重启、生产 env、migration/backfill、生产 Supabase/zvec 写入；
- `L5`：招募、联系或邀请真实用户、发送外部消息、公开发布；
- 新数据库、登录、支付、Docker、微服务、复杂多租户；
- 删除、覆盖、重置历史 benchmark、worktree 或原始研究产物。

## 5. M1–M6 Goal Cards

### M1：Planner 生成可执行采集任务

- `M1.1`：定义 `industry_acquisition_task.v1` 契约和 fail-closed validator。
- `M1.2`：实现 Planner coverage row → acquisition task 编译器、优先级、预算和停止条件。
- `M1.3`：生成洗碗机纯离线采集计划 fixture；所有缺口保持 gap，不生成事实。
- `M1.4`：完成 M1 稳定性、schema、secret、diff 和 `pnpm check` 总验收。

最终结果：Planner 能稳定输出可执行、可预算、可暂停的采集任务。

状态（2026-07-13）：M1.1–M1.4 已在本地 L2 完成。洗碗机 fixture 生成 11 个离线任务，live 请求、provider、费用和外部事实均为 0；连续两次输出 SHA-256 一致，`pnpm check` 通过 28 个测试文件、255 条测试。下一项为 M2.1。

### M2：洗碗机多轮数据采集

- `M2.1`：统一公开网页、搜索发现、sitemap/RSS、复杂页面和授权导入的 adapter/router 契约。
- `M2.2`：实现不可变 raw document、采集审计、哈希、去重和幂等存储。
- `M2.3`：在 `live_budget` 权限门后执行第一轮受控洗碗机广度扫描，记录请求、credits、费用和失败。
- `M2.4`：按 coverage gaps 生成后续定向 wave，直到关键行通过或诚实停止；每个 wave 使用 standing `live_budget` 下单独声明和执行的硬上限，不继承前一 wave 额度。

最终结果：得到覆盖合格、可追溯的洗碗机数据集；覆盖不足时不得进入 M3。

状态（2026-07-13）：M2.3 广度扫描后，M2.4 完成 3 个各自有硬上限的定向 wave。合并数据集含 18 份不可变原文，离线复核得到 11 份强相关 raw candidates；2 份串品类、5 份来源质量拒绝、2 份 PDF 二进制载荷被明确排除。4/4 个关键 coverage rows 达标，4/11 总行达标，7 个非关键缺口继续保留。M2 完成，M3.1 ready；raw candidate 仍不是 evidence。

### M3：可信洗碗机报告

- `M3.1`：把复合描述拆为原子事实，逐条绑定 source/raw/quote/claim role。
- `M3.2`：把机会统一为有目标用户、问题、事实基础、未知项和验证计划的 hypothesis。
- `M3.3`：生成覆盖摘要、确认事实、冲突、缺口、机会假设和证据附录的分级报告。
- `M3.4`：人工抽查关键 claim，完成报告门禁、移动可读性和离线回归总验收。

最终结果：洗碗机报告达到本地 C2；证据不足只能输出研究缺口，不能输出停止商业化。

状态（2026-07-13）：M3.1–M3.4 已完成，本地 C2。7 条原子事实与 3 条未验证假设进入分级 JSON/Markdown 报告；4/11 coverage、7 个缺口、7 个拒绝来源和证据附录全部可见。全部 7 条事实证据链通过，market/regulation/product 三类代表性抽查、移动可读性、确定性回放和 36 files / 306 tests 全回归通过。报告只给出 `requires_real_world_validation / no_project_go_or_stop_decision`；没有独立人工复核或真实用户验证。M4.1 ready。

### M4：护肤品大行业验证

- `M4.1`：生成护肤品六模块采集任务，保持大行业输入，不要求缩小为 SKU。
- `M4.2`：在 `live_budget` 权限门后完成广度扫描与代表性抽样。
- `M4.3`：顺序运行市场、监管、消费者、电商竞品、内容流量、商业模式/供应链模块。
- `M4.4`：综合报告并回放洗碗机，验证大行业能力与窄品类兼容。

最终结果：Planner 指定的必需模块通过；blocked 模块保留真实缺口，不串行业。

状态（2026-07-13）：M4.1–M4.4 已在本地 L2/C2 完成。护肤品大行业输入保持 `broad_industry`，未缩成品牌或 SKU。前三波通用采集曾因 coverage 仅 2/11 而诚实暂停；用户随后指定“只搜索公开市场、不做人工补充”，系统改用公开研究机构、监管、上市公司财报、品牌/零售、内容平台和供应链来源完成三波有界恢复。六波总计 130 public、24 Tavily、23 Firecrawl、保守 115 credits、0 LLM、¥1.536，形成 82 份不可变原文、49 份相关 raw candidates 和 9 个代表样本；最终 11/11 coverage、critical 4/4。

M4.3 六模块全部完成，得到 33 条逐字可追溯 claim、0 blocked module。M4.4 综合报告包含 33 条直接事实/信号、1 条跨模块推断、2 条明确未验证的机会假设和 33 组公开来源附录；决策为 `validation_ready / requires_real_world_validation`，没有商业化停止结论。洗碗机 JSON/Markdown 与原 C2 报告逐字节一致，宽行业与窄品类无串线；`pnpm check` 通过 37 个测试文件、313 条测试。M5.1 ready。

### M5：生产接入

- `M5.1`：实现异步、可暂停、可恢复且不重复扣费的生产 runner。
- `M5.2`：复用现有 Supabase、SSE 和单一 UI，展示阶段、覆盖、缺口与费用。
- `M5.3`：完成旧 8 文件包、分享、下载、回放、公开字段和安全兼容验证。
- `M5.4`：在 L3/L4 权限门后 commit、push、部署并完成生产 canary、回滚和 closeout。

最终结果：生产 C3；没有真实用户证据时不能标 C4。

状态（2026-07-14）：M5.1–M5.3 已在本地 L2/C2 完成。现有六阶段 runner 增加原子 operation receipt 与稳定 idempotency key：一次模拟外部操作完成后故意让阶段失败，恢复时外部执行数仍为 0；状态不确定时 fail-closed，不自动重发。单一 Industry OS 结果页现在聚合展示阶段、coverage、缺口、请求数和费用，继续复用现有 Supabase/本地 8 文件存储与同源 SSE，没有 migration 或第二套 UI。`pnpm check` 通过 37 个测试文件、315 条测试，生产构建通过。

M5.3 兼容验收保持旧 `industry_research_delivery_manifest.v1` 和 8/8 文件；本地页面/health/公开分享为 200，公开报告仅返回白名单字段，恶意 Origin 为 403，详情/下载无凭据为 401、有本地测试凭据为 200；replay 只验证鉴权，没有实际重跑。M5.4 已完成提交 `598f628`、push main、生产备份、非删除部署和零 provider contract canary，达到 C3。首次远端构建因历史残留源码失败，44 个残留文件已可逆归档而非删除，随后 build/doctor/service/health/UI/API/security 全部通过；未执行 migration、backfill、付费/live crawl canary 或数据扩写。

### M6：真实用户 C4

- `M6.1`：本地准备测试对象、任务、成功/失败指标和隐私边界。
- `M6.2`：进入 L5 权限门；未授权不得招募、联系或邀请用户。
- `M6.3`：让 3–5 名目标用户独立完成输入、等待、阅读、理解、分享/下载，并记录问题。
- `M6.4`：修复 P0/P1 后复验；至少 3 名用户无现场指导完成核心流程才标 C4。

状态（2026-07-14）：M6.1 本地方案已完成，见 `docs/INDUSTRY_OS_M6_USER_VALIDATION_PLAN.md`。Loop 当前暂停在 M6.2 L5 权限门；尚未联系、邀请或招募用户。

最终结果：Loop 完成于 C4。付费、收益和商业去留属于后续 C5 Loop。

## 6. 验证与通知

代码 Goal：针对性测试 → `pnpm check` → `git diff --check` → secret audit。

数据 Goal：schema → 来源角色 → 去重/trace → coverage → 请求/费用 → 隐私合规。

报告 Goal：确认区 100% 可追溯 → 不越权外推 → hypothesis/事实分层 → 人工抽查。

生产 Goal：build/doctor/service/health → API/UI → 数据写入 → 安全 → 回滚。

只在小 Goal/Milestone 完成、需要权限、连续失败、安全/费用风险或整个 Loop 完成时通知。等待状态不重复通知。
