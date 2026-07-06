# 决策记录

更新时间：2026-07-06

## 2026-07-06：交互式 public_web run 使用保守预算，避免 UI 180 秒超时

- 决策：`runPublicIndustryResearchWorkflow` 在 workflow 层解析 `AGENT_FACTORY_PUBLIC_WEB_MAX_*` 预算变量，并把预算传给 source discovery 和 crawler；默认交互预算收敛到小步可完成的一轮研究。生产 Firecrawl 单页超时从 30000ms 降到 12000ms。
- 原因：Tavily + Firecrawl 接入后，默认发现 32 目标、24 probe、20 sitemap URL、60 crawl target 的配置适合批处理/深度采集，但对同源 SSE 交互式运行过重，会触发 `run_timeout_after_180000ms`。
- 影响：
  - 输入品类后能优先完成一轮公开证据扫描，不再把 UI 卡死在 `crawl_sources`。
  - 深度采集仍可通过 env 调大预算，不需要改代码。
  - 这是完成性优先的预算，不代表报告质量已经达到可收费交付标准。

## 2026-07-06：搜索发现先过滤明显平台/门户，不把它们当品牌官网候选

- 决策：在候选 URL 过滤层排除中国常见电商平台、门户、百科/问答和内容社区域名，并把默认 query 改得更偏「品牌官网 / official brand website / 竞品」。
- 原因：真实线上 run 发现 `jd.com`、`sohu.com` 会进入 evidence，虽然流程可回放，但对竞品研究价值低，且与“优先品牌/商家官网”的 agent 抓取策略不一致。
- 影响：
  - 明显平台/门户不再进入默认候选来源。
  - 这只是第一层过滤；`wabei.cn` 这类资讯/财经站仍可能被误判，需要后续加严 `sourceQuality`。

## 2026-07-06：本轮不擅自把 UI 默认模式从 public_web 切到 public_web_llm

- 决策：虽然 public_web lean 模式会导致竞品/机会为 0，本轮仍保持 `SimpleResearch.tsx` 的 `DEFAULT_MODE = "public_web"`，只记录为待决策项。
- 原因：切到 `public_web_llm` 会改变成本、运行时间、失败模式和 SSE timeout 假设；这不是单纯 bugfix，而是产品/成本决策。
- 影响：
  - 当前线上按钮可稳定完成公开证据扫描和分享回放。
  - 若用户目标是“直接可交付竞品研究”，下一步应明确切 `public_web_llm` 或新增「深度研究」模式，并同步处理 timeout、成本提示、失败兜底和结果质量验收。

## 2026-07-06：UI 统一版上线后根路由直接进入行业研究

- 决策：部署 Claude UI 统一版后，`/` 不再渲染旧浅色说明页，改为 Next.js `redirect("/industry-research")`；`/industry-research` 是唯一产品入口。
- 原因：用户明确不要演示和双轨体验，交接文档也把旧首页列为与新深色研究体验不一致的 D3 项；保留旧首页会让线上入口产生风格和信息架构漂移。
- 影响：
  - 根域名访问直接进入可用的电商竞品研究流程。
  - 不新增登录、支付、多租户、数据库或新后端。
  - 不影响 `/industry-research?run=<runId>` 分享回放。

## 2026-07-06：用户确认后删除不可达旧控制台

- 决策：在用户明确确认后，删除不可达的 `IndustryResearchWorkbench.tsx` 及其独占依赖 `components/EvidencePopover.tsx`、`components/micro.tsx`、`fixtures/research-console.ts`。
- 原因：线上已统一为 `SimpleResearch` 单一简化体验，旧控制台无 import 路径；保留会增加维护噪音和误判风险。删除前已先用 `rg` 盘点引用，确认应用代码没有依赖。
- 影响：
  - 当前线上用户不会看到高级模式或旧控制台。
  - 设计交接/porting 文档里的历史参考文件保留不动；应用运行面只保留真实可达代码。

## 2026-07-06：搜索 API 新增 Tavily，Brave 不再作为推荐路线

- 决策：`AGENT_FACTORY_SEARCH_PROVIDER` 新增 `tavily`，与现有 `serper` / `duckduckgo_html` 共存；`brave` 只保留兼容，不再作为推荐配置。
- 原因：Tavily 官方免费档提供 1,000 API credits/month 且不需要信用卡；Search endpoint 直接返回 `results[].url` 和摘要，适合当前“发现候选公开 URL → 再按 robots/配额保守采集”的架构。Serper 仍保留作 Google SERP 备选。Google Custom Search 官方已标注不对新客户开放，不能作为新配置建议。Reddit 官方政策对商业使用和研究用途有额外权限要求，不能当作普通免费数据源默认启用。
- 影响：
  - 服务器可用 `AGENT_FACTORY_SEARCH_PROVIDER=tavily` + `AGENT_FACTORY_SEARCH_API_KEY=<tvly key>` 切换搜索发现。
  - Tavily 调用固定 `search_depth=basic`、`include_answer=false`、`include_raw_content=false`，控制免费 credits 消耗和响应体大小。
  - 无 key 或 Tavily 调用失败时仍按既有逻辑降级到 `duckduckgo_html`。

