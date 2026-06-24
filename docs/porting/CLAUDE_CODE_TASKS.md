# 给 Claude Code 的执行交接 · 还原修复 + 图谱优化

> **角色**:你在仓库 `industry-research-production-table` 里执行前端修复。
> **背景**:线上 UI 已按设计稿移植(`globals.css` 与设计稿逐字一致、JSX 是装配文件),但有 **1 个真问题(中文字体没生效)+ 4 处视觉回归/优化**。本文件把全部改动整理成**可直接执行的精确补丁**。
> **权威源文件**:`docs/design_handoff_research_console/porting/`(`source/` 是设计稿原文件,`tsx/` 是已转好的成品,`FIDELITY_FIX.md` 是逐条说明)。本文件是它的「执行版摘要」,冲突时以 `source/` 实际代码为准。

---

## ⚠️ 执行前必读(硬约束,来自仓库 DECISIONS.md / UX_OPTIMIZATION_HANDOFF.md)
1. **不要长跑 `pnpm dev`**(机器发热)。验收用 `pnpm check` / `pnpm test`;看 UI 用 `pnpm build && pnpm start`,点检完即停。
2. **不改架构边界**:`adapters/research.ts`、`adapters/run-events.ts` 不动。
3. **CSS 类名是契约**:可加规则,不要重命名既有类。
4. 本轮**只做视觉还原 + 图谱优化**,不碰功能接线(接后端/表单/三态那些是另一批任务,见 `UX_OPTIMIZATION_HANDOFF.md`)。

---

## FIX-1 🔴 中文字体没生效(还原差距的主因,必修)

**问题**:`layout.tsx` 用 `next/font` 把 `Space_Grotesk`→`--font-display`、`Manrope`→`--font-sans`、`Noto_Sans_SC`→`--font-cjk`。`next/font` 会用生成的字体名**整段覆盖**同名变量,于是 `--font-display`/`--font-sans` 只剩 Space Grotesk / Manrope(都无中文字形),而真正含中文的 `--font-cjk` **全 CSS 从未被引用** → 所有中文掉到系统字体,和设计稿不一致。

**改 `apps/studio/src/app/layout.tsx`** —— 让 next/font 用**不撞名**的变量:
```tsx
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const manrope      = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const ibmPlexMono  = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-plex" });
const notoSansSc   = Noto_Sans_SC({ weight: ["400","500","600","700"], variable: "--font-cjk" });
// ⚠️ 变量类必须挂在 <html>(不是 <body>):字体栈定义在 globals.css 的 :root,
//    变量挂在 <body> 时 :root 看不到它们 → 栈算成「保证无效值」并继承为空 → 中文回退 PingFang,Noto 永不加载。
// <html lang="zh-CN" className={`${spaceGrotesk.variable} ${manrope.variable} ${ibmPlexMono.variable} ${notoSansSc.variable}`}>
```

**改 `apps/studio/src/app/globals.css`** `:root` 里三条字体栈，引用上面变量并把 **CJK 兜底放进每条**：
```css
--font-display: var(--font-grotesk), var(--font-cjk), -apple-system, BlinkMacSystemFont, sans-serif;
--font-sans:    var(--font-manrope), var(--font-cjk), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono:    var(--font-plex), var(--font-cjk), ui-monospace, "SF Mono", Menlo, monospace;
```

**验收**:DevTools 选中英雄标题的中文 → Computed `font-family` 解析到 **Noto Sans SC**(不是 system-ui/PingFang/Times)。中文与拉丁混排（如「Agent 自动发现」）字重/字形与 `screenshots/` 一致。

> 若构建对 `Noto_Sans_SC` 的 `subsets` 报错，按 next/font 提示补最小允许值；务必确认中文真由 Noto 渲染。备选方案 B（CJK 走 `<head>` 的 Google Fonts `<link>`）见 `FIDELITY_FIX.md`。

---

## FIX-5 🟢 英雄区图谱「方形边界 / 被切的延伸线」→ 独立悬浮放大星座

> 这是用户重点反馈并已在设计稿调好的效果。**两部分都要做。**

