# TODO

更新时间：2026-07-14

## 已完成

- [x] 2026-07-14 公开失败报告 fail-closed 修复、推送与生产部署：
  - 公开报告 API 升级为 v3，只展示 reviewed report 中的已确认竞品与机会；技术失败或证据不足时全部公开结果计数归零。
  - 公开页面新增通俗失败解释，明确不把研究失败写成行业没有机会或停止商业化；技术报告降到折叠记录。
  - 来源相关性移除宽泛 market/DTC 独立命中，冰箱与跨境物流软件反向测试通过。
  - `pnpm check` 为 37 files / 317 tests，生产构建通过；提交 `b846f6c` 已推送 `origin/main` 并部署，备份 `pre-b846f6c-20260713T172230Z.tar.gz`。
  - 线上旧冰箱 run 已验证为 `technical_blocked`、0 confirmed、0 competitors、0 opportunities；health、远端 build、server/Supabase doctor 和 service active 通过。
  - 未完成项：公开输入仍未正式接入通用 M1–M6 runner；M6.2 外联继续暂停。

- [x] 2026-07-13 Industry OS Data-to-Report M1：Planner 生成可执行采集任务：
  - 建立独立 M1–M6 顺序 Loop、heartbeat 和机器 checkpoint，不覆盖旧 G2–G12 历史。
  - 新增采集任务/任务计划契约、fail-closed 校验器和 coverage row 编译器；11/11 行均生成带角色、覆盖、预算、合规与停止条件的任务。
  - 新增洗碗机离线输入与 `pnpm plan:industry:acquisition`；产物 11 tasks、0 live request、0 provider、0 cost、0 external facts。
  - 两次输出 SHA-256 一致；`pnpm check` 28 files / 255 tests，`git diff --check` 通过。
  - 完成等级为 L2/C2 契约切片；没有真实采集、真实报告、commit、push 或部署。

- [x] 2026-07-13 用户明确批准先跳过 G11：
  - 不进行 1–3 名真实用户招募/联系/录屏，C4 保持未验证，不用 Playwright 或 contract canary 替代真实用户证据。
  - Loop 转到 G12 启动确认门；此前取消真实卖家反馈和付费试单的决定继续有效。

- [x] 2026-07-13 启动三端一致性同步：
  - 将此前本地保留的 benchmark runner 62/22 历史 diff 纳入提交，但不运行该 runner。
  - 本地 main、GitHub main 和生产服务器全部可部署受版本控制文件使用同一 HEAD；env、运行数据、依赖、缓存、备份按部署排除规则保留。

- [x] 2026-07-13 G10 完成 Industry OS 受控生产 contract canary：
  - 提交/推送 `094c857`，HEAD 模式非删除式部署到轻量服务器；备份 `pre-094c857-20260712T171317Z.tar.gz`。
  - 远端 build、server doctor、Supabase doctor、service active、health 通过；未改 production env、migration、n8n 或 zvec。
  - 生产流程通过：6 阶段、11 coverage、9 contract samples、6 modules、13 ledger entries、0 eligible、13 contract-only、12 章、75/93 知识地图。
  - 搜索/Firecrawl/provider/credits 均为 0，费用 ¥0；Supabase/zvec 无 canary 写入，contract fixture 未冒充真实行业事实。
  - 四视口、报告下载、旧分享回放、内部 API 401、公开报告白名单和既有 run 下载通过；当前严格为 C3。

- [x] 2026-07-12 G9 实现单一 Industry OS UI 流程：
  - 在唯一 `/industry-research` 流程增加行业研究坐标、六阶段、计划、覆盖、样本、六模块、知识地图与 12 章报告；未新增第二模式或产品路由。
  - 本地 fixture 只消费 G2–G8 contract，不访问网络/provider/credits/数据库，并明确标记非行业事实；旧普通执行和 `?run=` 回放保持兼容。
  - 专项测试 2/2；`pnpm check` 25 files / 250 tests；`pnpm build` 通过。
  - Playwright 完整流程、旧 run 回放和 360/390/430/1440px 回归通过，四视口无横向溢出，控制台 0 error / 0 warning。
  - 详细证据见 `docs/INDUSTRY_OS_UI_G9.md`；当前为 C2/L2，未 commit/push/deploy 或写生产。

- [x] 2026-07-12 G8 实现跨模块综合、12 章报告与知识地图：
  - 新增 claim ledger、report bundle、knowledge map contract/runner、contract fixture、CLI 和 9 条专项测试。
  - fact/signal 只接受 confirmed+coverage pass+trace 完整内容；inference 校验跨模块支持绑定；opportunity 强制 hypothesis+validation plan。
  - blocked 章节保留且不生成完整结论；contract fixture 13/13 entries 均 non-eligible/non-external。
  - 12 章报告含逐章 coverage、反例、gaps 和知识地图；旧 8 文件包与 G3 artifact contract 未改。
  - `pnpm check` 24 files / 248 tests，四个 fixture 产物哈希稳定，diff/secret 审计通过；未联网、未 commit/push/deploy。

- [x] 2026-07-12 G7 顺序完成六个研究模块：
  - 新增单模块与六模块 bundle contract/runner、contract-only fixture、CLI 和 22 条模块专项测试。
  - 六模块各自输出 traceable claims、coverage、gaps；缺源、角色/claim 错配、样本关系/轴错配和覆盖不足独立 fail-closed。
  - 内容转化外推、无财报盈利判断和品牌全行业外推被显式阻断；单模块失败不污染其余五个结果。
  - fixture 6/6 complete、11 claims、11/11 coverage，稳定 SHA-256 `f9c36410b8187f6cc9785d605040c6b067437a96cc62e73fadd1f5f439072f26`，但明确不是外部事实且禁止 synthesis。
  - `pnpm check` 23 files / 239 tests，diff/secret 审计通过；未联网、未调用 provider/credits、未 commit/push/deploy。

- [x] 2026-07-12 G6 把 source-role / claim-role 门禁接入证据链：
  - 正式 source/raw/evidence/review 契约带角色信息，crawler、结构化抽取、source database 和报告确认区完成接线。
  - 缺失、冲突和未授权角色映射 fail-closed；伪造 accepted 不能绕过，legacy 无角色数据保持兼容。
  - 角色授权与 acceptedForReport、quote 唯一绑定、claim 完整性、高风险直接引用和人工审核同时生效。
  - 专项测试覆盖 source→raw→structured claim→report 全链路；未联网、未调用 provider/credits、未写生产。

