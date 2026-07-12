import {
  createIndustryPlan,
  type IndustryPlanSourceRole,
  type IndustryResearchModule,
} from "./industry-planner";
import { skincareIndustryPlanningFixture } from "./industry-planner-fixtures";
import { createIndustryRepresentativeSamplePlan } from "./industry-sampling";
import { createSkincareSamplingContractFixture } from "./industry-sampling-fixtures";
import type { Evidence, RawDocument, ResearchSource } from "./types";

const fixturePolicy: Record<
  IndustryResearchModule["id"],
  { sourceRoles: IndustryPlanSourceRole[]; statementPrefix: string }
> = {
  market_landscape: {
    sourceRoles: ["government_statistics", "industry_association"],
    statementPrefix: "市场资料显示",
  },
  regulation_and_standards: {
    sourceRoles: ["regulator"],
    statementPrefix: "监管原文规定",
  },
  consumer_demand: {
    sourceRoles: ["consumer_review", "public_community"],
    statementPrefix: "消费者评论与用户反馈显示",
  },
  ecommerce_competitor_research: {
    sourceRoles: ["brand_official_site", "trusted_retail_channel"],
    statementPrefix: "品牌与可信零售页面显示",
  },
  content_and_traffic: {
    sourceRoles: ["content_platform", "search_trend"],
    statementPrefix: "公开内容与搜索趋势指标显示",
  },
  business_model_and_supply_chain: {
    sourceRoles: ["financial_report", "supply_chain_company"],
    statementPrefix: "财报与供应链一手资料显示",
  },
};

function createSharedFixturePlans() {
  const industryPlan = createIndustryPlan(skincareIndustryPlanningFixture);
  const { sourceCandidatePlan, samplingCandidates } =
    createSkincareSamplingContractFixture(industryPlan);
  const representativeSamplePlan = createIndustryRepresentativeSamplePlan({
    industryPlan,
    sourceCandidatePlan,
    samplingCandidates,
  });
  const channels = industryPlan.channels.map((item) => item.id);
  representativeSamplePlan.selectedSamples.push(
    {
      id: "g7-contract-content-a",
      entityId: "g7-contract-content-a",
      name: "G7 Contract Content A",
      sampleType: "content_source",
      relationshipToIndustry: "content_actor",
      axisAssignments: {
        taxonomyIds: [],
        valueChainIds: [],
        priceTierIds: [],
        channelIds: channels.slice(0, 2),
        consumerNeedIds: [],
        businessModelIds: [],
      },
      selectionReason: "G7 content contract fixture only.",
      expectedSourceRoles: ["content_platform"],
      validationStatus: "validated",
      evidenceGaps: ["contract_only_not_external_evidence"],
      sourceCandidateIds: ["g7-contract-content-candidate-a"],
      populationSegments: [],
      coverageContributionKeys: channels
        .slice(0, 2)
        .map((id) => `channel:${id}`),
      selectionOrder: representativeSamplePlan.selectedSamples.length + 1,
    },
    {
      id: "g7-contract-content-b",
      entityId: "g7-contract-content-b",
      name: "G7 Contract Content B",
      sampleType: "content_source",
      relationshipToIndustry: "content_actor",
      axisAssignments: {
        taxonomyIds: [],
        valueChainIds: [],
        priceTierIds: [],
        channelIds: channels.slice(2),
        consumerNeedIds: [],
        businessModelIds: [],
      },
      selectionReason: "G7 content contract fixture only.",
      expectedSourceRoles: ["search_trend"],
      validationStatus: "validated",
      evidenceGaps: ["contract_only_not_external_evidence"],
      sourceCandidateIds: ["g7-contract-content-candidate-b"],
      populationSegments: [],
      coverageContributionKeys: channels.slice(2).map((id) => `channel:${id}`),
      selectionOrder: representativeSamplePlan.selectedSamples.length + 2,
    },
  );
  const valueChainIds = industryPlan.valueChain.map((item) => item.id);
  const businessModelIds = industryPlan.businessModels.map((item) => item.id);
  representativeSamplePlan.selectedSamples.push({
    id: "g7-contract-supply-b",
    entityId: "g7-contract-supply-b",
    name: "G7 Contract Supply B",
    sampleType: "organization",
    relationshipToIndustry: "supply_chain_actor",
    axisAssignments: {
      taxonomyIds: [],
      valueChainIds: [valueChainIds[0]].filter(Boolean) as string[],
      priceTierIds: [],
      channelIds: [],
      consumerNeedIds: [],
      businessModelIds: [businessModelIds[0]].filter(Boolean) as string[],
    },
    selectionReason: "G7 supply-chain contract fixture only.",
    expectedSourceRoles: ["supply_chain_company"],
    validationStatus: "validated",
    evidenceGaps: ["contract_only_not_external_evidence"],
    sourceCandidateIds: ["g7-contract-supply-candidate-b"],
    populationSegments: [],
    coverageContributionKeys: [
      valueChainIds[0] ? `value_chain:${valueChainIds[0]}` : "",
      businessModelIds[0] ? `business_model:${businessModelIds[0]}` : "",
    ].filter(Boolean),
    selectionOrder: representativeSamplePlan.selectedSamples.length + 1,
  });
  return { industryPlan, representativeSamplePlan };
}

