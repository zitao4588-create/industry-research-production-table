import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  assertIndustryExecutionCheckpoint,
  createIndustryExecutionCheckpoint,
  createIndustryExecutionManifest,
  createIndustryPlan,
  type IndustryExecutionArtifactRef,
  type IndustryExecutionCheckpoint,
  type IndustryExecutionStage,
  type IndustryPlanningInput,
  industryExecutionStages,
  runIndustryExecutionStages,
  serializeIndustryPlan,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
}

async function writeTextArtifact(
  outputDir: string,
  relativePath: string,
  value: string,
  artifactType: IndustryExecutionArtifactRef["artifactType"],
  mediaType: IndustryExecutionArtifactRef["mediaType"],
) {
  const path = join(outputDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
  return {
    artifactType,
    relativePath,
    contentHash: sha256(value),
    mediaType,
  } satisfies IndustryExecutionArtifactRef;
}

async function writeJsonArtifact(
  outputDir: string,
  relativePath: string,
  value: unknown,
  artifactType: IndustryExecutionArtifactRef["artifactType"],
) {
  return writeTextArtifact(
    outputDir,
    relativePath,
    `${JSON.stringify(value, null, 2)}\n`,
    artifactType,
    "application/json",
  );
}

async function loadCheckpoint(path: string) {
  try {
    return JSON.parse(
      await readFile(path, "utf8"),
    ) as IndustryExecutionCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function saveCheckpointAtomic(
  path: string,
  checkpoint: IndustryExecutionCheckpoint,
) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(checkpoint, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, path);
}

const inputPath = resolve(
  argumentValue("input") ?? "fixtures/industry-planner/skincare-input.json",
);
const outputDir = resolve(
  argumentValue("output") ??
    "outputs/industry-executions/skincare-g3-contract-fixture",
);
const checkpointPath = join(outputDir, "checkpoint.json");
const stopAfterArgument = argumentValue("stop-after");
const stopAfterStage = industryExecutionStages.find(
  (stage) => stage === stopAfterArgument,
);
if (stopAfterArgument && !stopAfterStage) {
  throw new Error(`industry_execution_invalid_stop_after:${stopAfterArgument}`);
}
const inputText = await readFile(inputPath, "utf8");
const planningInput = JSON.parse(inputText) as IndustryPlanningInput;
const plan = createIndustryPlan(planningInput);
const expectedInputHash = sha256(inputText);
await mkdir(outputDir, { recursive: true });

let checkpoint = await loadCheckpoint(checkpointPath);
if (checkpoint) {
  assertIndustryExecutionCheckpoint(checkpoint);
  if (
    checkpoint.inputHash !== expectedInputHash ||
    checkpoint.planId !== plan.planId
  ) {
    throw new Error(
      "industry_execution_checkpoint_input_mismatch:use_a_new_output_directory",
    );
  }
} else {
  checkpoint = createIndustryExecutionCheckpoint({
    executionMode: "contract_fixture",
    runId: "skincare-g3-staged-contract",
    planId: plan.planId,
    inputHash: expectedInputHash,
  });
  await saveCheckpointAtomic(checkpointPath, checkpoint);
}

const fixtureDocument = (stage: IndustryExecutionStage) => ({
  schemaVersion: "industry_execution_contract_fixture.v1",
  fixtureStatus: "contract_only_not_research_evidence",
  stage,
  runId: checkpoint.runId,
  planId: checkpoint.planId,
  assertions: {
    externalFactsProduced: false,
    representativeSamplesValidated: false,
    moduleClaimsConfirmed: false,
    liveProviderCalls: 0,
  },
});

checkpoint = await runIndustryExecutionStages({
  checkpoint,
  stopAfterStage,
  now: () => new Date().toISOString(),
  saveCheckpoint: (next) => saveCheckpointAtomic(checkpointPath, next),
  handler: async ({ stage }) => {
    switch (stage) {
      case "planning":
        return [
          await writeTextArtifact(
            outputDir,
            "planning/industry-plan.json",
            serializeIndustryPlan(plan),
            "industry_plan",
            "application/json",
          ),
        ];
      case "breadth_scan":
        return [
          await writeJsonArtifact(
            outputDir,
            "breadth_scan/source-candidates.json",
            fixtureDocument(stage),
            "source_candidate_plan",
          ),
        ];
      case "sampling":
        return [
          await writeJsonArtifact(
            outputDir,
            "sampling/representative-samples.json",
            fixtureDocument(stage),
            "representative_sample_plan",
          ),
        ];
      case "module_research":
        return [
          await writeJsonArtifact(
            outputDir,
            "module_research/module-results.json",
            fixtureDocument(stage),
            "module_results",
          ),
        ];
      case "synthesis":
        return [
          await writeJsonArtifact(
            outputDir,
            "synthesis/claim-ledger.json",
            fixtureDocument(stage),
            "claim_ledger",
          ),
        ];
      case "reporting":
        return [
          await writeTextArtifact(
            outputDir,
            "reporting/report.md",
            [
              "# Industry OS G3 分阶段契约 Fixture",
              "",
              "本文件只证明本地六阶段状态机与 artifact contract 可运行。",
              "它不是护肤品行业报告，不包含外部事实、真实样本或已确认结论。",
              "",
            ].join("\n"),
            "industry_report",
            "text/markdown",
          ),
        ];
    }
  },
});

if (checkpoint.status === "completed") {
  const manifest = createIndustryExecutionManifest(
    checkpoint,
    relative(outputDir, checkpointPath),
  );
  await writeFile(
    join(outputDir, "execution-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify(
    {
      status: checkpoint.status,
      runId: checkpoint.runId,
      revision: checkpoint.revision,
      completedStages: checkpoint.stages
        .filter((stage) => stage.status === "completed")
        .map((stage) => stage.stage),
      nextStage: checkpoint.nextStage,
      liveProviderCalls: checkpoint.assertions.liveProviderCalls,
      checkpointPath,
    },
    null,
    2,
  ),
);
