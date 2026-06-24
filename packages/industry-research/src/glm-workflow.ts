import {
  type GlmFetch,
  type GlmRuntimeEnv,
  generateDeepSeekResearchMarkdownReport,
} from "./glm-client";
import {
  applyGlmStructuredExtraction,
  generateGlmStructuredExtraction,
} from "./glm-extraction";
import {
  createResearchReviewItems,
  runMockIndustryResearchWorkflow,
} from "./mock-workflow";
import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import { runPublicIndustryResearchWorkflow } from "./public-workflow";
import { generateResearchMarkdownReport } from "./report";
import type { ResearchWorkflowInput, ResearchWorkflowResult } from "./types";

async function replaceReportWithDeepSeek(
  baseResult: ResearchWorkflowResult,
  options: {
    env: GlmRuntimeEnv;
    fetcher?: GlmFetch;
    fallbackToLocalReport?: boolean;
  },
): Promise<ResearchWorkflowResult> {
  const project = baseResult.research_projects[0];

  if (!project) {
    throw new Error("DeepSeek workflow must create a research project.");
  }

  let report: Awaited<
    ReturnType<typeof generateDeepSeekResearchMarkdownReport>
  >;

  try {
    report = await generateDeepSeekResearchMarkdownReport({
      dataset: baseResult,
      env: options.env,
      fetcher: options.fetcher,
    });
  } catch (error) {
    if (!options.fallbackToLocalReport) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    return {
      ...baseResult,
      research_reports: [
        {
          id: "report-deepseek-fallback-1",
          projectId: project.id,
          format: "markdown",
          title: `${project.name} Markdown 报告（本地回退）`,
          content: [
            "> DeepSeek 报告节点暂时失败，下面先展示本地 Markdown 报告，公开采集和结构化数据库结果已保留。",
            "",
            `> 失败原因：${message}`,
            "",
            generateResearchMarkdownReport(baseResult),
          ].join("\n"),
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  return {
    ...baseResult,
    research_reports: [
      {
        id: "report-deepseek-1",
        projectId: project.id,
        format: "markdown",
        title: `${project.name} DeepSeek Markdown 报告（${report.model}）`,
        content: report.content,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export async function runDeepSeekIndustryResearchWorkflow(
  input: ResearchWorkflowInput,
  options: {
    env: GlmRuntimeEnv;
    fetcher?: GlmFetch;
  },
): Promise<ResearchWorkflowResult> {
  return replaceReportWithDeepSeek(
    runMockIndustryResearchWorkflow(input),
    options,
  );
}

export async function runPublicDeepSeekIndustryResearchWorkflow(
  input: ResearchWorkflowInput,
  options: {
    env: GlmRuntimeEnv;
    fetcher?: GlmFetch;
    publicFetcher?: PublicCrawlerFetch;
    maxDiscoveredTargets?: number;
    maxSitemapUrls?: number;
    now?: string;
  },
): Promise<ResearchWorkflowResult> {
  const publicResult = await runPublicIndustryResearchWorkflow(input, {
    fetcher: options.publicFetcher,
    maxDiscoveredTargets: options.maxDiscoveredTargets,
    maxSitemapUrls: options.maxSitemapUrls,
    now: options.now,
  });
  let structuredResult = publicResult;

  if (publicResult.raw_documents.length > 0) {
    try {
      structuredResult = applyGlmStructuredExtraction(
        publicResult,
        await generateGlmStructuredExtraction({
          dataset: publicResult,
          env: options.env,
          fetcher: options.fetcher,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      structuredResult = {
        ...publicResult,
        extraction_jobs: publicResult.extraction_jobs.map((job) => ({
          ...job,
          status: "needs_review",
          summary: `${job.summary} DeepSeek 结构化抽取失败，已保留 public_web 原始资料：${message}`,
        })),
      };
    }
  }

  const reviewedResult = {
    ...structuredResult,
    reviewItems: createResearchReviewItems(structuredResult),
  };

  return replaceReportWithDeepSeek(reviewedResult, {
    ...options,
    fallbackToLocalReport: true,
  });
}

export const run9RouterIndustryResearchWorkflow =
  runDeepSeekIndustryResearchWorkflow;
export const runPublic9RouterIndustryResearchWorkflow =
  runPublicDeepSeekIndustryResearchWorkflow;
