export const industryPlanSchemaVersion = "industry_plan.v1" as const;

export type IndustryPlanClaimRole =
  | "market_size_growth"
  | "regulation_standard"
  | "brand_positioning_product"
  | "consumer_need"
  | "content_traffic_trend"
  | "business_model_supply_chain";

export type IndustryPlanSourceRole =
  | "government_statistics"
  | "industry_association"
  | "credible_research_institution"
  | "financial_report"
  | "regulator"
  | "standards_body"
  | "brand_official_site"
  | "official_store"
  | "trusted_retail_channel"
  | "consumer_review"
  | "public_community"
  | "user_research"
  | "search_trend"
  | "content_platform"
  | "creator_data"
  | "company_material"
  | "industry_media"
  | "supply_chain_company";

export type IndustryPlanStatus = "planned" | "planned_with_gaps" | "blocked";

export type IndustryPlanningInput = {
  industry: string;
  market: string;
  timeRange: string;
  researchGoals: string[];
  constraints?: string[];
};

export type PlanningAxisItem = {
  id: string;
  label: string;
  planningBasis: "deterministic_domain_seed" | "generic_placeholder";
  calibrationStatus:
    | "authority_aligned"
    | "method_guardrail"
    | "requires_live_validation";
  calibrationSourceIds: string[];
  calibrationNotes: string[];
  validationStatus: "unverified_planning_hypothesis";
  validationQuestion: string;
};

export type IndustryPlannerCalibrationSource = {
  id: string;
  authority: string;
  title: string;
  url: string;
  sourceRole: Extract<
    IndustryPlanSourceRole,
    "government_statistics" | "regulator"
  >;
  supports: string[];
  limitations: string[];
};

export type IndustryResearchModule = {
  id:
    | "market_landscape"
    | "regulation_and_standards"
    | "consumer_demand"
    | "ecommerce_competitor_research"
    | "content_and_traffic"
    | "business_model_and_supply_chain";
  name: string;
  researchQuestions: string[];
  allowedSourceRoles: IndustryPlanSourceRole[];
  targetClaimRoles: IndustryPlanClaimRole[];
  coverageTargets: string[];
  status: "planned" | "blocked_missing_evidence";
  evidenceGaps: string[];
};

export type IndustrySourceRolePolicyEntry = {
  sourceRole: IndustryPlanSourceRole;
  allowedClaimRoles: IndustryPlanClaimRole[];
  calibrationBasis:
    | "regulatory_authority"
    | "official_statistical_scope"
    | "methodological_guardrail";
  roleDefinition: string;
  minimumEvidenceRequirements: string[];
  prohibitedInferences: string[];
};

export type IndustryCoverageAxisType =
  | "taxonomy"
  | "value_chain"
  | "price_tier"
  | "channel"
  | "consumer_need"
  | "business_model"
  | "regulation";

export type IndustryCoverageMatrixRow = {
  id: string;
  moduleId: IndustryResearchModule["id"];
  axisType: IndustryCoverageAxisType;
  axisItemIds: string[];
  dimension: string;
  allowedSourceRoles: IndustryPlanSourceRole[];
  targetCoverage: {
    minIndependentSources: number;
    minSourceRoles: number;
    minRepresentativeSamples: number;
    targetBasis:
      | "primary_authority_minimum"
      | "triangulation_guardrail"
      | "representative_sampling_guardrail";
    calibrationRationale: string;
    requirements: string[];
  };
  currentCoverage: {
    independentSourceCount: 0;
    sourceRoles: [];
    representativeSampleIds: [];
  };
  status: "not_started";
  gaps: string[];
};

export type IndustryRepresentativeSample = {
  id: string;
  name: string;
  sampleType:
    | "organization"
    | "product_or_service"
    | "channel"
    | "content_source"
    | "business_model_analogy";
  relationshipToIndustry:
    | "direct_competitor"
    | "supply_chain_actor"
    | "channel_actor"
    | "content_actor"
    | "business_model_analogy";
  axisAssignments: {
    taxonomyIds: string[];
    valueChainIds: string[];
    priceTierIds: string[];
    channelIds: string[];
    consumerNeedIds: string[];
    businessModelIds: string[];
  };
  selectionReason: string;
  expectedSourceRoles: IndustryPlanSourceRole[];
  validationStatus: "candidate_unverified" | "validated" | "rejected";
  evidenceGaps: string[];
};

