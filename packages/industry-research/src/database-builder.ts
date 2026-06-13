import type {
  Competitor,
  CompetitorDatabaseEntry,
  ContentDatabaseEntry,
  ContentSignal,
  Evidence,
  IndustryResearchDatabaseName,
  KeywordDatabaseEntry,
  Opportunity,
  OpportunityDatabaseEntry,
  PainPoint,
  PainPointDatabaseEntry,
  ProductDatabaseEntry,
  ProductSignal,
  RawDocument,
  ResearchProject,
  ResearchSource,
  ResearchWorkflowInput,
  SourceDatabaseEntry,
  SourceDiscoveryPlan,
  WebsiteStructureDatabaseEntry,
  WeeklyIntelligenceReportEntry,
} from "./types";

export type BuiltIndustryDatabases = {
  evidence: Evidence[];
  competitors: Competitor[];
  product_signals: ProductSignal[];
  pain_points: PainPoint[];
  content_signals: ContentSignal[];
  opportunities: Opportunity[];
  source_database: SourceDatabaseEntry[];
  competitor_database: CompetitorDatabaseEntry[];
  website_structure_database: WebsiteStructureDatabaseEntry[];
  product_database: ProductDatabaseEntry[];
  keyword_database: KeywordDatabaseEntry[];
  pain_point_database: PainPointDatabaseEntry[];
  content_database: ContentDatabaseEntry[];
  opportunity_database: OpportunityDatabaseEntry[];
  weekly_intelligence_reports: WeeklyIntelligenceReportEntry[];
};

function quoteFromDocument(
  document: RawDocument | undefined,
  fallback: string,
) {
  return document?.excerpt || fallback;
}

function findSource(sources: ResearchSource[], sourceId: string) {
  return sources.find((source) => source.id === sourceId) ?? sources[0];
}

function findRawDocumentByDatabase(
  rawDocuments: RawDocument[],
  databaseName: IndustryResearchDatabaseName,
) {
  return (
    rawDocuments.find((document) =>
      document.databaseTargets.includes(databaseName),
    ) ?? rawDocuments[0]
  );
}

function sourceIdsByType(
  sources: ResearchSource[],
  type: ResearchSource["type"],
) {
  return sources
    .filter((source) => source.type === type)
    .map((source) => source.id);
}

