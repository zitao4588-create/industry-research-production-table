import {
  coerceRunDiffDatabases,
  createBaselineWeeklyIntelligenceReport,
  createWeeklyIntelligenceReportFromDiff,
  diffIndustryResearchDatabases,
  formatRunDiffMarkdownSection,
} from "./run-diff";
import {
  type SourceQualitySummary,
  summarizeSourceQuality,
} from "./source-quality";
import type {
  Evidence,
  IndustryResearchDatabaseName,
  RawDocument,
  ResearchReviewItem,
  ResearchRunCanonicalMode,
  ResearchRunMetadata,
  ResearchSource,
  ResearchWorkflowInput,
  ResearchWorkflowResult,
  ResearchWorkflowStep,
} from "./types";

/**
 * 上一次同项目 run 的引用（T6 周报 diff 用）：
 * - `undefined`：调用方未启用 diff（兼容旧行为）。
 * - `null`：调用方查找过但没有历史 run，本期作为基线留档。
 * - 有值：与该 run 的 databases.json 做差异，产出真实周报条目。
 */
export type IndustryResearchPreviousRunRef = {
  runId: string;
  databases: unknown;
};

export type IndustryResearchDeliveryRunMode =
  | "public_web"
  | "public_web_llm"
  | "llm_only";

export type IndustryResearchDeliveryDatabases = Record<
  IndustryResearchDatabaseName,
  unknown[]
> & {
  evidence: Evidence[];
  research_sources: ResearchSource[];
};

export const industryResearchDeliveryPackageFiles = [
  {
    kind: "input",
    fileName: "input.json",
    contentType: "application/json",
    description:
      "本次研究的原始输入，包含项目、行业、市场、URL 和人工补充信息。",
  },
  {
    kind: "raw_documents",
    fileName: "raw_documents.json",
    contentType: "application/json",
    description:
      "公开采集得到的原始网页/RSS/sitemap 文档和 sourceQuality 评分。",
  },
  {
    kind: "databases",
    fileName: "databases.json",
    contentType: "application/json",
    description: "九类行业研究数据库快照，以及 evidence 和 research_sources。",
  },
  {
    kind: "review_items",
    fileName: "review_items.json",
    contentType: "application/json",
    description: "人工审核队列和审核状态汇总。",
  },
  {
    kind: "report",
    fileName: "report.md",
    contentType: "text/markdown",
    description: "交付级运行报告，包含证据索引、阻塞项和剩余不确定性。",
  },
  {
    kind: "reviewed_report",
    fileName: "reviewed_report.md",
    contentType: "text/markdown",
    description:
      "审核版报告，仅将 approved 且 acceptedForReport 的证据列为已确认发现。",
  },
  {
    kind: "run_log",
    fileName: "run_log.json",
    contentType: "application/json",
    description: "可审计运行日志，包含耗时、采集失败、抽取待复核和质量汇总。",
  },
  {
    kind: "manifest",
    fileName: "manifest.json",
    contentType: "application/json",
    description:
      "交付包清单，供 Studio、脚本或自动化系统识别本次 run 的所有产物。",
  },
] as const;

export type IndustryResearchDeliveryPackageFileKind =
  (typeof industryResearchDeliveryPackageFiles)[number]["kind"];

export type IndustryResearchDeliveryPackageFile = {
  kind: IndustryResearchDeliveryPackageFileKind;
  fileName: string;
  contentType: string;
  required: true;
  description: string;
};

export type IndustryResearchDeliveryPackageManifest = {
  schemaVersion: "industry_research_delivery_manifest.v1";
  packageVersion: "v0.3";
  runId: string;
  generatedAt: string;
  status:
    | "ready_for_internal_review"
    | "blocked_no_raw_documents"
    | "needs_review_with_crawl_failures";
  project: {
    name: string;
    templateId: ResearchWorkflowInput["templateId"];
    industry: string;
    category: string;
    market: string;
    goal: string;
  };
  mode: IndustryResearchDeliveryRunMode;
  llmStatus: IndustryResearchRunLog["llmStatus"];
  providerMetadata: ResearchRunMetadata;
  counts: IndustryResearchRunLog["counts"];
  reviewSummary: IndustryResearchRunLog["reviewSummary"];
  sourceQualitySummary: SourceQualitySummary;
  credibility: IndustryResearchRunLog["credibility"];
  files: IndustryResearchDeliveryPackageFile[];
  runDetailApiPath: string;
  downloadPackageApiPath: string;
  notes: string[];
};

