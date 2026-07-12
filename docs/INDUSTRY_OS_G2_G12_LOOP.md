# Industry OS G2–G12 顺序执行 Loop

更新时间：2026-07-12

## 1. Loop 目标

在同一个项目中顺序完成 G2–G12。任何时刻只允许一个子 Goal 处于 active/in_progress；前一 Goal 的全部验收证据通过并完成 closeout 后，控制器才可以激活下一 Goal。

这不是一个把 backlog 混成单次执行的超级 Goal。控制器只负责：读取 checkpoint、创建当前子 Goal、监督验收、记录结果、处理暂停/恢复并决定下一步。每个子 Goal 仍必须满足“一项目、一阶段、一个最终结果”。

## 2. 唯一状态源

- 机器可读 checkpoint：`docs/industry-os-loop-state.json`
- 产品方向：`docs/prds/industry-research-os-prd.md`
- 当前动态事实：`PROJECT_CONTEXT.md`
- 当前恢复入口：`docs/CODEX_INDUSTRY_OS_HANDOFF.md`
- 项目规则：`AGENTS.md`
- 自动唤醒提示：`docs/INDUSTRY_OS_LOOP_HEARTBEAT_PROMPT.md`

如果 checkpoint 与 Git/live state 冲突，以当前 Git、文件、测试和 live evidence 为准，先修正 checkpoint，再继续。

## 3. 固定执行算法

每次人工继续、自动 continuation 或 heartbeat 唤醒都按同一顺序：

1. 读取 `AGENTS.md`、本文件和 `docs/industry-os-loop-state.json`。
2. 核对分支、HEAD、`git status --short`、当前 Goal 和最近一次验证证据。
3. 如果状态为 `awaiting_user_confirmation`，不得执行后续工作；确认请求尚未通知时只通知一次，之后保持安静等待。
4. 如果状态为 `waiting_quota`，先判断当前 Codex turn 是否已经能正常执行；能执行即恢复原 Goal，不创建新 Goal、不重跑已完成检查点。
5. 如果当前 Goal 为 `ready`，创建且只创建该 Goal；目标必须使用本文件对应 Goal Card。
6. 按小检查点执行，每个检查点更新：修改、证据、失败、下一步和阻塞。
7. 当前 Goal 的所有验收项通过后，完成 closeout，并把 checkpoint 中该 Goal 标为 `complete`。
8. 若下一 Goal 不需要人工门，自动把下一 Goal 标为 `ready` 并继续。
9. 若下一步触发人工门，把 Loop 标为 `awaiting_user_confirmation`，写明精确动作、风险、费用/外部影响和所需权限，停止执行。
10. G12 完成后把 Loop 标为 `complete`；自动化应停用或只返回 `DONT_NOTIFY`，不得继续创造新 backlog。

## 4. 自动权限边界

默认自动权限上限为 L2：

- L1：允许只读文件、Git、日志、公开网页和 live state 核查。
- L2：允许在当前项目本地修改文件、运行测试、构建和离线 fixture。
- 不自动 stage、commit、push、部署、发布、应用 migration 或外部沟通。

以下动作必须暂停并取得用户确认：

1. L3：stage 或 commit。
2. L4：push、生产部署、服务重启、生产 env 变更、生产 canary、Supabase migration/backfill、zvec 生产写入。
3. L5：联系或邀请真实用户、发送邮件/消息、公开发布、对外提交报告。
4. 任何会消耗付费额度、免费 credits、provider 配额或需要 API key 的 live 调用；必须给出预计请求数、费用上限和停止规则。
5. 新增数据库、migration、登录、支付、Docker、微服务或复杂多租户。
6. 删除、覆盖、重置现有 worktree 或历史 benchmark 产物。
7. 会显著改变分类体系、默认市场、报告边界或产品交互的产品决策。

无需额外确认的联网边界：无登录、无 cookie、无 key、无额度的公开网页只读核查；仍需遵守 robots、付费墙、验证码和隐私边界。

## 5. 失败与重试

- 先分类：Codex 额度、provider 额度、网络、权限、路径、代码、测试、产品决策或外部服务。
- 偶发网络错误最多重试一次；其他错误必须先获得新证据再重试。
- 同一失败连续两轮没有新证据时，停止当前 Goal，写入 `awaiting_user_confirmation` 或 `failed_needs_review`，不得原样循环。
- 不得通过删除测试、缩小范围、隐藏错误、放宽 evidence/claim 门禁或伪造 fixture 来通过验收。
- 每次失败记录真实命令、输出摘要、已尝试方案和保留的 worktree 状态。

