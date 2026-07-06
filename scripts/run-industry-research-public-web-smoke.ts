import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createIndustryResearchDeliveryArtifacts,
  type ResearchWorkflowInput,
  runPublicIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";
import { findPreviousLocalRun } from "./lib/find-previous-run.ts";

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createSmokeInput(): ResearchWorkflowInput {
  return {
    projectName: "v03 public web smoke test",
    industry: "示例公开网页验证",
    category: "公开网页",
    market: "全球",
    researchGoal:
      "验证独立项目不启动 Next Studio、不调用 DeepSeek 的 public_web 轻量链路，并确认交付包写入。",
    templateId: "ecommerce_competitor_research",
    urls: ["https://example.com/"],
    csvText: "",
    manualText: "本次只做公开网页轻量验证，不调用 DeepSeek。",
  };
}

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return {};
  }

  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return env;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex <= 0) {
        return env;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      env[key] = value.replace(/^["']|["']$/g, "");

      return env;
    }, {});
}

async function main() {
  const started = new Date();
  const input = createSmokeInput();
  const runId = `v03-public-web-smoke-${timestampForPath(started)}`;
  const env = { ...loadLocalEnv(), ...process.env };
  const result = await runPublicIndustryResearchWorkflow(input, {
    maxDiscoveredTargets: 6,
    maxProbeUrls: 8,
    maxSitemapUrls: 4,
    requestTimeoutMs: 8_000,
    now: started.toISOString(),
    env,
  });
  const finished = new Date();
  const runsRootDir = join("outputs", "industry-research-runs");
  const previousRun = await findPreviousLocalRun(runsRootDir, input);
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
        rawDocuments: artifacts.run_log.counts.rawDocuments,
        acceptedForReport:
          artifacts.run_log.sourceQualitySummary.acceptedForReport,
        crawlFailures: artifacts.run_log.crawlFailureSummary,
        manifest: join(outputDir, "manifest.json"),
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
