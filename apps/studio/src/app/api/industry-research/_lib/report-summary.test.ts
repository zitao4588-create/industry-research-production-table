import { describe, expect, it } from "vitest";
import { buildSafeReportInput, buildSafeReportSummary } from "./report-summary";

describe("buildSafeReportSummary", () => {
  it("only returns findings listed in the reviewed report's confirmed section", () => {
    const summary = buildSafeReportSummary({
      databases: {
        competitor_database: Array.from({ length: 7 }, (_, index) => ({
          id: `private-${index}`,
          name: `品牌 ${index + 1}`,
          channel: "DTC",
          positioning: "专业定位",
          market: "中国",
          evidenceIds: ["secret-evidence"],
        })),
        opportunity_database: [
          {
            title: "机会 A",
            summary: "A",
            totalScore: 4,
            reviewStatus: "approved",
          },
          {
            title: "机会 B",
            summary: "B",
            totalScore: 9,
            reviewStatus: "needs_review",
          },
          {
            title: "机会 C",
            summary: "C",
            totalScore: 7,
            reviewStatus: "approved",
          },
          {
            title: "机会 D",
            summary: "D",
            totalScore: 2,
            reviewStatus: "rejected",
          },
        ],
        raw_documents: [{ path: "/private/report.md" }],
      },
      runLog: {
        counts: { evidence: 23 },
        credibility: {
          effectiveEvidence: 8,
          confirmedFindings: 3,
          needsReviewFindings: 2,
          crawlFailures: 0,
        },
        providerMetadata: { apiKey: "never-return" },
      },
      reportMarkdown: [
        "## 已确认发现",
        "",
        "### 品牌 2",
        "",
        "### 机会 C",
        "",
        "### 机会 A",
        "",
        "## 候选发现",
        "",
        "### 品牌 1",
        "",
        "### 机会 B",
      ].join("\n"),
    });

    expect(summary?.counts).toEqual({
      evidence: 8,
      competitors: 1,
      opportunities: 2,
    });
    expect(summary?.quality).toEqual({
      status: "usable",
      canUseReport: true,
      confirmedFindings: 3,
      needsReviewFindings: 2,
      effectiveEvidence: 8,
      technicalFailureCount: 0,
    });
    expect(summary?.competitors.map((item) => item.name)).toEqual(["品牌 2"]);
    expect(summary?.opportunities.map((item) => item.title)).toEqual([
      "机会 C",
      "机会 A",
    ]);
    expect(JSON.stringify(summary)).not.toMatch(
      /evidenceIds|private-|apiKey|raw_documents/,
    );
  });

  it("turns a technically failed run into a blocked result without false findings", () => {
    const summary = buildSafeReportSummary({
      databases: {
        competitor_database: [
          {
            name: "四方小仓科技",
            channel: "AMZ123",
            positioning: "跨境电商物流软件",
            market: "线上电商 / DTC",
          },
        ],
        opportunity_database: [],
      },
      runLog: {
        credibility: {
          effectiveEvidence: 4,
          confirmedFindings: 0,
          needsReviewFindings: 1,
          crawlFailures: 3,
        },
      },
      reportMarkdown: [
        "## 已确认发现",
        "",
        "- 暂无。",
        "",
        "## 候选发现",
        "",
        "### 四方小仓科技",
      ].join("\n"),
    });

    expect(summary).toEqual({
      quality: {
        status: "technical_blocked",
        canUseReport: false,
        confirmedFindings: 0,
        needsReviewFindings: 1,
        effectiveEvidence: 4,
        technicalFailureCount: 3,
      },
      counts: { evidence: 0, competitors: 0, opportunities: 0 },
      competitors: [],
      opportunities: [],
    });
  });

  it("falls back safely for legacy or missing fields", () => {
    expect(buildSafeReportSummary({ databases: null, runLog: null })).toEqual({
      quality: {
        status: "insufficient_evidence",
        canUseReport: false,
        confirmedFindings: 0,
        needsReviewFindings: 0,
        effectiveEvidence: 0,
        technicalFailureCount: 0,
      },
      counts: { evidence: 0, competitors: 0, opportunities: 0 },
      competitors: [],
      opportunities: [],
    });
  });

  it("whitelists public input fields", () => {
    expect(
      buildSafeReportInput({
        projectName: "宠物益生菌研究",
        industry: "宠物健康",
        category: "益生菌",
        market: "DTC",
        urls: ["https://private.example"],
        manualText: "private",
      }),
    ).toEqual({
      projectName: "宠物益生菌研究",
      industry: "宠物健康",
      category: "益生菌",
      market: "DTC",
    });
    expect(buildSafeReportInput(null)).toBeNull();
  });
});
