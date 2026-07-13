import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  type CrawlPlanTarget,
  canonicalizeIndustryRawDocumentUrl,
  createIndustryAcquisitionRoute,
  createIndustryAcquisitionTaskPlan,
  createIndustryM2LiveBudgetTracker,
  createIndustryPlan,
  createIndustryRawDocumentStore,
  createIndustryResearchProject,
  createResearchSourcesFromPlan,
  discoverPublicSources,
  dishwasherIndustryPlanningFixture,
  generateCrawlPlan,
  generateSourceDiscoveryPlan,
  type IndustryAcquisitionRoute,
  type IndustryAcquisitionTargetKind,
  type IndustryM2LiveRequestAudit,
  type IndustryPlanSourceRole,
  industryM23LiveBudget,
  type PublicCrawlerFetch,
  putIndustryRawDocument,
  type ResearchWorkflowInput,
  resolveSourceRegistryMatches,
  runPublicCrawler,
  serializeIndustryRawDocumentStore,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function loadLocalEnv() {
  try {
    return readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .reduce<Record<string, string>>((env, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return env;
        const separator = trimmed.indexOf("=");
        if (separator <= 0) return env;
        env[trimmed.slice(0, separator).trim()] = trimmed
          .slice(separator + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        return env;
      }, {});
  } catch {
    return {};
  }
}

function sanitizedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(process.cwd(), "[workspace]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/api[_ -]?key[:=]\s*[^\s]+/gi, "api_key=[redacted]");
}

async function writeTextAtomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

async function writeJsonAtomic(path: string, value: unknown) {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceRoleForTarget(
  target: CrawlPlanTarget,
  brandHostnames: Set<string>,
): IndustryPlanSourceRole | null {
  const host = hostname(target.target);
  if (!host) return null;
  if (host === "stats.gov.cn" || host.endsWith(".stats.gov.cn")) {
    return "government_statistics";
  }
  if (
    host === "std.samr.gov.cn" ||
    host === "openstd.samr.gov.cn" ||
    host.includes("standards")
  ) {
    return "standards_body";
  }
  if (host.endsWith(".gov.cn") || host === "gov.cn") return "regulator";
  if (brandHostnames.has(host)) return "brand_official_site";
  return null;
}

function routeTargetKind(
  target: CrawlPlanTarget,
): IndustryAcquisitionTargetKind {
  if (target.kind === "sitemap") return "sitemap";
  if (target.kind === "rss") return "rss";
  if (target.kind === "homepage" || target.kind === "robots") {
    return "public_page";
  }
  return "complex_public_page";
}

function matchingCrawlEvents(
  url: string,
  events: IndustryM2LiveRequestAudit[],
) {
  const canonical = canonicalizeIndustryRawDocumentUrl(url);
  return events.filter((event) => {
    if (event.phase !== "crawl") return false;
    const eventTarget =
      event.targetUrl ??
      (event.kind === "native_public" ? event.requestUrl : null);
    return (
      eventTarget !== null &&
      canonicalizeIndustryRawDocumentUrl(eventTarget) === canonical
    );
  });
}

function mediaTypeFor(contentType: "html" | "rss" | "csv" | "text") {
  if (contentType === "html") return "text/html";
  if (contentType === "rss") return "application/rss+xml";
  if (contentType === "csv") return "text/csv";
  return "text/plain";
}

if (!process.argv.includes("--execute")) {
  throw new Error("m2_3_live_runner_requires_explicit_execute");
}

const started = new Date();
const runId = `dishwasher-m2-3-wave-1-${timestampForPath(started)}`;
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m2.3", runId),
);
await mkdir(outputDir, { recursive: true });

const loadedEnv = { ...loadLocalEnv(), ...process.env };
const searchApiKey = loadedEnv.AGENT_FACTORY_SEARCH_API_KEY?.trim();
const firecrawlApiKey = (
  loadedEnv.AGENT_FACTORY_FIRECRAWL_API_KEY ??
  loadedEnv.FIRECRAWL_API_KEY ??
  ""
).trim();
if (!searchApiKey) throw new Error("m2_3_tavily_api_key_missing");
if (!firecrawlApiKey) throw new Error("m2_3_firecrawl_api_key_missing");

const env: Record<string, string | undefined> = {
  ...loadedEnv,
  AGENT_FACTORY_SEARCH_PROVIDER: "tavily",
  AGENT_FACTORY_SEARCH_API_KEY: searchApiKey,
  AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_QUERIES: "3",
  AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_RESULTS_PER_QUERY: "4",
  AGENT_FACTORY_PUBLIC_WEB_MAX_DISCOVERED_TARGETS: "10",
  AGENT_FACTORY_PUBLIC_WEB_MAX_PROBE_URLS: "8",
  AGENT_FACTORY_PUBLIC_WEB_MAX_SITEMAP_URLS: "4",
  AGENT_FACTORY_PUBLIC_WEB_MAX_CRAWL_TARGETS: "6",
  AGENT_FACTORY_PUBLIC_WEB_REQUEST_TIMEOUT_MS: "10000",
  AGENT_FACTORY_PUBLIC_WEB_CRAWL_PER_HOST_DELAY_MS: "1000",
  AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
  AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
  AGENT_FACTORY_FIRECRAWL_MAP_MAX_SITES: "1",
  AGENT_FACTORY_FIRECRAWL_MAP_MAX_LINKS_PER_SITE: "12",
  AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED: "false",
  AGENT_FACTORY_FIRECRAWL_TARGET_KINDS: "homepage,collection,product,blog",
  AGENT_FACTORY_AMAZON_PUBLIC_EVIDENCE_ENABLED: "false",
  AGENT_FACTORY_YOUTUBE_API_KEY: "",
  AGENT_FACTORY_REDDIT_ACCESS_TOKEN: "",
  AGENT_FACTORY_LLM_API_KEY: "",
};
const workflowInput: ResearchWorkflowInput = {
  projectName: "洗碗机 M2.3 第一轮广度扫描",
  industry: "洗碗机",
  category: "洗碗机",
  market: "中国大陆",
  researchGoal:
    "收集品牌、产品形态、渠道、监管与市场来源的公开原文，不生成行业结论",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};
await writeJsonAtomic(join(outputDir, "input.json"), {
  ...workflowInput,
  runId,
  startedAt: started.toISOString(),
  approvedBudget: industryM23LiveBudget,
});

const deadline = new AbortController();
const timeout = setTimeout(
  () => deadline.abort(new Error("m2_3_duration_cap_reached")),
  industryM23LiveBudget.maximumDurationMs,
);
const delegate: PublicCrawlerFetch = (url, init) => fetch(url, init);
const tracker = createIndustryM2LiveBudgetTracker({
  delegate,
  deadlineSignal: deadline.signal,
});
let runError: string | null = null;
let discoveryResult: Awaited<ReturnType<typeof discoverPublicSources>> | null =
  null;
let crawlerResult: Awaited<ReturnType<typeof runPublicCrawler>> | null = null;
let routes: IndustryAcquisitionRoute[] = [];
let rawStore = createIndustryRawDocumentStore(runId);
const rawStoreFailures: Array<{ rawDocumentId: string; error: string }> = [];
const unassignedTargets: Array<{ url: string; reason: string }> = [];

try {
  const project = createIndustryResearchProject(workflowInput);
  const sourceDiscoveryPlan = generateSourceDiscoveryPlan(
    project.id,
    workflowInput,
  );
  const generatedCrawlPlan = generateCrawlPlan(
    project.id,
    workflowInput,
    sourceDiscoveryPlan,
  );
  const emptyPublicCrawlPlan = {
    ...generatedCrawlPlan,
    mode: "public_web" as const,
    targets: [],
    guardrails: [
      "只处理公开 http/https URL。",
      "不绕过登录、验证码或付费墙，不采集私人数据。",
      "本阶段只保存原文与审计，不生成行业事实或报告。",
    ],
  };
  discoveryResult = await discoverPublicSources(
    project.id,
    workflowInput,
    emptyPublicCrawlPlan,
    {
      fetcher: tracker.createFetcher("discovery"),
      maxSearchQueries: 3,
      maxSearchResultsPerQuery: 4,
      maxDiscoveredTargets: 10,
      maxProbeUrls: 8,
      maxSitemapUrls: 4,
      firecrawlMapEnabled: true,
      maxFirecrawlMapSites: 1,
      maxFirecrawlMapLinksPerSite: 12,
      firecrawlCrawlFallbackEnabled: false,
      maxFirecrawlCrawlSites: 0,
      maxFirecrawlCrawlPagesPerSite: 0,
      requestTimeoutMs: 10_000,
      env,
    },
  );
  const brandHostnames = new Set(
    resolveSourceRegistryMatches(workflowInput, env).map((match) =>
      hostname(match.url),
    ),
  );
  const taskPlan = createIndustryAcquisitionTaskPlan(
    createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
  );
  const routedTargets = discoveryResult.targets.flatMap((target) => {
    const sourceRole = sourceRoleForTarget(target, brandHostnames);
    if (!sourceRole) {
      unassignedTargets.push({
        url: target.target,
        reason: "source_role_requires_review",
      });
      return [];
    }
    const task = taskPlan.tasks.find((candidate) =>
      candidate.allowedSourceRoles.includes(sourceRole),
    );
    if (!task) {
      unassignedTargets.push({
        url: target.target,
        reason: `no_task_allows_source_role:${sourceRole}`,
      });
      return [];
    }
    const route = createIndustryAcquisitionRoute({
      task,
      sourceRole,
      targetKind: routeTargetKind(target),
      targetReference: target.target,
      access: {
        requiresLogin: false,
        requiresCookie: false,
        requiresCaptcha: false,
        isPaywalled: false,
        containsPrivateData: false,
      },
    });
    if (route.status !== "planned") {
      unassignedTargets.push({
        url: target.target,
        reason: route.blockingReasons.join(","),
      });
      return [];
    }
    routes.push(route);
    return [target];
  });
  const crawlTargets = routedTargets.slice(0, 6);
  const targetUrls = new Set(crawlTargets.map((target) => target.target));
  routes = routes.filter((route) => targetUrls.has(route.targetReference));
  const routeByUrl = new Map(
    routes.map((route) => [route.targetReference, route]),
  );
  const enhancedDiscoveryPlan = {
    ...sourceDiscoveryPlan,
    candidates: discoveryResult.candidates,
    notes: [...sourceDiscoveryPlan.notes, ...discoveryResult.notes],
  };
  const crawlPlan = {
    ...emptyPublicCrawlPlan,
    targets: crawlTargets,
  };
  const sources = createResearchSourcesFromPlan(
    project.id,
    workflowInput,
    enhancedDiscoveryPlan,
    crawlPlan,
  ).map((source) => {
    const route = routeByUrl.get(source.value);
    return route ? { ...source, industrySourceRole: route.sourceRole } : source;
  });
  crawlerResult = await runPublicCrawler(project.id, crawlPlan, sources, {
    fetcher: tracker.createFetcher("crawl"),
    input: workflowInput,
    now: started.toISOString(),
    maxTargets: 6,
    perHostDelayMs: 1_000,
    env,
    prefetchedDocuments: discoveryResult.prefetchedDocuments,
  });

  for (const rawDocument of crawlerResult.raw_documents) {
    const route = routeByUrl.get(rawDocument.url);
    if (!route) {
      rawStoreFailures.push({
        rawDocumentId: rawDocument.id,
        error: "raw_document_route_missing",
      });
      continue;
    }
    const matchedEvents = matchingCrawlEvents(
      rawDocument.url,
      tracker.snapshot().events,
    );
    const creditsUsed = matchedEvents.reduce(
      (total, event) =>
        total +
        (event.reportedFirecrawlCredits ?? event.reservedFirecrawlCredits),
      0,
    );
    try {
      const result = await putIndustryRawDocument(rawStore, {
        route,
        originalUrl: rawDocument.url,
        capturedAt: started.toISOString(),
        mediaType: mediaTypeFor(rawDocument.contentType),
        httpStatus: 200,
        originalContent: rawDocument.originalText ?? rawDocument.extractedText,
        collectionMethod: "live_public",
        usage: {
          publicRequestsUsed: matchedEvents.length,
          providerRequestsUsed: matchedEvents.filter((event) =>
            event.kind.startsWith("firecrawl"),
          ).length,
          creditsUsed,
          costYuan: matchedEvents.reduce(
            (total, event) => total + event.reservedCostYuan,
            0,
          ),
        },
      });
      rawStore = result.store;
    } catch (error) {
      rawStoreFailures.push({
        rawDocumentId: rawDocument.id,
        error: sanitizedError(error),
      });
    }
  }
} catch (error) {
  runError = sanitizedError(error);
} finally {
  clearTimeout(timeout);
}

const finished = new Date();
const usage = tracker.snapshot();
const crawlFailures =
  crawlerResult?.crawl_runs
    .filter((run) => run.status !== "done")
    .map((run) => ({ jobId: run.jobId, summary: run.summary })) ?? [];
const sourceRoles = [...new Set(routes.map((route) => route.sourceRole))];
const gaps = [
  ...(runError ? [`run_error:${runError}`] : []),
  ...(rawStore.documents.length === 0 ? ["no_raw_documents_stored"] : []),
  ...(unassignedTargets.length > 0
    ? [`${unassignedTargets.length}_targets_require_source_role_review`]
    : []),
  ...(crawlFailures.length > 0
    ? [`${crawlFailures.length}_crawl_targets_failed`]
    : []),
  ...(rawStoreFailures.length > 0
    ? [`${rawStoreFailures.length}_raw_documents_failed_store_validation`]
    : []),
  ...(sourceRoles.length < 2 ? ["source_role_diversity_below_2"] : []),
  "coverage_matrix_not_yet_evaluated",
];
const audit = {
  schemaVersion: "industry_m2_3_live_scan_audit.v1",
  artifactType: "industry-m2-3-live-scan-audit",
  runId,
  status: runError ? "failed" : "completed_with_gaps",
  startedAt: started.toISOString(),
  finishedAt: finished.toISOString(),
  durationMs: finished.getTime() - started.getTime(),
  approvedBudget: industryM23LiveBudget,
  configuration: {
    searchProvider: "tavily",
    searchKeyPresent: Boolean(searchApiKey),
    firecrawlKeyPresent: Boolean(firecrawlApiKey),
    llmEnabled: false,
    amazonEnabled: false,
    youtubeEnabled: false,
    redditEnabled: false,
  },
  usage,
  discovery: {
    candidateCount: discoveryResult?.candidates.length ?? 0,
    targetCount: discoveryResult?.targets.length ?? 0,
    routedTargetCount: routes.length,
    unassignedTargets,
    notes: discoveryResult?.notes ?? [],
  },
  crawl: {
    jobCount: crawlerResult?.crawl_jobs.length ?? 0,
    rawDocumentCount: crawlerResult?.raw_documents.length ?? 0,
    acceptedForReportCount:
      crawlerResult?.raw_documents.filter(
        (document) => document.sourceQuality.acceptedForReport,
      ).length ?? 0,
    failures: crawlFailures,
  },
  immutableStore: {
    summary: rawStore.summary,
    failures: rawStoreFailures,
  },
  sourceRoles,
  gaps,
  assertions: {
    llmRequests: 0,
    reportGenerated: false,
    databaseBuilt: false,
    productionWrite: false,
    rawDocumentsAreNotEvidence: true,
    commercializationAssessed: false,
  },
};

await Promise.all([
  writeJsonAtomic(join(outputDir, "routes.json"), routes),
  writeJsonAtomic(join(outputDir, "discovery.json"), {
    candidates: discoveryResult?.candidates ?? [],
    targets: discoveryResult?.targets ?? [],
    notes: discoveryResult?.notes ?? [],
  }),
  writeJsonAtomic(
    join(outputDir, "raw_documents.json"),
    crawlerResult?.raw_documents ?? [],
  ),
  writeTextAtomic(
    join(outputDir, "immutable_raw_store.json"),
    await serializeIndustryRawDocumentStore(rawStore),
  ),
  writeJsonAtomic(join(outputDir, "run_audit.json"), audit),
]);

console.log(
  JSON.stringify(
    {
      status: audit.status,
      runId,
      durationMs: audit.durationMs,
      usage: {
        publicRequests: usage.publicRequests,
        tavilySearchRequests: usage.tavilySearchRequests,
        firecrawlReservedCredits: usage.firecrawlReservedCredits,
        firecrawlReportedCredits: usage.firecrawlReportedCredits,
        llmRequests: usage.llmRequests,
        reservedCostYuan: usage.reservedCostYuan,
      },
      candidateCount: audit.discovery.candidateCount,
      routedTargetCount: audit.discovery.routedTargetCount,
      rawDocumentCount: audit.crawl.rawDocumentCount,
      immutableDocumentCount: audit.immutableStore.summary.documentCount,
      sourceRoles,
      gaps,
      outputDir,
    },
    null,
    2,
  ),
);

if (runError) throw new Error(`m2_3_live_scan_failed:${runError}`);
