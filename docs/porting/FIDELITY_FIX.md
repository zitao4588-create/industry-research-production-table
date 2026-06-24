# 视觉还原核查 + 修复补丁 · FIDELITY_FIX

> 受众:Codex / 前端。目标:在不动架构的前提下,把线上 UI 修到与设计稿 **100% 一致**。
> 结论先行:**`globals.css` 与设计稿逐字一致(732 行,oklch/字体栈/类名全同),JSX 装配也是设计稿原文件。还原差距只有一处真问题(字体接线)+ 几处小回归(P2-K 已记)。** 修完即 100%。

---

## 🔴 FIX-1　中文字体没生效(还原差距的主因,必修)

### 现象
设计稿里所有标题/正文的中文,应由字体栈里的 `Noto Sans SC` 兜底渲染;线上中文掉到了系统默认字体,字形、字重、字间距都和设计稿不一致(英雄标题「把陌生行业织成一张可检索的情报网」最明显)。

### 根因
`globals.css :root` 的字体栈是(正确,别改):
```css
--font-display: "Space Grotesk", "Noto Sans SC", -apple-system, …;
--font-sans:    "Manrope", "Noto Sans SC", -apple-system, …;
--font-mono:    "IBM Plex Mono", ui-monospace, …;
```
但 `layout.tsx` 用 `next/font` 时,把 `Space_Grotesk` 绑到了 **`--font-display`**、`Manrope` 绑到 **`--font-sans`**、`Noto_Sans_SC` 绑到 **`--font-cjk`**。`next/font` 会用它生成的字体名**整段覆盖**同名变量——于是挂在 `<body>` 上的 `--font-display` 变成「只有 Space Grotesk」,**`"Noto Sans SC"` 这一层兜底被抹掉**;而真正加载了中文字形的 `--font-cjk` **整个 CSS 从未被引用**。Space Grotesk / Manrope 都不含中文字形 → 中文落到系统字体。

### 修复(二选一,推荐 A)

**方案 A — 让 next/font 用独立变量名,CSS 栈引用它们(改动小、最稳):**

`layout.tsx`:给四个字体改成**不与 CSS 栈撞名**的变量:
```tsx
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const manrope      = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const ibmPlexMono  = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-plex" });
const notoSansSc   = Noto_Sans_SC({ weight: ["400","500","600","700"], variable: "--font-cjk" });
// ⚠️ 变量类挂 <html>(不是 <body>):字体栈在 globals.css 的 :root 定义,挂 <body> 时 :root 看不到 → 栈算成空 → 中文回退 PingFang。
// <html lang="zh-CN" className={`${spaceGrotesk.variable} ${manrope.variable} ${ibmPlexMono.variable} ${notoSansSc.variable}`}>
```
`globals.css :root`:把三条字体栈改为引用上面的变量,**把 CJK 兜底放进每一条**:
```css
--font-display: var(--font-grotesk), var(--font-cjk), -apple-system, BlinkMacSystemFont, sans-serif;
--font-sans:    var(--font-manrope), var(--font-cjk), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono:    var(--font-plex), var(--font-cjk), ui-monospace, "SF Mono", Menlo, monospace;
```
这样 `--font-display` = Space Grotesk(拉丁)→ Noto Sans SC(中文)→ 系统,与设计稿意图完全一致。**前提:next/font 的变量类挂在 `<html>` 上(见上),否则 `:root` 的栈解析为空、中文回退系统字体。**

> 注:`Noto_Sans_SC` 不要写 `subsets: ["latin"]` 作为唯一兜底来源——它的中文字形通过 @font-face 的 unicode-range 提供,`weight` 指定即可。若构建对 `subsets` 报错,按 next/font 提示补最小允许值,但**务必确认中文真的由 Noto 渲染**(见验收)。

**方案 B — CJK 走普通 `<link>`(和设计稿原型一致):**
保留 next/font 管 Space Grotesk/Manrope/IBM Plex Mono(但同样要改成不覆盖 `--font-display` 等的独立变量 + 在栈里引用),Noto Sans SC 改用 `layout.tsx` `<head>` 里的 Google Fonts `<link>`(设计稿 `index.html` 就是这么做的)。效果同 A。

### 验收
- 打开页面 → DevTools 选中英雄标题的中文 → Computed `font-family` 解析到 **Noto Sans SC**(不是 Times/PingFang/system-ui)。
- 中文与拉丁混排(如「Agent 自动发现」)中,中文字重/字形与 `screenshots/` 一致。
- 三种字体角色(标题 Grotesk / 正文 Manrope / 数据 IBM Plex Mono)在拉丁文本上都正确。