export type IndustryResearchRunLog = {
  runId: string;
  mode: IndustryResearchDeliveryRunMode;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  llmStatus:
    | "deepseek"
    | "9router"
    | "openai_compatible"
    | "fallback"
    | "local";
  providerMetadata: ResearchRunMetadata;
  credibility: {
    crawledDocuments: number;
    effectiveEvidence: number;
    confirmedFindings: number;
    needsReviewFindings: number;
    lowQualitySources: number;
    crawlFailures: number;
    llmFallback: boolean;
  };
  reportTitle: string;
  crawlMode: string;
  counts: {
    rawDocuments: number;
    evidence: number;
    reviewItems: number;
    crawlJobs: number;
    crawlRuns: number;
    extractionJobs: number;
  };
  reviewSummary: Record<ResearchReviewItem["status"], number>;
  workflowSteps: ResearchWorkflowStep[];
  crawlFailures: Array<{
    id: string;
    jobId: string;
    reason: IndustryResearchCrawlFailureReason;
    summary: string;
  }>;
  crawlFailureSummary: {
    total: number;
    byReason: Record<IndustryResearchCrawlFailureReason, number>;
    failedJobIds: string[];
  };
  extractionNeedsReview: Array<{
    id: string;
    targetDatabase: string;
    summary: string;
  }>;
  sourceQualitySummary: SourceQualitySummary;
  sourceDiscoveryNotes: string[];
  guardrails: string[];
};

export type IndustryResearchCrawlFailureReason =
  | "unsupported_target"
  | "missing_source"
  | "http_error"
  | "timeout"
  | "fetch_error"
  | "unknown";

export type IndustryResearchDeliveryArtifacts = {
  input: ResearchWorkflowInput;
  raw_documents: RawDocument[];
  databases: IndustryResearchDeliveryDatabases;
  review_items: {
    summary: IndustryResearchRunLog["reviewSummary"];
    items: ResearchReviewItem[];
  };
  reportMarkdown: string;
  reviewedReportMarkdown: string;
  run_log: IndustryResearchRunLog;
  manifest: IndustryResearchDeliveryPackageManifest;
};

const databaseNames: IndustryResearchDatabaseName[] = [
  "source_database",
  "competitor_database",
  "website_structure_database",
  "product_database",
  "keyword_database",
  "pain_point_database",
  "content_database",
  "opportunity_database",
  "weekly_intelligence_reports",
];

function incrementStatus(
  summary: Record<ResearchReviewItem["status"], number>,
  status: ResearchReviewItem["status"],
) {
  summary[status] += 1;
}

function createReviewSummary(reviewItems: ResearchReviewItem[]) {
  const summary = {
    approved: 0,
    needs_review: 0,
    rejected: 0,
  } satisfies Record<ResearchReviewItem["status"], number>;

  for (const item of reviewItems) {
    incrementStatus(summary, item.status);
  }

  return summary;
}

function createDatabaseSnapshot(
  result: ResearchWorkflowResult,
): IndustryResearchDeliveryDatabases {
  return {
    source_database: result.source_database,
    competitor_database: result.competitor_database,
    website_structure_database: result.website_structure_database,
    product_database: result.product_database,
    keyword_database: result.keyword_database,
    pain_point_database: result.pain_point_database,
    content_database: result.content_database,
    opportunity_database: result.opportunity_database,
    weekly_intelligence_reports: result.weekly_intelligence_reports,
    evidence: result.evidence,
    research_sources: result.research_sources,
  };
}

function defaultRunMetadata(
  result: ResearchWorkflowResult,
): ResearchRunMetadata {
  const crawlMode = result.crawl_plans[0]?.mode;
  const canonicalMode: ResearchRunCanonicalMode =
    crawlMode === "public_web" ? "public_web" : "llm_only";

  return {
    canonicalMode,
    provider: "none",
    llmUsed: canonicalMode !== "public_web",
  };
}

function runMetadata(result: ResearchWorkflowResult) {
  return result.runMetadata ?? defaultRunMetadata(result);
}

function detectLlmStatus(result: ResearchWorkflowResult) {
  const metadata = runMetadata(result);

  if (metadata.provider === "local_fallback" || metadata.fallbackReason) {
    return "fallback" as const;
  }

  if (metadata.provider === "9router") {
    return "9router" as const;
  }

  if (metadata.provider === "deepseek") {
    return "deepseek" as const;
  }

  if (metadata.provider === "openai_compatible") {
    return "openai_compatible" as const;
  }

  return "local" as const;
}

