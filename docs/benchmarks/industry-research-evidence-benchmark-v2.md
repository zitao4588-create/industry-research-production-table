# 行业研究生产台证据质量 Benchmark v2（预注册）

状态：历史预注册，已被 G12 取代。本文只保留证据流水线门槛，不再承担商业去留判断。

## 决策目标

验证 2026-07-10 的正文清洗、实体绑定、完整声明门禁和 2026-07-11 的 Firecrawl Map 受限深页发现，是否足以让相同核心 3 品类达到可对外付费交付的证据门槛。

不扩充品类、provider、数据库、n8n 或基础设施；不恢复真实卖家反馈和付费试单板块。

## 锁定基线

- Git HEAD：`db1a97c212255cab73b924a995959cf5105af4be`
- tracked worktree diff SHA-256：`d86b28ad0e11a326738038f6ef2bd8da0129b3495c48b50d89676c2b24257d36`
- runner 与本预注册文件是新增未跟踪文件，不进入上述 tracked diff hash。
- runner 默认只输出计划；必须同时提供 `--execute` 与精确预算确认值才会联网。
- 每个品类单独执行，不自动重试，不自动继续下一个品类。

## 核心 3 品类与输入契约

保持 v1 完全相同的顺序和 category-only 输入：

1. `宠物肠胃益生菌`
2. `洗碗机`
3. `日本小众护肤品牌`

统一输入：`industry=category=品类词`、`market=线上电商 / DTC`、`researchGoal=找到可切入的产品与内容机会`；URL、CSV、人工文本为空，不读取历史 run。

## 单品类固定预算

| 项目 | 上限 |
|---|---:|
| Tavily Search | 2 请求，每次最多 4 结果 |
| 原生 probe | 8 URL |
| sitemap 选取 | 4 URL |
| Firecrawl Map | 最多 2 站点，每站最多 20 链接 |
| Firecrawl Scrape | 最多 8 请求 |
| 最终 crawl target | 8 |
| public fetch 总数 | 32 |
| DeepSeek LLM | 3 请求 |
| 单次 native / Map 超时 | 8 秒 |
| 单次 Scrape 超时 | 12 秒 |
| 单 run wall time | 300 秒 |

成本纪律按 provider 原生计量拆开：

- Firecrawl 免费套餐当前显示 1000 credits、剩余 979、2026-08-06 刷新；本次方太 Map smoke 在 Activity Logs 中确认成功并消耗 1 credit。
- Firecrawl 每品类最多消耗 50 credits，核心 3 品类累计最多 150 credits。每个品类运行前后必须读取 dashboard 余额并记录差值；超过 50 立即停止。
- 上述 50/150 是基于当前固定请求上限和 dashboard 历史记录制定的保守积分门禁，不是人民币金额。Firecrawl 响应不返回 credits 时，以 dashboard Activity Logs 与余额为准。
- DeepSeek 等实际付费 provider 仍单独受核心 3 品类增量费用 ¥4 上限约束；不得把 Firecrawl credits 换算或混记成人民币成本。
- 用户已在 Chrome 登录 Firecrawl Usage 和 DeepSeek Usage 控制台；后续可在每个 run 前后只读核对 credits、余额、累计消费、请求数和 tokens。不得读取或保存 cookie、密码、API key 等登录凭据。

## 统一评分与技术硬门槛

评分仍使用 v1 的 100 分表，不因代码修复修改权重：来源覆盖与深度 30、可证实结论 30、正文纯净度 15、决策可用性 10、运行稳定性 10、API 成本纪律 5。

单品类必须同时满足：

1. 人工确认至少 3 份可信文档、至少 2 个独立品牌域名。
2. 至少 1 份产品、类目、博客或 FAQ 深层页面。
3. 完整可证实结论比例至少 70%。
4. accepted 文档正文噪音中位数不超过 25%，且单份不超过 50%。
5. 不含无证据的销量、份额、转化率、排名等高风险量化结论。
6. 单 run 不超过 300 秒，总分至少 70。
7. 不突破请求数、Firecrawl credits 和其他付费 provider 的独立上限。

