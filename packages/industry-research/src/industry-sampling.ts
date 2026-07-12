import type {
  IndustryCoverageAxisType,
  IndustryPlan,
  IndustryPlanSourceRole,
  IndustryRepresentativeSample,
} from "./industry-planner";
import type {
  IndustrySourceCandidate,
  IndustrySourceCandidatePlan,
} from "./industry-source-candidates";

export const industryRepresentativeSamplePlanSchemaVersion =
  "industry_representative_sample_plan.v1" as const;

export type IndustrySamplingCandidateInput = {
  entityId: string;
  name: string;
  sampleType: IndustryRepresentativeSample["sampleType"];
  relationshipToIndustry: IndustryRepresentativeSample["relationshipToIndustry"];
  sourceCandidateIds: string[];
  validationStatus:
    | "validated_for_sampling"
    | "unverified_candidate"
    | "rejected_candidate";
  validationBasis: string[];
  searchRank: number | null;
  populationSegments: string[];
  axisAssignments: IndustryRepresentativeSample["axisAssignments"];
  selectionRationale: string;
};

export type IndustrySelectedRepresentativeSample =
  IndustryRepresentativeSample & {
    entityId: string;
    sourceCandidateIds: string[];
    populationSegments: string[];
    coverageContributionKeys: string[];
    selectionOrder: number;
  };

export type IndustrySamplingExclusion = {
  entityId: string;
  name: string;
  sourceCandidateIds: string[];
  reasons: string[];
};

export type IndustryRepresentativeSamplePlan = {
  schemaVersion: typeof industryRepresentativeSamplePlanSchemaVersion;
  artifactType: "industry-representative-sample-plan";
  planId: string;
  industryPlanId: string;
  sourceCandidatePlanId: string;
  selectedSamples: IndustrySelectedRepresentativeSample[];
  excludedCandidates: IndustrySamplingExclusion[];
  coverage: {
    taxonomy: { coveredIds: string[]; uncoveredIds: string[] };
    valueChain: { coveredIds: string[]; uncoveredIds: string[] };
    priceTiers: { coveredIds: string[]; uncoveredIds: string[] };
    channels: { coveredIds: string[]; uncoveredIds: string[] };
    consumerNeeds: { coveredIds: string[]; uncoveredIds: string[] };
    businessModels: { coveredIds: string[]; uncoveredIds: string[] };
    populationSegments: string[];
  };
  coverageGate: {
    taxonomyItemsMeetingMinimum: number;
    requiredTaxonomyItems: number;
    coveredPriceTiers: number;
    requiredPriceTiers: number;
    coveredChannels: number;
    requiredChannels: number;
    coveredBusinessModels: number;
    requiredBusinessModels: number;
    coveredPopulationSegments: number;
    requiredPopulationSegments: number;
    status: "pass" | "blocked_insufficient_coverage";
  };
  competitorSampleIds: string[];
  analogySampleIds: string[];
  uncoveredAxisItemIds: string[];
  gaps: string[];
  nextStageAllowed: "module_research" | null;
  assertions: {
    searchRankDeterminedSelection: false;
    businessModelAnalogyCountedAsCompetitor: false;
    sourceCandidatesTreatedAsEvidence: false;
    synthesisAllowed: false;
    liveProviderCalls: 0;
  };
};

const relationshipSourceRoles: Record<
  IndustryRepresentativeSample["relationshipToIndustry"],
  IndustryPlanSourceRole[]