## 6. Codex 额度等待与恢复

- Codex 自身额度耗尽、usage limit 或服务暂不可用时，不把 Goal 标为失败或 blocked。
- 如果当前 turn 能捕获该错误，把 Loop 状态改为 `waiting_quota`，保留 `currentGoal`、最近 checkpoint 和未完成验收项。
- 如果额度耗尽导致 turn 根本无法执行，checkpoint 可能仍为 `in_progress`；后续 heartbeat 能运行时应把它视为断点恢复，不从头重跑。
- 恢复后先核对 Git 和最近证据，只继续未完成检查点。
- Codex 额度与外部 provider 额度必须分开：provider 429、余额不足或 credits 不足属于人工确认门，不能自动等待后继续付费调用。

## 7. 通知、复盘与停止

只在以下情况通知用户：

- 需要新的权限或产品判断；
- Goal 完成并已自动进入下一 Goal；
- 连续失败触发停止；
- 发现 secret、数据安全、生产或费用风险；
- G12 完成。

等待用户确认、等待额度或没有实质变化时不重复通知。

每完成一个 Goal，必须在 `PROJECT_CONTEXT.md`、`TODO.md`、`DECISIONS.md` 和必要时 `BUG_NOTES.md` 留下紧凑 checkpoint。每完成三个 Goal 做一次 Loop 复盘：范围是否漂移、上下文是否过大、测试是否仍覆盖真实目标、是否应开启新任务继续。

## 8. G2–G12 Goal Cards

### G2：校准护肤品 Planner 与覆盖目标

- 最终结果：24 个规划轴、18 类来源角色和 11 行覆盖目标经过权威公开来源/规则与人工可审计逻辑校准，保留待确认项，不生成完整报告。
- 自动权限：L1/L2；允许无 key 公开网页核查。
- 主要产物：校准记录、修订后的 fixture/plan、来源角色/覆盖目标测试。
- 验收：分类无明显重叠或漏项；监管边界有正式来源；目标数量有理由；`pnpm check` 通过；没有 live provider/credits 调用。
- 必停：需要用户决定默认市场、分类体系或付费数据源。

### G3：实现分阶段本地运行契约

- 最终结果：建立 planning → breadth_scan → sampling → module_research → synthesis → reporting 的本地状态机、artifact contract、checkpoint 和恢复测试。
- 自动权限：L2。
- 主要产物：类型、纯函数/本地 runner、manifest、fixture、恢复/幂等测试。
- 验收：中断后可从 checkpoint 继续；不会重跑已完成阶段；不新增数据库；`pnpm check` 通过。
- 必停：需要 migration、生产状态或新的基础设施。

### G4：实现来源角色驱动的行业广度扫描

- 最终结果：按覆盖矩阵生成并验证 source candidate plan；候选来源带 source role、claim roles、模块、轴、优先级、合规和预算信息。
- 自动权限：L1/L2；只允许无 key/无 credits 的公开网页核查。
- 主要产物：source candidate contract、离线 fixture、无额度公开发现适配、去重/配额/阻断测试。
- 验收：品牌官网不能占满全行业来源池；候选不冒充证据；缺口保持 blocked；`pnpm check` 通过。
- 必停：Tavily、Firecrawl、Amazon、付费/免费 credits、登录态或 API key。

### G5：实现代表性抽样

- 最终结果：从已验证候选中按子市场、价格带、渠道、商业模式和人群生成可解释样本，并记录选择/排除理由与未覆盖轴。
- 自动权限：L2。
- 主要产物：sampling engine、sample records、coverage update、fixture 和测试。
- 验收：不由搜索排序决定样本；business-model analogy 不计为竞争者；覆盖不足时不启动综合判断；`pnpm check` 通过。
- 必停：需要用户决定代表性标准或行业边界。

### G6：把 source-role / claim-role 门禁接入证据链

