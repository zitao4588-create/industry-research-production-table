# 行业研究生产台证据质量 Benchmark v1

状态：核心 3 品类已于 2026-07-10 完成；0/3 通过技术硬门槛，kill rule 已触发；扩展 2 品类未运行，所有付费调用已停止。

收口状态：原 goal 已按用户决定停止；真实买家反馈与付费试单验收已取消，不再追踪或外联。后续只处理生产台自身的证据质量问题。

## 决策目标

在不扩充 provider、数据库、n8n 或新基础设施的前提下，判断当前行业研究生产台是否值得继续商业化。工程跑通、报告篇幅、数据库行数和 `acceptedForReport` 数量均不能单独证明可交付。

## 锁定基线

- Git HEAD：`db1a97c212255cab73b924a995959cf5105af4be`
- 用户确认的未提交 worktree diff SHA-256：`e7e4e70156a040285629a39a4c5c512e7de8b7fb81ae529b77b215c3ae3e1061`
- 该 diff 包含洗碗机固定官网来源和零可信来源时阻断 provider 原始报告的本地改动。
- Benchmark runner 与本文件为新增未跟踪文件，不改变上述既有 worktree diff hash。
- 不提交、不推送、不部署；结果只写入被 `.gitignore` 排除的 `outputs/industry-research-benchmarks/`。

## 预注册品类与顺序

所有品类使用相同的单输入契约：`industry=category=品类词`、`market=线上电商 / DTC`、`researchGoal=找到可切入的产品与内容机会`，URL、CSV、人工文本均为空；不读取历史 run 作为上下文。

### 核心 3 品类

1. `宠物肠胃益生菌`：registry 强覆盖正例。
2. `洗碗机`：已知弱覆盖与正文噪音负例。
3. `日本小众护肤品牌`：0 registry 的冷启动泛化对照。

### 可选扩展 2 品类

4. `大豆蜡香薰`
5. `电解质气泡水`

只有核心 3 品类至少 2 个通过技术硬门槛、且成本和耗时均未失控，才向用户申请扩展授权。

## 固定运行预算

| 项目 | 单品类上限 |
|---|---:|
| Tavily search query | 2 |
| 每个 query 的结果 | 4 |
| 发现目标 | 10 |
| probe URL | 8 |
| sitemap URL | 4 |
| 实际 crawl target | 8 |
| Firecrawl scrape | 8 |
| LLM 请求 | 3 |
| public fetch 总数 | 30 |
| native request timeout | 8 秒 |
| Firecrawl timeout | 12 秒 |
| 同域礼貌间隔 | 1 秒 |
| 单 run wall time | 300 秒 |

外层不自动重跑。结构化 JSON 解析失败时，现有生产逻辑可能在同一 run 内做一次修复请求；该请求计入 3 次 LLM 上限。

- 核心 3 品类增量费用硬上限：人民币 4 元。
- 五品类总增量费用硬上限：人民币 8 元。
- Runner 记录请求数和 provider 返回的 token usage；人民币成本仍需在 provider dashboard 人工核对。

## 统一 100 分评分表

| 维度 | 分值 | 计分依据 |
|---|---:|---|
| 可信来源覆盖与页面深度 | 30 | 人工确认的一方来源文档数、独立品牌域名数、是否含产品/类目/内容页 |
| 报告可证实结论比例 | 30 | 人工逐条检查结构化结论是否由正确实体的一方页面完整支持 |
| 正文纯净度 | 15 | accepted 文档中的导航、页脚、隐私、cookie、法律声明及重复模板占比 |
| 决策可用性 | 10 | 至少 2 个有证据的竞品比较和 2 个有证据的可执行机会；无无证据高风险量化结论 |
| 运行稳定性 | 10 | ≤180 秒 10 分；181–240 秒 7 分；241–300 秒 3 分；失败或 >300 秒 0 分 |
| API 成本纪律 | 5 | 未超过请求、人民币和重跑上限得 5 分；任何硬上限突破得 0 分并触发停止 |

### 人工审计子分实现

权重和硬门槛在运行前已经预注册；以下精确子分公式在运行后的离线人工审计阶段统一固定。因此，总分用于横向诊断，最终 PASS/FAIL 仍以运行前锁定的技术硬门槛为准，避免用事后子分改变决策。

