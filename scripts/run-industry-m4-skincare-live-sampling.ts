import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  canonicalizeIndustryRawDocumentUrl,
  createIndustryPlan,
  createIndustryRepresentativeSamplePlan,
  createIndustrySourceCandidatePlan,
  type IndustryAcquisitionRoute,
  type IndustryM2WaveRawDocumentInput,
  type IndustryM2WaveVerification,
  type IndustrySamplingCandidateInput,
  type IndustrySourceCandidateInput,
  serializeIndustryRepresentativeSamplePlan,
  skincareIndustryPlanningFixture,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function writeTextAtomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

const inputRunDir = resolve(
  argumentValue("input-run") ??
    (() => {
      throw new Error("m4_2_sampling_input_run_required");
    })(),
);
const outputDir = resolve(
  argumentValue("output") ?? join(inputRunDir, "sampling"),
);
const [rawDocuments, routes, verification] = await Promise.all([
  readFile(join(inputRunDir, "raw_documents.json"), "utf8").then(
    (value) => JSON.parse(value) as IndustryM2WaveRawDocumentInput[],
  ),
  readFile(join(inputRunDir, "routes.json"), "utf8").then(
    (value) => JSON.parse(value) as IndustryAcquisitionRoute[],
  ),
  readFile(join(inputRunDir, "verification.json"), "utf8").then(
    (value) => JSON.parse(value) as IndustryM2WaveVerification,
  ),
]);
const industryPlan = createIndustryPlan(
  structuredClone(skincareIndustryPlanningFixture),
);
const publicRecovery = process.argv.includes("--public-recovery");
const sourceUrls = {
  about: "https://www.proya.com/about/page.html",
  lowerProduct: "https://www.proya.com/product_detail-pId-713.html",
  middleProduct: "https://www.proya.com/product_detail-pId-738.html",
  upperProduct: "https://www.proya.com/product_detail-pId-701.html",
  jdProduct: "https://item.jd.com/10096241359618",
  bloomageSupplyChain: "https://www.bloomagebiotech.com/news-detail110.html",
  proyaAnnualReport:
    "https://www.proya-group.com/local_upload/20250428/1916677184807374848.pdf",
  bettaniAnnualReport:
    "https://static.cninfo.com.cn/finalpage/2025-04-25/1223273022.PDF",
  oceanEngineBeautyTrend:
    "https://www.oceanengine.com/blog/meizhuang-hangye-baogao.html",
  newrankBeautyTrend: "https://www.newrank.cn/report/detail/393",
} as const;
const requiredSources: string[] = [
  sourceUrls.about,
  sourceUrls.lowerProduct,
  sourceUrls.middleProduct,
  sourceUrls.upperProduct,
  sourceUrls.jdProduct,
  sourceUrls.bloomageSupplyChain,
  ...(publicRecovery
    ? [
        sourceUrls.proyaAnnualReport,
        sourceUrls.bettaniAnnualReport,
        sourceUrls.oceanEngineBeautyTrend,
        sourceUrls.newrankBeautyTrend,
      ]
    : []),
];
const relevantUrls = new Set(
  verification.documentAudit
    .filter(
      (document) => document.status === "raw_candidate_relevant_not_evidence",
    )
    .map((document) => canonicalizeIndustryRawDocumentUrl(document.url)),
);
const routeByUrl = new Map(
  routes.map((route) => [
    canonicalizeIndustryRawDocumentUrl(route.targetReference),
    route,
  ]),
);
const rawByUrl = new Map(
  rawDocuments.map((document) => [
    canonicalizeIndustryRawDocumentUrl(document.url),
    document,
  ]),
);
for (const url of requiredSources) {
  const canonical = canonicalizeIndustryRawDocumentUrl(url);
  const raw = rawByUrl.get(canonical);
  if (
    !canonical ||
    !relevantUrls.has(canonical) ||
    !raw?.sourceQuality.acceptedForReport
  ) {
    throw new Error(`m4_2_sampling_required_source_not_validated:${url}`);
  }
}
const publicAccess: IndustrySourceCandidateInput["access"] = {
  loginRequired: false,
  cookieRequired: false,
  apiKeyRequired: false,
  creditsRequired: false,
  paywallExpected: false,
  captchaExpected: false,
  privateDataExpected: false,
};
const sourceInputs = requiredSources.map((url) => {
  const canonical = canonicalizeIndustryRawDocumentUrl(url);
  const route = routeByUrl.get(canonical);
  if (!route) throw new Error(`m4_2_sampling_route_missing:${url}`);
  return {
    name: rawByUrl.get(canonical)?.title ?? url,
    url,
    sourceRole: route.sourceRole,
    discoveryMethod: "manual_public_seed" as const,
    priority: "high" as const,
    estimatedPublicRequests: 0,
    access: { ...publicAccess },
    notes: [
      "M4.2 live raw candidate passed source quality and strong skincare relevance gates.",
    ],
  };
});
const sourceCandidatePlan = createIndustrySourceCandidatePlan({
  industryPlan,
  candidateInputs: sourceInputs,
  budgetPolicy: {
    maxEligibleCandidates: 12,
    maxPlannedPublicRequests: 0,
    maxCandidatesPerSourceRole: 8,
    maxCandidatesPerHostname: 8,
    maxBrandControlledShare: 0.8,
  },
});
const sourceId = (url: string) => {
  const canonical = new URL(url);
  canonical.hash = "";
  if (canonical.pathname !== "/")
    canonical.pathname = canonical.pathname.replace(/\/+$/, "");
  const candidate = sourceCandidatePlan.candidates.find(
    (item) => item.canonicalUrl === canonical.toString(),
  );
  if (candidate?.status !== "eligible_candidate") {
    throw new Error(`m4_2_sampling_source_candidate_missing:${url}`);
  }
  return candidate.id;
};
const taxonomyIds = industryPlan.taxonomy.map((item) => item.id);
const valueChainIds = industryPlan.valueChain.map((item) => item.id);
const priceTierIds = industryPlan.priceTiers.map((item) => item.id);
const channelIds = industryPlan.channels.map((item) => item.id);
const contentChannelIds =
  industryPlan.coverageMatrix.find(
    (row) => row.id === "coverage-content-channels",
  )?.axisItemIds ?? [];
