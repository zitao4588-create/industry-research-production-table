import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  assertIndustryRawDocumentStore,
  type CrawlPlanTarget,
  canonicalizeIndustryRawDocumentUrl,
  createIndustryAcquisitionRoute,
  createIndustryAcquisitionTaskPlan,
  createIndustryM2LiveBudgetTracker,
  createIndustryPlan,
  createIndustryResearchProject,
  dishwasherIndustryPlanningFixture,
  type IndustryAcquisitionRoute,
  type IndustryM2LiveRequestAudit,
  type IndustryM2WaveRawDocumentInput,
  type IndustryPlanSourceRole,
  type IndustryRawDocumentStore,
  industryM24LiveBudget,
  type PublicCrawlerFetch,
  putIndustryRawDocument,
  type ResearchSource,
  type ResearchWorkflowInput,
  runPublicCrawler,
  searchWithApiProvider,
  serializeIndustryM2WaveVerification,
  serializeIndustryRawDocumentStore,
  verifyIndustryM2Wave,
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

function roleForUrl(url: string): IndustryPlanSourceRole | null {
  const host = hostname(url);
  if (!host) return null;
  if (host === "stats.gov.cn" || host.endsWith(".stats.gov.cn")) {
    return "government_statistics";
  }
  if (
    host === "std.samr.gov.cn" ||
    host === "openstd.samr.gov.cn" ||
    host.endsWith(".std.samr.gov.cn")
  ) {
    return "standards_body";
  }
  if (host === "samr.gov.cn" || host.endsWith(".samr.gov.cn")) {
    return "regulator";
  }
  if (
    host === "cheaa.com" ||
    host.endsWith(".cheaa.com") ||
    host === "cheaa.org" ||
    host.endsWith(".cheaa.org")
  ) {
    return "industry_association";
  }
  if (
    host === "avc-mr.com" ||
    host.endsWith(".avc-mr.com") ||
    host === "cheari.com" ||
    host.endsWith(".cheari.com") ||
    host === "iresearch.com.cn" ||
    host.endsWith(".iresearch.com.cn") ||
    host === "caict.ac.cn" ||
    host.endsWith(".caict.ac.cn")
  ) {
    return "credible_research_institution";
  }
  if (host === "cnlic.org.cn" || host.endsWith(".cnlic.org.cn")) {
    return "industry_association";
  }
  if (host === "cninfo.com.cn" || host.endsWith(".cninfo.com.cn")) {
    return "financial_report";
  }
  if (
    host === "jd.com" ||
    host.endsWith(".jd.com") ||
    host === "suning.com" ||
    host.endsWith(".suning.com") ||
    host === "tmall.com" ||
    host.endsWith(".tmall.com")
  ) {
    return "trusted_retail_channel";
  }
  return null;
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

type TargetedCandidate = {
  url: string;
  query: string;
  sourceRole: IndustryPlanSourceRole;
  categoryGate: "exact_category_query_and_allowlisted_source";
};

if (!process.argv.includes("--execute")) {
  throw new Error("m2_4_targeted_runner_requires_explicit_execute");
}
const previousRunDir = resolve(
  argumentValue("previous-run") ??
    (() => {
      throw new Error("m2_4_targeted_runner_requires_previous_run");
    })(),
);
const waveNumber = Number(argumentValue("wave") ?? "1");
if (!Number.isInteger(waveNumber) || waveNumber < 1) {
  throw new Error("m2_4_targeted_wave_number_invalid");
}
const started = new Date();
const runId = `dishwasher-m2-4-targeted-wave-${waveNumber}-${timestampForPath(started)}`;
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m2.4", runId),
);
await mkdir(outputDir, { recursive: true });

