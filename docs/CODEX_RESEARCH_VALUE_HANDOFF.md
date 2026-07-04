# Codex 交接文档 · 从「基建闭环」到「有料的持续行业情报」

> **更新时间**：2026-07-04
> **受众**：Codex / 接手下一阶段的开发者
> **性质**：2026-07-04 全面审查（Claude Code）之后排出的下一阶段执行清单。审查范围：全部根目录状态文档、核心包与 API 源码、安全模块、Supabase migration、CI、测试，以及最近一次真实 `public_web` run 的交付包。
> 任务格式沿用本仓库交接惯例：**现象 / 为什么 / 怎么做 / 落点 / 验收**。动手前必读根目录 `AGENTS.md`、`DECISIONS.md`、`BUG_NOTES.md`；完成的项按惯例回写 `TODO.md` / `PROJECT_CONTEXT.md`。

---

## 1. 一句话现状（最重要的认知）

**工程基线已经闭环且全绿，但研究产出近乎空转。**

已验证的事实（2026-07-04 本机复测）：

- `pnpm check` 通过：workspace typecheck + 36 条 Vitest + Biome 73 文件。
- 生产闭环已完成：CI、SSE 安全边界、Supabase 权威运行库（service-role-only）、zvec 增量索引、n8n 四态 workflow、轻量服务器部署与 health 全部就绪（见 `PROJECT_CONTEXT.md` 2026-06-29 各节）。
- **但最近一次真实 run（`outputs/industry-research-runs/v03-public-web-smoke-2026-06-29T07-24-34-465Z/`）的产出是：3 个 raw documents、1 条 evidence、九类数据库中 8 类为 0 条**（只有 source_database 有 6 条），weekly_intelligence_reports 在真实模式下从未产出过内容。

这不是 bug，是三个结构性缺口（见 §2）。本项目的立项方法论来自《如何用 Codex 在 1 小时内进入一个陌生行业（完整版）》（PRD `docs/prds/ecommerce-competitor-research-prd.md` §4 有摘录），其核心主张是「把零散信息整理成**持续生长**的行业认知体系，从搜索模式切换到订阅模式」。当前仓库把 20% 的基建做到了 120 分，但 80% 的研究价值还停在 10 分。**下一阶段所有投入用一个问题过滤：这能让下一份报告更有料，或者让情报持续更新吗？**

## 2. 三个结构性缺口（本清单要解决的问题）

| # | 缺口 | 证据 | 对应任务 |
|---|------|------|----------|
| G1 | **没有可用 LLM provider，抽取链路整体停摆**。九库中竞品/产品/痛点/内容/机会全部依赖 LLM 结构化抽取才有内容 | 服务器实测 `pnpm probe:9router` → `no_usable_model_found`（`BUG_NOTES.md`）；lean 路径不凭空生成实体（`database-builder.ts:134`） | D1 + T1、T2 |
| G2 | **采集面窄到喂不饱抽取**。真实模式只抓用户 URL + 首页/robots/sitemap 保守探测；搜索发现默认 1 个 query 取 3 个结果，用 DuckDuckGo HTML 抓取（脆弱）；社媒/Amazon 全部在排除名单里，content/pain_point 两库**结构性为空** | `public-source-discovery.ts:40-43`（defaults）、`:65-80`（ignoredCandidateHostnameParts） | D2、D3 + T3、T4、T5 |
| G3 | **「订阅模式」没有建成**。每个 run 是孤岛：无定时触发、无跨 run diff、周报在真实模式恒为空数组、zvec 索引了历史 run 却没有任何链路喂回新 run | `database-builder.ts:185`（lean 恒 `weekly_intelligence_reports: []`）；n8n 只有被动 webhook 无 cron | T6、T7、T8 |

## 3. 硬约束（不要踩的线）

来自 `AGENTS.md` / `DECISIONS.md` / `BUG_NOTES.md`，违反会引发返工或安全问题：