- 来源 30 分 = `min(可信文档数 / 3, 1) × 10 + min(独立可信域名数 / 2, 1) × 10 + min(深层页数 / 2, 1) × 10`。
- 可证实结论 30 分 = `full 结论数 / review item 总数 × 30`；partial 单列但不计入 full。
- 正文纯净度 15 分 = `(1 - accepted 文档噪音中位数) × 15`。
- 决策可用性只有在至少 2 个 fully supported 竞品比较、2 个 fully supported 可执行机会，且不存在高风险无证据断言时得 10 分，否则得 0 分。
- 运行稳定性和 API 成本纪律沿用上表；人民币现金成本无法由本地记录确认时，成本先记 0 分并单列“确认后最高分”。

### 技术硬门槛

单品类必须同时满足：

1. 人工确认至少 3 份可信文档，覆盖至少 2 个独立品牌域名。
2. 至少 1 份产品、类目、博客/FAQ 等深层页面，不能全部是品牌首页。
3. 报告可证实结论比例至少 70%。
4. accepted 文档正文噪音中位数不超过 25%，且不存在噪音超过 50% 的 accepted 文档。
5. 不含无证据的销量、份额、转化率、排名等高风险量化结论。
6. 单 run 不超过 300 秒且总分至少 70。
7. 未突破请求数和已授权费用上限。

`acceptedForReport`、`quoteMatched`、数据库行数和自动 `approved` 仅作为候选 proxy，必须经过人工语义与实体归属复核。

## 正文噪音与结论审计口径

- 正文按段落人工标注为业务正文或 boilerplate；boilerplate 包含导航、页脚、隐私/cookie、法律声明、地区/语言选择、账户入口、重复菜单和与品类无关的站点模板。
- 噪音率 = boilerplate 字符数 / `extractedText` 字符数。保存每个 accepted 文档的分子、分母和代表性噪音片段。
- 结构化结论以 `review_items.items` 对应的竞品、产品、痛点、内容与机会记录为分母。
- 只有当结论全部重要部分被正确实体的一方来源 quote 支持，且 quote 不是正文噪音时，才计为可证实。
- Provider 原始报告只做高风险无证据断言扫描，不因篇幅或流畅度加分。

## Kill rule 与商业化决策

- 核心 3 品类少于 2 个通过：停止扩展，建议冻结。
- 任一请求/费用/耗时硬上限失控：立即停止后续付费调用。
- 技术门槛未通过时，只允许修复现有采集、清洗、实体绑定和证据门禁，不扩 provider、数据库、n8n 或基础设施。
- 只有内部问题通过离线回放和测试，且重新取得用户预算确认，才允许再次运行相同核心 benchmark。

## 核心结果

### 结论先行

**不值得继续商业化扩建，建议立即冻结。** 三个核心品类全部失败，且共同缺少深层业务页面；报告正文噪音高、证据集中、自动审核没有一条 approved，人工可完整证实的结论合计只有 3/8。失败不是“再多跑几次”可以解释的偶发波动，而是来源发现、正文抽取、实体归属和结论外推共同造成的结构性质量问题。

### 统一评分表

成本列暂不加 5 分，因为 Firecrawl 账户账单尚未核实。括号内为成本确认未超上限后的理论最高分；即使全部补上 5 分，三个品类仍低于 70 分。

| 品类 | 保守总分 | 人工可信文档 / 域名 | 规则 accepted 文档 / 域名 | 深层页 | accepted 正文噪音中位数 | full 可证实结论 | 耗时 | 结果 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 宠物肠胃益生菌 | **52.55/100**（最高 57.55） | 3 / 3 | 1 / 1 | 0 | **49.66%** | **1/2 = 50%** | 104.696 秒 | FAIL |
| 洗碗机 | **52.91/100**（最高 57.91） | 2 / 2 | 2 / 2 | 0 | **58.39%** | **2/3 = 66.67%** | 129.118 秒 | FAIL |
| 日本小众护肤品牌 | **26.06/100**（最高 31.06） | 1 / 1 | 1 / 1 | 0 | **48.52%** | **0/3 = 0%** | 101.720 秒 | FAIL |

三个品类的单 run 都小于 180 秒；总耗时 335.534 秒，中位数 104.696 秒。运行稳定性通过，但不能抵消证据质量失败。

### 每个品类的可信来源数量和质量

#### 宠物肠胃益生菌

- 人工可信来源 3 份、3 个品牌域名：Native Pet、Zesty Paws、Honest Paws。
- 三份均为品牌首页，深层产品/类目/博客/FAQ 为 0；Honest Paws 尾部还混入浏览器扩展错误文本。
- 自动规则只接受 Native Pet 1 份首页；Zesty Paws 和 Honest Paws 首页明明展示益生菌产品却被判为低相关性，存在 false negative。
- 11 条 evidence 全部集中在 Native Pet 这一文档，证据集中度 100%。

