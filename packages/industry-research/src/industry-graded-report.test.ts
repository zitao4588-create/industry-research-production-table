import { describe, expect, it } from "vitest";
import {
  createIndustryAcquisitionTaskPlan,
  createIndustryPlan,
  dishwasherIndustryPlanningFixture,
} from "./index";
import type { IndustryAtomicClaimsArtifact } from "./industry-atomic-claims";
import { createIndustryGradedReport } from "./industry-graded-report";
import type { IndustryM2WaveVerification } from "./industry-m2-wave-verification";
import type { IndustryOpportunityHypothesesArtifact } from "./industry-opportunity-hypotheses";

const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
const task = taskPlan.tasks[0];
if (!task) throw new Error("report_task_missing");
const atomicClaims = {
  claims: [
    {
      claimId: "fact-1",
      statement: "洗碗机市场事实",
      status: "confirmed_atomic_fact",
      quote: "洗碗机市场事实",
      rawDocumentId: "raw-1",
      sourceUrl: "https://example.com/fact",
      quoteStart: 0,
      quoteEnd: 7,
    },
  ],
  excludedM2Documents: [
    {
      url: "https://example.com/rejected",
      status: "source_quality_rejected",
      binaryPayloadDetected: false,
    },
  ],
} as unknown as IndustryAtomicClaimsArtifact;
const hypotheses = {
  hypotheses: [
    {
      hypothesisId: "hypothesis-1",
      title: "待验证：方向",
      status: "unverified_opportunity_hypothesis",
      commercializationAssessment: "not_evaluated",
      targetUser: "目标用户",
      problem: "目标问题",
      hypothesisStatement: "该方向可能有用，待验证。",
      supportingClaimIds: ["fact-1"],
      unknowns: ["未知一", "未知二"],
      validationPlan: {
        method: "任务测试",
        minimumSampleSize: 5,
        successCriteria: ["至少4/5完成"],
        failureCriteria: ["不超过2/5完成"],
        executionStatus: "not_started",
        permissionRequiredBeforeExecution: "L5",
      },
    },
  ],
  decisionGuidance: {
    researchReadiness: "validation_ready",
    commercializationAssessment: "requires_real_world_validation",
  },
  summary: { validationExecutionsCompleted: 0 },
} as unknown as IndustryOpportunityHypothesesArtifact;
const m2Verification = {
  coverageRows: [
    {
      taskId: task.taskId,
      status: "raw_candidate_target_met_not_evidence",
      independentSourceCount: 2,
      sourceRoles: ["industry_association", "financial_report"],
      gaps: [],
    },
  ],
} as unknown as IndustryM2WaveVerification;

describe("industry graded report", () => {
  it("renders facts, hypotheses, gaps, rejections and evidence in separate grades", () => {
    const report = createIndustryGradedReport({
      runId: "graded-report-test",
      category: "洗碗机",
      atomicClaims,
      hypotheses,
      m2Verification,
      taskPlan,
    });
    expect(report.status).toBe("draft_pending_m3_4_review");
    expect(report.reportMarkdown).toContain("## 3. 已确认原子事实");
    expect(report.reportMarkdown).toContain("## 4. 待验证机会假设");
    expect(report.reportMarkdown).toContain("## 5. Coverage 与研究缺口");
    expect(report.reportMarkdown).toContain("## 7. 证据附录");
    expect(report.decisionBoundary.conclusion).toBe(
      "no_project_go_or_stop_decision",
    );
    expect(report.reportMarkdown).not.toMatch(/停止商业化|终止商业化/);
  });

  it("rejects a hypothesis promoted beyond the unverified boundary", () => {
    const promoted = structuredClone(hypotheses);
    promoted.hypotheses[0] = {
      ...promoted.hypotheses[0],
      status: "confirmed" as never,
    };
    expect(() =>
      createIndustryGradedReport({
        runId: "graded-report-rejection-test",
        category: "洗碗机",
        atomicClaims,
        hypotheses: promoted,
        m2Verification,
        taskPlan,
      }),
    ).toThrow("industry_graded_report_hypothesis_boundary_invalid");
  });
});
