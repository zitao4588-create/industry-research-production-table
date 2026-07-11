import type {
  DocumentCleaningAudit,
  DocumentNoiseReason,
  DocumentNoiseSegment,
  DocumentTextFormat,
} from "./types";

export type CleanDocumentTextInput = {
  text: string;
  format: DocumentTextFormat;
  maxTextLength: number;
};

export type CleanDocumentTextResult = {
  originalText: string;
  cleanedText: string;
  audit: DocumentCleaningAudit;
};

type RemovedRecorder = (
  reason: DocumentNoiseReason,
  removed: string,
  replacement?: string,
) => string;

const blockTags =
  /<\/?(?:article|blockquote|br|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul)[^>]*>/gi;
const inlineMarkupPattern = /<[^>]+>/g;
const minimumDuplicateTokens = 10;
const minimumDuplicateCharacters = 30;
const maxAuditSegments = 20;
const maxAuditSegmentsPerReason = 3;

function decodeEntities(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_match, value: string) =>
      String.fromCodePoint(Number(value)),
    )
    .replace(/&#x([\da-f]+);/gi, (_match, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    );
}

function compactExcerpt(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}

function normalizeStructuredText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replacePattern(
  value: string,
  pattern: RegExp,
  reason: DocumentNoiseReason,
  record: RemovedRecorder,
  replacement: string | ((match: RegExpExecArray) => string) = " ",
) {
  return value.replace(pattern, (...args) => {
    const match = args[0] as string;
    const captures = args.slice(1, -2) as string[];
    const matchArray = Object.assign([match, ...captures], {
      index: args.at(-2) as number,
      input: args.at(-1) as string,
    }) as RegExpExecArray;
    const retained =
      typeof replacement === "function" ? replacement(matchArray) : replacement;
    record(reason, match, retained);
    return retained;
  });
}

function stripHtml(value: string, record: RemovedRecorder) {
  let text = value;

  text = replacePattern(text, /<!--[\s\S]*?-->/g, "markup", record);
  text = replacePattern(
    text,
    /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,
    "markup",
    record,
  );
  text = replacePattern(
    text,
    /<(nav|header|aside|form|dialog)\b[^>]*>[\s\S]*?<\/\1>/gi,
    "navigation",
    record,
  );
  text = replacePattern(
    text,
    /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
    "footer",
    record,
  );
  text = replacePattern(
    text,
    /<(div|section)\b[^>]*(?:class|id)=["'][^"']*(?:cookie|privacy|consent|gdpr|legal)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    "privacy_legal",
    record,
  );
  text = replacePattern(
    text,
    /<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi,
    "image_target",
    record,
    (match) => match[1]?.trim() || " ",
  );
  text = replacePattern(text, /<img\b[^>]*>/gi, "image_target", record);
  text = text.replace(blockTags, "\n");
  text = replacePattern(text, inlineMarkupPattern, "markup", record);

  return decodeEntities(text);
}

function stripMarkdown(value: string, record: RemovedRecorder) {
  let text = value;

  text = replacePattern(text, /<!--[\s\S]*?-->/g, "markup", record);
  text = replacePattern(
    text,
    /\[!\[([^\]]*)\]\([^)]+\)\]\([^)]+\)/g,
    "image_target",
    record,
    (match) => match[1]?.trim() || " ",
  );
  text = replacePattern(
    text,
    /!\[([^\]]*)\]\([^)]+\)/g,
    "image_target",
    record,
    (match) => match[1]?.trim() || " ",
  );
  text = replacePattern(
    text,
    /\[([^\]]+)\]\([^)]+\)/g,
    "markup",
    record,
    (match) => match[1]?.trim() || " ",
  );
  text = text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "\n")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+#{1,6}\s+/g, "\n")
    .replace(/\s+--?>\s+/g, "\n");

  return decodeEntities(text);
}

