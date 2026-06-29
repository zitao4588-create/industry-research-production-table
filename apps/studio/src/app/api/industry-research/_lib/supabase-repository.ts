import { Buffer } from "node:buffer";
import type {
  IndustryResearchReportRecord,
  IndustryResearchRepository,
  IndustryResearchRepositorySnapshot,
  IndustryResearchRunRecord,
  RawDocument,
  ResearchReviewItem,
} from "@industry-research/core";
import type { SupabaseClient } from "@supabase/supabase-js";

type ArtifactRow = {
  run_id: string;
  kind: string;
  json_content: unknown;
  text_content: string | null;
};

function mapRunRecord(row: Record<string, unknown>): IndustryResearchRunRecord {
  return {
    runId: String(row.run_id),
    status: mapRunStatus(String(row.status)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    input: row.input as IndustryResearchRunRecord["input"],
    manifest: row.manifest as IndustryResearchRunRecord["manifest"],
  };
}

function mapRunStatus(value: string): IndustryResearchRunRecord["status"] {
  if (value === "failed" || value === "running") {
    return value;
  }

  if (value === "ready_for_internal_review") {
    return "ready_for_review";
  }

  return "completed";
}

function throwIfSupabaseError(
  action: string,
  error: { message: string } | null,
) {
  if (error) {
    throw new Error(`Supabase repository ${action} failed: ${error.message}`);
  }
}

export function createIndustryResearchSupabaseRepository(
  client: SupabaseClient,
): IndustryResearchRepository {
  return {
    async listRuns() {
      const { data, error } = await client
        .from("industry_research_runs")
        .select("run_id,status,created_at,updated_at,input,manifest")
        .order("updated_at", { ascending: false });
      throwIfSupabaseError("listRuns", error);

      return (data ?? []).map((row) =>
        mapRunRecord(row as Record<string, unknown>),
      );
    },

    async getRun(runId) {
      const { data, error } = await client
        .from("industry_research_runs")
        .select("run_id,status,created_at,updated_at,input,manifest")
        .eq("run_id", runId)
        .maybeSingle();
      throwIfSupabaseError("getRun", error);

      return data ? mapRunRecord(data as Record<string, unknown>) : null;
    },

    async upsertRun(record) {
      const { error } = await client.from("industry_research_runs").upsert(
        {
          run_id: record.runId,
          project_name: record.input.projectName,
          template_id: record.input.templateId,
          industry: record.input.industry,
          category: record.input.category,
          market: record.input.market,
          research_goal: record.input.researchGoal,
          status:
            record.status === "ready_for_review"
              ? "ready_for_internal_review"
              : record.status,
          mode: record.manifest?.mode ?? "public_web_local_fallback",
          llm_status: record.manifest?.llmStatus ?? "local",
          started_at: record.createdAt,
          finished_at: record.updatedAt,
          input: record.input,
          manifest: record.manifest ?? null,
          updated_at: record.updatedAt,
        },
        { onConflict: "run_id" },
      );
      throwIfSupabaseError("upsertRun", error);
    },

    async saveRawDocuments(runId, documents) {
      await upsertJsonArtifact(client, runId, "raw_documents", documents);
    },

    async saveReviewItems(runId, items) {
      await upsertJsonArtifact(client, runId, "review_items", {
        items,
      });
    },

    async saveReports(record) {
      if (record.reportMarkdown) {
        await upsertTextArtifact(
          client,
          record.runId,
          "report",
          record.reportMarkdown,
        );
      }

      if (record.reviewedReportMarkdown) {
        await upsertTextArtifact(
          client,
          record.runId,
          "reviewed_report",
          record.reviewedReportMarkdown,
        );
      }
    },

    async saveRunLog(runId, runLog) {
      const { error } = await client
        .from("industry_research_runs")
        .update({
          run_log: runLog,
          counts: runLog.counts,
          source_quality_summary: runLog.sourceQualitySummary,
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId);
      throwIfSupabaseError("saveRunLog", error);
      await upsertJsonArtifact(client, runId, "run_log", runLog);
    },

    async snapshot() {
      const runs = await this.listRuns();
      const { data, error } = await client
        .from("industry_research_artifacts")
        .select("run_id,kind,json_content,text_content");
      throwIfSupabaseError("snapshot artifacts", error);

      return buildSnapshot(runs, (data ?? []) as ArtifactRow[]);
    },
  };
}

async function upsertJsonArtifact(
  client: SupabaseClient,
  runId: string,
  kind: string,
  value: unknown,
) {
  const { error } = await client.from("industry_research_artifacts").upsert(
    {
      run_id: runId,
      kind,
      content_type: "application/json",
      json_content: value,
      text_content: null,
      byte_size: Buffer.byteLength(JSON.stringify(value), "utf8"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "run_id,kind" },
  );
  throwIfSupabaseError(`upsert ${kind}`, error);
}

async function upsertTextArtifact(
  client: SupabaseClient,
  runId: string,
  kind: string,
  value: string,
) {
  const { error } = await client.from("industry_research_artifacts").upsert(
    {
      run_id: runId,
      kind,
      content_type: "text/markdown",
      json_content: null,
      text_content: value,
      byte_size: Buffer.byteLength(value, "utf8"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "run_id,kind" },
  );
  throwIfSupabaseError(`upsert ${kind}`, error);
}

function buildSnapshot(
  runs: IndustryResearchRunRecord[],
  artifactRows: ArtifactRow[],
): IndustryResearchRepositorySnapshot {
  const artifacts = new Map<string, ArtifactRow[]>();

  for (const artifact of artifactRows) {
    const items = artifacts.get(artifact.run_id) ?? [];
    items.push(artifact);
    artifacts.set(artifact.run_id, items);
  }

  return {
    runs,
    rawDocuments: artifactRows
      .filter((row) => row.kind === "raw_documents")
      .map((row) => ({
        runId: row.run_id,
        documents: row.json_content as RawDocument[],
      })),
    reviewItems: artifactRows
      .filter((row) => row.kind === "review_items")
      .map((row) => ({
        runId: row.run_id,
        items:
          (row.json_content as { items?: ResearchReviewItem[] } | null)
            ?.items ?? [],
      })),
    reports: runs.map((run) => buildReportRecord(run.runId, artifacts)),
    runLogs: artifactRows
      .filter((row) => row.kind === "run_log")
      .map((row) => ({
        runId: row.run_id,
        runLog:
          row.json_content as IndustryResearchRepositorySnapshot["runLogs"][number]["runLog"],
      })),
  };
}

function buildReportRecord(
  runId: string,
  artifacts: Map<string, ArtifactRow[]>,
): IndustryResearchReportRecord {
  const rows = artifacts.get(runId) ?? [];

  return {
    runId,
    reportMarkdown:
      rows.find((row) => row.kind === "report")?.text_content ?? undefined,
    reviewedReportMarkdown:
      rows.find((row) => row.kind === "reviewed_report")?.text_content ??
      undefined,
    updatedAt: new Date().toISOString(),
  };
}