- [x] 2026-07-12 G5 实现代表性抽样：
  - 新增 sampling engine、sample/exclusion records、multi-axis coverage gate、G3 sampling artifact 接线和两类离线产物。
  - 选择不依赖搜索 rank/输入顺序；类比不计竞争者；未验证、角色错配、未知轴和覆盖不足全部 fail-closed。
  - 真实 G4 官方池保持 0 样本/blocked；contract-only fixture 选 6 个样本并通过多轴门，但仍禁止 synthesis。
  - `pnpm check` 21 files / 206 tests，diff/secret 审计通过；live provider=0，未 commit/push/deploy。

- [x] 2026-07-12 G4 实现来源角色驱动的行业广度扫描：
  - 新增 source candidate contract、7 个官方 seed fixture、no-key public discovery 纯函数适配和 G3 breadth_scan 接线。
  - 候选携带 role/claim/module/axis/priority/discovery/compliance/budget/block；候选不是 evidence，缺口继续 blocked。
  - 去重、受限访问、角色/hostname/请求/品牌占比配额和 fail-closed 测试通过；品牌官网不能占满来源池。
  - fixture 7 eligible、1 行 candidate target met、10 行 blocked，实际公网/provider/credits=0；`pnpm check` 20 files / 196 tests，diff/secret 审计通过。

- [x] 2026-07-12 G3 实现分阶段本地运行契约：
  - 新增六阶段状态机、artifact contract、`industry_execution_checkpoint.v1`、execution manifest 和本地 runner；不改旧 8 文件交付 manifest。
  - completed 阶段不可变且恢复时跳过；中断只重试当前阶段，失败不污染后续；损坏 checkpoint fail-closed。
  - 实际 pause/resume proof 从 sampling 后继续，六阶段 attempt 均为 1；完整 fixture 幂等复跑保持 revision 12。
  - `pnpm check` 通过：19 files / 185 tests；diff/secret 审计通过，未新增数据库、生产状态或 provider 调用，未 commit/push/deploy。

- [x] 2026-07-12 G2 校准护肤品 Planner 与覆盖目标：
  - 用 7 个公开官方页面校准中国大陆护肤品规划；监管分类、商业子市场和统计口径明确分层。
  - 24 个规划项校准为 8 个 authority aligned、3 个 method guardrail、13 个 requires live validation；价格带不再预设品牌语义。
  - 18 类来源角色补齐定义/最低证据/禁止外推，11 行覆盖目标补齐 target basis 和理由；覆盖仍 fail-closed 为 0/0/0。
  - `pnpm check` 通过：18 files / 172 tests；diff/secret 审计通过，provider/public 请求均为 0，未 commit/push/deploy。

- [x] 2026-07-12 建立 Industry OS G2–G12 顺序执行 Loop：
  - 新增总控制器、heartbeat prompt 和机器可读 checkpoint；每个 Goal 有独立结果、验收、权限门和停止条件。
  - 启用每小时当前任务 heartbeat `industry-os-g2-g12-loop`，用于额度恢复后从 checkpoint 继续。
  - 自动权限固定为 L1/L2；commit/push/部署/生产/付费或 credits/API key/外部用户沟通必须暂停确认。
  - G2–G9 已顺序完成；Loop 当前在 G10 的 L4 生产权限门暂停，G10–G12 继续保留各自人工确认门。

- [x] 2026-07-12 G1 固化 Industry OS C2 基线与权威文档：
  - README 明确 Industry OS 上位产品、电商竞品研究下游模块和本地 C2 / 生产 H5 C3 的状态边界。
  - 固定文档权威顺序：Industry OS PRD → `PROJECT_CONTEXT.md` 动态事实 → 电商竞品模块 PRD → benchmark 运行证据 → handoff 恢复入口。
  - 旧电商竞品 PRD 增加模块/历史状态声明；第一阶段 Goal Prompt 标记为已完成，handoff 更新为 G2 校准恢复入口。
  - `skincare-broad-negative` 定性为保留的历史实验标签，不再是产品判定规则；旧 runner 62/22 worktree diff 和 benchmark 产物未修改。
  - 权限保持 L2：未 commit、push、部署或联网。

- [x] 2026-07-12 Industry OS 第一阶段 / Industry Planner 本地 C2：
  - 新增权威 Industry Research OS PRD；“护肤品”被接受为完整行业输入，电商竞品研究明确为下游研究模块。
  - 新增 `industry_plan.v1`、确定性 planner、18 类来源角色授权、6 个研究模块、11 行跨轴覆盖矩阵、可填充代表性抽样、预算/风险/停止条件和 fail-closed evidence gaps。
  - 覆盖矩阵结构化记录目标/当前独立来源、来源角色和代表样本，覆盖 taxonomy、value chain、price tier、channel、consumer need、business model 与 regulation；抽样样本可记录轴归属、行业关系和验证状态，当前仍保持 0 样本、24 个未覆盖轴项。
  - 新增护肤品离线 fixture 与 `pnpm plan:industry`；输出 `outputs/industry-plans/skincare/industry-plan.json`，连续两次生成 SHA-256 一致，live provider/public 请求均为 0。
  - 自动化测试覆盖大行业输入、必需规划轴、模块完整性、错误 claim-role 阻断、稳定序列化、空覆盖/空样本和跨行业品牌隔离。
  - `pnpm check` 通过：18 files / 169 tests，TypeScript 和 Biome 全绿；未修改 UI，所以未运行 `pnpm build`。
  - 本轮只到 L2/C2：未 commit、push、部署、运行新 benchmark、应用 migration 或调用任何 live API；旧 benchmark runner worktree diff 保留。

- [x] 2026-07-12 同址双端 H5 改造、生产部署和免费池手机流程闭环：
  - 修复长报告滚动、动态视口与 safe-area；输入、运行、摘要报告、竞品卡、章节展开、分享/下载/回放均完成移动端适配。
  - 报告 API 升级为 v2 白名单摘要；旧报告无 databases 时继续降级显示 Markdown。
  - `pnpm check` 17 files / 160 tests、`pnpm build`、360/390/430px 与 1440px Playwright 回归通过。
  - 提交 `001573b` 已推送并部署，备份 `.deploy-backups/pre-001573b-20260711T164610Z.tar.gz`，远端 build/doctor/health 全绿。
  - 唯一生产 H5 run `industry-research-2026-07-11T16-48-34-426Z` 完成，27 evidence、3 competitors、3 opportunities、8/8 artifacts；分享回放与下载通过，路由 policy 为 `aliyun_free_model_pool_v1`。

