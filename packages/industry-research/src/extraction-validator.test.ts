import { describe, expect, it } from "vitest";
import { validateEvidenceQuotes } from "./extraction-validator";
import type { RawDocument } from "./types";

function rawDocument(
  id: string,
  text: string,
  overrides: Partial<RawDocument> = {},
): RawDocument {
  return {
    id,
    projectId: "project-test",
    sourceId: `source-${id}`,
    crawlRunId: `crawl-${id}`,
    url: `https://${id}.example/products/item`,
    title: `${id} title`,
    contentType: "html",
    excerpt: text,
    extractedText: text,
    databaseTargets: ["competitor_database"],
    sourceQuality: {
      sourceType: "official_site",
      sourceRelevance: "high",
      sourceConfidence: "high",
      needsReviewReason: "",
      acceptedForReport: true,
    },
    ...overrides,
  };
}

describe("validateEvidenceQuotes", () => {
  it("rejects an ambiguous global quote instead of taking the first document", () => {
    const documents = [
      rawDocument("brand-a", "Official product details and Shop Now"),
      rawDocument("brand-b", "Official product details and Shop Now"),
    ];

    const result = validateEvidenceQuotes(
      ["Official product details"],
      documents,
    );

    expect(result.status).toBe("needs_review");
    expect(result.claimSupportComplete).toBe(false);
    expect(result.failureReasons).toContain("ambiguous_quote_match");
    expect(result.matchedQuotes[0]?.rawDocumentId).toBeUndefined();
    expect(result.matchedQuotes[0]?.candidateRawDocumentIds).toEqual([
      "brand-a",
      "brand-b",
    ]);
  });

  it("binds a duplicate quote to the explicitly referenced raw document", () => {
    const documents = [
      rawDocument("brand-a", "Official product details and Shop Now"),
      rawDocument("brand-b", "Official product details and Shop Now"),
    ];

    const result = validateEvidenceQuotes(
      [
        {
          quote: "Official product details",
          rawDocumentId: "brand-b",
          sourceId: "source-brand-b",
          url: "https://brand-b.example/products/item",
        },
      ],
      documents,
    );

    expect(result.status).toBe("approved");
    expect(result.claimSupportComplete).toBe(true);
    expect(result.matchedQuotes[0]?.rawDocumentId).toBe("brand-b");
    expect(result.matchedQuotes[0]?.url).toBe(
      "https://brand-b.example/products/item",
    );
  });

  it("keeps the entire claim out of confirmed output when any quote fails", () => {
    const documents = [rawDocument("brand-a", "A directly observed fact")];

    const result = validateEvidenceQuotes(
      ["A directly observed fact", "A fabricated second fact"],
      documents,
    );

    expect(result.status).toBe("needs_review");
    expect(result.confirmedEvidenceCount).toBe(1);
    expect(result.claimSupportComplete).toBe(false);
    expect(result.failureReasons).toContain("quote_not_found_in_raw_documents");
  });

  it("requires high-risk quantified claims to be directly present in evidence", () => {
    const documents = [rawDocument("brand-a", "The brand sells a starter kit")];

    const result = validateEvidenceQuotes(
      ["The brand sells a starter kit"],
      documents,
      { claimTexts: ["The brand has 30% market share"] },
    );

    expect(result.status).toBe("needs_review");
    expect(result.claimSupportComplete).toBe(false);
    expect(result.failureReasons).toContain(
      "high_risk_claim_not_directly_quoted",
    );

    const unsupportedRanking = validateEvidenceQuotes(
      ["The brand sells a starter kit"],
      documents,
      { claimTexts: ["#1 Rated pet supplement brand"] },
    );
    expect(unsupportedRanking.status).toBe("needs_review");
    expect(unsupportedRanking.failureReasons).toContain(
      "high_risk_claim_not_directly_quoted",
    );
  });

  it("keeps an important competitor field in review when its quote is missing", () => {
    const documents = [
      rawDocument(
        "brand-a",
        "Daily probiotic supplement for dogs with digestive support.",
      ),
    ];

    const result = validateEvidenceQuotes(
      ["Daily probiotic supplement for dogs"],
      documents,
      {
        claimTexts: ["Daily probiotic supplement", "DTC subscription channel"],
        requiredClaimTexts: ["DTC subscription channel"],
      },
    );

    expect(result.status).toBe("needs_review");
    expect(result.failureReasons).toContain(
      "important_claim_text_not_covered_by_quotes",
    );
  });

  it("uses a uniquely bound marketplace URL as direct channel evidence", () => {
    const title = "Nutramax Proviable Probiotics for Dogs and Cats";
    const documents = [
      rawDocument("amazon-product", title, {
        url: "https://www.amazon.com/dp/B0050JM626",
        title,
        sourceQuality: {
          sourceType: "product_page",
          sourceRelevance: "high",
          sourceConfidence: "high",
          needsReviewReason: "",
          acceptedForReport: true,
        },
      }),
    ];

    const result = validateEvidenceQuotes(
      [{ quote: title, rawDocumentId: "amazon-product" }],
      documents,
      {
        claimTexts: [title, "Amazon", "Daily probiotics for dogs and cats"],
        requiredClaimTexts: [title, "Amazon", "Daily probiotics for dogs"],
      },
    );

    expect(result.status).toBe("approved");
    expect(result.claimSupportComplete).toBe(true);
  });

  it("does not turn product existence into inferred user demand", () => {
    const documents = [
      rawDocument(
        "brand-a",
        "The official product page lists a daily probiotic starter kit.",
      ),
    ];

    const result = validateEvidenceQuotes(
      ["official product page lists a daily probiotic starter kit"],
      documents,
      {
        claimTexts: ["There is growing user demand for starter kits"],
        requireDemandEvidence: true,
      },
    );

    expect(result.status).toBe("needs_review");
    expect(result.failureReasons).toContain(
      "demand_inference_without_direct_user_evidence",
    );
  });

  it("accepts a demand claim backed by a direct review or user quote", () => {
    const quote = "用户评论反馈，敏感肠胃犬需要更容易坚持的每日益生菌方案。";
    const documents = [rawDocument("brand-a", quote)];

    const result = validateEvidenceQuotes([quote], documents, {
      claimTexts: ["敏感肠胃用户需求是更容易坚持的每日方案"],
      requiredClaimTexts: ["敏感肠胃用户需要每日方案"],
      requireDemandEvidence: true,
    });

    expect(result.status).toBe("approved");
    expect(result.claimSupportComplete).toBe(true);
    expect(result.failureReasons).toEqual([]);
  });
});
