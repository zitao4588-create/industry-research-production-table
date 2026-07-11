import {
  crawlWithFirecrawl,
  type FirecrawlCrawlDocument,
  mapWithFirecrawl,
  resolveFirecrawlConfig,
} from "./firecrawl-provider";
import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import {
  resolveSearchProviderConfig,
  type SearchProviderConfig,
  searchWithApiProvider,
} from "./search-providers";
import {
  resolveSourceRegistryMatches,
  type SourceRegistryMatch,
} from "./source-registry";
import type {
  CrawlPlan,
  CrawlPlanTarget,
  CrawlTargetKind,
  IndustryResearchDatabaseName,
  ResearchWorkflowInput,
  SourceDiscoveryCandidate,
  SourceDiscoveryMethod,
} from "./types";

export type PublicSourceDiscoveryOptions = {
  fetcher?: PublicCrawlerFetch;
  maxDiscoveredTargets?: number;
  maxProbeUrls?: number;
  maxSitemapUrls?: number;
  maxSearchQueries?: number;
  maxSearchResultsPerQuery?: number;
  firecrawlMapEnabled?: boolean;
  maxFirecrawlMapSites?: number;
  maxFirecrawlMapLinksPerSite?: number;
  firecrawlCrawlFallbackEnabled?: boolean;
  maxFirecrawlCrawlSites?: number;
  maxFirecrawlCrawlPagesPerSite?: number;
  requestTimeoutMs?: number;
  searchEndpoint?: string;
  /** 搜索 provider 解析用 env；核心包不读 process.env，由调用方显式传入。 */
  env?: Record<string, string | undefined>;
  /** 显式指定搜索 provider（测试或调用方覆盖 env 解析）。 */
  searchProvider?: SearchProviderConfig;
};

export type PublicSourceDiscoveryResult = {
  candidates: SourceDiscoveryCandidate[];
  targets: CrawlPlanTarget[];
  prefetchedDocuments: FirecrawlCrawlDocument[];
  notes: string[];
};

type FetchResult = {
  url: string;
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
};

const defaultMaxDiscoveredTargets = 32;
const defaultMaxProbeUrls = 24;
const defaultMaxSitemapUrls = 20;
const defaultMaxSearchQueries = 3;
const defaultMaxSearchResultsPerQuery = 5;
const defaultMaxFirecrawlMapSites = 2;
const defaultMaxFirecrawlMapLinksPerSite = 30;
const defaultMaxFirecrawlCrawlSites = 1;
const defaultMaxFirecrawlCrawlPagesPerSite = 4;
const defaultRequestTimeoutMs = 8_000;
const defaultSearchEndpoint = "https://duckduckgo.com/html/";
// 平衡各类目标的入选上限，避免 homepage/robots/sitemap 按 rank 排序时
// 把 product/collection/blog 全部挤出 maxDiscoveredTargets。
const perKindDiscoveryCaps: Partial<Record<CrawlTargetKind, number>> = {
  homepage: 6,
  robots: 4,
  sitemap: 4,
  product: 8,
  collection: 8,
  blog: 6,
  rss: 4,
};
const evidenceDiversityOrder: CrawlTargetKind[] = [
  "product",
  "collection",
  "blog",
  "rss",
];
const trackingSearchParams = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
]);
const ignoredSearchHostnames = new Set([
  "duckduckgo.com",
  "www.duckduckgo.com",
  "google.com",
  "www.google.com",
  "bing.com",
  "www.bing.com",
  "search.yahoo.com",
  "yahoo.com",
  "www.yahoo.com",
]);
const ignoredCandidateHostnameParts = [
  "facebook.",
  "instagram.",
  "tiktok.",
  "youtube.",
  "youtu.be",
  "linkedin.",
  "pinterest.",
  "reddit.",
  "twitter.",
  "x.com",
  "amazon.",
  "ebay.",
  "walmart.",
  "target.",
  "jd.com",
  "taobao.",
  "tmall.",
  "1688.",
  "pinduoduo.",
  "yangkeduo.",
  "alibaba.",
  "aliexpress.",
  "sohu.",
  "sina.",
  "163.com",
  "qq.com",
  "weibo.",
  "zhihu.",
  "baidu.",
  "bilibili.",
  "douyin.",
  "toutiao.",
  "ifeng.",
];
const ignoredPathExtensionPattern =
  /\.(avif|bmp|css|gif|ico|jpeg|jpg|js|mp3|mp4|pdf|png|svg|webp|zip)(?:$|\?)/i;
const ignoredMappedPathPattern =
  /\/(?:account|cart|checkout|login|register|privacy|terms|legal|policies|search|language|locale)(?:\/|[._-]|$)/i;

function defaultFetcher(): PublicCrawlerFetch {
  return (input, init) => fetch(input, init);
}

function normalizeUrls(urls: string[]) {
  return urls.map((url) => url.trim()).filter(Boolean);
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function toOriginUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}/`;
  } catch {
    return "";
  }
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function canonicalUrlKey(value: string) {
  const normalized = normalizeDiscoveredUrl(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const search = [...url.searchParams.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}=${item}`)
      .join("&");
    return `${url.protocol}//${hostname}${pathname}${search ? `?${search}` : ""}`;
  } catch {
    return normalized;
  }
}

function uniqueCanonicalUrls(values: string[]) {
  const byKey = new Map<string, string>();

  for (const value of values) {
    const normalized = normalizeDiscoveredUrl(value);
    const key = canonicalUrlKey(normalized);
    if (normalized && key && !byKey.has(key)) byKey.set(key, normalized);
  }

  return [...byKey.values()];
}

