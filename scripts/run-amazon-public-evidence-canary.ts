import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  amazonAsinFromUrl as asinFromUrl,
  canonicalAmazonUrl,
  parseAmazonPublicPage,
} from "../packages/industry-research/src/amazon-public-evidence.ts";
import {
  resolveFirecrawlConfig,
  scrapeWithFirecrawl,
} from "../packages/industry-research/src/firecrawl-provider.ts";
import type { PublicCrawlerFetch } from "../packages/industry-research/src/public-crawl-adapter.ts";
import {
  resolveSearchProviderConfig,
  searchWithApiProvider,
} from "../packages/industry-research/src/search-providers.ts";
import type {
  CrawlPlanTarget,
  ResearchWorkflowInput,
} from "../packages/industry-research/src/types.ts";

const maxAsins = 3;
const maxSearchRequests = 2;
const maxFirecrawlRequests = 3;
const maxJinaFallbacks = 3;
const requestTimeoutMs = 20_000;

type AmazonPageParse = {
  asin: string;
  title: string;
  brand: string;
  price: string;
  rating: string;
  reviewCount: string;
  bullets: string[];
  reviewSnippets: string[];
  categoryFit: "direct" | "adjacent" | "irrelevant";
  blocked: boolean;
  fieldCoverage: number;
};

type CanaryPageResult = AmazonPageParse & {
  url: string;
  route: "firecrawl" | "jina";
  textLength: number;
};

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadLocalEnv() {
  if (!existsSync(".env.local")) return {};

  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return env;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) return env;
      const key = trimmed.slice(0, separatorIndex).trim();
      env[key] = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      return env;
    }, {});
}

function fetcher(): PublicCrawlerFetch {
  return (input, init) => fetch(input, init);
}

function amazonSearchTerm(category: string) {
  if (category.includes("益生菌")) return "dog probiotics digestive health";
  if (category.includes("洗碗机")) return "dishwasher machine";
  if (category.includes("护肤")) return "Japanese skincare";
  return category;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function parseAmazonPage(
  url: string,
  title: string,
  text: string,
  category: string,
): AmazonPageParse {
  const input = {
    projectName: `${category} Amazon canary`,
    industry: "宠物健康",
    category,
    market: "美国",
    researchGoal: "验证 Amazon 公开商品与评论证据质量",
    templateId: "ecommerce_competitor_research",
    urls: [],
    csvText: "",
    manualText: "",
  } satisfies ResearchWorkflowInput;
  const { url: _pageUrl, ...page } = parseAmazonPublicPage(
    url,
    text,
    input,
    title,
  );
  return page;
}

async function fetchJina(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      signal: controller.signal,
      headers: { Accept: "text/markdown" },
    });
    return response.ok ? await response.text() : "";
  } finally {
    clearTimeout(timeout);
  }
}

function pageScore(page: AmazonPageParse) {
  return page.fieldCoverage * 10 + Math.min(page.reviewSnippets.length, 3);
}

