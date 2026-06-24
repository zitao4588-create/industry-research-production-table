# 项目上下文

更新时间：2026-06-18

## 当前项目目标

行业研究生产台是从 `agent-factory` 拆出的独立项目。当前第一条线是电商竞品研究 Agent，用于把行业、品类、市场输入转成公开信息源发现、采集计划、九类数据库、机会评分、人工审核和 Markdown 研究报告。

## 当前技术栈

- TypeScript
- Next.js App Router，入口在 `apps/studio`，但现在降级为可选 UI
- pnpm workspace
- Vitest
- Biome
- CLI-first：日常验证优先使用 `scripts/*`，不默认启动 Next dev server
- 真实 LLM 默认使用 DeepSeek v4 flash / OpenAI-compatible provider

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
- `@industry-research/core` mock 数据已扩充，用于让结果页达到设计稿需要的数据密度：
  - 信息源候选：8
  - raw documents：19
  - extraction jobs：27
  - evidence：74
  - 竞品：6
  - 机会：6
- `localhost:3000` 的 Next dev 服务不再作为日常入口；如果电脑发热，应优先停止 dev server，改用 CLI。

## 验证结果

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
- Browser 验收：
  - 页面可打开，非空白
  - 运行后统计条显示 `8 / 19 / 27 / 74 / 9`
  - 结构化 tabs 显示 `机会评分6 / 竞品6 / 产品5 / 用户痛点5 / 内容信号5 / 关键词6 / 周报1`
  - 最高机会显示 `换粮过渡期肠道套装`，综合评分 `84`
  - 控制台 `error/warn` 为空

## 当前限制

- 不做登录。
- 不做支付。
- 不做复杂多租户。
- Supabase migration 仍是草案，应用前必须复核 RLS、`owner_id` 和 policy。
- 生产 / 付费交付必须使用自付费 provider。
- 真实后端事件流尚未替换 mock timeline，`startRun()` 中仍保留 TODO。
- n8n 只预留合约，不启动公网 n8n。