if (contentChannelIds.length !== 4) {
  throw new Error("m4_2_sampling_content_channel_axes_missing");
}
const consumerNeedIds = industryPlan.consumerNeeds.map((item) => item.id);
const businessModelIds = industryPlan.businessModels.map((item) => item.id);
const emptyAssignments = () => ({
  taxonomyIds: [] as string[],
  valueChainIds: [] as string[],
  priceTierIds: [] as string[],
  channelIds: [] as string[],
  consumerNeedIds: [] as string[],
  businessModelIds: [] as string[],
});
const aboutSource = sourceId(sourceUrls.about);
const proyaAnnualReportSource = publicRecovery
  ? sourceId(sourceUrls.proyaAnnualReport)
  : null;
const samplingCandidates: IndustrySamplingCandidateInput[] = [
  {
    entityId: "proya-cream-713-observed-lower",
    name: "珀莱雅紧致肌密精华霜 ¥178",
    sampleType: "product_or_service",
    relationshipToIndustry: "direct_competitor",
    sourceCandidateIds: [
      sourceId(sourceUrls.lowerProduct),
      aboutSource,
      ...(proyaAnnualReportSource ? [proyaAnnualReportSource] : []),
    ],
    validationStatus: "validated_for_sampling",
    validationBasis: [
      "Official product page states product form, efficacy context and observed price CNY 178.",
      "Official brand page states daily-chemical, supermarket and ecommerce channel coverage.",
      ...(publicRecovery
        ? [
            "Public annual report supports the listed company's manufacturing and brand-channel operating chain.",
          ]
        : []),
    ],
    searchRank: null,
    populationSegments: ["adult-general"],
    axisAssignments: {
      ...emptyAssignments(),
      taxonomyIds,
      valueChainIds: publicRecovery ? valueChainIds.slice(2, 4) : [],
      priceTierIds: priceTierIds.slice(0, 1),
      channelIds: publicRecovery
        ? [...channelIds.slice(0, 1), ...channelIds.slice(2, 3)]
        : channelIds.slice(0, 1),
      consumerNeedIds: consumerNeedIds.slice(0, 2),
      businessModelIds: businessModelIds.slice(0, 1),
    },
    selectionRationale:
      "Observed lower price among the three comparable official PROYA cream pages.",
  },
  {
    entityId: "proya-cream-738-observed-middle",
    name: "珀莱雅焕能修护保湿精华霜 ¥220",
    sampleType: "product_or_service",
    relationshipToIndustry: "direct_competitor",
    sourceCandidateIds: [sourceId(sourceUrls.middleProduct), aboutSource],
    validationStatus: "validated_for_sampling",
    validationBasis: [
      "Official product page states repair/moisturizing cream and observed price CNY 220.",
      "Official brand page states ecommerce channel coverage.",
    ],
    searchRank: null,
    populationSegments: ["sensitive-skin"],
    axisAssignments: {
      ...emptyAssignments(),
      taxonomyIds,
      priceTierIds: priceTierIds.slice(1, 2),
      channelIds: channelIds.slice(1, 2),
      consumerNeedIds: consumerNeedIds.slice(1, 3),
      businessModelIds: businessModelIds.slice(0, 1),
    },
    selectionRationale:
      "Observed middle price among the three comparable official PROYA cream pages.",
  },
  {
    entityId: "proya-cream-701-observed-upper",
    name: "珀莱雅肌源修护优效精华霜 ¥300",
    sampleType: "product_or_service",
    relationshipToIndustry: "direct_competitor",
    sourceCandidateIds: [sourceId(sourceUrls.upperProduct), aboutSource],
    validationStatus: "validated_for_sampling",
    validationBasis: [
      "Official product page states repair/moisturizing/soothing cream, 50G and observed price CNY 300.",
      "Official brand page states supermarket and offline daily-chemical channel coverage.",
    ],
    searchRank: null,
    populationSegments: ["adult-general", "sensitive-skin"],
    axisAssignments: {
      ...emptyAssignments(),
      taxonomyIds,
      priceTierIds: priceTierIds.slice(2, 3),
      channelIds: channelIds.slice(3, 4),
      consumerNeedIds: consumerNeedIds.slice(2, 4),
      businessModelIds: businessModelIds.slice(0, 1),
    },
    selectionRationale:
      "Observed upper price among the three comparable official PROYA cream pages.",
  },
  {
    entityId: "jd-skincare-channel",
    name: "京东美妆护肤第三方零售端点",
    sampleType: "channel",
    relationshipToIndustry: "channel_actor",
    sourceCandidateIds: [sourceId(sourceUrls.jdProduct)],
    validationStatus: "validated_for_sampling",
    validationBasis: [
      "Public JD page exposes the beauty/personal-care retail channel and skincare navigation.",
    ],
    searchRank: null,
    populationSegments: [],
    axisAssignments: {
      ...emptyAssignments(),
      valueChainIds: valueChainIds.slice(3, 4),
      channelIds: channelIds.slice(1, 2),
      businessModelIds: businessModelIds.slice(2, 3),
    },
    selectionRationale:
      "Adds a third-party ecommerce channel and retail-platform business model.",
  },
  {
    entityId: "bloomage-full-chain-actor",
    name: "华熙生物原料与全产业链参与者",
    sampleType: "organization",
    relationshipToIndustry: "supply_chain_actor",
    sourceCandidateIds: [sourceId(sourceUrls.bloomageSupplyChain)],
    validationStatus: "validated_for_sampling",
    validationBasis: [
      "Official company page describes raw material technology and a full-chain layout spanning research to skincare applications.",
    ],
    searchRank: null,
    populationSegments: [],
    axisAssignments: {
      ...emptyAssignments(),
      valueChainIds: valueChainIds.slice(0, 3),
      businessModelIds: businessModelIds.slice(1, 2),
    },
    selectionRationale:
      "Adds upstream materials, R&D, production and supply-chain service coverage.",
  },
  ...(publicRecovery
    ? ([
        {
          entityId: "bettani-listed-company-chain-actor",
          name: "贝泰妮注册生产与品牌渠道参与者",
          sampleType: "organization",
          relationshipToIndustry: "supply_chain_actor",
          sourceCandidateIds: [sourceId(sourceUrls.bettaniAnnualReport)],
          validationStatus: "validated_for_sampling",
          validationBasis: [
            "Public listed-company annual report describes cosmetics production, registration ownership, online coverage and offline pharmaceutical channels.",
          ],
          searchRank: null,
          populationSegments: [],
          axisAssignments: {
            ...emptyAssignments(),
            valueChainIds: valueChainIds.slice(2, 4),
            businessModelIds: businessModelIds.slice(0, 1),
          },
          selectionRationale:
            "Adds a second independently disclosed supply-chain participant and brand operating model.",
        },
        {
          entityId: "proya-listed-company-chain-actor",
          name: "珀莱雅生产研发与品牌渠道参与者",
          sampleType: "organization",
          relationshipToIndustry: "supply_chain_actor",
          sourceCandidateIds: [sourceId(sourceUrls.proyaAnnualReport)],
          validationStatus: "validated_for_sampling",
          validationBasis: [
            "Public listed-company annual report describes self-production, OEM supplementation, research collaboration, direct sales, distribution and offline dealership channels.",
          ],
          searchRank: null,
          populationSegments: [],
          axisAssignments: {
            ...emptyAssignments(),
            valueChainIds: valueChainIds.slice(2, 4),
            businessModelIds: businessModelIds.slice(0, 2),
          },
          selectionRationale:
            "Adds a third public-report-backed participant required for supply-chain module sampling.",
        },
        {
          entityId: "douyin-beauty-content-ecosystem",
          name: "抖音美妆内容与电商生态",
          sampleType: "content_source",
          relationshipToIndustry: "content_actor",
          sourceCandidateIds: [sourceId(sourceUrls.oceanEngineBeautyTrend)],
          validationStatus: "validated_for_sampling",
          validationBasis: [
            "Public platform report describes beauty content supply, active search, creators, brand accounts and Douyin ecommerce.",
          ],
          searchRank: null,
          populationSegments: [],
          axisAssignments: {
            ...emptyAssignments(),
            channelIds: contentChannelIds,
          },
          selectionRationale:
            "Adds a platform-owned public content actor for brand content and content-commerce coverage.",
        },
        {
          entityId: "xiaohongshu-beauty-content-ecosystem",
          name: "小红书美妆内容生态公开样本",
          sampleType: "content_source",
          relationshipToIndustry: "content_actor",
          sourceCandidateIds: [sourceId(sourceUrls.newrankBeautyTrend)],
          validationStatus: "validated_for_sampling",
          validationBasis: [
            "Public creator-data report states its date range, sample size, user-generated content scope and interaction metrics.",
          ],
          searchRank: null,
          populationSegments: [],
          axisAssignments: {
            ...emptyAssignments(),
            channelIds: [
              ...contentChannelIds.slice(0, 1),
              ...contentChannelIds.slice(2, 3),
            ],
          },
          selectionRationale:
            "Adds a second independently measured public content actor without treating interaction as conversion.",
        },
      ] satisfies IndustrySamplingCandidateInput[])
    : []),
];
const representativeSamplePlan = createIndustryRepresentativeSamplePlan({
  industryPlan,
  sourceCandidatePlan,
  samplingCandidates,
  minPopulationSegments: 2,
  requiredRelationshipMinimums: publicRecovery
    ? { content_actor: 2, supply_chain_actor: 3 }
    : undefined,
});
const audit = {
  schemaVersion: "industry_m4_2_live_sampling_audit.v1",
  artifactType: "industry-m4-2-live-sampling-audit",
  inputRunDir,
  publicRecovery,
  sourceUrls: requiredSources,
  selectedSampleCount: representativeSamplePlan.selectedSamples.length,
  excludedCandidateCount: representativeSamplePlan.excludedCandidates.length,
  coverageGate: representativeSamplePlan.coverageGate,
  relationshipCoverageGate: representativeSamplePlan.relationshipCoverageGate,
  nextStageAllowed: representativeSamplePlan.nextStageAllowed,
  assertions: {
    allSourcesPassedLiveRawAndRelevanceGates: true,
    observedPricesNotMarketPriceTiers: true,
    searchRankDeterminedSelection: false,
    sourceCandidatesTreatedAsEvidence: false,
    liveRequestsUsedByThisStep: 0,
    llmRequests: 0,
    productionWrite: false,
  },
};
await Promise.all([
  writeTextAtomic(
    join(outputDir, "source_candidate_plan.json"),
    `${JSON.stringify(sourceCandidatePlan, null, 2)}\n`,
  ),
  writeTextAtomic(
    join(outputDir, "representative_sample_plan.json"),
    serializeIndustryRepresentativeSamplePlan(representativeSamplePlan),
  ),
  writeTextAtomic(
    join(outputDir, "run_audit.json"),
    `${JSON.stringify(audit, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify({ status: "ok", ...audit, outputDir }, null, 2));
