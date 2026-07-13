import type {
  IndustryCoverageAxisType,
  IndustryPlanClaimRole,
  IndustryPlanSourceRole,
  IndustryResearchModule,
} from "./industry-planner";

export const industryAcquisitionTaskSchemaVersion =
  "industry_acquisition_task.v1" as const;
export const industryAcquisitionTaskPlanSchemaVersion =
  "industry_acquisition_task_plan.v1" as const;

export type IndustryAcquisitionTaskStatus =
  | "planned"
  | "awaiting_permission"
  | "ready"
  | "complete"
  | "blocked";

export type IndustryAcquisitionTask = {
  schemaVersion: typeof industryAcquisitionTaskSchemaVersion;
  artifactType: "industry-acquisition-task";
  taskId: string;
  planId: string;
  moduleId: IndustryResearchModule["id"];
  coverageRowId: string;
  axisType: IndustryCoverageAxisType;
  axisItemIds: string[];
  researchQuestions: string[];
  allowedSourceRoles: IndustryPlanSourceRole[];
  targetClaimRoles: IndustryPlanClaimRole[];
  targetCoverage: {
    minIndependentSources: number;
    minSourceRoles: number;
    minRepresentativeSamples: number;
  };
  currentCoverage: {
    independentSourceCount: number;
    sourceRoles: IndustryPlanSourceRole[];
    representativeSampleIds: string[];
  };
  priority: "critical" | "high" | "normal";
  executionMode: "offline_plan" | "live_authorized";
  status: IndustryAcquisitionTaskStatus;
  budget: {
    maximumPublicRequests: number;
    maximumProviderRequests: number;
    maximumCredits: number;
    maximumCostYuan: number;
    approvalStatus: "not_required" | "required" | "approved";
  };
  compliance: {
    noLogin: true;
    noCookieImport: true;
    noPaywallBypass: true;
    noCaptchaBypass: true;
    noPrivateData: true;
  };
  stopConditions: string[];
  gaps: string[];
  assertions: {
    candidateIsNotEvidence: true;
    externalFactsProduced: false;
    reportClaimsProduced: false;
  };
};

export type IndustryAcquisitionTaskPlan = {
  schemaVersion: typeof industryAcquisitionTaskPlanSchemaVersion;
  artifactType: "industry-acquisition-task-plan";
  planId: string;
  tasks: IndustryAcquisitionTask[];
  summary: {
    taskCount: number;
    criticalTaskCount: number;
    highPriorityTaskCount: number;
    blockedTaskCount: number;
  };
  assertions: {
    generatedFromCoverageMatrix: true;
    candidateIsNotEvidence: true;
    liveProviderCalls: 0;
    livePublicRequests: 0;
    externalFactsProduced: false;
  };
};

function requireNonEmpty(values: string[], error: string) {
  if (values.length === 0 || values.some((value) => !value.trim())) {
    throw new Error(error);
  }
}

export function assertIndustryAcquisitionTask(task: IndustryAcquisitionTask) {
  if (task.schemaVersion !== industryAcquisitionTaskSchemaVersion) {
    throw new Error("acquisition_task_schema_version_invalid");
  }
  if (task.artifactType !== "industry-acquisition-task") {
    throw new Error("acquisition_task_artifact_type_invalid");
  }
  requireNonEmpty(
    [task.taskId, task.planId, task.coverageRowId],
    "acquisition_task_identity_required",
  );
  requireNonEmpty(task.axisItemIds, "acquisition_task_axis_items_required");
  requireNonEmpty(
    task.researchQuestions,
    "acquisition_task_research_questions_required",
  );
  requireNonEmpty(
    task.allowedSourceRoles,
    "acquisition_task_source_roles_required",
  );
  requireNonEmpty(
    task.targetClaimRoles,
    "acquisition_task_claim_roles_required",
  );
  requireNonEmpty(
    task.stopConditions,
    "acquisition_task_stop_conditions_required",
  );
  const coverageValues = Object.values(task.targetCoverage);
  const currentCoverageValues = [
    task.currentCoverage.independentSourceCount,
    task.currentCoverage.sourceRoles.length,
    task.currentCoverage.representativeSampleIds.length,
  ];
  const budgetValues = [
    task.budget.maximumPublicRequests,
    task.budget.maximumProviderRequests,
    task.budget.maximumCredits,
    task.budget.maximumCostYuan,
  ];
  if (
    [...coverageValues, ...currentCoverageValues, ...budgetValues].some(
      (value) => value < 0,
    )
  ) {
    throw new Error("acquisition_task_numeric_limit_invalid");
  }
  if (
    task.executionMode === "offline_plan" &&
    budgetValues.some((value) => value !== 0)
  ) {
    throw new Error("offline_acquisition_task_live_budget_forbidden");
  }
  if (
    task.executionMode === "live_authorized" &&
    task.budget.approvalStatus !== "approved"
  ) {
    throw new Error("live_acquisition_task_requires_approved_budget");
  }
  if (
    !task.compliance.noLogin ||
    !task.compliance.noCookieImport ||
    !task.compliance.noPaywallBypass ||
    !task.compliance.noCaptchaBypass ||
    !task.compliance.noPrivateData
  ) {
    throw new Error("acquisition_task_compliance_boundary_invalid");
  }
  if (
    !task.assertions.candidateIsNotEvidence ||
    task.assertions.externalFactsProduced ||
    task.assertions.reportClaimsProduced
  ) {
    throw new Error("acquisition_task_planning_assertions_invalid");
  }
  return task;
}