- [x] 2026-07-11 阿里云免费模型池接入生产并完成真实品类 canary：
  - GLM/Kimi 免费模型按任务分工接入，权威抽取固定 `glm-4.7`，最终成稿固定 `kimi-k2.6`，两路辅助模型稳定轮换；Kimi Code 不进入生产。
  - 生产 env 已安全备份并切换到阿里云 MaaS；默认兜底模型改为 `kimi-k2.6`，本次无 DeepSeek/Qwen 调用。
  - 当前未提交 worktree 已通过显式 `--worktree` 模式部署；远端 build、server doctor、Supabase doctor、service restart、health 全部通过。
  - canary `production-free-pool-canary-20260711-2026-07-11T11-59-14-626Z`：5/7 confirmed（71.4%）、7/8 accepted source、3 个 ASIN 评论覆盖、无 LLM fallback、8/8 artifacts 完整。
  - 最终 `pnpm check` 通过：15 files / 155 tests。

## 下一步

- [x] M2.1：统一公开网页、搜索发现、sitemap/RSS、复杂公开页面和授权导入的 adapter/router 契约；22 条专项测试覆盖权限、来源角色和安全阻断。
- [x] M2.2：实现不可变 raw document、采集审计、SHA-256、规范 URL、内容去重、版本保留和幂等本地 fixture；两次输出指纹一致。
- [x] M2.3：洗碗机第一轮真实扫描完成；18 public、3 Tavily、Firecrawl 保守 50 credits、0 LLM、¥0.192、42.374 秒，全部在批准上限内，6 份原文已进入不可变本地仓库。
- [x] M2.3 离线复核：2 份相关原文候选、2 份串品类、2 份来源质量拒绝；单一品牌官网角色不足，11/11 coverage rows 有缺口，明确禁止进入 M3。
- [x] M2.4：在 standing `live_budget` 下完成 3 个各自有硬上限的定向 wave；18 份不可变原文中 11 份强相关，4/4 关键 coverage rows 达标，7 个非关键缺口保留，M3.1 ready。
- [x] M3.1：生成 7 条原子事实，逐条绑定不可变 raw、精确 quote、claim role、source role 和 coverage row；二进制 PDF、串品类和低质量来源均通过反向测试保持 fail-closed。
- [x] M3.2：生成 3 条明确未验证、事实可追溯的 opportunity hypotheses；每条均有目标用户、问题、未知项、L5 验证方法及可量化成功/失败标准，商业化状态保持 `requires_real_world_validation`。
- [x] M3.3：生成分级 JSON/Markdown 洗碗机报告，分章展示 7 条确认事实、3 条未验证假设、7 个覆盖缺口、7 个拒绝来源和完整证据附录；无项目继续/终止结论。
- [x] M3.4：全部 7 条 claim 证据链通过，并抽查 market/regulation/product 三类代表性事实；Markdown 章节、附录、移动可读性、商业结论禁区、确定性回放和完整回归均通过。M3 达到本地 C2；未完成独立人工复核或真实用户验证。
- [x] M4.1：护肤品完整大行业输入已编译成六模块 11 个离线采集任务；输入范围未缩成品牌/SKU，两次产物 hash 一致，live/LLM/外部事实为 0。
- [x] M4.2：前三波在 2/11 coverage 诚实暂停后，按“只搜索公开市场、不做人工补充”执行三波新来源恢复；最终 82 immutable raw / 49 relevant candidates / 9 samples，11/11 coverage、critical 4/4，manual/import/LLM 均为 0。
- [x] M4.3：六个护肤行业模块全部完成，33 条 exact-quote claim 通过，0 blocked module；缺口没有被改写成商业结论。
- [x] M4.4：生成护肤综合报告、claim ledger、知识图谱和 33 组公开证据附录；1 条推断与 2 条机会假设均和事实分层。洗碗机报告逐字节回放一致，`pnpm check` 37 files / 313 tests。
- [x] M5.1：复用现有六阶段 runner，新增原子 operation receipt 与稳定幂等键；完成“外部操作后故障→零重复执行恢复→主动暂停→完成剩余阶段”证明，未知结果 fail-closed。
- [x] M5.2：单一结果页展示阶段、coverage、缺口、请求数和费用；沿用现有 Supabase/本地交付存储与同源 SSE，不新增 migration、数据库或 UI 分支。
- [x] M5.3：旧 8 文件、公开分享、详情、下载、replay 鉴权和公开字段白名单兼容验收通过；replay 未实际执行。
- [x] M5.4：提交 `598f628` 已推送 main；生产备份、残留文件可逆归档、非删除部署、build/doctor/service/health/UI/API/security canary 全部通过，达到 C3。未执行 migration/backfill、付费/live crawl、replay 或外联。
- [x] M6.1：完成 3–5 名目标用户的本地验证方案，定义独立任务、成功/失败指标、隐私边界、记录字段和停止条件；没有联系用户或人工补充行业数据。
- [ ] M6.2（awaiting L5）：用户确认参与者与沟通渠道后，邀请 3–5 名目标用户参加独立测试；不公开招募、不群发、不收集私人业务数据。

- [x] 分支工作入口收束到 `main`；所有历史分支提交已合并，M1–M5.4 由提交 `598f628` 收口并推送 `origin/main`。
- [x] 报告决策模型拆分为研究就绪度与商业化评估；证据不足不再自动生成停止项目结论。
- [x] 五类 finding 全部进入审核队列；`report.md` 与 `reviewed_report.md` 统一使用证据门禁，并删除重复候选 renderer。
- [x] `pnpm check` 通过 27 files / 259 tests；离线 replay v2 为 0 provider、0 公网请求、¥0。

