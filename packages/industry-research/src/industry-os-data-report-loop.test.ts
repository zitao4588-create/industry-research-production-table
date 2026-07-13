import { describe, expect, it } from "vitest";
import {
  assertIndustryOsDataReportLoopState,
  beginIndustryOsDataReportGoalVerification,
  completeIndustryOsDataReportGoal,
  createInitialIndustryOsDataReportLoopState,
  failIndustryOsDataReportGoal,
  grantIndustryOsDataReportGoalPermission,
  grantIndustryOsDataReportStandingLiveBudget,
  startIndustryOsDataReportGoal,
  startIndustryOsDataReportGoalWithStandingLiveBudget,
} from "./industry-os-data-report-loop";

describe("Industry OS data-to-report loop", () => {
  it("validates the canonical initial checkpoint", () => {
    expect(
      assertIndustryOsDataReportLoopState(
        createInitialIndustryOsDataReportLoopState(),
      ),
    ).toBeTruthy();
  });

  it("starts, verifies and advances exactly one goal", () => {
    const started = startIndustryOsDataReportGoal(
      createInitialIndustryOsDataReportLoopState(),
      "2026-07-13T01:00:00Z",
    );
    const verifying = beginIndustryOsDataReportGoalVerification(
      started,
      "2026-07-13T01:10:00Z",
    );
    const advanced = completeIndustryOsDataReportGoal(verifying, {
      at: "2026-07-13T01:20:00Z",
      summary: "M1.1 verified.",
      evidence: ["targeted tests passed"],
    });

    expect(advanced.currentGoal).toBe("M1.2");
    expect(advanced.currentGoalStatus).toBe("ready");
    expect(
      advanced.goals.filter((goal) => goal.status === "ready"),
    ).toHaveLength(1);
    expect(advanced.goals[0]?.status).toBe("complete");
  });

  it("pauses before a permission-gated goal", () => {
    let state = createInitialIndustryOsDataReportLoopState();
    for (let index = 0; index < 6; index += 1) {
      state = startIndustryOsDataReportGoal(
        state,
        `2026-07-13T02:0${index}:00Z`,
      );
      state = beginIndustryOsDataReportGoalVerification(
        state,
        `2026-07-13T02:1${index}:00Z`,
      );
      state = completeIndustryOsDataReportGoal(state, {
        at: `2026-07-13T02:2${index}:00Z`,
        summary: `${state.currentGoal} verified.`,
        evidence: ["verification passed"],
      });
    }

    expect(state.currentGoal).toBe("M2.3");
    expect(state.status).toBe("awaiting_permission");
    expect(state.pause?.requiredPermission).toBe("live_budget");
  });

  it("grants live budget only to the current goal and requires the decision hash", () => {
    let state = createInitialIndustryOsDataReportLoopState();
    for (let index = 0; index < 6; index += 1) {
      state = startIndustryOsDataReportGoal(
        state,
        `2026-07-13T04:0${index}:00Z`,
      );
      state = beginIndustryOsDataReportGoalVerification(
        state,
        `2026-07-13T04:1${index}:00Z`,
      );
      state = completeIndustryOsDataReportGoal(state, {
        at: `2026-07-13T04:2${index}:00Z`,
        summary: `${state.currentGoal} verified.`,
        evidence: ["verification passed"],
      });
    }
    if (!state.pause) throw new Error("permission_pause_missing");
    state.pause = {
      ...state.pause,
      decisionRequestHash: "m2-budget-hash",
    };
    const granted = grantIndustryOsDataReportGoalPermission(state, {
      at: "2026-07-13T04:30:00Z",
      permission: "live_budget",
      scopeSummary: "M2.3 dishwasher wave 1 only",
      decisionRequestHash: "m2-budget-hash",
    });

    expect(granted.currentGoal).toBe("M2.3");
    expect(granted.currentGoalStatus).toBe("in_progress");
    expect(granted.grantedPermissions).toEqual([
      expect.objectContaining({
        goal: "M2.3",
        permission: "live_budget",
      }),
    ]);

    const verifying = beginIndustryOsDataReportGoalVerification(
      granted,
      "2026-07-13T04:40:00Z",
    );
    const advanced = completeIndustryOsDataReportGoal(verifying, {
      at: "2026-07-13T04:50:00Z",
      summary: "M2.3 verified.",
      evidence: ["wave 1 audit passed"],
    });
    expect(advanced.currentGoal).toBe("M2.4");
    expect(advanced.currentGoalStatus).toBe("awaiting_permission");
    expect(advanced.pause?.requiredPermission).toBe("live_budget");
  });

  it("records standing live budget and still creates a bounded grant for every goal", () => {
    let state = createInitialIndustryOsDataReportLoopState();
    for (let index = 0; index < 6; index += 1) {
      state = startIndustryOsDataReportGoal(
        state,
        `2026-07-13T05:0${index}:00Z`,
      );
      state = beginIndustryOsDataReportGoalVerification(
        state,
        `2026-07-13T05:1${index}:00Z`,
      );
      state = completeIndustryOsDataReportGoal(state, {
        at: `2026-07-13T05:2${index}:00Z`,
        summary: `${state.currentGoal} verified.`,
        evidence: ["verification passed"],
      });
    }
    if (!state.pause) throw new Error("permission_pause_missing");
    state.pause = { ...state.pause, decisionRequestHash: "m23-budget-hash" };
    state = grantIndustryOsDataReportStandingLiveBudget(state, {
      at: "2026-07-13T05:30:00Z",
      scopeSummary: "M1-M6 live provider budgets only",
      policySummary: "Every goal must declare and enforce a finite hard cap",
      authorizationHash: "standing-authorization-hash",
      currentGoalScopeSummary: "M2.3 bounded live wave",
      currentGoalDecisionRequestHash: "m23-budget-hash",
    });
    state = beginIndustryOsDataReportGoalVerification(
      state,
      "2026-07-13T05:40:00Z",
    );
    state = completeIndustryOsDataReportGoal(state, {
      at: "2026-07-13T05:50:00Z",
      summary: "M2.3 verified.",
      evidence: ["wave 1 audit passed"],
    });

    expect(state.currentGoal).toBe("M2.4");
    expect(state.currentGoalStatus).toBe("ready");
    expect(state.pause).toBeNull();
    state = startIndustryOsDataReportGoalWithStandingLiveBudget(state, {
      at: "2026-07-13T06:00:00Z",
      scopeSummary:
        "M2.4: <=24 public requests, <=3 Tavily, <=20 Firecrawl credits",
      budgetDeclarationHash: "m24-budget-hash",
    });
    expect(state.currentGoalStatus).toBe("in_progress");
    expect(state.grantedPermissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal: "M2.4",
          permission: "live_budget",
          decisionRequestHash: "m24-budget-hash",
        }),
      ]),
    );
  });

  it("pauses after the same failure repeats twice", () => {
    const started = startIndustryOsDataReportGoal(
      createInitialIndustryOsDataReportLoopState(),
      "2026-07-13T03:00:00Z",
    );
    const failedOnce = failIndustryOsDataReportGoal(started, {
      at: "2026-07-13T03:01:00Z",
      fingerprint: "same-test-failure",
      summary: "Targeted test failed.",
    });
    expect(failedOnce.currentGoalStatus).toBe("retryable_failure");

    const retryState = structuredClone(failedOnce);
    const retryGoal = retryState.goals[0];
    if (!retryGoal) throw new Error("test_retry_goal_missing");
    retryGoal.status = "in_progress";
    retryState.currentGoalStatus = "in_progress";
    const failedTwice = failIndustryOsDataReportGoal(retryState, {
      at: "2026-07-13T03:02:00Z",
      fingerprint: "same-test-failure",
      summary: "Targeted test failed again without new evidence.",
    });
    expect(failedTwice.status).toBe("paused");
    expect(failedTwice.currentGoalStatus).toBe("paused");
  });
});
