# 交接文档 · 行业研究生产台 Web UI

> **给 Codex / 接手开发者**：本文件夹是一套用 HTML/React(CDN + Babel)做的**高保真设计原型**,用来锁定界面的样子、信息架构和交互。**它不是生产代码**——你的任务是把这套设计在仓库 `industry-research-production-table`(Next.js / `apps/studio`)的现有技术栈里**重新实现**,复用其既有组件与约定,而不是直接照搬这些 CDN 文件。
>
> 三份文档配合阅读:
> - **README.md(本文件)** — 概览、文件地图、各界面/组件规格、设计 token。
> - **DATA_CONTRACT.md** — UI 期望的数据形状、与仓库 `packages/industry-research/src/types.ts` 的对应、适配层与事件流规范。**接后端时主要看这份。**
> - **ROADMAP.md** — 尚未落地的建议事项,按优先级排好,每条含落地方式。**这是"接下来做什么"的清单。**

---

## 1. 这是什么

**行业研究生产台(Industry Research Production Table）** 的操作台界面。对应仓库里的 agent:用户给定「行业 / 品类 / 市场 / 研究目标」,agent 自动发现公开信息源 → 规划采集 → 建立**九类行业数据库** → 抽取竞品/产品/痛点/内容/关键词 → 生成机会评分 → 人工审核 → 产出 Markdown 报告。

界面按 agent 的真实生命周期分三个阶段(一个单页应用内切换):

| 阶段 | 路由状态 | 作用 |
|---|---|---|
| **setup** | `phase=setup` | 命令中心:填写研究项目表单 + 选运行模式,点「开始研究」 |
| **running** | `phase=running` | 实时可视化:知识图谱逐步织成 + 13 步建库流程 + 信息源发现流 |
| **done** | `phase=done` | 结果仪表盘:统计条、九类数据库卡、机会大卡、结构化表格、人工审核、报告 |

阶段写在 `localStorage('irp_phase')`,真实实现里应改为后端 run 的状态。

## 2. 保真度

**高保真(hi-fi)**。颜色、字体、间距、动效都是最终意图,请尽量像素级还原(用你仓库里的组件库去搭,不必照抄 CDN 写法)。所有数据是 `prototype/data.js` 里的**示意 mock**(以「宠物益生菌竞品研究」为例),真实数据形状见 DATA_CONTRACT.md。

## 3. 运行原型(本地预览设计)

```bash
cd prototype
python3 -m http.server 8080   # 或任意静态服务器
# 打开 http://localhost:8080/index.html
```
- 默认落在 **setup**。点「开始研究」走完整流程。
- 临时跳转:浏览器控制台 `localStorage.setItem('irp_phase','done')` 后刷新,可直接看结果页。
- 右上角 **⌘K** 打开命令面板;顶栏可切明暗;Tweaks 面板(预览工具栏)可换主色/密度。

## 4. 文件地图

| 文件 | 内容 | 说明 |
|---|---|---|
| `index.html` | 入口 | 引入字体(Space Grotesk / Manrope / IBM Plex Mono / 思源黑体)、React 18.3.1 + Babel(CDN,**生产请换成构建期编译**),按顺序加载下列脚本 |
| `styles.css` | 全部样式 | 设计系统:CSS 变量 token、暗/亮主题、所有组件类。**最权威的视觉规格在这里。** |
| `data.js` | mock 数据 | 挂在 `window.IRP`。形状镜像仓库 `types.ts`。生产替换为真实数据 / 适配层(见 DATA_CONTRACT)。 |
| `app.jsx` | 主应用 | `App` + 三阶段(`Setup`/`Running`/`Results`)+ 侧栏/顶栏 + 次级视图(项目/能力/设置)+ 所有表格组件 |
| `components.jsx` | 共享件 | 图标集 `Icon`、`Logo`、`StatusPill`、`Score`、`TotalPill`、`FreqBars`、`useCountUp` |
| `micro.jsx` | 微型图表 | SVG 微可视化:`Spark/VBars/HBars/StackBar/Donut/NodeMini/Scatter/Blocks/Radar/InlineBar/PriceScale` + 派发器 `DbMicro` |
| `graph.jsx` | 知识图谱 | Canvas 签名视觉。`KnowledgeGraph({progress,building,accent,height})`,节点 hover 高亮 + tooltip |
| `extras.jsx` | 交互层 | `CommandPalette`(⌘K 模糊搜索)、`Toaster`+`showToast`、`renderMarkdown` |
| `tweaks-panel.jsx` | 预览工具 | 仅用于设计预览的调参面板(`useTweaks` + 控件)。**生产可整体删除**,主题/主色用你自己的方案。 |

脚本加载顺序(见 `index.html` 末尾):`data.js → tweaks-panel.jsx → components.jsx → micro.jsx → extras.jsx → graph.jsx → app.jsx`。

## 5. 设计 Token(全部在 `styles.css` `:root` / `[data-theme]`)

**主色** 默认 `--accent: #34dcc0`(青绿,"intelligence" 调性),按下态 `#25c2a8`。微图/数据库卡用 `hue-rotate(--hue)` 在主色基础上做**相对色相偏移**做类别区分(这样换主色仍成立)。

**暗色主题(默认)** 关键值:
```
--bg            oklch(0.165 0.014 250)   背景(配角向光晕渐变)
--surface       oklch(0.205 0.016 252)
--ink           oklch(0.975 0.004 240)   主文字
--muted         oklch(0.70 0.012 248)    次文字
--faint         oklch(0.56 0.012 248)    弱文字/标签
--hairline      oklch(1 0 0 / 0.06)      发丝分隔线(暗色用半透明白)
--good  #~绿  --warn #~琥珀  --bad #~红   语义色
```
亮色主题见 `[data-theme="light"]`。两套都已验证。

**字体**
- 展示/标题:`Space Grotesk` + `Noto Sans SC`(`--font-display`)
- 正文/UI:`Manrope` + `Noto Sans SC`(`--font-sans`)
- 数据/标签/代码:`IBM Plex Mono`(`--font-mono`),数字统一 `font-variant-numeric: tabular-nums`

**圆角** `--r-sm 8 / --r-md 13 / --r-lg 18 / --r-xl 24`(px)
**间距节奏** `--pad`(44，compact 30 / comfy 58),栅格用 flex/grid + `gap`
**阴影** `--shadow-sm/md/lg` + 卡片统一加 `inset 0 1px 0` 顶部内高光做玻璃质感
**质感** 全局 `body::after` 一层极淡 SVG 噪点颗粒(opacity 0.05);玻璃面板用 `backdrop-filter: blur()`

**动效原则**:可见态为基态,只从隐藏态 *入场*;入场动画用 `html.booted` 类门控,保证打印/导出/首帧不空白。`prefers-reduced-motion` 已处理。

## 6. 界面与组件规格

### 6.1 外壳
- **侧栏** `--rail: 246px`,玻璃背景。品牌区 + 两组导航(工作区 / 资料)+ 底部「运行模式」卡。当前项有发光左侧条(`.nav-item.active::before`)。
- **顶栏** 62px,sticky,毛玻璃。左面包屑,右侧:**⌘K 检索条**(开命令面板)、分隔线、明暗切换、(done 态)「新研究」。

### 6.2 setup(命令中心) — `Setup`
- 左右分栏(`.hero-split`):左文案(eyebrow 胶囊 + 大标题,标题里 `<em>` 是主色高亮 + 下划色块)+「9 / 13 / 6」连体统计条;右侧 `KnowledgeGraph`(静态织好态,节点可 hover)。
- **创建项目卡**(`.console`,玻璃 + 渐变描边):2 列表单(项目名/行业/品类/市场/模板/目标)+ 可折叠「补充资料」(URL/CSV/手动文本)+ 底栏运行模式分段(Mock / 9router / Public Web / Public+9router)+ 主按钮「开始研究」(hover 流光)。

### 6.3 running(实时建库) — `Running`
- 顶部 `.run-stage`:`KnowledgeGraph` 作底(`building=true, progress=tick/TOTAL`),叠加覆盖层:项目名 + 当前步骤 + 大号百分比 + 计数器(候选/采集/raw docs/步骤)。电影感暗角。
- 下方两栏:左「建库流程」13 步(done/active/pending 三态,连接线)、右「实时信息源发现」流(条目带 method 标签 + 优先级)。再下方活动日志。
- 节奏由 `App` 里的 `setInterval`(`TOTAL=15`)模拟。**真实实现:换成消费后端事件流**(见 DATA_CONTRACT §4)。

### 6.4 done(结果仪表盘) — `Results`
顺序:① 统计条(5 格,每格数字 count-up + 迷你 sparkline)→ ② **最高分机会大卡**(`FeaturedOpportunity`:左五维评分条 + 状态 + count-up 综合分,右发光雷达图)→ ③ **九类数据库卡网格**(每卡专属微图 + 类别色相 + hover 描绘动画,点击跳到对应表格)→ ④ 结构化结果 tabs(机会/竞品/产品/痛点/内容/关键词/周报,各表已注入内联微图)→ ⑤ 人工审核卡 + Markdown 报告卡(真 Markdown 渲染)。

### 6.5 交互层
- **命令面板** ⌘K / 点检索条:模糊搜索竞品·痛点·关键词·机会·视图,↑↓ 选择、↵ 跳转、esc 关闭。
- **Toast** `showToast(msg, kind)`,kind ∈ `ok|copy|spark`。完成研究、复制报告、全部通过时触发。
- **图谱 hover** 悬停数据库节点 → 高亮发光 + tooltip(名称 + 条数)。
- **表格排序** 机会表表头可点排序;行 hover 左侧出现发光强调线。

### 6.6 次级视图
研究项目列表、能力评估表、设置页(均在 `app.jsx` 末尾,沿用同一表格/卡片语言)。未建库时数据库/周报显示空状态 `NeedRun`。

## 7. 状态(当前原型)
`App` 持有:`view`(导航)、`phase`(setup/running/done)、`form`(项目表单,持久化)、`runMode`、`tick`(模拟进度)、`cmdOpen`(命令面板)、`resultTab`(结果页当前 tab,已上提便于命令面板跳转)。生产里 `phase/tick` 应来自后端 run 状态;`form` 提交即创建 run。

## 7.5 截图参考(`screenshots/`)
`01-setup` 命令中心 · `02-running` 实时建库 · `03-results` 结果仪表盘 · `04-databases` 九类数据库卡 · `05-tables` 二级表格 + 审核/报告。用于视觉对齐;以 `styles.css` 为最终规格依据。

## 8. 资产
- 图标:全部是 `components.jsx` 里手写的 stroke SVG(`Icon`),无外部图标库依赖。
- 字体:Google Fonts(见 `index.html`)。
- 图表:全部 SVG/Canvas 自绘,无图表库。
- 无位图/Logo 文件;品牌 mark 是 `Logo` 内联 SVG。

## 9. 推荐的落地策略(详见 ROADMAP)
接手第一步**不是**照搬界面,而是先建 **数据契约 + 适配层**(DATA_CONTRACT §3)与**事件流驱动的 running 态**(§4),让前端与还在开发的 agent 解耦、并行推进;同时把**失败/空/部分成功**等非 happy-path 状态补上(ROADMAP P0)。这几项现在做最省返工。