function resolveDeliveryMode(result: ResearchWorkflowResult) {
  return runMetadata(result).canonicalMode;
}

function evidenceSourceFor(
  evidence: Evidence,
  rawDocuments: RawDocument[],
  sources: ResearchSource[],
) {
  const rawDocument =
    rawDocuments.find((document) => document.id === evidence.rawDocumentId) ??
    rawDocuments.find((document) => document.sourceId === evidence.sourceId);
  const source = sources.find((item) => item.id === evidence.sourceId);

  return {
    evidenceId: evidence.id,
    sourceId: evidence.sourceId,
    sourceTitle: source?.title ?? "未知来源",
    sourceValue: source?.value ?? "",
    rawDocumentId: rawDocument?.id ?? evidence.rawDocumentId ?? "",
    rawDocumentTitle: rawDocument?.title ?? "未匹配 raw document",
    url: rawDocument?.url ?? source?.value ?? "",
    contentType: rawDocument?.contentType ?? "text",
    excerpt: rawDocument?.excerpt ?? "",
    sourceQuality: rawDocument?.sourceQuality,
    quote: evidence.quote,
    note: evidence.note,
    validation: evidence.validation,
  };
}

function createEvidenceFormatter(result: ResearchWorkflowResult) {
  const evidenceById = new Map(
    result.evidence.map((item) => [
      item.id,
      evidenceSourceFor(item, result.raw_documents, result.research_sources),
    ]),
  );

  return (evidenceIds: string[]) => {
    if (evidenceIds.length === 0) {
      return [
        "- 证据状态：needs_review",
        "- 原因：该结论没有 evidenceId，不能作为已确认事实交付。",
      ].join("\n");
    }

    return evidenceIds
      .map((evidenceId) => {
        const evidence = evidenceById.get(evidenceId);

        if (!evidence) {
          return `- ${evidenceId}：needs_review，未找到对应 evidence 记录。`;
        }

        return [
          `- ${evidence.evidenceId}`,
          `  - rawDocumentId：${evidence.rawDocumentId || "待补充"}`,
          `  - URL：${evidence.url || "待补充"}`,
          `  - 标题：${evidence.rawDocumentTitle}`,
          `  - 数据源质量：${evidence.sourceQuality ? `${evidence.sourceQuality.sourceType} / relevance=${evidence.sourceQuality.sourceRelevance} / confidence=${evidence.sourceQuality.sourceConfidence} / accepted=${evidence.sourceQuality.acceptedForReport}` : "未评分"}`,
          `  - quote：${evidence.quote}`,
          `  - quoteMatched：${evidence.validation?.quoteMatched ?? "unknown"}`,
          `  - sourceAccepted：${evidence.validation?.sourceAccepted ?? evidence.sourceQuality?.acceptedForReport ?? "unknown"}`,
          `  - 摘录：${evidence.excerpt || "待补充"}`,
          `  - 备注：${evidence.note}`,
        ].join("\n");
      })
      .join("\n");
  };
}

function databaseCounts(result: ResearchWorkflowResult) {
  return databaseNames.map((name) => ({
    name,
    count: result[name].length,
  }));
}

function createEmptyCrawlFailureReasonCounts(): Record<
  IndustryResearchCrawlFailureReason,
  number
> {
  return {
    unsupported_target: 0,
    missing_source: 0,
    http_error: 0,
    timeout: 0,
    fetch_error: 0,
    unknown: 0,
  };
}

function classifyCrawlFailure(
  summary: string,
): IndustryResearchCrawlFailureReason {
  const normalized = summary.toLowerCase();

  if (normalized.includes("unsupported_public_target")) {
    return "unsupported_target";
  }

  if (
    normalized.includes("missing_source") ||
    normalized.includes("missing source")
  ) {
    return "missing_source";
  }

  if (normalized.includes("http_error") || /^http\s+\d+/i.test(summary)) {
    return "http_error";
  }

  if (normalized.includes("abort") || normalized.includes("timeout")) {
    return "timeout";
  }

  if (normalized.includes("fetch_error")) {
    return "fetch_error";
  }

  return "unknown";
}

function formatCountList(result: ResearchWorkflowResult) {
  return databaseCounts(result)
    .map((item) => `- ${item.name}：${item.count}`)
    .join("\n");
}

