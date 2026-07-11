import {
  type AmazonPublicEvidenceResult,
  collectAmazonPublicEvidence,
} from "./amazon-public-evidence";
import {
  generateCrawlPlan,
  generateSourceDiscoveryPlan,
  requiredIndustryResearchDatabases,
} from "./collection-plan";
import { collectContentApiSignals } from "./content-api-adapter";
import { buildIndustryResearchDatabases } from "./database-builder";
import {
  createResearchDocumentsFromRawDocuments,
  createResearchSourcesFromPlan,
} from "./mock-crawler";
import {
  createIndustryResearchProject,
  createResearchReviewItems,
} from "./mock-workflow";
import {
  type PublicCrawlerFetch,
  runPublicCrawler,
} from "./public-crawl-adapter";
import { discoverPublicSources } from "./public-source-discovery";
import { generateResearchMarkdownReport } from "./report";
import { ecommerceCompetitorResearchTemplate } from "./templates";
import type {
  CrawlPlan,
  CrawlPlanTarget,
  CrawlTargetKind,
  IndustryResearchDatabaseName,
  ResearchWorkflowInput,
  ResearchWorkflowResult,
} from "./types";

/**
 * 流式进度事件(SSE 完整版用)。真实工作流在各阶段边界 emit;onProgress 不传时全是 no-op,
 * 因此不影响现有非流式调用与测试。
 */
export type WorkflowProgressEvent =
  | {
      type: "phase";
      phase: "discover" | "crawl" | "build" | "report";
      status: "start" | "done";
      at: string;
    }
  | {
      type: "source";
      at: string;
      title: string;
      method: string;
      priority: "low" | "medium" | "high";
      seed: string;
    }
  | {
      type: "crawl";
      at: string;
      completed: number;
      total: number;
      rawDocs: number;
    }
  | { type: "db"; at: string; database: string; count: number }
  | { type: "log"; at: string; message: string };

export type WorkflowProgressHandler = (event: WorkflowProgressEvent) => void;

export type PublicWorkflowOptions = {
  fetcher?: PublicCrawlerFetch;
  now?: string;
  maxSearchQueries?: number;
  maxSearchResultsPerQuery?: number;
  maxDiscoveredTargets?: number;
  maxProbeUrls?: number;
  maxSitemapUrls?: number;
  firecrawlMapEnabled?: boolean;
  maxFirecrawlMapSites?: number;
  maxFirecrawlMapLinksPerSite?: number;
  firecrawlCrawlFallbackEnabled?: boolean;
  maxFirecrawlCrawlSites?: number;
  maxFirecrawlCrawlPagesPerSite?: number;
  requestTimeoutMs?: number;
  maxCrawlTargets?: number;
  crawlPerHostDelayMs?: number;
  onProgress?: WorkflowProgressHandler;
  /** 搜索 provider / 内容 API 凭据解析用 env；核心包不读 process.env，由调用方显式传入。 */
  env?: Record<string, string | undefined>;
  /** benchmark 预检通过后可复用，避免 Amazon 公开页面被重复请求。 */
  amazonPublicEvidenceResult?: AmazonPublicEvidenceResult;
};

const PUBLIC_WORKFLOW_BUDGET_ENV = {
  maxSearchQueries: "AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_QUERIES",
  maxSearchResultsPerQuery:
    "AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_RESULTS_PER_QUERY",
  maxDiscoveredTargets: "AGENT_FACTORY_PUBLIC_WEB_MAX_DISCOVERED_TARGETS",
  maxProbeUrls: "AGENT_FACTORY_PUBLIC_WEB_MAX_PROBE_URLS",
  maxSitemapUrls: "AGENT_FACTORY_PUBLIC_WEB_MAX_SITEMAP_URLS",
  maxFirecrawlMapSites: "AGENT_FACTORY_FIRECRAWL_MAP_MAX_SITES",
  maxFirecrawlMapLinksPerSite: "AGENT_FACTORY_FIRECRAWL_MAP_MAX_LINKS_PER_SITE",
  maxFirecrawlCrawlSites: "AGENT_FACTORY_FIRECRAWL_CRAWL_MAX_SITES",
  maxFirecrawlCrawlPagesPerSite:
    "AGENT_FACTORY_FIRECRAWL_CRAWL_MAX_PAGES_PER_SITE",
  requestTimeoutMs: "AGENT_FACTORY_PUBLIC_WEB_REQUEST_TIMEOUT_MS",
  maxCrawlTargets: "AGENT_FACTORY_PUBLIC_WEB_MAX_CRAWL_TARGETS",
  crawlPerHostDelayMs: "AGENT_FACTORY_PUBLIC_WEB_CRAWL_PER_HOST_DELAY_MS",
} as const;

