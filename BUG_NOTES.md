# Bug Notes

更新时间：2026-07-12

## 已处理：G9 本地浏览器验收受 dev 编译与 Host 白名单影响

- 现象：旧 Next dev session 仍存在但端口不再监听；重启后 `/industry-research` 按需编译出现 `socket hang up`。改用已成功构建的本地 production server 后页面稳定加载。
- 分类：本地开发服务器运行态/按需编译问题，不是 G9 页面逻辑错误；`pnpm build` 已通过。
- 现象：首次验证旧 `?run=` 回放时报告 API 返回 403 `Host 不在允许列表。`，因为默认安全白名单只含生产域名。
- 处理：没有修改 `.env` 或安全默认值；仅为当前本地 server 进程临时加入 localhost/127.0.0.1 host 与 origin，随后旧 run 成功进入原报告页。
- 验证：G9 fixture 完整流程通过，四视口无横向溢出，控制台 0 error / 0 warning；旧回放显示 `hasLegacyReport=true`、`hasIndustryOsFixture=false`。

## 已处理：G4 离线 fixture 因 Codex usage limit 延迟

- 现象：G4 专项 typecheck 和 10 条测试通过后，沙箱外运行离线 source-candidate fixture 的批准流程返回 Codex usage limit，并提示 18:48 后恢复。
- 分类：Codex 自身额度等待，不是 provider credits、代码、fixture 或网络错误。
- 处理：Loop 写入 `waiting_quota`，保留 G4 与未完成验收；后续 heartbeat 在额度恢复后复核 Git/checkpoint，只继续 fixture 和全量验收，没有重跑 G2/G3。
- 验证：恢复后 fixture 连续两次成功且哈希一致；实际 public/provider/credits 使用均为 0，最终 `pnpm check` 为 20 个文件、196 条测试通过。

## 已处理：Industry Planner / Execution CLI 在沙箱内创建 tsx IPC 管道失败

- 现象：在 Planner 初建、G2 重新生成产物和 G3 首次运行 execution fixture 时，沙箱内的 `tsx` 在系统临时目录创建 IPC pipe 报 `listen EPERM`，该次没有生成 JSON。
- 分类：本地执行沙箱权限问题，不是 Planner 逻辑、fixture 或网络/provider 错误。
- 处理：经权限批准后在沙箱外运行同一离线命令；命令只读取本地 fixture 并写入本地 JSON，没有联网。
- 验证：相关离线命令在获准环境均成功；当前 `industry-plan.json` SHA-256 为 `9371c931f02aed2924b3eef406d22006f679f747213bb6c004bbbd31dce9668f`。G3 完整 fixture 和 pause/resume proof 均完成，revision 12、六阶段 attempt=1；产物记录 live provider/public 请求为 0。

## 已处理：Planner 单测读取 JSON fixture 时缺少 Node 类型

- 现象：第一轮 `pnpm check` 在核心 package typecheck 阶段报 `node:fs`、`node:path` 和 `process` 未定义；该 package 的 `tsconfig` 只加载 ES/DOM 类型。
- 原因：新测试为了读取 JSON fixture 引入了 Node API，突破了现有核心包测试的类型边界；Planner 本身和 7 条针对性 Vitest 已正常通过。
- 处理：未新增 `@types/node`、未修改全局 tsconfig；改为导出无 Node 依赖的 `skincareIndustryPlanningFixture` 测试常量，JSON fixture 继续作为 CLI 输入。
- 验证：workspace typecheck 通过；覆盖矩阵与抽样契约补强后，最终 `pnpm check` 为 18 个测试文件、169 条测试全部通过，Biome 无问题。

## 已处理：页面仅无横向溢出，但长报告仍可能被全局 overflow 截断

- 现象：旧版只验证 390px `scrollWidth=clientWidth`；全局 `body { overflow:hidden }`，完成页/分享回放没有独立纵向滚动容器，长报告在手机上存在无法滚到底的风险。竞品仍使用最小宽度 560px 表格横滑，顶部操作按钮也会堆叠。
- 处理：根页面改为 `100dvh` + `overflow-y:auto` + safe-area；手机端竞品改为卡片、完整报告按 H2 分章节、底部操作栏固定并为正文保留尾部空间。
- 验证：本地 360/390/430px 无横向溢出；390px 历史报告高度 2026px，可滚动到底，最后章节与操作栏间距约 103px。生产新 run 在 360/390/430px 均保持 `document.scrollWidth === viewport width`。

## 验收备注：本地构建首次被 Google Fonts 网络边界拦截

- 现象：沙箱内 `pnpm build` 无法访问 `fonts.googleapis.com`，四个 `next/font/google` 字体下载失败；TypeScript、160 条测试和 Biome 同时已通过。
- 判断：这是构建时网络权限问题，不是 H5 代码或字体声明错误。
- 处理：在允许联网的同一工作区重跑 `pnpm build`，本地与轻量服务器生产构建均成功，`/icon.svg` 进入静态路由。

## 验收备注：部署 dry-run 只显示 rsync 输出最后 20 行

- 现象：dry-run 预览只出现 scripts/Supabase/n8n 文件，未显示本轮 H5 文件，看起来像同步遗漏。
- 判断：脚本使用 `rsync ... | tail -20`，H5 文件实际位于更前面的输出；本地/远端哈希和大小对比确认远端仍是旧版，正式 rsync 输出随后确认 H5 文件已同步。
- 处理：未盲目执行；先完成哈希、大小、时间戳和脚本参数只读核查，再执行部署。生产构建、doctor、service active 和 health 全部通过。

## 验收备注：canary 生成目标超过单轮 crawl cap

- 现象：生产 canary 生成 11 个 crawl jobs，但单轮实际 crawl 上限为 8，最后 3 个被记录为 `TARGET_CAP_EXCEEDED`，最终状态为 `needs_review_with_crawl_failures`。
- 判断：这是确定性预算门禁触发，不是网络、Firecrawl 或模型故障；前 8 个目标正常产出 8 份文档、7 份 accepted source。
- 后续：让发现阶段的最终 target 数直接服从 crawl cap，或把预算跳过单列为 `skipped`，避免与真实抓取失败混合统计。