1. **始终用中文沟通**；不提交 `.env.local` 或任何 API Key；改代码后跑 `pnpm check`。
2. **诚实性设计不可破坏**（本项目最大卖点）：真实 lean 模式采集不到就是稀疏，**绝不允许为了「让九库好看」在真实模式凭空生成实体**；rich demo 数据只准存在于 Mock（DECISIONS 2026-06-25）。`validateEvidenceQuotes` 的 quote 回溯校验不可绕过：不匹配/低质量来源的结论只能进 `needs_review` / `rejected`。
3. **public_web 合规边界**：只抓公开 http/https，不绕登录/验证码/付费墙，不采集私人数据；社媒类数据只准走**官方 API**（T5），不准爬。
4. **生产/付费交付不用免费 provider**（9router free 已实测不可用，别再把它放回默认路径）。
5. 不做登录/支付/多租户；不默认长跑 `pnpm dev`（机器发热，BUG_NOTES 有记录），验收用 `pnpm check`，看 UI 用 `pnpm build && pnpm start` 短点检。
6. **部署纪律**：轻量服务器 `/opt/playgamelab/industry-research` 不是 git checkout，只能非删除式 rsync + 先备份（DECISIONS 2026-06-29）；n8n workflow JSON 入库 ≠ 自动导入生产 n8n，导入是单独动作需用户确认。**Codex 不要主动 SSH 部署或导入 workflow**，只准备好代码和脚本。
7. `zvec:index` 默认不跑 optimize（显式 `--optimize` 才跑）；zvec 是可重建缓存不是权威存储；写入需独占锁，勿并行 index+search。
8. 前端架构边界：`adapters/research.ts` / `adapters/run-events.ts` 不动，渲染层只认 UI 模型；`globals.css` 类名是契约不重命名。
9. 对外 run mode 只有 `public_web` / `public_web_llm` / `llm_only`，legacy 别名只做兼容；provider 信息一律走 `runMetadata` 结构化字段。

## 4. 需要用户决策的前置项（Codex 不要自作主张）

这三项涉及注册账号、付费和密钥，**必须等用户提供后再接线**。没有 key 时按各任务的「无 key 降级」先做代码侧（fetcher/client 都支持注入，可用 fixture 测试）。

- **D1 · 自付费 LLM provider**（阻塞 T1/T2，进而阻塞一切研究产出）
  候选：DeepSeek 官方 API / 硅基流动 / GLM / 任意 OpenAI-compatible 服务，预计每 run 只有数次 chat 调用，月成本个位数美元。
  配置位：本地 `.env.local`；服务器 `/opt/playgamelab/industry-research/industry-research.env`（root:600，改动前先备份，有双 JWT 粘贴事故先例见 BUG_NOTES）。
  变量：`AGENT_FACTORY_LLM_API_KEY` / `AGENT_FACTORY_LLM_BASE_URL` / `AGENT_FACTORY_LLM_MODEL`。
  验证：`pnpm verify:9router`（脚本名历史遗留，实际是通用 OpenAI-compatible 验证）。
- **D2 · 搜索 API**（T3）：推荐 Brave Search API（有免费档）或 Serper；自建 SearXNG 也可。
- **D3 · 内容生态官方 API**（T5）：YouTube Data API v3（免费配额）、Reddit API。RSS 不需要 key，可先行。

## 5. 任务清单

### 🔴 P0 · 打开闸门：真实 LLM 链路验收

**T1 · provider 接入 + 一次真实品类完整 run**（依赖 D1）

- 现象：LLM 抽取/报告节点代码已就绪（`glm-client.ts` / `glm-extraction.ts` / `glm-workflow.ts`）但从未用可用 provider 跑通过真实品类。
- 为什么：这是所有后续价值的闸门；在此之前任何基建投入都是给空管道加压。
- 怎么做：配置 D1 的 env → `pnpm probe:9router`（如走 9router）或直接 `pnpm verify:9router` → 用真实品类跑 `public_web_llm`（建议 PRD 里的「宠物肠胃益生菌 / 宠物健康电商 / 美国 DTC」）→ 人工检查九库填充质量、证据 quoteMatched 比例、报告三层结构是否言之有物。
- 落点：env only + `scripts/verify-9router-industry-research.ts`；如发现抽取质量差，调 `glm-extraction.ts:196-275` 的 prompt（当前 schema 约束齐全，但对「拆同行赚钱方式」“机会评分理由”等深度指令偏薄）。
- 验收：一次真实品类 run 交付包 8 文件齐全；competitor/product/keyword/pain_point/content/opportunity 六库均非空且证据可回溯（`quoteMatched=true` 占比 ≥ 80%）；`runMetadata` 记录 provider/model；Supabase run + artifacts 写入成功；`pnpm check` 绿。

