import { describe, expect, it } from "vitest";
import {
  completeIndustryExecutionStage,
  createIndustryExecutionCheckpoint,
  startIndustryExecutionStage,
} from "./industry-execution";
import { createIndustryPlan } from "./industry-planner";
import { skincareIndustryPlanningFixture } from "./industry-planner-fixtures";
import {
  createIndustryRepresentativeSamplePlan,
  type IndustrySamplingCandidateInput,
  serializeIndustryRepresentativeSamplePlan,
} from "./industry-sampling";
import { createSkincareSamplingContractFixture } from "./industry-sampling-fixtures";
import {
  createIndustrySourceCandidatePlan,
  sourceCandidateInputsFromPlannerCalibration,
} from "./industry-source-candidates";

function planner() {
  return createIndustryPlan(structuredClone(skincareIndustryPlanningFixture));
}

function contractFixture() {
  const industryPlan = planner();
  return {
    industryPlan,
    ...createSkincareSamplingContractFixture(industryPlan),
  };
}

describe("Industry representative sampling", () => {
  it("selects a multi-axis sample set and records source bindings and reasons", () => {
    const fixture = contractFixture();
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: fixture.samplingCandidates,
    });

    expect(plan.coverageGate.status).toBe("pass");
    expect(plan.nextStageAllowed).toBe("module_research");
    expect(plan.selectedSamples.length).toBeGreaterThanOrEqual(5);
    expect(
      plan.selectedSamples.every(
        (sample) =>
          sample.sourceCandidateIds.length > 0 &&
          sample.selectionReason.length > 0 &&
          sample.coverageContributionKeys.length > 0 &&
          sample.validationStatus === "validated",
      ),
    ).toBe(true);
    expect(plan.coverage.taxonomy.uncoveredIds).toEqual([]);
    expect(plan.coverage.priceTiers.coveredIds).toHaveLength(3);
    expect(plan.coverage.channels.coveredIds.length).toBeGreaterThanOrEqual(3);
    expect(
      plan.coverage.businessModels.coveredIds.length,
    ).toBeGreaterThanOrEqual(3);
    expect(plan.coverage.populationSegments.length).toBeGreaterThanOrEqual(2);
    expect(plan.assertions.synthesisAllowed).toBe(false);
  });

  it("produces the same selection when input order and search ranks change", () => {
    const fixture = contractFixture();
    const first = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: fixture.samplingCandidates,
    });
    const reordered = structuredClone(fixture.samplingCandidates)
      .reverse()
      .map((candidate, index) => ({ ...candidate, searchRank: index + 1 }));
    const second = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: reordered,
    });

    expect(first.selectedSamples.map((sample) => sample.entityId)).toEqual(
      second.selectedSamples.map((sample) => sample.entityId),
    );
    expect(first.assertions.searchRankDeterminedSelection).toBe(false);
  });

  it("keeps validated zero-incremental samples when a module relationship minimum requires them", () => {
    const fixture = contractFixture();
    const sourceCandidatePlan = structuredClone(fixture.sourceCandidatePlan);
    const sourceTemplate = sourceCandidatePlan.candidates.find(
      (candidate) => candidate.status === "eligible_candidate",
    );
    if (!sourceTemplate) throw new Error("g5_source_template_missing");
    const contentSources = [
      {
        ...sourceTemplate,
        id: "source-candidate-content-platform",
        name: "Content platform fixture",
        canonicalUrl: "https://content-platform.example/public-report",
        hostname: "content-platform.example",
        sourceRole: "content_platform" as const,
      },
      {
        ...sourceTemplate,
        id: "source-candidate-creator-data",
        name: "Creator data fixture",
        canonicalUrl: "https://creator-data.example/public-report",
        hostname: "creator-data.example",
        sourceRole: "creator_data" as const,
      },
    ];
    sourceCandidatePlan.candidates.push(...contentSources);
    const channelIds = fixture.industryPlan.channels.map((item) => item.id);
    const contentCandidates: IndustrySamplingCandidateInput[] = contentSources
      .slice(0, 2)
      .map((source, index) => ({
        entityId: `content-actor-${index + 1}`,
        name: `Content actor ${index + 1}`,
        sampleType: "content_source",
        relationshipToIndustry: "content_actor",
        sourceCandidateIds: [source.id],
        validationStatus: "validated_for_sampling",
        validationBasis: ["public content-source contract fixture"],
        searchRank: null,
        populationSegments: [],
        axisAssignments: {
          taxonomyIds: [],
          valueChainIds: [],
          priceTierIds: [],
          channelIds,
          consumerNeedIds: [],
          businessModelIds: [],
        },
        selectionRationale: "Required content-actor relationship coverage.",
      }));
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan,
      samplingCandidates: [...fixture.samplingCandidates, ...contentCandidates],
      requiredRelationshipMinimums: { content_actor: 2 },
    });

    expect(plan.relationshipCoverageGate.status).toBe("pass");
    expect(plan.relationshipCoverageGate.selectedCounts.content_actor).toBe(2);
    expect(
      plan.selectedSamples.filter(
        (sample) => sample.relationshipToIndustry === "content_actor",
      ),
    ).toHaveLength(2);
    expect(plan.coverageGate.status).toBe("pass");
  });

  it("never counts a business-model analogy as a competitor", () => {
    const fixture = contractFixture();
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: fixture.samplingCandidates,
    });

    expect(plan.analogySampleIds).toHaveLength(1);
    expect(
      plan.analogySampleIds.some((id) => plan.competitorSampleIds.includes(id)),
    ).toBe(false);
    expect(plan.assertions.businessModelAnalogyCountedAsCompetitor).toBe(false);
  });

  it("excludes unvalidated candidates and records why", () => {
    const fixture = contractFixture();
    const unverified = structuredClone(fixture.samplingCandidates[0]);
    if (!unverified) throw new Error("g5_sampling_fixture_missing");
    unverified.entityId = "unverified-sample";
    unverified.validationStatus = "unverified_candidate";
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: [unverified],
    });

    expect(plan.selectedSamples).toEqual([]);
    expect(plan.excludedCandidates[0]?.reasons).toContain(
      "candidate_not_validated:unverified_candidate",
    );
    expect(plan.coverageGate.status).toBe("blocked_insufficient_coverage");
  });

  it("excludes candidates whose source role is wrong for the relationship", () => {
    const industryPlan = planner();
    const sourceCandidatePlan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs:
        sourceCandidateInputsFromPlannerCalibration(industryPlan),
    });
    const regulator = sourceCandidatePlan.candidates.find(
      (candidate) => candidate.sourceRole === "regulator",
    );
    if (!regulator) throw new Error("g5_regulator_fixture_missing");
    const invalid: IndustrySamplingCandidateInput = {
      entityId: "regulator-as-competitor",
      name: "Regulator is not a competitor",
      sampleType: "organization",
      relationshipToIndustry: "direct_competitor",
      sourceCandidateIds: [regulator.id],
      validationStatus: "validated_for_sampling",
      validationBasis: ["negative fixture"],
      searchRank: 1,
      populationSegments: ["adult-general"],
      axisAssignments: {
        taxonomyIds: [industryPlan.taxonomy[0]?.id ?? ""],
        valueChainIds: [],
        priceTierIds: [],
        channelIds: [],
        consumerNeedIds: [],
        businessModelIds: [],
      },
      selectionRationale: "negative fixture",
    };
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan,
      sourceCandidatePlan,
      samplingCandidates: [invalid],
    });

    expect(plan.selectedSamples).toEqual([]);
    expect(plan.excludedCandidates[0]?.reasons).toContain(
      "source_role_not_authorized_for_relationship",
    );
  });

  it("blocks the official-only G4 pool instead of inventing competitor samples", () => {
    const industryPlan = planner();
    const sourceCandidatePlan = createIndustrySourceCandidatePlan({
      industryPlan,
      candidateInputs:
        sourceCandidateInputsFromPlannerCalibration(industryPlan),
    });
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan,
      sourceCandidatePlan,
      samplingCandidates: [],
    });

    expect(plan.selectedSamples).toEqual([]);
    expect(plan.coverageGate.status).toBe("blocked_insufficient_coverage");
    expect(plan.nextStageAllowed).toBeNull();
    expect(plan.gaps[0]).toContain("禁止进入 module_research 和综合判断");
  });

  it("blocks insufficient multi-axis coverage even with one valid brand", () => {
    const fixture = contractFixture();
    const firstBrand = fixture.samplingCandidates.find(
      (candidate) => candidate.relationshipToIndustry === "direct_competitor",
    );
    if (!firstBrand) throw new Error("g5_brand_fixture_missing");
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: [firstBrand],
    });

    expect(plan.selectedSamples).toHaveLength(1);
    expect(plan.coverageGate.status).toBe("blocked_insufficient_coverage");
    expect(plan.nextStageAllowed).toBeNull();
    expect(plan.assertions.synthesisAllowed).toBe(false);
  });

  it("rejects unknown axis assignments instead of silently dropping them", () => {
    const fixture = contractFixture();
    const invalid = structuredClone(fixture.samplingCandidates[0]);
    if (!invalid) throw new Error("g5_axis_fixture_missing");
    invalid.entityId = "unknown-axis-sample";
    invalid.axisAssignments.priceTierIds = ["price-tier-does-not-exist"];
    const plan = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: [invalid],
    });

    expect(plan.selectedSamples).toEqual([]);
    expect(plan.excludedCandidates[0]?.reasons).toContain(
      "unknown_axis_item:priceTierIds:price-tier-does-not-exist",
    );
  });

  it("fills the G3 sampling artifact without enabling synthesis", () => {
    const fixture = contractFixture();
    const samplePlan = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: fixture.samplingCandidates,
    });
    let checkpoint = createIndustryExecutionCheckpoint({
      executionMode: "contract_fixture",
      runId: "g5-sampling-fixture",
      planId: fixture.industryPlan.planId,
      inputHash: `sha256:${"a".repeat(64)}`,
    });
    for (const [stage, artifactType, hash] of [
      ["planning", "industry_plan", "b"],
      ["breadth_scan", "source_candidate_plan", "c"],
      ["sampling", "representative_sample_plan", "d"],
    ] as const) {
      checkpoint = startIndustryExecutionStage(
        checkpoint,
        stage,
        "2026-07-12T00:00:00Z",
      );
      checkpoint = completeIndustryExecutionStage(
        checkpoint,
        stage,
        [
          {
            artifactType,
            relativePath: `${stage}/artifact.json`,
            contentHash: `sha256:${hash.repeat(64)}`,
            mediaType: "application/json",
          },
        ],
        "2026-07-12T00:00:01Z",
      );
    }

    expect(samplePlan.nextStageAllowed).toBe("module_research");
    expect(samplePlan.assertions.synthesisAllowed).toBe(false);
    expect(checkpoint.nextStage).toBe("module_research");
  });

  it("serializes deterministically", () => {
    const fixture = contractFixture();
    const first = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: fixture.samplingCandidates,
    });
    const second = createIndustryRepresentativeSamplePlan({
      industryPlan: fixture.industryPlan,
      sourceCandidatePlan: fixture.sourceCandidatePlan,
      samplingCandidates: fixture.samplingCandidates,
    });

    expect(serializeIndustryRepresentativeSamplePlan(first)).toBe(
      serializeIndustryRepresentativeSamplePlan(second),
    );
  });
});
