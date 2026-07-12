import { applyEvidenceRoleGate } from "./evidence-role-gate";
import { validateEvidenceQuotes } from "./extraction-validator";
import type {
  IndustryCoverageAxisType,
  IndustryPlan,
  IndustryPlanClaimRole,
  IndustryPlanSourceRole,
  IndustryRepresentativeSample,
  IndustryResearchModule,
} from "./industry-planner";
import type { IndustryRepresentativeSamplePlan } from "./industry-sampling";
import type { Evidence, RawDocument, ResearchSource } from "./types";

export const industryModuleResultSchemaVersion =
  "industry_module_result.v1" as const;
export const industryModuleResultsSchemaVersion =
  "industry_module_results.v1" as const;
export const industryResearchModuleOrder = [
  "market_landscape",
  "regulation_and_standards",
  "consumer_demand",
  "ecommerce_competitor_research",
  "content_and_traffic",
  "business_model_and_supply_chain",
] as const satisfies readonly IndustryResearchModule["id"][];

export type IndustryModuleClaimInput = {
  claimId: string;
  statement: string;
  claimRole: IndustryPlanClaimRole;
  evidenceIds: string[];
  axisItemIds: string[];
  representativeSampleIds: string[];
};

export type IndustryModuleClaimResult = IndustryModuleClaimInput & {
  status: "confirmed" | "blocked";
  sourceIds: string[];
  sourceRoles: IndustryPlanSourceRole[];
  rawDocumentIds: string[];
  quotes: Array<{
    evidenceId: string;
    sourceId: string;
    rawDocumentId: string;
    quote: string;
  }>;
  failures: string[];
};

export type IndustryModuleCoverageResult = {
  coverageRowId: string;
  axisType: IndustryCoverageAxisType;
  targetAxisItemIds: string[];
  coveredAxisItemIds: string[];
  uncoveredAxisItemIds: string[];
  independentSourceIds: string[];
  sourceRoles: IndustryPlanSourceRole[];
  representativeSampleIds: string[];
  target: {
    minIndependentSources: number;
    minSourceRoles: number;
    minRepresentativeSamples: number;
  };
  status: "pass" | "blocked";
  gaps: string[];
};

export type IndustryModuleResult = {
  schemaVersion: typeof industryModuleResultSchemaVersion;
  artifactType: "industry-module-result";
  resultId: string;
  industryPlanId: string;
  representativeSamplePlanId: string;
  moduleId: IndustryResearchModule["id"];
  moduleName: string;
  status:
    | "complete"
    | "blocked_missing_evidence"
    | "blocked_insufficient_coverage";
  claims: IndustryModuleClaimResult[];
  coverage: IndustryModuleCoverageResult[];
  gaps: string[];
  assertions: {
    candidateInputsTreatedAsEvidence: false;
    contractFixtureTreatedAsExternalFact: false;
    allConfirmedClaimsTraceable: boolean;
    moduleFailureIsolated: true;
    liveProviderCalls: 0;
  };
};

export type IndustryModuleRunInput = {
  moduleId: IndustryResearchModule["id"];
  claimInputs: IndustryModuleClaimInput[];
  sources: ResearchSource[];
  rawDocuments: RawDocument[];
  evidence: Evidence[];
};

export type IndustryModuleResultsArtifact = {
  schemaVersion: typeof industryModuleResultsSchemaVersion;
  artifactType: "industry-module-results";
  industryPlanId: string;
  representativeSamplePlanId: string;
  moduleOrder: IndustryResearchModule["id"][];
  status: "complete" | "blocked";
  moduleResults: IndustryModuleResult[];
  blockedModuleIds: IndustryResearchModule["id"][];
  gaps: string[];
  assertions: {
    eachModuleEvaluatedExactlyOnce: true;
    moduleFailuresIsolated: true;
    synthesisAllowed: false;
    contractFixtureTreatedAsExternalFact: false;
    liveProviderCalls: 0;
  };
};