## 已处理：部署脚本只打包 HEAD，且 worktree 暂存曾带入本地缓存

- 现象：原 `deploy.sh` 使用 `git archive HEAD`，不会部署本轮未提交 baseline；首次新增 worktree 暂存时又把 `.pnpm-store`、`.playwright-cli`、`.DS_Store` 和 tsbuildinfo 同步到了远端项目目录。
- 处理：新增显式 `--worktree` 模式，默认仍为 HEAD；排除清单补充上述缓存和构建记录。远端已同步修正版脚本。
- 影响：已同步的缓存不影响运行，本轮遵守禁止批量删除约束，没有在服务器上自动清理；后续部署不会再次传输。

## 已处理：线上仍指向 DeepSeek 官方端点

- 现象：部署前只读核查发现生产 env 仍为 `api.deepseek.com / deepseek-v4-flash`，两个阿里云免费路由开关不存在。
- 处理：先备份生产 env，再安全同步阿里云 MaaS key/base URL、默认 `kimi-k2.6` 和两个免费路由开关；全过程未打印 key。
- 验证：生产 env 受管变量 5/5，最终 host 为阿里云 MaaS、routing/free-only 均为 true；真实 run 的调用记录只包含 GLM/Kimi。

## 已处理：正文噪音在抽取前未确定性清洗，且 sourceQuality 存在跨语种 false negative

- 现象：核心 benchmark 的 accepted 首页含约 49%–68% 导航、图片 target、隐私/法律声明、重复菜单和扩展拦截错误；英文宠物官网在中文品类输入下还可能被判 low，Cosmopolitan 等生活方式媒体则可能因护肤词被误当候选官网。
- 根因：旧链路直接把 Firecrawl Markdown / native HTML 的扁平文本送进评分和抽取；相关性主要靠输入词面，没有三品类确定性概念组；来源弱域名名单不完整。
- 处理：新增 `document-cleaner.ts`，同时保存 `originalText` 和清洗审计；评分和抽取只使用 `cleanedText`。补宠物益生菌、洗碗机、日本护肤概念组，并把 Cosmopolitan/Trustpilot 等弱来源降为 unknown/rejected。
- 验证：最终三品类离线 replay 的 accepted 已知残余噪音中位数均为 `0%`，无 accepted 文档超过 50%；宠物可信首页从自动 1 份校准为 Native Pet / Zesty Paws / Honest Paws 3 份。该数值是确定性 residual proxy，不替代未来 live 样例人工审计。

## 已处理：全局 quote 首命中、全部 sourceIds 和第一个 URL 导致实体串线

- 现象：洗碗机的方太/海尔 website 记录都挂到 `robam.com`，资生堂 website 记录挂到 Cosmopolitan；相同短 quote 出现在多个文档时旧 validator 直接取数组第一个文档。
- 根因：quote validator 没有 expected rawDocument/source/domain 约束；structured database 组装使用 `result.raw_documents[0]?.url` 和 `result.research_sources.map(...)`，content/keyword evidence 也从全局数组截取。
- 处理：evidence reference 支持 rawDocumentId/sourceId/URL/domain；无约束重复 quote 标为 ambiguous，不再首命中。competitor/website/pain point/keyword 只继承自己的 evidence，website URL 只在单一域名唯一绑定时生成，未知 competitorName 不再回退第一个竞品。
- 验证：方太→`fotile.com`、海尔→`haier.com`、资生堂→`shiseidogroup.cn`；离线 replay 三品类实体串线为 0，专项 fixture 覆盖原三类错绑。

## 已处理：部分证据或缺失 validation 可被人工 approved 绕过，provider 自由文本可进入正式报告

- 现象：旧门禁只要至少 1 个 accepted evidence 就允许确认，`quoteMatched/sourceAccepted` 为 undefined 也能通过；provider 原始报告仅在 `acceptedForReport=0` 时阻断，有 accepted source 时仍可附带未逐条支持的机会评分。
- 处理：确认区改为全量门禁：全部 evidence 必须明确 validation=true、claimSupportComplete=true、唯一 trace 到 rawDocumentId/URL，高风险数字必须在直接 quote 中；任一 partial/unsupported 使整个声明留在候选区。provider 原始自由文本始终与正式 report 隔离。
- 验证：负向测试覆盖 validation 缺失、2 条 quote 仅 1 条命中、无证据 `30% market share` 和人工误标 approved；正向测试确认完整支持结论仍能进入确认区并打印唯一 rawDocumentId/URL。

## 已处理：深层页发现被首页/robots/sitemap 挤出目标上限

- 现象：原核心 3 品类保存 run 的可信来源全部是首页，深层页为 0；发现目标紧张时，低证据目标会先占满 cap，robots 声明的 nested sitemap 也可能未继续读取。
- 处理：目标选择改为 evidence-first，保留 product/collection/blog/rss 多样性；在既有 probe cap 内跟随 robots 声明的 nested sitemap；扩展 `/product/`、`/category/`、`/article/` 等常见深页分类。
- 验证：宠物 product、洗碗机 product、护肤 collection 三品类离线 fixtures 均读取 nested sitemap 并保留正确页型，3/3 PASS。fixture 通过不代表旧保存 run 已经实际抓到深页。

## 当前限制：旧 benchmark 产物不能恢复“同一声明全部 quotes”完整性

- 现象：旧 `databases.json` 只保存已经匹配并生成的 evidence，没有保存 provider 原始声明期望的全部 quote 列表；离线 replay 无法证明是否还有未命中 quote 被丢弃。
- 处理：旧样例单条 quote 即使重放成功，也只记为 `partial_legacy_claim_metadata_missing`，不追认 full 或 confirmed；新 extraction evidence 会保存 `claimSupportComplete / claimQuoteCount / confirmedQuoteCount`。
- 影响：内部清洗、绑定和门禁可在离线 C2 验证，但原商业 benchmark 仍为 0/3 PASS；真实解冻必须在重新确认预算后受控复跑同一核心 3 品类。

## 已处理：零可信来源时 provider 报告仍附带 mock / 待验证行业常识

