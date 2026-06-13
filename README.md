# 行业研究生产台

Industry Research Production Table 是从 `agent-factory` 拆出的独立项目。第一版聚焦电商竞品研究，用于批量生产竞品调研、行业研究、新品类机会报告和行业情报周报。

## 当前能力

- 创建行业研究项目
- 选择 `ecommerce_competitor_research` 模板
- URL / CSV / 手动文本补充输入
- URL 留空时，通过公开搜索 HTML 发现候选竞品官网
- 探测 robots、sitemap、RSS/Atom、Shopify collection/product/blog 公开路径
- 抽取 raw documents
- 使用 9router / OpenAI-compatible provider 做结构化抽取和 Markdown 报告生成
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
- Next.js App Router
- pnpm workspace
- Vitest
- Biome
- 本地开发默认使用 9router：`http://localhost:20128/v1`

Supabase 和 n8n 当前仍是草案，没有真实接入。

## 本地运行

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

打开：

```text
http://localhost:3000/industry-research
```

验证：

```bash
pnpm check
pnpm verify:9router
```

## 生产注意

本地 9router / Kiro 免费档只适合开发验证。生产或付费交付必须配置自付费 provider：

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
- `scripts/verify-9router-industry-research.ts`：本机 9router 验证脚本
