import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import type { CrawlPlanTarget, CrawlTargetKind } from "./types";

export const FIRECRAWL_ENABLED_ENV = "AGENT_FACTORY_FIRECRAWL_ENABLED";
export const FIRECRAWL_API_KEY_ENV = "AGENT_FACTORY_FIRECRAWL_API_KEY";
export const FIRECRAWL_BASE_URL_ENV = "AGENT_FACTORY_FIRECRAWL_BASE_URL";
export const FIRECRAWL_TARGET_KINDS_ENV =
  "AGENT_FACTORY_FIRECRAWL_TARGET_KINDS";
export const FIRECRAWL_TIMEOUT_MS_ENV = "AGENT_FACTORY_FIRECRAWL_TIMEOUT_MS";
export const FIRECRAWL_MAP_ENABLED_ENV = "AGENT_FACTORY_FIRECRAWL_MAP_ENABLED";
export const FIRECRAWL_CRAWL_FALLBACK_ENABLED_ENV =
  "AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED";

const defaultFirecrawlBaseUrl = "https://api.firecrawl.dev/v2";
const defaultTimeoutMs = 30_000;
const defaultTargetKinds = new Set<CrawlTargetKind>([
  "homepage",
  "collection",
  "product",
  "blog",
]);

export type FirecrawlConfig = {
  enabled: boolean;
  mapEnabled: boolean;
  crawlFallbackEnabled: boolean;
  endpoint: string;
  mapEndpoint: string;
  crawlEndpoint: string;
  apiKey?: string;
  targetKinds: Set<CrawlTargetKind>;
  timeoutMs: number;
};

