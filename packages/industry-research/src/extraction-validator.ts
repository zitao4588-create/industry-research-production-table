import type {
  EvidenceValidation,
  RawDocument,
  ResearchReviewStatus,
} from "./types";

export type EvidenceQuoteValidation = EvidenceValidation & {
  quote: string;
  rawDocumentId?: string;
  sourceId?: string;
  url?: string;
};

export type StructuredExtractionValidationResult = {
  status: ResearchReviewStatus;
  matchedQuotes: EvidenceQuoteValidation[];
  failureReasons: string[];
  confirmedEvidenceCount: number;
};

const businessUnsupportedWithoutEvidence = [
  /\b\d+(\.\d+)?\s*(k|m|万|亿)?\s*(users|customers|orders|sales|销量|用户|订单)\b/i,
  /\btop\s*\d+\b/i,
  /排名\s*\d+/,
  /市场份额/,
  /转化率/,
  /销售额/,
];

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function documentHaystack(document: RawDocument) {
  return normalizeText(
    [document.title, document.excerpt, document.extractedText].join("\n"),
  );
}

export function canConfirmWithSource(document: RawDocument) {
  return (
    document.sourceQuality.acceptedForReport &&
    document.sourceQuality.sourceRelevance !== "low" &&
    document.sourceQuality.sourceConfidence !== "low" &&
    document.sourceQuality.sourceType !== "robots" &&
    document.sourceQuality.sourceType !== "sitemap" &&
    document.sourceQuality.sourceType !== "search_candidate" &&
    document.sourceQuality.sourceType !== "unknown"
  );
}

function findMatchingRawDocument(quote: string, rawDocuments: RawDocument[]) {
  const normalizedQuote = normalizeText(quote);

  if (normalizedQuote.length < 4) {
    return undefined;
  }

  return rawDocuments.find((document) =>
    documentHaystack(document).includes(normalizedQuote),
  );
}

export function validateEvidenceQuotes(
  quotes: string[],
  rawDocuments: RawDocument[],
): StructuredExtractionValidationResult {
  const normalizedQuotes = quotes.map((quote) => quote.trim()).filter(Boolean);
  const failureReasons: string[] = [];

  if (normalizedQuotes.length === 0) {
    return {
      status: "rejected",
      matchedQuotes: [],
      failureReasons: ["missing_evidence_quote"],
      confirmedEvidenceCount: 0,
    };
  }

  const matchedQuotes = normalizedQuotes.map((quote) => {
    const matched = findMatchingRawDocument(quote, rawDocuments);
    const sourceAccepted = matched ? canConfirmWithSource(matched) : false;
    const failureReason = matched
      ? sourceAccepted
        ? undefined
        : `source_not_confirmable:${matched.sourceQuality.sourceType}`
      : "quote_not_found_in_raw_documents";

    if (failureReason) {
      failureReasons.push(failureReason);
    }

    return {
      quote,
      quoteMatched: Boolean(matched),
      sourceAccepted,
      matchedRawDocumentId: matched?.id,
      rawDocumentId: matched?.id,
      sourceId: matched?.sourceId,
      url: matched?.url,
      failureReason,
    } satisfies EvidenceQuoteValidation;
  });

  const confirmedEvidenceCount = matchedQuotes.filter(
    (item) => item.quoteMatched && item.sourceAccepted,
  ).length;

  return {
    status: confirmedEvidenceCount > 0 ? "approved" : "needs_review",
    matchedQuotes,
    failureReasons: [...new Set(failureReasons)],
    confirmedEvidenceCount,
  };
}

export function hasUnsupportedQuantifiedClaim(value: string) {
  return businessUnsupportedWithoutEvidence.some((pattern) =>
    pattern.test(value),
  );
}

export function mergeReviewStatus(
  modelStatus: ResearchReviewStatus,
  validationStatus: ResearchReviewStatus,
): ResearchReviewStatus {
  if (validationStatus === "rejected") {
    return "rejected";
  }

  if (validationStatus === "needs_review") {
    return "needs_review";
  }

  return modelStatus === "approved" ? "approved" : "needs_review";
}

export function validationNote(
  validation: StructuredExtractionValidationResult,
) {
  if (validation.status === "approved") {
    return "证据 quote 已匹配到 acceptedForReport 的 raw document。";
  }

  if (validation.status === "rejected") {
    return "缺少 evidenceQuotes，不能进入正式数据库。";
  }

  return `证据需要复核：${validation.failureReasons.join(", ") || "source_not_confirmable"}`;
}
