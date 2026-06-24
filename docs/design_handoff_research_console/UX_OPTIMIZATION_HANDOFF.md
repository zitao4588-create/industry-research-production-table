# 前端 UX 优化交接文档 · 行业研究生产台

> **更新时间**：2026-06-22
> **受众**：Codex / 接手前端的开发者
> **性质**：基于**已移植到仓库的真实代码**（不是设计原型）做的一次全面 UX 复盘 + 可执行任务清单。
> 这份文档是 `ROADMAP.md` 的「as-built」升级版：ROADMAP 写的是设计阶段的设想，这份写的是**移植后代码的真实状态**和**据此排好的落地项**。两者冲突时以本文件为准。

---

## 0. 怎么读这份文档

- **前置阅读**（同目录）：`README.md`（界面/组件规格）、`DATA_CONTRACT.md`（数据形状与事件流）、`ROADMAP.md`（原始设想）。
- **仓库现状文档**（根目录）：`PROJECT_CONTEXT.md`、`DECISIONS.md`、`BUG_NOTES.md`、`TODO.md` —— 里面有硬约束和已知坑，**动手前必须读 `DECISIONS.md`**。
- 任务清单沿用 ROADMAP 的格式：**现象 / 为什么 / 怎么做 / 落点 / 验收**。落点都带 `file:line`，按当前 `main` 的代码定位。
- 优先级：🔴 P0（信任根基/线上必撞）→ 🟠 P1（高价值、后端已就绪）→ 🟡 P2（打磨）。

---

## 1. 一句话现状（最重要的认知）

**当前前端是一套视觉完成度极高、但「接线」只完成一半的演示外壳。视觉完整 ≠ 功能就绪——不要被界面的精致骗了。**

具体来说：

- 界面今天发起的**真实后端请求数为 0**（`grep fetch( / EventSource` 在 `industry-research/` 里只命中两行注释）。
- 「开始研究」无论选哪个运行模式，**永远只跑本地 mock**，再用 `setTimeout` 回放一段编排好的假事件。
- 但**后端其实已经就绪**：真实 run、交付包落盘、run 列表/详情/下载、审核版报告生成、n8n webhook 合约全都有路由（见 §3）。
- 缺的不是后端，是**前端没接 + 没有失败态 + 结果不可操作**。

所以本轮的核心动作是「**把已就绪的后端接上，并补齐真实运行一定会撞到的非 happy-path**」，而不是继续做视觉。

---

## 2. 硬约束（不要踩的线）

来自 `DECISIONS.md` / `BUG_NOTES.md` / `docs/industry-research-v03-boundary.md`，**违反会引发返工或安全问题**：

1. **不默认长跑 `pnpm dev`**。Next dev server 会让机器明显发热（BUG_NOTES 有记录）。验收用 `pnpm check` / `pnpm test`，需要看 UI 时用 `pnpm build && pnpm start` 做点检，跑完即停。
2. **`adapters/research.ts` 与 `adapters/run-events.ts` 的架构边界保持不动**。渲染层只认 UI 模型；真实数据通过 `adaptRun(raw)` 进来，事件通过 `deriveRunState(events)` 派生。要加字段（如 `displayCount`）走 adapter / UI model，别在组件里硬编码视觉数字。
3. **CSS 类名是契约**。`globals.css` 与 source 逐字对齐过（DECISIONS 2026-06-15）。新增样式可以加，但**不要重命名/重写既有类**，否则视觉漂移。
4. **public_web 采集边界**：只抓公开 `http/https`，不绕登录/验证码/付费墙/robots，不用代理池。前端任何「补充资料 URL」入口都不能诱导用户突破这条线。
5. **不做登录/支付/多租户**。生产若仍指向 localhost LLM 必须被拒（设置页文案已声明，别删）。
6. **本地 JSON / Markdown 留档能力不能被删**。下载/导出是**附加**，不是替代。

---

## 3. 后端已就绪的能力（前端接这些就行）

所有路由都在 `apps/studio/src/app/api/industry-research/` 下，**均需鉴权**（`authorizeIndustryResearchRequest`，见 `_lib/server-env.ts`）。

