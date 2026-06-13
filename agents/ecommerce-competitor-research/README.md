# 电商竞品研究 Agent

## 目标

输入行业、品类和市场后，先自动发现公开信息源并建立行业数据库，再输出电商竞品研究报告，帮助快速识别竞品结构、产品信号、用户痛点、内容信号和新品类机会。

## 所属产品线

- 英文名：Industry Research Product Line
- 中文名：行业研究生产台
- 模板 ID：ecommerce_competitor_research

## 当前状态

MVP 开发中。第一版已支持 mock crawler、公开 URL 轻量采集、mock 数据库建设流程；Markdown 报告和公开资料结构化抽取节点已支持服务端调用本机 9router。当前不接真实 OpenAI、Supabase、n8n 或复杂爬虫工具。

## 工作流

1. 创建研究项目。
2. 自动发现信息源。
3. 生成采集计划。
4. mock 执行采集，生成 raw documents 和 extraction jobs。
5. 建立九类数据库：信息源、竞品、网站结构、产品、关键词、痛点、内容、机会、周报。
6. URL、CSV、手动文本作为补充资料进入证据链。
7. 抽取竞品、产品信号、用户痛点和内容信号。
8. 生成机会评分。
9. 人工审核。
10. 生成 Markdown 报告。

## 9router 接入

- Studio 页面支持“用 9router 生成报告”和“公开采集 + 9router 抽取”。
- 真实模型用于报告生成和 public_web raw documents 的结构化抽取；所有结论仍标记为待人工验证。
- 环境变量优先读取 `AGENT_FACTORY_9ROUTER_API_KEY` / `NINE_ROUTER_API_KEY`，也兼容 documents 项目的 `HORIZON_AI_BASE_URL` + `OPENAI_API_KEY` 形态。
- 默认 base url：`http://localhost:20128/v1`。
- 默认文本模型：`kr/claude-sonnet-4.5`，可用 `AGENT_FACTORY_9ROUTER_MODEL` 覆盖。

## 自动采集入口

- URL 是可选补充输入，不再是 public_web 的必填入口。
- URL 留空时，public_web 会先用公开搜索 HTML 发现候选竞品官网，再探测 robots、sitemap、RSS/Atom 和 Shopify 公开路径。
- 第一版搜索发现默认限制为 1 个搜索词、每个词 3 个结果、最多 24 个探测 URL，避免请求量失控。

## 数据库优先输出

- `source_database` 信息源库
- `competitor_database` 竞品库
- `website_structure_database` 网站结构库
- `product_database` 产品库
- `keyword_database` 关键词库
- `pain_point_database` 用户痛点库
- `content_database` 内容库
- `opportunity_database` 机会库
- `weekly_intelligence_reports` 行业情报周报库

## 暂不做

- 登录
- 支付
- SaaS 对外开放
- 复杂多租户
- 真实爬虫代理池
- 把 9router 抽取结果跳过人工审核直接作为最终事实
- 绕过登录、验证码或付费墙
- 抓取私人数据
