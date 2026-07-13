import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  canonicalizeIndustryRawDocumentUrl,
  createIndustryModuleResultsArtifact,
  createIndustryPlan,
  type Evidence,
  type IndustryAcquisitionRoute,
  type IndustryM2WaveRawDocumentInput,
  type IndustryModuleClaimInput,
  type IndustryModuleRunInput,
  type IndustryPlanSourceRole,
  type IndustryRepresentativeSamplePlan,
  type IndustryResearchModule,
  industryResearchModuleOrder,
  type RawDocument,
  type ResearchSource,
  serializeIndustryModuleResultsArtifact,
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

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeTextAtomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

function normalized(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

type ClaimSpec = {
  moduleId: IndustryResearchModule["id"];
  url: string;
  sourceRole: IndustryPlanSourceRole;
  quote: string;
  axisItemIds: string[];
  sampleEntityIds?: string[];
};

const inputRunDir = resolve(
  argumentValue("input-run") ??
    (() => {
      throw new Error("m4_3_input_run_required");
    })(),
);
const outputDir = resolve(
  argumentValue("output") ?? join(inputRunDir, "m4.3-module-research"),
);
const [rawText, routeText, sampleText] = await Promise.all([
  readFile(join(inputRunDir, "raw_documents.json"), "utf8"),
  readFile(join(inputRunDir, "routes.json"), "utf8"),
  readFile(
    join(inputRunDir, "sampling", "representative_sample_plan.json"),
    "utf8",
  ),
]);
const rawInputs = JSON.parse(rawText) as IndustryM2WaveRawDocumentInput[];
const routes = JSON.parse(routeText) as IndustryAcquisitionRoute[];
const representativeSamplePlan = JSON.parse(
  sampleText,
) as IndustryRepresentativeSamplePlan;
const industryPlan = createIndustryPlan(
  structuredClone(skincareIndustryPlanningFixture),
);
if (representativeSamplePlan.industryPlanId !== industryPlan.planId) {
  throw new Error("m4_3_sample_plan_mismatch");
}
if (representativeSamplePlan.nextStageAllowed !== "module_research") {
  throw new Error("m4_3_sampling_gate_not_passed");
}

const canonicalRaw = new Map(
  rawInputs.flatMap((document) => {
    const canonical = canonicalizeIndustryRawDocumentUrl(document.url);
    return canonical ? [[canonical, document] as const] : [];
  }),
);
const sampleIdByEntity = new Map(
  representativeSamplePlan.selectedSamples.map((sample) => [
    sample.entityId,
    sample.id,
  ]),
);
const taxonomy = industryPlan.taxonomy.map((item) => item.id);
const valueChain = industryPlan.valueChain.map((item) => item.id);
const priceTiers = industryPlan.priceTiers.map((item) => item.id);
const channels = industryPlan.channels.map((item) => item.id);
const marketMeasures =
  industryPlan.coverageMatrix.find(
    (row) => row.id === "coverage-market-taxonomy",
  )?.axisItemIds ?? [];
const contentChannels =
  industryPlan.coverageMatrix.find(
    (row) => row.id === "coverage-content-channels",
  )?.axisItemIds ?? [];
if (marketMeasures.length !== 5 || contentChannels.length !== 4) {
  throw new Error("m4_3_module_specific_axes_missing");
}
const consumerNeeds = industryPlan.consumerNeeds.map((item) => item.id);
const regulationQuestions = industryPlan.regulationAndRiskQuestions.map(
  (_question, index) => `regulation-question-${index + 1}`,
);
const businessModels = industryPlan.businessModels.map((item) => item.id);
const urls = {
  niq: "https://nielseniq.cn/global/zh/insights/report/2024/niq-2024-china-beauty-and-personal-insight/",
  proyaAnnual:
    "https://static.cninfo.com.cn/finalpage/2025-04-25/1223280349.PDF",
  regulation:
    "https://www.beijing.gov.cn/zhengce/gwywj/202006/t20200630_1935123.html",
  regulationChange: "https://english.nmpa.gov.cn/2024-04/22/c_1049743.htm",
  kantar:
    "https://www.kantarworldpanel.com/cn/News/2024-China-Beauty-Trend-Report",
  community: "https://www.zhihu.com/question/400788390/answer/2849675150",
  proyaAbout: "https://www.proya.com/about/page.html",
  proyaLower: "https://www.proya.com/product_detail-pId-713.html",
  proyaMiddle: "https://www.proya.com/product_detail-pId-738.html",
  proyaUpper: "https://www.proya.com/product_detail-pId-701.html",
  sephora: "https://m.sephora.cn/zt/",
  jd: "https://item.jd.com/10096241359618",
  oceanEngine: "https://www.oceanengine.com/blog/meizhuang-hangye-baogao.html",
  newrank: "https://www.newrank.cn/report/detail/393",
  bloomage: "https://www.bloomagebiotech.com/news-detail110.html",
  bettaniAnnual:
    "https://static.cninfo.com.cn/finalpage/2025-04-25/1223273022.PDF",
} as const;

const specs: ClaimSpec[] = [
  {
    moduleId: "market_landscape",
    url: urls.niq,
    sourceRole: "credible_research_institution",
    quote:
      "2023护肤品市场全年规模累计3,277亿元，同比增长4.7%，呈现稳步恢复态势",
    axisItemIds: [...marketMeasures.slice(1, 3), ...marketMeasures.slice(4, 5)],
  },
  {
    moduleId: "market_landscape",
    url: urls.niq,
    sourceRole: "credible_research_institution",
    quote:
      "主要护肤品（指洁面和爽肤水之后的护肤步骤，包括精华、乳液、面霜、眼霜）",
    axisItemIds: [...marketMeasures.slice(0, 1), ...marketMeasures.slice(3, 4)],
  },
  {
    moduleId: "market_landscape",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote:
      "2024 年，社会消费品零售总额 487,895 亿元，同比增长 3.5%，其中化 妆品类总额 4,357 亿元，同比下降 1.1%（限额以上单位消费品零售额）",
    axisItemIds: [...marketMeasures.slice(0, 3), ...marketMeasures.slice(4, 5)],
  },
  {
    moduleId: "market_landscape",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote: "护肤类(含洁肤)",
    axisItemIds: marketMeasures.slice(3, 4),
  },
  {
    moduleId: "market_landscape",
    url: urls.niq,
    sourceRole: "credible_research_institution",
    quote:
      "尼尔森IQ按照品牌均价将护肤品划分为四个档次（超高端、高端、大众、经济）",
    axisItemIds: priceTiers,
  },
  {
    moduleId: "market_landscape",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote: "珀莱雅，专注科技护肤，针对年轻白领女性群体，主价格区间 200-500 元",
    axisItemIds: priceTiers,
  },
  {
    moduleId: "market_landscape",
    url: urls.niq,
    sourceRole: "credible_research_institution",
    quote: "抖音电商在线上渠道中增长表现突出",
    axisItemIds: channels.slice(2, 3),
  },
  {
    moduleId: "market_landscape",
    url: urls.niq,
    sourceRole: "credible_research_institution",
    quote: "线下渠道中，百货专柜增速亮眼",
    axisItemIds: channels.slice(3, 4),
  },
  {
    moduleId: "market_landscape",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote: "线上渠道主要通过直营、分销模式运营",
    axisItemIds: channels.slice(0, 1),
  },
  {
    moduleId: "market_landscape",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote: "分销包括淘宝、京东、唯品会等平台",
    axisItemIds: channels.slice(1, 3),
  },
  {
    moduleId: "regulation_and_standards",
    url: urls.regulation,
    sourceRole: "regulator",
    quote: "国家对特殊化妆品实行注册管理，对普通化妆品实行备案管理",
    axisItemIds: regulationQuestions.slice(0, 1),
  },
  {
    moduleId: "regulation_and_standards",
    url: urls.regulation,
    sourceRole: "regulator",
    quote: "化妆品注册人、备案人对化妆品的质量安全和功效宣称负责",
    axisItemIds: regulationQuestions.slice(1, 2),
  },
  {
    moduleId: "regulation_and_standards",
    url: urls.regulationChange,
    sourceRole: "regulator",
    quote:
      "Several Measures to Optimize the Management of Cosmetic Safety Assessment, which are hereby issued and will come into force from May 1, 2024",
    axisItemIds: regulationQuestions.slice(2, 3),
  },
  {
    moduleId: "consumer_demand",
    url: urls.kantar,
    sourceRole: "user_research",
    quote:
      "消费者努力在“实用主义”和“犒赏自我”中间寻找平衡，试图从不同的价位中精准地挑选产品",
    axisItemIds: [...consumerNeeds.slice(0, 1), ...consumerNeeds.slice(2, 3)],
    sampleEntityIds: ["proya-cream-713-observed-lower"],
  },
  {
    moduleId: "consumer_demand",
    url: urls.community,
    sourceRole: "public_community",
    quote: "除了了解产品的优势功效，消费者也会查询成分知识科普和使用注意事项",
    axisItemIds: [...consumerNeeds.slice(1, 2), ...consumerNeeds.slice(3, 4)],
    sampleEntityIds: ["proya-cream-701-observed-upper"],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaLower,
    sourceRole: "brand_official_site",
    quote: "保湿、抗皱、紧致",
    axisItemIds: taxonomy.slice(0, 1),
    sampleEntityIds: ["proya-cream-713-observed-lower"],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaMiddle,
    sourceRole: "brand_official_site",
    quote: "轻润乳霜质地，水润不粘腻，令肌肤水感充盈",
    axisItemIds: taxonomy.slice(2, 3),
    sampleEntityIds: ["proya-cream-738-observed-middle"],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaUpper,
    sourceRole: "brand_official_site",
    quote: "每日早晚取适量面霜，沿肌肤纹理轻柔地涂抹于面部及颈部",
    axisItemIds: [...taxonomy.slice(1, 2), ...taxonomy.slice(4, 5)],
    sampleEntityIds: ["proya-cream-701-observed-upper"],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaAbout,
    sourceRole: "brand_official_site",
    quote: "快速渗透并影响年轻消费人群",
    axisItemIds: taxonomy.slice(3, 4),
    sampleEntityIds: [
      "proya-cream-713-observed-lower",
      "proya-cream-738-observed-middle",
      "proya-cream-701-observed-upper",
    ],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaLower,
    sourceRole: "brand_official_site",
    quote: "价格： ¥178.00",
    axisItemIds: priceTiers.slice(0, 1),
    sampleEntityIds: ["proya-cream-713-observed-lower"],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaMiddle,
    sourceRole: "brand_official_site",
    quote: "价格： ¥220.00",
    axisItemIds: priceTiers.slice(1, 2),
    sampleEntityIds: ["proya-cream-738-observed-middle"],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaUpper,
    sourceRole: "brand_official_site",
    quote: "价格： ¥300.00",
    axisItemIds: priceTiers.slice(2, 3),
    sampleEntityIds: ["proya-cream-701-observed-upper"],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.proyaAbout,
    sourceRole: "brand_official_site",
    quote: "以多品类、多渠道的运营机制，进一步进军商超、电商等渠道",
    axisItemIds: channels,
    sampleEntityIds: [
      "proya-cream-713-observed-lower",
      "proya-cream-738-observed-middle",
      "proya-cream-701-observed-upper",
    ],
  },
  {
    moduleId: "ecommerce_competitor_research",
    url: urls.sephora,
    sourceRole: "trusted_retail_channel",
    quote: "护肤品专题",
    axisItemIds: channels.slice(1, 2),
    sampleEntityIds: ["jd-skincare-channel"],
  },
  {
    moduleId: "content_and_traffic",
    url: urls.oceanEngine,
    sourceRole: "content_platform",
    quote: "在内容供给端，抖音美妆内容稳中有序健康增长，尤其是Q2和Q3季度",
    axisItemIds: contentChannels,
    sampleEntityIds: ["douyin-beauty-content-ecosystem"],
  },
  {
    moduleId: "content_and_traffic",
    url: urls.newrank,
    sourceRole: "creator_data",
    quote:
      "报告主要统计分析了2023.05.01—05.31（共31天）新红监测的小红书样本发布的 互动量 TOP50000 的“美妆护肤” 笔记及其关联评论",
    axisItemIds: [
      ...contentChannels.slice(0, 1),
      ...contentChannels.slice(2, 3),
    ],
    sampleEntityIds: ["xiaohongshu-beauty-content-ecosystem"],
  },
  {
    moduleId: "business_model_and_supply_chain",
    url: urls.bloomage,
    sourceRole: "supply_chain_company",
    quote: "通过全产业链布局打通从基础研究到市场应用的闭环",
    axisItemIds: valueChain.slice(0, 2),
    sampleEntityIds: ["bloomage-full-chain-actor"],
  },
  {
    moduleId: "business_model_and_supply_chain",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote: "公司以自主生产为主，OEM 为辅的生产模式，护肤品类以自主生产为主",
    axisItemIds: valueChain.slice(2, 3),
    sampleEntityIds: ["proya-listed-company-chain-actor"],
  },
  {
    moduleId: "business_model_and_supply_chain",
    url: urls.bettaniAnnual,
    sourceRole: "financial_report",
    quote: "公司通过线下医药渠道打基础、线上全网覆盖",
    axisItemIds: valueChain.slice(3, 4),
    sampleEntityIds: ["bettani-listed-company-chain-actor"],
  },
  {
    moduleId: "business_model_and_supply_chain",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote: "线上渠道为主、线下渠道并行",
    axisItemIds: businessModels.slice(0, 1),
    sampleEntityIds: ["proya-listed-company-chain-actor"],
  },
  {
    moduleId: "business_model_and_supply_chain",
    url: urls.proyaAnnual,
    sourceRole: "financial_report",
    quote: "公司以自主生产为主，OEM 为辅的生产模式",
    axisItemIds: businessModels.slice(1, 2),
    sampleEntityIds: ["proya-listed-company-chain-actor"],
  },
  {
    moduleId: "business_model_and_supply_chain",
    url: urls.bettaniAnnual,
    sourceRole: "financial_report",
    quote: "公司是以“薇诺娜（Winona）”品牌为核心",
    axisItemIds: businessModels.slice(0, 1),
    sampleEntityIds: ["bettani-listed-company-chain-actor"],
  },
  {
    moduleId: "business_model_and_supply_chain",
    url: urls.jd,
    sourceRole: "trusted_retail_channel",
    quote: "美妆 / 个护清洁 / 宠物",
    axisItemIds: businessModels.slice(2, 3),
    sampleEntityIds: ["jd-skincare-channel"],
  },
];

const sourceByKey = new Map<string, ResearchSource>();
const rawByKey = new Map<string, RawDocument>();
const evidence: Evidence[] = [];
const claimInputs: Array<
  IndustryModuleClaimInput & { moduleId: IndustryResearchModule["id"] }
> = [];
for (const [index, spec] of specs.entries()) {
  const canonical = canonicalizeIndustryRawDocumentUrl(spec.url);
  const rawInput = canonical ? canonicalRaw.get(canonical) : undefined;
  if (!rawInput) throw new Error(`m4_3_raw_document_missing:${spec.url}`);
  if (!rawInput.sourceQuality.acceptedForReport) {
    throw new Error(`m4_3_raw_document_not_accepted:${spec.url}`);
  }
  if (!normalized(rawInput.extractedText).includes(normalized(spec.quote))) {
    throw new Error(`m4_3_quote_missing:${spec.moduleId}:${spec.quote}`);
  }
  const route = routes.find(
    (candidate) =>
      canonicalizeIndustryRawDocumentUrl(candidate.targetReference) ===
        canonical && candidate.sourceRole === spec.sourceRole,
  );
  if (!route) {
    throw new Error(`m4_3_route_role_missing:${spec.url}:${spec.sourceRole}`);
  }
  const sourceKey = `${canonical}:${spec.sourceRole}`;
  let source = sourceByKey.get(sourceKey);
  if (!source) {
    source = {
      id: `m4-3-source-${sha256(sourceKey).slice(0, 12)}`,
      projectId: industryPlan.planId,
      type: "url",
      title: rawInput.title,
      value: spec.url,
      automationHint: "public-market raw document; deterministic exact quote",
      industrySourceRole: spec.sourceRole,
    };
    sourceByKey.set(sourceKey, source);
  }
  let rawDocument = rawByKey.get(sourceKey);
  if (!rawDocument) {
    rawDocument = {
      id: `${rawInput.id}-${sha256(sourceKey).slice(0, 8)}`,
      projectId: industryPlan.planId,
      sourceId: source.id,
      crawlRunId: "m4.2-public-market-recovery",
      url: spec.url,
      title: rawInput.title,
      contentType: "text",
      excerpt: rawInput.extractedText.slice(0, 600),
      extractedText: rawInput.extractedText,
      databaseTargets: ["source_database"],
      sourceQuality: {
        sourceType: "official_site",
        sourceRelevance: "high",
        sourceConfidence: "high",
        needsReviewReason:
          "M4.2 public-market raw candidate passed source-quality and category-relevance gates.",
        acceptedForReport: true,
      },
      industrySourceRole: spec.sourceRole,
    };
    rawByKey.set(sourceKey, rawDocument);
  }
  const module = industryPlan.researchModules.find(
    (candidate) => candidate.id === spec.moduleId,
  );
  const claimRole = module?.targetClaimRoles[0];
  if (!claimRole) throw new Error(`m4_3_claim_role_missing:${spec.moduleId}`);
  const evidenceId = `m4-3-evidence-${index + 1}`;
  evidence.push({
    id: evidenceId,
    projectId: industryPlan.planId,
    sourceId: source.id,
    rawDocumentId: rawDocument.id,
    quote: spec.quote,
    note: "公开市场原文的确定性逐字摘录；不含人工补表或模型改写。",
    sourceRole: spec.sourceRole,
    claimRole,
    validation: {
      quoteMatched: true,
      sourceAccepted: true,
      matchedRawDocumentId: rawDocument.id,
      claimSupportComplete: true,
      claimQuoteCount: 1,
      confirmedQuoteCount: 1,
      roleAuthorized: true,
      sourceRole: spec.sourceRole,
      claimRole,
    },
  });
  const representativeSampleIds = (spec.sampleEntityIds ?? []).map(
    (entityId) => {
      const sampleId = sampleIdByEntity.get(entityId);
      if (!sampleId) throw new Error(`m4_3_sample_missing:${entityId}`);
      return sampleId;
    },
  );
  claimInputs.push({
    moduleId: spec.moduleId,
    claimId: `m4-3-${spec.moduleId}-claim-${index + 1}`,
    statement: spec.quote,
    claimRole,
    evidenceIds: [evidenceId],
    axisItemIds: spec.axisItemIds,
    representativeSampleIds,
  });
}

const moduleInputs: IndustryModuleRunInput[] = industryResearchModuleOrder.map(
  (moduleId) => {
    const moduleClaims = claimInputs.filter(
      (claim) => claim.moduleId === moduleId,
    );
    const evidenceIds = new Set(
      moduleClaims.flatMap((claim) => claim.evidenceIds),
    );
    const moduleEvidence = evidence.filter((item) => evidenceIds.has(item.id));
    const sourceIds = new Set(moduleEvidence.map((item) => item.sourceId));
    const rawDocumentIds = new Set(
      moduleEvidence.flatMap((item) =>
        item.rawDocumentId ? [item.rawDocumentId] : [],
      ),
    );
    return {
      moduleId,
      claimInputs: moduleClaims.map(
        ({ moduleId: _moduleId, ...claim }) => claim,
      ),
      sources: [...sourceByKey.values()].filter((source) =>
        sourceIds.has(source.id),
      ),
      rawDocuments: [...rawByKey.values()].filter((document) =>
        rawDocumentIds.has(document.id),
      ),
      evidence: moduleEvidence,
    };
  },
);
const artifact = createIndustryModuleResultsArtifact({
  industryPlan,
  representativeSamplePlan,
  moduleInputs,
});
const evidenceIndex = moduleInputs.map((input) => ({
  moduleId: input.moduleId,
  claims: input.claimInputs,
  sources: input.sources.map((source) => ({
    id: source.id,
    title: source.title,
    url: source.value,
    sourceRole: source.industrySourceRole,
  })),
  evidence: input.evidence.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    rawDocumentId: item.rawDocumentId,
    quote: item.quote,
    claimRole: item.claimRole,
    sourceRole: item.sourceRole,
  })),
}));
const audit = {
  schemaVersion: "industry_m4_3_public_module_research_audit.v1",
  artifactType: "industry-m4-3-public-module-research-audit",
  inputRunDir,
  outputDir,
  inputHashes: {
    rawDocuments: `sha256:${sha256(rawText)}`,
    routes: `sha256:${sha256(routeText)}`,
    representativeSamplePlan: `sha256:${sha256(sampleText)}`,
  },
  moduleStatuses: artifact.moduleResults.map((result) => ({
    moduleId: result.moduleId,
    status: result.status,
    confirmedClaims: result.claims.filter(
      (claim) => claim.status === "confirmed",
    ).length,
    blockedClaims: result.claims.filter((claim) => claim.status === "blocked")
      .length,
    passedCoverageRows: result.coverage.filter((row) => row.status === "pass")
      .length,
    totalCoverageRows: result.coverage.length,
  })),
  blockedModuleIds: artifact.blockedModuleIds,
  assertions: {
    publicMarketOnly: true,
    manualSupplements: 0,
    authorizedImports: 0,
    livePublicRequests: 0,
    liveProviderCalls: 0,
    llmRequests: 0,
    exactQuoteValidationRequired: true,
    rawCandidatesTreatedAsEvidenceWithoutValidation: false,
    commercializationAssessed: false,
    productionWrite: false,
  },
};
await Promise.all([
  writeTextAtomic(
    join(outputDir, "module-results.json"),
    serializeIndustryModuleResultsArtifact(artifact),
  ),
  writeTextAtomic(
    join(outputDir, "claim-evidence-index.json"),
    `${JSON.stringify(evidenceIndex, null, 2)}\n`,
  ),
  writeTextAtomic(
    join(outputDir, "run-audit.json"),
    `${JSON.stringify(audit, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify({ status: "ok", ...audit }, null, 2));
