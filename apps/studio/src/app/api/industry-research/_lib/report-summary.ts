export type SafeReportSummary = {
  quality: {
    status: "usable" | "technical_blocked" | "insufficient_evidence";
    canUseReport: boolean;
    confirmedFindings: number;
    needsReviewFindings: number;
    effectiveEvidence: number;
    technicalFailureCount: number;
  };
  counts: {
    evidence: number;
    competitors: number;
    opportunities: number;
  };
  competitors: Array<{
    name: string;
    channel: string;
    positioning: string;
    market: string;
  }>;
  opportunities: Array<{
    title: string;
    summary: string;
    total: number;
    status: string;
  }>;
};

export type SafeReportInput = {
  projectName: string;
  industry: string;
  category: string;
  market: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(record).filter((item) => item !== null)
    : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function confirmedFindingTitles(markdown: string) {
  const confirmedSection = markdown.match(
    /(?:^|\n)## 已确认发现\s*\n([\s\S]*?)(?=\n##\s|$)/,
  )?.[1];

  if (!confirmedSection) return new Set<string>();

  return new Set(
    [...confirmedSection.matchAll(/^###\s+(.+?)\s*$/gm)].map((match) =>
      match[1].trim().toLocaleLowerCase(),
    ),
  );
}

export function buildSafeReportInput(input: unknown): SafeReportInput | null {
  const item = record(input);
  if (!item) return null;
  return {
    projectName: text(item.projectName),
    industry: text(item.industry),
    category: text(item.category),
    market: text(item.market),
  };
}

export function buildSafeReportSummary({
  databases,
  runLog,
  reportMarkdown = "",
}: {
  databases: unknown;
  runLog: unknown;
  reportMarkdown?: string;
}): SafeReportSummary {
  const databaseRecord = record(databases) ?? {};

  const runLogRecord = record(runLog);
  const credibility = record(runLogRecord?.credibility);
  const confirmedFindings = number(credibility?.confirmedFindings);
  const needsReviewFindings = number(credibility?.needsReviewFindings);
  const effectiveEvidence = number(credibility?.effectiveEvidence);
  const technicalFailureCount = Math.max(
    number(credibility?.crawlFailures),
    array(runLogRecord?.crawlFailures).length,
  );
  const status =
    confirmedFindings > 0
      ? "usable"
      : technicalFailureCount > 0
        ? "technical_blocked"
        : "insufficient_evidence";
  const confirmedTitles = confirmedFindingTitles(reportMarkdown);

  const competitors = array(databaseRecord.competitor_database)
    .map((item) => ({
      name: text(item.name),
      channel: text(item.channel, "未标注"),
      positioning: text(item.positioning, "暂无定位摘要"),
      market: text(item.market, "未标注"),
    }))
    .filter(
      (item) => item.name && confirmedTitles.has(item.name.toLocaleLowerCase()),
    )
    .slice(0, 5);

  const allOpportunities = array(databaseRecord.opportunity_database)
    .map((item) => ({
      title: text(item.title),
      summary: text(item.summary, "暂无机会摘要"),
      total: number(item.totalScore),
      status: text(item.reviewStatus, "needs_review"),
    }))
    .filter(
      (item) =>
        item.title && confirmedTitles.has(item.title.toLocaleLowerCase()),
    )
    .sort((a, b) => b.total - a.total);

  return {
    quality: {
      status,
      canUseReport: status === "usable",
      confirmedFindings,
      needsReviewFindings,
      effectiveEvidence,
      technicalFailureCount,
    },
    counts: {
      evidence: status === "usable" ? effectiveEvidence : 0,
      competitors: competitors.length,
      opportunities: allOpportunities.length,
    },
    competitors,
    opportunities: allOpportunities.slice(0, 3),
  };
}
