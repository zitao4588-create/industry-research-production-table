import { describe, expect, it } from "vitest";
import {
  assertIndustryAcquisitionTask,
  createIndustryAcquisitionTaskPlan,
  type IndustryAcquisitionTask,
  industryAcquisitionTaskSchemaVersion,
  serializeIndustryAcquisitionTask,
  serializeIndustryAcquisitionTaskPlan,
} from "./industry-acquisition-task";
import { createIndustryPlan } from "./industry-planner";
import {
  dishwasherIndustryPlanningFixture,
  skincareIndustryPlanningFixture,
} from "./industry-planner-fixtures";

function fixture(
  overrides: Partial<IndustryAcquisitionTask> = {},
): IndustryAcquisitionTask {
  return {
    schemaVersion: industryAcquisitionTaskSchemaVersion,
    artifactType: "industry-acquisition-task",
    taskId: "dishwasher:ecommerce:taxonomy",
    planId: "industry-plan-dishwasher-cn",
    moduleId: "ecommerce_competitor_research",
    coverageRowId: "coverage:ecommerce:taxonomy",
    axisType: "taxonomy",
    axisItemIds: ["taxonomy:built-in", "taxonomy:sink"],
    researchQuestions: ["主要洗碗机产品形态如何分布？"],
    allowedSourceRoles: ["brand_official_site", "trusted_retail_channel"],
    targetClaimRoles: ["brand_positioning_product"],
    targetCoverage: {
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: 2,
    },
    currentCoverage: {
      independentSourceCount: 0,
      sourceRoles: [],
      representativeSampleIds: [],
    },
    priority: "critical",
    executionMode: "offline_plan",
    status: "planned",
    budget: {
      maximumPublicRequests: 0,
      maximumProviderRequests: 0,
      maximumCredits: 0,
      maximumCostYuan: 0,
      approvalStatus: "not_required",
    },
    compliance: {
      noLogin: true,
      noCookieImport: true,
      noPaywallBypass: true,
      noCaptchaBypass: true,
      noPrivateData: true,
    },
    stopConditions: [
      "coverage_target_met",
      "budget_exhausted",
      "two_waves_without_new_evidence",
    ],
    gaps: ["independent_sources_missing"],
    assertions: {
      candidateIsNotEvidence: true,
      externalFactsProduced: false,
      reportClaimsProduced: false,
    },
    ...overrides,
  };
}

describe("industry acquisition task contract", () => {
  it("accepts a deterministic offline planning task", () => {
    const task = fixture();
    expect(assertIndustryAcquisitionTask(task)).toBe(task);
    expect(serializeIndustryAcquisitionTask(task)).toBe(
      serializeIndustryAcquisitionTask(task),
    );
  });

  it("rejects tasks without source and claim roles", () => {
    expect(() =>
      assertIndustryAcquisitionTask(fixture({ allowedSourceRoles: [] })),
    ).toThrow("acquisition_task_source_roles_required");
    expect(() =>
      assertIndustryAcquisitionTask(fixture({ targetClaimRoles: [] })),
    ).toThrow("acquisition_task_claim_roles_required");
  });

  it("rejects live budget hidden inside an offline task", () => {
    expect(() =>
      assertIndustryAcquisitionTask(
        fixture({
          budget: {
            maximumPublicRequests: 1,
            maximumProviderRequests: 0,
            maximumCredits: 0,
            maximumCostYuan: 0,
            approvalStatus: "required",
          },
        }),
      ),
    ).toThrow("offline_acquisition_task_live_budget_forbidden");
  });

  it("requires explicit budget approval for live execution", () => {
    expect(() =>
      assertIndustryAcquisitionTask(
        fixture({
          executionMode: "live_authorized",
          budget: {
            maximumPublicRequests: 10,
            maximumProviderRequests: 0,
            maximumCredits: 0,
            maximumCostYuan: 0,
            approvalStatus: "required",
          },
        }),
      ),
    ).toThrow("live_acquisition_task_requires_approved_budget");
  });

  it("compiles every Planner coverage row into a zero-live-budget task", () => {
    const industryPlan = createIndustryPlan(
      structuredClone(skincareIndustryPlanningFixture),
    );
    const taskPlan = createIndustryAcquisitionTaskPlan(industryPlan);

    expect(taskPlan.tasks).toHaveLength(industryPlan.coverageMatrix.length);
    expect(taskPlan.tasks).toHaveLength(11);
    expect(
      taskPlan.tasks.every(
        (task) =>
          task.executionMode === "offline_plan" &&
          task.budget.maximumPublicRequests === 0 &&
          task.budget.maximumProviderRequests === 0 &&
          task.assertions.candidateIsNotEvidence,
      ),
    ).toBe(true);
    expect(taskPlan.tasks[0]?.priority).toBe("critical");
  });

  it("produces stable serialized acquisition plans", () => {
    const industryPlan = createIndustryPlan(
      structuredClone(skincareIndustryPlanningFixture),
    );
    const first = createIndustryAcquisitionTaskPlan(industryPlan);
    const second = createIndustryAcquisitionTaskPlan(industryPlan);
    expect(serializeIndustryAcquisitionTaskPlan(first)).toBe(
      serializeIndustryAcquisitionTaskPlan(second),
    );
  });

  it("creates a zero-budget dishwasher acquisition plan without facts", () => {
    const industryPlan = createIndustryPlan(
      structuredClone(dishwasherIndustryPlanningFixture),
    );
    const taskPlan = createIndustryAcquisitionTaskPlan(industryPlan);

    expect(industryPlan.inputCoordinates.industry).toBe("洗碗机");
    expect(taskPlan.tasks).toHaveLength(11);
    expect(taskPlan.assertions).toEqual({
      generatedFromCoverageMatrix: true,
      candidateIsNotEvidence: true,
      liveProviderCalls: 0,
      livePublicRequests: 0,
      externalFactsProduced: false,
    });
    expect(
      taskPlan.tasks.every(
        (task) =>
          task.gaps.length > 0 &&
          task.budget.maximumCostYuan === 0 &&
          !task.assertions.externalFactsProduced &&
          !task.assertions.reportClaimsProduced,
      ),
    ).toBe(true);
  });

  it("fails closed when a coverage row references a missing module", () => {
    const industryPlan = createIndustryPlan(
      structuredClone(skincareIndustryPlanningFixture),
    );
    industryPlan.researchModules = industryPlan.researchModules.filter(
      (module) => module.id !== industryPlan.coverageMatrix[0]?.moduleId,
    );
    expect(() => createIndustryAcquisitionTaskPlan(industryPlan)).toThrow(
      "acquisition_task_module_missing",
    );
  });
});
