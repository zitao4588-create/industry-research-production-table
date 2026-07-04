import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createIndustryResearchDeliveryArtifacts,
  type IndustryResearchDeliveryArtifacts,
  type ResearchWorkflowInput,
  type ResearchWorkflowResult,
} from "@industry-research/core";
import {
  findPreviousLocalIndustryResearchRun,
  industryResearchRunOutputLabel,
  industryResearchRunsRootDir,
} from "./local-runs";
import { persistIndustryResearchArtifactsToSupabase } from "./supabase-run-store";

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function slugifyRunId(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "industry-research";
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeDeliveryArtifacts(
  outputDir: string,
  artifacts: IndustryResearchDeliveryArtifacts,
) {
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
}

export async function persistIndustryResearchDeliveryPackage({
  input,
  result,
  startedAt,
  finishedAt,
  env,
}: {
  input: ResearchWorkflowInput;
  result: ResearchWorkflowResult;
  startedAt: string;
  finishedAt: string;
  env?: Record<string, string | undefined>;
}) {
  const startedDate = new Date(startedAt);
  const runId = `${slugifyRunId(input.projectName)}-${timestampForPath(startedDate)}`;
  const outputDir = join(industryResearchRunsRootDir(env), runId);
  // T6 周报 diff：真实 public_web 系 run 以上一次同项目本地 run 为基线；
  // mock 结果不参与 diff（rich demo 数据会污染基线）。
  const previousRun =
    result.crawl_plans[0]?.mode === "public_web"
      ? await findPreviousLocalIndustryResearchRun(input)
      : undefined;
  const artifacts = createIndustryResearchDeliveryArtifacts({
    input,
    result,
    runId,
    startedAt,
    finishedAt,
    previousRun,
  });

  await mkdir(outputDir, { recursive: true });
  await writeDeliveryArtifacts(outputDir, artifacts);
  await persistIndustryResearchArtifactsToSupabase({ artifacts, env });

  return {
    runId,
    relativeOutputDir: industryResearchRunOutputLabel(runId, env),
    manifest: artifacts.manifest,
    run_log: artifacts.run_log,
  };
}