- [x] G12 纯离线预注册与统一 scorecard/runner 已完成：锁定 5 品类、3/5 kill rule、pre/post-kill 隔离、8 类失败原因和 C5 fail-closed；live API/provider/credits=0、费用 ¥0。
- [x] G12 live benchmark 已在 ¥10、250 Firecrawl credits、160 public requests、15 LLM requests 上限内执行；前三项 0/3 PASS 后触发 kill，后两项未调用。
- [x] G12 决策范围已纠正：`evidence_pipeline_blocked` 只表示证据流水线受阻，商业化状态为 `not_evaluated`，不再自动生成停止项目结论。
- [x] 复用洗碗机现有产物，完成 claim、quote、机会假设与报告决策修复；不再新增品类 benchmark。
- [x] M5.1 让 Planner 与现有 `ResearchWorkflowInput` / public workflow 以模块化异步阶段衔接，不把大行业重新塞进单次 300 秒同步 run。
- [ ] G11 已由用户明确跳过；仅在用户主动重新开放真实用户验证并确认联系与隐私边界后，才找目标用户复验。当前维持 C3，不标记 C4。
- [ ] 根据真实手机阅读反馈决定是否继续压缩完整报告的证据索引章节；当前工程验收已通过，但报告内容本身仍很长。

- [ ] 将目标生成数与单轮 crawl cap 对齐，避免 11 个目标中最后 3 个被记为 `TARGET_CAP_EXCEEDED`。
- [ ] 修正 health 中仍偏历史的 provider 展示文案，使其明确显示阿里云 MaaS 免费模型池，而不是泛化的 `9router_or_openai_compatible`。
- [ ] 当前仅 C3；在真实用户能自行完成核心流程前，不标记 C4，在出现实际使用/收益证据前不标记 C5。

- [x] 2026-07-10 核心 3 品类证据质量内部修复完成本地 C2：
  - A 正文清洗：新增确定性 HTML/Markdown/text 清洗器，保留 `originalText`，输出 removed/residual audit；去除图片 target、导航、隐私/法律声明、浏览器扩展错误、重复 CTA/模板和已知页脚。
  - B 来源质量：补齐宠物益生菌中英跨语种、洗碗机和日本护肤的确定性相关性；Cosmopolitan/Trustpilot 等生活方式或评论聚合页不再伪装成 official source。
  - C 实体绑定：quote 支持显式 rawDocumentId/sourceId/URL/domain 约束；重复 quote 无唯一绑定时拒绝；竞品、website、pain point 和 keyword 只继承自己的 evidence source，不再使用第一个 URL 或全部 sourceIds。
  - D 结论门禁：只有全部 quotes、完整声明、高风险数字和唯一 trace 都通过的人工 approved 结论进入确认区；validation 缺失、partial/unsupported 即使误标 approved 也留在候选区。
  - E 报告隔离：provider 原始自由文本始终与正式 `report.md` 隔离，不再只在 `acceptedForReport=0` 时阻断。
  - F/G 离线回归：三品类保存样例 replay 完成；三个品类 accepted 残余已知噪音中位数均为 `0%`、实体串线 0、确认区无无效结论；宠物/洗碗机 product 与护肤 collection 深页 fixtures 3/3 通过。
  - 输出：`outputs/industry-research-benchmarks/evidence-repair-replay-v1/evidence-repair-replay-v1-2026-07-10T13-47-38-314Z/`；36ms、0 provider、0 公网请求、增量成本 ¥0，未改写原样例。
  - 证据流水线 benchmark 仍为 0/3 PASS：旧样例实际深页为 0、声明完整性元数据不可追溯，因此自动报告交付就绪度为 blocked；商业化未评估。
- [x] 2026-07-10 已按用户决定取消真实卖家反馈和付费试单板块；不再外联、不再作为当前 Goal 验收或解冻依据。
- [x] 2026-07-07 洗碗机固定官网来源和零可信来源报告阻断已完成本地代码侧收口：
  - 默认 `source_registry` 新增 FOTILE、美的、海尔、西门子家电中国、老板电器、Panasonic China 6 个洗碗机官网入口。
  - `createIndustryResearchDeliveryReport` 新增保护：当 `acceptedForReport=0` 时，不再附上 provider 原始报告内容，避免 LLM 常识 / mock 内容被误读为研究结论。
  - 新增单测覆盖洗碗机 registry 命中，以及零可信来源时阻断 provider 报告。
  - 验证：针对性 Vitest 3 文件 51 tests 通过；`pnpm check` 通过（9 文件 99 tests，Biome 87 文件）。
  - 本地重跑「洗碗机」：首轮 `dishwasher-dtc-2026-07-07T02-16-29-685Z` 为 `acceptedForReport=0` 空跑；修复后 `dishwasher-dtc-2026-07-07T02-25-01-084Z` 产出 2 个 accepted source、20 evidence、5 review items、2 个竞品、3 个机会。
  - 本轮尚未提交、推送或部署到轻量服务器。
- [x] 2026-07-07 固定可信来源注册表已接入 public_web / public_web_llm：
  - 新增 `source_registry` discovery method 和 `source-registry.ts`，固定官网来源会优先进入 crawl plan，再由 Tavily/Serper/DDG 搜索补漏。
  - 默认注册表已覆盖「男士电动剃须刀」等常用品类；剃须刀类默认加入 Philips、Braun、Panasonic、Flyco 官网。
  - 支持 `AGENT_FACTORY_SOURCE_REGISTRY_JSON` 按品类配置官网、`AGENT_FACTORY_FIXED_SOURCE_URLS` 临时追加全局官网、`AGENT_FACTORY_SOURCE_REGISTRY_DISABLED=true` 关闭注册表。
  - 已提交并推送 `55fc6e4 feat: add trusted source registry`，已部署到轻量服务器；远端 build、doctor、service restart、公网 health 均通过。
  - 验证：`pnpm check` 通过（97 tests），`pnpm build` 通过；生产轻量验证确认「男士电动剃须刀」命中 Philips / Braun / Panasonic / Flyco 四个默认官网。
- [x] 2026-07-06 `public_web_llm` 来源质量和机会抽取继续加严并上线：
  - `sourceQuality` 排除平台/门户/财经资讯/百科问答/robots/sitemap/search candidate/unknown/low 作为可确认报告证据。
  - LLM 分批抽取只接收 `canConfirmWithSource` 来源，并在 prompt 中携带 `sourceQuality`、机会抽取和“候选切入点需复核”约束。
  - 中文品类词新增 3-6 字片段匹配；自动搜索发现的首页没有品类相关性时降级为 `low/accepted=false`，用户手动 URL 仍可作为候选入口。
  - 本地 `pnpm check` 通过（95 tests），`pnpm build` 通过。
  - 已部署提交 `3ba2f8e`、`24c98ca`；最新线上 run `industry-research-2026-07-06T13-39-33-057Z` 输出 1 个 Philips 竞品、2 个机会、13 条证据；`sayweee.com` 已降为 `accepted=false`，Philips 官网为唯一 accepted source；分享回放验证通过。
