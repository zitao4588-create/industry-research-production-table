export const researchDecisionGuidanceSchemaVersion =
  "research_decision_guidance.v1" as const;

export type ResearchReadiness =
  | "contract_only"
  | "technical_blocked"
  | "evidence_gap"
  | "ready_for_human_review"
  | "validation_ready";

export type CommercializationAssessment =
  | "not_evaluated"
  | "requires_real_world_validation";

export type ResearchDecisionGuidance = {
  schemaVersion: typeof researchDecisionGuidanceSchemaVersion;
  researchReadiness: ResearchReadiness;
  commercializationAssessment: CommercializationAssessment;
  summary: string;
  reasons: string[];
  nextActions: string[];
};

export function createResearchDecisionGuidance(input: {
  evidenceMode: "contract_only" | "verified_external_evidence";
  acceptedEvidenceCount: number;
  confirmedFindingCount: number;
  actionableHypothesisCount: number;
  technicalFailureCount: number;
  coverageGapCount: number;
}): ResearchDecisionGuidance {
  if (input.evidenceMode === "contract_only") {
    return {
      schemaVersion: researchDecisionGuidanceSchemaVersion,
      researchReadiness: "contract_only",
      commercializationAssessment: "not_evaluated",
      summary: "当前产物只验证报告契约，不能判断行业机会或商业去留。",
      reasons: ["没有进入报告基础的真实外部证据。"],
      nextActions: ["接入真实、授权且可追溯的来源后重新生成报告。"],
    };
  }

  if (input.technicalFailureCount > 0 && input.acceptedEvidenceCount === 0) {
    return {
      schemaVersion: researchDecisionGuidanceSchemaVersion,
      researchReadiness: "technical_blocked",
      commercializationAssessment: "not_evaluated",
      summary: "本轮研究链路受技术问题阻塞；这不是市场或商业模式的否定结论。",
      reasons: [
        `技术失败 ${input.technicalFailureCount} 项。`,
        "没有可进入报告基础的证据。",
      ],
      nextActions: [
        "先修复采集、超时或 provider 问题，再复用本轮已有产物补跑。",
      ],
    };
  }

  if (input.acceptedEvidenceCount === 0 || input.confirmedFindingCount === 0) {
    return {
      schemaVersion: researchDecisionGuidanceSchemaVersion,
      researchReadiness: "evidence_gap",
      commercializationAssessment: "not_evaluated",
      summary: "本轮证据不足以形成已确认结论，但不能据此判断项目应停止。",
      reasons: [
        `可用证据 ${input.acceptedEvidenceCount} 条。`,
        `已确认结论 ${input.confirmedFindingCount} 条。`,
        ...(input.coverageGapCount > 0
          ? [`仍有 ${input.coverageGapCount} 项覆盖或质量缺口。`]
          : []),
      ],
      nextActions: [
        "优先补齐来源、quote 与 claim 绑定，再由人工复核候选发现。",
      ],
    };
  }

  if (input.actionableHypothesisCount > 0) {
    return {
      schemaVersion: researchDecisionGuidanceSchemaVersion,
      researchReadiness: "validation_ready",
      commercializationAssessment: "requires_real_world_validation",
      summary:
        "已有证据支持形成机会假设，下一步应做小规模真实验证，而不是自动宣布继续或停止。",
      reasons: [
        `已确认结论 ${input.confirmedFindingCount} 条。`,
        `可行动机会假设 ${input.actionableHypothesisCount} 条。`,
      ],
      nextActions: [
        "选择一个机会假设，验证真实用户问题、付费意愿、获客方式和交付成本。",
      ],
    };
  }

  return {
    schemaVersion: researchDecisionGuidanceSchemaVersion,
    researchReadiness: "ready_for_human_review",
    commercializationAssessment: "not_evaluated",
    summary: "已有可复核结论，但尚未形成可进入真实验证的机会假设。",
    reasons: [`已确认结论 ${input.confirmedFindingCount} 条。`],
    nextActions: [
      "由人工把已确认结论转成有明确对象、场景和验证方法的机会假设。",
    ],
  };
}

export function renderResearchDecisionGuidance(
  guidance: ResearchDecisionGuidance,
) {
  return [
    `- 研究就绪度：${guidance.researchReadiness}`,
    `- 商业化判断：${guidance.commercializationAssessment}`,
    `- 解释：${guidance.summary}`,
    `- 依据：${guidance.reasons.join("；")}`,
    `- 下一步：${guidance.nextActions.join("；")}`,
    "- 边界：研究证据质量只能决定报告如何使用，不能替代真实用户与经营验证。",
  ].join("\n");
}
