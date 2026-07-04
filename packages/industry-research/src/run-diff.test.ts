import { describe, expect, it } from "vitest";
import { createIndustryResearchDeliveryArtifacts } from "./delivery-run";
import { runMockIndustryResearchWorkflow } from "./mock-workflow";
import {
  buildHistoricalContextFromDatabases,
  coerceRunDiffDatabases,
  createWeeklyIntelligenceReportFromDiff,
  diffIndustryResearchDatabases,
  formatRunDiffMarkdownSection,
  type RunDiffDatabases,
} from "./run-diff";
import type { ResearchWorkflowInput } from "./types";

function databases(overrides: Partial<RunDiffDatabases>): RunDiffDatabases {
  return {
    competitorNames: [],
    keywords: [],
    contentTopics: [],
    painPointThemes: [],
    productTags: [],
    opportunities: [],
    ...overrides,
  };
}

describe("coerceRunDiffDatabases", () => {
  it("extracts stable keys from a databases.json shaped object", () => {
    const coerced = coerceRunDiffDatabases({
      competitor_database: [{ name: "Finn" }, { name: "Native Pet" }],
      keyword_database: [{ keyword: "probiotic" }, { keyword: "" }],
      content_database: [{ platform: "YouTube", topic: "gut health" }],
      pain_point_database: [{ theme: "软便" }],
      product_database: [{ tags: ["pumpkin", "chews"] }],
      opportunity_database: [{ title: "换粮套装", totalScore: 82 }],
    });

    expect(coerced.competitorNames).toEqual(["Finn", "Native Pet"]);
    expect(coerced.keywords).toEqual(["probiotic"]);
    expect(coerced.contentTopics).toEqual(["YouTube | gut health"]);
    expect(coerced.painPointThemes).toEqual(["软便"]);
    expect(coerced.productTags).toEqual(["pumpkin", "chews"]);
    expect(coerced.opportunities).toEqual([
      { title: "换粮套装", totalScore: 82 },
    ]);
  });

  it("tolerates malformed input", () => {
    expect(coerceRunDiffDatabases(null).competitorNames).toEqual([]);
    expect(coerceRunDiffDatabases("junk").keywords).toEqual([]);
    expect(
      coerceRunDiffDatabases({ competitor_database: "oops" }).competitorNames,
    ).toEqual([]);
  });
});

describe("diffIndustryResearchDatabases", () => {
  it("detects additions, removals, and opportunity score changes", () => {
    const previous = databases({
      competitorNames: ["Finn", "Old Brand"],
      keywords: ["probiotic"],
      opportunities: [
        { title: "换粮套装", totalScore: 70 },
        { title: "老机会", totalScore: 60 },
      ],
    });
    const current = databases({
      competitorNames: ["Finn", "Native Pet"],
      keywords: ["probiotic", "pumpkin"],
      opportunities: [
        { title: "换粮套装", totalScore: 82 },
        { title: "订阅装", totalScore: 75 },
      ],
    });

    const diff = diffIndustryResearchDatabases(previous, current, "run-prev");

    expect(diff.baselineRunId).toBe("run-prev");
    expect(diff.newCompetitors).toEqual(["Native Pet"]);
    expect(diff.removedCompetitors).toEqual(["Old Brand"]);
    expect(diff.newKeywords).toEqual(["pumpkin"]);
    expect(diff.newOpportunities).toEqual(["订阅装"]);
    expect(diff.opportunityScoreChanges).toEqual([
      { title: "换粮套装", previousScore: 70, currentScore: 82 },
    ]);
    expect(diff.hasChanges).toBe(true);
  });

  it("reports no changes for identical databases", () => {
    const snapshot = databases({
      competitorNames: ["Finn"],
      keywords: ["probiotic"],
      opportunities: [{ title: "换粮套装", totalScore: 70 }],
    });

    const diff = diffIndustryResearchDatabases(snapshot, snapshot, "run-prev");

    expect(diff.hasChanges).toBe(false);
    expect(
      createWeeklyIntelligenceReportFromDiff({
        projectId: "p",
        category: "宠物益生菌",
        weekOf: "2026-07-04",
        diff,
      }).summary,
    ).toContain("未发现结构化差异");
  });

  it("matches keys case-insensitively", () => {
    const diff = diffIndustryResearchDatabases(
      databases({ competitorNames: ["finn"] }),
      databases({ competitorNames: ["Finn "] }),
      "run-prev",
    );

    expect(diff.newCompetitors).toEqual([]);
    expect(diff.removedCompetitors).toEqual([]);
  });
});

