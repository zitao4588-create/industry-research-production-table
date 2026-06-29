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
  ResearchReviewStatus,
  ResearchWorkflowResult,
  WebsiteStructureDatabaseEntry,
  WeeklyIntelligenceReportEntry,
} from "./types";

type GlmExtractedCompetitor = {
  name?: string;
  channel?: string;
  positioning?: string;
  websiteStructure?: string[];
  collectionSignals?: string[];
  evidenceQuotes?: string[];
};

type GlmExtractedProductSignal = {
  competitorName?: string;
  category?: string;
  signal?: string;
  tags?: string[];
  evidenceQuotes?: string[];
};

type GlmExtractedPainPoint = {
  theme?: string;
  userNeed?: string;
  frequency?: "low" | "medium" | "high";
  evidenceQuotes?: string[];
};

type GlmExtractedContentSignal = {
  platform?: string;
  topic?: string;
  contentType?: ContentSignal["contentType"];
  whyItWorks?: string;
  evidenceQuotes?: string[];
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

function createExtractionInput(dataset: ResearchWorkflowResult) {
  const project = dataset.research_projects[0];

  if (!project) {
    throw new Error(
      "Cannot extract structured data without a research project.",
    );
  }

  return {
    project,
    crawlMode: dataset.crawl_plans[0]?.mode ?? "mock",
    rawDocuments: dataset.raw_documents.slice(0, 12).map((document) => ({
      id: document.id,
      sourceId: document.sourceId,
      url: document.url,
      title: document.title,
      contentType: document.contentType,
      excerpt: document.excerpt,
      text: document.extractedText.slice(0, 4000),
      databaseTargets: document.databaseTargets,
    })),
  };
}

export function createGlmStructuredExtractionMessages(
  dataset: ResearchWorkflowResult,
) {
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
                evidenceQuotes: ["string"],
              },
            ],
            productSignals: [
              {
                competitorName: "string",
                category: "string",
                signal: "string",
                tags: ["string"],
                evidenceQuotes: ["string"],
              },
            ],
            painPoints: [
              {
                theme: "string",
                userNeed: "string",
                frequency: "low|medium|high",
                evidenceQuotes: ["string"],
              },
            ],
            contentSignals: [
              {
                platform: "string",
                topic: "string",
                contentType: "exposure|growth|save|conversion|personal_brand",
                whyItWorks: "string",
                evidenceQuotes: ["string"],
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
                evidenceQuotes: ["string"],
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
        "- evidenceQuotes 必须是 rawDocuments 里的短句或摘要片段。",
        "",
        JSON.stringify(createExtractionInput(dataset), null, 2),
      ].join("\n"),
    },
  ];
}

