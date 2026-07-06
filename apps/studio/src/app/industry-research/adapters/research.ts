import {
  ecommerceCompetitorResearchTemplate,
  type IndustryResearchDatabaseName,
  type ResearchReviewStatus,
  type ResearchWorkflowInput,
  type ResearchWorkflowResult,
  type SourceDiscoveryMethod,
} from "@industry-research/core";

export type UIResearchProject = {
  name: string;
  template: "ecommerce_competitor_research";
  templateName: string;
  industry: string;
  category: string;
  market: string;
  goal: string;
};

export type UIWorkflowStep = {
  id: ResearchWorkflowResult["workflowSteps"][number]["id"];
  title: string;
  desc: string;
};

export type UISourceCandidate = {
  method: SourceDiscoveryMethod;
  title: string;
  seed: string;
  priority: "low" | "medium" | "high";
  db: IndustryResearchDatabaseName[];
};

/** 单条可溯源证据引用：来源标题 / URL / 原文片段。 */
export type UIEvidenceRef = {
  id: string;
  quote: string;
  url?: string;
  source?: string;
  reliability?: string;
};

export type UICompetitor = {
  name: string;
  channel: string;
  positioning: string;
  market: string;
  structure: string[];
  evidence: number;
  evidenceRefs?: UIEvidenceRef[];
  positioningNote?: string;
};

export type UIProduct = {
  name: string;
  competitor: string;
  category: string;
  price: string;
  tags: string[];
};

export type UIPainPoint = {
  theme: string;
  need: string;
  freq: "low" | "medium" | "high";
  evidence: number;
  evidenceRefs?: UIEvidenceRef[];
};

export type UIContentSignal = {
  platform: string;
  topic: string;
  type: "exposure" | "growth" | "save" | "conversion" | "personal_brand";
  why: string;
  evidence: number;
  evidenceRefs?: UIEvidenceRef[];
};

export type UIKeyword = {
  keyword: string;
  intent: "research" | "comparison" | "purchase" | "pain_point";
  source: string;
};

export type UIOpportunity = {
  title: string;
  summary: string;
  demand: number;
  competition: number;
  gap: number;
  value: number;
  evidence: number;
  total: number;
  status: ResearchReviewStatus;
  evidenceRefs?: UIEvidenceRef[];
};

export type UIWeeklyReport = {
  weekOf: string;
  title: string;
  summary: string;
  newSignals: string[];
  watchList: string[];
};

export type UIDatabaseSummary = {
  id: IndustryResearchDatabaseName;
  label: string;
  count: number;
  sample: string;
  icon:
    | "source"
    | "competitor"
    | "structure"
    | "product"
    | "keyword"
    | "pain"
    | "content"
    | "opportunity"
    | "weekly";
};

export type UIResearchStats = {
  candidates: number;
  rawDocs: number;
  extractionJobs: number;
  evidence: number;
  crawlJobs: number;
};

export type UIResearchModel = {
  project: UIResearchProject;
  workflowSteps: UIWorkflowStep[];
  sourceCandidates: UISourceCandidate[];
  competitors: UICompetitor[];
  products: UIProduct[];
  painPoints: UIPainPoint[];
  contentSignals: UIContentSignal[];
  keywords: UIKeyword[];
  opportunities: UIOpportunity[];
  weekly: UIWeeklyReport;
  databases: UIDatabaseSummary[];
  stats: UIResearchStats;
};

const databaseMeta = [
  ["source_database", "信息源库", "source"],
  ["competitor_database", "竞品库", "competitor"],
  ["website_structure_database", "网站结构库", "structure"],
  ["product_database", "产品库", "product"],
  ["keyword_database", "关键词库", "keyword"],
  ["pain_point_database", "用户痛点库", "pain"],
  ["content_database", "内容库", "content"],
  ["opportunity_database", "机会库", "opportunity"],
  ["weekly_intelligence_reports", "行业情报周报库", "weekly"],
] satisfies Array<
  [
    IndustryResearchDatabaseName,
    UIDatabaseSummary["label"],
    UIDatabaseSummary["icon"],
  ]
>;

function firstText(values: Array<string | undefined>, fallback: string) {
  return values.find((value) => value?.trim()) ?? fallback;
}

function marketShort(market: string) {
  if (/美国|US|U\.S\./i.test(market)) {
    return "US";
  }

  return market;
}

