import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ZVecOpen } from "@zvec/zvec";
import { loadServerEnv } from "../apps/studio/src/app/api/industry-research/_lib/server-env.ts";

const EMBEDDING_DIMENSION = 64;
const env = loadServerEnv();

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function searchQuery() {
  return argValue("query") || process.argv.slice(2).join(" ").trim();
}

function zvecCollectionPath() {
  return resolve(
    env.AGENT_FACTORY_ZVEC_DIR || ".cache/industry-research-zvec/chunks",
  );
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

function main() {
  const query = searchQuery();

  if (!query) {
    console.error('Usage: pnpm zvec:search --query="宠物益生菌"');
    process.exit(2);
  }

  const collection = ZVecOpen(zvecCollectionPath(), { readOnly: true });
  const topk = Number(argValue("topk") ?? 8);

  let results = collection.querySync({
    fieldName: "text",
    fts: { matchString: query },
    topk,
    includeVector: false,
    outputFields: [
      "runId",
      "artifactKind",
      "title",
      "text",
      "relativePath",
      "chunkIndex",
    ],
  });

  if (results.length === 0) {
    results = collection.querySync({
      fieldName: "embedding",
      vector: localEmbedding(query),
      topk,
      includeVector: false,
      outputFields: [
        "runId",
        "artifactKind",
        "title",
        "text",
        "relativePath",
        "chunkIndex",
      ],
    });
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        query,
        collectionPath: zvecCollectionPath(),
        results: results.map((result) => ({
          id: result.id,
          score: result.score,
          runId: result.fields.runId,
          artifactKind: result.fields.artifactKind,
          title: result.fields.title,
          relativePath: result.fields.relativePath,
          chunkIndex: result.fields.chunkIndex,
          excerpt: String(result.fields.text ?? "").slice(0, 300),
        })),
      },
      null,
      2,
    ),
  );

  collection.closeSync();
}

main();