**T2 · 抽取改分批 map-reduce，防 context 溢出**

- 现象：`glm-extraction.ts` 一次性把全部 raw documents 塞进单个 JSON 抽取请求（`:272` `createExtractionInput(dataset)`）。
- 为什么：T3/T4 扩大采集面后（raw docs 从 3 涨到 30+）单请求必撞 context 上限或质量骤降。
- 怎么做：按 raw document 分批（每批按字符预算，如 ~24k chars）各自抽取 → 合并去重（竞品按 name 归一，关键词/痛点按文本相似归并）→ 合并后统一走 `validateEvidenceQuotes`。批次失败单独降级，不拖垮整轮。
- 落点：`packages/industry-research/src/glm-extraction.ts`（新增 batch 切分与 merge 函数）；测试进 `index.test.ts` 或新文件，用注入 fetch 的 fixture 模拟多批返回。
- 验收：≥2 批的 fixture 测试通过（含一批失败的降级 case）；单批行为与现状等价；`pnpm check` 绿。无 key 可完整实现（client 支持注入 fetch）。

### 🟠 P1 · 扩采集面，让抽取有料可吃

**T3 · 搜索 provider 抽象 + 正规 API 接入**（依赖 D2）

- 现象：`public-source-discovery.ts:40-43`：`defaultMaxSearchQueries = 1`、每 query 3 结果、endpoint 是 `https://duckduckgo.com/html/`（HTML 抓取，随时被验证码拦）。
- 为什么：发现层是整个漏斗的入口；入口只有 3 个候选，后面全是无米之炊。
- 怎么做：抽 `SearchProvider` 接口（`search(query) → {url,title,snippet}[]`）；实现 Brave/Serper 适配器（env 配 key + endpoint），DDG HTML 降级为无 key fallback；`maxSearchQueries` 提到 3–5（`createSearchQueries` 已经生成 3 条 query，只是被上限截断）。
- 落点：`packages/industry-research/src/public-source-discovery.ts`；env 变量新增走 `apps/studio/src/app/api/industry-research/_lib/server-env.ts` 与 `.env.example`。
- 验收：注入 mock fetcher 的单测覆盖新 provider 解析与 fallback；无 key 时行为与现状一致；真实 key 冒烟由用户在服务器执行。

**T4 · sitemap/页面深抓的保守上限上调 + 礼貌控制**

- 现象：真实模式每域基本只碰 首页/robots/sitemap，`defaultMaxSitemapUrls = 12`、`maxPages: 1`，collection/product/blog 极少真正入抓。
- 为什么：竞品官网的 collection/product/blog 页才是「拆赚钱方式」的原料；RSS 解析链路其实已存在（`public-crawl-adapter.ts:153-192`），只是喂不进 URL。
- 怎么做：把 sitemap 中按 kind 分类后的 collection/product/blog 配额提高（如每域每类 3–5 页）；加每域串行 + 请求间隔（≥1s）与总页数硬上限（如 40）护栏；robots 不允许的路径继续跳过。
- 落点：`public-source-discovery.ts`（发现配额）、`public-crawl-adapter.ts`（抓取节流）。
- 验收：fixture 测试覆盖配额与节流分支；用 1–2 个真实 Shopify 站冒烟（用户提供或 PRD 示例），raw documents 明显增多且 sourceQuality 分级合理；guardrails 文案同步更新。

**T5 · 内容生态源：先 RSS（无 key），后官方 API**（后半依赖 D3）

