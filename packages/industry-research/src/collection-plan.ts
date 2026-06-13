import type {
  CrawlPlan,
  CrawlPlanTarget,
  IndustryResearchDatabaseName,
  ResearchWorkflowInput,
  SourceDiscoveryCandidate,
  SourceDiscoveryPlan,
} from "./types";

export const requiredIndustryResearchDatabases: IndustryResearchDatabaseName[] =
  [
    "source_database",
    "competitor_database",
    "website_structure_database",
    "product_database",
    "keyword_database",
    "pain_point_database",
    "content_database",
    "opportunity_database",
    "weekly_intelligence_reports",
  ];

function clean(value: string) {
  return value.trim();
}

function normalizeUrls(urls: string[]) {
  return urls.map(clean).filter(Boolean);
}

function createSeedKeywords(input: ResearchWorkflowInput) {
  return [
    `${input.category} best sellers ${input.market}`,
    `${input.category} reviews pain points`,
    `${input.category} Shopify collection product blog`,
    `${input.category} competitor pricing bundle starter kit`,
    `${input.industry} weekly trends ${input.market}`,
  ];
}

function candidate(
  candidate: Omit<SourceDiscoveryCandidate, "projectId" | "status">,
  projectId: string,
): SourceDiscoveryCandidate {
  return {
    ...candidate,
    projectId,
    status: "mocked",
  };
}

export function generateSourceDiscoveryPlan(
  projectId: string,
  input: ResearchWorkflowInput,
): SourceDiscoveryPlan {
  const urls = normalizeUrls(input.urls);
  const seedKeywords = createSeedKeywords(input);

  const candidates: SourceDiscoveryCandidate[] = [
    candidate(
      {
        id: "discovery-competitor-search",
        sourceType: "crawler",
        method: "search_query",
        title: "公开搜索发现竞品官网",
        seed: seedKeywords[0] ?? input.category,
        priority: "high",
        expectedDatabases: [
          "source_database",
          "competitor_database",
          "website_structure_database",
          "product_database",
        ],
        complianceBoundary:
          "只使用公开搜索结果和公开网页，不绕过登录、验证码、付费墙或 robots 限制。",
      },
      projectId,
    ),
    candidate(
      {
        id: "discovery-seed-urls",
        sourceType: "url",
        method: "seed_url",
        title: "用户提供的种子 URL",
        seed:
          urls.length > 0 ? urls.join("\n") : "未提供，mock 使用公开站点占位",
        priority: urls.length > 0 ? "high" : "medium",
        expectedDatabases: [
          "source_database",
          "competitor_database",
          "website_structure_database",
        ],
        complianceBoundary:
          "种子 URL 只作为公开页面入口，真实接入前需要人工确认可抓取边界。",
      },
      projectId,
    ),
    candidate(
      {
        id: "discovery-shopify-structure",
        sourceType: "crawler",
        method: "shopify_public_endpoint",
        title: "Shopify collection / product / blog 结构",
        seed: `${input.category} public Shopify collections and product pages`,
        priority: "high",
        expectedDatabases: [
          "website_structure_database",
          "product_database",
          "keyword_database",
          "content_database",
        ],
        complianceBoundary:
          "只规划公开 collection、product、blog、sitemap 和 RSS，不访问购物车、账号或后台。",
      },
      projectId,
    ),
    candidate(
      {
        id: "discovery-sitemap-rss",
        sourceType: "rss",
        method: "sitemap",
        title: "站点地图和 RSS 监控入口",
        seed: `${input.category} sitemap rss blog news`,
        priority: "medium",
        expectedDatabases: [
          "source_database",
          "content_database",
          "weekly_intelligence_reports",
        ],
        complianceBoundary:
          "优先使用 sitemap.xml、/blogs、RSS/Atom 和公开媒体页面，保留更新频率。",
      },
      projectId,
    ),
    candidate(
      {
        id: "discovery-review-csv",
        sourceType: "csv",
        method: "csv_seed",
        title: "评论、商品和关键词 CSV",
        seed: input.csvText.trim() || "等待用户导出的商品、评论或关键词表",
        priority: input.csvText.trim() ? "high" : "medium",
        expectedDatabases: [
          "product_database",
          "keyword_database",
          "pain_point_database",
          "opportunity_database",
        ],
        complianceBoundary:
          "只接用户可合法导出的 CSV，不抓私人数据，不采集支付或联系方式。",
      },
      projectId,
    ),
    candidate(
      {
        id: "discovery-manual-hints",
        sourceType: "manual_text",
        method: "manual_hint",
        title: "人工补充线索",
        seed: input.manualText.trim() || "等待人工补充高价值判断",
        priority: "low",
        expectedDatabases: [
          "pain_point_database",
          "content_database",
          "opportunity_database",
        ],
        complianceBoundary: "人工文本只作为补充判断，不替代自动采集和证据链。",
      },
      projectId,
    ),
  ];

  return {
    id: "source-discovery-plan-1",
    projectId,
    industry: input.industry,
    category: input.category,
    market: input.market,
    researchGoal: input.researchGoal,
    seedKeywords,
    requiredDatabases: requiredIndustryResearchDatabases,
    candidates,
    notes: [
      "先建信息源库，再把竞品、产品、关键词、痛点、内容、机会和周报挂到证据链上。",
      "第一版只执行 mock 采集；真实接入前需要确认 robots、平台条款、速率限制和数据来源授权。",
      "URL、CSV、手动文本保留为补充输入，不作为主流程入口。",
    ],
  };
}

