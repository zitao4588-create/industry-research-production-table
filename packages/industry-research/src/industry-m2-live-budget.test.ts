import { describe, expect, it } from "vitest";
import {
  createIndustryM2LiveBudgetTracker,
  industryM23LiveBudget,
  industryM24LiveBudget,
  industryM42PublicGapClosureLiveBudget,
  industryM42PublicRecoveryLiveBudget,
  industryM42RegulationChangeLiveBudget,
  industryM42Wave1LiveBudget,
} from "./industry-m2-live-budget";
import type { PublicCrawlerResponse } from "./public-crawl-adapter";

function response(payload: unknown = {}, status = 200) {
  const body = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: () => "application/json" },
    clone: () => ({ json: async () => payload }),
  } satisfies PublicCrawlerResponse & {
    clone: () => { json: () => Promise<unknown> };
  };
}

describe("M2 live budget tracker", () => {
  it("classifies and audits Tavily, Firecrawl and native requests", async () => {
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async (url) =>
        response(url.includes("firecrawl") ? { creditsUsed: 2 } : {}),
    });
    const discover = tracker.createFetcher("discovery");
    const crawl = tracker.createFetcher("crawl");

    await discover("https://api.tavily.com/search");
    await discover("https://api.firecrawl.dev/v2/map", {
      body: JSON.stringify({ url: "https://example.com" }),
    });
    await crawl("https://example.com/dishwashers");

    expect(tracker.snapshot()).toMatchObject({
      publicRequests: 3,
      tavilySearchRequests: 1,
      firecrawlRequests: 1,
      firecrawlReservedCredits: 20,
      firecrawlReportedCredits: 2,
      nativePublicRequests: 1,
      llmRequests: 0,
      reservedCostYuan: 0.064,
    });
  });

  it("rejects a request before exceeding every hard cap", async () => {
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => response(),
    });
    const fetcher = tracker.createFetcher("discovery");
    for (
      let index = 0;
      index < industryM23LiveBudget.maximumTavilySearchRequests;
      index += 1
    ) {
      await fetcher("https://api.tavily.com/search");
    }
    await expect(fetcher("https://api.tavily.com/search")).rejects.toThrow(
      "m2_tavily_request_cap_reached",
    );
    expect(tracker.snapshot().publicRequests).toBe(3);
  });

  it("reserves Firecrawl credits before sending a request", async () => {
    let delegated = 0;
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => {
        delegated += 1;
        return response();
      },
    });
    const fetcher = tracker.createFetcher("crawl");
    for (let index = 0; index < 10; index += 1) {
      await fetcher("https://api.firecrawl.dev/v2/scrape");
    }
    await expect(
      fetcher("https://api.firecrawl.dev/v2/scrape"),
    ).rejects.toThrow("m2_firecrawl_credit_cap_reached");
    expect(delegated).toBe(10);
    expect(tracker.snapshot().firecrawlReservedCredits).toBe(50);
  });

  it("accepts the smaller M2.4 budget without inheriting M2.3 limits", async () => {
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => response(),
      budget: industryM24LiveBudget,
    });
    const fetcher = tracker.createFetcher("crawl");
    for (let index = 0; index < 4; index += 1) {
      await fetcher("https://api.firecrawl.dev/v2/scrape");
    }
    await expect(
      fetcher("https://api.firecrawl.dev/v2/scrape"),
    ).rejects.toThrow("m2_firecrawl_credit_cap_reached");
    expect(tracker.snapshot().firecrawlReservedCredits).toBe(20);
  });

  it("enforces the separately declared M4.2 wave-one search cap", async () => {
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => response(),
      budget: industryM42Wave1LiveBudget,
    });
    const fetcher = tracker.createFetcher("discovery");
    for (
      let index = 0;
      index < industryM42Wave1LiveBudget.maximumTavilySearchRequests;
      index += 1
    ) {
      await fetcher("https://api.tavily.com/search");
    }
    await expect(fetcher("https://api.tavily.com/search")).rejects.toThrow(
      "m2_tavily_request_cap_reached",
    );
    expect(tracker.snapshot().publicRequests).toBe(6);
  });

  it("enforces the finite M4.2 public-market recovery budget", async () => {
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => response(),
      budget: industryM42PublicRecoveryLiveBudget,
    });
    const fetcher = tracker.createFetcher("crawl");
    for (let index = 0; index < 12; index += 1) {
      await fetcher("https://api.firecrawl.dev/v2/scrape");
    }
    await expect(
      fetcher("https://api.firecrawl.dev/v2/scrape"),
    ).rejects.toThrow("m2_firecrawl_credit_cap_reached");
    expect(tracker.snapshot().firecrawlReservedCredits).toBe(60);
  });

  it("forbids search spend in the public gap-closure pass", async () => {
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => response(),
      budget: industryM42PublicGapClosureLiveBudget,
    });
    await expect(
      tracker.createFetcher("discovery")("https://api.tavily.com/search"),
    ).rejects.toThrow("m2_tavily_request_cap_reached");
    expect(tracker.snapshot().publicRequests).toBe(0);
  });

  it("keeps the regulation-change fetch inside a finite no-search budget", async () => {
    const tracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => response(),
      budget: industryM42RegulationChangeLiveBudget,
    });
    const crawl = tracker.createFetcher("crawl");
    await crawl("https://english.nmpa.gov.cn/2024-04/22/c_1049743.htm");
    expect(tracker.snapshot()).toMatchObject({
      publicRequests: 1,
      nativePublicRequests: 1,
      llmRequests: 0,
      reservedCostYuan: 0,
    });
    const searchTracker = createIndustryM2LiveBudgetTracker({
      delegate: async () => response(),
      budget: industryM42RegulationChangeLiveBudget,
    });
    await expect(
      searchTracker.createFetcher("discovery")("https://api.tavily.com/search"),
    ).rejects.toThrow("m2_tavily_request_cap_reached");
  });
});
