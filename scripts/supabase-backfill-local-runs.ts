import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  IndustryResearchDeliveryArtifacts,
  IndustryResearchDeliveryDatabases,
  IndustryResearchDeliveryPackageManifest,
  IndustryResearchRunLog,
  ResearchWorkflowInput,
} from "@industry-research/core";
import { loadServerEnv } from "../apps/studio/src/app/api/industry-research/_lib/server-env.ts";
import {
  fetchIndustryResearchSupabaseRun,
  persistIndustryResearchArtifactsToSupabase,
  resolveSupabaseInfraConfig,
} from "../apps/studio/src/app/api/industry-research/_lib/supabase-run-store.ts";

const RUNS_DIR_ENV = "AGENT_FACTORY_INDUSTRY_RESEARCH_RUNS_DIR";

type BackfillStatus =
  | "would_insert"
  | "would_update"
  | "inserted_or_updated"
  | "skipped_existing"
  | "skipped_invalid";

type BackfillResult = {
  runId: string;
  status: BackfillStatus;
  reason?: string;
  artifactKinds?: string[];
};

const env = loadServerEnv();

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function flagEnabled(name: string) {
  return process.argv.includes(`--${name}`);
}

function runsRoot() {
  return resolve(
    argValue("runs-dir") ||
      env[RUNS_DIR_ENV] ||
      "outputs/industry-research-runs",
  );
}

async function fileText(path: string) {
  return readFile(path, "utf8");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await fileText(path)) as T;
}

async function loadArtifacts(
  runId: string,
): Promise<IndustryResearchDeliveryArtifacts> {
  const runDir = join(runsRoot(), runId);
  const input = await readJson<ResearchWorkflowInput>(
    join(runDir, "input.json"),
  );
  const rawDocuments = await readJson<
    IndustryResearchDeliveryArtifacts["raw_documents"]
  >(join(runDir, "raw_documents.json"));
  const databases = await readJson<IndustryResearchDeliveryDatabases>(
    join(runDir, "databases.json"),
  );
  const reviewItems = await readJson<
    IndustryResearchDeliveryArtifacts["review_items"]
  >(join(runDir, "review_items.json"));
  const runLog = await readJson<IndustryResearchRunLog>(
    join(runDir, "run_log.json"),
  );
  const manifest = await readJson<IndustryResearchDeliveryPackageManifest>(
    join(runDir, "manifest.json"),
  );
  const reportMarkdown = await fileText(join(runDir, "report.md"));
  const reviewedReportMarkdown = await fileText(
    join(runDir, "reviewed_report.md"),
  );

  if (runLog.runId !== runId || manifest.runId !== runId) {
    throw new Error(
      `run id mismatch: directory=${runId}, run_log=${runLog.runId}, manifest=${manifest.runId}`,
    );
  }

  return {
    input,
    raw_documents: rawDocuments,
    databases,
    review_items: reviewItems,
    reportMarkdown,
    reviewedReportMarkdown,
    run_log: runLog,
    manifest,
  };
}

async function listRunIds() {
  const requestedRunId = argValue("run-id");
  if (requestedRunId) {
    return [requestedRunId];
  }

  const entries = await readdir(runsRoot(), { withFileTypes: true });
  const runIds = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const limit = Number(argValue("limit") ?? 0);

  return Number.isFinite(limit) && limit > 0 ? runIds.slice(0, limit) : runIds;
}

async function runDirExists() {
  try {
    const info = await stat(runsRoot());
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  const write = flagEnabled("write");
  const skipExisting = flagEnabled("skip-existing");
  const config = resolveSupabaseInfraConfig(env);

  if (!config.enabled || config.missing.length > 0) {
    console.log(
      JSON.stringify(
        {
          status: "skipped_supabase_not_ready",
          enabled: config.enabled,
          projectRef: config.projectRef ?? null,
          missing: config.missing,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  if (!(await runDirExists())) {
    throw new Error(`runs dir does not exist: ${runsRoot()}`);
  }

  const runIds = await listRunIds();
  const results: BackfillResult[] = [];

  for (const runId of runIds) {
    try {
      const existing = await fetchIndustryResearchSupabaseRun({ runId, env });
      const artifacts = await loadArtifacts(runId);
      const artifactKinds = artifacts.manifest.files.map((file) => file.kind);

      if (!write) {
        results.push({
          runId,
          status: existing ? "would_update" : "would_insert",
          artifactKinds,
        });
        continue;
      }

      if (skipExisting && existing) {
        results.push({
          runId,
          status: "skipped_existing",
          artifactKinds,
        });
        continue;
      }

      await persistIndustryResearchArtifactsToSupabase({ artifacts, env });
      results.push({
        runId,
        status: "inserted_or_updated",
        artifactKinds,
      });
    } catch (error) {
      results.push({
        runId,
        status: "skipped_invalid",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = results.reduce<Record<BackfillStatus, number>>(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    {
      would_insert: 0,
      would_update: 0,
      inserted_or_updated: 0,
      skipped_existing: 0,
      skipped_invalid: 0,
    },
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        mode: write ? "write" : "dry_run",
        runsDir: runsRoot(),
        projectRef: config.projectRef,
        runCount: runIds.length,
        summary,
        results,
      },
      null,
      2,
    ),
  );

  if (results.some((result) => result.status === "skipped_invalid")) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
