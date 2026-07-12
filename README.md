# 行业研究生产台

Industry Research Production Table 是从 `agent-factory` 拆出的独立项目。当前上位产品方向是 **Industry Research OS**：先把完整大行业展开为可执行研究计划、来源角色、覆盖矩阵和代表性抽样，再调用采集、证据校验、研究模块、综合报告和持续更新能力。

电商竞品研究是当前已经运行和部署的第一个研究模块，不再代表整个产品。Industry Planner 第一切片当前只完成本地 C2，尚未 commit、push 或部署；生产 `/industry-research` 仍是既有电商竞品研究 H5。

## 产品层级与权威来源

发生冲突时按以下顺序理解项目：

1. `docs/prds/industry-research-os-prd.md`：产品定位、行业级输入、研究链条和阶段边界的上位权威。
2. `PROJECT_CONTEXT.md`：当前代码、Git、验证和生产状态的动态事实来源。
3. `docs/prds/ecommerce-competitor-research-prd.md`：Industry OS 下游“电商竞品研究”模块 PRD；其中早期 mock/MVP 描述保留为历史演进记录。
4. `docs/benchmarks/*` 和 `outputs/industry-research-benchmarks/*`：运行证据，不定义上位产品方向。
5. `docs/CODEX_INDUSTRY_OS_HANDOFF.md`：新会话恢复入口和下一阶段边界。

旧 benchmark runner 中的 `skincare-broad-negative` 仅是已保留的历史实验标签，不能继续解释为“护肤品必须缩小”。后续 benchmark 必须把“护肤品”当作合法行业级输入。

## 当前能力

- 本地 Industry Planner：输入完整行业和研究坐标，生成 `industry_plan.v1`、来源角色、跨轴覆盖矩阵和代表性抽样契约
- 创建行业研究项目
- 选择 `ecommerce_competitor_research` 模板
- URL / CSV / 手动文本补充输入
- URL 留空时，通过公开搜索 HTML 发现候选竞品官网
- 探测 robots、sitemap、RSS/Atom、Shopify collection/product/blog 公开路径
- 抽取 raw documents
- 可选使用 9router / OpenAI-compatible provider 做结构化抽取和 Markdown 报告生成
- 人工审核结构化结果
- 可选把 run 元数据、交付包和 n8n 回调事件写入 Supabase（服务端私有，生产启用）
- 可选用 zvec 建本地历史研究检索缓存（默认写入 `.cache/industry-research-zvec`，带增量状态文件）
- 输出九类数据库视图：
  - `source_database`
  - `competitor_database`
  - `website_structure_database`
  - `product_database`
  - `keyword_database`
  - `pain_point_database`
  - `content_database`
  - `opportunity_database`
  - `weekly_intelligence_reports`

## 技术栈

- TypeScript
- Next.js App Router（可选 Studio，不作为日常默认入口）
- pnpm workspace
- Vitest
- Biome
- UI 默认业务流使用 `public_web_llm`：先公开采集，再用 OpenAI-compatible provider 做结构化抽取和报告；当前生产最近一次受控 canary 使用阿里云 MaaS 免费模型池，但这不构成付费交付承诺。生产/付费交付必须切换并确认自付费 provider；n8n 周报仍保持低成本 `public_web`

Supabase 轻量 production migration 已应用到专用 project；n8n 业务流已按低成本 `public_web` 链路接入。日常开发优先跑 CLI 脚本，避免长期启动 Next dev server。

生产运行面固定在轻量服务器：`research.playgamelab.cn` 承载前端/API，n8n 和 9router 也在轻量服务器体系内衔接。Vercel / 本机只作为预览或开发，不承载正式 run、API、交付包目录或 zvec 缓存。

部署模板默认使用 `/etc/industry-research/industry-research.env`；当前轻量服务器实际生产 env 位于 `/opt/playgamelab/industry-research/industry-research.env`。`pnpm server:doctor`、`pnpm zvec:index`、`pnpm zvec:search` 可用 `AGENT_FACTORY_ENV_FILE=/path/to/file` 显式指定，手动 shell 不应假设 systemd env 会自动加载。

Supabase + zvec 基础设施第一版已接入代码侧：

