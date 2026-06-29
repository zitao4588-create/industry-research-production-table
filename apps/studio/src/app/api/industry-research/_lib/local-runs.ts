import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type IndustryResearchDeliveryPackageFileKind,
  type IndustryResearchDeliveryPackageManifest,
  type IndustryResearchRunLog,
  industryResearchDeliveryPackageFiles,
  type ResearchWorkflowInput,
} from "@industry-research/core";
import { loadServerEnv } from "./server-env";

const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export type LocalIndustryResearchRunSummary = {
  runId: string;
  relativeOutputDir: string;
  startedAt: string;
  finishedAt: string;
  mode: IndustryResearchRunLog["mode"];
  llmStatus: IndustryResearchRunLog["llmStatus"];
  reportTitle: string;
  projectName: string;
  counts: IndustryResearchRunLog["counts"];
  reviewSummary: IndustryResearchRunLog["reviewSummary"];
  sourceQualitySummary: IndustryResearchRunLog["sourceQualitySummary"];
  crawlFailureCount: number;
  extractionNeedsReviewCount: number;
  status: IndustryResearchDeliveryPackageManifest["status"] | "legacy_run";
  manifestAvailable: boolean;
  filesAvailable: Record<IndustryResearchDeliveryPackageFileKind, boolean>;
  detailApiPath: string;
  downloadPackageApiPath: string;
};

export type LocalIndustryResearchRunDetail = LocalIndustryResearchRunSummary & {
  manifest: IndustryResearchDeliveryPackageManifest | null;
  run_log: IndustryResearchRunLog;
  input: ResearchWorkflowInput | null;
  reportMarkdown: string | null;
  reviewedReportMarkdown: string | null;
};

export type LocalIndustryResearchDownloadPackage = {
  schemaVersion: "industry_research_delivery_package_download.v1";
  generatedAt: string;
  runId: string;
  manifest: IndustryResearchDeliveryPackageManifest | null;
  input: unknown;
  raw_documents: unknown;
  databases: unknown;
  review_items: unknown;
  reportMarkdown: string | null;
  reviewedReportMarkdown: string | null;
  run_log: IndustryResearchRunLog;
};

export class LocalRunNotFoundError extends Error {}

function resolveRepoRoot() {
  const cwd = process.cwd();

  if (existsSync(join(cwd, "outputs", "industry-research-runs"))) {
    return cwd;
  }

  const monorepoRoot = resolve(cwd, "../..");

  if (existsSync(join(monorepoRoot, "outputs", "industry-research-runs"))) {
    return monorepoRoot;
  }

  return cwd;
}

export function industryResearchRunsRootDir(
  env: Record<string, string | undefined> = loadServerEnv(),
) {
  const configuredDir = env.AGENT_FACTORY_INDUSTRY_RESEARCH_RUNS_DIR?.trim();

  return configuredDir
    ? resolve(configuredDir)
    : join(resolveRepoRoot(), "outputs", "industry-research-runs");
}

export function industryResearchRunOutputLabel(
  runId: string,
  env: Record<string, string | undefined> = loadServerEnv(),
) {
  const configuredDir = env.AGENT_FACTORY_INDUSTRY_RESEARCH_RUNS_DIR?.trim();

  return configuredDir
    ? join(resolve(configuredDir), runId)
    : `outputs/industry-research-runs/${runId}`;
}

function assertSafeRunId(runId: string) {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new LocalRunNotFoundError("无效的 runId。");
  }
}

