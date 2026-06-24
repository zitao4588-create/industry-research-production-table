import { readFileSync } from "node:fs";
import {
  type ResearchWorkflowInput,
  runDeepSeekIndustryResearchWorkflow,
  runPublicDeepSeekIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";

function loadLocalEnv() {
  let envText = "";

  try {
    envText = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && value) {
      process.env[key] = value;
    }
  }
}

function createVerificationInput(goal: string): ResearchWorkflowInput {
  return {
    projectName: "宠物益生菌竞品研究 DeepSeek 验证",
    industry: "宠物健康电商",
    category: "宠物肠胃益生菌",
    market: "美国 DTC 电商",
    researchGoal: goal,
    templateId: "ecommerce_competitor_research",
    urls: ["https://example.com"],
    csvText:
      "product,price,tag\nDaily Gut Chews,29.99,digestion\nPumpkin Probiotic,24.99,sensitive stomach",
    manualText: "用户反复提到狗狗软便、换粮后肠胃不适、希望成分天然。",
  };
}

function printReportSummary(
  mode: "mock_deepseek_report" | "public_web_deepseek",
  result: Awaited<ReturnType<typeof runDeepSeekIndustryResearchWorkflow>>,
) {
  const report = result.research_reports[0];

  if (!report) {
    throw new Error("DeepSeek did not return a report.");
  }

  console.log(
    JSON.stringify(
      {
        mode,
        title: report.title,
        contentLength: report.content.length,
        hasMarkdownHeading: report.content.includes("#"),
        hasDatabaseSection:
          report.content.includes("数据库") ||
          report.content.includes("source_database"),
        usesLocalFallback:
          report.title.includes("本地回退") ||
          report.content.includes("DeepSeek 报告节点暂时失败"),
        crawlMode: result.crawl_plans[0]?.mode,
        rawDocumentCount: result.raw_documents.length,
        competitorCount: result.competitors.length,
        opportunityCount: result.opportunities.length,
        excerpt: report.content.slice(0, 900),
      },
      null,
      2,
    ),
  );
}

async function main() {
  loadLocalEnv();

  const mode = process.argv.includes("--public-web-deepseek")
    ? "public_web_deepseek"
    : "mock_deepseek_report";
  const input = createVerificationInput(
    mode === "public_web_deepseek"
      ? "验证公开网页采集、DeepSeek 结构化抽取和 Markdown 报告链路"
      : "验证 DeepSeek 能基于 mock 行业数据库生成 Markdown 报告",
  );
  const result =
    mode === "public_web_deepseek"
      ? await runPublicDeepSeekIndustryResearchWorkflow(input, {
          env: process.env,
        })
      : await runDeepSeekIndustryResearchWorkflow(input, { env: process.env });

  printReportSummary(mode, result);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exit(1);
});
