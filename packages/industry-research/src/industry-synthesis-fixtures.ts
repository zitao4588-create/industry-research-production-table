import type { IndustrySynthesisClaimInput } from "./industry-synthesis";

export function createSkincareSynthesisContractClaims(): IndustrySynthesisClaimInput[] {
  return [
    {
      claimId: "synthesis:cross-module-inference",
      kind: "inference",
      statement: "市场结构与消费者信号之间存在待复核的跨模块关系。",
      supportingClaimIds: [
        "ledger:market_landscape-claim-1",
        "ledger:consumer_demand-claim-1",
      ],
      moduleIds: ["market_landscape", "consumer_demand"],
      counterEvidence: ["不同来源口径可能不可比。"],
      validationPlan: [],
      opportunity: false,
    },
    {
      claimId: "synthesis:opportunity-hypothesis",
      kind: "hypothesis",
      statement: "可测试一个跨渠道内容机会，但当前不能判断商业确定性。",
      supportingClaimIds: [
        "ledger:content_and_traffic-claim-1",
        "ledger:ecommerce_competitor_research-claim-3",
      ],
      moduleIds: ["content_and_traffic", "ecommerce_competitor_research"],
      counterEvidence: ["互动指标不能证明转化。"],
      validationPlan: ["补充独立渠道实验和转化口径后再判断。"],
      opportunity: true,
    },
  ];
}
