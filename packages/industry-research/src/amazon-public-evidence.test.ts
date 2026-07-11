import { describe, expect, it } from "vitest";
import {
  AMAZON_PUBLIC_EVIDENCE_ENABLED_ENV,
  amazonAsinFromUrl,
  collectAmazonPublicEvidence,
  discoverAmazonAsinsFromMarkdown,
  parseAmazonPublicPage,
} from "./amazon-public-evidence";
import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import type { ResearchWorkflowInput } from "./types";

const input: ResearchWorkflowInput = {
  projectName: "宠物益生菌研究",
  industry: "宠物健康",
  category: "宠物肠胃益生菌",
  market: "美国",
  researchGoal: "研究商品与真实买家痛点",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

const searchMarkdown = `
[Purina](https://www.amazon.com/Purina-Probiotic/dp/B001650NNW/ref=sr_1_1)
[Duplicate](https://www.amazon.com/dp/B001650NNW)
[Zesty Paws](https://www.amazon.com/Zesty-Paws/dp/B01N17VJF7/ref=sr_1_2)
`;

const productMarkdown = `
Title: Amazon.com : Purina FortiFlora Probiotic Powder for Dogs, Digestive Support : Pet Supplies

| Brand | Purina |
| Customer Reviews | 4.4 out of 5 stars [(48,979)](https://www.amazon.com/dp/B001650NNW#averageCustomerReviewsAnchor) |

One-Time Price: $30.99

# About this item

- PROBIOTIC SUPPORT FOR DOGS: A daily powder formulated for digestive and immune health support.

## Customer reviews

### Top reviews from the United States

This was easy to sprinkle on food, and my dog ate it without hesitation. It helped settle his stomach within a few days.

Thank you for your feedback. Sorry, we failed to record your vote. Please try again.

The packets are convenient, but the box is expensive for daily use. I would prefer a larger and cheaper format.
`;

function response(body: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => body,
    headers: { get: () => "text/markdown" },
  };
}

describe("amazon public evidence", () => {
  it("canonicalizes Amazon ASIN URLs and deduplicates search results", () => {
    expect(
      amazonAsinFromUrl(
        "https://www.amazon.com/Purina-Probiotic/dp/B001650NNW/ref=sr_1_1",
      ),
    ).toBe("B001650NNW");
    expect(discoverAmazonAsinsFromMarkdown(searchMarkdown)).toEqual([
      "B001650NNW",
      "B01N17VJF7",
    ]);
  });

  it("extracts product fields and rejects Amazon feedback UI as a review", () => {
    const page = parseAmazonPublicPage(
      "https://www.amazon.com/dp/B001650NNW",
      productMarkdown,
      input,
    );

    expect(page.title).toContain("Purina FortiFlora Probiotic Powder for Dogs");
    expect(page.title).not.toContain("Pet Supplies");
    expect(page.brand).toBe("Purina");
    expect(page.price).toBe("$30.99");
    expect(page.rating).toBe("4.4");
    expect(page.reviewCount).toBe("48,979");
    expect(page.categoryFit).toBe("direct");
    expect(page.fieldCoverage).toBe(1);
    expect(page.reviewSnippets).toHaveLength(2);
    expect(page.reviewSnippets.join(" ")).not.toContain("Thank you");
  });

  it("is disabled by default and makes no requests", async () => {
    let requests = 0;
    const fetcher: PublicCrawlerFetch = async () => {
      requests += 1;
      return response("");
    };

    const result = await collectAmazonPublicEvidence("project-1", input, {
      fetcher,
    });

    expect(requests).toBe(0);
    expect(result.requestCount).toBe(0);
    expect(result.raw_documents).toHaveLength(0);
  });

  it("adds only directly relevant pages that pass the field gate", async () => {
    const requestedUrls: string[] = [];
    const fetcher: PublicCrawlerFetch = async (url) => {
      requestedUrls.push(url);
      if (url.includes("amazon.com/s?")) return response(searchMarkdown);
      if (url.includes("B001650NNW")) return response(productMarkdown);
      return response(`
Title: Amazon.com : Dog Calming Chews for Stress Support : Pet Supplies
| Brand | Example |
| Customer Reviews | 4.2 out of 5 stars [(100)](https://www.amazon.com/dp/B01N17VJF7#averageCustomerReviewsAnchor) |
One-Time Price: $19.99
# About this item
- CALMING SUPPORT FOR DOGS: A soft chew for travel and occasional stress support.
`);
    };

    const result = await collectAmazonPublicEvidence("project-1", input, {
      env: { [AMAZON_PUBLIC_EVIDENCE_ENABLED_ENV]: "true" },
      fetcher,
    });

    expect(requestedUrls).toHaveLength(3);
    expect(result.requestCount).toBe(3);
    expect(result.discoveredAsins).toEqual(["B001650NNW", "B01N17VJF7"]);
    expect(result.pages).toHaveLength(2);
    expect(result.raw_documents).toHaveLength(1);
    expect(result.raw_documents[0]?.sourceQuality.acceptedForReport).toBe(true);
    expect(result.raw_documents[0]?.extractedText).toContain(
      "Customer review excerpt:",
    );
    expect(result.sources[0]?.automationHint).toBe(
      "amazon_public_evidence_jina",
    );
  });

  it("probes bounded extra candidates until reviews cover two ASINs", async () => {
    const candidateAsins = [
      "B001650NNW",
      "B01N17VJF7",
      "B01N6PQ02G",
      "B0050JM626",
    ];
    const expandedSearch = candidateAsins
      .map((asin) => `[Product](https://www.amazon.com/dp/${asin})`)
      .join("\n");
    const withoutReviews =
      productMarkdown.split("## Customer reviews")[0] ?? "";
    const fetcher: PublicCrawlerFetch = async (url) => {
      if (url.includes("amazon.com/s?")) return response(expandedSearch);
      const asin = candidateAsins.find((value) => url.includes(value)) ?? "";
      const page = productMarkdown.replaceAll("B001650NNW", asin);
      return response(
        asin === "B001650NNW" || asin === "B0050JM626"
          ? page
          : withoutReviews.replaceAll("B001650NNW", asin),
      );
    };

    const result = await collectAmazonPublicEvidence("project-1", input, {
      env: { [AMAZON_PUBLIC_EVIDENCE_ENABLED_ENV]: "true" },
      fetcher,
    });

    expect(result.requestCount).toBe(5);
    expect(result.probedAsins).toEqual(candidateAsins);
    expect(result.reviewedAsinCount).toBe(2);
    expect(result.raw_documents).toHaveLength(3);
    expect(
      result.raw_documents.filter((document) =>
        document.extractedText.includes("Customer review excerpt:"),
      ),
    ).toHaveLength(2);
  });
});
