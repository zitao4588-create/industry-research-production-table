export type ResearchTemplateId = "ecommerce_competitor_research";

export type IndustryResearchDatabaseName =
  | "source_database"
  | "competitor_database"
  | "website_structure_database"
  | "product_database"
  | "keyword_database"
  | "pain_point_database"
  | "content_database"
  | "opportunity_database"
  | "weekly_intelligence_reports";

export type ResearchSourceType =
  | "url"
  | "csv"
  | "manual_text"
  | "crawler"
  | "rss";

export type SourceDiscoveryMethod =
  | "search_query"
  | "seed_url"
  | "sitemap"
  | "robots"
  | "rss"
  | "shopify_public_endpoint"
  | "csv_seed"
  | "manual_hint";

export type CrawlTargetKind =
  | "homepage"
  | "collection"
  | "product"
  | "blog"
  | "rss"
  | "robots"
  | "sitemap"
  | "review_csv"
  | "search_results";

export type CrawlJobStatus = "queued" | "running" | "done" | "failed";

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
  | "content_api"
  | "unknown";

export type SourceQuality = {
  sourceType: SourceQualityType;
  sourceRelevance: SourceQualityLevel;
  sourceConfidence: SourceQualityLevel;
  needsReviewReason: string;
  acceptedForReport: boolean;
};

export type ResearchWorkflowStepStatus =
  | "pending"
  | "running"
  | "done"
  | "failed";

export type ResearchProject = {
  id: string;
  name: string;
  templateId: ResearchTemplateId;
  industry: string;
  category: string;
  market: string;
  goal: string;
  status: "draft" | "running" | "review" | "reported";
  createdAt: string;
};

export type ResearchSource = {
  id: string;
  projectId: string;
  type: ResearchSourceType;
  title: string;
  value: string;
  automationHint: string;
  discoveryCandidateId?: string;
  priority?: "low" | "medium" | "high";
};

export type ResearchDocument = {
  id: string;
  projectId: string;
  sourceId: string;
  rawDocumentId?: string;
  title: string;
  text: string;
};

export type Evidence = {
  id: string;
  projectId: string;
  sourceId: string;
  rawDocumentId?: string;
  quote: string;
  note: string;
  validation?: EvidenceValidation;
};

export type EvidenceValidation = {
  quoteMatched: boolean;
  sourceAccepted: boolean;
  matchedRawDocumentId?: string;
  failureReason?: string;
};

export type SourceDiscoveryCandidate = {
  id: string;
  projectId: string;
  sourceType: ResearchSourceType;
  method: SourceDiscoveryMethod;
  title: string;
  seed: string;
  priority: "low" | "medium" | "high";
  expectedDatabases: IndustryResearchDatabaseName[];
  complianceBoundary: string;
  status: "planned" | "mocked" | "discovered" | "skipped";
};

export type SourceDiscoveryPlan = {
  id: string;
  projectId: string;
  industry: string;
  category: string;
  market: string;
  researchGoal: string;
  seedKeywords: string[];
  requiredDatabases: IndustryResearchDatabaseName[];
  candidates: SourceDiscoveryCandidate[];
  notes: string[];
};

export type CrawlPlanTarget = {
  id: string;
  projectId: string;
  candidateId: string;
  kind: CrawlTargetKind;
  target: string;
  reason: string;
  maxPages: number;
  databaseTargets: IndustryResearchDatabaseName[];
};

export type CrawlPlan = {
  id: string;
  projectId: string;
  mode: "mock" | "public_web";
  targets: CrawlPlanTarget[];
  guardrails: string[];
};

export type CrawlJob = {
  id: string;
  projectId: string;
  targetId: string;
  status: CrawlJobStatus;
  plannedAction: string;
  toolCandidateId: string;
};

export type CrawlRun = {
  id: string;
  projectId: string;
  jobId: string;
  status: CrawlJobStatus;
  startedAt: string;
  finishedAt: string;
  documentsCreated: number;
  summary: string;
};

export type RawDocument = {
  id: string;
  projectId: string;
  sourceId: string;
  crawlRunId: string;
  url: string;
  title: string;
  contentType: "html" | "rss" | "csv" | "text";
  excerpt: string;
  extractedText: string;
  databaseTargets: IndustryResearchDatabaseName[];
  sourceQuality: SourceQuality;
};

export type ExtractionJob = {
  id: string;
  projectId: string;
  rawDocumentId: string;
  targetDatabase: IndustryResearchDatabaseName;
  status: "done" | "needs_review";
  extractedCount: number;
  summary: string;
};

export type Competitor = {
  id: string;
  projectId: string;
  name: string;
  channel: string;
  websiteStructure: string[];
  collectionSignals: string[];
  positioning: string;
  evidenceIds: string[];
};

export type ProductSignal = {
  id: string;
  projectId: string;
  competitorId: string;
  category: string;
  signal: string;
  tags: string[];
  evidenceIds: string[];
};

export type PainPoint = {
  id: string;
  projectId: string;
  theme: string;
  userNeed: string;
  frequency: "low" | "medium" | "high";
  evidenceIds: string[];
};

export type ContentSignal = {
  id: string;
  projectId: string;
  platform: string;
  topic: string;
  contentType: "exposure" | "growth" | "save" | "conversion" | "personal_brand";
  whyItWorks: string;
  evidenceIds: string[];
};

export type Opportunity = {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  demandScore: number;
  competitionScore: number;
  contentGapScore: number;
  businessValueScore: number;
  evidenceQualityScore: number;
  totalScore: number;
  reviewStatus: ResearchReviewStatus;
  reviewNote: string;
  evidenceIds: string[];
};

