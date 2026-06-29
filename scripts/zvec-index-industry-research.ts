import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  type ZVecCollection,
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecDataType,
  type ZVecDocInput,
  ZVecIndexType,
  ZVecMetricType,
  ZVecOpen,
} from "@zvec/zvec";
import { loadServerEnv } from "../apps/studio/src/app/api/industry-research/_lib/server-env.ts";
import {
  createIndustryResearchSupabaseAdminClient,
  getIndustryResearchSupabaseDownloadPackage,
  listIndustryResearchSupabaseRuns,
  resolveSupabaseInfraConfig,
} from "../apps/studio/src/app/api/industry-research/_lib/supabase-run-store.ts";

const EMBEDDING_DIMENSION = 64;
const CHUNK_SIZE = 1_800;
const CHUNK_OVERLAP = 200;
const COLLECTION_NAME = "industry_research_chunks";
const env = loadServerEnv();

type RawDocumentLike = {
  id?: string;
  title?: string;
  url?: string;
  excerpt?: string;
  extractedText?: string;
};

type RunSourceKind = "local" | "supabase";

type RunSourceTarget = {
  runId: string;
  source: RunSourceKind;
};

type Chunk = {
  id: string;
  runId: string;
  artifactKind: string;
  chunkIndex: number;
  title: string;
  text: string;
  textHash: string;
  relativePath: string;
};