export type IndustryPlan = {
  schemaVersion: typeof industryPlanSchemaVersion;
  artifactType: "industry-plan";
  plannerVersion: "deterministic.v1";
  planId: string;
  inputCoordinates: IndustryPlanningInput;
  planningCalibration: {
    status: "skincare_cn_g2_calibrated" | "generic_pending";
    calibratedAt: "2026-07-12" | null;
    sources: IndustryPlannerCalibrationSource[];
    guardrails: string[];
  };
  scope: {
    definition: string;
    inclusions: string[];
    exclusions: string[];
    unresolvedQuestions: string[];
    factStatus: "planning_scope_not_external_evidence";
  };
  taxonomy: PlanningAxisItem[];
  valueChain: PlanningAxisItem[];
  priceTiers: PlanningAxisItem[];
  channels: PlanningAxisItem[];
  consumerNeeds: PlanningAxisItem[];
  businessModels: PlanningAxisItem[];
  regulationAndRiskQuestions: string[];
  researchQuestions: string[];
  researchModules: IndustryResearchModule[];
  sourceRolePolicy: IndustrySourceRolePolicyEntry[];
  coverageMatrix: IndustryCoverageMatrixRow[];
  representativeSamplingPlan: {
    dimensions: Exclude<IndustryCoverageAxisType, "regulation">[];
    coverageRequirements: {
      minSamplesPerTaxonomyItem: number;
      minCoveredPriceTiers: number;
      minCoveredChannels: number;
      minCoveredBusinessModels: number;
    };
    rules: string[];
    status: "not_started";
    selectedSamples: IndustryRepresentativeSample[];
    uncoveredAxisItemIds: string[];
  };
  budget: {
    liveProviderCalls: 0;
    livePublicRequests: 0;
    mode: "offline_planning_only";
  };
  risks: string[];
  stopConditions: string[];
  evidenceGaps: string[];
  plannerStatus: IndustryPlanStatus;
  assertions: {
    externalFactsProduced: false;
    marketSizeProduced: false;
    growthRateProduced: false;
    demandStrengthProduced: false;
    opportunityCertaintyProduced: false;
  };
};

type SourceRolePolicySeed = Omit<
  IndustrySourceRolePolicyEntry,
  "calibrationBasis" | "minimumEvidenceRequirements" | "roleDefinition"
>;

const officialStatisticalRoles = new Set<IndustryPlanSourceRole>([
  "government_statistics",
]);
const regulatoryRoles = new Set<IndustryPlanSourceRole>([
  "regulator",
  "standards_body",
]);

const sourceRoleDefinitions: Record<IndustryPlanSourceRole, string> = {
  government_statistics: "政府统计部门发布、且能核对统计口径的原始统计资料。",
  industry_association: "行业协会发布并披露口径、成员或研究方法的行业资料。",
  credible_research_institution:
    "可核对作者、样本、方法和时间范围的研究机构成果。",
  financial_report: "公司法定披露、审计财务报告或等价投资者材料。",
  regulator: "有管辖权监管机关发布的现行法规、规章、公告或办事指引。",
  standards_body: "国家或行业标准发布机构公布的现行标准及状态信息。",
  brand_official_site: "品牌控制的官网，仅用于核对该品牌及其产品自述。",
  official_store: "可确认经营主体的品牌官方店铺及其商品页面。",
  trusted_retail_channel: "可确认经营主体、商品和页面时间的第三方零售渠道。",
  consumer_review: "带商品、时间和平台上下文的公开消费者评价。",
  public_community: "公开社区中的自然讨论，只作为定性信号。",
  user_research: "披露招募、样本、任务和记录方法的一手用户研究。",
  search_trend: "披露关键词、地区、时间和指数定义的搜索趋势数据。",
  content_platform: "平台公开的内容、榜单或指标定义资料。",
  creator_data: "可核对账号、内容、时间和指标口径的创作者公开数据。",
  company_material: "公司发布的业务、产品、客户或产能材料。",
  industry_media: "署名、注明时间且可回溯原始出处的产业媒体报道。",
  supply_chain_company: "原料、包装、制造、检测等供应链企业的一手材料。",
};

const sourceRolePolicySeeds: SourceRolePolicySeed[] = [
  {
    sourceRole: "government_statistics",
    allowedClaimRoles: ["market_size_growth"],
    prohibitedInferences: ["不能用不匹配的统计口径外推目标行业。"],
  },
  {
    sourceRole: "industry_association",
    allowedClaimRoles: ["market_size_growth", "regulation_standard"],
    prohibitedInferences: ["协会宣传口径需要与统计定义和时间范围交叉验证。"],
  },
  {
    sourceRole: "credible_research_institution",
    allowedClaimRoles: ["market_size_growth", "consumer_need"],
    prohibitedInferences: ["不可把未披露样本和方法的摘要当作确定事实。"],
  },
  {
    sourceRole: "financial_report",
    allowedClaimRoles: ["market_size_growth", "business_model_supply_chain"],
    prohibitedInferences: ["单家公司财报不能单独代表全行业规模。"],
  },
  {
    sourceRole: "regulator",
    allowedClaimRoles: ["regulation_standard"],
    prohibitedInferences: ["监管文件不直接证明消费者需求或商业机会。"],
  },
  {
    sourceRole: "standards_body",
    allowedClaimRoles: ["regulation_standard"],
    prohibitedInferences: ["标准存在不代表市场采用率或合规率。"],
  },
  {
    sourceRole: "brand_official_site",
    allowedClaimRoles: ["brand_positioning_product"],
    prohibitedInferences: [
      "单个品牌官网不能支持全行业市场规模或增速。",
      "品牌功能文案不能证明已验证消费者需求。",
      "营销自述不能证明盈利能力。",
    ],
  },
  {
    sourceRole: "official_store",
    allowedClaimRoles: ["brand_positioning_product"],
    prohibitedInferences: ["商品展示和标价不能单独证明成交、需求或转化率。"],
  },
  {
    sourceRole: "trusted_retail_channel",
    allowedClaimRoles: ["brand_positioning_product"],
    prohibitedInferences: ["零售上架不能单独证明全市场份额或需求规模。"],
  },
  {
    sourceRole: "consumer_review",
    allowedClaimRoles: ["consumer_need"],
    prohibitedInferences: ["单条评论不能外推全市场需求规模。"],
  },
  {
    sourceRole: "public_community",
    allowedClaimRoles: ["consumer_need"],
    prohibitedInferences: ["社区讨论不能直接代表总体人群或购买转化。"],
  },
  {
    sourceRole: "user_research",
    allowedClaimRoles: ["consumer_need"],
    prohibitedInferences: ["未披露样本设计的调研不能外推全市场。"],
  },
  {
    sourceRole: "search_trend",
    allowedClaimRoles: ["consumer_need", "content_traffic_trend"],
    prohibitedInferences: ["搜索变化不能直接证明销量、转化或利润。"],
  },
  {
    sourceRole: "content_platform",
    allowedClaimRoles: ["content_traffic_trend"],
    prohibitedInferences: ["标题、播放或互动数字不能证明转化率。"],
  },
  {
    sourceRole: "creator_data",
    allowedClaimRoles: ["content_traffic_trend"],
    prohibitedInferences: ["创作者个案不能代表全行业投放回报。"],
  },
  {
    sourceRole: "company_material",
    allowedClaimRoles: ["business_model_supply_chain"],
    prohibitedInferences: ["公司营销材料不能单独证明盈利能力。"],
  },
  {
    sourceRole: "industry_media",
    allowedClaimRoles: ["business_model_supply_chain"],
    prohibitedInferences: ["产业媒体转述不能替代财报、合同或监管原文。"],
  },
  {
    sourceRole: "supply_chain_company",
    allowedClaimRoles: ["business_model_supply_chain"],
    prohibitedInferences: ["供应商自述不能单独证明行业盈利或需求规模。"],
  },
];

