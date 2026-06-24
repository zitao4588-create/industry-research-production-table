# porting/tsx — 已转换好的 TSX 组件(直接落地)

这些是把 `../source/*.jsx` **逐字转成 Next.js 客户端组件**的成品。视觉/绘图/动画逻辑**一行未改**,只做了:加 `"use client"`、`React.x` → `import`、删 `Object.assign(window,…)` 改 `export`、`window.IRP` → props、补 TS 类型。直接拷进 `apps/studio/src/app/industry-research/components/` 即可,省掉 Codex 自己转换(也少一个漂移环节)。

## 文件
| 文件 | 导出 | 替代了 source 里的 |
|---|---|---|
| `components.tsx` | `Icon` `Logo` `StatusPill` `Score` `TotalPill` `FreqBars` `useCountUp` `IconName` `ReviewStatus` | `components.jsx` |
| `KnowledgeGraph.tsx` | `KnowledgeGraph` `GraphDatabase` | `graph.jsx` |
| `micro.tsx` | `Spark` `VBars` `HBars` `StackBar` `Donut` `NodeMini` `Scatter` `Blocks` `Radar` `DbMicro` `StatSpark` `InlineBar` `PriceScale` `DbMicroModel` | `micro.jsx` |
| `extras.tsx` | `CommandPalette` `Toaster` `showToast` `renderMarkdown` `buildIndex` `NavTarget` `SearchModel` | `extras.jsx` |
| `IndustryResearchWorkbench.tsx` | `default`(整个操作台装配) | `app.jsx` |

> **`IndustryResearchWorkbench.tsx` 已替你写好装配层** —— 它直接对接 Codex 已建的 `adapters/research`(`createModelFromInput`/`adaptRun`/全部 UI 类型)和 `adapters/run-events`(`deriveRunState`/`createMockRunEventTimeline`/`RunEvent`),三阶段(setup→running→done)、命令面板、Toast、明暗切换、各次级视图全部接好。**Codex 基本只剩一件事**:把 §「真实事件流」那一处 mock 回放换成订阅后端 SSE/WebSocket(见下)。

## 放置位置
```
apps/studio/src/app/industry-research/
├── IndustryResearchWorkbench.tsx     ← 用本包这份替换 Codex 现有的(import 路径改成 ./components/*)
├── components/                        ← 新建,放下面四个
│   ├── components.tsx
│   ├── KnowledgeGraph.tsx
│   ├── micro.tsx
│   └── extras.tsx
└── adapters/                          ← Codex 已建,保持不动
    ├── research.ts
    └── run-events.ts
```
> 装配文件里子组件 import 写的是 `./components/components` 等;若你把四个组件平铺在同目录,改成 `./components` 之类即可。

## ★ 唯一的真实后端接入点
`IndustryResearchWorkbench.tsx` 的 `startRun()` 里有一段标了 `// —— TODO: 真实事件流 ——`。当前是用 `createMockRunEventTimeline(model)` 定时回放假事件;接真实后端时换成:
```ts
const es = new EventSource(`/api/industry-research/run?...`);
es.onmessage = (m) => setEvents((xs) => [...xs, JSON.parse(m.data) as RunEvent]);
es.addEventListener("done", () => { es.close(); setPhase("done"); });
```
`deriveRunState(events, model)` 同时吃 mock 与真实事件 —— **渲染层一行都不用改**。`runMockIndustryResearchWorkflow(input)` 那行也按需替换为你的真实工作流调用。


转换后这几个组件**不再读全局**,改为吃 props——用你 `adaptRun(...)` 得到的 `model` 字段喂进去:

```tsx
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { DbMicro, StatSpark, Radar, InlineBar, PriceScale } from "./components/micro";
import { CommandPalette, Toaster, showToast, renderMarkdown } from "./components/extras";
import { Icon, StatusPill, Score, TotalPill, FreqBars, useCountUp } from "./components/components";

// 知识图谱(setup 用 building=false;running 用 building + progress)
<KnowledgeGraph databases={model.databases} building={phase==="running"} progress={percent/100} accent="#34dcc0" height={440} />

// 数据库卡微图
<DbMicro id={db.id} model={model} />

// 命令面板
<CommandPalette open={cmdOpen} onClose={()=>setCmdOpen(false)} D={model} onNavigate={onNavigate} />
```

`model.databases` 需是 `{ label, count }[]`(`GraphDatabase`);`DbMicro` 的 `model` 需含 `competitors/products/keywords/painPoints/contentSignals/opportunities`(见 `micro.tsx` 的 `DbMicroModel`);`CommandPalette` 的 `D` 见 `extras.tsx` 的 `SearchModel`。这些都已是 `UIResearchModel` 的子集——直接传整个 `model` 即可,多余字段无害。

## 注意点
1. **`--i/--o/--hue` 自定义 CSS 变量**:`micro.tsx` 用 `as CSSVars` 断言传入 `style`,因为标准 `CSSProperties` 不含它们。hover 描绘动画在 `globals.css` 里靠这些变量驱动,务必保证 `globals.css` 已搬入。
2. **类名是契约**:这些组件输出的 class(`micro` `m-bar` `db-card` `cmdk` `toast` `status-pill` …)必须能在 `globals.css` 找到对应规则。先搬 CSS,再放组件。
3. **字体**:canvas 图谱里写死了 `'IBM Plex Mono'` 字体串(tooltip / db 标签),确保该字体已在页面加载。
4. **`useCountUp(target, run, ms?)`**:`run=true` 时从 0 动到 target;统计条/机会大卡综合分都用它。
5. **reduced-motion**:动画收敛逻辑在 CSS;组件侧无需特判。