## Kill rule

- 任一请求、Firecrawl credits、其他付费 provider 费用或 wall-time 上限失控：立即停止，不运行下一品类。
- 前两个核心品类均 FAIL：即使第三个通过也无法达到 2/3，停止后续付费调用。
- 核心 3 品类少于 2 个 PASS：证据流水线记为 blocked，不扩品类或基础设施。
- 只有至少 2/3 PASS，才进入下一阶段；下一阶段也只允许做交付包装和真实使用流程，不以新增 provider 掩盖证据问题。

## 证据流水线判定

- `0/3` 或 `1/3 PASS`：`evidence_pipeline_blocked`；商业化 `not_evaluated`。
- `2/3 PASS`：`evidence_pipeline_needs_adjustment`；仍不能声称已有商业需求。
- `3/3 PASS`：可进入小规模真实使用验证；本轮已取消的卖家反馈和付费试单不会自动恢复，必须由用户另行决定。

## 结果记录

每个 run 写入 `outputs/industry-research-benchmarks/evidence-benchmark-v2/<runId>/`，至少包含输入、raw documents、数据库、review items、报告、manifest、run log 和 `benchmark_run.json`。统一人工审计在全部允许的核心 run 完成后追加到本文件，不回写或覆盖 v1 结果。

## 核心运行结果

### 1. 宠物肠胃益生菌 — FAIL

- Run：`evidence-benchmark-v2-pet-probiotics-2026-07-10T23-40-00-420Z`
- 耗时：139.295 秒。
- 请求：public 23（Tavily 2、Firecrawl Map 2、Firecrawl Scrape 8、native 11）；DeepSeek 2 请求、23,150 tokens。
- Firecrawl：979 → 973，实际消耗 6 credits，未超过单品类 50 credits。
- DeepSeek：余额 ¥8.28 → ¥8.25、累计消费 ¥21.71 → ¥21.74，实际消耗 ¥0.03；控制台新增 2 请求 / 23,150 tokens，与 runner 两笔 usage 完全一致。
- Map：2 个站点中 1 成功、1 超时，返回 17 个证据型深页候选；实际进入 accepted 证据的真实深页为 Zesty Paws FAQ。

人工去重后为 4 份可信文档、3 个品牌域名、1 个真实深页：Zesty Paws 首页、Zesty Paws FAQ、Native Pet 首页、Honest Paws 首页。规则层的 5 份 accepted 包含 `zestypaws.com` 与 `www.zestypaws.com` 重复；根首页还曾因 Map metadata 被误标为 collection，因此硬门槛只采用人工 canonical 结果。

人工保守正文噪音率：Zesty Paws 首页 37.28%、FAQ 11.58%、Native Pet 首页 2.02%、Honest Paws 首页 7.54%；中位数 9.56%，最大值 37.28%，噪音门槛通过。自动 cleaner 的 residual ratio 低估了残留导航、购物车、图片 alt 和重复 CTA，因此这里只采用人工行级标注结果。

正式 `review_items` 共 6 条：3 个竞品定位均没有 evidenceId；3 个机会中 2 个没有 evidenceId，1 个只有 1/2 quote 且 `claimSupportComplete=false`。完整可证实结论为 **0/6 = 0%**。正式报告把它们全部留在 needs_review，没有把销量、份额、转化率或排名当作已确认事实交付。

| 维度 | 得分 | 说明 |
|---|---:|---|
| 可信来源覆盖与页面深度 | 25.00/30 | 4 可信文档、3 域名、1 深页 |
| 报告可证实结论比例 | 0.00/30 | full 0/6 |
| 正文纯净度 | 13.57/15 | 人工噪音中位数 9.56% |
| 决策可用性 | 0.00/10 | 没有 2 个 fully supported 竞品比较和 2 个 fully supported 机会 |
| 运行稳定性 | 10.00/10 | 139.295 秒 |
| API 成本纪律 | 5.00/5 | Firecrawl 6 credits、DeepSeek ¥0.03，请求与成本均未超上限 |
| **总分** | **53.57/100** | **FAIL** |