export const industrySourceRolePolicy: IndustrySourceRolePolicyEntry[] =
  sourceRolePolicySeeds.map((entry) => ({
    ...entry,
    calibrationBasis: regulatoryRoles.has(entry.sourceRole)
      ? "regulatory_authority"
      : officialStatisticalRoles.has(entry.sourceRole)
        ? "official_statistical_scope"
        : "methodological_guardrail",
    roleDefinition: sourceRoleDefinitions[entry.sourceRole],
    minimumEvidenceRequirements:
      entry.sourceRole === "government_statistics"
        ? [
            "记录统计指标原名、地区、时间和范围",
            "核对目标行业与统计类目的口径差异",
          ]
        : regulatoryRoles.has(entry.sourceRole)
          ? ["优先使用发布机关原文", "记录文件状态、适用地区和生效时间"]
          : [
              "记录主体、页面或材料日期和唯一 URL",
              "披露样本或指标口径并保留交叉验证缺口",
            ],
  }));

const skincareChinaCalibrationSources: IndustryPlannerCalibrationSource[] = [
  {
    id: "cn-cosmetics-regulation-727",
    authority: "中华人民共和国国务院",
    title: "化妆品监督管理条例（国务院令第727号）",
    url: "https://www.beijing.gov.cn/zhengce/gwywj/202006/t20200630_1935123.html",
    sourceRole: "regulator",
    supports: [
      "化妆品定义与适用部位",
      "功效宣称、作用部位、产品剂型、使用人群分类因素",
      "普通与特殊化妆品、注册与备案边界",
      "注册备案、生产、受托生产、原料包装和标签责任",
    ],
    limitations: ["监管分类不直接证明市场子类规模、消费者需求或渠道份额。"],
  },
  {
    id: "nmpa-classification-2021-49",
    authority: "国家药品监督管理局",
    title: "化妆品分类规则和分类目录（2021年第49号）",
    url: "https://yjj.scjgj.fujian.gov.cn/hzp/flfg/202106/t20210622_5630812.htm",
    sourceRole: "regulator",
    supports: [
      "五维分类编码：功效宣称、作用部位、产品剂型、使用人群、使用方法",
    ],
    limitations: ["正式分类编码是合规维度，不等同于商业市场分层。"],
  },
  {
    id: "nmpa-efficacy-2021-50",
    authority: "国家药品监督管理局",
    title: "化妆品功效宣称评价规范办事口径",
    url: "https://zwfw.nmpa.gov.cn/web/taskview/11100000MB0341032Y100017214900101",
    sourceRole: "regulator",
    supports: ["功效宣称评价与依据摘要要求", "可免予公布依据摘要的有限情形"],
    limitations: [
      "办事口径用于规划核查问题，实际产品仍需回到现行原文和备案资料。",
    ],
  },
  {
    id: "cosmetics-registration-order-35",
    authority: "国家市场监督管理总局",
    title: "化妆品注册备案管理办法（国家市场监督管理总局令第35号）",
    url: "https://www.samr.gov.cn/cms_files/filemanager/samr/www/samrnew/samrgkml/nsjg/fgs/202101/W020211127402192291034.pdf",
    sourceRole: "regulator",
    supports: ["特殊化妆品和高风险新原料注册", "普通化妆品和其他新原料备案"],
    limitations: ["注册备案状态不证明销售、需求或商业表现。"],
  },
  {
    id: "nbs-cosmetics-scope-2024",
    authority: "国家统计局贸易外经统计司",
    title: "关于化妆品类统计范围的公开咨询答复",
    url: "https://www.stats.gov.cn/hd/lyzx/zxgk/202405/t20240524_1954124.html",
    sourceRole: "government_statistics",
    supports: ["国家统计零售数据中的“化妆品类”范围宽于护肤品"],
    limitations: ["不能把化妆品类总额直接当作护肤品市场规模。"],
  },
  {
    id: "nbs-retail-format-definition-2023",
    authority: "国家统计局",
    title: "统计用零售业态分类口径答复",
    url: "https://www.stats.gov.cn/hd/cjwtjd/202302/t20230207_1902274.html",
    sourceRole: "government_statistics",
    supports: [
      "零售业态按经营方式、商品结构、服务功能和有无固定场所等因素分类",
    ],
    limitations: ["只支持渠道分类方法，不支持护肤品各渠道份额。"],
  },
  {
    id: "nbs-retail-limitations-2023",
    authority: "国家统计局",
    title: "社会消费品零售总额定义与指标局限",
    url: "https://www.stats.gov.cn/zs/tjws/tjzb/202301/t20230101_1903707.html",
    sourceRole: "government_statistics",
    supports: ["网上零售和社零指标定义", "总量指标不能充分反映消费结构"],
    limitations: ["行业结构判断需要其他指标和来源交叉验证。"],
  },
];

