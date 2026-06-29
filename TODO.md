# TODO

更新时间：2026-06-29

## 已完成

- [x] 按 `docs/design_handoff_research_console 2/porting/source/globals.css` 迁移核心 UI 样式。
- [x] 补齐展示字体：`Space Grotesk`、`Manrope`、`IBM Plex Mono`、`Noto Sans SC`。
- [x] 移植 `components.tsx`、`KnowledgeGraph.tsx`、`micro.tsx`、`extras.tsx`。
- [x] 用装配版 `IndustryResearchWorkbench.tsx` 接入 adapter、fixtures、mock event timeline 和 core mock workflow。
- [x] 扩充 core mock 数据，让结果页统计和主要表格密度贴近 screenshots 基准。
- [x] 跑通 `pnpm check`。
- [x] 停止 `localhost:3000` 开发服务。
- [x] 从 `agent-factory` 同步 v0.3 行业研究核心：OpenAI-compatible provider 兼容层、sourceQuality、delivery package、manifest、run API、n8n webhook 合约。
- [x] 新增 `pnpm sample:public-web`，作为不启动 Studio、不调用 LLM 的低负载 smoke 验证入口。
- [x] 新增 `pnpm probe:9router` 和 `pnpm verify:9router`，作为需要真实 LLM 时的显式探测 / 验证命令；`verify:deepseek` / `sample:deepseek` 保留为历史兼容入口。
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
  - LLM SSE：glm-workflow 两个函数接 `onProgress`，9router / OpenAI-compatible mode 也走细粒度流式（实测 emit 12 步 done + report start + error 帧）。
  - 验证：`pnpm check`、`pnpm build`、浏览器点检（持久化/抽屉/SSE）全通过。
- [x] 2026-06-26 待办收敛：
  - 真实 run 期的 stat 条 / 九库卡 / 表格区 `<Skeleton/>` 已铺进 running 页面。
  - P2-J 的 phase×view 可见性已收敛为 `deriveVisibleScreen` 单一派生函数。
  - UI / health / README / 当前状态文档已统一为 9router / OpenAI-compatible provider 口径；旧 `deepseek` mode / 函数名仅作为兼容层保留。
  - 新增 `scripts/probe-9router-free-models.ts` 和 `pnpm probe:9router`，按 `/models` 候选 + `/chat/completions` 真实请求判断 free 模型可用性。
  - API 默认 run mode 改为 `public_web`，没有显式 LLM mode 时不调用 provider。
  - robots / 公开数据边界仍遵循既有 public_web 约束；生产 / 付费交付必须配置自付费 provider 和内部 API key，不使用不稳定 free provider 承诺交付。
- [x] 2026-06-29 Supabase + zvec 基础设施代码侧接入：
  - 新增轻量 production schema migration，覆盖 run、artifact、n8n event、zvec chunk metadata。
  - RLS deny-by-default，第一版不开放客户端表访问。
  - 新增 Supabase service-role 写入模块和 repository adapter。
  - run 成功后在 `AGENT_FACTORY_SUPABASE_ENABLED=true` 时写入 Supabase，失败则 run 失败。
  - 新增 `pnpm supabase:doctor`、`pnpm supabase:smoke`、`pnpm zvec:index`、`pnpm zvec:search`。
  - zvec 使用本地 `.cache/industry-research-zvec/chunks`，已验证历史 run 可索引和搜索。
- [x] 2026-06-29 轻量服务器运行架构补齐：
  - 明确生产运行面固定为轻量服务器。
  - 新增 `docs/lightweight-server-runtime.md`。
  - 新增 `deploy/lightweight-server/` 的 systemd、Caddy 和 env 模板。
  - 新增 `pnpm server:doctor`。
  - `apps/studio` start 命令改为尊重 `PORT`，支持 `PORT=3010`。
  - 脚本默认读取 `/etc/industry-research/industry-research.env`，也支持 `AGENT_FACTORY_ENV_FILE` 指向临时 env 文件。
  - 新 run 返回的交付包目录、zvec chunk 元数据路径会按真实服务器目录生成。
- [x] 2026-06-29 专用 Supabase project 已创建：
  - project：`industry-research-production-table`
  - ref：`ghsyjdipofnyokbbbrdb`
  - URL：`https://ghsyjdipofnyokbbbrdb.supabase.co`
  - region：`ap-southeast-1`
  - Postgres：`17.6`
