import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * CLI 侧「上一次同项目 run」查找（T6 周报 diff 基线）。
 * 与 apps/studio `_lib/local-runs.ts` 的服务端实现同口径：
 * industry+category+market 归一后匹配，取 finishedAt 最新的一次。
 * 找不到或目录不可读返回 null；diff 是增强，不阻塞交付。
 */
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function normalizedProjectKey(input: {
  industry: string;
  category: string;
  market: string;
}) {
  return [input.industry, input.category, input.market]
    .map((value) => value.toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function findPreviousLocalRun(
  runsRootDir: string,
  input: { industry: string; category: string; market: string },
): Promise<{ runId: string; databases: unknown } | null> {
  const targetKey = normalizedProjectKey(input);
  let entryNames: string[];

  try {
    entryNames = (await readdir(runsRootDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => RUN_ID_PATTERN.test(name));
  } catch {
    return null;
  }

  let latest: { runId: string; finishedAt: string } | null = null;

  for (const name of entryNames) {
    const directory = join(runsRootDir, name);
    const runInput = await readJsonFile<{
      industry?: string;
      category?: string;
      market?: string;
    }>(join(directory, "input.json"));

    if (
      !runInput ||
      normalizedProjectKey({
        industry: runInput.industry ?? "",
        category: runInput.category ?? "",
        market: runInput.market ?? "",
      }) !== targetKey
    ) {
      continue;
    }

    const runLog = await readJsonFile<{ finishedAt?: string }>(
      join(directory, "run_log.json"),
    );
    const finishedAt = runLog?.finishedAt ?? "";

    if (!finishedAt) {
      continue;
    }

    if (!latest || finishedAt > latest.finishedAt) {
      latest = { runId: name, finishedAt };
    }
  }

  if (!latest) {
    return null;
  }

  const databases = await readJsonFile<unknown>(
    join(runsRootDir, latest.runId, "databases.json"),
  );

  return databases === null ? null : { runId: latest.runId, databases };
}