function unique<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function moduleClaimGuardrailFailures(input: {
  moduleId: IndustryResearchModule["id"];
  statement: string;
  sourceRoles: IndustryPlanSourceRole[];
}) {
  const failures: string[] = [];
  if (
    input.moduleId === "content_and_traffic" &&
    /(?:转化|conversion)/i.test(input.statement)
  ) {
    failures.push("content_metrics_cannot_support_conversion_claim");
  }
  if (
    input.moduleId === "ecommerce_competitor_research" &&
    /(?:全行业|industry[- ]wide|overall market)/i.test(input.statement)
  ) {
    failures.push("brand_claim_cannot_be_industry_wide");
  }
  if (
    input.moduleId === "business_model_and_supply_chain" &&
    /(?:盈利|利润|毛利|profit|margin)/i.test(input.statement) &&
    !input.sourceRoles.includes("financial_report")
  ) {
    failures.push("profitability_requires_financial_report");
  }
  return failures;
}

const moduleSampleRelationships: Record<
  IndustryResearchModule["id"],
  IndustryRepresentativeSample["relationshipToIndustry"][]
> = {
  market_landscape: [],
  regulation_and_standards: [],
  consumer_demand: ["direct_competitor"],
  ecommerce_competitor_research: ["direct_competitor", "channel_actor"],
  content_and_traffic: ["content_actor"],
  business_model_and_supply_chain: [
    "supply_chain_actor",
    "channel_actor",
    "business_model_analogy",
  ],
};

const sampleAssignmentKeyByAxis: Partial<
  Record<
    IndustryCoverageAxisType,
    keyof IndustryRepresentativeSample["axisAssignments"]
  >
> = {
  taxonomy: "taxonomyIds",
  value_chain: "valueChainIds",
  price_tier: "priceTierIds",
  channel: "channelIds",
  consumer_need: "consumerNeedIds",
  business_model: "businessModelIds",
};

