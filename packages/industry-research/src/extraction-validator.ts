import { evaluateEvidenceRoleGate } from "./evidence-role-gate";
import type { IndustryPlanClaimRole } from "./industry-planner";
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
  candidateRawDocumentIds: string[];
};

export type EvidenceQuoteReference = {
  quote: string;
  rawDocumentId?: string;
  sourceId?: string;
  url?: string;
  domain?: string;
};

export type EvidenceQuoteInput = string | EvidenceQuoteReference;

export type EvidenceValidationOptions = {
  claimTexts?: string[];
  requiredClaimTexts?: string[];
  requireDemandEvidence?: boolean;
  claimRole?: IndustryPlanClaimRole;
};

export type StructuredExtractionValidationResult = {
  status: ResearchReviewStatus;
  matchedQuotes: EvidenceQuoteValidation[];
  failureReasons: string[];
  confirmedEvidenceCount: number;
  claimSupportComplete: boolean;
};

const businessUnsupportedWithoutEvidence = [
  /\b\d+(\.\d+)?\s*(k|m|万|亿)?\s*(users|customers|orders|sales|销量|用户|订单)\b/i,
  /\btop\s*\d+\b/i,
  /#\s*\d+\s*(rated|ranked)?/i,
  /\b(?:no\.?|number)\s*1\b/i,
  /排名\s*(?:第)?[一二三四五六七八九十\d]+/,
  /市场份额/,
  /market share/i,
  /转化率/,
  /conversion rate/i,
  /销售额/,
  /sales revenue|\brevenue\b/i,
];

const genericClaimTerms = new Set([
  "brand",
  "product",
  "market",
  "website",
  "official",
  "品牌",
  "产品",
  "市场",
  "官网",
  "线上",
]);
const demandInferencePattern =
  /(?:demand|need|pain point|gap|opportunit|underdeveloped|not popular|lack of|用户需求|消费者需求|痛点|缺口|机会|增长|尚未普及|认知门槛|市场教育)/i;
const directDemandEvidencePattern =
  /(?:customer|consumer|user|review|feedback|survey|question|complaint|frequently asked|消费者|用户|买家|评论|反馈|调研|问答|常见问题|投诉|困扰|需求)/i;

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function lexicalClaimTerms(value: string) {
  const normalized = normalizeText(value);
  const terms =
    normalized.match(/[a-z][a-z0-9-]{3,}|[\p{Script=Han}]{2,}/gu) ?? [];
  const expanded: string[] = [];

  for (const term of terms) {
    if (genericClaimTerms.has(term)) continue;
    if (!/[\p{Script=Han}]/u.test(term)) {
      expanded.push(term);
      continue;
    }
    for (let index = 0; index < term.length - 1; index += 1) {
      expanded.push(term.slice(index, index + 2));
    }
  }

  return [...new Set(expanded)].slice(0, 20);
}

