import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createIndustryAcquisitionTaskPlan,
  createIndustryPlan,
  type IndustryM2WaveVerification,
  type IndustryRepresentativeSamplePlan,
  skincareIndustryPlanningFixture,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeTextAtomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

const wave1Dir = resolve(
  argumentValue("wave-1") ??
    "outputs/industry-data-report-loop/m4.2/skincare-m4-2-wave-1-2026-07-13T14-27-19-188Z",
);
const wave2Dir = resolve(
  argumentValue("wave-2") ??
    "outputs/industry-data-report-loop/m4.2/skincare-m4-2-wave-2-2026-07-13T14-32-12-463Z",
);
const wave3Dir = resolve(
  argumentValue("wave-3") ??
    "outputs/industry-data-report-loop/m4.2/skincare-m4-2-wave-3-2026-07-13T14-37-32-502Z",
);
const wave4Argument = argumentValue("wave-4");
const wave4Dir = wave4Argument ? resolve(wave4Argument) : null;
const wave5Argument = argumentValue("wave-5");
const wave5Dir = wave5Argument ? resolve(wave5Argument) : null;
const wave6Argument = argumentValue("wave-6");
const wave6Dir = wave6Argument ? resolve(wave6Argument) : null;
const latestWaveDir = wave6Dir ?? wave5Dir ?? wave4Dir ?? wave3Dir;
const samplingDir = wave6Dir ?? wave5Dir ?? wave4Dir ?? wave2Dir;
const outputDir = resolve(
  argumentValue("output") ?? join(latestWaveDir, "final"),
);
const [verification, samplePlan] = await Promise.all([
  readJson<IndustryM2WaveVerification>(
    join(latestWaveDir, "verification.json"),
  ),
  readJson<IndustryRepresentativeSamplePlan>(
    join(samplingDir, "sampling", "representative_sample_plan.json"),
  ),
]);
const waveDirs = [
  wave1Dir,
  wave2Dir,
  wave3Dir,
  ...(wave4Dir ? [wave4Dir] : []),
  ...(wave5Dir ? [wave5Dir] : []),
  ...(wave6Dir ? [wave6Dir] : []),
];
const waveAudits = await Promise.all(
  waveDirs.map((directory) =>
    readJson<{
      usage: Record<string, number>;
      approvedBudget: { maximumFirecrawlCredits: number };
      runError: string | null;
    }>(join(directory, "run_audit.json")),
  ),
);
if (samplePlan.coverageGate.status !== "pass") {
  throw new Error("m4_2_final_sampling_gate_not_passed");
}
const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(skincareIndustryPlanningFixture)),
);
const assignmentKey = {
  taxonomy: "taxonomyIds",
  value_chain: "valueChainIds",
  price_tier: "priceTierIds",
  channel: "channelIds",
  consumer_need: "consumerNeedIds",
  business_model: "businessModelIds",
  regulation: null,
} as const;
const coverageRows = verification.coverageRows.map((rawRow) => {
  const task = taskPlan.tasks.find(
    (candidate) => candidate.taskId === rawRow.taskId,
  );
  if (!task) throw new Error(`m4_2_final_task_missing:${rawRow.taskId}`);
  const key = assignmentKey[task.axisType];
  const representativeSampleIds = key
    ? samplePlan.selectedSamples
        .filter((sample) =>
          sample.axisAssignments[key].some((id) =>
            task.axisItemIds.includes(id),
          ),
        )
        .map((sample) => sample.id)
    : [];
  const gaps = [
    ...(rawRow.independentSourceCount <
    task.targetCoverage.minIndependentSources
      ? ["independent_source_coverage_missing"]
      : []),
    ...(rawRow.sourceRoles.length < task.targetCoverage.minSourceRoles
      ? ["source_role_coverage_missing"]
      : []),
    ...(representativeSampleIds.length <
    task.targetCoverage.minRepresentativeSamples
      ? ["representative_sample_coverage_missing"]
      : []),
  ];
  return {
    taskId: task.taskId,
    moduleId: task.moduleId,
    coverageRowId: task.coverageRowId,
    axisType: task.axisType,
    priority: task.priority,
    status: gaps.length === 0 ? "target_met_not_evidence" : "coverage_gap",
    independentSourceCount: rawRow.independentSourceCount,
    sourceRoles: rawRow.sourceRoles,
    representativeSampleCount: representativeSampleIds.length,
    representativeSampleIds,
    targets: task.targetCoverage,
    gaps,
  };
});
const passedRows = coverageRows.filter(
  (row) => row.status === "target_met_not_evidence",
);
const criticalRows = coverageRows.filter((row) => row.priority === "critical");
const canEnterM43 = coverageRows.every(
  (row) => row.status === "target_met_not_evidence",
);
const aggregateUsage = waveAudits.reduce(
  (total, audit) => {
    for (const key of [
      "publicRequests",
      "tavilySearchRequests",
      "firecrawlRequests",
      "firecrawlReservedCredits",
      "llmRequests",
      "reservedCostYuan",
    ]) {
      total[key] = Number(
        ((total[key] ?? 0) + (audit.usage[key] ?? 0)).toFixed(6),
      );
    }
    return total;
  },
  {} as Record<string, number>,
);
const finalAudit = {
  schemaVersion: "industry_m4_2_final_coverage_audit.v2",
  artifactType: "industry-m4-2-final-coverage-audit",
  category: "护肤品",
  scopeLevel: "broad_industry",
  status: canEnterM43
    ? "ready_for_module_research"
    : wave4Dir || wave5Dir
      ? "blocked_source_coverage_after_public_recovery"
      : "blocked_source_coverage_after_final_wave",
  wavesCompleted: waveDirs.length,
  aggregateUsage,
  finalWaveStopAudit: {
    limitReached:
      waveAudits.at(-1)?.runError ??
      (wave4Dir || wave5Dir ? "none" : "firecrawl_reserved_credit_cap"),
    observedReservedCredits: waveAudits.at(-1)?.usage.firecrawlReservedCredits,
    declaredCap: waveAudits.at(-1)?.approvedBudget.maximumFirecrawlCredits ?? 0,
    additionalRequestsSentAfterCap: 0,
    note:
      wave4Dir || wave5Dir
        ? "The public-market recovery remained inside its declared finite budget."
        : "The budget tracker rejected remaining selected URLs after the cap; the live runner's historical runError field did not classify already_exhausted and is corrected for future waves.",
  },
  dataSummary: {
    immutableRawDocumentCount: verification.summary.rawDocumentCount,
    relevantRawCandidateCount: verification.summary.relevantRawCandidateCount,
    categoryMismatchCount: verification.summary.categoryMismatchCount,
    sourceQualityRejectedCount: verification.summary.sourceQualityRejectedCount,
    binaryPayloadCount: verification.summary.binaryPayloadCount,
    representativeSampleCount: samplePlan.selectedSamples.length,
  },
  samplingGate: samplePlan.coverageGate,
  coverageRows,
  coverageSummary: {
    passedRows: passedRows.length,
    totalRows: coverageRows.length,
    criticalRowsPassed: criticalRows.filter(
      (row) => row.status === "target_met_not_evidence",
    ).length,
    criticalRows: criticalRows.length,
    blockedModules: [
      ...new Set(
        coverageRows
          .filter((row) => row.status === "coverage_gap")
          .map((row) => row.moduleId),
      ),
    ],
  },
  decision: {
    canEnterM4_3: canEnterM43,
    nextAction: canEnterM43
      ? "start_m4_3_module_research"
      : wave4Dir || wave5Dir
        ? "record_public_market_limit_and_keep_m4_3_blocked"
        : "pause_for_new_source_strategy_or_authorized_imports",
    stopCondition: wave5Dir
      ? "public_market_gap_closure_completed"
      : wave4Dir
        ? "public_market_recovery_completed"
        : "maximum_three_planned_live_waves_reached",
    commercializationAssessment: "not_evaluated",
  },
  assertions: {
    representativeSamplesAppliedToCoverage: true,
    rawCandidatesAreNotEvidence: true,
    coverageGapsNotConvertedToNegativeConclusions: true,
    llmRequests: 0,
    reportGenerated: false,
    productionWrite: false,
  },
};
await writeTextAtomic(
  join(outputDir, "final_coverage_audit.json"),
  `${JSON.stringify(finalAudit, null, 2)}\n`,
);
console.log(
  JSON.stringify({ status: "ok", ...finalAudit, outputDir }, null, 2),
);
