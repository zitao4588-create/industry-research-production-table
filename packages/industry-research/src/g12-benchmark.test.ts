import { describe, expect, it } from "vitest";
import {
  calculateG12MonetaryCostYuan,
  evaluateG12Benchmark,
  G12_BENCHMARK_CATEGORIES,
  G12_FORBIDDEN_CATEGORY_IDS,
  type G12CategoryBenchmarkInput,
  g12LiveBudgetViolations,
  scoreG12BenchmarkCategory,
} from "./g12-benchmark";

function passingResult(
  categoryId: string,
  overrides: Partial<G12CategoryBenchmarkInput> = {},
): G12CategoryBenchmarkInput {
  return {
    categoryId,
    phase: "pre_kill",
    status: "completed",
    trustedDocumentCount: 3,
    trustedDomainCount: 2,
    deepDocumentCount: 1,
    verifiableFindingRatio: 0.7,
    medianResidualNoiseRatio: 0.25,
    maximumResidualNoiseRatio: 0.5,
    actionableFindingCount: 1,
    durationMs: 300_000,
    publicRequestCount: 32,
    llmRequestCount: 3,
    firecrawlCredits: 50,
    actualMonetaryCostYuan: 0,
    approvedMonetaryCostCapYuan: 0,
    ...overrides,
  };
}

describe("G12 benchmark preregistration", () => {
  it("locks five ordered categories and excludes the rejected broad-skincare label", () => {
    expect(G12_BENCHMARK_CATEGORIES).toHaveLength(5);
    expect(G12_BENCHMARK_CATEGORIES.map((category) => category.order)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      G12_BENCHMARK_CATEGORIES.map((category) => category.id),
    ).not.toContain(G12_FORBIDDEN_CATEGORY_IDS[0]);
  });

  it("passes only when every hard gate and the score threshold pass", () => {
    const score = scoreG12BenchmarkCategory(passingResult("pet-probiotics"));
    expect(score).toMatchObject({ passed: true, score: 100 });

    const failed = scoreG12BenchmarkCategory(
      passingResult("pet-probiotics", {
        verifiableFindingRatio: 0.69,
      }),
    );
    expect(failed.passed).toBe(false);
    expect(failed.failureClasses).toContain("claim_verifiability_failure");
  });

  it("fails closed on negative or out-of-range metrics", () => {
    const score = scoreG12BenchmarkCategory(
      passingResult("pet-probiotics", {
        actualMonetaryCostYuan: -1,
        verifiableFindingRatio: 1.1,
      }),
    );
    expect(score).toMatchObject({ passed: false, score: 0 });
    expect(score.hardGateFailures).toContain("invalid_metric_value");
    expect(score.failureClasses).toContain("preregistration_violation");
  });

  it("triggers the preregistered kill rule when three initial failures make 3/5 impossible", () => {
    const results = G12_BENCHMARK_CATEGORIES.slice(0, 3).map((category) =>
      passingResult(category.id, {
        trustedDocumentCount: 0,
      }),
    );
    const evaluation = evaluateG12Benchmark({
      results,
      realUseEvidenceVerified: false,
    });

    expect(evaluation.killRule).toMatchObject({
      triggered: true,
      triggeredAfterCategoryId: "japan-niche-skincare",
    });
    expect(evaluation).toMatchObject({
      decisionScope: "evidence_pipeline_only",
      decisionCandidate: "evidence_pipeline_blocked",
      commercializationAssessment: { status: "not_evaluated" },
    });
  });

  it("excludes post-kill exploratory results instead of mixing them into the score", () => {
    const results = [
      ...G12_BENCHMARK_CATEGORIES.slice(0, 3).map((category) =>
        passingResult(category.id, { trustedDocumentCount: 0 }),
      ),
      passingResult("mens-electric-shaver", {
        phase: "post_kill_exploratory",
      }),
    ];
    const evaluation = evaluateG12Benchmark({
      results,
      realUseEvidenceVerified: true,
    });

    expect(evaluation.categoryScores).toHaveLength(3);
    expect(evaluation.excludedPostKillCategoryIds).toEqual([
      "mens-electric-shaver",
    ]);
    expect(evaluation.c5.status).toBe("preregistration_violation");
  });

  it("fails closed on reordered, duplicate, or pre-kill results supplied after kill", () => {
    const reordered = evaluateG12Benchmark({
      results: [passingResult("dishwasher")],
      realUseEvidenceVerified: true,
    });
    expect(reordered.categoryScores[0]?.failureClasses).toContain(
      "preregistration_violation",
    );

    const afterKill = evaluateG12Benchmark({
      results: [
        ...G12_BENCHMARK_CATEGORIES.slice(0, 3).map((category) =>
          passingResult(category.id, { trustedDocumentCount: 0 }),
        ),
        passingResult("mens-electric-shaver"),
      ],
      realUseEvidenceVerified: true,
    });
    expect(afterKill.categoryScores).toHaveLength(3);
    expect(afterKill.excludedPostKillCategoryIds).toEqual([
      "mens-electric-shaver",
    ]);
    expect(afterKill.c5.status).toBe("preregistration_violation");
  });

  it("never marks C5 ready from benchmark evidence alone", () => {
    const results = G12_BENCHMARK_CATEGORIES.map((category) =>
      passingResult(category.id),
    );
    const withoutRealUse = evaluateG12Benchmark({
      results,
      realUseEvidenceVerified: false,
    });
    expect(withoutRealUse.decisionCandidate).toBe("evidence_pipeline_ready");
    expect(withoutRealUse.commercializationAssessment.status).toBe(
      "not_evaluated",
    );
    expect(withoutRealUse.c5).toMatchObject({
      eligibleForFinalUserDecision: false,
      status: "real_use_evidence_missing",
    });
  });

  it("calculates live cost conservatively and reports every global cap violation", () => {
    expect(
      calculateG12MonetaryCostYuan({
        llmUsage: [{ promptTokens: 1_000_000, completionTokens: 1_000_000 }],
        tavilySearchRequests: 1,
      }),
    ).toBe(33.564);
    expect(
      g12LiveBudgetViolations({
        monetaryCostYuan: 10.01,
        firecrawlCredits: 251,
        publicRequests: 161,
        llmRequests: 16,
        tavilySearchRequests: 11,
      }),
    ).toEqual([
      "monetary_cost_cap_exceeded",
      "firecrawl_credit_cap_exceeded",
      "public_request_cap_exceeded",
      "llm_request_cap_exceeded",
      "tavily_search_cap_exceeded",
    ]);
  });
});
