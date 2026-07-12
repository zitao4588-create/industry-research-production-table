import {
  type IndustryPlanClaimRole,
  type IndustryPlanSourceRole,
  type IndustrySourceRolePolicyEntry,
  industrySourceRolePolicy,
} from "./industry-planner";
import type { Evidence, RawDocument, ResearchSource } from "./types";

export type EvidenceRoleGateResult = {
  roleAware: boolean;
  authorized: boolean;
  sourceRole?: IndustryPlanSourceRole;
  claimRole?: IndustryPlanClaimRole;
  failureReason?:
    | "source_role_missing"
    | "claim_role_missing"
    | "source_role_conflict"
    | "source_role_policy_missing"
    | `source_role_not_authorized:${IndustryPlanSourceRole}:${IndustryPlanClaimRole}`;
};

export function canIndustrySourceRoleSupportClaimRole(
  sourceRole: IndustryPlanSourceRole,
  claimRole: IndustryPlanClaimRole,
  policy: IndustrySourceRolePolicyEntry[] = industrySourceRolePolicy,
) {
  return Boolean(
    policy
      .find((entry) => entry.sourceRole === sourceRole)
      ?.allowedClaimRoles.includes(claimRole),
  );
}

export function evaluateEvidenceRoleGate(input: {
  source?: ResearchSource;
  rawDocument?: RawDocument;
  evidence?: Evidence;
  sourceRole?: IndustryPlanSourceRole;
  claimRole?: IndustryPlanClaimRole;
  requireRoleMetadata?: boolean;
  policy?: IndustrySourceRolePolicyEntry[];
}): EvidenceRoleGateResult {
  const roles = [
    input.sourceRole,
    input.evidence?.sourceRole,
    input.rawDocument?.industrySourceRole,
    input.source?.industrySourceRole,
  ].filter((role): role is IndustryPlanSourceRole => Boolean(role));
  const claimRole = input.claimRole ?? input.evidence?.claimRole;
  const roleAware = Boolean(
    input.requireRoleMetadata || roles.length > 0 || claimRole,
  );
  if (!roleAware) return { roleAware: false, authorized: true };
  const uniqueRoles = [...new Set(roles)];
  if (uniqueRoles.length === 0) {
    return {
      roleAware: true,
      authorized: false,
      claimRole,
      failureReason: "source_role_missing",
    };
  }
  const sourceRole = uniqueRoles[0];
  if (uniqueRoles.length > 1) {
    return {
      roleAware: true,
      authorized: false,
      sourceRole,
      claimRole,
      failureReason: "source_role_conflict",
    };
  }
  if (!claimRole) {
    return {
      roleAware: true,
      authorized: false,
      sourceRole,
      failureReason: "claim_role_missing",
    };
  }
  const policy = input.policy ?? industrySourceRolePolicy;
  const policyEntry = policy.find((entry) => entry.sourceRole === sourceRole);
  if (!policyEntry) {
    return {
      roleAware: true,
      authorized: false,
      sourceRole,
      claimRole,
      failureReason: "source_role_policy_missing",
    };
  }
  if (!policyEntry.allowedClaimRoles.includes(claimRole)) {
    return {
      roleAware: true,
      authorized: false,
      sourceRole,
      claimRole,
      failureReason: `source_role_not_authorized:${sourceRole}:${claimRole}`,
    };
  }
  return {
    roleAware: true,
    authorized: true,
    sourceRole,
    claimRole,
  };
}

export function applyEvidenceRoleGate(input: {
  evidence: Evidence;
  rawDocuments: RawDocument[];
  sources: ResearchSource[];
  requireRoleMetadata?: boolean;
}) {
  const rawDocument = input.rawDocuments.find(
    (document) => document.id === input.evidence.rawDocumentId,
  );
  const source = input.sources.find(
    (candidate) => candidate.id === input.evidence.sourceId,
  );
  const gate = evaluateEvidenceRoleGate({
    source,
    rawDocument,
    evidence: input.evidence,
    requireRoleMetadata: input.requireRoleMetadata,
  });
  if (!gate.roleAware) return input.evidence;
  return {
    ...input.evidence,
    sourceRole: gate.sourceRole,
    claimRole: gate.claimRole,
    validation: {
      ...input.evidence.validation,
      quoteMatched: input.evidence.validation?.quoteMatched ?? false,
      sourceAccepted:
        (input.evidence.validation?.sourceAccepted ?? false) && gate.authorized,
      roleAuthorized: gate.authorized,
      sourceRole: gate.sourceRole,
      claimRole: gate.claimRole,
      roleFailureReason: gate.failureReason,
    },
  } satisfies Evidence;
}

export function bindIndustrySourceRoleToRawDocument(
  document: RawDocument,
  sources: ResearchSource[],
) {
  const source = sources.find(
    (candidate) => candidate.id === document.sourceId,
  );
  if (!source?.industrySourceRole) return document;
  if (
    document.industrySourceRole &&
    document.industrySourceRole !== source.industrySourceRole
  ) {
    throw new Error(
      `industry_source_role_conflict:${document.id}:${source.industrySourceRole}:${document.industrySourceRole}`,
    );
  }
  return {
    ...document,
    industrySourceRole: source.industrySourceRole,
  } satisfies RawDocument;
}
