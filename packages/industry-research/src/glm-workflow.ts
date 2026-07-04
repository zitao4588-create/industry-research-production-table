import {
  type GlmFetch,
  type GlmRuntimeEnv,
  generateOpenAICompatibleResearchMarkdownReport,
} from "./glm-client";
import {
  applyGlmStructuredExtraction,
  generateGlmStructuredExtractionBatched,
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
      runMetadata: {
        ...baseResult.runMetadata,
        canonicalMode:
          baseResult.runMetadata?.canonicalMode ?? "public_web_llm",
        provider: "local_fallback",
        fallbackReason: message,
        llmUsed: true,
      },
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
    runMetadata: {
      ...baseResult.runMetadata,
      canonicalMode: baseResult.runMetadata?.canonicalMode ?? "public_web_llm",
      provider: baseResult.runMetadata?.provider ?? "openai_compatible",
      model: report.model,
      llmUsed: true,
    },
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
    /** 上一次 run 的结论摘要（T8）；只作为抽取对比提示，不得作为证据来源。 */
    historicalContext?: string[];
  },
): Promise<ResearchWorkflowResult> {
  const emit = options.onProgress ?? (() => {});
  const ts = () => new Date().toISOString();
  const publicResult = await runPublicIndustryResearchWorkflow(input, {
    fetcher: options.publicFetcher,
    maxDiscoveredTargets: options.maxDiscoveredTargets,
    maxSitemapUrls: options.maxSitemapUrls,
    now: options.now,
    env: options.env,
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
      const batched = await generateGlmStructuredExtractionBatched({
        dataset: publicResult,
        env: options.env,
        fetcher: options.fetcher,
        historicalContext: options.historicalContext,
        onBatch: options.onProgress
          ? (event) =>
              emit({
                type: "log",
                at: ts(),
                message: `结构化抽取批次 ${event.batchIndex + 1}/${event.batchCount} ${
                  event.status === "done" ? "完成" : "失败"
                }（${event.documentIds.length} 个文档）`,
              })
          : undefined,
      });
      structuredResult = applyGlmStructuredExtraction(
        publicResult,
        batched.extraction,
      );

      if (batched.failedBatchCount > 0) {
        const failedDocumentIds = new Set(batched.failedBatchDocumentIds);
        structuredResult = {
          ...structuredResult,
          extraction_jobs: structuredResult.extraction_jobs.map((job) =>
            failedDocumentIds.has(job.rawDocumentId)
              ? {
                  ...job,
                  status: "needs_review",
                  summary: `${job.summary} 注意：该文档所在抽取批次失败（${batched.failedBatchCount}/${batched.batchCount} 批失败），结构化结果未覆盖此文档。`,
                }
              : job,
          ),
        };
      }
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
