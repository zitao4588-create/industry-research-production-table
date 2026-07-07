import { describe, expect, it } from "vitest";
import {
  type PublicCrawlerFetch,
  runPublicCrawler,
} from "./public-crawl-adapter";
import { discoverPublicSources } from "./public-source-discovery";
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
            markdown:
              "# Zesty Brand\nBest sellers probiotic bundle with product reviews.",
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
          "<html><title>Native title</title><body>Native product bundle reviews</body></html>",
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
    expect(result.crawl_runs[0]?.summary).toContain("回退 native fetch");
  });
});