export type FirecrawlScrapeResult =
  | {
      ok: true;
      title: string;
      text: string;
      sourceUrl: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type FirecrawlMapResult =
  | {
      ok: true;
      links: Array<{
        url: string;
        title?: string;
        description?: string;
      }>;
      creditsUsed?: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type FirecrawlCrawlDocument = {
  url: string;
  title: string;
  text: string;
};

export type FirecrawlCrawlResult =
  | {
      ok: true;
      documents: FirecrawlCrawlDocument[];
      creditsUsed?: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function isTruthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

function normalizeBaseUrl(value: string) {
  return value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(?:scrape|map|search|crawl)$/i, "");
}

function endpointFor(baseUrl: string, endpoint: "scrape" | "map" | "crawl") {
  return `${normalizeBaseUrl(baseUrl)}/${endpoint}`;
}

function parseTimeoutMs(value: string | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 5_000
    ? Math.round(parsed)
    : defaultTimeoutMs;
}

function isCrawlTargetKind(value: string): value is CrawlTargetKind {
  return [
    "homepage",
    "collection",
    "product",
    "blog",
    "rss",
    "robots",
    "sitemap",
    "review_csv",
    "search_results",
  ].includes(value);
}

function parseTargetKinds(value: string | undefined) {
  if (!value) {
    return new Set(defaultTargetKinds);
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(isCrawlTargetKind);

  return parsed.length > 0 ? new Set(parsed) : new Set(defaultTargetKinds);
}

export function resolveFirecrawlConfig(
  env: Record<string, string | undefined>,
): FirecrawlConfig {
  const apiKey =
    env[FIRECRAWL_API_KEY_ENV]?.trim() || env.FIRECRAWL_API_KEY?.trim();
  const baseUrl =
    env[FIRECRAWL_BASE_URL_ENV]?.trim() ||
    env.FIRECRAWL_API_URL?.trim() ||
    defaultFirecrawlBaseUrl;

  return {
    enabled: isTruthy(env[FIRECRAWL_ENABLED_ENV]) || Boolean(apiKey),
    mapEnabled: isTruthy(env[FIRECRAWL_MAP_ENABLED_ENV]),
    crawlFallbackEnabled: isTruthy(env[FIRECRAWL_CRAWL_FALLBACK_ENABLED_ENV]),
    endpoint: endpointFor(baseUrl, "scrape"),
    mapEndpoint: endpointFor(baseUrl, "map"),
    crawlEndpoint: endpointFor(baseUrl, "crawl"),
    apiKey: apiKey || undefined,
    targetKinds: parseTargetKinds(env[FIRECRAWL_TARGET_KINDS_ENV]),
    timeoutMs: parseTimeoutMs(env[FIRECRAWL_TIMEOUT_MS_ENV]),
  };
}

function firecrawlHeaders(config: FirecrawlConfig) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

export function shouldUseFirecrawlForTarget(
  target: CrawlPlanTarget,
  config: FirecrawlConfig,
) {
  return config.enabled && config.targetKinds.has(target.kind);
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseFirecrawlPayload(payload: unknown, target: CrawlPlanTarget) {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : {};
  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : {};
  const text =
    stringFromUnknown(data.markdown) ||
    stringFromUnknown(data.summary) ||
    stringFromUnknown(data.html);

  return {
    title:
      stringFromUnknown(metadata.title) ||
      stringFromUnknown(metadata.description) ||
      target.reason,
    sourceUrl:
      stringFromUnknown(metadata.sourceURL) ||
      stringFromUnknown(metadata.url) ||
      target.target,
    text,
  };
}

export async function scrapeWithFirecrawl(
  target: CrawlPlanTarget,
  config: FirecrawlConfig,
  fetcher: PublicCrawlerFetch,
): Promise<FirecrawlScrapeResult> {
  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: firecrawlHeaders(config),
      body: JSON.stringify({
        url: target.target,
        formats: ["markdown"],
        onlyMainContent: true,
        onlyCleanContent: false,
        excludeTags: [
          "nav",
          "header",
          "footer",
          "aside",
          "form",
          "script",
          "style",
          "noscript",
        ],
        removeBase64Images: true,
        blockAds: true,
        timeout: config.timeoutMs,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Firecrawl HTTP ${response.status}`,
      };
    }

    const payload: unknown = JSON.parse(await response.text());
    const parsed = parseFirecrawlPayload(payload, target);

    if (!parsed.text) {
      return {
        ok: false,
        status: 200,
        error: "Firecrawl 返回为空正文",
      };
    }

    return {
      ok: true,
      title: parsed.title,
      sourceUrl: parsed.sourceUrl,
      text: parsed.text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseMapLinks(payload: unknown) {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : {};
  const rawLinks = Array.isArray(root.links)
    ? root.links
    : Array.isArray(data.links)
      ? data.links
      : [];
  const links = rawLinks
    .map((item) => {
      if (typeof item === "string") {
        return { url: item.trim() };
      }

      if (!item || typeof item !== "object") {
        return undefined;
      }

      const record = item as Record<string, unknown>;
      const url = stringFromUnknown(record.url);
      if (!url) return undefined;

      return {
        url,
        title: stringFromUnknown(record.title) || undefined,
        description: stringFromUnknown(record.description) || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const creditsUsed =
    typeof root.creditsUsed === "number" ? root.creditsUsed : undefined;

  return { links, creditsUsed };
}

export async function mapWithFirecrawl(
  url: string,
  search: string,
  limit: number,
  config: FirecrawlConfig,
  fetcher: PublicCrawlerFetch,
): Promise<FirecrawlMapResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetcher(config.mapEndpoint, {
      method: "POST",
      headers: firecrawlHeaders(config),
      signal: controller.signal,
      body: JSON.stringify({
        url,
        search,
        sitemap: "include",
        includeSubdomains: false,
        ignoreQueryParameters: true,
        ignoreCache: false,
        limit: Math.max(1, Math.min(100, Math.round(limit))),
        timeout: config.timeoutMs,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Firecrawl Map HTTP ${response.status}`,
      };
    }

    const payload: unknown = JSON.parse(await response.text());
    const parsed = parseMapLinks(payload);

    return { ok: true, ...parsed };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseCrawlDocuments(payload: unknown): FirecrawlCrawlDocument[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const rawDocuments = Array.isArray(root.data) ? root.data : [];

  return rawDocuments.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : {};
    const url =
      stringFromUnknown(metadata.sourceURL) || stringFromUnknown(metadata.url);
    const text =
      stringFromUnknown(record.markdown) || stringFromUnknown(record.html);

    if (!url || !text) return [];

    return [
      {
        url,
        title:
          stringFromUnknown(metadata.title) ||
          stringFromUnknown(metadata.description) ||
          url,
        text,
      },
    ];
  });
}

function sleep(ms: number) {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

export async function crawlWithFirecrawl(
  url: string,
  includePaths: string[],
  limit: number,
  config: FirecrawlConfig,
  fetcher: PublicCrawlerFetch,
  options: { pollIntervalMs?: number; maxPolls?: number } = {},
): Promise<FirecrawlCrawlResult> {
  const boundedLimit = Math.max(1, Math.min(5, Math.round(limit)));
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 500);
  const maxPolls = Math.max(1, Math.min(30, options.maxPolls ?? 20));

  try {
    const startResponse = await fetcher(config.crawlEndpoint, {
      method: "POST",
      headers: firecrawlHeaders(config),
      body: JSON.stringify({
        url,
        includePaths: includePaths.slice(0, 8),
        excludePaths: [
          "account(?:/.*)?",
          "cart(?:/.*)?",
          "checkout(?:/.*)?",
          "login(?:/.*)?",
          "privacy(?:/.*)?",
          "terms(?:/.*)?",
          "legal(?:/.*)?",
          "policies(?:/.*)?",
          "search(?:/.*)?",
        ],
        maxDiscoveryDepth: 1,
        sitemap: "include",
        ignoreQueryParameters: true,
        regexOnFullURL: false,
        limit: boundedLimit,
        crawlEntireDomain: false,
        allowExternalLinks: false,
        allowSubdomains: false,
        ignoreRobotsTxt: false,
        delay: 500,
        maxConcurrency: 1,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
          onlyCleanContent: false,
          excludeTags: [
            "nav",
            "header",
            "footer",
            "aside",
            "form",
            "script",
            "style",
            "noscript",
          ],
          removeBase64Images: true,
          blockAds: true,
          timeout: config.timeoutMs,
        },
      }),
    });

    if (!startResponse.ok) {
      return {
        ok: false,
        status: startResponse.status,
        error: `Firecrawl Crawl HTTP ${startResponse.status}`,
      };
    }

    const startPayload = JSON.parse(await startResponse.text()) as {
      id?: unknown;
    };
    const jobId = stringFromUnknown(startPayload.id);
    if (!jobId) {
      return { ok: false, status: 200, error: "Firecrawl Crawl 未返回 job id" };
    }

    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (poll > 0) await sleep(pollIntervalMs);
      const statusResponse = await fetcher(
        `${config.crawlEndpoint}/${encodeURIComponent(jobId)}`,
        { headers: firecrawlHeaders(config) },
      );

      if (!statusResponse.ok) {
        return {
          ok: false,
          status: statusResponse.status,
          error: `Firecrawl Crawl status HTTP ${statusResponse.status}`,
        };
      }

      const payload = JSON.parse(await statusResponse.text()) as Record<
        string,
        unknown
      >;
      const status = stringFromUnknown(payload.status).toLowerCase();
      if (status === "failed") {
        return { ok: false, status: 200, error: "Firecrawl Crawl job failed" };
      }
      if (status !== "completed") continue;

      const documents = parseCrawlDocuments(payload).slice(0, boundedLimit);
      if (documents.length === 0) {
        return {
          ok: false,
          status: 200,
          error: "Firecrawl Crawl 完成但没有可用正文",
        };
      }

      return {
        ok: true,
        documents,
        creditsUsed:
          typeof payload.creditsUsed === "number"
            ? payload.creditsUsed
            : undefined,
      };
    }

    return {
      ok: false,
      status: 0,
      error: "Firecrawl Crawl status polling timeout",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
