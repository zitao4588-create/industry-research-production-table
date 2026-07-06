import type { PublicCrawlerFetch } from "./public-crawl-adapter";

/**
 * 搜索发现 provider 抽象：
 * - `tavily` / `serper` / `brave` 走正规 JSON API（需要 API key）。
 * - `duckduckgo_html` 是无 key fallback，沿用 HTML 抓取解析。
 * API provider 配置缺失或调用失败时，调用方应回退 DDG HTML 路径。
 */
export type SearchProviderName =
  | "brave"
  | "serper"
  | "tavily"
  | "duckduckgo_html";

export type SearchProviderConfig = {
  provider: SearchProviderName;
  endpoint: string;
  apiKey?: string;
  /** provider 是从更高优先级配置降级而来时的原因，进入 discovery notes。 */
  fallbackReason?: string;
};

export const SEARCH_PROVIDER_ENV = "AGENT_FACTORY_SEARCH_PROVIDER";
export const SEARCH_API_KEY_ENV = "AGENT_FACTORY_SEARCH_API_KEY";
export const SEARCH_ENDPOINT_ENV = "AGENT_FACTORY_SEARCH_BASE_URL";

export const defaultSearchEndpoints: Record<SearchProviderName, string> = {
  brave: "https://api.search.brave.com/res/v1/web/search",
  serper: "https://google.serper.dev/search",
  tavily: "https://api.tavily.com/search",
  duckduckgo_html: "https://duckduckgo.com/html/",
};

const apiSearchProviders = ["brave", "serper", "tavily"] as const;

function isApiSearchProvider(
  value: string,
): value is (typeof apiSearchProviders)[number] {
  return apiSearchProviders.includes(
    value as (typeof apiSearchProviders)[number],
  );
}

export function resolveSearchProviderConfig(
  env: Record<string, string | undefined>,
): SearchProviderConfig {
  const requested = (env[SEARCH_PROVIDER_ENV] ?? "").trim().toLowerCase();
  const apiKey = env[SEARCH_API_KEY_ENV]?.trim() || undefined;
  const endpointOverride = env[SEARCH_ENDPOINT_ENV]?.trim() || undefined;

  if (isApiSearchProvider(requested)) {
    if (!apiKey) {
      return {
        provider: "duckduckgo_html",
        endpoint: defaultSearchEndpoints.duckduckgo_html,
        fallbackReason: `${requested} 已配置但缺少 ${SEARCH_API_KEY_ENV}，降级 DDG HTML。`,
      };
    }

    return {
      provider: requested,
      endpoint: endpointOverride ?? defaultSearchEndpoints[requested],
      apiKey,
    };
  }

  return {
    provider: "duckduckgo_html",
    endpoint: endpointOverride ?? defaultSearchEndpoints.duckduckgo_html,
  };
}

export type ApiSearchResult = {
  ok: boolean;
  urls: string[];
  error?: string;
};

function asUrlList(values: unknown[]): string[] {
  return values
    .map((value) =>
      typeof value === "string" && value.trim() ? value.trim() : "",
    )
    .filter(Boolean);
}

function parseBraveResults(payload: unknown): string[] {
  const results =
    payload &&
    typeof payload === "object" &&
    "web" in payload &&
    payload.web &&
    typeof payload.web === "object" &&
    "results" in payload.web &&
    Array.isArray(payload.web.results)
      ? payload.web.results
      : [];

  return asUrlList(
    results.map((item: unknown) =>
      item && typeof item === "object" && "url" in item ? item.url : "",
    ),
  );
}

function parseSerperResults(payload: unknown): string[] {
  const results =
    payload &&
    typeof payload === "object" &&
    "organic" in payload &&
    Array.isArray(payload.organic)
      ? payload.organic
      : [];

  return asUrlList(
    results.map((item: unknown) =>
      item && typeof item === "object" && "link" in item ? item.link : "",
    ),
  );
}

function parseTavilyResults(payload: unknown): string[] {
  const results =
    payload &&
    typeof payload === "object" &&
    "results" in payload &&
    Array.isArray(payload.results)
      ? payload.results
      : [];

  return asUrlList(
    results.map((item: unknown) =>
      item && typeof item === "object" && "url" in item ? item.url : "",
    ),
  );
}

/** 调用 API search provider；`duckduckgo_html` 不在此处处理。 */
export async function searchWithApiProvider(
  config: SearchProviderConfig,
  query: string,
  fetcher: PublicCrawlerFetch,
  options: { maxResults: number; timeoutMs: number },
): Promise<ApiSearchResult> {
  if (config.provider === "duckduckgo_html") {
    return { ok: false, urls: [], error: "duckduckgo_html 不是 API provider" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    let response: Awaited<ReturnType<PublicCrawlerFetch>>;

    if (config.provider === "brave") {
      response = await fetcher(
        `${config.endpoint}?q=${encodeURIComponent(query)}&count=${options.maxResults}`,
        {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": config.apiKey ?? "",
          },
          signal: controller.signal,
        },
      );
    } else if (config.provider === "serper") {
      response = await fetcher(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": config.apiKey ?? "",
        },
        body: JSON.stringify({ q: query, num: options.maxResults }),
        signal: controller.signal,
      });
    } else {
      response = await fetcher(config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: options.maxResults,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      return {
        ok: false,
        urls: [],
        error: `${config.provider} 搜索 HTTP ${response.status}`,
      };
    }

    const payload: unknown = JSON.parse(await response.text());
    const urls =
      config.provider === "brave"
        ? parseBraveResults(payload)
        : config.provider === "serper"
          ? parseSerperResults(payload)
          : parseTavilyResults(payload);

    return { ok: true, urls: urls.slice(0, options.maxResults) };
  } catch (error) {
    return {
      ok: false,
      urls: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