const DEFAULT_PUBLIC_WORKFLOW_BUDGET = {
  maxSearchQueries: 2,
  maxSearchResultsPerQuery: 4,
  maxDiscoveredTargets: 10,
  maxProbeUrls: 8,
  maxSitemapUrls: 4,
  maxFirecrawlMapSites: 2,
  maxFirecrawlMapLinksPerSite: 30,
  maxFirecrawlCrawlSites: 1,
  maxFirecrawlCrawlPagesPerSite: 4,
  requestTimeoutMs: 8_000,
  maxCrawlTargets: 8,
} as const;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function resolveBudgetValue({
  explicitValue,
  env,
  envKey,
  fallback,
}: {
  explicitValue?: number;
  env: Record<string, string | undefined>;
  envKey: string;
  fallback: number;
}) {
  if (explicitValue !== undefined) {
    return explicitValue;
  }

  return parsePositiveInteger(env[envKey], fallback);
}

function resolveOptionalBudgetValue({
  explicitValue,
  env,
  envKey,
}: {
  explicitValue?: number;
  env: Record<string, string | undefined>;
  envKey: string;
}) {
  if (explicitValue !== undefined) {
    return explicitValue;
  }

  const rawValue = env[envKey];
  if (rawValue === undefined || rawValue.trim() === "") {
    return undefined;
  }

  return parsePositiveInteger(rawValue, 0);
}

function resolvePublicWorkflowBudget(options: PublicWorkflowOptions) {
  const env = options.env ?? {};

  return {
    maxSearchQueries: resolveBudgetValue({
      explicitValue: options.maxSearchQueries,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxSearchQueries,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxSearchQueries,
    }),
    maxSearchResultsPerQuery: resolveBudgetValue({
      explicitValue: options.maxSearchResultsPerQuery,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxSearchResultsPerQuery,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxSearchResultsPerQuery,
    }),
    maxDiscoveredTargets: resolveBudgetValue({
      explicitValue: options.maxDiscoveredTargets,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxDiscoveredTargets,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxDiscoveredTargets,
    }),
    maxProbeUrls: resolveBudgetValue({
      explicitValue: options.maxProbeUrls,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxProbeUrls,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxProbeUrls,
    }),
    maxSitemapUrls: resolveBudgetValue({
      explicitValue: options.maxSitemapUrls,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxSitemapUrls,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxSitemapUrls,
    }),
    maxFirecrawlMapSites: resolveBudgetValue({
      explicitValue: options.maxFirecrawlMapSites,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxFirecrawlMapSites,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxFirecrawlMapSites,
    }),
    maxFirecrawlMapLinksPerSite: resolveBudgetValue({
      explicitValue: options.maxFirecrawlMapLinksPerSite,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxFirecrawlMapLinksPerSite,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxFirecrawlMapLinksPerSite,
    }),
    maxFirecrawlCrawlSites: resolveBudgetValue({
      explicitValue: options.maxFirecrawlCrawlSites,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxFirecrawlCrawlSites,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxFirecrawlCrawlSites,
    }),
    maxFirecrawlCrawlPagesPerSite: resolveBudgetValue({
      explicitValue: options.maxFirecrawlCrawlPagesPerSite,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxFirecrawlCrawlPagesPerSite,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxFirecrawlCrawlPagesPerSite,
    }),
    requestTimeoutMs: resolveBudgetValue({
      explicitValue: options.requestTimeoutMs,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.requestTimeoutMs,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.requestTimeoutMs,
    }),
    maxCrawlTargets: resolveBudgetValue({
      explicitValue: options.maxCrawlTargets,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.maxCrawlTargets,
      fallback: DEFAULT_PUBLIC_WORKFLOW_BUDGET.maxCrawlTargets,
    }),
    crawlPerHostDelayMs: resolveOptionalBudgetValue({
      explicitValue: options.crawlPerHostDelayMs,
      env,
      envKey: PUBLIC_WORKFLOW_BUDGET_ENV.crawlPerHostDelayMs,
    }),
  };
}

