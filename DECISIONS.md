# 决策记录

更新时间：2026-06-18

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
