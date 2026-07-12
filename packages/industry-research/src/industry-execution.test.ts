import { describe, expect, it } from "vitest";
import {
  assertIndustryExecutionCheckpoint,
  completeIndustryExecutionStage,
  createIndustryExecutionCheckpoint,
  createIndustryExecutionManifest,
  createIndustryExecutionResumePlan,
  type IndustryExecutionArtifactRef,
  type IndustryExecutionStage,
  industryExecutionArtifactContracts,
  industryExecutionStages,
  prepareIndustryExecutionCheckpointForResume,
  runIndustryExecutionStages,
  startIndustryExecutionStage,
} from "./industry-execution";

const inputHash = `sha256:${"a".repeat(64)}` as const;

function checkpoint() {
  return createIndustryExecutionCheckpoint({
    executionMode: "contract_fixture",
    runId: "skincare-g3-contract-fixture",
    planId: "industry-plan-fixture",
    inputHash,
  });
}

function artifactsFor(stage: IndustryExecutionStage) {
  const hash =
    `sha256:${String(industryExecutionStages.indexOf(stage) + 1).repeat(64)}` as const;
  const json = (
    artifactType: IndustryExecutionArtifactRef["artifactType"],
    relativePath: string,
  ): IndustryExecutionArtifactRef => ({
    artifactType,
    relativePath,
    contentHash: hash,
    mediaType: "application/json",
  });
  switch (stage) {
    case "planning":
      return [json("industry_plan", "planning/industry-plan.json")];
    case "breadth_scan":
      return [
        json("source_candidate_plan", "breadth_scan/source-candidates.json"),
      ];
    case "sampling":
      return [
        json(
          "representative_sample_plan",
          "sampling/representative-samples.json",
        ),
      ];
    case "module_research":
      return [json("module_results", "module_research/module-results.json")];
    case "synthesis":
      return [json("claim_ledger", "synthesis/claim-ledger.json")];
    case "reporting":
      return [
        {
          ...json("industry_report", "reporting/report.md"),
          mediaType: "text/markdown" as const,
        },
      ];
  }
}

function completeThrough(target: IndustryExecutionStage) {
  let current = checkpoint();
  for (const stage of industryExecutionStages) {
    current = startIndustryExecutionStage(
      current,
      stage,
      `2026-07-12T00:00:0${current.revision}Z`,
    );
    current = completeIndustryExecutionStage(
      current,
      stage,
      artifactsFor(stage),
      `2026-07-12T00:00:0${current.revision}Z`,
    );
    if (stage === target) break;
  }
  return current;
}