function claimResult(input: {
  claim: IndustryModuleClaimInput;
  module: IndustryResearchModule;
  sources: ResearchSource[];
  rawDocuments: RawDocument[];
  evidence: Evidence[];
  validAxisItemIds: Set<string>;
  representativeSamples: IndustryRepresentativeSample[];
  moduleAxisTypes: IndustryCoverageAxisType[];
}): IndustryModuleClaimResult {
  const { claim, module, sources, rawDocuments, evidence } = input;
  const failures: string[] = [];
  if (!claim.claimId.trim()) failures.push("claim_id_required");
  if (!claim.statement.trim()) failures.push("claim_statement_required");
  if (!module.targetClaimRoles.includes(claim.claimRole)) {
    failures.push(`claim_role_not_allowed_for_module:${claim.claimRole}`);
  }
  if (claim.evidenceIds.length === 0) failures.push("claim_evidence_required");
  for (const axisItemId of claim.axisItemIds) {
    if (!input.validAxisItemIds.has(axisItemId)) {
      failures.push(`unknown_axis_item:${axisItemId}`);
    }
  }
  for (const sampleId of claim.representativeSampleIds) {
    const sample = input.representativeSamples.find(
      (entry) => entry.id === sampleId,
    );
    if (!sample) {
      failures.push(`unknown_representative_sample:${sampleId}`);
      continue;
    }
    if (
      !moduleSampleRelationships[module.id].includes(
        sample.relationshipToIndustry,
      )
    ) {
      failures.push(`sample_relationship_not_allowed:${sampleId}`);
    }
    const contributesToClaimAxis = input.moduleAxisTypes.some((axisType) => {
      const key = sampleAssignmentKeyByAxis[axisType];
      return key
        ? sample.axisAssignments[key].some((id) =>
            claim.axisItemIds.includes(id),
          )
        : false;
    });
    if (!contributesToClaimAxis) {
      failures.push(`sample_does_not_cover_claim_axis:${sampleId}`);
    }
  }

  const boundEvidence = claim.evidenceIds.map((id) =>
    evidence.find((item) => item.id === id),
  );
  if (boundEvidence.some((item) => !item)) {
    failures.push("claim_evidence_missing");
  }
  const foundEvidence = boundEvidence.filter((item): item is Evidence =>
    Boolean(item),
  );
  const quotes: IndustryModuleClaimResult["quotes"] = [];
  const sourceIds: string[] = [];
  const sourceRoles: IndustryPlanSourceRole[] = [];
  const rawDocumentIds: string[] = [];

  for (const item of foundEvidence) {
    if (item.claimRole !== claim.claimRole) {
      failures.push(`evidence_claim_role_mismatch:${item.id}`);
    }
    const rawDocument = item.rawDocumentId
      ? rawDocuments.find((raw) => raw.id === item.rawDocumentId)
      : undefined;
    const source = sources.find((entry) => entry.id === item.sourceId);
    if (!rawDocument) failures.push(`raw_document_missing:${item.id}`);
    if (!source) failures.push(`source_missing:${item.id}`);
    if (rawDocument && rawDocument.sourceId !== item.sourceId) {
      failures.push(`evidence_raw_source_mismatch:${item.id}`);
    }
    if (!rawDocument || !source) continue;

    const gated = applyEvidenceRoleGate({
      evidence: item,
      rawDocuments: [rawDocument],
      sources: [source],
    });
    const validation = validateEvidenceQuotes(
      [
        {
          quote: item.quote,
          rawDocumentId: rawDocument.id,
          sourceId: source.id,
          url: rawDocument.url,
        },
      ],
      rawDocuments,
      {
        claimTexts: [claim.statement],
        requiredClaimTexts: [claim.statement],
        claimRole: claim.claimRole,
        requireDemandEvidence: claim.claimRole === "consumer_need",
      },
    );
    if (!gated.validation?.sourceAccepted) {
      failures.push(
        gated.validation?.roleFailureReason ??
          `evidence_role_gate_failed:${item.id}`,
      );
    }
    if (!validation.claimSupportComplete) {
      failures.push(
        ...validation.failureReasons.map(
          (reason) => `evidence_validation_failed:${item.id}:${reason}`,
        ),
      );
    }
    if (
      gated.validation?.sourceAccepted &&
      validation.claimSupportComplete &&
      source.industrySourceRole
    ) {
      sourceIds.push(source.id);
      sourceRoles.push(source.industrySourceRole);
      rawDocumentIds.push(rawDocument.id);
      quotes.push({
        evidenceId: item.id,
        sourceId: source.id,
        rawDocumentId: rawDocument.id,
        quote: item.quote,
      });
    }
  }

  failures.push(
    ...moduleClaimGuardrailFailures({
      moduleId: module.id,
      statement: claim.statement,
      sourceRoles: unique(sourceRoles),
    }),
  );

  const dedupedFailures = unique(failures);
  return {
    ...claim,
    status: dedupedFailures.length === 0 ? "confirmed" : "blocked",
    sourceIds: unique(sourceIds),
    sourceRoles: unique(sourceRoles),
    rawDocumentIds: unique(rawDocumentIds),
    quotes,
    failures: dedupedFailures,
  };
}