export function serializeIndustryAcquisitionTask(
  task: IndustryAcquisitionTask,
) {
  assertIndustryAcquisitionTask(task);
  return `${JSON.stringify(task, null, 2)}\n`;
}

function taskPriority(
  moduleId: IndustryResearchModule["id"],
  targetBasis: string,
): IndustryAcquisitionTask["priority"] {
  if (
    targetBasis === "primary_authority_minimum" ||
    moduleId === "market_landscape" ||
    moduleId === "regulation_and_standards"
  ) {
    return "critical";
  }
  if (
    moduleId === "consumer_demand" ||
    moduleId === "ecommerce_competitor_research"
  ) {
    return "high";
  }
  return "normal";
}

const priorityOrder: Record<IndustryAcquisitionTask["priority"], number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

export function createIndustryAcquisitionTaskPlan(
  plan: import("./industry-planner").IndustryPlan,
): IndustryAcquisitionTaskPlan {
  const moduleById = new Map(
    plan.researchModules.map((module) => [module.id, module]),
  );
  const tasks = plan.coverageMatrix.map((row) => {
    const module = moduleById.get(row.moduleId);
    if (!module) {
      throw new Error(`acquisition_task_module_missing:${row.moduleId}`);
    }
    const gaps = [
      ...row.gaps,
      ...(row.currentCoverage.independentSourceCount <
      row.targetCoverage.minIndependentSources
        ? ["independent_source_coverage_missing"]
        : []),
      ...(row.currentCoverage.sourceRoles.length <
      row.targetCoverage.minSourceRoles
        ? ["source_role_coverage_missing"]
        : []),
      ...(row.currentCoverage.representativeSampleIds.length <
      row.targetCoverage.minRepresentativeSamples
        ? ["representative_sample_coverage_missing"]
        : []),
    ];
    const task: IndustryAcquisitionTask = {
      schemaVersion: industryAcquisitionTaskSchemaVersion,
      artifactType: "industry-acquisition-task",
      taskId: `acquisition:${plan.planId}:${row.id}`,
      planId: plan.planId,
      moduleId: row.moduleId,
      coverageRowId: row.id,
      axisType: row.axisType,
      axisItemIds: [...row.axisItemIds],
      researchQuestions: [...module.researchQuestions],
      allowedSourceRoles: [...row.allowedSourceRoles],
      targetClaimRoles: [...module.targetClaimRoles],
      targetCoverage: {
        minIndependentSources: row.targetCoverage.minIndependentSources,
        minSourceRoles: row.targetCoverage.minSourceRoles,
        minRepresentativeSamples: row.targetCoverage.minRepresentativeSamples,
      },
      currentCoverage: {
        independentSourceCount: row.currentCoverage.independentSourceCount,
        sourceRoles: [...row.currentCoverage.sourceRoles],
        representativeSampleIds: [
          ...row.currentCoverage.representativeSampleIds,
        ],
      },
      priority: taskPriority(row.moduleId, row.targetCoverage.targetBasis),
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
        "approved_budget_exhausted",
        "two_waves_without_new_evidence",
        "access_or_compliance_blocked",
      ],
      gaps: [...new Set(gaps)],
      assertions: {
        candidateIsNotEvidence: true,
        externalFactsProduced: false,
        reportClaimsProduced: false,
      },
    };
    return assertIndustryAcquisitionTask(task);
  });

  tasks.sort(
    (left, right) =>
      priorityOrder[left.priority] - priorityOrder[right.priority] ||
      left.moduleId.localeCompare(right.moduleId) ||
      left.coverageRowId.localeCompare(right.coverageRowId),
  );

  return {
    schemaVersion: industryAcquisitionTaskPlanSchemaVersion,
    artifactType: "industry-acquisition-task-plan",
    planId: plan.planId,
    tasks,
    summary: {
      taskCount: tasks.length,
      criticalTaskCount: tasks.filter((task) => task.priority === "critical")
        .length,
      highPriorityTaskCount: tasks.filter((task) => task.priority === "high")
        .length,
      blockedTaskCount: tasks.filter((task) => task.status === "blocked")
        .length,
    },
    assertions: {
      generatedFromCoverageMatrix: true,
      candidateIsNotEvidence: true,
      liveProviderCalls: 0,
      livePublicRequests: 0,
      externalFactsProduced: false,
    },
  };
}

export function serializeIndustryAcquisitionTaskPlan(
  plan: IndustryAcquisitionTaskPlan,
) {
  for (const task of plan.tasks) assertIndustryAcquisitionTask(task);
  if (plan.summary.taskCount !== plan.tasks.length) {
    throw new Error("acquisition_task_plan_count_mismatch");
  }
  return `${JSON.stringify(plan, null, 2)}\n`;
}
