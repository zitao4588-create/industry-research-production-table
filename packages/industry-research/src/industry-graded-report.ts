import type { IndustryAcquisitionTaskPlan } from "./industry-acquisition-task";
import type {
  IndustryAtomicClaim,
  IndustryAtomicClaimsArtifact,
} from "./industry-atomic-claims";
import type { IndustryM2WaveVerification } from "./industry-m2-wave-verification";
import type { IndustryOpportunityHypothesesArtifact } from "./industry-opportunity-hypotheses";

export const industryGradedReportSchemaVersion =
  "industry_graded_report.v1" as const;

export type IndustryReportCoverageEntry = {
  taskId: string;
  coverageRowId: string;
  axisType: string;
  priority: "critical" | "high" | "normal";
  status: "raw_candidate_target_met_not_evidence" | "raw_candidate_gap";
  independentSourceCount: number;
  sourceRoles: string[];
  target: {
    minIndependentSources: number;
    minSourceRoles: number;
    minRepresentativeSamples: number;
  };
  gaps: string[];
};

export type IndustryGradedReportArtifact = {
  schemaVersion: typeof industryGradedReportSchemaVersion;
  artifactType: "industry-graded-report";
  runId: string;
  category: string;
  status: "draft_pending_m3_4_review";
  evidenceGrade: "source_traceable_with_known_coverage_gaps";
  confirmedFacts: IndustryAtomicClaim[];
  unverifiedHypotheses: IndustryOpportunityHypothesesArtifact["hypotheses"];
  coverage: {
    entries: IndustryReportCoverageEntry[];
    totalRows: number;
    passedRows: number;
    gapRows: number;
    criticalRows: number;
    criticalRowsPassed: number;
  };
  rejectedSources: IndustryAtomicClaimsArtifact["excludedM2Documents"];
  decisionBoundary: {
    researchReadiness: "validation_ready";
    commercializationAssessment: "requires_real_world_validation";
    validationExecutionsCompleted: 0;
    conclusion: "no_project_go_or_stop_decision";
  };
  reportMarkdown: string;
  assertions: {
    confirmedFactsAndHypothesesSeparated: true;
    everyConfirmedFactHasExactQuoteTrace: true;
    allHypothesesRemainUnverified: true;
    allCoverageGapsVisible: true;
    rejectedSourcesNotUsedAsFacts: true;
    evidenceAppendixComplete: true;
    commercializationDecisionProduced: false;
    llmRequests: 0;
    productionWrite: false;
  };
};

function formatLines(values: string[]) {
  return values.map((value) => `  - ${value}`).join("\n");
}

function renderConfirmedFact(claim: IndustryAtomicClaim) {
  return [
    `### ${claim.statement}`,
    "",
    `- 级别：已确认原子事实（仅限引用页面的直接表述）`,
    `- Claim role：${claim.claimRole}`,
    `- Source role：${claim.sourceRole}`,
    `- Coverage row：${claim.coverageRowId}`,
    `- 来源：[原文](${claim.sourceUrl})`,
    `- 不可变文档：\`${claim.rawDocumentId}\``,
    `- 原文引用：> ${claim.quote.replace(/\n/g, " ")}`,
  ].join("\n");
}

function renderHypothesis(
  hypothesis: IndustryOpportunityHypothesesArtifact["hypotheses"][number],
) {
  return [
    `### ${hypothesis.title}`,
    "",
    `- 状态：${hypothesis.status}`,
    `- 目标用户：${hypothesis.targetUser}`,
    `- 待解决问题：${hypothesis.problem}`,
    `- 假设：${hypothesis.hypothesisStatement}`,
    `- 事实基础：${hypothesis.supportingClaimIds.join("、")}`,
    "- 仍未知：",
    formatLines(hypothesis.unknowns),
    `- 验证方法：${hypothesis.validationPlan.method}`,
    `- 最小样本：${hypothesis.validationPlan.minimumSampleSize} 个参与者 session`,
    "- 成功标准：",
    formatLines(hypothesis.validationPlan.successCriteria),
    "- 失败标准：",
    formatLines(hypothesis.validationPlan.failureCriteria),
    `- 执行状态：${hypothesis.validationPlan.executionStatus}（执行前需要 ${hypothesis.validationPlan.permissionRequiredBeforeExecution}）`,
  ].join("\n");
}

