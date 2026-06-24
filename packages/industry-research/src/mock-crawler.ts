import { assessSourceQuality } from "./source-quality";
import type {
  CrawlJob,
  CrawlPlan,
  CrawlPlanTarget,
  CrawlRun,
  ExtractionJob,
  RawDocument,
  ResearchDocument,
  ResearchSource,
  ResearchWorkflowInput,
  SourceDiscoveryCandidate,
  SourceDiscoveryPlan,
} from "./types";

const mockStartedAt = "2026-06-05T00:05:00.000Z";
const mockFinishedAt = "2026-06-05T00:06:00.000Z";

function normalizeUrls(urls: string[]) {
  return urls.map((url) => url.trim()).filter(Boolean);
}

function sourceTypeForTarget(target: CrawlPlanTarget): ResearchSource["type"] {
  if (target.kind === "rss") {
    return "rss";
  }

  if (target.kind === "review_csv") {
    return "csv";
  }

  if (target.kind === "homepage") {
    return "url";
  }

  return "crawler";
}

function findCandidate(
  plan: SourceDiscoveryPlan,
  target: CrawlPlanTarget,
): SourceDiscoveryCandidate | undefined {
  return plan.candidates.find(
    (candidate) => candidate.id === target.candidateId,
  );
}

export function createResearchSourcesFromPlan(
  projectId: string,
  input: ResearchWorkflowInput,
  discoveryPlan: SourceDiscoveryPlan,
  crawlPlan: CrawlPlan,
): ResearchSource[] {
  const automatedSources = crawlPlan.targets.map((target, index) => {
    const candidate = findCandidate(discoveryPlan, target);

    return {
      id: `source-auto-${index + 1}`,
      projectId,
      type: sourceTypeForTarget(target),
      title: candidate?.title ?? target.reason,
      value: target.target,
      automationHint: `${target.reason}（mock 执行；真实模式可接爬虫/RSS/sitemap/CSV adapter）`,
      discoveryCandidateId: target.candidateId,
      priority: candidate?.priority ?? "medium",
    } satisfies ResearchSource;
  });

  const supplementalUrls = normalizeUrls(input.urls).map((url, index) => ({
    id: `source-supplement-url-${index + 1}`,
    projectId,
    type: "url" as const,
    title: `补充 URL ${index + 1}`,
    value: url,
    automationHint: "补充输入：真实模式可放入 crawl queue，但不是主流程入口。",
    discoveryCandidateId: "discovery-seed-urls",
    priority: "medium" as const,
  }));

  return [
    ...automatedSources,
    ...supplementalUrls,
    {
      id: "source-supplement-csv",
      projectId,
      type: "csv",
      title: "补充 CSV",
      value: input.csvText.trim() || "未提供 CSV",
      automationHint: "补充输入：可作为用户导出的评论、商品、关键词或内容表。",
      discoveryCandidateId: "discovery-review-csv",
      priority: input.csvText.trim() ? "high" : "medium",
    },
    {
      id: "source-supplement-manual",
      projectId,
      type: "manual_text",
      title: "补充人工线索",
      value: input.manualText.trim() || "未提供人工线索",
      automationHint: "补充输入：用于人工判断，不替代自动采集和证据链。",
      discoveryCandidateId: "discovery-manual-hints",
      priority: "low",
    },
  ];
}

function buildMockText(
  target: CrawlPlanTarget,
  input: ResearchWorkflowInput,
): string {
  const base = `${input.industry} / ${input.category} / ${input.market}`;

  switch (target.kind) {
    case "search_results":
      return `${base} mock search results: 发现头部竞品 A、内容型竞品 B、低价渠道 C；高频词包括 best sellers、starter kit、reviews、bundle。`;
    case "homepage":
      return `${base} mock homepage: 导航包含 Home、Best Sellers、New Arrivals、Collections、Blog、Reviews；首页强调信任背书、成分/材质、复购和使用场景。`;
    case "collection":
      return `${base} mock collection: Best Sellers 中出现 bundle、starter kit、subscription、under 50、sensitive use case；tag 体系能反映成交路径。`;
    case "rss":
      return `${base} mock RSS: 本周新增购买指南、对比测评、避坑清单和趋势文章；适合沉淀周报库和内容库。`;
    case "robots":
      return `${base} mock robots.txt: 记录公开采集边界、sitemap 入口和不应抓取的路径。`;
    case "review_csv":
      return input.csvText.trim()
        ? `mock CSV parsed: ${input.csvText.trim()}`
        : `${base} mock CSV: 等待用户导出评论、商品和关键词表；当前用默认痛点和产品标签占位。`;
    case "blog":
    case "product":
    case "sitemap":
      return `${base} mock ${target.kind}: 记录公开页面结构、产品信号、关键词和内容更新入口。`;
  }
}