function createPlanningCalibration(
  input: IndustryPlanningInput,
): IndustryPlan["planningCalibration"] {
  const calibrated =
    isSkincare(input.industry) && input.market.includes("中国大陆");
  return calibrated
    ? {
        status: "skincare_cn_g2_calibrated",
        calibratedAt: "2026-07-12",
        sources: skincareChinaCalibrationSources,
        guardrails: [
          "监管分类轴与商业市场分层分开记录。",
          "国家统计局“化妆品类”宽于护肤品，未做口径转换前不得支持护肤品规模结论。",
          "价格带只按可比单位价规划，数值边界留给代表样本校准。",
          "渠道、消费者需求和商业模式仍是待 live 证据验证的研究假设。",
        ],
      }
    : {
        status: "generic_pending",
        calibratedAt: null,
        sources: [],
        guardrails: ["通用行业轴必须在目标市场使用权威来源另行校准。"],
      };
}

function axisItem(
  id: string,
  label: string,
  basis: PlanningAxisItem["planningBasis"],
  validationQuestion: string,
  calibrationStatus: PlanningAxisItem["calibrationStatus"] = "requires_live_validation",
  calibrationSourceIds: string[] = [],
  calibrationNotes: string[] = [],
): PlanningAxisItem {
  return {
    id,
    label,
    planningBasis: basis,
    calibrationStatus,
    calibrationSourceIds,
    calibrationNotes,
    validationStatus: "unverified_planning_hypothesis",
    validationQuestion,
  };
}

function genericAxes(industry: string) {
  const basis = "generic_placeholder" as const;
  return {
    taxonomy: [
      axisItem(
        "taxonomy-product-function",
        "按产品功能拆分",
        basis,
        `需要发现并验证${industry}的主要产品功能分类。`,
      ),
      axisItem(
        "taxonomy-customer-segment",
        "按目标人群拆分",
        basis,
        `需要发现并验证${industry}的主要目标人群。`,
      ),
    ],
    valueChain: [
      axisItem(
        "value-chain-upstream",
        "上游原料与技术",
        basis,
        `需要识别${industry}上游的原料、技术和关键参与者。`,
      ),
      axisItem(
        "value-chain-downstream",
        "品牌、渠道与服务",
        basis,
        `需要识别${industry}下游的品牌、渠道和服务环节。`,
      ),
    ],
    priceTiers: [
      axisItem(
        "price-tier-unresolved",
        "待研究价格带",
        basis,
        `需要基于目标市场的可比零售价定义${industry}价格带。`,
      ),
    ],
    channels: [
      axisItem(
        "channel-online-offline",
        "线上与线下渠道",
        basis,
        `需要验证${industry}在目标市场的主要渠道结构。`,
      ),
    ],
    consumerNeeds: [
      axisItem(
        "need-outcome",
        "功能结果与使用体验",
        basis,
        `需要用评论、社区、调研和搜索信号验证${industry}需求。`,
      ),
    ],
    businessModels: [
      axisItem(
        "business-model-unresolved",
        "待研究商业模式",
        basis,
        `需要用财报、公司资料和产业链来源验证${industry}商业模式。`,
      ),
    ],
  };
}

