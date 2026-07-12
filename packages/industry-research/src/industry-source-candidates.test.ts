import { describe, expect, it } from "vitest";
import {
  completeIndustryExecutionStage,
  createIndustryExecutionCheckpoint,
  startIndustryExecutionStage,
} from "./industry-execution";
import { createIndustryPlan } from "./industry-planner";
import { skincareIndustryPlanningFixture } from "./industry-planner-fixtures";
import {
  createIndustrySourceCandidatePlan,
  type IndustrySourceCandidateInput,
  serializeIndustrySourceCandidatePlan,
  sourceCandidateInputsFromNoKeyPublicDiscovery,
  sourceCandidateInputsFromPlannerCalibration,
} from "./industry-source-candidates";

function planner() {
  return createIndustryPlan(structuredClone(skincareIndustryPlanningFixture));
}

const publicAccess = {
  loginRequired: false,
  cookieRequired: false,
  apiKeyRequired: false,
  creditsRequired: false,
  paywallExpected: false,
  captchaExpected: false,
  privateDataExpected: false,
};

function candidate(
  index: number,
  overrides: Partial<IndustrySourceCandidateInput> = {},
): IndustrySourceCandidateInput {
  return {
    name: `Candidate ${index}`,
    url: `https://source-${index}.example/public`,
    sourceRole: "credible_research_institution",
    discoveryMethod: "manual_public_seed",
    priority: "medium",
    estimatedPublicRequests: 1,
    access: { ...publicAccess },
    ...overrides,
  };
}

