import { describe, expect, it } from "vitest";
import {
  canSourceRoleSupportClaimRole,
  createIndustryPlan,
  type IndustryRepresentativeSample,
  serializeIndustryPlan,
} from "./industry-planner";
import { skincareIndustryPlanningFixture } from "./industry-planner-fixtures";

function fixtureInput() {
  return structuredClone(skincareIndustryPlanningFixture);
}

describe("Industry Planner", () => {
  it("accepts skincare as a complete industry-level input", () => {
    const plan = createIndustryPlan(fixtureInput());

    expect(plan.inputCoordinates.industry).toBe("护肤品");
    expect(plan.artifactType).toBe("industry-plan");
    expect(plan.plannerStatus).toBe("planned_with_gaps");
    expect(serializeIndustryPlan(plan)).not.toContain("请缩小品类");
    expect(serializeIndustryPlan(plan)).not.toContain("broad-negative");
  });

  it("covers every required planning axis without producing external facts", () => {
    const plan = createIndustryPlan(fixtureInput());

    expect(plan.taxonomy.length).toBeGreaterThan(1);
    expect(plan.valueChain.length).toBeGreaterThan(1);
    expect(plan.priceTiers.length).toBeGreaterThan(1);
    expect(plan.channels.length).toBeGreaterThan(1);
    expect(plan.consumerNeeds.length).toBeGreaterThan(1);
    expect(plan.businessModels.length).toBeGreaterThan(1);
    expect(plan.regulationAndRiskQuestions.length).toBeGreaterThan(0);
    expect(plan.coverageMatrix.length).toBeGreaterThan(
      plan.researchModules.length,
    );
    expect(plan.representativeSamplingPlan.selectedSamples).toEqual([]);
    expect(plan.assertions).toEqual({
      externalFactsProduced: false,
      marketSizeProduced: false,
      growthRateProduced: false,
      demandStrengthProduced: false,
      opportunityCertaintyProduced: false,
    });
  });

  it("calibrates exactly 24 skincare axes without treating business hypotheses as facts", () => {
    const plan = createIndustryPlan(fixtureInput());
    const axes = [
      ...plan.taxonomy,
      ...plan.valueChain,
      ...plan.priceTiers,
      ...plan.channels,
      ...plan.consumerNeeds,
      ...plan.businessModels,
    ];

    expect(axes).toHaveLength(24);
    expect(new Set(axes.map((item) => item.id)).size).toBe(24);
    expect(plan.taxonomy.map((item) => item.id)).toEqual([
      "taxonomy-efficacy-claim",
      "taxonomy-application-site",
      "taxonomy-product-form",
      "taxonomy-user-group",
      "taxonomy-use-method",
    ]);
    expect(
      axes.filter((item) => item.calibrationStatus === "authority_aligned"),
    ).toHaveLength(8);
    expect(
      axes.filter((item) => item.calibrationStatus === "method_guardrail"),
    ).toHaveLength(3);
    expect(
      axes.filter(
        (item) => item.calibrationStatus === "requires_live_validation",
      ),
    ).toHaveLength(13);
    expect(plan.priceTiers.every((item) => item.label.includes("单位价"))).toBe(
      true,
    );
  });

  it("binds the China skincare calibration to official sources and scope limits", () => {
    const plan = createIndustryPlan(fixtureInput());
    const statisticsScope = plan.planningCalibration.sources.find(
      (source) => source.id === "nbs-cosmetics-scope-2024",
    );

    expect(plan.planningCalibration.status).toBe("skincare_cn_g2_calibrated");
    expect(plan.planningCalibration.sources).toHaveLength(7);
    expect(
      plan.taxonomy.every(
        (item) =>
          item.calibrationSourceIds.length > 0 &&
          item.calibrationStatus === "authority_aligned",
      ),
    ).toBe(true);
    expect(statisticsScope?.limitations.join(" ")).toContain(
      "不能把化妆品类总额直接当作护肤品市场规模",
    );
  });

  it("keeps ecommerce competitor research as a module instead of the parent product", () => {
    const plan = createIndustryPlan(fixtureInput());
    const module = plan.researchModules.find(
      (item) => item.id === "ecommerce_competitor_research",
    );

    expect(module).toBeDefined();
    expect(plan.artifactType).toBe("industry-plan");
    expect(plan.schemaVersion).toBe("industry_plan.v1");
  });

  it("gives every research module questions, source roles, coverage and gaps", () => {
    const plan = createIndustryPlan(fixtureInput());

    for (const module of plan.researchModules) {
      expect(module.researchQuestions.length).toBeGreaterThan(0);
      expect(module.allowedSourceRoles.length).toBeGreaterThan(0);
      expect(module.targetClaimRoles.length).toBeGreaterThan(0);
      expect(module.coverageTargets.length).toBeGreaterThan(0);
      expect(module.status).toBe("blocked_missing_evidence");
      expect(module.evidenceGaps.length).toBeGreaterThan(0);
    }
  });

  it("fails closed when a source role is not authorized for a claim role", () => {
    const plan = createIndustryPlan(fixtureInput());

    expect(
      canSourceRoleSupportClaimRole(
        plan,
        "brand_official_site",
        "brand_positioning_product",
      ),
    ).toBe(true);
    expect(
      canSourceRoleSupportClaimRole(
        plan,
        "brand_official_site",
        "market_size_growth",
      ),
    ).toBe(false);
    expect(
      canSourceRoleSupportClaimRole(
        plan,
        "brand_official_site",
        "consumer_need",
      ),
    ).toBe(false);
    expect(
      canSourceRoleSupportClaimRole(
        plan,
        "content_platform",
        "business_model_supply_chain",
      ),
    ).toBe(false);
    expect(
      canSourceRoleSupportClaimRole(
        plan,
        "trusted_retail_channel",
        "business_model_supply_chain",
      ),
    ).toBe(true);
  });

  it("calibrates all 18 source roles with definitions and minimum evidence", () => {
    const plan = createIndustryPlan(fixtureInput());

    expect(plan.sourceRolePolicy).toHaveLength(18);
    expect(
      new Set(plan.sourceRolePolicy.map((entry) => entry.sourceRole)).size,
    ).toBe(18);
    expect(
      plan.sourceRolePolicy.every(
        (entry) =>
          entry.roleDefinition.length > 0 &&
          entry.minimumEvidenceRequirements.length >= 2 &&
          entry.prohibitedInferences.length > 0,
      ),
    ).toBe(true);
  });

  it("serializes deterministically and keeps unsupported coverage empty", () => {
    const input = fixtureInput();
    const first = createIndustryPlan(input);
    const second = createIndustryPlan(input);

    expect(serializeIndustryPlan(first)).toBe(serializeIndustryPlan(second));
    expect(
      first.coverageMatrix.every(
        (row) =>
          row.currentCoverage.independentSourceCount === 0 &&
          row.currentCoverage.sourceRoles.length === 0 &&
          row.currentCoverage.representativeSampleIds.length === 0,
      ),
    ).toBe(true);
    expect(
      first.coverageMatrix.every((row) => row.status === "not_started"),
    ).toBe(true);
  });

  it("maps every planning axis into structured executable coverage rows", () => {
    const plan = createIndustryPlan(fixtureInput());
    const coveredAxisTypes = new Set(
      plan.coverageMatrix.map((row) => row.axisType),
    );

    expect(coveredAxisTypes).toEqual(
      new Set([
        "taxonomy",
        "value_chain",
        "price_tier",
        "channel",
        "consumer_need",
        "business_model",
        "regulation",
      ]),
    );
    for (const row of plan.coverageMatrix) {
      expect(row.axisItemIds.length).toBeGreaterThan(0);
      expect(row.targetCoverage.minIndependentSources).toBeGreaterThan(0);
      expect(row.targetCoverage.minSourceRoles).toBeGreaterThan(0);
      expect(row.targetCoverage.requirements.length).toBeGreaterThan(0);
      expect(row.targetCoverage.calibrationRationale.length).toBeGreaterThan(0);
    }
    expect(plan.coverageMatrix).toHaveLength(11);
    expect(
      plan.coverageMatrix.find((row) => row.axisType === "regulation")
        ?.targetCoverage.targetBasis,
    ).toBe("primary_authority_minimum");
    expect(
      plan.coverageMatrix.find((row) => row.id === "coverage-market-taxonomy")
        ?.axisItemIds,
    ).toContain("market-size");
    expect(
      plan.coverageMatrix.find((row) => row.id === "coverage-content-channels")
        ?.axisItemIds,
    ).toEqual([
      "content-channel-platform",
      "content-channel-search",
      "content-channel-creator",
      "content-channel-live",
    ]);
  });

  it("defines a fillable representative sample contract while staying fail-closed", () => {
    const plan = createIndustryPlan(fixtureInput());
    const candidate: IndustryRepresentativeSample = {
      id: "sample-candidate-1",
      name: "待验证样本",
      sampleType: "organization",
      relationshipToIndustry: "direct_competitor",
      axisAssignments: {
        taxonomyIds: [plan.taxonomy[0]?.id ?? ""],
        valueChainIds: [],
        priceTierIds: [plan.priceTiers[0]?.id ?? ""],
        channelIds: [plan.channels[0]?.id ?? ""],
        consumerNeedIds: [],
        businessModelIds: [],
      },
      selectionReason: "验证样本可以显式关联多个覆盖轴。",
      expectedSourceRoles: ["brand_official_site"],
      validationStatus: "candidate_unverified",
      evidenceGaps: ["尚未采集和验证该样本。"],
    };

    expect(plan.representativeSamplingPlan.selectedSamples).toEqual([]);
    expect(plan.representativeSamplingPlan.uncoveredAxisItemIds.length).toBe(
      plan.taxonomy.length +
        plan.valueChain.length +
        plan.priceTiers.length +
        plan.channels.length +
        plan.consumerNeeds.length +
        plan.businessModels.length,
    );
    expect([
      ...plan.representativeSamplingPlan.selectedSamples,
      candidate,
    ]).toEqual([candidate]);
  });

  it("does not introduce apparel brands as skincare competitors", () => {
    const serialized = serializeIndustryPlan(
      createIndustryPlan(fixtureInput()),
    );

    expect(serialized).not.toContain("Baleaf");
    expect(serialized).not.toContain("lululemon");
  });
});