| 路由 | 方法 | 作用 | 入参 / 出参 |
|---|---|---|---|
| `run/route.ts` | POST | 跑真实工作流 + 落盘交付包 | `{ mode, input }` → `{ result, deliveryPackage }`。**非流式**（一次性返回完整 `result`）。 |
| `runs/route.ts` | GET | 本地 run 列表 | → run 摘要数组 |
| `runs/[runId]/route.ts` | GET | 单个 run 详情 | → run 详情 |
| `runs/[runId]/download/route.ts` | GET | 下载交付包 | → `attachment` JSON（`Content-Disposition` 已设） |
| `review-report/route.ts` | POST | 生成人工审核版报告 | `{ result, reviewItems? }` → `{ markdown }` |
| `webhooks/n8n-run-complete/route.ts` | POST | n8n 合约 | 预留，不在本轮范围 |

### 运行模式映射（UI ↔ API）— 接真实 run 必看

UI 当前四个按钮（`IndustryResearchWorkbench.tsx:341`）与 API 的 `mode`（`run/route.ts:14-21,101-115` 解析，`155-162` 归一）对应关系：

| UI 按钮 | API `mode` | 说明 |
|---|---|---|
| `Mock` | —（不发请求） | 保留本地 `runMockIndustryResearchWorkflow`，显式标注「演示数据」 |
| `DeepSeek` | `deepseek` | `glm/9router/deepseek` 在后端都归一为 `deepseek` |
| `Public Web` | `public_web` | 纯公开采集，不调 LLM |
| `Public + DeepSeek` | `public_web_deepseek` | 公开采集 + LLM 抽取 |

> ⚠️ **鉴权坑**：工作台是 client component，浏览器直连 `/api` 时怎么带内网 key 需要先确认（`_lib/server-env.ts` 里看放行逻辑）。如果不能把 key 暴露到浏览器，需要加一层同源 BFF / server action 代理。**这是 P0-A 的隐藏前置，先确认再动手。**

> ⚠️ **非流式坑**：`run` 路由跑完才一次性返回，**没有 SSE**。所以「真实逐步进度」有两种做法，见 P0-A。

---

## 4. 任务清单

### 🔴 P0-A　接真实运行，让运行模式真生效

- **现象**：`startRun()` 永远跑 mock（`IndustryResearchWorkbench.tsx:133`），`runMode` 只被当字符串显示（`:88` 定义，`:192/:195` 传给 Running/Results 仅做 label）。四个模式按钮是装饰。进度/计数/日志全是 `setTimeout` 回放（`:145-157`），活动日志时间戳用数组下标 `i` 编造（`:430`）。
- **为什么**：这是 UX 的信任根基。模式按钮「说一套做一套」是对用户的隐性欺骗，必须先消除。
- **怎么做**：
  - `startRun` 里按 §3 映射分流：`Mock` 走现有本地 mock（界面标注「演示数据」角标）；其余三个模式 `fetch('/api/industry-research/run', { mode, input })`。
  - 已有现成的 `adaptRun(raw.result)` 把响应转成 UI 模型（`adapters/research.ts:370`），**这步不用重写**。
  - **进度有两档，按工期选**：
    - **最小版（先做这个）**：真实模式下显示「不确定态」运行（步骤流转用 `createRunStartedEvents` 起头 + 一个 indeterminate 进度），`await` 完成后用 `adaptRun` 灌结果切 `done`。诚实但粗粒度。
    - **完整版（后续）**：把 `run` 路由改成 SSE（`ReadableStream` + `text/event-stream`），逐步 emit `RunEvent`；前端 `EventSource` 订阅，`setEvents` 累加即可——**`deriveRunState` 已经吃这套事件，渲染层零改动**（`:139-144` 注释已写好接入点）。
  - 真实模式失败时进入 P0-B 的错误态，不要静默卡住。
- **落点**：`IndustryResearchWorkbench.tsx:121-158`（`startRun`）；SSE 完整版另动 `api/industry-research/run/route.ts`。
- **验收**：选 `Public Web` 真的发出 `/api/.../run` 请求并渲染真实结果；选 `Mock` 不发请求且有「演示」标识；断网/报错时不是无限转圈。

### 🔴 P0-B　补齐非 happy-path（骨架 / 错误 / 空 / 部分成功）

