import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { verifyAllDeepPageDiscoveryFixtures } from "../packages/industry-research/src/deep-page-fixtures.ts";
import {
  assessSourceQuality,
  cleanDocumentText,
  hasUnsupportedQuantifiedClaim,
  highRiskClaimHasDirectQuote,
  validateEvidenceQuotes,
} from "../packages/industry-research/src/index.ts";
import type {
  CompetitorDatabaseEntry,
  ContentDatabaseEntry,
  CrawlPlanTarget,
  CrawlTargetKind,
  Evidence,
  KeywordDatabaseEntry,
  OpportunityDatabaseEntry,
  PainPointDatabaseEntry,
  RawDocument,
  ResearchReviewItem,
  ResearchWorkflowInput,
  WebsiteStructureDatabaseEntry,
} from "../packages/industry-research/src/types.ts";

const replayVersion = "evidence-repair-replay-v2";
const maxDocumentLength = 12_000;
const minimumTrustedDocuments = 3;
const minimumTrustedDomains = 2;
const minimumDeepDocuments = 1;
const minimumVerifiableFindingRatio = 0.7;
const maximumMedianResidualNoiseRatio = 0.25;
const maximumDocumentResidualNoiseRatio = 0.5;

const samples = [
  {
    id: "pet-probiotics",
    label: "宠物肠胃益生菌",
    path: "outputs/industry-research-benchmarks/evidence-benchmark-v1/evidence-benchmark-v1-pet-probiotics-2026-07-10T03-21-41-336Z",
  },
  {
    id: "dishwasher",
    label: "洗碗机",
    path: "outputs/industry-research-benchmarks/evidence-benchmark-v1/evidence-benchmark-v1-dishwasher-2026-07-10T03-24-01-912Z",
  },
  {
    id: "japan-niche-skincare",
    label: "日本小众护肤品牌",
    path: "outputs/industry-research-benchmarks/evidence-benchmark-v1/evidence-benchmark-v1-japan-niche-skincare-2026-07-10T03-26-36-830Z",
  },
] as const;

type SavedDatabases = {
  evidence: Evidence[];
  competitor_database: CompetitorDatabaseEntry[];
  website_structure_database: WebsiteStructureDatabaseEntry[];
  keyword_database: KeywordDatabaseEntry[];
  pain_point_database: PainPointDatabaseEntry[];
  content_database: ContentDatabaseEntry[];
  opportunity_database: OpportunityDatabaseEntry[];
  [key: string]: unknown[];
};

type SavedReviewItems = {
  items: ResearchReviewItem[];
};

type SavedBenchmarkRun = {
  durationMs?: number;
  requestCounts?: {
    publicTotal?: number;
    searchApi?: number;
    firecrawl?: number;
    llm?: number;
  };
  actualMonetaryCostYuan?: number | null;
};

