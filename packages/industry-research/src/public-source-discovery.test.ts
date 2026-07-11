import { describe, expect, it } from "vitest";
import {
  deepPageDiscoveryFixtures,
  verifyDeepPageDiscoveryFixture,
} from "./deep-page-fixtures";
import {
  type PublicCrawlerFetch,
  runPublicCrawler,
} from "./public-crawl-adapter";
import { discoverPublicSources } from "./public-source-discovery";
import { runPublicIndustryResearchWorkflow } from "./public-workflow";
import { resolveSearchProviderConfig } from "./search-providers";
import type { CrawlPlan, ResearchSource, ResearchWorkflowInput } from "./types";

const input: ResearchWorkflowInput = {
  projectName: "发现层测试",
  industry: "宠物健康电商",
  category: "宠物肠胃益生菌",
  market: "美国 DTC 电商",
  researchGoal: "验证搜索 provider 与 robots/配额边界",
  templateId: "ecommerce_competitor_research",
  urls: ["https://brand.example/"],
  csvText: "",
  manualText: "",
};

const shaverInput: ResearchWorkflowInput = {
  projectName: "剃须刀发现层测试",
  industry: "男士电动剃须刀",
  category: "男士电动剃须刀",
  market: "中国线上电商 / DTC",
  researchGoal: "验证固定可信来源优先",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

const dishwasherInput: ResearchWorkflowInput = {
  projectName: "洗碗机发现层测试",
  industry: "洗碗机",
  category: "洗碗机",
  market: "中国线上电商 / DTC",
  researchGoal: "验证洗碗机固定可信来源优先",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

const firecrawlMapCategoryFixtures = [
  {
    id: "pet-probiotics",
    category: "宠物肠胃益生菌",
    baseUrl: "https://pet-map.example/",
    deepUrl: "https://pet-map.example/discover/daily-gut",
    title: "Daily Gut Probiotic Product for Dogs",
    expectedKind: "product" as const,
  },
  {
    id: "dishwasher",
    category: "洗碗机",
    baseUrl: "https://dishwasher-map.example/",
    deepUrl: "https://dishwasher-map.example/series/x1",
    title: "洗碗机 产品 型号 X1",
    expectedKind: "product" as const,
  },
  {
    id: "japan-niche-skincare",
    category: "日本小众护肤品牌",
    baseUrl: "https://skincare-map.example/",
    deepUrl: "https://skincare-map.example/brand-line/hada",
    title: "日本护肤 系列 分类",
    expectedKind: "collection" as const,
  },
];

const emptyCrawlPlan: CrawlPlan = {
  id: "crawl-plan-test",
  projectId: "project-test",
  mode: "public_web",
  targets: [],
  guardrails: [],
};

function htmlResponse(body: string) {
  return {
    ok: true,
    status: 200,
    text: async () => body,
    headers: { get: () => "text/html" },
  };
}

function textResponse(body: string, contentType = "text/plain") {
  return {
    ok: true,
    status: 200,
    text: async () => body,
    headers: { get: () => contentType },
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    headers: { get: () => "application/json" },
  };
}

function notFound() {
  return {
    ok: false,
    status: 404,
    text: async () => "",
    headers: { get: () => "" },
  };
}

const brandSiteResponses: Record<
  string,
  ReturnType<typeof htmlResponse> | ReturnType<typeof textResponse>
> = {
  "https://brand.example/": htmlResponse(
    [
      "<html><head>",
      '<link rel="alternate" type="application/rss+xml" href="/blogs/news.atom">',
      "</head><body>",
      '<a href="/collections/all">Collections</a>',
      '<a href="/private/page">Private</a>',
      '<a href="/blog/guide">Guide</a>',
      "</body></html>",
    ].join(""),
  ),
  "https://brand.example/robots.txt": textResponse(
    ["User-agent: *", "Disallow: /private", "Disallow: /cart*sort", ""].join(
      "\n",
    ),
  ),
  "https://brand.example/sitemap.xml": textResponse(
    [
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...Array.from(
        { length: 10 },
        (_, index) =>
          `<url><loc>https://brand.example/products/item-${index + 1}</loc></url>`,
      ),
      "<url><loc>https://brand.example/collections/best-sellers</loc></url>",
      "<url><loc>https://brand.example/private/secret</loc></url>",
      "</urlset>",
    ].join(""),
    "application/xml",
  ),
};

function createDiscoveryFetcher(overrides: {
  onSearch: (
    url: string,
    init?: RequestInit,
  ) => Awaited<ReturnType<PublicCrawlerFetch>> | null;
}) {
  const requestedUrls: string[] = [];
  const requestedInits: Array<RequestInit | undefined> = [];
  const fetcher: PublicCrawlerFetch = async (url, init) => {
    requestedUrls.push(url);
    requestedInits.push(init);
    const searchResponse = overrides.onSearch(url, init);

    if (searchResponse) {
      return searchResponse;
    }

    if (brandSiteResponses[url]) {
      return brandSiteResponses[url];
    }

    if (url === "https://newbrand.example/") {
      return htmlResponse("<html><body>New brand</body></html>");
    }

    return notFound();
  };

  return { fetcher, requestedUrls, requestedInits };
}

describe("resolveSearchProviderConfig", () => {
  it("uses brave when provider and key are configured", () => {
    const config = resolveSearchProviderConfig({
      AGENT_FACTORY_SEARCH_PROVIDER: "brave",
      AGENT_FACTORY_SEARCH_API_KEY: "brave-key",
    });

    expect(config.provider).toBe("brave");
    expect(config.apiKey).toBe("brave-key");
    expect(config.endpoint).toContain("api.search.brave.com");
  });

  it("uses tavily when provider and key are configured", () => {
    const config = resolveSearchProviderConfig({
      AGENT_FACTORY_SEARCH_PROVIDER: "tavily",
      AGENT_FACTORY_SEARCH_API_KEY: "tavily-key",
    });

    expect(config.provider).toBe("tavily");
    expect(config.apiKey).toBe("tavily-key");
    expect(config.endpoint).toContain("api.tavily.com");
  });

  it("falls back to duckduckgo html when the api key is missing", () => {
    const config = resolveSearchProviderConfig({
      AGENT_FACTORY_SEARCH_PROVIDER: "serper",
    });

    expect(config.provider).toBe("duckduckgo_html");
    expect(config.fallbackReason).toContain("缺少");
  });

  it("defaults to duckduckgo html", () => {
    const config = resolveSearchProviderConfig({});

    expect(config.provider).toBe("duckduckgo_html");
    expect(config.fallbackReason).toBeUndefined();
  });
});

describe("discoverPublicSources with api search provider", () => {
  it("adds fixed trusted registry sources even when search returns no useful urls", async () => {
    const { fetcher } = createDiscoveryFetcher({
      onSearch: (url) =>
        url === "https://api.tavily.com/search"
          ? jsonResponse({ results: [] })
          : null,
    });

    const result = await discoverPublicSources(
      "project-test",
      shaverInput,
      emptyCrawlPlan,
      {
        fetcher,
        maxProbeUrls: 1,
        searchProvider: {
          provider: "tavily",
          endpoint: "https://api.tavily.com/search",
          apiKey: "tavily-key",
        },
      },
    );

    const registryCandidates = result.candidates.filter(
      (candidate) => candidate.method === "source_registry",
    );
    const seeds = registryCandidates.map((candidate) => candidate.seed);

    expect(seeds).toContain("https://www.philips.com.cn/");
    expect(seeds).toContain("https://www.braun.cn/");
    expect(seeds).toContain("https://www.panasonic.cn/");
    expect(seeds).toContain("https://www.flyco.com/");
    expect(
      registryCandidates.every((candidate) =>
        candidate.title.startsWith("固定可信来源："),
      ),
    ).toBe(true);
    expect(
      result.notes.some((note) => note.includes("source_registry 命中")),
    ).toBe(true);
  });

  it("adds dishwasher official registry sources before search discovery", async () => {
    const { fetcher } = createDiscoveryFetcher({ onSearch: () => null });

    const result = await discoverPublicSources(
      "project-test",
      dishwasherInput,
      emptyCrawlPlan,
      {
        fetcher,
        maxSearchQueries: 0,
        maxProbeUrls: 0,
      },
    );

    const registryCandidates = result.candidates.filter(
      (candidate) => candidate.method === "source_registry",
    );
    const seeds = registryCandidates.map((candidate) => candidate.seed);

    expect(seeds).toContain("https://www.fotile.com/");
    expect(seeds).toContain("https://www.midea.com.cn/");
    expect(seeds).toContain("https://www.haier.com/cn/");
    expect(seeds).toContain("https://www.siemens-home.bsh-group.cn/");
    expect(seeds).toContain("https://www.robam.com/");
    expect(seeds).toContain("https://www.panasonic.cn/");
    expect(
      registryCandidates.every((candidate) =>
        candidate.title.startsWith("固定可信来源："),
      ),
    ).toBe(true);
  });

  it("uses env source registry urls as category-specific fixed sources", async () => {
    const { fetcher } = createDiscoveryFetcher({ onSearch: () => null });

    const result = await discoverPublicSources(
      "project-test",
      shaverInput,
      emptyCrawlPlan,
      {
        fetcher,
        maxSearchQueries: 0,
        maxProbeUrls: 0,
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_JSON: JSON.stringify({
            categorySources: {
              男士电动剃须刀: [
                {
                  name: "Test Shaver Brand",
                  url: "https://shaver-registry.example/",
                },
              ],
            },
          }),
        },
      },
    );

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.method === "source_registry" &&
          candidate.seed === "https://shaver-registry.example/" &&
          candidate.title === "固定可信来源：Test Shaver Brand",
      ),
    ).toBe(true);
  });

  it("uses tavily results, filters social/marketplace hosts, and notes the provider", async () => {
    const { fetcher, requestedUrls, requestedInits } = createDiscoveryFetcher({
      onSearch: (url) =>
        url === "https://api.tavily.com/search"
          ? jsonResponse({
              results: [
                { url: "https://newbrand.example/" },
                { url: "https://www.amazon.com/some-listing" },
                { url: "https://www.jd.com/" },
                { url: "https://www.sohu.com/" },
                { url: "https://www.tiktok.com/@brand" },
              ],
            })
          : null,
    });

    const result = await discoverPublicSources(
      "project-test",
      input,
      emptyCrawlPlan,
      {
        fetcher,
        searchProvider: {
          provider: "tavily",
          endpoint: "https://api.tavily.com/search",
          apiKey: "tavily-key",
        },
      },
    );

    expect(requestedUrls).toContain("https://api.tavily.com/search");
    const tavilyRequestIndex = requestedUrls.indexOf(
      "https://api.tavily.com/search",
    );
    const tavilyInit = requestedInits[tavilyRequestIndex];
    expect(tavilyInit?.method).toBe("POST");
    expect((tavilyInit?.headers as Record<string, string>)?.Authorization).toBe(
      "Bearer tavily-key",
    );
    const tavilyBody = JSON.parse(String(tavilyInit?.body));
    expect(tavilyBody).toMatchObject({
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    });
    expect(tavilyBody.query).toContain("品牌 官网");

    const seeds = result.candidates.map((candidate) => candidate.seed);
    expect(seeds).toContain("https://newbrand.example/");
    expect(seeds.some((seed) => seed.includes("amazon"))).toBe(false);
    expect(seeds.some((seed) => seed.includes("jd.com"))).toBe(false);
    expect(seeds.some((seed) => seed.includes("sohu.com"))).toBe(false);
    expect(seeds.some((seed) => seed.includes("tiktok"))).toBe(false);
    expect(result.notes.some((note) => note.includes("provider=tavily"))).toBe(
      true,
    );
  });

  it("uses brave results, filters social/marketplace hosts, and notes the provider", async () => {
    const { fetcher, requestedUrls } = createDiscoveryFetcher({
      onSearch: (url) =>
        url.startsWith("https://api.search.brave.com")
          ? jsonResponse({
              web: {
                results: [
                  { url: "https://newbrand.example/" },
                  { url: "https://www.amazon.com/some-listing" },
                  { url: "https://www.tiktok.com/@brand" },
                ],
              },
            })
          : null,
    });

    const result = await discoverPublicSources(
      "project-test",
      input,
      emptyCrawlPlan,
      {
        fetcher,
        searchProvider: {
          provider: "brave",
          endpoint: "https://api.search.brave.com/res/v1/web/search",
          apiKey: "brave-key",
        },
      },
    );

    expect(
      requestedUrls.some((url) =>
        url.startsWith("https://api.search.brave.com"),
      ),
    ).toBe(true);
    const seeds = result.candidates.map((candidate) => candidate.seed);
    expect(seeds).toContain("https://newbrand.example/");
    expect(seeds.some((seed) => seed.includes("amazon"))).toBe(false);
    expect(seeds.some((seed) => seed.includes("tiktok"))).toBe(false);
    expect(result.notes.some((note) => note.includes("provider=brave"))).toBe(
      true,
    );
  });

  it("falls back to duckduckgo html for a query when the api call fails", async () => {
    const { fetcher, requestedUrls } = createDiscoveryFetcher({
      onSearch: (url) => {
        if (url.startsWith("https://api.search.brave.com")) {
          return {
            ok: false,
            status: 500,
            text: async () => "",
            headers: { get: () => "" },
          };
        }

        if (url.startsWith("https://duckduckgo.com/html/")) {
          return htmlResponse(
            '<a href="https://newbrand.example/">New brand</a>',
          );
        }

        return null;
      },
    });

    const result = await discoverPublicSources(
      "project-test",
      input,
      emptyCrawlPlan,
      {
        fetcher,
        maxSearchQueries: 1,
        searchProvider: {
          provider: "brave",
          endpoint: "https://api.search.brave.com/res/v1/web/search",
          apiKey: "brave-key",
        },
      },
    );

    expect(
      requestedUrls.some((url) => url.startsWith("https://duckduckgo.com")),
    ).toBe(true);
    expect(result.notes.some((note) => note.includes("回退 DDG HTML"))).toBe(
      true,
    );
    expect(
      result.candidates.some(
        (candidate) => candidate.seed === "https://newbrand.example/",
      ),
    ).toBe(true);
  });
});

