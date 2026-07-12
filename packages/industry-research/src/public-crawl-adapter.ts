import { cleanDocumentText } from "./document-cleaner";
import {
  type FirecrawlCrawlDocument,
  resolveFirecrawlConfig,
  scrapeWithFirecrawl,
  shouldUseFirecrawlForTarget,
} from "./firecrawl-provider";
import { assessSourceQuality } from "./source-quality";
import type {
  CrawlJob,
  CrawlPlan,
  CrawlPlanTarget,
  CrawlRun,
  ExtractionJob,
  RawDocument,
  ResearchSource,
  ResearchWorkflowInput,
} from "./types";

export type PublicCrawlerResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers?: {
    get: (name: string) => string | null;
  };
};

export type PublicCrawlerFetch = (
  input: string,
  init?: RequestInit,
) => Promise<PublicCrawlerResponse>;

export type PublicCrawlAdapterOptions = {
  fetcher?: PublicCrawlerFetch;
  input?: ResearchWorkflowInput;
  now?: string;
  maxTextLength?: number;
  /**
   * 同域连续请求的礼貌间隔。未显式设置时：真实网络（默认 fetcher）为
   * defaultPerHostDelayMs，注入 fetcher（测试/mock）为 0。
   */
  perHostDelayMs?: number;
  /** 单次 run 的抓取目标硬上限，超出的目标标记 skipped 不请求。 */
  maxTargets?: number;
  /** Firecrawl / provider 配置解析用 env；核心包不直接读取 process.env。 */
  env?: Record<string, string | undefined>;
  /** Firecrawl Crawl fallback 已经抽取的页面，命中时复用正文，避免再次 Scrape 计费。 */
  prefetchedDocuments?: FirecrawlCrawlDocument[];
};

export type PublicCrawlAdapterResult = {
  crawl_jobs: CrawlJob[];
  crawl_runs: CrawlRun[];
  raw_documents: RawDocument[];
  extraction_jobs: ExtractionJob[];
};

