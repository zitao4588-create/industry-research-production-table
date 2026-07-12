import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createIndustryResearchDeliveryArtifacts,
  type OpenAICompatibleFetch,
  type PublicCrawlerFetch,
  type ResearchWorkflowInput,
  runPublicDeepSeekIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";

const canaryV3Mode = process.argv.includes("--canary-v3");
const batch12Mode = process.argv.includes("--batch-12");
const postKillMode = process.argv.includes("--post-kill");
const exploratoryMode = batch12Mode || postKillMode;
const benchmarkVersion = postKillMode
  ? "evidence-benchmark-v3-post-kill-exploratory"
  : batch12Mode
    ? "evidence-benchmark-v3-12-category"
    : canaryV3Mode
      ? "evidence-canary-v3"
      : "evidence-benchmark-v2";
const expectedHead = "db1a97c212255cab73b924a995959cf5105af4be";
const expectedTrackedDiffSha256 =
  "d86b28ad0e11a326738038f6ef2bd8da0129b3495c48b50d89676c2b24257d36";
const approvedPaidApiCoreCapYuan = 4;
const approvedFirecrawlCreditsPerCategory = 50;
const approvedFirecrawlCoreCredits = 150;

const fixedBudget = {
  maxSearchQueries: 2,
  maxSearchResultsPerQuery: 4,
  maxDiscoveredTargets: 10,
  maxProbeUrls: 8,
  maxSitemapUrls: 4,
  maxFirecrawlMapSites: 2,
  maxFirecrawlMapLinksPerSite: 20,
  maxCrawlTargets: 8,
  maxSearchApiRequests: 2,
  maxFirecrawlMapRequests: 2,
  maxFirecrawlScrapeRequests: 8,
  maxFirecrawlCrawlRequests: 21,
  maxFirecrawlCrawlSites: 1,
  maxFirecrawlCrawlPagesPerSite: 4,
  maxPublicRequests: 32,
  maxLlmRequests: exploratoryMode ? 8 : 3,
  requestTimeoutMs: 8_000,
  firecrawlTimeoutMs: 12_000,
  crawlPerHostDelayMs: 1_000,
  wallTimeMs: 300_000,
} as const;

type BenchmarkCategory = {
  id: string;
  label: string;
  order: number;
};

const categories: BenchmarkCategory[] = [
  { id: "pet-probiotics", label: "宠物肠胃益生菌", order: 1 },
  { id: "dishwasher", label: "洗碗机", order: 2 },
  {
    id: "japan-niche-skincare",
    label: "日本小众护肤品牌",
    order: 3,
  },
  { id: "mens-electric-shaver", label: "男士电动剃须刀", order: 4 },
  { id: "cat-water-fountain", label: "猫咪自动饮水机", order: 5 },
  { id: "laptop-stand", label: "笔记本电脑支架", order: 6 },
  { id: "robot-vacuum", label: "扫地机器人", order: 7 },
  { id: "electric-toothbrush", label: "电动牙刷", order: 8 },
  { id: "sleep-gummies", label: "睡眠软糖", order: 9 },
  { id: "korean-scalp-serum", label: "韩国头皮精华", order: 10 },
  { id: "portable-camping-shower", label: "露营便携淋浴器", order: 11 },
  { id: "skincare-broad-negative", label: "护肤品", order: 12 },
];

type RequestCounters = {
  publicTotal: number;
  searchApi: number;
  firecrawlMap: number;
  firecrawlScrape: number;
  firecrawlCrawl: number;
  nativePublic: number;
  llm: number;
  llmModels: string[];
  firecrawlReportedCredits: number;
  firecrawlResponsesWithCredits: number;
  llmUsage: Array<{
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    promptCacheHitTokens?: number;
    promptCacheMissTokens?: number;
  }>;
};

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadLocalEnv() {
  if (!existsSync(".env.local")) return {};

  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return env;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) return env;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      env[key] = value;
      return env;
    }, {});
}

