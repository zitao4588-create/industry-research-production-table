import {
  canConfirmWithSource,
  type EvidenceQuoteInput,
  type EvidenceQuoteReference,
  mergeReviewStatus,
  validateEvidenceQuotes,
  validationNote,
} from "./extraction-validator";
import {
  callDeepSeekChatCompletion,
  type GlmFetch,
  type GlmRuntimeEnv,
} from "./glm-client";
import type {
  Competitor,
  CompetitorDatabaseEntry,
  ContentDatabaseEntry,
  ContentSignal,
  Evidence,
  KeywordDatabaseEntry,
  Opportunity,
  OpportunityDatabaseEntry,
  PainPoint,
  PainPointDatabaseEntry,
  ProductDatabaseEntry,
  ProductSignal,
  RawDocument,
  ResearchReviewStatus,
  ResearchWorkflowResult,
  WebsiteStructureDatabaseEntry,
  WeeklyIntelligenceReportEntry,
} from "./types";

type GlmEvidenceReference = Partial<EvidenceQuoteReference>;

type GlmExtractedCompetitor = {
  name?: string;
  channel?: string;
  positioning?: string;
  websiteStructure?: string[];
  collectionSignals?: string[];
  evidenceQuotes?: string[];
  evidenceReferences?: GlmEvidenceReference[];
};

type GlmExtractedProductSignal = {
  competitorName?: string;
  category?: string;
  signal?: string;
  tags?: string[];
  evidenceQuotes?: string[];
  evidenceReferences?: GlmEvidenceReference[];
};

type GlmExtractedPainPoint = {
  theme?: string;
  userNeed?: string;
  frequency?: "low" | "medium" | "high";
  evidenceQuotes?: string[];
  evidenceReferences?: GlmEvidenceReference[];
};

type GlmExtractedContentSignal = {
  platform?: string;
  topic?: string;
  contentType?: ContentSignal["contentType"];
  whyItWorks?: string;
  evidenceQuotes?: string[];
  evidenceReferences?: GlmEvidenceReference[];
};

type GlmExtractedOpportunity = {
  title?: string;
  summary?: string;
  demandScore?: number;
  competitionScore?: number;
  contentGapScore?: number;
  businessValueScore?: number;
  evidenceQualityScore?: number;
  reviewStatus?: ResearchReviewStatus;
  reviewNote?: string;
  evidenceQuotes?: string[];
  evidenceReferences?: GlmEvidenceReference[];
};

export type GlmStructuredExtraction = {
  competitors: GlmExtractedCompetitor[];
  productSignals: GlmExtractedProductSignal[];
  painPoints: GlmExtractedPainPoint[];
  contentSignals: GlmExtractedContentSignal[];
  opportunities: GlmExtractedOpportunity[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  return asArray(value)
    .map((item) => asString(item))
    .filter(Boolean);
}

function asEvidenceReferences(value: unknown): EvidenceQuoteReference[] {
  return asArray(value)
    .filter(isRecord)
    .map((item) => ({
      quote: asString(item.quote),
      rawDocumentId: asString(item.rawDocumentId) || undefined,
      sourceId: asString(item.sourceId) || undefined,
      url: asString(item.url) || undefined,
      domain: asString(item.domain) || undefined,
    }))
    .filter((item) => Boolean(item.quote));
}

function evidenceInputsFor(item: {
  evidenceQuotes?: string[];
  evidenceReferences?: GlmEvidenceReference[];
}): EvidenceQuoteInput[] {
  const references = asEvidenceReferences(item.evidenceReferences);
  return references.length > 0
    ? references
    : asStringArray(item.evidenceQuotes);
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampScore(value: unknown, fallback: number) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value, fallback))));
}

function normalizeFrequency(value: unknown): PainPoint["frequency"] {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "medium";
}

function normalizeContentType(value: unknown): ContentSignal["contentType"] {
  return value === "exposure" ||
    value === "growth" ||
    value === "save" ||
    value === "conversion" ||
    value === "personal_brand"
    ? value
    : "save";
}

function normalizeReviewStatus(value: unknown): ResearchReviewStatus {
  return value === "approved" ||
    value === "rejected" ||
    value === "needs_review"
    ? value
    : "needs_review";
}

function normalizeExtraction(value: unknown): GlmStructuredExtraction {
  const data = isRecord(value) ? value : {};

  return {
    competitors: asArray(data.competitors).filter(isRecord),
    productSignals: asArray(data.productSignals).filter(isRecord),
    painPoints: asArray(data.painPoints).filter(isRecord),
    contentSignals: asArray(data.contentSignals).filter(isRecord),
    opportunities: asArray(data.opportunities).filter(isRecord),
  };
}

export function parseGlmStructuredExtraction(
  content: string,
): GlmStructuredExtraction {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const startIndex = withoutFence.indexOf("{");
  const endIndex = withoutFence.lastIndexOf("}");
  const jsonText =
    startIndex >= 0 && endIndex >= startIndex
      ? withoutFence.slice(startIndex, endIndex + 1)
      : withoutFence;

  try {
    return normalizeExtraction(JSON.parse(jsonText));
  } catch {
    throw new Error(
      "OpenAI-compatible provider 结构化抽取没有返回可解析 JSON。",
    );
  }
}