- 现象：`ignoredCandidateHostnameParts`（`public-source-discovery.ts:65-80`）把 YouTube/TikTok/Reddit/Amazon 等全部排除——这恰是原文方法论价值最高的「内容生态/痛点/爆款模式」来源；content_database 与 pain_point_database 真实模式结构性为空。
- 为什么：合规上不爬社媒是对的，但官方 API 是被允许的路径；不补这块，报告永远缺内容打法和用户痛点两个维度。
- 怎么做：第一步（无 key）：行业媒体/竞品 blog 的 RSS 作为一等发现来源，发现的 feed URL 直接进 crawl plan（链路已支持）。第二步（D3 后）：新增 `content-api-adapter`，YouTube Data API 搜品类关键词取 top 视频（标题/描述/统计）、Reddit API 搜相关 subreddit 热帖，产出为带 `sourceQuality` 的 RawDocument，喂给现有抽取管道。
- 落点：`public-source-discovery.ts`（RSS 候选权重）；新文件 `packages/industry-research/src/content-api-adapter.ts`；`types.ts` 的 `SourceDiscoveryMethod` / `SourceQualityType` 需扩展枚举（Supabase 相关列是 text，无 schema 迁移风险）。
- 验收：RSS 路径用 fixture 测试 + 真实行业媒体 feed 冒烟后 content_database 非空；API 路径 fixture 测试齐全，真实调用留给带 key 环境。

### 🟠 P1.5 · 订阅循环：兑现「从搜索模式到订阅模式」（代码侧无外部依赖，可与 P1 并行）

**T6 · 跨 run diff → 真实周报**

- 现象：`weekly_intelligence_reports` 类型/表/报告节齐全，但真实模式恒为空数组（`database-builder.ts:185`）。
- 为什么：这是原文的核心升华点，也是把产品从「一次性报告工具」变成「行业情报系统」的那一步。
- 怎么做：新增 diff 模块：按项目归一 key（industry+category+market 规范化）找上一次 run（Supabase 优先、本地交付包 fallback，读取逻辑复用 `_lib/supabase-run-store.ts` / `_lib/local-runs.ts` 的模式），对两次 `databases.json` 做集合 diff（新增/消失的竞品、产品、关键词、内容源、机会分变化）→ 生成 `WeeklyIntelligenceReportEntry`（`newSignals` / `watchList`）→ 报告新增「本期新增与变化」节。首次 run 无基线时明确写「本期为基线，无对比」。
- 落点：新文件 `packages/industry-research/src/run-diff.ts`；接入 `delivery-run.ts` 的组装处；注意 core 包不能依赖 studio 的 `_lib`，读取上一 run 的 I/O 通过参数注入（`previousDatabases?: …`），由调用方（run-core / 脚本）负责取数。
- 验收：diff 纯函数单测（新增/删除/变分/空基线四类 case）；同品类连续两次真实 run 后周报库非空且内容与 diff 一致；lean 诚实原则不破坏（diff 只基于真实数据）。

**T7 · n8n 定时 re-run workflow（每周）**

- 现象：n8n 只有被动 `POST /webhook/industry-research/intake`，无定时触发。
- 怎么做：新增 `workflows/n8n/industry-research-weekly-rerun.json`：Schedule Trigger（每周一）→ 读一份「订阅品类清单」（第一版直接内嵌 workflow 参数即可）→ 逐个 POST intake webhook（复用现有 Header Auth credentials 与四态事件）。同步写接线说明进 `workflows/n8n/` 的 README。
- 落点：`workflows/n8n/`；**只入库不导入**（硬约束 §3.6），导入/激活由用户按 DECISIONS 2026-06-29 的同 id 流程操作。
- 验收：JSON 结构测试（对齐根目录 `production-hardening.test.ts` 的合约测试写法：四态字段、不含 secret）；文档含导入步骤与回滚说明。

**T8 · zvec 历史认知回灌新 run**

- 现象：zvec 已索引全部历史 run（服务器 8 run / 202 chunks），但检索逻辑只活在 `scripts/zvec-*.ts`，产品链路完全没消费它。
- 怎么做：把 scripts 里的检索逻辑抽成可复用模块（建议 `scripts/lib/zvec-search-core.ts` 或独立小包，core 包不硬依赖 `@zvec/zvec`）；LLM 抽取阶段用品类关键词检索同品类历史 top-N chunks，作为「历史研究上下文」拼进 prompt，并要求模型把「与历史结论的变化」写进 summary；报告标注历史来源 runId。
- 落点：`scripts/zvec-search-industry-research.ts`（抽逻辑）、`glm-extraction.ts` / `run-core.ts`（注入点，同样走参数注入保持 core 纯净）。
- 验收：注入 fixture 上下文的抽取测试；真实链路在 zvec 不可用时静默降级为无历史上下文（不让 run 失败）；zvec 单写锁约束不被破坏。