- **现象**：ROADMAP P0-3 至今未做。`run.error` 事件类型、`deriveRunState` 的 error 分支、`Running` 里 `d.error` 渲染**都写好了但 mock 从不吐错**（`run-events.ts:16-68` 有 `run.error`，但 `createMockRunEventTimeline` 不产），所以这条路从没被走过。空状态只有 `NeedRun` 一种且语义错位（见 P2-J）。
- **为什么**：真实跑一定撞——源发现为空、官网 403、抽取坏 JSON、LLM 超时、mock 与真实不一致。没有这些态就是线上事故。
- **怎么做**：新增三个复用 `.empty` 风格的组件——
  - `<Skeleton/>`：stat 条 / 九库卡 / 表格的 shimmer 占位，真实 run 期间先占位。
  - `<ErrorState/>`：失败步骤在「建库流程」里标红（`stepStatus==='failed'` 已支持，`run-events.ts:329-331`）+ 错误详情 + 「重试该步 / 重试整轮」。
  - **逐库填充**：九库**逐个**出现而非一次性（`db.upserted` 事件已逐个 emit，`run-events.ts:183-195`），半截 run 也能用。
  - 某库 0 条时给原因 + 「补充资料 / 重试」入口，而不是空白。
- **落点**：`IndustryResearchWorkbench.tsx` 的 `Running`（`:355`）/ `Results`（`:486`）各结果组件加状态分支；新增 `components/states.tsx`（Skeleton/ErrorState）。
- **验收**：手动注入一条 `run.error` 事件能看到红步骤 + 重试；某数据库 count=0 时显示带原因的空态而非空白卡。

### 🔴 P0-C　表单接线 + 校验

- **现象**：
  - **补充资料三个 textarea（URL/CSV/手动文本）完全没绑 state**（`:333-335` 只有 `placeholder`/`defaultValue`，无 `onChange`），用户输入被丢弃，`input.urls/csvText/manualText` 永远是默认空值。
  - 研究模板 `<select defaultValue="e">` 写死（`:323`）；设置页 Base URL / Model 也只是 `defaultValue`（`:784-785`），改了不生效。
  - **零校验**：六个带 `*` 的必填项全空也能点「开始研究」（`startRun :121` / 按钮 `:347` 无任何守卫）。
- **为什么**：表单「看着完整、实则只有 6 个字段进得去」，且能用空数据发起真实 run（真实模式会真的烧 LLM / 爬虫额度）。
- **怎么做**：
  - 三个 textarea 绑到 `input.urls`（按行 split）/`csvText`/`manualText`，复用现成的 `setField` 模式（`:177`）。
  - 必填项任一为空 → 「开始研究」`disabled` + 字段下红字提示；URL 行做公开 `http/https` 轻校验（呼应 §2 约束）。
  - 设置页表单绑 state 或明确标注「展示用，尚未生效」（二选一，别留假输入）。
- **落点**：`IndustryResearchWorkbench.tsx` `Setup`（`:282-352`）、`SettingsView`（`:781`）。
- **验收**：在补充资料里填的 URL 能进 `input` 并出现在请求体；必填空时按钮置灰。

### 🟠 P1-D　结果可操作：下载交付包 + 审核回写（后端已就绪，ROI 最高）

- **现象**：`ReportCard` 只有「复制」（`:716-730`，copy 在 `:720`）。人工审核勾选存在 `useState`（`ReviewCard :693`），**切个视图就丢**，不回传。机会无「转选题 / 加监控 / 导出」任何动作。而后端 `runs/[runId]/download` 和 `review-report` 路由都现成。
- **为什么**：纯前端接口活，后端零改动，用户立刻有感——本轮**性价比最高**的一项。
- **怎么做**：
  - 报告卡「复制」旁加「**下载交付包**」→ `GET /runs/:runId/download`（注意 §3 鉴权坑；真实 run 返回里带 `deliveryPackage`，可拿到 runId）。
  - 审核卡加「**提交审核结果**」→ 把 picks 映射成 `reviewItems` POST 给 `review-report`，用返回的 `{ markdown }` 刷新报告卡（这就是 `reviewed_report.md` 的在线版）。
  - 至少给机会表加一个「导出 CSV」（前端生成即可，不依赖后端）。
- **落点**：`IndustryResearchWorkbench.tsx` `ReportCard`（`:716`）、`ReviewCard`（`:687`）。
- **验收**：点「下载交付包」能下到 JSON 附件；改审核状态后「提交」能拿到新 markdown 并渲染。

