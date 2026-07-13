import type {
  IndustryAtomicClaim,
  IndustryAtomicClaimsArtifact,
} from "./industry-atomic-claims";
import {
  createResearchDecisionGuidance,
  type ResearchDecisionGuidance,
} from "./research-decision";

export const industryOpportunityHypothesesSchemaVersion =
  "industry_opportunity_hypotheses.v1" as const;

export type IndustryHypothesisValidationPlan = {
  method: string;
  participantProfile: string;
  minimumSampleSize: number;
  steps: string[];
  successCriteria: string[];
  failureCriteria: string[];
  stopConditions: string[];
  permissionRequiredBeforeExecution: "L5";
  executionStatus: "not_started";
};

export type IndustryOpportunityHypothesisCandidate = {
  hypothesisId: string;
  title: string;
  hypothesisStatement: string;
  targetUser: string;
  problem: string;
  supportingClaimIds: string[];
  assumptions: string[];
  unknowns: string[];
  validationPlan: IndustryHypothesisValidationPlan;
};

export type IndustryOpportunityHypothesis =
  IndustryOpportunityHypothesisCandidate & {
    status: "unverified_opportunity_hypothesis";
    factBasis: Array<
      Pick<
        IndustryAtomicClaim,
        | "claimId"
        | "statement"
        | "claimRole"
        | "sourceRole"
        | "coverageRowId"
        | "rawDocumentId"
        | "sourceUrl"
        | "quote"
      >
    >;
    commercializationAssessment: "not_evaluated";
    assertions: {
      supportingFactsDoNotProveHypothesis: true;
      unknownsRemainExplicit: true;
      validationNotExecuted: true;
      successAndFailureArePredeclared: true;
      noCommercializationDecision: true;
    };
  };

export type IndustryOpportunityHypothesisRejection = {
  hypothesisId: string;
  failures: string[];
};