function stripKnownNoise(value: string, record: RemovedRecorder) {
  let text = value;

  text = replacePattern(text, /(?:^|\s)--?>(?=\s|$)/gm, "markup", record, "\n");

  text = replacePattern(
    text,
    /方太隐私声明[\s\S]*?请勾选方太隐私协议/gi,
    "privacy_legal",
    record,
  );
  text = replacePattern(
    text,
    /尊敬的用户[：:][\s\S]{0,300}?《[^》]*个人信息保护政策》[\s\S]{0,1200}?(?:确定|同意)(?=\s*(?:首页|产品|服务|我的|$))/gi,
    "privacy_legal",
    record,
  );
  text = replacePattern(
    text,
    /(?:www\.[\w.-]+\s*#\s*)?www\.[\w.-]+\s+is blocked[\s\S]*$/gi,
    "crawler_error",
    record,
  );
  text = replacePattern(
    text,
    /This page has been blocked by an extension[\s\S]*?(?:ERR[_\\]BLOCKED[_\\]BY[_\\]CLIENT|Reload)(?:\s|$)/gi,
    "crawler_error",
    record,
  );
  text = replacePattern(
    text,
    /(?:One-time Discount\s+)?Get up to \d+% off \+ Free Shipping[^\n]*(?:\n|$)/gi,
    "footer",
    record,
  );
  text = replacePattern(
    text,
    /产品搜索\s+首页\s+资生堂日本\s+官方产品介绍网站[\s\S]*?©\s*Shiseido[\s\S]*$/gi,
    "footer",
    record,
  );
  text = replacePattern(
    text,
    /\bShop NowShop Now\b/gi,
    "repeated_cta",
    record,
    "Shop Now",
  );

  const keptLines: string[] = [];
  for (const line of normalizeStructuredText(text).split("\n")) {
    const normalized = line.toLowerCase();
    const isSkipLink = /^skip to (?:content|main)/i.test(line);
    const isLegalLine =
      line.length <= 240 &&
      /(privacy policy|cookie settings|terms of service|do not sell|隐私政策|隐私协议|cookie|法律声明)/i.test(
        line,
      );
    const isSocialFooter =
      line.length <= 180 &&
      ["facebook", "instagram", "youtube", "linkedin"].filter((term) =>
        normalized.includes(term),
      ).length >= 3;
    const isCopyrightFooter =
      line.length <= 240 && /(©|all rights reserved|ICP备)/i.test(line);

    if (isSkipLink) {
      record("navigation", line);
    } else if (isLegalLine) {
      record("privacy_legal", line);
    } else if (isSocialFooter || isCopyrightFooter) {
      record("footer", line);
    } else {
      keptLines.push(line);
    }
  }

  return keptLines.join("\n");
}

function positionedTokens(value: string) {
  return [...value.matchAll(/\S+/g)].map((match) => ({
    value: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function findLongestDuplicateTokenRun(value: string) {
  const tokens = positionedTokens(value);
  const firstByFingerprint = new Map<string, number>();
  let best: { start: number; end: number; characterCount: number } | undefined;

  for (
    let index = 0;
    index <= tokens.length - minimumDuplicateTokens;
    index += 1
  ) {
    const fingerprint = tokens
      .slice(index, index + minimumDuplicateTokens)
      .map((token) => token.value.toLowerCase())
      .join("\u0000");
    const firstIndex = firstByFingerprint.get(fingerprint);

    if (firstIndex === undefined) {
      firstByFingerprint.set(fingerprint, index);
      continue;
    }

    if (
      (tokens[firstIndex + minimumDuplicateTokens - 1]?.end ?? 0) >
      (tokens[index]?.start ?? 0)
    ) {
      continue;
    }

    let length = minimumDuplicateTokens;
    while (
      firstIndex + length < tokens.length &&
      index + length < tokens.length &&
      tokens[firstIndex + length]?.value.toLowerCase() ===
        tokens[index + length]?.value.toLowerCase()
    ) {
      length += 1;
    }

    const start = tokens[index]?.start ?? 0;
    const end = tokens[index + length - 1]?.end ?? start;
    const characterCount = end - start;

    if (
      characterCount >= minimumDuplicateCharacters &&
      (!best || characterCount > best.characterCount)
    ) {
      best = { start, end, characterCount };
    }
  }

  return best;
}

function deduplicateTemplates(value: string, record: RemovedRecorder) {
  let text = value;

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const duplicate = findLongestDuplicateTokenRun(text);
    if (!duplicate) break;

    const removed = text.slice(duplicate.start, duplicate.end);
    record("duplicate_template", removed);
    text = `${text.slice(0, duplicate.start)} ${text.slice(duplicate.end)}`;
  }

  const seenLines = new Set<string>();
  const uniqueLines: string[] = [];
  for (const line of normalizeStructuredText(text).split("\n")) {
    const key = line.toLowerCase();
    if (line.length >= 24 && seenLines.has(key)) {
      record("duplicate_template", line);
      continue;
    }
    seenLines.add(key);
    uniqueLines.push(line);
  }

  return uniqueLines.join("\n");
}

function residualNoiseSegments(value: string) {
  const patterns: Array<[DocumentNoiseReason, RegExp]> = [
    [
      "privacy_legal",
      /(privacy policy|cookie settings|terms of service|个人信息保护政策|隐私声明|隐私协议)/gi,
    ],
    [
      "crawler_error",
      /(ERR[_\\]BLOCKED[_\\]BY[_\\]CLIENT|blocked by an extension|verifying connection)/gi,
    ],
    ["image_target", /!\[[^\]]*\]\([^)]+\)/g],
    ["markup", /<[^>]+>|--?>|&nbsp;/g],
    ["navigation", /skip to (?:content|main)/gi],
  ];
  const segments: DocumentNoiseSegment[] = [];

  for (const [reason, pattern] of patterns) {
    for (const match of value.matchAll(pattern)) {
      segments.push({
        reason,
        characterCount: match[0].length,
        excerpt: compactExcerpt(match[0]),
      });
    }
  }

  const duplicate = findLongestDuplicateTokenRun(value);
  if (duplicate) {
    const excerpt = value.slice(duplicate.start, duplicate.end);
    segments.push({
      reason: "duplicate_template",
      characterCount: duplicate.characterCount,
      excerpt: compactExcerpt(excerpt),
    });
  }

  return segments.slice(0, maxAuditSegments);
}

export function cleanDocumentText({
  text,
  format,
  maxTextLength,
}: CleanDocumentTextInput): CleanDocumentTextResult {
  const removedSegments: DocumentNoiseSegment[] = [];
  let removedCharacterCount = 0;
  const record: RemovedRecorder = (reason, removed, replacement = " ") => {
    const characterCount = Math.max(0, removed.length - replacement.length);
    removedCharacterCount += characterCount;
    if (
      characterCount > 0 &&
      removedSegments.length < maxAuditSegments &&
      removedSegments.filter((segment) => segment.reason === reason).length <
        maxAuditSegmentsPerReason
    ) {
      removedSegments.push({
        reason,
        characterCount,
        excerpt: compactExcerpt(removed),
      });
    }
    return replacement;
  };

  let cleaned =
    format === "html"
      ? stripHtml(text, record)
      : format === "markdown"
        ? stripMarkdown(text, record)
        : decodeEntities(text);
  cleaned = stripKnownNoise(cleaned, record);
  cleaned = deduplicateTemplates(cleaned, record);
  cleaned = normalizeStructuredText(cleaned);

  const cleanedTextTruncated = cleaned.length > maxTextLength;
  const cleanedText = cleaned.slice(0, maxTextLength).trim();
  const residualSegments = residualNoiseSegments(cleanedText);
  const residualNoiseCharacterCount = residualSegments.reduce(
    (total, segment) => total + segment.characterCount,
    0,
  );
  const sourceLength = text.length;

  return {
    originalText: text.slice(0, maxTextLength),
    cleanedText,
    audit: {
      sourceLength,
      cleanedLength: cleanedText.length,
      removedCharacterCount: Math.min(sourceLength, removedCharacterCount),
      removedRatio:
        sourceLength > 0
          ? Math.min(1, removedCharacterCount / sourceLength)
          : 0,
      residualNoiseCharacterCount,
      residualNoiseRatio:
        cleanedText.length > 0
          ? Math.min(1, residualNoiseCharacterCount / cleanedText.length)
          : 0,
      originalTextTruncated: text.length > maxTextLength,
      cleanedTextTruncated,
      removedSegments,
      residualNoiseSegments: residualSegments,
    },
  };
}
