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
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : fallback;
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

function markdownSection(markdown: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.match(
    new RegExp(
      `(?:^|\\n)## ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    ),
  )?.[1];
}

function reviewedItemBlocks(section: string | undefined) {
  if (!section) return [];

  return section
    .split(/(?=^###\s+)/gm)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "));
}

function reviewedItemType(block: string) {
  return block.match(/^- 类型：(.+?)\s*$/m)?.[1]?.trim() ?? "";
}

function publicReportTitle(input: SafeReportInput | null) {
  return input?.projectName || input?.category || input?.industry || "行业研究";
}

function buildUnavailablePublicReportMarkdown({
  input,
  summary,
}: {
  input: SafeReportInput | null;
  summary: SafeReportSummary;
}) {
  const technical = summary.quality.status === "technical_blocked";

  return [
    `# ${publicReportTitle(input)} - 公开研究结果`,
    "",
    "## 质量状态",
    "",
    `- 状态：${technical ? "技术失败" : "证据不足"}`,
    "- 可作为行业报告使用：否",
    "- 已确认发现：0",
    `- 待核查线索：${summary.quality.needsReviewFindings}`,
    `- 技术问题：${summary.quality.technicalFailureCount}`,
    "",
    "## 结果说明",
    "",
    technical
      ? "本次资料采集或处理受到技术问题阻塞，没有生成可用的行业报告。"
      : "本次没有形成足够、可回到原网页核对的证据，因此没有生成可用的行业报告。",
    "",
    "## 已确认发现",
    "",
    "- 暂无。",
    "",
    "## 跨来源推断",
    "",
    "- 暂无。未通过公开报告门禁的推断不会显示。",
    "",
    "## 待验证机会假设",
    "",
    "- 暂无。未通过公开报告门禁的候选不会显示。",
    "",
    "## 数据缺口",
    "",
    "- 需要重新采集与目标行业直接相关、无需登录且可以核对原文的公开资料。",
    "- 需要为每条事实补齐原始 URL、准确引用和来源日期。",
    "",
    "## 使用边界",
    "",
    "证据不足或技术失败只表示本次研究没有完成，不代表行业没有机会，也不能据此作出继续、停止项目或停止商业化的结论。",
  ].join("\n");
}

/**
 * 公开分享和下载只展示通过 reviewed report 门禁的内容。
 * 内部候选、拒绝项、阻塞日志和全量证据索引不会进入公开 Markdown。
 */
export function buildSafePublicReportMarkdown({
  input,
  reportMarkdown,
  summary,
}: {
  input: SafeReportInput | null;
  reportMarkdown: string;
  summary: SafeReportSummary;
}) {
  if (!summary.quality.canUseReport) {
    return buildUnavailablePublicReportMarkdown({ input, summary });
  }

  const confirmedBlocks = reviewedItemBlocks(
    markdownSection(reportMarkdown, "已确认发现"),
  );
  const opportunityBlocks = confirmedBlocks
    .filter((block) => reviewedItemType(block) === "opportunity")
    .map((block) =>
      block
        .replace(/^- 状态：confirmed\s*$/m, "- 状态：待验证假设")
        .replace(
          /^- 可进入已确认发现：true\s*$/m,
          "- 证据门禁：已通过（只证明事实基础，不代表商业机会已经验证）",
        ),
    );
  const factualBlocks = confirmedBlocks.filter(
    (block) => reviewedItemType(block) !== "opportunity",
  );

  return [
    `# ${publicReportTitle(input)} - 公开行业研究报告`,
    "",
    "## 质量状态",
    "",
    "- 状态：可用，仍需人工复核",
    `- 已确认发现：${summary.quality.confirmedFindings}`,
    `- 有效证据：${summary.quality.effectiveEvidence}`,
    "- 商业化判断：未评估",
    "",
    "## 已确认发现",
    "",
    factualBlocks.length > 0
      ? factualBlocks.join("\n\n")
      : "- 暂无可单独列为事实的非机会条目。",
    "",
    "## 跨来源推断",
    "",
    "- 本公开版本不把未确认候选自动升级为跨来源推断。",
    "",
    "## 待验证机会假设",
    "",
    opportunityBlocks.length > 0
      ? [
          "以下内容是待验证假设，不是已成立的商业结论。",
          "",
          opportunityBlocks.join("\n\n"),
        ].join("\n")
      : "- 暂无通过公开报告门禁的机会假设。",
    "",
    "## 数据缺口",
    "",
    "- 未通过门禁的候选、冲突信息和覆盖缺口不会被当作已确认事实公开。",
    "- 市场规模、排名、功效或商业效果等高风险结论仍需与结论角色匹配的可靠原始来源。",
    "",
    "## 使用边界",
    "",
    "本报告只能说明本次公开资料研究形成了哪些可追溯发现。它不能替代真实用户与经营验证，也不会自动作出继续或停止商业化的结论。",
  ].join("\n");
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
  const reportedConfirmedFindings = number(credibility?.confirmedFindings);
  const needsReviewFindings = number(credibility?.needsReviewFindings);
  const effectiveEvidence = number(credibility?.effectiveEvidence);
  const technicalFailureCount = Math.max(
    number(credibility?.crawlFailures),
    array(runLogRecord?.crawlFailures).length,
  );
  const confirmedTitles = confirmedFindingTitles(reportMarkdown);
  const confirmedFindings = Math.min(
    reportedConfirmedFindings,
    confirmedTitles.size,
  );
  const status =
    confirmedFindings > 0
      ? "usable"
      : technicalFailureCount > 0
        ? "technical_blocked"
        : "insufficient_evidence";

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
