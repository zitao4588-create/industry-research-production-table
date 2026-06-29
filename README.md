# 行业研究生产台

Industry Research Production Table 是从 `agent-factory` 拆出的独立项目。第一版聚焦电商竞品研究，用于批量生产竞品调研、行业研究、新品类机会报告和行业情报周报。

## 当前能力

- 创建行业研究项目
- 选择 `ecommerce_competitor_research` 模板
- URL / CSV / 手动文本补充输入
- URL 留空时，通过公开搜索 HTML 发现候选竞品官网
- 探测 robots、sitemap、RSS/Atom、Shopify collection/product/blog 公开路径
- 抽取 raw documents
- 可选使用 9router / OpenAI-compatible provider 做结构化抽取和 Markdown 报告生成
- 人工审核结构化结果
- 可选把 run 元数据、交付包和 n8n 回调事件写入 Supabase（服务端私有，默认关闭）
- 可选用 zvec 建本地历史研究检索缓存（默认写入 `.cache/industry-research-zvec`）
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
- 默认业务流使用 `public_web`，不调用 LLM；需要 LLM 时显式配置 9router 或自付费 OpenAI-compatible provider

Supabase migration 当前仍是草案；n8n 业务流已按 `public_web` 默认链路接入。日常开发优先跑 CLI 脚本，避免长期启动 Next dev server。

生产运行面固定在轻量服务器：`research.playgamelab.cn` 承载前端/API，n8n 和 9router 也在轻量服务器体系内衔接。Vercel / 本机只作为预览或开发，不承载正式 run、API、交付包目录或 zvec 缓存。

轻量服务器 env 固定放在 `/etc/industry-research/industry-research.env`；`pnpm server:doctor`、`pnpm zvec:index`、`pnpm zvec:search` 会默认尝试读取它，也可用 `AGENT_FACTORY_ENV_FILE=/path/to/file` 临时指定。

Supabase + zvec 基础设施第一版已接入代码侧：

- Supabase 只作为服务端私有权威运行记录库使用，前端不直连表。
- `AGENT_FACTORY_SUPABASE_ENABLED=true` 后，run 成功会写入 Supabase；写入失败会让 run 失败。
- 专用 Supabase project 已创建并应用 migration：`industry-research-production-table` / `ghsyjdipofnyokbbbrdb` / `ap-southeast-1`。
- zvec 只是本地检索缓存，不是权威存储；删除 `.cache/industry-research-zvec` 后可用脚本重建。

## CLI-first 本地运行

```bash
pnpm install
cp .env.example .env.local
pnpm sample:public-web
```

`sample:public-web` 只跑公开网页轻量采集，不调用 LLM，会写出 `outputs/industry-research-runs/<runId>/manifest.json`。

需要 LLM provider 时先探测 9router free 候选，确认真实 `/chat/completions` 可用后再运行 LLM 链路：

```bash
pnpm probe:9router
pnpm verify:9router
```

`verify:deepseek` / `sample:deepseek` 是历史兼容入口；新业务口径优先使用 `AGENT_FACTORY_LLM_*` 环境变量和 9router / OpenAI-compatible provider。

完整验证：

```bash
pnpm check
```

基础设施检查：

```bash
pnpm server:doctor
pnpm supabase:doctor
pnpm supabase:smoke
pnpm zvec:index
pnpm zvec:search --query="宠物 益生菌"
```

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
- `supabase/migrations`：数据库草案，应用前需复核 RLS / owner 策略
- `workflows/n8n`：n8n workflow 与接线说明
- `scripts/run-industry-research-public-web-smoke.ts`：低负载 public_web smoke 脚本
- `scripts/supabase-doctor.ts`：Supabase env / 表可用性只读检查
- `scripts/supabase-smoke.ts`：Supabase service-role 写入/读回 smoke
- `scripts/zvec-index-industry-research.ts`：把本地历史 run 索引到 zvec
- `scripts/zvec-search-industry-research.ts`：搜索 zvec 本地检索缓存
- `scripts/probe-9router-free-models.ts`：9router free 候选模型真实 chat 探测脚本
- `scripts/verify-9router-industry-research.ts`：9router / OpenAI-compatible provider 验证脚本