---

## 🟡 FIX-2　明暗切换图标(P2-K)
`Topbar` 浅色模式显示 `settings` 齿轮(应为月亮)。设计稿图标集里没有 moon——**补一个 moon 图标**到 `components.tsx` 的 `ICONS`,再把 `theme === "dark" ? "sun" : "settings"` 改成 `: "moon"`:
```ts
moon: ["M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"],
```
(深色显示 sun=切到浅色,浅色显示 moon=切到深色,语义才对。)

## 🟡 FIX-3　知识图谱 tooltip 计数陈旧(P2-K)
`KnowledgeGraph.tsx` 的 `buildModel()` 只在挂载跑一次(空依赖),`databases` 后续变化不重建 → hover tooltip 的「X 条」可能是 0 或旧值。两种修法:
- tooltip 直接读 `dbRef.current` 的最新 count(绘制时按节点 index 取),或
- 当 `databases` 的 count 签名变化时重建 model。
setup 态传的是 skeleton(count 可能为 0),done 态才是真实 count——确保 done 后 tooltip 显示真实条数。

## 🟡 FIX-4　hero-stats「9 / 13 / 6」需本地点检
`globals.css` 有两段 `.hero-stats`(基础 + PREMIUM REFINEMENTS 的连体改写),后者覆盖前者。截图疑似标签轻微裁切。**用 `pnpm build && pnpm start` 本地点检**(别长跑 dev):确认连体统计条的标签「数据库视图/建库步骤/信息源类型」完整不裁切、顶部 accent 短杠对齐。若裁切,调 `.hero-stat` 的 `padding`/`min-width`。

## 🟡 FIX-5　英雄区图谱「方形边界感 / 被切的延伸线条」(已在设计稿修正)
### 现象
setup 英雄区的知识图谱像「一张被框住的图片」:外圈叶子节点的坐标算出来会超出画布(到 1.10 / -0.10),被矩形 canvas **硬切**,延伸的连线被截断、遮挡。单加遮罩治标不治本。
### 修复(两部分,都要做)
**① 布局收进安全边距(根因)** —— `KnowledgeGraph.tsx` 的 `buildModel()`:db 轨道 `rx=0.30, ry=0.31`、中心 `cy=0.50`;叶子节点半径改为 `rx/ry + extra`(`extra = 0.06 + 0.04*((k%2)+1)`)、`spread=0.26`。所有节点/连线落在画布内、**不触边缘、无硬切**。中心节点 `y` 与背景光晕 `cy` 同步 `0.50`、光晕半径 `*0.55`。setup 英雄区 `<KnowledgeGraph height={480}/>`(放大充满右侧)。`porting/source/graph.jsx` 与 `porting/tsx/KnowledgeGraph.tsx` 已含。
**② 边缘羽化遮罩(收尾)** —— 给**英雄区那块** canvas(`.run-stage` 的舞台不要加)补:
```css
.hero-viz { min-height: 440px; }   /* 容纳放大后的图谱 */
.hero-viz .kg-wrap canvas {
  -webkit-mask-image: radial-gradient(ellipse 74% 74% at 50% 50%, #000 48%, rgba(0,0,0,0.5) 70%, transparent 90%);
  mask-image: radial-gradient(ellipse 74% 74% at 50% 50%, #000 48%, rgba(0,0,0,0.5) 70%, transparent 90%);
}
```
因为内容已收紧,淡出整段落在空白边距里,星座干净地溶进背景。
### 验收
图谱呈一团**悬浮发光星座**,四周自然消散、无矩形硬边、无被截断的连线;九个数据库标签仍完整可见。

---

## ✅ 已确认 100% 一致(无需动)
- `globals.css` 设计 token(oklch 配色、圆角、阴影、`--accent`)、噪点层 `body::after`、玻璃 inset 高光、`btnShine`、`.search-pill`、九库类别 hue-rotate、微图描绘动画——逐字一致。
- 三阶段装配、命令面板、Toast、雷达大卡、统计条 sparkline、二级表格内联可视化——结构与设计稿一致。

## 验收基线(沿用 UX 文档 §5,不长跑 dev)
```
pnpm --filter @industry-research/core typecheck
pnpm test
pnpm check
pnpm build && pnpm start   # 点检 UI 即停
```
回归底线:结果页统计条达 `8 / 19 / 27 / 74 / 9` 量级;明暗双主题、reduced-motion、噪点/玻璃/光晕质感层保持。
