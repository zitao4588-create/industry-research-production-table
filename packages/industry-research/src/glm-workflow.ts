import {
  type GlmFetch,
  type GlmRuntimeEnv,
  generateOpenAICompatibleResearchMarkdownReport,
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
import {
  runPublicIndustryResearchWorkflow,
  type WorkflowProgressHandler,
} from "./public-workflow";
import { generateResearchMarkdownReport } from "./report";
import type { ResearchWorkflowInput, ResearchWorkflowResult } from "./types";

async function replaceReportWithProvider(
  baseResult: ResearchWorkflowResult,
  options: {
    env: GlmRuntimeEnv;
    fetcher?: GlmFetch;
    fallbackToLocalReport?: boolean;
  },
): Promise<ResearchWorkflowResult> {
  const project = baseResult.research_projects[0];

  if (!project) {
    throw new Error("LLM workflow must create a research project.");
  }

  let report: Awaited<
    ReturnType<typeof generateOpenAICompatibleResearchMarkdownReport>
  >;

  try {
    report = await generateOpenAICompatibleResearchMarkdownReport({
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
          id: "report-llm-fallback-1",
          projectId: project.id,
          format: "markdown",
          title: `${project.name} Markdown 报告（本地回退）`,
          content: [
            "> OpenAI-compatible provider 报告节点暂时失败，下面先展示本地 Markdown 报告，公开采集和结构化数据库结果已保留。",
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
        id: "report-llm-1",
        projectId: project.id,
        format: "markdown",
        title: `${project.name} 9router / OpenAI-compatible Markdown 报告（${report.model}）`,
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
    onProgress?: WorkflowProgressHandler;
  },
): Promise<ResearchWorkflowResult> {
  // 纯 LLM = 本地 mock 数据集(同步) + provider 报告。mock 部分瞬时,逐阶段标 done;
  // 报告阶段包住真实 LLM 调用,把唯一的耗时段映射成进度。
  const emit = options.onProgress ?? (() => {});
  const ts = () => new Date().toISOString();
  emit({ type: "phase", phase: "discover", status: "start", at: ts() });
  const base = runMockIndustryResearchWorkflow(input);
  emit({ type: "phase", phase: "discover", status: "done", at: ts() });
  emit({ type: "phase", phase: "crawl", status: "done", at: ts() });
  emit({ type: "phase", phase: "build", status: "done", at: ts() });
  emit({ type: "phase", phase: "report", status: "start", at: ts() });
  const result = await replaceReportWithProvider(base, options);
  emit({ type: "phase", phase: "report", status: "done", at: ts() });
  return result;
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
    onProgress?: WorkflowProgressHandler;
  },
): Promise<ResearchWorkflowResult> {
  const emit = options.onProgress ?? (() => {});
  const ts = () => new Date().toISOString();
  const publicResult = await runPublicIndustryResearchWorkflow(input, {
    fetcher: options.publicFetcher,
    maxDiscoveredTargets: options.maxDiscoveredTargets,
    maxSitemapUrls: options.maxSitemapUrls,
    now: options.now,
    // 内层 public 的 discover/crawl/build 直接透传;report 阶段抑制掉,
    // 因为 public + LLM 的真正报告由下面的 provider 抽取 + 生成承担。
    onProgress: options.onProgress
      ? (event) => {
          if (event.type === "phase" && event.phase === "report") return;
          emit(event);
        }
      : undefined,
  });
  emit({ type: "phase", phase: "report", status: "start", at: ts() });
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
          summary: `${job.summary} OpenAI-compatible provider 结构化抽取失败，已保留 public_web 原始资料：${message}`,
        })),
      };
    }
  }

  const reviewedResult = {
    ...structuredResult,
    reviewItems: createResearchReviewItems(structuredResult),
  };

  const finalResult = await replaceReportWithProvider(reviewedResult, {
    ...options,
    fallbackToLocalReport: true,
  });
  emit({ type: "phase", phase: "report", status: "done", at: ts() });
  return finalResult;
}

export const run9RouterIndustryResearchWorkflow =
  runDeepSeekIndustryResearchWorkflow;
export const runPublic9RouterIndustryResearchWorkflow =
  runPublicDeepSeekIndustryResearchWorkflow;