export type SourceDatabaseEntry = {
  id: string;
  projectId: string;
  sourceId: string;
  sourceType: ResearchSourceType;
  discoveryMethod: SourceDiscoveryMethod;
  title: string;
  value: string;
  priority: "low" | "medium" | "high";
  reliability: "mock" | "needs_validation" | "trusted";
  refreshCadence: "manual" | "weekly" | "monthly";
  complianceBoundary: string;
};

export type CompetitorDatabaseEntry = {
  id: string;
  projectId: string;
  competitorId: string;
  name: string;
  market: string;
  channel: string;
  positioning: string;
  sourceIds: string[];
  evidenceIds: string[];
};

export type WebsiteStructureDatabaseEntry = {
  id: string;
  projectId: string;
  competitorId: string;
  url: string;
  sections: string[];
  commerceSignals: string[];
  contentSignals: string[];
  sourceIds: string[];
};

export type ProductDatabaseEntry = {
  id: string;
  projectId: string;
  competitorId: string;
  name: string;
  category: string;
  priceSignal: string;
  tags: string[];
  evidenceIds: string[];
};

export type KeywordDatabaseEntry = {
  id: string;
  projectId: string;
  keyword: string;
  intent: "research" | "comparison" | "purchase" | "pain_point";
  source: string;
  evidenceIds: string[];
};

export type PainPointDatabaseEntry = {
  id: string;
  projectId: string;
  theme: string;
  userNeed: string;
  frequency: "low" | "medium" | "high";
  sourceIds: string[];
  evidenceIds: string[];
};

export type ContentDatabaseEntry = {
  id: string;
  projectId: string;
  platform: string;
  topic: string;
  contentType: ContentSignal["contentType"];
  whyItWorks: string;
  evidenceIds: string[];
};

export type OpportunityDatabaseEntry = {
  id: string;
  projectId: string;
  opportunityId: string;
  title: string;
  summary: string;
  totalScore: number;
  reviewStatus: ResearchReviewStatus;
  evidenceIds: string[];
};

export type WeeklyIntelligenceReportEntry = {
  id: string;
  projectId: string;
  weekOf: string;
  title: string;
  summary: string;
  newSignals: string[];
  watchList: string[];
  evidenceIds: string[];
};

export type ReusableCapabilityAssessment = {
  id: string;
  name: string;
  source: "agent_factory" | "hermes" | "openclaw" | "github" | "future_plugin";
  status:
    | "reusable_now"
    | "mock_only_now"
    | "future_candidate"
    | "not_selected";
  license: string;
  maintenanceSignal: string;
  useCase: string;
  reason: string;
  url?: string;
};

export type ResearchReport = {
  id: string;
  projectId: string;
  format: "markdown";
  title: string;
  content: string;
  createdAt: string;
};

export type ResearchWorkflowStep = {
  id:
    | "create_project"
    | "discover_sources"
    | "generate_crawl_plan"
    | "crawl_sources"
    | "build_industry_databases"
    | "supplement_sources"
    | "extract_competitors"
    | "extract_product_signals"
    | "extract_pain_points"
    | "extract_content_signals"
    | "score_opportunities"
    | "human_review"
    | "generate_report";
  title: string;
  description: string;
  status: ResearchWorkflowStepStatus;
};

export type ResearchReviewItem = {
  id: string;
  targetType:
    | "competitor"
    | "product_signal"
    | "pain_point"
    | "content_signal"
    | "opportunity";
  targetId: string;
  status: ResearchReviewStatus;
  note: string;
};

export type ResearchWorkflowInput = {
  projectName: string;
  industry: string;
  category: string;
  market: string;
  researchGoal: string;
  templateId: ResearchTemplateId;
  urls: string[];
  csvText: string;
  manualText: string;
};

export type ResearchWorkflowDataset = {
  research_projects: ResearchProject[];
  source_discovery_plans: SourceDiscoveryPlan[];
  crawl_plans: CrawlPlan[];
  crawl_jobs: CrawlJob[];
  crawl_runs: CrawlRun[];
  raw_documents: RawDocument[];
  extraction_jobs: ExtractionJob[];
  research_sources: ResearchSource[];
  research_documents: ResearchDocument[];
  competitors: Competitor[];
  product_signals: ProductSignal[];
  pain_points: PainPoint[];
  content_signals: ContentSignal[];
  opportunities: Opportunity[];
  evidence: Evidence[];
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

export type ResearchRunCanonicalMode =
  | "public_web"
  | "public_web_llm"
  | "llm_only";

export type ResearchRunProvider =
  | "none"
  | "9router"
  | "deepseek"
  | "openai_compatible"
  | "local_fallback";

export type ResearchRunMetadata = {
  requestedMode?: string;
  canonicalMode: ResearchRunCanonicalMode;
  provider: ResearchRunProvider;
  model?: string;
  baseUrlHost?: string;
  fallbackReason?: string;
  llmUsed: boolean;
  timings?: {
    crawlMs?: number;
    llmMs?: number;
  };
};

export type ResearchWorkflowResult = ResearchWorkflowDataset & {
  research_reports: ResearchReport[];
  workflowSteps: ResearchWorkflowStep[];
  reviewItems: ResearchReviewItem[];
  runMetadata?: ResearchRunMetadata;
};

export type EcommerceCompetitorResearchOutput = ResearchWorkflowResult;