### 🟠 P1-E　证据溯源弹层（核心卖点，目前点不开）

- **现象**：Hero 文案主打「可检索/可溯源的情报网」，但点任意机会/竞品/痛点的分数**什么都不发生**。`evidence` 计数一路贯穿到 UI（各表都有 evidence 列），但没有来源弹层。
- **为什么**：「可溯源」是产品核心卖点，没有 UI = 卖点落空。
- **怎么做**：新增 `<EvidencePopover/>`，点单元格弹来源 URL + 原文片段 + 置信度。字段可先贯通、后端先返空数组（DATA_CONTRACT §6 有形状）。表格单元格挂 `evidenceId`。
- **落点**：新增 `components/EvidencePopover.tsx`；各 `*Table`（`:577` 起）单元格挂 id。
- **验收**：点机会的「证据质量」分能弹出至少一条来源（真实或占位）。

### 🟠 P1-F　无障碍（目前几乎为零）

- **现象**：整个 `industry-research/` 目录 **0 个 aria/role/alt**。导航项、九库卡、tab、审核按钮、排序表头全是 `<div onClick>` / `<th onClick>`，键盘不可达、读屏不可用。Canvas 图谱无文字替代。状态全靠色相（color-only）。
- **为什么**：可达性是产品底线，也影响键盘流用户的效率。
- **怎么做**：可点元素改 `<button>` 或补 `role` + `tabIndex` + `onKeyDown`；排序表头补 `aria-sort`；状态 pill 除颜色外加文字/图标；Canvas 补 `aria-label` + 隐藏的文字版数据库清单。
- **落点**：`IndustryResearchWorkbench.tsx`（Sidebar `:217`、db-card `:537`、tabs `:553`、表头 `:592`、审核按钮 `:706`）、`KnowledgeGraph.tsx:228`。
- **验收**：Tab 键能走通主流程；排序表头可键盘触发。

### 🟠 P1-G　刷新即丢失

- **现象**：移植时丢掉了原型的 `localStorage` 持久化，`page.tsx` 也不传 `initialModel`（`page.tsx:1-5`）。**刷新 = 回 setup，跑完的结果全丢**。
- **为什么**：真实 run 要等采集 + LLM，丢结果代价大。
- **怎么做**：最小版——把 `phase` + 最近 `resultModel`（或 runId）存 `localStorage`/URL query，刷新后用 `runs/:id` 拉回。注意 SSR 首帧别闪烁（`html.booted` 门控已在）。
- **落点**：`IndustryResearchWorkbench.tsx:85-99`（state 初始化）、`page.tsx`。
- **验收**：done 态刷新后仍停在结果页。

### 🟡 P2-H　移动端导航直接消失

- **现象**：`@media (max-width:720px)` 里 `.sidebar { display:none }`（`globals.css`）**没有替代**——窄屏彻底失去所有视图切换。BUG_NOTES 记了 390px 交互不稳。
- **怎么做**：≤720px 顶栏加汉堡 → 抽屉式侧栏；`.table-wrap` 加横向滚动 + 边缘阴影提示；命令面板移动端适配（宽度已处理，键盘 UX 待验）。
- **落点**：`globals.css`（720 媒体查询块）、Topbar（`:256`）、Sidebar（`:217`）。
- **验收**：375–414px 下能打开抽屉切换所有视图；宽表可横滑。

### 🟡 P2-I　九库计数与「生产台」叙事不匹配

- **现象**：BUG_NOTES 已记。卡片显示真实数组长度（如 7/6/6/5…），但叙事规模应是 24/18/57…。根因是 UI model 只有一个 `count` 同时供卡片和表格。
- **怎么做**：给 `UIDatabaseSummary` 加 `displayCount`（adapter 里产出沉淀规模），卡片显示 `displayCount`，表格仍只渲染精选 5–6 行。**走 adapter，别在组件硬编码**（§2 约束）。
- **落点**：`adapters/research.ts`（`UIDatabaseSummary` 类型 `:93`、`createDatabases` `:205`）、db-card（`:537`）。
- **验收**：卡片数字达到设计规模，表格行数不膨胀。

### 🟡 P2-J　导航 / 状态耦合的意外行为