describe("buildHistoricalContextFromDatabases", () => {
  it("summarizes previous run conclusions into compact context lines", () => {
    const lines = buildHistoricalContextFromDatabases("run-prev", {
      competitor_database: [{ name: "Finn" }, { name: "Native Pet" }],
      keyword_database: [{ keyword: "probiotic" }],
      opportunity_database: [{ title: "换粮套装", totalScore: 82 }],
      pain_point_database: [{ theme: "软便" }],
    });

    expect(lines.some((line) => line.includes("Finn"))).toBe(true);
    expect(lines.some((line) => line.includes("换粮套装（82）"))).toBe(true);
    expect(lines.every((line) => line.includes("上一次 run"))).toBe(true);
  });

  it("returns no lines for an empty previous run", () => {
    expect(buildHistoricalContextFromDatabases("run-prev", {})).toEqual([]);
  });
});

describe("formatRunDiffMarkdownSection", () => {
  it("renders a baseline note when there is no previous run", () => {
    const section = formatRunDiffMarkdownSection(null, "run-current");

    expect(section).toContain("本期新增与变化");
    expect(section).toContain("基线");
    expect(section).toContain("run-current");
  });
});

describe("createIndustryResearchDeliveryArtifacts with previousRun", () => {
  const input: ResearchWorkflowInput = {
    projectName: "diff 集成测试",
    industry: "宠物健康电商",
    category: "宠物肠胃益生菌",
    market: "美国 DTC 电商",
    researchGoal: "验证周报 diff 集成",
    templateId: "ecommerce_competitor_research",
    urls: [],
    csvText: "",
    manualText: "",
  };

  function createResult() {
    return runMockIndustryResearchWorkflow(input);
  }

  it("appends a diff weekly entry and a report section when previousRun exists", () => {
    const result = createResult();
    const baselineWeeklyCount = result.weekly_intelligence_reports.length;
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId: "run-current",
      startedAt: "2026-07-04T00:00:00.000Z",
      finishedAt: "2026-07-04T00:01:00.000Z",
      previousRun: {
        runId: "run-previous",
        databases: { competitor_database: [{ name: "不存在的旧竞品" }] },
      },
    });

    expect(artifacts.databases.weekly_intelligence_reports).toHaveLength(
      baselineWeeklyCount + 1,
    );
    expect(artifacts.reportMarkdown).toContain("## 本期新增与变化");
    expect(artifacts.reportMarkdown).toContain("run-previous");
    expect(artifacts.reportMarkdown).toContain("消失竞品（待复核）");
  });

  it("appends a baseline entry when previousRun is null", () => {
    const result = createResult();
    const baselineWeeklyCount = result.weekly_intelligence_reports.length;
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId: "run-current",
      startedAt: "2026-07-04T00:00:00.000Z",
      finishedAt: "2026-07-04T00:01:00.000Z",
      previousRun: null,
    });

    expect(artifacts.databases.weekly_intelligence_reports).toHaveLength(
      baselineWeeklyCount + 1,
    );
    expect(artifacts.reportMarkdown).toContain("本期为基线 run");
  });

  it("keeps legacy behavior when previousRun is undefined", () => {
    const result = createResult();
    const baselineWeeklyCount = result.weekly_intelligence_reports.length;
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId: "run-current",
      startedAt: "2026-07-04T00:00:00.000Z",
      finishedAt: "2026-07-04T00:01:00.000Z",
    });

    expect(artifacts.databases.weekly_intelligence_reports).toHaveLength(
      baselineWeeklyCount,
    );
    expect(artifacts.reportMarkdown).not.toContain("## 本期新增与变化");
  });
});