describe("discoverPublicSources with bounded Firecrawl Map", () => {
  it.each(
    firecrawlMapCategoryFixtures,
  )("$category discovers an evidence-bearing deep page from category-only input", async (fixture) => {
    const requestedUrls: string[] = [];
    const requestedInits: Array<RequestInit | undefined> = [];
    const fetcher: PublicCrawlerFetch = async (url, init) => {
      requestedUrls.push(url);
      requestedInits.push(init);

      if (url === "https://api.tavily.com/search") {
        return jsonResponse({ results: [{ url: fixture.baseUrl }] });
      }
      if (url === fixture.baseUrl) {
        return htmlResponse(
          "<html><body><main>Official brand homepage</main></body></html>",
        );
      }
      if (url === "https://api.firecrawl.dev/v2/map") {
        return jsonResponse({
          success: true,
          creditsUsed: 1,
          links: [
            {
              url: fixture.deepUrl,
              title: fixture.title,
              description: "Official ecommerce evidence page",
            },
            {
              url: new URL("/privacy", fixture.baseUrl).toString(),
              title: "Privacy Policy",
            },
            {
              url: "https://external.example/products/wrong-site",
              title: "External Product",
            },
          ],
        });
      }

      return notFound();
    };
    const categoryOnlyInput: ResearchWorkflowInput = {
      ...input,
      projectName: `${fixture.category} Map 测试`,
      industry: fixture.category,
      category: fixture.category,
      urls: [],
    };

    const result = await discoverPublicSources(
      "project-map-test",
      categoryOnlyInput,
      emptyCrawlPlan,
      {
        fetcher,
        maxSearchQueries: 1,
        maxSearchResultsPerQuery: 1,
        maxProbeUrls: 4,
        maxSitemapUrls: 4,
        maxDiscoveredTargets: 7,
        maxFirecrawlMapSites: 1,
        maxFirecrawlMapLinksPerSite: 30,
        searchProvider: {
          provider: "tavily",
          endpoint: "https://api.tavily.com/search",
          apiKey: "tavily-test-key",
        },
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
          AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_API_KEY: "fc-test-key",
        },
      },
    );

    expect(
      result.targets.some(
        (target) =>
          target.target === fixture.deepUrl &&
          target.kind === fixture.expectedKind,
      ),
    ).toBe(true);
    expect(
      result.candidates.some(
        (candidate) =>
          candidate.seed === fixture.deepUrl &&
          candidate.method === "firecrawl_map",
      ),
    ).toBe(true);
    expect(
      result.targets.some((target) => target.target.includes("/privacy")),
    ).toBe(false);
    expect(
      result.targets.some((target) =>
        target.target.includes("external.example"),
      ),
    ).toBe(false);
    const mapRequestIndex = requestedUrls.indexOf(
      "https://api.firecrawl.dev/v2/map",
    );
    const mapInit = requestedInits[mapRequestIndex];
    const mapBody = JSON.parse(String(mapInit?.body));
    expect(mapInit?.method).toBe("POST");
    expect((mapInit?.headers as Record<string, string>)?.Authorization).toBe(
      "Bearer fc-test-key",
    );
    expect(mapBody).toMatchObject({
      url: fixture.baseUrl,
      sitemap: "include",
      includeSubdomains: false,
      ignoreQueryParameters: true,
      limit: 30,
      timeout: 8000,
    });
    expect(mapBody.search).toContain(fixture.category);
    expect(
      result.notes.some(
        (note) =>
          note.includes("firecrawl_map 受限补充完成") &&
          note.includes("creditsUsed=1"),
      ),
    ).toBe(true);
  });

  it("skips Firecrawl Map when native discovery already found a deep page", async () => {
    const { fetcher, requestedUrls } = createDiscoveryFetcher({
      onSearch: () => null,
    });

    const result = await discoverPublicSources(
      "project-map-skip-test",
      input,
      emptyCrawlPlan,
      {
        fetcher,
        maxSearchQueries: 0,
        maxProbeUrls: 4,
        maxSitemapUrls: 4,
        maxDiscoveredTargets: 7,
        maxFirecrawlMapSites: 1,
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
          AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_API_KEY: "fc-test-key",
        },
      },
    );

    expect(result.targets.some((target) => target.kind === "product")).toBe(
      true,
    );
    expect(requestedUrls).not.toContain("https://api.firecrawl.dev/v2/map");
  });

  it("keeps a root URL as homepage and deduplicates www and non-www variants", async () => {
    const baseUrl = "https://canonical.example/";
    const productUrl = "https://canonical.example/products/daily-gut";
    const fetcher: PublicCrawlerFetch = async (url) => {
      if (url === "https://api.tavily.com/search") {
        return jsonResponse({
          results: [
            { url: baseUrl },
            { url: "https://www.canonical.example/" },
          ],
        });
      }
      if (url === baseUrl) {
        return htmlResponse("<html><body>Official store</body></html>");
      }
      if (url === "https://api.firecrawl.dev/v2/map") {
        return jsonResponse({
          links: [
            { url: baseUrl, title: "Product Collection Store" },
            { url: productUrl, title: "Daily Gut Product" },
            {
              url: "https://www.canonical.example/products/daily-gut/",
              title: "Daily Gut Product duplicate",
            },
          ],
        });
      }
      return notFound();
    };

    const result = await discoverPublicSources(
      "project-canonical-test",
      { ...input, urls: [] },
      emptyCrawlPlan,
      {
        fetcher,
        maxSearchQueries: 1,
        maxSearchResultsPerQuery: 2,
        maxProbeUrls: 2,
        maxDiscoveredTargets: 6,
        maxFirecrawlMapSites: 1,
        searchProvider: {
          provider: "tavily",
          endpoint: "https://api.tavily.com/search",
          apiKey: "tavily-test-key",
        },
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
          AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_API_KEY: "fc-test-key",
        },
      },
    );

    expect(
      result.targets.find((target) => target.target === baseUrl)?.kind,
    ).toBe("homepage");
    expect(
      result.targets.filter((target) =>
        target.target.includes("/products/daily-gut"),
      ),
    ).toHaveLength(1);
  });

  it("caps Map requests and keeps native results when one Map call fails", async () => {
    const baseUrls = [
      "https://map-a.example/",
      "https://map-b.example/",
      "https://map-c.example/",
    ];
    const mapOrigins: string[] = [];
    const fetcher: PublicCrawlerFetch = async (url, init) => {
      if (url === "https://api.tavily.com/search") {
        return jsonResponse({
          results: baseUrls.map((value) => ({ url: value })),
        });
      }
      if (baseUrls.includes(url)) {
        return htmlResponse("<html><body>Official brand</body></html>");
      }
      if (url === "https://api.firecrawl.dev/v2/map") {
        const body = JSON.parse(String(init?.body)) as { url: string };
        mapOrigins.push(body.url);

        if (body.url === baseUrls[1]) {
          return {
            ok: false,
            status: 500,
            text: async () => "",
            headers: { get: () => "application/json" },
          };
        }

        return jsonResponse({
          success: true,
          links: [
            {
              url: new URL("/products/deep-item", body.url).toString(),
              title: "Product",
            },
          ],
        });
      }

      return notFound();
    };

    const result = await discoverPublicSources(
      "project-map-cap-test",
      { ...input, urls: [] },
      emptyCrawlPlan,
      {
        fetcher,
        maxSearchQueries: 1,
        maxSearchResultsPerQuery: 3,
        maxProbeUrls: 3,
        maxDiscoveredTargets: 10,
        maxFirecrawlMapSites: 2,
        searchProvider: {
          provider: "tavily",
          endpoint: "https://api.tavily.com/search",
          apiKey: "tavily-test-key",
        },
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
          AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_API_KEY: "fc-test-key",
        },
      },
    );

    expect(mapOrigins).toEqual(baseUrls.slice(0, 2));
    expect(result.targets.some((target) => target.kind === "product")).toBe(
      true,
    );
    expect(
      result.notes.some(
        (note) =>
          note.includes("请求 2 个站点") &&
          note.includes("成功 1") &&
          note.includes("失败 1"),
      ),
    ).toBe(true);
  });

  it("crawls a Map-discovered product page through the full public workflow", async () => {
    const baseUrl = "https://workflow-map.example/";
    const productUrl = "https://workflow-map.example/products/daily-probiotic";
    const fetcher: PublicCrawlerFetch = async (url) => {
      if (url === "https://api.tavily.com/search") {
        return jsonResponse({ results: [{ url: baseUrl }] });
      }
      if (url === "https://api.firecrawl.dev/v2/map") {
        return jsonResponse({
          success: true,
          links: [
            {
              url: productUrl,
              title: "Daily Probiotic Product for Dogs",
            },
          ],
        });
      }
      if (url === baseUrl) {
        return htmlResponse(
          "<html><body><main>Pet supplement official brand homepage</main></body></html>",
        );
      }
      if (url === productUrl) {
        return htmlResponse(
          [
            "<html><body><main><h1>Daily Dog Probiotic Product</h1>",
            "<p>This dog probiotic formula combines multiple probiotic strains with prebiotic fiber for daily digestion and gut health support.</p>",
            "<p>The product page explains serving guidance for small, medium, and large dogs and lists the full active ingredient panel.</p>",
            "<p>Customers can compare the one-time purchase with the subscription option and review package size, storage instructions, and feeding notes.</p>",
            "<p>The brand also documents quality testing, manufacturing standards, expected use cases, and answers common product questions.</p>",
            "</main></body></html>",
          ].join(""),
        );
      }

      return notFound();
    };
    const result = await runPublicIndustryResearchWorkflow(
      {
        ...input,
        projectName: "Map public workflow integration",
        urls: [],
      },
      {
        fetcher,
        maxSearchQueries: 1,
        maxSearchResultsPerQuery: 1,
        maxProbeUrls: 4,
        maxSitemapUrls: 4,
        maxDiscoveredTargets: 5,
        maxCrawlTargets: 3,
        crawlPerHostDelayMs: 0,
        firecrawlMapEnabled: true,
        maxFirecrawlMapSites: 1,
        maxFirecrawlMapLinksPerSite: 10,
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
          AGENT_FACTORY_SEARCH_PROVIDER: "tavily",
          AGENT_FACTORY_SEARCH_API_KEY: "tavily-test-key",
          AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_API_KEY: "fc-test-key",
          AGENT_FACTORY_FIRECRAWL_TARGET_KINDS: "rss",
        },
      },
    );

    expect(
      result.crawl_plans[0]?.targets.some(
        (target) => target.target === productUrl && target.kind === "product",
      ),
    ).toBe(true);
    expect(
      result.raw_documents.some(
        (document) =>
          document.url === productUrl &&
          document.sourceQuality.acceptedForReport,
      ),
      JSON.stringify(
        result.raw_documents.map((document) => ({
          url: document.url,
          quality: document.sourceQuality,
          length: document.extractedText.length,
        })),
      ),
    ).toBe(true);
    expect(
      result.source_discovery_plans[0]?.candidates.some(
        (candidate) =>
          candidate.seed === productUrl && candidate.method === "firecrawl_map",
      ),
    ).toBe(true);
    expect(
      result.source_discovery_plans[0]?.notes.some((note) =>
        note.includes("firecrawl_map 受限补充完成"),
      ),
    ).toBe(true);
  });

  it("uses one bounded Crawl fallback and reuses its product body without a second scrape", async () => {
    const baseUrl = "https://crawl-fallback.example/";
    const productUrl =
      "https://crawl-fallback.example/products/daily-probiotic";
    const requestedUrls: string[] = [];
    const fetcher: PublicCrawlerFetch = async (url) => {
      requestedUrls.push(url);
      if (url === "https://api.tavily.com/search") {
        return jsonResponse({ results: [{ url: baseUrl }] });
      }
      if (url === baseUrl) {
        return htmlResponse(
          "<html><body><main>Official pet supplement store</main></body></html>",
        );
      }
      if (url === "https://api.firecrawl.dev/v2/map") {
        return jsonResponse({
          success: true,
          links: [{ url: baseUrl, title: "Official Product Store" }],
        });
      }
      if (url === "https://api.firecrawl.dev/v2/crawl") {
        return jsonResponse({ id: "crawl-fallback-job" });
      }
      if (url === "https://api.firecrawl.dev/v2/crawl/crawl-fallback-job") {
        return jsonResponse({
          status: "completed",
          creditsUsed: 1,
          data: [
            {
              markdown: [
                "# Daily Dog Probiotic Product",
                "This dog probiotic formula includes prebiotic fiber for daily digestion and gut health support.",
                "The product page lists serving guidance, ingredients, package size, storage instructions, and subscription purchase options.",
                "Customer review questions cover sensitive stomach use, feeding routines, and how long owners continued the daily product.",
              ].join("\n"),
              metadata: { sourceURL: productUrl, title: "Daily Probiotic" },
            },
          ],
        });
      }
      return notFound();
    };

    const result = await runPublicIndustryResearchWorkflow(
      { ...input, projectName: "Crawl fallback integration", urls: [] },
      {
        fetcher,
        maxSearchQueries: 1,
        maxSearchResultsPerQuery: 1,
        maxProbeUrls: 3,
        maxSitemapUrls: 3,
        maxDiscoveredTargets: 5,
        maxCrawlTargets: 3,
        crawlPerHostDelayMs: 0,
        firecrawlMapEnabled: true,
        firecrawlCrawlFallbackEnabled: true,
        maxFirecrawlMapSites: 1,
        maxFirecrawlCrawlSites: 1,
        maxFirecrawlCrawlPagesPerSite: 4,
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
          AGENT_FACTORY_SEARCH_PROVIDER: "tavily",
          AGENT_FACTORY_SEARCH_API_KEY: "tavily-test-key",
          AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_API_KEY: "fc-test-key",
          AGENT_FACTORY_FIRECRAWL_TARGET_KINDS: "rss",
        },
      },
    );

    expect(
      requestedUrls.filter(
        (url) => url === "https://api.firecrawl.dev/v2/crawl",
      ),
    ).toHaveLength(1);
    expect(requestedUrls).not.toContain("https://api.firecrawl.dev/v2/scrape");
    expect(requestedUrls).not.toContain(productUrl);
    expect(
      result.raw_documents.some(
        (document) =>
          document.url === productUrl &&
          document.extractedText.includes("Customer review questions"),
      ),
    ).toBe(true);
    expect(
      result.crawl_runs.some((run) =>
        run.summary.includes("firecrawl_crawl_prefetch"),
      ),
    ).toBe(true);
    expect(
      result.source_discovery_plans[0]?.notes.some(
        (note) =>
          note.includes("firecrawl_crawl 受限 fallback") &&
          note.includes("creditsUsed=1"),
      ),
    ).toBe(true);
  });
});

