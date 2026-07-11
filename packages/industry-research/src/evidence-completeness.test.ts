import { describe, expect, it } from "vitest";
import { assessEvidenceCompleteFindings } from "./evidence-completeness";
import type { Evidence, RawDocument } from "./types";

function document(id: string, url: string, text: string): RawDocument {
  return {
    id,
    projectId: "project-test",
    sourceId: `source-${id}`,
    crawlRunId: `crawl-${id}`,
    url,
    title: text,
    contentType: "html",
    excerpt: text,
    extractedText: text,
    databaseTargets: ["competitor_database", "opportunity_database"],
    sourceQuality: {
      sourceType: "product_page",
      sourceRelevance: "high",
      sourceConfidence: "high",
      needsReviewReason: "",
      acceptedForReport: true,
    },
  };
}

function evidence(id: string, rawDocumentId: string, quote: string): Evidence {
  return {
    id,
    projectId: "project-test",
    sourceId: `source-${rawDocumentId}`,
    rawDocumentId,
    quote,
    note: "test",
  };
}

describe("assessEvidenceCompleteFindings", () => {
  it("separates evidence-complete claims from commercial review status", () => {
    const productTitle =
      "Nutramax Proviable Probiotics for Dogs and Cats, Daily Digestive Health Supplement";
    const review =
      "Customer review excerpt: This supplement quieted her belly down and she quit eating so much grass.";
    const rawDocuments = [
      document(
        "amazon-product",
        "https://www.amazon.com/dp/B0050JM626",
        `${productTitle}\n${review}`,
      ),
    ];
    const allEvidence = [
      evidence("e-product", "amazon-product", productTitle),
      evidence("e-review", "amazon-product", review),
    ];

    const result = assessEvidenceCompleteFindings({
      competitors: [
        {
          id: "competitor-db-1",
          projectId: "project-test",
          competitorId: "competitor-1",
          name: "Nutramax Proviable Probiotics for Dogs and Cats",
          market: "US",
          channel: "Amazon",
          positioning: "Daily Digestive Health Supplement",
          sourceIds: ["source-amazon-product"],
          evidenceIds: ["e-product"],
        },
      ],
      opportunities: [
        {
          id: "opportunity-db-1",
          projectId: "project-test",
          opportunityId: "opportunity-1",
          title: "Eating grass",
          summary:
            "A customer review says the supplement quieted her belly and she quit eating so much grass.",
          totalScore: 5,
          reviewStatus: "needs_review",
          evidenceIds: ["e-review"],
        },
      ],
      evidence: allEvidence,
      rawDocuments,
    });

    expect(result.findingCount).toBe(2);
    expect(result.evidenceCompleteFindings).toBe(2);
    expect(result.evidenceCompleteFindingRatio).toBe(1);
  });

  it("does not count an extrapolated product recommendation as complete", () => {
    const review =
      "Customer review excerpt: My dog will not touch these soft chews.";
    const rawDocuments = [
      document(
        "amazon-product",
        "https://www.amazon.com/dp/B01N17VJF7",
        review,
      ),
    ];

    const result = assessEvidenceCompleteFindings({
      competitors: [],
      opportunities: [
        {
          id: "opportunity-db-1",
          projectId: "project-test",
          opportunityId: "opportunity-1",
          title: "Launch a clean-label probiotic powder",
          summary:
            "A powder with clean ingredients can win the underserved market.",
          totalScore: 5,
          reviewStatus: "needs_review",
          evidenceIds: ["e-review"],
        },
      ],
      evidence: [evidence("e-review", "amazon-product", review)],
      rawDocuments,
    });

    expect(result.evidenceCompleteFindings).toBe(0);
    expect(result.findings[0]?.failureReasons).toContain(
      "important_claim_text_not_covered_by_quotes",
    );
  });
});