function normalizeUrls(urls: string[]) {
  return urls.map((url) => url.trim()).filter(Boolean);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function inferTargetKind(url: string): CrawlTargetKind {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.endsWith("/robots.txt")) {
    return "robots";
  }

  if (normalizedUrl.includes("sitemap") && normalizedUrl.includes(".xml")) {
    return "sitemap";
  }

  if (
    normalizedUrl.includes("rss") ||
    normalizedUrl.includes("atom") ||
    normalizedUrl.includes("feed")
  ) {
    return "rss";
  }

  if (normalizedUrl.includes("/products/")) {
    return "product";
  }

  if (normalizedUrl.includes("/collections/")) {
    return "collection";
  }

  if (normalizedUrl.includes("/blog")) {
    return "blog";
  }

  return "homepage";
}

function databaseTargetsForKind(
  kind: CrawlTargetKind,
): IndustryResearchDatabaseName[] {
  switch (kind) {
    case "robots":
      return ["source_database", "website_structure_database"];
    case "rss":
      return [
        "source_database",
        "content_database",
        "weekly_intelligence_reports",
      ];
    case "sitemap":
      return [
        "source_database",
        "website_structure_database",
        "product_database",
        "content_database",
      ];
    case "product":
      return ["product_database", "keyword_database", "opportunity_database"];
    case "collection":
      return [
        "website_structure_database",
        "product_database",
        "keyword_database",
      ];
    case "blog":
      return ["content_database", "keyword_database", "pain_point_database"];
    default:
      return [
        "competitor_database",
        "website_structure_database",
        "content_database",
      ];
  }
}

function createSupplementalPublicTargets(
  projectId: string,
  input: ResearchWorkflowInput,
  existingTargets: CrawlPlanTarget[],
) {
  const existingTargetUrls = new Set(
    existingTargets.map((target) => target.target),
  );

  return normalizeUrls(input.urls)
    .filter(isHttpUrl)
    .filter((url) => !existingTargetUrls.has(url))
    .map((url, index) => {
      const kind = inferTargetKind(url);

      return {
        id: `crawl-target-public-url-${index + 1}`,
        projectId,
        candidateId: "discovery-seed-urls",
        kind,
        target: url,
        reason: "用户提供的公开 URL，public_web 模式直接抽取为 raw document。",
        maxPages: 1,
        databaseTargets: databaseTargetsForKind(kind),
      } satisfies CrawlPlanTarget;
    });
}

function createPublicCrawlPlan(
  projectId: string,
  input: ResearchWorkflowInput,
  basePlan: CrawlPlan,
): CrawlPlan {
  const userProvidedPublicTargets = createSupplementalPublicTargets(
    projectId,
    input,
    [],
  );

  return {
    ...basePlan,
    mode: "public_web",
    guardrails: [
      "public_web 模式只处理公开 http/https URL。",
      "不绕过登录、验证码、付费墙，不采集私人数据、支付信息或联系方式。",
      "非公开补充输入会保留为补充链路，不进入真实 public_web crawl plan。",
      "未验证的 Shopify、RSS 和产品 JSON 猜测路径不会直接进入真实抓取；只有用户明确输入或从首页、robots、sitemap 发现的公开 URL 才会抓取。",
      "优先采集品牌/商家官网首页、collection、product、blog、FAQ、reviews/testimonials；社媒和 marketplace 页面默认排除。Amazon 只有在专用证据轨显式启用且品类通过 canary 时例外，内容生态只走官方 API。",
      "Tavily/Serper 负责候选官网搜索；Firecrawl Map 受限补充站内公开深页；仅在显式启用且 Map 不足时允许最多 1 站点、深度 1、最多 4 页的 Crawl fallback；Scrape 负责所选页面正文抽取，不执行全站 Crawl、交互动作、登录或绕过访问限制。",
      "公开网页抽取出的结构化结论必须人工复核。",
    ],
    targets: userProvidedPublicTargets,
  };
}

