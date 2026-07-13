import type { IndustryAcquisitionRoute } from "./industry-acquisition-router";
import type { IndustryAcquisitionTaskPlan } from "./industry-acquisition-task";
import type { IndustryPlanSourceRole } from "./industry-planner";
import { canonicalizeIndustryRawDocumentUrl } from "./industry-raw-document-store";

export const industryM2WaveVerificationSchemaVersion =
  "industry_m2_wave_verification.v2" as const;

export type IndustryM2WaveRawDocumentInput = {
  id: string;
  url: string;
  title: string;
  extractedText: string;
  sourceQuality: {
    acceptedForReport: boolean;
  };
};

export type IndustryM2WaveVerification = {
  schemaVersion: typeof industryM2WaveVerificationSchemaVersion;
  artifactType: "industry-m2-wave-verification";
  runId: string;
  category: string;
  documentAudit: Array<{
    rawDocumentId: string;
    url: string;
    routeId: string | null;
    taskId: string | null;
    sourceRole: IndustryPlanSourceRole | null;
    categoryTermCount: number;
    conflictingTerms: string[];
    binaryPayloadDetected: boolean;
    officialAuthorityRecordOverride: boolean;
    legacySourceAccepted: boolean;
    status:
      | "raw_candidate_relevant_not_evidence"
      | "category_relevance_mismatch"
      | "source_quality_rejected"
      | "route_missing";
  }>;
  coverageRows: Array<{
    taskId: string;
    status: "raw_candidate_target_met_not_evidence" | "raw_candidate_gap";
    relevantRawDocumentIds: string[];
    independentSourceCount: number;
    sourceRoles: IndustryPlanSourceRole[];
    representativeSampleCount: 0;
    gaps: string[];
  }>;
  summary: {
    rawDocumentCount: number;
    relevantRawCandidateCount: number;
    categoryMismatchCount: number;
    sourceQualityRejectedCount: number;
    routeMissingCount: number;
    coverageRowsMetNotEvidence: number;
    coverageRowsWithGaps: number;
    criticalCoverageRowsMetNotEvidence: number;
    criticalCoverageRowsWithGaps: number;
    binaryPayloadCount: number;
    officialAuthorityRecordOverrideCount: number;
  };
  recommendedNextSourceRoles: IndustryPlanSourceRole[];
  decision: {
    canEnterM3: boolean;
    nextAction: "begin_m3_claim_extraction" | "continue_m2_4_targeted_waves";
    reason:
      | "critical_raw_candidate_coverage_met"
      | "critical_raw_candidate_coverage_gaps_remain";
  };
  assertions: {
    rawDocumentsAreNotEvidence: true;
    legacyAcceptedFlagIsNotSufficient: true;
    commercializationAssessed: false;
    reportGenerated: false;
  };
};