**① 布局收进安全边距(根因)** —— 改 `apps/studio/src/app/industry-research/components/KnowledgeGraph.tsx` 的 `buildModel()`。直接对照权威文件 `porting/tsx/KnowledgeGraph.tsx` 同名函数复制，关键差异：
- 中心节点 `y: 0.52 → 0.50`
- db 轨道 `rx = 0.30, ry = 0.31, cy = 0.50`（原 `rx=0.30, ry=0.34, y=0.52`）
- 叶子节点：`spread = 0.26`，半径改为 `(rx + extra)` / `(ry + extra)`，其中 `extra = 0.06 + 0.04 * ((k % 2) + 1)`（原来是 `rx + lr*0.6`，`lr` 会算到 0.6 → 坐标超出画布被硬切）
- 背景光晕：`cy = 0.50 * H`，半径 `Math.max(W,H) * 0.55`（原 `0.52`/`0.6`）

效果：所有节点/连线都落在画布内，不再触边、无硬切。

**② 边缘羽化 + 放大** —— 改 `globals.css`，给**英雄区那块** canvas（`.run-stage` 舞台**不要**加）：
```css
.hero-viz { min-height: 440px; }
.hero-viz .kg-wrap canvas {
  -webkit-mask-image: radial-gradient(ellipse 74% 74% at 50% 50%, #000 48%, rgba(0,0,0,0.5) 70%, transparent 90%);
  mask-image: radial-gradient(ellipse 74% 74% at 50% 50%, #000 48%, rgba(0,0,0,0.5) 70%, transparent 90%);
}
```
并把 setup 英雄区的图谱**放大**：`IndustryResearchWorkbench.tsx` 里 `<KnowledgeGraph … height={420}/>` → `height={480}`（仅 setup 那处；running 的 `height={360}` 不变）。

**验收**：setup 英雄区图谱是一团悬浮发光星座，四周自然消散、无矩形硬边、无被截断的连线，九个数据库标签完整可见，整体充满右侧区域、与标题等高呼应。

---

## FIX-2 🟡 明暗切换图标用错
`Topbar` 浅色模式显示 `settings` 齿轮，应为月亮。`components.tsx` 的 `ICONS` 加一个 moon，再把 `theme === "dark" ? "sun" : "settings"` 改成 `: "moon"`：
```ts
moon: ["M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"],
```

## FIX-3 🟡 知识图谱 tooltip 计数陈旧
`KnowledgeGraph.tsx` 的 `buildModel()` 只在挂载跑一次（空依赖数组），`databases` 后续变化不重建 → hover tooltip 的「X 条」可能是 skeleton 的 0 或旧值。修法二选一：tooltip 绘制时直接读最新 `dbRef.current` 的 count；或当 `databases` 的 count 签名变化时重建 model。确保 done 后 tooltip 显示真实条数。

## FIX-4 🟡 hero-stats「9 / 13 / 6」本地点检
`globals.css` 有两段 `.hero-stats`（基础 + PREMIUM REFINEMENTS 连体改写）。`pnpm build && pnpm start` 点检：连体统计条标签「数据库视图/建库步骤/信息源类型」完整不裁切、顶部 accent 短杠对齐。若裁切，调 `.hero-stat` 的 `padding`/`min-width`。

---

## 执行顺序与验收
1. **FIX-1**（一次改动全站中文对齐，先做）
2. **FIX-5**（图谱，两部分）
3. **FIX-2 / FIX-3 / FIX-4**（顺手清理）

每步后跑：
```
pnpm --filter @industry-research/core typecheck
pnpm test
pnpm check
pnpm build && pnpm start   # 点检 UI 即停，别长跑 dev
```
回归底线：结果页统计条达 `8 / 19 / 27 / 74 / 9` 量级；明暗双主题、reduced-motion、噪点/玻璃/光晕质感层保持。

> 全部改完，线上 setup/running/done 与 `docs/design_handoff_research_console/screenshots/` + 设计稿一致即为 100% 还原达成。功能接线（接后端/表单/下载/三态/无障碍）见 `UX_OPTIMIZATION_HANDOFF.md`，本轮不在范围。
