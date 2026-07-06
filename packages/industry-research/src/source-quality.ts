import type {
  CrawlPlanTarget,
  RawDocument,
  ResearchWorkflowInput,
  SourceQuality,
  SourceQualityLevel,
  SourceQualityType,
} from "./types";

type SourceQualityInput = {
  target: CrawlPlanTarget;
  input: ResearchWorkflowInput;
  title: string;
  url: string;
  extractedText: string;
};

export type SourceQualitySummary = {
  total: number;
  acceptedForReport: number;
  rejectedForReport: number;
  bySourceType: Record<SourceQualityType, number>;
  byRelevance: Record<SourceQualityLevel, number>;
  byConfidence: Record<SourceQualityLevel, number>;
  lowQualityDocumentIds: string[];
};

const emptyLevelCounts = {
  high: 0,
  medium: 0,
  low: 0,
} satisfies Record<SourceQualityLevel, number>;

const emptyTypeCounts = {
  official_site: 0,
  product_page: 0,
  collection_page: 0,
  blog: 0,
  sitemap: 0,
  robots: 0,
  search_candidate: 0,
  manual_text: 0,
  csv: 0,
  rss: 0,
  content_api: 0,
  unknown: 0,
} satisfies Record<SourceQualityType, number>;

const weakHomepageHostnameParts = [
  "wabei.",
  "qcc.",
  "tianyancha.",
  "itjuzi.",
  "36kr.",
  "huxiu.",
  "iresearch.",
  "sohu.",
  "sina.",
  "163.com",
  "qq.com",
  "baidu.",
  "zhihu.",
  "bilibili.",
  "douyin.",
  "toutiao.",
  "ifeng.",
  "jd.com",
  "taobao.",
  "tmall.",
  "1688.",
  "pinduoduo.",
  "alibaba.",
  "aliexpress.",
];

const weakHomepageTitleTerms = [
  "新闻",
  "资讯",
  "快讯",
  "财经",
  "证券",
  "股票",
  "信披",
  "企业信息",
  "百科",
  "问答",
  "社区",
  "论坛",
  "门户",
  "头条",
];