describe("discoverPublicSources robots and quota boundaries", () => {
  async function runDiscovery() {
    const { fetcher } = createDiscoveryFetcher({ onSearch: () => null });

    return discoverPublicSources("project-test", input, emptyCrawlPlan, {
      fetcher,
      searchProvider: {
        provider: "duckduckgo_html",
        endpoint: "https://duckduckgo.com/html/",
      },
    });
  }

  it("skips urls disallowed by robots.txt and records a note", async () => {
    const result = await runDiscovery();
    const seeds = result.candidates.map((candidate) => candidate.seed);

    expect(seeds.some((seed) => seed.includes("/private"))).toBe(false);
    expect(
      result.notes.some((note) => note.includes("robots.txt Disallow")),
    ).toBe(true);
  });

  it("caps product urls per kind while keeping collection/blog/rss variety", async () => {
    const result = await runDiscovery();
    const seeds = result.candidates.map((candidate) => candidate.seed);
    const productSeeds = seeds.filter((seed) => seed.includes("/products/"));

    expect(productSeeds.length).toBeGreaterThan(0);
    expect(productSeeds.length).toBeLessThanOrEqual(8);
    expect(seeds.some((seed) => seed.includes("/collections/"))).toBe(true);
    expect(seeds.some((seed) => seed.includes("news.atom"))).toBe(true);
  });

  it("reserves evidence-bearing deep targets when the discovery cap is tight", async () => {
    const { fetcher } = createDiscoveryFetcher({ onSearch: () => null });

    const result = await discoverPublicSources(
      "project-test",
      input,
      emptyCrawlPlan,
      {
        fetcher,
        env: { AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true" },
        maxSearchQueries: 0,
        maxProbeUrls: 4,
        maxSitemapUrls: 20,
        maxDiscoveredTargets: 7,
      },
    );
    const kinds = result.targets.map((target) => target.kind);

    expect(result.targets).toHaveLength(7);
    expect(kinds).toContain("product");
    expect(kinds).toContain("collection");
    expect(kinds).toContain("blog");
    expect(kinds).toContain("rss");
    expect(kinds.indexOf("product")).toBeLessThan(kinds.indexOf("robots"));
  });

  it("follows a robots-declared nested sitemap within the existing probe cap", async () => {
    const requestedUrls: string[] = [];
    const fetcher: PublicCrawlerFetch = async (url) => {
      requestedUrls.push(url);

      if (url === "https://nested.example/") {
        return htmlResponse(
          [
            "<html><body>",
            '<a href="/category/gut-health">Gut health</a>',
            '<a href="/article/how-probiotics-work">Guide</a>',
            "</body></html>",
          ].join(""),
        );
      }
      if (url === "https://nested.example/robots.txt") {
        return textResponse(
          "User-agent: *\nSitemap: https://nested.example/sitemap-index.xml",
        );
      }
      if (url === "https://nested.example/sitemap-index.xml") {
        return textResponse(
          [
            "<sitemapindex>",
            "<sitemap><loc>https://nested.example/product-sitemap.xml</loc></sitemap>",
            "</sitemapindex>",
          ].join(""),
          "application/xml",
        );
      }
      if (url === "https://nested.example/product-sitemap.xml") {
        return textResponse(
          [
            "<urlset>",
            "<url><loc>https://nested.example/product/probiotic-starter</loc></url>",
            "</urlset>",
          ].join(""),
          "application/xml",
        );
      }

      return notFound();
    };

    const result = await discoverPublicSources(
      "project-test",
      { ...input, urls: ["https://nested.example/"] },
      emptyCrawlPlan,
      {
        fetcher,
        env: { AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true" },
        maxSearchQueries: 0,
        maxProbeUrls: 4,
        maxSitemapUrls: 4,
        maxDiscoveredTargets: 7,
      },
    );

    expect(requestedUrls).toContain(
      "https://nested.example/product-sitemap.xml",
    );
    expect(
      result.targets.some(
        (target) =>
          target.kind === "product" &&
          target.target === "https://nested.example/product/probiotic-starter",
      ),
    ).toBe(true);
    expect(result.targets.some((target) => target.kind === "collection")).toBe(
      true,
    );
    expect(result.targets.some((target) => target.kind === "blog")).toBe(true);
    expect(requestedUrls).toHaveLength(4);
  });
});

describe("three-category evidence-bearing deep-page fixtures", () => {
  it.each(
    deepPageDiscoveryFixtures,
  )("$category follows the nested sitemap and retains the expected $expectedKind page", async (fixture) => {
    const verification = await verifyDeepPageDiscoveryFixture(fixture);

    expect(verification.nestedSitemapFetched).toBe(true);
    expect(verification.actualKind).toBe(fixture.expectedKind);
    expect(verification.passed).toBe(true);
  });
});

describe("runPublicCrawler politeness and caps", () => {
  it("marks targets beyond maxTargets as failed without fetching them", async () => {
    const targets = ["a", "b", "c"].map((id) => ({
      id: `target-${id}`,
      projectId: "project-test",
      candidateId: `candidate-${id}`,
      kind: "homepage" as const,
      target: `https://site-${id}.example/`,
      reason: "test",
      maxPages: 1,
      databaseTargets: ["competitor_database" as const],
    }));
    const sources: ResearchSource[] = targets.map((target, index) => ({
      id: `source-${index + 1}`,
      projectId: "project-test",
      type: "url",
      title: target.target,
      value: target.target,
      automationHint: "",
      discoveryCandidateId: target.candidateId,
    }));
    const fetchedUrls: string[] = [];
    const fetcher: PublicCrawlerFetch = async (url) => {
      fetchedUrls.push(url);
      return htmlResponse("<html><title>ok</title><body>content</body></html>");
    };

    const result = await runPublicCrawler(
      "project-test",
      { ...emptyCrawlPlan, targets },
      sources,
      { fetcher, maxTargets: 2 },
    );

    expect(fetchedUrls).toHaveLength(2);
    expect(result.crawl_runs[2]?.summary).toContain("TARGET_CAP_EXCEEDED");
    expect(result.raw_documents).toHaveLength(2);
  });

  it("uses Firecrawl scrape for ecommerce pages and keeps robots on native fetch", async () => {
    const targets = [
      {
        id: "target-homepage",
        projectId: "project-test",
        candidateId: "candidate-homepage",
        kind: "homepage" as const,
        target: "https://brand.example/",
        reason: "official homepage",
        maxPages: 1,
        databaseTargets: ["competitor_database" as const],
      },
      {
        id: "target-robots",
        projectId: "project-test",
        candidateId: "candidate-robots",
        kind: "robots" as const,
        target: "https://brand.example/robots.txt",
        reason: "robots boundary",
        maxPages: 1,
        databaseTargets: ["source_database" as const],
      },
    ];
    const sources: ResearchSource[] = targets.map((target, index) => ({
      id: `source-${index + 1}`,
      projectId: "project-test",
      type: "url",
      title: target.target,
      value: target.target,
      automationHint: "",
      discoveryCandidateId: target.candidateId,
    }));
    const requestedUrls: string[] = [];
    const requestedInits: Array<RequestInit | undefined> = [];
    const fetcher: PublicCrawlerFetch = async (url, init) => {
      requestedUrls.push(url);
      requestedInits.push(init);

      if (url === "https://api.firecrawl.dev/v2/scrape") {
        return jsonResponse({
          success: true,
          data: {
            markdown: [
              "[Skip to content](https://brand.example/#main)",
              "# Zesty Brand",
              "Best sellers probiotic bundle with product reviews.",
              "![Product](https://cdn.example/product.png)",
              "Privacy Policy | Cookie Settings | Terms of Service",
            ].join("\n"),
            metadata: { title: "Firecrawl title" },
          },
        });
      }

      if (url === "https://brand.example/robots.txt") {
        return textResponse("User-agent: *\nDisallow: /private\n");
      }

      return notFound();
    };

    const result = await runPublicCrawler(
      "project-test",
      { ...emptyCrawlPlan, targets },
      sources,
      {
        fetcher,
        input,
        env: {
          AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
          AGENT_FACTORY_FIRECRAWL_API_KEY: "fc-key",
        },
      },
    );

    expect(requestedUrls[0]).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(requestedUrls).toContain("https://brand.example/robots.txt");
    const firecrawlInit = requestedInits[0];
    expect(
      (firecrawlInit?.headers as Record<string, string>)?.Authorization,
    ).toBe("Bearer fc-key");
    expect(JSON.parse(String(firecrawlInit?.body))).toMatchObject({
      url: "https://brand.example/",
      formats: ["markdown"],
      onlyMainContent: true,
      blockAds: true,
    });
    expect(result.raw_documents[0]?.title).toBe("Firecrawl title");
    expect(result.raw_documents[0]?.contentType).toBe("text");
    expect(result.raw_documents[0]?.extractedText).toContain(
      "Best sellers probiotic bundle",
    );
    expect(result.raw_documents[0]?.originalText).toContain("Skip to content");
    expect(result.raw_documents[0]?.extractedText).not.toContain(
      "Skip to content",
    );
    expect(result.raw_documents[0]?.extractedText).not.toContain(
      "Privacy Policy",
    );
    expect(
      result.raw_documents[0]?.cleaningAudit?.removedCharacterCount,
    ).toBeGreaterThan(0);
    expect(result.raw_documents[1]?.title).toBe("robots.txt");
    expect(result.crawl_runs[0]?.summary).toContain("firecrawl_scrape");
  });

  it("falls back to native fetch when Firecrawl does not return usable text", async () => {
    const target = {
      id: "target-homepage",
      projectId: "project-test",
      candidateId: "candidate-homepage",
      kind: "homepage" as const,
      target: "https://brand.example/",
      reason: "official homepage",
      maxPages: 1,
      databaseTargets: ["competitor_database" as const],
    };
    const sources: ResearchSource[] = [
      {
        id: "source-1",
        projectId: "project-test",
        type: "url",
        title: target.target,
        value: target.target,
        automationHint: "",
        discoveryCandidateId: target.candidateId,
      },
    ];
    const requestedUrls: string[] = [];
    const fetcher: PublicCrawlerFetch = async (url) => {
      requestedUrls.push(url);

      if (url === "https://api.firecrawl.dev/v2/scrape") {
        return jsonResponse({ success: true, data: { markdown: "" } });
      }

      if (url === "https://brand.example/") {
        return htmlResponse(
          [
            "<html><title>Native title</title><body>",
            "<nav>Home Products Contact</nav>",
            "<main>Native product bundle reviews</main>",
            "<footer>Privacy Policy All rights reserved</footer>",
            "</body></html>",
          ].join(""),
        );
      }

      return notFound();
    };

    const result = await runPublicCrawler(
      "project-test",
      { ...emptyCrawlPlan, targets: [target] },
      sources,
      {
        fetcher,
        input,
        env: { AGENT_FACTORY_FIRECRAWL_ENABLED: "true" },
      },
    );

    expect(requestedUrls).toEqual([
      "https://api.firecrawl.dev/v2/scrape",
      "https://brand.example/",
    ]);
    expect(result.raw_documents[0]?.title).toBe("Native title");
    expect(result.raw_documents[0]?.extractedText).toContain(
      "Native product bundle reviews",
    );
    expect(result.raw_documents[0]?.extractedText).not.toContain(
      "All rights reserved",
    );
    expect(result.crawl_runs[0]?.summary).toContain("回退 native fetch");
  });
});