## 2026-07-06：Firecrawl 只作为公开页面正文抽取增强，不替代搜索发现

- 决策：新增 Firecrawl SDK 依赖和 REST scrape 包装层；`public_web` 在 `homepage` / `collection` / `product` / `blog` 目标上可先尝试 Firecrawl `/v2/scrape` 抽取 Markdown 正文，`robots` / `sitemap` / `rss` 仍走原生 fetch。Firecrawl 失败或无 key 时自动回退原生 fetch，不让外部服务失败阻塞整轮研究。
- 原因：Tavily/Serper 适合发现候选 URL，Firecrawl 更适合把公开页面抽成干净正文；但 Firecrawl 不应做站点级 crawl、交互动作、登录态访问或绕过限制，否则会突破当前 public_web 合规边界。
- 影响：
  - 配置位：`AGENT_FACTORY_FIRECRAWL_ENABLED`、`AGENT_FACTORY_FIRECRAWL_API_KEY`、`AGENT_FACTORY_FIRECRAWL_BASE_URL`、`AGENT_FACTORY_FIRECRAWL_TARGET_KINDS`、`AGENT_FACTORY_FIRECRAWL_TIMEOUT_MS`。
  - 本机和生产已配置 Firecrawl API key 并启用 `AGENT_FACTORY_FIRECRAWL_ENABLED=true`；密钥只写入 `.env.local` 和服务器 env，不进入 Git。
  - 曾实测 Firecrawl keyless scrape 返回 403，因此不依赖无 key 模式。
  - Agent prompt 和 crawl guardrails 明确优先抓品牌/商家官网首页、collection、product、blog/FAQ/reviews/testimonials；社媒和 marketplace 页面默认排除，内容生态只走官方 API。

## 2026-07-05：生产 LLM provider 确定为自付费 DeepSeek 官方 API

- 决策：`AGENT_FACTORY_LLM_*` 指向 DeepSeek 官方 API（`https://api.deepseek.com` / `deepseek-v4-flash`），本机 `.env.local` 已配置（key 来自 agent-factory 时期已有的付费账号）。9router free 路线继续只作探索，不进生产。
- 原因：服务器实测 9router `no_usable_model_found`；DeepSeek 官方 API 每 run 只有数次 chat 调用，成本可忽略；`resolveOpenAICompatibleConfig` 本就以 `AGENT_FACTORY_LLM_*` 为最高优先级，无需改代码。
- 影响：
  - 真实品类完整 run（宠物益生菌/美国 DTC）已在本机跑通：九类数据库全部非空、证据 quoteMatched 100%。
  - 服务器启用时，只需把同样三个变量写入 `/opt/playgamelab/industry-research/industry-research.env`（改前先备份，防止再发生双 JWT 粘贴事故）。

## 2026-07-05：生产 rollout 脚本按真实服务器行为加固

- 决策：本轮 R1-R6 执行时，保留原有「默认 dry-run、非删除式 rsync、密钥不回显」边界，同时把脚本按实际失败点补硬：Bash 文案变量用 `${...}` 防中文标点误解析；远端 Docker 操作用 `sudo -n docker`；deploy 公网 health 增加短重试。
- 原因：R2 dry-run 暴露了 Bash locale + `set -u` 的变量名问题；R1 暴露 `ubuntu` 无 Docker socket 权限；R3 暴露服务刚重启后的公网 502 race。
- 影响：后续同类 rollout 不应再因为脚本文案、Docker 权限或瞬时 health race 中断；真实业务失败仍继续按「失败即停、查证据、记 BUG_NOTES」处理。

## 2026-07-05：n8n 周报 smoke 以 intake webhook 等价验证为准

- 决策：`industryResearchWeeklyRerun` 是 Schedule Trigger workflow，CLI `n8n execute --id=...` 不能作为可靠 smoke；导入激活后，用 Subscription List 第一项直接 POST intake webhook 验证业务链路。
- 原因：n8n 2.26.5 对没有 `Execute Workflow Trigger` 的 Schedule workflow 返回 `Missing node to start execution`；但 webhook fallback 能验证同一 payload 进入 intake、生成 run、写 Supabase artifacts 和 n8n events。
- 影响：R5 验收信号改为：workflow 已 active、intake smoke 生成新 run、报告含周报基线/变化节、Supabase event 表按同一 `n8n_execution_id` 有 queued / running / completed 三态。

## 2026-07-05：结构化抽取改为分批 map-reduce