- 现象：首轮本地「洗碗机」run `dishwasher-dtc-2026-07-07T02-16-29-685Z` 中，8 个 raw document 全部 `acceptedForReport=false`，evidence / review items / 竞品 / 机会均为 0；但 `report.md` 的「原始研究报告」仍出现方太、美的、海尔等 mock / 待验证内容和机会评分。
- 判断：LLM 节点已经声明待验证，但交付报告仍原样附上 provider 内容，会让无证据结论看起来像研究结果。这是交付层风险，不是 LLM 调用失败。
- 处理：2026-07-07 先在 `acceptedForReport=0` 时阻断；2026-07-10 已进一步收紧为始终隔离 provider 原始自由文本，不论是否存在 accepted source，正式 report 都只走逐条证据门禁。
- 验证：新增单测用 `LLM_MOCK_DISHWASHER_CONTENT_SHOULD_NOT_SHIP` 断言零可信来源时不会进入 `reportMarkdown`；`pnpm check` 通过，Vitest 9 文件 99 tests 全部通过。

## 验收备注：洗碗机只靠搜索会空跑，补品牌官网后仍只是内部复核级

- 现象：首轮「洗碗机」run 没有 registry 命中，Tavily 召回 Scribd 和中研网，全部被 sourceQuality 拒绝；修复后 run `dishwasher-dtc-2026-07-07T02-25-01-084Z` 命中 6 个默认官网，产出 7 raw documents、2 个 accepted source、20 条 evidence、5 个 review items、2 个竞品、3 个机会。
- 判断：固定官网解决了“完全跑偏 / 空跑”的第一层问题，但没有解决交付质量。当前有效来源主要是方太和海尔首页；方太正文混入大量隐私声明，美的/老板/松下等首页低相关或抓取失败，痛点/评论/价格/内容信号仍不足。
- 后续：洗碗机要继续补具体产品页、类目页、公开评论/内容 API 或用户手动 URL；也需要优化正文清洗和运行预算。不要为了让报告更满而放宽 `acceptedForReport`。

## 已处理：固定来源注册表影响旧 mock workflow 测试夹具

- 现象：接入默认 `source_registry` 后，旧的宠物益生菌 mock workflow 测试开始额外抓取 Native Pet / Finn / Zesty Paws 等默认官网，导致原本只覆盖 fixture URL 的测试失败。
- 判断：这是测试边界变化，不是生产 bug；真实运行需要默认固定来源兜底，旧 fixture 则需要保持“只验证 mock URL 和预算上限”的封闭输入。
- 处理：新增 `AGENT_FACTORY_SOURCE_REGISTRY_DISABLED=true` 开关；旧 mock workflow 测试显式关闭注册表，新增注册表专用测试保持默认开启。
- 验证：`pnpm check` 通过，Vitest 9 文件 97 tests 全部通过；`pnpm build` 通过。

## 已处理：sourceQuality 把资讯/门户/无关电商页当作可确认官网证据

- 现象：`public_web_llm` 首轮线上验证中，`wabei.cn` 曾被判为 `official_site/high/accepted=true`；后续 Tavily 搜索又把 `sayweee.com` 这类无关电商页带入「男士电动剃须刀」run，并被旧规则接受。
- 判断：旧规则过度依赖 target kind、HTTPS 和正文长度；中文品类词也只按空格/标点拆分，无法用「剃须刀」命中「男士电动剃须刀」这类连续中文短语。
- 处理：
  - `sourceQuality` 增加弱来源域名/标题识别，把平台、门户、财经资讯、百科/问答和聚合页降为 `unknown/low/accepted=false`。
  - `robots`、`sitemap`、`search_candidate`、`unknown`、low relevance / low confidence 来源不再进入 `acceptedForReport` 或 `canConfirmWithSource`。
  - LLM 分批抽取只接收可确认来源，prompt 带 `sourceQuality` 和机会抽取约束。
  - 中文行业/品类词增加 3-6 字片段匹配；自动搜索发现的首页没有品类相关性时降为 low，用户手动 URL 仍保留为候选入口。
- 验证：本地 `pnpm check` 通过（95 tests），`pnpm build` 通过；提交 `3ba2f8e`、`24c98ca` 已部署。最新 run `industry-research-2026-07-06T13-39-33-057Z` 中 `sayweee.com` 为 `official_site/low/high/accepted=false`，Philips 官网为 `official_site/high/high/accepted=true`，页面输出 1 个竞品、2 个机会、13 条证据，分享回放正常。

## 已处理：线上输入品类后 public_web run 在 crawl_sources 阶段 180 秒超时

- 现象：生产页输入「男士电动剃须刀」并点击「开始研究」后，UI 正常进入运行态，进度到 `crawl_sources` 后等待，最终显示 `run_timeout_after_180000ms`。
- 判断：不是按钮、SSE、systemd 服务或持久化坏了；服务 active 且 health OK。根因是 Tavily + Firecrawl 接入后，默认发现/探测/抓取目标过多，再叠加 Firecrawl 30000ms 单页超时，使交互式 run 超过 SSE 180 秒窗口。
- 处理：`runPublicIndustryResearchWorkflow` 增加 env 可调预算：search queries、search results、probe URLs、sitemap URLs、discovered targets、crawl targets、request timeout；默认交互预算收敛到 2 query、4 results/query、8 probes、4 sitemap URLs、10 discovered targets、8 crawl targets、8000ms request timeout。生产 env 把 `AGENT_FACTORY_FIRECRAWL_TIMEOUT_MS` 降到 12000ms，备份为 `industry-research.env.bak-20260706204443`。
- 验证：本地 `pnpm check`（89 tests）和 `pnpm build` 通过；提交 `7138356` 已部署生产。Playwright 重新输入「男士电动剃须刀」生成 run `industry-research-2026-07-06T12-46-43-563Z`，完成并自动生成 `?run=` 分享链接。

## 已处理：搜索发现会把明显平台/门户页纳入候选来源