const loadedEnv = { ...loadLocalEnv(), ...process.env };
const searchApiKey = loadedEnv.AGENT_FACTORY_SEARCH_API_KEY?.trim();
const firecrawlApiKey = (
  loadedEnv.AGENT_FACTORY_FIRECRAWL_API_KEY ??
  loadedEnv.FIRECRAWL_API_KEY ??
  ""
).trim();
if (!searchApiKey) throw new Error("m2_4_tavily_api_key_missing");
if (!firecrawlApiKey) throw new Error("m2_4_firecrawl_api_key_missing");

const env: Record<string, string | undefined> = {
  ...loadedEnv,
  AGENT_FACTORY_SEARCH_PROVIDER: "tavily",
  AGENT_FACTORY_SEARCH_API_KEY: searchApiKey,
  AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
  AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "false",
  AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED: "false",
  AGENT_FACTORY_FIRECRAWL_TARGET_KINDS: "product,collection",
  AGENT_FACTORY_AMAZON_PUBLIC_EVIDENCE_ENABLED: "false",
  AGENT_FACTORY_YOUTUBE_API_KEY: "",
  AGENT_FACTORY_REDDIT_ACCESS_TOKEN: "",
  AGENT_FACTORY_LLM_API_KEY: "",
};
const workflowInput: ResearchWorkflowInput = {
  projectName: "洗碗机 M2.4 权威来源与渠道定向扫描",
  industry: "洗碗机",
  category: "洗碗机",
  market: "中国大陆",
  researchGoal: "定向补齐洗碗机关键市场、监管和渠道原文，不生成行业结论",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};
const queries =
  waveNumber === 1
    ? [
        "洗碗机 市场规模 2024 中国家用电器协会 奥维云网",
        "洗碗机 国家标准 市场监管总局 水效",
        "洗碗机 京东 苏宁 类目 价格",
      ]
    : waveNumber === 2
      ? [
          "site:avc-mr.com 洗碗机 市场 2024",
          "site:cheaa.com OR site:cheaa.org 洗碗机 市场 渠道 价格",
          "site:cninfo.com.cn 洗碗机 年报",
        ]
      : [
          "site:cheari.com 洗碗机",
          "site:cnlic.org.cn 洗碗机",
          "site:openstd.samr.gov.cn OR site:std.samr.gov.cn 洗碗机 标准",
        ];
await writeJsonAtomic(join(outputDir, "input.json"), {
  ...workflowInput,
  runId,
  startedAt: started.toISOString(),
  previousRunDir,
  approvedBudget: industryM24LiveBudget,
  queries,
  categoryRelevanceGate:
    "Exact dishwasher query plus deterministic authority/channel hostname allowlist before crawl; strong body relevance rechecked after crawl.",
});

const deadline = new AbortController();
const timeout = setTimeout(
  () => deadline.abort(new Error("m2_4_duration_cap_reached")),
  industryM24LiveBudget.maximumDurationMs,
);
const delegate: PublicCrawlerFetch = (url, init) => fetch(url, init);
const tracker = createIndustryM2LiveBudgetTracker({
  delegate,
  deadlineSignal: deadline.signal,
  budget: industryM24LiveBudget,
});
const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
const project = createIndustryResearchProject(workflowInput);
let runError: string | null = null;
let candidates: TargetedCandidate[] = [];
const routes: IndustryAcquisitionRoute[] = [];
let selectedCandidates: Array<TargetedCandidate & { taskId: string }> = [];
let crawlerResult: Awaited<ReturnType<typeof runPublicCrawler>> | null = null;
const rawStoreFailures: Array<{ rawDocumentId: string; error: string }> = [];
const searchAudits: Array<{
  query: string;
  ok: boolean;
  returnedUrls: number;
  acceptedUrls: number;
  error?: string;
}> = [];
const oldStore = JSON.parse(
  await readFile(join(previousRunDir, "immutable_raw_store.json"), "utf8"),
) as IndustryRawDocumentStore;
await assertIndustryRawDocumentStore(oldStore);
let rawStore: IndustryRawDocumentStore = structuredClone(oldStore);
const previousVerification = JSON.parse(
  await readFile(join(previousRunDir, "verification.json"), "utf8"),
) as ReturnType<typeof verifyIndustryM2Wave>;