function benchmarkEnv(): Record<string, string | undefined> {
  return {
    ...loadLocalEnv(),
    ...process.env,
    AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_QUERIES: String(
      fixedBudget.maxSearchQueries,
    ),
    AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_RESULTS_PER_QUERY: String(
      fixedBudget.maxSearchResultsPerQuery,
    ),
    AGENT_FACTORY_PUBLIC_WEB_MAX_DISCOVERED_TARGETS: String(
      fixedBudget.maxDiscoveredTargets,
    ),
    AGENT_FACTORY_PUBLIC_WEB_MAX_PROBE_URLS: String(fixedBudget.maxProbeUrls),
    AGENT_FACTORY_PUBLIC_WEB_MAX_SITEMAP_URLS: String(
      fixedBudget.maxSitemapUrls,
    ),
    AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
    AGENT_FACTORY_FIRECRAWL_MAP_MAX_SITES: String(
      fixedBudget.maxFirecrawlMapSites,
    ),
    AGENT_FACTORY_FIRECRAWL_MAP_MAX_LINKS_PER_SITE: String(
      fixedBudget.maxFirecrawlMapLinksPerSite,
    ),
    AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED:
      canaryV3Mode || exploratoryMode ? "true" : "false",
    AGENT_FACTORY_FIRECRAWL_CRAWL_MAX_SITES: String(
      fixedBudget.maxFirecrawlCrawlSites,
    ),
    AGENT_FACTORY_FIRECRAWL_CRAWL_MAX_PAGES_PER_SITE: String(
      fixedBudget.maxFirecrawlCrawlPagesPerSite,
    ),
    AGENT_FACTORY_PUBLIC_WEB_MAX_CRAWL_TARGETS: String(
      fixedBudget.maxCrawlTargets,
    ),
    AGENT_FACTORY_PUBLIC_WEB_REQUEST_TIMEOUT_MS: String(
      fixedBudget.requestTimeoutMs,
    ),
    AGENT_FACTORY_PUBLIC_WEB_CRAWL_PER_HOST_DELAY_MS: String(
      fixedBudget.crawlPerHostDelayMs,
    ),
    AGENT_FACTORY_FIRECRAWL_TIMEOUT_MS: String(fixedBudget.firecrawlTimeoutMs),
    AGENT_FACTORY_FIRECRAWL_TARGET_KINDS: "homepage,collection,product,blog",
    AGENT_FACTORY_SOURCE_REGISTRY_JSON: "",
    AGENT_FACTORY_FIXED_SOURCE_URLS: "",
    AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "false",
    AGENT_FACTORY_YOUTUBE_API_KEY: "",
    AGENT_FACTORY_REDDIT_ACCESS_TOKEN: "",
  } satisfies Record<string, string | undefined>;
}

function trackedBaseline() {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const diff = execFileSync("git", ["diff", "--binary"]);
  const trackedDiffSha256 = createHash("sha256").update(diff).digest("hex");

  return { head, trackedDiffSha256 };
}

function verifyBaseline() {
  const baseline = trackedBaseline();
  if (canaryV3Mode || exploratoryMode) return baseline;
  if (baseline.head !== expectedHead) {
    throw new Error(
      `benchmark_v2_head_changed: expected=${expectedHead} actual=${baseline.head}`,
    );
  }
  if (baseline.trackedDiffSha256 !== expectedTrackedDiffSha256) {
    throw new Error(
      `benchmark_v2_diff_changed: expected=${expectedTrackedDiffSha256} actual=${baseline.trackedDiffSha256}`,
    );
  }
  return baseline;
}

