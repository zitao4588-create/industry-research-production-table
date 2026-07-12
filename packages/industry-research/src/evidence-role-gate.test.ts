import { describe, expect, it } from "vitest";
import { createReviewedIndustryResearchReport } from "./delivery-run";
import {
  applyEvidenceRoleGate,
  bindIndustrySourceRoleToRawDocument,
  canIndustrySourceRoleSupportClaimRole,
  evaluateEvidenceRoleGate,
} from "./evidence-role-gate";
import { validateEvidenceQuotes } from "./extraction-validator";
import { runMockCrawler } from "./mock-crawler";
import { runMockIndustryResearchWorkflow } from "./mock-workflow";
import type {
  CrawlPlan,
  Evidence,
  RawDocument,
  ResearchSource,
  ResearchWorkflowInput,
  ResearchWorkflowResult,
} from "./types";

const input: ResearchWorkflowInput = {
  projectName: "G6 role gate fixture",
  industry: "护肤品",
  category: "护肤品",
  market: "中国大陆",
  researchGoal: "验证 source-role / claim-role 门禁",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

function source(role: ResearchSource["industrySourceRole"]): ResearchSource {
  return {
    id: "source-role-aware",
    projectId: "project-g6",
    type: "url",
    title: "Role-aware source",
    value: "https://role-aware.example/product",
    automationHint: "fixture",
    industrySourceRole: role,
  };
}

function rawDocument(role: RawDocument["industrySourceRole"]): RawDocument {
  const text = "Contract Brand A 官方页面明确展示保湿面霜与舒缓定位。";
  return {
    id: "raw-role-aware",
    projectId: "project-g6",
    sourceId: "source-role-aware",
    crawlRunId: "crawl-g6",
    url: "https://role-aware.example/product",
    title: "Contract Brand A 保湿面霜",
    contentType: "html",
    excerpt: text,
    extractedText: text,
    databaseTargets: ["competitor_database"],
    sourceQuality: {
      sourceType: "official_site",
      sourceRelevance: "high",
      sourceConfidence: "high",
      needsReviewReason: "fixture",
      acceptedForReport: true,
    },
    industrySourceRole: role,
  };
}

function evidence(
  sourceRole: Evidence["sourceRole"],
  claimRole: Evidence["claimRole"],
): Evidence {
  return {
    id: "evidence-role-aware",
    projectId: "project-g6",
    sourceId: "source-role-aware",
    rawDocumentId: "raw-role-aware",
    quote: "Contract Brand A 官方页面明确展示保湿面霜与舒缓定位。",
    note: "fixture",
    sourceRole,
    claimRole,
    validation: {
      quoteMatched: true,
      sourceAccepted: true,
      matchedRawDocumentId: "raw-role-aware",
      claimSupportComplete: true,
      claimQuoteCount: 1,
      confirmedQuoteCount: 1,
    },
  };
}

function singleCompetitorResult(params: {
  sourceRole: NonNullable<ResearchSource["industrySourceRole"]>;
  claimRole: NonNullable<Evidence["claimRole"]>;
}) {
  const base = runMockIndustryResearchWorkflow(input);
  const competitor = base.competitors[0];
  if (!competitor) throw new Error("g6_competitor_fixture_missing");
  const roleSource = source(params.sourceRole);
  const roleRaw = rawDocument(params.sourceRole);
  const roleEvidence = evidence(params.sourceRole, params.claimRole);
  competitor.id = "competitor-role-aware";
  competitor.name = "Contract Brand A";
  competitor.positioning = "保湿面霜与舒缓定位";
  competitor.websiteStructure = [];
  competitor.collectionSignals = [];
  competitor.evidenceIds = [roleEvidence.id];
  return {
    ...base,
    research_sources: [roleSource],
    raw_documents: [roleRaw],
    evidence: [roleEvidence],
    competitors: [competitor],
    product_signals: [],
    pain_points: [],
    content_signals: [],
    opportunities: [],
    reviewItems: [
      {
        id: "review-role-aware",
        targetType: "competitor",
        targetId: competitor.id,
        status: "approved",
        note: "人工审核通过 fixture",
        claimRole: params.claimRole,
      },
    ],
  } satisfies ResearchWorkflowResult;
}

describe("source-role / claim-role evidence gate", () => {
  it("authorizes only policy-approved role mappings", () => {
    expect(
      canIndustrySourceRoleSupportClaimRole(
        "brand_official_site",
        "brand_positioning_product",
      ),
    ).toBe(true);
    expect(
      canIndustrySourceRoleSupportClaimRole(
        "brand_official_site",
        "market_size_growth",
      ),
    ).toBe(false);
  });

  it("fails closed on missing role metadata and role conflicts", () => {
    expect(
      evaluateEvidenceRoleGate({
        claimRole: "brand_positioning_product",
        requireRoleMetadata: true,
      }),
    ).toMatchObject({
      authorized: false,
      failureReason: "source_role_missing",
    });
    expect(
      evaluateEvidenceRoleGate({
        source: source("regulator"),
        rawDocument: rawDocument("brand_official_site"),
        claimRole: "brand_positioning_product",
      }),
    ).toMatchObject({
      authorized: false,
      failureReason: "source_role_conflict",
    });
  });

  it("propagates a formal source role to raw documents and rejects conflicts", () => {
    const withoutRole = rawDocument(undefined);
    const bound = bindIndustrySourceRoleToRawDocument(withoutRole, [
      source("brand_official_site"),
    ]);

    expect(bound.industrySourceRole).toBe("brand_official_site");
    expect(() =>
      bindIndustrySourceRoleToRawDocument(rawDocument("regulator"), [
        source("brand_official_site"),
      ]),
    ).toThrow("industry_source_role_conflict");
  });

  it("carries the formal source role through the crawler output", () => {
    const roleSource = source("brand_official_site");
    const crawlPlan: CrawlPlan = {
      id: "crawl-plan-g6",
      projectId: "project-g6",
      mode: "mock",
      targets: [
        {
          id: "crawl-target-g6",
          projectId: "project-g6",
          candidateId: "candidate-g6",
          kind: "homepage",
          target: roleSource.value,
          reason: "G6 role propagation fixture",
          maxPages: 1,
          databaseTargets: ["competitor_database"],
        },
      ],
      guardrails: [],
    };

    const crawl = runMockCrawler("project-g6", input, crawlPlan, [roleSource]);

    expect(crawl.raw_documents[0]?.industrySourceRole).toBe(
      "brand_official_site",
    );
  });

  it("lets quote validation approve an authorized role-aware claim", () => {
    const validation = validateEvidenceQuotes(
      [
        {
          quote: "Contract Brand A 官方页面明确展示保湿面霜与舒缓定位。",
          rawDocumentId: "raw-role-aware",
          sourceId: "source-role-aware",
        },
      ],
      [rawDocument("brand_official_site")],
      {
        claimTexts: ["Contract Brand A 保湿面霜与舒缓定位"],
        requiredClaimTexts: ["Contract Brand A 保湿面霜与舒缓定位"],
        claimRole: "brand_positioning_product",
      },
    );

    expect(validation.status).toBe("approved");
    expect(validation.claimSupportComplete).toBe(true);
    expect(validation.matchedQuotes[0]).toMatchObject({
      sourceAccepted: true,
      roleAuthorized: true,
      sourceRole: "brand_official_site",
      claimRole: "brand_positioning_product",
    });
  });

  it("maps unauthorized quote validation to an explicit role error", () => {
    const validation = validateEvidenceQuotes(
      ["Contract Brand A 官方页面明确展示保湿面霜与舒缓定位。"],
      [rawDocument("brand_official_site")],
      { claimRole: "market_size_growth" },
    );

    expect(validation.status).toBe("needs_review");
    expect(validation.claimSupportComplete).toBe(false);
    expect(validation.failureReasons).toContain(
      "source_role_not_authorized:brand_official_site:market_size_growth",
    );
    expect(validation.matchedQuotes[0]?.roleAuthorized).toBe(false);
  });

  it("applies role errors to evidence validation instead of trusting a forged accepted flag", () => {
    const gated = applyEvidenceRoleGate({
      evidence: evidence("brand_official_site", "market_size_growth"),
      rawDocuments: [rawDocument("brand_official_site")],
      sources: [source("brand_official_site")],
    });

    expect(gated.validation).toMatchObject({
      sourceAccepted: false,
      roleAuthorized: false,
      roleFailureReason:
        "source_role_not_authorized:brand_official_site:market_size_growth",
    });
  });

  it("allows an approved report finding only when the role mapping is authorized", () => {
    const result = singleCompetitorResult({
      sourceRole: "brand_official_site",
      claimRole: "brand_positioning_product",
    });
    const report = createReviewedIndustryResearchReport(result);
    const confirmedSection = report
      .split("## 候选发现")[0]
      ?.split("## 已确认发现")[1];

    expect(confirmedSection).toContain("Contract Brand A");
    expect(confirmedSection).toContain("可进入已确认发现：true");
  });

  it("keeps an unauthorized approved item out of the confirmed report section", () => {
    const result = singleCompetitorResult({
      sourceRole: "brand_official_site",
      claimRole: "market_size_growth",
    });
    const report = createReviewedIndustryResearchReport(result);
    const confirmedSection = report
      .split("## 候选发现")[0]
      ?.split("## 已确认发现")[1];
    const candidateSection = report
      .split("## 不确定 / 阻塞项")[0]
      ?.split("## 候选发现")[1];

    expect(confirmedSection).not.toContain("Contract Brand A");
    expect(candidateSection).toContain("Contract Brand A");
    expect(candidateSection).toContain("可进入已确认发现：false");
  });

  it("preserves legacy evidence behavior when no role metadata exists", () => {
    expect(evaluateEvidenceRoleGate({}).roleAware).toBe(false);
    expect(evaluateEvidenceRoleGate({}).authorized).toBe(true);
  });
});
