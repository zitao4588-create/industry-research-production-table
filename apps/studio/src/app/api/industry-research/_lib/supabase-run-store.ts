import { Buffer } from "node:buffer";
import {
  type IndustryResearchDeliveryArtifacts,
  type IndustryResearchDeliveryPackageFileKind,
  type IndustryResearchDeliveryPackageManifest,
  type IndustryResearchRunLog,
  industryResearchDeliveryPackageFiles,
  type ResearchWorkflowInput,
} from "@industry-research/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  isTruthyEnv,
  loadServerEnv,
  SUPABASE_ENABLED_ENV,
  SUPABASE_PROJECT_REF_ENV,
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  SUPABASE_URL_ENV,
} from "./server-env";

export type SupabaseInfraConfig = {
  enabled: boolean;
  projectRef?: string;
  url?: string;
  serviceRoleKey?: string;
  missing: string[];
};

export type N8nRunCompleteEvent = {
  runId: string;
  status: "queued" | "running" | "completed" | "failed";
  n8nExecutionId?: string;
  deliveryPackageApiPath?: string;
  message?: string;
  payload: Record<string, unknown>;
};

type JsonValue =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

const jsonArtifactKinds = new Set<IndustryResearchDeliveryPackageFileKind>([
  "input",
  "raw_documents",
  "databases",
  "review_items",
  "run_log",
  "manifest",
]);

export function resolveSupabaseInfraConfig(
  env: Record<string, string | undefined> = loadServerEnv(),
): SupabaseInfraConfig {
  const enabled = isTruthyEnv(env[SUPABASE_ENABLED_ENV]);
  const projectRef = env[SUPABASE_PROJECT_REF_ENV]?.trim();
  const url = env[SUPABASE_URL_ENV]?.trim();
  const serviceRoleKey = env[SUPABASE_SERVICE_ROLE_KEY_ENV]?.trim();
  const missing = [
    projectRef ? null : SUPABASE_PROJECT_REF_ENV,
    url ? null : SUPABASE_URL_ENV,
    serviceRoleKey ? null : SUPABASE_SERVICE_ROLE_KEY_ENV,
  ].filter((value): value is string => Boolean(value));

  return { enabled, projectRef, url, serviceRoleKey, missing };
}

export function createIndustryResearchSupabaseAdminClient(
  env: Record<string, string | undefined> = loadServerEnv(),
): SupabaseClient | null {
  const config = resolveSupabaseInfraConfig(env);

  if (!config.enabled) {
    return null;
  }

  if (!config.url || !config.serviceRoleKey) {
    throw new Error(
      `Supabase persistence is enabled but missing ${config.missing.join(", ")}.`,
    );
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-application-name": "industry-research-production-table",
      },
    },
  });
}

function textByteSize(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function jsonByteSize(value: JsonValue) {
  return textByteSize(JSON.stringify(value));
}

function artifactContent(
  kind: IndustryResearchDeliveryPackageFileKind,
  artifacts: IndustryResearchDeliveryArtifacts,
): { jsonContent: JsonValue | null; textContent: string | null } {
  switch (kind) {
    case "input":
      return {
        jsonContent: artifacts.input as unknown as JsonValue,
        textContent: null,
      };
    case "raw_documents":
      return {
        jsonContent: artifacts.raw_documents as unknown as JsonValue,
        textContent: null,
      };
    case "databases":
      return {
        jsonContent: artifacts.databases as unknown as JsonValue,
        textContent: null,
      };
    case "review_items":
      return {
        jsonContent: artifacts.review_items as unknown as JsonValue,
        textContent: null,
      };
    case "run_log":
      return {
        jsonContent: artifacts.run_log as unknown as JsonValue,
        textContent: null,
      };
    case "manifest":
      return {
        jsonContent: artifacts.manifest as unknown as JsonValue,
        textContent: null,
      };
    case "report":
      return { jsonContent: null, textContent: artifacts.reportMarkdown };
    case "reviewed_report":
      return {
        jsonContent: null,
        textContent: artifacts.reviewedReportMarkdown,
      };
  }
}

function artifactRows(artifacts: IndustryResearchDeliveryArtifacts) {
  const now = new Date().toISOString();

  return industryResearchDeliveryPackageFiles.map((file) => {
    const { jsonContent, textContent } = artifactContent(file.kind, artifacts);

    return {
      run_id: artifacts.run_log.runId,
      kind: file.kind,
      content_type: file.contentType,
      json_content: jsonContent,
      text_content: textContent,
      byte_size:
        jsonArtifactKinds.has(file.kind) && jsonContent !== null
          ? jsonByteSize(jsonContent)
          : textByteSize(textContent ?? ""),
      updated_at: now,
    };
  });
}

function runRow(artifacts: IndustryResearchDeliveryArtifacts) {
  const input = artifacts.input;
  const runLog = artifacts.run_log;
  const manifest = artifacts.manifest;
  const now = new Date().toISOString();

  return {
    run_id: runLog.runId,
    project_name: input.projectName,
    template_id: input.templateId,
    industry: input.industry,
    category: input.category,
    market: input.market,
    research_goal: input.researchGoal,
    status: manifest.status,
    mode: runLog.mode,
    llm_status: runLog.llmStatus,
    started_at: runLog.startedAt,
    finished_at: runLog.finishedAt,
    input: input as unknown as JsonValue,
    manifest: manifest as unknown as JsonValue,
    run_log: runLog as unknown as JsonValue,
    counts: runLog.counts as unknown as JsonValue,
    source_quality_summary: runLog.sourceQualitySummary as unknown as JsonValue,
    updated_at: now,
  };
}

function throwSupabaseError(action: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`Supabase ${action} failed: ${error.message}`);
  }
}

