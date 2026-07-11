import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import type {
  ExtractionJob,
  RawDocument,
  ResearchSource,
  ResearchWorkflowInput,
} from "./types";

export const AMAZON_PUBLIC_EVIDENCE_ENABLED_ENV =
  "AGENT_FACTORY_AMAZON_PUBLIC_EVIDENCE_ENABLED";

const defaultMaxCandidateAsins = 6;
const defaultMaxAcceptedPages = 3;
const defaultRequestTimeoutMs = 20_000;
const jinaReaderBaseUrl = "https://r.jina.ai/";

export type AmazonCategoryFit = "direct" | "adjacent" | "irrelevant";

export type AmazonPublicPage = {
  asin: string;
  url: string;
  title: string;
  brand: string;
  price: string;
  rating: string;
  reviewCount: string;
  bullets: string[];
  reviewSnippets: string[];
  categoryFit: AmazonCategoryFit;
  blocked: boolean;
  fieldCoverage: number;
};

export type AmazonPublicEvidenceOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: PublicCrawlerFetch;
  /** 最多探测多少个搜索候选；通过门禁后最多仍只写入 3 个商品页。 */
  maxAsins?: number;
  requestTimeoutMs?: number;
};

export type AmazonPublicEvidenceResult = {
  sources: ResearchSource[];
  raw_documents: RawDocument[];
  extraction_jobs: ExtractionJob[];
  pages: AmazonPublicPage[];
  discoveredAsins: string[];
  probedAsins: string[];
  reviewedAsinCount: number;
  requestCount: number;
  notes: string[];
};

function defaultFetcher(): PublicCrawlerFetch {
  return (input, init) => fetch(input, init);
}

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function cleanLine(value: string) {
  return value
    .replace(/^[-*#>\s]+/, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\\([|_*])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function amazonAsinFromUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      !/(^|\.)amazon\.(?:com|ca|co\.uk|de|fr|it|es|co\.jp)$/i.test(url.hostname)
    ) {
      return "";
    }

    return (
      url.pathname
        .match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]
        ?.toUpperCase() ?? ""
    );
  } catch {
    return "";
  }
}

export function canonicalAmazonUrl(asin: string) {
  return `https://www.amazon.com/dp/${asin}`;
}

export function discoverAmazonAsinsFromMarkdown(markdown: string) {
  return unique(
    (markdown.match(/https:\/\/www\.amazon\.com\/[^\s)]+/g) ?? []).map(
      amazonAsinFromUrl,
    ),
  );
}

function normalizeProductTitle(value: string) {
  return cleanLine(value)
    .replace(/^Title:\s*/i, "")
    .replace(/^Amazon\.com\s*:\s*/i, "")
    .replace(
      /\s*:\s*(?:Pet Supplies|Health & Household|Beauty & Personal Care|Home & Kitchen)\s*$/i,
      "",
    )
    .trim();
}

function metadataTitleFromText(text: string) {
  return normalizeProductTitle(/^Title:\s*(.+)$/im.exec(text)?.[1] ?? "");
}