export function createSkincareModuleContractFixture(
  moduleId: IndustryResearchModule["id"],
) {
  const { industryPlan, representativeSamplePlan } = createSharedFixturePlans();
  const policy = fixturePolicy[moduleId];
  const moduleRows = industryPlan.coverageMatrix.filter(
    (row) => row.moduleId === moduleId,
  );
  const statements = moduleRows.map(
    (row) =>
      `${policy.statementPrefix}${row.dimension} contract fixture 覆盖 ${row.axisItemIds.join("、")}`,
  );
  const sources: ResearchSource[] = policy.sourceRoles.map((role, index) => ({
    id: `${moduleId}-source-${index + 1}`,
    projectId: "g7-contract-fixture",
    type: "url",
    title: `Contract ${moduleId} source ${index + 1}`,
    value: `https://contract-${moduleId}-${index + 1}.example/data`,
    automationHint: "contract-only-no-network",
    industrySourceRole: role,
  }));
  const rawDocuments: RawDocument[] = sources.map((source, index) => ({
    id: `${moduleId}-raw-${index + 1}`,
    projectId: "g7-contract-fixture",
    sourceId: source.id,
    crawlRunId: "g7-contract-fixture",
    url: source.value,
    title: source.title,
    contentType: "html",
    excerpt: statements.join("。"),
    extractedText: statements.join("。"),
    databaseTargets: ["source_database"],
    sourceQuality: {
      sourceType: "official_site",
      sourceRelevance: "high",
      sourceConfidence: "high",
      needsReviewReason: "contract-only fixture",
      acceptedForReport: true,
    },
    industrySourceRole: source.industrySourceRole,
  }));
  const module = industryPlan.researchModules.find(
    (item) => item.id === moduleId,
  );
  if (!module) throw new Error(`contract_module_missing:${moduleId}`);
  const claimRole = module.targetClaimRoles[0];
  if (!claimRole) throw new Error(`contract_claim_role_missing:${moduleId}`);
  const allowedRelationships = {
    market_landscape: [],
    regulation_and_standards: [],
    consumer_demand: ["direct_competitor"],
    ecommerce_competitor_research: ["direct_competitor", "channel_actor"],
    content_and_traffic: ["content_actor"],
    business_model_and_supply_chain: [
      "supply_chain_actor",
      "channel_actor",
      "business_model_analogy",
    ],
  }[moduleId];
  const moduleSampleIds = representativeSamplePlan.selectedSamples
    .filter((sample) =>
      allowedRelationships.includes(sample.relationshipToIndustry as never),
    )
    .map((sample) => sample.id);
  const evidence: Evidence[] = statements.flatMap((statement, rowIndex) =>
    sources.map((source, sourceIndex) => ({
      id: `${moduleId}-evidence-${rowIndex + 1}-${sourceIndex + 1}`,
      projectId: "g7-contract-fixture",
      sourceId: source.id,
      rawDocumentId: rawDocuments[sourceIndex]?.id,
      quote: statement,
      note: `contract-only ${moduleId} evidence`,
      sourceRole: source.industrySourceRole,
      claimRole,
      validation: {
        quoteMatched: true,
        sourceAccepted: true,
        matchedRawDocumentId: rawDocuments[sourceIndex]?.id,
        claimSupportComplete: true,
        claimQuoteCount: 1,
        confirmedQuoteCount: 1,
        roleAuthorized: true,
        sourceRole: source.industrySourceRole,
        claimRole,
      },
    })),
  );
  const claimInputs = moduleRows.map((row, index) => ({
    claimId: `${moduleId}-claim-${index + 1}`,
    statement: statements[index] ?? "",
    claimRole,
    evidenceIds: sources.map(
      (_source, sourceIndex) =>
        `${moduleId}-evidence-${index + 1}-${sourceIndex + 1}`,
    ),
    axisItemIds: row.axisItemIds,
    representativeSampleIds: representativeSamplePlan.selectedSamples
      .filter(
        (sample) =>
          moduleSampleIds.includes(sample.id) &&
          Object.values(sample.axisAssignments)
            .flat()
            .some((id) => row.axisItemIds.includes(id)),
      )
      .map((sample) => sample.id),
  }));
  return {
    industryPlan,
    representativeSamplePlan,
    sources,
    rawDocuments,
    evidence,
    claimInputs,
  };
}
