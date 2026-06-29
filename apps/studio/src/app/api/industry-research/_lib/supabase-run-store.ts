import { Buffer } from "node:buffer";
import {
  type IndustryResearchDeliveryArtifacts,
  type IndustryResearchDeliveryPackageFileKind,
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
  manifest: unknown;
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
