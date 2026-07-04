import { resolve } from "node:path";
import { loadServerEnv } from "../apps/studio/src/app/api/industry-research/_lib/server-env.ts";
import { searchZvecChunks } from "./lib/zvec-search-core.ts";

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

function main() {
  const query = searchQuery();

  if (!query) {
    console.error('Usage: pnpm zvec:search --query="宠物益生菌"');
    process.exit(2);
  }

  const collectionPath = zvecCollectionPath();
  const result = searchZvecChunks({
    collectionPath,
    query,
    topk: Number(argValue("topk") ?? 8),
  });

  if (!result.ok) {
    console.error(
      JSON.stringify(
        {
          status: "zvec_unavailable",
          query,
          collectionPath,
          error: result.error,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        query,
        collectionPath,
        results: result.hits.map((hit) => ({
          id: hit.id,
          score: hit.score,
          runId: hit.runId,
          artifactKind: hit.artifactKind,
          title: hit.title,
          relativePath: hit.relativePath,
          chunkIndex: hit.chunkIndex,
          excerpt: hit.excerpt,
        })),
      },
      null,
      2,
    ),
  );
}

main();