function renderCoverage(entry: IndustryReportCoverageEntry) {
  return [
    `### ${entry.coverageRowId}`,
    "",
    `- 优先级：${entry.priority}`,
    `- 轴：${entry.axisType}`,
    `- 状态：${entry.status}`,
    `- 当前独立来源：${entry.independentSourceCount}/${entry.target.minIndependentSources}`,
    `- 当前来源角色：${entry.sourceRoles.length}/${entry.target.minSourceRoles}（${entry.sourceRoles.join("、") || "无"}）`,
    `- 代表性样本目标：${entry.target.minRepresentativeSamples}`,
    `- 缺口：${entry.gaps.join("、") || "无"}`,
  ].join("\n");
}

function renderReport(input: {
  category: string;
  facts: IndustryAtomicClaim[];
  hypotheses: IndustryOpportunityHypothesesArtifact["hypotheses"];
  coverage: IndustryGradedReportArtifact["coverage"];
  rejected: IndustryAtomicClaimsArtifact["excludedM2Documents"];
}) {
  return `${[
    `# ${input.category}行业研究报告（本地分级草案）`,
    "",
    "## 1. 阅读说明",
    "",
    "- 报告状态：等待 M3.4 人工抽查，不是发布版。",
    "- 已确认事实：只能复述逐字 quote 直接支持的内容。",
    "- 待验证假设：事实只说明假设的研究起点，不证明假设成立。",
    "- 决策边界：当前只能进入真实验证准备，不提供继续或终止项目判断。",
    "",
    "## 2. 数据与覆盖摘要",
    "",
    `- 已确认原子事实：${input.facts.length} 条`,
    `- 待验证机会假设：${input.hypotheses.length} 条`,
    `- Coverage：${input.coverage.passedRows}/${input.coverage.totalRows} 行通过，${input.coverage.gapRows} 行仍有缺口`,
    `- Critical coverage：${input.coverage.criticalRowsPassed}/${input.coverage.criticalRows} 行通过`,
    `- 被拒绝来源：${input.rejected.length} 份，不进入确认事实`,
    "",
    "## 3. 已确认原子事实",
    "",
    input.facts.map(renderConfirmedFact).join("\n\n"),
    "",
    "## 4. 待验证机会假设",
    "",
    input.hypotheses.map(renderHypothesis).join("\n\n"),
    "",
    "## 5. Coverage 与研究缺口",
    "",
    input.coverage.entries.map(renderCoverage).join("\n\n"),
    "",
    "## 6. 冲突、低质量与拒绝来源",
    "",
    ...input.rejected.map(
      (document) =>
        `- ${document.status}${document.binaryPayloadDetected ? " / binary_payload" : ""}：[${document.url}](${document.url})`,
    ),
    "",
    "## 7. 证据附录",
    "",
    ...input.facts.map(
      (claim) =>
        `- ${claim.claimId} → ${claim.rawDocumentId} → [source](${claim.sourceUrl}) → quote offsets ${claim.quoteStart}-${claim.quoteEnd}`,
    ),
    "",
    "## 8. 下一步",
    "",
    "- M3.4：人工抽查关键 claim、引用边界、移动端可读性和回归门禁。",
    "- 未获得 L5 前，所有假设验证保持 not_started，不联系真实用户。",
    "- 后续新增证据应优先补 7 个 coverage gaps，而不是把未知项改写成结论。",
  ].join("\n")}\n`;
}

export function createIndustryGradedReport(input: {
  runId: string;
  category: string;
  atomicClaims: IndustryAtomicClaimsArtifact;
  hypotheses: IndustryOpportunityHypothesesArtifact;
  m2Verification: IndustryM2WaveVerification;
  taskPlan: IndustryAcquisitionTaskPlan;
}): IndustryGradedReportArtifact {
  if (!input.runId.trim() || !input.category.trim()) {
    throw new Error("industry_graded_report_identity_required");
  }
  if (
    input.atomicClaims.claims.some(
      (claim) =>
        claim.status !== "confirmed_atomic_fact" ||
        !claim.quote.trim() ||
        !claim.rawDocumentId.trim(),
    )
  ) {
    throw new Error("industry_graded_report_fact_trace_invalid");
  }
  if (
    input.hypotheses.hypotheses.some(
      (hypothesis) =>
        hypothesis.status !== "unverified_opportunity_hypothesis" ||
        hypothesis.commercializationAssessment !== "not_evaluated" ||
        hypothesis.validationPlan.executionStatus !== "not_started",
    )
  ) {
    throw new Error("industry_graded_report_hypothesis_boundary_invalid");
  }
  if (
    input.hypotheses.decisionGuidance.researchReadiness !==
      "validation_ready" ||
    input.hypotheses.decisionGuidance.commercializationAssessment !==
      "requires_real_world_validation" ||
    input.hypotheses.summary.validationExecutionsCompleted !== 0
  ) {
    throw new Error("industry_graded_report_decision_boundary_invalid");
  }
  const coverageEntries = input.m2Verification.coverageRows.map((row) => {
    const task = input.taskPlan.tasks.find(
      (item) => item.taskId === row.taskId,
    );
    if (!task)
      throw new Error(`industry_graded_report_task_missing:${row.taskId}`);
    return {
      taskId: row.taskId,
      coverageRowId: task.coverageRowId,
      axisType: task.axisType,
      priority: task.priority,
      status: row.status,
      independentSourceCount: row.independentSourceCount,
      sourceRoles: row.sourceRoles,
      target: task.targetCoverage,
      gaps: row.gaps,
    } satisfies IndustryReportCoverageEntry;
  });
  const criticalEntries = coverageEntries.filter(
    (entry) => entry.priority === "critical",
  );
  const coverage = {
    entries: coverageEntries,
    totalRows: coverageEntries.length,
    passedRows: coverageEntries.filter(
      (entry) => entry.status === "raw_candidate_target_met_not_evidence",
    ).length,
    gapRows: coverageEntries.filter(
      (entry) => entry.status === "raw_candidate_gap",
    ).length,
    criticalRows: criticalEntries.length,
    criticalRowsPassed: criticalEntries.filter(
      (entry) => entry.status === "raw_candidate_target_met_not_evidence",
    ).length,
  };
  const reportMarkdown = renderReport({
    category: input.category,
    facts: input.atomicClaims.claims,
    hypotheses: input.hypotheses.hypotheses,
    coverage,
    rejected: input.atomicClaims.excludedM2Documents,
  });
  if (
    /(?:停止商业化|终止商业化|建议进入|建议退出|应当进入|应当停止|商业化结论：)/.test(
      reportMarkdown,
    )
  ) {
    throw new Error(
      "industry_graded_report_commercialization_conclusion_forbidden",
    );
  }
  return {
    schemaVersion: industryGradedReportSchemaVersion,
    artifactType: "industry-graded-report",
    runId: input.runId,
    category: input.category,
    status: "draft_pending_m3_4_review",
    evidenceGrade: "source_traceable_with_known_coverage_gaps",
    confirmedFacts: input.atomicClaims.claims,
    unverifiedHypotheses: input.hypotheses.hypotheses,
    coverage,
    rejectedSources: input.atomicClaims.excludedM2Documents,
    decisionBoundary: {
      researchReadiness: "validation_ready",
      commercializationAssessment: "requires_real_world_validation",
      validationExecutionsCompleted: 0,
      conclusion: "no_project_go_or_stop_decision",
    },
    reportMarkdown,
    assertions: {
      confirmedFactsAndHypothesesSeparated: true,
      everyConfirmedFactHasExactQuoteTrace: true,
      allHypothesesRemainUnverified: true,
      allCoverageGapsVisible: true,
      rejectedSourcesNotUsedAsFacts: true,
      evidenceAppendixComplete: true,
      commercializationDecisionProduced: false,
      llmRequests: 0,
      productionWrite: false,
    },
  };
}

export function serializeIndustryGradedReport(
  artifact: IndustryGradedReportArtifact,
) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