function formatSourceQualityList(result: ResearchWorkflowResult) {
  const summary = summarizeSourceQuality(result.raw_documents);

  return [
    `- total：${summary.total}`,
    `- acceptedForReport：${summary.acceptedForReport}`,
    `- rejectedForReport：${summary.rejectedForReport}`,
    `- relevance：high ${summary.byRelevance.high} / medium ${summary.byRelevance.medium} / low ${summary.byRelevance.low}`,
    `- confidence：high ${summary.byConfidence.high} / medium ${summary.byConfidence.medium} / low ${summary.byConfidence.low}`,
    `- lowQualityDocumentIds：${summary.lowQualityDocumentIds.join(", ") || "无"}`,
  ].join("\n");
}

function formatConfirmedFindings(result: ResearchWorkflowResult) {
  const findings: string[] = [];
  const crawlMode = result.crawl_plans[0]?.mode ?? "unknown";
  const allDatabasesHaveRows = databaseCounts(result).every(
    (item) => item.count > 0,
  );

  if (crawlMode === "public_web" && result.raw_documents.length > 0) {
    findings.push(
      `已通过 public_web 生成 ${result.raw_documents.length} 条 raw document，可在 raw_documents.json 中逐条复核 URL、标题和摘录。`,
    );
  }

  if (allDatabasesHaveRows) {
    findings.push("九类行业研究数据库均已生成至少 1 条记录。");
  }

  if (result.research_reports[0]) {
    findings.push(`已生成 Markdown 报告：${result.research_reports[0].title}`);
  }

  return findings.length > 0
    ? findings.map((item) => `- ${item}`).join("\n")
    : "- 暂无可直接确认为事实的业务发现；当前业务结论均需人工复核。";
}