try {
  for (const query of queries) {
    const result = await searchWithApiProvider(
      {
        provider: "tavily",
        endpoint: "https://api.tavily.com/search",
        apiKey: searchApiKey,
      },
      query,
      tracker.createFetcher("discovery"),
      { maxResults: 8, timeoutMs: 10_000 },
    );
    const accepted = result.urls.flatMap((url) => {
      const sourceRole = roleForUrl(url);
      return sourceRole
        ? [
            {
              url,
              query,
              sourceRole,
              categoryGate:
                "exact_category_query_and_allowlisted_source" as const,
            },
          ]
        : [];
    });
    candidates.push(...accepted);
    searchAudits.push({
      query,
      ok: result.ok,
      returnedUrls: result.urls.length,
      acceptedUrls: accepted.length,
      ...(result.error ? { error: result.error } : {}),
    });
  }
  candidates = [
    ...new Map(
      candidates.map((candidate) => [
        canonicalizeIndustryRawDocumentUrl(candidate.url) ?? candidate.url,
        candidate,
      ]),
    ).values(),
  ];

  const unused = [...candidates];
  const take = (
    predicate: (candidate: TargetedCandidate) => boolean,
    excludedRoles = new Set<IndustryPlanSourceRole>(),
  ) => {
    const index = unused.findIndex(
      (candidate) =>
        predicate(candidate) && !excludedRoles.has(candidate.sourceRole),
    );
    if (index < 0) return null;
    return unused.splice(index, 1)[0] ?? null;
  };
  const marketRoles = new Set<IndustryPlanSourceRole>([
    "government_statistics",
    "industry_association",
    "credible_research_institution",
    "financial_report",
  ]);
  const criticalMarketTasks = taskPlan.tasks.filter(
    (task) =>
      task.priority === "critical" &&
      task.allowedSourceRoles.some((role) => marketRoles.has(role)),
  );
  for (const task of criticalMarketTasks) {
    const priorRelevant = previousVerification.documentAudit.filter(
      (document) =>
        document.taskId === task.taskId &&
        document.status === "raw_candidate_relevant_not_evidence",
    );
    const usedRoles = new Set<IndustryPlanSourceRole>(
      priorRelevant.flatMap((document) =>
        document.sourceRole ? [document.sourceRole] : [],
      ),
    );
    const usedHosts = new Set(
      priorRelevant.map((document) => hostname(document.url)),
    );
    let independentSourceCount = usedHosts.size;
    while (
      independentSourceCount < task.targetCoverage.minIndependentSources ||
      usedRoles.size < task.targetCoverage.minSourceRoles
    ) {
      const candidate =
        take(
          (item) =>
            marketRoles.has(item.sourceRole) &&
            !usedHosts.has(hostname(item.url)),
          usedRoles,
        ) ??
        take(
          (item) =>
            marketRoles.has(item.sourceRole) &&
            !usedHosts.has(hostname(item.url)),
        );
      if (!candidate) break;
      usedRoles.add(candidate.sourceRole);
      usedHosts.add(hostname(candidate.url));
      independentSourceCount = usedHosts.size;
      selectedCandidates.push({ ...candidate, taskId: task.taskId });
    }
  }
  const regulationTask = taskPlan.tasks.find(
    (task) =>
      task.priority === "critical" &&
      task.allowedSourceRoles.includes("regulator"),
  );
  if (regulationTask) {
    const candidate = take((item) =>
      ["regulator", "standards_body"].includes(item.sourceRole),
    );
    if (candidate) {
      selectedCandidates.push({ ...candidate, taskId: regulationTask.taskId });
    }
  }
  const channelTask = taskPlan.tasks.find(
    (task) =>
      task.priority === "high" &&
      task.allowedSourceRoles.includes("trusted_retail_channel"),
  );
  if (channelTask && selectedCandidates.length < 8) {
    const candidate = take(
      (item) => item.sourceRole === "trusted_retail_channel",
    );
    if (candidate) {
      selectedCandidates.push({ ...candidate, taskId: channelTask.taskId });
    }
  }
  selectedCandidates = selectedCandidates.slice(0, 8);

  const crawlTargets: CrawlPlanTarget[] = [];
  const sources: ResearchSource[] = [];
  for (const [index, candidate] of selectedCandidates.entries()) {
    const task = taskPlan.tasks.find(
      (item) => item.taskId === candidate.taskId,
    );
    if (!task) continue;
    const route = createIndustryAcquisitionRoute({
      task,
      sourceRole: candidate.sourceRole,
      targetKind: "complex_public_page",
      targetReference: candidate.url,
      access: {
        requiresLogin: false,
        requiresCookie: false,
        requiresCaptcha: false,
        isPaywalled: false,
        containsPrivateData: false,
      },
    });
    if (route.status !== "planned") continue;
    routes.push(route);
    const retail = candidate.sourceRole === "trusted_retail_channel";
    const standards = candidate.sourceRole === "standards_body";
    const pdf = /\.pdf(?:$|[?#])/i.test(candidate.url);
    const target: CrawlPlanTarget = {
      id: `m2-4-target-${index + 1}`,
      projectId: project.id,
      candidateId: `m2-4-candidate-${index + 1}`,
      kind: retail ? "product" : standards || pdf ? "collection" : "blog",
      target: candidate.url,
      reason: `M2.4 ${candidate.sourceRole} targeted dishwasher source`,
      maxPages: 1,
      databaseTargets: ["source_database"],
    };
    crawlTargets.push(target);
    sources.push({
      id: `m2-4-source-${index + 1}`,
      projectId: project.id,
      type: "crawler",
      title: target.reason,
      value: candidate.url,
      automationHint:
        "Exact-category targeted public source; raw candidate only.",
      discoveryCandidateId: target.candidateId,
      priority: "high",
      industrySourceRole: candidate.sourceRole,
    });
  }
  crawlerResult = await runPublicCrawler(
    project.id,
    {
      id: `${project.id}-m2-4-crawl-plan`,
      projectId: project.id,
      mode: "public_web",
      targets: crawlTargets,
      guardrails: [
        "Only public HTTP(S) pages.",
        "Do not bypass login, cookies, CAPTCHA or paywalls.",
        "Store raw snapshots only; do not generate facts or reports.",
      ],
    },
    sources,
    {
      fetcher: tracker.createFetcher("crawl"),
      input: workflowInput,
      now: started.toISOString(),
      maxTargets: 8,
      perHostDelayMs: 1_000,
      env,
    },
  );
  const routeByUrl = new Map(
    routes.map((route) => [
      canonicalizeIndustryRawDocumentUrl(route.targetReference),
      route,
    ]),
  );
  for (const rawDocument of crawlerResult.raw_documents) {
    const route = routeByUrl.get(
      canonicalizeIndustryRawDocumentUrl(rawDocument.url),
    );
    if (!route) continue;
    const matchedEvents = matchingCrawlEvents(
      rawDocument.url,
      tracker.snapshot().events,
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
          creditsUsed: matchedEvents.reduce(
            (total, event) =>
              total +
              (event.reportedFirecrawlCredits ??
                event.reservedFirecrawlCredits),
            0,
          ),
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
  await assertIndustryRawDocumentStore(rawStore);
} catch (error) {
  runError = sanitizedError(error);
} finally {
  clearTimeout(timeout);
}

const previousRawDocuments = JSON.parse(
  await readFile(join(previousRunDir, "raw_documents.json"), "utf8"),
) as IndustryM2WaveRawDocumentInput[];
const previousRoutes = JSON.parse(
  await readFile(join(previousRunDir, "routes.json"), "utf8"),
) as IndustryAcquisitionRoute[];
const waveRawDocuments = (crawlerResult?.raw_documents ??
  []) as IndustryM2WaveRawDocumentInput[];
const combinedRawDocuments = [
  ...new Map(
    [...previousRawDocuments, ...waveRawDocuments].map((document) => [
      canonicalizeIndustryRawDocumentUrl(document.url) ?? document.url,
      document,
    ]),
  ).values(),
];
const combinedRoutes = [
  ...new Map(
    [...previousRoutes, ...routes].map((route) => [
      canonicalizeIndustryRawDocumentUrl(route.targetReference) ??
        route.routeId,
      route,
    ]),
  ).values(),
];
const verification = verifyIndustryM2Wave({
  runId,
  category: "洗碗机",
  categoryTerms: ["洗碗机", "洗碟机", "dishwasher"],
  conflictingCategoryTerms: [
    "洗地机",
    "空调",
    "air_conditioner",
    "air-conditioner",
    "冰箱",
    "洗衣机",
  ],
  rawDocuments: combinedRawDocuments,
  routes: combinedRoutes,
  taskPlan,
});
const finished = new Date();
const usage = tracker.snapshot();
const crawlFailures =
  crawlerResult?.crawl_runs
    .filter((run) => run.status !== "done")
    .map((run) => ({ jobId: run.jobId, summary: run.summary })) ?? [];
const audit = {
  schemaVersion: "industry_m2_4_targeted_scan_audit.v1",
  artifactType: "industry-m2-4-targeted-scan-audit",
  runId,
  status: runError ? "failed" : "completed_with_verification",
  startedAt: started.toISOString(),
  finishedAt: finished.toISOString(),
  durationMs: finished.getTime() - started.getTime(),
  approvedBudget: industryM24LiveBudget,
  usage,
  searchAudits,
  categoryRelevanceGate: {
    exactCategoryQueries: queries.length,
    allowlistedCandidateCount: candidates.length,
    selectedCandidateCount: selectedCandidates.length,
    rejectedBeforeCrawlCount: searchAudits.reduce(
      (total, audit) => total + audit.returnedUrls - audit.acceptedUrls,
      0,
    ),
  },
  crawl: {
    rawDocumentCount: waveRawDocuments.length,
    failures: crawlFailures,
  },
  immutableStore: {
    previousDocumentCount: oldStore.summary.documentCount,
    combinedSummary: rawStore.summary,
    failures: rawStoreFailures,
  },
  verification: verification.summary,
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
  writeJsonAtomic(join(outputDir, "candidates.json"), {
    queries,
    searchAudits,
    allowlistedCandidates: candidates,
    selectedCandidates,
  }),
  writeJsonAtomic(join(outputDir, "routes.json"), combinedRoutes),
  writeJsonAtomic(join(outputDir, "wave_routes.json"), routes),
  writeJsonAtomic(join(outputDir, "raw_documents.json"), combinedRawDocuments),
  writeJsonAtomic(join(outputDir, "wave_raw_documents.json"), waveRawDocuments),
  writeTextAtomic(
    join(outputDir, "immutable_raw_store.json"),
    await serializeIndustryRawDocumentStore(rawStore),
  ),
  writeTextAtomic(
    join(outputDir, "verification.json"),
    serializeIndustryM2WaveVerification(verification),
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
        llmRequests: usage.llmRequests,
        reservedCostYuan: usage.reservedCostYuan,
      },
      allowlistedCandidateCount: candidates.length,
      selectedCandidateCount: selectedCandidates.length,
      waveRawDocumentCount: waveRawDocuments.length,
      combinedImmutableDocumentCount: rawStore.summary.documentCount,
      verification: verification.summary,
      decision: verification.decision,
      outputDir,
    },
    null,
    2,
  ),
);
if (runError) throw new Error(`m2_4_targeted_scan_failed:${runError}`);