function coverageResult(input: {
  row: IndustryPlan["coverageMatrix"][number];
  confirmedClaims: IndustryModuleClaimResult[];
  representativeSamples: IndustryRepresentativeSample[];
}): IndustryModuleCoverageResult {
  const relevantClaims = input.confirmedClaims.filter((claim) =>
    claim.axisItemIds.some((id) => input.row.axisItemIds.includes(id)),
  );
  const claimCoveredAxisItemIds = unique(
    relevantClaims.flatMap((claim) => claim.axisItemIds),
  ).filter((id) => input.row.axisItemIds.includes(id));
  const boundSampleIds = unique(
    relevantClaims.flatMap((claim) => claim.representativeSampleIds),
  );
  const sampleAssignmentKey = sampleAssignmentKeyByAxis[input.row.axisType];
  const sampleCoveredAxisItemIds = sampleAssignmentKey
    ? unique(
        input.representativeSamples
          .filter((sample) => boundSampleIds.includes(sample.id))
          .flatMap((sample) => sample.axisAssignments[sampleAssignmentKey]),
      )
    : [];
  const coveredAxisItemIds =
    input.row.targetCoverage.minRepresentativeSamples > 0
      ? claimCoveredAxisItemIds.filter((id) =>
          sampleCoveredAxisItemIds.includes(id),
        )
      : claimCoveredAxisItemIds;
  const uncoveredAxisItemIds = input.row.axisItemIds.filter(
    (id) => !coveredAxisItemIds.includes(id),
  );
  const independentSourceIds = unique(
    relevantClaims.flatMap((claim) => claim.sourceIds),
  );
  const sourceRoles = unique(
    relevantClaims.flatMap((claim) => claim.sourceRoles),
  );
  const representativeSampleIds = boundSampleIds;
  const gaps: string[] = [];
  if (
    independentSourceIds.length < input.row.targetCoverage.minIndependentSources
  ) {
    gaps.push(
      `independent_sources:${independentSourceIds.length}/${input.row.targetCoverage.minIndependentSources}`,
    );
  }
  if (sourceRoles.length < input.row.targetCoverage.minSourceRoles) {
    gaps.push(
      `source_roles:${sourceRoles.length}/${input.row.targetCoverage.minSourceRoles}`,
    );
  }
  if (
    representativeSampleIds.length <
    input.row.targetCoverage.minRepresentativeSamples
  ) {
    gaps.push(
      `representative_samples:${representativeSampleIds.length}/${input.row.targetCoverage.minRepresentativeSamples}`,
    );
  }
  if (uncoveredAxisItemIds.length > 0) {
    gaps.push(`uncovered_axis_items:${uncoveredAxisItemIds.join(",")}`);
  }
  return {
    coverageRowId: input.row.id,
    axisType: input.row.axisType,
    targetAxisItemIds: input.row.axisItemIds,
    coveredAxisItemIds,
    uncoveredAxisItemIds,
    independentSourceIds,
    sourceRoles,
    representativeSampleIds,
    target: {
      minIndependentSources: input.row.targetCoverage.minIndependentSources,
      minSourceRoles: input.row.targetCoverage.minSourceRoles,
      minRepresentativeSamples:
        input.row.targetCoverage.minRepresentativeSamples,
    },
    status: gaps.length === 0 ? "pass" : "blocked",
    gaps,
  };
}

