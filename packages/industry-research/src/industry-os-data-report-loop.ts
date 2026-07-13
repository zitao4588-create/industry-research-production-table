export const industryOsDataReportLoopSchemaVersion =
  "industry_os_data_report_loop.v2" as const;

export const industryOsDataReportGoalCatalog = [
  { id: "M1.1", milestone: "M1", requiredPermission: null },
  { id: "M1.2", milestone: "M1", requiredPermission: null },
  { id: "M1.3", milestone: "M1", requiredPermission: null },
  { id: "M1.4", milestone: "M1", requiredPermission: null },
  { id: "M2.1", milestone: "M2", requiredPermission: null },
  { id: "M2.2", milestone: "M2", requiredPermission: null },
  { id: "M2.3", milestone: "M2", requiredPermission: "live_budget" },
  { id: "M2.4", milestone: "M2", requiredPermission: "live_budget" },
  { id: "M3.1", milestone: "M3", requiredPermission: null },
  { id: "M3.2", milestone: "M3", requiredPermission: null },
  { id: "M3.3", milestone: "M3", requiredPermission: null },
  { id: "M3.4", milestone: "M3", requiredPermission: null },
  { id: "M4.1", milestone: "M4", requiredPermission: null },
  { id: "M4.2", milestone: "M4", requiredPermission: "live_budget" },
  { id: "M4.3", milestone: "M4", requiredPermission: null },
  { id: "M4.4", milestone: "M4", requiredPermission: null },
  { id: "M5.1", milestone: "M5", requiredPermission: null },
  { id: "M5.2", milestone: "M5", requiredPermission: null },
  { id: "M5.3", milestone: "M5", requiredPermission: null },
  { id: "M5.4", milestone: "M5", requiredPermission: "L4" },
  { id: "M6.1", milestone: "M6", requiredPermission: null },
  { id: "M6.2", milestone: "M6", requiredPermission: "L5" },
  { id: "M6.3", milestone: "M6", requiredPermission: "L5" },
  { id: "M6.4", milestone: "M6", requiredPermission: null },
] as const;

export type IndustryOsDataReportGoalId =
  (typeof industryOsDataReportGoalCatalog)[number]["id"];
export type IndustryOsDataReportMilestone =
  (typeof industryOsDataReportGoalCatalog)[number]["milestone"];
export type IndustryOsDataReportPermission = "live_budget" | "L3" | "L4" | "L5";
export type IndustryOsDataReportGoalStatus =
  | "planned"
  | "ready"
  | "in_progress"
  | "verifying"
  | "complete"
  | "awaiting_permission"
  | "retryable_failure"
  | "paused"
  | "skipped";

export type IndustryOsDataReportLoopState = {
  schemaVersion: typeof industryOsDataReportLoopSchemaVersion;
  loopId: "industry-os-data-report-m1-m6";
  status: "active" | "awaiting_permission" | "paused" | "complete";
  currentMilestone: IndustryOsDataReportMilestone;
  currentGoal: IndustryOsDataReportGoalId;
  currentGoalStatus: IndustryOsDataReportGoalStatus;
  permissionCeiling: "L2";
  autoAdvance: true;
  controllerPath: string;
  heartbeatPromptPath: string;
  retryPolicy: {
    maxSameFailureWithoutNewEvidence: 2;
    sameFailureCount: number;
    lastFailureFingerprint: string | null;
  };
  pause: null | {
    reason: string;
    requiredPermission: IndustryOsDataReportPermission | "none";
    requestSummary: string;
    decisionRequestHash: string | null;
  };
  grantedPermissions: Array<{
    goal: IndustryOsDataReportGoalId;
    permission: IndustryOsDataReportPermission;
    scopeSummary: string;
    grantedAt: string;
    decisionRequestHash: string;
  }>;
  standingPermissions: Array<{
    permission: "live_budget";
    scopeSummary: string;
    policySummary: string;
    grantedAt: string;
    authorizationHash: string;
  }>;
  goals: Array<{
    id: IndustryOsDataReportGoalId;
    milestone: IndustryOsDataReportMilestone;
    status: IndustryOsDataReportGoalStatus;
    requiredPermission: IndustryOsDataReportPermission | null;
  }>;
  history: Array<{
    goal: IndustryOsDataReportGoalId;
    status: IndustryOsDataReportGoalStatus;
    summary: string;
    at: string;
  }>;
  lastCheckpoint: {
    goal: IndustryOsDataReportGoalId;
    summary: string;
    evidence: string[];
    updatedAt: string;
  };
};

const activeStatuses = new Set<IndustryOsDataReportGoalStatus>([
  "ready",
  "in_progress",
  "verifying",
  "awaiting_permission",
  "retryable_failure",
  "paused",
]);

function clone(state: IndustryOsDataReportLoopState) {
  return structuredClone(state);
}

