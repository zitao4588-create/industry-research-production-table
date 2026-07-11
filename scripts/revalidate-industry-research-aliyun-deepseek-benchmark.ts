import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assessEvidenceCompleteFindings } from "../packages/industry-research/src/evidence-completeness.ts";
import type {
  CompetitorDatabaseEntry,
  Evidence,
  OpportunityDatabaseEntry,
  RawDocument,
  ResearchReviewItem,
} from "../packages/industry-research/src/types.ts";

const minimumEvidenceCompleteFindingRatio = 0.7;
const minimumReviewedAsins = 2;

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function main() {
  const sourceRunDir = argumentValue("--source-run-dir");
  if (!sourceRunDir) {
    throw new Error("missing_--source-run-dir");
  }
  const runDir = resolve(sourceRunDir);
  const benchmarkRun = await readJson<{
    runId: string;
    status: string;
    provider?: { host?: string; model?: string };
    providerHost?: string;
    model?: string;
    llmRequests?: number;
    publicRequests?: number;
    amazon?: { reviewedAsinCount?: number; reviewedAsins?: string[] };
  }>(join(runDir, "benchmark_run.json"));
  const rawDocuments = await readJson<RawDocument[]>(
    join(runDir, "raw_documents.json"),
  );
  const databases = await readJson<{
    competitor_database: CompetitorDatabaseEntry[];
    opportunity_database: OpportunityDatabaseEntry[];
    evidence: Evidence[];
  }>(join(runDir, "databases.json"));
  const reviewItems = await readJson<{ items: ResearchReviewItem[] }>(
    join(runDir, "review_items.json"),
  );

  const providerHost =
    benchmarkRun.providerHost ?? benchmarkRun.provider?.host ?? "";
  const model = benchmarkRun.model ?? benchmarkRun.provider?.model ?? "";
  if (!providerHost.endsWith("aliyuncs.com")) {
    throw new Error("source_run_is_not_aliyun_hosted");
  }
  if (model !== "deepseek-v4-flash") {
    throw new Error("source_run_is_not_deepseek_v4_flash");
  }

  const assessment = assessEvidenceCompleteFindings({
    competitors: databases.competitor_database,
    opportunities: databases.opportunity_database,
    evidence: databases.evidence,
    rawDocuments,
  });
  const reviewedAsinCount = benchmarkRun.amazon?.reviewedAsinCount ?? 0;
  const blockers = [
    ...(assessment.evidenceCompleteFindingRatio <
    minimumEvidenceCompleteFindingRatio
      ? ["evidence_complete_finding_ratio_below_70_percent"]
      : []),
    ...(reviewedAsinCount < minimumReviewedAsins
      ? ["amazon_review_asin_coverage_below_2"]
      : []),
  ];
  const result = {
    sourceRunId: benchmarkRun.runId,
    sourceRunDir: runDir,
    sourceLiveRunStatus: benchmarkRun.status,
    sourceProviderHost: providerHost,
    sourceModel: model,
    sourceLlmRequests: benchmarkRun.llmRequests ?? 0,
    sourcePublicRequests: benchmarkRun.publicRequests ?? 0,
    revalidationLlmRequests: 0,
    revalidationPublicRequests: 0,
    method:
      "offline_deterministic_revalidation_of_saved_live_raw_documents_and_evidence",
    status: blockers.length === 0 ? "passed_revalidation" : "failed",
    reviewApprovedFindings: reviewItems.items.filter(
      (item) => item.status === "approved",
    ).length,
    evidenceCompleteFindings: assessment.evidenceCompleteFindings,
    findingCount: assessment.findingCount,
    evidenceCompleteFindingRatio: assessment.evidenceCompleteFindingRatio,
    findings: assessment.findings,
    amazonReviewedAsinCount: reviewedAsinCount,
    amazonReviewedAsins: benchmarkRun.amazon?.reviewedAsins ?? [],
    blockers,
  };

  await writeFile(
    join(runDir, "benchmark_revalidation.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(runDir, "benchmark_revalidation.md"),
    [
      "# 阿里云 DeepSeek + Amazon 证据完整度离线复算",
      "",
      `- 状态：${result.status}`,
      `- 来源 live run：${result.sourceRunId}`,
      `- 模型与路由：${model} via ${providerHost}`,
      `- 来源 live run 请求：LLM ${result.sourceLlmRequests}，公开网页 ${result.sourcePublicRequests}`,
      "- 本次复算新增请求：LLM 0，公开网页 0",
      `- Amazon 评论覆盖：${reviewedAsinCount} 个 ASIN（${result.amazonReviewedAsins.join(", ") || "无"}）`,
      `- 旧人工审核 approved：${result.reviewApprovedFindings}/${result.findingCount}`,
      `- 证据完整结论：${result.evidenceCompleteFindings}/${result.findingCount}（${(result.evidenceCompleteFindingRatio * 100).toFixed(1)}%）`,
      `- 验收线：>= ${(minimumEvidenceCompleteFindingRatio * 100).toFixed(0)}% 且评论覆盖 >= ${minimumReviewedAsins} 个 ASIN`,
      `- 阻塞项：${blockers.length > 0 ? blockers.join(", ") : "无"}`,
      "",
      "口径说明：evidence complete 只表示结论核心措辞被 acceptedForReport 原文或唯一绑定来源 URL 完整支撑；不表示市场规模、商业价值、竞争或付费意愿已经验证。来源 live run 的原始状态与 benchmark_run.json 保持不变，本文件不覆盖在线运行历史。",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
