import { describe, expect, it } from "vitest";
import type {
  NineRouterFetch,
  PublicCrawlerFetch,
  ResearchWorkflowInput,
} from "./index";
import {
  call9RouterChatCompletion,
  canUsePublicCrawlerTarget,
  discoverPublicSources,
  ecommerceCompetitorResearchTemplate,
  generateResearchMarkdownReport,
  resolve9RouterConfig,
  run9RouterIndustryResearchWorkflow,
  runMockIndustryResearchWorkflow,
  runPublic9RouterIndustryResearchWorkflow,
  runPublicCrawler,
  runPublicIndustryResearchWorkflow,
} from "./index";

const input: ResearchWorkflowInput = {
  projectName: "宠物益生菌竞品研究",
  industry: "宠物健康电商",
  category: "宠物肠胃益生菌",
  market: "美国 DTC 电商",
  researchGoal: "找到适合小团队切入的产品和内容机会",
  templateId: "ecommerce_competitor_research",
  urls: ["https://example-pet-brand.com"],
  csvText:
    "product,price,tag\nDaily Gut Chews,29.99,digestion\nPumpkin Probiotic,24.99,sensitive stomach",
  manualText: "用户反复提到狗狗软便、换粮后肠胃不适、希望成分天然。",
};

describe("industry research mock workflow", () => {
  it("creates the required research data buckets", () => {
    const result = runMockIndustryResearchWorkflow(input);

    expect(result.research_projects).toHaveLength(1);
    expect(result.source_discovery_plans).toHaveLength(1);
    expect(result.crawl_plans).toHaveLength(1);
    expect(result.crawl_jobs.length).toBeGreaterThan(0);
    expect(result.crawl_runs.length).toBe(result.crawl_jobs.length);
    expect(result.raw_documents.length).toBeGreaterThan(0);
    expect(result.extraction_jobs.length).toBeGreaterThan(0);
    expect(result.research_sources.length).toBeGreaterThanOrEqual(3);
    expect(result.research_documents.length).toBeGreaterThanOrEqual(
      result.raw_documents.length,
    );
    expect(result.competitors).toHaveLength(1);
    expect(result.product_signals.length).toBeGreaterThan(0);
    expect(result.pain_points.length).toBeGreaterThan(0);
    expect(result.content_signals.length).toBeGreaterThan(0);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.research_reports).toHaveLength(1);
  });

  it("builds every database-first MVP view", () => {
    const result = runMockIndustryResearchWorkflow(input);

    expect(result.source_database.length).toBeGreaterThan(0);
    expect(result.competitor_database.length).toBeGreaterThan(0);
    expect(result.website_structure_database.length).toBeGreaterThan(0);
    expect(result.product_database.length).toBeGreaterThan(0);
    expect(result.keyword_database.length).toBeGreaterThan(0);
    expect(result.pain_point_database.length).toBeGreaterThan(0);
    expect(result.content_database.length).toBeGreaterThan(0);
    expect(result.opportunity_database.length).toBeGreaterThan(0);
    expect(result.weekly_intelligence_reports.length).toBeGreaterThan(0);
  });

  it("marks every MVP workflow step as done in mock mode", () => {
    const result = runMockIndustryResearchWorkflow(input);

    expect(result.workflowSteps).toHaveLength(
      ecommerceCompetitorResearchTemplate.workflowSteps.length,
    );
    expect(result.workflowSteps.every((step) => step.status === "done")).toBe(
      true,
    );
  });

  it("generates a markdown report with opportunity scores", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const report = generateResearchMarkdownReport(result);

    expect(report).toContain("# 宠物益生菌竞品研究");
    expect(report).toContain("## 自动采集计划");
    expect(report).toContain("## 数据库建设结果");
    expect(report).toContain("source_database 信息源库");
    expect(report).toContain("## 机会评分");
    expect(report).toContain("总分");
    expect(result.research_reports[0]?.content).toContain("## Mock 采集结果");
  });
});

