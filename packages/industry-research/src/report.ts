import type {
  ContentSignal,
  CrawlPlanTarget,
  Opportunity,
  PainPoint,
  ProductSignal,
  ResearchWorkflowDataset,
  SourceDiscoveryCandidate,
} from "./types";

function formatList(items: string[]) {
  return items.length > 0
    ? items.map((item) => `- ${item}`).join("\n")
    : "- 暂无";
}

function formatEvidenceLinks(evidenceIds: string[]) {
  return evidenceIds.length > 0 ? evidenceIds.join(", ") : "待补充";
}

function formatDiscoveryCandidate(candidate: SourceDiscoveryCandidate) {
  return `- ${candidate.title}（${candidate.method} / ${candidate.sourceType} / ${candidate.priority}）：${candidate.seed}`;
}

function formatCrawlTarget(target: CrawlPlanTarget) {
  return `- ${target.kind}：${target.target}；目标库：${target.databaseTargets.join(", ")}`;
}

function formatDatabaseOverview(dataset: ResearchWorkflowDataset) {
  const databaseRows = [
    ["source_database 信息源库", dataset.source_database.length],
    ["competitor_database 竞品库", dataset.competitor_database.length],
    [
      "website_structure_database 网站结构库",
      dataset.website_structure_database.length,
    ],
    ["product_database 产品库", dataset.product_database.length],
    ["keyword_database 关键词库", dataset.keyword_database.length],
    ["pain_point_database 用户痛点库", dataset.pain_point_database.length],
    ["content_database 内容库", dataset.content_database.length],
    ["opportunity_database 机会库", dataset.opportunity_database.length],
    [
      "weekly_intelligence_reports 行业情报周报库",
      dataset.weekly_intelligence_reports.length,
    ],
  ] as const;

  return databaseRows
    .map(([name, count]) => `- ${name}：${count} 条记录`)
    .join("\n");
}

function formatProductSignal(signal: ProductSignal) {
  return `- ${signal.signal}（标签：${signal.tags.join(", ")}；证据：${formatEvidenceLinks(
    signal.evidenceIds,
  )}）`;
}

function formatPainPoint(point: PainPoint) {
  return `- ${point.theme}：${point.userNeed}（频次：${point.frequency}；证据：${formatEvidenceLinks(
    point.evidenceIds,
  )}）`;
}

function formatContentSignal(signal: ContentSignal) {
  return `- ${signal.platform} / ${signal.topic}：${signal.whyItWorks}（类型：${signal.contentType}；证据：${formatEvidenceLinks(
    signal.evidenceIds,
  )}）`;
}

function formatOpportunity(opportunity: Opportunity) {
  return [
    `### ${opportunity.title}`,
    "",
    opportunity.summary,
    "",
    `- 总分：${opportunity.totalScore}`,
    `- 需求强度：${opportunity.demandScore}`,
    `- 竞争强度：${opportunity.competitionScore}`,
    `- 内容缺口：${opportunity.contentGapScore}`,
    `- 商业价值：${opportunity.businessValueScore}`,
    `- 证据质量：${opportunity.evidenceQualityScore}`,
    `- 审核状态：${opportunity.reviewStatus}`,
    `- 审核备注：${opportunity.reviewNote}`,
    `- 证据：${formatEvidenceLinks(opportunity.evidenceIds)}`,
  ].join("\n");
}

export function generateResearchMarkdownReport(
  dataset: ResearchWorkflowDataset,
) {
  const project = dataset.research_projects[0];
  const sourceDiscoveryPlan = dataset.source_discovery_plans[0];
  const crawlPlan = dataset.crawl_plans[0];
  const isPublicWeb = crawlPlan?.mode === "public_web";

  if (!project) {
    throw new Error("Cannot generate report without a research project.");
  }

  return `${[
    `# ${project.name}`,
    "",
    "## 研究范围",
    "",
    `- 模板：${project.templateId}`,
    `- 行业：${project.industry}`,
    `- 品类：${project.category}`,
    `- 市场：${project.market}`,
    `- 目标：${project.goal}`,
    "",
    "## 自动采集计划",
    "",
    sourceDiscoveryPlan
      ? [
          "### 种子关键词",
          "",
          formatList(sourceDiscoveryPlan.seedKeywords),
          "",
          "### 信息源候选",
          "",
          formatList(
            sourceDiscoveryPlan.candidates.map(formatDiscoveryCandidate),
          ),
          "",
          "### 合规边界",
          "",
          formatList(sourceDiscoveryPlan.notes),
        ].join("\n")
      : "待生成",
    "",
    isPublicWeb ? "## 公开采集结果" : "## Mock 采集结果",
    "",
    crawlPlan
      ? [
          "### 采集目标",
          "",
          formatList(crawlPlan.targets.map(formatCrawlTarget)),
          "",
          "### 运行结果",
          "",
          `- crawl_jobs：${dataset.crawl_jobs.length}`,
          `- crawl_runs：${dataset.crawl_runs.length}`,
          `- raw_documents：${dataset.raw_documents.length}`,
          `- extraction_jobs：${dataset.extraction_jobs.length}`,
          isPublicWeb
            ? "- 说明：public_web 模式只抓取用户提供或计划内的公开 http/https URL，结构化结论仍需人工验证。"
            : "- 说明：第一版没有访问真实网页，所有采集内容都是 mock。",
        ].join("\n")
      : "待生成",
    "",
    "## 数据库建设结果",
    "",
    formatDatabaseOverview(dataset),
    "",
    "## 资料来源",
    "",
    formatList(
      dataset.research_sources.map(
        (source) => `${source.title}（${source.type}）：${source.value}`,
      ),
    ),
    "",
    "## 竞品信息",
    "",
    ...dataset.competitors.flatMap((competitor) => [
      `### ${competitor.name}`,
      "",
      `- 渠道：${competitor.channel}`,
      `- 定位：${competitor.positioning}`,
      "- 网站结构：",
      formatList(competitor.websiteStructure),
      "- Collection 信号：",
      formatList(competitor.collectionSignals),
      `- 证据：${formatEvidenceLinks(competitor.evidenceIds)}`,
      "",
    ]),
    "## 产品信号",
    "",
    formatList(dataset.product_signals.map(formatProductSignal)),
    "",
    "## 用户痛点",
    "",
    formatList(dataset.pain_points.map(formatPainPoint)),
    "",
    "## 内容信号",
    "",
    formatList(dataset.content_signals.map(formatContentSignal)),
    "",
    "## 机会评分",
    "",
    dataset.opportunities.map(formatOpportunity).join("\n\n"),
    "",
    "## 自动化采集建议",
    "",
    "- URL 抓取：后续接入竞品官网、Shopify collection、product、blog 和 landing page 抓取。",
    "- CSV 导入：后续接入商品表、评论表、关键词表和社媒内容表。",
    "- RSS 监控：后续接入 Shopify Blog、Amazon News、TikTok Shop、Meta Ads 和行业媒体。",
    "- 周报生成：每周统计新增产品、collection、landing page、blog 和关键词。",
    "- 推荐接入顺序：先接 RSS/sitemap/公开网页正文抽取，再接 Shopify collection/product，最后接浏览器型 crawler。",
  ].join("\n")}\n`;
}