function target(
  target: Omit<CrawlPlanTarget, "projectId">,
  projectId: string,
): CrawlPlanTarget {
  return {
    ...target,
    projectId,
  };
}

export function generateCrawlPlan(
  projectId: string,
  input: ResearchWorkflowInput,
  discoveryPlan: SourceDiscoveryPlan,
): CrawlPlan {
  const seedUrls = normalizeUrls(input.urls);
  const firstSeedUrl =
    seedUrls[0] ??
    `mock://competitor-search/${encodeURIComponent(input.category)}`;

  return {
    id: "crawl-plan-1",
    projectId,
    mode: "mock",
    guardrails: [
      "mock 模式不发起真实 HTTP 请求。",
      "真实模式只抓公开网页、公开 RSS、公开 sitemap 和用户导出的 CSV。",
      "不绕过登录、验证码、付费墙，不采集私人数据、支付信息或联系方式。",
      "真实模式需要记录来源、抓取时间、robots/条款检查和失败原因。",
    ],
    targets: [
      target(
        {
          id: "crawl-target-competitor-search",
          candidateId: "discovery-competitor-search",
          kind: "search_results",
          target: `mock://search?q=${encodeURIComponent(
            discoveryPlan.seedKeywords[0] ?? input.category,
          )}`,
          reason: "发现陌生行业里的头部竞品和公开官网入口。",
          maxPages: 5,
          databaseTargets: [
            "source_database",
            "competitor_database",
            "website_structure_database",
          ],
        },
        projectId,
      ),
      target(
        {
          id: "crawl-target-homepage",
          candidateId: "discovery-seed-urls",
          kind: "homepage",
          target: firstSeedUrl,
          reason: "拆解导航、首页卖点、信任背书和转化路径。",
          maxPages: 3,
          databaseTargets: [
            "competitor_database",
            "website_structure_database",
            "content_database",
          ],
        },
        projectId,
      ),
      target(
        {
          id: "crawl-target-shopify-collection",
          candidateId: "discovery-shopify-structure",
          kind: "collection",
          target: `${firstSeedUrl.replace(/\/$/, "")}/collections/best-sellers`,
          reason: "识别 best sellers、bundle、starter kit 和 tag 体系。",
          maxPages: 5,
          databaseTargets: [
            "website_structure_database",
            "product_database",
            "keyword_database",
          ],
        },
        projectId,
      ),
      target(
        {
          id: "crawl-target-blog-rss",
          candidateId: "discovery-sitemap-rss",
          kind: "rss",
          target: `mock://rss/${encodeURIComponent(input.category)}`,
          reason: "为周报库和内容库建立持续监控入口。",
          maxPages: 10,
          databaseTargets: [
            "source_database",
            "content_database",
            "weekly_intelligence_reports",
          ],
        },
        projectId,
      ),
      target(
        {
          id: "crawl-target-review-csv",
          candidateId: "discovery-review-csv",
          kind: "review_csv",
          target: "mock://user-exported-csv",
          reason: "把用户导出的评论、商品和关键词表转成痛点、产品和机会信号。",
          maxPages: 1,
          databaseTargets: [
            "product_database",
            "keyword_database",
            "pain_point_database",
            "opportunity_database",
          ],
        },
        projectId,
      ),
    ],
  };
}
