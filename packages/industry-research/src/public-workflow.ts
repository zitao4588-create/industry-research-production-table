import {
  generateCrawlPlan,
  generateSourceDiscoveryPlan,
} from "./collection-plan";
import { buildIndustryResearchDatabases } from "./database-builder";
import {
  createResearchDocumentsFromRawDocuments,
  createResearchSourcesFromPlan,
} from "./mock-crawler";
import {
  createIndustryResearchProject,
  createResearchReviewItems,
} from "./mock-workflow";
import {
  type PublicCrawlerFetch,
  runPublicCrawler,
} from "./public-crawl-adapter";
import { discoverPublicSources } from "./public-source-discovery";
import { generateResearchMarkdownReport } from "./report";
import { ecommerceCompetitorResearchTemplate } from "./templates";
import type {
  CrawlPlan,
  CrawlPlanTarget,
  CrawlTargetKind,
  IndustryResearchDatabaseName,
  ResearchWorkflowInput,
  ResearchWorkflowResult,
} from "./types";

type PublicWorkflowOptions = {
  fetcher?: PublicCrawlerFetch;
  now?: string;
  maxDiscoveredTargets?: number;
  maxProbeUrls?: number;
  maxSitemapUrls?: number;
  requestTimeoutMs?: number;
};

function normalizeUrls(urls: string[]) {
  return urls.map((url) => url.trim()).filter(Boolean);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
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

  if (normalizedUrl.includes("/products/")) {
    return "product";
  }

  if (normalizedUrl.includes("/collections/")) {
    return "collection";
  }

  if (normalizedUrl.includes("/blog")) {
    return "blog";
  }

  return "homepage";
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

function createSupplementalPublicTargets(
  projectId: string,
  input: ResearchWorkflowInput,
  existingTargets: CrawlPlanTarget[],
) {
  const existingTargetUrls = new Set(
    existingTargets.map((target) => target.target),
  );

  return normalizeUrls(input.urls)
    .filter(isHttpUrl)
    .filter((url) => !existingTargetUrls.has(url))
    .map((url, index) => {
      const kind = inferTargetKind(url);

      return {
        id: `crawl-target-public-url-${index + 1}`,
        projectId,
        candidateId: "discovery-seed-urls",
        kind,
        target: url,
        reason: "用户提供的公开 URL，public_web 模式直接抽取为 raw document。",
        maxPages: 1,
        databaseTargets: databaseTargetsForKind(kind),
      } satisfies CrawlPlanTarget;
    });
}

function createPublicCrawlPlan(
  projectId: string,
  input: ResearchWorkflowInput,
  basePlan: CrawlPlan,
): CrawlPlan {
  const userProvidedPublicTargets = createSupplementalPublicTargets(
    projectId,
    input,
    [],
  );

  return {
    ...basePlan,
    mode: "public_web",
    guardrails: [
      "public_web 模式只处理公开 http/https URL。",
      "不绕过登录、验证码、付费墙，不采集私人数据、支付信息或联系方式。",
      "mock:// 搜索、CSV 和手动文本会保留为补充链路，不进入真实 public_web crawl plan。",
      "未验证的 Shopify、RSS 和产品 JSON 猜测路径不会直接进入真实抓取；只有用户明确输入或从首页、robots、sitemap 发现的公开 URL 才会抓取。",
      "公开网页抽取出的结构化结论必须人工复核。",
    ],
    targets: userProvidedPublicTargets,
  };
}

export async function runPublicIndustryResearchWorkflow(
  input: ResearchWorkflowInput,
  options: PublicWorkflowOptions = {},
): Promise<ResearchWorkflowResult> {
  const project = createIndustryResearchProject(input);
  const sourceDiscoveryPlan = generateSourceDiscoveryPlan(project.id, input);
  const baseCrawlPlan = generateCrawlPlan(
    project.id,
    input,
    sourceDiscoveryPlan,
  );
  const publicCrawlPlan = createPublicCrawlPlan(
    project.id,
    input,
    baseCrawlPlan,
  );
  const publicSourceDiscovery = await discoverPublicSources(
    project.id,
    input,
    publicCrawlPlan,
    {
      fetcher: options.fetcher,
      maxDiscoveredTargets: options.maxDiscoveredTargets,
      maxProbeUrls: options.maxProbeUrls,
      maxSitemapUrls: options.maxSitemapUrls,
      requestTimeoutMs: options.requestTimeoutMs,
    },
  );
  const enhancedSourceDiscoveryPlan = {
    ...sourceDiscoveryPlan,
    candidates: [
      ...sourceDiscoveryPlan.candidates,
      ...publicSourceDiscovery.candidates,
    ],
    notes: [...sourceDiscoveryPlan.notes, ...publicSourceDiscovery.notes],
  };
  const crawlPlan = {
    ...publicCrawlPlan,
    targets: [...publicCrawlPlan.targets, ...publicSourceDiscovery.targets],
    guardrails: [
      ...publicCrawlPlan.guardrails,
      "public_source_discovery 会保守探测公开首页、robots 和 sitemap；RSS/Atom、collection、product、blog 只从真实页面链接或 sitemap 进入采集。",
    ],
  };
  const sources = createResearchSourcesFromPlan(
    project.id,
    input,
    enhancedSourceDiscoveryPlan,
    crawlPlan,
  );
  const crawlerResult = await runPublicCrawler(project.id, crawlPlan, sources, {
    fetcher: options.fetcher,
    input,
    now: options.now,
  });
  const researchDocuments = createResearchDocumentsFromRawDocuments(
    project.id,
    crawlerResult.raw_documents,
    sources,
  );
  const databases = buildIndustryResearchDatabases({
    project,
    input,
    discoveryPlan: enhancedSourceDiscoveryPlan,
    sources,
    rawDocuments: crawlerResult.raw_documents,
    sourceReliability: "needs_validation",
  });
  const dataset = {
    research_projects: [project],
    source_discovery_plans: [enhancedSourceDiscoveryPlan],
    crawl_plans: [crawlPlan],
    ...crawlerResult,
    research_sources: sources,
    research_documents: researchDocuments,
    ...databases,
  };
  const reportContent = generateResearchMarkdownReport(dataset);

  return {
    ...dataset,
    research_reports: [
      {
        id: "report-public-web-1",
        projectId: project.id,
        format: "markdown",
        title: `${project.name} 公开采集 Markdown 报告`,
        content: reportContent,
        createdAt: new Date().toISOString(),
      },
    ],
    workflowSteps: ecommerceCompetitorResearchTemplate.workflowSteps.map(
      (step) =>
        step.id === "mock_crawl_sources"
          ? {
              ...step,
              title: "采集公开资料",
              description:
                "从用户提供和计划生成的公开 http/https URL 抽取 raw documents。",
              status: "done",
            }
          : {
              ...step,
              status: "done",
            },
    ),
    reviewItems: createResearchReviewItems(dataset),
  };
}
