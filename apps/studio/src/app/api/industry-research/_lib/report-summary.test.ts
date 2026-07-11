import { describe, expect, it } from "vitest";
import { buildSafeReportInput, buildSafeReportSummary } from "./report-summary";

describe("buildSafeReportSummary", () => {
  it("returns a sorted, capped, public-safe summary", () => {
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
        providerMetadata: { apiKey: "never-return" },
      },
    });

    expect(summary?.counts).toEqual({
      evidence: 23,
      competitors: 7,
      opportunities: 4,
    });
    expect(summary?.competitors).toHaveLength(5);
    expect(summary?.opportunities.map((item) => item.title)).toEqual([
      "机会 B",
      "机会 C",
      "机会 A",
    ]);
    expect(JSON.stringify(summary)).not.toMatch(
      /evidenceIds|private-|apiKey|raw_documents/,
    );
  });

  it("falls back safely for legacy or missing fields", () => {
    expect(
      buildSafeReportSummary({ databases: null, runLog: null }),
    ).toBeUndefined();
    expect(buildSafeReportSummary({ databases: {}, runLog: {} })).toEqual({
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