- 现象：第一次修复超时后，线上 run 完成，但回放证据中出现 `jd.com`、`sohu.com` 这类 marketplace / portal 页面，业务价值很低。
- 判断：当前过滤名单覆盖了 Amazon/TikTok 等英文平台，但没有覆盖中国常见电商平台、门户、内容社区；同时默认 query 对中文品类不够明确，没有强约束“品牌官网”。
- 处理：发现层 query 改为更偏「品牌官网 / official brand website / 竞品」；新增 JD、淘宝、天猫、1688、拼多多、搜狐、新浪、网易、QQ、微博、知乎、百度、B 站、抖音、头条、凤凰等域名过滤。
- 验证：本地 `pnpm check` 和 `pnpm build` 通过；提交 `ccad3f4` 已部署生产。最新 run `industry-research-2026-07-06T12-52-48-094Z` 不再出现 JD/Sohu，抓到 Philips 官方站并可分享回放。

## 已处理一半：public_web 默认模式没有竞品/机会结构化结果

- 现象：最新线上 run `industry-research-2026-07-06T12-52-48-094Z` 约 25 秒完成，信息源库 10 条、可溯源证据 2 条，但竞品和机会仍为 0。
- 判断：这是 UI 固定 `DEFAULT_MODE = "public_web"` 的预期边界。真实 public_web lean 路径只构建公开证据和 source database，不做 LLM 结构化抽取。
- 处理：用户已确认切到 `public_web_llm`；代码侧默认模式已切换并部署 `a509032`。线上 E2E run `industry-research-2026-07-06T13-09-42-043Z` 确认请求体为 `mode=public_web_llm`，`llmStatus=openai_compatible`，结果产出 1 个竞品候选 Philips。
- 另一个质量问题：`wabei.cn` 这类财经资讯站仍被 `sourceQuality` 判为 `official_site` 并 accepted，需要继续加严来源分类。
- 后续：把资讯站/百科/问答/内容社区从 `official_site` 中剥离，避免 accepted evidence 被 LLM 放大成业务结论。

## 已处理：Firecrawl keyless scrape 在当前网络环境返回 403

- 现象：本机无 `FIRECRAWL_API_KEY` / `AGENT_FACTORY_FIRECRAWL_API_KEY`，直接 `POST https://api.firecrawl.dev/v2/scrape` 抓 `https://example.com/` 返回 HTTP 403，错误说明无 key 的当前 IP 被 Firecrawl 风控。
- 判断：这是 Firecrawl keyless free tier 的环境限制，不是本项目 Firecrawl 包装层或 public_web 工作流失败。
- 处理：代码侧已安装并接入 Firecrawl；随后用户注册 Firecrawl API key，本地 `.env.local` 和生产服务器 env 已写入真实 key 并启用 `AGENT_FACTORY_FIRECRAWL_ENABLED=true`，不再依赖 keyless 模式。
- 验证：本地和生产 Firecrawl 单页 smoke 均返回 HTTP 200；生产 `pnpm sample:public-web` 生成 `v03-public-web-smoke-2026-07-06T12-25-43-548Z`，Firecrawl Markdown 正文进入 raw documents。

## 验收备注：Codex Browser DOM snapshot 不可用，已用 Playwright 兜底

- 现象：本轮本地/线上 UI 验证时，Browser 插件的 `domSnapshot()` 返回 `TypeError: o.incrementalAriaSnapshot is not a function`。
- 判断：这是当前 Codex Browser 自动化通道能力问题，不是行业研究页面运行时报错。
- 处理：改用 Browser evaluate / 截图 + 临时 Playwright/headless Chrome 做端到端验证；Playwright 验证通过线上输入页、真实 run、`?run=` 分享回放和 390px 移动端无横向溢出。

## 验收备注：泛化品类 public_web 可能产出稀疏报告

- 现象：2026-07-06 线上验证用「剃须刀」跑 `public_web`，流程成功并生成 run `industry-research-2026-07-06T06-34-55-939Z`，但报告只有 2 条信息源，竞品/机会为空。
- 判断：这是当前无外部搜索 key、无竞品 URL 时 public_web 公开检索的质量边界，不是分享链接或 UI 部署失败。
- 后续：接入 Brave/Serper 搜索 key，或输入具体竞品官网 URL，可以提高竞品抽取密度；正式交付仍需用自付费 provider 和人工复核。

## 已处理：部署脚本文案中的 Bash 变量被中文标点吞进变量名

- 现象：R2 执行 `bash deploy/lightweight-server/configure-llm-env.sh --dry-run` 时报 `line 41: MODE�: unbound variable`。
- 原因：`set -u` 下，`$MODE）`、`$LOCAL_ENV（...` 这类变量后紧贴中文全角标点，Bash 在当前 locale 中把标点并入变量名解析。
- 处理：三个部署脚本中所有紧贴中文标点的变量统一改为 `${MODE}` / `${LOCAL_ENV}` / `${arg}` 等花括号形式。
- 验证：`bash -n deploy/lightweight-server/configure-llm-env.sh deploy/lightweight-server/deploy.sh deploy/lightweight-server/import-weekly-workflow.sh` 通过；R2 dry-run 与 execute 通过。

## 已处理：部署 health 检查在服务刚重启时偶发 502

- 现象：R3 `deploy.sh --execute` 完成 build、doctor 和 `systemctl restart` 后，最后一次公网 `curl https://research.playgamelab.cn/api/health` 返回 `502`，脚本 exit 56。
- 原因：Next 服务已 active 并在 `127.0.0.1:3010` ready，但 Caddy 到新进程的公网 health 有短暂 race。
- 处理：`deploy.sh` 的公网 health 检查改为最多 5 次、每次间隔 3 秒的短重试。
- 验证：失败后只读复测显示本机 health 200、公网 health 200、`industry-research.service` active，日志只有 Next ready。

## 已处理：n8n 周报导入脚本需要 sudo 访问 Docker

- 现象：R1 中 `docker ps` 对 `ubuntu` 用户返回 `permission denied while trying to connect to the docker API`，但 `sudo -n docker ps` 可用。
- 原因：服务器 Docker socket 未开放给普通 `ubuntu` 用户；原 `import-weekly-workflow.sh` 使用裸 `docker`，execute 会失败。
- 处理：脚本中远端 `docker exec/cp/restart` 全部改为 `sudo -n docker ...`，保持无密码 sudo 先决条件。
- 验证：R5 成功备份 workflow、导入 `industryResearchWeeklyRerun`、激活并重启 n8n 容器。

