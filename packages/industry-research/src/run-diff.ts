import type { WeeklyIntelligenceReportEntry } from "./types";

/**
 * 跨 run diff（T6）：把同一研究项目相邻两次 run 的 databases.json 差异
 * 变成真实周报条目，替代真实模式恒为空的 weekly_intelligence_reports。
 *
 * 只使用跨 run 稳定的键做对比：竞品名、关键词、内容(平台|话题)、
 * 痛点主题、机会标题与总分。product_database 的 name 是位置生成的
 * （"<品类> 信号 N"），不稳定，因此产品维度改用标签集合对比。
 * diff 是对既有真实数据的派生统计，不引入新的业务断言。
 */
export type RunDiffDatabases = {
  competitorNames: string[];
  keywords: string[];
  contentTopics: string[];
  painPointThemes: string[];
  productTags: string[];
  opportunities: Array<{ title: string; totalScore: number }>;
};

export type OpportunityScoreChange = {
  title: string;
  previousScore: number;
  currentScore: number;
};

export type IndustryResearchRunDiff = {
  baselineRunId: string;
  newCompetitors: string[];
  removedCompetitors: string[];
  newKeywords: string[];
  removedKeywords: string[];
  newContentTopics: string[];
  newPainPointThemes: string[];
  newProductTags: string[];
  newOpportunities: string[];
  opportunityScoreChanges: OpportunityScoreChange[];
  hasChanges: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(item: unknown, field: string) {
  return isRecord(item) && typeof item[field] === "string"
    ? item[field].trim()
    : "";
}

function numberField(item: unknown, field: string) {
  return isRecord(item) && typeof item[field] === "number" ? item[field] : 0;
}

function stringArrayField(item: unknown, field: string) {
  return isRecord(item)
    ? asArray(item[field]).filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** 从 databases.json 的未知 JSON 安全提取 diff 所需的稳定键。 */
export function coerceRunDiffDatabases(value: unknown): RunDiffDatabases {
  const data = isRecord(value) ? value : {};
  const competitorNames = asArray(data.competitor_database).map((item) =>
    stringField(item, "name"),
  );
  const keywords = asArray(data.keyword_database).map((item) =>
    stringField(item, "keyword"),
  );
  const contentTopics = asArray(data.content_database).map((item) =>
    [stringField(item, "platform"), stringField(item, "topic")]
      .filter(Boolean)
      .join(" | "),
  );
  const painPointThemes = asArray(data.pain_point_database).map((item) =>
    stringField(item, "theme"),
  );
  const productTags = asArray(data.product_database).flatMap((item) =>
    stringArrayField(item, "tags"),
  );
  const opportunities = asArray(data.opportunity_database)
    .map((item) => ({
      title: stringField(item, "title"),
      totalScore: numberField(item, "totalScore"),
    }))
    .filter((item) => item.title);

  return {
    competitorNames: uniqueStrings(competitorNames),
    keywords: uniqueStrings(keywords),
    contentTopics: uniqueStrings(contentTopics),
    painPointThemes: uniqueStrings(painPointThemes),
    productTags: uniqueStrings(productTags),
    opportunities,
  };
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function setDiff(previous: string[], current: string[]) {
  const previousKeys = new Set(previous.map(normalizeKey));
  const currentKeys = new Set(current.map(normalizeKey));

  return {
    added: current.filter((value) => !previousKeys.has(normalizeKey(value))),
    removed: previous.filter((value) => !currentKeys.has(normalizeKey(value))),
  };
}

export function diffIndustryResearchDatabases(
  previous: RunDiffDatabases,
  current: RunDiffDatabases,
  baselineRunId: string,
): IndustryResearchRunDiff {
  const competitors = setDiff(
    previous.competitorNames,
    current.competitorNames,
  );
  const keywords = setDiff(previous.keywords, current.keywords);
  const contentTopics = setDiff(previous.contentTopics, current.contentTopics);
  const painPointThemes = setDiff(
    previous.painPointThemes,
    current.painPointThemes,
  );
  const productTags = setDiff(previous.productTags, current.productTags);
  const previousOpportunities = new Map(
    previous.opportunities.map((item) => [normalizeKey(item.title), item]),
  );
  const newOpportunities: string[] = [];
  const opportunityScoreChanges: OpportunityScoreChange[] = [];

  for (const opportunity of current.opportunities) {
    const previousOpportunity = previousOpportunities.get(
      normalizeKey(opportunity.title),
    );

    if (!previousOpportunity) {
      newOpportunities.push(opportunity.title);
      continue;
    }

    if (previousOpportunity.totalScore !== opportunity.totalScore) {
      opportunityScoreChanges.push({
        title: opportunity.title,
        previousScore: previousOpportunity.totalScore,
        currentScore: opportunity.totalScore,
      });
    }
  }

  const diff: IndustryResearchRunDiff = {
    baselineRunId,
    newCompetitors: competitors.added,
    removedCompetitors: competitors.removed,
    newKeywords: keywords.added,
    removedKeywords: keywords.removed,
    newContentTopics: contentTopics.added,
    newPainPointThemes: painPointThemes.added,
    newProductTags: productTags.added,
    newOpportunities,
    opportunityScoreChanges,
    hasChanges: false,
  };

  diff.hasChanges =
    diff.newCompetitors.length > 0 ||
    diff.removedCompetitors.length > 0 ||
    diff.newKeywords.length > 0 ||
    diff.removedKeywords.length > 0 ||
    diff.newContentTopics.length > 0 ||
    diff.newPainPointThemes.length > 0 ||
    diff.newProductTags.length > 0 ||
    diff.newOpportunities.length > 0 ||
    diff.opportunityScoreChanges.length > 0;

  return diff;
}

function labelled(prefix: string, values: string[], limit = 6) {
  return values.slice(0, limit).map((value) => `${prefix}：${value}`);
}

export function createWeeklyIntelligenceReportFromDiff({
  projectId,
  category,
  weekOf,
  diff,
}: {
  projectId: string;
  category: string;
  weekOf: string;
  diff: IndustryResearchRunDiff;
}): WeeklyIntelligenceReportEntry {
  const newSignals = [
    ...labelled("新增竞品", diff.newCompetitors),
    ...labelled("新增关键词", diff.newKeywords),
    ...labelled("新增内容话题", diff.newContentTopics),
    ...labelled("新增痛点主题", diff.newPainPointThemes),
    ...labelled("新增产品标签", diff.newProductTags),
  ];
  const watchList = [
    ...labelled("新增机会", diff.newOpportunities),
    ...diff.opportunityScoreChanges
      .slice(0, 6)
      .map(
        (change) =>
          `机会分变化：${change.title}（${change.previousScore} → ${change.currentScore}）`,
      ),
    ...labelled("消失竞品（待复核）", diff.removedCompetitors),
    ...labelled("消失关键词（待复核）", diff.removedKeywords),
  ];

  return {
    id: "weekly-intel-run-diff-1",
    projectId,
    weekOf,
    title: `${category} 情报对比：对比上一次 run（${diff.baselineRunId}）`,
    summary: diff.hasChanges
      ? `与上一次 run（${diff.baselineRunId}）对比：新增竞品 ${diff.newCompetitors.length}、新增关键词 ${diff.newKeywords.length}、新增内容话题 ${diff.newContentTopics.length}、新增机会 ${diff.newOpportunities.length}、机会分变化 ${diff.opportunityScoreChanges.length}。差异为派生统计，具体结论仍以证据与人工审核为准。`
      : `与上一次 run（${diff.baselineRunId}）对比未发现结构化差异；来源与结论保持稳定。`,
    newSignals,
    watchList,
    evidenceIds: [],
  };
}

export function createBaselineWeeklyIntelligenceReport({
  projectId,
  category,
  weekOf,
  runId,
}: {
  projectId: string;
  category: string;
  weekOf: string;
  runId: string;
}): WeeklyIntelligenceReportEntry {
  return {
    id: "weekly-intel-baseline-1",
    projectId,
    weekOf,
    title: `${category} 情报基线（${runId}）`,
    summary:
      "本期为该研究项目的首次留档 run，作为后续周报 diff 的基线；无上一次 run 可对比。",
    newSignals: [],
    watchList: [],
    evidenceIds: [],
  };
}

/**
 * 把上一次 run 的结构化结论压缩成 LLM 抽取的历史上下文（T8）。
 * 只做对比与延续性提示；调用方必须在 prompt 中声明这些内容
 * 不得作为 evidenceQuotes 来源（validator 也会拒绝非本次采集的 quote）。
 */
export function buildHistoricalContextFromDatabases(
  previousRunId: string,
  databases: unknown,
): string[] {
  const coerced = coerceRunDiffDatabases(databases);
  const lines: string[] = [];

  if (coerced.competitorNames.length > 0) {
    lines.push(
      `上一次 run（${previousRunId}）已识别竞品：${coerced.competitorNames.slice(0, 8).join("、")}`,
    );
  }

  if (coerced.opportunities.length > 0) {
    lines.push(
      `上一次 run 的机会评分：${coerced.opportunities
        .slice(0, 6)
        .map((item) => `${item.title}（${item.totalScore}）`)
        .join("、")}`,
    );
  }

  if (coerced.keywords.length > 0) {
    lines.push(
      `上一次 run 的关键词：${coerced.keywords.slice(0, 12).join("、")}`,
    );
  }

  if (coerced.painPointThemes.length > 0) {
    lines.push(
      `上一次 run 的痛点主题：${coerced.painPointThemes.slice(0, 6).join("、")}`,
    );
  }

  return lines;
}

export function formatRunDiffMarkdownSection(
  diff: IndustryResearchRunDiff | null,
  baselineRunId?: string,
) {
  if (!diff) {
    return [
      "## 本期新增与变化",
      "",
      baselineRunId
        ? `- 本期为基线 run（${baselineRunId}），无上一次 run 可对比。`
        : "- 本期为基线 run，无上一次 run 可对比。",
    ].join("\n");
  }

  const lines = [
    "## 本期新增与变化",
    "",
    `- 对比基线：上一次 run \`${diff.baselineRunId}\``,
  ];

  if (!diff.hasChanges) {
    lines.push("- 未发现结构化差异；来源与结论保持稳定。");
    return lines.join("\n");
  }

  const sections: Array<[string, string[]]> = [
    ["新增竞品", diff.newCompetitors],
    ["消失竞品（待复核）", diff.removedCompetitors],
    ["新增关键词", diff.newKeywords],
    ["消失关键词（待复核）", diff.removedKeywords],
    ["新增内容话题", diff.newContentTopics],
    ["新增痛点主题", diff.newPainPointThemes],
    ["新增产品标签", diff.newProductTags],
    ["新增机会", diff.newOpportunities],
  ];

  for (const [label, values] of sections) {
    if (values.length > 0) {
      lines.push(`- ${label}（${values.length}）：${values.join("、")}`);
    }
  }

  for (const change of diff.opportunityScoreChanges) {
    lines.push(
      `- 机会分变化：${change.title} ${change.previousScore} → ${change.currentScore}`,
    );
  }

  lines.push(
    "- 说明：以上差异是对两次 run 结构化数据库的派生统计，具体业务结论仍以证据索引与人工审核为准。",
  );

  return lines.join("\n");
}
