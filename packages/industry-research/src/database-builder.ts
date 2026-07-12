import type {
  Competitor,
  CompetitorDatabaseEntry,
  ContentDatabaseEntry,
  ContentSignal,
  Evidence,
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

function findSource(sources: ResearchSource[], sourceId: string) {
  return sources.find((source) => source.id === sourceId) ?? sources[0];
}

function sourceIdsByType(
  sources: ResearchSource[],
  type: ResearchSource["type"],
) {
  return sources
    .filter((source) => source.type === type)
    .map((source) => source.id);
}

function createSourceDatabaseEntries({
  project,
  discoveryPlan,
  sources,
  sourceReliability,
}: {
  project: ResearchProject;
  discoveryPlan: SourceDiscoveryPlan;
  sources: ResearchSource[];
  sourceReliability: SourceDatabaseEntry["reliability"];
}) {
  return sources.map((source, index) => {
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
      industrySourceRole: source.industrySourceRole,
    } satisfies SourceDatabaseEntry;
  });
}

function canUseDocumentAsEvidence(document: RawDocument) {
  return (
    document.sourceQuality.acceptedForReport &&
    document.sourceQuality.sourceType !== "robots" &&
    document.sourceQuality.sourceType !== "sitemap" &&
    document.sourceQuality.sourceType !== "search_candidate"
  );
}

function buildLeanEvidence(
  project: ResearchProject,
  rawDocuments: RawDocument[],
) {
  return rawDocuments
    .filter(canUseDocumentAsEvidence)
    .slice(0, 12)
    .map((document, index) => ({
      id: `evidence-public-${index + 1}`,
      projectId: project.id,
      sourceId: document.sourceId,
      rawDocumentId: document.id,
      quote:
        document.excerpt ||
        document.extractedText.slice(0, 500) ||
        document.title,
      note: "public_web 公开采集证据；业务含义需在审核或 LLM 验收后确认。",
      sourceRole: document.industrySourceRole,
      validation: {
        quoteMatched: true,
        sourceAccepted: true,
        matchedRawDocumentId: document.id,
      },
    }));
}

export function buildIndustryResearchDatabases(params: {
  project: ResearchProject;
  input: ResearchWorkflowInput;
  discoveryPlan: SourceDiscoveryPlan;
  sources: ResearchSource[];
  rawDocuments: RawDocument[];
  sourceReliability?: SourceDatabaseEntry["reliability"];
  /**
   * "lean"（默认）= 真实/公开采集模式：实体保持稀疏诚实（采集不到就只占位 1 个竞品）。
   * "rich" = 仅 Mock 演示：合成一套高密度数据库（竞品/机会 6、~74 条证据），
   * 让"生产台"演示态有应有的厚度；真实模式绝不走这条，避免凭空夸大采集结果。
   */
  entityProfile?: "lean" | "rich";
}): BuiltIndustryDatabases {
  const {
    project,
    input,
    discoveryPlan,
    sources,
    rawDocuments,
    sourceReliability = "mock",
    entityProfile = "lean",
  } = params;

  if (entityProfile === "rich") {
    return buildRichDemoIndustryResearchDatabases({
      project,
      input,
      discoveryPlan,
      sources,
      rawDocuments,
      sourceReliability,
    });
  }

  {
    const sourceDatabase = createSourceDatabaseEntries({
      project,
      discoveryPlan,
      sources,
      sourceReliability,
    });
    const evidence = buildLeanEvidence(project, rawDocuments);

    return {
      evidence,
      competitors: [],
      product_signals: [],
      pain_points: [],
      content_signals: [],
      opportunities: [],
      source_database: sourceDatabase,
      competitor_database: [],
      website_structure_database: [],
      product_database: [],
      keyword_database: [],
      pain_point_database: [],
      content_database: [],
      opportunity_database: [],
      weekly_intelligence_reports: [],
    };
  }
}

