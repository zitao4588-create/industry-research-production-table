export type SafeReportSummary = {
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
}: {
  databases: unknown;
  runLog: unknown;
}): SafeReportSummary | undefined {
  const databaseRecord = record(databases);
  if (!databaseRecord) return undefined;

  const competitors = array(databaseRecord.competitor_database)
    .map((item) => ({
      name: text(item.name),
      channel: text(item.channel, "未标注"),
      positioning: text(item.positioning, "暂无定位摘要"),
      market: text(item.market, "未标注"),
    }))
    .filter((item) => item.name)
    .slice(0, 5);

  const allOpportunities = array(databaseRecord.opportunity_database)
    .map((item) => ({
      title: text(item.title),
      summary: text(item.summary, "暂无机会摘要"),
      total: number(item.totalScore),
      status: text(item.reviewStatus, "needs_review"),
    }))
    .filter((item) => item.title)
    .sort((a, b) => b.total - a.total);

  const runLogRecord = record(runLog);
  const counts = record(runLogRecord?.counts);

  return {
    counts: {
      evidence: number(counts?.evidence),
      competitors: array(databaseRecord.competitor_database).length,
      opportunities: allOpportunities.length,
    },
    competitors,
    opportunities: allOpportunities.slice(0, 3),
  };
}
