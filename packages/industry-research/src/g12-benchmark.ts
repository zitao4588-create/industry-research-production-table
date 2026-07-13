export const G12_BENCHMARK_VERSION = "industry_os_g12_benchmark.v1";

export const G12_FORBIDDEN_CATEGORY_IDS = ["skincare-broad-negative"] as const;

export const G12_BENCHMARK_CATEGORIES = [
  { id: "pet-probiotics", label: "宠物肠胃益生菌", order: 1 },
  { id: "dishwasher", label: "洗碗机", order: 2 },
  { id: "japan-niche-skincare", label: "日本小众护肤品牌", order: 3 },
  { id: "mens-electric-shaver", label: "男士电动剃须刀", order: 4 },
  { id: "cat-water-fountain", label: "猫咪自动饮水机", order: 5 },
] as const;

export const G12_BENCHMARK_THRESHOLDS = {
  minimumPassingCategories: 3,
  minimumTrustedDocuments: 3,
  minimumTrustedDomains: 2,
  minimumDeepDocuments: 1,
  minimumVerifiableFindingRatio: 0.7,
  maximumMedianResidualNoiseRatio: 0.25,
  maximumDocumentResidualNoiseRatio: 0.5,
  maximumDurationMs: 300_000,
  maximumPublicRequestsPerCategory: 32,
  maximumLlmRequestsPerCategory: 3,
  maximumFirecrawlCreditsPerCategory: 50,
} as const;

export const G12_LIVE_BUDGET = {
  maximumMonetaryCostYuan: 10,
  maximumFirecrawlCredits: 250,
  maximumPublicRequests: 160,
  maximumLlmRequests: 15,
  maximumTavilySearchRequests: 10,
  kimiK26InputYuanPerMillionTokens: 6.5,
  kimiK26OutputYuanPerMillionTokens: 27,
  tavilyPayAsYouGoUsdPerCredit: 0.008,
  conservativeUsdToCny: 8,
} as const;

export type G12LlmUsage = {
  promptTokens: number;
  completionTokens: number;
};

export function calculateG12MonetaryCostYuan(input: {
  llmUsage: G12LlmUsage[];
  tavilySearchRequests: number;
}) {
  const llmCost = input.llmUsage.reduce(
    (total, usage) =>
      total +
      (usage.promptTokens / 1_000_000) *
        G12_LIVE_BUDGET.kimiK26InputYuanPerMillionTokens +
      (usage.completionTokens / 1_000_000) *
        G12_LIVE_BUDGET.kimiK26OutputYuanPerMillionTokens,
    0,
  );
  const tavilyCost =
    input.tavilySearchRequests *
    G12_LIVE_BUDGET.tavilyPayAsYouGoUsdPerCredit *
    G12_LIVE_BUDGET.conservativeUsdToCny;
  return Number((llmCost + tavilyCost).toFixed(6));
}

export function g12LiveBudgetViolations(input: {
  monetaryCostYuan: number;
  firecrawlCredits: number;
  publicRequests: number;
  llmRequests: number;
  tavilySearchRequests: number;
}) {
  const violations: string[] = [];
  if (input.monetaryCostYuan > G12_LIVE_BUDGET.maximumMonetaryCostYuan) {
    violations.push("monetary_cost_cap_exceeded");
  }
  if (input.firecrawlCredits > G12_LIVE_BUDGET.maximumFirecrawlCredits) {
    violations.push("firecrawl_credit_cap_exceeded");
  }
  if (input.publicRequests > G12_LIVE_BUDGET.maximumPublicRequests) {
    violations.push("public_request_cap_exceeded");
  }
  if (input.llmRequests > G12_LIVE_BUDGET.maximumLlmRequests) {
    violations.push("llm_request_cap_exceeded");
  }
  if (
    input.tavilySearchRequests > G12_LIVE_BUDGET.maximumTavilySearchRequests
  ) {
    violations.push("tavily_search_cap_exceeded");
  }
  return violations;
}

export type G12BenchmarkPhase = "pre_kill" | "post_kill_exploratory";

export type G12BenchmarkFailureClass =
  | "technical_failure"
  | "source_coverage_failure"
  | "claim_verifiability_failure"
  | "document_quality_failure"
  | "decision_usability_failure"
  | "cost_or_request_cap_failure"
  | "preregistration_violation"
  | "real_use_evidence_missing";