export function createInitialIndustryOsDataReportLoopState(
  at = "2026-07-13T00:00:00.000Z",
): IndustryOsDataReportLoopState {
  const firstGoal = industryOsDataReportGoalCatalog[0];
  return {
    schemaVersion: industryOsDataReportLoopSchemaVersion,
    loopId: "industry-os-data-report-m1-m6",
    status: "active",
    currentMilestone: firstGoal.milestone,
    currentGoal: firstGoal.id,
    currentGoalStatus: "ready",
    permissionCeiling: "L2",
    autoAdvance: true,
    controllerPath: "docs/INDUSTRY_OS_DATA_REPORT_M1_M6_LOOP.md",
    heartbeatPromptPath: "docs/INDUSTRY_OS_DATA_REPORT_HEARTBEAT_PROMPT.md",
    retryPolicy: {
      maxSameFailureWithoutNewEvidence: 2,
      sameFailureCount: 0,
      lastFailureFingerprint: null,
    },
    pause: null,
    grantedPermissions: [],
    standingPermissions: [],
    goals: industryOsDataReportGoalCatalog.map((goal, index) => ({
      ...goal,
      status: index === 0 ? ("ready" as const) : ("planned" as const),
    })),
    history: [],
    lastCheckpoint: {
      goal: firstGoal.id,
      summary: "New M1-M6 loop initialized; M1.1 is ready to start.",
      evidence: [
        "Previous G2-G12 loop remains complete and unchanged",
        "Permission ceiling is L2",
        "No live provider, credits, production write or external communication is authorized",
      ],
      updatedAt: at,
    },
  };
}

export function assertIndustryOsDataReportLoopState(
  state: IndustryOsDataReportLoopState,
) {
  if (state.schemaVersion !== industryOsDataReportLoopSchemaVersion) {
    throw new Error("loop_schema_version_invalid");
  }
  if (state.permissionCeiling !== "L2") {
    throw new Error("loop_permission_ceiling_must_be_l2");
  }
  if (
    state.standingPermissions.some(
      (grant) =>
        grant.permission !== "live_budget" ||
        !grant.scopeSummary.trim() ||
        !grant.policySummary.trim() ||
        !grant.authorizationHash.trim(),
    )
  ) {
    throw new Error("loop_standing_permission_invalid");
  }
  if (state.goals.length !== industryOsDataReportGoalCatalog.length) {
    throw new Error("loop_goal_catalog_length_mismatch");
  }

  for (const [index, expected] of industryOsDataReportGoalCatalog.entries()) {
    const actual = state.goals[index];
    if (
      !actual ||
      actual.id !== expected.id ||
      actual.milestone !== expected.milestone ||
      actual.requiredPermission !== expected.requiredPermission
    ) {
      throw new Error(`loop_goal_catalog_mismatch:${expected.id}`);
    }
  }

  if (state.status === "complete") {
    if (state.goals.some((goal) => goal.status !== "complete")) {
      throw new Error("loop_complete_with_incomplete_goal");
    }
    return state;
  }

  const activeGoals = state.goals.filter((goal) =>
    activeStatuses.has(goal.status),
  );
  if (activeGoals.length !== 1) {
    throw new Error("loop_requires_exactly_one_active_goal");
  }
  const activeGoal = activeGoals[0];
  if (!activeGoal || activeGoal.id !== state.currentGoal) {
    throw new Error("loop_current_goal_mismatch");
  }
  if (activeGoal.status !== state.currentGoalStatus) {
    throw new Error("loop_current_goal_status_mismatch");
  }
  if (activeGoal.milestone !== state.currentMilestone) {
    throw new Error("loop_current_milestone_mismatch");
  }

  const activeIndex = state.goals.findIndex(
    (goal) => goal.id === activeGoal.id,
  );
  if (
    state.goals
      .slice(0, activeIndex)
      .some((goal) => !["complete", "skipped"].includes(goal.status))
  ) {
    throw new Error("loop_previous_goal_incomplete");
  }
  if (
    state.goals.slice(activeIndex + 1).some((goal) => goal.status !== "planned")
  ) {
    throw new Error("loop_future_goal_activated_early");
  }

  if (
    state.status === "awaiting_permission" &&
    (activeGoal.status !== "awaiting_permission" || !state.pause)
  ) {
    throw new Error("loop_permission_pause_invalid");
  }
  if (state.status === "active" && state.pause) {
    throw new Error("loop_active_with_pause");
  }
  return state;
}