### 🟡 P2 · 工程收尾

**T9 · run-security 单测补盲**：`_lib/run-security.ts` 零测试。覆盖：token 一次性消费/过期/缺失、Host/Origin 白名单、生产 POST 缺 Origin 拒绝、限流窗口、body 上限（header 谎报 + 实际超限两条路径）、`sanitizeRunError` 脱敏。纯函数 + Request 构造即可，无需起服务。验收：新测试文件进 vitest，`pnpm check` 绿。

**T10 · 部署脚本固化 runbook**：部署漂移咬过一次（服务器缺 `SimpleResearch.tsx`，PROJECT_CONTEXT 2026-06-29）。把文档里的手工流程固化为 `deploy/lightweight-server/deploy.sh`：git archive HEAD → 备份 `.deploy-backups/` → 非删除式 rsync（排除清单照抄 DECISIONS 2026-06-29：`.git`、`industry-research.env*`、`node_modules`、构建缓存、运行输出、本地工具目录）→ `pnpm install --frozen-lockfile` → `pnpm build` → doctor 三件套 → `systemctl restart industry-research.service` → health 检查。**脚本只编写与 dry-run，真实执行留给用户。**验收：`--dry-run` 模式输出完整计划；排除清单有测试或至少在脚本内注释对齐 DECISIONS。

**T11 · 仓库卫生**：`overview.md`、`remotion-videos/`、`.claude/`、`.codebuddy/`、`.workbuddy/` 长期 untracked。建议：`remotion-videos/`（营销视频源码）与 `overview.md` 提交入库；工具目录进 `.gitignore`。与用户确认后执行。

**T12 · DECISIONS 补记单进程假设**：`run-security.ts:17-18` 的一次性 token 与限流桶是内存 Map，依赖「单 systemd 进程」部署形态；多实例/重启会静默失效。在 `DECISIONS.md` 记一条，防止未来扩容时踩坑。

### 🟢 P3 · 真实用户验证（用户主导，非代码任务）

P0+P1 完成后：找 1–3 个电商卖家用真实品类各跑一轮，以「这份报告你愿不愿意付 X 元」为验收。Codex 的职责只是保证 run 质量与稳定性；在此之前**不要**继续加基建。

## 6. 建议执行顺序

```
T2（无 key 可做）→ T9 → T6 ┐
                          ├→ [用户提供 D1] → T1 → T5-RSS → T4 → T3(D2) → T5-API(D3) → T7 → T8 → T10/T11/T12 穿插
（以上三项零外部依赖，先行）┘
```

原则：每完成一项跑 `pnpm check`；涉及真实网络/密钥的冒烟只在带 key 环境（本地 `.env.local` 或服务器）做，并在结果里如实区分「fixture 验证」与「真实冒烟」。

## 7. 验证命令速查

```bash
pnpm check                 # typecheck + vitest + biome（每次改码后必跑）
pnpm build                 # Next 生产构建
pnpm sample:public-web     # 无 LLM 低负载冒烟，写 outputs/industry-research-runs/<runId>/
pnpm probe:9router         # 9router free 候选真实探测（需 key，无 key 明确 skip）
pnpm verify:9router        # OpenAI-compatible provider 真实验证（需 key）
pnpm supabase:doctor       # Supabase env/表只读检查（本机无 key 时 disabled 是预期）
pnpm zvec:index / zvec:search --query=…   # 本地检索缓存（勿与写入并行）
pnpm server:doctor         # 服务器 env/目录/端口检查
```

## 8. 完成后的回写要求（仓库惯例）

- 每完成一项：`TODO.md` 勾选并记验证结果；重要取舍写进 `DECISIONS.md`（决策/原因/影响三段式）；踩坑写 `BUG_NOTES.md`（现象/原因/处理/验证）。
- 阶段收口：更新 `PROJECT_CONTEXT.md` 的「当前真实状态」与「验证结果」，注明哪些是本机 fixture 验证、哪些是服务器真实冒烟——**不要把 fixture 通过写成生产已验证**（这个项目的文档可信度是靠这条纪律撑起来的）。