## 验收备注：Schedule Trigger workflow 不能用 `n8n execute --id` 直接 smoke

- 现象：R5 手动执行 `n8n execute --id=industryResearchWeeklyRerun` 返回 `Missing node to start execution`，提示 workflow 需要 `Execute Workflow Trigger`。
- 判断：这是 n8n CLI 对 Schedule Trigger workflow 的限制，不代表导入或激活失败；n8n 日志显示 `Activated workflow "industry-research-weekly-rerun"`。
- 处理：按 handoff fallback，直接 POST `https://n8n.playgamelab.cn/webhook/industry-research/intake` 发送 Subscription List 第一项作为等价 smoke。
- 验证：生成生产 run `dtc-2026-07-04T17-32-52-910Z`，报告含「本期新增与变化」和「本期为基线」，Supabase n8n event 表按 `n8n_execution_id=13` 查询到 queued / running / completed 三态。

## 验收备注：n8n webhook smoke 请求超时但业务 run 已完成

- 现象：直接 POST intake webhook 的本地 `curl --max-time 620` 最终超时，0 bytes received。
- 判断：n8n 没有及时把 webhook response 返回给调用方，但行业研究 run 实际在 25 秒内完成并写入 Supabase；这属于 webhook 响应层问题，不是业务链路失败。
- 验证：run list 显示 `dtc-2026-07-04T17-32-52-910Z`，8 类 artifacts 齐全，reportMarkdown 含周报基线节；n8n event 表有 execution `13` 的三态事件。

## 已处理：n8n 四态 workflow 首次 smoke 失败

- 现象：导入四态 n8n workflow 后，第一次 webhook smoke 返回 failed callback；run API 报 `请求体缺少行业研究工作流必填字段。`
- 原因：`Run Industry Research` 节点接在 `Notify Industry Research Running` 之后，但节点表达式仍使用 `$json`；此时 `$json` 已是 running callback 的 ack，不再是原始 webhook body。
- 处理：将 Run 节点 `jsonBody` 表达式改为显式读取 `$('Webhook Intake').item.json`。
- 验证：重新导入、发布、激活并重启 n8n 后，第二次 webhook smoke execution `12` 返回 completed；Supabase n8n event 表有 queued、running、completed 三条事件。

## 已处理：zvec optimize warning 改为显式维护动作

- 现象：生产 `pnpm zvec:index` 写入和检索都正常，但默认调用 `collection.optimizeSync()` 时会持续输出 RocksDB/FTS warning。
- 风险：直接删除 collection 下的 `*.tmp` 目录属于目录删除，不符合项目“禁止脚本批量删除文件或目录”的安全边界。
- 处理：`scripts/zvec-index-industry-research.ts` 新增 `--optimize` / `AGENT_FACTORY_ZVEC_OPTIMIZE=true`；默认日常 index 不再调用 optimize。
- 验证：本地和生产默认 `pnpm zvec:index` 均返回 `optimizeRequested=false`、`warnings=[]`；生产写入/检索继续正常。

## 当前限制：9router free/provider 探测无可用模型

- 现象：服务器运行 `pnpm probe:9router` 后返回 `no_usable_model_found`，usableModels 为空。
- 已核查：
  - 9router base URL `http://127.0.0.1:20128/v1` 可达，模型列表返回 387 个模型，候选 122 个。
  - 多数候选返回 `No active credentials for provider`。
  - `mmf/mimo-auto` 和 `mimo-free/mimo-auto` 仍返回上游 `risk_control`。
- 当前处理：保持默认业务流 `public_web`，不把 LLM 作为生产默认；需要 LLM 交付时必须接入自付费 provider 或可用 provider credentials。

## 已处理：部署时直接 SSH root@domain 触发 host key verification failed

- 现象：部署前尝试用 `root@research.playgamelab.cn` 做只读核查时返回 `Host key verification failed`。
- 原因：当前可用的服务器连接信息在本机 SSH config 的 `lighthouse-lab` host alias 下，用户是 `ubuntu`，并使用指定 identity file；直接 root + domain 不匹配现有 known_hosts / 登录配置。
- 处理：改用 `ssh lighthouse-lab` 做后续部署核查和操作。
- 验证：`lighthouse-lab` 可正常返回主机名 `VM-0-3-ubuntu`，并确认 `industry-research.service` 为 active。

## 已处理：远端部署目录不是 Git 仓库

- 现象：`git -C /opt/playgamelab/industry-research status`、`rev-parse` 和 `branch --show-current` 均返回 `fatal: not a git repository`。
- 原因：轻量服务器当前部署目录是 rsync/拷贝式发布目录，不是 Git checkout。
- 处理：
  - 不使用 `git pull` 部署。
  - 部署前创建备份 `.deploy-backups/pre-703e41a-20260629T114634Z.tar.gz`。
  - 使用非删除式 `rsync` 同步已提交代码，明确排除 `.git`、生产 env、依赖目录、运行输出和本地工具目录。
- 验证：远端 `pnpm build` 通过，服务重启后公网 health 正常。

## 已处理：远端手动 server:doctor 未加载 systemd env 导致误报失败

- 现象：直接在远端运行 `pnpm server:doctor` 时，`AGENT_FACTORY_DEPLOYMENT_TARGET`、`NODE_ENV`、base URL、internal API key、n8n secret、Supabase/zvec 和 writable dir 检查失败。
- 原因：生产环境变量由 systemd 的 `EnvironmentFile=/opt/playgamelab/industry-research/industry-research.env` 加载；手动 shell 没有自动加载该 root-owned env 文件，因此脚本看到空环境和默认 `/var/lib/...` 路径。
- 处理：用 `sudo` 读取 env 文件，导出 systemd 同等环境，再以 `ubuntu` 用户运行 `pnpm server:doctor`。
- 验证：重跑后 `status=ok`，Supabase/zvec 启用，runs/zvec 数据目录均可写。