- 决策：`generateGlmStructuredExtractionBatched` 按「可确认来源优先 + 每批 12 文档 / 36k 字符 + 总量 36 文档」切批，逐批抽取后按稳定键合并去重（竞品按名、产品信号按竞品+信号、痛点按主题、内容按平台+话题、机会按标题）；单批失败只把该批文档的 extraction jobs 降级为 needs_review，全部批次失败才抛错走原有 workflow 降级。旧 `generateGlmStructuredExtraction` 保留为兼容包装。
- 原因：旧实现只取前 12 个文档、每个截 4000 字符——采集面扩大后（本轮真实 run 25+ 文档）会静默丢弃过半原料；一次性塞入也会撞 context 上限。
- 影响：抽取覆盖全部高质量 raw documents；批次进度经 `onProgress` 以 log 事件透出；`glm-extraction.test.ts` 覆盖切批/合并/部分失败/全失败。

## 2026-07-05：搜索发现抽象为 provider，内容生态只走官方 API

- 决策：新增 `search-providers.ts`（`brave` / `serper` JSON API + `duckduckgo_html` 无 key fallback，env：`AGENT_FACTORY_SEARCH_PROVIDER/_API_KEY/_BASE_URL`）；新增 `content-api-adapter.ts`（YouTube Data API v3 + Reddit OAuth，env：`AGENT_FACTORY_YOUTUBE_API_KEY` / `AGENT_FACTORY_REDDIT_ACCESS_TOKEN`），产出 `content_api` 类型的 RawDocument 直接进既有抽取与证据管道。核心包不读 `process.env`，env 由调用方显式传入。
- 原因：DDG HTML 抓取脆弱且单 query 太窄（旧默认 1 query×3 结果）；社媒/Amazon 在爬虫排除名单里是对的，但这恰是方法论里内容生态/痛点的主来源——官方 API 是合规路径。
- 影响：
  - 搜索默认 3 query×5 结果；API provider 失败时按 query 回退 DDG 并记 note。
  - 无任何 key 时行为与旧版一致（DDG），content_api 静默跳过——**Brave/YouTube/Reddit key 仍待用户注册后配置**（原 D2/D3 决策项）。
  - `SourceQualityType` 新增 `content_api`；Supabase 相关列为 text，无 migration 需求。

## 2026-07-05：发现层配额、robots Disallow 与抓取礼貌控制

- 决策：发现结果按类硬上限选择（homepage 6 / robots 4 / sitemap 4 / product 8 / collection 8 / blog 6 / rss 4，总量 32）；发现阶段解析 robots.txt 的 Disallow（对所有 UA 一律尊重，通配规则截断到首个 `*`，无法保守应用的规则跳过）并过滤同源 URL；采集适配器加同域 ≥1s 礼貌间隔（注入 fetcher 的测试路径默认 0）和单 run 60 目标硬上限。
- 原因：旧 rank 排序会让 homepage/robots/sitemap 挤掉 product/collection/blog（拆赚钱方式的原料）；此前未解析 robots Disallow，扩大抓取面前必须先把合规边界补硬。
- 影响：单域抓取体量有界、种类均衡；`public-source-discovery.test.ts` 覆盖 provider 回退、robots 过滤、配额与目标上限。

## 2026-07-05：周报 = 跨 run diff；历史上下文来自上一次 run 而非 zvec 运行时

- 决策：`createIndustryResearchDeliveryArtifacts` 接收 `previousRun?: {runId, databases} | null`（undefined=不启用；null=写基线条目；有值=diff 出真实周报条目 + 报告「本期新增与变化」节）。diff 只用跨 run 稳定键：竞品名/关键词/内容(平台|话题)/痛点主题/机会标题+总分；product_database 的 name 是位置生成的（"<品类> 信号 N"），产品维度改用标签集合。T8 的 LLM 历史上下文同样取自上一次 run 的 databases（`buildHistoricalContextFromDatabases`），prompt 中显式声明不得作为 evidenceQuotes 来源。
- 原因：这是方法论「从搜索模式到订阅模式」的落地最短路径；zvec 是原生模块，进 Next 运行时有构建/部署风险，而「上一次 run 的结构化结论」对抽取对比恰恰是最相关的历史认知。zvec 检索逻辑已抽成 `scripts/lib/zvec-search-core.ts` 供 CLI 复用，运行时接入留给后续需要跨多 run 检索时再评估。
- 影响：
  - 真实模式 `weekly_intelligence_reports` 不再恒空；mock 结果不参与 diff（rich demo 会污染基线）。
  - 上一 run 查找：studio 侧 `findPreviousLocalIndustryResearchRun`（服务器也用本地交付包目录，Supabase-first 留作后续）；CLI 侧 `scripts/lib/find-previous-run.ts`。查找失败静默降级，不阻塞交付。
  - 新增 n8n `industry-research-weekly-rerun.json`（Schedule Trigger → 内嵌订阅清单 → POST intake webhook），默认 `active:false` 只入库不导入，导入按同 id 流程由用户执行。

## 2026-07-05：run-security 的内存 token / 限流是单进程假设