export type IndustryOpportunityHypothesesArtifact = {
  schemaVersion: typeof industryOpportunityHypothesesSchemaVersion;
  artifactType: "industry-opportunity-hypotheses";
  runId: string;
  category: string;
  hypotheses: IndustryOpportunityHypothesis[];
  rejectedCandidates: IndustryOpportunityHypothesisRejection[];
  decisionGuidance: ResearchDecisionGuidance;
  summary: {
    inputCandidateCount: number;
    unverifiedHypothesisCount: number;
    rejectedCandidateCount: number;
    supportingAtomicClaimCount: number;
    minimumPlannedParticipantSessions: number;
    validationExecutionsCompleted: 0;
  };
  assertions: {
    allHypothesesAreUnverified: true;
    allFactBindingsResolve: true;
    allUnknownsExplicit: true;
    everyPlanHasMeasurableSuccessAndFailure: true;
    commercializationDecisionProduced: false;
    llmRequests: 0;
    externalMessagesSent: 0;
    productionWrite: false;
  };
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function nonEmpty(values: string[]) {
  return values.length > 0 && values.every((value) => value.trim().length > 0);
}

function candidateFailures(
  candidate: IndustryOpportunityHypothesisCandidate,
  atomicClaimById: Map<string, IndustryAtomicClaim>,
) {
  const failures: string[] = [];
  if (!candidate.hypothesisId.trim()) failures.push("hypothesis_id_required");
  if (!candidate.title.startsWith("待验证：")) {
    failures.push("hypothesis_title_must_be_explicitly_unverified");
  }
  if (!/(?:可能|待验证|如果.+那么)/.test(candidate.hypothesisStatement)) {
    failures.push("hypothesis_uncertainty_language_required");
  }
  const prohibitedConclusion =
    /(?:已确认(?:的)?(?:市场)?机会|市场已经证明|必然|一定会|应该推出|建议推出|停止商业化|终止商业化|值得进入|不值得进入|巨大机会|蓝海市场)/;
  if (
    prohibitedConclusion.test(
      `${candidate.title}\n${candidate.hypothesisStatement}\n${candidate.problem}`,
    )
  ) {
    failures.push("commercialization_or_certainty_conclusion_forbidden");
  }
  if (candidate.targetUser.trim().length < 6) {
    failures.push("target_user_not_specific");
  }
  if (candidate.problem.trim().length < 8) {
    failures.push("target_problem_not_specific");
  }
  if (!nonEmpty(candidate.supportingClaimIds)) {
    failures.push("supporting_atomic_claim_required");
  }
  for (const claimId of candidate.supportingClaimIds) {
    if (!atomicClaimById.has(claimId)) {
      failures.push(`supporting_atomic_claim_missing:${claimId}`);
    }
  }
  if (candidate.assumptions.length < 1 || !nonEmpty(candidate.assumptions)) {
    failures.push("hypothesis_assumptions_required");
  }
  if (candidate.unknowns.length < 2 || !nonEmpty(candidate.unknowns)) {
    failures.push("at_least_two_unknowns_required");
  }
  const plan = candidate.validationPlan;
  if (!plan.method.trim() || !plan.participantProfile.trim()) {
    failures.push("validation_method_and_participant_profile_required");
  }
  if (!Number.isInteger(plan.minimumSampleSize) || plan.minimumSampleSize < 3) {
    failures.push("validation_minimum_sample_size_below_3");
  }
  if (!nonEmpty(plan.steps)) failures.push("validation_steps_required");
  if (!nonEmpty(plan.successCriteria)) {
    failures.push("validation_success_criteria_required");
  }
  if (!nonEmpty(plan.failureCriteria)) {
    failures.push("validation_failure_criteria_required");
  }
  if (
    [...plan.successCriteria, ...plan.failureCriteria].some(
      (criterion) => !/\d/.test(criterion),
    )
  ) {
    failures.push("validation_criteria_must_be_measurable");
  }
  if (!nonEmpty(plan.stopConditions)) {
    failures.push("validation_stop_conditions_required");
  }
  if (
    plan.permissionRequiredBeforeExecution !== "L5" ||
    plan.executionStatus !== "not_started"
  ) {
    failures.push("validation_must_remain_not_started_behind_L5");
  }
  return unique(failures);
}

export function createIndustryOpportunityHypothesesArtifact(input: {
  runId: string;
  category: string;
  atomicClaims: IndustryAtomicClaimsArtifact;
  candidates: IndustryOpportunityHypothesisCandidate[];
  unresolvedCoverageGapCount: number;
}): IndustryOpportunityHypothesesArtifact {
  if (!input.runId.trim() || !input.category.trim()) {
    throw new Error("industry_hypotheses_identity_required");
  }
  if (
    !Number.isInteger(input.unresolvedCoverageGapCount) ||
    input.unresolvedCoverageGapCount < 0
  ) {
    throw new Error("industry_hypotheses_coverage_gap_count_invalid");
  }
  const atomicClaimById = new Map(
    input.atomicClaims.claims.map((claim) => [claim.claimId, claim]),
  );
  const seenIds = new Set<string>();
  const hypotheses: IndustryOpportunityHypothesis[] = [];
  const rejectedCandidates: IndustryOpportunityHypothesisRejection[] = [];
  for (const candidate of input.candidates) {
    const failures = candidateFailures(candidate, atomicClaimById);
    if (seenIds.has(candidate.hypothesisId)) {
      failures.push("hypothesis_id_duplicate");
    }
    seenIds.add(candidate.hypothesisId);
    if (failures.length > 0) {
      rejectedCandidates.push({
        hypothesisId: candidate.hypothesisId,
        failures: unique(failures),
      });
      continue;
    }
    hypotheses.push({
      ...candidate,
      supportingClaimIds: unique(candidate.supportingClaimIds),
      assumptions: unique(candidate.assumptions),
      unknowns: unique(candidate.unknowns),
      factBasis: unique(candidate.supportingClaimIds).map((claimId) => {
        const claim = atomicClaimById.get(claimId);
        if (!claim)
          throw new Error(`hypothesis_claim_binding_missing:${claimId}`);
        return {
          claimId: claim.claimId,
          statement: claim.statement,
          claimRole: claim.claimRole,
          sourceRole: claim.sourceRole,
          coverageRowId: claim.coverageRowId,
          rawDocumentId: claim.rawDocumentId,
          sourceUrl: claim.sourceUrl,
          quote: claim.quote,
        };
      }),
      status: "unverified_opportunity_hypothesis",
      commercializationAssessment: "not_evaluated",
      assertions: {
        supportingFactsDoNotProveHypothesis: true,
        unknownsRemainExplicit: true,
        validationNotExecuted: true,
        successAndFailureArePredeclared: true,
        noCommercializationDecision: true,
      },
    });
  }
  const supportingAtomicClaimIds = new Set(
    hypotheses.flatMap((hypothesis) => hypothesis.supportingClaimIds),
  );
  return {
    schemaVersion: industryOpportunityHypothesesSchemaVersion,
    artifactType: "industry-opportunity-hypotheses",
    runId: input.runId,
    category: input.category,
    hypotheses,
    rejectedCandidates,
    decisionGuidance: createResearchDecisionGuidance({
      evidenceMode: "verified_external_evidence",
      acceptedEvidenceCount:
        input.atomicClaims.summary.immutableRawDocumentCount,
      confirmedFindingCount:
        input.atomicClaims.summary.confirmedAtomicClaimCount,
      actionableHypothesisCount: hypotheses.length,
      technicalFailureCount: 0,
      coverageGapCount: input.unresolvedCoverageGapCount,
    }),
    summary: {
      inputCandidateCount: input.candidates.length,
      unverifiedHypothesisCount: hypotheses.length,
      rejectedCandidateCount: rejectedCandidates.length,
      supportingAtomicClaimCount: supportingAtomicClaimIds.size,
      minimumPlannedParticipantSessions: hypotheses.reduce(
        (total, hypothesis) =>
          total + hypothesis.validationPlan.minimumSampleSize,
        0,
      ),
      validationExecutionsCompleted: 0,
    },
    assertions: {
      allHypothesesAreUnverified: true,
      allFactBindingsResolve: true,
      allUnknownsExplicit: true,
      everyPlanHasMeasurableSuccessAndFailure: true,
      commercializationDecisionProduced: false,
      llmRequests: 0,
      externalMessagesSent: 0,
      productionWrite: false,
    },
  };
}

export function serializeIndustryOpportunityHypothesesArtifact(
  artifact: IndustryOpportunityHypothesesArtifact,
) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