export function startIndustryOsDataReportGoal(
  state: IndustryOsDataReportLoopState,
  at: string,
) {
  assertIndustryOsDataReportLoopState(state);
  if (state.currentGoalStatus !== "ready") {
    throw new Error("loop_goal_not_ready");
  }
  const next = clone(state);
  const goal = next.goals.find(
    (candidate) => candidate.id === next.currentGoal,
  );
  if (!goal) throw new Error("loop_current_goal_missing");
  goal.status = "in_progress";
  next.currentGoalStatus = "in_progress";
  next.history.push({
    goal: next.currentGoal,
    status: "in_progress",
    summary: "Goal started.",
    at,
  });
  return assertIndustryOsDataReportLoopState(next);
}

export function beginIndustryOsDataReportGoalVerification(
  state: IndustryOsDataReportLoopState,
  at: string,
) {
  assertIndustryOsDataReportLoopState(state);
  if (state.currentGoalStatus !== "in_progress") {
    throw new Error("loop_goal_not_in_progress");
  }
  const next = clone(state);
  const goal = next.goals.find(
    (candidate) => candidate.id === next.currentGoal,
  );
  if (!goal) throw new Error("loop_current_goal_missing");
  goal.status = "verifying";
  next.currentGoalStatus = "verifying";
  next.history.push({
    goal: next.currentGoal,
    status: "verifying",
    summary: "Goal implementation complete; verification started.",
    at,
  });
  return assertIndustryOsDataReportLoopState(next);
}

export function completeIndustryOsDataReportGoal(
  state: IndustryOsDataReportLoopState,
  input: { at: string; summary: string; evidence: string[] },
) {
  assertIndustryOsDataReportLoopState(state);
  if (state.currentGoalStatus !== "verifying") {
    throw new Error("loop_goal_not_verifying");
  }
  const next = clone(state);
  const currentIndex = next.goals.findIndex(
    (goal) => goal.id === next.currentGoal,
  );
  const current = next.goals[currentIndex];
  if (!current) throw new Error("loop_current_goal_missing");
  current.status = "complete";
  next.history.push({
    goal: current.id,
    status: "complete",
    summary: input.summary,
    at: input.at,
  });
  next.lastCheckpoint = {
    goal: current.id,
    summary: input.summary,
    evidence: input.evidence,
    updatedAt: input.at,
  };
  next.retryPolicy.sameFailureCount = 0;
  next.retryPolicy.lastFailureFingerprint = null;

  const following = next.goals[currentIndex + 1];
  if (!following) {
    next.status = "complete";
    next.currentGoalStatus = "complete";
    return assertIndustryOsDataReportLoopState(next);
  }

  next.currentGoal = following.id;
  next.currentMilestone = following.milestone;
  if (
    following.requiredPermission &&
    !next.grantedPermissions.some(
      (grant) =>
        grant.goal === following.id &&
        grant.permission === following.requiredPermission,
    ) &&
    !next.standingPermissions.some(
      (grant) => grant.permission === following.requiredPermission,
    )
  ) {
    following.status = "awaiting_permission";
    next.currentGoalStatus = "awaiting_permission";
    next.status = "awaiting_permission";
    next.pause = {
      reason: `Goal ${following.id} requires explicit permission.`,
      requiredPermission: following.requiredPermission,
      requestSummary: `Authorize ${following.id} before execution.`,
      decisionRequestHash: null,
    };
  } else {
    following.status = "ready";
    next.currentGoalStatus = "ready";
    next.status = "active";
    next.pause = null;
  }
  return assertIndustryOsDataReportLoopState(next);
}

export function grantIndustryOsDataReportStandingLiveBudget(
  state: IndustryOsDataReportLoopState,
  input: {
    at: string;
    scopeSummary: string;
    policySummary: string;
    authorizationHash: string;
    currentGoalScopeSummary: string;
    currentGoalDecisionRequestHash: string;
  },
) {
  if (
    !input.scopeSummary.trim() ||
    !input.policySummary.trim() ||
    !input.authorizationHash.trim()
  ) {
    throw new Error("loop_standing_live_budget_scope_invalid");
  }
  const granted = grantIndustryOsDataReportGoalPermission(state, {
    at: input.at,
    permission: "live_budget",
    scopeSummary: input.currentGoalScopeSummary,
    decisionRequestHash: input.currentGoalDecisionRequestHash,
  });
  const next = clone(granted);
  next.standingPermissions = next.standingPermissions.filter(
    (grant) => grant.permission !== "live_budget",
  );
  next.standingPermissions.push({
    permission: "live_budget",
    scopeSummary: input.scopeSummary,
    policySummary: input.policySummary,
    grantedAt: input.at,
    authorizationHash: input.authorizationHash,
  });
  next.history.push({
    goal: next.currentGoal,
    status: "in_progress",
    summary: `Standing live_budget authorization recorded: ${input.policySummary}`,
    at: input.at,
  });
  return assertIndustryOsDataReportLoopState(next);
}

