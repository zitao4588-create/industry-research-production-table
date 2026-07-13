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
        "飞利浦官方网站 Shaver series 5000 干湿两用剃须刀 产品 品牌 官网 ".repeat(
          12,
        ),
    });

    expect(quality.sourceType).toBe("official_site");
    expect(quality.sourceRelevance).toBe("high");
    expect(quality.sourceConfidence).toBe("high");
    expect(quality.acceptedForReport).toBe(true);
  });

  it("matches deterministic English commerce signals for a Chinese pet probiotic category", () => {
    const petInput: ResearchWorkflowInput = {
      ...input,
      projectName: "宠物肠胃益生菌竞品研究",
      industry: "宠物健康电商",
      category: "宠物肠胃益生菌",
    };
    const quality = assessSourceQuality({
      target: target("https://www.zestypaws.com/"),
      input: petInput,
      title: "Zesty Paws | Premium Quality Cat and Dog Supplements",
      url: "https://www.zestypaws.com/",
      extractedText:
        "Dog probiotic bites with prebiotic fiber for gut health and healthy digestion. Product reviews and bundles. ".repeat(
          8,
        ),
    });

    expect(quality.sourceType).toBe("official_site");
    expect(quality.sourceRelevance).toBe("high");
    expect(quality.sourceConfidence).toBe("high");
    expect(quality.acceptedForReport).toBe(true);
  });

  it("does not accept an official-looking domain without category evidence", () => {
    const petInput: ResearchWorkflowInput = {
      ...input,
      projectName: "宠物肠胃益生菌竞品研究",
      industry: "宠物健康电商",
      category: "宠物肠胃益生菌",
    };
    const quality = assessSourceQuality({
      target: target("https://official-brand.example/"),
      input: petInput,
      title: "Official Brand Store",
      url: "https://official-brand.example/",
      extractedText:
        "Official store shop products collection reviews bundle subscription ".repeat(
          20,
        ),
    });

    expect(quality.sourceType).toBe("official_site");
    expect(quality.sourceRelevance).toBe("low");
    expect(quality.acceptedForReport).toBe(false);
  });

  it("does not mistake generic ecommerce market language for refrigerator evidence", () => {
    const refrigeratorInput: ResearchWorkflowInput = {
      ...input,
      projectName: "冰箱行业研究",
      industry: "冰箱",
      category: "冰箱",
      market: "线上电商 / DTC",
    };
    const quality = assessSourceQuality({
      target: target("https://www.amz123.com/"),
      input: refrigeratorInput,
      title: "跨境电商物流软件与 DTC 运营服务",
      url: "https://www.amz123.com/",
      extractedText:
        "跨境电商 DTC 市场 物流仓储 软件服务 商品运营 品牌官网".repeat(30),
    });

    expect(quality.sourceRelevance).toBe("low");
    expect(quality.acceptedForReport).toBe(false);
  });

  it("keeps lifestyle media out of accepted evidence even when it mentions skincare", () => {
    const skincareInput: ResearchWorkflowInput = {
      ...input,
      projectName: "日本小众护肤品牌竞品研究",
      industry: "日本小众护肤品牌",
      category: "日本小众护肤品牌",
    };
    const quality = assessSourceQuality({
      target: target("https://www.cosmopolitan.com.hk/"),
      input: skincareInput,
      title: "Cosmopolitan HK - 美容護膚、時尚潮流、星座運勢、女性生活",
      url: "https://www.cosmopolitan.com.hk/",
      extractedText:
        "美容護膚 時尚潮流 女性生活 日本护肤新品 新闻 专题文章 产品推荐 ".repeat(
          20,
        ),
    });

    expect(quality.sourceType).toBe("unknown");
    expect(quality.acceptedForReport).toBe(false);
  });

  it("rejects auto-discovered commerce homepages without category relevance", () => {
    const quality = assessSourceQuality({
      target: target("https://www.sayweee.com/"),
      input,
      title: "Weee! | America's largest online Asian supermarket",
      url: "https://www.sayweee.com/",
      extractedText:
        "Online grocery supermarket shop products collection best sellers reviews subscription ".repeat(
          20,
        ),
    });

    expect(quality.sourceType).toBe("official_site");
    expect(quality.sourceRelevance).toBe("low");
    expect(quality.acceptedForReport).toBe(false);
  });

  it("keeps user-provided commerce homepages as candidate evidence", () => {
    const quality = assessSourceQuality({
      target: target("https://brand.example/"),
      input: { ...input, urls: ["https://brand.example"] },
      title: "Brand official store",
      url: "https://brand.example/",
      extractedText:
        "Official store shop products collection reviews bundle subscription ".repeat(
          20,
        ),
    });

    expect(quality.sourceType).toBe("official_site");
    expect(quality.sourceRelevance).toBe("medium");
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

  it("rejects a long navigation shell even when it repeats the target category", () => {
    const dishwasherInput: ResearchWorkflowInput = {
      ...input,
      industry: "洗碗机",
      category: "洗碗机",
    };
    const navigationLines = [
      "首页",
      "品牌故事",
      "智慧家庭",
      "产品中心",
      "洗碗机",
      "厨房电器",
      "服务支持",
      "联系我们",
    ];
    const quality = assessSourceQuality({
      target: target("https://haier-shell.example/"),
      input: dishwasherInput,
      title: "洗碗机品牌官网",
      url: "https://haier-shell.example/",
      extractedText: Array.from({ length: 15 }, () => navigationLines)
        .flat()
        .join("\n"),
    });

    expect(quality.sourceConfidence).toBe("low");
    expect(quality.acceptedForReport).toBe(false);
    expect(quality.needsReviewReason).toContain("导航");
  });

  it("rejects a short news index shell without rejecting ordinary short pages", () => {
    const quality = assessSourceQuality({
      target: target("https://brand.example/news", "blog"),
      input,
      title: "品牌资讯",
      url: "https://brand.example/news",
      extractedText:
        "首页\n产品中心\n品牌资讯\n媒体报道\n男士电动剃须刀\n服务支持\n联系我们",
    });

    expect(quality.sourceConfidence).toBe("low");
    expect(quality.acceptedForReport).toBe(false);
    expect(quality.needsReviewReason).toContain("导航");
  });

  it("accepts a substantive FAQ page even when a few navigation labels remain", () => {
    const quality = assessSourceQuality({
      target: target("https://brand.example/guides/shaver-faq", "blog"),
      input,
      title: "男士电动剃须刀常见问题",
      url: "https://brand.example/guides/shaver-faq",
      extractedText: [
        "首页\n产品\n支持",
        "男士电动剃须刀常见问题。湿剃前应先确认机身支持全身水洗，并按照说明书安装刀头。",
        "用户经常询问敏感肌是否适合每日使用。建议从较低档位开始，并保持刀网清洁，减少重复摩擦。",
        "产品页面同时说明充电时间、续航方式、替换刀头周期和保修服务，购买前可以逐项比较。",
        "如果剃须后仍有拉扯感，应检查刀头磨损和胡须长度，而不是仅根据品牌宣传判断效果。",
      ].join("\n"),
    });

    expect(quality.sourceConfidence).not.toBe("low");
    expect(quality.acceptedForReport).toBe(true);
  });
});