- [x] 2026-07-06 用户确认 UI 默认模式切到 `public_web_llm`：
  - `SimpleResearch.tsx` 默认 mode 从 `public_web` 改为 `public_web_llm`。
  - UI 等待文案改为「约 2-4 分钟」。
  - `AGENT_FACTORY_RUN_TIMEOUT_MS` 示例和生产 env 改为 300000ms；health 默认模式口径改为 `public_web_llm`。
  - n8n 周报默认仍保持低成本 `public_web`。
  - 已部署提交 `a509032`；线上 E2E run `industry-research-2026-07-06T13-09-42-043Z` 确认请求体 `mode=public_web_llm`，结果产出 1 个竞品候选、3 条产品信号、8 条关键词、7 条证据。
- [x] 2026-07-06 从输入品类开始的线上 workflow 已修复超时并复测：
  - 复现：输入「男士电动剃须刀」点击「开始研究」后，运行卡在 `crawl_sources` 并在 180 秒返回 `run_timeout_after_180000ms`。
  - 修复：新增 `AGENT_FACTORY_PUBLIC_WEB_MAX_*` 预算配置，默认限制 search / probe / sitemap / discovered / crawl 目标数；生产 Firecrawl 单页超时从 30000ms 降为 12000ms。
  - 验证：本地 `pnpm check`、`pnpm build` 通过；提交 `7138356` 已部署生产，公网 health OK。
- [x] 2026-07-06 搜索发现噪音过滤已增强：
  - query 改为偏「品牌官网 / official brand website / 竞品」。
  - 新增过滤 JD、淘宝、天猫、搜狐、微博、百度、B 站、抖音等平台/门户/内容社区域名。
  - 验证：`pnpm check`、`pnpm build` 通过；提交 `ccad3f4` 已部署生产。
- [x] 2026-07-06 最新线上 E2E：
  - Playwright 输入「男士电动剃须刀」并点击开始研究，run `industry-research-2026-07-06T12-52-48-094Z` 约 25 秒完成，无 180 秒超时。
  - 清空 localStorage 后直接打开 `?run=industry-research-2026-07-06T12-52-48-094Z`，回放页显示「来自运行记录」。
- [x] 2026-07-06 Claude UI 统一版已验证并部署到生产：
  - 已复核 `docs/CODEX_UI_UNIFICATION_HANDOFF.md`：单一简化模式、知识图谱三屏、运行事件流、`?run=` 分享回放端点、移动端样式均在 `main`。
  - 本地 `pnpm check`、`pnpm build` 通过；`deploy.sh --dry-run` 复核后执行 `deploy.sh --execute`，生产部署完成到 `research.playgamelab.cn`。
  - 线上 health、输入页、新 run、报告页、分享回放、390px 移动端无横向溢出均已验证。
  - 根路由 `/` 已改为 redirect 到 `/industry-research`，旧浅色首页不再作为入口。
- [x] 2026-07-06 用户确认后删除不可达旧控制台：
  - 删除 `IndustryResearchWorkbench.tsx`、`components/EvidencePopover.tsx`、`components/micro.tsx`、`fixtures/research-console.ts`。
  - 应用代码无剩余 import；porting/design docs 中的历史参考文件保留。
- [x] 2026-07-06 搜索 provider 新增 Tavily：
  - `AGENT_FACTORY_SEARCH_PROVIDER=tavily` + `AGENT_FACTORY_SEARCH_API_KEY` 可切换到 Tavily Search。
  - Tavily 固定 basic search，不请求 answer/raw content，控制免费 credits 消耗。
- [x] 2026-07-06 Tavily 已复制并配置到本地和生产：
  - OpenClaw 的 `TAVILY_API_KEY` 已安全复制到本项目 `.env.local`，未打印密钥。
  - 轻量服务器 env 已写入 `AGENT_FACTORY_SEARCH_PROVIDER=tavily`、`AGENT_FACTORY_SEARCH_API_KEY`、`AGENT_FACTORY_SEARCH_BASE_URL`，备份为 `industry-research.env.bak-20260706081456`。
  - 真实 `pnpm sample:public-web` 验证 `run_log.sourceDiscoveryNotes` 出现 `provider=tavily`。
- [x] 2026-07-06 Firecrawl 已安装并完成代码侧接线：
  - 新增 `firecrawl@4.29.2` 依赖和 Firecrawl `/v2/scrape` 包装层。
  - `public_web` 只在公开 `homepage` / `collection` / `product` / `blog` 页面尝试 Firecrawl 正文抽取，`robots` / `sitemap` / `rss` 仍走原生 fetch。
  - Firecrawl 失败自动回退 native fetch；单测覆盖 Firecrawl 成功、robots 原生 fetch、Firecrawl 空正文回退。
  - 代码接线时尚无 Firecrawl API key，本机 keyless scrape 返回 403，因此先保持 disabled；随后已按下一条配置真实 key 并启用。
- [x] 2026-07-06 Firecrawl API key 已配置并启用：
  - 用户复制 Firecrawl API key 后，Codex 通过剪贴板读取并校验，只输出长度/前缀，不打印完整 key。
  - 本地 `.env.local` 已启用 `AGENT_FACTORY_FIRECRAWL_ENABLED=true`，并写入 `AGENT_FACTORY_FIRECRAWL_API_KEY` / `FIRECRAWL_API_KEY`。
  - 轻量服务器 env 已启用 Firecrawl，备份为 `industry-research.env.bak-20260706122506`。
  - 本地和生产 Firecrawl 单页 smoke 均返回 HTTP 200；生产 `pnpm sample:public-web` 生成 `v03-public-web-smoke-2026-07-06T12-25-43-548Z`，确认 Firecrawl Markdown 正文进入 raw documents。