type ZvecIndexState = {
  schemaVersion: "industry_research_zvec_index_state.v1";
  collectionPath: string;
  collectionName: string;
  sourceMode: "auto" | "local" | "supabase";
  updatedAt: string;
  runs: Record<
    string,
    {
      source: RunSourceKind;
      chunkCount: number;
      chunkSignatures: string[];
      artifactKinds: string[];
      indexedAt: string;
    }
  >;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function flagEnabled(name: string) {
  return process.argv.includes(`--${name}`);
}

function zvecCollectionPath() {
  return resolve(
    env.AGENT_FACTORY_ZVEC_DIR || ".cache/industry-research-zvec/chunks",
  );
}

function zvecStatePath() {
  return resolve(
    env.AGENT_FACTORY_ZVEC_STATE_FILE ||
      join(dirname(zvecCollectionPath()), "index-state.json"),
  );
}

function zvecSourceMode(): ZvecIndexState["sourceMode"] {
  const value = argValue("source") || env.AGENT_FACTORY_ZVEC_SOURCE || "auto";

  return value === "local" || value === "supabase" ? value : "auto";
}

function runsRoot() {
  return resolve(
    env.AGENT_FACTORY_INDUSTRY_RESEARCH_RUNS_DIR ||
      "outputs/industry-research-runs",
  );
}

function artifactPath(runId: string, fileName: string) {
  return join(runsRoot(), runId, fileName);
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function localEmbedding(text: string) {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  for (const word of words) {
    const digest = createHash("sha256").update(word).digest();
    const index = digest[0] % EMBEDDING_DIMENSION;
    const sign = digest[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

function splitText(text: string) {
  const chunks: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    const chunk = text.slice(offset, offset + CHUNK_SIZE).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    offset += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readIndexState(): Promise<ZvecIndexState | null> {
  return readJson<ZvecIndexState>(zvecStatePath());
}

async function writeIndexState(state: ZvecIndexState) {
  const path = zvecStatePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readText(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function createChunk({
  runId,
  artifactKind,
  chunkIndex,
  title,
  text,
  relativePath,
}: Omit<Chunk, "id" | "textHash">): Chunk {
  const textHash = hashText(text);

  return {
    id: `chunk_${hashText(`${runId}:${artifactKind}:${chunkIndex}:${textHash}`).slice(0, 32)}`,
    runId,
    artifactKind,
    chunkIndex,
    title,
    text,
    textHash,
    relativePath,
  };
}

function chunksFromPayload({
  runId,
  rawDocuments,
  reportMarkdown,
  reviewedReportMarkdown,
  pathForFile,
}: {
  runId: string;
  rawDocuments: RawDocumentLike[];
  reportMarkdown: string | null;
  reviewedReportMarkdown: string | null;
  pathForFile: (fileName: string) => string;
}): Chunk[] {
  const chunks: Chunk[] = [];

  rawDocuments.forEach((document, index) => {
    const title = document.title || document.url || `raw document ${index + 1}`;
    const text = [title, document.url, document.excerpt, document.extractedText]
      .filter(Boolean)
      .join("\n");

    splitText(text).forEach((chunkText, chunkIndex) => {
      chunks.push(
        createChunk({
          runId,
          artifactKind: "raw_documents",
          chunkIndex: index * 1000 + chunkIndex,
          title,
          text: chunkText,
          relativePath: pathForFile("raw_documents.json"),
        }),
      );
    });
  });

  const markdownByKind = {
    report: reportMarkdown,
    reviewed_report: reviewedReportMarkdown,
  };

  for (const artifactKind of ["report", "reviewed_report"] as const) {
    const fileName =
      artifactKind === "report" ? "report.md" : "reviewed_report.md";
    const markdown = markdownByKind[artifactKind];

    if (!markdown) {
      continue;
    }

    splitText(markdown).forEach((text, chunkIndex) => {
      chunks.push(
        createChunk({
          runId,
          artifactKind,
          chunkIndex,
          title: `${runId} ${fileName}`,
          text,
          relativePath: pathForFile(fileName),
        }),
      );
    });
  }

  return chunks;
}

async function chunksForLocalRun(runId: string): Promise<Chunk[]> {
  const runDir = join(runsRoot(), runId);
  const rawDocuments =
    (await readJson<RawDocumentLike[]>(join(runDir, "raw_documents.json"))) ??
    [];

  return chunksFromPayload({
    runId,
    rawDocuments,
    reportMarkdown: await readText(join(runDir, "report.md")),
    reviewedReportMarkdown: await readText(join(runDir, "reviewed_report.md")),
    pathForFile: (fileName) => artifactPath(runId, fileName),
  });
}

async function chunksForSupabaseRun(runId: string): Promise<Chunk[]> {
  const deliveryPackage = await getIndustryResearchSupabaseDownloadPackage({
    runId,
    env,
  });

  if (!deliveryPackage) {
    return [];
  }

  return chunksFromPayload({
    runId,
    rawDocuments: Array.isArray(deliveryPackage.raw_documents)
      ? (deliveryPackage.raw_documents as RawDocumentLike[])
      : [],
    reportMarkdown: deliveryPackage.reportMarkdown,
    reviewedReportMarkdown: deliveryPackage.reviewedReportMarkdown,
    pathForFile: (fileName) =>
      `supabase://industry_research_runs/${runId}/${fileName}`,
  });
}

function collectionSchema() {
  return new ZVecCollectionSchema({
    name: COLLECTION_NAME,
    vectors: {
      name: "embedding",
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: EMBEDDING_DIMENSION,
      indexParams: {
        indexType: ZVecIndexType.FLAT,
        metricType: ZVecMetricType.COSINE,
      },
    },
    fields: [
      { name: "runId", dataType: ZVecDataType.STRING },
      { name: "artifactKind", dataType: ZVecDataType.STRING },
      { name: "title", dataType: ZVecDataType.STRING },
      {
        name: "text",
        dataType: ZVecDataType.STRING,
        indexParams: { indexType: ZVecIndexType.FTS },
      },
      { name: "textHash", dataType: ZVecDataType.STRING },
      { name: "relativePath", dataType: ZVecDataType.STRING },
      { name: "chunkIndex", dataType: ZVecDataType.INT32 },
    ],
  });
}

async function openCollection(): Promise<ZVecCollection> {
  const path = zvecCollectionPath();
  await mkdir(dirname(path), { recursive: true });

  return existsSync(path)
    ? ZVecOpen(path)
    : ZVecCreateAndOpen(path, collectionSchema());
}

function chunkToDoc(chunk: Chunk): ZVecDocInput {
  return {
    id: chunk.id,
    vectors: { embedding: localEmbedding(chunk.text) },
    fields: {
      runId: chunk.runId,
      artifactKind: chunk.artifactKind,
      title: chunk.title,
      text: chunk.text,
      textHash: chunk.textHash,
      relativePath: chunk.relativePath,
      chunkIndex: chunk.chunkIndex,
    },
  };
}

async function listRunIds() {
  const requestedRunId = argValue("run-id");
  if (requestedRunId) {
    return [requestedRunId];
  }

  const entries = await readdir(runsRoot(), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listLocalRunTargets(): Promise<RunSourceTarget[]> {
  return (await listRunIds()).map((runId) => ({ runId, source: "local" }));
}

async function listSupabaseRunTargets(): Promise<RunSourceTarget[]> {
  const requestedRunId = argValue("run-id");

  if (requestedRunId) {
    return [{ runId: requestedRunId, source: "supabase" }];
  }

  const limit = Number(argValue("limit") ?? 500);
  const runs = await listIndustryResearchSupabaseRuns({
    limit: Number.isFinite(limit) && limit > 0 ? limit : 500,
    env,
  });

  return (runs ?? []).map((run) => ({
    runId: run.runId,
    source: "supabase" as const,
  }));
}

async function listRunTargets(): Promise<RunSourceTarget[]> {
  const sourceMode = zvecSourceMode();

  if (sourceMode === "local") {
    return listLocalRunTargets();
  }

  if (sourceMode === "supabase") {
    return listSupabaseRunTargets();
  }

  const supabaseTargets = await listSupabaseRunTargets();
  return supabaseTargets.length > 0 ? supabaseTargets : listLocalRunTargets();
}

function chunkSignature(chunk: Chunk) {
  return `${chunk.id}:${chunk.textHash}`;
}

function previousChunkSignatures(state: ZvecIndexState | null) {
  return new Set(
    Object.values(state?.runs ?? {}).flatMap((run) => run.chunkSignatures),
  );
}

async function upsertChunkMetadata(chunks: Chunk[]) {
  const config = resolveSupabaseInfraConfig();
  const client = createIndustryResearchSupabaseAdminClient();

  if (!client || chunks.length === 0) {
    return { enabled: config.enabled, rows: 0, skippedMissingRuns: 0 };
  }

  const runIds = Array.from(new Set(chunks.map((chunk) => chunk.runId)));
  const { data: existingRuns, error: runLookupError } = await client
    .from("industry_research_runs")
    .select("run_id")
    .in("run_id", runIds);

  if (runLookupError) {
    throw new Error(
      `Supabase zvec run lookup failed: ${runLookupError.message}`,
    );
  }

  const existingRunIds = new Set(
    (existingRuns ?? []).map((row) => String(row.run_id)),
  );
  const chunksWithSupabaseRuns = chunks.filter((chunk) =>
    existingRunIds.has(chunk.runId),
  );

  if (chunksWithSupabaseRuns.length === 0) {
    return {
      enabled: true,
      rows: 0,
      skippedMissingRuns: chunks.length,
    };
  }

  const now = new Date().toISOString();
  const { error } = await client.from("industry_research_zvec_chunks").upsert(
    chunksWithSupabaseRuns.map((chunk) => ({
      chunk_id: chunk.id,
      run_id: chunk.runId,
      artifact_kind: chunk.artifactKind,
      chunk_index: chunk.chunkIndex,
      title: chunk.title,
      text_hash: chunk.textHash,
      text_excerpt: chunk.text.slice(0, 500),
      metadata: {
        relativePath: chunk.relativePath,
      },
      zvec_collection: COLLECTION_NAME,
      sync_status: "indexed",
      indexed_at: now,
      updated_at: now,
    })),
    { onConflict: "chunk_id" },
  );

  if (error) {
    throw new Error(
      `Supabase zvec chunk metadata upsert failed: ${error.message}`,
    );
  }

  return {
    enabled: true,
    rows: chunksWithSupabaseRuns.length,
    skippedMissingRuns: chunks.length - chunksWithSupabaseRuns.length,
  };
}

async function main() {
  const collection = await openCollection();
  const sourceMode = zvecSourceMode();
  const previousState = await readIndexState();
  const previousSignatures = previousChunkSignatures(previousState);
  const runTargets = await listRunTargets();
  const chunksByRun: Array<{ target: RunSourceTarget; chunks: Chunk[] }> = [];
  const allChunks: Chunk[] = [];
  const warnings: string[] = [];

  for (const target of runTargets) {
    const chunks =
      target.source === "supabase"
        ? await chunksForSupabaseRun(target.runId)
        : await chunksForLocalRun(target.runId);
    chunksByRun.push({ target, chunks });
    allChunks.push(...chunks);
  }

  const shouldForce =
    flagEnabled("force") ||
    previousState?.collectionPath !== zvecCollectionPath();
  const chunksToUpsert = shouldForce
    ? allChunks
    : allChunks.filter(
        (chunk) => !previousSignatures.has(chunkSignature(chunk)),
      );

  if (chunksToUpsert.length > 0) {
    collection.upsertSync(chunksToUpsert.map(chunkToDoc));
    try {
      collection.createIndexSync({
        fieldName: "text",
        indexParams: { indexType: ZVecIndexType.FTS },
      });
    } catch (error) {
      // The index may already exist when re-indexing the same collection.
      warnings.push(
        `FTS index create skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      collection.optimizeSync();
    } catch (error) {
      warnings.push(
        `zvec optimize skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const supabaseMetadata = await upsertChunkMetadata(chunksToUpsert);
  const indexedAt = new Date().toISOString();
  const indexState: ZvecIndexState = {
    schemaVersion: "industry_research_zvec_index_state.v1",
    collectionPath: zvecCollectionPath(),
    collectionName: COLLECTION_NAME,
    sourceMode,
    updatedAt: indexedAt,
    runs: {
      ...(previousState?.runs ?? {}),
    },
  };

  for (const { target, chunks } of chunksByRun) {
    indexState.runs[target.runId] = {
      source: target.source,
      chunkCount: chunks.length,
      chunkSignatures: chunks.map(chunkSignature),
      artifactKinds: Array.from(
        new Set(chunks.map((chunk) => chunk.artifactKind)),
      ),
      indexedAt,
    };
  }

  await writeIndexState(indexState);

  console.log(
    JSON.stringify(
      {
        status: "ok",
        collectionPath: zvecCollectionPath(),
        collectionName: COLLECTION_NAME,
        statePath: zvecStatePath(),
        sourceMode,
        runCount: runTargets.length,
        chunkCount: allChunks.length,
        upsertedChunkCount: chunksToUpsert.length,
        unchangedChunkCount: allChunks.length - chunksToUpsert.length,
        zvecStats: collection.stats,
        supabaseMetadata,
        warnings,
      },
      null,
      2,
    ),
  );

  collection.closeSync();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