export async function persistIndustryResearchArtifactsToSupabase({
  artifacts,
  env = loadServerEnv(),
}: {
  artifacts: IndustryResearchDeliveryArtifacts;
  env?: Record<string, string | undefined>;
}) {
  const client = createIndustryResearchSupabaseAdminClient(env);

  if (!client) {
    return { enabled: false as const };
  }

  const runResult = await client
    .from("industry_research_runs")
    .upsert(runRow(artifacts), { onConflict: "run_id" });
  throwSupabaseError("run upsert", runResult.error);

  const artifactResult = await client
    .from("industry_research_artifacts")
    .upsert(artifactRows(artifacts), { onConflict: "run_id,kind" });
  throwSupabaseError("artifact upsert", artifactResult.error);

  return { enabled: true as const, runId: artifacts.run_log.runId };
}

export async function recordIndustryResearchN8nEvent({
  event,
  env = loadServerEnv(),
}: {
  event: N8nRunCompleteEvent;
  env?: Record<string, string | undefined>;
}) {
  const client = createIndustryResearchSupabaseAdminClient(env);

  if (!client) {
    return { enabled: false as const };
  }

  const { error } = await client.from("industry_research_n8n_events").insert({
    run_id: event.runId,
    status: event.status,
    n8n_execution_id: event.n8nExecutionId ?? null,
    delivery_package_api_path: event.deliveryPackageApiPath ?? null,
    message: event.message ?? null,
    payload: event.payload,
  });

  throwSupabaseError("n8n event insert", error);

  return { enabled: true as const, runId: event.runId };
}

export type SupabaseRunRecord = {
  run_id: string;
  input: ResearchWorkflowInput;
  run_log: IndustryResearchRunLog | null;
  manifest: IndustryResearchDeliveryPackageManifest | null;
};

type SupabaseArtifactRecord = {
  kind: IndustryResearchDeliveryPackageFileKind;
  json_content: unknown;
  text_content: string | null;
};

export async function fetchIndustryResearchSupabaseRun({
  runId,
  env = loadServerEnv(),
}: {
  runId: string;
  env?: Record<string, string | undefined>;
}) {
  const client = createIndustryResearchSupabaseAdminClient(env);

  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("industry_research_runs")
    .select("run_id,input,run_log,manifest")
    .eq("run_id", runId)
    .maybeSingle();

  throwSupabaseError("run read", error);

  return data as SupabaseRunRecord | null;
}

async function fetchSupabaseArtifacts(
  runId: string,
  client: SupabaseClient,
  kinds?: IndustryResearchDeliveryPackageFileKind[],
) {
  let query = client
    .from("industry_research_artifacts")
    .select("kind,json_content,text_content")
    .eq("run_id", runId);
  if (kinds?.length) query = query.in("kind", kinds);
  const { data, error } = await query;

  throwSupabaseError("artifact read", error);

  return (data ?? []) as SupabaseArtifactRecord[];
}

export async function getIndustryResearchSupabasePublicReportPackage({
  runId,
  env = loadServerEnv(),
}: {
  runId: string;
  env?: Record<string, string | undefined>;
}) {
  const client = createIndustryResearchSupabaseAdminClient(env);
  if (!client) return null;

  const run = await fetchIndustryResearchSupabaseRun({ runId, env });
  if (!run?.run_log) return null;

  const artifacts = artifactMap(
    await fetchSupabaseArtifacts(runId, client, [
      "databases",
      "report",
      "reviewed_report",
    ]),
  );

  return {
    runId,
    input: run.input,
    run_log: run.run_log,
    databases: artifacts.get("databases")?.json_content ?? null,
    reportMarkdown: artifacts.get("report")?.text_content ?? null,
    reviewedReportMarkdown:
      artifacts.get("reviewed_report")?.text_content ?? null,
    storage: "supabase",
  };
}

function artifactMap(artifacts: SupabaseArtifactRecord[]) {
  return new Map(
    artifacts.map((artifact) => [artifact.kind, artifact] as const),
  );
}

function apiPaths(runId: string) {
  const encodedRunId = encodeURIComponent(runId);
  return {
    detailApiPath: `/api/industry-research/runs/${encodedRunId}`,
    downloadPackageApiPath: `/api/industry-research/runs/${encodedRunId}/download`,
  };
}