export async function runPublicIndustryResearchWorkflow(
  input: ResearchWorkflowInput,
  options: PublicWorkflowOptions = {},
): Promise<ResearchWorkflowResult> {
  const emit = options.onProgress ?? (() => {});
  const budget = resolvePublicWorkflowBudget(options);
  const ts = () => new Date().toISOString();
  emit({ type: "phase", phase: "discover", status: "start", at: ts() });

  const project = createIndustryResearchProject(input);
  const sourceDiscoveryPlan = generateSourceDiscoveryPlan(project.id, input);
  const baseCrawlPlan = generateCrawlPlan(
    project.id,
    input,
    sourceDiscoveryPlan,
  );
  const publicCrawlPlan = createPublicCrawlPlan(
    project.id,
    input,
    baseCrawlPlan,
  );
  const publicSourceDiscovery = await discoverPublicSources(
    project.id,
    input,
    publicCrawlPlan,
    {
      fetcher: options.fetcher,
      maxSearchQueries: budget.maxSearchQueries,
      maxSearchResultsPerQuery: budget.maxSearchResultsPerQuery,
      maxDiscoveredTargets: budget.maxDiscoveredTargets,
      maxProbeUrls: budget.maxProbeUrls,
      maxSitemapUrls: budget.maxSitemapUrls,
      firecrawlMapEnabled: options.firecrawlMapEnabled,
      maxFirecrawlMapSites: budget.maxFirecrawlMapSites,
      maxFirecrawlMapLinksPerSite: budget.maxFirecrawlMapLinksPerSite,
      firecrawlCrawlFallbackEnabled: options.firecrawlCrawlFallbackEnabled,
      maxFirecrawlCrawlSites: budget.maxFirecrawlCrawlSites,
      maxFirecrawlCrawlPagesPerSite: budget.maxFirecrawlCrawlPagesPerSite,
      requestTimeoutMs: budget.requestTimeoutMs,
      env: options.env,
    },
  );
  const enhancedSourceDiscoveryPlan = {
    ...sourceDiscoveryPlan,
    candidates: publicSourceDiscovery.candidates,
    notes: [
      "public_web 模式仅保留真实公开网页发现结果；演示候选不会进入真实采集计划。",
      ...publicSourceDiscovery.notes.filter(
        (note) => !note.toLowerCase().includes("mock"),
      ),
    ],
  };
  const crawlPlan = {
    ...publicCrawlPlan,
    targets: [...publicCrawlPlan.targets, ...publicSourceDiscovery.targets],
    guardrails: [
      ...publicCrawlPlan.guardrails,
      "public_source_discovery 会优先探测公开官网首页、robots 和 sitemap；Firecrawl Map 补充深页，显式启用的 Crawl 仅作 Map 不足时的严格限额 fallback。",
    ],
  };
  for (const candidate of enhancedSourceDiscoveryPlan.candidates.slice(0, 12)) {
    emit({
      type: "source",
      at: ts(),
      title: candidate.title,
      method: candidate.method,
      priority: candidate.priority,
      seed: candidate.seed,
    });
  }
  emit({ type: "phase", phase: "discover", status: "done", at: ts() });
  emit({ type: "phase", phase: "crawl", status: "start", at: ts() });

  const plannedSources = createResearchSourcesFromPlan(
    project.id,
    input,
    enhancedSourceDiscoveryPlan,
    crawlPlan,
  );
  const publicCrawlerResult = await runPublicCrawler(
    project.id,
    crawlPlan,
    plannedSources,
    {
      fetcher: options.fetcher,
      input,
      now: options.now,
      maxTargets: budget.maxCrawlTargets,
      perHostDelayMs: budget.crawlPerHostDelayMs,
      env: options.env,
      prefetchedDocuments: publicSourceDiscovery.prefetchedDocuments,
    },
  );
  const contentApiResult = await collectContentApiSignals(project.id, input, {
    env: options.env,
    fetcher: options.fetcher,
  });
  const amazonPublicEvidenceResult =
    options.amazonPublicEvidenceResult ??
    (await collectAmazonPublicEvidence(project.id, input, {
      env: options.env,
      fetcher: options.fetcher,
    }));

  for (const note of [
    ...contentApiResult.notes,
    ...amazonPublicEvidenceResult.notes,
  ]) {
    emit({ type: "log", at: ts(), message: note });
  }

  const sources = [
    ...plannedSources,
    ...contentApiResult.sources,
    ...amazonPublicEvidenceResult.sources,
  ];
  const crawlerResult = {
    ...publicCrawlerResult,
    raw_documents: [
      ...publicCrawlerResult.raw_documents,
      ...contentApiResult.raw_documents,
      ...amazonPublicEvidenceResult.raw_documents,
    ],
    extraction_jobs: [
      ...publicCrawlerResult.extraction_jobs,
      ...contentApiResult.extraction_jobs,
      ...amazonPublicEvidenceResult.extraction_jobs,
    ],
  };
  emit({
    type: "crawl",
    at: ts(),
    completed: crawlerResult.crawl_jobs.length,
    total: crawlerResult.crawl_jobs.length,
    rawDocs: crawlerResult.raw_documents.length,
  });
  emit({ type: "phase", phase: "crawl", status: "done", at: ts() });
  emit({ type: "phase", phase: "build", status: "start", at: ts() });
  const researchDocuments = createResearchDocumentsFromRawDocuments(
    project.id,
    crawlerResult.raw_documents,
    sources,
  );
  const databases = buildIndustryResearchDatabases({
    project,
    input,
    discoveryPlan: enhancedSourceDiscoveryPlan,
    sources,
    rawDocuments: crawlerResult.raw_documents,
    sourceReliability: "needs_validation",
  });
  for (const database of requiredIndustryResearchDatabases) {
    emit({
      type: "db",
      at: ts(),
      database,
      count: databases[database].length,
    });
  }
  emit({ type: "phase", phase: "build", status: "done", at: ts() });
  emit({ type: "phase", phase: "report", status: "start", at: ts() });

  const dataset = {
    research_projects: [project],
    source_discovery_plans: [
      {
        ...enhancedSourceDiscoveryPlan,
        notes: [
          ...enhancedSourceDiscoveryPlan.notes,
          ...contentApiResult.notes,
          ...amazonPublicEvidenceResult.notes,
        ],
      },
    ],
    crawl_plans: [crawlPlan],
    ...crawlerResult,
    research_sources: sources,
    research_documents: researchDocuments,
    ...databases,
  };
  const reportContent = generateResearchMarkdownReport(dataset);
  emit({ type: "phase", phase: "report", status: "done", at: ts() });

  return {
    ...dataset,
    research_reports: [
      {
        id: "report-public-web-1",
        projectId: project.id,
        format: "markdown",
        title: `${project.name} 公开采集 Markdown 报告`,
        content: reportContent,
        createdAt: new Date().toISOString(),
      },
    ],
    workflowSteps: ecommerceCompetitorResearchTemplate.workflowSteps.map(
      (step) =>
        step.id === "crawl_sources"
          ? {
              ...step,
              title: "采集公开资料",
              description:
                "从用户提供和计划生成的公开 http/https URL 抽取 raw documents。",
              status: "done",
            }
          : {
              ...step,
              status: "done",
            },
    ),
    reviewItems: createResearchReviewItems(dataset),
  };
}