function normalized(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function termCount(value: string, terms: string[]) {
  return terms.reduce((total, term) => {
    const normalizedTerm = normalized(term);
    return total + normalized(value).split(normalizedTerm).length - 1;
  }, 0);
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function routeByCanonicalUrl(routes: IndustryAcquisitionRoute[]) {
  return new Map(
    routes.flatMap((route) => {
      const canonical = canonicalizeIndustryRawDocumentUrl(
        route.targetReference,
      );
      return canonical ? [[canonical, route] as const] : [];
    }),
  );
}

function priorityRank(priority: "critical" | "high" | "normal") {
  return priority === "critical" ? 0 : priority === "high" ? 1 : 2;
}

export function verifyIndustryM2Wave(input: {
  runId: string;
  category: string;
  categoryTerms: string[];
  conflictingCategoryTerms: string[];
  rawDocuments: IndustryM2WaveRawDocumentInput[];
  routes: IndustryAcquisitionRoute[];
  taskPlan: IndustryAcquisitionTaskPlan;
}): IndustryM2WaveVerification {
  if (
    !input.runId.trim() ||
    !input.category.trim() ||
    input.categoryTerms.length === 0
  ) {
    throw new Error("m2_wave_verification_input_invalid");
  }
  const routesByUrl = routeByCanonicalUrl(input.routes);
  const documentAudit = input.rawDocuments.map((document) => {
    const canonical = canonicalizeIndustryRawDocumentUrl(document.url);
    const route = canonical ? routesByUrl.get(canonical) : undefined;
    const searchable = `${document.title}\n${document.extractedText}`;
    const searchableTitleAndUrl = `${document.title}\n${document.url}`;
    const categoryTermCount = termCount(searchable, input.categoryTerms);
    const binaryPayloadDetected = document.extractedText
      .trimStart()
      .startsWith("%PDF-");
    const conflictingTerms = input.conflictingCategoryTerms.filter((term) =>
      normalized(searchableTitleAndUrl).includes(normalized(term)),
    );
    const officialAuthorityRecordOverride = Boolean(
      route &&
        ["standards_body", "regulator"].includes(route.sourceRole) &&
        categoryTermCount >= 2 &&
        /\bGB(?:\/T)?\s*\d{3,6}(?:\.\d+)?-\d{4}\b/i.test(searchable) &&
        ["发布单位", "发布日期", "实施日期"].filter((term) =>
          searchable.includes(term),
        ).length >= 2,
    );
    const status = !route
      ? ("route_missing" as const)
      : binaryPayloadDetected ||
          (!document.sourceQuality.acceptedForReport &&
            !officialAuthorityRecordOverride)
        ? ("source_quality_rejected" as const)
        : categoryTermCount < 2 || conflictingTerms.length > 0
          ? ("category_relevance_mismatch" as const)
          : ("raw_candidate_relevant_not_evidence" as const);
    return {
      rawDocumentId: document.id,
      url: document.url,
      routeId: route?.routeId ?? null,
      taskId: route?.taskId ?? null,
      sourceRole: route?.sourceRole ?? null,
      categoryTermCount,
      conflictingTerms,
      binaryPayloadDetected,
      officialAuthorityRecordOverride,
      legacySourceAccepted: document.sourceQuality.acceptedForReport,
      status,
    };
  });

  const coverageRows = input.taskPlan.tasks.map((task) => {
    const relevant = documentAudit.filter(
      (document) =>
        document.taskId === task.taskId &&
        document.status === "raw_candidate_relevant_not_evidence",
    );
    const independentSourceCount = new Set(
      relevant.map((document) => hostname(document.url)).filter(Boolean),
    ).size;
    const sourceRoles = [
      ...new Set(
        relevant
          .map((document) => document.sourceRole)
          .filter((role): role is IndustryPlanSourceRole => role !== null),
      ),
    ];
    const gaps = [
      ...(independentSourceCount < task.targetCoverage.minIndependentSources
        ? ["independent_source_coverage_missing"]
        : []),
      ...(sourceRoles.length < task.targetCoverage.minSourceRoles
        ? ["source_role_coverage_missing"]
        : []),
      ...(task.targetCoverage.minRepresentativeSamples > 0
        ? ["representative_sample_coverage_missing"]
        : []),
    ];
    return {
      taskId: task.taskId,
      status:
        gaps.length === 0
          ? ("raw_candidate_target_met_not_evidence" as const)
          : ("raw_candidate_gap" as const),
      relevantRawDocumentIds: relevant.map(
        (document) => document.rawDocumentId,
      ),
      independentSourceCount,
      sourceRoles,
      representativeSampleCount: 0 as const,
      gaps,
    };
  });
  const collectedRoles = new Set(
    documentAudit
      .filter(
        (document) => document.status === "raw_candidate_relevant_not_evidence",
      )
      .map((document) => document.sourceRole)
      .filter((role): role is IndustryPlanSourceRole => role !== null),
  );
  const tasksByPriority = [...input.taskPlan.tasks].sort(
    (left, right) =>
      priorityRank(left.priority) - priorityRank(right.priority) ||
      left.taskId.localeCompare(right.taskId),
  );
  const recommendedNextSourceRoles = [
    ...new Set(
      tasksByPriority.flatMap((task) =>
        task.allowedSourceRoles.filter((role) => !collectedRoles.has(role)),
      ),
    ),
  ].slice(0, 8);
  const summary = {
    rawDocumentCount: documentAudit.length,
    relevantRawCandidateCount: documentAudit.filter(
      (document) => document.status === "raw_candidate_relevant_not_evidence",
    ).length,
    categoryMismatchCount: documentAudit.filter(
      (document) => document.status === "category_relevance_mismatch",
    ).length,
    sourceQualityRejectedCount: documentAudit.filter(
      (document) => document.status === "source_quality_rejected",
    ).length,
    routeMissingCount: documentAudit.filter(
      (document) => document.status === "route_missing",
    ).length,
    coverageRowsMetNotEvidence: coverageRows.filter(
      (row) => row.status === "raw_candidate_target_met_not_evidence",
    ).length,
    coverageRowsWithGaps: coverageRows.filter(
      (row) => row.status === "raw_candidate_gap",
    ).length,
    criticalCoverageRowsMetNotEvidence: coverageRows.filter(
      (row) =>
        input.taskPlan.tasks.find((task) => task.taskId === row.taskId)
          ?.priority === "critical" &&
        row.status === "raw_candidate_target_met_not_evidence",
    ).length,
    criticalCoverageRowsWithGaps: coverageRows.filter(
      (row) =>
        input.taskPlan.tasks.find((task) => task.taskId === row.taskId)
          ?.priority === "critical" && row.status === "raw_candidate_gap",
    ).length,
    binaryPayloadCount: documentAudit.filter(
      (document) => document.binaryPayloadDetected,
    ).length,
    officialAuthorityRecordOverrideCount: documentAudit.filter(
      (document) => document.officialAuthorityRecordOverride,
    ).length,
  };
  const canEnterM3 = summary.criticalCoverageRowsWithGaps === 0;
  return {
    schemaVersion: industryM2WaveVerificationSchemaVersion,
    artifactType: "industry-m2-wave-verification",
    runId: input.runId,
    category: input.category,
    documentAudit,
    coverageRows,
    summary,
    recommendedNextSourceRoles,
    decision: {
      canEnterM3,
      nextAction: canEnterM3
        ? "begin_m3_claim_extraction"
        : "continue_m2_4_targeted_waves",
      reason: canEnterM3
        ? "critical_raw_candidate_coverage_met"
        : "critical_raw_candidate_coverage_gaps_remain",
    },
    assertions: {
      rawDocumentsAreNotEvidence: true,
      legacyAcceptedFlagIsNotSufficient: true,
      commercializationAssessed: false,
      reportGenerated: false,
    },
  };
}

export function serializeIndustryM2WaveVerification(
  verification: IndustryM2WaveVerification,
) {
  return `${JSON.stringify(verification, null, 2)}\n`;
}