export async function listIndustryResearchSupabaseRuns({
  limit = 50,
  env = loadServerEnv(),
}: {
  limit?: number;
  env?: Record<string, string | undefined>;
}) {
  const client = createIndustryResearchSupabaseAdminClient(env);

  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("industry_research_runs")
    .select(
      "run_id,project_name,status,started_at,finished_at,mode,llm_status,counts,source_quality_summary,manifest,run_log",
    )
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  throwSupabaseError("run list read", error);

  return (data ?? []).map((row) => {
    const runLog = row.run_log as IndustryResearchRunLog | null;
    const manifest =
      row.manifest as IndustryResearchDeliveryPackageManifest | null;
    const runId = String(row.run_id);

    return {
      runId,
      relativeOutputDir: `supabase://industry_research_runs/${runId}`,
      startedAt: String(row.started_at ?? runLog?.startedAt ?? ""),
      finishedAt: String(row.finished_at ?? runLog?.finishedAt ?? ""),
      mode: runLog?.mode ?? row.mode,
      llmStatus: runLog?.llmStatus ?? row.llm_status,
      reportTitle: runLog?.reportTitle ?? "",
      projectName: String(row.project_name ?? runId),
      counts: runLog?.counts ?? row.counts,
      reviewSummary: runLog?.reviewSummary ?? {
        approved: 0,
        needs_review: 0,
        rejected: 0,
      },
      sourceQualitySummary:
        runLog?.sourceQualitySummary ?? row.source_quality_summary,
      crawlFailureCount: (runLog?.crawlFailures ?? []).length,
      extractionNeedsReviewCount: (runLog?.extractionNeedsReview ?? []).length,
      status: manifest?.status ?? row.status,
      manifestAvailable: Boolean(manifest),
      filesAvailable: Object.fromEntries(
        industryResearchDeliveryPackageFiles.map((file) => [file.kind, true]),
      ),
      ...apiPaths(runId),
      storage: "supabase",
    };
  });
}

export async function getIndustryResearchSupabaseRunDetail({
  runId,
  env = loadServerEnv(),
}: {
  runId: string;
  env?: Record<string, string | undefined>;
}) {
  const client = createIndustryResearchSupabaseAdminClient(env);

  if (!client) {
    return null;
  }

  const run = await fetchIndustryResearchSupabaseRun({ runId, env });
  if (!run?.run_log) {
    return null;
  }

  const artifacts = artifactMap(await fetchSupabaseArtifacts(runId, client));
  const paths = apiPaths(runId);

  return {
    runId,
    relativeOutputDir: `supabase://industry_research_runs/${runId}`,
    startedAt: run.run_log.startedAt,
    finishedAt: run.run_log.finishedAt,
    mode: run.run_log.mode,
    llmStatus: run.run_log.llmStatus,
    reportTitle: run.run_log.reportTitle,
    projectName: run.input.projectName,
    counts: run.run_log.counts,
    reviewSummary: run.run_log.reviewSummary,
    sourceQualitySummary: run.run_log.sourceQualitySummary,
    crawlFailureCount: (run.run_log.crawlFailures ?? []).length,
    extractionNeedsReviewCount: (run.run_log.extractionNeedsReview ?? [])
      .length,
    status: run.manifest?.status ?? "legacy_run",
    manifestAvailable: Boolean(run.manifest),
    filesAvailable: Object.fromEntries(
      industryResearchDeliveryPackageFiles.map((file) => [
        file.kind,
        artifacts.has(file.kind),
      ]),
    ),
    ...paths,
    manifest: run.manifest,
    run_log: run.run_log,
    input: run.input,
    reportMarkdown: artifacts.get("report")?.text_content ?? null,
    reviewedReportMarkdown:
      artifacts.get("reviewed_report")?.text_content ?? null,
    storage: "supabase",
  };
}

export async function getIndustryResearchSupabaseDownloadPackage({
  runId,
  env = loadServerEnv(),
}: {
  runId: string;
  env?: Record<string, string | undefined>;
}) {
  const detail = await getIndustryResearchSupabaseRunDetail({ runId, env });
  const client = createIndustryResearchSupabaseAdminClient(env);

  if (!detail || !client) {
    return null;
  }

  const artifacts = artifactMap(await fetchSupabaseArtifacts(runId, client));

  return {
    schemaVersion: "industry_research_delivery_package_download.v1",
    generatedAt: new Date().toISOString(),
    runId,
    manifest: detail.manifest,
    input: artifacts.get("input")?.json_content ?? detail.input,
    raw_documents: artifacts.get("raw_documents")?.json_content ?? null,
    databases: artifacts.get("databases")?.json_content ?? null,
    review_items: artifacts.get("review_items")?.json_content ?? null,
    reportMarkdown: detail.reportMarkdown,
    reviewedReportMarkdown: detail.reviewedReportMarkdown,
    run_log: detail.run_log,
    storage: "supabase",
  };
}