export function createIndustryModuleResult(input: {
  industryPlan: IndustryPlan;
  representativeSamplePlan: IndustryRepresentativeSamplePlan;
  moduleId: IndustryResearchModule["id"];
  claimInputs: IndustryModuleClaimInput[];
  sources: ResearchSource[];
  rawDocuments: RawDocument[];
  evidence: Evidence[];
}): IndustryModuleResult {
  const { industryPlan, representativeSamplePlan } = input;
  if (representativeSamplePlan.industryPlanId !== industryPlan.planId) {
    throw new Error("industry_module_sample_plan_mismatch");
  }
  const module = industryPlan.researchModules.find(
    (item) => item.id === input.moduleId,
  );
  if (!module) throw new Error(`industry_module_missing:${input.moduleId}`);
  const moduleRows = industryPlan.coverageMatrix.filter(
    (row) => row.moduleId === input.moduleId,
  );
  if (moduleRows.length === 0) {
    throw new Error(`industry_module_coverage_rows_missing:${input.moduleId}`);
  }
  const validAxisItemIds = new Set(
    moduleRows.flatMap((row) => row.axisItemIds),
  );
  const moduleAxisTypes = unique(moduleRows.map((row) => row.axisType));
  const claims = input.claimInputs.map((claim) =>
    claimResult({
      claim,
      module,
      sources: input.sources,
      rawDocuments: input.rawDocuments,
      evidence: input.evidence,
      validAxisItemIds,
      representativeSamples: representativeSamplePlan.selectedSamples,
      moduleAxisTypes,
    }),
  );
  const confirmedClaims = claims.filter(
    (claim) => claim.status === "confirmed",
  );
  const coverage = moduleRows.map((row) =>
    coverageResult({
      row,
      confirmedClaims,
      representativeSamples: representativeSamplePlan.selectedSamples,
    }),
  );
  const gaps = unique([
    ...claims.flatMap((claim) =>
      claim.failures.map((failure) => `${claim.claimId}:${failure}`),
    ),
    ...coverage.flatMap((row) =>
      row.gaps.map((gap) => `${row.coverageRowId}:${gap}`),
    ),
  ]);
  const status =
    confirmedClaims.length === 0
      ? "blocked_missing_evidence"
      : coverage.every((row) => row.status === "pass")
        ? "complete"
        : "blocked_insufficient_coverage";
  return {
    schemaVersion: industryModuleResultSchemaVersion,
    artifactType: "industry-module-result",
    resultId: `${industryPlan.planId}:${input.moduleId}`,
    industryPlanId: industryPlan.planId,
    representativeSamplePlanId: representativeSamplePlan.planId,
    moduleId: input.moduleId,
    moduleName: module.name,
    status,
    claims,
    coverage,
    gaps,
    assertions: {
      candidateInputsTreatedAsEvidence: false,
      contractFixtureTreatedAsExternalFact: false,
      allConfirmedClaimsTraceable: confirmedClaims.every(
        (claim) =>
          claim.quotes.length > 0 &&
          claim.sourceIds.length > 0 &&
          claim.rawDocumentIds.length > 0,
      ),
      moduleFailureIsolated: true,
      liveProviderCalls: 0,
    },
  };
}

export function serializeIndustryModuleResult(result: IndustryModuleResult) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function createIndustryModuleResultsArtifact(input: {
  industryPlan: IndustryPlan;
  representativeSamplePlan: IndustryRepresentativeSamplePlan;
  moduleInputs: IndustryModuleRunInput[];
}): IndustryModuleResultsArtifact {
  const moduleIds = input.moduleInputs.map((item) => item.moduleId);
  if (
    moduleIds.length !== industryResearchModuleOrder.length ||
    new Set(moduleIds).size !== industryResearchModuleOrder.length ||
    industryResearchModuleOrder.some(
      (moduleId) => !moduleIds.includes(moduleId),
    )
  ) {
    throw new Error("industry_module_results_six_unique_modules_required");
  }
  const moduleResults = industryResearchModuleOrder.map((moduleId) => {
    const moduleInput = input.moduleInputs.find(
      (item) => item.moduleId === moduleId,
    );
    if (!moduleInput) {
      throw new Error(`industry_module_results_input_missing:${moduleId}`);
    }
    return createIndustryModuleResult({
      industryPlan: input.industryPlan,
      representativeSamplePlan: input.representativeSamplePlan,
      ...moduleInput,
    });
  });
  const blockedModuleIds = moduleResults
    .filter((result) => result.status !== "complete")
    .map((result) => result.moduleId);
  return {
    schemaVersion: industryModuleResultsSchemaVersion,
    artifactType: "industry-module-results",
    industryPlanId: input.industryPlan.planId,
    representativeSamplePlanId: input.representativeSamplePlan.planId,
    moduleOrder: [...industryResearchModuleOrder],
    status: blockedModuleIds.length === 0 ? "complete" : "blocked",
    moduleResults,
    blockedModuleIds,
    gaps: moduleResults.flatMap((result) =>
      result.gaps.map((gap) => `${result.moduleId}:${gap}`),
    ),
    assertions: {
      eachModuleEvaluatedExactlyOnce: true,
      moduleFailuresIsolated: true,
      synthesisAllowed: false,
      contractFixtureTreatedAsExternalFact: false,
      liveProviderCalls: 0,
    },
  };
}

export function serializeIndustryModuleResultsArtifact(
  artifact: IndustryModuleResultsArtifact,
) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
