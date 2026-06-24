# 移植指南 · PORTING_GUIDE

> **给 Codex / 接手者**:第一版交接出现了明显视觉漂移。根因诊断 + 修复方法都在这里。
> **一句话**:这一轮**不要"参考着重写"——要"逐字移植"**。把设计稿的 `globals.css` 原样搬入、类名一一对齐、canvas 图谱和 SVG 微图按原样移植成真组件,数据来源换成你已建好的 `UIResearchModel`。

---

## 0. 为什么第一版差很多(根因)

对比 `apps/studio/src/app/globals.css`(当前) 与 `porting/source/globals.css`(设计稿权威):

| 维度 | 第一版的做法(错) | 应该的做法 |
|---|---|---|
| **CSS 来源** | 手写了全新 3520 行 `rc-*` 样式,靠截图/文字近似 | **逐字搬入** `source/globals.css`,类名不改 |
| **配色** | 近似 hex(`#05090b`/`#0e141b`…) | 用原始 `oklch()` 值,色彩关系才对 |
| **知识图谱** | DOM `div` + 静态 SVG 摆位 | 移植 `source/graph.jsx` 的 **canvas 自绘**(粒子+连线渐织+光晕+hover) |
| **微型图表** | CSS `div` 柱子近似 | 移植 `source/micro.jsx` 的 **SVG 组件**(含描绘动画、类别 hue-rotate) |
| **质感层** | 玻璃/噪点/inset 高光/多层阴影大量丢失 | 跟 `globals.css` 走,一个不少 |
| **类名** | 自创 `.rc-page/.rc-sidebar/...` | 用设计稿类名 `.app/.sidebar/.console/.db-card/...` |

结论:漂移不是手艺问题,是**"重写"这个动作本身**带来的——近似值累加 = 完全不同的观感。改成移植即可消除。

---

## 1. 保留什么 / 替换什么

**✅ 保留(架构正确,别动)**
- `adapters/research.ts`(`adaptRun` / `UIResearchModel` / `UIResearchStats` / `UIDatabaseSummary`)
- `adapters/run-events.ts`(`RunEvent` / `deriveRunState` / 事件时间线)
- `fixtures/research-console.ts`
- 与 `@industry-research/core`(`runMockIndustryResearchWorkflow`)的接线、`api/industry-research/run`

**♻️ 替换(表现层,这是漂移所在)**
- `globals.css` 里的 `rc-*` 整段 → 删除,改为引入 `source/globals.css`(逐字)
- `IndustryResearchWorkbench.tsx` 的 **JSX 标记与类名** → 重写为设计稿结构(见 §4 组件对照),数据用现有 `UIResearchModel`
- 手写的图谱/微图近似实现 → 用 `source/graph.jsx` / `source/micro.jsx` 的真实实现

---

## 2. globals.css 怎么搬(零改动原则)

1. 把 `source/globals.css` **整段**复制进 `apps/studio/src/app/globals.css`(替换掉所有 `rc-*` 规则;若有项目级 reset/字体 import 想保留,放在文件**最上方**,别改设计稿规则体)。
2. 字体:`layout.tsx` 里引入这四个家族,**缺一不可**(第一版漏了 Space Grotesk 展示字体):
   `Space Grotesk`(--font-display 标题)、`Manrope`(--font-sans 正文)、`IBM Plex Mono`(--font-mono 数据)、`Noto Sans SC`(中文)。用 `next/font/google` 或 `<link>` 均可,务必让 CSS 变量 `--font-display/-sans/-mono` 指到它们。
3. **主题**:设计稿用 `:root` 暗色默认(注意——设计稿 `<html>` 无属性即暗色;亮色在 `[data-theme="light"]`)。把 `data-theme` 挂在 `<html>` 或根容器上即可切换。
4. **主色**:`--accent` 在 `:root` 有默认值(`#34dcc0` 系)。若要可配置,运行时 `style.setProperty('--accent', x)` 即可;别把 accent 写死进各规则。
5. **不要**:不要把 `oklch()` "顺手"换成 hex、不要调圆角/阴影/透明度的值、不要删噪点层(`body::after`)和玻璃(`backdrop-filter`)。这些就是质感本身。

> 验收:搬完后,即使 JSX 还没改,把一个元素手动加上 `class="db-card"` 也应当立刻呈现设计稿那张卡的样子。CSS 与标记是解耦的。

---

## 3. 把 .jsx 源转成 .tsx(已替你转好)

**好消息:`porting/tsx/` 里已经是转换完成的 TSX 成品**——`components.tsx`、`KnowledgeGraph.tsx`、`micro.tsx`、`extras.tsx`,视觉/绘图逻辑一行未改,只做了 `"use client"`、import/export、`window.IRP`→props、补类型。直接拷进 `apps/studio/src/app/industry-research/components/` 即可,**不必再手工转换**。详见 `porting/tsx/README.md`。

(若你仍想从 `source/*.jsx` 自己转:顶部加 `"use client"`;`const { useState } = React` → `import {...} from "react"`;删文件末尾 `Object.assign(window,…)` 改 `export`;`window.IRP` 读取改 props;绘图逻辑别动。)

---

## 4. 组件对照表(设计稿类名 ← 数据)

按设计稿 `source/app.jsx` 的结构重建 `IndustryResearchWorkbench.tsx`。关键容器类名**必须一致**(CSS 全靠它们):