export function startIndustryOsDataReportGoalWithStandingLiveBudget(
  state: IndustryOsDataReportLoopState,
  input: {
    at: string;
    scopeSummary: string;
    budgetDeclarationHash: string;
  },
) {
  assertIndustryOsDataReportLoopState(state);
  if (state.currentGoalStatus !== "ready") {
    throw new Error("loop_goal_not_ready");
  }
  const current = state.goals.find((goal) => goal.id === state.currentGoal);
  if (
    current?.requiredPermission !== "live_budget" ||
    !state.standingPermissions.some(
      (grant) => grant.permission === "live_budget",
    )
  ) {
    throw new Error("loop_standing_live_budget_not_available");
  }
  if (!input.scopeSummary.trim() || !input.budgetDeclarationHash.trim()) {
    throw new Error("loop_goal_budget_declaration_invalid");
  }
  const next = clone(state);
  const nextCurrent = next.goals.find((goal) => goal.id === next.currentGoal);
  if (!nextCurrent) throw new Error("loop_current_goal_missing");
  next.grantedPermissions.push({
    goal: next.currentGoal,
    permission: "live_budget",
    scopeSummary: input.scopeSummary,
    grantedAt: input.at,
    decisionRequestHash: input.budgetDeclarationHash,
  });
  nextCurrent.status = "in_progress";
  next.currentGoalStatus = "in_progress";
  next.history.push({
    goal: next.currentGoal,
    status: "in_progress",
    summary: `Goal started under standing live_budget with bounded scope: ${input.scopeSummary}`,
    at: input.at,
  });
  return assertIndustryOsDataReportLoopState(next);
}

export function grantIndustryOsDataReportGoalPermission(
  state: IndustryOsDataReportLoopState,
  input: {
    at: string;
    permission: IndustryOsDataReportPermission;
    scopeSummary: string;
    decisionRequestHash: string;
  },
) {
  assertIndustryOsDataReportLoopState(state);
  if (
    state.status !== "awaiting_permission" ||
    state.currentGoalStatus !== "awaiting_permission" ||
    !state.pause
  ) {
    throw new Error("loop_not_awaiting_permission");
  }
  const current = state.goals.find((goal) => goal.id === state.currentGoal);
  if (
    !current ||
    current.requiredPermission !== input.permission ||
    state.pause.requiredPermission !== input.permission
  ) {
    throw new Error("loop_permission_grant_mismatch");
  }
  if (
    !input.scopeSummary.trim() ||
    !input.decisionRequestHash.trim() ||
    input.decisionRequestHash !== state.pause.decisionRequestHash
  ) {
    throw new Error("loop_permission_scope_or_hash_invalid");
  }

  const next = clone(state);
  const nextCurrent = next.goals.find((goal) => goal.id === next.currentGoal);
  if (!nextCurrent) throw new Error("loop_current_goal_missing");
  next.grantedPermissions.push({
    goal: next.currentGoal,
    permission: input.permission,
    scopeSummary: input.scopeSummary,
    grantedAt: input.at,
    decisionRequestHash: input.decisionRequestHash,
  });
  nextCurrent.status = "in_progress";
  next.currentGoalStatus = "in_progress";
  next.status = "active";
  next.pause = null;
  next.history.push({
    goal: next.currentGoal,
    status: "in_progress",
    summary: `Goal started with scoped ${input.permission} permission: ${input.scopeSummary}`,
    at: input.at,
  });
  return assertIndustryOsDataReportLoopState(next);
}

export function failIndustryOsDataReportGoal(
  state: IndustryOsDataReportLoopState,
  input: { at: string; fingerprint: string; summary: string },
) {
  assertIndustryOsDataReportLoopState(state);
  if (!["in_progress", "verifying"].includes(state.currentGoalStatus)) {
    throw new Error("loop_goal_not_running");
  }
  const next = clone(state);
  const goal = next.goals.find(
    (candidate) => candidate.id === next.currentGoal,
  );
  if (!goal) throw new Error("loop_current_goal_missing");
  const sameFailure =
    next.retryPolicy.lastFailureFingerprint === input.fingerprint;
  next.retryPolicy.sameFailureCount = sameFailure
    ? next.retryPolicy.sameFailureCount + 1
    : 1;
  next.retryPolicy.lastFailureFingerprint = input.fingerprint;
  const exhausted =
    next.retryPolicy.sameFailureCount >=
    next.retryPolicy.maxSameFailureWithoutNewEvidence;
  goal.status = exhausted ? "paused" : "retryable_failure";
  next.currentGoalStatus = goal.status;
  next.status = exhausted ? "paused" : "active";
  next.pause = exhausted
    ? {
        reason: input.summary,
        requiredPermission: "none",
        requestSummary: "Review the repeated failure before retrying.",
        decisionRequestHash: input.fingerprint,
      }
    : null;
  next.history.push({
    goal: next.currentGoal,
    status: goal.status,
    summary: input.summary,
    at: input.at,
  });
  return assertIndustryOsDataReportLoopState(next);
}
