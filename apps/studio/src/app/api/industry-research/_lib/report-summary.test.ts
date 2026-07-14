import { describe, expect, it } from "vitest";
import {
  buildSafePublicReportMarkdown,
  buildSafeReportInput,
  buildSafeReportSummary,
} from "./report-summary";

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

  it("replaces an unusable internal report with a safe public failure report", () => {
    const input = buildSafeReportInput({
      projectName: "冰箱研究",
      industry: "家电",
      category: "冰箱",
      market: "中国大陆",
    });
    const reportMarkdown = [
      "# 内部报告",
      "",
      "## 已确认发现",
      "",
      "- 暂无。",
      "",
      "## 候选发现",
      "",
      "### 四方小仓科技",
      "",
      "- 类型：competitor",
      "- 渠道：AMZ123",
      "- URL：https://www.amz123.com/private-candidate",
      "",
      "## 证据索引",
      "",
      "- /opt/playgamelab/internal/evidence.json",
    ].join("\n");
    const summary = buildSafeReportSummary({
      databases: null,
      runLog: {
        credibility: {
          effectiveEvidence: 4,
          confirmedFindings: 0,
          needsReviewFindings: 1,
          crawlFailures: 3,
        },
      },
      reportMarkdown,
    });

    const publicMarkdown = buildSafePublicReportMarkdown({
      input,
      reportMarkdown,
      summary,
    });

    expect(publicMarkdown).toContain("状态：技术失败");
    expect(publicMarkdown).toContain("已确认发现：0");
    expect(publicMarkdown).toContain("不代表行业没有机会");
    expect(publicMarkdown).not.toMatch(
      /四方小仓科技|AMZ123|amz123\.com|\/opt\/playgamelab|证据索引/,
    );
  });

  it("keeps confirmed evidence, relabels opportunities, and removes internal sections", () => {
    const reportMarkdown = [
      "# 内部已审核报告",
      "",
      "## 审核摘要",
      "",
      "- needs_review：2",
      "",
      "## 已确认发现",
      "",
      "### 品牌官网公开规格",
      "",
      "- 类型：competitor",
      "- 状态：confirmed",
      "- 可进入已确认发现：true",
      "- 证据：",
      "  - URL：https://brand.example/spec",
      "  - quote：公开规格原文",
      "",
      "### 安装适配服务",
      "",
      "- 类型：opportunity",
      "- 状态：confirmed",
      "- 可进入已确认发现：true",
      "- 证据：",
      "  - URL：https://source.example/install",
      "  - quote：安装条件原文",
      "",
      "## 候选发现",
      "",
      "### 跨品类候选",
      "",
      "## 不确定 / 阻塞项",
      "",
      "- provider-secret-marker",
      "",
      "## 证据索引",
      "",
      "- https://unreviewed.example",
    ].join("\n");
    const summary = buildSafeReportSummary({
      databases: {
        competitor_database: [{ name: "品牌官网公开规格" }],
        opportunity_database: [{ title: "安装适配服务" }],
      },
      runLog: {
        credibility: {
          effectiveEvidence: 2,
          confirmedFindings: 2,
          needsReviewFindings: 2,
          crawlFailures: 0,
        },
      },
      reportMarkdown,
    });

    const publicMarkdown = buildSafePublicReportMarkdown({
      input: buildSafeReportInput({ category: "家用洗碗机" }),
      reportMarkdown,
      summary,
    });

    expect(publicMarkdown).toContain("### 品牌官网公开规格");
    expect(publicMarkdown).toContain("https://brand.example/spec");
    expect(publicMarkdown).toContain("### 安装适配服务");
    expect(publicMarkdown).toContain("- 状态：待验证假设");
    expect(publicMarkdown).toContain("只证明事实基础");
    expect(publicMarkdown).not.toMatch(
      /跨品类候选|provider-secret-marker|unreviewed\.example|## 证据索引|needs_review：2/,
    );
  });

  it("fails closed when credibility claims confirmed findings without a confirmed section", () => {
    const summary = buildSafeReportSummary({
      databases: null,
      runLog: {
        credibility: {
          effectiveEvidence: 3,
          confirmedFindings: 2,
          crawlFailures: 0,
        },
      },
      reportMarkdown: "## 候选发现\n\n### 未审核候选",
    });

    expect(summary.quality.status).toBe("insufficient_evidence");
    expect(summary.quality.confirmedFindings).toBe(0);
    expect(summary.counts).toEqual({
      evidence: 0,
      competitors: 0,
      opportunities: 0,
    });
  });
});