- [x] 按 `docs/design_handoff_research_console 2/porting/source/globals.css` 迁移核心 UI 样式。
- [x] 补齐展示字体：`Space Grotesk`、`Manrope`、`IBM Plex Mono`、`Noto Sans SC`。
- [x] 移植 `components.tsx`、`KnowledgeGraph.tsx`、`micro.tsx`、`extras.tsx`。
- [x] 用装配版 `IndustryResearchWorkbench.tsx` 接入 adapter、fixtures、mock event timeline 和 core mock workflow。
- [x] 扩充 core mock 数据，让结果页统计和主要表格密度贴近 screenshots 基准。
- [x] 跑通 `pnpm check`。
- [x] 停止 `localhost:3000` 开发服务。
- [x] 从 `agent-factory` 同步 v0.3 行业研究核心：OpenAI-compatible provider 兼容层、sourceQuality、delivery package、manifest、run API、n8n webhook 合约。
- [x] 新增 `pnpm sample:public-web`，作为不启动 Studio、不调用 LLM 的低负载 smoke 验证入口。
- [x] 新增 `pnpm probe:9router` 和 `pnpm verify:9router`，作为需要真实 LLM 时的显式探测 / 验证命令；`verify:deepseek` / `sample:deepseek` 保留为历史兼容入口。
- [x] 迁移后验证通过：`pnpm --filter @industry-research/core typecheck`、`pnpm test`、`pnpm check`、`pnpm sample:public-web`。
- [x] Claude Code UI 还原修正已提交：中文字体接线、英雄区知识图谱安全边距/羽化、浅色态月亮图标、tooltip 实时计数。
- [x] `docs/porting` 设计交接参考文件已从 Biome 检查中排除，`pnpm check` 重新通过。
- [x] 2026-06-25 验证通过：`pnpm check`，包含 workspace typecheck、34 条 Vitest、55 个文件 Biome 检查。
- [x] 将轻量服务器 n8n workflow 导入并激活，使用 Header Auth credentials 调用行业研究 run API 和 n8n 回调 API。
- [x] 将 n8n 默认业务流设为 `public_web`，已验证不传 `mode` 时可生成交付包并返回 n8n 回调 ack。
- [x] 探测 9router free 候选模型真实 `/v1/chat/completions` 可用性；当前未找到比 MiMo Free 更可用的免密免费模型。
- [x] 2026-06-25 前端 UX 功能接线第一批（Claude Code）：
  - 基础：抽出 `_lib/run-core.ts`，新增 `app/industry-research/actions.ts` 三个同源 server action 修「鉴权坑」（详见 DECISIONS）。
  - P0-C：补充资料三个 textarea 与研究模板 select 受控接线；必填项校验 + URL `http/https` 轻校验 +「开始研究」置灰。
  - P0-A（最小版）：四个模式按钮真生效，`Mock` 本地 + 演示标识，其余三模式经 server action 发真实 run，运行期 indeterminate，`await` 完成后 `adaptRun` 切 done。
  - P0-B：真实 run 失败注入 `run.error` → 失败卡片 + 重试 / 返回表单。
  - P1-D：报告卡「下载交付包」(downloadDeliveryPackageAction)、审核卡「提交审核结果」回写 `reviewed_report.md` 在线版、机会表客户端「导出 CSV」。
  - 验证：`pnpm check`（workspace typecheck + 34 Vitest + Biome 57 文件）、`pnpm build`、`pnpm sample:public-web` 全通过。
- [x] 2026-06-25 前端 UX 功能接线第二批（Claude Code）：
  - P0-A 完整版 SSE：`runPublicIndustryResearchWorkflow` 加 `onProgress`，新增同源流式路由 `POST /api/industry-research/run/stream`，前端 fetch+ReadableStream 订阅，public_web 逐阶段真实进度（实测 0%→23%→done），失败回退非流式。
  - P1-E 证据溯源弹层：adapter 把 evidenceIds 解析为 `UIEvidenceRef`，新增 `EvidencePopover`，机会/竞品/痛点/内容 4 表证据单元格可点开来源（含 a11y）。
  - Mock 数据密度恢复：`entityProfile: "rich"`（仅 Mock），实测 `8/8/26/74`、竞品/机会 6、九库 10/6/3/6/6/5/5/6/2；真实模式保持 lean。
  - 验证：`pnpm check`（34 Vitest + Biome 59 文件）、`pnpm build`、浏览器点检 SSE / rich / 溯源全通过。
- [x] 2026-06-25 前端 UX 功能接线第三批（Claude Code）—— handoff 剩余项收尾：
  - P1-G 刷新持久化：done 态把结果快照(phase+resultModel+rawResult+runId+input+view+tab)存 localStorage，刷新恢复（实测 reload 后回到 done、8/8/26/74），reset 清除。
  - P1-F 无障碍：侧栏导航、九库卡、排序表头(aria-sort)、审核按钮(aria-pressed)、补充资料 toggle、搜索 pill 全部 role/tabIndex/Enter-Space 键盘可达；KnowledgeGraph canvas 加 role=img + aria-label + 视觉隐藏数据库清单；已有 `:focus-visible` 焦点环。
  - P2-J：NeedRun「去研究台」只切 view；命令面板仅在已有结果且非 running 时才跳结果态。
  - P0-B：新增 `components/states.tsx`（Skeleton shimmer + EmptyState/EmptyTable），结构化结果 6 表空态兜底。
  - P2-H：≤720px 顶栏汉堡 → 抽屉式侧栏 + 背板（实测滑入/导航关抽屉/切视图），宽表 `overflow-x:auto` 横滑。
  - LLM SSE：glm-workflow 两个函数接 `onProgress`，9router / OpenAI-compatible mode 也走细粒度流式（实测 emit 12 步 done + report start + error 帧）。
  - 验证：`pnpm check`、`pnpm build`、浏览器点检（持久化/抽屉/SSE）全通过。
- [x] 2026-06-26 待办收敛：
  - 真实 run 期的 stat 条 / 九库卡 / 表格区 `<Skeleton/>` 已铺进 running 页面。
  - P2-J 的 phase×view 可见性已收敛为 `deriveVisibleScreen` 单一派生函数。
  - UI / health / README / 当前状态文档已统一为 9router / OpenAI-compatible provider 口径；旧 `deepseek` mode / 函数名仅作为兼容层保留。
  - 新增 `scripts/probe-9router-free-models.ts` 和 `pnpm probe:9router`，按 `/models` 候选 + `/chat/completions` 真实请求判断 free 模型可用性。
  - API 默认 run mode 改为 `public_web`，没有显式 LLM mode 时不调用 provider。
  - robots / 公开数据边界仍遵循既有 public_web 约束；生产 / 付费交付必须配置自付费 provider 和内部 API key，不使用不稳定 free provider 承诺交付。