export async function generateGlmStructuredExtraction({
  dataset,
  env,
  fetcher,
}: {
  dataset: ResearchWorkflowResult;
  env: GlmRuntimeEnv;
  fetcher?: GlmFetch;
}) {
  const messages = createGlmStructuredExtractionMessages(dataset);
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

function createEvidenceBuilder(result: ResearchWorkflowResult) {
  let index = 0;
  const project = result.research_projects[0];
  const fallbackRawDocument = result.raw_documents[0];

  if (!project) {
    throw new Error("Cannot build GLM extraction evidence without project.");
  }

  const findRawDocumentForQuote = (quote: string) => {
    const normalizedQuote = quote.trim().toLowerCase();

    if (!normalizedQuote) {
      return fallbackRawDocument;
    }

    return (
      result.raw_documents.find((document) => {
        const haystack = [
          document.title,
          document.excerpt,
          document.extractedText.slice(0, 8000),
        ]
          .join("\n")
          .toLowerCase();

        return haystack.includes(normalizedQuote);
      }) ?? fallbackRawDocument
    );
  };

  return (quotes: string[], note: string) => {
    const normalizedQuotes =
      quotes.length > 0
        ? quotes
        : [
            fallbackRawDocument?.excerpt ??
              "LLM 抽取结果缺少直接引用，需人工复核。",
          ];

    return normalizedQuotes.map((quote) => {
      index += 1;
      const rawDocument = findRawDocumentForQuote(quote);
      const sourceId =
        rawDocument?.sourceId ??
        result.research_sources[0]?.id ??
        "source-unknown";

      return {
        id: `evidence-deepseek-${index}`,
        projectId: project.id,
        sourceId,
        rawDocumentId: rawDocument?.id,
        quote: quote.slice(0, 500),
        note,
      } satisfies Evidence;
    });
  };
}

function totalOpportunityScore(opportunity: GlmExtractedOpportunity) {
  return Math.round(
    (clampScore(opportunity.demandScore, 60) +
      clampScore(opportunity.competitionScore, 50) +
      clampScore(opportunity.contentGapScore, 60) +
      clampScore(opportunity.businessValueScore, 60) +
      clampScore(opportunity.evidenceQualityScore, 50)) /
      5,
  );
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
  const evidence: Evidence[] = [];
  const evidenceIdsFor = (quotes: string[], note: string) => {
    const items = buildEvidence(quotes, note);
    evidence.push(...items);
    return items.map((item) => item.id);
  };

  const competitors: Competitor[] = extraction.competitors.map(
    (competitor, index) => ({
      id: `deepseek-competitor-${index + 1}`,
      projectId: project.id,
      name: asString(competitor.name, `${project.category} 竞品 ${index + 1}`),
      channel: asString(competitor.channel, project.market),
      websiteStructure: asStringArray(competitor.websiteStructure),
      collectionSignals: asStringArray(competitor.collectionSignals),
      positioning: asString(
        competitor.positioning,
        "OpenAI-compatible provider 从公开资料抽取，等待人工复核。",
      ),
      evidenceIds: evidenceIdsFor(
        asStringArray(competitor.evidenceQuotes),
        "OpenAI-compatible provider 竞品抽取证据。",
      ),
    }),
  );
  const fallbackCompetitor = competitors[0] ?? result.competitors[0];
  const competitorIdsByName = new Map(
    competitors.map((competitor) => [
      competitor.name.toLowerCase(),
      competitor.id,
    ]),
  );
  const productSignals: ProductSignal[] = extraction.productSignals.map(
    (signal, index) => {
      const competitorName = asString(signal.competitorName).toLowerCase();

      return {
        id: `deepseek-product-signal-${index + 1}`,
        projectId: project.id,
        competitorId:
          competitorIdsByName.get(competitorName) ??
          fallbackCompetitor?.id ??
          "deepseek-competitor-1",
        category: asString(signal.category, project.category),
        signal: asString(
          signal.signal,
          "OpenAI-compatible provider 抽取到产品信号，等待人工复核。",
        ),
        tags: asStringArray(signal.tags),
        evidenceIds: evidenceIdsFor(
          asStringArray(signal.evidenceQuotes),
          "OpenAI-compatible provider 产品信号抽取证据。",
        ),
      };
    },
  );
  const painPoints: PainPoint[] = extraction.painPoints.map((point, index) => ({
    id: `deepseek-pain-point-${index + 1}`,
    projectId: project.id,
    theme: asString(point.theme, `用户痛点 ${index + 1}`),
    userNeed: asString(point.userNeed, "需要人工补充用户需求解释。"),
    frequency: normalizeFrequency(point.frequency),
    evidenceIds: evidenceIdsFor(
      asStringArray(point.evidenceQuotes),
      "OpenAI-compatible provider 用户痛点抽取证据。",
    ),
  }));
  const contentSignals: ContentSignal[] = extraction.contentSignals.map(
    (signal, index) => ({
      id: `deepseek-content-signal-${index + 1}`,
      projectId: project.id,
      platform: asString(signal.platform, "Public Web"),
      topic: asString(signal.topic, `内容信号 ${index + 1}`),
      contentType: normalizeContentType(signal.contentType),
      whyItWorks: asString(signal.whyItWorks, "等待人工复核内容价值。"),
      evidenceIds: evidenceIdsFor(
        asStringArray(signal.evidenceQuotes),
        "OpenAI-compatible provider 内容信号抽取证据。",
      ),
    }),
  );
  const opportunities: Opportunity[] = extraction.opportunities.map(
    (opportunity, index) => ({
      id: `deepseek-opportunity-${index + 1}`,
      projectId: project.id,
      title: asString(opportunity.title, `机会 ${index + 1}`),
      summary: asString(opportunity.summary, "等待人工补充机会说明。"),
      demandScore: clampScore(opportunity.demandScore, 60),
      competitionScore: clampScore(opportunity.competitionScore, 50),
      contentGapScore: clampScore(opportunity.contentGapScore, 60),
      businessValueScore: clampScore(opportunity.businessValueScore, 60),
      evidenceQualityScore: clampScore(opportunity.evidenceQualityScore, 50),
      totalScore: totalOpportunityScore(opportunity),
      reviewStatus: normalizeReviewStatus(opportunity.reviewStatus),
      reviewNote: asString(
        opportunity.reviewNote,
        "OpenAI-compatible provider 抽取，需人工复核。",
      ),
      evidenceIds: evidenceIdsFor(
        asStringArray(opportunity.evidenceQuotes),
        "OpenAI-compatible provider 机会评分抽取证据。",
      ),
    }),
  );
  const competitorDatabase: CompetitorDatabaseEntry[] = competitors.map(
    (competitor) => ({
      id: `competitor-db-${competitor.id}`,
      projectId: project.id,
      competitorId: competitor.id,
      name: competitor.name,
      market: project.market,
      channel: competitor.channel,
      positioning: competitor.positioning,
      sourceIds: result.research_sources.map((source) => source.id),
      evidenceIds: competitor.evidenceIds,
    }),
  );
  const websiteStructureDatabase: WebsiteStructureDatabaseEntry[] =
    competitors.map((competitor) => ({
      id: `website-structure-db-${competitor.id}`,
      projectId: project.id,
      competitorId: competitor.id,
      url: result.raw_documents[0]?.url ?? "待补充",
      sections: competitor.websiteStructure,
      commerceSignals: competitor.collectionSignals,
      contentSignals: contentSignals.map((signal) => signal.topic),
      sourceIds: result.research_sources.map((source) => source.id),
    }));
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
  const keywordValues = uniqueValues([
    ...productSignals.flatMap((signal) => signal.tags),
    ...painPoints.map((point) => point.theme),
    ...contentSignals.map((signal) => signal.topic),
  ]);
  const keywordDatabase: KeywordDatabaseEntry[] = keywordValues.map(
    (keyword, index) => ({
      id: `keyword-db-deepseek-${index + 1}`,
      projectId: project.id,
      keyword,
      intent: index % 2 === 0 ? "research" : "purchase",
      source: "openai_compatible_structured_extraction",
      evidenceIds: evidence.slice(0, 3).map((item) => item.id),
    }),
  );
  const painPointDatabase: PainPointDatabaseEntry[] = painPoints.map(
    (point) => ({
      id: `pain-point-db-${point.id}`,
      projectId: project.id,
      theme: point.theme,
      userNeed: point.userNeed,
      frequency: point.frequency,
      sourceIds: result.research_sources.map((source) => source.id),
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
    evidence,
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
      websiteStructureDatabase.length > 0
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