- 决策：SSE 一次性 token 和按 IP 限流桶继续用模块级内存 Map，不引入 Redis 等外部依赖；在此明确记录该实现依赖「单 systemd 进程」部署形态。
- 原因：当前生产就是单进程 `industry-research.service`；多实例或频繁重启会让 token/限流静默失效——这是扩容前必须回来改的点，而不是现在引入基础设施的理由。
- 影响：`run-security.test.ts` 补齐 token 一次性/过期、Host/Origin 白名单、限流 429、body 上限（含 content-length 谎报）、错误脱敏共 12 条单测。

## 2026-07-05：部署 runbook 固化为 deploy.sh，默认 dry-run

- 决策：新增 `deploy/lightweight-server/deploy.sh`：git archive HEAD → 远端备份 → 非删除式 rsync（排除清单对齐 2026-06-29 决策）→ install → build → doctor → restart → health。默认 `--dry-run` 只打印计划与 rsync -n 预览；真实执行需显式 `--execute`。
- 原因：手工 runbook 已经咬过一次（服务器缺 `SimpleResearch.tsx`）；排除清单靠记忆不可靠。
- 影响：脚本永不带 `--delete`，不读不打印密钥；本轮只编写与 dry-run 验证，真实部署仍由用户触发。

## 2026-07-05：仓库卫生收口

- 决策：`.claude/`、`.codebuddy/`、`.workbuddy/` 全目录进 `.gitignore`（与 Biome 排除一致）；`remotion-videos/` 源码入库但 `node_modules/`、`output/` 忽略；`overview.md`（营销视频交付说明）入库。
- 原因：这些路径长期 untracked，容易在同步/部署时产生歧义；营销视频源码是可复用资产应该入库，渲染产物和依赖不应该。
- 影响：`git status` 干净；deploy.sh 的 rsync 排除清单同步包含这些目录。

## 2026-06-29：生产运行面固定为轻量服务器

- 决策：行业研究生产台的正式运行、API、n8n 回调、本地交付包、zvec 缓存和 provider gateway 都以轻量服务器为主；`research.playgamelab.cn` 由 Caddy 反代到本机 `127.0.0.1:3010`。Vercel / 本机只作为开发或预览。
- 原因：用户明确要求 agent 的内容架构、运行和 API 都搭建到轻量服务器；项目也已经有 n8n、9router、Caddy、systemd 的服务器体系，继续把生产运行面分散到 Vercel 或本机会增加状态漂移。
- 影响：
  - 新增 `docs/lightweight-server-runtime.md` 和 `deploy/lightweight-server/` 模板。
  - `apps/studio` 的 start 命令改为尊重 `PORT`，轻量服务器推荐 `PORT=3010`。
  - 新增 `pnpm server:doctor` 检查轻量服务器 env、目录、端口、n8n secret、Supabase 和 zvec 状态。
  - `.env.example` 新增 `AGENT_FACTORY_DEPLOYMENT_TARGET`，生产值为 `lightweight_server`。
  - 服务器脚本默认读取 `/etc/industry-research/industry-research.env`，并支持 `AGENT_FACTORY_ENV_FILE` 显式指定 env 文件。

## 2026-06-29：准生产基线优先解决可信度、可审计和可复现