#### 洗碗机

- 人工可信来源 2 份、2 个品牌域名：方太官网首页、海尔官网首页。
- 两份均为首页，深层页为 0；海尔页面只能从导航和搜索词证明品类存在，无法支撑产品级判断。
- 两份首页各承载 3 条 evidence，最高单文档占比 50%，但 `website_structure` 记录出现 URL 与品牌错配，海尔记录还混入方太内容。

#### 日本小众护肤品牌

- 人工可信来源 1 份、1 个品牌域名：资生堂中国的一方首页。
- 深层页为 0；该页面只能支持资生堂旗下品牌描述，不能覆盖“日本小众护肤品牌”这一多品牌品类。
- 11 条 evidence 全部集中在该页面，证据集中度 100%；`website_structure` 还把资生堂栏目挂到了 Cosmopolitan URL，出现实体串线。

### 正文噪音

噪音只对规则 `acceptedForReport=true` 的文档逐字符审计；导航、页脚、隐私/cookie、法律声明、重复菜单、图片 Markdown target 与重复 CTA 计为 boilerplate。为避免夸大问题，中间不确定片段均从宽计为业务正文。

| 品类 / 文档 | boilerplate 字符 / 总字符 | 噪音率 |
|---|---:|---:|
| 宠物 / Native Pet | 5,959 / 12,000 | **49.66%** |
| 洗碗机 / 方太 | 8,130 / 12,000 | **67.75%** |
| 洗碗机 / 海尔 | 2,159 / 4,404 | **49.02%** |
| 护肤 / 资生堂 | 1,195 / 2,463 | **48.52%** |

洗碗机的品类中位数为 58.39%，且方太单文档超过 50%；另外两个品类中位数也都接近 50%。三个品类均远高于 25% 的预注册门槛。

### 报告中可证实结论比例

分母严格使用每个 run 的 `review_items.items`；只有正确实体的一方来源完整支持结论全部重要部分，且 quote 不是正文噪音，才计为 full。

| 品类 | full | partial | unsupported | full 比例 | 主要反例 |
|---|---:|---:|---:|---:|---|
| 宠物肠胃益生菌 | 1 | 0 | 1 | **50%** | 报告称 Native Pet 没有独立益生菌产品，但同一 accepted 首页明确展示 Probiotic、价格和评论数，结论被原文直接反驳。 |
| 洗碗机 | 2 | 1 | 0 | **66.67%** | 产品线分类可见，但“覆盖更多场景/值得切入”没有需求证据；结构化记录还有实体串线。 |
| 日本小众护肤品牌 | 0 | 1 | 2 | **0%** | “20–25 岁入门套装缺口”和“男性市场未充分开发”均无证据，quote 只能支持品牌/分类存在。 |

合计 full 为 **3/8 = 37.5%**。三个 run 的自动 approved 都是 0；Provider 原始报告仍写入不可复算的需求、竞争、商业价值或机会分数，并把导航、搜索浮层和品牌自述外推为需求、热度、转化或排名含义。

### 运行预算与 API 成本

| 项目 | 宠物 | 洗碗机 | 护肤 | 核心合计 |
|---|---:|---:|---:|---:|
| public fetch | 19 | 23 | 19 | **61** |
| Tavily basic search | 2 | 2 | 2 | **6 credits** |
| Firecrawl 请求 | 5 | 6 | 2 | **13** |
| LLM 请求 | 2 | 2 | 2 | **6** |
| LLM token | 14,575 | 16,452 | 15,673 | **46,700** |