function runDir(runId: string) {
  assertSafeRunId(runId);
  return join(industryResearchRunsRootDir(), runId);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readFilesAvailable(directory: string) {
  const entries = await Promise.all(
    industryResearchDeliveryPackageFiles.map(async (file) => [
      file.kind,
      await fileExists(join(directory, file.fileName)),
    ]),
  );

  return Object.fromEntries(entries) as Record<
    IndustryResearchDeliveryPackageFileKind,
    boolean
  >;
}

function apiPaths(runId: string) {
  const encodedRunId = encodeURIComponent(runId);

  return {
    detailApiPath: `/api/industry-research/runs/${encodedRunId}`,
    downloadPackageApiPath: `/api/industry-research/runs/${encodedRunId}/download`,
  };
}

async function readRunSummary(
  runId: string,
): Promise<LocalIndustryResearchRunSummary | null> {
  const directory = runDir(runId);
  const runLog = await readJsonFile<IndustryResearchRunLog>(
    join(directory, "run_log.json"),
  );

  if (!runLog) {
    return null;
  }

  const manifest = await readJsonFile<IndustryResearchDeliveryPackageManifest>(
    join(directory, "manifest.json"),
  );
  const input = await readJsonFile<ResearchWorkflowInput>(
    join(directory, "input.json"),
  );
  const paths = apiPaths(runLog.runId);

  return {
    runId: runLog.runId,
    relativeOutputDir: industryResearchRunOutputLabel(runLog.runId),
    startedAt: runLog.startedAt,
    finishedAt: runLog.finishedAt,
    mode: runLog.mode,
    llmStatus: runLog.llmStatus,
    reportTitle: runLog.reportTitle,
    projectName: manifest?.project.name ?? input?.projectName ?? runLog.runId,
    counts: runLog.counts,
    reviewSummary: runLog.reviewSummary,
    sourceQualitySummary: runLog.sourceQualitySummary,
    crawlFailureCount: (runLog.crawlFailures ?? []).length,
    extractionNeedsReviewCount: (runLog.extractionNeedsReview ?? []).length,
    status: manifest?.status ?? "legacy_run",
    manifestAvailable: Boolean(manifest),
    filesAvailable: await readFilesAvailable(directory),
    ...paths,
  };
}

export async function listLocalIndustryResearchRuns(limit = 50) {
  let entries: Dirent[];

  try {
    entries = await readdir(industryResearchRunsRootDir(), {
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  const summaries = (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .filter((entry) => RUN_ID_PATTERN.test(entry.name))
        .map((entry) => readRunSummary(entry.name)),
    )
  ).filter((summary): summary is LocalIndustryResearchRunSummary =>
    Boolean(summary),
  );

  return summaries
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, limit);
}

export async function getLocalIndustryResearchRunDetail(
  runId: string,
): Promise<LocalIndustryResearchRunDetail> {
  const summary = await readRunSummary(runId);

  if (!summary) {
    throw new LocalRunNotFoundError("没有找到对应的行业研究 run。");
  }

  const directory = runDir(runId);
  const runLog = await readJsonFile<IndustryResearchRunLog>(
    join(directory, "run_log.json"),
  );

  if (!runLog) {
    throw new LocalRunNotFoundError("没有找到 run_log.json。");
  }

  return {
    ...summary,
    manifest: await readJsonFile<IndustryResearchDeliveryPackageManifest>(
      join(directory, "manifest.json"),
    ),
    run_log: runLog,
    input: await readJsonFile<ResearchWorkflowInput>(
      join(directory, "input.json"),
    ),
    reportMarkdown: await readTextFile(join(directory, "report.md")),
    reviewedReportMarkdown: await readTextFile(
      join(directory, "reviewed_report.md"),
    ),
  };
}

export async function getLocalIndustryResearchDownloadPackage(
  runId: string,
): Promise<LocalIndustryResearchDownloadPackage> {
  const detail = await getLocalIndustryResearchRunDetail(runId);
  const directory = runDir(runId);

  return {
    schemaVersion: "industry_research_delivery_package_download.v1",
    generatedAt: new Date().toISOString(),
    runId,
    manifest: detail.manifest,
    input: await readJsonFile(join(directory, "input.json")),
    raw_documents: await readJsonFile(join(directory, "raw_documents.json")),
    databases: await readJsonFile(join(directory, "databases.json")),
    review_items: await readJsonFile(join(directory, "review_items.json")),
    reportMarkdown: detail.reportMarkdown,
    reviewedReportMarkdown: detail.reviewedReportMarkdown,
    run_log: detail.run_log,
  };
}
