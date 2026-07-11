import {
  type AliyunFreeModelCode,
  type AliyunFreeModelRoute,
  aliyunFreeModelRoutes,
  routesForCadence,
} from "./aliyun-free-model-routing";
import type { AmazonPublicEvidenceResult } from "./amazon-public-evidence";
import {
  callOpenAICompatibleChatCompletion,
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

const freeModelRoutingEnabledEnv =
  "AGENT_FACTORY_ALIYUN_FREE_MODEL_ROUTING_ENABLED";
const freeTierOnlyConfirmedEnv =
  "AGENT_FACTORY_ALIYUN_FREE_TIER_ONLY_CONFIRMED";

function truthyEnv(value: string | undefined) {
  return value === "1" || value === "true";
}

function isAliyunCompatibleBaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith("aliyuncs.com");
  } catch {
    return false;
  }
}

export function shouldUseAliyunFreeModelRouting(env: GlmRuntimeEnv) {
  return (
    truthyEnv(env[freeModelRoutingEnabledEnv]) &&
    truthyEnv(env[freeTierOnlyConfirmedEnv]) &&
    isAliyunCompatibleBaseUrl(env.AGENT_FACTORY_LLM_BASE_URL)
  );
}

function envForFreeModel(env: GlmRuntimeEnv, model: AliyunFreeModelCode) {
  const routedEnv: GlmRuntimeEnv = {
    ...env,
    AGENT_FACTORY_LLM_MODEL: model,
    AGENT_FACTORY_DEEPSEEK_API_KEY: "",
    AGENT_FACTORY_DEEPSEEK_BASE_URL: "",
    AGENT_FACTORY_DEEPSEEK_MODEL: "",
    DEEPSEEK_API_KEY: "",
    DEEPSEEK_BASE_URL: "",
    DEEPSEEK_MODEL: "",
  };
  routedEnv.AGENT_FACTORY_LLM_THINKING =
    model === "kimi-k2-thinking" || model === "kimi-k2.7-code"
      ? "enabled"
      : model === "Moonshot-Kimi-K2-Instruct"
        ? undefined
        : "disabled";
  routedEnv.AGENT_FACTORY_DEEPSEEK_THINKING = undefined;
  return routedEnv;
}