- 决策：本轮 P0/P1/P2 优化不引入登录、支付、多租户、Docker 或新后端，而是在现有 Next/API/core/scripts/n8n 边界内补齐 CI、安全、证据验收、运行记录读取、replay 和 zvec 增量状态。
- 原因：当前目标是把“可演示、可运行”推进到“可稳定交付、可审计、可复现、可信报告”；过早引入账户体系或新基础设施会扩大风险，并偏离当前电商竞品研究工作流。
- 影响：
  - CI 固定为 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm build`。
  - SSE 同源入口需要 Host/Origin 白名单和一次性 run token；外部 REST run API 继续使用内部 key 保护。
  - 真实 public_web 只输出公开采集事实和证据，不再生成模板业务结论；业务结论必须来自可匹配 quote 的结构化抽取或人工审核。
  - 报告必须分层显示“已确认发现 / 候选发现 / 不确定 / 阻塞项”，并暴露可信度指标。
  - Supabase 是权威运行记录读取优先级，本地交付包是 fallback；zvec 是可重建缓存，并记录增量索引状态。

## 2026-06-29：提交后的生产部署采用非删除式同步，不在服务器上 git pull

- 决策：本轮 `703e41a` 推送后，轻量服务器部署不使用 `git pull`，而是对 `/opt/playgamelab/industry-research` 做非删除式 `rsync` 同步，并明确排除 `.git`、生产 env、依赖目录、构建缓存、运行输出和本地工具/草稿目录。
- 原因：远端实际部署目录不是 Git 仓库；同时生产 env 为 root-owned 文件，运行数据在 `/opt/playgamelab/industry-research-data`，使用删除式同步或整目录覆盖会增加误删配置/数据的风险。
- 影响：
  - 每次部署前先生成 `.deploy-backups/<timestamp>.tar.gz` 源码备份。
  - 服务器上的 `industry-research.env*`、`node_modules`、运行数据和 `.deploy-backups` 不由 rsync 覆盖或删除。
  - 远端验证以 `pnpm install --frozen-lockfile`、`pnpm build`、按 systemd env 加载的 `server:doctor`、Supabase/zvec smoke 和 systemd health 为准。

## 2026-06-29：n8n workflow JSON 同步不等于自动导入生产 n8n

- 决策：本轮只把扩展四态事件的 `workflows/n8n/industry-research-intake.json` 同步到服务器代码目录，不自动导入或覆盖 n8n 实例中的 workflow。
- 原因：n8n workflow 导入会影响生产 webhook、active workflow、Header Auth credentials 和可能的 workflow id/webhookId；在没有确认目标 workflow 和导入方式前，自动导入容易生成重复 workflow 或导致凭据错配。
- 影响：
  - 代码仓库和服务器文件系统已经有最新版 workflow JSON。
  - 生产 n8n 仍以现有 active workflow 为准。
  - 下一轮如果要启用四态 workflow，需要单独做 n8n 导入/复核/真实 webhook smoke。

## 2026-06-29：n8n 四态 workflow 用同 id 更新现有 workflow

- 决策：生产 n8n 启用四态 workflow 时，保留 workflow id `industryResearchV03Intake`，先导出现有 active workflow 备份，再导入同 id JSON、publish、active，并重启 n8n 容器刷新 webhook 注册。
- 原因：同 id 更新可以避免重复 production webhook 和重复 active workflow；n8n 普通部署模式的 `import:workflow --activeState=fromJson` 不可用，因此需要导入后显式发布和激活。
- 影响：
  - n8n 数据卷保留导入前备份。
  - 当前 production webhook 仍是 `POST /webhook/industry-research/intake`。
  - 四态链路用 `n8nExecutionId` 串联 queued/running/completed；completed 事件使用真实 delivery runId。

## 2026-06-29：zvec optimize 不作为日常 index 默认动作

- 决策：`pnpm zvec:index` 默认只做 upsert、FTS index ensure、metadata sync 和状态文件更新；`collection.optimizeSync()` 改为显式维护动作，需要传 `--optimize` 或设置 `AGENT_FACTORY_ZVEC_OPTIMIZE=true`。
- 原因：当前 zvec optimize 在生产 collection 上会产生 RocksDB/FTS 临时目录 warning，但写入、metadata 和搜索都正常；为消除 warning 去删除 collection 临时目录不符合项目删除安全边界。
- 影响：
  - 日常增量索引输出稳定为 `warnings=[]`。
  - 需要压缩或重建 collection 时，单独安排维护窗口并显式启用 optimize。
  - `optimizeRequested` 会出现在脚本输出中，便于审计。

## 2026-06-29：运行模式命名收敛为 canonical mode + provider metadata

- 决策：对外模式收敛为 `public_web`、`public_web_llm`、`llm_only`；`9router`、`public_web_9router`、`deepseek`、`public_web_deepseek`、`glm`、`public_web_glm` 只作为 legacy alias。provider、model、baseUrlHost、fallbackReason 和 llmUsed 写入 `runMetadata`，不再通过报告标题或文本字符串推断 LLM 状态。
- 原因：旧命名把执行模式、provider 和历史 DeepSeek 函数名混在一起，容易把“兼容别名”误读成真实 provider 调用；metadata 明确后，run log、manifest、下载包和 UI 都能基于结构化字段判断。
- 影响：
  - 简化 UI 默认 `public_web`，不调用 LLM。
  - `Public + 9router` 仍可映射到 `public_web_llm` + provider metadata。
  - provider 探测或额度调用必须在有 key 的服务器环境显式执行。

## 2026-06-29：Biome 检查只覆盖项目代码，不覆盖本地工具/草稿目录

- 决策：`biome.json` 排除 `.claude`、`.codebuddy`、`.workbuddy` 和 `remotion-videos`。
- 原因：这些目录是本地工具状态或未跟踪视频草稿，不属于行业研究生产台主代码；让它们阻塞 `pnpm check` 会让项目质量信号失真。
- 影响：`pnpm check` 继续覆盖应用、核心包、脚本、workflow 和测试；未跟踪工具目录不作为本轮交付内容。

## 2026-06-29：远端部署先做基础设施最小同步

- 决策：轻量服务器 `/opt/playgamelab/industry-research` 当前已有旧版线上代码，本轮只同步 Supabase、zvec、server doctor、env/docs/deploy 模板等基础设施相关文件，不整仓覆盖。
- 原因：本地工作区同时存在 UI、Remotion、WorkBuddy 等无关改动；整仓同步会把尚未验收的前端/视频改动混进生产运行面。
- 影响：
  - 远端同步前后都需要跑 `pnpm server:doctor`、`pnpm supabase:doctor`、`pnpm supabase:smoke`、`pnpm zvec:index`、`pnpm zvec:search --query=Amazon`。
  - 只有基础设施验证通过后，才重启 `industry-research.service`。
  - UI/Remotion 改动继续留给 Claude Code 或后续独立验收，不作为本轮部署内容。

## 2026-06-29：默认 UI 改为 3 步用户流程，高级控制台保留

- 决策：GitHub `main` 已合并 Claude Code 提交 `329dab8`，`/industry-research` 默认显示简化的 3 步用户流程；原完整工程控制台不删除，放到「高级模式」里。
- 原因：用户明确觉得原前端 UI 太复杂、看不懂；默认界面应该面向普通使用者，先让用户输入品类并拿到报告，而不是先暴露 provider、run mode、九库和工程运行态。
- 影响：
  - 新增 `SimpleResearch.tsx`。
  - `/industry-research/page.tsx` 默认渲染简化流程。
  - Studio 首页文案改成「输入品类 → 自动研究 → 得到报告」。
  - 后端 run/stream、server action、adapter 和交付包链路不变。
  - UI 已最小同步并部署到轻量服务器；同步时保留基础设施热更新，不整仓覆盖。

## 2026-06-29：Supabase 做权威运行记录，zvec 做本地检索缓存

- 决策：Supabase 第一版只做服务端私有运行记录库，保存 run metadata、8 文件交付包、n8n event 和 zvec chunk metadata；zvec 只做本地可重建检索缓存，不做权威存储。
- 原因：项目当前仍不做登录、支付和多租户；如果直接开放客户端 Supabase 表，会引入 owner/RLS/SaaS 边界复杂度。把 Supabase 限定为 service-role-only 后端存储，能先解决可审计留档；zvec 则适合复用历史研究产物和本地语义/全文检索。
- 影响：
  - 新增 `supabase/migrations/20260629_industry_research_infra.sql`，RLS 全开但不创建 `anon` / `authenticated` policy。
  - 新增 `@supabase/supabase-js@2.108.2` 和 `@zvec/zvec@0.5.0`。
  - 新增 `pnpm supabase:doctor` / `pnpm supabase:smoke` / `pnpm zvec:index` / `pnpm zvec:search`。
  - `AGENT_FACTORY_SUPABASE_ENABLED=true` 时，run 成功后必须写 Supabase；失败会让 run 失败。
  - 专用 project 已创建：`industry-research-production-table` / `ghsyjdipofnyokbbbrdb`，不使用 inactive `wardrobe` project。

## 2026-06-26：默认业务流固定 `public_web`，LLM 只作为显式 9router / OpenAI-compatible provider

- 决策：API 缺省 run mode 从 legacy LLM mode 改为 `public_web`；前端可见运行模式改为 `Mock` / `9router` / `Public Web` / `Public + 9router`；health、首页、设置页、README 和当前状态文档统一为 9router / OpenAI-compatible provider 口径。旧 `deepseek` / `public_web_deepseek` mode、函数名和脚本作为历史兼容层保留，不作为当前默认 provider 口径。
- 原因：用户当前服务器已部署 n8n 和 9router，并明确不再用 DeepSeek。免费 9router provider 不能只看模型列表，必须测真实 `/v1/chat/completions`；在没有稳定 LLM provider 前，默认业务流应先保证 `public_web` 可交付，避免误调用、误计费或误承诺。
- 影响：
  - 新增 `scripts/probe-9router-free-models.ts` 和 `pnpm probe:9router`，按 `/models` 候选 + 最小 `pong` chat 逐个探测；没有 key 时明确 `skipped_missing_api_key`。
  - 新增 `pnpm verify:9router` 入口；历史 `verify:deepseek` / `sample:deepseek` 保留但不再推荐为当前口径。
  - `glm-client` 新增 OpenAI-compatible 中性导出，旧 DeepSeek 导出转为别名。
  - 运行中 UX 补齐 stat / 九库 / 表格逐格 skeleton，`phase x view` 渲染分支收敛为 `deriveVisibleScreen`。
  - 生产 / 付费交付仍必须切自付费 provider；free 9router 只适合探索。

## 2026-06-25：Mock 演示用 `entityProfile: "rich"` 高密度数据，真实模式保持 lean 诚实

- 决策：`buildIndustryResearchDatabases` 新增 `entityProfile: "lean" | "rich"`。Mock 工作流传 `rich`（走全新 `buildRichDemoIndustryResearchDatabases`，合成竞品/机会各 6、~74 条证据、产品/痛点/内容/关键词 5-6），并在 `collection-plan` 给 mock 加密 candidates(8)/crawl targets，恢复"生产台"密度（实测 stat 条 8/8/26/74、九库 10/6/3/6/6/5/5/6/2）。真实 `public_web`/`deepseek` 保持默认 `lean`（1 个占位竞品）。
- 原因：之前文档声称 mock 已扩到 8/19/27/74，但实际 core 包里只有 6/5/16/5/1 的 lean 数据（文档↔代码漂移）。直接扩共享 builder 会让真实 public_web 从"采集 3 页"凭空显示 6 竞品/74 证据，违背 P0-A 接真实 run 的诚实初衷。按 profile 隔离后，演示态有厚度、真实态仍反映真实采集稀疏。
- 影响：
  - `index.test.ts` 中 mock `competitors` 断言 1 → 6；其余 `>0` 断言不变，34 测试仍绿。
  - 证据计数(evidence)、raw docs、candidates、extraction 是统计条数字（不撑表格）；竞品/机会才是表格，6 行正好是设计目标，不触发 P2-I 表格膨胀问题。
  - 取代了旧 BUG_NOTES「九库卡片数字与 fixture 不一致 / 需要 displayCount」一条：mock 现在直接产出 rich 实体，无需 displayCount hack。

## 2026-06-25：P0-A 完整版 SSE 用同源流式路由 + core onProgress，public_web 细粒度

- 决策：`runPublicIndustryResearchWorkflow` 加可选 `onProgress`（在 discover/crawl/build/report 真实阶段边界 emit `WorkflowProgressEvent`）；新增同源流式路由 `POST /api/industry-research/run/stream`（`text/event-stream`，把进度事件译成前端 `deriveRunState` 直接吃的 `RunEvent` 帧 + 末尾 `{control:"result"|"error"}`）；前端 `runReal` 用 `fetch`+`ReadableStream` 订阅累加 `setEvents`，流式不可用时回退到非流式 server action 的不确定态。
- 原因：handoff P0-A 完整版要求真实逐步进度；工作流是不透明 async 调用，必须在 core 阶段边界主动上报。`onProgress` 不传时全是 no-op，现有非流式调用与测试零影响。public_web 的发现阶段是真实网络耗时（实测 ~5.3s），进度条在真实边界推进而非编造。
- 影响：
  - 真实模式渲染层零改动（`deriveRunState` 同时吃 mock timeline 与 SSE 事件）。
  - `deepseek`/`public_web_deepseek` 当前只发 start/result（粗粒度），glm-workflow 未来可同样接 `onProgress`。
  - 流式路由与 server action 一样是同源、不要求内网 key（与无登录产品口径一致）；REST `/run` 仍是 n8n 受 key 保护契约。

## 2026-06-25：前端真实 run 接入用同源 Server Action BFF，不把内网 key 暴露到浏览器

- 决策：工作台（client component）发起真实 run / 审核回写 / 下载交付包时，统一走新增的 `app/industry-research/actions.ts` 三个同源 server action（`runIndustryResearchAction` / `reviewReportAction` / `downloadDeliveryPackageAction`），而不是浏览器直连 `/api/.../run` 携带 `x-internal-key`。
- 原因：`authorizeIndustryResearchRequest` 在配置了 `AGENT_FACTORY_INTERNAL_API_KEY` 时要求该请求头，生产环境必配；client component 无法安全携带内网 key。Server action 在服务端读 `loadServerEnv()`，浏览器零密钥，dev/prod 都通。
- 配套：把 `run/route.ts` 的「校验 + 归一 + 执行 + 落盘」抽到 `_lib/run-core.ts`（`parseRunRequest` / `executeIndustryResearchRun` 等），REST 路由与 server action 复用同一核心；REST `/run` 仍是 n8n / 外部调用的受 key 保护契约，外部 HTTP 行为不变。
- 影响：
  - 四个运行模式按钮真生效：`Mock` 走本地 mock 并打「演示数据」标识；`DeepSeek` / `Public Web` / `Public + DeepSeek` 经 server action 发真实 run。
  - 真实模式当前是「最小不确定态」：运行期显示 indeterminate，`await` 完成后 `adaptRun` 灌结果切 done；SSE 完整版（逐步事件）仍为后续项。
  - server action 返回 `{ ok }` 判别式结果，避免 Next 在生产环境对抛错做信息屏蔽。

## 2026-06-25：n8n 生产 workflow 默认走 `public_web`

- 决策：轻量服务器 n8n workflow 已导入并激活，但默认模式设为 `public_web`；调用方只有显式传 `public_web_9router` 或 `9router` 时才走 LLM。
- 原因：当前 9router / MiMo Free 上游返回 `risk_control`，其他候选 free 模型缺 provider credentials 或真实 chat 不可用。业务流应该先保证可运行和可交付，不把不稳定免费 LLM 放进默认路径。
- 影响：
  - n8n 默认请求可以生成本地 JSON/Markdown 交付包，并触发 n8n completion callback。
  - 需要 LLM 抽取/报告时，必须先确认 9router provider 可用或切换到自付费 provider。

## 2026-06-25：n8n 使用 Header Auth credentials，不开放 Code 节点读取 env

- 决策：n8n workflow 调用行业研究内部 API 时使用两个 Header Auth credentials，而不是让 Code 节点读取服务器 env。
- 原因：开放 Code 节点读取 env 会扩大 secret 暴露面；Header Auth credentials 能把 secret 留在 n8n 加密存储里，workflow JSON 不含 key。
- 影响：
  - workflow JSON 可以入仓库。
  - 服务器 n8n 必须提前导入 `Industry Research Internal Header` 和 `Industry Research n8n Webhook Header` 两个凭据。
  - 更新内部 key 或 webhook secret 时，需要同步更新 n8n 凭据。

## 2026-06-25：Claude Code 本轮只收敛视觉还原，不混入功能接线

- 决策：本轮 Claude Code 提交只完成 `FIX-1/2/3/5` 相关 UI 还原修正，包括中文字体、英雄区图谱、主题图标和 tooltip 实时计数；真实 run 接入、表单校验、失败态、下载交付包、审核回写、证据溯源和无障碍继续留在 `UX_OPTIMIZATION_HANDOFF.md` 的功能接线任务里。
- 原因：视觉还原修正风险较低，和后端接线、真实 LLM 成本、运行态错误处理是两类工作；混在一轮里容易让“看起来完成”和“实际可运行”边界不清。
- 影响：
  - TODO 中的前端 UX 项目改为“功能接线”待办，而不是继续把已完成的视觉还原也算作未完成。
  - 后续 Studio UI 优先级应从表单接线/校验和下载/审核回写开始，而不是继续做纯视觉打磨。

## 2026-06-25：`docs/porting` 是设计交接参考，不作为 Biome 应用代码检查对象

- 决策：将 `docs/porting/source/*.jsx` 和 `docs/porting/tsx/*.tsx` 排除出 Biome 检查。
- 原因：这些文件是设计交接与参考材料，不是当前应用源码；它们的格式和 lint 规则不应阻塞 `pnpm check`。
- 影响：
  - `pnpm check` 当前通过。
  - 应用源码仍继续接受 typecheck、test 和 Biome 检查。

## 2026-06-18：独立项目改为 CLI-first，Studio 降级为可选 UI

- 决策：行业研究 agent 从 `agent-factory` 的 Studio 壳里独立出来后，日常运行优先使用 CLI 脚本，不默认启动 Next dev server。
- 原因：`apps/studio` 的 Next dev server 会带来明显发热和文件监听负载；行业研究核心逻辑体量很小，不应该被重 UI 壳绑住。
- 影响：
  - `pnpm sample:public-web` 作为最低成本 smoke test，不调用 DeepSeek。
  - `pnpm verify:deepseek` / `pnpm sample:deepseek` 作为显式 LLM 验证入口。
  - `apps/studio` 保留，但只在需要看 UI 时启动。

## 2026-06-18：v0.3 核心从 agent-factory 同步到独立项目

- 决策：同步 `packages/industry-research` 的 v0.3 核心能力，而不是只复制 UI。
- 原因：可交付能力在核心包和脚本里，包括 delivery package、sourceQuality、reviewed report、run log、manifest、n8n webhook 合约。
- 影响：
  - 默认真实 LLM 改为 DeepSeek v4 flash。
  - 9router 只作为 legacy 兼容导出和历史脚本保留，不作为默认口径。
  - Supabase 仍只保留草案，不应用生产迁移。
  - n8n 只预留合约，不启动公网服务。

## 2026-06-15：UI 漂移修复采用逐字移植，不再参考重写

- 决策：表现层以 `docs/design_handoff_research_console 2/porting/source/` 和 `porting/tsx/` 为准，CSS 类名和规则体作为契约。
- 原因：上一轮从零重写 CSS 和组件导致视觉漂移；本轮目标是还原设计稿，而不是重新设计。
- 影响：
  - `globals.css` 按 source CSS 对齐。
  - 组件逻辑使用已转换的 TSX 组件，避免用 div/CSS 近似图谱和微图。

## 2026-06-15：运行态继续采用事件流派生模型

- 决策：running 态由 `deriveRunState(events)` 驱动，mock 与未来真实事件共用同一套渲染层。
- 原因：避免 UI 直接依赖同步 mock 结果，为后续 SSE 接入预留稳定接口。
- 影响：真实后端只需要替换 `startRun()` 中的 mock 回放，不需要重写界面。

## 2026-06-15：数据密度优先在 core mock 中补齐

- 决策：统计条、表格密度和 top opportunity 通过扩充 `@industry-research/core` mock 数据修复。
- 原因：用户要求保留 `adapters/research.ts` 和 `adapters/run-events.ts` 架构，不在 adapter 中硬编码视觉数字。
- 影响：
  - mock 工作流现在产出 8 个候选、19 份 raw documents、27 个抽取任务、74 条 evidence。
  - 竞品、产品、痛点、内容、关键词、机会数据更接近设计稿。