function claimTextCoveredByQuotes(claim: string, quotes: string[]) {
  const terms = lexicalClaimTerms(claim);
  if (terms.length === 0) return true;
  const quoteText = normalizeText(quotes.join("\n"));
  const matched = terms.filter((term) => quoteText.includes(term)).length;
  const required = Math.min(3, Math.max(1, Math.ceil(terms.length * 0.35)));
  return matched >= required;
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

function findMatchingRawDocuments(quote: string, rawDocuments: RawDocument[]) {
  const normalizedQuote = normalizeText(quote);

  if (normalizedQuote.length < 4) {
    return [];
  }

  return rawDocuments.filter((document) =>
    documentHaystack(document).includes(normalizedQuote),
  );
}

function normalizedHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

function hasReferenceConstraint(reference: EvidenceQuoteReference) {
  return Boolean(
    reference.rawDocumentId ||
      reference.sourceId ||
      reference.url ||
      reference.domain,
  );
}

function matchesReference(
  document: RawDocument,
  reference: EvidenceQuoteReference,
) {
  return (
    (!reference.rawDocumentId || document.id === reference.rawDocumentId) &&
    (!reference.sourceId || document.sourceId === reference.sourceId) &&
    (!reference.url || document.url === reference.url) &&
    (!reference.domain ||
      normalizedHostname(document.url) === normalizedHostname(reference.domain))
  );
}

function asEvidenceReference(
  input: EvidenceQuoteInput,
): EvidenceQuoteReference {
  return typeof input === "string" ? { quote: input } : input;
}

export function highRiskClaimHasDirectQuote(claim: string, quotes: string[]) {
  const normalizedClaim = normalizeText(claim);
  const numbers = normalizedClaim.match(/\d+(?:\.\d+)?%?/g) ?? [];
  const markers = [
    /top\s*\d+/i,
    /#\s*\d+\s*(?:rated|ranked)?/i,
    /(?:no\.?|number)\s*1/i,
    /排名\s*(?:第)?[一二三四五六七八九十\d]+/,
    /market share/i,
    /市场份额/,
    /conversion rate/i,
    /转化率/,
    /sales revenue|\brevenue\b/i,
    /销售额/,
    /users|customers|orders|sales|销量|用户|订单/i,
  ]
    .filter((pattern) => pattern.test(normalizedClaim))
    .map((pattern) => normalizedClaim.match(pattern)?.[0] ?? "")
    .filter(Boolean);

  return quotes.some((quote) => {
    const normalizedQuote = normalizeText(quote);
    return (
      numbers.every((number) => normalizedQuote.includes(number)) &&
      markers.every((marker) => normalizedQuote.includes(marker))
    );
  });
}

export function validateEvidenceQuotes(
  quotes: EvidenceQuoteInput[],
  rawDocuments: RawDocument[],
  options: EvidenceValidationOptions = {},
): StructuredExtractionValidationResult {
  const normalizedQuotes = quotes
    .map(asEvidenceReference)
    .map((reference) => ({
      ...reference,
      quote: reference.quote.trim(),
    }))
    .filter((reference) => Boolean(reference.quote));
  const failureReasons: string[] = [];

  if (normalizedQuotes.length === 0) {
    return {
      status: "rejected",
      matchedQuotes: [],
      failureReasons: ["missing_evidence_quote"],
      confirmedEvidenceCount: 0,
      claimSupportComplete: false,
    };
  }

  const matchedQuotes = normalizedQuotes.map((reference) => {
    const quoteMatches = findMatchingRawDocuments(
      reference.quote,
      rawDocuments,
    );
    const constrainedMatches = hasReferenceConstraint(reference)
      ? quoteMatches.filter((document) => matchesReference(document, reference))
      : quoteMatches;
    const matched =
      constrainedMatches.length === 1 ? constrainedMatches[0] : undefined;
    const sourceQualityAccepted = matched
      ? canConfirmWithSource(matched)
      : false;
    const roleGate = matched
      ? evaluateEvidenceRoleGate({
          rawDocument: matched,
          claimRole: options.claimRole,
          requireRoleMetadata: Boolean(options.claimRole),
        })
      : undefined;
    const sourceAccepted = Boolean(
      sourceQualityAccepted && (roleGate?.authorized ?? true),
    );
    const failureReason =
      quoteMatches.length === 0
        ? "quote_not_found_in_raw_documents"
        : constrainedMatches.length === 0
          ? "evidence_reference_mismatch"
          : constrainedMatches.length > 1
            ? "ambiguous_quote_match"
            : !sourceQualityAccepted
              ? `source_not_confirmable:${matched?.sourceQuality.sourceType ?? "unknown"}`
              : roleGate && !roleGate.authorized
                ? roleGate.failureReason
                : undefined;

    if (failureReason) {
      failureReasons.push(failureReason);
    }

    return {
      quote: reference.quote,
      quoteMatched: Boolean(matched),
      sourceAccepted,
      matchedRawDocumentId: matched?.id,
      rawDocumentId: matched?.id,
      sourceId: matched?.sourceId,
      url: matched?.url,
      roleAuthorized: roleGate?.roleAware ? roleGate.authorized : undefined,
      sourceRole: roleGate?.sourceRole,
      claimRole: roleGate?.claimRole,
      roleFailureReason: roleGate?.failureReason,
      candidateRawDocumentIds: constrainedMatches.map(
        (document) => document.id,
      ),
      failureReason,
    } satisfies EvidenceQuoteValidation;
  });

  const confirmedEvidenceCount = matchedQuotes.filter(
    (item) => item.quoteMatched && item.sourceAccepted,
  ).length;
  const unsupportedHighRiskClaim = (options.claimTexts ?? [])
    .filter(hasUnsupportedQuantifiedClaim)
    .some(
      (claim) =>
        !highRiskClaimHasDirectQuote(
          claim,
          normalizedQuotes.map((reference) => reference.quote),
        ),
    );

  if (unsupportedHighRiskClaim) {
    failureReasons.push("high_risk_claim_not_directly_quoted");
  }

  const quoteTexts = normalizedQuotes.map((reference) => reference.quote);
  // A uniquely bound source URL is itself direct evidence for channel claims
  // such as "Amazon". Keep titles/body claims quote-bound, but do not force the
  // model to repeat marketplace names that are already explicit in the URL.
  const claimCoverageTexts = [
    ...quoteTexts,
    ...matchedQuotes
      .filter((item) => item.quoteMatched && item.sourceAccepted)
      .flatMap((item) => [item.url ?? "", item.sourceId ?? ""]),
  ];
  const uncoveredClaimText = (options.requiredClaimTexts ?? [])
    .filter(Boolean)
    .some((claim) => !claimTextCoveredByQuotes(claim, claimCoverageTexts));
  if (uncoveredClaimText) {
    failureReasons.push("important_claim_text_not_covered_by_quotes");
  }

  const hasDemandInference = (options.claimTexts ?? []).some((claim) =>
    demandInferencePattern.test(claim),
  );
  if (
    options.requireDemandEvidence &&
    hasDemandInference &&
    !quoteTexts.some((quote) => directDemandEvidencePattern.test(quote))
  ) {
    failureReasons.push("demand_inference_without_direct_user_evidence");
  }

  const claimSupportComplete =
    confirmedEvidenceCount === normalizedQuotes.length &&
    failureReasons.length === 0;

  return {
    status: claimSupportComplete ? "approved" : "needs_review",
    matchedQuotes,
    failureReasons: [...new Set(failureReasons)],
    confirmedEvidenceCount,
    claimSupportComplete,
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
    return "全部证据 quote 已唯一匹配到 acceptedForReport 的 raw document。";
  }

  if (validation.status === "rejected") {
    return "缺少 evidenceQuotes，不能进入正式数据库。";
  }

  return `证据需要复核：${validation.failureReasons.join(", ") || "source_not_confirmable"}`;
}