function contentTypeForTarget(
  target: CrawlPlanTarget,
): RawDocument["contentType"] {
  if (target.kind === "rss") {
    return "rss";
  }

  if (target.kind === "review_csv") {
    return "csv";
  }

  return "html";
}

export function runMockCrawler(
  projectId: string,
  input: ResearchWorkflowInput,
  crawlPlan: CrawlPlan,
  sources: ResearchSource[],
) {
  const jobs: CrawlJob[] = crawlPlan.targets.map((target, index) => ({
    id: `crawl-job-${index + 1}`,
    projectId,
    targetId: target.id,
    status: "done",
    plannedAction: `Mock ${target.kind} crawl for ${target.target}`,
    toolCandidateId:
      target.kind === "rss"
        ? "github-rss-mcp"
        : target.kind === "review_csv"
          ? "agent-factory-mock-workflow"
          : "github-apify-crawlee",
  }));

  const runs: CrawlRun[] = jobs.map((job, index) => ({
    id: `crawl-run-${index + 1}`,
    projectId,
    jobId: job.id,
    status: "done",
    startedAt: mockStartedAt,
    finishedAt: mockFinishedAt,
    documentsCreated: 1,
    summary: "mock crawler 已生成 1 条 raw document，未访问真实网页。",
  }));

  const rawDocuments: RawDocument[] = crawlPlan.targets.map((target, index) => {
    const source =
      sources.find(
        (item) =>
          item.discoveryCandidateId === target.candidateId &&
          item.value === target.target,
      ) ?? sources[index];

    if (!source) {
      throw new Error(`Missing source for crawl target: ${target.id}`);
    }

    const extractedText = buildMockText(target, input);

    return {
      id: `raw-document-${index + 1}`,
      projectId,
      sourceId: source.id,
      crawlRunId: runs[index]?.id ?? "crawl-run-1",
      url: target.target,
      title: `${target.kind} mock document`,
      contentType: contentTypeForTarget(target),
      excerpt: extractedText.slice(0, 160),
      extractedText,
      databaseTargets: target.databaseTargets,
      sourceQuality: assessSourceQuality({
        target,
        input,
        title: `${target.kind} mock document`,
        url: target.target,
        extractedText,
      }),
    };
  });

  const extractionJobs: ExtractionJob[] = rawDocuments.flatMap((document) =>
    document.databaseTargets.map((databaseName) => ({
      id: `extract-${document.id}-${databaseName}`,
      projectId,
      rawDocumentId: document.id,
      targetDatabase: databaseName,
      status: "done",
      extractedCount: 1,
      summary: `mock extractor 已把 ${document.title} 写入 ${databaseName}。`,
    })),
  );

  return {
    crawl_jobs: jobs,
    crawl_runs: runs,
    raw_documents: rawDocuments,
    extraction_jobs: extractionJobs,
  };
}

export function createResearchDocumentsFromRawDocuments(
  projectId: string,
  rawDocuments: RawDocument[],
  sources: ResearchSource[],
): ResearchDocument[] {
  const sourceDocuments = sources
    .filter((source) => source.type === "csv" || source.type === "manual_text")
    .map((source) => ({
      id: `document-${source.id}`,
      projectId,
      sourceId: source.id,
      title: source.title,
      text: source.value,
    }));

  return [
    ...rawDocuments.map((document) => ({
      id: `document-${document.id}`,
      projectId,
      sourceId: document.sourceId,
      rawDocumentId: document.id,
      title: document.title,
      text: document.extractedText,
    })),
    ...sourceDocuments,
  ];
}