type ReplayEvidence = Evidence & {
  replayAudit: {
    quoteValidationPassed: boolean;
    uniqueRawDocumentBinding: boolean;
    legacyClaimCompletenessRecorded: boolean;
    failureReasons: string[];
  };
};

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2
    : (sorted[midpoint] ?? 0);
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function textFormat(document: RawDocument) {
  const sourceText = document.originalText ?? document.extractedText;
  if (/<(?:html|body|main|nav|footer|div)\b/i.test(sourceText)) {
    return "html" as const;
  }
  if (/!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\(https?:\/\//i.test(sourceText)) {
    return "markdown" as const;
  }
  return "text" as const;
}

function targetKind(document: RawDocument): CrawlTargetKind {
  switch (document.sourceQuality.sourceType) {
    case "product_page":
      return "product";
    case "collection_page":
      return "collection";
    case "blog":
      return "blog";
    case "rss":
      return "rss";
    case "robots":
      return "robots";
    case "sitemap":
      return "sitemap";
    case "csv":
      return "review_csv";
    case "search_candidate":
      return "search_results";
    default:
      return "homepage";
  }
}

function crawlTargetFor(document: RawDocument): CrawlPlanTarget {
  return {
    id: `offline-target-${document.id}`,
    projectId: document.projectId,
    candidateId: `offline-candidate-${document.id}`,
    kind: targetKind(document),
    target: document.url,
    reason: "offline_replay_of_saved_document",
    maxPages: 1,
    databaseTargets: document.databaseTargets,
  };
}

function replayDocuments(
  input: ResearchWorkflowInput,
  documents: RawDocument[],
) {
  return documents.map((document) => {
    const sourceText = document.originalText ?? document.extractedText;
    const cleaning = cleanDocumentText({
      text: sourceText,
      format: textFormat(document),
      maxTextLength: maxDocumentLength,
    });
    const sourceQuality = assessSourceQuality({
      target: crawlTargetFor(document),
      input,
      title: document.title,
      url: document.url,
      extractedText: cleaning.cleanedText,
    });

    return {
      ...document,
      originalText: cleaning.originalText,
      extractedText: cleaning.cleanedText,
      cleaningAudit: cleaning.audit,
      sourceQuality,
    } satisfies RawDocument;
  });
}

function replayEvidence(
  savedEvidence: Evidence[],
  documents: RawDocument[],
): ReplayEvidence[] {
  const documentById = new Map(
    documents.map((document) => [document.id, document]),
  );

  return savedEvidence.map((evidence) => {
    const expectedDocument = evidence.rawDocumentId
      ? documentById.get(evidence.rawDocumentId)
      : undefined;
    const validation = validateEvidenceQuotes(
      [
        {
          quote: evidence.quote,
          rawDocumentId: evidence.rawDocumentId,
          sourceId: evidence.sourceId,
          url: expectedDocument?.url,
        },
      ],
      documents,
    );
    const matched = validation.matchedQuotes[0];
    const legacyClaimCompletenessRecorded =
      evidence.validation?.claimSupportComplete === true;

    return {
      ...evidence,
      rawDocumentId: matched?.rawDocumentId ?? evidence.rawDocumentId,
      validation: {
        quoteMatched: matched?.quoteMatched ?? false,
        sourceAccepted: matched?.sourceAccepted ?? false,
        matchedRawDocumentId: matched?.matchedRawDocumentId,
        failureReason: matched?.failureReason,
        // 旧 benchmark 没保存“同一声明全部 quotes”的完整性元数据，
        // 离线 replay 不得把单条 quote 命中升级为完整声明已证实。
        claimSupportComplete:
          legacyClaimCompletenessRecorded && validation.claimSupportComplete,
        claimQuoteCount: evidence.validation?.claimQuoteCount,
        confirmedQuoteCount: evidence.validation?.confirmedQuoteCount,
      },
      replayAudit: {
        quoteValidationPassed: validation.claimSupportComplete,
        uniqueRawDocumentBinding:
          Boolean(matched?.rawDocumentId) &&
          matched?.candidateRawDocumentIds.length === 1,
        legacyClaimCompletenessRecorded,
        failureReasons: validation.failureReasons,
      },
    };
  });
}

function repairedDatabases(
  databases: SavedDatabases,
  documents: RawDocument[],
  evidence: ReplayEvidence[],
) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const documentById = new Map(documents.map((item) => [item.id, item]));
  const validEvidenceFor = (evidenceIds: string[]) =>
    evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId))
      .filter((item): item is ReplayEvidence =>
        Boolean(
          item?.replayAudit.quoteValidationPassed &&
            item.replayAudit.uniqueRawDocumentBinding,
        ),
      );
  const sourceIdsFor = (evidenceIds: string[]) => [
    ...new Set(validEvidenceFor(evidenceIds).map((item) => item.sourceId)),
  ];
  const documentsFor = (evidenceIds: string[]) =>
    validEvidenceFor(evidenceIds)
      .map((item) =>
        item.rawDocumentId ? documentById.get(item.rawDocumentId) : undefined,
      )
      .filter((item): item is RawDocument => Boolean(item));
  const uniqueUrlFor = (evidenceIds: string[]) => {
    const boundDocuments = documentsFor(evidenceIds);
    const domains = new Set(
      boundDocuments.map((document) => hostname(document.url)).filter(Boolean),
    );
    return domains.size === 1 ? boundDocuments[0]?.url : undefined;
  };
  const competitors = databases.competitor_database.map((entry) => ({
    ...entry,
    sourceIds: sourceIdsFor(entry.evidenceIds),
  }));
  const competitorById = new Map(
    competitors.map((entry) => [entry.competitorId, entry]),
  );
  const contentByTopic = new Map(
    databases.content_database.map((entry) => [entry.topic, entry]),
  );
  const websites = databases.website_structure_database.map((entry) => {
    const competitor = competitorById.get(entry.competitorId);
    const evidenceIds = competitor?.evidenceIds ?? [];
    const sourceIds = sourceIdsFor(evidenceIds);
    const sourceIdSet = new Set(sourceIds);
    const url = uniqueUrlFor(evidenceIds);
    const contentSignals = entry.contentSignals.filter((topic) => {
      const signal = contentByTopic.get(topic);
      return signal
        ? sourceIdsFor(signal.evidenceIds).some((sourceId) =>
            sourceIdSet.has(sourceId),
          )
        : false;
    });

    return {
      ...entry,
      url: url ?? "待复核：证据未唯一绑定单一域名",
      sourceIds,
      contentSignals,
      bindingStatus: url ? "uniquely_bound" : "needs_review",
    };
  });
  const painPoints = databases.pain_point_database.map((entry) => ({
    ...entry,
    sourceIds: sourceIdsFor(entry.evidenceIds),
  }));

  return {
    ...databases,
    evidence,
    competitor_database: competitors,
    website_structure_database: websites,
    pain_point_database: painPoints,
  };
}