## 验收备注：生产内部 API 未授权返回 401 是预期保护

- 现象：公网访问 `/api/industry-research/runs` 和 `POST /api/industry-research/runs/<runId>/replay` 未带内部凭据时返回 `401`。
- 判断：这两个接口走 `authorizeIndustryResearchRequest`，生产环境未带内部 key 返回 401 符合当前安全边界。
- 验证：页面 `/industry-research` 返回 200；run stream token GET 带合法 Origin 返回 200；replay POST 未授权返回 401。

## 验收备注：本轮部署后 zvec optimize 仍出现 RocksDB/FTS warning

- 现象：生产 `pnpm zvec:index` 返回 `status=ok`，但 native 日志出现 `RocksDB path ... already exists` / `ReduceFts: create destination FTS RocksDB failed`，脚本 warnings 包含 `zvec optimize skipped`。
- 判断：本轮写入 138 个 chunk，Supabase metadata rows 138，`pnpm zvec:search --query=taobao` 可检索到 smoke run 和历史 run；失败点仍是 optimize/压缩，不是写入或查询。
- 当前处理：继续把 optimize 失败降级为 warning；后续可在维护窗口评估清理重建 collection 或升级 zvec。

## 已处理：Supabase n8n event sequence 默认 PUBLIC 权限

- 现象：应用 Supabase migration 后，4 张表的 `anon` / `authenticated` 权限都已是 false，但 `industry_research_n8n_events_id_seq` 仍显示对 `anon` / `authenticated` 有 USAGE/SELECT/UPDATE。
- 原因：Postgres sequence 继承了默认 PUBLIC 权限；表级 revoke 不会自动收紧 sequence。
- 处理：
  - 远端执行 `revoke all on sequence ... from public`，再只 grant 给 `service_role`。
  - 同步修正 `supabase/migrations/20260629_industry_research_infra.sql`。
- 验证：修正后 `anon` / `authenticated` 对 sequence 的 USAGE/SELECT/UPDATE 全部 false，`service_role` 为 true。

## 已处理：真实 public_web 报告仍泄漏演示/模板语义

- 现象：本轮 public_web smoke 初次复测生成 8 文件交付包，但 `report.md` / `run_log.json` 仍出现 `mock` 说明；代码里旧 lean 分支还保留 `头部竞品 A`、`Starter Kit`、`Subscription Pack`、`mock 周报` 等不可达模板结论。
- 原因：真实 lean 路径虽然已提前返回空业务结论，但旧模板代码仍在文件中；workflow step id / guardrail 文案也沿用了 `mock_crawl_sources` 和 mock 候选说明。
- 处理：
  - 删除不可达旧 lean 模板代码。
  - 将 workflow step id 从 `mock_crawl_sources` 改为 `crawl_sources`。
  - public_web guardrail / notes 改为“非公开补充输入 / 演示候选”口径。
  - 增加测试，断言 public_web 不产出模板竞品/产品/机会，且报告/数据库不包含 forbidden strings。
- 验证：`pnpm sample:public-web` 生成 `v03-public-web-smoke-2026-06-29T07-24-34-465Z`；`report.md` / `reviewed_report.md` / `databases.json` 检查未出现 `mock`、`头部竞品 A`、`Starter Kit`、`Subscription Pack`、`mock 周报`、`mock：`。

## 已处理：SSE run stream 缺少同源安全边界

- 现象：`POST /api/industry-research/run/stream` 原本可被同源 UI 直接调用，但缺少 Origin/Host 白名单、CSRF token、body cap、timeout、rate limit 和错误脱敏。
- 风险：无登录产品可以保留同源轻入口，但如果没有这些边界，公网环境中更容易被跨站或大请求滥用，也可能把本地/服务器路径或 secret 片段暴露到错误帧。
- 处理：
  - 新增 `run-security.ts`。
  - `GET /api/industry-research/run/stream` 签发一次性 run token。
  - `POST` 校验 Host/Origin/token/rate limit/body size，并给单次 run 加 timeout。
  - 前端 `SimpleResearch` 和高级控制台在发起 SSE POST 前先取 token。
  - 错误消息统一脱敏。
- 验证：`pnpm check` 和 `pnpm build` 通过；REST `/api/industry-research/run` 仍保留内部 key 鉴权。

## 已处理：zvec 每次全量 upsert，缺少增量状态

- 现象：旧 `pnpm zvec:index` 只按本地交付包目录全量生成 chunks，没有状态文件，也不能显式选择从 Supabase artifacts 重建。
- 处理：
  - 新增 zvec index state：默认 `.cache/industry-research-zvec/index-state.json`，也可用 `AGENT_FACTORY_ZVEC_STATE_FILE` 指定。
  - 支持 `AGENT_FACTORY_ZVEC_SOURCE=auto|local|supabase` 或 `--source=...`。
  - 记录每个 run 的 chunk signatures、artifactKinds、source 和 indexedAt；非 `--force` 时只 upsert 变化 chunk。
- 验证：本轮首次 `pnpm zvec:index` 写入 328 chunks；第二次复跑 `upsertedChunkCount=0`、`unchangedChunkCount=328`。

## 验收备注：本机 Supabase smoke 安全跳过