- Supabase 只作为服务端私有权威运行记录库使用，前端不直连表。
- `AGENT_FACTORY_SUPABASE_ENABLED=true` 后，run 成功会写入 Supabase；写入失败会让 run 失败。
- 专用 Supabase project 已创建并应用 migration：`industry-research-production-table` / `ghsyjdipofnyokbbbrdb` / `ap-southeast-1`。
- Supabase run list / detail / download 是服务端优先读取路径；本地 8 文件交付包作为 fallback。
- zvec 只是本地检索缓存，不是权威存储；删除 `.cache/industry-research-zvec` 后可用脚本从本地交付包或 Supabase artifact 重建。
- 对外 run mode 收敛为 `public_web` / `public_web_llm` / `llm_only`；`9router`、`public_web_9router`、`deepseek` 等是兼容别名，真实 provider 信息写入 `runMetadata`。

## CLI-first 本地运行

只生成离线 Industry Plan，不联网、不调用 provider：

```bash
pnpm plan:industry
```

默认读取 `fixtures/industry-planner/skincare-input.json`，写入 `outputs/industry-plans/skincare/industry-plan.json`。

运行现有电商竞品研究公开网页 smoke：

```bash
pnpm install
cp .env.example .env.local
pnpm sample:public-web
```

`sample:public-web` 只跑公开网页轻量采集，不调用 LLM，会写出 `outputs/industry-research-runs/<runId>/manifest.json`。

需要核对 9router / OpenAI-compatible 兼容链路时，可以运行以下历史兼容命令；它们可能产生真实 provider 调用和费用，必须先确认环境与预算。`/models` 有候选不代表 `/chat/completions` 可用，不能据此承诺生产：

```bash
pnpm probe:9router
pnpm verify:9router
```

`verify:deepseek` / `sample:deepseek` 是历史兼容入口；新业务口径统一使用 `AGENT_FACTORY_LLM_*` 环境变量。当前 provider live 状态以 `PROJECT_CONTEXT.md` 和当次 doctor/验证为准，不从 README 历史文字推断。

完整验证：

```bash
pnpm check
pnpm build
pnpm sample:public-web
```

基础设施检查：

```bash
pnpm server:doctor
pnpm supabase:doctor
pnpm supabase:smoke
pnpm supabase:backfill-local-runs
pnpm zvec:index
pnpm zvec:search --query="宠物 益生菌"
```

`supabase:backfill-local-runs` 默认是 dry-run；确认结果后再传 `--write`，如只补缺失历史 run 可加 `--skip-existing`。

`zvec:index` 默认不执行 zvec optimize；如需维护压缩，显式传 `--optimize` 或设置 `AGENT_FACTORY_ZVEC_OPTIMIZE=true`。

## 可选 Studio

只有需要看 UI 时才启动 Studio：

```bash
pnpm dev
```

打开 `http://localhost:3000/industry-research`。如果电脑发热，优先停止 dev server，继续使用 CLI 脚本。

## 生产注意

生产或付费交付必须配置自付费 provider，不能使用免费路由或未授权额度：

```env
AGENT_FACTORY_LLM_API_KEY=
AGENT_FACTORY_LLM_BASE_URL=
AGENT_FACTORY_LLM_MODEL=
AGENT_FACTORY_INTERNAL_API_KEY=
```

生产环境如果仍指向 `localhost` LLM base URL，会被拒绝，除非显式设置：

```env
AGENT_FACTORY_ALLOW_LOCAL_LLM_IN_PROD=1
```

## 目录

- `apps/studio`：Next.js 内部工作台
- `packages/industry-research`：行业研究核心逻辑
- `agents/ecommerce-competitor-research`：标准 Agent 模板目录
- `docs/prds`：PRD
- `docs/lightweight-server-runtime.md`：轻量服务器生产运行架构
- `deploy/lightweight-server`：systemd、Caddy 和服务器 env 模板
- `supabase/migrations`：轻量 production schema；已应用到专用 project，后续变更仍需复核 RLS / owner 策略
- `workflows/n8n`：n8n workflow 与接线说明
- `scripts/run-industry-research-public-web-smoke.ts`：低负载 public_web smoke 脚本
- `scripts/supabase-doctor.ts`：Supabase env / 表可用性只读检查
- `scripts/supabase-smoke.ts`：Supabase service-role 写入/读回 smoke
- `scripts/supabase-backfill-local-runs.ts`：把本地 8 文件历史 run 幂等补写到 Supabase
- `scripts/zvec-index-industry-research.ts`：把本地历史 run 索引到 zvec
- `scripts/zvec-search-industry-research.ts`：搜索 zvec 本地检索缓存
- `scripts/probe-9router-free-models.ts`：9router free 候选模型真实 chat 探测脚本
- `scripts/verify-9router-industry-research.ts`：9router / OpenAI-compatible provider 验证脚本
