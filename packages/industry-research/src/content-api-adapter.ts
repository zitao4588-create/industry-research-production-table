import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import type {
  ExtractionJob,
  RawDocument,
  ResearchSource,
  ResearchWorkflowInput,
} from "./types";

/**
 * 内容生态官方 API 适配器（T5）：
 * - YouTube Data API v3 搜索品类相关视频（标题/描述/频道）。
 * - Reddit OAuth 搜索相关热帖（标题/正文摘要/子版块）。
 * 只走官方 API，不爬社媒页面；对应 env key 缺失时静默跳过并记录 note。
 * 产出的 RawDocument 走既有 LLM 抽取 + 证据校验管道，主要喂
 * content_database / pain_point_database / keyword_database。
 */
export const YOUTUBE_API_KEY_ENV = "AGENT_FACTORY_YOUTUBE_API_KEY";
export const REDDIT_ACCESS_TOKEN_ENV = "AGENT_FACTORY_REDDIT_ACCESS_TOKEN";

const defaultMaxResultsPerPlatform = 8;
const defaultRequestTimeoutMs = 8_000;
const youtubeSearchEndpoint = "https://www.googleapis.com/youtube/v3/search";
const redditSearchEndpoint = "https://oauth.reddit.com/search";

export type ContentApiOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: PublicCrawlerFetch;
  maxResultsPerPlatform?: number;
  requestTimeoutMs?: number;
};

export type ContentApiCollectionResult = {
  sources: ResearchSource[];
  raw_documents: RawDocument[];
  extraction_jobs: ExtractionJob[];
  notes: string[];
};

function defaultFetcher(): PublicCrawlerFetch {
  return (input, init) => fetch(input, init);
}

function emptyResult(notes: string[]): ContentApiCollectionResult {
  return { sources: [], raw_documents: [], extraction_jobs: [], notes };
}

async function fetchJson(
  url: string,
  fetcher: PublicCrawlerFetch,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });

    if (!response.ok) {
      return { ok: false, status: response.status, payload: undefined };
    }

    return {
      ok: true,
      status: response.status,
      payload: JSON.parse(await response.text()) as unknown,
    };
  } catch {
    return { ok: false, status: 0, payload: undefined };
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type ContentApiItem = {
  platform: "YouTube" | "Reddit";
  url: string;
  title: string;
  text: string;
};

function parseYoutubeSearchItems(payload: unknown): ContentApiItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return [];
  }

  return payload.items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = isRecord(item.id) ? asString(item.id.videoId) : "";
    const snippet = isRecord(item.snippet) ? item.snippet : {};
    const title = asString(snippet.title);
    const description = asString(snippet.description);
    const channelTitle = asString(snippet.channelTitle);

    if (!id || !title) {
      return [];
    }

    return [
      {
        platform: "YouTube" as const,
        url: `https://www.youtube.com/watch?v=${id}`,
        title,
        text: [title, description, channelTitle && `频道：${channelTitle}`]
          .filter(Boolean)
          .join("\n"),
      },
    ];
  });
}

function parseRedditSearchItems(payload: unknown): ContentApiItem[] {
  const children =
    isRecord(payload) &&
    isRecord(payload.data) &&
    Array.isArray(payload.data.children)
      ? payload.data.children
      : [];

  return children.flatMap((child) => {
    if (!isRecord(child) || !isRecord(child.data)) {
      return [];
    }

    const data = child.data;
    const title = asString(data.title);
    const permalink = asString(data.permalink);

    if (!title || !permalink) {
      return [];
    }

    const selftext = asString(data.selftext).slice(0, 2_000);
    const subreddit = asString(data.subreddit);

    return [
      {
        platform: "Reddit" as const,
        url: `https://www.reddit.com${permalink}`,
        title,
        text: [title, selftext, subreddit && `子版块：r/${subreddit}`]
          .filter(Boolean)
          .join("\n"),
      },
    ];
  });
}

function createContentApiQuery(input: ResearchWorkflowInput) {
  return [input.category, input.market].filter(Boolean).join(" ");
}

