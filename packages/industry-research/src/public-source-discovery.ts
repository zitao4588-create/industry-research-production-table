import type { PublicCrawlerFetch } from "./public-crawl-adapter";
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

const defaultMaxDiscoveredTargets = 24;
const defaultMaxProbeUrls = 24;
const defaultMaxSitemapUrls = 12;
const defaultMaxSearchQueries = 1;
const defaultMaxSearchResultsPerQuery = 3;
const defaultRequestTimeoutMs = 8_000;
const defaultSearchEndpoint = "https://duckduckgo.com/html/";
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
    `${input.category} best sellers ${input.market}`,
    `${input.category} competitor official website ${input.market}`,
    `${input.industry} ${input.category} DTC brands`,
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
      .filter(isPublicHttpUrl)
      .filter((url) => !ignoredSearchHostnames.has(hostnameFor(url))),
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
    absoluteUrl("/feed.xml", origin),
    absoluteUrl("/rss.xml", origin),
    absoluteUrl("/atom.xml", origin),
    absoluteUrl("/blogs/news.atom", origin),
    absoluteUrl("/blogs/news.rss", origin),
    absoluteUrl("/collections", origin),
    absoluteUrl("/collections/all", origin),
    absoluteUrl("/collections/best-sellers", origin),
    absoluteUrl("/products.json?limit=20", origin),
    absoluteUrl("/blogs", origin),
  ];
}

function extractRobotsSitemaps(body: string, baseUrl: string) {
  return body
    .split(/\r?\n/)
    .map((line) => /^sitemap:\s*(.+)$/i.exec(line.trim())?.[1] ?? "")
    .map((url) => absoluteUrl(url.trim(), baseUrl))
    .filter(Boolean);
}

function extractXmlLocUrls(body: string) {
  return [...body.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanText(match[1] ?? ""))
    .filter(isPublicHttpUrl);
}

function extractFeedLinks(body: string, baseUrl: string) {
  return [...body.matchAll(/<link[^>]*>([\s\S]*?)<\/link>/gi)]
    .map((match) => cleanText(match[1] ?? ""))
    .map((url) => absoluteUrl(url, baseUrl))
    .filter(isPublicHttpUrl);
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
    .filter(isPublicHttpUrl)
    .filter((url) => {
      const normalizedUrl = url.toLowerCase();

      return (
        normalizedUrl.includes("rss") ||
        normalizedUrl.includes("atom") ||
        normalizedUrl.includes("feed") ||
        normalizedUrl.includes("sitemap") ||
        normalizedUrl.includes("/products/") ||
        normalizedUrl.includes("/collections") ||
        normalizedUrl.includes("/blog")
      );
    });
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

async function discoverSearchResultUrls(
  input: ResearchWorkflowInput,
  fetcher: PublicCrawlerFetch,
  options: PublicSourceDiscoveryOptions,
) {
  const maxSearchQueries = options.maxSearchQueries ?? defaultMaxSearchQueries;
  const maxSearchResultsPerQuery =
    options.maxSearchResultsPerQuery ?? defaultMaxSearchResultsPerQuery;
  const searchEndpoint = options.searchEndpoint ?? defaultSearchEndpoint;
  const requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
  const queries = createSearchQueries(input).slice(0, maxSearchQueries);
  const discoveredUrls: string[] = [];
  const notes: string[] = [];

  for (const query of queries) {
    const searchUrl = createSearchUrl(query, searchEndpoint);
    const result = await fetchPublicUrl(searchUrl, fetcher, requestTimeoutMs);

    if (!result.ok) {
      notes.push(`public_search_discovery 搜索失败：${query}`);
      continue;
    }

    discoveredUrls.push(
      ...extractSearchResultUrls(result.body, result.url).slice(
        0,
        maxSearchResultsPerQuery,
      ),
    );
  }

  const uniqueDiscoveredUrls = unique(discoveredUrls);

  notes.push(
    uniqueDiscoveredUrls.length > 0
      ? `public_search_discovery 自动发现 ${uniqueDiscoveredUrls.length} 个候选公开 URL，后续会探测 robots、sitemap、RSS 和 Shopify 公开路径。`
      : "public_search_discovery 未发现可用候选 URL；需要补充种子 URL 或接入更稳定的搜索 API。",
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
): SourceDiscoveryCandidate {
  return {
    id,
    projectId,
    sourceType: sourceTypeForKind(kind),
    method: methodForKind(kind),
    title: titleForKind(kind),
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
): CrawlPlanTarget {
  return {
    id,
    projectId,
    candidateId,
    kind,
    target: url,
    reason: reasonForKind(kind),
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
  const existingTargets = new Set(
    crawlPlan.targets.map((target) => target.target),
  );
  const seedUrls = unique(
    [
      ...normalizeUrls(input.urls),
      ...searchDiscovery.urls,
      ...crawlPlan.targets
        .map((target) => target.target)
        .filter(isPublicHttpUrl),
    ].filter(isPublicHttpUrl),
  );
  const probeUrls = unique(seedUrls.flatMap(commonProbeUrls)).slice(
    0,
    maxProbeUrls,
  );
  const discoveredUrls: string[] = [];
  const notes: string[] = [];

  for (const url of probeUrls) {
    const result = await fetchPublicUrl(url, fetcher, requestTimeoutMs);

    if (!result.ok) {
      continue;
    }

    discoveredUrls.push(result.url);

    if (result.url.endsWith("/robots.txt")) {
      discoveredUrls.push(...extractRobotsSitemaps(result.body, result.url));
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

  const normalizedDiscoveredUrls = unique(discoveredUrls)
    .filter(isPublicHttpUrl)
    .filter((url) => !existingTargets.has(url))
    .slice(0, maxDiscoveredTargets);
  const candidates: SourceDiscoveryCandidate[] = [];
  const targets: CrawlPlanTarget[] = [];

  for (const [index, url] of normalizedDiscoveredUrls.entries()) {
    const kind = inferTargetKind(url);
    const candidateId = `discovery-public-source-${index + 1}`;

    candidates.push(createCandidate(projectId, candidateId, kind, url));
    targets.push(
      createTarget(
        projectId,
        candidateId,
        `crawl-target-public-discovered-${index + 1}`,
        kind,
        url,
      ),
    );
  }

  notes.push(
    normalizedDiscoveredUrls.length > 0
      ? `public_source_discovery 自动发现 ${normalizedDiscoveredUrls.length} 个公开 URL，已合并到 public_web crawl plan。`
      : "public_source_discovery 未发现额外公开 URL，仅保留用户种子 URL 和基础采集计划。",
  );

  return {
    candidates,
    targets,
    notes: [...searchDiscovery.notes, ...notes],
  };
}
