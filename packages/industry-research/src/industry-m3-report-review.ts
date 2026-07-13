import { canIndustrySourceRoleSupportClaimRole } from "./evidence-role-gate";
import type {
  IndustryAtomicClaim,
  IndustryAtomicClaimsArtifact,
} from "./industry-atomic-claims";
import type { IndustryGradedReportArtifact } from "./industry-graded-report";
import type {
  IndustryM2WaveRawDocumentInput,
  IndustryM2WaveVerification,
} from "./industry-m2-wave-verification";
import type { IndustryOpportunityHypothesesArtifact } from "./industry-opportunity-hypotheses";
import {
  assertIndustryRawDocumentStore,
  canonicalizeIndustryRawDocumentUrl,
  type IndustryRawDocumentStore,
  sha256IndustryContent,
} from "./industry-raw-document-store";

export const industryM3ReportReviewSchemaVersion =
  "industry_m3_report_review.v1" as const;

export type IndustryM3ReportReviewArtifact = {
  schemaVersion: typeof industryM3ReportReviewSchemaVersion;
  artifactType: "industry-m3-report-review";
  runId: string;
  category: string;
  status: "passed_local_c2";
  reviewOperator: {
    type: "codex_local_agent_with_deterministic_gates";
    independentHumanReviewCompleted: false;
    realUserValidationCompleted: false;
  };
  representativeSpotChecks: Array<{
    claimId: string;
    claimRole: IndustryAtomicClaim["claimRole"];
    sourceRole: IndustryAtomicClaim["sourceRole"];
    rawDocumentId: string;
    checks: {
      immutableRawDocumentValid: true;
      extractedVersionHashMatched: true;
      exactQuoteOffsetsMatched: true;
      statementDirectlySupported: true;
      sourceRoleAuthorized: true;
      m2StrongRelevanceMatched: true;
    };
  }>;
  sourceChainAudit: {
    auditedClaimCount: number;
    expectedClaimCount: number;
    allClaimsPassed: true;
  };
  reportContractAudit: {
    confirmedFactCount: number;
    unverifiedHypothesisCount: number;
    coverageRowCount: number;
    coverageGapCount: number;
    rejectedSourceCount: number;
    requiredSectionsInOrder: true;
    evidenceAppendixComplete: true;
    hypothesesRemainL5GatedAndNotStarted: true;
    commercializationConclusionAbsent: true;
  };
  readabilityAudit: {
    markdownLineCount: number;
    maxLineCharacterCount: number;
    maxHeadingDepth: number;
    markdownTablesFound: 0;
    consecutiveBlankLineMaximum: number;
    mobileWrapSafe: true;
  };
  deterministicReplay: {
    gradedReportJsonSha256: `sha256:${string}`;
    reportMarkdownSha256: `sha256:${string}`;
    expectedHashesMatched: true;
  };
  decisionBoundary: {
    m3CompletionLevel: "C2_local_verified";
    m4MayStart: true;
    commercializationDecisionProduced: false;
    independentHumanReviewCompleted: false;
    realUserValidationCompleted: false;
  };
  assertions: {
    noLlmRequests: true;
    noExternalMessages: true;
    noProductionWrite: true;
  };
};

const requiredSections = [
  "## 1. 阅读说明",
  "## 2. 数据与覆盖摘要",
  "## 3. 已确认原子事实",
  "## 4. 待验证机会假设",
  "## 5. Coverage 与研究缺口",
  "## 6. 冲突、低质量与拒绝来源",
  "## 7. 证据附录",
  "## 8. 下一步",
] as const;

function fail(code: string): never {
  throw new Error(`industry_m3_report_review_failed:${code}`);
}