> = {
  direct_competitor: [
    "brand_official_site",
    "official_store",
    "trusted_retail_channel",
  ],
  supply_chain_actor: [
    "financial_report",
    "company_material",
    "supply_chain_company",
  ],
  channel_actor: [
    "financial_report",
    "trusted_retail_channel",
    "company_material",
  ],
  content_actor: ["search_trend", "content_platform", "creator_data"],
  business_model_analogy: [
    "financial_report",
    "company_material",
    "industry_media",
  ],
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unique<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function axisIds(plan: IndustryPlan) {
  return {
    taxonomyIds: new Set(plan.taxonomy.map((item) => item.id)),
    valueChainIds: new Set(plan.valueChain.map((item) => item.id)),
    priceTierIds: new Set(plan.priceTiers.map((item) => item.id)),
    channelIds: new Set(plan.channels.map((item) => item.id)),
    consumerNeedIds: new Set(plan.consumerNeeds.map((item) => item.id)),
    businessModelIds: new Set(plan.businessModels.map((item) => item.id)),
  };
}

function assignmentErrors(
  plan: IndustryPlan,
  assignments: IndustrySamplingCandidateInput["axisAssignments"],
) {
  const valid = axisIds(plan);
  const errors: string[] = [];
  for (const [key, ids] of Object.entries(assignments) as Array<
    [keyof typeof valid, string[]]
  >) {
    for (const id of ids) {
      if (!valid[key].has(id)) errors.push(`unknown_axis_item:${key}:${id}`);
    }
  }
  return errors;
}

function sourceValidationErrors(
  input: IndustrySamplingCandidateInput,
  sourcePlan: IndustrySourceCandidatePlan,
) {
  const errors: string[] = [];
  const sources = input.sourceCandidateIds.map((id) =>
    sourcePlan.candidates.find((candidate) => candidate.id === id),
  );
  if (sources.length === 0) errors.push("source_candidate_binding_required");
  if (sources.some((source) => !source)) {
    errors.push("source_candidate_missing");
  }
  const existing = sources.filter((source): source is IndustrySourceCandidate =>
    Boolean(source),
  );
  if (
    existing.some(
      (source) =>
        source.status !== "eligible_candidate" ||
        source.compliance.accessStatus !== "public_no_auth_or_cost",
    )
  ) {
    errors.push("source_candidate_not_eligible");
  }
  const allowedRoles = relationshipSourceRoles[input.relationshipToIndustry];
  if (!existing.some((source) => allowedRoles.includes(source.sourceRole))) {
    errors.push("source_role_not_authorized_for_relationship");
  }
  return { errors, sources: existing };
}

function candidateErrors(
  plan: IndustryPlan,
  sourcePlan: IndustrySourceCandidatePlan,
  input: IndustrySamplingCandidateInput,
) {
  const errors: string[] = [];
  if (input.validationStatus !== "validated_for_sampling") {
    errors.push(`candidate_not_validated:${input.validationStatus}`);
  }
  if (input.validationBasis.length === 0) {
    errors.push("validation_basis_required");
  }
  if (
    input.relationshipToIndustry === "business_model_analogy" &&
    input.sampleType !== "business_model_analogy"
  ) {
    errors.push("analogy_sample_type_mismatch");
  }
  if (
    input.sampleType === "business_model_analogy" &&
    input.relationshipToIndustry !== "business_model_analogy"
  ) {
    errors.push("analogy_relationship_mismatch");
  }
  if (
    input.relationshipToIndustry === "direct_competitor" &&
    input.axisAssignments.taxonomyIds.length === 0
  ) {
    errors.push("direct_competitor_taxonomy_required");
  }
  if (
    input.relationshipToIndustry === "direct_competitor" &&
    input.populationSegments.length === 0
  ) {
    errors.push("direct_competitor_population_required");
  }
  errors.push(...assignmentErrors(plan, input.axisAssignments));
  const sourceValidation = sourceValidationErrors(input, sourcePlan);
  errors.push(...sourceValidation.errors);
  return { errors: unique(errors), sources: sourceValidation.sources };
}

function coverageKeys(input: IndustrySamplingCandidateInput) {
  return unique([
    ...input.axisAssignments.taxonomyIds.map((id) => `taxonomy:${id}`),
    ...input.axisAssignments.valueChainIds.map((id) => `value_chain:${id}`),
    ...input.axisAssignments.priceTierIds.map((id) => `price_tier:${id}`),
    ...input.axisAssignments.channelIds.map((id) => `channel:${id}`),
    ...input.axisAssignments.consumerNeedIds.map((id) => `consumer_need:${id}`),
    ...input.axisAssignments.businessModelIds.map(
      (id) => `business_model:${id}`,
    ),
    ...input.populationSegments.map((id) => `population:${id.trim()}`),
  ]);
}

function contributionScore(keys: string[], covered: Set<string>) {
  const weights: Record<IndustryCoverageAxisType | "population", number> = {
    taxonomy: 5,
    value_chain: 1,
    price_tier: 4,
    channel: 3,
    consumer_need: 1,
    business_model: 3,
    regulation: 0,
    population: 2,
  };
  return keys.reduce((score, key) => {
    if (covered.has(key)) return score;
    const axis = key.slice(0, key.indexOf(":")) as keyof typeof weights;
    return score + weights[axis];
  }, 0);
}

function coverageFromSelected(
  allIds: string[],
  selected: IndustrySelectedRepresentativeSample[],
  assignmentKey: keyof IndustryRepresentativeSample["axisAssignments"],
) {
  const coveredIds = unique(
    selected.flatMap((sample) => sample.axisAssignments[assignmentKey]),
  );
  return {
    coveredIds,
    uncoveredIds: allIds.filter((id) => !coveredIds.includes(id)),
  };
}

export function createIndustryRepresentativeSamplePlan(input: {
  industryPlan: IndustryPlan;
  sourceCandidatePlan: IndustrySourceCandidatePlan;
  samplingCandidates: IndustrySamplingCandidateInput[];
  minPopulationSegments?: number;
}): IndustryRepresentativeSamplePlan {
  const { industryPlan, sourceCandidatePlan } = input;
  if (sourceCandidatePlan.industryPlanId !== industryPlan.planId) {
    throw new Error("industry_sampling_plan_mismatch");
  }
  const minPopulationSegments = input.minPopulationSegments ?? 2;
  if (minPopulationSegments < 1) {
    throw new Error("industry_sampling_population_requirement_invalid");
  }

  const excludedCandidates: IndustrySamplingExclusion[] = [];
  const validCandidates = input.samplingCandidates
    .map((candidate) => {
      const validation = candidateErrors(
        industryPlan,
        sourceCandidatePlan,
        candidate,
      );
      if (validation.errors.length > 0) {
        excludedCandidates.push({
          entityId: candidate.entityId,
          name: candidate.name,
          sourceCandidateIds: [...candidate.sourceCandidateIds],
          reasons: validation.errors,
        });
        return null;
      }
      return {
        input: candidate,
        sources: validation.sources,
        keys: coverageKeys(candidate),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );

  const selectedSamples: IndustrySelectedRepresentativeSample[] = [];
  const covered = new Set<string>();
  const remaining = [...validCandidates];
  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const scoreDifference =
        contributionScore(right.keys, covered) -
        contributionScore(left.keys, covered);
      return (
        scoreDifference ||
        left.input.entityId.localeCompare(right.input.entityId)
      );
    });
    const selected = remaining.shift();
    if (!selected) break;
    const newKeys = selected.keys.filter((key) => !covered.has(key));
    if (newKeys.length === 0) {
      excludedCandidates.push({
        entityId: selected.input.entityId,
        name: selected.input.name,
        sourceCandidateIds: [...selected.input.sourceCandidateIds],
        reasons: ["no_incremental_coverage"],
      });
      continue;
    }
    for (const key of newKeys) covered.add(key);
    selectedSamples.push({
      id: `sample-${stableHash(selected.input.entityId)}`,
      entityId: selected.input.entityId,
      name: selected.input.name,
      sampleType: selected.input.sampleType,
      relationshipToIndustry: selected.input.relationshipToIndustry,
      axisAssignments: structuredClone(selected.input.axisAssignments),
      selectionReason: selected.input.selectionRationale,
      expectedSourceRoles: unique(
        selected.sources.map((source) => source.sourceRole),
      ),
      validationStatus: "validated",
      evidenceGaps: ["来源候选已通过抽样资格校验，但尚未采集为研究 evidence。"],
      sourceCandidateIds: [...selected.input.sourceCandidateIds],
      populationSegments: unique(
        selected.input.populationSegments.map((segment) => segment.trim()),
      ),
      coverageContributionKeys: newKeys,
      selectionOrder: selectedSamples.length + 1,
    });
  }

  const coverage = {
    taxonomy: coverageFromSelected(
      industryPlan.taxonomy.map((item) => item.id),
      selectedSamples,
      "taxonomyIds",
    ),
    valueChain: coverageFromSelected(
      industryPlan.valueChain.map((item) => item.id),
      selectedSamples,
      "valueChainIds",
    ),
    priceTiers: coverageFromSelected(
      industryPlan.priceTiers.map((item) => item.id),
      selectedSamples,
      "priceTierIds",
    ),
    channels: coverageFromSelected(
      industryPlan.channels.map((item) => item.id),
      selectedSamples,
      "channelIds",
    ),
    consumerNeeds: coverageFromSelected(
      industryPlan.consumerNeeds.map((item) => item.id),
      selectedSamples,
      "consumerNeedIds",
    ),
    businessModels: coverageFromSelected(
      industryPlan.businessModels.map((item) => item.id),
      selectedSamples,
      "businessModelIds",
    ),
    populationSegments: unique(
      selectedSamples.flatMap((sample) => sample.populationSegments),
    ),
  };
  const taxonomyCounts = new Map<string, number>();
  for (const sample of selectedSamples) {
    for (const id of unique(sample.axisAssignments.taxonomyIds)) {
      taxonomyCounts.set(id, (taxonomyCounts.get(id) ?? 0) + 1);
    }
  }
  const requirements =
    industryPlan.representativeSamplingPlan.coverageRequirements;
  const taxonomyItemsMeetingMinimum = industryPlan.taxonomy.filter(
    (item) =>
      (taxonomyCounts.get(item.id) ?? 0) >=
      requirements.minSamplesPerTaxonomyItem,
  ).length;
  const gatePassed =
    taxonomyItemsMeetingMinimum === industryPlan.taxonomy.length &&
    coverage.priceTiers.coveredIds.length >=
      requirements.minCoveredPriceTiers &&
    coverage.channels.coveredIds.length >= requirements.minCoveredChannels &&
    coverage.businessModels.coveredIds.length >=
      requirements.minCoveredBusinessModels &&
    coverage.populationSegments.length >= minPopulationSegments;
  const coverageGate = {
    taxonomyItemsMeetingMinimum,
    requiredTaxonomyItems: industryPlan.taxonomy.length,
    coveredPriceTiers: coverage.priceTiers.coveredIds.length,
    requiredPriceTiers: requirements.minCoveredPriceTiers,
    coveredChannels: coverage.channels.coveredIds.length,
    requiredChannels: requirements.minCoveredChannels,
    coveredBusinessModels: coverage.businessModels.coveredIds.length,
    requiredBusinessModels: requirements.minCoveredBusinessModels,
    coveredPopulationSegments: coverage.populationSegments.length,
    requiredPopulationSegments: minPopulationSegments,
    status: gatePassed
      ? ("pass" as const)
      : ("blocked_insufficient_coverage" as const),
  };
  const uncoveredAxisItemIds = [
    ...coverage.taxonomy.uncoveredIds,
    ...coverage.valueChain.uncoveredIds,
    ...coverage.priceTiers.uncoveredIds,
    ...coverage.channels.uncoveredIds,
    ...coverage.consumerNeeds.uncoveredIds,
    ...coverage.businessModels.uncoveredIds,
  ];
  const competitorSampleIds = selectedSamples
    .filter((sample) => sample.relationshipToIndustry === "direct_competitor")
    .map((sample) => sample.id);
  const analogySampleIds = selectedSamples
    .filter(
      (sample) => sample.relationshipToIndustry === "business_model_analogy",
    )
    .map((sample) => sample.id);
  const gaps = gatePassed
    ? ["抽样覆盖门已通过，但所有样本仍需在 module_research 采集 evidence。"]
    : [
        "代表性覆盖不足，禁止进入 module_research 和综合判断。",
        ...uncoveredAxisItemIds.map((id) => `uncovered_axis_item:${id}`),
      ];

  return {
    schemaVersion: industryRepresentativeSamplePlanSchemaVersion,
    artifactType: "industry-representative-sample-plan",
    planId: `representative-sample-plan-${stableHash(
      JSON.stringify({
        industryPlanId: industryPlan.planId,
        sourceCandidatePlanId: sourceCandidatePlan.planId,
        candidates: input.samplingCandidates,
        minPopulationSegments,
      }),
    )}`,
    industryPlanId: industryPlan.planId,
    sourceCandidatePlanId: sourceCandidatePlan.planId,
    selectedSamples,
    excludedCandidates,
    coverage,
    coverageGate,
    competitorSampleIds,
    analogySampleIds,
    uncoveredAxisItemIds,
    gaps,
    nextStageAllowed: gatePassed ? "module_research" : null,
    assertions: {
      searchRankDeterminedSelection: false,
      businessModelAnalogyCountedAsCompetitor: false,
      sourceCandidatesTreatedAsEvidence: false,
      synthesisAllowed: false,
      liveProviderCalls: 0,
    },
  };
}

export function serializeIndustryRepresentativeSamplePlan(
  plan: IndustryRepresentativeSamplePlan,
) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