describe("industry research 9router workflow", () => {
  it("resolves 9router config from the Horizon documents env shape", () => {
    const config = resolve9RouterConfig({
      OPENAI_API_KEY: "test-key",
      HORIZON_AI_BASE_URL: "http://localhost:20128/v1",
    });

    expect(config).toEqual({
      apiKey: "test-key",
      baseUrl: "http://localhost:20128/v1",
      model: "kr/claude-sonnet-4.5",
    });
  });

  it("calls 9router chat completions without leaking the API key into the body", async () => {
    const calls: Array<{
      input: string;
      init: Parameters<NineRouterFetch>[1];
    }> = [];
    const fakeFetch: NineRouterFetch = async (input, init) => {
      calls.push({ input, init });

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: "# 9router 报告" } }],
          }),
      };
    };

    const result = await call9RouterChatCompletion({
      env: {
        AGENT_FACTORY_9ROUTER_API_KEY: "secret-key",
        AGENT_FACTORY_9ROUTER_BASE_URL: "https://example.test/v1",
        AGENT_FACTORY_9ROUTER_MODEL: "kr/claude-sonnet-4.5",
      },
      fetcher: fakeFetch,
      messages: [{ role: "user", content: "生成报告" }],
    });

    expect(result).toEqual({
      content: "# 9router 报告",
      model: "kr/claude-sonnet-4.5",
    });
    expect(calls[0]?.input).toBe("https://example.test/v1/chat/completions");
    expect(calls[0]?.init.headers.Authorization).toBe("Bearer secret-key");
    expect(calls[0]?.init.body).not.toContain("secret-key");
    expect(calls[0]?.init.body).toContain('"model":"kr/claude-sonnet-4.5"');
    expect(calls[0]?.init.body).not.toContain("thinking");
  });

  it("parses 9router SSE chat completion chunks", async () => {
    const fakeFetch: NineRouterFetch = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        [
          'data: {"choices":[{"delta":{"role":"assistant","content":"# 报告"}}]}',
          'data: {"choices":[{"delta":{"content":"\\n\\nKiro 路由可用。"}}]}',
          "data: [DONE]",
        ].join("\n\n"),
    });

    const result = await call9RouterChatCompletion({
      env: {
        AGENT_FACTORY_9ROUTER_API_KEY: "secret-key",
        AGENT_FACTORY_9ROUTER_MODEL: "kr/claude-sonnet-4.5",
      },
      fetcher: fakeFetch,
      messages: [{ role: "user", content: "生成报告" }],
    });

    expect(result).toEqual({
      content: "# 报告\n\nKiro 路由可用。",
      model: "kr/claude-sonnet-4.5",
    });
  });

  it("redacts provider error messages before surfacing them", async () => {
    const fakeFetch: NineRouterFetch = async () => ({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: {
            message: "Authentication Fails, Your api key: ****lfgX is invalid",
          },
        }),
    });
    await expect(
      call9RouterChatCompletion({
        env: {
          AGENT_FACTORY_9ROUTER_API_KEY: "secret-key",
        },
        fetcher: fakeFetch,
        messages: [{ role: "user", content: "生成报告" }],
      }),
    ).rejects.toThrow("api key: [redacted]");
  });

  it("uses 9router to replace only the markdown report while keeping database outputs", async () => {
    const fakeFetch: NineRouterFetch = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: "# 9router 行业研究报告\n\n## 数据库建设结果",
              },
            },
          ],
        }),
    });

    const result = await run9RouterIndustryResearchWorkflow(input, {
      env: {
        AGENT_FACTORY_9ROUTER_API_KEY: "test-key",
        AGENT_FACTORY_9ROUTER_MODEL: "kr/claude-sonnet-4.5",
      },
      fetcher: fakeFetch,
    });

    expect(result.source_database.length).toBeGreaterThan(0);
    expect(result.raw_documents.length).toBeGreaterThan(0);
    expect(result.research_reports[0]?.title).toContain(
      "9router Markdown 报告",
    );
    expect(result.research_reports[0]?.content).toContain(
      "9router 行业研究报告",
    );
  });

  it("uses 9router to extract structured data from public raw documents before report generation", async () => {
    let nineRouterCallCount = 0;
    const fakePublicFetch: PublicCrawlerFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head><title>GutPet Labs</title></head>
          <body>
            <nav>Best Sellers Reviews Blog</nav>
            <h1>Daily Gut Starter Kit</h1>
            <p>Subscription probiotic bundle for sensitive stomach support.</p>
          </body>
        </html>
      `,
      headers: {
        get: (name) =>
          name.toLowerCase() === "content-type" ? "text/html" : null,
      },
    });
    const fakeNineRouterFetch: NineRouterFetch = async () => {
      nineRouterCallCount += 1;

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    nineRouterCallCount === 1
                      ? JSON.stringify({
                          competitors: [
                            {
                              name: "GutPet Labs",
                              channel: "DTC",
                              positioning: "宠物肠胃益生菌订阅套装品牌。",
                              websiteStructure: [
                                "Best Sellers",
                                "Reviews",
                                "Blog",
                              ],
                              collectionSignals: [
                                "Subscription probiotic bundle",
                              ],
                              evidenceQuotes: [
                                "Daily Gut Starter Kit",
                                "Subscription probiotic bundle",
                              ],
                            },
                          ],
                          productSignals: [
                            {
                              competitorName: "GutPet Labs",
                              category: "宠物肠胃益生菌",
                              signal: "订阅型益生菌套装是明确产品信号。",
                              tags: ["subscription", "starter-kit"],
                              evidenceQuotes: ["Subscription probiotic bundle"],
                            },
                          ],
                          painPoints: [
                            {
                              theme: "肠胃敏感",
                              userNeed: "需要温和、可持续的益生菌支持。",
                              frequency: "high",
                              evidenceQuotes: ["sensitive stomach support"],
                            },
                          ],
                          contentSignals: [
                            {
                              platform: "Blog",
                              topic: "益生菌购买指南",
                              contentType: "save",
                              whyItWorks: "适合解释成分、场景和复购。",
                              evidenceQuotes: ["Blog"],
                            },
                          ],
                          opportunities: [
                            {
                              title: "敏感肠胃入门套装",
                              summary: "用订阅套装降低新用户选择成本。",
                              demandScore: 82,
                              competitionScore: 58,
                              contentGapScore: 76,
                              businessValueScore: 80,
                              evidenceQualityScore: 72,
                              reviewStatus: "needs_review",
                              reviewNote: "需要补充真实评论和价格。",
                              evidenceQuotes: ["Daily Gut Starter Kit"],
                            },
                          ],
                        })
                      : "# 9router 公开采集结构化报告\n\n## 竞品拆解",
                },
              },
            ],
          }),
      };
    };

    const result = await runPublic9RouterIndustryResearchWorkflow(
      {
        ...input,
        urls: ["https://brand.example"],
      },
      {
        env: {
          AGENT_FACTORY_9ROUTER_API_KEY: "test-key",
          AGENT_FACTORY_9ROUTER_MODEL: "kr/claude-sonnet-4.5",
        },
        fetcher: fakeNineRouterFetch,
        publicFetcher: fakePublicFetch,
      },
    );

    expect(nineRouterCallCount).toBe(2);
    expect(result.crawl_plans[0]?.mode).toBe("public_web");
    expect(result.competitors[0]?.name).toBe("GutPet Labs");
    expect(result.product_signals[0]?.signal).toContain("订阅型益生菌套装");
    expect(result.pain_points[0]?.theme).toBe("肠胃敏感");
    expect(result.opportunities[0]?.title).toBe("敏感肠胃入门套装");
    expect(result.reviewItems[0]?.targetId).toBe("glm-competitor-1");
    expect(result.research_reports[0]?.content).toContain(
      "9router 公开采集结构化报告",
    );
  });

  it("keeps public crawl results when 9router report generation fails", async () => {
    let nineRouterCallCount = 0;
    const fakePublicFetch: PublicCrawlerFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head><title>GutPet Labs</title></head>
          <body>
            <h1>Daily Gut Starter Kit</h1>
            <p>Subscription probiotic bundle for sensitive stomach support.</p>
          </body>
        </html>
      `,
      headers: {
        get: (name) =>
          name.toLowerCase() === "content-type" ? "text/html" : null,
      },
    });
    const fakeNineRouterFetch: NineRouterFetch = async () => {
      nineRouterCallCount += 1;

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    nineRouterCallCount === 1
                      ? JSON.stringify({
                          competitors: [
                            {
                              name: "GutPet Labs",
                              channel: "DTC",
                              positioning: "宠物肠胃益生菌订阅套装品牌。",
                              websiteStructure: ["Product", "Reviews"],
                              collectionSignals: [
                                "Subscription probiotic bundle",
                              ],
                              evidenceQuotes: ["Daily Gut Starter Kit"],
                            },
                          ],
                          productSignals: [],
                          painPoints: [],
                          contentSignals: [],
                          opportunities: [],
                        })
                      : "",
                },
              },
            ],
          }),
      };
    };

    const result = await runPublic9RouterIndustryResearchWorkflow(
      {
        ...input,
        urls: ["https://brand.example"],
      },
      {
        env: {
          AGENT_FACTORY_9ROUTER_API_KEY: "test-key",
          AGENT_FACTORY_9ROUTER_MODEL: "kr/claude-sonnet-4.5",
        },
        fetcher: fakeNineRouterFetch,
        publicFetcher: fakePublicFetch,
      },
    );

    expect(nineRouterCallCount).toBe(2);
    expect(result.raw_documents.length).toBeGreaterThan(0);
    expect(result.competitors[0]?.name).toBe("GutPet Labs");
    expect(result.research_reports[0]?.title).toContain("本地回退");
    expect(result.research_reports[0]?.content).toContain(
      "9router 报告节点暂时失败",
    );
    expect(result.research_reports[0]?.content).toContain("## 公开采集结果");
  });
});

