import { describe, expect, it } from "vitest";
import type { IndustryAtomicClaimsArtifact } from "./industry-atomic-claims";
import {
  createIndustryOpportunityHypothesesArtifact,
  type IndustryOpportunityHypothesisCandidate,
} from "./industry-opportunity-hypotheses";

const atomicClaims = {
  claims: [
    {
      claimId: "market-growth",
      statement: "2024年洗碗机零售量同比增长18.0%",
      claimRole: "market_size_growth",
      sourceRole: "industry_association",
      coverageRowId: "coverage-market-channels",
      rawDocumentId: "raw-market",
      sourceUrl: "https://example.com/market",
      quote: "2024年洗碗机零售量同比增长18.0%",
    },
  ],
  summary: {
    immutableRawDocumentCount: 1,
    confirmedAtomicClaimCount: 1,
  },
} as unknown as IndustryAtomicClaimsArtifact;

function candidate(
  overrides: Partial<IndustryOpportunityHypothesisCandidate> = {},
): IndustryOpportunityHypothesisCandidate {
  return {
    hypothesisId: "hypothesis-market-monitor",
    title: "待验证：洗碗机市场监测决策服务",
    hypothesisStatement:
      "如果持续呈现量额变化与来源边界，那么品类负责人可能更快识别需要追加研究的问题；该效果待验证。",
    targetUser: "中小厨电品牌的品类负责人",
    problem: "单一年份增长数字不能解释增长能否持续以及由什么因素驱动",
    supportingClaimIds: ["market-growth"],
    assumptions: ["品类负责人会定期做进入或资源配置判断"],
    unknowns: ["真实决策频率未知", "愿意采用的交付形式和价格未知"],
    validationPlan: {
      method: "半结构访谈加静态报告原型任务",
      participantProfile: "近12个月参与过厨电品类规划的负责人",
      minimumSampleSize: 5,
      steps: ["展示当前报告", "要求完成一次信息判断", "记录疑问和下一步动作"],
      successCriteria: ["至少4/5人能指出一个可执行的下一步研究问题"],
      failureCriteria: ["不超过2/5人能完成任务，或至少4/5人认为信息无决策用途"],
      stopConditions: ["连续3人认为目标任务不真实时停止并重写问题"],
      permissionRequiredBeforeExecution: "L5",
      executionStatus: "not_started",
    },
    ...overrides,
  };
}

describe("industry opportunity hypotheses", () => {
  it("creates an explicitly unverified, fact-bound and measurable hypothesis", () => {
    const artifact = createIndustryOpportunityHypothesesArtifact({
      runId: "hypothesis-test",
      category: "洗碗机",
      atomicClaims,
      candidates: [candidate()],
      unresolvedCoverageGapCount: 7,
    });

    expect(artifact.summary).toMatchObject({
      unverifiedHypothesisCount: 1,
      validationExecutionsCompleted: 0,
    });
    expect(artifact.hypotheses[0]).toMatchObject({
      status: "unverified_opportunity_hypothesis",
      commercializationAssessment: "not_evaluated",
      supportingClaimIds: ["market-growth"],
    });
    expect(artifact.decisionGuidance).toMatchObject({
      researchReadiness: "validation_ready",
      commercializationAssessment: "requires_real_world_validation",
    });
  });

  it("rejects certainty, commercialization conclusions, missing facts and weak validation", () => {
    const artifact = createIndustryOpportunityHypothesesArtifact({
      runId: "hypothesis-rejection-test",
      category: "洗碗机",
      atomicClaims,
      candidates: [
        candidate({
          title: "已确认的巨大机会",
          hypothesisStatement: "市场已经证明应该推出产品并停止商业化。",
          supportingClaimIds: ["missing-claim"],
          unknowns: [],
          validationPlan: {
            ...candidate().validationPlan,
            minimumSampleSize: 1,
            successCriteria: [],
            failureCriteria: [],
          },
        }),
      ],
      unresolvedCoverageGapCount: 7,
    });

    expect(artifact.hypotheses).toHaveLength(0);
    expect(artifact.rejectedCandidates[0]?.failures).toEqual(
      expect.arrayContaining([
        "hypothesis_title_must_be_explicitly_unverified",
        "hypothesis_uncertainty_language_required",
        "commercialization_or_certainty_conclusion_forbidden",
        "supporting_atomic_claim_missing:missing-claim",
        "at_least_two_unknowns_required",
        "validation_minimum_sample_size_below_3",
        "validation_success_criteria_required",
        "validation_failure_criteria_required",
      ]),
    );
  });
});
