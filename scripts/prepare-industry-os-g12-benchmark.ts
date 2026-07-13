import { readFileSync } from "node:fs";
import {
  evaluateG12Benchmark,
  G12_BENCHMARK_CATEGORIES,
  G12_BENCHMARK_THRESHOLDS,
  G12_BENCHMARK_VERSION,
  G12_FORBIDDEN_CATEGORY_IDS,
  type G12CategoryBenchmarkInput,
} from "../packages/industry-research/src/g12-benchmark.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function refuseLiveFlags() {
  const forbiddenFlags = [
    "--execute",
    "--live",
    "--provider",
    "--api-key",
    "--credits",
  ];
  const supplied = forbiddenFlags.find((flag) => process.argv.includes(flag));
  if (supplied) {
    throw new Error(
      `g12_live_execution_not_authorized:${supplied}; this runner is offline-only`,
    );
  }
}

function main() {
  refuseLiveFlags();
  const inputPath = argumentValue("input");
  if (!inputPath) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: G12_BENCHMARK_VERSION,
          mode: "offline_preregistration_plan",
          networkRequests: 0,
          providerCalls: 0,
          credits: 0,
          costYuan: 0,
          categories: G12_BENCHMARK_CATEGORIES,
          forbiddenCategoryIds: G12_FORBIDDEN_CATEGORY_IDS,
          thresholds: G12_BENCHMARK_THRESHOLDS,
          nextGate: "user_confirmation_required_for_live_budget_and_execution",
        },
        null,
        2,
      ),
    );
    return;
  }

  const payload = JSON.parse(readFileSync(inputPath, "utf8")) as {
    results: G12CategoryBenchmarkInput[];
    realUseEvidenceVerified?: boolean;
  };
  console.log(
    JSON.stringify(
      evaluateG12Benchmark({
        results: payload.results,
        realUseEvidenceVerified: payload.realUseEvidenceVerified === true,
      }),
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