describe("industry research public crawl adapter", () => {
  const projectId = "research-public-crawl";
  const sources = [
    {
      id: "source-homepage",
      projectId,
      type: "url" as const,
      title: "Competitor homepage",
      value: "https://brand.example",
      automationHint: "公开首页。",
      discoveryCandidateId: "seed-homepage",
      priority: "high" as const,
    },
    {
      id: "source-rss",
      projectId,
      type: "rss" as const,
      title: "Competitor RSS",
      value: "https://brand.example/feed.xml",
      automationHint: "公开 RSS。",
      discoveryCandidateId: "seed-rss",
      priority: "medium" as const,
    },
    {
      id: "source-sitemap",
      projectId,
      type: "crawler" as const,
      title: "Competitor sitemap",
      value: "https://brand.example/sitemap.xml",
      automationHint: "公开 sitemap。",
      discoveryCandidateId: "seed-sitemap",
      priority: "medium" as const,
    },
  ];
  const crawlPlan = {
    id: "public-plan-1",
    projectId,
    mode: "public_web" as const,
    guardrails: ["只抓公开 http/https URL。"],
    targets: [
      {
        id: "target-homepage",
        projectId,
        candidateId: "seed-homepage",
        kind: "homepage" as const,
        target: "https://brand.example",
        reason: "抽取首页结构。",
        maxPages: 1,
        databaseTargets: ["website_structure_database" as const],
      },
      {
        id: "target-rss",
        projectId,
        candidateId: "seed-rss",
        kind: "rss" as const,
        target: "https://brand.example/feed.xml",
        reason: "抽取内容更新。",
        maxPages: 5,
        databaseTargets: ["content_database" as const],
      },
      {
        id: "target-sitemap",
        projectId,
        candidateId: "seed-sitemap",
        kind: "sitemap" as const,
        target: "https://brand.example/sitemap.xml",
        reason: "抽取产品页面 URL。",
        maxPages: 20,
        databaseTargets: ["source_database" as const],
      },
    ],
  };

  it("extracts public HTML, RSS and sitemap targets into raw documents", async () => {
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const bodies: Record<string, { body: string; contentType: string }> = {
        "https://brand.example": {
          body: `
            <html>
              <head><title>Brand Home</title><script>ignore()</script></head>
              <body><h1>Starter kits</h1><p>Bundle, reviews, subscription.</p></body>
            </html>
          `,
          contentType: "text/html",
        },
        "https://brand.example/feed.xml": {
          body: `
            <rss><channel><title>Brand Blog</title>
              <item><title>Buying Guide</title><link>https://brand.example/blog/guide</link><description>How to compare starter kits.</description></item>
            </channel></rss>
          `,
          contentType: "application/rss+xml",
        },
        "https://brand.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://brand.example/products/a</loc></url>
              <url><loc>https://brand.example/blog/guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
      };
      const fixture = bodies[String(url)];

      if (!fixture) {
        return {
          ok: false,
          status: 404,
          text: async () => "",
          headers: { get: () => null },
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => fixture.body,
        headers: {
          get: (name) =>
            name.toLowerCase() === "content-type" ? fixture.contentType : null,
        },
      };
    };

    const result = await runPublicCrawler(projectId, crawlPlan, sources, {
      fetcher: fakeFetch,
    });

    expect(result.crawl_jobs.every((job) => job.status === "done")).toBe(true);
    expect(result.crawl_runs.every((run) => run.documentsCreated === 1)).toBe(
      true,
    );
    expect(result.raw_documents).toHaveLength(3);
    expect(
      result.raw_documents.map((document) => document.contentType),
    ).toEqual(["html", "rss", "text"]);
    expect(result.raw_documents[0]?.extractedText).toContain("Starter kits");
    expect(result.raw_documents[1]?.extractedText).toContain("Buying Guide");
    expect(result.raw_documents[2]?.extractedText).toContain(
      "https://brand.example/products/a",
    );
    expect(result.extraction_jobs).toHaveLength(3);
  });

  it("skips unsupported public crawl targets instead of fetching mock URLs", async () => {
    const target = {
      ...crawlPlan.targets[0],
      kind: "search_results" as const,
      target: "mock://search?q=pet",
    };
    const fetchCalls: string[] = [];
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        status: 200,
        text: async () => "",
        headers: { get: () => null },
      };
    };

    expect(canUsePublicCrawlerTarget(target)).toBe(false);

    const result = await runPublicCrawler(
      projectId,
      { ...crawlPlan, targets: [target] },
      sources,
      { fetcher: fakeFetch },
    );

    expect(fetchCalls).toHaveLength(0);
    expect(result.crawl_jobs[0]?.status).toBe("failed");
    expect(result.crawl_runs[0]?.documentsCreated).toBe(0);
    expect(result.raw_documents).toHaveLength(0);
  });
});

