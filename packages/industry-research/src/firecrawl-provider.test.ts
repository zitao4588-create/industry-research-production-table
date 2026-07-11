import { describe, expect, it } from "vitest";
import {
  crawlWithFirecrawl,
  resolveFirecrawlConfig,
  scrapeWithFirecrawl,
} from "./firecrawl-provider";
import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import type { CrawlPlanTarget } from "./types";

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    headers: { get: () => "application/json" },
  };
}

const target: CrawlPlanTarget = {
  id: "target-product",
  projectId: "project-test",
  candidateId: "candidate-product",
  kind: "product",
  target: "https://www.brand.example/products/daily-gut",
  reason: "official product",
  maxPages: 1,
  databaseTargets: ["product_database"],
};

describe("Firecrawl provider boundaries", () => {
  it("requests deterministic main content without beta LLM cleaning", async () => {
    let requestBody: Record<string, unknown> = {};
    const fetcher: PublicCrawlerFetch = async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        success: true,
        data: {
          markdown: "# Daily Gut\nProduct evidence body",
          metadata: { title: "Daily Gut" },
        },
      });
    };
    const config = resolveFirecrawlConfig({
      AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
      AGENT_FACTORY_FIRECRAWL_API_KEY: "test-key",
    });

    const result = await scrapeWithFirecrawl(target, config, fetcher);

    expect(result.ok).toBe(true);
    expect(requestBody).toMatchObject({
      url: target.target,
      formats: ["markdown"],
      onlyMainContent: true,
      onlyCleanContent: false,
      blockAds: true,
    });
    expect(requestBody.excludeTags).toEqual(
      expect.arrayContaining(["nav", "header", "footer", "aside", "form"]),
    );
    expect(requestBody).not.toHaveProperty("actions");
    expect(requestBody).not.toHaveProperty("jsonOptions");
  });

  it("hard-caps Crawl at five pages and disables external, subdomain and robots bypass", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let statusPoll = 0;
    const fetcher: PublicCrawlerFetch = async (url, init) => {
      requests.push({ url, init });
      if (url === "https://api.firecrawl.dev/v2/crawl") {
        return jsonResponse({ id: "crawl-job-1" });
      }

      statusPoll += 1;
      return statusPoll === 1
        ? jsonResponse({ status: "scraping", data: [] })
        : jsonResponse({
            status: "completed",
            creditsUsed: 4,
            data: Array.from({ length: 7 }, (_, index) => ({
              markdown: `# Product ${index + 1}\nEvidence body`,
              metadata: {
                sourceURL: `https://brand.example/products/item-${index + 1}`,
                title: `Product ${index + 1}`,
              },
            })),
          });
    };
    const config = resolveFirecrawlConfig({
      AGENT_FACTORY_FIRECRAWL_ENABLED: "true",
      AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED: "true",
      AGENT_FACTORY_FIRECRAWL_API_KEY: "test-key",
    });

    const result = await crawlWithFirecrawl(
      "https://brand.example/",
      ["products(?:/.*)?"],
      99,
      config,
      fetcher,
      { pollIntervalMs: 0, maxPolls: 3 },
    );

    expect(result).toMatchObject({ ok: true, creditsUsed: 4 });
    if (!result.ok) throw new Error(result.error);
    expect(result.documents).toHaveLength(5);
    expect(requests).toHaveLength(3);
    const startBody = JSON.parse(String(requests[0]?.init?.body));
    expect(startBody).toMatchObject({
      includePaths: ["products(?:/.*)?"],
      maxDiscoveryDepth: 1,
      limit: 5,
      crawlEntireDomain: false,
      allowExternalLinks: false,
      allowSubdomains: false,
      ignoreRobotsTxt: false,
      maxConcurrency: 1,
      scrapeOptions: {
        onlyMainContent: true,
        onlyCleanContent: false,
      },
    });
    expect(startBody.excludePaths).toEqual(
      expect.arrayContaining(["account(?:/.*)?", "checkout(?:/.*)?"]),
    );
    expect(startBody).not.toHaveProperty("actions");
  });
});