/* =============================================================================
 * Rich demo profile (Mock 专用) — 合成一套高密度九库数据，仅供演示态使用。
 * 真实/公开采集模式永远走上面的 lean 路径，避免凭空夸大采集结果。
 * 渠道 / 品类 / 内容类型 / 意图都用 UI 配色识别的枚举值。
 * ===========================================================================*/
function buildRichDemoIndustryResearchDatabases(params: {
  project: ResearchProject;
  input: ResearchWorkflowInput;
  discoveryPlan: SourceDiscoveryPlan;
  sources: ResearchSource[];
  rawDocuments: RawDocument[];
  sourceReliability: SourceDatabaseEntry["reliability"];
}): BuiltIndustryDatabases {
  const {
    project,
    input,
    discoveryPlan,
    sources,
    rawDocuments,
    sourceReliability,
  } = params;
  const projectId = project.id;
  const cat = input.category;

  const docFor = (i: number) =>
    rawDocuments.length ? rawDocuments[i % rawDocuments.length] : undefined;
  const sourceFor = (i: number) => {
    const doc = docFor(i);
    return (
      (doc
        ? findSource(sources, doc.sourceId)
        : sources[i % (sources.length || 1)]) ?? sources[0]
    );
  };

  // ---- 74 条可引用证据池 ----
  const evidenceQuotes = [
    `${cat} 头部竞品官网导航出现 Best Sellers、Bundle、Subscribe & Save 等高转化入口。`,
    `公开 collection 页里 starter kit 与订阅装常年占据 best seller 前列。`,
    `RSS / 博客近 30 天高频更新购买指南、成分解读与对比测评。`,
    `评论高频出现"软便""换粮不适""挑食""成分天然"等痛点词。`,
    `Reddit / 社群讨论集中在效果起效时间、适口性与性价比。`,
    `TikTok / Shorts 上"前后对比""开箱喂养"类内容互动显著更高。`,
    `Amazon 评论里 4 星以下集中抱怨包装漏粉与剂量说明不清。`,
    `sitemap 暴露大量 /collections 与 /blogs 路径，适合持续监控。`,
    `头部品牌强调兽医背书与临床成分，构成信任壁垒。`,
    `性价比品牌靠 bundle 拉高客单并用订阅锁定复购。`,
    `内容型品牌用养宠科普做 SEO 与私域获客。`,
    `公开价格带集中在 $19–$45，订阅装普遍 8 折锁价。`,
  ];
  const evidence: Evidence[] = Array.from({ length: 74 }, (_unused, idx) => {
    const source = sourceFor(idx);
    const doc = docFor(idx);
    return {
      id: `evidence-${idx + 1}`,
      projectId,
      sourceId: source?.id ?? "source-auto-1",
      rawDocumentId: doc?.id,
      quote: evidenceQuotes[idx % evidenceQuotes.length] ?? cat,
      note: "rich demo 证据：用于演示生产台密度，真实模式需替换为可核验来源。",
    } satisfies Evidence;
  });
  const ev = (...ids: number[]) => ids.map((id) => `evidence-${id}`);

  // ---- 竞品 6 ----
  const competitorSeeds: Array<{
    name: string;
    channel: string;
    positioning: string;
    structure: string[];
    evidenceIds: string[];
  }> = [
    {
      name: "GutWell（头部订阅品牌）",
      channel: "Shopify DTC",
      positioning: `围绕${cat}做兽医背书 + 临床成分的高端订阅，强调长期肠道调理。`,
      structure: [
        "Home",
        "Best Sellers",
        "Subscribe & Save",
        "Vet Approved",
        "Reviews",
        "Blog",
      ],
      evidenceIds: ev(1, 9, 14, 21, 33, 41, 58),
    },
    {
      name: "DailyChew（性价比走量）",
      channel: "Shopify + Amazon",
      positioning: "入门软糖 + 大众价位，用 Amazon 评论与 bundle 走量。",
      structure: ["Home", "Bundles", "Best Sellers", "Reviews", "FAQ"],
      evidenceIds: ev(2, 7, 10, 27, 44),
    },
    {
      name: "PureGut（成分透明派）",
      channel: "Shopify DTC",
      positioning: "主打成分天然、可溯源供应链，面向高知养宠人群。",
      structure: [
        "Home",
        "Ingredients",
        "Science",
        "Collections",
        "Reviews",
        "Blog",
      ],
      evidenceIds: ev(4, 9, 12, 36, 52, 63),
    },
    {
      name: "FlexPaws（Amazon 主导）",
      channel: "Amazon 主导",
      positioning: "以 Amazon 评论与广告位为主战场，靠 listing 优化获量。",
      structure: ["Storefront", "Best Sellers", "A+ Content", "Reviews"],
      evidenceIds: ev(7, 10, 30, 47),
    },
    {
      name: "VetDaily（内容获客型）",
      channel: "Shopify DTC",
      positioning: "用养宠科普博客与 RSS 做 SEO 与私域，再导流到订阅。",
      structure: ["Home", "Blog", "Guides", "Subscribe", "Reviews"],
      evidenceIds: ev(3, 11, 24, 38, 55, 66),
    },
    {
      name: "ChewBoost（社媒新锐）",
      channel: "Shopify + Amazon",
      positioning: "靠 TikTok 红人与前后对比内容快速起量的新锐品牌。",
      structure: ["Home", "Best Sellers", "TikTok Shop", "Reviews"],
      evidenceIds: ev(6, 16, 29, 49),
    },
  ];
  const competitors: Competitor[] = competitorSeeds.map((seed, index) => ({
    id: `competitor-${index + 1}`,
    projectId,
    name: seed.name,
    channel: seed.channel,
    websiteStructure: seed.structure,
    collectionSignals: [
      "Best Sellers 承接高转化路径",
      "Bundle / Starter Kit 暗示新手入门成交",
      "Subscribe & Save 用于锁定复购",
    ],
    positioning: seed.positioning,
    evidenceIds: seed.evidenceIds,
  }));

  // ---- 产品信号 6 + 产品库 6 ----
  const productSeeds: Array<{
    competitorIndex: number;
    name: string;
    form: "软糖" | "粉剂" | "胶囊";
    price: string;
    tags: string[];
    evidenceIds: string[];
  }> = [
    {
      competitorIndex: 0,
      name: "GutWell Daily Chews",
      form: "软糖",
      price: "$34.99",
      tags: ["best-seller", "subscription", "vet-approved"],
      evidenceIds: ev(1, 12, 21),
    },
    {
      competitorIndex: 1,
      name: "DailyChew Starter Kit",
      form: "软糖",
      price: "$24.99",
      tags: ["starter-kit", "bundle"],
      evidenceIds: ev(2, 10),
    },
    {
      competitorIndex: 2,
      name: "PureGut Powder",
      form: "粉剂",
      price: "$39.99",
      tags: ["clean-label", "powder"],
      evidenceIds: ev(4, 12, 52),
    },
    {
      competitorIndex: 3,
      name: "FlexPaws Capsules",
      form: "胶囊",
      price: "$19.99",
      tags: ["amazon", "value"],
      evidenceIds: ev(7, 30),
    },
    {
      competitorIndex: 4,
      name: "VetDaily Sensitive Powder",
      form: "粉剂",
      price: "$42.00",
      tags: ["sensitive", "subscription"],
      evidenceIds: ev(3, 24, 55),
    },
    {
      competitorIndex: 5,
      name: "ChewBoost Soft Bites",
      form: "软糖",
      price: "$29.99",
      tags: ["tiktok", "bundle", "best-seller"],
      evidenceIds: ev(6, 29),
    },
  ];
  const productSignals: ProductSignal[] = productSeeds.map((seed, index) => ({
    id: `product-signal-${index + 1}`,
    projectId,
    competitorId: `competitor-${seed.competitorIndex + 1}`,
    category: cat,
    signal: `${seed.form}剂型在 ${seed.price} 价位上靠 ${seed.tags[0]} 承接成交，适合作为产品监控对象。`,
    tags: seed.tags,
    evidenceIds: seed.evidenceIds,
  }));
  const productDatabase: ProductDatabaseEntry[] = productSeeds.map(
    (seed, index) => ({
      id: `product-db-${index + 1}`,
      projectId,
      competitorId: `competitor-${seed.competitorIndex + 1}`,
      name: seed.name,
      category: seed.form,
      priceSignal: `${seed.price}（公开价位，订阅装多为 8 折）`,
      tags: seed.tags,
      evidenceIds: seed.evidenceIds,
    }),
  );

  // ---- 痛点 5 ----
  const painSeeds: Array<{
    theme: string;
    need: string;
    frequency: PainPoint["frequency"];
    evidenceIds: string[];
  }> = [
    {
      theme: "不知道该选哪一款",
      need: "需要更清晰的购买指南、场景分类与竞品对比。",
      frequency: "high",
      evidenceIds: ev(4, 11, 24),
    },
    {
      theme: "换粮 / 换季后软便",
      need: "需要过渡期套装与喂养节奏说明。",
      frequency: "high",
      evidenceIds: ev(4, 5, 25),
    },
    {
      theme: "担心效果与起效时间",
      need: "需要真实评价、前后对比与周期说明。",
      frequency: "medium",
      evidenceIds: ev(5, 6, 47),
    },
    {
      theme: "适口性 / 挑食",
      need: "需要口味选择与试用装降低尝试门槛。",
      frequency: "medium",
      evidenceIds: ev(4, 7),
    },
    {
      theme: "成分与性价比顾虑",
      need: "需要成分透明、剂量说明与订阅折扣。",
      frequency: "low",
      evidenceIds: ev(9, 12, 44),
    },
  ];
  const painPoints: PainPoint[] = painSeeds.map((seed, index) => ({
    id: `pain-point-${index + 1}`,
    projectId,
    theme: seed.theme,
    userNeed: seed.need,
    frequency: seed.frequency,
    evidenceIds: seed.evidenceIds,
  }));

  // ---- 内容信号 5 ----
  const contentSeeds: Array<{
    platform: string;
    topic: string;
    contentType: ContentSignal["contentType"];
    why: string;
    evidenceIds: string[];
  }> = [
    {
      platform: "Blog / SEO / RSS",
      topic: `${cat} 购买指南`,
      contentType: "save",
      why: "指南 / 对比 / 模板类内容易被收藏，长期带搜索流量。",
      evidenceIds: ev(3, 11, 24),
    },
    {
      platform: "TikTok / Shorts",
      topic: "换粮过渡期喂养前后对比",
      contentType: "conversion",
      why: "结果型内容直观解释价值，转化与复购更强。",
      evidenceIds: ev(6, 16),
    },
    {
      platform: "Instagram",
      topic: "成分科普 + 兽医背书",
      contentType: "exposure",
      why: "权威背书放大曝光，建立信任壁垒。",
      evidenceIds: ev(9, 33),
    },
    {
      platform: "YouTube",
      topic: "30 天调理 vlog",
      contentType: "growth",
      why: "长周期记录沉淀订阅与口碑。",
      evidenceIds: ev(5, 38),
    },
    {
      platform: "Reddit / 社群",
      topic: "挑食 / 适口性讨论",
      contentType: "personal_brand",
      why: "真实互动塑造创始人 / 专家人设。",
      evidenceIds: ev(5, 7),
    },
  ];
  const contentSignals: ContentSignal[] = contentSeeds.map((seed, index) => ({
    id: `content-signal-${index + 1}`,
    projectId,
    platform: seed.platform,
    topic: seed.topic,
    contentType: seed.contentType,
    whyItWorks: seed.why,
    evidenceIds: seed.evidenceIds,
  }));

  // ---- 机会 6 ----
  const opportunitySeeds: Array<{
    title: string;
    summary: string;
    scores: [number, number, number, number, number, number];
    reviewStatus: Opportunity["reviewStatus"];
    reviewNote: string;
    evidenceIds: string[];
  }> = [
    {
      title: "换粮过渡期肠道套装",
      summary:
        "把最难选的换粮 / 换季场景做成低门槛套装，配套购买指南与真实评价。",
      scores: [90, 58, 84, 86, 78, 88],
      reviewStatus: "needs_review",
      reviewNote: "需确认竞品价格、真实评论与供应链可行性。",
      evidenceIds: ev(1, 4, 5, 25),
    },
    {
      title: "敏感肠胃订阅装",
      summary: "面向肠胃敏感犬的订阅复购模型，锁定长期价值。",
      scores: [84, 60, 72, 88, 74, 84],
      reviewStatus: "approved",
      reviewNote: "复购模型清晰，可先做小范围验证。",
      evidenceIds: ev(1, 9, 12),
    },
    {
      title: "成分透明内容获客",
      summary: "围绕成分科普与兽医背书做 SEO + 私域内容矩阵。",
      scores: [76, 52, 88, 70, 70, 80],
      reviewStatus: "approved",
      reviewNote: "适合第一阶段做内容获客验证。",
      evidenceIds: ev(3, 9, 11),
    },
    {
      title: "试用装降低尝试门槛",
      summary: "小规格试用装解决适口性 / 挑食顾虑，提高首单转化。",
      scores: [72, 66, 70, 64, 60, 72],
      reviewStatus: "needs_review",
      reviewNote: "需核算试用装毛利与转化漏斗。",
      evidenceIds: ev(4, 7),
    },
    {
      title: "前后对比短视频带货",
      summary: "用换粮前后对比的短视频做 TikTok / Shorts 转化。",
      scores: [80, 70, 66, 74, 58, 70],
      reviewStatus: "needs_review",
      reviewNote: "需评估红人成本与素材合规。",
      evidenceIds: ev(6, 16),
    },
    {
      title: "性价比 bundle 走量",
      summary: "用 bundle + 订阅折扣在大众价位走量，对标性价比品牌。",
      scores: [68, 78, 54, 66, 56, 60],
      reviewStatus: "rejected",
      reviewNote: "竞争激烈、毛利偏薄，暂不优先。",
      evidenceIds: ev(2, 10, 44),
    },
  ];
  const opportunities: Opportunity[] = opportunitySeeds.map((seed, index) => {
    const [demand, competition, gap, value, evidenceQuality, total] =
      seed.scores;
    return {
      id: `opportunity-${index + 1}`,
      projectId,
      title: `${cat} ${seed.title}`,
      summary: seed.summary,
      demandScore: demand,
      competitionScore: competition,
      contentGapScore: gap,
      businessValueScore: value,
      evidenceQualityScore: evidenceQuality,
      totalScore: total,
      reviewStatus: seed.reviewStatus,
      reviewNote: seed.reviewNote,
      evidenceIds: seed.evidenceIds,
    } satisfies Opportunity;
  });

  // ---- 关键词 6 ----
  const keywordSeeds: Array<{
    keyword: string;
    intent: KeywordDatabaseEntry["intent"];
    source: string;
    evidenceIds: string[];
  }> = [
    {
      keyword: `${cat} best sellers`,
      intent: "purchase",
      source: "mock search / collection",
      evidenceIds: ev(2, 8),
    },
    {
      keyword: `${cat} reviews`,
      intent: "comparison",
      source: "mock review CSV",
      evidenceIds: ev(4, 7),
    },
    {
      keyword: `${cat} buying guide`,
      intent: "research",
      source: "mock RSS / blog",
      evidenceIds: ev(3, 11),
    },
    {
      keyword: `${cat} 软便 换粮`,
      intent: "pain_point",
      source: "mock community",
      evidenceIds: ev(4, 5),
    },
    {
      keyword: `${cat} subscription discount`,
      intent: "purchase",
      source: "mock collection",
      evidenceIds: ev(10, 12),
    },
    {
      keyword: `${cat} vs ${input.industry}`,
      intent: "comparison",
      source: "mock search",
      evidenceIds: ev(7, 9),
    },
  ];
  const keywordDatabase: KeywordDatabaseEntry[] = keywordSeeds.map(
    (seed, index) => ({
      id: `keyword-db-${index + 1}`,
      projectId,
      keyword: seed.keyword,
      intent: seed.intent,
      source: seed.source,
      evidenceIds: seed.evidenceIds,
    }),
  );

  // ---- 九库映射 ----
  const sourceDatabase: SourceDatabaseEntry[] = sources.map((source, index) => {
    const candidate = discoveryPlan.candidates.find(
      (item) => item.id === source.discoveryCandidateId,
    );
    return {
      id: `source-db-${index + 1}`,
      projectId,
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
      projectId,
      competitorId: competitor.id,
      name: competitor.name,
      market: input.market,
      channel: competitor.channel,
      positioning: competitor.positioning,
      sourceIds: sourceIdsByType(sources, "crawler"),
      evidenceIds: competitor.evidenceIds,
    }),
  );

  const websiteStructureDatabase: WebsiteStructureDatabaseEntry[] = competitors
    .slice(0, 3)
    .map((competitor, index) => ({
      id: `website-structure-db-${index + 1}`,
      projectId,
      competitorId: competitor.id,
      url: sourceFor(index)?.value ?? competitor.name,
      sections: competitor.websiteStructure,
      commerceSignals: [
        "Best Sellers",
        "Bundles",
        "Starter Kits",
        "Reviews",
        "Subscription",
      ],
      contentSignals: ["Blog", "Guide", "Comparison", "FAQ"],
      sourceIds: [sourceFor(index)?.id ?? "source-auto-1"],
    }));

  const painPointDatabase: PainPointDatabaseEntry[] = painPoints.map(
    (point) => ({
      id: `pain-db-${point.id}`,
      projectId,
      theme: point.theme,
      userNeed: point.userNeed,
      frequency: point.frequency,
      sourceIds: [sourceFor(0)?.id ?? "source-auto-1"],
      evidenceIds: point.evidenceIds,
    }),
  );

  const contentDatabase: ContentDatabaseEntry[] = contentSignals.map(
    (signal) => ({
      id: `content-db-${signal.id}`,
      projectId,
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
      projectId,
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
      projectId,
      weekOf: "2026-06-15",
      title: `${cat} 行业情报周报`,
      summary:
        "本周监控到头部品牌新增订阅套装、性价比品牌上新 bundle、内容型品牌加码成分科普。",
      newSignals: [
        "GutWell 上线换粮过渡期套装",
        "ChewBoost TikTok 前后对比内容起量",
        "评论高频词新增'适口性''起效时间'",
      ],
      watchList: [
        "竞品新品上架",
        "Best Sellers 页面变化",
        "Blog / RSS 更新",
        "评论高频词变化",
      ],
      evidenceIds: ev(1, 6, 16),
    },
    {
      id: "weekly-intel-2",
      projectId,
      weekOf: "2026-06-08",
      title: `${cat} 行业情报周报`,
      summary: "上周成分透明派加强兽医背书，Amazon 主导品牌靠广告位抢量。",
      newSignals: ["PureGut 上线成分溯源页", "FlexPaws 加大 A+ Content 投入"],
      watchList: ["订阅折扣力度", "Amazon 评论星级变化"],
      evidenceIds: ev(9, 30, 52),
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
