# TODO

更新时间：2026-06-25

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
- [x] Claude Code UI 还原修正已提交：中文字体接线、英雄区知识图谱安全边距/羽化、浅色态月亮图标、tooltip 实时计数。
- [x] `docs/porting` 设计交接参考文件已从 Biome 检查中排除，`pnpm check` 重新通过。
- [x] 2026-06-25 验证通过：`pnpm check`，包含 workspace typecheck、34 条 Vitest、55 个文件 Biome 检查。
- [x] 将轻量服务器 n8n workflow 导入并激活，使用 Header Auth credentials 调用行业研究 run API 和 n8n 回调 API。
- [x] 将 n8n 默认业务流设为 `public_web`，已验证不传 `mode` 时可生成交付包并返回 n8n 回调 ack。
- [x] 探测 9router free 候选模型真实 `/v1/chat/completions` 可用性；当前未找到比 MiMo Free 更可用的免密免费模型。
- [x] 2026-06-25 前端 UX 功能接线第一批（Claude Code）：
  - 基础：抽出 `_lib/run-core.ts`，新增 `app/industry-research/actions.ts` 三个同源 server action 修「鉴权坑」（详见 DECISIONS）。
  - P0-C：补充资料三个 textarea 与研究模板 select 受控接线；必填项校验 + URL `http/https` 轻校验 +「开始研究」置灰。
  - P0-A（最小版）：四个模式按钮真生效，`Mock` 本地 + 演示标识，其余三模式经 server action 发真实 run，运行期 indeterminate，`await` 完成后 `adaptRun` 切 done。
  - P0-B：真实 run 失败注入 `run.error` → 失败卡片 + 重试 / 返回表单。
  - P1-D：报告卡「下载交付包」(downloadDeliveryPackageAction)、审核卡「提交审核结果」回写 `reviewed_report.md` 在线版、机会表客户端「导出 CSV」。
  - 验证：`pnpm check`（workspace typecheck + 34 Vitest + Biome 57 文件）、`pnpm build`、`pnpm sample:public-web` 全通过。
- [x] 2026-06-25 前端 UX 功能接线第二批（Claude Code）：
  - P0-A 完整版 SSE：`runPublicIndustryResearchWorkflow` 加 `onProgress`，新增同源流式路由 `POST /api/industry-research/run/stream`，前端 fetch+ReadableStream 订阅，public_web 逐阶段真实进度（实测 0%→23%→done），失败回退非流式。
  - P1-E 证据溯源弹层：adapter 把 evidenceIds 解析为 `UIEvidenceRef`，新增 `EvidencePopover`，机会/竞品/痛点/内容 4 表证据单元格可点开来源（含 a11y）。
  - Mock 数据密度恢复：`entityProfile: "rich"`（仅 Mock），实测 `8/8/26/74`、竞品/机会 6、九库 10/6/3/6/6/5/5/6/2；真实模式保持 lean。
  - 验证：`pnpm check`（34 Vitest + Biome 59 文件）、`pnpm build`、浏览器点检 SSE / rich / 溯源全通过。
- [x] 2026-06-25 前端 UX 功能接线第三批（Claude Code）—— handoff 剩余项收尾：
  - P1-G 刷新持久化：done 态把结果快照(phase+resultModel+rawResult+runId+input+view+tab)存 localStorage，刷新恢复（实测 reload 后回到 done、8/8/26/74），reset 清除。
  - P1-F 无障碍：侧栏导航、九库卡、排序表头(aria-sort)、审核按钮(aria-pressed)、补充资料 toggle、搜索 pill 全部 role/tabIndex/Enter-Space 键盘可达；KnowledgeGraph canvas 加 role=img + aria-label + 视觉隐藏数据库清单；已有 `:focus-visible` 焦点环。
  - P2-J：NeedRun「去研究台」只切 view；命令面板仅在已有结果且非 running 时才跳结果态。
  - P0-B：新增 `components/states.tsx`（Skeleton shimmer + EmptyState/EmptyTable），结构化结果 6 表空态兜底。
  - P2-H：≤720px 顶栏汉堡 → 抽屉式侧栏 + 背板（实测滑入/导航关抽屉/切视图），宽表 `overflow-x:auto` 横滑。
  - deepseek SSE：glm-workflow 两个函数接 `onProgress`，`deepseek`/`public_web_deepseek` 也走细粒度流式（实测 emit 12 步 done + report start + error 帧）。
  - 验证：`pnpm check`、`pnpm build`、浏览器点检（持久化/抽屉/SSE）全通过。

## 待处理

- [ ] **前端 UX 优化已基本收尾**（P0-A~P2-K + Mock 密度均已落地，详见上方三批）。残留可选项：
  - 真实 run 期的 stat 条 / 九库卡 `<Skeleton/>` 逐格占位（组件已就绪，当前运行期用 run-stage，未铺进表格区）。
  - P2-J 的 phase×view 可见性收敛成单一派生函数（内部清理，非用户可感）。
- [ ] 清理 UI / health / 文档里的 DeepSeek 历史命名，统一为 9router / OpenAI-compatible provider；不要把函数内部历史名误当当前 provider。
- [ ] 继续处理 9router provider：MiMo Free 当前 `risk_control`，`gh/goldeneye-free-auto` 缺 GitHub provider credentials，opencode public 返回 Missing API key；如要 LLM 稳定交付，需要接入可用凭据或付费 provider。
- [ ] 真实采集模式上线前复核 robots、公开数据边界、LLM provider 付费配置和内部 API key（DeepSeek / Public+DeepSeek 模式经 server action 已可触发真实 run，上线前务必确认凭据与成本）。

## 下一步建议

1. 前端 UX 主线（P0-A~P2-K + Mock 密度 + 持久化 + 无障碍 + 移动端）已全部落地；剩下是文案/命名清理与 provider 接入，UI 侧只剩可选打磨（表格逐格骨架、phase×view 收敛）。
2. 清理前端/health 的 DeepSeek 历史文案，避免用户误解当前服务器 provider。
3. 9router 免费模型暂不稳定；需要 LLM 交付时，先接入可验证 provider，再把 n8n mode 切到 `public_web_9router`，并给 glm-workflow 接 `onProgress` 让 deepseek 模式也走细粒度 SSE。
4. 移动端（P2-H 抽屉导航）和 P0-B 表格骨架属于体验打磨，可排在持久化 / 无障碍之后。