describe("Industry staged execution contract", () => {
  it("defines the six ordered stages and their required artifacts", () => {
    expect(industryExecutionStages).toEqual([
      "planning",
      "breadth_scan",
      "sampling",
      "module_research",
      "synthesis",
      "reporting",
    ]);
    expect(industryExecutionArtifactContracts).toHaveLength(6);
    expect(
      industryExecutionArtifactContracts.every(
        (contract) => contract.requiredArtifactTypes.length > 0,
      ),
    ).toBe(true);
  });

  it("creates a fail-closed local checkpoint with no database or provider dependency", () => {
    const current = checkpoint();

    expect(current.status).toBe("ready");
    expect(current.nextStage).toBe("planning");
    expect(current.stages.every((stage) => stage.status === "pending")).toBe(
      true,
    );
    expect(current.assertions).toEqual({
      completedStagesAreImmutable: true,
      databaseRequired: false,
      productionStateRequired: false,
      liveProviderCalls: 0,
    });
  });

  it("rejects out-of-order execution", () => {
    expect(() =>
      startIndustryExecutionStage(
        checkpoint(),
        "sampling",
        "2026-07-12T00:00:00Z",
      ),
    ).toThrow("industry_execution_stage_out_of_order:sampling");
  });

  it("rejects a corrupt checkpoint before resume", () => {
    const corrupt = structuredClone(completeThrough("planning"));
    corrupt.nextStage = "synthesis";

    expect(() => assertIndustryExecutionCheckpoint(corrupt)).toThrow(
      "industry_execution_checkpoint_next_stage_invalid",
    );
  });

  it("keeps start and completion idempotent for the same stage artifacts", () => {
    const started = startIndustryExecutionStage(
      checkpoint(),
      "planning",
      "2026-07-12T00:00:00Z",
    );
    const startedAgain = startIndustryExecutionStage(
      started,
      "planning",
      "2026-07-12T00:00:01Z",
    );
    const completed = completeIndustryExecutionStage(
      started,
      "planning",
      artifactsFor("planning"),
      "2026-07-12T00:00:02Z",
    );
    const completedAgain = completeIndustryExecutionStage(
      completed,
      "planning",
      artifactsFor("planning"),
      "2026-07-12T00:00:03Z",
    );

    expect(startedAgain).toBe(started);
    expect(completedAgain).toBe(completed);
    expect(completed.stages[0]?.attemptCount).toBe(1);
  });

  it("makes completed stage artifacts immutable", () => {
    const completed = completeThrough("planning");
    const conflicting = artifactsFor("planning").map((artifact) => ({
      ...artifact,
      contentHash: `sha256:${"f".repeat(64)}` as const,
    }));

    expect(() =>
      completeIndustryExecutionStage(
        completed,
        "planning",
        conflicting,
        "2026-07-12T00:00:04Z",
      ),
    ).toThrow("industry_execution_completed_stage_conflict:planning");
  });

  it("validates required artifact types, hashes and safe relative paths", () => {
    const started = startIndustryExecutionStage(
      checkpoint(),
      "planning",
      "2026-07-12T00:00:00Z",
    );
    const planningArtifact = artifactsFor("planning")[0];
    if (!planningArtifact) throw new Error("planning_fixture_artifact_missing");

    expect(() =>
      completeIndustryExecutionStage(
        started,
        "planning",
        [],
        "2026-07-12T00:00:01Z",
      ),
    ).toThrow("industry_execution_required_artifact_missing");
    expect(() =>
      completeIndustryExecutionStage(
        started,
        "planning",
        [
          {
            ...planningArtifact,
            relativePath: "../industry-plan.json",
          },
        ],
        "2026-07-12T00:00:01Z",
      ),
    ).toThrow("industry_execution_invalid_artifact_path");
  });

  it("resumes an interrupted stage without rerunning completed stages", async () => {
    const afterBreadthScan = completeThrough("breadth_scan");
    const interrupted = startIndustryExecutionStage(
      afterBreadthScan,
      "sampling",
      "2026-07-12T00:01:00Z",
    );
    const calls: IndustryExecutionStage[] = [];
    let tick = 0;
    const resumed = await runIndustryExecutionStages({
      checkpoint: interrupted,
      now: () => `2026-07-12T00:02:${String(tick++).padStart(2, "0")}Z`,
      handler: async ({ stage }) => {
        calls.push(stage);
        return artifactsFor(stage);
      },
    });

    expect(calls).toEqual([
      "sampling",
      "module_research",
      "synthesis",
      "reporting",
    ]);
    expect(resumed.status).toBe("completed");
    expect(resumed.stages[0]?.attemptCount).toBe(1);
    expect(resumed.stages[1]?.attemptCount).toBe(1);
    expect(resumed.stages[2]?.attemptCount).toBe(2);
  });

  it("supports a controlled checkpoint pause and resumes at the next stage", async () => {
    let tick = 0;
    const paused = await runIndustryExecutionStages({
      checkpoint: checkpoint(),
      stopAfterStage: "sampling",
      now: () => `2026-07-12T00:02:${String(tick++).padStart(2, "0")}Z`,
      handler: async ({ stage }) => artifactsFor(stage),
    });
    const resumedCalls: IndustryExecutionStage[] = [];
    const resumed = await runIndustryExecutionStages({
      checkpoint: paused,
      now: () => `2026-07-12T00:03:${String(tick++).padStart(2, "0")}Z`,
      handler: async ({ stage }) => {
        resumedCalls.push(stage);
        return artifactsFor(stage);
      },
    });

    expect(paused.nextStage).toBe("module_research");
    expect(resumedCalls).toEqual(["module_research", "synthesis", "reporting"]);
    expect(resumed.status).toBe("completed");
  });

  it("stops on stage failure and isolates later stages until a resume", async () => {
    const calls: IndustryExecutionStage[] = [];
    let tick = 0;
    const failed = await runIndustryExecutionStages({
      checkpoint: checkpoint(),
      now: () => `2026-07-12T00:03:${String(tick++).padStart(2, "0")}Z`,
      handler: async ({ stage }) => {
        calls.push(stage);
        if (stage === "module_research")
          throw new Error("fixture-module-failure");
        return artifactsFor(stage);
      },
    });

    expect(calls).toEqual([
      "planning",
      "breadth_scan",
      "sampling",
      "module_research",
    ]);
    expect(failed.status).toBe("failed");
    expect(failed.nextStage).toBe("module_research");
    expect(failed.stages[4]?.status).toBe("pending");
    expect(failed.stages[5]?.status).toBe("pending");

    const resumedCalls: IndustryExecutionStage[] = [];
    const resumed = await runIndustryExecutionStages({
      checkpoint: failed,
      now: () => `2026-07-12T00:04:${String(tick++).padStart(2, "0")}Z`,
      handler: async ({ stage }) => {
        resumedCalls.push(stage);
        return artifactsFor(stage);
      },
    });

    expect(resumedCalls).toEqual(["module_research", "synthesis", "reporting"]);
    expect(resumed.status).toBe("completed");
    expect(resumed.stages[3]?.attemptCount).toBe(2);
  });

  it("reports a deterministic resume plan", () => {
    const completed = completeThrough("sampling");
    const plan = createIndustryExecutionResumePlan(completed);

    expect(plan.completedStages).toEqual([
      "planning",
      "breadth_scan",
      "sampling",
    ]);
    expect(plan.nextStage).toBe("module_research");
    expect(plan.retryingFailedStage).toBe(false);
  });

  it("normalizes an interrupted in-progress checkpoint into a retryable stage", () => {
    const interrupted = startIndustryExecutionStage(
      completeThrough("planning"),
      "breadth_scan",
      "2026-07-12T00:05:00Z",
    );
    const prepared = prepareIndustryExecutionCheckpointForResume(interrupted);

    expect(prepared.status).toBe("failed");
    expect(prepared.nextStage).toBe("breadth_scan");
    expect(prepared.stages[1]?.error?.code).toBe("interrupted_execution");
  });

  it("creates a completion manifest without changing the old delivery package", async () => {
    let tick = 0;
    const completed = await runIndustryExecutionStages({
      checkpoint: checkpoint(),
      now: () => `2026-07-12T00:06:${String(tick++).padStart(2, "0")}Z`,
      handler: async ({ stage }) => artifactsFor(stage),
    });
    const manifest = createIndustryExecutionManifest(
      completed,
      "checkpoint.json",
    );

    expect(manifest.stageArtifacts).toHaveLength(6);
    expect(manifest.compatibility).toEqual({
      existingDeliveryManifestUnchanged: true,
      existingEightFilePackageUnchanged: true,
    });
  });
});
