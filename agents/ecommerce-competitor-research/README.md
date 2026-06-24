# 电商竞品研究 Agent

## 目标

输入行业、品类和市场后，先自动发现公开信息源并建立行业数据库，再输出电商竞品研究报告，帮助快速识别竞品结构、产品信号、用户痛点、内容信号和新品类机会。

## 所属产品线

- 英文名：Industry Research Product Line
- 中文名：行业研究生产台
- 模板 ID：ecommerce_competitor_research

## 当前状态

MVP 开发中。第一版已支持 mock crawler、公开 URL 轻量采集、mock 数据库建设流程；Markdown 报告和公开资料结构化抽取节点已支持服务端调用 DeepSeek v4 flash。当前不接真实 OpenAI、Supabase、n8n 或复杂爬虫工具。

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

## DeepSeek 接入

- Studio 页面支持“用 DeepSeek 生成报告”和“公开采集 + DeepSeek 抽取”。
- 真实模型用于报告生成和 public_web raw documents 的结构化抽取；所有结论仍标记为待人工验证。
- 环境变量优先读取 `AGENT_FACTORY_DEEPSEEK_API_KEY` / `DEEPSEEK_API_KEY`，也可用 `AGENT_FACTORY_LLM_API_KEY` 指向自付费 OpenAI-compatible provider。
- 默认 base url：`https://api.deepseek.com`。
- 默认文本模型：`deepseek-v4-flash`，可用 `AGENT_FACTORY_DEEPSEEK_MODEL` 覆盖。

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

## 客户交付模板：行业竞品研究轻量版

定位：用于 1 个行业 / 品类 / 市场的轻量竞品研究交付，适合在销售前调研、内容选题、产品切入判断阶段使用。

输入字段：
- 项目名称
- 行业
- 品类
- 市场
- 研究目标
- 可选公开 URL
- 可选 CSV
- 可选人工线索

输出文件：
- `input.json`：本次研究输入。
- `raw_documents.json`：公开采集到的原始资料和 source quality。
- `databases.json`：九类数据库快照。
- `review_items.json`：交付前人工审核清单。
- `report.md`：原始交付报告。
- `reviewed_report.md`：已审核版报告。
- `run_log.json`：运行日志、DeepSeek 状态、采集失败、抽取待复核和 sourceQualitySummary。

人工审核规则：
- 每条主要结论必须追溯到 evidenceId、raw document URL/title/excerpt。
- 数据源 `sourceRelevance=low` 或 `sourceConfidence=low` 的结论不能进入“已确认发现”。
- `robots`、`sitemap` 只用于发现和边界判断，不能单独支撑业务结论。
- DeepSeek 抽取结果默认需要人工复核，审核状态只能是 `confirmed`、`needs_review` 或 `rejected`。
- 已审核版报告只把人工确认且 `acceptedForReport=true` 的证据支撑结论放入“已确认发现”。

不承诺：
- 不承诺 100% 自动事实判断。
- 不承诺销量、市场份额、广告投放、转化率等无法从公开页面直接证明的结论。
- 不绕过登录、验证码、付费墙，不抓私人数据。

交付前验收清单：
- `run_log.json` 中 `llmStatus` 为 `deepseek`，不是 `fallback`。
- `raw_documents.json` 至少包含 3 条可复核公开资料。
- `sourceQualitySummary.acceptedForReport` 大于 0。
- `report.md` 包含已确认发现、证据不足但可能成立的发现、阻塞项、剩余不确定性和证据索引。
- `reviewed_report.md` 已生成，并明确区分 confirmed / needs_review / rejected。
- 所有客户可见结论均保留 evidenceId 和 URL/title/excerpt。

## 暂不做

- 登录
- 支付
- SaaS 对外开放
- 复杂多租户
- 真实爬虫代理池
- 把 DeepSeek 抽取结果跳过人工审核直接作为最终事实
- 绕过登录、验证码或付费墙
- 抓取私人数据