function formatLikelyFindings(result: ResearchWorkflowResult) {
  const formatEvidence = createEvidenceFormatter(result);
  const sections: string[] = [];

  for (const competitor of result.competitors) {
    sections.push(
      [
        `### 竞品候选：${competitor.name}`,
        "",
        `- 状态：needs_review`,
        `- 定位：${competitor.positioning}`,
        "- 证据：",
        formatEvidence(competitor.evidenceIds),
      ].join("\n"),
    );
  }

  for (const signal of result.product_signals) {
    sections.push(
      [
        `### 产品信号候选：${signal.signal}`,
        "",
        `- 状态：needs_review`,
        `- 标签：${signal.tags.join(", ") || "待补充"}`,
        "- 证据：",
        formatEvidence(signal.evidenceIds),
      ].join("\n"),
    );
  }

  for (const point of result.pain_points) {
    sections.push(
      [
        `### 痛点候选：${point.theme}`,
        "",
        `- 状态：needs_review`,
        `- 用户需求：${point.userNeed}`,
        `- 频次：${point.frequency}`,
        "- 证据：",
        formatEvidence(point.evidenceIds),
      ].join("\n"),
    );
  }

  for (const signal of result.content_signals) {
    sections.push(
      [
        `### 内容信号候选：${signal.topic}`,
        "",
        `- 状态：needs_review`,
        `- 平台：${signal.platform}`,
        `- 类型：${signal.contentType}`,
        `- 价值判断：${signal.whyItWorks}`,
        "- 证据：",
        formatEvidence(signal.evidenceIds),
      ].join("\n"),
    );
  }

  for (const opportunity of result.opportunities) {
    sections.push(
      [
        `### 机会候选：${opportunity.title}`,
        "",
        `- 状态：${opportunity.reviewStatus}（交付前仍需人工复核）`,
        `- 总分：${opportunity.totalScore}`,
        `- 摘要：${opportunity.summary}`,
        `- 审核备注：${opportunity.reviewNote}`,
        "- 证据：",
        formatEvidence(opportunity.evidenceIds),
      ].join("\n"),
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : "暂无候选发现。";
}

function formatBlockedClaims(result: ResearchWorkflowResult) {
  const blockers: string[] = [];
  const crawlFailures = result.crawl_runs.filter(
    (run) => run.status === "failed",
  );
  const extractionNeedsReview = result.extraction_jobs.filter(
    (job) => job.status === "needs_review" && job.summary.includes("失败"),
  );

  if (result.raw_documents.length === 0) {
    blockers.push("public_web 没有生成 raw documents，无法支撑业务结论。");
  }

  for (const run of crawlFailures) {
    blockers.push(`采集失败：${run.id} / ${run.summary}`);
  }

  for (const job of extractionNeedsReview.slice(0, 12)) {
    blockers.push(`抽取待复核：${job.id} / ${job.summary}`);
  }

  if (extractionNeedsReview.length > 12) {
    blockers.push(
      `另有 ${extractionNeedsReview.length - 12} 条 extraction job 需要复核，完整清单见 run_log.json。`,
    );
  }

  if (detectLlmStatus(result) === "fallback") {
    blockers.push(
      "OpenAI-compatible provider 报告节点失败，当前 report.md 使用本地回退报告。",
    );
  }

  return blockers.length > 0
    ? blockers.map((item) => `- ${item}`).join("\n")
    : "- 暂无硬阻塞；仍需人工审核业务结论。";
}

function formatRemainingUncertainty(result: ResearchWorkflowResult) {
  const notes = [
    "公开网页抓取只能证明页面当时可访问，不能证明销量、市场份额或真实转化率。",
    "价格、评论、广告投放和社媒表现仍需更多来源交叉验证。",
    "OpenAI-compatible provider 结构化抽取结果必须由人工确认后，才能进入客户交付结论。",
  ];

  if (result.raw_documents.length < 3) {
    notes.push(
      "raw documents 数量偏少，建议补充 2-3 个真实竞品官网或公开数据源。",
    );
  }

  return notes.map((item) => `- ${item}`).join("\n");
}

function formatEvidenceIndex(result: ResearchWorkflowResult) {
  const formatEvidence = createEvidenceFormatter(result);

  return result.evidence.length > 0
    ? result.evidence.map((item) => formatEvidence([item.id])).join("\n")
    : "- 暂无 evidence 记录。";
}

function evidenceIdsForReviewItem(
  result: ResearchWorkflowResult,
  item: ResearchReviewItem,
) {
  switch (item.targetType) {
    case "competitor":
      return (
        result.competitors.find((target) => target.id === item.targetId)
          ?.evidenceIds ?? []
      );
    case "product_signal":
      return (
        result.product_signals.find((target) => target.id === item.targetId)
          ?.evidenceIds ?? []
      );
    case "pain_point":
      return (
        result.pain_points.find((target) => target.id === item.targetId)
          ?.evidenceIds ?? []
      );
    case "content_signal":
      return (
        result.content_signals.find((target) => target.id === item.targetId)
          ?.evidenceIds ?? []
      );
    case "opportunity":
      return (
        result.opportunities.find((target) => target.id === item.targetId)
          ?.evidenceIds ?? []
      );
  }
}

function reviewItemTitle(
  result: ResearchWorkflowResult,
  item: ResearchReviewItem,
) {
  switch (item.targetType) {
    case "competitor":
      return (
        result.competitors.find((target) => target.id === item.targetId)
          ?.name ?? item.targetId
      );
    case "product_signal":
      return (
        result.product_signals.find((target) => target.id === item.targetId)
          ?.signal ?? item.targetId
      );
    case "pain_point":
      return (
        result.pain_points.find((target) => target.id === item.targetId)
          ?.theme ?? item.targetId
      );
    case "content_signal":
      return (
        result.content_signals.find((target) => target.id === item.targetId)
          ?.topic ?? item.targetId
      );
    case "opportunity":
      return (
        result.opportunities.find((target) => target.id === item.targetId)
          ?.title ?? item.targetId
      );
  }
}

function acceptedEvidenceIds(
  result: ResearchWorkflowResult,
  evidenceIds: string[],
) {
  return evidenceIds.filter((evidenceId) => {
    const evidence = result.evidence.find((item) => item.id === evidenceId);
    const rawDocument = result.raw_documents.find(
      (document) => document.id === evidence?.rawDocumentId,
    );

    const validation = evidence?.validation;

    return (
      rawDocument?.sourceQuality.acceptedForReport &&
      validation?.quoteMatched !== false &&
      validation?.sourceAccepted !== false
    );
  });
}

function canConfirmReviewItem(
  result: ResearchWorkflowResult,
  item: ResearchReviewItem,
) {
  return (
    item.status === "approved" &&
    acceptedEvidenceIds(result, evidenceIdsForReviewItem(result, item)).length >
      0
  );
}

function createCredibilityMetrics(
  result: ResearchWorkflowResult,
  reviewItems: ResearchReviewItem[] = result.reviewItems,
) {
  const sourceQualitySummary = summarizeSourceQuality(result.raw_documents);
  const confirmedFindings = reviewItems.filter((item) =>
    canConfirmReviewItem(result, item),
  ).length;
  const needsReviewFindings = reviewItems.filter(
    (item) => item.status !== "rejected" && !canConfirmReviewItem(result, item),
  ).length;

  return {
    crawledDocuments: result.raw_documents.length,
    effectiveEvidence: result.evidence.filter((evidence) =>
      acceptedEvidenceIds(result, [evidence.id]).includes(evidence.id),
    ).length,
    confirmedFindings,
    needsReviewFindings,
    lowQualitySources: sourceQualitySummary.lowQualityDocumentIds.length,
    crawlFailures: result.crawl_runs.filter((run) => run.status === "failed")
      .length,
    llmFallback: detectLlmStatus(result) === "fallback",
  };
}

function formatReviewedItems(
  result: ResearchWorkflowResult,
  reviewItems: ResearchReviewItem[],
  status: ResearchReviewItem["status"],
) {
  const formatEvidence = createEvidenceFormatter(result);
  const sections = reviewItems
    .filter((item) => {
      const canConfirm = canConfirmReviewItem(result, item);

      if (status === "approved") {
        return canConfirm;
      }

      if (status === "needs_review") {
        return item.status !== "rejected" && !canConfirm;
      }

      return item.status === status;
    })
    .map((item) => {
      const evidenceIds = evidenceIdsForReviewItem(result, item);
      const acceptedIds = acceptedEvidenceIds(result, evidenceIds);
      const canConfirm = canConfirmReviewItem(result, item);

      return [
        `### ${reviewItemTitle(result, item)}`,
        "",
        `- 类型：${item.targetType}`,
        `- 状态：${canConfirm ? "confirmed" : item.status}`,
        `- 审核备注：${item.note}`,
        `- 可进入已确认发现：${canConfirm ? "true" : "false"}`,
        "- 证据：",
        formatEvidence(canConfirm ? acceptedIds : evidenceIds),
      ].join("\n");
    });

  return sections.length > 0 ? sections.join("\n\n") : "- 暂无。";
}

export function createReviewedIndustryResearchReport(
  result: ResearchWorkflowResult,
  reviewItems: ResearchReviewItem[] = result.reviewItems,
) {
  const project = result.research_projects[0];

  if (!project) {
    throw new Error("Cannot create reviewed report without project.");
  }

  const summary = createReviewSummary(reviewItems);
  const credibility = createCredibilityMetrics(result, reviewItems);

  return [
    `# ${project.name} - 已审核版行业竞品研究轻量版报告`,
    "",
    "## 审核摘要",
    "",
    `- confirmed：${summary.approved}`,
    `- needs_review：${summary.needs_review}`,
    `- rejected：${summary.rejected}`,
    `- confirmedFindings：${credibility.confirmedFindings}`,
    `- needsReviewFindings：${credibility.needsReviewFindings}`,
    "- 规则：只有人工标记 approved 且证据对应数据源 `acceptedForReport=true` 的结论，才进入已确认发现。",
    "- 注意：本报告仍不承诺 100% 自动事实判断，交付客户前需由负责人最终复核。",
    "",
    "## 已确认发现",
    "",
    formatReviewedItems(result, reviewItems, "approved"),
    "",
    "## 候选发现",
    "",
    formatReviewedItems(result, reviewItems, "needs_review"),
    "",
    "## 不确定 / 阻塞项",
    "",
    formatReviewedItems(result, reviewItems, "rejected"),
    "",
    "## 数据源质量评分",
    "",
    formatSourceQualityList(result),
    "",
    "## 剩余不确定性",
    "",
    formatRemainingUncertainty(result),
    "",
    "## 证据索引",
    "",
    formatEvidenceIndex(result),
  ].join("\n");
}

export function createIndustryResearchDeliveryReport(
  result: ResearchWorkflowResult,
) {
  const project = result.research_projects[0];
  const report = result.research_reports[0];

  if (!project || !report) {
    throw new Error(
      "Cannot create delivery report without project and report.",
    );
  }
  const metadata = runMetadata(result);
  const credibility = createCredibilityMetrics(result);

  return [
    `# ${project.name} - 最小交付级 Agent 运行报告`,
    "",
    "## 交付状态摘要",
    "",
    `- 模板：${project.templateId}`,
    `- 行业：${project.industry}`,
    `- 品类：${project.category}`,
    `- 市场：${project.market}`,
    `- 目标：${project.goal}`,
    `- 采集模式：${result.crawl_plans[0]?.mode ?? "unknown"}`,
    `- LLM 状态：${detectLlmStatus(result)}`,
    `- 运行模式：${metadata.canonicalMode}`,
    `- Provider：${metadata.provider}`,
    `- Model：${metadata.model ?? "未使用或未配置"}`,
    `- Fallback：${metadata.fallbackReason ?? "无"}`,
    `- raw_documents：${result.raw_documents.length}`,
    `- evidence：${result.evidence.length}`,
    "- 审核说明：review_items 是交付前人工审核入口，不代表最终客户签字确认。",
    "",
    "## 可信度仪表盘",
    "",
    `- 采集网页数：${credibility.crawledDocuments}`,
    `- 有效证据数：${credibility.effectiveEvidence}`,
    `- 已确认结论数：${credibility.confirmedFindings}`,
    `- 待复核结论数：${credibility.needsReviewFindings}`,
    `- 低质量来源数：${credibility.lowQualitySources}`,
    `- 抓取失败数：${credibility.crawlFailures}`,
    `- LLM fallback：${credibility.llmFallback ? "是" : "否"}`,
    "",
    "## 九类数据库数量",
    "",
    formatCountList(result),
    "",
    "## 数据源质量评分",
    "",
    formatSourceQualityList(result),
    "",
    "## 已确认发现",
    "",
    formatConfirmedFindings(result),
    "",
    "## 候选发现",
    "",
    formatLikelyFindings(result),
    "",
    "## 不确定 / 阻塞项",
    "",
    formatBlockedClaims(result),
    "",
    "## 剩余不确定性",
    "",
    formatRemainingUncertainty(result),
    "",
    "## 证据索引",
    "",
    formatEvidenceIndex(result),
    "",
    "## 原始研究报告",
    "",
    report.content,
  ].join("\n");
}

export function createIndustryResearchDeliveryManifest(
  artifacts: Omit<IndustryResearchDeliveryArtifacts, "manifest">,
): IndustryResearchDeliveryPackageManifest {
  const project = artifacts.input;
  const runLog = artifacts.run_log;
  const hasRawDocuments = runLog.counts.rawDocuments > 0;
  const hasCrawlFailures = runLog.crawlFailures.length > 0;
  const status = !hasRawDocuments
    ? "blocked_no_raw_documents"
    : hasCrawlFailures
      ? "needs_review_with_crawl_failures"
      : "ready_for_internal_review";
  const notes = [
    "这是 v0.3 边界扩展交付包清单；它只描述本地 JSON/Markdown 产物，不代表 SaaS 历史记录已上线。",
    "所有结论交付前仍需人工审核；reviewed_report.md 只把 approved 且 acceptedForReport=true 的证据列为已确认发现。",
    "manifest.json 不包含 API Key、服务器地址、SSH 信息或 n8n 密钥。",
  ];

  if (hasCrawlFailures) {
    notes.push("本次 run 存在采集失败，完整失败摘要见 run_log.json。");
  }

  if (runLog.sourceQualitySummary.acceptedForReport === 0) {
    notes.push(
      "没有 acceptedForReport=true 的数据源，报告只能作为内部分析草稿。",
    );
  }

  return {
    schemaVersion: "industry_research_delivery_manifest.v1",
    packageVersion: "v0.3",
    runId: runLog.runId,
    generatedAt: runLog.finishedAt,
    status,
    project: {
      name: project.projectName,
      templateId: project.templateId,
      industry: project.industry,
      category: project.category,
      market: project.market,
      goal: project.researchGoal,
    },
    mode: runLog.mode,
    llmStatus: runLog.llmStatus,
    providerMetadata: runLog.providerMetadata,
    counts: runLog.counts,
    reviewSummary: runLog.reviewSummary,
    sourceQualitySummary: runLog.sourceQualitySummary,
    credibility: runLog.credibility,
    files: industryResearchDeliveryPackageFiles.map((file) => ({
      ...file,
      required: true,
    })),
    runDetailApiPath: `/api/industry-research/runs/${encodeURIComponent(runLog.runId)}`,
    downloadPackageApiPath: `/api/industry-research/runs/${encodeURIComponent(runLog.runId)}/download`,
    notes,
  };
}

export function createIndustryResearchDeliveryArtifacts({
  input,
  result: baseResult,
  runId,
  startedAt,
  finishedAt,
  previousRun,
}: {
  input: ResearchWorkflowInput;
  result: ResearchWorkflowResult;
  runId: string;
  startedAt: string;
  finishedAt: string;
  previousRun?: IndustryResearchPreviousRunRef | null;
}): IndustryResearchDeliveryArtifacts {
  let result = baseResult;
  let runDiffSection = "";

  if (previousRun !== undefined) {
    const projectId = baseResult.research_projects[0]?.id ?? "project-unknown";
    const weekOf = finishedAt.slice(0, 10);

    if (previousRun === null) {
      result = {
        ...baseResult,
        weekly_intelligence_reports: [
          ...baseResult.weekly_intelligence_reports,
          createBaselineWeeklyIntelligenceReport({
            projectId,
            category: input.category,
            weekOf,
            runId,
          }),
        ],
      };
      runDiffSection = formatRunDiffMarkdownSection(null, runId);
    } else {
      const diff = diffIndustryResearchDatabases(
        coerceRunDiffDatabases(previousRun.databases),
        coerceRunDiffDatabases(createDatabaseSnapshot(baseResult)),
        previousRun.runId,
      );
      result = {
        ...baseResult,
        weekly_intelligence_reports: [
          ...baseResult.weekly_intelligence_reports,
          createWeeklyIntelligenceReportFromDiff({
            projectId,
            category: input.category,
            weekOf,
            diff,
          }),
        ],
      };
      runDiffSection = formatRunDiffMarkdownSection(diff);
    }
  }

  const startMs = new Date(startedAt).getTime();
  const finishMs = new Date(finishedAt).getTime();
  const reviewSummary = createReviewSummary(result.reviewItems);
  const reportTitle = result.research_reports[0]?.title ?? "";
  const sourceQualitySummary = summarizeSourceQuality(result.raw_documents);
  const providerMetadata = runMetadata(result);
  const credibility = createCredibilityMetrics(result);
  const crawlFailures = result.crawl_runs
    .filter((run) => run.status === "failed")
    .map((run) => ({
      id: run.id,
      jobId: run.jobId,
      reason: classifyCrawlFailure(run.summary),
      summary: run.summary,
    }));
  const crawlFailureReasonCounts = createEmptyCrawlFailureReasonCounts();

  for (const failure of crawlFailures) {
    crawlFailureReasonCounts[failure.reason] += 1;
  }

  const runLog: IndustryResearchRunLog = {
    runId,
    mode: resolveDeliveryMode(result),
    startedAt,
    finishedAt,
    durationMs:
      Number.isFinite(startMs) && Number.isFinite(finishMs)
        ? Math.max(0, finishMs - startMs)
        : 0,
    llmStatus: detectLlmStatus(result),
    providerMetadata,
    credibility,
    reportTitle,
    crawlMode: result.crawl_plans[0]?.mode ?? "unknown",
    counts: {
      rawDocuments: result.raw_documents.length,
      evidence: result.evidence.length,
      reviewItems: result.reviewItems.length,
      crawlJobs: result.crawl_jobs.length,
      crawlRuns: result.crawl_runs.length,
      extractionJobs: result.extraction_jobs.length,
    },
    reviewSummary,
    workflowSteps: result.workflowSteps,
    crawlFailures,
    crawlFailureSummary: {
      total: crawlFailures.length,
      byReason: crawlFailureReasonCounts,
      failedJobIds: crawlFailures.map((failure) => failure.jobId),
    },
    extractionNeedsReview: result.extraction_jobs
      .filter((job) => job.status === "needs_review")
      .map((job) => ({
        id: job.id,
        targetDatabase: job.targetDatabase,
        summary: job.summary,
      })),
    sourceQualitySummary,
    sourceDiscoveryNotes: result.source_discovery_plans[0]?.notes ?? [],
    guardrails: result.crawl_plans[0]?.guardrails ?? [],
  };

  const artifactsWithoutManifest: Omit<
    IndustryResearchDeliveryArtifacts,
    "manifest"
  > = {
    input,
    raw_documents: result.raw_documents,
    databases: createDatabaseSnapshot(result),
    review_items: {
      summary: reviewSummary,
      items: result.reviewItems,
    },
    reportMarkdown: runDiffSection
      ? `${createIndustryResearchDeliveryReport(result)}\n${runDiffSection}\n`
      : createIndustryResearchDeliveryReport(result),
    reviewedReportMarkdown: createReviewedIndustryResearchReport(result),
    run_log: runLog,
  };

  return {
    ...artifactsWithoutManifest,
    manifest: createIndustryResearchDeliveryManifest(artifactsWithoutManifest),
  };
}
