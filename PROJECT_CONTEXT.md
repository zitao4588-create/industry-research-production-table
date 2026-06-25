# 项目上下文

更新时间：2026-06-25

## 当前项目目标

行业研究生产台是从 `agent-factory` 拆出的独立项目。当前第一条线是电商竞品研究 Agent，用于把行业、品类、市场输入转成公开信息源发现、采集计划、九类数据库、机会评分、人工审核和 Markdown 研究报告。

## 当前技术栈

- TypeScript
- Next.js App Router，入口在 `apps/studio`，但现在降级为可选 UI
- pnpm workspace
- Vitest
- Biome
- CLI-first：日常验证优先使用 `scripts/*`，不默认启动 Next dev server
- 真实 LLM 使用 OpenAI-compatible provider；轻量服务器当前指向 9router / `mmf/mimo-auto`，但默认业务流先走不调用 LLM 的 `public_web`

## 当前真实状态

- 已从 `agent-factory` 同步行业研究 v0.3 核心边界：
  - DeepSeek v4 flash 默认真实 LLM
  - public_web 保守采集
  - `sourceQuality`
  - `reviewed_report.md`
  - `run_log.json`
  - `manifest.json`
  - 本地交付包目录 `outputs/industry-research-runs/<runId>/`
  - 最小 run list / detail / download API
  - n8n webhook 合约和 workflow 草案
- 新增低负载 CLI 脚本 `pnpm sample:public-web`，只跑公开网页轻量采集，不调用 DeepSeek，不启动 Studio。
- 新增 DeepSeek 验证入口 `pnpm verify:deepseek` 和交付样例入口 `pnpm sample:deepseek`；执行前需要确认 `.env.local` 中已配置 DeepSeek key，并接受调用成本。
- `/industry-research` 工作台已按 `docs/design_handoff_research_console 2/porting/` 的 source CSS 和 TSX 组件完成移植。
- `globals.css` 已改为按源设计稿规则对齐，包括噪点层、玻璃效果、光晕、暗/亮主题、reduced-motion 等。
- `IndustryResearchWorkbench.tsx` 已换成装配版，接入已有 adapter、fixture、运行事件流和 `@industry-research/core` mock 工作流。
- 字体已补齐 `Space Grotesk`、`Manrope`、`IBM Plex Mono`、`Noto Sans SC`。
- 2026-06-25 Claude Code UI 还原修正已提交：
  - 修复 `next/font` 变量挂载和 CSS 字体栈，确保中文走 `Noto Sans SC` 兜底。
  - 英雄区知识图谱收进安全边距，补边缘羽化遮罩，并把 setup 图谱高度调到 480。
  - 明暗切换按钮浅色态改为月亮图标。
  - 知识图谱 tooltip 改为读取实时数据库计数，避免显示挂载时旧值。
  - `docs/porting` 参考代码已从 Biome 检查中排除，避免把设计交接材料当应用代码 lint。
- 2026-06-25 Mock 数据密度通过 `entityProfile: "rich"`（仅 Mock）恢复，浏览器实测结果页统计条 `8 / 8 / 26 / 74 / 9`：
  - 信息源候选：8 ｜ raw documents：8 ｜ extraction jobs：26 ｜ evidence：74
  - 竞品：6 ｜ 机会：6 ｜ 产品：6 ｜ 痛点：5 ｜ 内容：5 ｜ 关键词：6 ｜ 九库 10/6/3/6/6/5/5/6/2
  - 真实 `public_web`/`deepseek` 保持 lean（1 竞品），不凭空夸大采集结果（见 DECISIONS）。
- `localhost:3000` 的 Next dev 服务不再作为日常入口；如果电脑发热，应优先停止 dev server，改用 CLI。
- 2026-06-25 已把轻量服务器 n8n 业务流接入行业研究生产台：
  - n8n production webhook：`POST /webhook/industry-research/intake`
  - workflow 使用 n8n Header Auth credentials 调用受保护的 run API 和 n8n 回调 API，不在 workflow JSON 中保存 secret。
  - workflow 默认 `public_web`，不调用 LLM；如要走 9router，调用方显式传 `mode: "public_web_9router"` 或 `mode: "9router"`。
  - 已验证默认 webhook 产生 run：`n8n-default-public-web-smoke-2026-06-24T18-51-31-476Z`。
  - 9router 当前仍指向 `mmf/mimo-auto`，但本轮探测到 MiMo Free 上游返回 `risk_control`，暂不能作为稳定默认模型。

