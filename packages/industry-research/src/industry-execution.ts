export const industryExecutionCheckpointSchemaVersion =
  "industry_execution_checkpoint.v1" as const;
export const industryExecutionManifestSchemaVersion =
  "industry_execution_manifest.v1" as const;

export const industryExecutionStages = [
  "planning",
  "breadth_scan",
  "sampling",
  "module_research",
  "synthesis",
  "reporting",
] as const;

export type IndustryExecutionStage = (typeof industryExecutionStages)[number];
export type IndustryExecutionArtifactType =
  | "industry_plan"
  | "source_candidate_plan"
  | "representative_sample_plan"
  | "module_results"
  | "claim_ledger"
  | "industry_report";

export type IndustryExecutionArtifactRef = {
  artifactType: IndustryExecutionArtifactType;
  relativePath: string;
  contentHash: `sha256:${string}`;
  mediaType: "application/json" | "text/markdown";
};

export type IndustryExecutionArtifactContract = {
  stage: IndustryExecutionStage;
  requiredArtifactTypes: IndustryExecutionArtifactType[];
  description: string;
};

export type IndustryExecutionStageCheckpoint = {
  stage: IndustryExecutionStage;
  status: "pending" | "in_progress" | "completed" | "failed";
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  artifactRefs: IndustryExecutionArtifactRef[];
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
};

export type IndustryExecutionCheckpoint = {
  schemaVersion: typeof industryExecutionCheckpointSchemaVersion;
  artifactType: "industry-execution-checkpoint";
  executionMode: "contract_fixture" | "local_execution";
  runId: string;
  planId: string;
  inputHash: `sha256:${string}`;
  revision: number;
  status: "ready" | "in_progress" | "failed" | "completed";
  stages: IndustryExecutionStageCheckpoint[];
  nextStage: IndustryExecutionStage | null;
  assertions: {
    completedStagesAreImmutable: true;
    databaseRequired: false;
    productionStateRequired: false;
    liveProviderCalls: 0;
  };
};

export type IndustryExecutionManifest = {
  schemaVersion: typeof industryExecutionManifestSchemaVersion;
  artifactType: "industry-execution-manifest";
  runId: string;
  planId: string;
  stageOrder: IndustryExecutionStage[];
  checkpointPath: string;
  stageArtifacts: Array<{
    stage: IndustryExecutionStage;
    artifactRefs: IndustryExecutionArtifactRef[];
  }>;
  compatibility: {
    existingDeliveryManifestUnchanged: true;
    existingEightFilePackageUnchanged: true;
  };
};

export const industryExecutionArtifactContracts: IndustryExecutionArtifactContract[] =
  [
    {
      stage: "planning",
      requiredArtifactTypes: ["industry_plan"],
      description: "冻结 Planner 输入与 industry-plan，后续阶段只按引用读取。",
    },
    {
      stage: "breadth_scan",
      requiredArtifactTypes: ["source_candidate_plan"],
      description: "记录来源候选计划；候选不能冒充证据。",
    },
    {
      stage: "sampling",
      requiredArtifactTypes: ["representative_sample_plan"],
      description: "记录代表样本、排除理由和未覆盖轴。",
    },
    {
      stage: "module_research",
      requiredArtifactTypes: ["module_results"],
      description: "记录六个模块的独立结果、覆盖和缺口。",
    },
    {
      stage: "synthesis",
      requiredArtifactTypes: ["claim_ledger"],
      description: "记录 fact、signal、inference、hypothesis 及其证据绑定。",
    },
    {
      stage: "reporting",
      requiredArtifactTypes: ["industry_report"],
      description:
        "生成行业报告引用与 execution manifest，不替换旧交付 manifest。",
    },
  ];

function stageIndex(stage: IndustryExecutionStage) {
  return industryExecutionStages.indexOf(stage);
}

function checkpointStage(
  checkpoint: IndustryExecutionCheckpoint,
  stage: IndustryExecutionStage,
) {
  const found = checkpoint.stages.find((entry) => entry.stage === stage);
  if (!found) throw new Error(`industry_execution_stage_missing:${stage}`);
  return found;
}