- 没有外层重跑，也没有 JSON 修复请求；所有单品类请求数和耗时都在预注册上限内。
- 按 [DeepSeek 官方定价](https://api-docs.deepseek.com/quick_start/pricing/?article_id=article_1779470751466_8)，29,151 cache-miss input、512 cache-hit input 和 17,037 output 的标价成本为 **$0.0088529336**。
- Tavily Basic Search 每次 1 credit；按 [Tavily 官方 PAYG](https://docs.tavily.com/documentation/api-credits) 的 $0.008/credit 计，6 次最多 **$0.048**，若在免费或套餐额度内则增量现金为 0。
- 可精确估值的 DeepSeek + Tavily 合计上界为 **$0.0568529336**，已知部分显著低于人民币 4 元核心上限。
- Firecrawl 未传 `proxy`，官方默认为 auto；13 次请求理论消耗 0–65 credits，但本地结果未保存 credits/billing。Firecrawl 是额度套餐制而非普通 PAYG，只有账户 Usage/Billing 能证明是否发生充值或新增账单。参见 [Enhanced Mode](https://docs.firecrawl.dev/features/enhanced-mode)、[Pricing](https://www.firecrawl.dev/pricing) 与 [Credit Usage](https://docs.firecrawl.dev/api-reference/endpoint/credit-usage)。

因此，**请求纪律确认通过，人民币现金成本尚不能形式化确认通过，也没有证据显示已经失控**。最小补证是一张覆盖北京时间 2026-07-10 11:21:41–11:28:19 的 Firecrawl Usage/Billing 截图，显示 plan、credits 与是否发生 auto-recharge/新增账单。扩展品类未运行，所以五品类总上限未继续消耗。

### 硬门槛矩阵

| 品类 | ≥3 可信文档 | ≥2 域名 | ≥1 深页 | ≥70% full | 噪音达标 | 无高风险无证据断言 | ≤300 秒 | ≥70 分 | 请求预算 | 人民币成本 |
|---|---|---|---|---|---|---|---|---|---|---|
| 宠物 | PASS | PASS | **FAIL** | **FAIL** | **FAIL** | **FAIL** | PASS | **FAIL** | PASS | 待 dashboard |
| 洗碗机 | **FAIL** | PASS | **FAIL** | **FAIL** | **FAIL** | **FAIL** | PASS | **FAIL** | PASS | 待 dashboard |
| 护肤 | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL** | PASS | **FAIL** | PASS | 待 dashboard |

### 内部修复优先级

1. **P0 · 深层页发现与目标选择**：三个品类深层页都是 0。先检查搜索、registry、sitemap 与 crawl plan 的顺序和配额使用，确保产品、类目、博客/FAQ 真实链接优先于重复首页；不新增搜索 provider。
2. **P0 · 正文清洗**：accepted 文档噪音约 49%–68%。在证据抽取前去除导航、页脚、隐私声明、图片 Markdown target、重复 CTA 和模板菜单，并用本次保存的原文做确定性回放。
3. **P0 · 实体与来源绑定**：洗碗机和护肤都出现 URL、品牌或内容串线。数据库记录必须继承正确 `rawDocumentId`、域名和实体；跨实体 quote 直接拒绝。
4. **P0 · 结论门禁**：partial/unsupported 结论和不可复算机会评分不能进入可交付报告。`acceptedForReport` 与字符串 quote match 只能作为候选，必须同时满足实体一致、非噪音、结论全量支持。
5. **P1 · 离线回归**：优先把三个已保存 run 变成回放样本，验证清洗、实体绑定和结论门禁；在离线指标没有明显改善前，不重新产生付费调用。

内部修复的首轮验收只看四项：是否抓到真实深层页、accepted 噪音是否降到 25% 以下、是否消除实体串线、unsupported 结论是否为 0。它不以新增功能数量或报告篇幅作为进展。

### 商业化结论与冻结建议

验证评级：**Needs revision / 不可对外付费交付**。

1. 立即冻结品类扩展、provider 扩充、数据库、n8n 和新基础设施；可选品类 4–5 不运行。
2. 当前不再推进任何外部验证板块，只修复深层页发现、正文清洗、实体绑定和结论门禁。
3. 优先使用已保存 raw documents 做离线 replay 和测试；不新增 provider 或基础设施，不用更多付费调用重复证明已知失败。
4. 若未来申请解冻，必须先完成内部修复验收，再重新预注册并取得用户预算确认；仍以至少 2/3 核心品类通过相同技术硬门槛为准。

### 复核产物

- 宠物：`outputs/industry-research-benchmarks/evidence-benchmark-v1/evidence-benchmark-v1-pet-probiotics-2026-07-10T03-21-41-336Z/`
- 洗碗机：`outputs/industry-research-benchmarks/evidence-benchmark-v1/evidence-benchmark-v1-dishwasher-2026-07-10T03-24-01-912Z/`
- 护肤：`outputs/industry-research-benchmarks/evidence-benchmark-v1/evidence-benchmark-v1-japan-niche-skincare-2026-07-10T03-26-36-830Z/`

每个目录均包含 `benchmark_run.json`、`raw_documents.json`、`databases.json`、`review_items.json`、`report.md`、`reviewed_report.md`、`manifest.json`、`run_log.json` 与 `input.json`。

## 2026-07-10 内部修复与离线 Replay 收口

### 权限与执行边界

- 用户确认以当前未提交 worktree 为 baseline，并授权 L2-L4 上限；本轮实际只使用 L2，没有 commit、push、部署、生产变更或数据库/n8n 动作。
- 修复收口时 HEAD 仍为 `db1a97c212255cab73b924a995959cf5105af4be`；最终 tracked diff SHA-256 为 `422eb32043a66eb6ca9f2a8bbb0d01bde1819ffdc7ddee5bebd6fd938bd553e3`。该 hash 不包含 Git 未跟踪的新 cleaner/test/replay/benchmark 文件，完整文件清单以 `git status --short` 为准。
- 原 live runner 仍锁定最初 benchmark diff `e7e4...`，在修复后的 worktree 会 fail-closed；本轮没有放宽它或借此触发付费重跑。
- 未读取 `.env.local`，未调用 provider、搜索 API、Firecrawl 或公网；离线 replay 把全局 fetch 设为 fail-closed，任何非 fixture 网络调用都会直接失败。
- 增量 API 成本：**¥0**；provider 请求 0，公网请求 0。
- 真实卖家反馈与付费试单板块已按用户要求取消，不再追踪、外联或作为验收。

### 已完成修复

1. 正文清洗：HTML/Markdown/text 确定性清洗，保留 `originalText`，记录 removed/residual audit。
2. 来源质量：校准宠物益生菌跨语种、洗碗机、日本护肤相关性，并拒绝 Cosmopolitan/Trustpilot 等弱来源冒充官网。
3. 实体绑定：quote 支持 expected rawDocument/source/URL/domain；重复 quote 无唯一绑定时拒绝；结构化数据库只继承自身 evidence。
4. 完整声明门禁：缺失 validation、partial/unsupported、ambiguous 或高风险无直接 quote 的声明不能进入确认区；完整支持的 approved 正向用例仍可确认并输出唯一 rawDocumentId/URL。
5. Provider 隔离：原始自由文本始终与正式 `report.md` 隔离，不再只在零 accepted source 时阻断。
6. 离线 replay：三个原始 benchmark 样例只读回放，输出重清洗文档、修复数据库、finding audit 与统一 scorecard。
7. 深页 fixtures：宠物 product、洗碗机 product、护肤 collection 均在固定 probe cap 内跟随 nested sitemap 并保留正确页型。

### Replay 统一评分表

结果目录：`outputs/industry-research-benchmarks/evidence-repair-replay-v1/evidence-repair-replay-v1-2026-07-10T13-47-38-314Z/`

离线 replay 总耗时 36ms。下表的噪音是“确定性 cleaner 可识别的残余噪音字符 / cleaned chars”，不是新的人工逐字符审计；旧 provider 产物没有保存“同一声明全部 quotes”元数据，因此单条 quote 重放成功仍只能记为 partial，不能追认 full。

| 品类 | 修复后分数 | 可信文档 / 域名 | 保存样例实际深页 | accepted 噪音中位 / 最大 | quote 可复核 | full 可证实 | 原 run 耗时 | 实体串线 | 商业门槛 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 宠物肠胃益生菌 | **50.00/100** | 3 / 3 | 0 | 0.00% / 0.00% | 0/2 | 0/2 | 104.696 秒 | 0 | FAIL |
| 洗碗机 | **46.67/100** | 2 / 2 | 0 | 0.00% / 0.00% | 2/3 | 0/3 | 129.118 秒 | 0 | FAIL |
| 日本小众护肤品牌 | **38.33/100** | 1 / 1 | 0 | 0.00% / 0.00% | 3/3 | 0/3 | 101.720 秒 | 0 | FAIL |

### 内部修复验收与商业结论

内部修复验收为 **PASS / C2**：

- accepted 残余噪音中位数均 ≤25%，无 accepted 文档 >50%；
- 方太、海尔、资生堂 website/source 重绑定后实体串线为 0；
- 确认区 partial/unsupported 和高风险无证据结论为 0；
- 每个可确认正向 fixture 均能输出唯一 rawDocumentId/URL；
- 三品类 deep discovery fixtures 3/3 PASS；
- 离线 replay 0 provider、0 公网请求、¥0。

商业 benchmark 仍为 **0/3 PASS，继续冻结**。原因不是内部修复失败，而是旧保存样例不能补出真实深页，也不能恢复 provider 当时遗漏的声明级 quote 集合；因此没有资格把 full 比例追认到 70%。未来若申请解冻，只能在重新预注册相同核心 3 品类与硬门槛、并取得新的预算确认后受控复跑；仍不得先扩品类、provider、数据库、n8n 或基础设施。