function stableHash(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function selectRotatedFreeModelRoutes(projectId: string) {
  const candidates = routesForCadence("sampled_rotation");
  if (candidates.length <= 2) return candidates;
  const start = stableHash(projectId) % candidates.length;
  return [candidates[start], candidates[(start + 1) % candidates.length]];
}

function routeFor(model: AliyunFreeModelCode) {
  const route = aliyunFreeModelRoutes.find((item) => item.model === model);
  if (!route) throw new Error(`Aliyun free model route missing: ${model}`);
  return route;
}

function advisoryInput(result: ResearchWorkflowResult) {
  return JSON.stringify(
    {
      project: result.research_projects[0],
      rawDocuments: result.raw_documents.slice(0, 10).map((document) => ({
        id: document.id,
        url: document.url,
        title: document.title,
        excerpt: document.excerpt,
        sourceQuality: document.sourceQuality,
      })),
      competitors: result.competitor_database,
      opportunities: result.opportunity_database,
      reviewItems: result.reviewItems,
    },
    null,
    2,
  ).slice(0, 36_000);
}

type ModelRoutingCall = NonNullable<
  NonNullable<ResearchWorkflowResult["runMetadata"]>["modelRouting"]
>["calls"][number];

async function runAdvisoryRoute({
  route,
  result,
  env,
  fetcher,
}: {
  route: AliyunFreeModelRoute;
  result: ResearchWorkflowResult;
  env: GlmRuntimeEnv;
  fetcher?: GlmFetch;
}): Promise<ModelRoutingCall> {
  const started = Date.now();
  try {
    const response = await callOpenAICompatibleChatCompletion({
      env: envForFreeModel(env, route.model),
      fetcher,
      messages: [
        {
          role: "system",
          content:
            "你是行业研究生产台的内部审计节点。只执行指定辅助任务。不得新增 confirmed findings，不得把假设写成事实。输出简洁 Markdown。",
        },
        {
          role: "user",
          content: [route.instruction, "", advisoryInput(result)].join("\n"),
        },
      ],
      temperature: 0,
      maxTokens: 1200,
      stream: route.stream,
      timeoutMs: 90_000,
    });
    return {
      model: route.model,
      task: route.task,
      authority: route.authority,
      status: "completed",
      durationMs: Date.now() - started,
      outputPreview: response.content.slice(0, 1_000),
    };
  } catch (error) {
    return {
      model: route.model,
      task: route.task,
      authority: route.authority,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

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
    /** 已完成质量门禁的 Amazon 证据，可由 benchmark 预检后复用，避免重复请求。 */
    amazonPublicEvidenceResult?: AmazonPublicEvidenceResult;
  },
): Promise<ResearchWorkflowResult> {
  const emit = options.onProgress ?? (() => {});
  const ts = () => new Date().toISOString();
  const useFreeModelRouting = shouldUseAliyunFreeModelRouting(options.env);
  const routingCalls: ModelRoutingCall[] = [];
  const publicResult = await runPublicIndustryResearchWorkflow(input, {
    fetcher: options.publicFetcher,
    maxDiscoveredTargets: options.maxDiscoveredTargets,
    maxSitemapUrls: options.maxSitemapUrls,
    now: options.now,
    env: options.env,
    amazonPublicEvidenceResult: options.amazonPublicEvidenceResult,
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

  if (useFreeModelRouting && publicResult.raw_documents.length > 0) {
    const digestCall = await runAdvisoryRoute({
      route: routeFor("Moonshot-Kimi-K2-Instruct"),
      result: publicResult,
      env: options.env,
      fetcher: options.fetcher,
    });
    routingCalls.push(digestCall);
    emit({
      type: "log",
      at: ts(),
      message: `免费模型来源摘要 ${digestCall.model}：${digestCall.status}`,
    });
  }

  if (publicResult.raw_documents.length > 0) {
    const extractionStarted = Date.now();
    try {
      const batched = await generateGlmStructuredExtractionBatched({
        dataset: publicResult,
        env: useFreeModelRouting
          ? envForFreeModel(options.env, "glm-4.7")
          : options.env,
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
      if (useFreeModelRouting) {
        routingCalls.push({
          model: "glm-4.7",
          task: "evidence_verification",
          authority: "authoritative",
          status: "completed",
          durationMs: Date.now() - extractionStarted,
        });
      }

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
      if (useFreeModelRouting) {
        routingCalls.push({
          model: "glm-4.7",
          task: "evidence_verification",
          authority: "authoritative",
          status: "failed",
          durationMs: Date.now() - extractionStarted,
          error: message,
        });
      }
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

  const projectId = reviewedResult.research_projects[0]?.id ?? "research";
  const rotatedRoutes = useFreeModelRouting
    ? selectRotatedFreeModelRoutes(projectId)
    : [];
  if (rotatedRoutes.length > 0) {
    const calls = await Promise.all(
      rotatedRoutes.map((route) =>
        runAdvisoryRoute({
          route,
          result: reviewedResult,
          env: options.env,
          fetcher: options.fetcher,
        }),
      ),
    );
    routingCalls.push(...calls);
  }

  const finalResult = await replaceReportWithProvider(reviewedResult, {
    ...options,
    env: useFreeModelRouting
      ? envForFreeModel(options.env, "kimi-k2.6")
      : options.env,
    fallbackToLocalReport: true,
  });
  const routedResult = useFreeModelRouting
    ? {
        ...finalResult,
        runMetadata: {
          ...finalResult.runMetadata,
          canonicalMode:
            finalResult.runMetadata?.canonicalMode ?? "public_web_llm",
          provider:
            finalResult.runMetadata?.provider ?? ("openai_compatible" as const),
          llmUsed: true,
          modelRouting: {
            enabled: true,
            policy: "aliyun_free_model_pool_v1" as const,
            reportModel: "kimi-k2.6",
            extractionModel: "glm-4.7",
            sourceDigestModel: "Moonshot-Kimi-K2-Instruct",
            rotatedModels: rotatedRoutes.map((route) => route.model),
            calls: [
              ...routingCalls,
              {
                model: "kimi-k2.6",
                task: "final_report",
                authority: "authoritative" as const,
                status:
                  finalResult.runMetadata?.provider === "local_fallback"
                    ? ("failed" as const)
                    : ("completed" as const),
                durationMs: 0,
                error: finalResult.runMetadata?.fallbackReason,
              },
            ],
          },
        },
      }
    : finalResult;
  emit({ type: "phase", phase: "report", status: "done", at: ts() });
  return routedResult;
}

export const run9RouterIndustryResearchWorkflow =
  runDeepSeekIndustryResearchWorkflow;
export const runPublic9RouterIndustryResearchWorkflow =
  runPublicDeepSeekIndustryResearchWorkflow;
export const runOpenAICompatibleIndustryResearchWorkflow =
  runDeepSeekIndustryResearchWorkflow;
export const runPublicOpenAICompatibleIndustryResearchWorkflow =
  runPublicDeepSeekIndustryResearchWorkflow;
