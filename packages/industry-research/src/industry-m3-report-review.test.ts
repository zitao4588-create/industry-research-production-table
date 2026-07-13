import { describe, expect, it } from "vitest";
import type { IndustryAtomicClaimsArtifact } from "./industry-atomic-claims";
import type { IndustryGradedReportArtifact } from "./industry-graded-report";
import type {
  IndustryM2WaveRawDocumentInput,
  IndustryM2WaveVerification,
} from "./industry-m2-wave-verification";
import {
  createIndustryM3ReportReview,
  type IndustryM3ReportReviewArtifact,
} from "./industry-m3-report-review";
import type { IndustryOpportunityHypothesesArtifact } from "./industry-opportunity-hypotheses";
import {
  canonicalizeIndustryRawDocumentUrl,
  type IndustryRawDocumentStore,
  sha256IndustryContent,
} from "./industry-raw-document-store";

async function fixture() {
  const definitions = [
    {
      id: "market",
      statement: "市场样本事实",
      claimRole: "market_size_growth",
      sourceRole: "industry_association",
    },
    {
      id: "standard",
      statement: "标准样本事实",
      claimRole: "regulation_standard",
      sourceRole: "standards_body",
    },
    {
      id: "product",
      statement: "产品样本事实",
      claimRole: "brand_positioning_product",
      sourceRole: "brand_official_site",
    },
  ] as const;
  const rawDocuments: IndustryM2WaveRawDocumentInput[] = [];
  const documents: IndustryRawDocumentStore["documents"] = [];
  const auditEvents: IndustryRawDocumentStore["auditEvents"] = [];
  const claims: IndustryAtomicClaimsArtifact["claims"] = [];
  const documentAudit: IndustryM2WaveVerification["documentAudit"] = [];

  for (const [index, definition] of definitions.entries()) {
    const sourceUrl = `https://example.com/${definition.id}`;
    const canonicalUrl = canonicalizeIndustryRawDocumentUrl(sourceUrl);
    if (!canonicalUrl) throw new Error("test_url_invalid");
    const extractedText = `前缀${definition.statement}后缀`;
    const contentHash = await sha256IndustryContent(extractedText);
    const documentId = `raw-${(
      await sha256IndustryContent(`${canonicalUrl}\n${contentHash}`)
    ).slice(7, 31)}`;
    const capturedAt = `2026-07-13T00:00:0${index}.000Z`;
    const taskId = `task-${definition.id}`;
    const routeId = `route-${definition.id}`;
    rawDocuments.push({
      id: `extracted-${definition.id}`,
      url: sourceUrl,
      title: definition.statement,
      extractedText,
      sourceQuality: { acceptedForReport: true },
    });
    documents.push({
      schemaVersion: "industry_immutable_raw_document.v1",
      artifactType: "industry-immutable-raw-document",
      documentId,
      taskId,
      routeId,
      sourceRole: definition.sourceRole,
      originalUrl: sourceUrl,
      canonicalUrl,
      capturedAt,
      mediaType: "text/plain",
      httpStatus: 200,
      originalContent: extractedText,
      contentHash,
      byteLength: new TextEncoder().encode(extractedText).byteLength,
      supersedesDocumentId: null,
      collectionMethod: "offline_fixture",
      assertions: {
        immutableSnapshot: true,
        rawDocumentIsNotEvidence: true,
        externalFactProduced: false,
        credentialsStored: false,
        privateDataStored: false,
      },
    });
    auditEvents.push({
      eventId: `audit-${documentId}`,
      action: "stored_new_document",
      documentId,
      taskId,
      routeId,
      canonicalUrl,
      contentHash,
      at: capturedAt,
      publicRequestsUsed: 0,
      providerRequestsUsed: 0,
      creditsUsed: 0,
      costYuan: 0,
    });
    claims.push({
      claimId: `claim-${definition.id}`,
      statement: definition.statement,
      claimRole: definition.claimRole,
      sourceRole: definition.sourceRole,
      taskId,
      coverageRowId: `coverage-${definition.id}`,
      rawDocumentId: documentId,
      extractedDocumentId: `extracted-${definition.id}`,
      extractedContentHash: contentHash,
      sourceUrl: canonicalUrl,
      quote: definition.statement,
      quoteStart: 2,
      quoteEnd: 2 + definition.statement.length,
      status: "confirmed_atomic_fact",
      assertions: {
        m2StronglyRelevantCandidate: true,
        immutableRawDocumentBound: true,
        quoteExactMatch: true,
        statementDirectlySupportedByQuote: true,
        sourceRoleAuthorizedForClaimRole: true,
        candidateIsNotCommercializationDecision: true,
      },
    });
    documentAudit.push({
      rawDocumentId: `extracted-${definition.id}`,
      url: sourceUrl,
      routeId,
      taskId,
      sourceRole: definition.sourceRole,
      categoryTermCount: 2,
      conflictingTerms: [],
      binaryPayloadDetected: false,
      officialAuthorityRecordOverride: false,
      legacySourceAccepted: true,
      status: "raw_candidate_relevant_not_evidence",
    });
  }

  const rawStore: IndustryRawDocumentStore = {
    schemaVersion: "industry_raw_document_store.v1",
    artifactType: "industry-raw-document-store",
    storeId: "review-test-store",
    documents,
    auditEvents,
    summary: {
      documentCount: 3,
      canonicalUrlCount: 3,
      versionedDocumentCount: 0,
      publicRequestsUsed: 0,
      providerRequestsUsed: 0,
      creditsUsed: 0,
      costYuan: 0,
    },
    assertions: {
      documentsAreImmutable: true,
      deduplicationUsesCanonicalUrlAndContentHash: true,
      oldVersionsAreRetained: true,
      rawDocumentsAreNotEvidence: true,
    },
  };
  const atomicClaims = {
    category: "洗碗机",
    claims,
    excludedM2Documents: [],
  } as unknown as IndustryAtomicClaimsArtifact;
  const hypothesis = {
    hypothesisId: "hypothesis-1",
    status: "unverified_opportunity_hypothesis",
    commercializationAssessment: "not_evaluated",
    validationPlan: {
      executionStatus: "not_started",
      permissionRequiredBeforeExecution: "L5",
    },
  };
  const hypotheses = {
    category: "洗碗机",
    hypotheses: [hypothesis],
  } as unknown as IndustryOpportunityHypothesesArtifact;
  const m2Verification = {
    category: "洗碗机",
    documentAudit,
    coverageRows: [
      {
        taskId: "task-market",
        status: "raw_candidate_target_met_not_evidence",
        independentSourceCount: 1,
        sourceRoles: ["industry_association"],
        gaps: [],
      },
    ],
  } as unknown as IndustryM2WaveVerification;
  const appendices = claims.map(
    (claim) =>
      `- ${claim.claimId} → ${claim.rawDocumentId} → [source](${claim.sourceUrl}) → quote offsets ${claim.quoteStart}-${claim.quoteEnd}`,
  );
  const reportMarkdown = `${[
    "# 洗碗机报告",
    "## 1. 阅读说明",
    "## 2. 数据与覆盖摘要",
    "## 3. 已确认原子事实",
    ...claims.map((claim) => claim.statement),
    "## 4. 待验证机会假设",
    "待验证内容",
    "## 5. Coverage 与研究缺口",
    "无缺口",
    "## 6. 冲突、低质量与拒绝来源",
    "无",
    "## 7. 证据附录",
    ...appendices,
    "## 8. 下一步",
    "进入后续研究，不作商业化判断。",
  ].join("\n")}\n`;
  const report = {
    category: "洗碗机",
    status: "draft_pending_m3_4_review",
    confirmedFacts: claims,
    unverifiedHypotheses: [hypothesis],
    rejectedSources: [],
    coverage: {
      entries: [
        {
          taskId: "task-market",
          status: "raw_candidate_target_met_not_evidence",
          independentSourceCount: 1,
          sourceRoles: ["industry_association"],
          gaps: [],
        },
      ],
      totalRows: 1,
      gapRows: 0,
    },
    decisionBoundary: { validationExecutionsCompleted: 0 },
    reportMarkdown,
  } as unknown as IndustryGradedReportArtifact;
  const expectedHashes = {
    gradedReportJsonSha256: await sha256IndustryContent(
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    reportMarkdownSha256: await sha256IndustryContent(reportMarkdown),
  };
  return {
    report,
    atomicClaims,
    hypotheses,
    rawDocuments,
    rawStore,
    m2Verification,
    expectedHashes,
  };
}

async function review(
  input: Awaited<ReturnType<typeof fixture>>,
): Promise<IndustryM3ReportReviewArtifact> {
  return createIndustryM3ReportReview({
    runId: "review-test",
    ...input,
  });
}

describe("industry M3 report review", () => {
  it("passes full source-chain, representative, report and readability gates", async () => {
    const result = await review(await fixture());
    expect(result.status).toBe("passed_local_c2");
    expect(result.sourceChainAudit.auditedClaimCount).toBe(3);
    expect(result.representativeSpotChecks).toHaveLength(3);
    expect(result.reviewOperator.independentHumanReviewCompleted).toBe(false);
    expect(result.decisionBoundary.realUserValidationCompleted).toBe(false);
  });

  it("fails closed when quote offsets no longer match the extracted version", async () => {
    const input = await fixture();
    input.atomicClaims.claims[0] = {
      ...input.atomicClaims.claims[0],
      quoteStart: 0,
      quoteEnd: input.atomicClaims.claims[0]?.quote.length ?? 0,
    };
    input.report.confirmedFacts = input.atomicClaims.claims;
    input.expectedHashes.gradedReportJsonSha256 = await sha256IndustryContent(
      `${JSON.stringify(input.report, null, 2)}\n`,
    );
    await expect(review(input)).rejects.toThrow("quote_offsets_mismatch");
  });

  it("fails closed when the reviewed report hash changes", async () => {
    const input = await fixture();
    input.expectedHashes.reportMarkdownSha256 =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    await expect(review(input)).rejects.toThrow("deterministic_hash_mismatch");
  });
});