describe("industry research public source discovery", () => {
  it("discovers robots, sitemap, RSS, Shopify and content URLs from a seed site", async () => {
    const projectId = "research-public-source-discovery";
    const crawlPlan = {
      id: "public-plan-discovery",
      projectId,
      mode: "public_web" as const,
      guardrails: ["只抓公开 http/https URL。"],
      targets: [
        {
          id: "target-homepage",
          projectId,
          candidateId: "seed-homepage",
          kind: "homepage" as const,
          target: "https://brand.example/",
          reason: "抽取首页结构。",
          maxPages: 1,
          databaseTargets: ["website_structure_database" as const],
        },
      ],
    };
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const fixtures: Record<string, { body: string; contentType: string }> = {
        "https://brand.example/": {
          body: `
            <html>
              <head><link rel="alternate" type="application/rss+xml" href="/feed.xml" /></head>
              <body><a href="/collections/all">Shop all</a><a href="/blogs/guides">Guides</a></body>
            </html>
          `,
          contentType: "text/html",
        },
        "https://brand.example/robots.txt": {
          body: "User-agent: *\nAllow: /\nSitemap: https://brand.example/sitemap.xml",
          contentType: "text/plain",
        },
        "https://brand.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://brand.example/products/starter-kit</loc></url>
              <url><loc>https://brand.example/blogs/guides/probiotic-guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
        "https://brand.example/feed.xml": {
          body: `
            <rss><channel><title>Brand Feed</title>
              <item><title>Guide</title><link>https://brand.example/blogs/guides/probiotic-guide</link></item>
            </channel></rss>
          `,
          contentType: "application/rss+xml",
        },
        "https://brand.example/collections/all": {
          body: "<html><title>All products</title></html>",
          contentType: "text/html",
        },
      };
      const fixture = fixtures[String(url)];

      return fixture
        ? {
            ok: true,
            status: 200,
            text: async () => fixture.body,
            headers: {
              get: (name) =>
                name.toLowerCase() === "content-type"
                  ? fixture.contentType
                  : null,
            },
          }
        : {
            ok: false,
            status: 404,
            text: async () => "",
            headers: { get: () => null },
          };
    };

    const result = await discoverPublicSources(projectId, input, crawlPlan, {
      fetcher: fakeFetch,
    });
    const kinds = result.targets.map((target) => target.kind);
    const targetUrls = result.targets.map((target) => target.target);

    expect(result.candidates.every((candidate) => candidate.status)).toBe(true);
    expect(kinds).toContain("robots");
    expect(kinds).toContain("sitemap");
    expect(kinds).toContain("rss");
    expect(kinds).toContain("collection");
    expect(kinds).toContain("product");
    expect(kinds).toContain("blog");
    expect(targetUrls).not.toContain("https://brand.example/");
    expect(result.notes.some((note) => note.includes("自动发现"))).toBe(true);
  });
});

