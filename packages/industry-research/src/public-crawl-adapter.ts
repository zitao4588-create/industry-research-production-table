import type {
  CrawlJob,
  CrawlPlan,
  CrawlPlanTarget,
  CrawlRun,
  ExtractionJob,
  RawDocument,
  ResearchSource,
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
  now?: string;
  maxTextLength?: number;
};

export type PublicCrawlAdapterResult = {
  crawl_jobs: CrawlJob[];
  crawl_runs: CrawlRun[];
  raw_documents: RawDocument[];
  extraction_jobs: ExtractionJob[];
};

const defaultNow = "2026-06-06T00:00:00.000Z";
const defaultMaxTextLength = 12_000;

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
    };
  }

  if (isRssLike(target, contentType, body)) {
    return {
      title: extractTagValue(body, "title") || "RSS feed",
      contentType: "rss" as const,
      text: extractRssText(body),
    };
  }

  if (isSitemapLike(target, contentType, body)) {
    return {
      title: "Sitemap URL list",
      contentType: "text" as const,
      text: extractSitemapText(body),
    };
  }

  if (contentType.includes("json")) {
    return {
      title: target.reason,
      contentType: "text" as const,
      text: normalizeText(body),
    };
  }

  return {
    title: extractTagValue(body, "title") || target.reason,
    contentType: "html" as const,
    text: stripHtmlToText(body),
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
  const jobs: CrawlJob[] = [];
  const runs: CrawlRun[] = [];
  const rawDocuments: RawDocument[] = [];
  const extractionJobs: ExtractionJob[] = [];

  for (const [index, target] of crawlPlan.targets.entries()) {
    const jobId = `public-crawl-job-${index + 1}`;
    const runId = `public-crawl-run-${index + 1}`;
    jobs.push({
      id: jobId,
      projectId,
      targetId: target.id,
      status: "running",
      plannedAction: `Fetch public ${target.kind} target: ${target.target}`,
      toolCandidateId: "industry-research-public-crawl-adapter",
    });

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
          "public_web adapter 只处理公开 http/https URL；搜索、CSV 和 mock URL 需要专用 adapter。",
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
        summary: `Missing source for public crawl target: ${target.id}`,
      });
      continue;
    }

    try {
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
          summary: `HTTP ${response.status} while fetching ${target.target}`,
        });
        continue;
      }

      const body = await response.text();
      const contentType = response.headers?.get("content-type") ?? "";
      const extracted = extractPublicText(target, body, contentType);
      const extractedText = extracted.text.slice(0, maxTextLength);
      const rawDocument: RawDocument = {
        id: `public-raw-document-${index + 1}`,
        projectId,
        sourceId: source.id,
        crawlRunId: runId,
        url: target.target,
        title: extracted.title,
        contentType: extracted.contentType,
        excerpt: extractedText.slice(0, 160),
        extractedText,
        databaseTargets: target.databaseTargets,
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
        summary: `public_web adapter 已抽取 1 条 ${extracted.contentType} raw document。`,
      });
    } catch (error) {
      jobs[index] = { ...jobs[index], status: "failed" };
      runs.push({
        id: runId,
        projectId,
        jobId,
        status: "failed",
        startedAt: now,
        finishedAt: now,
        documentsCreated: 0,
        summary:
          error instanceof Error
            ? error.message
            : "Unknown public_web adapter error.",
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