export const extractionBatchDefaults: {
  maxDocsPerBatch: number;
  maxCharsPerBatch: number;
  maxDocChars: number;
  maxTotalDocs: number;
} = {
  maxDocsPerBatch: 12,
  maxCharsPerBatch: 36_000,
  maxDocChars: 4_000,
  maxTotalDocs: 36,
};

export type ExtractionBatchOptions = Partial<typeof extractionBatchDefaults>;

/**
 * 分批计划：高可信来源优先进入抽取（同 validator 的可确认口径），
 * 再按每批文档数 + 字符预算切批，整体受 maxTotalDocs 成本上限约束。
 */
export function planExtractionBatches(
  rawDocuments: RawDocument[],
  options: ExtractionBatchOptions = {},
): RawDocument[][] {
  const { maxDocsPerBatch, maxCharsPerBatch, maxDocChars, maxTotalDocs } = {
    ...extractionBatchDefaults,
    ...options,
  };
  const ordered = rawDocuments
    .filter(canConfirmWithSource)
    .map((document, index) => ({ document, index }))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.document)
    .slice(0, maxTotalDocs);
  const batches: RawDocument[][] = [];
  let current: RawDocument[] = [];
  let currentChars = 0;

  for (const document of ordered) {
    const docChars = Math.min(document.extractedText.length, maxDocChars);

    if (
      current.length > 0 &&
      (current.length >= maxDocsPerBatch ||
        currentChars + docChars > maxCharsPerBatch)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(document);
    currentChars += docChars;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

function createExtractionInput(
  dataset: ResearchWorkflowResult,
  documents?: RawDocument[],
  maxDocChars = extractionBatchDefaults.maxDocChars,
) {
  const project = dataset.research_projects[0];

  if (!project) {
    throw new Error(
      "Cannot extract structured data without a research project.",
    );
  }

  const selected =
    documents ??
    dataset.raw_documents.slice(0, extractionBatchDefaults.maxDocsPerBatch);

  return {
    project,
    crawlMode: dataset.crawl_plans[0]?.mode ?? "mock",
    rawDocuments: selected.map((document) => ({
      id: document.id,
      sourceId: document.sourceId,
      url: document.url,
      title: document.title,
      contentType: document.contentType,
      excerpt: document.excerpt,
      text: document.extractedText.slice(0, maxDocChars),
      databaseTargets: document.databaseTargets,
      sourceQuality: document.sourceQuality,
    })),
  };
}

type ExtractionMessageOptions = {
  documents?: RawDocument[];
  batchIndex?: number;
  batchCount?: number;
  maxDocChars?: number;
  /** 上一次 run 的结论摘要；只用于对比提示，不得作为证据来源。 */
  historicalContext?: string[];
};

export function createGlmStructuredExtractionMessages(
  dataset: ResearchWorkflowResult,
  options: ExtractionMessageOptions = {},
) {
  const batchNote =
    options.batchCount && options.batchCount > 1
      ? `这是全部公开采集资料的第 ${(options.batchIndex ?? 0) + 1}/${options.batchCount} 批 raw documents；只基于本批文档抽取，不要推测其他批次内容。`
      : "";
  const historicalContext = options.historicalContext ?? [];
  const historicalNote =
    historicalContext.length > 0
      ? [
          "历史研究上下文（上一次 run 的结构化结论摘要，仅用于对比与延续性判断）：",
          ...historicalContext.map((line) => `- ${line}`),
          "历史上下文约束：不得把历史内容当成本次采集事实，evidenceQuotes 仍只能来自本次 rawDocuments；如与历史结论有明显变化，可在 summary / reviewNote 中说明变化。",
        ].join("\n")
      : "";

  return [
    {
      role: "system" as const,
      content:
        "你是 Agent Factory 的行业研究结构化抽取节点。只输出严格 JSON，不要输出 Markdown，不要解释推理过程。",
    },
    {
      role: "user" as const,
      content: [
        "请基于公开采集 raw documents 抽取电商竞品研究结构化数据。",
        ...(batchNote ? [batchNote] : []),
        ...(historicalNote ? [historicalNote] : []),
        "",
        "只输出这个 JSON 结构：",
        JSON.stringify(
          {
            competitors: [
              {
                name: "string",
                channel: "string",
                positioning: "string",
                websiteStructure: ["string"],
                collectionSignals: ["string"],
                evidenceReferences: [
                  {
                    rawDocumentId: "string",
                    sourceId: "string",
                    url: "string",
                    quote: "string",
                  },
                ],
              },
            ],
            productSignals: [
              {
                competitorName: "string",
                category: "string",
                signal: "string",
                tags: ["string"],
                evidenceReferences: [
                  { rawDocumentId: "string", quote: "string" },
                ],
              },
            ],
            painPoints: [
              {
                theme: "string",
                userNeed: "string",
                frequency: "low|medium|high",
                evidenceReferences: [
                  { rawDocumentId: "string", quote: "string" },
                ],
              },
            ],
            contentSignals: [
              {
                platform: "string",
                topic: "string",
                contentType: "exposure|growth|save|conversion|personal_brand",
                whyItWorks: "string",
                evidenceReferences: [
                  { rawDocumentId: "string", quote: "string" },
                ],
              },
            ],
            opportunities: [
              {
                title: "string",
                summary: "string",
                demandScore: 0,
                competitionScore: 0,
                contentGapScore: 0,
                businessValueScore: 0,
                evidenceQualityScore: 0,
                reviewStatus: "approved|needs_review|rejected",
                reviewNote: "string",
                evidenceReferences: [
                  { rawDocumentId: "string", quote: "string" },
                ],
              },
            ],
          },
          null,
          2,
        ),
        "",
        "约束：",
        "- 只使用 rawDocuments 中能看到的信息。",
        "- 证据不足时 reviewStatus 用 needs_review。",
        "- 不要编造价格、销量、私人信息或登录后数据。",
        "- evidenceReferences 必须逐条提供 rawDocumentId 与该文档里的短句或摘要片段 quote；不要只给无来源绑定的通用短句。",
        "- quote 必须是 rawDocument.extractedText 中可逐字搜索到的连续原文，不得改写、翻译、拼接或概括。",
        "- 需要标记 approved 时，name/channel/positioning 或 title/summary 的核心词必须直接出现在 quote 中；优先让结论贴近原文措辞，不要先扩写再找证据。",
        "- reviewStatus=approved 表示这条措辞克制的候选结论已被引用完整支持，不表示市场规模、商业价值或机会已验证；若 title/summary 只陈述评论里直接出现的具体场景，可以 approved，同时在 reviewNote 说明商业验证仍待完成。",
        "- 机会 title/summary 不得加入 quote 中没有的产品形态、目标客群、市场缺口、竞争判断或行动建议；把这些未证实推断放进 reviewNote，并保持 needs_review。",
        "- 用户痛点、需求和机会若使用 Amazon 买家证据，quote 必须连同 `Customer review excerpt:` 前缀一起逐字引用，以证明它是直接评论而非商品宣传。",
        "- 宁可只输出 2-3 个证据完整的关键结论，也不要用弱引用凑数量。",
        "- 同一 quote 若可能出现在多个文档，必须用 rawDocumentId 唯一绑定；不能确定时将 reviewStatus 设为 needs_review。",
        "- rawDocuments 已经过 sourceQuality 过滤；仍要优先使用 acceptedForReport=true 且 sourceType 为 official_site / product_page / collection_page / blog / content_api 的证据。",
        "- 如果文档中有产品系列、价格、定位、购买路径、内容主题或明显未覆盖场景，请尽量抽取 1-3 个机会；没有直接需求证据时 reviewStatus 必须是 needs_review。",
        "- 机会必须解释为“可进一步验证的候选切入点”，不要写成已经被市场验证的结论。",
        "",
        JSON.stringify(
          createExtractionInput(
            dataset,
            options.documents,
            options.maxDocChars,
          ),
          null,
          2,
        ),
      ].join("\n"),
    },
  ];
}

async function requestStructuredExtraction({
  messages,
  env,
  fetcher,
}: {
  messages: ReturnType<typeof createGlmStructuredExtractionMessages>;
  env: GlmRuntimeEnv;
  fetcher?: GlmFetch;
}) {
  const response = await callDeepSeekChatCompletion({
    env,
    fetcher,
    messages,
    temperature: 0.1,
    maxTokens: 6000,
    responseFormat: "json_object",
    timeoutMs: 120_000,
  });

  try {
    return parseGlmStructuredExtraction(response.content);
  } catch {
    const retryResponse = await callDeepSeekChatCompletion({
      env,
      fetcher,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: response.content.slice(0, 4000),
        },
        {
          role: "user",
          content:
            "上一次输出不是可解析 JSON。请只输出一个合法 JSON object，键名必须是 competitors、productSignals、painPoints、contentSignals、opportunities；不要输出 Markdown、解释、注释或多余文本。",
        },
      ],
      temperature: 0,
      maxTokens: 6000,
      responseFormat: "json_object",
      timeoutMs: 120_000,
    });

    return parseGlmStructuredExtraction(retryResponse.content);
  }
}