function createSearchQueries(input: ResearchWorkflowInput) {
  return unique([
    `${input.category} 品牌 官网 official brand website 竞品 ${input.market}`,
    `${input.category} competitor DTC brand official store product review ${input.market}`,
    `${input.industry} ${input.category} independent brand store collection product blog ${input.market}`,
    `${input.category} best seller brand reviews comparison ${input.market}`,
  ]);
}

function createFirecrawlMapSearch(input: ResearchWorkflowInput) {
  return unique([
    input.category,
    "产品 商品 系列 类目 选购 指南",
    "product collection category catalog blog guide faq reviews",
  ]).join(" ");
}

function createSearchUrl(query: string, endpoint: string) {
  try {
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    return url.toString();
  } catch {
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}q=${encodeURIComponent(query)}`;
  }
}

function hostnameFor(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeDiscoveredUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";

    for (const param of trackingSearchParams) {
      url.searchParams.delete(param);
    }

    return url.toString();
  } catch {
    return "";
  }
}

function isIgnoredCandidateHostname(hostname: string) {
  return ignoredCandidateHostnameParts.some((part) => hostname.includes(part));
}

function isUsefulPublicCandidateUrl(value: string) {
  const normalized = normalizeDiscoveredUrl(value);

  if (!normalized || !isPublicHttpUrl(normalized)) {
    return false;
  }

  const hostname = hostnameFor(normalized);

  return (
    !ignoredSearchHostnames.has(hostname) &&
    !isIgnoredCandidateHostname(hostname) &&
    !ignoredPathExtensionPattern.test(normalized)
  );
}

function canonicalHostname(value: string) {
  return hostnameFor(value).replace(/^www\./, "");
}

function isUsefulMappedUrl(value: string, originUrl: string) {
  const normalized = normalizeDiscoveredUrl(value);

  return (
    isUsefulPublicCandidateUrl(normalized) &&
    canonicalHostname(normalized) === canonicalHostname(originUrl) &&
    !ignoredMappedPathPattern.test(targetPathFor(normalized))
  );
}

function decodeSearchResultHref(value: string, baseUrl: string) {
  const absolute = absoluteUrl(cleanText(value), baseUrl);

  if (!absolute) {
    return "";
  }

  try {
    const url = new URL(absolute);
    const duckDuckGoTarget = url.searchParams.get("uddg");

    return duckDuckGoTarget ? decodeURIComponent(duckDuckGoTarget) : absolute;
  } catch {
    return absolute;
  }
}

function extractSearchResultUrls(body: string, baseUrl: string) {
  return unique(
    [...body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => decodeSearchResultHref(match[1] ?? "", baseUrl))
      .map(normalizeDiscoveredUrl)
      .filter(isUsefulPublicCandidateUrl),
  );
}

function cleanText(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function targetPathFor(value: string) {
  try {
    return decodeURIComponent(new URL(value).pathname).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function isRootLikePath(value: string) {
  const path = targetPathFor(value).replace(/\/+$/, "") || "/";
  return (
    path === "/" ||
    /^\/(?:cn|zh|zh-cn|en|en-us|en-gb|ja|jp|de|fr|h5)$/i.test(path)
  );
}

function isShellIndexPath(value: string) {
  const path = targetPathFor(value).replace(/\/+$/, "") || "/";
  return /^\/(?:news|blog|blogs|article|articles|search|media|press)$/i.test(
    path,
  );
}

function inferTargetKind(url: string): CrawlTargetKind {
  const normalizedPath = targetPathFor(url);

  if (normalizedPath.endsWith("/robots.txt")) {
    return "robots";
  }

  if (normalizedPath.includes("sitemap") && normalizedPath.includes(".xml")) {
    return "sitemap";
  }

  if (
    /\/(?:rss|atom|feeds?)(?:[./]|$)/i.test(normalizedPath) ||
    /\.(?:rss|atom)$/i.test(normalizedPath)
  ) {
    return "rss";
  }

  if (
    /\/(?:products?|items?|goods)(?:\/|\.json|[._-]|$)/i.test(normalizedPath)
  ) {
    return "product";
  }

  if (
    /\/(?:collections?|categor(?:y|ies)|catalog|shops?)(?:\/|[._-]|$)/i.test(
      normalizedPath,
    ) ||
    /\/product-(?:categor(?:y|ies)|lists?)(?:\/|[._-]|$)/i.test(normalizedPath)
  ) {
    return "collection";
  }

  if (
    /\/(?:blogs?|articles?|news|guides?|faqs?|reviews?|testimonials?|resources?|learn)(?:\/|[._-]|$)/i.test(
      normalizedPath,
    )
  ) {
    return "blog";
  }

  return "homepage";
}

function inferFirecrawlMapKind(link: {
  url: string;
  title?: string;
  description?: string;
}): CrawlTargetKind {
  const urlKind = inferTargetKind(link.url);

  if (isRootLikePath(link.url)) {
    return "homepage";
  }

  if (urlKind !== "homepage") {
    return urlKind;
  }

  const text =
    `${link.url}\n${link.title ?? ""}\n${link.description ?? ""}`.toLowerCase();

  if (
    /(blog|article|news|guide|faq|review|testimonial|resource|learn|博客|文章|新闻|指南|评测|问答)/i.test(
      text,
    )
  ) {
    return "blog";
  }

  if (
    /(collection|category|catalog|shop all|all products|系列|类目|分类|商品一覧|カテゴリー)/i.test(
      text,
    )
  ) {
    return "collection";
  }

  if (/(product|item|model|产品|商品|型号|製品)/i.test(text)) {
    return "product";
  }

  return "homepage";
}

function methodForKind(kind: CrawlTargetKind): SourceDiscoveryMethod {
  switch (kind) {
    case "robots":
      return "robots";
    case "rss":
      return "rss";
    case "sitemap":
      return "sitemap";
    case "collection":
    case "product":
    case "blog":
      return "shopify_public_endpoint";
    default:
      return "seed_url";
  }
}

function sourceTypeForKind(
  kind: CrawlTargetKind,
): SourceDiscoveryCandidate["sourceType"] {
  if (kind === "rss") {
    return "rss";
  }

  if (kind === "homepage") {
    return "url";
  }

  return "crawler";
}

function databaseTargetsForKind(
  kind: CrawlTargetKind,
): IndustryResearchDatabaseName[] {
  switch (kind) {
    case "robots":
      return ["source_database", "website_structure_database"];
    case "rss":
      return [
        "source_database",
        "content_database",
        "weekly_intelligence_reports",
      ];
    case "sitemap":
      return [
        "source_database",
        "website_structure_database",
        "product_database",
        "content_database",
      ];
    case "product":
      return ["product_database", "keyword_database", "opportunity_database"];
    case "collection":
      return [
        "website_structure_database",
        "product_database",
        "keyword_database",
      ];
    case "blog":
      return ["content_database", "keyword_database", "pain_point_database"];
    default:
      return [
        "competitor_database",
        "website_structure_database",
        "content_database",
      ];
  }
}

function titleForKind(kind: CrawlTargetKind) {
  switch (kind) {
    case "robots":
      return "robots.txt 公开采集边界";
    case "sitemap":
      return "站点地图发现 URL";
    case "rss":
      return "RSS / Atom 内容更新入口";
    case "collection":
      return "Shopify collection 公开入口";
    case "product":
      return "公开产品页面或产品 JSON";
    case "blog":
      return "公开博客和内容页";
    default:
      return "公开首页入口";
  }
}

function reasonForKind(kind: CrawlTargetKind) {
  switch (kind) {
    case "robots":
      return "记录公开采集边界和 sitemap 入口，辅助合规判断。";
    case "sitemap":
      return "从 sitemap 中提取产品、内容和站点结构 URL。";
    case "rss":
      return "为内容库和周报库建立持续监控入口。";
    case "collection":
      return "识别分类、best sellers、bundle 和 tag 体系。";
    case "product":
      return "抽取产品命名、卖点、组合装和关键词信号。";
    case "blog":
      return "抽取教育内容、购买指南和用户痛点线索。";
    default:
      return "拆解首页导航、卖点、信任背书和转化路径。";
  }
}

function commonProbeUrls(seedUrl: string) {
  const origin = toOriginUrl(seedUrl);

  if (!origin) {
    return [];
  }

  return [
    origin,
    absoluteUrl("/robots.txt", origin),
    absoluteUrl("/sitemap.xml", origin),
    absoluteUrl("/sitemap_index.xml", origin),
  ];
}

function extractRobotsSitemaps(body: string, baseUrl: string) {
  return body
    .split(/\r?\n/)
    .map((line) => /^sitemap:\s*(.+)$/i.exec(line.trim())?.[1] ?? "")
    .map((url) => absoluteUrl(url.trim(), baseUrl))
    .filter(Boolean);
}

/**
 * 解析 robots.txt 的 Disallow 路径前缀（对所有 User-agent 一律尊重，
 * 比只看 `*` 更保守）。带通配符的规则截断到首个 `*`；截断后不足以构成
 * 有效前缀的规则跳过，避免把整站误判为禁抓。
 */
function extractRobotsDisallows(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => /^disallow:\s*(.*)$/i.exec(line.trim())?.[1]?.trim() ?? "")
    .map((path) => path.split("*")[0] ?? "")
    .filter((path) => path.startsWith("/") && path.length > 1);
}

function isDisallowedByRobots(
  url: string,
  disallowsByOrigin: Map<string, string[]>,
) {
  try {
    const parsed = new URL(url);
    const disallows = disallowsByOrigin.get(parsed.origin) ?? [];
    return disallows.some((prefix) => parsed.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

/**
 * 按类平衡选择发现结果：perKindDiscoveryCaps 是每类硬上限，
 * 保证 product/collection/blog/rss 的多样性，不被单一类目挤占，
 * 也控制单域抓取体量；总量不超过 maxTotal。
 */
type TargetKindResolver = (url: string) => CrawlTargetKind;
type TargetScoreResolver = (url: string) => number;

function selectBalancedDiscoveredUrls(
  urls: string[],
  maxTotal: number,
  preferredUrls: string[] = [],
  resolveKind: TargetKindResolver = inferTargetKind,
) {
  const selected: string[] = [];
  const selectedSet = new Set<string>();
  const availableUrls = new Set(urls);
  const kindCounts: Partial<Record<CrawlTargetKind, number>> = {};

  const trySelect = (url: string) => {
    if (
      selected.length >= maxTotal ||
      selectedSet.has(url) ||
      !availableUrls.has(url)
    ) {
      return;
    }

    const kind = resolveKind(url);
    const cap = perKindDiscoveryCaps[kind] ?? maxTotal;
    const count = kindCounts[kind] ?? 0;

    if (count < cap) {
      kindCounts[kind] = count + 1;
      selected.push(url);
      selectedSet.add(url);
    }
  };

  // 先为可形成正文证据的深层页面各保留一个名额，再保留固定可信来源；
  // robots/sitemap 等元数据入口只在剩余预算中补位。
  for (const kind of evidenceDiversityOrder) {
    const url = urls.find((candidate) => resolveKind(candidate) === kind);

    if (url) {
      trySelect(url);
    }
  }

  for (const url of preferredUrls) {
    trySelect(url);
  }

  for (const url of urls) {
    trySelect(url);
  }

  return selected;
}

function categoryDiscoveryTerms(input: ResearchWorkflowInput) {
  const compact = `${input.category} ${input.industry}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const terms = compact.split(/\s+/).filter((term) => term.length >= 2);

  for (const term of [...terms]) {
    if (!/[\p{Script=Han}]/u.test(term)) continue;
    for (let size = 2; size <= Math.min(5, term.length); size += 1) {
      for (let index = 0; index <= term.length - size; index += 1) {
        terms.push(term.slice(index, index + size));
      }
    }
  }

  return [...new Set(terms)];
}