- 最终结果：正式来源、raw document、结构化声明和报告门禁都执行来源角色授权，不能只依赖 Planner helper。
- 自动权限：L2。
- 主要产物：sourceRole/claimRole 数据契约、validator 接线、错误映射测试、旧链路回归。
- 验收：确认结论同时满足 acceptedForReport、角色授权、quote 唯一绑定、claim 完整性、高风险直接引用和人工审核；`pnpm check` 通过。
- 必停：需要放宽现有证据诚实性门禁或破坏旧交付兼容。

### G7：逐个完成六个研究模块

- 最终结果：市场、监管、消费者需求、电商竞品、内容流量、商业模式/供应链六个模块都能独立产出可追溯 module result、coverage 和 gaps。
- 自动权限：L1/L2；每个模块作为 G7.1–G7.6 顺序检查点，不能并行修改共享契约。
- 主要产物：六类 module result contract/runner/fixture/测试。
- 验收：模块独立失败不污染其他模块；没有来源时 fail-closed；所有结论能回到 claim/source/quote；`pnpm check` 通过。
- 必停：任何 key/credits/provider 调用、付费数据、法规口径冲突或需要用户选择模块优先级。

### G8：实现跨模块综合与行业报告

- 最终结果：建立 claim ledger，区分 fact/signal/inference/hypothesis，并按 12 章结构生成带覆盖状态、反例和证据缺口的本地报告/知识地图。
- 自动权限：L2。
- 主要产物：claim ledger、synthesis、报告、知识图谱 contract、manifest 兼容和测试。
- 验收：blocked 章节不伪造成稿；机会只作为待验证假设；旧 8 文件包兼容；`pnpm check` 通过。
- 必停：需要改变对外交付边界或删除旧格式兼容。

### G9：实现单一 Industry OS UI 流程

- 最终结果：同一产品流支持输入行业/坐标、查看计划、覆盖矩阵、样本、分阶段进度、模块结果和报告，不新增第二套模式。
- 自动权限：L2。
- 主要产物：现有 UI 内的最小接线、移动/桌面状态、错误/恢复体验。
- 验收：`pnpm check`、`pnpm build`、360/390/430/1440px 回归和本地完整流程通过。
- 必停：显著视觉方向、信息架构或公开字段边界需要用户判断。

### G10：受控生产 canary

- 最终结果：Industry OS 新链路在轻量服务器生产完成一次受控 canary、回滚和闭环证据链，达到 C3。
- 自动权限：只读侦察可 L1；任何生产写操作必须 L4 用户确认。
- 主要产物：部署计划、备份、build/doctor/health、canary artifacts、provider/cost、Supabase/zvec 明确状态和回滚记录。
- 验收：服务、API、分享/下载/回放、artifact、claim ledger 和安全边界通过；不能写成 C4/C5。
- 必停：push、部署、env、服务重启、生产调用、backfill/index 或费用。

### G11：真实用户 C4 验证

- 最终结果：1–3 名真实目标用户能在无现场指导下完成核心流程，记录阻塞与修复，达到或明确未达到 C4。
- 自动权限：仅准备测试材料可 L2；任何招募、联系、邀请、消息或外部沟通必须 L5 用户确认。
- 主要产物：测试脚本、观察记录、问题优先级、修复和复验。
- 验收：用户独立完成输入、计划确认、等待、报告阅读和分享；否则保持 C3。
- 必停：选择用户、联系用户、隐私/录屏、公开测试或产品方向判断。

### G12：统一 benchmark 与 C5 去留判断

- 最终结果：按预注册 3–5 品类/行业 benchmark 和真实使用证据，形成继续、调整或停止的明确结论；只有证据成立才标记 C5。
- 自动权限：离线预注册、runner/scorecard 准备可 L2；任何 live API、credits、provider、公开发布或外部数据需确认。
- 主要产物：预注册协议、费用/请求上限、kill rule、统一 scorecard、失败分类、C5 决策记录。
- 验收：不混合 pre-kill/post-kill；不使用 `skincare-broad-negative`；单 canary 不替代统一 benchmark；用户已取消的真实卖家外联/付费试单不得擅自恢复。
- 必停：预算确认、live 调用、商业解冻、最终继续/停止决策。

## 9. 完成定义

Loop 只有在 G2–G12 均为 `complete`，或 G12 以证据明确得出“停止项目”并完成 closeout 时才算完成。任何 `skipped` 必须由用户明确批准并记录原因；不能为了让 Loop 结束而静默缩小范围。