export function buildIndustryResearchDatabases(params: {
  project: ResearchProject;
  input: ResearchWorkflowInput;
  discoveryPlan: SourceDiscoveryPlan;
  sources: ResearchSource[];
  rawDocuments: RawDocument[];
  sourceReliability?: SourceDatabaseEntry["reliability"];
}): BuiltIndustryDatabases {
  const {
    project,
    input,
    discoveryPlan,
    sources,
    rawDocuments,
    sourceReliability = "mock",
  } = params;
  const websiteDocument =
    findRawDocumentByDatabase(rawDocuments, "website_structure_database") ??
    rawDocuments[0];
  const productDocument =
    findRawDocumentByDatabase(rawDocuments, "product_database") ??
    websiteDocument;
  const painDocument =
    findRawDocumentByDatabase(rawDocuments, "pain_point_database") ??
    productDocument;
  const contentDocument =
    findRawDocumentByDatabase(rawDocuments, "content_database") ??
    websiteDocument;

  const websiteSource = websiteDocument
    ? findSource(sources, websiteDocument.sourceId)
    : sources[0];
  const productSource = productDocument
    ? findSource(sources, productDocument.sourceId)
    : websiteSource;
  const painSource = painDocument
    ? findSource(sources, painDocument.sourceId)
    : productSource;
  const contentSource = contentDocument
    ? findSource(sources, contentDocument.sourceId)
    : websiteSource;

  if (!websiteSource || !productSource || !painSource || !contentSource) {
    throw new Error("Cannot build industry databases without sources.");
  }

  const evidence: Evidence[] = [
    {
      id: "evidence-source-map",
      projectId: project.id,
      sourceId: websiteSource.id,
      rawDocumentId: websiteDocument?.id,
      quote: quoteFromDocument(
        websiteDocument,
        "mock source discovery 已发现竞品官网、Shopify 结构、RSS 和 CSV 入口。",
      ),
      note: "证明本轮先建信息源库，再做后续结构化抽取。",
    },
    {
      id: "evidence-website-structure",
      projectId: project.id,
      sourceId: websiteSource.id,
      rawDocumentId: websiteDocument?.id,
      quote: quoteFromDocument(
        websiteDocument,
        "导航包含 Best Sellers、Collections、Blog、Reviews 等结构。",
      ),
      note: "用于竞品库和网站结构库。",
    },
    {
      id: "evidence-product-table",
      projectId: project.id,
      sourceId: productSource.id,
      rawDocumentId: productDocument?.id,
      quote: quoteFromDocument(
        productDocument,
        "collection / CSV 中出现 bundle、starter kit、subscription 和 best seller 标签。",
      ),
      note: "用于产品库、关键词库和产品信号。",
    },
    {
      id: "evidence-user-pain",
      projectId: project.id,
      sourceId: painSource.id,
      rawDocumentId: painDocument?.id,
      quote:
        input.manualText.trim() ||
        "用户痛点来自 mock 评论 CSV 和人工补充线索。",
      note: "用于痛点库和机会库，真实模式需要替换为评论或访谈证据。",
    },
    {
      id: "evidence-content-rss",
      projectId: project.id,
      sourceId: contentSource.id,
      rawDocumentId: contentDocument?.id,
      quote: quoteFromDocument(
        contentDocument,
        "RSS / blog mock 文档出现购买指南、对比测评、避坑清单和趋势文章。",
      ),
      note: "用于内容库和周报库。",
    },
  ];

  const competitors: Competitor[] = [
    {
      id: "competitor-1",
      projectId: project.id,
      name: `${input.category} 头部竞品 A`,
      channel: input.market,
      websiteStructure: [
        "Home",
        "Best Sellers",
        "New Arrivals",
        "Collections",
        "Blog",
        "Reviews",
      ],
      collectionSignals: [
        "Best Sellers 用于承接高转化路径",
        "Bundle / Starter Kit 暗示新手入门成交机会",
        "Blog / Guide 用于沉淀 SEO 和教育型内容",
      ],
      positioning: `围绕 ${input.category} 做高信任度、可复购的电商产品。`,
      evidenceIds: ["evidence-website-structure", "evidence-source-map"],
    },
  ];

  const productSignals: ProductSignal[] = [
    {
      id: "product-signal-1",
      projectId: project.id,
      competitorId: "competitor-1",
      category: input.category,
      signal: "高频 collection、tag 和 best seller 页面会暴露真实成交路径。",
      tags: ["best-seller", "bundle", "starter-kit"],
      evidenceIds: ["evidence-product-table", "evidence-website-structure"],
    },
    {
      id: "product-signal-2",
      projectId: project.id,
      competitorId: "competitor-1",
      category: input.category,
      signal: "套装、订阅或组合装比单品更适合做复购和入门转化。",
      tags: ["subscription", "bundle", "repeat-purchase"],
      evidenceIds: ["evidence-product-table"],
    },
  ];

  const painPoints: PainPoint[] = [
    {
      id: "pain-point-1",
      projectId: project.id,
      theme: "用户不知道该选哪一款",
      userNeed: "需要更清晰的购买指南、场景分类和竞品对比内容。",
      frequency: "high",
      evidenceIds: ["evidence-user-pain", "evidence-content-rss"],
    },
    {
      id: "pain-point-2",
      projectId: project.id,
      theme: "用户担心效果、适配度和性价比",
      userNeed: "需要真实评价、前后对比、规格说明和风险提示。",
      frequency: "medium",
      evidenceIds: ["evidence-user-pain", "evidence-product-table"],
    },
  ];

  const contentSignals: ContentSignal[] = [
    {
      id: "content-signal-1",
      projectId: project.id,
      platform: "Blog / SEO / RSS",
      topic: `${input.category} 购买指南`,
      contentType: "save",
      whyItWorks:
        "步骤、SOP、对比和模板类内容更容易被收藏，并能长期带来搜索流量。",
      evidenceIds: ["evidence-content-rss", "evidence-user-pain"],
    },
    {
      id: "content-signal-2",
      projectId: project.id,
      platform: "TikTok / Instagram",
      topic: `${input.category} 使用前后对比`,
      contentType: "conversion",
      whyItWorks: "展示结果和案例更容易解释产品价值，适合转化和复购。",
      evidenceIds: ["evidence-user-pain"],
    },
  ];

  const opportunities: Opportunity[] = [
    {
      id: "opportunity-1",
      projectId: project.id,
      title: `${input.category} 入门套装`,
      summary:
        "把用户最难选择的场景做成低门槛套装，并配套购买指南、对比内容和真实评价。",
      demandScore: 86,
      competitionScore: 62,
      contentGapScore: 78,
      businessValueScore: 84,
      evidenceQualityScore: 70,
      totalScore: 80,
      reviewStatus: "needs_review",
      reviewNote: "需要人工确认竞品价格、真实评论和供应链可行性。",
      evidenceIds: [
        "evidence-product-table",
        "evidence-user-pain",
        "evidence-website-structure",
      ],
    },
    {
      id: "opportunity-2",
      projectId: project.id,
      title: `${input.category} 场景化内容库`,
      summary:
        "围绕痛点建立教程、对比、案例和避坑内容，后续可作为 SEO、社媒和周报素材。",
      demandScore: 76,
      competitionScore: 55,
      contentGapScore: 88,
      businessValueScore: 72,
      evidenceQualityScore: 66,
      totalScore: 77,
      reviewStatus: "approved",
      reviewNote: "适合第一阶段先做内容获客验证。",
      evidenceIds: ["evidence-user-pain", "evidence-content-rss"],
    },
  ];

  const sourceDatabase: SourceDatabaseEntry[] = sources.map((source, index) => {
    const candidate = discoveryPlan.candidates.find(
      (item) => item.id === source.discoveryCandidateId,
    );

    return {
      id: `source-db-${index + 1}`,
      projectId: project.id,
      sourceId: source.id,
      sourceType: source.type,
      discoveryMethod: candidate?.method ?? "manual_hint",
      title: source.title,
      value: source.value,
      priority: source.priority ?? candidate?.priority ?? "medium",
      reliability: sourceReliability,
      refreshCadence:
        source.type === "rss" || source.type === "crawler"
          ? "weekly"
          : "manual",
      complianceBoundary:
        candidate?.complianceBoundary ??
        "补充输入需要人工确认来源授权和可抓取边界。",
    };
  });

  const competitorDatabase: CompetitorDatabaseEntry[] = competitors.map(
    (competitor) => ({
      id: `competitor-db-${competitor.id}`,
      projectId: project.id,
      competitorId: competitor.id,
      name: competitor.name,
      market: input.market,
      channel: competitor.channel,
      positioning: competitor.positioning,
      sourceIds: sourceIdsByType(sources, "crawler"),
      evidenceIds: competitor.evidenceIds,
    }),
  );

  const websiteStructureDatabase: WebsiteStructureDatabaseEntry[] = [
    {
      id: "website-structure-db-1",
      projectId: project.id,
      competitorId: "competitor-1",
      url: websiteSource.value,
      sections: competitors[0]?.websiteStructure ?? [],
      commerceSignals: [
        "Best Sellers",
        "Bundles",
        "Starter Kits",
        "Reviews",
        "Subscription",
      ],
      contentSignals: ["Blog", "Guide", "Comparison", "FAQ"],
      sourceIds: [websiteSource.id],
    },
  ];

  const productDatabase: ProductDatabaseEntry[] = [
    {
      id: "product-db-1",
      projectId: project.id,
      competitorId: "competitor-1",
      name: `${input.category} Starter Kit`,
      category: input.category,
      priceSignal: "mock：偏向入门套装和复购订阅，不记录真实价格。",
      tags: ["starter-kit", "bundle", "best-seller"],
      evidenceIds: ["evidence-product-table"],
    },
    {
      id: "product-db-2",
      projectId: project.id,
      competitorId: "competitor-1",
      name: `${input.category} Subscription Pack`,
      category: input.category,
      priceSignal: "mock：复购装比单品更适合长期监控。",
      tags: ["subscription", "repeat-purchase"],
      evidenceIds: ["evidence-product-table"],
    },
  ];

  const keywordDatabase: KeywordDatabaseEntry[] = [
    {
      id: "keyword-db-1",
      projectId: project.id,
      keyword: `${input.category} best sellers`,
      intent: "purchase",
      source: "mock search / collection",
      evidenceIds: ["evidence-product-table"],
    },
    {
      id: "keyword-db-2",
      projectId: project.id,
      keyword: `${input.category} reviews`,
      intent: "comparison",
      source: "mock review CSV",
      evidenceIds: ["evidence-user-pain"],
    },
    {
      id: "keyword-db-3",
      projectId: project.id,
      keyword: `${input.category} buying guide`,
      intent: "research",
      source: "mock RSS / blog",
      evidenceIds: ["evidence-content-rss"],
    },
  ];

  const painPointDatabase: PainPointDatabaseEntry[] = painPoints.map(
    (point) => ({
      id: `pain-db-${point.id}`,
      projectId: project.id,
      theme: point.theme,
      userNeed: point.userNeed,
      frequency: point.frequency,
      sourceIds: [painSource.id],
      evidenceIds: point.evidenceIds,
    }),
  );

  const contentDatabase: ContentDatabaseEntry[] = contentSignals.map(
    (signal) => ({
      id: `content-db-${signal.id}`,
      projectId: project.id,
      platform: signal.platform,
      topic: signal.topic,
      contentType: signal.contentType,
      whyItWorks: signal.whyItWorks,
      evidenceIds: signal.evidenceIds,
    }),
  );

  const opportunityDatabase: OpportunityDatabaseEntry[] = opportunities.map(
    (opportunity) => ({
      id: `opportunity-db-${opportunity.id}`,
      projectId: project.id,
      opportunityId: opportunity.id,
      title: opportunity.title,
      summary: opportunity.summary,
      totalScore: opportunity.totalScore,
      reviewStatus: opportunity.reviewStatus,
      evidenceIds: opportunity.evidenceIds,
    }),
  );

  const weeklyReports: WeeklyIntelligenceReportEntry[] = [
    {
      id: "weekly-intel-1",
      projectId: project.id,
      weekOf: "2026-06-01",
      title: `${input.category} 行业情报周报 mock`,
      summary:
        "本周 mock 监控到竞品结构、best seller collection、购买指南和评论痛点均适合进入持续监控。",
      newSignals: [
        "新增入门套装和 bundle 监控方向",
        "新增购买指南和对比内容选题",
        "新增评论痛点：选择困难、效果不确定、性价比担忧",
      ],
      watchList: [
        "竞品新品上架",
        "Best Sellers 页面变化",
        "Blog / RSS 更新",
        "评论 CSV 高频词变化",
      ],
      evidenceIds: ["evidence-content-rss", "evidence-product-table"],
    },
  ];

  return {
    evidence,
    competitors,
    product_signals: productSignals,
    pain_points: painPoints,
    content_signals: contentSignals,
    opportunities,
    source_database: sourceDatabase,
    competitor_database: competitorDatabase,
    website_structure_database: websiteStructureDatabase,
    product_database: productDatabase,
    keyword_database: keywordDatabase,
    pain_point_database: painPointDatabase,
    content_database: contentDatabase,
    opportunity_database: opportunityDatabase,
    weekly_intelligence_reports: weeklyReports,
  };
}