function scoreEvidenceCandidate(
  url: string,
  kind: CrawlTargetKind,
  input: ResearchWorkflowInput,
  metadataText = "",
) {
  const baseScore: Record<CrawlTargetKind, number> = {
    product: 100,
    collection: 90,
    blog: 80,
    rss: 35,
    homepage: 20,
    sitemap: 5,
    robots: 0,
    review_csv: 0,
    search_results: 0,
  };
  const path = targetPathFor(url);
  const depth = path.split("/").filter(Boolean).length;
  const haystack = `${decodeURIComponent(path)} ${metadataText}`.toLowerCase();
  const categoryMatch = categoryDiscoveryTerms(input).some((term) =>
    haystack.includes(term),
  );
  let score = baseScore[kind] + Math.min(depth, 4) * 4;

  if (categoryMatch) score += 30;
  if (isRootLikePath(url)) score -= 60;
  if (isShellIndexPath(url)) score -= 45;
  if (/\/(?:products?|collections?|faqs?|guides?)\/[^/]+/i.test(path)) {
    score += 15;
  }

  return score;
}

function selectEvidenceFirstDiscoveredUrls(
  urls: string[],
  maxTotal: number,
  preferredUrls: string[],
  resolveKind: TargetKindResolver,
  resolveScore: TargetScoreResolver,
) {
  const candidates = uniqueCanonicalUrls(urls).sort(
    (left, right) =>
      resolveScore(right) - resolveScore(left) ||
      left.length - right.length ||
      left.localeCompare(right),
  );
  const selected: string[] = [];
  const selectedKeys = new Set<string>();
  const perHostCounts = new Map<string, number>();
  const candidateHosts = new Set(
    candidates.map(canonicalHostname).filter(Boolean),
  );
  const singleHost = candidateHosts.size <= 1;
  const generalPerHostCap = singleHost ? maxTotal : 3;
  const deepPerHostCap = singleHost ? maxTotal : 2;
  const reservedNonDeepSlots = maxTotal >= 7 ? 3 : maxTotal >= 3 ? 2 : 0;
  const deepBudget = Math.max(1, Math.min(6, maxTotal - reservedNonDeepSlots));

  const trySelect = (url: string, perHostCap: number) => {
    if (selected.length >= maxTotal) return false;
    const key = canonicalUrlKey(url);
    const host = canonicalHostname(url);
    if (!key || !host || selectedKeys.has(key)) return false;
    if ((perHostCounts.get(host) ?? 0) >= perHostCap) return false;

    selected.push(url);
    selectedKeys.add(key);
    perHostCounts.set(host, (perHostCounts.get(host) ?? 0) + 1);
    return true;
  };

  const evidenceCandidates = candidates.filter((url) =>
    evidenceDiversityOrder.includes(resolveKind(url)),
  );

  // 先覆盖商品、集合、内容和 RSS 等最低证据形态，避免商品页挤满配额。
  for (const kind of evidenceDiversityOrder) {
    if (selected.length >= deepBudget) break;
    if (selected.some((url) => resolveKind(url) === kind)) continue;
    const bestForKind = evidenceCandidates.find(
      (url) => resolveKind(url) === kind,
    );
    if (bestForKind) trySelect(bestForKind, maxTotal);
  }

  // 再给尚未覆盖的品牌保留一个最优证据型深页。
  for (const host of candidateHosts) {
    if (selected.length >= deepBudget) break;
    if (selected.some((url) => canonicalHostname(url) === host)) continue;
    const bestForHost = evidenceCandidates.find(
      (url) => canonicalHostname(url) === host,
    );
    if (bestForHost) trySelect(bestForHost, deepPerHostCap);
  }

  // 最后用剩余深页预算补高分候选。
  for (const url of evidenceCandidates) {
    if (selected.length >= deepBudget) break;
    trySelect(url, deepPerHostCap);
  }

  // 然后每个品牌最多保留一个首页；registry 首页只作为品牌入口。
  for (const url of uniqueCanonicalUrls(preferredUrls)) {
    if (resolveKind(url) !== "homepage") continue;
    trySelect(url, maxTotal);
  }

  // robots 与 sitemap 只保留为发现/边界审计，不挤占证据型深页预算。
  for (const kind of ["robots", "sitemap"] as const) {
    const bestForKind = candidates.find((url) => resolveKind(url) === kind);
    if (bestForKind) trySelect(bestForKind, maxTotal);
  }

  for (const url of candidates) {
    trySelect(url, generalPerHostCap);
  }

  return selected;
}