硬门槛：可信文档 PASS、品牌域名 PASS、深页 PASS、噪音 PASS、高风险断言门禁 PASS、耗时 PASS、请求/credits/费用 PASS；**full ≥70% FAIL、总分 ≥70 FAIL**。由于只有第一品类 FAIL，尚未触发“前两个均 FAIL”的提前停止规则，可以运行第二品类。

### 2. 洗碗机 — FAIL / 触发 Kill Rule

- Run：`evidence-benchmark-v2-dishwasher-2026-07-10T23-47-33-826Z`
- 耗时：184.681 秒。
- 请求：public 27（Tavily 2、Firecrawl Map 2、Firecrawl Scrape 8、native 15）；DeepSeek 2 请求、28,680 tokens。
- Firecrawl：973 → 971，实际消耗 2 credits；核心两品类累计 8 credits。
- DeepSeek：运行前余额 ¥8.25、累计消费 ¥21.74；最终 dashboard 差值待控制台延迟刷新。
- Map：2 个站点中 1 成功、1 超时，返回 13 个证据型深页候选；规则层把海尔 `/cn`、方太 `/news` 计作非根路径，但人工复核后没有一份合格的产品、类目或 FAQ 深页。

规则层 5 份 accepted 中，海尔 `/cn` 与 `/cn/` 是同一页面；方太 `/news` 只有搜索、导航、客服与页脚壳，不计可信业务文档。人工口径为海尔首页、方太首页、西门子首页共 3 份可信文档、3 个品牌域名、0 个真实深页。

人工保守正文噪音率：海尔首页 62.67%、方太首页 4.60%、西门子首页 20.03%；中位数 20.03%，但海尔单份超过 50%，噪音硬门槛 FAIL。海尔正文主要是重复全站品类导航、账户/搜索入口和无关产品卡，自动 cleaner 的 residual=0 明显低估噪音。

正式 `review_items` 共 6 条。海尔竞品记录只确认 1/3 quotes；方太/西门子的 quote 能支持品牌与部分定位，但不能完整支持记录中的市场和渠道字段。三个机会均把品牌宣传外推为用户需求、内容缺口或市场普及度，其中一条 quote 不完整，另外两条虽字符串匹配完整但缺少直接需求证据。完整可证实结论为 **0/6 = 0%**。`99% 去农残`等量化内容仍处于 needs_review，未进入已确认结论。

| 维度 | 得分 | 说明 |
|---|---:|---|
| 可信来源覆盖与页面深度 | 20.00/30 | 3 可信文档、3 域名、0 深页 |
| 报告可证实结论比例 | 0.00/30 | full 0/6 |
| 正文纯净度 | 12.00/15 | 中位数 20.03%，但单份最大 62.67% |
| 决策可用性 | 0.00/10 | 没有 fully supported 的可执行机会 |
| 运行稳定性 | 7.00/10 | 184.681 秒 |
| API 成本纪律 | 0.00/5 | Firecrawl 2 credits 已确认；DeepSeek dashboard 尚未刷新，按预注册口径暂不计分 |
| **保守总分** | **39.00/100** | **FAIL；成本确认后的理论最高 44.00** |

硬门槛：可信文档 PASS、品牌域名 PASS、耗时 PASS、请求/Firecrawl credits PASS、DeepSeek 人民币成本待 dashboard；**深页 FAIL、full ≥70% FAIL、单份噪音 ≤50% FAIL、总分 ≥70 FAIL**。

前两个核心品类均 FAIL，已经不可能达到至少 2/3 PASS。按预注册早停规则，第三个「日本小众护肤品牌」不运行，后续付费/API 调用停止；该结果只表示证据流水线 blocked，商业化未评估。