function skincareAxes() {
  const basis = "deterministic_domain_seed" as const;
  const classificationSources = [
    "cn-cosmetics-regulation-727",
    "nmpa-classification-2021-49",
  ];
  const authorityAligned = "authority_aligned" as const;
  const liveValidation = "requires_live_validation" as const;
  const methodGuardrail = "method_guardrail" as const;
  return {
    taxonomy: [
      axisItem(
        "taxonomy-efficacy-claim",
        "功效宣称",
        basis,
        "目标产品涉及哪些法定功效分类，宣称依据和特殊化妆品边界是什么？",
        authorityAligned,
        classificationSources,
        ["这是监管分类维度，不等于已确认的市场子规模。"],
      ),
      axisItem(
        "taxonomy-application-site",
        "作用部位",
        basis,
        "产品标签中的施用部位如何映射到分类编码与安全要求？",
        authorityAligned,
        classificationSources,
      ),
      axisItem(
        "taxonomy-product-form",
        "产品剂型",
        basis,
        "液体、膏霜乳、凝胶、喷雾等剂型如何影响可比产品分组？",
        authorityAligned,
        classificationSources,
      ),
      axisItem(
        "taxonomy-user-group",
        "使用人群",
        basis,
        "婴幼儿、儿童及其他人群如何影响分类、功效和安全要求？",
        authorityAligned,
        classificationSources,
      ),
      axisItem(
        "taxonomy-use-method",
        "使用方法",
        basis,
        "淋洗、驻留等使用方法如何影响产品分类和安全评价？",
        authorityAligned,
        ["nmpa-classification-2021-49"],
      ),
    ],
    valueChain: [
      axisItem(
        "value-chain-materials-packaging",
        "原料、配方与直接接触包装",
        basis,
        "原料、配方和直接接触包装的供应、追溯与合规责任如何分配？",
        authorityAligned,
        ["cn-cosmetics-regulation-727"],
      ),
      axisItem(
        "value-chain-rd-testing",
        "研发、安全评价、检验与功效评价",
        basis,
        "功效评价、安全检测和配方研发分别由哪些参与者承担？",
        authorityAligned,
        ["cn-cosmetics-regulation-727", "nmpa-efficacy-2021-50"],
      ),
      axisItem(
        "value-chain-registration-manufacturing",
        "注册备案、生产与受托加工",
        basis,
        "注册人、备案人、自产企业和受托生产企业分别承担什么责任？",
        authorityAligned,
        ["cn-cosmetics-regulation-727", "cosmetics-registration-order-35"],
      ),
      axisItem(
        "value-chain-brand-channel",
        "品牌、分销与零售",
        basis,
        "品牌如何通过不同渠道触达消费者并形成价格体系？",
        liveValidation,
        ["nbs-retail-format-definition-2023"],
        ["官方资料只证明零售业态分类方法，不证明护肤品渠道份额。"],
      ),
    ],
    priceTiers: [
      axisItem(
        "price-tier-lower-observed",
        "可比单位价低位组（边界待样本校准）",
        basis,
        "在同一功效、剂型、规格和渠道口径下，低位组边界是什么？",
        methodGuardrail,
        [],
        ["不预设大众、中高端或奢华标签；先标准化单位价再分组。"],
      ),
      axisItem(
        "price-tier-middle-observed",
        "可比单位价中位组（边界待样本校准）",
        basis,
        "中位组是否需要按功效、剂型、规格和渠道分别定义？",
        methodGuardrail,
        [],
        ["数值边界必须来自 G5 代表样本，不在 Planner 中硬编码。"],
      ),
      axisItem(
        "price-tier-upper-observed",
        "可比单位价高位组（边界待样本校准）",
        basis,
        "高位组是否对应不同品牌、渠道或服务模式，还是规格差异？",
        methodGuardrail,
        [],
        ["高价格不能自动推断为高端定位、质量或利润。"],
      ),
    ],
    channels: [
      axisItem(
        "channel-brand-direct",
        "品牌控制的直营购买端点",
        basis,
        "官网、小程序或直营门店的经营主体和成交端点如何核验？",
        liveValidation,
        ["nbs-retail-format-definition-2023"],
      ),
      axisItem(
        "channel-third-party-ecommerce",
        "第三方平台型线上零售",
        basis,
        "综合、内容或社交电商的店铺经营主体和成交口径如何区分？",
        liveValidation,
        ["nbs-retail-format-definition-2023"],
      ),
      axisItem(
        "channel-specialty-retail",
        "专业有店铺零售",
        basis,
        "美妆专业店、集合店和药房是否应按经营范围进一步拆分？",
        liveValidation,
        ["nbs-retail-format-definition-2023"],
      ),
      axisItem(
        "channel-general-offline-retail",
        "综合有店铺零售",
        basis,
        "百货、购物中心柜台、商超等综合零售的覆盖如何核验？",
        liveValidation,
        ["nbs-retail-format-definition-2023"],
        ["渠道清单是研究假设，不表示市场份额或增长。"],
      ),
    ],
    consumerNeeds: [
      axisItem(
        "need-efficacy",
        "功效与问题解决",
        basis,
        "哪些功效诉求能由评论、调研和搜索信号共同支持？",
      ),
      axisItem(
        "need-safety-tolerance",
        "安全、温和与耐受",
        basis,
        "敏感、刺激和成分顾虑在不同人群中如何表现？",
      ),
      axisItem(
        "need-experience",
        "肤感、便利性与使用体验",
        basis,
        "质地、气味、包装和使用步骤影响哪些购买或复购问题？",
      ),
      axisItem(
        "need-trust",
        "成分透明、专业背书与信任",
        basis,
        "消费者如何验证成分、功效、专业背书和品牌承诺？",
      ),
    ],
    businessModels: [
      axisItem(
        "business-model-brand",
        "自有品牌与品牌直营",
        basis,
        "直营、分销和平台销售分别如何构成收入与成本？",
      ),
      axisItem(
        "business-model-oem-odm",
        "OEM/ODM 与供应链服务",
        basis,
        "代工企业的客户结构、能力边界和议价因素是什么？",
      ),
      axisItem(
        "business-model-retail",
        "零售与平台模式",
        basis,
        "集合零售、平台和经销模式如何赚钱并控制选品？",
      ),
      axisItem(
        "business-model-service",
        "专业服务与内容驱动模式",
        basis,
        "咨询、检测、内容和会员服务是否形成独立商业模式？",
      ),
    ],
  };
}

