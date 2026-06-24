# 行业研究生产台

Industry Research Production Table 是从 `agent-factory` 拆出的独立项目。第一版聚焦电商竞品研究，用于批量生产竞品调研、行业研究、新品类机会报告和行业情报周报。

## 当前能力

- 创建行业研究项目
- 选择 `ecommerce_competitor_research` 模板
- URL / CSV / 手动文本补充输入
- URL 留空时，通过公开搜索 HTML 发现候选竞品官网
- 探测 robots、sitemap、RSS/Atom、Shopify collection/product/blog 公开路径
- 抽取 raw documents
- 使用 DeepSeek / OpenAI-compatible provider 做结构化抽取和 Markdown 报告生成
- 人工审核结构化结果
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
- 真实 LLM 默认使用 DeepSeek v4 flash：`https://api.deepseek.com` + `deepseek-v4-flash`

Supabase 和 n8n 当前仍是草案，没有真实接入。日常开发优先跑 CLI 脚本，避免长期启动 Next dev server。

## CLI-first 本地运行

```bash
pnpm install
cp .env.example .env.local
pnpm sample:public-web
```

`sample:public-web` 只跑公开网页轻量采集，不调用 DeepSeek，会写出 `outputs/industry-research-runs/<runId>/manifest.json`。

需要 DeepSeek 时再运行：

```bash
pnpm verify:deepseek
pnpm sample:deepseek
```

完整验证：

```bash
pnpm check
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
- `supabase/migrations`：数据库草案，应用前需复核 RLS / owner 策略
- `workflows/n8n`：n8n 草案
- `scripts/run-industry-research-public-web-smoke.ts`：低负载 public_web smoke 脚本
- `scripts/verify-deepseek-industry-research.ts`：DeepSeek 验证脚本