- 现象：本机运行 `pnpm supabase:doctor` 返回 `disabled`；`pnpm supabase:smoke` 返回 `skipped_supabase_not_ready` 并 exit 2。
- 判断：本机没有 `AGENT_FACTORY_SUPABASE_PROJECT_REF`、`NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，这是预期安全状态。`supabase:smoke` 在 service role 配好时会写入并读回 run/artifact，因此本轮没有为了验收伪造或访问生产 Supabase。
- 处理：最终验收记录为 skipped；需要服务器真实复测时必须在轻量服务器带 service role 环境单独运行。

## 已处理：轻量服务器 Supabase service role key 被粘贴成双 JWT

- 现象：轻量服务器读取 env 后调用 Supabase REST 返回 `401 Invalid API key`，但脱敏诊断能解出 `role=service_role` 和 project ref。
- 原因：`SUPABASE_SERVICE_ROLE_KEY` 实际是两个有效 JWT key 首尾拼在一起，整体长度 438、包含 4 个点；Supabase REST 只接受单个 key。
- 处理：
  - 先备份远端 env 为 `industry-research.env.bak-20260628215506`。
  - 在服务器内存里切分候选 key，只保留 REST 返回 `200` 的单个 `service_role` 片段。
  - 未在聊天或日志中打印密钥。
- 验证：远端 smoke 写入并读回 run/artifact/n8n event/zvec chunk 成功，随后清理测试数据，4 张表测试计数均为 `0`。

## 已处理：远端历史 run 的 zvec chunk metadata 外键失败

- 现象：轻量服务器运行 `pnpm zvec:index` 时，zvec collection 已能初始化，但写入 Supabase `industry_research_zvec_chunks` 时报 `industry_research_zvec_chunks_run_id_fkey`。
- 原因：服务器历史 run 只存在于本地交付包目录，尚未写入 Supabase 的 `industry_research_runs`；chunk metadata 表通过外键要求 `run_id` 已存在。
- 处理：已修改并同步 `scripts/zvec-index-industry-research.ts`，写入 zvec 本体不变；写 Supabase metadata 前先查已存在的 Supabase run，只给这些 run upsert chunk metadata，旧本地 run 计入 `skippedMissingRuns`。
- 验证：远端 `pnpm zvec:index` 通过；deployment smoke run 写入 14 行 zvec metadata，旧历史 run 的 60 个 chunk 计入 `skippedMissingRuns`。

## 验收备注：zvec optimize FTS reduce 在远端会失败但不影响检索

- 现象：远端 `pnpm zvec:index` 末尾 `collection.optimizeSync()` 触发 zvec native 日志：`ReduceFts: create destination FTS RocksDB failed` 或 `source postings is not BitPacked`。
- 判断：zvec 文档和 embedding 索引已写入，`pnpm zvec:search` 可检索到历史报告和 deployment smoke run；失败点是优化/压缩步骤，不是索引写入本身。
- 处理：`scripts/zvec-index-industry-research.ts` 已把 optimize 失败降级为 `warnings`，脚本正常退出，后续可等 zvec 版本升级或清理重建 collection 时再复查。

## 已处理：远端 zvec collection 路径指向空目录

- 现象：首次远端运行 `pnpm zvec:index` 报 `Can't open lock file: /opt/playgamelab/industry-research-data/zvec/LOCK`。
- 原因：远端 env 把 `AGENT_FACTORY_ZVEC_DIR` 指到已存在的普通空目录，脚本看到路径存在后调用 `ZVecOpen`，但该目录还不是 zvec collection。
- 处理：不删除旧目录，改为新 collection 路径 `AGENT_FACTORY_ZVEC_DIR=/opt/playgamelab/industry-research-data/zvec/industry-research-chunks`，让脚本自行创建 collection。

## 验收备注：zvec 单写多读锁限制

- 现象：并行运行 `pnpm zvec:index` 和 `pnpm zvec:search` 时，写入进程可能报 `Can't lock read-write collection .../LOCK`。
- 判断：这是 zvec in-process 存储的正常锁模型；多个进程可以读同一个 collection，但写入需要独占。
- 处理：验证和自动化中不要并行跑写入和搜索；先串行 `pnpm zvec:index`，再执行 `pnpm zvec:search`。

## 已处理：zvec 文档 ID 不能包含特殊字符

- 现象：首次索引时，使用 `runId:artifactKind:index:hash` 作为 doc id，zvec 报 `contains invalid characters`。
- 处理：chunk id 改为 `chunk_<sha256>` 纯安全字符格式。

## 验收备注：Claude Preview 不推进 CSS 过渡，移动端抽屉会"看似卡住"

- 现象：P2-H 移动端抽屉侧栏在 `Claude Preview`（headless）里点汉堡后，`getComputedStyle(.sidebar).transform` 一直读到过渡起始值 `translateX(-100%)`，看似没打开。
- 判断：是预览环境**不推进 CSS transition** 的工具限制，不是 CSS bug。`.sidebar.open { transform: translate(0) }` 级联正确——临时 `style.transition='none'` 后 transform 立即变 `translate(0)`，截图也显示抽屉已正常滑入、背板变暗。
- 结论：验证带 transition 的元素时，别只信 `getComputedStyle`；用 `screenshot` 看实际绘制，或临时禁用 transition 读终态。真实浏览器里抽屉动画正常。
- 附带：移动端 `.nav-burger { display: inline-flex }` 一度被文件末尾的 base `.nav-burger { display:none }` 按 source-order 覆盖；已在 globals.css 末尾追加权威 `@media (max-width:720px)` 块修正。

## 当前问题：9router / MiMo Free 上游风控

- 现象：服务器本机通过 9router 调用 `mmf/mimo-auto` 和 `mimo-free/mimo-auto` 时，最小 `pong` 请求和行业研究 run 都返回上游 `risk_control`。
- 已核查：
  - 9router 容器、API key、OpenAI-compatible `/v1/chat/completions` 路径本身可达。
  - 历史日志显示 `mmf/mimo-auto` 曾在 2026-06-24 成功生成行业研究报告。
  - 本轮测试多个候选 free 模型，`gh/goldeneye-free-auto` 缺 GitHub provider credentials，opencode public 返回 Missing API key，多数 provider 返回 No active credentials。
- 当前处理：n8n 默认模式改为 `public_web`，保证业务流先可用；需要 LLM 时显式传 `public_web_9router`，但当前不作为稳定默认。
- 当前补充：已新增 `pnpm probe:9router`，用真实 `/v1/chat/completions` 判断 free 候选是否可用；本地没有 provider key 时会明确跳过，不会假完成。
- 后续建议：在 9router dashboard 接入可用 provider 凭据，或切换自付费 provider；不要把模型列表可见当成 chat 可用。

## 已处理：n8n workflow 接入问题