| 区域 | 设计稿类名 / 组件 | 数据来源(你已有的模型) |
|---|---|---|
| 外壳 | `.app`(grid)`.sidebar` `.main` `.topbar` | — |
| 侧栏导航 | `.nav-item(.active)` `.nav-group-label` `.rail-card` | 静态导航 + run 状态 |
| 顶栏检索 | `.search-pill`(开 ⌘K) | — |
| setup 英雄区 | `.hero-split` `.hero` `.hero-eyebrow` `h1>em` `.hero-stats` | `model.project` |
| setup 图谱 | `<KnowledgeGraph building={false} progress={1}/>` | `model.databases`(节点取自它) |
| 创建项目卡 | `.console` `.field-grid` `.field` `.runmode` `.btn-primary` | 表单 → `ResearchWorkflowInput` |
| running 舞台 | `.run-stage` + `<KnowledgeGraph building progress={p}/>` 覆盖层 | `deriveRunState(events)` 的步骤/百分比/计数 |
| running 步骤 | `.steps .step(.done/.active/.pending)` | `workflowSteps` + 事件 |
| running 源流 | `.stream .stream-item`(method 标签 + `.pri`) | `source.found` 事件 → `sourceCandidates` |
| 统计条 | `.stat-row .stat-cell`(数字 count-up + `<StatSpark/>`) | `model.stats` |
| 机会大卡 | `<FeaturedOpportunity/>`:`.feature` + `<Radar/>` + count-up | `model.opportunities` 取最高分 |
| 数据库网格 | `.db-grid .db-card`(`--hue` 类别色)+ `<DbMicro id/>` | `model.databases` |
| 结果 tabs | `.tabs .tab` + 各表 | `model.*` |
| 二级表格 | `.table-wrap table.data` + `<InlineBar/>`/`<PriceScale/>`/`.chan-tag`/`.plat-badge` | 各库数组 |
| 人工审核 | `.card .review-item .ra-btn` | `model` 审核项 |
| 报告 | `.report-md` + `renderMarkdown(md)` | 由 model 拼 Markdown |
| 命令面板 | `<CommandPalette/>`(⌘K) | `buildIndex(model)` |
| Toast | `<Toaster/>` + `showToast()` | 完成/复制/通过时触发 |

> `source/app.jsx` 就是这张表的完整可运行实现——逐组件对着搬,把 `window.IRP` 换成 `model` 即可。

## 5. 数据接法(关键:别再读 window.IRP)
设计稿组件原本读全局 `window.IRP`。移植时:
- 顶层用你的 `adaptRun(...)` → `model: UIResearchModel`,逐层 props 下传。
- `KnowledgeGraph` 的 `buildModel()` 现在读 `window.IRP.databases` → 改成**接收 `databases` 参数**。
- `DbMicro` 的 `switch` 现在读 `window.IRP.*` → 改成接收 `model` 或具体数组。
- running 态:用 `deriveRunState(events)` 产出 `{ stepIndex, percent, counters, sources }`,喂给 `.steps`/`.stream`/覆盖层与 `<KnowledgeGraph progress=…>`。**完成视觉移植后,这是唯一需要你接真实事件的地方。**

## 6. 知识图谱(签名视觉,务必移植而非近似)
`source/graph.jsx` 的 `KnowledgeGraph({ progress, building, accent, height })` 是 canvas 自绘:节点=研究项目+9库+散点源,边随 `progress` 渐次织成,带浮动、光晕、ring 邻接线、**节点 hover 高亮+tooltip**。把 `buildModel()` 改为吃 `databases` 参数,其余 raf 绘制逻辑**原样保留**。这是第一版差距最大的地方,别再用 div 拼。

## 7. 微型图表(SVG,带描绘动画)
`source/micro.jsx`:`Spark/VBars/HBars/StackBar/Donut/NodeMini/Scatter/Blocks/Radar` + 派发器 `DbMicro`,以及表格用的 `InlineBar/PriceScale`。全是 SVG + CSS 动画(hover 时 `drawLine/growBar/drawArc` 等,见 `globals.css` 对应类)。类别色靠 `.db-card` 上的 `--hue` 做 `hue-rotate`。逐个搬,别用 CSS div 柱替代。

## 8. 验收清单(逐项对 `screenshots/`)
- [ ] 背景是多层径向光晕 + 噪点颗粒,不是纯色
- [ ] 卡片有玻璃感(backdrop-filter)+ 顶部 inset 高光 + 多层阴影
- [ ] 知识图谱是 canvas 动画,节点可 hover 出 tooltip
- [ ] 9 张数据库卡各自不同的 SVG 微图,hover 有描绘/生长动画,类别色相递进
- [ ] 机会大卡有发光雷达 + 综合分 count-up
- [ ] 统计条数字 count-up + 迷你 sparkline
- [ ] 二级表格有内联条/价格刻度/平台徽章,不是纯文字
- [ ] 标题用 Space Grotesk(展示字体),数据用 IBM Plex Mono(tabular-nums)
- [ ] ⌘K 命令面板玻璃弹层、Toast、表格排序与 hover 强调线
- [ ] 明暗两套主题、`prefers-reduced-motion` 都正常

## 9. 给 Codex 的执行顺序
1. 删 `globals.css` 里 `rc-*` 全段,搬入 `source/globals.css`(零改动);补齐 4 个字体。
2. `source/graph.jsx`、`micro.jsx`、`components.jsx`、`extras.jsx` 转 `.tsx`,`window.IRP` 改 props。
3. 按 §4 对照表重写 `IndustryResearchWorkbench.tsx` 的 JSX(类名严格一致),数据用 `adaptRun(...)` 的 `model`。
4. running 态接 `deriveRunState(events)`。
5. 逐项过 §8 验收,对照 `../screenshots/`。