function createInput(category: BenchmarkCategory): ResearchWorkflowInput {
  return {
    projectName: `${category.label} 竞品研究`,
    industry: category.label,
    category: category.label,
    market: "线上电商 / DTC",
    researchGoal: "找到可切入的产品与内容机会",
    templateId: "ecommerce_competitor_research",
    urls: [],
    csvText: "",
    manualText: "",
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function combinedSignal(...signals: Array<AbortSignal | null | undefined>) {
  const activeSignals = signals.filter(Boolean) as AbortSignal[];
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];

  const controller = new AbortController();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

function classifyPublicRequest(urlValue: string) {
  try {
    const url = new URL(urlValue);
    if (url.hostname.includes("tavily")) return "searchApi" as const;
    if (url.hostname.includes("firecrawl")) {
      if (/\/map\/?$/i.test(url.pathname)) return "firecrawlMap" as const;
      if (/\/scrape\/?$/i.test(url.pathname)) {
        return "firecrawlScrape" as const;
      }
      if (/\/crawl(?:\/[^/]+)?\/?$/i.test(url.pathname)) {
        return "firecrawlCrawl" as const;
      }
      throw new Error(
        `benchmark_v2_unexpected_firecrawl_endpoint:${url.pathname}`,
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("benchmark_v2_unexpected_firecrawl_endpoint")
    ) {
      throw error;
    }
  }
  return "nativePublic" as const;
}

function assertPublicBudget(
  counters: RequestCounters,
  kind:
    | "searchApi"
    | "firecrawlMap"
    | "firecrawlScrape"
    | "firecrawlCrawl"
    | "nativePublic",
) {
  if (counters.publicTotal >= fixedBudget.maxPublicRequests) {
    throw new Error("benchmark_v2_public_request_cap_exceeded");
  }
  if (
    kind === "searchApi" &&
    counters.searchApi >= fixedBudget.maxSearchApiRequests
  ) {
    throw new Error("benchmark_v2_search_request_cap_exceeded");
  }
  if (
    kind === "firecrawlMap" &&
    counters.firecrawlMap >= fixedBudget.maxFirecrawlMapRequests
  ) {
    throw new Error("benchmark_v2_firecrawl_map_cap_exceeded");
  }
  if (
    kind === "firecrawlScrape" &&
    counters.firecrawlScrape >= fixedBudget.maxFirecrawlScrapeRequests
  ) {
    throw new Error("benchmark_v2_firecrawl_scrape_cap_exceeded");
  }
  if (
    kind === "firecrawlCrawl" &&
    counters.firecrawlCrawl >= fixedBudget.maxFirecrawlCrawlRequests
  ) {
    throw new Error("benchmark_v3_firecrawl_crawl_cap_exceeded");
  }
}

function captureLlmUsage(counters: RequestCounters, payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const usage = (payload as { usage?: Record<string, unknown> }).usage;
  if (!usage || typeof usage !== "object") return;

  const numberValue = (key: string) => {
    const value = usage[key];
    return typeof value === "number" ? value : undefined;
  };
  counters.llmUsage.push({
    promptTokens: numberValue("prompt_tokens"),
    completionTokens: numberValue("completion_tokens"),
    totalTokens: numberValue("total_tokens"),
    promptCacheHitTokens: numberValue("prompt_cache_hit_tokens"),
    promptCacheMissTokens: numberValue("prompt_cache_miss_tokens"),
  });
}

function captureFirecrawlCredits(counters: RequestCounters, payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const creditsUsed = (payload as { creditsUsed?: unknown }).creditsUsed;
  if (typeof creditsUsed !== "number") return;

  counters.firecrawlReportedCredits += creditsUsed;
  counters.firecrawlResponsesWithCredits += 1;
}

function createCountedFetchers(
  counters: RequestCounters,
  deadlineSignal: AbortSignal,
) {
  const publicFetcher: PublicCrawlerFetch = async (input, init) => {
    const kind = classifyPublicRequest(requestUrl(input));
    assertPublicBudget(counters, kind);
    counters.publicTotal += 1;
    counters[kind] += 1;

    const response = await fetch(input, {
      ...init,
      signal: combinedSignal(init?.signal, deadlineSignal),
    });
    if (
      kind === "firecrawlMap" ||
      kind === "firecrawlScrape" ||
      kind === "firecrawlCrawl"
    ) {
      try {
        captureFirecrawlCredits(counters, await response.clone().json());
      } catch {
        // Provider may omit JSON usage metadata; dashboard remains authoritative.
      }
    }
    return response;
  };

  const llmFetcher: OpenAICompatibleFetch = async (input, init) => {
    if (counters.llm >= fixedBudget.maxLlmRequests) {
      throw new Error("benchmark_v2_llm_request_cap_exceeded");
    }
    counters.llm += 1;
    if (typeof init?.body === "string") {
      try {
        const model = (JSON.parse(init.body) as { model?: unknown }).model;
        if (typeof model === "string") counters.llmModels.push(model);
      } catch {
        // Invalid request JSON is handled by the provider call itself.
      }
    }

    const response = await fetch(input, {
      ...init,
      signal: combinedSignal(init?.signal, deadlineSignal),
    });
    try {
      captureLlmUsage(counters, await response.clone().json());
    } catch {
      // OpenAI-compatible providers may omit usage in error or stream responses.
    }
    return response;
  };

  return { publicFetcher, llmFetcher };
}

function sourceMetrics(
  rawDocuments: Array<{
    id: string;
    title: string;
    url: string;
    extractedText: string;
    cleaningAudit?: { residualNoiseRatio: number };
    sourceQuality: {
      sourceType: string;
      sourceRelevance: string;
      sourceConfidence: string;
      acceptedForReport: boolean;
    };
  }>,
) {
  const acceptedDocuments = rawDocuments.filter(
    (document) => document.sourceQuality.acceptedForReport,
  );
  const canonicalHostname = (url: string) =>
    new URL(url).hostname.replace(/^www\./i, "");
  const canonicalUrl = (url: string) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "") || "/";
    return `${canonicalHostname(url)}${path}`;
  };
  const canonicalDocuments = [
    ...new Map(
      acceptedDocuments.map((document) => [
        canonicalUrl(document.url),
        document,
      ]),
    ).values(),
  ];

  return {
    ruleAcceptedDocumentCount: acceptedDocuments.length,
    ruleAcceptedUniqueDomainCount: new Set(
      acceptedDocuments.map((document) => canonicalHostname(document.url)),
    ).size,
    ruleAcceptedCanonicalDocumentCount: canonicalDocuments.length,
    ruleAcceptedDeepPageCount: canonicalDocuments.filter(
      (document) => new URL(document.url).pathname.replace(/\/$/, "") !== "",
    ).length,
    acceptedDocuments: acceptedDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      url: document.url,
      sourceType: document.sourceQuality.sourceType,
      relevance: document.sourceQuality.sourceRelevance,
      confidence: document.sourceQuality.sourceConfidence,
      textLength: document.extractedText.length,
      residualNoiseRatio: document.cleaningAudit?.residualNoiseRatio ?? null,
    })),
    manualTrustedDocumentCount: null,
    manualTrustedDomainCount: null,
    manualDeepPageCount: null,
    manualNoiseAudit: "pending",
  };
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(process.cwd(), "[workspace]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/api[_ -]?key[:=]\s*[^\s]+/gi, "api_key=[redacted]");
}