- [x] 2026-06-29 Supabase + zvec 基础设施代码侧接入：
  - 新增轻量 production schema migration，覆盖 run、artifact、n8n event、zvec chunk metadata。
  - RLS deny-by-default，第一版不开放客户端表访问。
  - 新增 Supabase service-role 写入模块和 repository adapter。
  - run 成功后在 `AGENT_FACTORY_SUPABASE_ENABLED=true` 时写入 Supabase，失败则 run 失败。
  - 新增 `pnpm supabase:doctor`、`pnpm supabase:smoke`、`pnpm zvec:index`、`pnpm zvec:search`。
  - zvec 使用本地 `.cache/industry-research-zvec/chunks`，已验证历史 run 可索引和搜索。
- [x] 2026-06-29 轻量服务器运行架构补齐：
  - 明确生产运行面固定为轻量服务器。
  - 新增 `docs/lightweight-server-runtime.md`。
  - 新增 `deploy/lightweight-server/` 的 systemd、Caddy 和 env 模板。
  - 新增 `pnpm server:doctor`。
  - `apps/studio` start 命令改为尊重 `PORT`，支持 `PORT=3010`。
  - 脚本默认读取 `/etc/industry-research/industry-research.env`，也支持 `AGENT_FACTORY_ENV_FILE` 指向临时 env 文件。
  - 新 run 返回的交付包目录、zvec chunk 元数据路径会按真实服务器目录生成。
- [x] 2026-06-29 专用 Supabase project 已创建：
  - project：`industry-research-production-table`
  - ref：`ghsyjdipofnyokbbbrdb`
  - URL：`https://ghsyjdipofnyokbbbrdb.supabase.co`
  - region：`ap-southeast-1`
  - Postgres：`17.6`
- [x] 2026-06-29 Supabase migration 已应用到专用 project：
  - 4 张表存在：run、artifact、n8n event、zvec chunk metadata。
  - RLS 全部开启，第一版 policy 为空。
  - `anon` / `authenticated` 对表和 n8n sequence 无读写权限。
  - `service_role` 可写入并读回 run/artifact/event/zvec chunk；smoke 事务已 rollback，未留下测试数据。
  - Advisors 只有预期 INFO：RLS enabled no policy、new unused indexes。
- [x] 2026-06-29 轻量服务器 Supabase env 已配置并修正：
  - 远端 env 路径：`/opt/playgamelab/industry-research/industry-research.env`。
  - 已备份错误 key 版本：`industry-research.env.bak-20260628215506`。
  - 已修正 `SUPABASE_SERVICE_ROLE_KEY` 两段 JWT 拼接导致的 `401 Invalid API key`。
  - 远端 REST smoke 通过：4 张表可访问，测试写入/读回/清理通过。
- [x] 2026-06-29 远端最小同步已执行：
  - 同步包只包含 Supabase/zvec/server-doctor/env/docs/deploy 模板等基础设施文件。
  - 远端备份：`.deploy-backups/minimal-infra-sync-before-20260629060251.tar.gz`。
  - `pnpm install --frozen-lockfile`、`pnpm server:doctor`、`pnpm supabase:doctor`、`pnpm supabase:smoke` 均已通过。
- [x] 2026-06-29 远端 zvec 与生产服务复测完成：
  - `pnpm zvec:index` 通过；历史旧 run 缺 Supabase 权威记录的 chunk 被计入 `skippedMissingRuns`。
  - deployment API smoke run：`deployment-api-smoke-2026-06-29T04-48-52-525Z`。
  - 本地交付包 8 文件齐全，Supabase run 1 条、artifact 8 条、zvec metadata 14 条。
  - `pnpm zvec:search --query=deployment-api-smoke` 可检索到新 run。
  - 远端 `pnpm build` 通过，`industry-research.service` 已重启。
  - 本机和公网 `/api/health` 均返回 `status=ok`。
- [x] 2026-06-29 Claude Code 简化 UI 已合并到 GitHub：
  - 提交：`329dab8 feat(studio): simplify /industry-research to a 3-step flow, keep console as advanced mode`。
  - 默认 `/industry-research` 改成 3 步用户流程。
  - 完整工程控制台保留在「高级模式」。
  - 首页文案已去工程黑话。
  - 本轮已确认本地 `main` 与 `origin/main` 一致。
- [x] 2026-06-29 Claude Code 简化 UI 已部署到轻量服务器：
  - 备份：`.deploy-backups/ui-head-sync-before-20260629130046.tar.gz`。
  - 已从 GitHub `HEAD` 同步 `/industry-research` 前端目录、首页、`globals.css`、`layout.tsx`。
  - 发现并修正 `actions.ts` UI mode 类型兼容问题：同时支持 `9router/public_web_9router` 和 legacy `deepseek/public_web_deepseek`。
  - 远端 `pnpm build` 通过。
  - `industry-research.service` 已重启，状态 active。
  - 公网 `/industry-research` 已返回新 UI 文案和「高级模式」入口。