function createProjectFromInput(
  input: ResearchWorkflowInput,
): UIResearchProject {
  return {
    name: input.projectName,
    template: "ecommerce_competitor_research",
    templateName: ecommerceCompetitorResearchTemplate.name,
    industry: input.industry,
    category: input.category,
    market: input.market,
    goal: input.researchGoal,
  };
}

function createProjectFromRun(raw: ResearchWorkflowResult): UIResearchProject {
  const project = raw.research_projects[0];

  if (!project) {
    return createProjectFromInput({
      projectName: "未命名行业研究",
      industry: "",
      category: "",
      market: "",
      researchGoal: "",
      templateId: "ecommerce_competitor_research",
      urls: [],
      csvText: "",
      manualText: "",
    });
  }

  return {
    name: project.name,
    template: project.templateId,
    templateName: ecommerceCompetitorResearchTemplate.name,
    industry: project.industry,
    category: project.category,
    market: project.market,
    goal: project.goal,
  };
}

function createDatabases(raw: ResearchWorkflowResult): UIDatabaseSummary[] {
  return databaseMeta.map(([id, label, icon]) => {
    switch (id) {
      case "source_database":
        return {
          id,
          label,
          icon,
          count: raw.source_database.length,
          sample: firstText(
            [
              raw.source_database[0]?.title,
              raw.source_discovery_plans[0]?.notes[0],
            ],
            "公开搜索 · 官网 · RSS · sitemap",
          ),
        };
      case "competitor_database":
        return {
          id,
          label,
          icon,
          count: raw.competitor_database.length,
          sample: firstText(
            [
              raw.competitor_database
                .slice(0, 3)
                .map((item) => item.name)
                .join(" · "),
            ],
            "品牌、渠道和定位",
          ),
        };
      case "website_structure_database":
        return {
          id,
          label,
          icon,
          count: raw.website_structure_database.length,
          sample: firstText(
            [raw.website_structure_database[0]?.sections.join(" / ")],
            "导航 / collection / blog 结构",
          ),
        };
      case "product_database":
        return {
          id,
          label,
          icon,
          count: raw.product_database.length,
          sample: firstText(
            [raw.product_database[0]?.tags.join(" · ")],
            "剂型 · 价格 · 标签 · 爆品线索",
          ),
        };
      case "keyword_database":
        return {
          id,
          label,
          icon,
          count: raw.keyword_database.length,
          sample: firstText(
            [raw.keyword_database[0]?.keyword],
            "意图分层 · 长尾",
          ),
        };
      case "pain_point_database":
        return {
          id,
          label,
          icon,
          count: raw.pain_point_database.length,
          sample: firstText(
            [raw.pain_point_database[0]?.theme],
            "软便 · 适口性 · 成分透明",
          ),
        };
      case "content_database":
        return {
          id,
          label,
          icon,
          count: raw.content_database.length,
          sample: firstText(
            [raw.content_database[0]?.topic],
            "爆款话题 · 渠道 · 内容类型",
          ),
        };
      case "opportunity_database":
        return {
          id,
          label,
          icon,
          count: raw.opportunity_database.length,
          sample: firstText(
            [raw.opportunity_database[0]?.title],
            "评分 · 审核状态",
          ),
        };
      case "weekly_intelligence_reports":
        return {
          id,
          label,
          icon,
          count: raw.weekly_intelligence_reports.length,
          sample: firstText(
            [raw.weekly_intelligence_reports[0]?.title],
            "新增信号 · 监控列表",
          ),
        };
    }

    return {
      id,
      label,
      icon,
      count: 0,
      sample: "等待建库",
    };
  });
}

export function createModelFromInput(
  input: ResearchWorkflowInput,
): UIResearchModel {
  return {
    project: createProjectFromInput(input),
    workflowSteps: ecommerceCompetitorResearchTemplate.workflowSteps.map(
      (step) => ({
        id: step.id,
        title: step.title,
        desc: step.description,
      }),
    ),
    sourceCandidates: [],
    competitors: [],
    products: [],
    painPoints: [],
    contentSignals: [],
    keywords: [],
    opportunities: [],
    weekly: {
      weekOf: "",
      title: "行业情报周报",
      summary: "运行完成后生成持续情报摘要。",
      newSignals: [],
      watchList: [],
    },
    databases: databaseMeta.map(([id, label, icon]) => ({
      id,
      label,
      icon,
      count: 0,
      sample: "等待建库",
    })),
    stats: {
      candidates: 0,
      rawDocs: 0,
      extractionJobs: 0,
      evidence: 0,
      crawlJobs: 0,
    },
  };
}

