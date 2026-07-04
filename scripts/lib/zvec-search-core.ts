import { createHash } from "node:crypto";
import { ZVecOpen } from "@zvec/zvec";

/**
 * zvec 检索核心（T8 抽出）：FTS 优先、本地 embedding 兜底的只读查询。
 * zvec 是本地可重建缓存，collection 缺失/打不开时返回 ok=false 而不是抛错，
 * 调用方应把它当可降级增强，不能作为链路硬依赖。
 * 注意 zvec 单写多读锁模型：不要与 `pnpm zvec:index` 并行运行。
 */
const EMBEDDING_DIMENSION = 64;

export type ZvecSearchHit = {
  id: string;
  score: number;
  runId: string;
  artifactKind: string;
  title: string;
  relativePath: string;
  chunkIndex: number;
  excerpt: string;
};

export type ZvecSearchResult =
  | { ok: true; hits: ZvecSearchHit[] }
  | { ok: false; hits: []; error: string };

export function localEmbedding(text: string) {
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

const outputFields = [
  "runId",
  "artifactKind",
  "title",
  "text",
  "relativePath",
  "chunkIndex",
];

export function searchZvecChunks({
  collectionPath,
  query,
  topk = 8,
}: {
  collectionPath: string;
  query: string;
  topk?: number;
}): ZvecSearchResult {
  let collection: ReturnType<typeof ZVecOpen>;

  try {
    collection = ZVecOpen(collectionPath, { readOnly: true });
  } catch (error) {
    return {
      ok: false,
      hits: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    let results = collection.querySync({
      fieldName: "text",
      fts: { matchString: query },
      topk,
      includeVector: false,
      outputFields,
    });

    if (results.length === 0) {
      results = collection.querySync({
        fieldName: "embedding",
        vector: localEmbedding(query),
        topk,
        includeVector: false,
        outputFields,
      });
    }

    return {
      ok: true,
      hits: results.map((result) => ({
        id: String(result.id),
        score: result.score,
        runId: String(result.fields.runId ?? ""),
        artifactKind: String(result.fields.artifactKind ?? ""),
        title: String(result.fields.title ?? ""),
        relativePath: String(result.fields.relativePath ?? ""),
        chunkIndex: Number(result.fields.chunkIndex ?? 0),
        excerpt: String(result.fields.text ?? "").slice(0, 300),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      hits: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    collection.closeSync();
  }
}