- [x] 2026-06-29 Supabase migration 已应用到专用 project：
  - 4 张表存在：run、artifact、n8n event、zvec chunk metadata。
  - RLS 全部开启，第一版 policy 为空。
  - `anon` / `authenticated` 对表和 n8n sequence 无读写权限。
  - `service_role` 可写入并读回 run/artifact/event/zvec chunk；smoke 事务已 rollback，未留下测试数据。
  - Advisors 只有预期 INFO：RLS enabled no policy、new unused indexes。
- [x] 2026-06-29 轻量服务器 Supabase env 已配置并修正：
  - 远端 env 路径：`/opt/playgamelab/industry-research/industry-research.env`。
  - 已备份错误 key 版本：`industry-research.env.bak-20260628215506`。
  - 已修正 `SUPABASE_SERVICE_ROLE_KEY` 两段 JWT 拼接导致的 `401 Invalid API key`。
  - 远端 REST smoke 通过：4 张表可访问，测试写入/读回/清理通过。
- [x] 2026-06-29 远端最小同步已执行：
  - 同步包只包含 Supabase/zvec/server-doctor/env/docs/deploy 模板等基础设施文件。
  - 远端备份：`.deploy-backups/minimal-infra-sync-before-20260629060251.tar.gz`。
  - `pnpm install --frozen-lockfile`、`pnpm server:doctor`、`pnpm supabase:doctor`、`pnpm supabase:smoke` 均已通过。
- [x] 2026-06-29 远端 zvec 与生产服务复测完成：
  - `pnpm zvec:index` 通过；历史旧 run 缺 Supabase 权威记录的 chunk 被计入 `skippedMissingRuns`。
  - deployment API smoke run：`deployment-api-smoke-2026-06-29T04-48-52-525Z`。
  - 本地交付包 8 文件齐全，Supabase run 1 条、artifact 8 条、zvec metadata 14 条。
  - `pnpm zvec:search --query=deployment-api-smoke` 可检索到新 run。
  - 远端 `pnpm build` 通过，`industry-research.service` 已重启。
  - 本机和公网 `/api/health` 均返回 `status=ok`。
- [x] 2026-06-29 Claude Code 简化 UI 已合并到 GitHub：
  - 提交：`329dab8 feat(studio): simplify /industry-research to a 3-step flow, keep console as advanced mode`。
  - 默认 `/industry-research` 改成 3 步用户流程。
  - 完整工程控制台保留在「高级模式」。
  - 首页文案已去工程黑话。
  - 本轮已确认本地 `main` 与 `origin/main` 一致。
- [x] 2026-06-29 Claude Code 简化 UI 已部署到轻量服务器：
  - 备份：`.deploy-backups/ui-head-sync-before-20260629130046.tar.gz`。
  - 已从 GitHub `HEAD` 同步 `/industry-research` 前端目录、首页、`globals.css`、`layout.tsx`。
  - 发现并修正 `actions.ts` UI mode 类型兼容问题：同时支持 `9router/public_web_9router` 和 legacy `deepseek/public_web_deepseek`。
  - 远端 `pnpm build` 通过。
  - `industry-research.service` 已重启，状态 active。
  - 公网 `/industry-research` 已返回新 UI 文案和「高级模式」入口。

## 待处理

- 9router free 模型的最终可用性需要在服务器带 `AGENT_FACTORY_LLM_API_KEY` / `NINE_ROUTER_API_KEY` 的环境运行 `pnpm probe:9router` 复核；本地当前没有 provider key，不能确认 live chat 成功。
- 后续如果要把 2026-06-24 的历史本地 run 也变成 Supabase 权威记录，需要单独写 backfill 脚本导入 run + artifacts，再重新跑 zvec metadata；当前不影响新 run。

## 下一步建议

1. 先把 n8n 业务流继续稳定在 `public_web`，保证无 LLM 也能产出 8 文件交付包。
2. 需要 LLM 交付时，在服务器运行 `pnpm probe:9router`；若没有 usable model，切换自付费 OpenAI-compatible provider 后再启用 `public_web_9router`。
3. 生产上线前复核内部 API key、n8n Header Auth credentials、robots / 公开数据边界和 provider 成本。
4. Supabase、zvec、轻量服务器 API 和简化 UI 都已完成第一版闭环；下一步可以接 n8n 回调事件和真实业务 run 监控。
5. 如果要使用 LLM 交付，先在服务器运行 provider 探测，确认可用的自付费 OpenAI-compatible provider。