- **现象**：
  - `NeedRun` 按钮叫「去研究台」，`onClick` 却直接 `startRun`（`:200`，组件 `:733`）——文案说「去」，实际「立刻开跑一整轮」。
  - 命令面板搜竞品回车会 `setPhase("done")`（`onNavigate :168`）——**跑到一半搜一下被强行甩到完成态**。
  - `phase` 与 `view` 两套状态手动同步，分支散在 `:188-207`，易出边角态。
- **怎么做**：`NeedRun` 改为「去研究台」只切 view、由用户在表单点开始；命令面板 `target.done` 仅在已 done 时才切，running 期间禁用结果跳转；把 phase×view 的可见性收敛成一个派生函数。
- **落点**：`IndustryResearchWorkbench.tsx:166-208`、`NeedRun :733`。
- **验收**：running 期间命令面板不会把人甩出运行态。

### 🟡 P2-K　细节打磨

- 明暗切换图标错误：浅色模式显示 `settings` 齿轮（`:275`），应为月亮图标。
- 知识图谱 `buildModel` 只在挂载跑一次（`KnowledgeGraph.tsx:82-83` + 空依赖），`databases` 后续变化不重建 → hover tooltip 的「X 条」是陈旧/为 0 的值。让 model 随 db count 变化重建，或 tooltip 直接读 `dbRef.current`。
- 运行模式术语漂移：UI `Public + DeepSeek`、设计稿 `Public+9router`、API 还有 `glm/9router` legacy。统一对外口径（建议以 §3 表为准）。
- setup 的 `9 / 13 / 6` 统计条疑似视觉回归（`.hero-stats` 在 `globals.css:471-482` 有第二段连体改写覆盖第一段，截图里标签像被裁切）。**需 `pnpm build && pnpm start` 本地点检确认**（别长跑 dev）。

---

## 5. 验收基线（不长跑 dev 的前提下）

每轮改完至少跑：

```bash
pnpm --filter @industry-research/core typecheck
pnpm test          # 现有 18 条 Vitest，别让它变红
pnpm check         # Biome
# 需要看 UI 时，点检完即停，别留着 dev：
pnpm build && pnpm start
```

回归基线（来自 BUG_NOTES，改 UI 别打破）：结果页统计条应达到 `8 / 19 / 27 / 74 / 9` 的密度量级；明暗双主题、reduced-motion、噪点/玻璃/光晕质感层保持。

---

## 6. 关键文件地图

| 文件 | 作用 |
|---|---|
| `apps/studio/src/app/industry-research/IndustryResearchWorkbench.tsx` | 主装配（788 行）：三阶段 + 侧栏/顶栏 + 所有表格 + 审核/报告卡 |
| `…/industry-research/adapters/research.ts` | `adaptRun` / `createModelFromInput` / UI 类型 —— **架构边界，慎改** |
| `…/industry-research/adapters/run-events.ts` | `RunEvent` 枚举 + `deriveRunState`（事件→渲染状态）—— SSE 接入只喂事件即可 |
| `…/industry-research/components/{components,micro,extras,KnowledgeGraph}.tsx` | 共享件 / 微图 / ⌘K+Toast+Markdown / Canvas 图谱 |
| `apps/studio/src/app/globals.css` | 设计系统（731 行）—— **类名是契约** |
| `apps/studio/src/app/api/industry-research/**` | 真实后端（run / runs / download / review-report / webhook）—— **已就绪，等前端接** |

---

## 7. 建议执行顺序

1. **先确认 §3 的「鉴权坑」**（浏览器能否直连带 key，否则先加 BFF 代理）——这是 P0-A 的前置。
2. **P0-C 表单接线 + 校验**（小、快、低风险，先建立协作节奏）。
3. **P1-D 下载交付包 + 审核回写**（后端就绪、纯前端、用户立刻有感，ROI 最高）。
4. **P0-A 接真实运行**（先做「最小版」不确定态，SSE 完整版排后）。
5. **P0-B 三态补齐**（紧跟 P0-A，真实接入后立刻会撞）。
6. 之后：P1-E 可溯源 → P1-F 无障碍 → P1-G 持久化 → P2 系列。

> P0-A 标了 P0 因为它是信任根基，但工期最长、有 SSE 子任务；P0-C / P1-D 更小更稳，**建议先做 2、3 建立节奏，再啃 4、5**。
</content>