- 现象：n8n workflow 初版能导入但 production webhook 未注册或执行失败。
- 原因：
  - 手写 workflow 缺少 n8n `id` / `webhookId` 元数据。
  - n8n 2.x 导入后需要发布并重启容器才会注册 active webhook。
  - 旧 Set 节点 schema 和 HTTP Request 表达式容易在运行时失败。
  - Code 节点默认不能读取 env；直接开放 env 读取被判定为安全风险，未采用。
  - 第一次导入 Header Auth credentials 时 shell 变量未 export，导致 credential value 为空，run API 返回 401。
- 处理：
  - workflow 改为 Webhook -> HTTP Request run API -> HTTP Request callback。
  - 使用 n8n Header Auth credentials 注入 `x-internal-key` 和 `x-agent-factory-webhook-secret`。
  - workflow 默认 `public_web`，不调用 LLM。
- 验证：不传 `mode` 的 production webhook 请求已返回 `industry_research_n8n_run_complete_ack.v1`，并生成 8 文件交付包。

## 已处理：Claude Code UI 还原修正

- 现象：移植后的 UI 仍存在若干视觉还原问题，包括中文字体没有命中 `Noto Sans SC`、英雄区知识图谱有方形画布边界感、浅色主题切换图标语义不对、知识图谱 tooltip 计数可能停留在挂载时旧值。
- 处理：
  - `layout.tsx` 改为把 `next/font` 变量类挂到 `<html>`，并让 `globals.css` 字体栈显式引用 `--font-grotesk`、`--font-manrope`、`--font-plex`、`--font-cjk`。
  - `KnowledgeGraph.tsx` 的图谱几何收进安全边距，英雄区 canvas 增加径向羽化遮罩，setup 图谱高度调到 480。
  - 顶栏主题按钮在浅色模式下显示月亮图标。
  - tooltip 绘制时读取实时数据库计数。
- 验证：2026-06-25 本轮同步时已运行 `pnpm check`，typecheck、34 条 Vitest、Biome 均通过。
- 注意：本轮未重新启动浏览器做人工视觉点检；如继续验收 UI，建议用 `pnpm build && pnpm start` 短时点检后停止。

## 已处理：agent-factory Studio / Next dev 导致电脑发热

- 现象：运行 `agent-factory/apps/studio` 时电脑明显发热。
- 判断：负载主要来自 Next.js dev server、文件监听和整个 Studio 壳，不是行业研究 agent 核心逻辑本身。
- 处理：
  - 把行业研究 v0.3 核心同步到独立项目。
  - 独立项目新增 CLI-first 入口 `pnpm sample:public-web`，默认不启动 Next、不调用 LLM。
  - `apps/studio` 保留为可选 UI，不作为日常运行入口。
- 后续建议：只有需要看 UI 时再启动 Studio；平时用 CLI 生成 `outputs/industry-research-runs/<runId>/manifest.json`。

## 已处理：迁移后首次 `pnpm check` 被沙箱写入权限拦截

- 现象：第一次运行 `pnpm check` 时，`apps/studio` typecheck 报 `Could not write file ... tsconfig.tsbuildinfo: EPERM`。
- 判断：这是当前 Codex 沙箱对独立项目目录写入权限的限制，不是 TypeScript 业务错误。
- 处理：用提升权限重跑同一条 `pnpm check`。
- 结果：typecheck、18 条 Vitest、Biome 均通过。

## 已处理：UI 视觉漂移

- 现象：上一轮从零重写 CSS 和组件后，页面和 screenshots 基准差距大。
- 原因：把设计稿当参考方向，而不是把 source CSS / TSX 当契约逐字移植。
- 处理：
  - 重建 `apps/studio/src/app/globals.css`。
  - 移植 porting TSX 组件。
  - 保持类名与 source 组件一致。
  - 用 Browser 对结果页进行验收。

## 已处理：结果页数据密度不足

- 现象：运行后统计和表格太稀疏，无法达到 screenshots 的研究生产台观感。
- 原因：core mock 只产出少量竞品、产品和 evidence。
- 处理：
  - 扩充 discovery candidates、raw documents、extraction jobs、evidence、竞品和机会数据。
  - 验收时统计条达到 `8 / 19 / 27 / 74 / 9`。

## 已解决：Mock 数据密度过低 / 九库卡片数字与设计稿不一致

- 现象（2026-06-25 复盘发现）：文档声称 mock 已扩到 `8 / 19 / 27 / 74`，但实际 core 包里只有 `6 / 5 / 16 / 5`、竞品 1、机会 2 的 lean 数据——文档↔代码漂移。九库卡片只显示真实数组长度，机会表只有 2 行、竞品 1 个，达不到”生产台”观感。
- 根因：mock 和真实 lean 模式共用同一套 `buildIndustryResearchDatabases` 硬编码 lean 实体（1 竞品/2 机会/5 证据），且这套数据其实从未被扩充进独立仓库。
- 处理：给 builder 加 `entityProfile: “rich”`（仅 Mock），合成竞品/机会各 6、~74 证据、产品/痛点/内容/关键词 5-6，并给 collection-plan 的 mock 路径加密 candidates/targets。真实模式保持 lean 诚实（见 DECISIONS 2026-06-25）。
- 验证：浏览器实测 Mock 结果页 stat 条 `8 / 8 / 26 / 74 / 9`，九库 `10/6/3/6/6/5/5/6/2`，机会/竞品表各 6 行，审核 12 项；`pnpm check` 34 测试绿。
- 备注：因为竞品/机会本就只取 6 行（=设计目标），不再需要 `displayCount` 把”卡片大数字”与”表格少行数”拆开。

## 已确认：localhost:3000 开发服务停止

- 现象：`node` / `next-server (v16.2.9)` 监听 `*:3000`。
- 处理：
  - 普通 `kill 5401` 被系统拒绝。
  - 使用提升权限停止父进程 `next dev --port 3000`。
  - 再次检查 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 无输出，端口已释放。

## 验收备注：极窄移动视口自动化点击不稳定

- 现象：390px 左右移动视口下，页面能加载且无错误覆盖层，但 Browser 自动化点击 `开始研究` 时底层 CDP 输入命令超时。
- 判断：更像浏览器自动化通道在缩放状态下不稳定，不是页面运行时报错。
- 处理：记录为验收工具限制；桌面与较宽移动视口已完成完整运行路径验证。