- [x] 2026-06-29 P0/P1/P2 准生产优化完成：
  - 新增 GitHub Actions CI，固定 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm build`。
  - SSE run stream 增加 Host/Origin 白名单、一次性 token、body cap、timeout、rate limit、错误脱敏；REST run API 内部 key 边界不变。
  - 运行模式对外收敛为 `public_web` / `public_web_llm` / `llm_only`，legacy provider mode 保留兼容；provider/model/fallback 写入 metadata。
  - 真实 public_web 去模板化；Mock rich demo 与真实 lean 路径隔离。
  - 新增 evidence quote validator，quote 匹配失败或来源质量不足时降级为 needs_review/rejected。
  - 报告分为已确认发现、候选发现、不确定/阻塞项，并补齐 evidenceId/rawDocumentId/URL/quote/质量字段。
  - Supabase run list/detail/download 改为 Supabase-first + 本地 fallback；新增内部 replay API。
  - n8n workflow 扩展 queued/running/completed/failed 四态事件。
  - zvec index 增加增量状态文件和 local/supabase/auto 来源模式。
  - 可信度指标进入 run_log、manifest 和报告。
  - 验证：`pnpm check`、`pnpm build`、`pnpm sample:public-web`、本地安全版 `pnpm server:doctor`、`pnpm zvec:index`、`pnpm zvec:search --query=taobao` 均通过；Supabase 本机无密钥时 doctor disabled、smoke skipped。
- [x] 2026-06-29 P0/P1/P2 提交、推送和轻量服务器部署完成：
  - 提交：`703e41a1627ba0425acbcbafb2f280cd8caf3ea7 feat: harden industry research production baseline`。
  - 已推送 `origin/main`。
  - 生产目录 `/opt/playgamelab/industry-research` 已非删除式同步，保留 `industry-research.env*`、`node_modules`、运行数据和本地工具目录。
  - 部署前备份：`.deploy-backups/pre-703e41a-20260629T114634Z.tar.gz`。
  - 远端 `pnpm install --frozen-lockfile`、`pnpm build`、按 systemd env 加载的 `pnpm server:doctor`、`pnpm supabase:doctor`、`pnpm supabase:smoke` 均通过。
  - `industry-research.service` 已重启并保持 active；公网 `/api/health` 和 `/industry-research` 可访问。
  - 生产 zvec index/search 通过；当前仍保留 optimize warning 作为后续观察项。
- [x] 2026-06-29 TODO 剩余项继续完成：
  - 服务器真实运行 `pnpm probe:9router`，结论为 `no_usable_model_found`；当前没有可用于生产 LLM 交付的 free/provider 模型。
  - 新增 `pnpm supabase:backfill-local-runs`，支持 dry-run、`--write`、`--skip-existing`、`--run-id`、`--limit`。
  - 远端 backfill 已执行：4 个历史本地 run 写入 Supabase，1 个已存在 run 跳过。
  - zvec metadata 已强制重建，`skippedMissingRuns=0`；历史 n8n run 可通过 zvec 检索。
  - 四态 n8n workflow 已导入生产同 id workflow，并通过 execution `12` 验证 queued/running/completed 三事件落库。
  - 修复 n8n Run 节点表达式，避免 callback ack 覆盖原始 webhook input。
  - zvec optimize warning 已通过显式开关处理：默认不跑 optimize，生产复测 `warnings=[]`；需要维护压缩时再显式传 `--optimize`。

- [x] 2026-07-05 交接文档 P0–P3 全部落地（按 `docs/CODEX_RESEARCH_VALUE_HANDOFF.md`）：
  - T1：DeepSeek 官方 API 接入本机 `.env.local`，`pnpm verify:9router` 通过（真实 7570 字符报告，无本地回退）；真实品类 run `pet-probiotics-dtc-2026-07-04T13-53-36-077Z` 九库全部非空（32/3/3/3/16/3/3/3/1），quoteMatched 65/0。
  - T2：抽取分批 map-reduce（`generateGlmStructuredExtractionBatched`），高可信来源优先、稳定键合并去重、单批失败按文档降级；修复旧实现只取前 12 文档的覆盖损失。
  - T3：搜索 provider 抽象（tavily/serper/brave API + DDG fallback；Brave 仅兼容不推荐），搜索默认 3 query×5 结果；env 见 `.env.example`。
  - T4：发现层按类硬配额（product/collection/blog 各 6-8）、robots.txt Disallow 解析过滤、同域 ≥1s 礼貌间隔、单 run 60 目标上限。
  - T5：RSS alternate 链接发现已有链路保留；新增 YouTube/Reddit 官方 API 内容适配器（`content_api` sourceType），缺 key 静默跳过。
  - T6：跨 run diff → 真实周报（`run-diff.ts` + `previousRun` 参数 + 报告「本期新增与变化」节）；studio 与 CLI 都接了上一 run 查找。
  - T7：新增 `workflows/n8n/industry-research-weekly-rerun.json`（每周一触发订阅品类 re-run），默认 inactive 只入库；合约测试防 secret 入 JSON。
  - T8：LLM 抽取注入上一次 run 结论摘要（`buildHistoricalContextFromDatabases`），prompt 声明不得作证据；zvec 检索抽成 `scripts/lib/zvec-search-core.ts`。
  - T9：`run-security.test.ts` 12 条单测（token/白名单/限流/body 上限/脱敏）。
  - T10：`deploy/lightweight-server/deploy.sh`（默认 dry-run，排除清单对齐 DECISIONS）。
  - T11：`.gitignore` 收纳工具目录与 remotion 产物。
  - T12：DECISIONS 补记单进程限流假设等本轮决策。
  - 验证：`pnpm check` 通过（typecheck + 84 条 Vitest + Biome 84 文件）。

## 待处理

- [x] 2026-07-05 GitHub 推送完成：`origin/main` 已包含研究价值阶段提交（`7c07af5`）。
- [x] 2026-07-05 生产部署与 n8n 导入完成：已按 **`docs/CODEX_PRODUCTION_ROLLOUT_HANDOFF.md`** 执行 R1-R6，写入生产 LLM env、部署 `7478af7`、验证生产 DeepSeek、导入并激活 `industryResearchWeeklyRerun`、生成生产基线 run `dtc-2026-07-04T17-32-52-910Z`、完成 zvec 增量索引。R7 文档回写和提交由本轮收尾完成。
- [x] 2026-07-06 UI 统一版 D1/D2 完成：部署 `main` 到轻量服务器并完成线上端到端验证；本轮又把根路由 `/` 改成 redirect 到 `/industry-research`。
- [ ] 保持商业化冻结，不扩品类、provider、数据库、n8n 或新基础设施；Serper/YouTube/Reddit 等凭据扩充不再是当前待办。
- [ ] 不自动重跑 live benchmark。若未来要申请解冻，先重新预注册同一核心 3 品类、同一硬门槛和费用/时间上限，再取得新的付费调用确认。
- [ ] 未来受控复跑只验证三件尚未由旧样例证明的事：真实 run 是否实际抓到每品类至少 1 个深页；新 extraction 是否写入声明级完整性元数据；至少 2/3 品类是否达到 ≥70% full 和 ≥70 分。
- [ ] 当前未 commit、push 或部署；如需进入 L3/L4，必须由用户明确指定具体 commit、push 或部署动作。

## 下一步建议

1. 保留当前离线 replay、scorecard 和 fixtures 作为恢复入口；不再用报告篇幅、数据库行数或单条 quote 命中替代证据质量。
2. 在没有新的预算授权前暂停真实 API benchmark；不得用旧的 L2-L4 授权推断付费调用许可。
3. 商业化结论维持“冻结 / 不可对外付费交付”；内部修复 C2 不等于产品已达到 C4/C5。
4. 用户已取消真实卖家反馈和付费试单板块；下一轮若没有新的方向变化，只需从本 TODO 的受控复跑条件恢复，不重做扩建路线图。
