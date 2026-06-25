# 决策记录

更新时间：2026-06-25

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