export type G12CategoryBenchmarkInput = {
  categoryId: string;
  phase: G12BenchmarkPhase;
  status: "completed" | "failed";
  trustedDocumentCount: number;
  trustedDomainCount: number;
  deepDocumentCount: number;
  verifiableFindingRatio: number;
  medianResidualNoiseRatio: number;
  maximumResidualNoiseRatio: number;
  actionableFindingCount: number;
  durationMs: number;
  publicRequestCount: number;
  llmRequestCount: number;
  firecrawlCredits: number;
  actualMonetaryCostYuan: number | null;
  approvedMonetaryCostCapYuan: number;
};

export type G12CategoryScore = {
  categoryId: string;
  phase: G12BenchmarkPhase;
  score: number;
  passed: boolean;
  hardGateFailures: string[];
  failureClasses: G12BenchmarkFailureClass[];
};

export type G12BenchmarkDecision =
  | "evidence_pipeline_ready"
  | "evidence_pipeline_needs_adjustment"
  | "evidence_pipeline_blocked"
  | "insufficient_benchmark_evidence";

export type G12BenchmarkEvaluation = {
  schemaVersion: typeof G12_BENCHMARK_VERSION;
  categoryScores: G12CategoryScore[];
  excludedPostKillCategoryIds: string[];
  killRule: {
    triggered: boolean;
    triggeredAfterCategoryId: string | null;
    reason: string | null;
  };
  passingCategoryCount: number;
  completedPreKillCategoryCount: number;
  decisionScope: "evidence_pipeline_only";
  decisionCandidate: G12BenchmarkDecision;
  commercializationAssessment: {
    status: "not_evaluated";
    reason: "benchmark_does_not_measure_real_demand_or_business_viability";
  };
  c5: {
    eligibleForFinalUserDecision: boolean;
    status:
      | "ready_for_final_user_decision"
      | "benchmark_incomplete"
      | "real_use_evidence_missing"
      | "preregistration_violation";
    failureClasses: G12BenchmarkFailureClass[];
  };
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ratioScore(value: number, threshold: number, weight: number) {
  return clamp(value / threshold, 0, 1) * weight;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function hasInvalidMetrics(input: G12CategoryBenchmarkInput) {
  const nonNegativeValues = [
    input.trustedDocumentCount,
    input.trustedDomainCount,
    input.deepDocumentCount,
    input.actionableFindingCount,
    input.durationMs,
    input.publicRequestCount,
    input.llmRequestCount,
    input.firecrawlCredits,
    input.approvedMonetaryCostCapYuan,
  ];
  const ratios = [
    input.verifiableFindingRatio,
    input.medianResidualNoiseRatio,
    input.maximumResidualNoiseRatio,
  ];
  return (
    nonNegativeValues.some((value) => !Number.isFinite(value) || value < 0) ||
    ratios.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    (input.actualMonetaryCostYuan !== null &&
      (!Number.isFinite(input.actualMonetaryCostYuan) ||
        input.actualMonetaryCostYuan < 0))
  );
}

export function scoreG12BenchmarkCategory(
  input: G12CategoryBenchmarkInput,
): G12CategoryScore {
  const hardGateFailures: string[] = [];
  const failureClasses: G12BenchmarkFailureClass[] = [];
  const invalidMetrics = hasInvalidMetrics(input);
  const registeredCategory = G12_BENCHMARK_CATEGORIES.some(
    (category) => category.id === input.categoryId,
  );

  if (
    !registeredCategory ||
    (G12_FORBIDDEN_CATEGORY_IDS as readonly string[]).includes(input.categoryId)
  ) {
    hardGateFailures.push("category_not_preregistered");
    failureClasses.push("preregistration_violation");
  }
  if (invalidMetrics) {
    hardGateFailures.push("invalid_metric_value");
    failureClasses.push("preregistration_violation");
  }
  if (input.phase !== "pre_kill") {
    hardGateFailures.push("post_kill_result_is_exploratory_only");
    failureClasses.push("preregistration_violation");
  }
  if (input.status !== "completed") {
    hardGateFailures.push("run_not_completed");
    failureClasses.push("technical_failure");
  }
  if (
    input.trustedDocumentCount <
      G12_BENCHMARK_THRESHOLDS.minimumTrustedDocuments ||
    input.trustedDomainCount < G12_BENCHMARK_THRESHOLDS.minimumTrustedDomains ||
    input.deepDocumentCount < G12_BENCHMARK_THRESHOLDS.minimumDeepDocuments
  ) {
    hardGateFailures.push("trusted_source_coverage_below_threshold");
    failureClasses.push("source_coverage_failure");
  }
  if (
    input.verifiableFindingRatio <
    G12_BENCHMARK_THRESHOLDS.minimumVerifiableFindingRatio
  ) {
    hardGateFailures.push("verifiable_finding_ratio_below_threshold");
    failureClasses.push("claim_verifiability_failure");
  }
  if (
    input.medianResidualNoiseRatio >
      G12_BENCHMARK_THRESHOLDS.maximumMedianResidualNoiseRatio ||
    input.maximumResidualNoiseRatio >
      G12_BENCHMARK_THRESHOLDS.maximumDocumentResidualNoiseRatio
  ) {
    hardGateFailures.push("residual_noise_above_threshold");
    failureClasses.push("document_quality_failure");
  }
  if (input.actionableFindingCount < 1) {
    hardGateFailures.push("no_fully_supported_actionable_finding");
    failureClasses.push("decision_usability_failure");
  }
  if (input.durationMs > G12_BENCHMARK_THRESHOLDS.maximumDurationMs) {
    hardGateFailures.push("duration_cap_exceeded");
    failureClasses.push("technical_failure");
  }
  if (
    input.publicRequestCount >
      G12_BENCHMARK_THRESHOLDS.maximumPublicRequestsPerCategory ||
    input.llmRequestCount >
      G12_BENCHMARK_THRESHOLDS.maximumLlmRequestsPerCategory ||
    input.firecrawlCredits >
      G12_BENCHMARK_THRESHOLDS.maximumFirecrawlCreditsPerCategory ||
    input.actualMonetaryCostYuan === null ||
    input.actualMonetaryCostYuan > input.approvedMonetaryCostCapYuan
  ) {
    hardGateFailures.push("cost_or_request_cap_not_proven");
    failureClasses.push("cost_or_request_cap_failure");
  }

  const sourceScore =
    ratioScore(
      input.trustedDocumentCount,
      G12_BENCHMARK_THRESHOLDS.minimumTrustedDocuments,
      12,
    ) +
    ratioScore(
      input.trustedDomainCount,
      G12_BENCHMARK_THRESHOLDS.minimumTrustedDomains,
      8,
    ) +
    ratioScore(
      input.deepDocumentCount,
      G12_BENCHMARK_THRESHOLDS.minimumDeepDocuments,
      10,
    );
  const verifiabilityScore = ratioScore(
    input.verifiableFindingRatio,
    G12_BENCHMARK_THRESHOLDS.minimumVerifiableFindingRatio,
    30,
  );
  const documentQualityScore =
    (input.medianResidualNoiseRatio <=
    G12_BENCHMARK_THRESHOLDS.maximumMedianResidualNoiseRatio
      ? 8
      : 0) +
    (input.maximumResidualNoiseRatio <=
    G12_BENCHMARK_THRESHOLDS.maximumDocumentResidualNoiseRatio
      ? 7
      : 0);
  const decisionScore = input.actionableFindingCount > 0 ? 10 : 0;
  const stabilityScore =
    input.status === "completed" &&
    input.durationMs <= G12_BENCHMARK_THRESHOLDS.maximumDurationMs
      ? 10
      : 0;
  const costScore =
    input.actualMonetaryCostYuan !== null &&
    input.actualMonetaryCostYuan <= input.approvedMonetaryCostCapYuan &&
    input.publicRequestCount <=
      G12_BENCHMARK_THRESHOLDS.maximumPublicRequestsPerCategory &&
    input.llmRequestCount <=
      G12_BENCHMARK_THRESHOLDS.maximumLlmRequestsPerCategory &&
    input.firecrawlCredits <=
      G12_BENCHMARK_THRESHOLDS.maximumFirecrawlCreditsPerCategory
      ? 5
      : 0;
  const score = invalidMetrics
    ? 0
    : Number(
        (
          sourceScore +
          verifiabilityScore +
          documentQualityScore +
          decisionScore +
          stabilityScore +
          costScore
        ).toFixed(2),
      );

  return {
    categoryId: input.categoryId,
    phase: input.phase,
    score,
    passed: hardGateFailures.length === 0 && score >= 70,
    hardGateFailures,
    failureClasses: unique(failureClasses),
  };
}

export function evaluateG12Benchmark(input: {
  results: G12CategoryBenchmarkInput[];
  realUseEvidenceVerified: boolean;
}): G12BenchmarkEvaluation {
  const preKillResults = input.results.filter(
    (result) => result.phase === "pre_kill",
  );
  const postKillResults = input.results.filter(
    (result) => result.phase === "post_kill_exploratory",
  );
  const categoryScores: G12CategoryScore[] = [];
  const excludedPreKillAfterKillCategoryIds: string[] = [];
  let passingCategoryCount = 0;
  let killTriggeredAfterCategoryId: string | null = null;

  for (const [index, result] of preKillResults.entries()) {
    const score = scoreG12BenchmarkCategory(result);
    const expectedCategory = G12_BENCHMARK_CATEGORIES[index];
    if (!expectedCategory || result.categoryId !== expectedCategory.id) {
      score.hardGateFailures.push("category_order_or_duplicate_violation");
      score.failureClasses = unique([
        ...score.failureClasses,
        "preregistration_violation",
      ]);
      score.passed = false;
    }
    categoryScores.push(score);
    if (score.passed) passingCategoryCount += 1;
    const remaining = G12_BENCHMARK_CATEGORIES.length - (index + 1);
    if (
      passingCategoryCount + remaining <
      G12_BENCHMARK_THRESHOLDS.minimumPassingCategories
    ) {
      killTriggeredAfterCategoryId = score.categoryId;
      excludedPreKillAfterKillCategoryIds.push(
        ...preKillResults.slice(index + 1).map((item) => item.categoryId),
      );
      break;
    }
  }

  const killTriggered = killTriggeredAfterCategoryId !== null;
  const completed =
    categoryScores.length === G12_BENCHMARK_CATEGORIES.length || killTriggered;
  const decisionCandidate: G12BenchmarkDecision = !completed
    ? "insufficient_benchmark_evidence"
    : killTriggered || passingCategoryCount <= 1
      ? "evidence_pipeline_blocked"
      : passingCategoryCount >= 4
        ? "evidence_pipeline_ready"
        : "evidence_pipeline_needs_adjustment";
  const hasPreregistrationViolation =
    postKillResults.length > 0 ||
    excludedPreKillAfterKillCategoryIds.length > 0 ||
    categoryScores.some((score) =>
      score.failureClasses.includes("preregistration_violation"),
    );
  const c5FailureClasses: G12BenchmarkFailureClass[] = [];
  if (hasPreregistrationViolation) {
    c5FailureClasses.push("preregistration_violation");
  }
  if (!input.realUseEvidenceVerified) {
    c5FailureClasses.push("real_use_evidence_missing");
  }

  const c5Status = hasPreregistrationViolation
    ? "preregistration_violation"
    : !completed
      ? "benchmark_incomplete"
      : !input.realUseEvidenceVerified
        ? "real_use_evidence_missing"
        : "ready_for_final_user_decision";

  return {
    schemaVersion: G12_BENCHMARK_VERSION,
    categoryScores,
    excludedPostKillCategoryIds: [
      ...excludedPreKillAfterKillCategoryIds,
      ...postKillResults.map((result) => result.categoryId),
    ],
    killRule: {
      triggered: killTriggered,
      triggeredAfterCategoryId: killTriggeredAfterCategoryId,
      reason: killTriggered
        ? `remaining_categories_cannot_reach_${G12_BENCHMARK_THRESHOLDS.minimumPassingCategories}_passes`
        : null,
    },
    passingCategoryCount,
    completedPreKillCategoryCount: categoryScores.length,
    decisionScope: "evidence_pipeline_only",
    decisionCandidate,
    commercializationAssessment: {
      status: "not_evaluated",
      reason: "benchmark_does_not_measure_real_demand_or_business_viability",
    },
    c5: {
      eligibleForFinalUserDecision:
        c5Status === "ready_for_final_user_decision",
      status: c5Status,
      failureClasses: unique(c5FailureClasses),
    },
  };
}
