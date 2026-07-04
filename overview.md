# 电商竞品研究 Agent · 产品介绍视频 — 交付总览

## 成片

**文件**：`outputs/ecommerce-agent-intro.mp4`

| 参数 | 值 |
|------|-----|
| 时长 | 30.06 秒 |
| 分辨率 | 1080×1920（抖音竖屏 9:16） |
| 帧率 | 30 fps |
| 编码 | H.264 + AAC |
| 文件大小 | 7.9 MB |

## 内容结构（6 场景）

1. **痛点 Hook**（0-4s）：「做电商竞品调研，还在手动翻网页？」散乱网页碎片收拢
2. **产品亮相**（4-8s）：数据流粒子汇聚成 Logo，主标题「电商竞品研究 Agent」
3. **自动发现信息源**（8-14s）：输入「宠物食品/益生菌/北美市场」→ 4 节点采集流程 → 发现 24 个候选 URL
4. **九类数据库**（14-20s）：3×3 网格卡片逐个弹入，含信息源/竞品/产品/关键词/痛点/内容/机会/网站结构/周报
5. **机会评分 + 报告**（20-26s）：评分环 0→88 count-up，机会卡「换粮过渡期肠道套装」，报告逐行刷出
6. **CTA 收尾**（26-30s）：品牌名「行业研究生产台」+ 三条特性标签 + 域名条

## 设计系统

- 风格：科技深色 + 数据流（深蓝渐变 + 青紫粒子）
- 主色：靛紫 `#8B5CF6` / 靛蓝 `#6366F1` / 青 `#22D3EE` / 翠绿 `#10B981`（评分）
- 字体：Noto Sans SC（中文）+ Space Grotesk（英文）
- 动效：spring 弹入、stagger 错落、count-up、typewriter、环形进度、数据流粒子

## 可编辑源码

位置：`remotion-videos/src/compositions/ecommerce-agent-intro/`

```
theme.ts              # 常量入口：配色/排版/时长/文案（改这一个文件即可全局换皮）
utils.tsx             # 共享动画工具 + SVG 图标
Background.tsx        # 深色渐变背景 + 网格 + 数据流粒子
VideoComposition.tsx  # 主合成（6 个 Sequence）
Scene1Hook.tsx        # 痛点 Hook
Scene2Reveal.tsx      # 产品亮相
Scene3Discovery.tsx   # 自动发现信息源
Scene4Databases.tsx   # 九类数据库
Scene5Score.tsx       # 机会评分 + 报告
Scene6CTA.tsx         # CTA 收尾
```

分镜文档：`remotion-videos/storyboard.md`

## 后续微调方式

- **改文案/配色**：只改 `theme.ts` 的 `BRAND` / `CONTENT` 常量
- **改时长**：改 `theme.ts` 的 `TIMING` 各场景帧数（注意同步更新 VideoComposition 的 Sequence）
- **重新渲染**：
  ```bash
  cd remotion-videos
  /Users/qzt/.workbuddy/binaries/node/versions/22.22.2/bin/npx remotion render src/index.ts ecommerce-agent-intro output/ecommerce-agent-intro.mp4 --concurrency=4
  ```
- **预览调试**：`npx remotion studio`（打开 http://localhost:3000 可逐帧拖动）

## 技术备注

- Remotion 项目独立于主 pnpm workspace，避免依赖冲突
- 无 BGM（如需可后续追加免费商用音乐到 `public/assets/` 并在 Root 接入 Audio）
- 全部视觉用代码绘制（SVG + CSS），无外部图片素材依赖
