import {
  generateCrawlPlan,
  generateSourceDiscoveryPlan,
} from "./collection-plan";
import { buildIndustryResearchDatabases } from "./database-builder";
import {
  createResearchDocumentsFromRawDocuments,
  createResearchSourcesFromPlan,
  runMockCrawler,
} from "./mock-crawler";
import { generateResearchMarkdownReport } from "./report";
import { ecommerceCompetitorResearchTemplate } from "./templates";
import type {
  ResearchProject,
  ResearchReviewItem,
  ResearchWorkflowDataset,
  ResearchWorkflowInput,
  ResearchWorkflowResult,
} from "./types";

const createdAt = "2026-06-05T00:00:00.000Z";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "research";
}

export function createResearchProjectId(input: ResearchWorkflowInput) {
  return `research-${slugify(input.category)}-${slugify(input.market)}`.slice(
    0,
    80,
  );
}

export function createIndustryResearchProject(
  input: ResearchWorkflowInput,
): ResearchProject {
  return {
    id: createResearchProjectId(input),
    name: input.projectName,
    templateId: "ecommerce_competitor_research" as const,
    industry: input.industry,
    category: input.category,
    market: input.market,
    goal: input.researchGoal,
    status: "reported" as const,
    createdAt,
  };
}

export function createMockIndustryResearchDataset(
  input: ResearchWorkflowInput,
): ResearchWorkflowDataset {
  const project = createIndustryResearchProject(input);
  const projectId = project.id;
  const sourceDiscoveryPlan = generateSourceDiscoveryPlan(projectId, input);
  const crawlPlan = generateCrawlPlan(projectId, input, sourceDiscoveryPlan);
  const sources = createResearchSourcesFromPlan(
    projectId,
    input,
    sourceDiscoveryPlan,
    crawlPlan,
  );
  const crawlerResult = runMockCrawler(projectId, input, crawlPlan, sources);
  const researchDocuments = createResearchDocumentsFromRawDocuments(
    projectId,
    crawlerResult.raw_documents,
    sources,
  );
  const databases = buildIndustryResearchDatabases({
    project,
    input,
    discoveryPlan: sourceDiscoveryPlan,
    sources,
    rawDocuments: crawlerResult.raw_documents,
  });

  return {
    research_projects: [project],
    source_discovery_plans: [sourceDiscoveryPlan],
    crawl_plans: [crawlPlan],
    ...crawlerResult,
    research_sources: sources,
    research_documents: researchDocuments,
    ...databases,
  };
}

export function createResearchReviewItems(
  dataset: ResearchWorkflowDataset,
): ResearchReviewItem[] {
  return [
    ...dataset.competitors.map((competitor) => ({
      id: `review-${competitor.id}`,
      targetType: "competitor" as const,
      targetId: competitor.id,
      status: "needs_review" as const,
      note: "确认竞品是否真实属于目标市场。",
    })),
    ...dataset.opportunities.map((opportunity) => ({
      id: `review-${opportunity.id}`,
      targetType: "opportunity" as const,
      targetId: opportunity.id,
      status: opportunity.reviewStatus,
      note: opportunity.reviewNote,
    })),
  ];
}

export function runMockIndustryResearchWorkflow(
  input: ResearchWorkflowInput,
): ResearchWorkflowResult {
  const dataset = createMockIndustryResearchDataset(input);
  const reportContent = generateResearchMarkdownReport(dataset);
  const project = dataset.research_projects[0];

  if (!project) {
    throw new Error("Mock workflow must create a research project.");
  }

  return {
    ...dataset,
    research_reports: [
      {
        id: "report-1",
        projectId: project.id,
        format: "markdown",
        title: `${project.name} Markdown 报告`,
        content: reportContent,
        createdAt,
      },
    ],
    workflowSteps: ecommerceCompetitorResearchTemplate.workflowSteps.map(
      (step) => ({
        ...step,
        status: "done",
      }),
    ),
    reviewItems: createResearchReviewItems(dataset),
  };
}