describe("industry research public workflow", () => {
  it("discovers competitor websites from public search when no seed URLs are provided", async () => {
    const fetchCalls: string[] = [];
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const urlText = String(url);
      fetchCalls.push(urlText);

      if (urlText.startsWith("https://duckduckgo.com/html/")) {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html><body>
              <a class="result__a" href="/l/?uddg=${encodeURIComponent("https://gutpet.example/")}">GutPet Labs</a>
            </body></html>
          `,
          headers: {
            get: (name) =>
              name.toLowerCase() === "content-type" ? "text/html" : null,
          },
        };
      }

      const bodyByUrl: Record<string, { body: string; contentType: string }> = {
        "https://gutpet.example/": {
          body: `
            <html><head><title>GutPet Labs</title></head>
            <body><nav>Best Sellers Blog Reviews</nav><p>Subscription starter kits for sensitive stomach.</p></body></html>
          `,
          contentType: "text/html",
        },
        "https://gutpet.example/robots.txt": {
          body: "User-agent: *\nAllow: /\nSitemap: https://gutpet.example/sitemap.xml",
          contentType: "text/plain",
        },
        "https://gutpet.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://gutpet.example/products/starter-kit</loc></url>
              <url><loc>https://gutpet.example/blogs/guides/probiotic-guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
        "https://gutpet.example/products/starter-kit": {
          body: `
            <html><head><title>Daily Gut Starter Kit</title></head>
            <body><h1>Daily Gut Starter Kit</h1><p>Bundle and subscription probiotic.</p></body></html>
          `,
          contentType: "text/html",
        },
      };
      const fixture = bodyByUrl[urlText];

      return fixture
        ? {
            ok: true,
            status: 200,
            text: async () => fixture.body,
            headers: {
              get: (name) =>
                name.toLowerCase() === "content-type"
                  ? fixture.contentType
                  : null,
            },
          }
        : {
            ok: false,
            status: 404,
            text: async () => "",
            headers: { get: () => null },
          };
    };

    const result = await runPublicIndustryResearchWorkflow(
      {
        ...input,
        urls: [],
      },
      {
        fetcher: fakeFetch,
        maxDiscoveredTargets: 8,
        maxSitemapUrls: 4,
      },
    );
    const targets = result.crawl_plans[0]?.targets.map(
      (target) => target.target,
    );

    expect(fetchCalls.some((url) => url.includes("duckduckgo.com/html"))).toBe(
      true,
    );
    expect(
      result.source_discovery_plans[0]?.notes.some((note) =>
        note.includes("public_search_discovery 自动发现"),
      ),
    ).toBe(true);
    expect(targets).toContain("https://gutpet.example/");
    expect(targets).toContain("https://gutpet.example/sitemap.xml");
    expect(targets).toContain("https://gutpet.example/products/starter-kit");
    expect(
      result.raw_documents.some((document) =>
        document.extractedText.includes("GutPet Labs"),
      ),
    ).toBe(true);
  });

  it("runs a database-first workflow with public raw documents", async () => {
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const bodyByUrl: Record<string, { body: string; contentType: string }> = {
        "https://brand.example": {
          body: `
            <html><head><title>Brand Home</title></head>
            <body><nav>Best Sellers Blog Reviews</nav><p>Subscription starter kits for sensitive stomach.</p></body></html>
          `,
          contentType: "text/html",
        },
        "https://brand.example/feed.xml": {
          body: `
            <rss><channel><title>Brand Updates</title>
              <item><title>New comparison guide</title><description>Bundle and starter kit comparisons.</description></item>
            </channel></rss>
          `,
          contentType: "application/rss+xml",
        },
        "https://brand.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://brand.example/products/starter-kit</loc></url>
              <url><loc>https://brand.example/blog/comparison-guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
      };
      const fixture = bodyByUrl[String(url)];

      return fixture
        ? {
            ok: true,
            status: 200,
            text: async () => fixture.body,
            headers: {
              get: (name) =>
                name.toLowerCase() === "content-type"
                  ? fixture.contentType
                  : null,
            },
          }
        : {
            ok: false,
            status: 404,
            text: async () => "",
            headers: { get: () => null },
          };
    };

    const result = await runPublicIndustryResearchWorkflow(
      {
        ...input,
        urls: [
          "https://brand.example",
          "https://brand.example/feed.xml",
          "https://brand.example/sitemap.xml",
        ],
      },
      { fetcher: fakeFetch },
    );

    expect(result.crawl_plans[0]?.mode).toBe("public_web");
    expect(result.raw_documents.length).toBeGreaterThanOrEqual(3);
    expect(result.raw_documents[0]?.extractedText).toContain("Best Sellers");
    expect(
      result.source_discovery_plans[0]?.candidates.some(
        (candidate) => candidate.status === "discovered",
      ),
    ).toBe(true);
    expect(
      result.crawl_plans[0]?.targets.some(
        (target) =>
          target.target === "https://brand.example/products/starter-kit",
      ),
    ).toBe(true);
    expect(result.source_database[0]?.reliability).toBe("needs_validation");
    expect(
      result.workflowSteps.some((step) => step.title === "采集公开资料"),
    ).toBe(true);
    expect(result.research_reports[0]?.content).toContain("## 公开采集结果");
  });
});