## 验证结果

- 2026-06-25 Claude Code UI 修正后验证：
  - `pnpm check`：通过
  - typecheck：`packages/industry-research` 和 `apps/studio` 均通过
  - Vitest：2 个测试文件通过，34 条测试通过
  - Biome：检查 55 个文件，无需修复
  - 本轮未重新启动浏览器做人工视觉点检；当前只确认类型、测试和 lint 全绿。
- 2026-06-25 轻量服务器 n8n 业务流验证：
  - `https://n8n.playgamelab.cn/webhook/industry-research/intake` 已注册 production POST webhook。
  - 默认不传 `mode` 的请求返回 `industry_research_n8n_run_complete_ack.v1`，`accepted=true`。
  - 交付包目录 8 个文件齐全，`run_log.llmStatus=local`。
  - `/api/industry-research/runs/<runId>/download` 使用内部 key 返回 `HTTP 200`。
  - 9router 模型探测：`mmf/mimo-auto` / `mimo-free/mimo-auto` 当前返回上游 `risk_control`；`gh/goldeneye-free-auto`、`opencode/*`、`cloudflare-ai/*`、`groq/*`、`glm*`、`qwen*` 等候选要么缺 provider credentials，要么返回 Missing API key。
- 2026-06-18 CLI-first 迁移验证：
  - `pnpm --filter @industry-research/core typecheck`：通过
  - `pnpm test`：通过，18 个测试通过
  - `pnpm check`：通过
  - `pnpm sample:public-web`：通过，不启动 Next、不调用 DeepSeek，6.8 秒完成
  - 最新低负载交付包：`outputs/industry-research-runs/v03-public-web-smoke-2026-06-18T14-21-27-261Z/`
  - 本次 smoke run：raw documents 3，acceptedForReport 1，crawlFailures 0，`manifest.json` 可解析
- 2026-06-15 UI 验证历史：
  - `pnpm --filter @industry-research/core typecheck`：通过
  - `pnpm test`：通过，16 个测试通过
  - `pnpm check`：通过
- Browser 验收（2026-06-25 Mock rich 实测）：
  - 页面可打开，非空白
  - 运行后统计条显示 `8 / 8 / 26 / 74 / 9`
  - 结构化 tabs 显示 `机会评分6 / 竞品6 / 产品6 / 用户痛点5 / 内容信号5 / 关键词6 / 周报1`
  - 最高机会显示 `换粮过渡期肠道套装`，综合评分 `88`
  - 证据单元格可点开溯源弹层（来源标题 + 可信度 + 原文 + URL）
  - 真实 `public_web` 经流式路由逐步推进（0%→23%→done，发现阶段真实耗时 ~5.3s）

## 当前限制

- 不做登录。
- 不做支付。
- 不做复杂多租户。
- Supabase migration 仍是草案，应用前必须复核 RLS、`owner_id` 和 policy。
- 生产 / 付费交付必须使用自付费 provider；当前免费 9router/MiMo 只适合探索，不适合承诺交付。
- 真实 run 已接入：工作台经同源 server action / 流式路由发真实 `deepseek` / `public_web` / `public_web_deepseek`。**P0-A 完整版 SSE 已落地且覆盖全部真实模式**：经 `POST /api/industry-research/run/stream` 逐阶段流式上报进度，`public_web` 发现阶段真实耗时 ~5.3s、`deepseek` 系也 emit discover/crawl/build done + report start（浏览器实测），流式不可用时回退非流式 server action。
- n8n 已在轻量服务器接入默认 `public_web` 业务流；回调 route 目前仍是 `reserved_only`，尚未写入 Supabase 或事件表。
- 2026-06-25 Claude Code 完成前端功能接线全三批：P0-C 表单校验、P0-A 真实 run（含完整 SSE、deepseek 细粒度）、P0-B 失败态/空态/Skeleton、P1-D 下载/审核回写/导出 CSV、P1-E 证据溯源弹层、P1-F 无障碍（键盘可达 + canvas 文字替代）、P1-G 刷新持久化、P2-H 移动端抽屉、P2-J 导航解耦、Mock 数据密度恢复（rich profile）。handoff 主线 P0-A~P2-K 已基本收尾；残留可选项为运行期表格逐格骨架与 phase×view 派生收敛。
