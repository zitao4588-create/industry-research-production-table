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

const benchmarkVersion = "evidence-benchmark-v1";
const expectedHead = "db1a97c212255cab73b924a995959cf5105af4be";
const expectedWorktreeDiffSha256 =
  "e7e4e70156a040285629a39a4c5c512e7de8b7fb81ae529b77b215c3ae3e1061";
const coreApprovedCapYuan = 4;
const totalApprovedCapYuan = 8;

const fixedBudget = {
  maxSearchQueries: 2,
  maxSearchResultsPerQuery: 4,
  maxDiscoveredTargets: 10,
  maxProbeUrls: 8,
  maxSitemapUrls: 4,
  requestTimeoutMs: 8_000,
  maxCrawlTargets: 8,
  crawlPerHostDelayMs: 1_000,
  firecrawlTimeoutMs: 12_000,
  wallTimeMs: 300_000,
  maxSearchApiRequests: 2,
  maxFirecrawlRequests: 8,
  maxLlmRequests: 3,
  maxPublicRequests: 30,
} as const;

type BenchmarkCategory = {
  id: string;
  label: string;
  group: "core" | "extension";
  order: number;
};

const categories: BenchmarkCategory[] = [
  {
    id: "pet-probiotics",
    label: "宠物肠胃益生菌",
    group: "core",
    order: 1,
  },
  { id: "dishwasher", label: "洗碗机", group: "core", order: 2 },
  {
    id: "japan-niche-skincare",
    label: "日本小众护肤品牌",
    group: "core",
    order: 3,
  },
  { id: "soy-candle", label: "大豆蜡香薰", group: "extension", order: 4 },
  {
    id: "electrolyte-sparkling-water",
    label: "电解质气泡水",
    group: "extension",
    order: 5,
  },
];