const defaultNow = "2026-06-06T00:00:00.000Z";
const defaultMaxTextLength = 12_000;
const defaultPerHostDelayMs = 1_000;
const defaultMaxTargets = 60;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostnameFor(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function canonicalUrlKey(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${host}${path}`;
  } catch {
    return value;
  }
}
const fallbackQualityInput: ResearchWorkflowInput = {
  projectName: "未命名行业研究",
  industry: "",
  category: "",
  market: "",
  researchGoal: "",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

function defaultFetcher(): PublicCrawlerFetch {
  return (input, init) => fetch(input, init);
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function canUsePublicCrawlerTarget(target: CrawlPlanTarget) {
  if (target.kind === "review_csv" || target.kind === "search_results") {
    return false;
  }

  return isPublicHttpUrl(target.target);
}

function findSourceForTarget(
  target: CrawlPlanTarget,
  sources: ResearchSource[],
) {
  return (
    sources.find(
      (source) =>
        source.discoveryCandidateId === target.candidateId &&
        source.value === target.target,
    ) ?? sources.find((source) => source.value === target.target)
  );
}

function decodeEntities(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function normalizeText(value: string) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function extractTagValue(input: string, tagName: string) {
  const pattern = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  );
  const match = pattern.exec(input);
  return match?.[1] ? normalizeText(match[1]) : "";
}

function stripHtmlToText(input: string) {
  return normalizeText(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<template[\s\S]*?<\/template>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function extractRssText(input: string) {
  const feedTitle = extractTagValue(input, "title");
  const items = [...input.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 20);
  const entries = items.map((itemMatch, index) => {
    const item = itemMatch[0] ?? "";
    const title = extractTagValue(item, "title") || `RSS 条目 ${index + 1}`;
    const link = extractTagValue(item, "link");
    const description =
      extractTagValue(item, "description") || extractTagValue(item, "summary");
    return [title, link, stripHtmlToText(description)]
      .filter(Boolean)
      .join(" | ");
  });

  return normalizeText([feedTitle, ...entries].filter(Boolean).join("\n"));
}

function extractSitemapText(input: string) {
  const urls = [...input.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)]
    .slice(0, 80)
    .map((match) => normalizeText(match[1] ?? ""))
    .filter(Boolean);

  return urls.join("\n");
}

function isRssLike(target: CrawlPlanTarget, contentType: string, body: string) {
  return (
    target.kind === "rss" ||
    contentType.includes("rss") ||
    contentType.includes("atom") ||
    /<(rss|feed)\b/i.test(body)
  );
}

function isSitemapLike(
  target: CrawlPlanTarget,
  contentType: string,
  body: string,
) {
  return (
    target.kind === "sitemap" ||
    target.target.endsWith("sitemap.xml") ||
    (contentType.includes("xml") && /<(urlset|sitemapindex)\b/i.test(body))
  );
}

function isRobotsLike(target: CrawlPlanTarget) {
  return target.kind === "robots" || target.target.endsWith("/robots.txt");
}

function extractPublicText(
  target: CrawlPlanTarget,
  body: string,
  contentType: string,
) {
  if (isRobotsLike(target)) {
    return {
      title: "robots.txt",
      contentType: "text" as const,
      text: normalizeText(body),
      format: "text" as const,
    };
  }

  if (isRssLike(target, contentType, body)) {
    return {
      title: extractTagValue(body, "title") || "RSS feed",
      contentType: "rss" as const,
      text: extractRssText(body),
      format: "text" as const,
    };
  }

  if (isSitemapLike(target, contentType, body)) {
    return {
      title: "Sitemap URL list",
      contentType: "text" as const,
      text: extractSitemapText(body),
      format: "text" as const,
    };
  }

  if (contentType.includes("json")) {
    return {
      title: target.reason,
      contentType: "text" as const,
      text: normalizeText(body),
      format: "text" as const,
    };
  }

  return {
    title: extractTagValue(body, "title") || target.reason,
    contentType: "html" as const,
    text: body,
    format: "html" as const,
  };
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
    summary: `public_web adapter 已抽取 ${rawDocument.title}，等待 LLM/人工写入 ${databaseName}。`,
  }));
}

export async function runPublicCrawler(
  projectId: string,
  crawlPlan: CrawlPlan,
  sources: ResearchSource[],
  options: PublicCrawlAdapterOptions = {},
): Promise<PublicCrawlAdapterResult> {
  const fetcher = options.fetcher ?? defaultFetcher();
  const now = options.now ?? defaultNow;
  const maxTextLength = options.maxTextLength ?? defaultMaxTextLength;
  const perHostDelayMs =
    options.perHostDelayMs ?? (options.fetcher ? 0 : defaultPerHostDelayMs);
  const maxTargets = options.maxTargets ?? defaultMaxTargets;
  const jobs: CrawlJob[] = [];
  const runs: CrawlRun[] = [];
  const rawDocuments: RawDocument[] = [];
  const extractionJobs: ExtractionJob[] = [];
  const lastFetchAtByHost = new Map<string, number>();
  const firecrawlConfig = resolveFirecrawlConfig(options.env ?? {});
  const prefetchedByUrl = new Map(
    (options.prefetchedDocuments ?? []).map((document) => [
      canonicalUrlKey(document.url),
      document,
    ]),
  );

  for (const [index, target] of crawlPlan.targets.entries()) {
    const jobId = `public-crawl-job-${index + 1}`;
    const runId = `public-crawl-run-${index + 1}`;
    jobs.push({
      id: jobId,
      projectId,
      targetId: target.id,
      status: "running",
      plannedAction: `Fetch public ${target.kind} target: ${target.target}`,
      toolCandidateId: "agent-factory-public-crawl-adapter",
    });

    if (index >= maxTargets) {
      jobs[index] = {
        ...jobs[index],
        status: "failed",
        plannedAction: `Skip target beyond per-run cap (${maxTargets}): ${target.target}`,
      };
      runs.push({
        id: runId,
        projectId,
        jobId,
        status: "failed",
        startedAt: now,
        finishedAt: now,
        documentsCreated: 0,
        summary: `TARGET_CAP_EXCEEDED: 单次 run 目标数超过上限 ${maxTargets}，此目标未请求。`,
      });
      continue;
    }

    if (!canUsePublicCrawlerTarget(target)) {
      jobs[index] = {
        ...jobs[index],
        status: "failed",
        plannedAction: `Skip unsupported public_web target: ${target.target}`,
      };
      runs.push({
        id: runId,
        projectId,
        jobId,
        status: "failed",
        startedAt: now,
        finishedAt: now,
        documentsCreated: 0,
        summary:
          "UNSUPPORTED_PUBLIC_TARGET: public_web adapter 只处理公开 http/https URL；搜索、CSV 和 mock URL 需要专用 adapter。",
      });
      continue;
    }

    const source = findSourceForTarget(target, sources);
    if (!source) {
      jobs[index] = { ...jobs[index], status: "failed" };
      runs.push({
        id: runId,
        projectId,
        jobId,
        status: "failed",
        startedAt: now,
        finishedAt: now,
        documentsCreated: 0,
        summary: `MISSING_SOURCE: Missing source for public crawl target ${target.id}.`,
      });
      continue;
    }

    try {
      const host = hostnameFor(target.target);

      if (perHostDelayMs > 0 && host) {
        const lastFetchAt = lastFetchAtByHost.get(host);
        const waitMs = lastFetchAt
          ? perHostDelayMs - (Date.now() - lastFetchAt)
          : 0;

        if (waitMs > 0) {
          await sleep(waitMs);
        }

        lastFetchAtByHost.set(host, Date.now());
      }

      let extractionTool = "native_fetch";
      let firecrawlFallbackNote = "";
      let extracted:
        | ReturnType<typeof extractPublicText>
        | {
            title: string;
            contentType: "text";
            text: string;
            format: "markdown";
          }
        | null = null;

      const prefetched = prefetchedByUrl.get(canonicalUrlKey(target.target));
      if (prefetched) {
        extractionTool = "firecrawl_crawl_prefetch";
        extracted = {
          title: prefetched.title,
          contentType: "text",
          text: prefetched.text,
          format: "markdown",
        };
      }

      if (!extracted && shouldUseFirecrawlForTarget(target, firecrawlConfig)) {
        const firecrawlResult = await scrapeWithFirecrawl(
          target,
          firecrawlConfig,
          fetcher,
        );

        if (firecrawlResult.ok) {
          extractionTool = "firecrawl_scrape";
          extracted = {
            title: firecrawlResult.title,
            contentType: "text",
            text: firecrawlResult.text,
            format: "markdown",
          };
        } else {
          firecrawlFallbackNote = `Firecrawl 未产出可用正文（${firecrawlResult.error}），已回退 native fetch。`;
        }
      }

      if (!extracted) {
        const response = await fetcher(target.target, {
          headers: {
            "User-Agent":
              "AgentFactoryIndustryResearch/0.1 (+public research workflow)",
          },
        });

        if (!response.ok) {
          jobs[index] = { ...jobs[index], status: "failed" };
          runs.push({
            id: runId,
            projectId,
            jobId,
            status: "failed",
            startedAt: now,
            finishedAt: now,
            documentsCreated: 0,
            summary: `HTTP_ERROR: HTTP ${response.status} while fetching ${target.target}`,
          });
          continue;
        }

        const body = await response.text();
        const contentType = response.headers?.get("content-type") ?? "";
        extracted = extractPublicText(target, body, contentType);
      }

      const cleanedDocument = cleanDocumentText({
        text: extracted.text,
        format: extracted.format,
        maxTextLength,
      });
      const extractedText = cleanedDocument.cleanedText;
      const qualityInput = options.input ?? fallbackQualityInput;
      const rawDocument: RawDocument = {
        id: `public-raw-document-${index + 1}`,
        projectId,
        sourceId: source.id,
        crawlRunId: runId,
        url: target.target,
        title: extracted.title,
        contentType: extracted.contentType,
        excerpt: extractedText.slice(0, 160),
        originalText: cleanedDocument.originalText,
        extractedText,
        cleaningAudit: cleanedDocument.audit,
        databaseTargets: target.databaseTargets,
        industrySourceRole: source.industrySourceRole,
        sourceQuality: assessSourceQuality({
          target,
          input: qualityInput,
          title: extracted.title,
          url: target.target,
          extractedText,
        }),
      };

      jobs[index] = { ...jobs[index], status: "done" };
      rawDocuments.push(rawDocument);
      extractionJobs.push(...createExtractionJobs(projectId, rawDocument));
      runs.push({
        id: runId,
        projectId,
        jobId,
        status: "done",
        startedAt: now,
        finishedAt: now,
        documentsCreated: 1,
        summary: `${extractionTool} 已抽取 1 条 ${extracted.contentType} raw document；sourceQuality=${rawDocument.sourceQuality.sourceType}/${rawDocument.sourceQuality.sourceRelevance}/${rawDocument.sourceQuality.sourceConfidence}；acceptedForReport=${rawDocument.sourceQuality.acceptedForReport}；cleaningResidualNoise=${rawDocument.cleaningAudit?.residualNoiseRatio ?? 0}。${firecrawlFallbackNote ? ` ${firecrawlFallbackNote}` : ""}`,
      });
    } catch (error) {
      jobs[index] = { ...jobs[index], status: "failed" };
      const message = error instanceof Error ? error.message : String(error);
      runs.push({
        id: runId,
        projectId,
        jobId,
        status: "failed",
        startedAt: now,
        finishedAt: now,
        documentsCreated: 0,
        summary: `FETCH_ERROR: ${message || "Unknown public_web adapter error."}`,
      });
    }
  }

  return {
    crawl_jobs: jobs,
    crawl_runs: runs,
    raw_documents: rawDocuments,
    extraction_jobs: extractionJobs,
  };
}
