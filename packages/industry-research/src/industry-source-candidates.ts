import type {
  IndustryCoverageMatrixRow,
  IndustryPlan,
  IndustryPlanClaimRole,
  IndustryPlanSourceRole,
  IndustryResearchModule,
} from "./industry-planner";

export const industrySourceCandidatePlanSchemaVersion =
  "industry_source_candidate_plan.v1" as const;

export type IndustrySourceCandidateInput = {
  name: string;
  url: string;
  sourceRole: IndustryPlanSourceRole;
  discoveryMethod:
    | "official_public_seed"
    | "manual_public_seed"
    | "no_key_public_search";
  priority: "critical" | "high" | "medium" | "low";
  estimatedPublicRequests: number;
  access: {
    loginRequired: boolean;
    cookieRequired: boolean;
    apiKeyRequired: boolean;
    creditsRequired: boolean;
    paywallExpected: boolean;
    captchaExpected: boolean;
    privateDataExpected: boolean;
  };
  notes?: string[];
};

export type NoKeyPublicDiscoveryRecord = {
  name: string;
  url: string;
  sourceRole: IndustryPlanSourceRole;
  query: string;
  resultRank: number;
};

export type IndustrySourceCandidate = {
  id: string;
  name: string;
  url: string;
  canonicalUrl: string;
  hostname: string;
  sourceRole: IndustryPlanSourceRole;
  allowedClaimRoles: IndustryPlanClaimRole[];
  moduleIds: IndustryResearchModule["id"][];
  coverageRowIds: string[];
  coverageAssignments: Array<{
    coverageRowId: string;
    axisType: IndustryCoverageMatrixRow["axisType"];
    axisItemIds: string[];
  }>;
  discoveryMethod: IndustrySourceCandidateInput["discoveryMethod"];
  priority: IndustrySourceCandidateInput["priority"];
  estimatedPublicRequests: number;
  status: "eligible_candidate" | "blocked" | "duplicate";
  evidenceStatus: "candidate_not_evidence";
  compliance: IndustrySourceCandidateInput["access"] & {
    publicHttpUrl: boolean;
    accessStatus:
      | "public_no_auth_or_cost"
      | "restricted_or_costed"
      | "invalid_url";
  };
  blockReasons: string[];
  duplicateOfCandidateId: string | null;
  notes: string[];
};

export type IndustrySourceCandidateBudgetPolicy = {
  maxEligibleCandidates: number;
  maxPlannedPublicRequests: number;
  maxCandidatesPerSourceRole: number;
  maxCandidatesPerHostname: number;
  maxBrandControlledShare: number;
};

export type IndustrySourceCandidatePlan = {
  schemaVersion: typeof industrySourceCandidatePlanSchemaVersion;
  artifactType: "industry-source-candidate-plan";
  planId: string;
  industryPlanId: string;
  inputCoordinates: IndustryPlan["inputCoordinates"];
  budgetPolicy: IndustrySourceCandidateBudgetPolicy;
  budgetUsage: {
    plannedPublicRequests: number;
    livePublicRequestsUsed: 0;
    providerCallsUsed: 0;
    creditsUsed: 0;
  };
  candidates: IndustrySourceCandidate[];
  moduleCandidateCoverage: Array<{
    moduleId: IndustryResearchModule["id"];
    eligibleCandidateIds: string[];
    sourceRoles: IndustryPlanSourceRole[];
    status: "candidate_pool_present_not_evidence" | "blocked_candidate_gap";
  }>;
  coverageRowCandidateCoverage: Array<{
    coverageRowId: string;
    eligibleCandidateIds: string[];
    sourceRoles: IndustryPlanSourceRole[];
    status: "candidate_target_met_not_evidence" | "blocked_candidate_gap";
    gaps: string[];
  }>;
  gaps: string[];
  assertions: {
    candidatesAreEvidence: false;
    coverageEvidenceUpdated: false;
    livePublicRequestsUsed: 0;
    providerCallsUsed: 0;
    creditsUsed: 0;
  };
};

export const defaultIndustrySourceCandidateBudgetPolicy: IndustrySourceCandidateBudgetPolicy =
  {
    maxEligibleCandidates: 24,
    maxPlannedPublicRequests: 24,
    maxCandidatesPerSourceRole: 4,
    maxCandidatesPerHostname: 3,
    maxBrandControlledShare: 0.35,
  };