function isSkincare(industry: string) {
  const normalized = industry.trim().toLowerCase();
  return normalized.includes("护肤") || normalized.includes("skincare");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedInput(input: IndustryPlanningInput): IndustryPlanningInput {
  const normalized = {
    industry: input.industry.trim(),
    market: input.market.trim(),
    timeRange: input.timeRange.trim(),
    researchGoals: input.researchGoals
      .map((goal) => goal.trim())
      .filter(Boolean),
    constraints: (input.constraints ?? [])
      .map((constraint) => constraint.trim())
      .filter(Boolean),
  };
  if (!normalized.industry) throw new Error("industry_required");
  if (!normalized.market) throw new Error("market_required");
  if (!normalized.timeRange) throw new Error("time_range_required");
  if (normalized.researchGoals.length === 0) {
    throw new Error("research_goal_required");
  }
  return normalized;
}

function createResearchModules(): IndustryResearchModule[] {
  return [
    {
      id: "market_landscape",
      name: "市场规模与结构",
      researchQuestions: [
        "目标行业的统计定义、规模、增速和主要子市场是什么？",
        "不同来源的口径、时间和地区是否可比？",
      ],
      allowedSourceRoles: [
        "government_statistics",
        "industry_association",
        "credible_research_institution",
        "financial_report",
      ],
      targetClaimRoles: ["market_size_growth"],
      coverageTargets: ["至少两类独立权威来源", "记录统计口径、地区和时间"],
      status: "blocked_missing_evidence",
      evidenceGaps: ["尚未采集任何市场规模、增速或结构证据。"],
    },
    {
      id: "regulation_and_standards",
      name: "监管与标准",
      researchQuestions: [
        "目标市场适用的分类、准入、标签、宣称和安全要求是什么？",
        "哪些产品或功效属于高风险监管问题？",
      ],
      allowedSourceRoles: ["regulator", "standards_body"],
      targetClaimRoles: ["regulation_standard"],
      coverageTargets: ["至少一个监管原文来源", "覆盖分类、宣称和安全问题"],
      status: "blocked_missing_evidence",
      evidenceGaps: ["尚未采集目标市场监管和标准原文。"],
    },
    {
      id: "consumer_demand",
      name: "消费者需求与痛点",
      researchQuestions: [
        "消费者在不同使用场景中要解决哪些问题？",
        "需求信号是否跨评论、社区、调研或搜索来源重复出现？",
      ],
      allowedSourceRoles: [
        "consumer_review",
        "public_community",
        "user_research",
        "search_trend",
      ],
      targetClaimRoles: ["consumer_need"],
      coverageTargets: ["至少两种需求来源角色", "区分个案、信号和总体结论"],
      status: "blocked_missing_evidence",
      evidenceGaps: ["尚未采集可支持消费者需求的直接证据。"],
    },
    {
      id: "ecommerce_competitor_research",
      name: "电商竞品研究",
      researchQuestions: [
        "代表性品牌如何定位产品、组织价格带和渠道？",
        "产品、官网结构和零售展示能支持哪些品牌级结论？",
      ],
      allowedSourceRoles: [
        "brand_official_site",
        "official_store",
        "trusted_retail_channel",
      ],
      targetClaimRoles: ["brand_positioning_product"],
      coverageTargets: [
        "跨子市场、价格带和渠道抽样",
        "每个样本保留唯一来源绑定",
      ],
      status: "blocked_missing_evidence",
      evidenceGaps: ["尚未按覆盖矩阵选择或采集代表性竞品样本。"],
    },
    {
      id: "content_and_traffic",
      name: "内容与流量生态",
      researchQuestions: [
        "目标行业的内容主题、形式、创作者和搜索趋势如何变化？",
        "哪些指标只能表示曝光或互动，不能外推转化？",
      ],
      allowedSourceRoles: ["content_platform", "creator_data", "search_trend"],
      targetClaimRoles: ["content_traffic_trend"],
      coverageTargets: ["覆盖至少两种内容或流量来源", "按平台记录指标定义"],
      status: "blocked_missing_evidence",
      evidenceGaps: ["尚未采集内容、创作者或搜索趋势数据。"],
    },
    {
      id: "business_model_and_supply_chain",
      name: "商业模式与供应链",
      researchQuestions: [
        "代表性参与者如何获得收入、承担成本并连接上下游？",
        "哪些盈利或供应链判断需要财报或多方证据？",
      ],
      allowedSourceRoles: [
        "financial_report",
        "company_material",
        "industry_media",
        "supply_chain_company",
      ],
      targetClaimRoles: ["business_model_supply_chain"],
      coverageTargets: [
        "覆盖产业链上下游",
        "盈利判断必须优先使用财报或等价证据",
      ],
      status: "blocked_missing_evidence",
      evidenceGaps: ["尚未采集商业模式、财报或供应链证据。"],
    },
  ];
}

function createCoverageMatrix(params: {
  modules: IndustryResearchModule[];
  axes: Pick<
    IndustryPlan,
    | "taxonomy"
    | "valueChain"
    | "priceTiers"
    | "channels"
    | "consumerNeeds"
    | "businessModels"
  >;
  regulationAndRiskQuestions: string[];
}): IndustryCoverageMatrixRow[] {
  const { modules, axes, regulationAndRiskQuestions } = params;
  const moduleById = (moduleId: IndustryResearchModule["id"]) => {
    const module = modules.find((item) => item.id === moduleId);
    if (!module) throw new Error(`industry_plan_module_missing:${moduleId}`);
    return module;
  };
  const row = (input: {
    id: string;
    moduleId: IndustryResearchModule["id"];
    axisType: IndustryCoverageAxisType;
    axisItemIds: string[];
    dimension: string;
    minIndependentSources: number;
    minSourceRoles: number;
    minRepresentativeSamples: number;
    requirements: string[];
  }): IndustryCoverageMatrixRow => {
    const module = moduleById(input.moduleId);
    const targetBasis =
      input.axisType === "regulation"
        ? "primary_authority_minimum"
        : input.minRepresentativeSamples > 0
          ? "representative_sampling_guardrail"
          : "triangulation_guardrail";
    const calibrationRationale =
      targetBasis === "primary_authority_minimum"
        ? "监管问题至少需要一个有管辖权的现行原文；数量是最低门槛，不代表已完成法律审查。"
        : targetBasis === "representative_sampling_guardrail"
          ? "来源交叉验证之外还要求跨轴样本；数量用于阻止单样本外推，不宣称统计代表性。"
          : "至少两个独立来源用于发现口径冲突；数量是三角校验护栏，不宣称统计充分性。";
    return {
      id: input.id,
      moduleId: input.moduleId,
      axisType: input.axisType,
      axisItemIds: input.axisItemIds,
      dimension: input.dimension,
      allowedSourceRoles: module.allowedSourceRoles,
      targetCoverage: {
        minIndependentSources: input.minIndependentSources,
        minSourceRoles: input.minSourceRoles,
        minRepresentativeSamples: input.minRepresentativeSamples,
        targetBasis,
        calibrationRationale,
        requirements: input.requirements,
      },
      currentCoverage: {
        independentSourceCount: 0,
        sourceRoles: [],
        representativeSampleIds: [],
      },
      status: "not_started",
      gaps: module.evidenceGaps,
    };
  };

  return [
    row({
      id: "coverage-market-taxonomy",
      moduleId: "market_landscape",
      axisType: "taxonomy",
      axisItemIds: axes.taxonomy.map((item) => item.id),
      dimension: "监管分类维度与商业市场结构的口径转换",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: 0,
      requirements: [
        "五个监管分类维度需要保留正式来源绑定",
        "商业子市场必须另行定义，不能直接等同监管分类",
        "记录地区和时间范围",
      ],
    }),
    row({
      id: "coverage-market-price-tiers",
      moduleId: "market_landscape",
      axisType: "price_tier",
      axisItemIds: axes.priceTiers.map((item) => item.id),
      dimension: "价格带结构",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: 0,
      requirements: ["价格带必须按目标市场和可比口径校准"],
    }),
    row({
      id: "coverage-market-channels",
      moduleId: "market_landscape",
      axisType: "channel",
      axisItemIds: axes.channels.map((item) => item.id),
      dimension: "渠道结构",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: 0,
      requirements: ["区分渠道存在、销售规模和增长结论"],
    }),
    row({
      id: "coverage-regulation",
      moduleId: "regulation_and_standards",
      axisType: "regulation",
      axisItemIds: regulationAndRiskQuestions.map(
        (_question, index) => `regulation-question-${index + 1}`,
      ),
      dimension: "监管与风险问题",
      minIndependentSources: 1,
      minSourceRoles: 1,
      minRepresentativeSamples: 0,
      requirements: ["每个高风险问题至少绑定一个监管或标准原文"],
    }),
    row({
      id: "coverage-consumer-needs",
      moduleId: "consumer_demand",
      axisType: "consumer_need",
      axisItemIds: axes.consumerNeeds.map((item) => item.id),
      dimension: "消费者需求与痛点",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: 2,
      requirements: ["区分个案、重复信号和总体需求结论"],
    }),
    row({
      id: "coverage-competitor-taxonomy",
      moduleId: "ecommerce_competitor_research",
      axisType: "taxonomy",
      axisItemIds: axes.taxonomy.map((item) => item.id),
      dimension: "竞品分类组合覆盖",
      minIndependentSources: 2,
      minSourceRoles: 1,
      minRepresentativeSamples: Math.min(3, axes.taxonomy.length),
      requirements: ["竞品样本不得只覆盖单一功效、人群或剂型组合"],
    }),
    row({
      id: "coverage-competitor-price-tiers",
      moduleId: "ecommerce_competitor_research",
      axisType: "price_tier",
      axisItemIds: axes.priceTiers.map((item) => item.id),
      dimension: "竞品价格带覆盖",
      minIndependentSources: 2,
      minSourceRoles: 1,
      minRepresentativeSamples: Math.min(3, axes.priceTiers.length),
      requirements: ["至少覆盖多个待校准价格带"],
    }),
    row({
      id: "coverage-competitor-channels",
      moduleId: "ecommerce_competitor_research",
      axisType: "channel",
      axisItemIds: axes.channels.map((item) => item.id),
      dimension: "竞品渠道覆盖",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: Math.min(3, axes.channels.length),
      requirements: ["样本不得只来自单一平台或品牌官网"],
    }),
    row({
      id: "coverage-content-channels",
      moduleId: "content_and_traffic",
      axisType: "channel",
      axisItemIds: axes.channels.map((item) => item.id),
      dimension: "内容与流量渠道覆盖",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: 2,
      requirements: ["按平台记录指标定义，不能把互动外推为转化"],
    }),
    row({
      id: "coverage-supply-chain",
      moduleId: "business_model_and_supply_chain",
      axisType: "value_chain",
      axisItemIds: axes.valueChain.map((item) => item.id),
      dimension: "产业链环节覆盖",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: Math.min(3, axes.valueChain.length),
      requirements: ["产业链上下游均需代表性参与者和独立来源"],
    }),
    row({
      id: "coverage-business-models",
      moduleId: "business_model_and_supply_chain",
      axisType: "business_model",
      axisItemIds: axes.businessModels.map((item) => item.id),
      dimension: "商业模式覆盖",
      minIndependentSources: 2,
      minSourceRoles: 2,
      minRepresentativeSamples: Math.min(3, axes.businessModels.length),
      requirements: ["盈利判断优先使用财报或等价证据"],
    }),
  ];
}

export function canSourceRoleSupportClaimRole(
  plan: Pick<IndustryPlan, "sourceRolePolicy">,
  sourceRole: IndustryPlanSourceRole,
  claimRole: IndustryPlanClaimRole,
) {
  return Boolean(
    plan.sourceRolePolicy
      .find((entry) => entry.sourceRole === sourceRole)
      ?.allowedClaimRoles.includes(claimRole),
  );
}

export function createIndustryPlan(
  rawInput: IndustryPlanningInput,
): IndustryPlan {
  const input = normalizedInput(rawInput);
  const axes = isSkincare(input.industry)
    ? skincareAxes()
    : genericAxes(input.industry);
  const researchModules = createResearchModules();
  const planId = `industry-plan-${stableHash(JSON.stringify(input))}`;
  const regulationAndRiskQuestions = [
    `在${input.market}，${input.industry}适用哪些分类、准入、标签和宣传规则？`,
    "哪些功效、成分、人群或渠道属于高风险监管问题？",
    "哪些标准或监管要求在研究时间范围内发生变化？",
  ];

  return {
    schemaVersion: industryPlanSchemaVersion,
    artifactType: "industry-plan",
    plannerVersion: "deterministic.v1",
    planId,
    inputCoordinates: input,
    planningCalibration: createPlanningCalibration(input),
    scope: {
      definition: `${input.industry}作为完整行业进入研究规划；内部拆解不改变用户输入的行业层级。`,
      inclusions: [
        "行业分类、产业链、价格带、渠道、消费者需求和商业模式的研究规划",
        "监管、竞品、内容流量和来源角色覆盖规划",
      ],
      exclusions: [
        "规划阶段不产出市场规模、增速、需求强度或机会确定性",
        "跨行业案例不计为目标行业竞争者",
      ],
      unresolvedQuestions: [
        "监管分类维度已按中国大陆正式规则校准，但商业子市场仍需要真实来源和样本定义。",
        "价格带、渠道份额、需求强度、商业模式覆盖和代表性样本需要后续证据校准。",
      ],
      factStatus: "planning_scope_not_external_evidence",
    },
    ...axes,
    regulationAndRiskQuestions,
    researchQuestions: [
      ...input.researchGoals.map((goal) => `如何用可追溯证据回答：${goal}？`),
      "行业分类、产业链、价格带和渠道应如何定义并交叉验证？",
      "哪些结论仍缺少合适来源角色或代表性样本？",
    ],
    researchModules,
    sourceRolePolicy: industrySourceRolePolicy,
    coverageMatrix: createCoverageMatrix({
      modules: researchModules,
      axes,
      regulationAndRiskQuestions,
    }),
    representativeSamplingPlan: {
      dimensions: [
        "taxonomy",
        "value_chain",
        "price_tier",
        "channel",
        "consumer_need",
        "business_model",
      ],
      coverageRequirements: {
        minSamplesPerTaxonomyItem: 1,
        minCoveredPriceTiers: Math.min(3, axes.priceTiers.length),
        minCoveredChannels: Math.min(3, axes.channels.length),
        minCoveredBusinessModels: Math.min(3, axes.businessModels.length),
      },
      rules: [
        "每个产品样本必须记录功效、作用部位、剂型、人群和使用方法中适用的分类维度，不能由随机搜索结果决定行业结构。",
        "竞品样本跨价格带和渠道选择，并记录选择理由。",
        "跨行业案例只能标记为 business-model analogy，不能计入竞争者覆盖。",
        "没有来源和覆盖证据时 selectedSamples 保持为空。",
      ],
      status: "not_started",
      selectedSamples: [],
      uncoveredAxisItemIds: [
        ...axes.taxonomy,
        ...axes.valueChain,
        ...axes.priceTiers,
        ...axes.channels,
        ...axes.consumerNeeds,
        ...axes.businessModels,
      ].map((item) => item.id),
    },
    budget: {
      liveProviderCalls: 0,
      livePublicRequests: 0,
      mode: "offline_planning_only",
    },
    risks: [
      "确定性分类种子可能不完整，必须由权威来源和后续研究校准。",
      "品牌官网和营销材料容易被错误外推为行业规模、需求或盈利结论。",
      "大行业如果不按模块和覆盖矩阵分阶段执行，可能超出同步运行预算。",
    ],
    stopConditions: [
      "来源角色不足以支持目标 claim role 时停止确认结论。",
      "代表性样本无法覆盖关键分类轴时停止生成综合判断。",
      "必须修改生产环境、调用 live provider 或放宽证据门禁时停止当前阶段。",
    ],
    evidenceGaps: researchModules.flatMap((module) => module.evidenceGaps),
    plannerStatus: "planned_with_gaps",
    assertions: {
      externalFactsProduced: false,
      marketSizeProduced: false,
      growthRateProduced: false,
      demandStrengthProduced: false,
      opportunityCertaintyProduced: false,
    },
  };
}

export function serializeIndustryPlan(plan: IndustryPlan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
