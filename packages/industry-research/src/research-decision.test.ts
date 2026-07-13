import { describe, expect, it } from "vitest";
import { createResearchDecisionGuidance } from "./research-decision";

describe("research decision guidance", () => {
  it("treats missing evidence as a research gap instead of a stop decision", () => {
    const guidance = createResearchDecisionGuidance({
      evidenceMode: "verified_external_evidence",
      acceptedEvidenceCount: 0,
      confirmedFindingCount: 0,
      actionableHypothesisCount: 0,
      technicalFailureCount: 0,
      coverageGapCount: 3,
    });

    expect(guidance).toMatchObject({
      researchReadiness: "evidence_gap",
      commercializationAssessment: "not_evaluated",
    });
    expect(guidance.summary).toContain("不能据此判断项目应停止");
  });

  it("routes supported opportunities to real-world validation", () => {
    const guidance = createResearchDecisionGuidance({
      evidenceMode: "verified_external_evidence",
      acceptedEvidenceCount: 5,
      confirmedFindingCount: 2,
      actionableHypothesisCount: 1,
      technicalFailureCount: 0,
      coverageGapCount: 0,
    });

    expect(guidance).toMatchObject({
      researchReadiness: "validation_ready",
      commercializationAssessment: "requires_real_world_validation",
    });
    expect(guidance.nextActions[0]).toContain("付费意愿");
  });
});
