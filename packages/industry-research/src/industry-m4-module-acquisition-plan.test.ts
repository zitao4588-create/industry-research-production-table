import { describe, expect, it } from "vitest";
import {
  createIndustryM4ModuleAcquisitionPlan,
  serializeIndustryM4ModuleAcquisitionPlan,
} from "./industry-m4-module-acquisition-plan";
import { skincareIndustryPlanningFixture } from "./industry-planner-fixtures";

describe("industry M4 broad-industry module acquisition plan", () => {
  it("preserves the broad skincare input and assigns offline tasks to all six modules", () => {
    const artifact = createIndustryM4ModuleAcquisitionPlan({
      runId: "skincare-m4-1-test",
      planningInput: structuredClone(skincareIndustryPlanningFixture),
      scopeLevel: "broad_industry",
    });
    expect(artifact.inputScope).toEqual({
      industry: "护肤品",
      market: "中国大陆",
      timeRange: "2024-2026",
      scopeLevel: "broad_industry",
      narrowedBrandOrSku: null,
    });
    expect(artifact.moduleTaskGroups).toHaveLength(6);
    expect(
      artifact.moduleTaskGroups.every((group) => group.taskIds.length > 0),
    ).toBe(true);
    expect(artifact.summary.taskCount).toBe(11);
    expect(
      artifact.acquisitionPlan.tasks.every(
        (task) => task.executionMode === "offline_plan",
      ),
    ).toBe(true);
    expect(
      artifact.acquisitionPlan.tasks.every((task) =>
        Object.values(task.budget).every(
          (value) => value === 0 || value === "not_required",
        ),
      ),
    ).toBe(true);
    expect(artifact.assertions.narrowingTransformApplied).toBe(false);
  });

  it("is deterministic for the same broad-industry input", () => {
    const first = createIndustryM4ModuleAcquisitionPlan({
      runId: "skincare-m4-1-deterministic",
      planningInput: structuredClone(skincareIndustryPlanningFixture),
      scopeLevel: "broad_industry",
    });
    const second = createIndustryM4ModuleAcquisitionPlan({
      runId: "skincare-m4-1-deterministic",
      planningInput: structuredClone(skincareIndustryPlanningFixture),
      scopeLevel: "broad_industry",
    });
    expect(serializeIndustryM4ModuleAcquisitionPlan(first)).toBe(
      serializeIndustryM4ModuleAcquisitionPlan(second),
    );
  });
});
