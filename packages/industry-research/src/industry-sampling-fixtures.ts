import type { IndustryPlan } from "./industry-planner";
import type { IndustrySamplingCandidateInput } from "./industry-sampling";
import {
  createIndustrySourceCandidatePlan,
  type IndustrySourceCandidateInput,
} from "./industry-source-candidates";

const publicAccess: IndustrySourceCandidateInput["access"] = {
  loginRequired: false,
  cookieRequired: false,
  apiKeyRequired: false,
  creditsRequired: false,
  paywallExpected: false,
  captchaExpected: false,
  privateDataExpected: false,
};

function source(
  name: string,
  sourceRole: IndustrySourceCandidateInput["sourceRole"],
  index: number,
): IndustrySourceCandidateInput {
  return {
    name,
    url: `https://g5-source-${index}.example/public`,
    sourceRole,
    discoveryMethod: "manual_public_seed",
    priority: "medium",
    estimatedPublicRequests: 0,
    access: { ...publicAccess },
    notes: ["G5 contract fixture only; not a real organization or evidence."],
  };
}

export const skincareSamplingSourceFixture: IndustrySourceCandidateInput[] = [
  source("Contract Brand A", "brand_official_site", 1),
  source("Contract Brand B", "brand_official_site", 2),
  source("Contract Brand C", "brand_official_site", 3),
  source("Contract Retailer", "trusted_retail_channel", 4),
  source("Contract OEM", "supply_chain_company", 5),
  source("Contract Service Analogy", "company_material", 6),
  source("Contract Finance", "financial_report", 7),
  source("Contract Research", "credible_research_institution", 8),
  source("Contract Regulator", "regulator", 9),
];

function emptyAssignments() {
  return {
    taxonomyIds: [],
    valueChainIds: [],
    priceTierIds: [],
    channelIds: [],
    consumerNeedIds: [],
    businessModelIds: [],
  };
}

export function createSkincareSamplingContractFixture(
  industryPlan: IndustryPlan,
) {
  const sourceCandidatePlan = createIndustrySourceCandidatePlan({
    industryPlan,
    candidateInputs: structuredClone(skincareSamplingSourceFixture),
  });
  const sourceId = (name: string) => {
    const candidate = sourceCandidatePlan.candidates.find(
      (item) => item.name === name,
    );
    if (!candidate) throw new Error(`g5_fixture_source_missing:${name}`);
    return candidate.id;
  };
  const taxonomy = industryPlan.taxonomy.map((item) => item.id);
  const valueChain = industryPlan.valueChain.map((item) => item.id);
  const price = industryPlan.priceTiers.map((item) => item.id);
  const channel = industryPlan.channels.map((item) => item.id);
  const need = industryPlan.consumerNeeds.map((item) => item.id);
  const business = industryPlan.businessModels.map((item) => item.id);
  const validated = {
    validationStatus: "validated_for_sampling" as const,
    validationBasis: [
      "G5 contract fixture: entity, source role and axis binding reviewed.",
    ],
  };
  const samplingCandidates: IndustrySamplingCandidateInput[] = [
    {
      entityId: "contract-brand-a",
      name: "Contract Brand A",
      sampleType: "organization",
      relationshipToIndustry: "direct_competitor",
      sourceCandidateIds: [sourceId("Contract Brand A")],
      ...validated,
      searchRank: 9,
      populationSegments: ["adult-general"],
      axisAssignments: {
        ...emptyAssignments(),
        taxonomyIds: taxonomy.slice(0, 3),
        priceTierIds: price.slice(0, 1),
        channelIds: channel.slice(0, 1),
        consumerNeedIds: need.slice(0, 2),
        businessModelIds: business.slice(0, 1),
      },
      selectionRationale:
        "覆盖低位单位价、品牌直营、成人基础功效和前三个 taxonomy 维度。",
    },
    {
      entityId: "contract-brand-b",
      name: "Contract Brand B",
      sampleType: "organization",
      relationshipToIndustry: "direct_competitor",
      sourceCandidateIds: [sourceId("Contract Brand B")],
      ...validated,
      searchRank: 1,
      populationSegments: ["sensitive-skin"],
      axisAssignments: {
        ...emptyAssignments(),
        taxonomyIds: [taxonomy[0], taxonomy[3]].filter(Boolean) as string[],
        priceTierIds: price.slice(1, 2),
        channelIds: channel.slice(1, 2),
        consumerNeedIds: need.slice(1, 3),
        businessModelIds: business.slice(0, 1),
      },
      selectionRationale:
        "覆盖中位单位价、第三方电商、敏感人群和使用人群 taxonomy。",
    },
    {
      entityId: "contract-brand-c",
      name: "Contract Brand C",
      sampleType: "organization",
      relationshipToIndustry: "direct_competitor",
      sourceCandidateIds: [sourceId("Contract Brand C")],
      ...validated,
      searchRank: 5,
      populationSegments: ["children"],
      axisAssignments: {
        ...emptyAssignments(),
        taxonomyIds: taxonomy.slice(2, 5),
        priceTierIds: price.slice(2, 3),
        channelIds: channel.slice(2, 3),
        consumerNeedIds: need.slice(2, 4),
        businessModelIds: business.slice(0, 1),
      },
      selectionRationale:
        "覆盖高位单位价、专业零售、儿童人群和剩余 taxonomy 维度。",
    },
    {
      entityId: "contract-retailer",
      name: "Contract Retailer",
      sampleType: "channel",
      relationshipToIndustry: "channel_actor",
      sourceCandidateIds: [sourceId("Contract Retailer")],
      ...validated,
      searchRank: null,
      populationSegments: [],
      axisAssignments: {
        ...emptyAssignments(),
        valueChainIds: valueChain.slice(3, 4),
        channelIds: channel.slice(3, 4),
        businessModelIds: business.slice(2, 3),
      },
      selectionRationale: "覆盖综合线下零售和零售/平台商业模式。",
    },
    {
      entityId: "contract-oem",
      name: "Contract OEM",
      sampleType: "organization",
      relationshipToIndustry: "supply_chain_actor",
      sourceCandidateIds: [sourceId("Contract OEM")],
      ...validated,
      searchRank: null,
      populationSegments: [],
      axisAssignments: {
        ...emptyAssignments(),
        valueChainIds: valueChain.slice(0, 3),
        businessModelIds: business.slice(1, 2),
      },
      selectionRationale: "覆盖原料/研发/生产链和 OEM/ODM 商业模式。",
    },
    {
      entityId: "contract-service-analogy",
      name: "Contract Service Analogy",
      sampleType: "business_model_analogy",
      relationshipToIndustry: "business_model_analogy",
      sourceCandidateIds: [sourceId("Contract Service Analogy")],
      ...validated,
      searchRank: null,
      populationSegments: [],
      axisAssignments: {
        ...emptyAssignments(),
        businessModelIds: business.slice(3, 4),
      },
      selectionRationale:
        "只用于覆盖专业服务/内容商业模式，不计为护肤品竞争者。",
    },
  ];
  return { sourceCandidatePlan, samplingCandidates };
}