type RequestCounters = {
  publicTotal: number;
  searchApi: number;
  firecrawl: number;
  nativePublic: number;
  llm: number;
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

function benchmarkEnv() {
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
    AGENT_FACTORY_PUBLIC_WEB_REQUEST_TIMEOUT_MS: String(
      fixedBudget.requestTimeoutMs,
    ),
    AGENT_FACTORY_PUBLIC_WEB_MAX_CRAWL_TARGETS: String(
      fixedBudget.maxCrawlTargets,
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

function gitBaseline() {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const diff = execFileSync("git", ["diff", "--binary"]);
  const diffSha256 = createHash("sha256").update(diff).digest("hex");

  return { head, diffSha256 };
}

function verifyBaseline() {
  const baseline = gitBaseline();
  if (baseline.head !== expectedHead) {
    throw new Error(
      `benchmark_baseline_head_changed: expected=${expectedHead} actual=${baseline.head}`,
    );
  }
  if (baseline.diffSha256 !== expectedWorktreeDiffSha256) {
    throw new Error(
      `benchmark_baseline_diff_changed: expected=${expectedWorktreeDiffSha256} actual=${baseline.diffSha256}`,
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
    if (url.hostname.includes("firecrawl")) return "firecrawl" as const;
  } catch {
    // Invalid URLs are counted as native public requests and handled by fetch.
  }
  return "nativePublic" as const;
}

function captureUsage(counters: RequestCounters, payload: unknown) {
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

function createCountedFetchers(
  counters: RequestCounters,
  deadlineSignal: AbortSignal,
) {
  const publicFetcher: PublicCrawlerFetch = async (input, init) => {
    const url = requestUrl(input);
    const kind = classifyPublicRequest(url);
    counters.publicTotal += 1;
    counters[kind] += 1;

    if (counters.publicTotal > fixedBudget.maxPublicRequests) {
      throw new Error("benchmark_public_request_cap_exceeded");
    }
    if (counters.searchApi > fixedBudget.maxSearchApiRequests) {
      throw new Error("benchmark_search_api_request_cap_exceeded");
    }
    if (counters.firecrawl > fixedBudget.maxFirecrawlRequests) {
      throw new Error("benchmark_firecrawl_request_cap_exceeded");
    }

    return fetch(input, {
      ...init,
      signal: combinedSignal(init?.signal, deadlineSignal),
    });
  };

  const llmFetcher: OpenAICompatibleFetch = async (input, init) => {
    counters.llm += 1;
    if (counters.llm > fixedBudget.maxLlmRequests) {
      throw new Error("benchmark_llm_request_cap_exceeded");
    }

    const response = await fetch(input, {
      ...init,
      signal: combinedSignal(init?.signal, deadlineSignal),
    });
    try {
      captureUsage(counters, await response.clone().json());
    } catch {
      // Some OpenAI-compatible gateways return non-JSON/SSE text without usage.
    }
    return response;
  };

  return { publicFetcher, llmFetcher };
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceMetrics(
  rawDocuments: Array<{
    id: string;
    title: string;
    url: string;
    extractedText: string;
    sourceQuality: {
      sourceType: string;
      sourceRelevance: string;
      sourceConfidence: string;
      acceptedForReport: boolean;
    };
  }>,
  evidence: Array<{ rawDocumentId?: string }>,
) {
  const acceptedDocuments = rawDocuments.filter(
    (document) => document.sourceQuality.acceptedForReport,
  );
  const evidenceByRawDocument = new Map<string, number>();
  for (const item of evidence) {
    if (!item.rawDocumentId) continue;
    evidenceByRawDocument.set(
      item.rawDocumentId,
      (evidenceByRawDocument.get(item.rawDocumentId) ?? 0) + 1,
    );
  }
  const evidenceCounts = [...evidenceByRawDocument.entries()]
    .map(([rawDocumentId, count]) => ({ rawDocumentId, count }))
    .sort((left, right) => right.count - left.count);
  const totalEvidence = evidence.length;

  return {
    ruleAcceptedDocumentCount: acceptedDocuments.length,
    ruleAcceptedUniqueDomainCount: new Set(
      acceptedDocuments.map((document) => new URL(document.url).hostname),
    ).size,
    acceptedDocuments: acceptedDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      url: document.url,
      sourceType: document.sourceQuality.sourceType,
      relevance: document.sourceQuality.sourceRelevance,
      confidence: document.sourceQuality.sourceConfidence,
      textLength: document.extractedText.length,
    })),
    evidenceCounts,
    topDocumentEvidenceShare:
      totalEvidence > 0
        ? (evidenceCounts[0]?.count ?? 0) / totalEvidence
        : null,
    manualTrustedDocumentCount: null,
    manualTrustedDomainCount: null,
    manualNoiseAudit: "pending",
  };
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
      `unknown_benchmark_category: use one of ${categories.map((item) => item.id).join(", ")}`,
    );
  }

  const execute = process.argv.includes("--execute");
  const approvedCapYuan = Number(argumentValue("approved-cap-yuan"));
  const baseline = verifyBaseline();
  const env = benchmarkEnv();
  const plan = {
    benchmarkVersion,
    category,
    baseline,
    input: createInput(category),
    fixedBudget,
    approvedCaps: {
      coreYuan: coreApprovedCapYuan,
      totalYuan: totalApprovedCapYuan,
    },
    providerConfiguration: {
      llmModel: env.AGENT_FACTORY_LLM_MODEL || "",
      searchProvider: env.AGENT_FACTORY_SEARCH_PROVIDER || "",
      firecrawlEnabled: env.AGENT_FACTORY_FIRECRAWL_ENABLED === "true",
      llmApiKeyConfigured: Boolean(env.AGENT_FACTORY_LLM_API_KEY),
      searchApiKeyConfigured: Boolean(env.AGENT_FACTORY_SEARCH_API_KEY),
      firecrawlApiKeyConfigured: Boolean(
        env.AGENT_FACTORY_FIRECRAWL_API_KEY || env.FIRECRAWL_API_KEY,
      ),
    },
    executionRequested: execute,
  };

  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (category.group !== "core") {
    throw new Error(
      "extension_categories_require_a_separate_user_confirmation",
    );
  }
  if (approvedCapYuan !== coreApprovedCapYuan) {
    throw new Error(
      `approved_cap_mismatch: expected=${coreApprovedCapYuan} actual=${approvedCapYuan}`,
    );
  }
  if (
    env.AGENT_FACTORY_LLM_MODEL !== "deepseek-v4-flash" ||
    env.AGENT_FACTORY_SEARCH_PROVIDER !== "tavily" ||
    env.AGENT_FACTORY_FIRECRAWL_ENABLED !== "true"
  ) {
    throw new Error("benchmark_provider_configuration_drifted");
  }
  if (
    !env.AGENT_FACTORY_LLM_API_KEY ||
    !env.AGENT_FACTORY_SEARCH_API_KEY ||
    !(env.AGENT_FACTORY_FIRECRAWL_API_KEY || env.FIRECRAWL_API_KEY)
  ) {
    throw new Error("benchmark_provider_credentials_missing");
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
    firecrawl: 0,
    nativePublic: 0,
    llm: 0,
    llmUsage: [],
  };
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(
    () => deadline.abort(new Error("benchmark_wall_time_exceeded")),
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
      throw new Error("benchmark_wall_time_exceeded");
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
      sourceMetrics: sourceMetrics(
        artifacts.raw_documents,
        artifacts.databases.evidence,
      ),
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
        "代码只记录请求数和 provider 返回的 usage；实际人民币成本需在 provider dashboard 核对。",
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