function normalizeKey(...parts: Array<string | undefined>) {
  return parts
    .map((part) => (part ?? "").toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

function unionStrings(a?: string[], b?: string[]) {
  return [
    ...new Set(
      [...(a ?? []), ...(b ?? [])].map((item) => item.trim()).filter(Boolean),
    ),
  ];
}

function unionEvidenceReferences(
  a?: GlmEvidenceReference[],
  b?: GlmEvidenceReference[],
) {
  const byKey = new Map<string, GlmEvidenceReference>();

  for (const reference of [...(a ?? []), ...(b ?? [])]) {
    const quote = asString(reference.quote);
    if (!quote) continue;
    const normalized = {
      quote,
      rawDocumentId: asString(reference.rawDocumentId) || undefined,
      sourceId: asString(reference.sourceId) || undefined,
      url: asString(reference.url) || undefined,
      domain: asString(reference.domain) || undefined,
    } satisfies GlmEvidenceReference;
    const key = [
      normalized.quote.toLowerCase(),
      normalized.rawDocumentId,
      normalized.sourceId,
      normalized.url,
      normalized.domain,
    ].join("|");
    byKey.set(key, normalized);
  }

  return [...byKey.values()];
}

function preferLonger(a?: string, b?: string) {
  const left = a?.trim() ?? "";
  const right = b?.trim() ?? "";
  return right.length > left.length ? right : left;
}

const frequencyRank = { low: 0, medium: 1, high: 2 } as const;

function mergeInto<T>(
  map: Map<string, T>,
  key: string,
  item: T,
  merge: (existing: T, incoming: T) => T,
) {
  const existing = map.get(key);
  map.set(key, existing ? merge(existing, item) : item);
}

/**
 * 多批抽取结果合并：竞品按名称、产品信号按(竞品+信号)、痛点按主题、
 * 内容信号按(平台+话题)、机会按标题去重；证据 quotes 取并集，
 * 文本字段保留更充实的一侧。
 */
export function mergeGlmStructuredExtractions(
  extractions: GlmStructuredExtraction[],
): GlmStructuredExtraction {
  const competitors = new Map<string, GlmExtractedCompetitor>();
  const productSignals = new Map<string, GlmExtractedProductSignal>();
  const painPoints = new Map<string, GlmExtractedPainPoint>();
  const contentSignals = new Map<string, GlmExtractedContentSignal>();
  const opportunities = new Map<string, GlmExtractedOpportunity>();

  for (const extraction of extractions) {
    for (const item of extraction.competitors) {
      mergeInto(
        competitors,
        normalizeKey(item.name),
        item,
        (existing, incoming) => ({
          ...existing,
          channel: preferLonger(existing.channel, incoming.channel),
          positioning: preferLonger(existing.positioning, incoming.positioning),
          websiteStructure: unionStrings(
            existing.websiteStructure,
            incoming.websiteStructure,
          ),
          collectionSignals: unionStrings(
            existing.collectionSignals,
            incoming.collectionSignals,
          ),
          evidenceQuotes: unionStrings(
            existing.evidenceQuotes,
            incoming.evidenceQuotes,
          ),
          evidenceReferences: unionEvidenceReferences(
            existing.evidenceReferences,
            incoming.evidenceReferences,
          ),
        }),
      );
    }

    for (const item of extraction.productSignals) {
      mergeInto(
        productSignals,
        normalizeKey(item.competitorName, item.signal),
        item,
        (existing, incoming) => ({
          ...existing,
          tags: unionStrings(existing.tags, incoming.tags),
          evidenceQuotes: unionStrings(
            existing.evidenceQuotes,
            incoming.evidenceQuotes,
          ),
          evidenceReferences: unionEvidenceReferences(
            existing.evidenceReferences,
            incoming.evidenceReferences,
          ),
        }),
      );
    }

    for (const item of extraction.painPoints) {
      mergeInto(
        painPoints,
        normalizeKey(item.theme),
        item,
        (existing, incoming) => ({
          ...existing,
          userNeed: preferLonger(existing.userNeed, incoming.userNeed),
          frequency:
            (frequencyRank[incoming.frequency ?? "medium"] ?? 1) >
            (frequencyRank[existing.frequency ?? "medium"] ?? 1)
              ? incoming.frequency
              : existing.frequency,
          evidenceQuotes: unionStrings(
            existing.evidenceQuotes,
            incoming.evidenceQuotes,
          ),
          evidenceReferences: unionEvidenceReferences(
            existing.evidenceReferences,
            incoming.evidenceReferences,
          ),
        }),
      );
    }

    for (const item of extraction.contentSignals) {
      mergeInto(
        contentSignals,
        normalizeKey(item.platform, item.topic),
        item,
        (existing, incoming) => ({
          ...existing,
          whyItWorks: preferLonger(existing.whyItWorks, incoming.whyItWorks),
          evidenceQuotes: unionStrings(
            existing.evidenceQuotes,
            incoming.evidenceQuotes,
          ),
          evidenceReferences: unionEvidenceReferences(
            existing.evidenceReferences,
            incoming.evidenceReferences,
          ),
        }),
      );
    }

    for (const item of extraction.opportunities) {
      mergeInto(
        opportunities,
        normalizeKey(item.title),
        item,
        (existing, incoming) => ({
          ...existing,
          summary: preferLonger(existing.summary, incoming.summary),
          reviewNote: preferLonger(existing.reviewNote, incoming.reviewNote),
          evidenceQuotes: unionStrings(
            existing.evidenceQuotes,
            incoming.evidenceQuotes,
          ),
          evidenceReferences: unionEvidenceReferences(
            existing.evidenceReferences,
            incoming.evidenceReferences,
          ),
        }),
      );
    }
  }

  return {
    competitors: [...competitors.values()],
    productSignals: [...productSignals.values()],
    painPoints: [...painPoints.values()],
    contentSignals: [...contentSignals.values()],
    opportunities: [...opportunities.values()],
  };
}

export type BatchedExtractionResult = {
  extraction: GlmStructuredExtraction;
  batchCount: number;
  failedBatchCount: number;
  failedBatchDocumentIds: string[];
  failureMessages: string[];
};

/**
 * 分批 map-reduce 抽取：逐批请求 provider，单批失败只降级该批文档，
 * 全部批次失败才抛错（保持外层 workflow 的整体降级行为不变）。
 */
export async function generateGlmStructuredExtractionBatched({
  dataset,
  env,
  fetcher,
  batchOptions,
  historicalContext,
  onBatch,
}: {
  dataset: ResearchWorkflowResult;
  env: GlmRuntimeEnv;
  fetcher?: GlmFetch;
  batchOptions?: ExtractionBatchOptions;
  /** 上一次 run 的结论摘要；只用于对比提示，不得作为证据来源。 */
  historicalContext?: string[];
  onBatch?: (event: {
    batchIndex: number;
    batchCount: number;
    status: "done" | "failed";
    documentIds: string[];
  }) => void;
}): Promise<BatchedExtractionResult> {
  const batches = planExtractionBatches(dataset.raw_documents, batchOptions);
  const maxDocChars =
    batchOptions?.maxDocChars ?? extractionBatchDefaults.maxDocChars;
  const extractions: GlmStructuredExtraction[] = [];
  const failedBatchDocumentIds: string[] = [];
  const failureMessages: string[] = [];

  for (const [batchIndex, documents] of batches.entries()) {
    const messages = createGlmStructuredExtractionMessages(dataset, {
      documents,
      batchIndex,
      batchCount: batches.length,
      maxDocChars,
      historicalContext,
    });

    try {
      extractions.push(
        await requestStructuredExtraction({ messages, env, fetcher }),
      );
      onBatch?.({
        batchIndex,
        batchCount: batches.length,
        status: "done",
        documentIds: documents.map((document) => document.id),
      });
    } catch (error) {
      failureMessages.push(
        error instanceof Error ? error.message : String(error),
      );
      failedBatchDocumentIds.push(...documents.map((document) => document.id));
      onBatch?.({
        batchIndex,
        batchCount: batches.length,
        status: "failed",
        documentIds: documents.map((document) => document.id),
      });
    }
  }

  if (batches.length > 0 && extractions.length === 0) {
    throw new Error(
      `OpenAI-compatible provider 结构化抽取全部批次失败（${batches.length} 批）：${failureMessages[0] ?? "unknown"}`,
    );
  }

  return {
    extraction: mergeGlmStructuredExtractions(extractions),
    batchCount: batches.length,
    failedBatchCount: batches.length - extractions.length,
    failedBatchDocumentIds,
    failureMessages,
  };
}

/** 兼容入口：保留原单结果签名，内部走分批 map-reduce。 */
export async function generateGlmStructuredExtraction({
  dataset,
  env,
  fetcher,
}: {
  dataset: ResearchWorkflowResult;
  env: GlmRuntimeEnv;
  fetcher?: GlmFetch;
}) {
  const batched = await generateGlmStructuredExtractionBatched({
    dataset,
    env,
    fetcher,
  });

  return batched.extraction;
}

function createEvidenceBuilder(result: ResearchWorkflowResult) {
  let index = 0;
  const project = result.research_projects[0];

  if (!project) {
    throw new Error("Cannot build GLM extraction evidence without project.");
  }

  return (
    validation: ReturnType<typeof validateEvidenceQuotes>,
    note: string,
  ) => {
    return validation.matchedQuotes
      .filter((quote) => quote.quoteMatched && quote.rawDocumentId)
      .map((quote) => {
        index += 1;
        const rawDocument = result.raw_documents.find(
          (document) => document.id === quote.rawDocumentId,
        );
        const sourceId =
          rawDocument?.sourceId ??
          result.research_sources[0]?.id ??
          "source-unknown";

        return {
          id: `evidence-deepseek-${index}`,
          projectId: project.id,
          sourceId,
          rawDocumentId: rawDocument?.id,
          quote: quote.quote.slice(0, 500),
          note,
          claimRole: quote.claimRole,
          sourceRole: quote.sourceRole,
          validation: {
            quoteMatched: quote.quoteMatched,
            sourceAccepted: quote.sourceAccepted,
            matchedRawDocumentId: quote.matchedRawDocumentId,
            failureReason: quote.failureReason,
            claimSupportComplete: validation.claimSupportComplete,
            claimQuoteCount: validation.matchedQuotes.length,
            confirmedQuoteCount: validation.confirmedEvidenceCount,
            roleAuthorized: quote.roleAuthorized,
            sourceRole: quote.sourceRole,
            claimRole: quote.claimRole,
            roleFailureReason: quote.roleFailureReason,
          },
        } satisfies Evidence;
      });
  };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function applyGlmStructuredExtraction(
  result: ResearchWorkflowResult,
  extraction: GlmStructuredExtraction,
): ResearchWorkflowResult {
  const project = result.research_projects[0];

  if (!project) {
    throw new Error("Cannot apply GLM extraction without project.");
  }

  if (
    extraction.competitors.length === 0 &&
    extraction.productSignals.length === 0 &&
    extraction.painPoints.length === 0 &&
    extraction.contentSignals.length === 0 &&
    extraction.opportunities.length === 0
  ) {
    return result;
  }

  const buildEvidence = createEvidenceBuilder(result);
  const roleAwareEvidence = result.raw_documents.some(
    (document) => document.industrySourceRole,
  );
  const claimRole = <T extends Evidence["claimRole"]>(role: T) =>
    roleAwareEvidence ? role : undefined;
  const evidence: Evidence[] = [];
  const evidenceIdsFor = (
    validation: ReturnType<typeof validateEvidenceQuotes>,
    note: string,
  ) => {
    const items = buildEvidence(validation, note);
    evidence.push(...items);
    return items.map((item) => item.id);
  };

  const competitors: Competitor[] = extraction.competitors.flatMap(
    (competitor, index) => {
      const validation = validateEvidenceQuotes(
        evidenceInputsFor(competitor),
        result.raw_documents,
        {
          claimTexts: [
            asString(competitor.name),
            asString(competitor.channel),
            asString(competitor.positioning),
            ...asStringArray(competitor.websiteStructure),
            ...asStringArray(competitor.collectionSignals),
          ],
          requiredClaimTexts: [
            asString(competitor.name),
            asString(competitor.channel),
            asString(competitor.positioning),
          ],
          claimRole: claimRole("brand_positioning_product"),
        },
      );

      if (validation.status === "rejected") {
        return [];
      }

      return [
        {
          id: `deepseek-competitor-${index + 1}`,
          projectId: project.id,
          name: asString(
            competitor.name,
            `${project.category} 竞品 ${index + 1}`,
          ),
          channel: asString(competitor.channel, project.market),
          websiteStructure: asStringArray(competitor.websiteStructure),
          collectionSignals: asStringArray(competitor.collectionSignals),
          positioning: asString(
            competitor.positioning,
            "OpenAI-compatible provider 从公开资料抽取，等待人工复核。",
          ),
          evidenceIds: evidenceIdsFor(
            validation,
            `OpenAI-compatible provider 竞品抽取证据。${validationNote(validation)}`,
          ),
        } satisfies Competitor,
      ];
    },
  );
  const fallbackCompetitor =
    competitors.length === 1 ? competitors[0] : undefined;
  const competitorIdsByName = new Map(
    competitors.map((competitor) => [
      competitor.name.toLowerCase(),
      competitor.id,
    ]),
  );
  const productSignals: ProductSignal[] = extraction.productSignals.flatMap(
    (signal, index) => {
      const competitorName = asString(signal.competitorName).toLowerCase();
      const competitorId =
        competitorIdsByName.get(competitorName) ??
        (competitorName ? undefined : fallbackCompetitor?.id);
      const validation = validateEvidenceQuotes(
        evidenceInputsFor(signal),
        result.raw_documents,
        {
          claimTexts: [
            asString(signal.category),
            asString(signal.signal),
            ...asStringArray(signal.tags),
          ],
          requiredClaimTexts: [
            asString(signal.category),
            asString(signal.signal),
          ],
          claimRole: claimRole("brand_positioning_product"),
        },
      );

      if (validation.status === "rejected" || !competitorId) {
        return [];
      }

      return [
        {
          id: `deepseek-product-signal-${index + 1}`,
          projectId: project.id,
          competitorId,
          category: asString(signal.category, project.category),
          signal: asString(
            signal.signal,
            "OpenAI-compatible provider 抽取到产品信号，等待人工复核。",
          ),
          tags: asStringArray(signal.tags),
          evidenceIds: evidenceIdsFor(
            validation,
            `OpenAI-compatible provider 产品信号抽取证据。${validationNote(validation)}`,
          ),
        } satisfies ProductSignal,
      ];
    },
  );
  const painPoints: PainPoint[] = extraction.painPoints.flatMap(
    (point, index) => {
      const validation = validateEvidenceQuotes(
        evidenceInputsFor(point),
        result.raw_documents,
        {
          claimTexts: [asString(point.theme), asString(point.userNeed)],
          requiredClaimTexts: [asString(point.theme), asString(point.userNeed)],
          requireDemandEvidence: true,
          claimRole: claimRole("consumer_need"),
        },
      );

      if (validation.status === "rejected") {
        return [];
      }

      return [
        {
          id: `deepseek-pain-point-${index + 1}`,
          projectId: project.id,
          theme: asString(point.theme, `用户痛点 ${index + 1}`),
          userNeed: asString(point.userNeed, "需要人工补充用户需求解释。"),
          frequency: normalizeFrequency(point.frequency),
          evidenceIds: evidenceIdsFor(
            validation,
            `OpenAI-compatible provider 用户痛点抽取证据。${validationNote(validation)}`,
          ),
        } satisfies PainPoint,
      ];
    },
  );
  const contentSignals: ContentSignal[] = extraction.contentSignals.flatMap(
    (signal, index) => {
      const validation = validateEvidenceQuotes(
        evidenceInputsFor(signal),
        result.raw_documents,
        {
          claimTexts: [asString(signal.topic), asString(signal.whyItWorks)],
          requiredClaimTexts: [
            asString(signal.topic),
            asString(signal.whyItWorks),
          ],
          claimRole: claimRole("content_traffic_trend"),
        },
      );

      if (validation.status === "rejected") {
        return [];
      }

      return [
        {
          id: `deepseek-content-signal-${index + 1}`,
          projectId: project.id,
          platform: asString(signal.platform, "Public Web"),
          topic: asString(signal.topic, `内容信号 ${index + 1}`),
          contentType: normalizeContentType(signal.contentType),
          whyItWorks: asString(signal.whyItWorks, "等待人工复核内容价值。"),
          evidenceIds: evidenceIdsFor(
            validation,
            `OpenAI-compatible provider 内容信号抽取证据。${validationNote(validation)}`,
          ),
        } satisfies ContentSignal,
      ];
    },
  );
  const opportunities: Opportunity[] = extraction.opportunities.flatMap(
    (opportunity, index) => {
      const validation = validateEvidenceQuotes(
        evidenceInputsFor(opportunity),
        result.raw_documents,
        {
          claimTexts: [
            asString(opportunity.title),
            asString(opportunity.summary),
            asString(opportunity.reviewNote),
          ],
          requiredClaimTexts: [
            asString(opportunity.title),
            asString(opportunity.summary),
          ],
          requireDemandEvidence: true,
          claimRole: claimRole("consumer_need"),
        },
      );

      if (validation.status === "rejected") {
        return [];
      }

      const reviewStatus = mergeReviewStatus(
        normalizeReviewStatus(opportunity.reviewStatus),
        validation.status,
      );
      const evidenceQualityScore =
        validation.confirmedEvidenceCount > 0
          ? clampScore(opportunity.evidenceQualityScore, 50)
          : 25;

      return [
        {
          id: `deepseek-opportunity-${index + 1}`,
          projectId: project.id,
          title: asString(opportunity.title, `机会 ${index + 1}`),
          summary: asString(opportunity.summary, "等待人工补充机会说明。"),
          demandScore: clampScore(opportunity.demandScore, 60),
          competitionScore: clampScore(opportunity.competitionScore, 50),
          contentGapScore: clampScore(opportunity.contentGapScore, 60),
          businessValueScore: clampScore(opportunity.businessValueScore, 60),
          evidenceQualityScore,
          totalScore: Math.round(
            (clampScore(opportunity.demandScore, 60) +
              clampScore(opportunity.competitionScore, 50) +
              clampScore(opportunity.contentGapScore, 60) +
              clampScore(opportunity.businessValueScore, 60) +
              evidenceQualityScore) /
              5,
          ),
          reviewStatus,
          reviewNote: [
            asString(
              opportunity.reviewNote,
              "OpenAI-compatible provider 抽取，需人工复核。",
            ),
            validationNote(validation),
            "为什么值得做：候选机会来自公开 raw documents 的可匹配证据。",
            "为什么还不能直接下结论：仍需人工复核价格、销量、评论和供应链可行性。",
            "下一步验证动作：补充竞品产品页、评论和价格来源后再确认。",
          ].join(" "),
          evidenceIds: evidenceIdsFor(
            validation,
            `OpenAI-compatible provider 机会评分抽取证据。${validationNote(validation)}`,
          ),
        } satisfies Opportunity,
      ];
    },
  );
  const allEvidence = [...result.evidence, ...evidence];
  const evidenceById = new Map(allEvidence.map((item) => [item.id, item]));
  const rawDocumentById = new Map(
    result.raw_documents.map((document) => [document.id, document]),
  );
  const evidenceRecordsFor = (evidenceIds: string[]) =>
    evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId))
      .filter((item): item is Evidence => Boolean(item));
  const sourceIdsFor = (evidenceIds: string[]) =>
    uniqueValues(evidenceRecordsFor(evidenceIds).map((item) => item.sourceId));
  const rawDocumentsFor = (evidenceIds: string[]) =>
    evidenceRecordsFor(evidenceIds)
      .map((item) =>
        item.rawDocumentId
          ? rawDocumentById.get(item.rawDocumentId)
          : undefined,
      )
      .filter((item): item is RawDocument => Boolean(item));
  const uniquelyBoundUrlFor = (evidenceIds: string[]) => {
    const documents = rawDocumentsFor(evidenceIds);
    const hosts = uniqueValues(
      documents.map((document) => {
        try {
          return new URL(document.url).hostname.toLowerCase();
        } catch {
          return document.url;
        }
      }),
    );

    return hosts.length === 1 ? documents[0]?.url : undefined;
  };
  const competitorDatabase: CompetitorDatabaseEntry[] = competitors.map(
    (competitor) => ({
      id: `competitor-db-${competitor.id}`,
      projectId: project.id,
      competitorId: competitor.id,
      name: competitor.name,
      market: project.market,
      channel: competitor.channel,
      positioning: competitor.positioning,
      sourceIds: sourceIdsFor(competitor.evidenceIds),
      evidenceIds: competitor.evidenceIds,
    }),
  );
  const websiteStructureDatabase: WebsiteStructureDatabaseEntry[] =
    competitors.flatMap((competitor) => {
      const sourceIds = sourceIdsFor(competitor.evidenceIds);
      const url = uniquelyBoundUrlFor(competitor.evidenceIds);

      if (!url || sourceIds.length === 0) {
        return [];
      }

      const sourceIdSet = new Set(sourceIds);
      const boundContentSignals = contentSignals
        .filter((signal) =>
          sourceIdsFor(signal.evidenceIds).some((sourceId) =>
            sourceIdSet.has(sourceId),
          ),
        )
        .map((signal) => signal.topic);

      return [
        {
          id: `website-structure-db-${competitor.id}`,
          projectId: project.id,
          competitorId: competitor.id,
          url,
          sections: competitor.websiteStructure,
          commerceSignals: competitor.collectionSignals,
          contentSignals: boundContentSignals,
          sourceIds,
        } satisfies WebsiteStructureDatabaseEntry,
      ];
    });
  const productDatabase: ProductDatabaseEntry[] = productSignals.map(
    (signal, index) => ({
      id: `product-db-${signal.id}`,
      projectId: project.id,
      competitorId: signal.competitorId,
      name: `${project.category} 信号 ${index + 1}`,
      category: signal.category,
      priceSignal: "公开资料未提供价格，需人工复核。",
      tags: signal.tags,
      evidenceIds: signal.evidenceIds,
    }),
  );
  const keywordSeeds: Array<{
    keyword: string;
    intent: KeywordDatabaseEntry["intent"];
    evidenceIds: string[];
  }> = [
    ...productSignals.flatMap((signal) =>
      signal.tags.map((keyword) => ({
        keyword,
        intent: "purchase" as const,
        evidenceIds: signal.evidenceIds,
      })),
    ),
    ...painPoints.map((point) => ({
      keyword: point.theme,
      intent: "pain_point" as const,
      evidenceIds: point.evidenceIds,
    })),
    ...contentSignals.map((signal) => ({
      keyword: signal.topic,
      intent: "research" as const,
      evidenceIds: signal.evidenceIds,
    })),
  ];
  const keywordByValue = new Map<
    string,
    Omit<KeywordDatabaseEntry, "id" | "projectId" | "source">
  >();

  for (const seed of keywordSeeds) {
    const key = seed.keyword.toLowerCase().trim();
    const existing = keywordByValue.get(key);
    keywordByValue.set(key, {
      keyword: existing?.keyword ?? seed.keyword,
      intent: existing?.intent ?? seed.intent,
      evidenceIds: uniqueValues([
        ...(existing?.evidenceIds ?? []),
        ...seed.evidenceIds,
      ]),
    });
  }

  const keywordDatabase: KeywordDatabaseEntry[] = [
    ...keywordByValue.values(),
  ].map((item, index) => ({
    id: `keyword-db-deepseek-${index + 1}`,
    projectId: project.id,
    source: "openai_compatible_structured_extraction",
    ...item,
  }));
  const painPointDatabase: PainPointDatabaseEntry[] = painPoints.map(
    (point) => ({
      id: `pain-point-db-${point.id}`,
      projectId: project.id,
      theme: point.theme,
      userNeed: point.userNeed,
      frequency: point.frequency,
      sourceIds: sourceIdsFor(point.evidenceIds),
      evidenceIds: point.evidenceIds,
    }),
  );
  const contentDatabase: ContentDatabaseEntry[] = contentSignals.map(
    (signal) => ({
      id: `content-db-${signal.id}`,
      projectId: project.id,
      platform: signal.platform,
      topic: signal.topic,
      contentType: signal.contentType,
      whyItWorks: signal.whyItWorks,
      evidenceIds: signal.evidenceIds,
    }),
  );
  const opportunityDatabase: OpportunityDatabaseEntry[] = opportunities.map(
    (opportunity) => ({
      id: `opportunity-db-${opportunity.id}`,
      projectId: project.id,
      opportunityId: opportunity.id,
      title: opportunity.title,
      summary: opportunity.summary,
      totalScore: opportunity.totalScore,
      reviewStatus: opportunity.reviewStatus,
      evidenceIds: opportunity.evidenceIds,
    }),
  );
  const weeklyIntelligenceReports: WeeklyIntelligenceReportEntry[] = [
    {
      id: "weekly-intel-deepseek-1",
      projectId: project.id,
      weekOf: "2026-06-01",
      title: `${project.category} 公开资料结构化周报种子`,
      summary:
        "基于 public_web raw documents 的 OpenAI-compatible provider 结构化抽取结果。",
      newSignals: [
        ...productSignals.slice(0, 3).map((signal) => signal.signal),
        ...contentSignals.slice(0, 2).map((signal) => signal.topic),
      ],
      watchList: [
        ...competitors.slice(0, 3).map((competitor) => competitor.name),
        ...opportunities.slice(0, 3).map((opportunity) => opportunity.title),
      ],
      evidenceIds: evidence.slice(0, 5).map((item) => item.id),
    },
  ];

  return {
    ...result,
    evidence: [...result.evidence, ...evidence],
    competitors: competitors.length > 0 ? competitors : result.competitors,
    product_signals:
      productSignals.length > 0 ? productSignals : result.product_signals,
    pain_points: painPoints.length > 0 ? painPoints : result.pain_points,
    content_signals:
      contentSignals.length > 0 ? contentSignals : result.content_signals,
    opportunities:
      opportunities.length > 0 ? opportunities : result.opportunities,
    competitor_database:
      competitorDatabase.length > 0
        ? competitorDatabase
        : result.competitor_database,
    website_structure_database:
      competitors.length > 0
        ? websiteStructureDatabase
        : result.website_structure_database,
    product_database:
      productDatabase.length > 0 ? productDatabase : result.product_database,
    keyword_database:
      keywordDatabase.length > 0 ? keywordDatabase : result.keyword_database,
    pain_point_database:
      painPointDatabase.length > 0
        ? painPointDatabase
        : result.pain_point_database,
    content_database:
      contentDatabase.length > 0 ? contentDatabase : result.content_database,
    opportunity_database:
      opportunityDatabase.length > 0
        ? opportunityDatabase
        : result.opportunity_database,
    weekly_intelligence_reports:
      weeklyIntelligenceReports.length > 0
        ? weeklyIntelligenceReports
        : result.weekly_intelligence_reports,
  };
}
