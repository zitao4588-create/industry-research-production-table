import { describe, expect, it } from "vitest";
import { assessSourceQuality } from "./source-quality";
import type { CrawlPlanTarget, ResearchWorkflowInput } from "./types";

const input: ResearchWorkflowInput = {
  projectName: "男士电动剃须刀竞品研究",
  industry: "男士电动剃须刀",
  category: "男士电动剃须刀",
  market: "线上电商 / DTC",
  researchGoal: "找到可切入的产品与内容机会",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

function target(url: string, kind: CrawlPlanTarget["kind"] = "homepage") {
  return {
    id: "target-1",
    projectId: "project-1",
    candidateId: "candidate-1",
    kind,
    target: url,
    reason: "test target",
    maxPages: 1,
    databaseTargets: ["competitor_database"],
  } satisfies CrawlPlanTarget;
}

describe("assessSourceQuality", () => {
  it("rejects portal and financial news homepages as official-site evidence", () => {
    const quality = assessSourceQuality({
      target: target("https://www.wabei.cn/"),
      input,
      title: "挖贝网_让信披更及时",
      url: "https://www.wabei.cn/",
      extractedText:
        "挖贝网 北交所 A股 港股 科创板 快讯 财经 证券 信披 企业新闻",
    });

    expect(quality.sourceType).toBe("unknown");
    expect(quality.sourceConfidence).toBe("low");
    expect(quality.acceptedForReport).toBe(false);
    expect(quality.needsReviewReason).toContain("平台、门户、资讯");
  });

  it("keeps a brand official homepage accepted when it matches the target category", () => {
    const quality = assessSourceQuality({
      target: target("https://www.philips.com.cn/"),
      input,
      title: "飞利浦官方网站",
      url: "https://www.philips.com.cn/",
      extractedText:
        "飞利浦官方网站 男士电动剃须刀 Shaver series 5000 干湿两用电动剃须刀 产品 品牌 官网 ".repeat(
          12,
        ),
    });

    expect(quality.sourceType).toBe("official_site");
    expect(quality.sourceRelevance).toBe("high");
    expect(quality.sourceConfidence).toBe("high");
    expect(quality.acceptedForReport).toBe(true);
  });

  it("keeps discovery-only documents out of accepted report evidence", () => {
    const sitemapQuality = assessSourceQuality({
      target: target("https://brand.example/sitemap.xml", "sitemap"),
      input,
      title: "sitemap",
      url: "https://brand.example/sitemap.xml",
      extractedText:
        "https://brand.example/products/shaver https://brand.example/collections/shavers",
    });
    const searchQuality = assessSourceQuality({
      target: target("https://search.example?q=shaver", "search_results"),
      input,
      title: "Search candidate",
      url: "https://search.example?q=shaver",
      extractedText:
        "男士电动剃须刀 search result candidate product brand ".repeat(10),
    });

    expect(sitemapQuality.sourceType).toBe("sitemap");
    expect(sitemapQuality.acceptedForReport).toBe(false);
    expect(searchQuality.sourceType).toBe("search_candidate");
    expect(searchQuality.acceptedForReport).toBe(false);
  });
});