async function main() {
  const categoryId = argumentValue("category");
  const category = categories.find((item) => item.id === categoryId);
  if (!category) {
    throw new Error(
      `unknown_benchmark_v2_category: use one of ${categories.map((item) => item.id).join(", ")}`,
    );
  }

  const execute = process.argv.includes("--execute");
  const approvedPaidApiCapYuan = Number(
    argumentValue("approved-paid-api-cap-yuan"),
  );
  const approvedFirecrawlCredits = Number(
    argumentValue("approved-firecrawl-credits"),
  );
  const firecrawlBalanceBefore = Number(
    argumentValue("firecrawl-balance-before"),
  );
  const deepseekBalanceBefore = Number(
    argumentValue("deepseek-balance-before"),
  );
  const deepseekCumulativeSpendBefore = Number(
    argumentValue("deepseek-cumulative-spend-before"),
  );
  const baseline = verifyBaseline();
  const env = benchmarkEnv();
  const plan = {
    benchmarkVersion,
    category,
    baseline,
    input: createInput(category),
    fixedBudget,
    approvedBudgets: {
      paidApiCoreYuan: exploratoryMode ? 0 : approvedPaidApiCoreCapYuan,
      firecrawlCreditsPerCategory: approvedFirecrawlCreditsPerCategory,
      firecrawlCoreCredits: approvedFirecrawlCoreCredits,
    },
    firecrawlBalanceBefore:
      Number.isFinite(firecrawlBalanceBefore) && firecrawlBalanceBefore >= 0
        ? firecrawlBalanceBefore
        : null,
    deepseekCostBaseline: {
      balanceBefore:
        Number.isFinite(deepseekBalanceBefore) && deepseekBalanceBefore >= 0
          ? deepseekBalanceBefore
          : null,
      cumulativeSpendBefore:
        Number.isFinite(deepseekCumulativeSpendBefore) &&
        deepseekCumulativeSpendBefore >= 0
          ? deepseekCumulativeSpendBefore
          : null,
      dashboardTimezone: "UTC+0",
      dashboardDelayNote: "控制台提示数据可能延迟 5 分钟。",
    },
    executionRequested: execute,
    providerConfiguration: {
      llmModel: env.AGENT_FACTORY_LLM_MODEL || "",
      searchProvider: env.AGENT_FACTORY_SEARCH_PROVIDER || "",
      firecrawlEnabled: env.AGENT_FACTORY_FIRECRAWL_ENABLED === "true",
      firecrawlMapEnabled: env.AGENT_FACTORY_FIRECRAWL_MAP_ENABLED === "true",
      firecrawlCrawlFallbackEnabled:
        env.AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED === "true",
      llmApiKeyConfigured: Boolean(env.AGENT_FACTORY_LLM_API_KEY),
      searchApiKeyConfigured: Boolean(env.AGENT_FACTORY_SEARCH_API_KEY),
      firecrawlApiKeyConfigured: Boolean(
        env.AGENT_FACTORY_FIRECRAWL_API_KEY || env.FIRECRAWL_API_KEY,
      ),
    },
  };

  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const expectedPaidApiCapYuan = exploratoryMode
    ? 0
    : approvedPaidApiCoreCapYuan;
  if (approvedPaidApiCapYuan !== expectedPaidApiCapYuan) {
    throw new Error(
      `benchmark_paid_api_cap_mismatch: expected=${expectedPaidApiCapYuan} actual=${approvedPaidApiCapYuan}`,
    );
  }
  const expectedApprovedFirecrawlCredits =
    canaryV3Mode || exploratoryMode
      ? approvedFirecrawlCreditsPerCategory
      : approvedFirecrawlCoreCredits;
  if (approvedFirecrawlCredits !== expectedApprovedFirecrawlCredits) {
    throw new Error(
      `benchmark_firecrawl_credit_cap_mismatch: expected=${expectedApprovedFirecrawlCredits} actual=${approvedFirecrawlCredits}`,
    );
  }
  if (!Number.isFinite(firecrawlBalanceBefore) || firecrawlBalanceBefore < 0) {
    throw new Error("benchmark_v2_firecrawl_balance_before_required");
  }
  if (
    !exploratoryMode &&
    (!Number.isFinite(deepseekBalanceBefore) || deepseekBalanceBefore < 0)
  ) {
    throw new Error("benchmark_v2_deepseek_balance_before_required");
  }
  if (
    !exploratoryMode &&
    (!Number.isFinite(deepseekCumulativeSpendBefore) ||
      deepseekCumulativeSpendBefore < 0)
  ) {
    throw new Error("benchmark_v2_deepseek_cumulative_spend_before_required");
  }
  const aliyunFreePoolReady =
    env.AGENT_FACTORY_LLM_BASE_URL?.includes("aliyuncs.com") &&
    env.AGENT_FACTORY_LLM_MODEL === "kimi-k2.6" &&
    env.AGENT_FACTORY_ALIYUN_FREE_MODEL_ROUTING_ENABLED === "true" &&
    env.AGENT_FACTORY_ALIYUN_FREE_TIER_ONLY_CONFIRMED === "true";
  if (
    (exploratoryMode
      ? !aliyunFreePoolReady
      : env.AGENT_FACTORY_LLM_MODEL !== "deepseek-v4-flash") ||
    env.AGENT_FACTORY_SEARCH_PROVIDER !== "tavily" ||
    env.AGENT_FACTORY_FIRECRAWL_ENABLED !== "true" ||
    env.AGENT_FACTORY_FIRECRAWL_MAP_ENABLED !== "true" ||
    ((canaryV3Mode || exploratoryMode) &&
      env.AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED !== "true")
  ) {
    throw new Error("benchmark_v2_provider_configuration_drifted");
  }
  if (
    !env.AGENT_FACTORY_LLM_API_KEY ||
    !env.AGENT_FACTORY_SEARCH_API_KEY ||
    !(env.AGENT_FACTORY_FIRECRAWL_API_KEY || env.FIRECRAWL_API_KEY)
  ) {
    throw new Error("benchmark_v2_provider_credentials_missing");
  }

  const started = new Date();
  const runId = `${benchmarkVersion}-${category.id}-${timestampForPath(started)}`;
  const outputDir = join(
    "outputs",
    "industry-research-benchmarks",
    benchmarkVersion,
    runId,
  );
  const counters: RequestCounters = {
    publicTotal: 0,
    searchApi: 0,
    firecrawlMap: 0,
    firecrawlScrape: 0,
    firecrawlCrawl: 0,
    nativePublic: 0,
    llm: 0,
    llmModels: [],
    firecrawlReportedCredits: 0,
    firecrawlResponsesWithCredits: 0,
    llmUsage: [],
  };
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(
    () => deadline.abort(new Error("benchmark_v2_wall_time_exceeded")),
    fixedBudget.wallTimeMs,
  );
  const { publicFetcher, llmFetcher } = createCountedFetchers(
    counters,
    deadline.signal,
  );

  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "benchmark_run.json"), {
    ...plan,
    runId,
    outputDir,
    status: "running",
    startedAt: started.toISOString(),
    requestCounts: counters,
    firecrawlCreditAudit: {
      perCategoryCap: approvedFirecrawlCreditsPerCategory,
      coreTotalCap: approvedFirecrawlCoreCredits,
      balanceBefore: firecrawlBalanceBefore,
      balanceAfter: null,
      dashboardCreditDelta: null,
    },
    deepseekCostAudit: {
      coreCapYuan: exploratoryMode ? 0 : approvedPaidApiCoreCapYuan,
      balanceBefore: deepseekBalanceBefore,
      balanceAfter: null,
      cumulativeSpendBefore: deepseekCumulativeSpendBefore,
      cumulativeSpendAfter: null,
      dashboardSpendDeltaYuan: null,
      dashboardTimezone: "UTC+0",
      dashboardDelayNote: "控制台提示数据可能延迟 5 分钟。",
    },
    actualMonetaryCostYuan: null,
  });

  try {
    const input = createInput(category);
    const result = await runPublicDeepSeekIndustryResearchWorkflow(input, {
      env,
      fetcher: llmFetcher,
      publicFetcher,
      now: started.toISOString(),
    });
    if (deadline.signal.aborted) {
      throw new Error("benchmark_v2_wall_time_exceeded");
    }

    const finished = new Date();
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
    });

    await writeJson(join(outputDir, "input.json"), artifacts.input);
    await writeJson(
      join(outputDir, "raw_documents.json"),
      artifacts.raw_documents,
    );
    await writeJson(join(outputDir, "databases.json"), artifacts.databases);
    await writeJson(
      join(outputDir, "review_items.json"),
      artifacts.review_items,
    );
    await writeFile(
      join(outputDir, "report.md"),
      artifacts.reportMarkdown,
      "utf8",
    );
    await writeFile(
      join(outputDir, "reviewed_report.md"),
      artifacts.reviewedReportMarkdown,
      "utf8",
    );
    await writeJson(join(outputDir, "run_log.json"), artifacts.run_log);
    await writeJson(join(outputDir, "manifest.json"), artifacts.manifest);

    const benchmarkRun = {
      ...plan,
      runId,
      outputDir,
      status: "completed",
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      requestCounts: counters,
      firecrawlCreditAudit: {
        perCategoryCap: approvedFirecrawlCreditsPerCategory,
        coreTotalCap: approvedFirecrawlCoreCredits,
        balanceBefore: firecrawlBalanceBefore,
        balanceAfter: null,
        dashboardCreditDelta: null,
      },
      deepseekCostAudit: {
        coreCapYuan: exploratoryMode ? 0 : approvedPaidApiCoreCapYuan,
        balanceBefore: deepseekBalanceBefore,
        balanceAfter: null,
        cumulativeSpendBefore: deepseekCumulativeSpendBefore,
        cumulativeSpendAfter: null,
        dashboardSpendDeltaYuan: null,
        dashboardTimezone: "UTC+0",
        dashboardDelayNote: "控制台提示数据可能延迟 5 分钟。",
      },
      sourceMetrics: sourceMetrics(artifacts.raw_documents),
      reportMetrics: {
        structuredFindingCount: artifacts.review_items.items.length,
        autoApprovedFindingCount: artifacts.review_items.summary.approved,
        autoApprovedFindingRatio:
          artifacts.review_items.items.length > 0
            ? artifacts.review_items.summary.approved /
              artifacts.review_items.items.length
            : null,
        manualVerifiedFindingCount: null,
        manualVerifiedFindingRatio: null,
      },
      actualMonetaryCostYuan: null,
      costNote:
        "Firecrawl 只按 credits 审计，runner 记录响应 creditsUsed，运行后必须回 dashboard 填 balanceAfter/delta；人民币成本只用于其他付费 provider。",
    };
    await writeJson(join(outputDir, "benchmark_run.json"), benchmarkRun);
    console.log(JSON.stringify(benchmarkRun, null, 2));
  } catch (error) {
    const finished = new Date();
    const failedRun = {
      ...plan,
      runId,
      outputDir,
      status: "failed",
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      requestCounts: counters,
      firecrawlCreditAudit: {
        perCategoryCap: approvedFirecrawlCreditsPerCategory,
        coreTotalCap: approvedFirecrawlCoreCredits,
        balanceBefore: firecrawlBalanceBefore,
        balanceAfter: null,
        dashboardCreditDelta: null,
      },
      deepseekCostAudit: {
        coreCapYuan: exploratoryMode ? 0 : approvedPaidApiCoreCapYuan,
        balanceBefore: deepseekBalanceBefore,
        balanceAfter: null,
        cumulativeSpendBefore: deepseekCumulativeSpendBefore,
        cumulativeSpendAfter: null,
        dashboardSpendDeltaYuan: null,
        dashboardTimezone: "UTC+0",
        dashboardDelayNote: "控制台提示数据可能延迟 5 分钟。",
      },
      error: sanitizeError(error),
      actualMonetaryCostYuan: null,
    };
    await writeJson(join(outputDir, "benchmark_run.json"), failedRun);
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
  }
}

main().catch((error: unknown) => {
  console.error(sanitizeError(error));
  process.exit(1);
});