async function main() {
  const category = argumentValue("category") ?? "宠物肠胃益生菌";
  const searchTerm =
    argumentValue("amazon-query") ?? amazonSearchTerm(category);
  const replayDir = argumentValue("replay-dir");
  const discoveryRoute = argumentValue("discovery-route") ?? "tavily";
  const pageRoute = argumentValue("page-route") ?? "firecrawl";
  const execute = process.argv.includes("--execute");
  const env = { ...loadLocalEnv(), ...process.env };
  const searchConfig = resolveSearchProviderConfig(env);
  const firecrawlConfig = resolveFirecrawlConfig(env);
  const plan = {
    category,
    searchTerm,
    discoveryRoute,
    pageRoute,
    execute,
    limits: {
      maxAsins,
      maxSearchRequests,
      maxFirecrawlRequests,
      maxJinaFallbacks,
      requestTimeoutMs,
    },
    providers: {
      search: searchConfig.provider,
      searchKeyConfigured: Boolean(searchConfig.apiKey),
      firecrawlConfigured: Boolean(firecrawlConfig.apiKey),
      jinaFallback: true,
    },
  };

  if (replayDir) {
    const files = (await readdir(replayDir)).filter((file) =>
      /^[A-Z0-9]{10}\.md$/i.test(file),
    );
    const pages = files.map((file) => {
      const asin = file.slice(0, 10).toUpperCase();
      const url = canonicalAmazonUrl(asin);
      const text = readFileSync(join(replayDir, file), "utf8");
      return {
        ...parseAmazonPage(url, "", text, category),
        url,
        route:
          pageRoute === "jina" ? ("jina" as const) : ("firecrawl" as const),
        textLength: text.length,
      };
    });
    console.log(JSON.stringify({ ...plan, replayDir, pages }, null, 2));
    return;
  }

  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (
    discoveryRoute === "tavily" &&
    (searchConfig.provider !== "tavily" || !searchConfig.apiKey)
  ) {
    throw new Error("amazon_canary_requires_tavily");
  }
  if (pageRoute === "firecrawl" && !firecrawlConfig.apiKey) {
    throw new Error("amazon_canary_requires_firecrawl");
  }

  const started = new Date();
  const queries = [
    `"${searchTerm}" site:amazon.com/dp`,
    `"dog probiotic supplement" site:amazon.com/dp`,
  ];
  const searchUrls: string[] = [];
  let jinaRequests = 0;
  if (discoveryRoute === "jina") {
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}`;
    jinaRequests += 1;
    const searchText = await fetchJina(searchUrl);
    searchUrls.push(
      ...(searchText.match(/https:\/\/www\.amazon\.com\/[^\s)]+/g) ?? []),
    );
  } else {
    for (const query of queries.slice(0, maxSearchRequests)) {
      const result = await searchWithApiProvider(
        searchConfig,
        query,
        fetcher(),
        {
          maxResults: 8,
          timeoutMs: requestTimeoutMs,
        },
      );
      if (result.ok) searchUrls.push(...result.urls);
    }
  }
  const asins = unique(searchUrls.map(asinFromUrl)).slice(0, maxAsins);
  if (asins.length === 0) {
    throw new Error("amazon_canary_no_asins_discovered");
  }

  const pages: CanaryPageResult[] = [];
  const pageTexts = new Map<string, string>();
  let firecrawlRequests = 0;
  let jinaFallbacks = 0;
  for (const [index, asin] of asins.entries()) {
    const url = canonicalAmazonUrl(asin);
    const target: CrawlPlanTarget = {
      id: `amazon-canary-target-${index + 1}`,
      projectId: "amazon-public-canary",
      candidateId: `amazon-canary-candidate-${index + 1}`,
      kind: "product",
      target: url,
      reason: `Amazon public listing ${asin}`,
      maxPages: 1,
      databaseTargets: [
        "competitor_database",
        "product_database",
        "pain_point_database",
        "keyword_database",
      ],
    };
    const firecrawl =
      pageRoute === "firecrawl"
        ? await scrapeWithFirecrawl(
            target,
            { ...firecrawlConfig, timeoutMs: requestTimeoutMs },
            fetcher(),
          )
        : ({ ok: false, status: 0, error: "Jina route selected" } as const);
    if (pageRoute === "firecrawl") firecrawlRequests += 1;
    if (!firecrawl.ok) jinaRequests += 1;
    let chosenText = firecrawl.ok ? firecrawl.text : await fetchJina(url);
    let chosenTitle = firecrawl.ok ? firecrawl.title : "";
    let route: CanaryPageResult["route"] = firecrawl.ok ? "firecrawl" : "jina";
    let parsed = parseAmazonPage(url, chosenTitle, chosenText, category);

    if (
      pageRoute !== "jina" &&
      (!firecrawl.ok || parsed.blocked || parsed.fieldCoverage < 0.7) &&
      jinaFallbacks < maxJinaFallbacks
    ) {
      jinaFallbacks += 1;
      jinaRequests += 1;
      const jinaText = await fetchJina(url);
      const jinaParsed = parseAmazonPage(url, "", jinaText, category);
      if (pageScore(jinaParsed) > pageScore(parsed)) {
        chosenText = jinaText;
        chosenTitle = jinaParsed.title;
        parsed = jinaParsed;
        route = "jina";
      }
    }

    pages.push({
      ...parsed,
      url,
      route,
      textLength: chosenText.length,
    });
    pageTexts.set(asin, chosenText);
  }

  const finished = new Date();
  const runId = `amazon-public-canary-${finished.toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = join(
    "outputs",
    "industry-research-benchmarks",
    "amazon-public-canary",
    runId,
  );
  const successfulPages = pages.filter(
    (page) =>
      !page.blocked &&
      page.fieldCoverage >= 0.7 &&
      page.categoryFit === "direct",
  );
  const result = {
    ...plan,
    runId,
    outputDir,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    requestCounts: {
      search: discoveryRoute === "jina" ? 0 : queries.length,
      firecrawl: firecrawlRequests,
      jinaFallback: jinaFallbacks,
      jina: jinaRequests,
    },
    discoveredAsins: asins,
    pages,
    acceptance: {
      atLeastThreeAsins: asins.length >= 3,
      atLeastTwoSuccessfulPages: successfulPages.length >= 2,
      averageFieldCoverage:
        pages.reduce((sum, page) => sum + page.fieldCoverage, 0) /
        Math.max(1, pages.length),
      directReviewSnippetCount: pages.reduce(
        (sum, page) => sum + page.reviewSnippets.length,
        0,
      ),
      noBlockedPagesAccepted: successfulPages.every((page) => !page.blocked),
      directlyRelevantPageCount: successfulPages.length,
    },
  };

  await mkdir(outputDir, { recursive: true });
  await Promise.all(
    [...pageTexts].map(([asin, text]) =>
      writeFile(join(outputDir, `${asin}.md`), text, "utf8"),
    ),
  );
  await writeFile(
    join(outputDir, "canary.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]"));
  process.exit(1);
});