function findingDetails(
  item: ResearchReviewItem,
  databases: ReturnType<typeof repairedDatabases>,
) {
  if (item.targetType === "competitor") {
    const target = databases.competitor_database.find(
      (entry) => entry.competitorId === item.targetId,
    );
    return {
      title: target?.name ?? item.targetId,
      evidenceIds: target?.evidenceIds ?? [],
      claimTexts: target ? [target.name, target.positioning] : [],
    };
  }
  if (item.targetType === "opportunity") {
    const target = databases.opportunity_database.find(
      (entry) => entry.opportunityId === item.targetId,
    );
    return {
      title: target?.title ?? item.targetId,
      evidenceIds: target?.evidenceIds ?? [],
      claimTexts: target ? [target.title, target.summary] : [],
    };
  }

  return { title: item.targetId, evidenceIds: [], claimTexts: [] };
}

function auditFindings(
  items: ResearchReviewItem[],
  databases: ReturnType<typeof repairedDatabases>,
  documents: RawDocument[],
) {
  const evidenceById = new Map(
    databases.evidence.map((item) => [item.id, item as ReplayEvidence]),
  );
  const documentById = new Map(documents.map((item) => [item.id, item]));

  return items.map((item) => {
    const details = findingDetails(item, databases);
    const findingEvidence = details.evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId))
      .filter((evidence): evidence is ReplayEvidence => Boolean(evidence));
    const evidenceTraceable =
      findingEvidence.length === details.evidenceIds.length &&
      findingEvidence.length > 0 &&
      findingEvidence.every((evidence) => {
        const document = evidence.rawDocumentId
          ? documentById.get(evidence.rawDocumentId)
          : undefined;
        return Boolean(
          document?.url && evidence.sourceId === document.sourceId,
        );
      });
    const quoteValidationPassed =
      findingEvidence.length > 0 &&
      findingEvidence.every(
        (evidence) => evidence.replayAudit.quoteValidationPassed,
      );
    const claimCompletenessRecorded =
      findingEvidence.length > 0 &&
      findingEvidence.every(
        (evidence) => evidence.validation?.claimSupportComplete === true,
      );
    const highRiskClaims = details.claimTexts.filter(
      hasUnsupportedQuantifiedClaim,
    );
    const highRiskClaimsSupported = highRiskClaims.every((claim) =>
      highRiskClaimHasDirectQuote(
        claim,
        findingEvidence.map((evidence) => evidence.quote),
      ),
    );
    const fullyVerifiable =
      evidenceTraceable &&
      quoteValidationPassed &&
      claimCompletenessRecorded &&
      highRiskClaimsSupported;

    return {
      reviewItemId: item.id,
      targetType: item.targetType,
      targetId: item.targetId,
      title: details.title,
      originalReviewStatus: item.status,
      evidenceIds: details.evidenceIds,
      evidenceTraceable,
      quoteValidationPassed,
      claimCompletenessRecorded,
      highRiskClaimCount: highRiskClaims.length,
      highRiskClaimsSupported,
      supportStatus: fullyVerifiable
        ? "full"
        : quoteValidationPassed
          ? "partial_legacy_claim_metadata_missing"
          : "unsupported",
      confirmed: item.status === "approved" && fullyVerifiable,
    };
  });
}

