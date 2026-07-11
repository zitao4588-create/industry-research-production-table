import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import { discoverPublicSources } from "./public-source-discovery";
import type {
  CrawlPlan,
  CrawlTargetKind,
  ResearchWorkflowInput,
} from "./types";

export type DeepPageDiscoveryFixture = {
  id: "pet-probiotics" | "dishwasher" | "japan-niche-skincare";
  category: string;
  baseUrl: string;
  sitemapIndexUrl: string;
  nestedSitemapUrl: string;
  expectedDeepUrl: string;
  expectedKind: CrawlTargetKind;
};

export type DeepPageFixtureVerification = {
  id: DeepPageDiscoveryFixture["id"];
  category: string;
  expectedDeepUrl: string;
  expectedKind: CrawlTargetKind;
  actualKind?: CrawlTargetKind;
  nestedSitemapFetched: boolean;
  passed: boolean;
  requestedUrls: string[];
};

export const deepPageDiscoveryFixtures: DeepPageDiscoveryFixture[] = [
  {
    id: "pet-probiotics",
    category: "宠物肠胃益生菌",
    baseUrl: "https://pet-probiotic.fixture.example/",
    sitemapIndexUrl: "https://pet-probiotic.fixture.example/sitemap-index.xml",
    nestedSitemapUrl:
      "https://pet-probiotic.fixture.example/product-sitemap.xml",
    expectedDeepUrl:
      "https://pet-probiotic.fixture.example/products/daily-probiotic-chews",
    expectedKind: "product",
  },
  {
    id: "dishwasher",
    category: "洗碗机",
    baseUrl: "https://dishwasher.fixture.example/",
    sitemapIndexUrl: "https://dishwasher.fixture.example/sitemap-index.xml",
    nestedSitemapUrl: "https://dishwasher.fixture.example/product-sitemap.xml",
    expectedDeepUrl: "https://dishwasher.fixture.example/product/dishwasher-x1",
    expectedKind: "product",
  },
  {
    id: "japan-niche-skincare",
    category: "日本小众护肤品牌",
    baseUrl: "https://japan-skincare.fixture.example/",
    sitemapIndexUrl: "https://japan-skincare.fixture.example/sitemap-index.xml",
    nestedSitemapUrl:
      "https://japan-skincare.fixture.example/category-sitemap.xml",
    expectedDeepUrl:
      "https://japan-skincare.fixture.example/category/japanese-skincare",
    expectedKind: "collection",
  },
];

function response(body: string, contentType: string) {
  return {
    ok: true,
    status: 200,
    text: async () => body,
    headers: { get: () => contentType },
  };
}

function fixtureInput(
  fixture: DeepPageDiscoveryFixture,
): ResearchWorkflowInput {
  return {
    projectName: `${fixture.category} 深页 fixture`,
    industry: fixture.category,
    category: fixture.category,
    market: "线上电商 / DTC",
    researchGoal: "离线验证深页发现与类型识别",
    templateId: "ecommerce_competitor_research",
    urls: [fixture.baseUrl],
    csvText: "",
    manualText: "",
  };
}

const emptyCrawlPlan: CrawlPlan = {
  id: "deep-page-fixture-plan",
  projectId: "deep-page-fixture-project",
  mode: "public_web",
  targets: [],
  guardrails: [],
};

export async function verifyDeepPageDiscoveryFixture(
  fixture: DeepPageDiscoveryFixture,
): Promise<DeepPageFixtureVerification> {
  const requestedUrls: string[] = [];
  const fetcher: PublicCrawlerFetch = async (url) => {
    requestedUrls.push(url);

    if (url === fixture.baseUrl) {
      return response(
        '<html><body><a href="/guides/category-guide">Category guide</a></body></html>',
        "text/html",
      );
    }
    if (url === new URL("robots.txt", fixture.baseUrl).toString()) {
      return response(
        `User-agent: *\nSitemap: ${fixture.sitemapIndexUrl}`,
        "text/plain",
      );
    }
    if (url === fixture.sitemapIndexUrl) {
      return response(
        `<sitemapindex><sitemap><loc>${fixture.nestedSitemapUrl}</loc></sitemap></sitemapindex>`,
        "application/xml",
      );
    }
    if (url === fixture.nestedSitemapUrl) {
      return response(
        `<urlset><url><loc>${fixture.expectedDeepUrl}</loc></url></urlset>`,
        "application/xml",
      );
    }

    return {
      ok: false,
      status: 404,
      text: async () => "",
      headers: { get: () => "" },
    };
  };
  const result = await discoverPublicSources(
    "deep-page-fixture-project",
    fixtureInput(fixture),
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
  const target = result.targets.find(
    (candidate) => candidate.target === fixture.expectedDeepUrl,
  );
  const nestedSitemapFetched = requestedUrls.includes(fixture.nestedSitemapUrl);

  return {
    id: fixture.id,
    category: fixture.category,
    expectedDeepUrl: fixture.expectedDeepUrl,
    expectedKind: fixture.expectedKind,
    actualKind: target?.kind,
    nestedSitemapFetched,
    passed: nestedSitemapFetched && target?.kind === fixture.expectedKind,
    requestedUrls,
  };
}

export async function verifyAllDeepPageDiscoveryFixtures() {
  return Promise.all(
    deepPageDiscoveryFixtures.map(verifyDeepPageDiscoveryFixture),
  );
}