function extractXmlLocUrls(body: string) {
  return [...body.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanText(match[1] ?? ""))
    .map(normalizeDiscoveredUrl)
    .filter(isUsefulPublicCandidateUrl);
}

function extractFeedLinks(body: string, baseUrl: string) {
  return [...body.matchAll(/<link[^>]*>([\s\S]*?)<\/link>/gi)]
    .map((match) => cleanText(match[1] ?? ""))
    .map((url) => absoluteUrl(url, baseUrl))
    .map(normalizeDiscoveredUrl)
    .filter(isUsefulPublicCandidateUrl);
}

function extractHtmlDiscoveryLinks(body: string, baseUrl: string) {
  const links = [
    ...body.matchAll(
      /<link[^>]+(?:rel=["'][^"']*alternate[^"']*["'][^>]+href=["']([^"']+)["']|href=["']([^"']+)["'][^>]+rel=["'][^"']*alternate[^"']*["'])/gi,
    ),
    ...body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi),
  ];

  return links
    .map((match) => match[1] ?? match[2] ?? "")
    .map((url) => absoluteUrl(url, baseUrl))
    .map(normalizeDiscoveredUrl)
    .filter(isUsefulPublicCandidateUrl)
    .filter((url) => inferTargetKind(url) !== "homepage");
}

