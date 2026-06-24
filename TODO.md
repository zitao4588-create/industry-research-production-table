# TODO

更新时间：2026-06-22

## 已完成

- [x] 按 `docs/design_handoff_research_console 2/porting/source/globals.css` 迁移核心 UI 样式。
- [x] 补齐展示字体：`Space Grotesk`、`Manrope`、`IBM Plex Mono`、`Noto Sans SC`。
- [x] 移植 `components.tsx`、`KnowledgeGraph.tsx`、`micro.tsx`、`extras.tsx`。
- [x] 用装配版 `IndustryResearchWorkbench.tsx` 接入 adapter、fixtures、mock event timeline 和 core mock workflow。
- [x] 扩充 core mock 数据，让结果页统计和主要表格密度贴近 screenshots 基准。
- [x] 跑通 `pnpm check`。
- [x] 停止 `localhost:3000` 开发服务。
- [x] 从 `agent-factory` 同步 v0.3 行业研究核心：DeepSeek、sourceQuality、delivery package、manifest、run API、n8n webhook 合约。
- [x] 新增 `pnpm sample:public-web`，作为不启动 Studio、不调用 DeepSeek 的低负载 smoke 验证入口。
- [x] 新增 `pnpm verify:deepseek` 和 `pnpm sample:deepseek`，作为需要真实 LLM 时的显式命令。
- [x] 迁移后验证通过：`pnpm --filter @industry-research/core typecheck`、`pnpm test`、`pnpm check`、`pnpm sample:public-web`。

## 待处理

- [ ] **前端 UX 优化（交接 Codex）**：详见 `docs/design_handoff_research_console/UX_OPTIMIZATION_HANDOFF.md` —— 2026-06-22 as-built 复盘 + P0/P1/P2 任务清单（真实 run 接入、失败态、表单接线、下载/审核回写、可溯源、无障碍等）。**下方第 「接入真实 run」 与 「displayCount」 两条已并入其中。**
- [ ] 如需验证 DeepSeek，再运行 `pnpm verify:deepseek`；执行前先确认成本和 `.env.local`。
- [ ] 确认是否继续维护 `apps/studio` UI；默认不启动 Next dev，避免电脑发热。
- [ ] 接入真实 `/api/industry-research/run` SSE 或 WebSocket，替换 `startRun()` 中的 mock timeline。
- [ ] 决定九库卡片是否需要独立 `displayCount` 字段：
  - 现在 adapter 被要求保留不动，卡片数字只能显示真实数组长度。
  - 如果要同时满足“卡片显示大规模沉淀数字”和“表格仍保持 5-6 行精选结果”，需要允许 adapter 或 UI model 增加展示计数字段。
- [ ] 做一次生产构建验证，确认 dev-only `nextjs-portal` 不会出现在生产环境。
- [ ] 若继续做移动端精修，重点检查 390px 附近的按钮可点区域和长表格横向滚动体验。
- [ ] 真实采集模式上线前复核 robots、公开数据边界、LLM provider 付费配置和内部 API key。

## 下一步建议

1. 下一步先确认是否要跑 `pnpm verify:deepseek`，它会消耗 DeepSeek 调用。
2. 如果不急着看 UI，继续用 `pnpm sample:public-web` 产出本地交付包。
3. 若继续投入 Studio UI，优先用 `pnpm build && pnpm start` 验证，少跑长期 `pnpm dev`。