function sourceScore(
  trustedDocuments: number,
  trustedDomains: number,
  deepDocuments: number,
) {
  return (
    Math.min(trustedDocuments / 3, 1) * 10 +
    Math.min(trustedDomains / 2, 1) * 10 +
    Math.min(deepDocuments / 2, 1) * 10
  );
}

function stabilityScore(durationMs: number) {
  if (durationMs <= 180_000) return 10;
  if (durationMs <= 240_000) return 7;
  if (durationMs <= 300_000) return 3;
  return 0;
}

function requestsWithinOriginalCaps(run: SavedBenchmarkRun) {
  const counts = run.requestCounts ?? {};
  return (
    (counts.publicTotal ?? 0) <= 30 &&
    (counts.searchApi ?? 0) <= 2 &&
    (counts.firecrawl ?? 0) <= 8 &&
    (counts.llm ?? 0) <= 3
  );
}

function fingerprint(samplePath: string) {
  const hash = createHash("sha256");
  for (const fileName of [
    "input.json",
    "raw_documents.json",
    "databases.json",
    "review_items.json",
    "benchmark_run.json",
  ]) {
    hash.update(readFileSync(join(samplePath, fileName)));
  }
  return hash.digest("hex");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

async function replaySample(
  sample: (typeof samples)[number],
  outputDir: string,
) {
  const replayStarted = performance.now();
  const input = readJson<ResearchWorkflowInput>(
    join(sample.path, "input.json"),
  );
  const savedDocuments = readJson<RawDocument[]>(
    join(sample.path, "raw_documents.json"),
  );
  const savedDatabases = readJson<SavedDatabases>(
    join(sample.path, "databases.json"),
  );
  const savedReviewItems = readJson<SavedReviewItems>(
    join(sample.path, "review_items.json"),
  );
  const savedRun = readJson<SavedBenchmarkRun>(
    join(sample.path, "benchmark_run.json"),
  );
  const documents = replayDocuments(input, savedDocuments);
  const evidence = replayEvidence(savedDatabases.evidence, documents);
  const databases = repairedDatabases(savedDatabases, documents, evidence);
  const findings = auditFindings(savedReviewItems.items, databases, documents);
  const acceptedDocuments = documents.filter(
    (document) => document.sourceQuality.acceptedForReport,
  );
  const trustedDomains = new Set(
    acceptedDocuments.map((document) => hostname(document.url)).filter(Boolean),
  ).size;
  const deepDocuments = acceptedDocuments.filter((document) =>
    ["product_page", "collection_page", "blog", "rss", "content_api"].includes(
      document.sourceQuality.sourceType,
    ),
  ).length;
  const noiseByDocument = acceptedDocuments.map((document) => ({
    rawDocumentId: document.id,
    url: document.url,
    sourceType: document.sourceQuality.sourceType,
    relevance: document.sourceQuality.sourceRelevance,
    confidence: document.sourceQuality.sourceConfidence,
    residualNoiseCharacterCount:
      document.cleaningAudit?.residualNoiseCharacterCount ?? 0,
    cleanedCharacterCount: document.cleaningAudit?.cleanedLength ?? 0,
    residualNoiseRatio: document.cleaningAudit?.residualNoiseRatio ?? 0,
    removedRatio: document.cleaningAudit?.removedRatio ?? 0,
    representativeRemovedSegments:
      document.cleaningAudit?.removedSegments.slice(0, 8) ?? [],
    residualNoiseSegments: document.cleaningAudit?.residualNoiseSegments ?? [],
  }));
  const noiseRatios = noiseByDocument.map((item) => item.residualNoiseRatio);
  const medianResidualNoiseRatio = median(noiseRatios);
  const maximumResidualNoiseRatio = Math.max(0, ...noiseRatios);
  const fullFindings = findings.filter(
    (finding) => finding.supportStatus === "full",
  );
  const confirmedFindings = findings.filter((finding) => finding.confirmed);
  const quoteVerifiedFindings = findings.filter(
    (finding) => finding.quoteValidationPassed,
  );
  const verifiableFindingRatio = ratio(fullFindings.length, findings.length);
  const sourceCoverageScore = sourceScore(
    acceptedDocuments.length,
    trustedDomains,
    deepDocuments,
  );
  const findingScore = verifiableFindingRatio * 30;
  const cleanlinessScore = (1 - medianResidualNoiseRatio) * 15;
  const decisionUsabilityScore =
    confirmedFindings.filter((finding) => finding.targetType === "competitor")
      .length >= 2 &&
    confirmedFindings.filter((finding) => finding.targetType === "opportunity")
      .length >= 2 &&
    confirmedFindings.every((finding) => finding.highRiskClaimsSupported)
      ? 10
      : 0;
  const originalDurationMs = savedRun.durationMs ?? Number.POSITIVE_INFINITY;
  const runStabilityScore = stabilityScore(originalDurationMs);
  const costDisciplineScore = 5;
  const totalScore =
    sourceCoverageScore +
    findingScore +
    cleanlinessScore +
    decisionUsabilityScore +
    runStabilityScore +
    costDisciplineScore;
  const websiteBindings = databases.website_structure_database as Array<
    WebsiteStructureDatabaseEntry & { bindingStatus?: string }
  >;
  const entityCrossingCount = websiteBindings.filter((entry) => {
    if (entry.bindingStatus !== "uniquely_bound") return false;
    const competitor = databases.competitor_database.find(
      (candidate) => candidate.competitorId === entry.competitorId,
    );
    return !entry.sourceIds.every((sourceId) =>
      competitor?.sourceIds.includes(sourceId),
    );
  }).length;
  const unboundEntityCount = websiteBindings.filter(
    (entry) => entry.bindingStatus !== "uniquely_bound",
  ).length;
  const invalidConfirmedFindingCount = confirmedFindings.filter(
    (finding) =>
      finding.supportStatus !== "full" ||
      !finding.evidenceTraceable ||
      !finding.highRiskClaimsSupported,
  ).length;
  const hardGates = {
    trustedDocuments: acceptedDocuments.length >= minimumTrustedDocuments,
    trustedDomains: trustedDomains >= minimumTrustedDomains,
    deepDocuments: deepDocuments >= minimumDeepDocuments,
    verifiableFindingRatio:
      verifiableFindingRatio >= minimumVerifiableFindingRatio,
    medianResidualNoise:
      medianResidualNoiseRatio <= maximumMedianResidualNoiseRatio,
    maximumDocumentResidualNoise:
      maximumResidualNoiseRatio <= maximumDocumentResidualNoiseRatio,
    noInvalidConfirmedFindings: invalidConfirmedFindingCount === 0,
    noEntityCrossing: entityCrossingCount === 0,
    originalDuration: originalDurationMs <= 300_000,
    originalRequestCaps: requestsWithinOriginalCaps(savedRun),
    originalCashCostConfirmed:
      typeof savedRun.actualMonetaryCostYuan === "number",
    totalScore: totalScore >= 70,
  };
  const replayDurationMs = performance.now() - replayStarted;
  const result = {
    categoryId: sample.id,
    category: sample.label,
    samplePath: sample.path,
    sampleFingerprintSha256: fingerprint(sample.path),
    execution: {
      mode: "offline_saved_artifact_replay",
      providerRequests: 0,
      publicNetworkRequests: 0,
      incrementalApiCostYuan: 0,
      originalRunDurationMs: Number.isFinite(originalDurationMs)
        ? originalDurationMs
        : null,
      replayDurationMs,
      originalRequestCounts: savedRun.requestCounts ?? {},
      originalCashCostYuan: savedRun.actualMonetaryCostYuan ?? null,
    },
    sourceQuality: {
      totalDocuments: documents.length,
      trustedDocumentCount: acceptedDocuments.length,
      trustedDomainCount: trustedDomains,
      deepTrustedDocumentCount: deepDocuments,
      highRelevanceCount: acceptedDocuments.filter(
        (document) => document.sourceQuality.sourceRelevance === "high",
      ).length,
      highConfidenceCount: acceptedDocuments.filter(
        (document) => document.sourceQuality.sourceConfidence === "high",
      ).length,
      documents: acceptedDocuments.map((document) => ({
        rawDocumentId: document.id,
        title: document.title,
        url: document.url,
        sourceType: document.sourceQuality.sourceType,
        relevance: document.sourceQuality.sourceRelevance,
        confidence: document.sourceQuality.sourceConfidence,
      })),
    },
    bodyNoise: {
      metric: "deterministic_residual_known_noise_chars_over_cleaned_chars",
      medianResidualNoiseRatio,
      maximumResidualNoiseRatio,
      documents: noiseByDocument,
    },
    reportClaims: {
      totalFindingCount: findings.length,
      quoteVerifiedFindingCount: quoteVerifiedFindings.length,
      fullFindingCount: fullFindings.length,
      confirmedFindingCount: confirmedFindings.length,
      verifiableFindingRatio,
      invalidConfirmedFindingCount,
      legacyClaimCompletenessLimitation:
        "旧样例未保存同一声明全部 quotes 的完整性元数据；单条 quote 重放成功仍只能留在候选区。",
      findings,
    },
    entityBinding: {
      websiteEntryCount: websiteBindings.length,
      uniquelyBoundEntryCount: websiteBindings.length - unboundEntityCount,
      unboundEntityCount,
      entityCrossingCount,
      entries: websiteBindings.map((entry) => ({
        competitorId: entry.competitorId,
        url: entry.url,
        sourceIds: entry.sourceIds,
        bindingStatus: entry.bindingStatus,
      })),
    },
    scoring: {
      sourceCoverageScore,
      findingScore,
      cleanlinessScore,
      decisionUsabilityScore,
      runStabilityScore,
      costDisciplineScore,
      totalScore,
    },
    hardGates,
    evidencePipelinePass: Object.values(hardGates).every(Boolean),
  };

  const categoryOutputDir = join(outputDir, sample.id);
  await mkdir(categoryOutputDir, { recursive: true });
  await Promise.all([
    writeJson(join(categoryOutputDir, "replay.json"), result),
    writeJson(
      join(categoryOutputDir, "raw_documents.replayed.json"),
      documents,
    ),
    writeJson(join(categoryOutputDir, "databases.repaired.json"), databases),
  ]);

  return result;
}

function scorecardMarkdown(summary: {
  runId: string;
  startedAt: string;
  finishedAt: string;
  categories: Awaited<ReturnType<typeof replaySample>>[];
  deepPageFixtures: Awaited<
    ReturnType<typeof verifyAllDeepPageDiscoveryFixtures>
  >;
  internalRepairAcceptance: Record<string, boolean>;
  evidencePipelineConclusion: string;
  commercializationAssessment: {
    status: "not_evaluated";
    reason: string;
  };
}) {
  const lines = [
    "# 行业研究生产台证据修复离线 Replay",
    "",
    `- Run：${summary.runId}`,
    `- 时间：${summary.startedAt} → ${summary.finishedAt}`,
    "- 模式：只读旧样例 + 本地 fixtures；provider/public network/API cost 均为 0。",
    "- 口径：正文噪音使用确定性清洗后的已知残余噪音字符占比；旧样例缺失声明完整性元数据时一律不升级为 full。",
    "",
    "## 统一评分表",
    "",
    "| 品类 | 分数 | 可信文档 / 域名 | 深页 | 噪音中位 / 最大 | quote 可复核 | full 可证实 | 原耗时 | 实体串线 | 证据流水线门槛 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...summary.categories.map((category) =>
      [
        `| ${category.category}`,
        `${category.scoring.totalScore.toFixed(2)}/100`,
        `${category.sourceQuality.trustedDocumentCount} / ${category.sourceQuality.trustedDomainCount}`,
        `${category.sourceQuality.deepTrustedDocumentCount}`,
        `${formatPercent(category.bodyNoise.medianResidualNoiseRatio)} / ${formatPercent(category.bodyNoise.maximumResidualNoiseRatio)}`,
        `${category.reportClaims.quoteVerifiedFindingCount}/${category.reportClaims.totalFindingCount}`,
        `${category.reportClaims.fullFindingCount}/${category.reportClaims.totalFindingCount} = ${formatPercent(category.reportClaims.verifiableFindingRatio)}`,
        `${((category.execution.originalRunDurationMs ?? 0) / 1000).toFixed(3)} 秒`,
        `${category.entityBinding.entityCrossingCount}`,
        category.evidencePipelinePass ? "PASS |" : "FAIL |",
      ].join(" | "),
    ),
    "",
    "## 三品类深页 fixture",
    "",
    "| 品类 | 预期类型 | nested sitemap | 结果 |",
    "|---|---|---|---|",
    ...summary.deepPageFixtures.map(
      (fixture) =>
        `| ${fixture.category} | ${fixture.expectedKind} | ${fixture.nestedSitemapFetched ? "已读取" : "未读取"} | ${fixture.passed ? "PASS" : "FAIL"} |`,
    ),
    "",
    "## 内部修复验收",
    "",
    ...Object.entries(summary.internalRepairAcceptance).map(
      ([key, passed]) => `- ${key}：${passed ? "PASS" : "FAIL"}`,
    ),
    "",
    "## 证据流水线结论",
    "",
    summary.evidencePipelineConclusion,
    "",
    "## 商业化判断",
    "",
    `- 状态：${summary.commercializationAssessment.status}`,
    `- 原因：${summary.commercializationAssessment.reason}`,
    "",
    "说明：深页 fixture 证明发现逻辑能在三品类离线场景保留证据型深页，不等于旧保存 run 已经实际抓到深页；重新跑真实核心 benchmark 仍需新的预算确认。",
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const started = new Date();
  const runId = `${replayVersion}-${timestampForPath(started)}`;
  const outputDir = join(
    "outputs",
    "industry-research-benchmarks",
    replayVersion,
    runId,
  );
  await mkdir(outputDir, { recursive: true });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline_replay_network_forbidden");
  };

  try {
    const categories = [];
    for (const sample of samples) {
      categories.push(await replaySample(sample, outputDir));
    }
    const deepPageFixtures = await verifyAllDeepPageDiscoveryFixtures();
    const internalRepairAcceptance = {
      acceptedNoiseMedianAtMost25Percent: categories.every(
        (category) => category.hardGates.medianResidualNoise,
      ),
      noAcceptedDocumentAbove50PercentNoise: categories.every(
        (category) => category.hardGates.maximumDocumentResidualNoise,
      ),
      zeroEntityCrossing: categories.every(
        (category) => category.entityBinding.entityCrossingCount === 0,
      ),
      zeroInvalidConfirmedFindings: categories.every(
        (category) => category.reportClaims.invalidConfirmedFindingCount === 0,
      ),
      everyConfirmedEvidenceTraceable: categories.every((category) =>
        category.reportClaims.findings
          .filter((finding) => finding.confirmed)
          .every((finding) => finding.evidenceTraceable),
      ),
      threeCategoryDeepPageFixturesPass:
        deepPageFixtures.length === 3 &&
        deepPageFixtures.every((fixture) => fixture.passed),
      zeroProviderOrNetworkRequests: categories.every(
        (category) =>
          category.execution.providerRequests === 0 &&
          category.execution.publicNetworkRequests === 0,
      ),
    };
    const evidencePipelinePassCount = categories.filter(
      (category) => category.evidencePipelinePass,
    ).length;
    const evidencePipelineConclusion =
      evidencePipelinePassCount >= 2
        ? "离线证据流水线已具备申请一次受控真实复跑的条件。"
        : "证据流水线尚未达到稳定交付标准；下一步只修复来源深度、声明完整性和证据绑定，不据此判断市场或项目应停止。";
    const commercializationAssessment = {
      status: "not_evaluated" as const,
      reason: "离线 replay 不测真实用户需求、付费意愿、获客、留存或交付毛利。",
    };
    const finished = new Date();
    const summary = {
      schemaVersion: "industry_research_evidence_repair_replay.v2",
      replayVersion,
      runId,
      outputDir,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      executionBoundary: {
        savedArtifactsOnly: true,
        fixtureFetchersOnly: true,
        environmentFileLoaded: false,
        providerRequests: 0,
        publicNetworkRequests: 0,
        incrementalApiCostYuan: 0,
        originalSampleDirectoriesModified: false,
      },
      thresholds: {
        minimumTrustedDocuments,
        minimumTrustedDomains,
        minimumDeepDocuments,
        minimumVerifiableFindingRatio,
        maximumMedianResidualNoiseRatio,
        maximumDocumentResidualNoiseRatio,
      },
      categories,
      deepPageFixtures,
      internalRepairAcceptance,
      internalRepairPass: Object.values(internalRepairAcceptance).every(
        Boolean,
      ),
      evidencePipelinePassCount,
      evidencePipelineConclusion,
      commercializationAssessment,
    };

    await Promise.all([
      writeJson(join(outputDir, "scorecard.json"), summary),
      writeFile(
        join(outputDir, "scorecard.md"),
        scorecardMarkdown(summary),
        "utf8",
      ),
    ]);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(process.cwd(), "[workspace]"));
  process.exit(1);
});