function normalized(value: string) {
  return value.replace(/\s+/g, "").replace(/[。；;]$/g, "");
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function maxConsecutiveBlankLines(lines: string[]) {
  let current = 0;
  let maximum = 0;
  for (const line of lines) {
    current = line.trim() ? 0 : current + 1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

async function auditClaim(input: {
  claim: IndustryAtomicClaim;
  rawDocuments: IndustryM2WaveRawDocumentInput[];
  rawStore: IndustryRawDocumentStore;
  verification: IndustryM2WaveVerification;
}) {
  const { claim } = input;
  const canonicalUrl = canonicalizeIndustryRawDocumentUrl(claim.sourceUrl);
  if (!canonicalUrl) fail(`claim_source_url_invalid:${claim.claimId}`);
  const immutable = input.rawStore.documents.find(
    (document) => document.documentId === claim.rawDocumentId,
  );
  if (
    !immutable ||
    immutable.canonicalUrl !== canonicalUrl ||
    immutable.sourceRole !== claim.sourceRole ||
    immutable.taskId !== claim.taskId
  ) {
    fail(`immutable_binding_mismatch:${claim.claimId}`);
  }
  const extractedMatches = [];
  for (const document of input.rawDocuments) {
    if (canonicalizeIndustryRawDocumentUrl(document.url) !== canonicalUrl) {
      continue;
    }
    if (
      (await sha256IndustryContent(document.extractedText)) ===
      claim.extractedContentHash
    ) {
      extractedMatches.push(document);
    }
  }
  if (extractedMatches.length !== 1) {
    fail(`extracted_version_not_unique:${claim.claimId}`);
  }
  const extracted = extractedMatches[0];
  if (
    !extracted ||
    extracted.extractedText.slice(claim.quoteStart, claim.quoteEnd) !==
      claim.quote ||
    claim.quoteEnd !== claim.quoteStart + claim.quote.length
  ) {
    fail(`quote_offsets_mismatch:${claim.claimId}`);
  }
  if (!normalized(claim.quote).includes(normalized(claim.statement))) {
    fail(`statement_not_directly_supported:${claim.claimId}`);
  }
  if (
    !canIndustrySourceRoleSupportClaimRole(claim.sourceRole, claim.claimRole)
  ) {
    fail(`source_role_not_authorized:${claim.claimId}`);
  }
  const m2Audit = input.verification.documentAudit.find(
    (document) =>
      canonicalizeIndustryRawDocumentUrl(document.url) === canonicalUrl &&
      document.status === "raw_candidate_relevant_not_evidence" &&
      document.sourceRole === claim.sourceRole &&
      document.taskId === claim.taskId,
  );
  if (!m2Audit) fail(`m2_relevance_binding_missing:${claim.claimId}`);
}

export async function createIndustryM3ReportReview(input: {
  runId: string;
  report: IndustryGradedReportArtifact;
  atomicClaims: IndustryAtomicClaimsArtifact;
  hypotheses: IndustryOpportunityHypothesesArtifact;
  rawDocuments: IndustryM2WaveRawDocumentInput[];
  rawStore: IndustryRawDocumentStore;
  m2Verification: IndustryM2WaveVerification;
  expectedHashes: {
    gradedReportJsonSha256: `sha256:${string}`;
    reportMarkdownSha256: `sha256:${string}`;
  };
}): Promise<IndustryM3ReportReviewArtifact> {
  if (!input.runId.trim()) fail("run_id_required");
  await assertIndustryRawDocumentStore(input.rawStore);
  if (
    input.report.status !== "draft_pending_m3_4_review" ||
    input.report.category !== input.atomicClaims.category ||
    input.report.category !== input.hypotheses.category ||
    input.report.category !== input.m2Verification.category
  ) {
    fail("input_identity_or_status_mismatch");
  }
  if (!sameJson(input.report.confirmedFacts, input.atomicClaims.claims)) {
    fail("confirmed_facts_source_parity_mismatch");
  }
  if (
    !sameJson(input.report.unverifiedHypotheses, input.hypotheses.hypotheses)
  ) {
    fail("hypotheses_source_parity_mismatch");
  }
  if (
    !sameJson(
      input.report.rejectedSources,
      input.atomicClaims.excludedM2Documents,
    )
  ) {
    fail("rejected_sources_source_parity_mismatch");
  }

  for (const claim of input.report.confirmedFacts) {
    await auditClaim({
      claim,
      rawDocuments: input.rawDocuments,
      rawStore: input.rawStore,
      verification: input.m2Verification,
    });
  }

  const spotCheckClaimRoles: IndustryAtomicClaim["claimRole"][] = [
    "market_size_growth",
    "regulation_standard",
    "brand_positioning_product",
  ];
  const spotClaims = spotCheckClaimRoles.map((claimRole) => {
    const claim = input.report.confirmedFacts.find(
      (candidate) => candidate.claimRole === claimRole,
    );
    if (!claim) fail(`representative_claim_role_missing:${claimRole}`);
    return claim;
  });

  if (
    input.report.coverage.totalRows !==
      input.m2Verification.coverageRows.length ||
    input.report.coverage.entries.some((entry) => {
      const source = input.m2Verification.coverageRows.find(
        (row) => row.taskId === entry.taskId,
      );
      return (
        !source ||
        source.status !== entry.status ||
        source.independentSourceCount !== entry.independentSourceCount ||
        !sameJson(source.sourceRoles, entry.sourceRoles) ||
        !sameJson(source.gaps, entry.gaps)
      );
    })
  ) {
    fail("coverage_source_parity_mismatch");
  }
  const actualGapCount = input.report.coverage.entries.filter(
    (entry) => entry.status === "raw_candidate_gap",
  ).length;
  if (actualGapCount !== input.report.coverage.gapRows) {
    fail("coverage_gap_count_mismatch");
  }
  if (
    input.report.unverifiedHypotheses.some(
      (hypothesis) =>
        hypothesis.status !== "unverified_opportunity_hypothesis" ||
        hypothesis.commercializationAssessment !== "not_evaluated" ||
        hypothesis.validationPlan.executionStatus !== "not_started" ||
        hypothesis.validationPlan.permissionRequiredBeforeExecution !== "L5",
    ) ||
    input.report.decisionBoundary.validationExecutionsCompleted !== 0
  ) {
    fail("hypothesis_validation_boundary_breached");
  }

  const markdown = input.report.reportMarkdown;
  let lastSectionIndex = -1;
  for (const section of requiredSections) {
    const sectionIndex = markdown.indexOf(section);
    if (sectionIndex <= lastSectionIndex)
      fail(`section_missing_or_out_of_order:${section}`);
    lastSectionIndex = sectionIndex;
  }
  if (
    input.report.confirmedFacts.some(
      (claim) =>
        !markdown.includes(
          `${claim.claimId} → ${claim.rawDocumentId} → [source](${claim.sourceUrl}) → quote offsets ${claim.quoteStart}-${claim.quoteEnd}`,
        ),
    )
  ) {
    fail("evidence_appendix_incomplete");
  }
  if (
    /(?:停止商业化|终止商业化|建议进入|建议退出|应当进入|应当停止|商业化结论：)/.test(
      markdown,
    )
  ) {
    fail("commercialization_conclusion_forbidden");
  }

  const lines = markdown.split("\n");
  const maxLineCharacterCount = Math.max(
    ...lines.map((line) => [...line].length),
  );
  const maxHeadingDepth = Math.max(
    0,
    ...lines.map((line) => line.match(/^(#{1,6})\s/)?.[1]?.length ?? 0),
  );
  const markdownTablesFound = lines.filter((line) =>
    /^\s*\|.*\|\s*$/.test(line),
  ).length;
  const consecutiveBlankLineMaximum = maxConsecutiveBlankLines(lines);
  if (
    maxLineCharacterCount > 220 ||
    maxHeadingDepth > 3 ||
    markdownTablesFound > 0 ||
    consecutiveBlankLineMaximum > 2
  ) {
    fail("mobile_readability_gate_failed");
  }

  const gradedReportJson = `${JSON.stringify(input.report, null, 2)}\n`;
  const gradedReportJsonSha256 = await sha256IndustryContent(gradedReportJson);
  const reportMarkdownSha256 = await sha256IndustryContent(markdown);
  if (
    gradedReportJsonSha256 !== input.expectedHashes.gradedReportJsonSha256 ||
    reportMarkdownSha256 !== input.expectedHashes.reportMarkdownSha256
  ) {
    fail("deterministic_hash_mismatch");
  }

  return {
    schemaVersion: industryM3ReportReviewSchemaVersion,
    artifactType: "industry-m3-report-review",
    runId: input.runId,
    category: input.report.category,
    status: "passed_local_c2",
    reviewOperator: {
      type: "codex_local_agent_with_deterministic_gates",
      independentHumanReviewCompleted: false,
      realUserValidationCompleted: false,
    },
    representativeSpotChecks: spotClaims.map((claim) => ({
      claimId: claim.claimId,
      claimRole: claim.claimRole,
      sourceRole: claim.sourceRole,
      rawDocumentId: claim.rawDocumentId,
      checks: {
        immutableRawDocumentValid: true,
        extractedVersionHashMatched: true,
        exactQuoteOffsetsMatched: true,
        statementDirectlySupported: true,
        sourceRoleAuthorized: true,
        m2StrongRelevanceMatched: true,
      },
    })),
    sourceChainAudit: {
      auditedClaimCount: input.report.confirmedFacts.length,
      expectedClaimCount: input.atomicClaims.claims.length,
      allClaimsPassed: true,
    },
    reportContractAudit: {
      confirmedFactCount: input.report.confirmedFacts.length,
      unverifiedHypothesisCount: input.report.unverifiedHypotheses.length,
      coverageRowCount: input.report.coverage.totalRows,
      coverageGapCount: input.report.coverage.gapRows,
      rejectedSourceCount: input.report.rejectedSources.length,
      requiredSectionsInOrder: true,
      evidenceAppendixComplete: true,
      hypothesesRemainL5GatedAndNotStarted: true,
      commercializationConclusionAbsent: true,
    },
    readabilityAudit: {
      markdownLineCount: lines.length,
      maxLineCharacterCount,
      maxHeadingDepth,
      markdownTablesFound: 0,
      consecutiveBlankLineMaximum,
      mobileWrapSafe: true,
    },
    deterministicReplay: {
      gradedReportJsonSha256,
      reportMarkdownSha256,
      expectedHashesMatched: true,
    },
    decisionBoundary: {
      m3CompletionLevel: "C2_local_verified",
      m4MayStart: true,
      commercializationDecisionProduced: false,
      independentHumanReviewCompleted: false,
      realUserValidationCompleted: false,
    },
    assertions: {
      noLlmRequests: true,
      noExternalMessages: true,
      noProductionWrite: true,
    },
  };
}

export function serializeIndustryM3ReportReview(
  artifact: IndustryM3ReportReviewArtifact,
) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
