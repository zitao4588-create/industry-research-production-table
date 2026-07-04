import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildHistoricalContextFromDatabases,
  createIndustryResearchDeliveryArtifacts,
  type ResearchWorkflowInput,
  runPublicDeepSeekIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";
import { findPreviousLocalRun } from "./lib/find-previous-run.ts";

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

    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function createRealSampleInput(): ResearchWorkflowInput {
  return {
    projectName: "美国 DTC 宠物益生菌品牌竞品研究",
    industry: "宠物健康电商",
    category: "宠物肠胃益生菌",
    market: "美国 DTC 电商",
    researchGoal:
      "验证行业研究生产台能否基于公开网页采集、DeepSeek 结构化抽取和人工审核状态，产出可交付的竞品研究报告。",
    templateId: "ecommerce_competitor_research",
    urls: [
      "https://nativepet.com/products/probiotic",
      "https://www.petfinn.com/products/probiotics",
      "https://www.pethonesty.com/products/probiotics",
    ],
    csvText:
      "brand,product_hint,review_hint\nNative Pet,Probiotic,关注日常肠胃护理和粉末形态\nFinn,Probiotics,关注软便和敏感肠胃场景\nPet Honesty,Probiotics,关注咀嚼片和日常复购",
    manualText:
      "人工补充假设：DTC 宠物益生菌品牌通常围绕软便、换粮、敏感肠胃、天然成分和订阅复购做内容教育；这些假设必须由公开网页和后续评论数据验证。",
  };
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  loadLocalEnv();

  const started = new Date();
  const runId = `pet-probiotics-dtc-${timestampForPath(started)}`;
  const input = createRealSampleInput();
  const runsRootDir = join("outputs", "industry-research-runs");
  const previousRun = await findPreviousLocalRun(runsRootDir, input);
  const result = await runPublicDeepSeekIndustryResearchWorkflow(input, {
    env: process.env,
    now: started.toISOString(),
    historicalContext: previousRun
      ? buildHistoricalContextFromDatabases(
          previousRun.runId,
          previousRun.databases,
        )
      : undefined,
  });
  const finished = new Date();
  const artifacts = createIndustryResearchDeliveryArtifacts({
    input,
    result,
    runId,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    previousRun,
  });
  const outputDir = join(runsRootDir, runId);

  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "input.json"), artifacts.input);
  await writeJson(
    join(outputDir, "raw_documents.json"),
    artifacts.raw_documents,
  );
  await writeJson(join(outputDir, "databases.json"), artifacts.databases);
  await writeJson(join(outputDir, "review_items.json"), artifacts.review_items);
  await writeFile(
    join(outputDir, "report.md"),
    artifacts.reportMarkdown,
    "utf8",
  );
  await writeFile(
    join(outputDir, "reviewed_report.md"),
    artifacts.reviewedReportMarkdown,
    "utf8",
  );
  await writeJson(join(outputDir, "run_log.json"), artifacts.run_log);
  await writeJson(join(outputDir, "manifest.json"), artifacts.manifest);

  console.log(
    JSON.stringify(
      {
        runId,
        outputDir,
        manifest: join(outputDir, "manifest.json"),
        mode: artifacts.run_log.mode,
        llmStatus: artifacts.run_log.llmStatus,
        rawDocuments: artifacts.run_log.counts.rawDocuments,
        evidence: artifacts.run_log.counts.evidence,
        reviewSummary: artifacts.run_log.reviewSummary,
        crawlFailures: artifacts.run_log.crawlFailures.length,
        extractionNeedsReview: artifacts.run_log.extractionNeedsReview.length,
        sourceQualitySummary: artifacts.run_log.sourceQualitySummary,
        report: join(outputDir, "report.md"),
        reviewedReport: join(outputDir, "reviewed_report.md"),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exit(1);
});