export function adaptRun(raw: ResearchWorkflowResult): UIResearchModel {
  const project = createProjectFromRun(raw);
  const competitorMarket = marketShort(project.market);
  const competitorMarketById = new Map(
    raw.competitor_database.map((item) => [item.competitorId, item.market]),
  );
  const competitorNameById = new Map(
    raw.competitors.map((item) => [item.id, item.name]),
  );

  // 证据溯源:evidenceId → 来源标题 / URL / 原文片段。
  const evidenceById = new Map(raw.evidence.map((item) => [item.id, item]));
  const sourceById = new Map(
    raw.research_sources.map((item) => [item.id, item]),
  );
  const rawDocById = new Map(raw.raw_documents.map((item) => [item.id, item]));
  const resolveEvidence = (ids: string[]): UIEvidenceRef[] =>
    ids
      .map((id) => evidenceById.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 6)
      .map((item) => {
        const doc = item.rawDocumentId
          ? rawDocById.get(item.rawDocumentId)
          : undefined;
        const source = sourceById.get(item.sourceId);
        return {
          id: item.id,
          quote: item.quote,
          url: doc?.url ?? source?.value,
          source: source?.title ?? doc?.title,
          reliability: doc?.sourceQuality?.sourceType,
        };
      });

  return {
    project,
    workflowSteps: raw.workflowSteps.map((step) => ({
      id: step.id,
      title: step.title,
      desc: step.description,
    })),
    sourceCandidates:
      raw.source_discovery_plans[0]?.candidates.map((candidate) => ({
        method: candidate.method,
        title: candidate.title,
        seed: candidate.seed,
        priority: candidate.priority,
        db: candidate.expectedDatabases,
      })) ?? [],
    competitors: raw.competitors.map((competitor) => ({
      name: competitor.name,
      channel: competitor.channel,
      positioning: competitor.positioning,
      market: marketShort(
        competitorMarketById.get(competitor.id) ?? competitorMarket,
      ),
      structure: competitor.websiteStructure,
      evidence: competitor.evidenceIds.length,
      evidenceRefs: resolveEvidence(competitor.evidenceIds),
    })),
    products: raw.product_database.map((product) => ({
      name: product.name,
      competitor: competitorNameById.get(product.competitorId) ?? "未知竞品",
      category: product.category,
      price: product.priceSignal,
      tags: product.tags,
    })),
    painPoints: raw.pain_points.map((painPoint) => ({
      theme: painPoint.theme,
      need: painPoint.userNeed,
      freq: painPoint.frequency,
      evidence: painPoint.evidenceIds.length,
      evidenceRefs: resolveEvidence(painPoint.evidenceIds),
    })),
    contentSignals: raw.content_signals.map((signal) => ({
      platform: signal.platform,
      topic: signal.topic,
      type: signal.contentType,
      why: signal.whyItWorks,
      evidence: signal.evidenceIds.length,
      evidenceRefs: resolveEvidence(signal.evidenceIds),
    })),
    keywords: raw.keyword_database.map((keyword) => ({
      keyword: keyword.keyword,
      intent: keyword.intent,
      source: keyword.source,
    })),
    opportunities: raw.opportunities.map((opportunity) => ({
      title: opportunity.title,
      summary: opportunity.summary,
      demand: opportunity.demandScore,
      competition: opportunity.competitionScore,
      gap: opportunity.contentGapScore,
      value: opportunity.businessValueScore,
      evidence: opportunity.evidenceQualityScore,
      total: opportunity.totalScore,
      status: opportunity.reviewStatus,
      evidenceRefs: resolveEvidence(opportunity.evidenceIds),
    })),
    weekly: raw.weekly_intelligence_reports[0]
      ? {
          weekOf: raw.weekly_intelligence_reports[0].weekOf,
          title: raw.weekly_intelligence_reports[0].title,
          summary: raw.weekly_intelligence_reports[0].summary,
          newSignals: raw.weekly_intelligence_reports[0].newSignals,
          watchList: raw.weekly_intelligence_reports[0].watchList,
        }
      : {
          weekOf: "",
          title: "行业情报周报",
          summary: "暂无周报。",
          newSignals: [],
          watchList: [],
        },
    databases: createDatabases(raw),
    stats: {
      candidates: raw.source_discovery_plans[0]?.candidates.length ?? 0,
      rawDocs: raw.raw_documents.length,
      extractionJobs: raw.extraction_jobs.length,
      evidence: raw.evidence.length,
      crawlJobs: raw.crawl_jobs.length,
    },
  };
}
