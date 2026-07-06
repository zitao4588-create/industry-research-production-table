import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import type { CrawlPlanTarget, CrawlTargetKind } from "./types";

export const FIRECRAWL_ENABLED_ENV = "AGENT_FACTORY_FIRECRAWL_ENABLED";
export const FIRECRAWL_API_KEY_ENV = "AGENT_FACTORY_FIRECRAWL_API_KEY";
export const FIRECRAWL_BASE_URL_ENV = "AGENT_FACTORY_FIRECRAWL_BASE_URL";
export const FIRECRAWL_TARGET_KINDS_ENV =
  "AGENT_FACTORY_FIRECRAWL_TARGET_KINDS";
export const FIRECRAWL_TIMEOUT_MS_ENV = "AGENT_FACTORY_FIRECRAWL_TIMEOUT_MS";

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
  endpoint: string;
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

function isTruthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

function normalizeEndpoint(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  return trimmed.endsWith("/scrape") ? trimmed : `${trimmed}/scrape`;
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
    endpoint: normalizeEndpoint(baseUrl),
    apiKey: apiKey || undefined,
    targetKinds: parseTargetKinds(env[FIRECRAWL_TARGET_KINDS_ENV]),
    timeoutMs: parseTimeoutMs(env[FIRECRAWL_TIMEOUT_MS_ENV]),
  };
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: target.target,
        formats: ["markdown"],
        onlyMainContent: true,
        onlyCleanContent: true,
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
