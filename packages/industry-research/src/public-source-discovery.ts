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

function createSearchQueries(input: ResearchWorkflowInput) {
  return unique([
    `${input.category} 品牌 官网 official brand website 竞品 ${input.market}`,
    `${input.category} competitor DTC brand official store product review ${input.market}`,
    `${input.industry} ${input.category} independent brand store collection product blog ${input.market}`,
    `${input.category} best seller brand reviews comparison ${input.market}`,
  ]);
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

function inferTargetKind(url: string): CrawlTargetKind {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.endsWith("/robots.txt")) {
    return "robots";
  }

  if (normalizedUrl.includes("sitemap") && normalizedUrl.includes(".xml")) {
    return "sitemap";
  }

  if (
    normalizedUrl.includes("rss") ||
    normalizedUrl.includes("atom") ||
    normalizedUrl.includes("feed")
  ) {
    return "rss";
  }

  if (
    normalizedUrl.includes("/products/") ||
    normalizedUrl.includes("/products.json")
  ) {
    return "product";
  }

  if (normalizedUrl.includes("/collections")) {
    return "collection";
  }

  if (normalizedUrl.includes("/blog")) {
    return "blog";
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
function selectBalancedDiscoveredUrls(urls: string[], maxTotal: number) {
  const selected: string[] = [];
  const kindCounts: Partial<Record<CrawlTargetKind, number>> = {};

  for (const url of urls) {
    if (selected.length >= maxTotal) {
      break;
    }

    const kind = inferTargetKind(url);
    const cap = perKindDiscoveryCaps[kind] ?? maxTotal;
    const count = kindCounts[kind] ?? 0;

    if (count < cap) {
      kindCounts[kind] = count + 1;
      selected.push(url);
    }
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
    .filter((url) => {
      const normalizedUrl = url.toLowerCase();

      return (
        normalizedUrl.includes("rss") ||
        normalizedUrl.includes("atom") ||
        normalizedUrl.includes("feed") ||
        normalizedUrl.includes("sitemap") ||
        normalizedUrl.includes("/products/") ||
        normalizedUrl.includes("/collections") ||
        normalizedUrl.includes("/blog") ||
        normalizedUrl.includes("/faq") ||
        normalizedUrl.includes("/review") ||
        normalizedUrl.includes("/reviews") ||
        normalizedUrl.includes("/testimonials")
      );
    });
}

function discoveryRank(url: string) {
  switch (inferTargetKind(url)) {
    case "homepage":
      return 0;
    case "robots":
      return 1;
    case "sitemap":
      return 2;
    case "product":
      return 3;
    case "collection":
      return 4;
    case "blog":
      return 5;
    case "rss":
      return 6;
    default:
      return 7;
  }
}

function formatKindMix(urls: string[]) {
  const counts = urls.reduce<Partial<Record<CrawlTargetKind, number>>>(
    (summary, url) => {
      const kind = inferTargetKind(url);
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
): SourceDiscoveryCandidate {
  return {
    id,
    projectId,
    sourceType: sourceTypeForKind(kind),
    method: registryMatch ? "source_registry" : methodForKind(kind),
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
): CrawlPlanTarget {
  return {
    id,
    projectId,
    candidateId,
    kind,
    target: url,
    reason: registryMatch
      ? `固定可信来源注册表命中 ${registryMatch.name}，优先抽取官网公开页面。`
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
  const requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
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
      .map((match) => [normalizeDiscoveredUrl(match.url), match] as const)
      .filter(([url]) => isUsefulPublicCandidateUrl(url)),
  );
  const existingTargets = new Set(
    crawlPlan.targets
      .map((target) => normalizeDiscoveredUrl(target.target) || target.target)
      .filter(Boolean),
  );
  const seedUrls = unique(
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
  const probeUrls = unique(seedUrls.flatMap(commonProbeUrls)).slice(
    0,
    maxProbeUrls,
  );
  const discoveredUrls: string[] = [];
  const notes: string[] = [];
  const robotsDisallowsByOrigin = new Map<string, string[]>();
  let reachableProbeCount = 0;
  let failedProbeCount = 0;

  discoveredUrls.push(...registryUrls);

  if (registryUrls.length > 0) {
    notes.push(
      `source_registry 命中 ${registryUrls.length} 个固定可信来源，已优先合并到 crawl plan。`,
    );
  }

  for (const url of probeUrls) {
    const result = await fetchPublicUrl(url, fetcher, requestTimeoutMs);

    if (!result.ok) {
      failedProbeCount += 1;
      continue;
    }

    reachableProbeCount += 1;
    discoveredUrls.push(normalizeDiscoveredUrl(result.url));

    if (result.url.endsWith("/robots.txt")) {
      discoveredUrls.push(...extractRobotsSitemaps(result.body, result.url));

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
      discoveredUrls.push(
        ...extractXmlLocUrls(result.body).slice(0, maxSitemapUrls),
      );
    }

    if (/<(rss|feed)\b/i.test(result.body)) {
      discoveredUrls.push(
        ...extractFeedLinks(result.body, result.url).slice(0, maxSitemapUrls),
      );
    }

    if (result.contentType.includes("html") || /<html\b/i.test(result.body)) {
      discoveredUrls.push(
        ...extractHtmlDiscoveryLinks(result.body, result.url).slice(
          0,
          maxSitemapUrls,
        ),
      );
    }
  }

  const rankedDiscoveredUrls = unique(
    discoveredUrls.map(normalizeDiscoveredUrl),
  )
    .filter(isUsefulPublicCandidateUrl)
    .filter((url) => !existingTargets.has(url))
    .sort(
      (left, right) =>
        discoveryRank(left) - discoveryRank(right) ||
        left.length - right.length ||
        left.localeCompare(right),
    );
  const robotsAllowedUrls = rankedDiscoveredUrls.filter(
    (url) => !isDisallowedByRobots(url, robotsDisallowsByOrigin),
  );
  const robotsFilteredCount =
    rankedDiscoveredUrls.length - robotsAllowedUrls.length;
  const normalizedDiscoveredUrls = selectBalancedDiscoveredUrls(
    robotsAllowedUrls,
    maxDiscoveredTargets,
  );

  if (robotsFilteredCount > 0) {
    notes.push(
      `public_source_discovery 依据 robots.txt Disallow 跳过 ${robotsFilteredCount} 个发现 URL。`,
    );
  }
  const candidates: SourceDiscoveryCandidate[] = [];
  const targets: CrawlPlanTarget[] = [];

  for (const [index, url] of normalizedDiscoveredUrls.entries()) {
    const kind = inferTargetKind(url);
    const registryMatch = registryMatchByUrl.get(url);
    const prefix = registryMatch
      ? "discovery-source-registry"
      : "discovery-public-source";
    const candidateId = `${prefix}-${index + 1}`;

    candidates.push(
      createCandidate(projectId, candidateId, kind, url, registryMatch),
    );
    targets.push(
      createTarget(
        projectId,
        candidateId,
        `crawl-target-public-discovered-${index + 1}`,
        kind,
        url,
        registryMatch,
      ),
    );
  }

  notes.push(
    normalizedDiscoveredUrls.length > 0
      ? `public_source_discovery 探测 ${probeUrls.length} 个保守入口，可访问 ${reachableProbeCount} 个，失败 ${failedProbeCount} 个；自动发现 ${normalizedDiscoveredUrls.length} 个公开 URL 并按质量优先级合并到 crawl plan（${formatKindMix(normalizedDiscoveredUrls)}）。`
      : `public_source_discovery 探测 ${probeUrls.length} 个保守入口，可访问 ${reachableProbeCount} 个，失败 ${failedProbeCount} 个；未发现额外公开 URL，仅保留用户种子 URL；未把未验证的 RSS、Shopify collection 或产品 JSON 猜测路径加入 crawl plan。`,
  );

  return {
    candidates,
    targets,
    notes: [...searchDiscovery.notes, ...notes],
  };
}
