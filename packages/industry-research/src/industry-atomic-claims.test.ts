import { describe, expect, it } from "vitest";
import {
  createIndustryAcquisitionRoute,
  createIndustryAcquisitionTaskPlan,
  createIndustryAtomicClaimsArtifact,
  createIndustryPlan,
  createIndustryRawDocumentStore,
  dishwasherIndustryPlanningFixture,
  putIndustryRawDocument,
  verifyIndustryM2Wave,
} from "./index";

const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
const task = taskPlan.tasks.find((item) =>
  item.allowedSourceRoles.includes("industry_association"),
);
if (!task) throw new Error("market_task_missing");
const url = "https://news.cheaa.com/dishwasher-market.html";
const route = createIndustryAcquisitionRoute({
  task,
  sourceRole: "industry_association",
  targetKind: "complex_public_page",
  targetReference: url,
  access: {
    requiresLogin: false,
    requiresCookie: false,
    requiresCaptcha: false,
    isPaywalled: false,
    containsPrivateData: false,
  },
});
const quote = "2024年我国洗碗机市场零售量规模达到229万台，同比增长18.0%。";
const rawDocument = {
  id: "extracted-1",
  url,
  title: "洗碗机市场",
  extractedText: `公开资料显示，${quote}`,
  sourceQuality: { acceptedForReport: true },
};

async function fixture() {
  const stored = await putIndustryRawDocument(
    createIndustryRawDocumentStore("atomic-claims-test"),
    {
      route,
      originalUrl: url,
      capturedAt: "2026-07-13T00:00:00.000Z",
      mediaType: "text/html",
      httpStatus: 200,
      originalContent: rawDocument.extractedText,
      collectionMethod: "offline_fixture",
      usage: {
        publicRequestsUsed: 0,
        providerRequestsUsed: 0,
        creditsUsed: 0,
        costYuan: 0,
      },
    },
  );
  const verification = verifyIndustryM2Wave({
    runId: "atomic-test",
    category: "洗碗机",
    categoryTerms: ["洗碗机"],
    conflictingCategoryTerms: ["洗地机"],
    rawDocuments: [rawDocument],
    routes: [route],
    taskPlan,
  });
  return { rawStore: stored.store, verification };
}

describe("industry atomic claims", () => {
  it("binds an exact atomic statement to M2 relevance, route and immutable raw", async () => {
    const { rawStore, verification } = await fixture();
    const artifact = await createIndustryAtomicClaimsArtifact({
      runId: "m3-1-test",
      category: "洗碗机",
      candidates: [
        {
          candidateId: "claim-market-volume",
          statement: "2024年我国洗碗机市场零售量规模达到229万台，同比增长18.0%",
          claimRole: "market_size_growth",
          sourceUrl: url,
          quote,
        },
      ],
      rawDocuments: [rawDocument],
      routes: [route],
      rawStore,
      verification,
      taskPlan,
    });

    expect(artifact.summary.confirmedAtomicClaimCount).toBe(1);
    expect(artifact.claims[0]).toMatchObject({
      claimRole: "market_size_growth",
      sourceRole: "industry_association",
      taskId: task.taskId,
      coverageRowId: task.coverageRowId,
      quoteStart: 7,
      status: "confirmed_atomic_fact",
    });
    expect(artifact.claims[0]?.extractedContentHash).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });

  it("fails closed for rejected M2 sources, mismatched quotes and unauthorized roles", async () => {
    const { rawStore, verification } = await fixture();
    const artifact = await createIndustryAtomicClaimsArtifact({
      runId: "m3-1-rejections",
      category: "洗碗机",
      candidates: [
        {
          candidateId: "claim-bad-quote",
          statement: "不存在的市场事实",
          claimRole: "consumer_need",
          sourceUrl: url,
          quote: "不存在的市场事实",
        },
        {
          candidateId: "claim-commercialization",
          statement: "建议推出洗碗机并停止商业化",
          claimRole: "market_size_growth",
          sourceUrl: url,
          quote,
        },
      ],
      rawDocuments: [rawDocument],
      routes: [route],
      rawStore,
      verification,
      taskPlan,
    });

    expect(artifact.claims).toHaveLength(0);
    expect(artifact.rejectedCandidates[0]?.failures).toEqual(
      expect.arrayContaining([
        "claim_role_not_targeted_by_task",
        "source_role_not_authorized_for_claim_role",
        "quote_not_exactly_matched",
      ]),
    );
    expect(artifact.rejectedCandidates[1]?.failures).toContain(
      "commercialization_decision_forbidden",
    );
  });

  it.each([
    ["category_relevance_mismatch", false],
    ["source_quality_rejected", false],
    ["source_quality_rejected", true],
  ] as const)("rejects an M2 %s document before claim binding (binary=%s)", async (status, binaryPayloadDetected) => {
    const { rawStore, verification } = await fixture();
    const rejectedVerification = structuredClone(verification);
    const audit = rejectedVerification.documentAudit[0];
    if (!audit) throw new Error("document_audit_missing");
    audit.status = status;
    audit.binaryPayloadDetected = binaryPayloadDetected;
    const artifact = await createIndustryAtomicClaimsArtifact({
      runId: `m3-1-rejected-${status}-${binaryPayloadDetected}`,
      category: "洗碗机",
      candidates: [
        {
          candidateId: "claim-rejected-at-m2",
          statement: "2024年我国洗碗机市场零售量规模达到229万台，同比增长18.0%",
          claimRole: "market_size_growth",
          sourceUrl: url,
          quote,
        },
      ],
      rawDocuments: [rawDocument],
      routes: [route],
      rawStore,
      verification: rejectedVerification,
      taskPlan,
    });

    expect(artifact.claims).toHaveLength(0);
    expect(artifact.rejectedCandidates[0]?.failures).toContain(
      "m2_strong_relevance_gate_failed",
    );
    expect(artifact.excludedM2Documents[0]).toMatchObject({
      status,
      binaryPayloadDetected,
    });
  });
});