function mainTitleFromText(text: string) {
  const aboutIndex = text.indexOf("# About this item");
  const region =
    aboutIndex >= 0 ? text.slice(0, aboutIndex) : text.slice(0, 10_000);
  const headings = [...region.matchAll(/^#\s+(.+)$/gm)]
    .map((match) => cleanLine(match[1] ?? ""))
    .filter(
      (heading) =>
        heading.length >= 20 &&
        !/product summary presents|unlock|choose how often|skip or cancel|potential savings|pricing|added to cart/i.test(
          heading,
        ),
    );

  return headings.at(-1) ?? "";
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return cleanLine(match[1]);
  }

  return "";
}

function extractBullets(text: string) {
  const marker = "# About this item";
  const start = text.indexOf(marker);
  if (start < 0) return [];
  const afterMarker = text.slice(start + marker.length, start + 4_000);
  const nextHeading = afterMarker.search(/\n#{1,4}\s+/);
  const section =
    nextHeading >= 0 ? afterMarker.slice(0, nextHeading) : afterMarker;

  return unique(
    section
      .split(/\n+/)
      .filter((line) => /^\s*-\s+/.test(line))
      .map(cleanLine)
      .filter(
        (line) =>
          line.length >= 35 &&
          line.length <= 420 &&
          !/^(?:image|video|click|see more|report an issue)/i.test(line),
      ),
  ).slice(0, 6);
}

function extractReviewSnippets(text: string) {
  const markerMatch = /### Top reviews[^\n]*/i.exec(text);
  if (markerMatch?.index === undefined) return [];
  const afterMarker = text.slice(
    markerMatch.index + markerMatch[0].length,
    markerMatch.index + markerMatch[0].length + 40_000,
  );
  const nextHeading = afterMarker.search(/\n#{2,3}\s+/);
  const reviewSection =
    nextHeading >= 0 ? afterMarker.slice(0, nextHeading) : afterMarker;
  const rejected =
    /^(?:helpful|report|read more|verified purchase|reviewed in|size:|style:|color:|sort reviews|filter by|loading|there was a problem|see more reviews|customer image|brief content|full content|beginning of dialog|images in this review|amazon customer|sorry|thank you|thanks|sending feedback|sponsored|video|video player|current time|duration|loaded:|remaining time|stream type|chapters|descriptions|captions|english|default|\d+x$|\d+ people? found this helpful|\d(?:\.\d)? out of 5 stars)/i;

  const reviewHeadings = [...reviewSection.matchAll(/^#####\s+(.+)$/gm)];
  if (reviewHeadings.length > 0) {
    return unique(
      reviewHeadings.map((heading, index) => {
        const blockStart = heading.index ?? 0;
        const blockEnd =
          reviewHeadings[index + 1]?.index ?? reviewSection.length;
        const block = reviewSection.slice(blockStart, blockEnd);
        const reviewTitle = cleanLine(heading[1] ?? "");
        const paragraphs = unique(
          block
            .split(/\n{2,}|\r?\n/)
            .map(cleanLine)
            .filter(
              (line) =>
                line !== reviewTitle &&
                line.length >= 30 &&
                !rejected.test(line) &&
                /[.!?。！？]/.test(line) &&
                !/^!\[|^\|/.test(line) &&
                !/https?:\/\//i.test(line),
            ),
        );
        const body = paragraphs.join(" ").slice(0, 1_000).trim();
        return body ? `${reviewTitle}: ${body}` : "";
      }),
    ).slice(0, 8);
  }

  return unique(
    reviewSection
      .split(/\n{2,}|\r?\n/)
      .map(cleanLine)
      .filter(
        (line) =>
          line.length >= 45 &&
          line.length <= 700 &&
          !rejected.test(line) &&
          /[.!?。！？]/.test(line) &&
          !/^!\[|^\|/.test(line) &&
          !/https?:\/\//i.test(line),
      ),
  ).slice(0, 8);
}

function petProbioticCategoryFit(title: string): AmazonCategoryFit {
  const normalized = title.toLowerCase();
  const primaryTitle = normalized.slice(0, 120);
  const hasProbiotic = /probiotic|prebiotic/.test(normalized);
  const hasPet = /dog|cat|pet|canine|feline/.test(normalized);
  if (!hasProbiotic || !hasPet) return "irrelevant";
  if (/probiotic|prebiotic/.test(primaryTitle)) return "direct";
  return "adjacent";
}

function categoryFitFor(title: string, input: ResearchWorkflowInput) {
  if (supportsAmazonPublicEvidence(input)) {
    return petProbioticCategoryFit(title);
  }

  return "irrelevant" as const;
}

export function supportsAmazonPublicEvidence(input: ResearchWorkflowInput) {
  const category = `${input.industry}\n${input.category}`.toLowerCase();
  return (
    (category.includes("益生菌") || category.includes("宠物肠胃")) &&
    /宠物|犬|狗|猫|pet|dog|cat/.test(category)
  );
}

export function amazonSearchTerm(input: ResearchWorkflowInput) {
  if (supportsAmazonPublicEvidence(input)) {
    return "dog probiotics digestive health";
  }

  return [input.category, input.market].filter(Boolean).join(" ");
}

export function parseAmazonPublicPage(
  url: string,
  text: string,
  input: ResearchWorkflowInput,
  title = "",
): AmazonPublicPage {
  const asin = amazonAsinFromUrl(url);
  const lines = text.split(/\n+/).map(cleanLine).filter(Boolean);
  const heading = lines.find(
    (line) =>
      line.length >= 15 &&
      line.length <= 240 &&
      !/amazon|skip to|deliver to|search/i.test(line),
  );
  const parsedTitle =
    normalizeProductTitle(title) ||
    metadataTitleFromText(text) ||
    mainTitleFromText(text) ||
    heading ||
    "";
  const brand = firstMatch(text, [
    /^\|\s*Brand\s*\|\s*([^|\n]+)\|/im,
    /(?:Brand|品牌)\s*[:|]\s*([^\n|]{2,100})/i,
    /Visit the\s+([^\n]{2,100}?)\s+Store/i,
  ]);
  const aboutIndex = text.indexOf("# About this item");
  const mainProductRegion = text.slice(0, aboutIndex > 0 ? aboutIndex : 8_000);
  const price = firstMatch(mainProductRegion, [
    /One-Time Price:\s*((?:US)?\$\s?\d[\d,]*(?:\.\d{2})?)/i,
    /"displayPrice":"((?:US)?\$\d[\d,]*(?:\.\d{2})?)"/i,
    /(?:Price|价格)\s*[:|]?\s*((?:US)?\$\s?\d[\d,]*(?:\.\d{2})?)/i,
    /((?:US)?\$\s?\d[\d,]*(?:\.\d{2})?)/i,
  ]);
  const rating = firstMatch(text, [
    /\|\s*Customer Reviews\s*\|\s*(\d(?:\.\d)?)\s*_[^\n]*averageCustomerReviewsAnchor/i,
    /(\d(?:\.\d)?)\s+out of 5 stars/i,
    /(\d(?:\.\d)?)\s*\/\s*5/i,
  ]);
  const reviewCount = firstMatch(text, [
    /\|\s*Customer Reviews\s*\|[^\n]*?\[\((\d[\d,]*)\)\]\([^\n]*averageCustomerReviewsAnchor/i,
    /([\d,]+)\s+(?:global\s+)?ratings?/i,
    /([\d,]+)\s+(?:customer\s+)?reviews?/i,
  ]);
  const bullets = extractBullets(text);
  const reviewSnippets = extractReviewSnippets(text);
  const blocked =
    /robot check|enter the characters|sorry! something went wrong|service unavailable|api error|captcha/i.test(
      text,
    );
  const fields = [
    Boolean(asin),
    Boolean(parsedTitle),
    Boolean(brand),
    Boolean(price),
    Boolean(rating),
    Boolean(reviewCount),
    bullets.length > 0,
  ];

  return {
    asin,
    url,
    title: parsedTitle,
    brand,
    price,
    rating,
    reviewCount,
    bullets,
    reviewSnippets,
    categoryFit: categoryFitFor(parsedTitle, input),
    blocked,
    fieldCoverage: fields.filter(Boolean).length / fields.length,
  };
}

function formatPageEvidence(page: AmazonPublicPage) {
  return [
    "Amazon marketplace product evidence",
    `Product title: ${page.title}`,
    `ASIN: ${page.asin}`,
    page.brand && `Brand: ${page.brand}`,
    page.price && `Observed price: ${page.price}`,
    page.rating && `Observed rating: ${page.rating} out of 5 stars`,
    page.reviewCount && `Observed review count: ${page.reviewCount}`,
    ...page.bullets.map((bullet) => `Product bullet: ${bullet}`),
    ...page.reviewSnippets.map(
      (review) => `Customer review excerpt: ${review}`,
    ),
    "Boundary: price, rating and review count are point-in-time observations; review excerpts are a visible sample, not a representative survey.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchJinaMarkdown(
  url: string,
  fetcher: PublicCrawlerFetch,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(`${jinaReaderBaseUrl}${url}`, {
      signal: controller.signal,
      headers: { Accept: "text/markdown" },
    });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function createExtractionJobs(
  projectId: string,
  rawDocument: RawDocument,
): ExtractionJob[] {
  return rawDocument.databaseTargets.map((databaseName) => ({
    id: `extract-${rawDocument.id}-${databaseName}`,
    projectId,
    rawDocumentId: rawDocument.id,
    targetDatabase: databaseName,
    status: "needs_review",
    extractedCount: 1,
    summary: `amazon_public_evidence 已抽取 ${rawDocument.title}，等待 LLM/人工写入 ${databaseName}。`,
  }));
}

function emptyResult(notes: string[]): AmazonPublicEvidenceResult {
  return {
    sources: [],
    raw_documents: [],
    extraction_jobs: [],
    pages: [],
    discoveredAsins: [],
    probedAsins: [],
    reviewedAsinCount: 0,
    requestCount: 0,
    notes,
  };
}

export async function collectAmazonPublicEvidence(
  projectId: string,
  input: ResearchWorkflowInput,
  options: AmazonPublicEvidenceOptions = {},
): Promise<AmazonPublicEvidenceResult> {
  const env = options.env ?? {};
  if (!isTruthy(env[AMAZON_PUBLIC_EVIDENCE_ENABLED_ENV])) {
    return emptyResult([
      "amazon_public_evidence 未启用，跳过 Amazon 专用证据轨。",
    ]);
  }
  if (!supportsAmazonPublicEvidence(input)) {
    return emptyResult([
      "amazon_public_evidence 当前只对已通过 canary 的宠物益生菌品类启用，其他品类保持关闭。",
    ]);
  }

  const fetcher = options.fetcher ?? defaultFetcher();
  const maxAsins = Math.min(
    defaultMaxCandidateAsins,
    Math.max(1, Math.round(options.maxAsins ?? defaultMaxCandidateAsins)),
  );
  const timeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
  const query = amazonSearchTerm(input);
  let requestCount = 1;
  const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  const searchMarkdown = await fetchJinaMarkdown(searchUrl, fetcher, timeoutMs);
  const discoveredAsins = discoverAmazonAsinsFromMarkdown(searchMarkdown).slice(
    0,
    maxAsins,
  );

  if (discoveredAsins.length === 0) {
    return {
      ...emptyResult([
        "amazon_public_evidence 未发现 ASIN；已停止详情抓取，不进入报告证据。",
      ]),
      requestCount,
    };
  }

  const pages: AmazonPublicPage[] = [];
  const probedAsins: string[] = [];
  for (const asin of discoveredAsins) {
    const url = canonicalAmazonUrl(asin);
    probedAsins.push(asin);
    requestCount += 1;
    const markdown = await fetchJinaMarkdown(url, fetcher, timeoutMs);
    if (!markdown) continue;
    pages.push(parseAmazonPublicPage(url, markdown, input));

    const acceptedSoFar = pages.filter(
      (page) =>
        !page.blocked &&
        page.categoryFit === "direct" &&
        page.fieldCoverage >= 0.7,
    );
    const reviewedAsinsSoFar = new Set(
      acceptedSoFar
        .filter((page) => page.reviewSnippets.length > 0)
        .map((page) => page.asin),
    ).size;
    if (
      acceptedSoFar.length >= defaultMaxAcceptedPages &&
      reviewedAsinsSoFar >= 2
    ) {
      break;
    }
  }

  const acceptedPages = pages.filter(
    (page) =>
      !page.blocked &&
      page.categoryFit === "direct" &&
      page.fieldCoverage >= 0.7,
  );
  const selectedPages = [...acceptedPages]
    .sort(
      (left, right) =>
        Number(right.reviewSnippets.length > 0) -
          Number(left.reviewSnippets.length > 0) ||
        right.reviewSnippets.length - left.reviewSnippets.length ||
        right.fieldCoverage - left.fieldCoverage,
    )
    .slice(0, defaultMaxAcceptedPages);
  const sources: ResearchSource[] = [];
  const rawDocuments: RawDocument[] = [];
  const extractionJobs: ExtractionJob[] = [];
  const databaseTargets: RawDocument["databaseTargets"] = [
    "competitor_database",
    "product_database",
    "keyword_database",
    "pain_point_database",
    "opportunity_database",
  ];

  for (const [index, page] of selectedPages.entries()) {
    const ordinal = index + 1;
    const sourceId = `amazon-public-source-${ordinal}`;
    const rawDocumentId = `amazon-public-raw-document-${ordinal}`;
    const extractedText = formatPageEvidence(page);
    sources.push({
      id: sourceId,
      projectId,
      type: "url",
      title: `Amazon 商品证据：${page.title.slice(0, 80)}`,
      value: page.url,
      automationHint: "amazon_public_evidence_jina",
      priority: "high",
    });
    const rawDocument: RawDocument = {
      id: rawDocumentId,
      projectId,
      sourceId,
      crawlRunId: `amazon-public-run-${ordinal}`,
      url: page.url,
      title: page.title,
      contentType: "text",
      excerpt: extractedText.slice(0, 160),
      originalText: extractedText,
      extractedText,
      databaseTargets,
      sourceQuality: {
        sourceType: "product_page",
        sourceRelevance: "high",
        sourceConfidence: page.reviewSnippets.length > 0 ? "high" : "medium",
        needsReviewReason:
          "Amazon 公开商品页的时点快照；商品字段和可见评论原文可作为候选证据，但销量、代表性和市场份额不可外推。",
        acceptedForReport: true,
      },
    };
    rawDocuments.push(rawDocument);
    extractionJobs.push(...createExtractionJobs(projectId, rawDocument));
  }

  const reviewCount = selectedPages.reduce(
    (sum, page) => sum + page.reviewSnippets.length,
    0,
  );
  const reviewedAsinCount = new Set(
    selectedPages
      .filter((page) => page.reviewSnippets.length > 0)
      .map((page) => page.asin),
  ).size;
  const notes = [
    `amazon_public_evidence 发现 ${discoveredAsins.length} 个 ASIN，探测 ${probedAsins.length} 个，${acceptedPages.length} 个通过品类与字段质量门禁，写入 ${selectedPages.length} 个。`,
    `amazon_public_evidence 提取 ${reviewCount} 条公开评论摘录，覆盖 ${reviewedAsinCount} 个 ASIN；仅允许逐字证据引用，不允许推断评论代表性、销量或市场份额。`,
  ];

  return {
    sources,
    raw_documents: rawDocuments,
    extraction_jobs: extractionJobs,
    pages,
    discoveredAsins,
    probedAsins,
    reviewedAsinCount,
    requestCount,
    notes,
  };
}