function hostnameFor(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isWeakHomepageSource(input: SourceQualityInput) {
  const hostname = hostnameFor(input.url || input.target.target);
  if (
    weakHomepageHostnameParts.some((part) =>
      hostname.includes(part.toLowerCase()),
    )
  ) {
    return true;
  }

  const title = input.title.toLowerCase();
  const titleLooksWeak = weakHomepageTitleTerms.some((term) =>
    title.includes(term.toLowerCase()),
  );

  return titleLooksWeak && !includesAny(title, relevanceTerms(input.input));
}

function inferSourceType(input: SourceQualityInput): SourceQualityType {
  const { target } = input;

  if (
    (target.kind === "homepage" ||
      target.kind === "product" ||
      target.kind === "collection" ||
      target.kind === "blog") &&
    isWeakHomepageSource(input)
  ) {
    return "unknown";
  }

  switch (target.kind) {
    case "homepage":
      return "official_site";
    case "product":
      return "product_page";
    case "collection":
      return "collection_page";
    case "blog":
      return "blog";
    case "sitemap":
      return "sitemap";
    case "robots":
      return "robots";
    case "search_results":
      return "search_candidate";
    case "review_csv":
      return "csv";
    case "rss":
      return "rss";
    default:
      return "unknown";
  }
}

function includesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase();

  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function relevanceTerms(input: ResearchWorkflowInput) {
  return [
    input.industry,
    input.category,
    input.market,
    ...input.industry.split(/\s+|\/|,|，/),
    ...input.category.split(/\s+|\/|,|，/),
    ...input.market.split(/\s+|\/|,|，/),
  ]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function scoreRelevance({
  input,
  title,
  extractedText,
  target,
}: SourceQualityInput): SourceQualityLevel {
  if (target.kind === "robots" || target.kind === "sitemap") {
    return "medium";
  }

  const text = `${title}\n${target.target}\n${extractedText}`;
  const terms = relevanceTerms(input);
  const hasCategorySignal = includesAny(text, terms);
  const hasCommerceSignal = includesAny(text, [
    "shop",
    "product",
    "products",
    "collection",
    "collections",
    "best sellers",
    "reviews",
    "bundle",
    "subscription",
    "购买",
    "商品",
    "品牌",
    "官网",
  ]);

  if (hasCategorySignal && hasCommerceSignal) {
    return "high";
  }

  if (hasCategorySignal || hasCommerceSignal || extractedText.length >= 800) {
    return "medium";
  }

  return "low";
}

function scoreConfidence(
  { target, url, extractedText }: SourceQualityInput,
  sourceType: SourceQualityType,
): SourceQualityLevel {
  if (sourceType === "unknown") {
    return "low";
  }

  if (target.kind === "robots") {
    return "low";
  }

  if (target.kind === "sitemap") {
    return extractedText.length >= 80 ? "medium" : "low";
  }

  if (target.kind === "homepage" && url.startsWith("https://")) {
    return extractedText.length >= 400 ? "high" : "medium";
  }

  if (
    (target.kind === "product" ||
      target.kind === "collection" ||
      target.kind === "blog" ||
      target.kind === "rss") &&
    extractedText.length >= 300
  ) {
    return "high";
  }

  return extractedText.length >= 160 ? "medium" : "low";
}

function reviewReason(
  sourceType: SourceQualityType,
  relevance: SourceQualityLevel,
  confidence: SourceQualityLevel,
) {
  if (sourceType === "robots") {
    return "robots.txt 只能证明公开采集边界，不能直接支撑业务结论。";
  }

  if (sourceType === "sitemap") {
    return "sitemap 适合发现 URL 结构，业务结论需要商品页、首页或内容页交叉验证。";
  }

  if (sourceType === "search_candidate") {
    return "公开搜索候选页只能用于发现待抓取 URL，不能直接支撑报告结论。";
  }

  if (sourceType === "unknown") {
    return "来源像平台、门户、资讯、百科或企业信息聚合页，不应直接作为品牌官网证据进入报告。";
  }

  if (relevance === "low") {
    return "文本与目标行业、品类或市场相关性不足，不能进入已确认发现。";
  }

  if (confidence === "low") {
    return "页面内容过短或来源类型较弱，需要人工复核后再用于报告结论。";
  }

  if (relevance === "medium" || confidence === "medium") {
    return "来源可用于候选发现，但仍需人工确认页面含义和业务外推边界。";
  }

  return "来源与目标问题相关度较高，可进入候选报告，但交付前仍需人工复核。";
}

export function assessSourceQuality(input: SourceQualityInput): SourceQuality {
  const sourceType = inferSourceType(input);
  const sourceRelevance = scoreRelevance(input);
  const sourceConfidence = scoreConfidence(input, sourceType);
  const acceptedForReport =
    sourceRelevance !== "low" &&
    sourceConfidence !== "low" &&
    sourceType !== "robots" &&
    sourceType !== "sitemap" &&
    sourceType !== "search_candidate" &&
    sourceType !== "unknown";

  return {
    sourceType,
    sourceRelevance,
    sourceConfidence,
    needsReviewReason: reviewReason(
      sourceType,
      sourceRelevance,
      sourceConfidence,
    ),
    acceptedForReport,
  };
}

export function summarizeSourceQuality(
  rawDocuments: RawDocument[],
): SourceQualitySummary {
  const bySourceType = { ...emptyTypeCounts };
  const byRelevance = { ...emptyLevelCounts };
  const byConfidence = { ...emptyLevelCounts };

  for (const document of rawDocuments) {
    bySourceType[document.sourceQuality.sourceType] += 1;
    byRelevance[document.sourceQuality.sourceRelevance] += 1;
    byConfidence[document.sourceQuality.sourceConfidence] += 1;
  }

  return {
    total: rawDocuments.length,
    acceptedForReport: rawDocuments.filter(
      (document) => document.sourceQuality.acceptedForReport,
    ).length,
    rejectedForReport: rawDocuments.filter(
      (document) => !document.sourceQuality.acceptedForReport,
    ).length,
    bySourceType,
    byRelevance,
    byConfidence,
    lowQualityDocumentIds: rawDocuments
      .filter(
        (document) =>
          document.sourceQuality.sourceRelevance === "low" ||
          document.sourceQuality.sourceConfidence === "low",
      )
      .map((document) => document.id),
  };
}