function cloneCheckpoint(
  checkpoint: IndustryExecutionCheckpoint,
): IndustryExecutionCheckpoint {
  return structuredClone(checkpoint);
}

function nextIncompleteStage(checkpoint: IndustryExecutionCheckpoint) {
  return (
    checkpoint.stages.find((stage) => stage.status !== "completed")?.stage ??
    null
  );
}

function validateArtifactRef(ref: IndustryExecutionArtifactRef) {
  if (
    ref.relativePath.startsWith("/") ||
    ref.relativePath.split("/").includes("..") ||
    ref.relativePath.trim() !== ref.relativePath ||
    ref.relativePath.length === 0
  ) {
    throw new Error(
      `industry_execution_invalid_artifact_path:${ref.relativePath}`,
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(ref.contentHash)) {
    throw new Error(
      `industry_execution_invalid_artifact_hash:${ref.artifactType}`,
    );
  }
}

function validateStageArtifacts(
  stage: IndustryExecutionStage,
  artifactRefs: IndustryExecutionArtifactRef[],
) {
  const contract = industryExecutionArtifactContracts.find(
    (entry) => entry.stage === stage,
  );
  if (!contract)
    throw new Error(`industry_execution_contract_missing:${stage}`);
  const paths = artifactRefs.map((ref) => ref.relativePath);
  if (new Set(paths).size !== paths.length) {
    throw new Error(`industry_execution_duplicate_artifact_path:${stage}`);
  }
  for (const ref of artifactRefs) validateArtifactRef(ref);
  for (const artifactType of contract.requiredArtifactTypes) {
    if (!artifactRefs.some((ref) => ref.artifactType === artifactType)) {
      throw new Error(
        `industry_execution_required_artifact_missing:${stage}:${artifactType}`,
      );
    }
  }
}

function artifactRefsEqual(
  left: IndustryExecutionArtifactRef[],
  right: IndustryExecutionArtifactRef[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createIndustryExecutionCheckpoint(input: {
  executionMode: IndustryExecutionCheckpoint["executionMode"];
  runId: string;
  planId: string;
  inputHash: IndustryExecutionCheckpoint["inputHash"];
}): IndustryExecutionCheckpoint {
  if (!input.runId.trim())
    throw new Error("industry_execution_run_id_required");
  if (!input.planId.trim())
    throw new Error("industry_execution_plan_id_required");
  if (!/^sha256:[a-f0-9]{64}$/.test(input.inputHash)) {
    throw new Error("industry_execution_input_hash_invalid");
  }
  return {
    schemaVersion: industryExecutionCheckpointSchemaVersion,
    artifactType: "industry-execution-checkpoint",
    executionMode: input.executionMode,
    runId: input.runId,
    planId: input.planId,
    inputHash: input.inputHash,
    revision: 0,
    status: "ready",
    stages: industryExecutionStages.map((stage) => ({
      stage,
      status: "pending",
      attemptCount: 0,
      startedAt: null,
      completedAt: null,
      artifactRefs: [],
      error: null,
    })),
    nextStage: "planning",
    assertions: {
      completedStagesAreImmutable: true,
      databaseRequired: false,
      productionStateRequired: false,
      liveProviderCalls: 0,
    },
  };
}

export function assertIndustryExecutionCheckpoint(
  checkpoint: IndustryExecutionCheckpoint,
) {
  if (
    checkpoint.schemaVersion !== industryExecutionCheckpointSchemaVersion ||
    checkpoint.artifactType !== "industry-execution-checkpoint"
  ) {
    throw new Error("industry_execution_checkpoint_schema_invalid");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(checkpoint.inputHash)) {
    throw new Error("industry_execution_checkpoint_input_hash_invalid");
  }
  if (
    checkpoint.stages.length !== industryExecutionStages.length ||
    checkpoint.stages.some(
      (stage, index) => stage.stage !== industryExecutionStages[index],
    )
  ) {
    throw new Error("industry_execution_checkpoint_stage_order_invalid");
  }
  let foundIncomplete = false;
  for (const stage of checkpoint.stages) {
    if (stage.status === "completed") {
      if (foundIncomplete) {
        throw new Error(
          "industry_execution_checkpoint_completed_prefix_invalid",
        );
      }
      if (
        stage.attemptCount < 1 ||
        !stage.startedAt ||
        !stage.completedAt ||
        stage.error
      ) {
        throw new Error(
          `industry_execution_checkpoint_completed_stage_invalid:${stage.stage}`,
        );
      }
      validateStageArtifacts(stage.stage, stage.artifactRefs);
    } else {
      foundIncomplete = true;
      if (stage.status === "pending" && stage.artifactRefs.length > 0) {
        throw new Error(
          `industry_execution_checkpoint_pending_artifacts_invalid:${stage.stage}`,
        );
      }
    }
  }
  const expectedNextStage = nextIncompleteStage(checkpoint);
  if (checkpoint.nextStage !== expectedNextStage) {
    throw new Error("industry_execution_checkpoint_next_stage_invalid");
  }
  const nextStatus =
    expectedNextStage === null
      ? null
      : checkpointStage(checkpoint, expectedNextStage).status;
  const expectedStatus =
    expectedNextStage === null
      ? "completed"
      : nextStatus === "failed"
        ? "failed"
        : checkpoint.revision === 0
          ? "ready"
          : "in_progress";
  if (checkpoint.status !== expectedStatus) {
    throw new Error("industry_execution_checkpoint_status_invalid");
  }
  return checkpoint;
}

export function createIndustryExecutionResumePlan(
  checkpoint: IndustryExecutionCheckpoint,
) {
  const nextStage = nextIncompleteStage(checkpoint);
  return {
    runId: checkpoint.runId,
    completedStages: checkpoint.stages
      .filter((stage) => stage.status === "completed")
      .map((stage) => stage.stage),
    skippedCompletedStages: checkpoint.stages
      .filter((stage) => stage.status === "completed")
      .map((stage) => stage.stage),
    nextStage,
    canResume: nextStage !== null,
    retryingFailedStage:
      nextStage !== null &&
      checkpointStage(checkpoint, nextStage).status === "failed",
  };
}

export function startIndustryExecutionStage(
  checkpoint: IndustryExecutionCheckpoint,
  stage: IndustryExecutionStage,
  startedAt: string,
) {
  const current = checkpointStage(checkpoint, stage);
  if (current.status === "completed" || current.status === "in_progress") {
    return checkpoint;
  }
  const earlierIncomplete = checkpoint.stages.some(
    (entry) =>
      stageIndex(entry.stage) < stageIndex(stage) &&
      entry.status !== "completed",
  );
  if (earlierIncomplete) {
    throw new Error(`industry_execution_stage_out_of_order:${stage}`);
  }
  const next = cloneCheckpoint(checkpoint);
  const target = checkpointStage(next, stage);
  target.status = "in_progress";
  target.attemptCount += 1;
  target.startedAt = startedAt;
  target.completedAt = null;
  target.error = null;
  target.artifactRefs = [];
  next.revision += 1;
  next.status = "in_progress";
  next.nextStage = stage;
  return next;
}

export function completeIndustryExecutionStage(
  checkpoint: IndustryExecutionCheckpoint,
  stage: IndustryExecutionStage,
  artifactRefs: IndustryExecutionArtifactRef[],
  completedAt: string,
) {
  validateStageArtifacts(stage, artifactRefs);
  const current = checkpointStage(checkpoint, stage);
  if (current.status === "completed") {
    if (artifactRefsEqual(current.artifactRefs, artifactRefs))
      return checkpoint;
    throw new Error(`industry_execution_completed_stage_conflict:${stage}`);
  }
  if (current.status !== "in_progress") {
    throw new Error(`industry_execution_stage_not_in_progress:${stage}`);
  }
  const next = cloneCheckpoint(checkpoint);
  const target = checkpointStage(next, stage);
  target.status = "completed";
  target.completedAt = completedAt;
  target.artifactRefs = structuredClone(artifactRefs);
  target.error = null;
  next.revision += 1;
  next.nextStage = nextIncompleteStage(next);
  next.status = next.nextStage === null ? "completed" : "in_progress";
  return next;
}

export function failIndustryExecutionStage(
  checkpoint: IndustryExecutionCheckpoint,
  stage: IndustryExecutionStage,
  error: NonNullable<IndustryExecutionStageCheckpoint["error"]>,
) {
  const current = checkpointStage(checkpoint, stage);
  if (current.status !== "in_progress") {
    throw new Error(`industry_execution_stage_not_in_progress:${stage}`);
  }
  const next = cloneCheckpoint(checkpoint);
  const target = checkpointStage(next, stage);
  target.status = "failed";
  target.error = error;
  next.revision += 1;
  next.status = "failed";
  next.nextStage = stage;
  return next;
}

export function prepareIndustryExecutionCheckpointForResume(
  checkpoint: IndustryExecutionCheckpoint,
) {
  if (checkpoint.nextStage === null) return checkpoint;
  const current = checkpointStage(checkpoint, checkpoint.nextStage);
  if (current.status !== "in_progress") return checkpoint;
  return failIndustryExecutionStage(checkpoint, current.stage, {
    code: "interrupted_execution",
    message: "上次执行在阶段完成 checkpoint 落盘前中断，恢复时只重试该阶段。",
    retryable: true,
  });
}

export function createIndustryExecutionManifest(
  checkpoint: IndustryExecutionCheckpoint,
  checkpointPath: string,
): IndustryExecutionManifest {
  if (checkpoint.status !== "completed") {
    throw new Error(
      "industry_execution_manifest_requires_completed_checkpoint",
    );
  }
  return {
    schemaVersion: industryExecutionManifestSchemaVersion,
    artifactType: "industry-execution-manifest",
    runId: checkpoint.runId,
    planId: checkpoint.planId,
    stageOrder: [...industryExecutionStages],
    checkpointPath,
    stageArtifacts: checkpoint.stages.map((stage) => ({
      stage: stage.stage,
      artifactRefs: structuredClone(stage.artifactRefs),
    })),
    compatibility: {
      existingDeliveryManifestUnchanged: true,
      existingEightFilePackageUnchanged: true,
    },
  };
}

export type IndustryExecutionStageHandler = (input: {
  stage: IndustryExecutionStage;
  checkpoint: IndustryExecutionCheckpoint;
  contract: IndustryExecutionArtifactContract;
}) => Promise<IndustryExecutionArtifactRef[]>;

export async function runIndustryExecutionStages(input: {
  checkpoint: IndustryExecutionCheckpoint;
  handler: IndustryExecutionStageHandler;
  now: () => string;
  saveCheckpoint?: (checkpoint: IndustryExecutionCheckpoint) => Promise<void>;
  stopAfterStage?: IndustryExecutionStage;
}) {
  assertIndustryExecutionCheckpoint(input.checkpoint);
  let checkpoint = prepareIndustryExecutionCheckpointForResume(
    input.checkpoint,
  );
  while (checkpoint.nextStage !== null) {
    const stage = checkpoint.nextStage;
    checkpoint = startIndustryExecutionStage(checkpoint, stage, input.now());
    await input.saveCheckpoint?.(checkpoint);
    const contract = industryExecutionArtifactContracts.find(
      (entry) => entry.stage === stage,
    );
    if (!contract)
      throw new Error(`industry_execution_contract_missing:${stage}`);
    try {
      const artifactRefs = await input.handler({
        stage,
        checkpoint,
        contract,
      });
      checkpoint = completeIndustryExecutionStage(
        checkpoint,
        stage,
        artifactRefs,
        input.now(),
      );
      await input.saveCheckpoint?.(checkpoint);
      if (input.stopAfterStage === stage) return checkpoint;
    } catch (error) {
      checkpoint = failIndustryExecutionStage(checkpoint, stage, {
        code: "stage_handler_failed",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
      await input.saveCheckpoint?.(checkpoint);
      return checkpoint;
    }
  }
  return checkpoint;
}
