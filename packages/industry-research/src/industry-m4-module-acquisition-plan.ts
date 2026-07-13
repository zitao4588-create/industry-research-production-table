import {
  createIndustryAcquisitionTaskPlan,
  type IndustryAcquisitionTaskPlan,
} from "./industry-acquisition-task";
import { industryResearchModuleOrder } from "./industry-module-results";
import {
  createIndustryPlan,
  type IndustryPlan,
  type IndustryPlanningInput,
  type IndustryResearchModule,
} from "./industry-planner";

export const industryM4ModuleAcquisitionPlanSchemaVersion =
  "industry_m4_module_acquisition_plan.v1" as const;

export type IndustryM4ModuleAcquisitionPlanArtifact = {
  schemaVersion: typeof industryM4ModuleAcquisitionPlanSchemaVersion;
  artifactType: "industry-m4-module-acquisition-plan";
  runId: string;
  inputScope: {
    industry: string;
    market: string;
    timeRange: string;
    scopeLevel: "broad_industry";
    narrowedBrandOrSku: null;
  };
  industryPlan: IndustryPlan;
  acquisitionPlan: IndustryAcquisitionTaskPlan;
  moduleTaskGroups: Array<{
    moduleId: IndustryResearchModule["id"];
    moduleName: string;
    taskIds: string[];
    coverageRowIds: string[];
    axisTypes: string[];
    allowedSourceRoles: string[];
    targetClaimRoles: string[];
  }>;
  summary: {
    moduleCount: 6;
    taskCount: number;
    coverageRowCount: number;
    modulesWithTasks: 6;
    liveProviderCalls: 0;
    livePublicRequests: 0;
    externalFactsProduced: false;
  };
  assertions: {
    broadIndustryInputPreserved: true;
    narrowingTransformApplied: false;
    allSixModulesHaveTasks: true;
    everyTaskComesFromCoverageMatrix: true;
    candidateIsNotEvidence: true;
    llmRequests: 0;
    productionWrite: false;
  };
};

export function createIndustryM4ModuleAcquisitionPlan(input: {
  runId: string;
  planningInput: IndustryPlanningInput;
  scopeLevel: "broad_industry";
}): IndustryM4ModuleAcquisitionPlanArtifact {
  if (!input.runId.trim()) {
    throw new Error("industry_m4_module_plan_run_id_required");
  }
  const industryPlan = createIndustryPlan(structuredClone(input.planningInput));
  const acquisitionPlan = createIndustryAcquisitionTaskPlan(industryPlan);
  if (
    industryPlan.inputCoordinates.industry !==
      input.planningInput.industry.trim() ||
    industryPlan.inputCoordinates.market !==
      input.planningInput.market.trim() ||
    industryPlan.inputCoordinates.timeRange !==
      input.planningInput.timeRange.trim()
  ) {
    throw new Error("industry_m4_module_plan_input_scope_changed");
  }
  const moduleIds = industryPlan.researchModules.map((module) => module.id);
  if (
    moduleIds.length !== industryResearchModuleOrder.length ||
    industryResearchModuleOrder.some(
      (moduleId, index) => moduleIds[index] !== moduleId,
    )
  ) {
    throw new Error("industry_m4_module_plan_six_module_order_invalid");
  }
  const moduleTaskGroups = industryPlan.researchModules.map((module) => {
    const tasks = acquisitionPlan.tasks.filter(
      (task) => task.moduleId === module.id,
    );
    if (tasks.length === 0) {
      throw new Error(`industry_m4_module_plan_tasks_missing:${module.id}`);
    }
    return {
      moduleId: module.id,
      moduleName: module.name,
      taskIds: tasks.map((task) => task.taskId),
      coverageRowIds: tasks.map((task) => task.coverageRowId),
      axisTypes: [...new Set(tasks.map((task) => task.axisType))],
      allowedSourceRoles: [
        ...new Set(tasks.flatMap((task) => task.allowedSourceRoles)),
      ],
      targetClaimRoles: [
        ...new Set(tasks.flatMap((task) => task.targetClaimRoles)),
      ],
    };
  });
  const coverageRowIds = new Set(
    industryPlan.coverageMatrix.map((row) => row.id),
  );
  if (
    acquisitionPlan.tasks.length !== industryPlan.coverageMatrix.length ||
    acquisitionPlan.tasks.some(
      (task) =>
        !coverageRowIds.has(task.coverageRowId) ||
        task.executionMode !== "offline_plan" ||
        task.budget.maximumPublicRequests !== 0 ||
        task.budget.maximumProviderRequests !== 0 ||
        task.budget.maximumCredits !== 0 ||
        task.budget.maximumCostYuan !== 0,
    )
  ) {
    throw new Error("industry_m4_module_plan_task_boundary_invalid");
  }
  return {
    schemaVersion: industryM4ModuleAcquisitionPlanSchemaVersion,
    artifactType: "industry-m4-module-acquisition-plan",
    runId: input.runId,
    inputScope: {
      industry: industryPlan.inputCoordinates.industry,
      market: industryPlan.inputCoordinates.market,
      timeRange: industryPlan.inputCoordinates.timeRange,
      scopeLevel: "broad_industry",
      narrowedBrandOrSku: null,
    },
    industryPlan,
    acquisitionPlan,
    moduleTaskGroups,
    summary: {
      moduleCount: 6,
      taskCount: acquisitionPlan.tasks.length,
      coverageRowCount: industryPlan.coverageMatrix.length,
      modulesWithTasks: 6,
      liveProviderCalls: 0,
      livePublicRequests: 0,
      externalFactsProduced: false,
    },
    assertions: {
      broadIndustryInputPreserved: true,
      narrowingTransformApplied: false,
      allSixModulesHaveTasks: true,
      everyTaskComesFromCoverageMatrix: true,
      candidateIsNotEvidence: true,
      llmRequests: 0,
      productionWrite: false,
    },
  };
}

export function serializeIndustryM4ModuleAcquisitionPlan(
  artifact: IndustryM4ModuleAcquisitionPlanArtifact,
) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
