import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  calculateG12MonetaryCostYuan,
  evaluateG12Benchmark,
  G12_BENCHMARK_CATEGORIES,
  G12_BENCHMARK_THRESHOLDS,
  G12_BENCHMARK_VERSION,
  G12_LIVE_BUDGET,
  type G12CategoryBenchmarkInput,
  type G12LlmUsage,
  g12LiveBudgetViolations,
  scoreG12BenchmarkCategory,
} from "../packages/industry-research/src/g12-benchmark.ts";
import {
  createIndustryResearchDeliveryArtifacts,
  evaluateEvidenceRoleGate,
  hasUnsupportedQuantifiedClaim,
  highRiskClaimHasDirectQuote,
  type OpenAICompatibleFetch,
  type PublicCrawlerFetch,
  runPublicDeepSeekIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";
import type {
  ResearchReviewItem,
  ResearchWorkflowInput,
  ResearchWorkflowResult,
} from "../packages/industry-research/src/types.ts";

const benchmarkId = "industry-os-g12-benchmark-v1";
const maximumTavilyRequestsPerCategory = 2;
const firecrawlMapCreditReservation = 20;
const firecrawlOtherRequestCreditReservation = 5;
const deepPageSourceTypes = new Set([
  "product_page",
  "collection_page",
  "blog",
  "rss",
  "content_api",
]);

type RequestCounters = {
  publicTotal: number;
  tavilySearch: number;
  firecrawlRequests: number;
  firecrawlReservedCredits: number;
  firecrawlReportedCredits: number;
  nativePublic: number;
  llm: number;
  llmModels: string[];
  llmUsage: G12LlmUsage[];
  llmCostAudits: Array<{
    model: string;
    maximumReservedCostYuan: number;
    usage: G12LlmUsage | null;
  }>;
};

type GlobalUsage = RequestCounters;

function emptyCounters(): RequestCounters {
  return {
    publicTotal: 0,
    tavilySearch: 0,
    firecrawlRequests: 0,
    firecrawlReservedCredits: 0,
    firecrawlReportedCredits: 0,
    nativePublic: 0,
    llm: 0,
    llmModels: [],
    llmUsage: [],
    llmCostAudits: [],
  };
}

function loadLocalEnv() {
  const path = ".env.local";
  try {
    return readFileSync(path, "utf8")
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

function benchmarkEnv() {
  const env = { ...loadLocalEnv(), ...process.env };
  return {
    ...env,
    AGENT_FACTORY_ALIYUN_FREE_MODEL_ROUTING_ENABLED: "false",
    AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_QUERIES: "2",
    AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_RESULTS_PER_QUERY: "4",
    AGENT_FACTORY_PUBLIC_WEB_MAX_DISCOVERED_TARGETS: "10",
    AGENT_FACTORY_PUBLIC_WEB_MAX_PROBE_URLS: "8",
    AGENT_FACTORY_PUBLIC_WEB_MAX_SITEMAP_URLS: "4",
    AGENT_FACTORY_PUBLIC_WEB_MAX_CRAWL_TARGETS: "8",
    AGENT_FACTORY_PUBLIC_WEB_REQUEST_TIMEOUT_MS: "8000",
    AGENT_FACTORY_PUBLIC_WEB_CRAWL_PER_HOST_DELAY_MS: "1000",
    AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
    AGENT_FACTORY_FIRECRAWL_MAP_MAX_SITES: "1",
    AGENT_FACTORY_FIRECRAWL_MAP_MAX_LINKS_PER_SITE: "20",
    AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED: "false",
    AGENT_FACTORY_FIRECRAWL_TIMEOUT_MS: "12000",
    AGENT_FACTORY_FIRECRAWL_TARGET_KINDS: "homepage,collection,product,blog",
    AGENT_FACTORY_SOURCE_REGISTRY_JSON: "",
    AGENT_FACTORY_FIXED_SOURCE_URLS: "",
    AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "false",
    AGENT_FACTORY_YOUTUBE_API_KEY: "",
    AGENT_FACTORY_REDDIT_ACCESS_TOKEN: "",
  } satisfies Record<string, string | undefined>;
}

function assertProviderConfiguration(env: Record<string, string | undefined>) {
  let hostname = "";
  try {
    hostname = new URL(env.AGENT_FACTORY_LLM_BASE_URL ?? "").hostname;
  } catch {
    hostname = "";
  }
  if (
    env.AGENT_FACTORY_LLM_MODEL !== "kimi-k2.6" ||
    !hostname.endsWith("maas.aliyuncs.com") ||
    env.AGENT_FACTORY_SEARCH_PROVIDER !== "tavily" ||
    env.AGENT_FACTORY_FIRECRAWL_ENABLED !== "true" ||
    !env.AGENT_FACTORY_LLM_API_KEY ||
    !env.AGENT_FACTORY_SEARCH_API_KEY ||
    !(env.AGENT_FACTORY_FIRECRAWL_API_KEY || env.FIRECRAWL_API_KEY)
  ) {
    throw new Error("g12_provider_configuration_drifted_or_missing");
  }
}

function createInput(category: (typeof G12_BENCHMARK_CATEGORIES)[number]) {
  return {
    projectName: `${category.label} G12 统一 Benchmark`,
    industry: category.label,
    category: category.label,
    market: "中国大陆线上电商 / DTC",
    researchGoal: "找到证据完整、可追溯且可行动的产品与内容机会",
    templateId: "ecommerce_competitor_research",
    urls: [],
    csvText: "",
    manualText: "",
  } satisfies ResearchWorkflowInput;
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function combinedSignal(...signals: Array<AbortSignal | null | undefined>) {
  const active = signals.filter(Boolean) as AbortSignal[];
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  const controller = new AbortController();
  for (const signal of active) {
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

function publicRequestKind(urlValue: string) {
  try {
    const url = new URL(urlValue);
    if (url.hostname.includes("tavily")) return "tavily" as const;
    if (url.hostname.includes("firecrawl")) {
      return /\/map\/?$/i.test(url.pathname)
        ? ("firecrawl_map" as const)
        : ("firecrawl_other" as const);
    }
  } catch {
    return "native" as const;
  }
  return "native" as const;
}

function currentCost(global: GlobalUsage) {
  const pricedCost = calculateG12MonetaryCostYuan({
    llmUsage: global.llmCostAudits
      .map((audit) => audit.usage)
      .filter((usage): usage is G12LlmUsage => usage !== null),
    tavilySearchRequests: global.tavilySearch,
  });
  const missingUsageReserve = global.llmCostAudits.reduce(
    (total, audit) => total + (audit.usage ? 0 : audit.maximumReservedCostYuan),
    0,
  );
  return Number((pricedCost + missingUsageReserve).toFixed(6));
}

function assertGlobalBudget(global: GlobalUsage) {
  const violations = g12LiveBudgetViolations({
    monetaryCostYuan: currentCost(global),
    firecrawlCredits: global.firecrawlReservedCredits,
    publicRequests: global.publicTotal,
    llmRequests: global.llm,
    tavilySearchRequests: global.tavilySearch,
  });
  if (violations.length > 0) {
    throw new Error(`g12_live_budget_violation:${violations.join(",")}`);
  }
}

function reservePublicRequest(
  category: RequestCounters,
  global: GlobalUsage,
  kind: ReturnType<typeof publicRequestKind>,
) {
  if (
    category.publicTotal >=
      G12_BENCHMARK_THRESHOLDS.maximumPublicRequestsPerCategory ||
    global.publicTotal >= G12_LIVE_BUDGET.maximumPublicRequests
  ) {
    throw new Error("g12_public_request_cap_reached");
  }
  if (
    kind === "tavily" &&
    (category.tavilySearch >= maximumTavilyRequestsPerCategory ||
      global.tavilySearch >= G12_LIVE_BUDGET.maximumTavilySearchRequests)
  ) {
    throw new Error("g12_tavily_request_cap_reached");
  }
  const firecrawlReservation =
    kind === "firecrawl_map"
      ? firecrawlMapCreditReservation
      : kind === "firecrawl_other"
        ? firecrawlOtherRequestCreditReservation
        : 0;
  if (
    category.firecrawlReservedCredits + firecrawlReservation >
      G12_BENCHMARK_THRESHOLDS.maximumFirecrawlCreditsPerCategory ||
    global.firecrawlReservedCredits + firecrawlReservation >
      G12_LIVE_BUDGET.maximumFirecrawlCredits
  ) {
    throw new Error("g12_firecrawl_credit_cap_reached");
  }

  category.publicTotal += 1;
  global.publicTotal += 1;
  if (kind === "tavily") {
    category.tavilySearch += 1;
    global.tavilySearch += 1;
  } else if (kind === "native") {
    category.nativePublic += 1;
    global.nativePublic += 1;
  } else {
    category.firecrawlRequests += 1;
    global.firecrawlRequests += 1;
    category.firecrawlReservedCredits += firecrawlReservation;
    global.firecrawlReservedCredits += firecrawlReservation;
  }
  assertGlobalBudget(global);
}

function captureReportedFirecrawlCredits(
  category: RequestCounters,
  global: GlobalUsage,
  payload: unknown,
) {
  if (!payload || typeof payload !== "object") return;
  const credits = (payload as { creditsUsed?: unknown }).creditsUsed;
  if (typeof credits !== "number" || credits < 0) return;
  category.firecrawlReportedCredits += credits;
  global.firecrawlReportedCredits += credits;
}

function promptCharacters(body: Record<string, unknown>) {
  return JSON.stringify(body.messages ?? body.input ?? "").length;
}

function maximumNextLlmCost(body: Record<string, unknown>) {
  const conservativePromptTokens = promptCharacters(body) * 2;
  const maximumOutputTokens =
    typeof body.max_tokens === "number" ? body.max_tokens : 6000;
  return (
    (conservativePromptTokens / 1_000_000) *
      G12_LIVE_BUDGET.kimiK26InputYuanPerMillionTokens +
    (maximumOutputTokens / 1_000_000) *
      G12_LIVE_BUDGET.kimiK26OutputYuanPerMillionTokens
  );
}

function createFetchers(
  category: RequestCounters,
  global: GlobalUsage,
  deadlineSignal: AbortSignal,
) {
  const publicFetcher: PublicCrawlerFetch = async (input, init) => {
    const kind = publicRequestKind(requestUrl(input));
    reservePublicRequest(category, global, kind);
    const response = await fetch(input, {
      ...init,
      signal: combinedSignal(init?.signal, deadlineSignal),
    });
    if (kind === "firecrawl_map" || kind === "firecrawl_other") {
      try {
        captureReportedFirecrawlCredits(
          category,
          global,
          await response.clone().json(),
        );
      } catch {
        // The conservative reservation remains the audited upper bound.
      }
    }
    return response;
  };

  const llmFetcher: OpenAICompatibleFetch = async (input, init) => {
    if (
      category.llm >= G12_BENCHMARK_THRESHOLDS.maximumLlmRequestsPerCategory ||
      global.llm >= G12_LIVE_BUDGET.maximumLlmRequests
    ) {
      throw new Error("g12_llm_request_cap_reached");
    }
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    const model = typeof body.model === "string" ? body.model : "";
    if (model !== "kimi-k2.6") {
      throw new Error(`g12_llm_model_drifted:${model || "missing"}`);
    }
    const maximumReservedCostYuan = maximumNextLlmCost(body);
    if (
      currentCost(global) + maximumReservedCostYuan >
      G12_LIVE_BUDGET.maximumMonetaryCostYuan
    ) {
      throw new Error("g12_monetary_cost_preflight_cap_reached");
    }

    category.llm += 1;
    global.llm += 1;
    category.llmModels.push(model);
    global.llmModels.push(model);
    const categoryAudit = {
      model,
      maximumReservedCostYuan,
      usage: null as G12LlmUsage | null,
    };
    const globalAudit = {
      model,
      maximumReservedCostYuan,
      usage: null as G12LlmUsage | null,
    };
    category.llmCostAudits.push(categoryAudit);
    global.llmCostAudits.push(globalAudit);
    const response = await fetch(input, {
      ...init,
      signal: combinedSignal(init?.signal, deadlineSignal),
    });
    let payload: unknown;
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
    const usage =
      payload && typeof payload === "object"
        ? (payload as { usage?: Record<string, unknown> }).usage
        : undefined;
    const promptTokens = usage?.prompt_tokens;
    const completionTokens = usage?.completion_tokens;
    if (
      response.ok &&
      (typeof promptTokens !== "number" || typeof completionTokens !== "number")
    ) {
      throw new Error("g12_llm_usage_missing_cost_unprovable");
    }
    if (
      typeof promptTokens === "number" &&
      typeof completionTokens === "number"
    ) {
      const item = { promptTokens, completionTokens };
      category.llmUsage.push(item);
      global.llmUsage.push(item);
      categoryAudit.usage = item;
      globalAudit.usage = item;
    }
    assertGlobalBudget(global);
    return response;
  };

  return { publicFetcher, llmFetcher };
}

function evidenceIdsForReviewItem(
  result: ResearchWorkflowResult,
  item: ResearchReviewItem,
) {
  const collections = {
    competitor: result.competitors,
    product_signal: result.product_signals,
    pain_point: result.pain_points,
    content_signal: result.content_signals,
    opportunity: result.opportunities,
  } as const;
  const target = collections[item.targetType].find(
    (candidate) => candidate.id === item.targetId,
  );
  return target?.evidenceIds ?? [];
}

function claimTextsForReviewItem(
  result: ResearchWorkflowResult,
  item: ResearchReviewItem,
) {
  switch (item.targetType) {
    case "competitor": {
      const target = result.competitors.find(
        (item) => item.id === item.targetId,
      );
      return target
        ? [
            target.name,
            target.positioning,
            ...target.websiteStructure,
            ...target.collectionSignals,
          ]
        : [];
    }
    case "product_signal": {
      const target = result.product_signals.find(
        (item) => item.id === item.targetId,
      );
      return target ? [target.category, target.signal, ...target.tags] : [];
    }
    case "pain_point": {
      const target = result.pain_points.find(
        (item) => item.id === item.targetId,
      );
      return target ? [target.theme, target.userNeed] : [];
    }
    case "content_signal": {
      const target = result.content_signals.find(
        (item) => item.id === item.targetId,
      );
      return target ? [target.topic, target.whyItWorks] : [];
    }
    case "opportunity": {
      const target = result.opportunities.find(
        (item) => item.id === item.targetId,
      );
      return target ? [target.title, target.summary, target.reviewNote] : [];
    }
  }
}

function auditFindings(result: ResearchWorkflowResult) {
  return result.reviewItems.map((item) => {
    const evidenceIds = [...new Set(evidenceIdsForReviewItem(result, item))];
    const evidence = evidenceIds
      .map((id) => result.evidence.find((candidate) => candidate.id === id))
      .filter((candidate) => Boolean(candidate));
    const accepted = evidence.filter((candidate) => {
      if (!candidate) return false;
      const rawDocument = result.raw_documents.find(
        (document) => document.id === candidate.rawDocumentId,
      );
      const source = result.research_sources.find(
        (item) => item.id === candidate.sourceId,
      );
      const roleGate = evaluateEvidenceRoleGate({
        source,
        rawDocument,
        evidence: candidate,
      });
      return (
        Boolean(candidate.rawDocumentId) &&
        Boolean(rawDocument?.url) &&
        rawDocument?.sourceQuality.acceptedForReport === true &&
        candidate.validation?.quoteMatched === true &&
        candidate.validation.sourceAccepted === true &&
        candidate.validation.claimSupportComplete === true &&
        roleGate.authorized
      );
    });
    const quotes = accepted.map((candidate) => candidate?.quote ?? "");
    const highRiskClaims = claimTextsForReviewItem(result, item).filter(
      hasUnsupportedQuantifiedClaim,
    );
    const highRiskClaimsSupported = highRiskClaims.every((claim) =>
      highRiskClaimHasDirectQuote(claim, quotes),
    );
    const fullySupported =
      item.status === "approved" &&
      evidenceIds.length > 0 &&
      accepted.length === evidenceIds.length &&
      highRiskClaimsSupported;
    return {
      reviewItemId: item.id,
      targetType: item.targetType,
      targetId: item.targetId,
      evidenceIds,
      fullySupported,
      highRiskClaimCount: highRiskClaims.length,
      highRiskClaimsSupported,
    };
  });
}

function median(values: number[]) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 1) + (sorted[middle] ?? 1)) / 2
    : (sorted[middle] ?? 1);
}

function categoryMetrics(
  categoryId: string,
  result: ResearchWorkflowResult,
  counters: RequestCounters,
  durationMs: number,
  categoryCostYuan: number | null,
): G12CategoryBenchmarkInput & {
  findingAudit: ReturnType<typeof auditFindings>;
} {
  const acceptedDocuments = result.raw_documents.filter(
    (document) => document.sourceQuality.acceptedForReport,
  );
  const trustedDomains = new Set(
    acceptedDocuments.map((document) => {
      try {
        return new URL(document.url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    }),
  );
  trustedDomains.delete("");
  const findingAudit = auditFindings(result);
  const fullySupported = findingAudit.filter(
    (finding) => finding.fullySupported,
  );
  const noiseRatios = acceptedDocuments.map(
    (document) => document.cleaningAudit?.residualNoiseRatio ?? 1,
  );
  return {
    categoryId,
    phase: "pre_kill",
    status: "completed",
    trustedDocumentCount: acceptedDocuments.length,
    trustedDomainCount: trustedDomains.size,
    deepDocumentCount: acceptedDocuments.filter((document) =>
      deepPageSourceTypes.has(document.sourceQuality.sourceType),
    ).length,
    verifiableFindingRatio:
      findingAudit.length > 0 ? fullySupported.length / findingAudit.length : 0,
    medianResidualNoiseRatio: median(noiseRatios),
    maximumResidualNoiseRatio:
      noiseRatios.length > 0 ? Math.max(...noiseRatios) : 1,
    actionableFindingCount: fullySupported.filter(
      (finding) => finding.targetType === "opportunity",
    ).length,
    durationMs,
    publicRequestCount: counters.publicTotal,
    llmRequestCount: counters.llm,
    firecrawlCredits: counters.firecrawlReservedCredits,
    actualMonetaryCostYuan: categoryCostYuan,
    approvedMonetaryCostCapYuan: G12_LIVE_BUDGET.maximumMonetaryCostYuan,
    findingAudit,
  };
}

function failedCategoryMetrics(
  categoryId: string,
  counters: RequestCounters,
  durationMs: number,
  categoryCostYuan: number | null,
): G12CategoryBenchmarkInput {
  return {
    categoryId,
    phase: "pre_kill",
    status: "failed",
    trustedDocumentCount: 0,
    trustedDomainCount: 0,
    deepDocumentCount: 0,
    verifiableFindingRatio: 0,
    medianResidualNoiseRatio: 1,
    maximumResidualNoiseRatio: 1,
    actionableFindingCount: 0,
    durationMs,
    publicRequestCount: counters.publicTotal,
    llmRequestCount: counters.llm,
    firecrawlCredits: counters.firecrawlReservedCredits,
    actualMonetaryCostYuan: categoryCostYuan,
    approvedMonetaryCostCapYuan: G12_LIVE_BUDGET.maximumMonetaryCostYuan,
  };
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(process.cwd(), "[workspace]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/api[_ -]?key[:=]\s*[^\s]+/gi, "api_key=[redacted]");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function scorecardMarkdown(input: {
  runId: string;
  evaluation: ReturnType<typeof evaluateG12Benchmark>;
  global: GlobalUsage;
}) {
  const lines = [
    "# Industry OS G12 Live Benchmark",
    "",
    `- Run: ${input.runId}`,
    `- 证据流水线结论: ${input.evaluation.decisionCandidate}`,
    `- 决策范围: ${input.evaluation.decisionScope}`,
    `- 商业化判断: ${input.evaluation.commercializationAssessment.status}`,
    `- Benchmark early-stop: ${input.evaluation.killRule.triggered ? `触发于 ${input.evaluation.killRule.triggeredAfterCategoryId}` : "未触发"}`,
    `- 请求: public=${input.global.publicTotal}/160, LLM=${input.global.llm}/15, Tavily=${input.global.tavilySearch}/10`,
    `- Firecrawl: 保守预留 ${input.global.firecrawlReservedCredits}/250 credits，响应报告 ${input.global.firecrawlReportedCredits} credits`,
    `- 审计估算增量费用: ¥${currentCost(input.global).toFixed(4)}/¥10`,
    "",
    "| 品类 | 分数 | PASS | 失败分类 |",
    "|---|---:|---|---|",
    ...input.evaluation.categoryScores.map(
      (score) =>
        `| ${score.categoryId} | ${score.score.toFixed(2)} | ${score.passed ? "PASS" : "FAIL"} | ${score.failureClasses.join(", ") || "-"} |`,
    ),
    "",
    "> G11 已跳过，C4 真实使用证据缺失；本 benchmark 只能形成候选结论，不能单独标记 C5。",
    "",
  ];
  return lines.join("\n");
}

function isFatalStop(error: unknown) {
  const message = sanitizedError(error);
  return /budget|cap_reached|provider_configuration|model_drifted|usage_missing/.test(
    message,
  );
}

async function runCategory(input: {
  category: (typeof G12_BENCHMARK_CATEGORIES)[number];
  outputDir: string;
  env: Record<string, string | undefined>;
  global: GlobalUsage;
}) {
  const started = new Date();
  const counters = emptyCounters();
  const costBefore = currentCost(input.global);
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new Error("g12_category_wall_time_exceeded")),
    G12_BENCHMARK_THRESHOLDS.maximumDurationMs,
  );
  const { publicFetcher, llmFetcher } = createFetchers(
    counters,
    input.global,
    deadline.signal,
  );
  const categoryDir = join(input.outputDir, input.category.id);
  await mkdir(categoryDir, { recursive: true });
  try {
    const workflowInput = createInput(input.category);
    const result = await runPublicDeepSeekIndustryResearchWorkflow(
      workflowInput,
      {
        env: input.env,
        fetcher: llmFetcher,
        publicFetcher,
        now: started.toISOString(),
      },
    );
    if (deadline.signal.aborted) {
      throw new Error("g12_category_wall_time_exceeded");
    }
    const finished = new Date();
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input: workflowInput,
      result,
      runId: `${benchmarkId}-${input.category.id}-${timestampForPath(started)}`,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
    });
    const categoryCostYuan =
      counters.llm === counters.llmUsage.length
        ? Number((currentCost(input.global) - costBefore).toFixed(6))
        : null;
    const metrics = categoryMetrics(
      input.category.id,
      result,
      counters,
      finished.getTime() - started.getTime(),
      categoryCostYuan,
    );
    const score = scoreG12BenchmarkCategory(metrics);
    await Promise.all([
      writeJson(join(categoryDir, "input.json"), artifacts.input),
      writeJson(
        join(categoryDir, "raw_documents.json"),
        artifacts.raw_documents,
      ),
      writeJson(join(categoryDir, "databases.json"), artifacts.databases),
      writeJson(join(categoryDir, "review_items.json"), artifacts.review_items),
      writeFile(
        join(categoryDir, "report.md"),
        artifacts.reportMarkdown,
        "utf8",
      ),
      writeFile(
        join(categoryDir, "reviewed_report.md"),
        artifacts.reviewedReportMarkdown,
        "utf8",
      ),
      writeJson(join(categoryDir, "run_log.json"), artifacts.run_log),
      writeJson(join(categoryDir, "manifest.json"), artifacts.manifest),
      writeJson(join(categoryDir, "benchmark_result.json"), {
        category: input.category,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        counters,
        metrics,
        score,
      }),
    ]);
    return { metrics, score, fatal: false, error: null };
  } catch (error) {
    const finished = new Date();
    const categoryCostYuan =
      counters.llm === counters.llmUsage.length
        ? Number((currentCost(input.global) - costBefore).toFixed(6))
        : null;
    const metrics = failedCategoryMetrics(
      input.category.id,
      counters,
      finished.getTime() - started.getTime(),
      categoryCostYuan,
    );
    const score = scoreG12BenchmarkCategory(metrics);
    const errorMessage = sanitizedError(error);
    await writeJson(join(categoryDir, "benchmark_result.json"), {
      category: input.category,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      counters,
      metrics,
      score,
      error: errorMessage,
    });
    return { metrics, score, fatal: isFatalStop(error), error: errorMessage };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!process.argv.includes("--execute")) {
    throw new Error("g12_live_runner_requires_explicit_execute");
  }
  const env = benchmarkEnv();
  assertProviderConfiguration(env);
  const started = new Date();
  const runId = `${benchmarkId}-${timestampForPath(started)}`;
  const outputDir = join(
    "outputs",
    "industry-research-benchmarks",
    benchmarkId,
    runId,
  );
  const global = emptyCounters();
  const results: G12CategoryBenchmarkInput[] = [];
  const categoryRuns: Array<{
    categoryId: string;
    score: ReturnType<typeof scoreG12BenchmarkCategory>;
    error: string | null;
  }> = [];
  let fatalStopReason: string | null = null;
  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "preregistered_plan.json"), {
    schemaVersion: G12_BENCHMARK_VERSION,
    runId,
    categories: G12_BENCHMARK_CATEGORIES,
    thresholds: G12_BENCHMARK_THRESHOLDS,
    liveBudget: G12_LIVE_BUDGET,
    provider: {
      llm: "aliyun_model_studio",
      model: "kimi-k2.6",
      search: "tavily",
      crawler: "firecrawl_and_native_public_web",
    },
    startedAt: started.toISOString(),
  });

  for (const category of G12_BENCHMARK_CATEGORIES) {
    const run = await runCategory({ category, outputDir, env, global });
    results.push(run.metrics);
    categoryRuns.push({
      categoryId: category.id,
      score: run.score,
      error: run.error,
    });
    const evaluation = evaluateG12Benchmark({
      results,
      realUseEvidenceVerified: false,
    });
    await writeJson(join(outputDir, "benchmark_summary.json"), {
      runId,
      status: "running",
      global,
      auditedEstimatedMonetaryCostYuan: currentCost(global),
      categoryRuns,
      evaluation,
    });
    if (run.fatal) {
      fatalStopReason = run.error;
      break;
    }
    if (evaluation.killRule.triggered) break;
  }

  const finished = new Date();
  const evaluation = evaluateG12Benchmark({
    results,
    realUseEvidenceVerified: false,
  });
  const summary = {
    runId,
    status: fatalStopReason ? "stopped_on_safety_gate" : "completed_or_killed",
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    outputDir,
    global,
    auditedEstimatedMonetaryCostYuan: currentCost(global),
    budgetViolations: g12LiveBudgetViolations({
      monetaryCostYuan: currentCost(global),
      firecrawlCredits: global.firecrawlReservedCredits,
      publicRequests: global.publicTotal,
      llmRequests: global.llm,
      tavilySearchRequests: global.tavilySearch,
    }),
    fatalStopReason,
    categoryRuns,
    evaluation,
  };
  await Promise.all([
    writeJson(join(outputDir, "benchmark_summary.json"), summary),
    writeFile(
      join(outputDir, "scorecard.md"),
      scorecardMarkdown({ runId, evaluation, global }),
      "utf8",
    ),
  ]);
  console.log(JSON.stringify(summary, null, 2));
  if (fatalStopReason) process.exitCode = 2;
}

main().catch((error) => {
  console.error(sanitizedError(error));
  process.exitCode = 1;
});