function toCollectionResult(
  projectId: string,
  items: ContentApiItem[],
  notes: string[],
): ContentApiCollectionResult {
  const sources: ResearchSource[] = [];
  const rawDocuments: RawDocument[] = [];
  const extractionJobs: ExtractionJob[] = [];

  for (const [index, item] of items.entries()) {
    const ordinal = index + 1;
    const sourceId = `content-api-source-${ordinal}`;
    const rawDocumentId = `content-api-raw-document-${ordinal}`;
    const databaseTargets: RawDocument["databaseTargets"] = [
      "content_database",
      "pain_point_database",
      "keyword_database",
    ];

    sources.push({
      id: sourceId,
      projectId,
      type: "url",
      title: `${item.platform} 内容信号：${item.title.slice(0, 60)}`,
      value: item.url,
      automationHint: "official_content_api",
    });
    rawDocuments.push({
      id: rawDocumentId,
      projectId,
      sourceId,
      crawlRunId: `content-api-run-${ordinal}`,
      url: item.url,
      title: item.title,
      contentType: "text",
      excerpt: item.text.slice(0, 160),
      extractedText: item.text.slice(0, 4_000),
      databaseTargets,
      sourceQuality: {
        sourceType: "content_api",
        sourceRelevance: "medium",
        sourceConfidence: "medium",
        needsReviewReason:
          "平台官方 API 内容信号；代表性和互动质量需人工复核。",
        acceptedForReport: true,
      },
    });
    extractionJobs.push(
      ...databaseTargets.map((databaseName) => ({
        id: `extract-${rawDocumentId}-${databaseName}`,
        projectId,
        rawDocumentId,
        targetDatabase: databaseName,
        status: "needs_review" as const,
        extractedCount: 1,
        summary: `content_api adapter 已收集 ${item.platform} 信号「${item.title.slice(0, 40)}」，等待 LLM/人工写入 ${databaseName}。`,
      })),
    );
  }

  return {
    sources,
    raw_documents: rawDocuments,
    extraction_jobs: extractionJobs,
    notes,
  };
}

export async function collectContentApiSignals(
  projectId: string,
  input: ResearchWorkflowInput,
  options: ContentApiOptions = {},
): Promise<ContentApiCollectionResult> {
  const env = options.env ?? {};
  const fetcher = options.fetcher ?? defaultFetcher();
  const maxResults =
    options.maxResultsPerPlatform ?? defaultMaxResultsPerPlatform;
  const timeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
  const youtubeKey = env[YOUTUBE_API_KEY_ENV]?.trim();
  const redditToken = env[REDDIT_ACCESS_TOKEN_ENV]?.trim();

  if (!youtubeKey && !redditToken) {
    return emptyResult([
      "content_api 未配置 YouTube / Reddit 官方 API 凭据，跳过内容生态采集。",
    ]);
  }

  const query = createContentApiQuery(input);
  const items: ContentApiItem[] = [];
  const notes: string[] = [];

  if (youtubeKey) {
    const url = `${youtubeSearchEndpoint}?part=snippet&type=video&order=relevance&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(youtubeKey)}`;
    const result = await fetchJson(url, fetcher, { headers: {} }, timeoutMs);

    if (result.ok) {
      const parsed = parseYoutubeSearchItems(result.payload).slice(
        0,
        maxResults,
      );
      items.push(...parsed);
      notes.push(
        `content_api YouTube 官方 API 返回 ${parsed.length} 条内容信号。`,
      );
    } else {
      notes.push(
        `content_api YouTube 官方 API 调用失败（HTTP ${result.status}），已跳过。`,
      );
    }
  }

  if (redditToken) {
    const url = `${redditSearchEndpoint}?q=${encodeURIComponent(query)}&limit=${maxResults}&sort=relevance`;
    const result = await fetchJson(
      url,
      fetcher,
      {
        headers: {
          Authorization: `Bearer ${redditToken}`,
          "User-Agent":
            "AgentFactoryIndustryResearch/0.1 (+official content api)",
        },
      },
      timeoutMs,
    );

    if (result.ok) {
      const parsed = parseRedditSearchItems(result.payload).slice(
        0,
        maxResults,
      );
      items.push(...parsed);
      notes.push(
        `content_api Reddit 官方 API 返回 ${parsed.length} 条内容信号。`,
      );
    } else {
      notes.push(
        `content_api Reddit 官方 API 调用失败（HTTP ${result.status}），已跳过。`,
      );
    }
  }

  return toCollectionResult(projectId, items, notes);
}
