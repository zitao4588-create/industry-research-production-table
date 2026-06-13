import {
  type GlmFetch,
  type GlmRuntimeEnv,
  generate9RouterResearchMarkdownReport,
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

async function replaceReportWithGlm(
  baseResult: ResearchWorkflowResult,
  options: {
    env: GlmRuntimeEnv;
    fetcher?: GlmFetch;
    fallbackToLocalReport?: boolean;
  },
): Promise<ResearchWorkflowResult> {
  const project = baseResult.research_projects[0];

  if (!project) {
    throw new Error("9router workflow must create a research project.");
  }

  let report: Awaited<ReturnType<typeof generate9RouterResearchMarkdownReport>>;

  try {
    report = await generate9RouterResearchMarkdownReport({
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
          id: "report-glm-fallback-1",
          projectId: project.id,
          format: "markdown",
          title: `${project.name} Markdown 报告（本地回退）`,
          content: [
            "> 9router 报告节点暂时失败，下面先展示本地 Markdown 报告，公开采集和结构化数据库结果已保留。",
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
        id: "report-glm-1",
        projectId: project.id,
        format: "markdown",
        title: `${project.name} 9router Markdown 报告（${report.model}）`,
        content: report.content,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export async function run9RouterIndustryResearchWorkflow(
  input: ResearchWorkflowInput,
  options: {
    env: GlmRuntimeEnv;
    fetcher?: GlmFetch;
  },
): Promise<ResearchWorkflowResult> {
  return replaceReportWithGlm(runMockIndustryResearchWorkflow(input), options);
}

export async function runPublic9RouterIndustryResearchWorkflow(
  input: ResearchWorkflowInput,
  options: {
    env: GlmRuntimeEnv;
    fetcher?: GlmFetch;
    publicFetcher?: PublicCrawlerFetch;
    now?: string;
  },
): Promise<ResearchWorkflowResult> {
  const publicResult = await runPublicIndustryResearchWorkflow(input, {
    fetcher: options.publicFetcher,
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
          summary: `${job.summary} 9router 结构化抽取失败，已保留 public_web 原始资料：${message}`,
        })),
      };
    }
  }

  const reviewedResult = {
    ...structuredResult,
    reviewItems: createResearchReviewItems(structuredResult),
  };

  return replaceReportWithGlm(reviewedResult, {
    ...options,
    fallbackToLocalReport: true,
  });
}
