# 给 Codex 的执行指令(直接粘贴)

把下面整段作为任务发给 Codex。它假设 `docs/ui-handoff/` 已放入仓库。

---

任务:修复行业研究生产台操作台 UI 的视觉漂移。上一轮你**从零重写了 CSS 和组件**,导致与设计稿差距很大。这一轮的要求是**逐字移植,不是参考重写**。

**先读**:`docs/ui-handoff/porting/PORTING_GUIDE.md`(根因诊断 + 完整步骤)、`docs/ui-handoff/DATA_CONTRACT.md`、`docs/ui-handoff/screenshots/*`(视觉基准)。权威源文件在 `docs/ui-handoff/porting/source/`。

**保留**(架构正确,不要动):`apps/studio/src/app/industry-research/adapters/`(`research.ts`、`run-events.ts`)、`fixtures/research-console.ts`、与 `@industry-research/core` 的接线、`api/industry-research/run`。

**替换**(表现层,漂移所在):
1. **CSS 零改动搬入**:删除 `apps/studio/src/app/globals.css` 里全部 `rc-*` 规则,把 `porting/source/globals.css` **逐字**复制进去。不要把 `oklch()` 换成 hex,不要改圆角/阴影/透明度,不要删噪点层(`body::after`)和玻璃(`backdrop-filter`)。项目级 reset/字体放文件最上方,别改设计稿规则体。
2. **补齐 4 个字体**(上一版漏了展示字体):`Space Grotesk`(--font-display)、`Manrope`(--font-sans)、`IBM Plex Mono`(--font-mono)、`Noto Sans SC`。在 `layout.tsx` 用 `next/font/google` 引入并让 CSS 变量指向它们。
3. **移植真组件(已替你转好 TSX,直接拷)**:`porting/tsx/` 内已是转换完成的 Next.js 客户端组件——`components.tsx`(`Icon`/`StatusPill`/`Score`/`useCountUp` 等)、`KnowledgeGraph.tsx`(canvas 知识图谱,含节点 hover+tooltip)、`micro.tsx`(SVG 微图 + `DbMicro` + `InlineBar`/`PriceScale`)、`extras.tsx`(`CommandPalette`/`Toaster`/`renderMarkdown`)。把它们拷进 `apps/studio/src/app/industry-research/components/` 即可,**绘图/动画逻辑一行都不要改**;它们已用 props 取代 `window.IRP`(用法见 `porting/tsx/README.md`)。不要用 div/CSS 重新近似这些图表。
4. **装配文件已替你写好**:`porting/tsx/IndustryResearchWorkbench.tsx` 是 `app.jsx` 的完整 props/model 版,已对接你建的 `adapters/research`(`createModelFromInput`/`adaptRun`)和 `adapters/run-events`(`deriveRunState`/`createMockRunEventTimeline`)。直接用它替换现有的 `IndustryResearchWorkbench.tsx`(按需调整四个子组件的 import 路径)。类名与 `globals.css` 严格一致。**唯一需要你接的真实后端在 `startRun()` 里标了 `TODO: 真实事件流`**——把 mock 回放换成订阅 `/api/industry-research/run` 的 SSE 即可,`deriveRunState` 同时吃 mock 与真实事件,渲染层不用改。
5. **图谱/微图已改吃 props**:无需再改。
6. **running 态**:用 `deriveRunState(events)` 产出步骤/百分比/计数/源流,喂给 `.steps`、`.stream`、覆盖层与 `<KnowledgeGraph progress=…>`。

**验收**(逐项对 `screenshots/`,见 PORTING_GUIDE §8):多层光晕+噪点背景、玻璃卡+inset 高光、canvas 图谱可 hover、9 张各异 SVG 微图带描绘动画+类别色相、机会大卡发光雷达+count-up、统计条 sparkline、二级表格内联可视化、Space Grotesk 标题、⌘K 面板/Toast/表格排序、明暗双主题与 reduced-motion。

**核心原则**:CSS 和类名是契约,逐字对齐;只把数据从 mock 换成真实模型。任何"我觉得这样也差不多"的近似都不要做。