function formatKindMix(
  urls: string[],
  resolveKind: TargetKindResolver = inferTargetKind,
) {
  const counts = urls.reduce<Partial<Record<CrawlTargetKind, number>>>(
    (summary, url) => {
      const kind = resolveKind(url);
      summary[kind] = (summary[kind] ?? 0) + 1;
      return summary;
    },
    {},
  );
  const orderedKinds: CrawlTargetKind[] = [
    "homepage",
    "robots",
    "sitemap",
    "product",
    "collection",
    "blog",
    "rss",
  ];

  return orderedKinds.map((kind) => `${kind}:${counts[kind] ?? 0}`).join(" / ");
}

async function fetchPublicUrl(
  url: string,
  fetcher: PublicCrawlerFetch,
  requestTimeoutMs = defaultRequestTimeoutMs,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetcher(url, {
      headers: {
        "User-Agent":
          "AgentFactoryIndustryResearch/0.1 (+public source discovery)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        url,
        ok: false,
        status: response.status,
        body: "",
        contentType: response.headers?.get("content-type") ?? "",
      };
    }

    return {
      url,
      ok: true,
      status: response.status,
      body: await response.text(),
      contentType: response.headers?.get("content-type") ?? "",
    };
  } catch {
    return {
      url,
      ok: false,
      status: 0,
      body: "",
      contentType: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function searchQueryWithDuckDuckGoHtml(
  query: string,
  endpoint: string,
  fetcher: PublicCrawlerFetch,
  requestTimeoutMs: number,
  maxResults: number,
) {
  const searchUrl = createSearchUrl(query, endpoint);
  const result = await fetchPublicUrl(searchUrl, fetcher, requestTimeoutMs);

  if (!result.ok) {
    return { ok: false as const, urls: [] };
  }

  return {
    ok: true as const,
    urls: extractSearchResultUrls(result.body, result.url).slice(0, maxResults),
  };
}

async function discoverSearchResultUrls(
  input: ResearchWorkflowInput,
  fetcher: PublicCrawlerFetch,
  options: PublicSourceDiscoveryOptions,
) {
  const maxSearchQueries = options.maxSearchQueries ?? defaultMaxSearchQueries;
  const maxSearchResultsPerQuery =
    options.maxSearchResultsPerQuery ?? defaultMaxSearchResultsPerQuery;
  const requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
  const providerConfig =
    options.searchProvider ?? resolveSearchProviderConfig(options.env ?? {});
  const ddgEndpoint = options.searchEndpoint ?? defaultSearchEndpoint;
  const queries = createSearchQueries(input).slice(0, maxSearchQueries);
  const discoveredUrls: string[] = [];
  const notes: string[] = [];
  let usedApiProvider = false;
  let usedDdgFallback = false;

  if (providerConfig.fallbackReason) {
    notes.push(`public_search_discovery：${providerConfig.fallbackReason}`);
  }

  for (const query of queries) {
    if (providerConfig.provider !== "duckduckgo_html") {
      const apiResult = await searchWithApiProvider(
        providerConfig,
        query,
        fetcher,
        { maxResults: maxSearchResultsPerQuery, timeoutMs: requestTimeoutMs },
      );

      if (apiResult.ok) {
        usedApiProvider = true;
        discoveredUrls.push(
          ...apiResult.urls
            .map(normalizeDiscoveredUrl)
            .filter(isUsefulPublicCandidateUrl),
        );
        continue;
      }

      notes.push(
        `public_search_discovery ${providerConfig.provider} 查询失败（${apiResult.error ?? "unknown"}），该 query 回退 DDG HTML：${query}`,
      );
    }

    const ddgResult = await searchQueryWithDuckDuckGoHtml(
      query,
      ddgEndpoint,
      fetcher,
      requestTimeoutMs,
      maxSearchResultsPerQuery,
    );

    if (!ddgResult.ok) {
      notes.push(`public_search_discovery 搜索失败：${query}`);
      continue;
    }

    usedDdgFallback = true;
    discoveredUrls.push(...ddgResult.urls);
  }

  const uniqueDiscoveredUrls = unique(discoveredUrls);
  const providerLabel = usedApiProvider
    ? usedDdgFallback
      ? `${providerConfig.provider}+duckduckgo_html`
      : providerConfig.provider
    : "duckduckgo_html";

  notes.push(
    uniqueDiscoveredUrls.length > 0
      ? `public_search_discovery 自动发现 ${uniqueDiscoveredUrls.length} 个候选公开 URL（provider=${providerLabel}），后续只保守探测公开品牌/商家官网首页、robots 和 sitemap；RSS、collection、product、blog/FAQ/reviews 仅从页面或 sitemap 真实链接进入采集。`
      : `public_search_discovery 未发现可用候选 URL（provider=${providerLabel}）；需要补充种子 URL 或接入更稳定的搜索 API。`,
  );

  return {
    urls: uniqueDiscoveredUrls,
    notes,
  };
}

function createCandidate(
  projectId: string,
  id: string,
  kind: CrawlTargetKind,
  url: string,
  registryMatch?: SourceRegistryMatch,
  discoveryMethod?: SourceDiscoveryMethod,
): SourceDiscoveryCandidate {
  return {
    id,
    projectId,
    sourceType: sourceTypeForKind(kind),
    method:
      discoveryMethod ??
      (registryMatch ? "source_registry" : methodForKind(kind)),
    title: registryMatch
      ? `固定可信来源：${registryMatch.name}`
      : titleForKind(kind),
    seed: url,
    priority:
      kind === "homepage" || kind === "sitemap" || kind === "collection"
        ? "high"
        : "medium",
    expectedDatabases: databaseTargetsForKind(kind),
    complianceBoundary:
      "只使用公开 http/https URL，不绕过登录、验证码、付费墙，不采集私人数据。",
    status: "discovered",
  };
}

function createTarget(
  projectId: string,
  candidateId: string,
  id: string,
  kind: CrawlTargetKind,
  url: string,
  registryMatch?: SourceRegistryMatch,
  discoveryMethod?: SourceDiscoveryMethod,
): CrawlPlanTarget {
  return {
    id,
    projectId,
    candidateId,
    kind,
    target: url,
    reason: registryMatch
      ? `固定可信来源注册表命中 ${registryMatch.name}，优先抽取官网公开页面。`
      : discoveryMethod === "firecrawl_map"
        ? "Firecrawl Map 从候选官网公开 sitemap/链接中发现的证据型深页；仍需正文抽取与 sourceQuality 复核。"
        : reasonForKind(kind),
    maxPages: kind === "sitemap" || kind === "rss" ? 20 : 3,
    databaseTargets: databaseTargetsForKind(kind),
  };
}

export async function discoverPublicSources(
  projectId: string,
  input: ResearchWorkflowInput,
  crawlPlan: CrawlPlan,
  options: PublicSourceDiscoveryOptions = {},
): Promise<PublicSourceDiscoveryResult> {
  const fetcher = options.fetcher ?? defaultFetcher();
  const maxDiscoveredTargets =
    options.maxDiscoveredTargets ?? defaultMaxDiscoveredTargets;
  const maxProbeUrls = options.maxProbeUrls ?? defaultMaxProbeUrls;
  const maxSitemapUrls = options.maxSitemapUrls ?? defaultMaxSitemapUrls;
  const maxFirecrawlMapSites =
    options.maxFirecrawlMapSites ?? defaultMaxFirecrawlMapSites;
  const maxFirecrawlMapLinksPerSite =
    options.maxFirecrawlMapLinksPerSite ?? defaultMaxFirecrawlMapLinksPerSite;
  const maxFirecrawlCrawlSites =
    options.maxFirecrawlCrawlSites ?? defaultMaxFirecrawlCrawlSites;
  const maxFirecrawlCrawlPagesPerSite =
    options.maxFirecrawlCrawlPagesPerSite ??
    defaultMaxFirecrawlCrawlPagesPerSite;
  const firecrawlMapLinkLimit = Math.max(
    1,
    Math.min(100, Math.round(maxFirecrawlMapLinksPerSite)),
  );
  const requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
  const firecrawlConfig = resolveFirecrawlConfig(options.env ?? {});
  const firecrawlMapEnabled =
    options.firecrawlMapEnabled ?? firecrawlConfig.mapEnabled;
  const firecrawlCrawlFallbackEnabled =
    options.firecrawlCrawlFallbackEnabled ??
    firecrawlConfig.crawlFallbackEnabled;
  const searchDiscovery = await discoverSearchResultUrls(
    input,
    fetcher,
    options,
  );
  const registryMatches = resolveSourceRegistryMatches(
    input,
    options.env ?? {},
  );
  const registryUrls = registryMatches
    .map((match) => normalizeDiscoveredUrl(match.url))
    .filter(isUsefulPublicCandidateUrl);
  const registryMatchByUrl = new Map(
    registryMatches
      .map((match) => [canonicalUrlKey(match.url), match] as const)
      .filter(([url]) => isUsefulPublicCandidateUrl(url)),
  );
  const existingTargets = new Set(
    crawlPlan.targets
      .map((target) => canonicalUrlKey(target.target) || target.target)
      .filter(Boolean),
  );
  const seedUrls = uniqueCanonicalUrls(
    [
      ...normalizeUrls(input.urls),
      ...registryUrls,
      ...searchDiscovery.urls,
      ...crawlPlan.targets
        .map((target) => target.target)
        .filter(isUsefulPublicCandidateUrl),
    ]
      .map(normalizeDiscoveredUrl)
      .filter(isUsefulPublicCandidateUrl),
  );
  const probeQueue = unique(seedUrls.flatMap(commonProbeUrls));
  const probedUrls = new Set<string>();
  const actualProbeUrls: string[] = [];
  const discoveredUrls: string[] = [];
  const notes: string[] = [];
  const robotsDisallowsByOrigin = new Map<string, string[]>();
  const mappedKindByUrl = new Map<string, CrawlTargetKind>();
  const discoveryMetadataByUrl = new Map<string, string>();
  const mappedUrls = new Set<string>();
  const prefetchedDocuments: FirecrawlCrawlDocument[] = [];
  let reachableProbeCount = 0;
  let failedProbeCount = 0;

  discoveredUrls.push(...registryUrls);

  if (registryUrls.length > 0) {
    notes.push(
      `source_registry 命中 ${registryUrls.length} 个固定可信来源，已优先合并到 crawl plan。`,
    );
  }

  const promoteProbeUrls = (urls: string[]) => {
    const promotableUrls = unique(
      urls
        .map(normalizeDiscoveredUrl)
        .filter(isUsefulPublicCandidateUrl)
        .filter((url) => !probedUrls.has(url)),
    );

    for (const url of [...promotableUrls].reverse()) {
      const queuedIndex = probeQueue.indexOf(url);

      if (queuedIndex >= 0) {
        probeQueue.splice(queuedIndex, 1);
      }

      probeQueue.unshift(url);
    }
  };

  while (probeQueue.length > 0 && actualProbeUrls.length < maxProbeUrls) {
    const url = probeQueue.shift();

    if (!url || probedUrls.has(url)) {
      continue;
    }

    probedUrls.add(url);
    actualProbeUrls.push(url);
    const result = await fetchPublicUrl(url, fetcher, requestTimeoutMs);

    if (!result.ok) {
      failedProbeCount += 1;
      continue;
    }

    reachableProbeCount += 1;
    discoveredUrls.push(normalizeDiscoveredUrl(result.url));

    if (result.url.endsWith("/robots.txt")) {
      const robotsSitemaps = extractRobotsSitemaps(result.body, result.url);
      discoveredUrls.push(...robotsSitemaps);
      promoteProbeUrls(robotsSitemaps);

      const origin = new URL(result.url).origin;
      robotsDisallowsByOrigin.set(origin, [
        ...(robotsDisallowsByOrigin.get(origin) ?? []),
        ...extractRobotsDisallows(result.body),
      ]);
    }

    if (
      result.contentType.includes("xml") ||
      /<(urlset|sitemapindex)\b/i.test(result.body)
    ) {
      const xmlLocUrls = selectBalancedDiscoveredUrls(
        unique(extractXmlLocUrls(result.body)),
        maxSitemapUrls,
      );
      discoveredUrls.push(...xmlLocUrls);
      promoteProbeUrls(
        xmlLocUrls.filter(
          (candidate) => inferTargetKind(candidate) === "sitemap",
        ),
      );
    }

    if (/<(rss|feed)\b/i.test(result.body)) {
      discoveredUrls.push(
        ...extractFeedLinks(result.body, result.url).slice(0, maxSitemapUrls),
      );
    }

    if (result.contentType.includes("html") || /<html\b/i.test(result.body)) {
      discoveredUrls.push(
        ...selectBalancedDiscoveredUrls(
          unique(extractHtmlDiscoveryLinks(result.body, result.url)),
          maxSitemapUrls,
        ),
      );
    }
  }

  let firecrawlMapRequestCount = 0;
  let firecrawlMapSuccessCount = 0;
  let firecrawlMapFailureCount = 0;
  let firecrawlMapDiscoveredCount = 0;
  let firecrawlMapCreditsUsed = 0;
  let firecrawlMapReportedCredits = false;
  let firecrawlCrawlRequestCount = 0;
  let firecrawlCrawlSuccessCount = 0;
  let firecrawlCrawlFailureCount = 0;
  let firecrawlCrawlCreditsUsed = 0;
  let firecrawlCrawlReportedCredits = false;

  if (firecrawlMapEnabled && maxFirecrawlMapSites > 0) {
    if (!firecrawlConfig.apiKey) {
      notes.push(
        "firecrawl_map 已启用但缺少 API key，本轮跳过 Map，不发送无凭据请求。",
      );
    } else {
      const originsWithDeepPages = new Set(
        discoveredUrls
          .filter((url) =>
            evidenceDiversityOrder.includes(inferTargetKind(url)),
          )
          .map(canonicalHostname)
          .filter(Boolean),
      );
      const mapOrigins = unique(seedUrls.map(toOriginUrl))
        .filter(
          (origin) =>
            origin && !originsWithDeepPages.has(canonicalHostname(origin)),
        )
        .slice(0, Math.max(0, Math.round(maxFirecrawlMapSites)));
      const mapSearch = createFirecrawlMapSearch(input);
      const boundedMapConfig = {
        ...firecrawlConfig,
        timeoutMs: Math.min(firecrawlConfig.timeoutMs, requestTimeoutMs),
      };

      for (const origin of mapOrigins) {
        firecrawlMapRequestCount += 1;
        const mapResult = await mapWithFirecrawl(
          origin,
          mapSearch,
          firecrawlMapLinkLimit,
          boundedMapConfig,
          fetcher,
        );

        if (!mapResult.ok) {
          firecrawlMapFailureCount += 1;
          notes.push(
            `firecrawl_map 站内 URL 发现失败：${origin} / ${mapResult.error}`,
          );
          continue;
        }

        firecrawlMapSuccessCount += 1;
        if (mapResult.creditsUsed !== undefined) {
          firecrawlMapReportedCredits = true;
          firecrawlMapCreditsUsed += mapResult.creditsUsed;
        }

        const usefulLinks = mapResult.links
          .slice(0, firecrawlMapLinkLimit)
          .map((link) => ({
            ...link,
            url: normalizeDiscoveredUrl(link.url),
          }))
          .filter((link) => isUsefulMappedUrl(link.url, origin))
          .map((link) => ({
            ...link,
            kind: inferFirecrawlMapKind(link),
          }))
          .filter((link) => evidenceDiversityOrder.includes(link.kind));

        for (const link of usefulLinks) {
          const key = canonicalUrlKey(link.url);
          mappedKindByUrl.set(key, link.kind);
          discoveryMetadataByUrl.set(
            key,
            `${link.title ?? ""} ${link.description ?? ""}`,
          );
          mappedUrls.add(key);
          discoveredUrls.push(link.url);
        }
        firecrawlMapDiscoveredCount += usefulLinks.length;

        if (
          firecrawlCrawlFallbackEnabled &&
          usefulLinks.length < 2 &&
          firecrawlCrawlRequestCount < maxFirecrawlCrawlSites
        ) {
          firecrawlCrawlRequestCount += 1;
          const crawlSeed = usefulLinks[0]?.url ?? origin;
          const crawlPath = targetPathFor(crawlSeed)
            .replace(/^\//, "")
            .replace(/\/[^/]*$/, "");
          const crawlResult = await crawlWithFirecrawl(
            crawlSeed,
            crawlPath ? [`${crawlPath}(?:/.*)?`] : [],
            maxFirecrawlCrawlPagesPerSite,
            boundedMapConfig,
            fetcher,
            { pollIntervalMs: options.fetcher ? 0 : undefined },
          );

          if (!crawlResult.ok) {
            firecrawlCrawlFailureCount += 1;
            notes.push(
              `firecrawl_crawl 受限 fallback 失败：${origin} / ${crawlResult.error}`,
            );
          } else {
            firecrawlCrawlSuccessCount += 1;
            if (crawlResult.creditsUsed !== undefined) {
              firecrawlCrawlReportedCredits = true;
              firecrawlCrawlCreditsUsed += crawlResult.creditsUsed;
            }

            for (const document of crawlResult.documents) {
              if (!isUsefulMappedUrl(document.url, origin)) continue;
              const kind = inferFirecrawlMapKind({
                url: document.url,
                title: document.title,
              });
              if (!evidenceDiversityOrder.includes(kind)) continue;
              const key = canonicalUrlKey(document.url);
              mappedKindByUrl.set(key, kind);
              discoveryMetadataByUrl.set(key, document.title);
              mappedUrls.add(key);
              discoveredUrls.push(document.url);
              prefetchedDocuments.push(document);
            }
          }
        }
      }

      notes.push(
        `firecrawl_map 受限补充完成：请求 ${firecrawlMapRequestCount} 个站点，成功 ${firecrawlMapSuccessCount}，失败 ${firecrawlMapFailureCount}，新增 ${firecrawlMapDiscoveredCount} 个证据型深页${firecrawlMapReportedCredits ? `，provider reported creditsUsed=${firecrawlMapCreditsUsed}` : "，provider 未返回 creditsUsed"}。`,
      );

      if (firecrawlCrawlRequestCount > 0) {
        notes.push(
          `firecrawl_crawl 受限 fallback：请求 ${firecrawlCrawlRequestCount} 个站点，成功 ${firecrawlCrawlSuccessCount}，失败 ${firecrawlCrawlFailureCount}，预抓取 ${prefetchedDocuments.length} 个证据型页面${firecrawlCrawlReportedCredits ? `，provider reported creditsUsed=${firecrawlCrawlCreditsUsed}` : "，provider 未返回 creditsUsed"}。`,
        );
      }
    }
  }

  const resolveDiscoveredKind: TargetKindResolver = (url) =>
    mappedKindByUrl.get(canonicalUrlKey(url)) ?? inferTargetKind(url);
  const resolveDiscoveredScore: TargetScoreResolver = (url) =>
    scoreEvidenceCandidate(
      url,
      resolveDiscoveredKind(url),
      input,
      discoveryMetadataByUrl.get(canonicalUrlKey(url)),
    );

  const rankedDiscoveredUrls = uniqueCanonicalUrls(
    discoveredUrls.map(normalizeDiscoveredUrl),
  )
    .filter(isUsefulPublicCandidateUrl)
    .filter((url) => !existingTargets.has(canonicalUrlKey(url)))
    .sort(
      (left, right) =>
        resolveDiscoveredScore(right) - resolveDiscoveredScore(left) ||
        left.length - right.length ||
        left.localeCompare(right),
    );
  const robotsAllowedUrls = rankedDiscoveredUrls.filter(
    (url) => !isDisallowedByRobots(url, robotsDisallowsByOrigin),
  );
  const robotsFilteredCount =
    rankedDiscoveredUrls.length - robotsAllowedUrls.length;
  const normalizedDiscoveredUrls = selectEvidenceFirstDiscoveredUrls(
    robotsAllowedUrls,
    maxDiscoveredTargets,
    registryUrls,
    resolveDiscoveredKind,
    resolveDiscoveredScore,
  );

  if (robotsFilteredCount > 0) {
    notes.push(
      `public_source_discovery 依据 robots.txt Disallow 跳过 ${robotsFilteredCount} 个发现 URL。`,
    );
  }
  const candidates: SourceDiscoveryCandidate[] = [];
  const targets: CrawlPlanTarget[] = [];

  for (const [index, url] of normalizedDiscoveredUrls.entries()) {
    const kind = resolveDiscoveredKind(url);
    const key = canonicalUrlKey(url);
    const registryMatch = registryMatchByUrl.get(key);
    const discoveryMethod = mappedUrls.has(key)
      ? ("firecrawl_map" as const)
      : undefined;
    const prefix = registryMatch
      ? "discovery-source-registry"
      : "discovery-public-source";
    const candidateId = `${prefix}-${index + 1}`;

    candidates.push(
      createCandidate(
        projectId,
        candidateId,
        kind,
        url,
        registryMatch,
        discoveryMethod,
      ),
    );
    targets.push(
      createTarget(
        projectId,
        candidateId,
        `crawl-target-public-discovered-${index + 1}`,
        kind,
        url,
        registryMatch,
        discoveryMethod,
      ),
    );
  }

  notes.push(
    normalizedDiscoveredUrls.length > 0
      ? `public_source_discovery 探测 ${actualProbeUrls.length} 个保守入口，可访问 ${reachableProbeCount} 个，失败 ${failedProbeCount} 个；自动发现 ${normalizedDiscoveredUrls.length} 个公开 URL 并按质量优先级合并到 crawl plan（${formatKindMix(normalizedDiscoveredUrls, resolveDiscoveredKind)}）。`
      : `public_source_discovery 探测 ${actualProbeUrls.length} 个保守入口，可访问 ${reachableProbeCount} 个，失败 ${failedProbeCount} 个；未发现额外公开 URL，仅保留用户种子 URL；未把未验证的 RSS、Shopify collection 或产品 JSON 猜测路径加入 crawl plan。`,
  );

  return {
    candidates,
    targets,
    prefetchedDocuments,
    notes: [...searchDiscovery.notes, ...notes],
  };
}