const brandControlledRoles = new Set<IndustryPlanSourceRole>([
  "brand_official_site",
  "official_store",
]);
const priorityRank: Record<IndustrySourceCandidateInput["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canonicalizePublicUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "msclkid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function accessBlockReasons(access: IndustrySourceCandidateInput["access"]) {
  const reasons: string[] = [];
  if (access.loginRequired) reasons.push("login_required");
  if (access.cookieRequired) reasons.push("cookie_required");
  if (access.apiKeyRequired) reasons.push("api_key_required");
  if (access.creditsRequired) reasons.push("credits_required");
  if (access.paywallExpected) reasons.push("paywall_expected");
  if (access.captchaExpected) reasons.push("captcha_expected");
  if (access.privateDataExpected) reasons.push("private_data_expected");
  return reasons;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function authorizedModules(
  plan: IndustryPlan,
  sourceRole: IndustryPlanSourceRole,
) {
  return plan.researchModules
    .filter((module) => module.allowedSourceRoles.includes(sourceRole))
    .map((module) => module.id);
}

function authorizedCoverageRows(
  plan: IndustryPlan,
  sourceRole: IndustryPlanSourceRole,
) {
  return plan.coverageMatrix.filter((row) =>
    row.allowedSourceRoles.includes(sourceRole),
  );
}

function candidateSourceRoles(candidates: IndustrySourceCandidate[]) {
  return unique(candidates.map((candidate) => candidate.sourceRole));
}

function candidateCoverageForRow(
  row: IndustryCoverageMatrixRow,
  candidates: IndustrySourceCandidate[],
) {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.status === "eligible_candidate" &&
      candidate.coverageRowIds.includes(row.id),
  );
  const roles = candidateSourceRoles(eligible);
  const targetMet =
    eligible.length >= row.targetCoverage.minIndependentSources &&
    roles.length >= row.targetCoverage.minSourceRoles;
  return {
    coverageRowId: row.id,
    eligibleCandidateIds: eligible.map((candidate) => candidate.id),
    sourceRoles: roles,
    status: targetMet
      ? ("candidate_target_met_not_evidence" as const)
      : ("blocked_candidate_gap" as const),
    gaps: targetMet
      ? ["候选数量达到规划门槛，但尚未采集、验证或更新 evidence coverage。"]
      : [
          `候选仅 ${eligible.length}/${row.targetCoverage.minIndependentSources} 个，来源角色 ${roles.length}/${row.targetCoverage.minSourceRoles} 类。`,
        ],
  };
}

export function sourceCandidateInputsFromPlannerCalibration(
  plan: IndustryPlan,
): IndustrySourceCandidateInput[] {
  return plan.planningCalibration.sources.map((source) => ({
    name: source.title,
    url: source.url,
    sourceRole: source.sourceRole,
    discoveryMethod: "official_public_seed",
    priority: "critical",
    estimatedPublicRequests: 1,
    access: {
      loginRequired: false,
      cookieRequired: false,
      apiKeyRequired: false,
      creditsRequired: false,
      paywallExpected: false,
      captchaExpected: false,
      privateDataExpected: false,
    },
    notes: [`Planner calibration source: ${source.id}`, ...source.limitations],
  }));
}

export function sourceCandidateInputsFromNoKeyPublicDiscovery(
  records: NoKeyPublicDiscoveryRecord[],
): IndustrySourceCandidateInput[] {
  return records.map((record) => ({
    name: record.name,
    url: record.url,
    sourceRole: record.sourceRole,
    discoveryMethod: "no_key_public_search",
    priority:
      record.resultRank <= 2
        ? "high"
        : record.resultRank <= 5
          ? "medium"
          : "low",
    estimatedPublicRequests: 1,
    access: {
      loginRequired: false,
      cookieRequired: false,
      apiKeyRequired: false,
      creditsRequired: false,
      paywallExpected: false,
      captchaExpected: false,
      privateDataExpected: false,
    },
    notes: [
      `no-key public query: ${record.query}`,
      `public result rank: ${record.resultRank}`,
      "搜索结果只进入候选池，不代表页面已抓取或声明已验证。",
    ],
  }));
}

export function createIndustrySourceCandidatePlan(input: {
  industryPlan: IndustryPlan;
  candidateInputs: IndustrySourceCandidateInput[];
  budgetPolicy?: Partial<IndustrySourceCandidateBudgetPolicy>;
}): IndustrySourceCandidatePlan {
  const plan = input.industryPlan;
  const budgetPolicy = {
    ...defaultIndustrySourceCandidateBudgetPolicy,
    ...input.budgetPolicy,
  };
  if (
    budgetPolicy.maxEligibleCandidates < 1 ||
    budgetPolicy.maxPlannedPublicRequests < 0 ||
    budgetPolicy.maxCandidatesPerSourceRole < 1 ||
    budgetPolicy.maxCandidatesPerHostname < 1 ||
    budgetPolicy.maxBrandControlledShare < 0 ||
    budgetPolicy.maxBrandControlledShare >= 1
  ) {
    throw new Error("industry_source_candidate_budget_policy_invalid");
  }

  const seenCanonicalUrls = new Map<string, string>();
  const candidates = input.candidateInputs.map((candidateInput, index) => {
    const canonicalUrl = canonicalizePublicUrl(candidateInput.url);
    const id = `source-candidate-${stableHash(
      `${canonicalUrl ?? candidateInput.url}:${candidateInput.sourceRole}`,
    )}`;
    const sourcePolicy = plan.sourceRolePolicy.find(
      (entry) => entry.sourceRole === candidateInput.sourceRole,
    );
    if (!sourcePolicy) {
      throw new Error(
        `industry_source_candidate_role_policy_missing:${candidateInput.sourceRole}`,
      );
    }
    const duplicateOfCandidateId = canonicalUrl
      ? (seenCanonicalUrls.get(canonicalUrl) ?? null)
      : null;
    if (canonicalUrl && !duplicateOfCandidateId) {
      seenCanonicalUrls.set(canonicalUrl, id);
    }
    const moduleIds = authorizedModules(plan, candidateInput.sourceRole);
    const coverageRows = authorizedCoverageRows(
      plan,
      candidateInput.sourceRole,
    );
    const accessReasons = accessBlockReasons(candidateInput.access);
    const blockReasons = [
      ...(canonicalUrl ? [] : ["invalid_public_http_url"]),
      ...accessReasons,
      ...(candidateInput.estimatedPublicRequests >= 0
        ? []
        : ["negative_request_estimate"]),
      ...(moduleIds.length > 0 ? [] : ["no_authorized_research_module"]),
    ];
    return {
      id,
      name: candidateInput.name.trim(),
      url: candidateInput.url,
      canonicalUrl: canonicalUrl ?? "",
      hostname: canonicalUrl ? new URL(canonicalUrl).hostname : "",
      sourceRole: candidateInput.sourceRole,
      allowedClaimRoles: [...sourcePolicy.allowedClaimRoles],
      moduleIds,
      coverageRowIds: coverageRows.map((row) => row.id),
      coverageAssignments: coverageRows.map((row) => ({
        coverageRowId: row.id,
        axisType: row.axisType,
        axisItemIds: [...row.axisItemIds],
      })),
      discoveryMethod: candidateInput.discoveryMethod,
      priority: candidateInput.priority,
      estimatedPublicRequests: Math.max(
        0,
        candidateInput.estimatedPublicRequests,
      ),
      status: duplicateOfCandidateId
        ? ("duplicate" as const)
        : blockReasons.length > 0
          ? ("blocked" as const)
          : ("eligible_candidate" as const),
      evidenceStatus: "candidate_not_evidence" as const,
      compliance: {
        ...candidateInput.access,
        publicHttpUrl: Boolean(canonicalUrl),
        accessStatus: !canonicalUrl
          ? "invalid_url"
          : accessReasons.length > 0
            ? "restricted_or_costed"
            : "public_no_auth_or_cost",
      },
      blockReasons: duplicateOfCandidateId
        ? ["duplicate_canonical_url"]
        : blockReasons,
      duplicateOfCandidateId,
      notes: [...(candidateInput.notes ?? []), `input-order:${index}`],
    } satisfies IndustrySourceCandidate;
  });

  const preliminarilyEligible = candidates
    .filter((candidate) => candidate.status === "eligible_candidate")
    .sort(
      (left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        left.canonicalUrl.localeCompare(right.canonicalUrl),
    );
  const nonBrandCandidates = preliminarilyEligible.filter(
    (candidate) => !brandControlledRoles.has(candidate.sourceRole),
  );
  const brandCandidates = preliminarilyEligible.filter((candidate) =>
    brandControlledRoles.has(candidate.sourceRole),
  );
  const roleCounts = new Map<IndustryPlanSourceRole, number>();
  const hostnameCounts = new Map<string, number>();
  let selectedCount = 0;
  let plannedPublicRequests = 0;

  const selectCandidate = (candidate: IndustrySourceCandidate) => {
    const roleCount = roleCounts.get(candidate.sourceRole) ?? 0;
    const hostnameCount = hostnameCounts.get(candidate.hostname) ?? 0;
    const reasons: string[] = [];
    if (selectedCount >= budgetPolicy.maxEligibleCandidates) {
      reasons.push("eligible_candidate_budget_exhausted");
    }
    if (roleCount >= budgetPolicy.maxCandidatesPerSourceRole) {
      reasons.push("source_role_quota_exhausted");
    }
    if (hostnameCount >= budgetPolicy.maxCandidatesPerHostname) {
      reasons.push("hostname_quota_exhausted");
    }
    if (
      plannedPublicRequests + candidate.estimatedPublicRequests >
      budgetPolicy.maxPlannedPublicRequests
    ) {
      reasons.push("planned_public_request_budget_exhausted");
    }
    if (reasons.length > 0) {
      candidate.status = "blocked";
      candidate.blockReasons.push(...reasons);
      return false;
    }
    selectedCount += 1;
    plannedPublicRequests += candidate.estimatedPublicRequests;
    roleCounts.set(candidate.sourceRole, roleCount + 1);
    hostnameCounts.set(candidate.hostname, hostnameCount + 1);
    return true;
  };

  for (const candidate of nonBrandCandidates) selectCandidate(candidate);
  const nonBrandSelectedCount = selectedCount;
  const maxBrandCount = Math.min(
    budgetPolicy.maxEligibleCandidates - nonBrandSelectedCount,
    Math.floor(
      (nonBrandSelectedCount * budgetPolicy.maxBrandControlledShare) /
        (1 - budgetPolicy.maxBrandControlledShare),
    ),
  );
  let brandSelectedCount = 0;
  for (const candidate of brandCandidates) {
    if (brandSelectedCount >= maxBrandCount) {
      candidate.status = "blocked";
      candidate.blockReasons.push("brand_controlled_share_quota_exhausted");
      continue;
    }
    if (selectCandidate(candidate)) brandSelectedCount += 1;
  }

  const eligibleCandidates = candidates.filter(
    (candidate) => candidate.status === "eligible_candidate",
  );
  const moduleCandidateCoverage = plan.researchModules.map((module) => {
    const eligible = eligibleCandidates.filter((candidate) =>
      candidate.moduleIds.includes(module.id),
    );
    return {
      moduleId: module.id,
      eligibleCandidateIds: eligible.map((candidate) => candidate.id),
      sourceRoles: candidateSourceRoles(eligible),
      status:
        eligible.length > 0
          ? ("candidate_pool_present_not_evidence" as const)
          : ("blocked_candidate_gap" as const),
    };
  });
  const coverageRowCandidateCoverage = plan.coverageMatrix.map((row) =>
    candidateCoverageForRow(row, candidates),
  );
  const gaps = [
    ...moduleCandidateCoverage
      .filter((coverage) => coverage.status === "blocked_candidate_gap")
      .map((coverage) => `module_candidate_gap:${coverage.moduleId}`),
    ...coverageRowCandidateCoverage
      .filter((coverage) => coverage.status === "blocked_candidate_gap")
      .map((coverage) => `coverage_candidate_gap:${coverage.coverageRowId}`),
  ];

  return {
    schemaVersion: industrySourceCandidatePlanSchemaVersion,
    artifactType: "industry-source-candidate-plan",
    planId: `source-candidate-plan-${stableHash(
      JSON.stringify({
        industryPlanId: plan.planId,
        candidateInputs: input.candidateInputs,
        budgetPolicy,
      }),
    )}`,
    industryPlanId: plan.planId,
    inputCoordinates: plan.inputCoordinates,
    budgetPolicy,
    budgetUsage: {
      plannedPublicRequests,
      livePublicRequestsUsed: 0,
      providerCallsUsed: 0,
      creditsUsed: 0,
    },
    candidates,
    moduleCandidateCoverage,
    coverageRowCandidateCoverage,
    gaps,
    assertions: {
      candidatesAreEvidence: false,
      coverageEvidenceUpdated: false,
      livePublicRequestsUsed: 0,
      providerCallsUsed: 0,
      creditsUsed: 0,
    },
  };
}

export function serializeIndustrySourceCandidatePlan(
  plan: IndustrySourceCandidatePlan,
) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
