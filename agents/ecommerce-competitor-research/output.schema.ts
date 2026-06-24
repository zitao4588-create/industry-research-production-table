export type ResearchReviewStatus = "approved" | "needs_review" | "rejected";

export type SourceQualityLevel = "high" | "medium" | "low";

export type SourceQualityType =
  | "official_site"
  | "product_page"
  | "collection_page"
  | "blog"
  | "sitemap"
  | "robots"
  | "search_candidate"
  | "manual_text"
  | "csv"
  | "rss"
  | "unknown";

export type EcommerceCompetitorResearchOutput = {
  research_projects: Array<{
    id: string;
    name: string;
    templateId: "ecommerce_competitor_research";
    industry: string;
    category: string;
    market: string;
    goal: string;
  }>;
  source_discovery_plans: Array<{
    id: string;
    industry: string;
    category: string;
    market: string;
    seedKeywords: string[];
    candidates: Array<{
      id: string;
      method:
        | "search_query"
        | "seed_url"
        | "sitemap"
        | "rss"
        | "shopify_public_endpoint"
        | "csv_seed"
        | "manual_hint";
      title: string;
      seed: string;
      expectedDatabases: string[];
      complianceBoundary: string;
    }>;
  }>;
  crawl_plans: Array<{
    id: string;
    mode: "mock" | "public_web";
    targets: Array<{
      id: string;
      kind:
        | "homepage"
        | "collection"
        | "product"
        | "blog"
        | "rss"
        | "sitemap"
        | "review_csv"
        | "search_results";
      target: string;
      databaseTargets: string[];
    }>;
    guardrails: string[];
  }>;
  crawl_jobs: Array<{
    id: string;
    targetId: string;
    status: "queued" | "running" | "done" | "failed";
    plannedAction: string;
  }>;
  crawl_runs: Array<{
    id: string;
    jobId: string;
    status: "queued" | "running" | "done" | "failed";
    documentsCreated: number;
    summary: string;
  }>;
  raw_documents: Array<{
    id: string;
    sourceId: string;
    crawlRunId: string;
    title: string;
    contentType: "html" | "rss" | "csv" | "text";
    excerpt: string;
    databaseTargets: string[];
    sourceQuality: {
      sourceType: SourceQualityType;
      sourceRelevance: SourceQualityLevel;
      sourceConfidence: SourceQualityLevel;
      needsReviewReason: string;
      acceptedForReport: boolean;
    };
  }>;
  extraction_jobs: Array<{
    id: string;
    rawDocumentId: string;
    targetDatabase: string;
    status: "done" | "needs_review";
    extractedCount: number;
  }>;
  research_sources: Array<{
    id: string;
    type: "url" | "csv" | "manual_text" | "crawler" | "rss";
    title: string;
    value: string;
  }>;
  research_documents: Array<{
    id: string;
    sourceId: string;
    title: string;
    text: string;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    channel: string;
    websiteStructure: string[];
    positioning: string;
  }>;
  product_signals: Array<{
    id: string;
    competitorId: string;
    category: string;
    signal: string;
    evidenceIds: string[];
  }>;
  pain_points: Array<{
    id: string;
    theme: string;
    userNeed: string;
    evidenceIds: string[];
  }>;
  content_signals: Array<{
    id: string;
    platform: string;
    topic: string;
    contentType: string;
    evidenceIds: string[];
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    demandScore: number;
    competitionScore: number;
    contentGapScore: number;
    businessValueScore: number;
    totalScore: number;
    reviewStatus: ResearchReviewStatus;
    evidenceIds: string[];
  }>;
  evidence: Array<{
    id: string;
    sourceId: string;
    rawDocumentId?: string;
    quote: string;
    note: string;
  }>;
  source_database: Array<{
    id: string;
    sourceId: string;
    discoveryMethod: string;
    title: string;
    reliability: "mock" | "needs_validation" | "trusted";
  }>;
  competitor_database: Array<{
    id: string;
    competitorId: string;
    name: string;
    positioning: string;
  }>;
  website_structure_database: Array<{
    id: string;
    competitorId: string;
    sections: string[];
    commerceSignals: string[];
  }>;
  product_database: Array<{
    id: string;
    competitorId: string;
    name: string;
    tags: string[];
  }>;
  keyword_database: Array<{
    id: string;
    keyword: string;
    intent: string;
  }>;
  pain_point_database: Array<{
    id: string;
    theme: string;
    userNeed: string;
  }>;
  content_database: Array<{
    id: string;
    platform: string;
    topic: string;
  }>;
  opportunity_database: Array<{
    id: string;
    opportunityId: string;
    title: string;
    totalScore: number;
  }>;
  weekly_intelligence_reports: Array<{
    id: string;
    weekOf: string;
    title: string;
    newSignals: string[];
    watchList: string[];
  }>;
  research_reports: Array<{
    id: string;
    projectId: string;
    format: "markdown";
    content: string;
  }>;
  delivery_artifacts?: {
    reportPath: "report.md";
    reviewedReportPath: "reviewed_report.md";
    runLogPath: "run_log.json";
    sourceQualitySummary: {
      total: number;
      acceptedForReport: number;
      rejectedForReport: number;
      bySourceType: Record<SourceQualityType, number>;
      byRelevance: Record<SourceQualityLevel, number>;
      byConfidence: Record<SourceQualityLevel, number>;
      lowQualityDocumentIds: string[];
    };
  };
};