describe("Industry source candidate planner", () => {
  it("turns all seven audited calibration sources into non-evidence candidates", () => {
    const industryPlan = planner();
    const inputs = sourceCandidateInputsFromPlannerCalibration(industryPlan);
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: inputs,
    });

    expect(inputs).toHaveLength(7);
    expect(plan.candidates).toHaveLength(7);
    expect(
      plan.candidates.every(
        (item) =>
          item.status === "eligible_candidate" &&
          item.evidenceStatus === "candidate_not_evidence" &&
          item.moduleIds.length > 0 &&
          item.coverageRowIds.length > 0 &&
          item.coverageAssignments.length > 0 &&
          item.compliance.accessStatus === "public_no_auth_or_cost",
      ),
    ).toBe(true);
    expect(plan.assertions).toEqual({
      candidatesAreEvidence: false,
      coverageEvidenceUpdated: false,
      livePublicRequestsUsed: 0,
      providerCallsUsed: 0,
      creditsUsed: 0,
    });
  });

  it("adapts no-key public search records without treating results as fetched evidence", () => {
    const [input] = sourceCandidateInputsFromNoKeyPublicDiscovery([
      {
        name: "Public research result",
        url: "https://research.example/skincare",
        sourceRole: "credible_research_institution",
        query: "护肤品 中国 公开研究",
        resultRank: 2,
      },
    ]);
    if (!input) throw new Error("no_key_discovery_fixture_missing");
    const plan = createIndustrySourceCandidatePlan({
      industryPlan: planner(),
      candidateInputs: [input],
    });

    expect(input.discoveryMethod).toBe("no_key_public_search");
    expect(input.access).toEqual(publicAccess);
    expect(plan.candidates[0]?.evidenceStatus).toBe("candidate_not_evidence");
    expect(plan.budgetUsage.livePublicRequestsUsed).toBe(0);
  });

  it("maps source roles only to authorized claim roles and modules", () => {
    const industryPlan = planner();
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: [
        candidate(1, {
          sourceRole: "brand_official_site",
        }),
        candidate(2, {
          sourceRole: "government_statistics",
        }),
      ],
    });
    const brand = plan.candidates.find(
      (item) => item.sourceRole === "brand_official_site",
    );
    const statistics = plan.candidates.find(
      (item) => item.sourceRole === "government_statistics",
    );

    expect(brand?.allowedClaimRoles).toEqual(["brand_positioning_product"]);
    expect(brand?.moduleIds).toEqual(["ecommerce_competitor_research"]);
    expect(brand?.moduleIds).not.toContain("market_landscape");
    expect(statistics?.allowedClaimRoles).toEqual(["market_size_growth"]);
    expect(statistics?.moduleIds).toEqual(["market_landscape"]);
  });

  it("canonicalizes and deduplicates URLs before applying quotas", () => {
    const industryPlan = planner();
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: [
        candidate(1, {
          url: "https://Example.com/report/?utm_source=test&b=2&a=1#section",
        }),
        candidate(2, {
          url: "https://example.com/report?a=1&b=2",
        }),
      ],
    });

    expect(plan.candidates[0]?.canonicalUrl).toBe(
      "https://example.com/report?a=1&b=2",
    );
    expect(plan.candidates[1]?.status).toBe("duplicate");
    expect(plan.candidates[1]?.blockReasons).toContain(
      "duplicate_canonical_url",
    );
    expect(plan.candidates[1]?.duplicateOfCandidateId).toBe(
      plan.candidates[0]?.id,
    );
  });

  it("blocks login, cookie, key, credits, paywall, captcha and private-data candidates", () => {
    const industryPlan = planner();
    const restrictedAccess = {
      loginRequired: true,
      cookieRequired: true,
      apiKeyRequired: true,
      creditsRequired: true,
      paywallExpected: true,
      captchaExpected: true,
      privateDataExpected: true,
    };
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: [candidate(1, { access: restrictedAccess })],
    });

    expect(plan.candidates[0]?.status).toBe("blocked");
    expect(plan.candidates[0]?.blockReasons).toEqual([
      "login_required",
      "cookie_required",
      "api_key_required",
      "credits_required",
      "paywall_expected",
      "captcha_expected",
      "private_data_expected",
    ]);
  });

  it("blocks invalid URLs and negative request estimates", () => {
    const industryPlan = planner();
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: [
        candidate(1, {
          url: "file:///private/source.json",
          estimatedPublicRequests: -1,
        }),
      ],
    });

    expect(plan.candidates[0]?.status).toBe("blocked");
    expect(plan.candidates[0]?.blockReasons).toContain(
      "invalid_public_http_url",
    );
    expect(plan.candidates[0]?.blockReasons).toContain(
      "negative_request_estimate",
    );
  });

  it("prevents brand-controlled sources from filling the global candidate pool", () => {
    const industryPlan = planner();
    const nonBrand = [
      candidate(1, { sourceRole: "government_statistics" }),
      candidate(2, { sourceRole: "regulator" }),
    ];
    const brands = Array.from({ length: 8 }, (_, index) =>
      candidate(index + 10, {
        sourceRole: "brand_official_site",
        priority: "high",
      }),
    );
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: [...brands, ...nonBrand],
      budgetPolicy: { maxBrandControlledShare: 0.35 },
    });
    const eligible = plan.candidates.filter(
      (item) => item.status === "eligible_candidate",
    );
    const eligibleBrands = eligible.filter(
      (item) => item.sourceRole === "brand_official_site",
    );

    expect(eligibleBrands).toHaveLength(1);
    expect(eligibleBrands.length / eligible.length).toBeLessThanOrEqual(0.35);
    expect(
      plan.candidates.some((item) =>
        item.blockReasons.includes("brand_controlled_share_quota_exhausted"),
      ),
    ).toBe(true);
  });

  it("enforces role, hostname and planned-request budgets", () => {
    const industryPlan = planner();
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: [
        candidate(1, {
          url: "https://same.example/a",
          priority: "critical",
        }),
        candidate(2, { url: "https://same.example/b", priority: "high" }),
        candidate(3, { url: "https://other.example/c", priority: "medium" }),
        candidate(4, { url: "https://third.example/d", priority: "low" }),
      ],
      budgetPolicy: {
        maxCandidatesPerHostname: 1,
        maxCandidatesPerSourceRole: 2,
        maxPlannedPublicRequests: 2,
      },
    });

    expect(
      plan.candidates.filter((item) => item.status === "eligible_candidate"),
    ).toHaveLength(2);
    expect(plan.budgetUsage.plannedPublicRequests).toBe(2);
    expect(
      plan.candidates.some((item) =>
        item.blockReasons.includes("hostname_quota_exhausted"),
      ),
    ).toBe(true);
    expect(
      plan.candidates.some((item) =>
        item.blockReasons.includes("planned_public_request_budget_exhausted"),
      ),
    ).toBe(true);
  });

  it("keeps candidate coverage separate from evidence coverage and preserves gaps", () => {
    const industryPlan = planner();
    const plan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs:
        sourceCandidateInputsFromPlannerCalibration(industryPlan),
    });

    expect(
      plan.coverageRowCandidateCoverage.some(
        (coverage) => coverage.status === "candidate_target_met_not_evidence",
      ),
    ).toBe(true);
    expect(
      plan.coverageRowCandidateCoverage.some(
        (coverage) => coverage.status === "blocked_candidate_gap",
      ),
    ).toBe(true);
    expect(plan.gaps.length).toBeGreaterThan(0);
    expect(
      industryPlan.coverageMatrix.every(
        (row) => row.currentCoverage.independentSourceCount === 0,
      ),
    ).toBe(true);
  });

  it("serializes deterministically without provider or credit usage", () => {
    const industryPlan = planner();
    const inputs = sourceCandidateInputsFromPlannerCalibration(industryPlan);
    const first = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: inputs,
    });
    const second = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs: inputs,
    });

    expect(serializeIndustrySourceCandidatePlan(first)).toBe(
      serializeIndustrySourceCandidatePlan(second),
    );
    expect(first.budgetUsage).toMatchObject({
      livePublicRequestsUsed: 0,
      providerCallsUsed: 0,
      creditsUsed: 0,
    });
  });

  it("fills the G3 breadth-scan artifact contract without advancing to sampling research", () => {
    const industryPlan = planner();
    const sourcePlan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs:
        sourceCandidateInputsFromPlannerCalibration(industryPlan),
    });
    let checkpoint = createIndustryExecutionCheckpoint({
      executionMode: "contract_fixture",
      runId: "g4-source-plan-fixture",
      planId: industryPlan.planId,
      inputHash: `sha256:${"a".repeat(64)}`,
    });
    checkpoint = startIndustryExecutionStage(
      checkpoint,
      "planning",
      "2026-07-12T00:00:00Z",
    );
    checkpoint = completeIndustryExecutionStage(
      checkpoint,
      "planning",
      [
        {
          artifactType: "industry_plan",
          relativePath: "planning/industry-plan.json",
          contentHash: `sha256:${"b".repeat(64)}`,
          mediaType: "application/json",
        },
      ],
      "2026-07-12T00:00:01Z",
    );
    checkpoint = startIndustryExecutionStage(
      checkpoint,
      "breadth_scan",
      "2026-07-12T00:00:02Z",
    );
    checkpoint = completeIndustryExecutionStage(
      checkpoint,
      "breadth_scan",
      [
        {
          artifactType: "source_candidate_plan",
          relativePath: "breadth_scan/source-candidate-plan.json",
          contentHash: `sha256:${"c".repeat(64)}`,
          mediaType: "application/json",
        },
      ],
      "2026-07-12T00:00:03Z",
    );

    expect(sourcePlan.assertions.candidatesAreEvidence).toBe(false);
    expect(checkpoint.nextStage).toBe("sampling");
    expect(checkpoint.stages[2]?.status).toBe("pending");
  });
});
