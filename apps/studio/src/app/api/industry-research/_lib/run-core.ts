import {
  type ResearchRunMetadata,
  type ResearchWorkflowInput,
  type ResearchWorkflowResult,
  runDeepSeekIndustryResearchWorkflow,
  runPublicDeepSeekIndustryResearchWorkflow,
  runPublicIndustryResearchWorkflow,
  type WorkflowProgressHandler,
} from "@industry-research/core";
import { persistIndustryResearchDeliveryPackage } from "./delivery-package-writer";

/**
 * Shared run core for the industry-research workflow.
 *
 * Extracted from `run/route.ts` so the same validation + execution path can be
 * reused by the same-origin server action (`app/industry-research/actions.ts`)
 * without exposing the internal API key to the browser. The HTTP route keeps
 * the auth boundary; this module is the pure "parse → normalize → run → persist".
 */

export type IndustryResearchRunMode =
  | "public_web"
  | "public_web_llm"
  | "llm_only"
  | "9router"
  | "public_web_9router"
  | "deepseek"
  | "public_web_deepseek"
  | "glm"
  | "public_web_glm";

// audit P0-2: input size caps — guard against unbounded LLM / crawl cost
export const INPUT_LIMITS = {
  shortField: 2_000, // projectName / industry / category / market / researchGoal
  maxUrls: 50,
  urlLength: 2_000,
  longText: 200_000, // csvText / manualText
} as const;

// Distinguishes client input errors (400) from unexpected failures (500).
export class RequestValidationError extends Error {}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function assertMaxLength(label: string, value: string, max: number) {
  if (value.length > max) {
    throw new RequestValidationError(`${label} 超过长度上限（${max} 字符）。`);
  }
}

export function parseResearchWorkflowInput(
  value: unknown,
): ResearchWorkflowInput {
  if (!value || typeof value !== "object") {
    throw new RequestValidationError("请求体必须是研究项目 JSON。");
  }

  const input = value as Record<string, unknown>;

  if (
    !isString(input.projectName) ||
    !isString(input.industry) ||
    !isString(input.category) ||
    !isString(input.market) ||
    !isString(input.researchGoal) ||
    input.templateId !== "ecommerce_competitor_research" ||
    !isStringArray(input.urls) ||
    !isString(input.csvText) ||
    !isString(input.manualText)
  ) {
    throw new RequestValidationError("请求体缺少行业研究工作流必填字段。");
  }

  // audit P0-2: enforce size caps before the request reaches the LLM / crawler.
  assertMaxLength("projectName", input.projectName, INPUT_LIMITS.shortField);
  assertMaxLength("industry", input.industry, INPUT_LIMITS.shortField);
  assertMaxLength("category", input.category, INPUT_LIMITS.shortField);
  assertMaxLength("market", input.market, INPUT_LIMITS.shortField);
  assertMaxLength("researchGoal", input.researchGoal, INPUT_LIMITS.shortField);
  assertMaxLength("csvText", input.csvText, INPUT_LIMITS.longText);
  assertMaxLength("manualText", input.manualText, INPUT_LIMITS.longText);

  if (input.urls.length > INPUT_LIMITS.maxUrls) {
    throw new RequestValidationError(
      `urls 数量超过上限（${INPUT_LIMITS.maxUrls}）。`,
    );
  }

  input.urls.forEach((url, index) => {
    assertMaxLength(`urls[${index}]`, url, INPUT_LIMITS.urlLength);
  });

  return {
    projectName: input.projectName,
    industry: input.industry,
    category: input.category,
    market: input.market,
    researchGoal: input.researchGoal,
    templateId: "ecommerce_competitor_research",
    urls: input.urls,
    csvText: input.csvText,
    manualText: input.manualText,
  };
}

export function parseRunMode(value: unknown): IndustryResearchRunMode {
  if (
    value === "public_web" ||
    value === "public_web_llm" ||
    value === "llm_only" ||
    value === "9router" ||
    value === "public_web_9router" ||
    value === "deepseek" ||
    value === "public_web_deepseek" ||
    value === "glm" ||
    value === "public_web_glm"
  ) {
    return value;
  }

  return "public_web";
}

function canonicalModeFor(mode: IndustryResearchRunMode) {
  if (mode === "public_web") {
    return "public_web" as const;
  }

  if (
    mode === "public_web_llm" ||
    mode === "public_web_9router" ||
    mode === "public_web_deepseek" ||
    mode === "public_web_glm"
  ) {
    return "public_web_llm" as const;
  }

  return "llm_only" as const;
}

function providerFor(mode: IndustryResearchRunMode) {
  if (mode === "public_web") {
    return "none" as const;
  }

  if (mode === "9router" || mode === "public_web_9router") {
    return "9router" as const;
  }

  if (mode === "deepseek" || mode === "public_web_deepseek") {
    return "deepseek" as const;
  }

  return "openai_compatible" as const;
}

function safeHost(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function createRunMetadata({
  mode,
  env,
}: {
  mode: IndustryResearchRunMode;
  env: Record<string, string | undefined>;
}): ResearchRunMetadata {
  const canonicalMode = canonicalModeFor(mode);

  return {
    requestedMode: mode,
    canonicalMode,
    provider: providerFor(mode),
    model:
      env.AGENT_FACTORY_LLM_MODEL ??
      env.AGENT_FACTORY_DEEPSEEK_MODEL ??
      env.DEEPSEEK_MODEL,
    baseUrlHost: safeHost(
      env.AGENT_FACTORY_LLM_BASE_URL ??
        env.AGENT_FACTORY_DEEPSEEK_BASE_URL ??
        env.DEEPSEEK_BASE_URL,
    ),
    llmUsed: canonicalMode !== "public_web",
  };
}

function withRunMetadata(
  result: ResearchWorkflowResult,
  metadata: ResearchRunMetadata,
): ResearchWorkflowResult {
  const resultMetadata = result.runMetadata;

  return {
    ...result,
    runMetadata: {
      ...resultMetadata,
      ...metadata,
      requestedMode: metadata.requestedMode,
      canonicalMode: metadata.canonicalMode,
      provider:
        resultMetadata?.provider === "local_fallback"
          ? "local_fallback"
          : metadata.provider,
      model: resultMetadata?.model ?? metadata.model,
      baseUrlHost: resultMetadata?.baseUrlHost ?? metadata.baseUrlHost,
      fallbackReason: resultMetadata?.fallbackReason ?? metadata.fallbackReason,
      llmUsed:
        resultMetadata?.provider === "local_fallback" || metadata.llmUsed,
      timings: resultMetadata?.timings ?? metadata.timings,
    },
  };
}

export function parseRunRequest(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      mode: "public_web" as const,
      input: parseResearchWorkflowInput(value),
    };
  }

  const body = value as Record<string, unknown>;

  if ("input" in body) {
    return {
      mode: parseRunMode(body.mode),
      input: parseResearchWorkflowInput(body.input),
    };
  }

  return {
    mode: "public_web" as const,
    input: parseResearchWorkflowInput(value),
  };
}

function shouldPersistDeliveryPackage(env: Record<string, string | undefined>) {
  return env.AGENT_FACTORY_PERSIST_INDUSTRY_RESEARCH_RUNS !== "false";
}

export type IndustryResearchRunResult = {
  result: ResearchWorkflowResult;
  deliveryPackage: Awaited<
    ReturnType<typeof persistIndustryResearchDeliveryPackage>
  > | null;
};

/**
 * Normalize the UI/API mode, run the matching workflow, and (optionally) persist
 * the on-disk delivery package. Returns the raw result plus the delivery package
 * metadata (which carries the runId used by the download route).
 */
export async function executeIndustryResearchRun({
  input,
  mode,
  env,
  onProgress,
}: {
  input: ResearchWorkflowInput;
  mode: IndustryResearchRunMode;
  env: Record<string, string | undefined>;
  /** SSE 完整版:public_web 与 LLM 模式都会逐阶段 emit 进度。 */
  onProgress?: WorkflowProgressHandler;
}): Promise<IndustryResearchRunResult> {
  const startedAt = new Date().toISOString();
  const canonicalMode = canonicalModeFor(mode);
  const metadata = createRunMetadata({ mode, env });

  const result =
    canonicalMode === "public_web"
      ? await runPublicIndustryResearchWorkflow(input, { onProgress })
      : canonicalMode === "public_web_llm"
        ? await runPublicDeepSeekIndustryResearchWorkflow(input, {
            env,
            onProgress,
          })
        : await runDeepSeekIndustryResearchWorkflow(input, { env, onProgress });
  const resultWithMetadata = withRunMetadata(result, metadata);

  const finishedAt = new Date().toISOString();
  const deliveryPackage = shouldPersistDeliveryPackage(env)
    ? await persistIndustryResearchDeliveryPackage({
        input,
        result: resultWithMetadata,
        startedAt,
        finishedAt,
        env,
      })
    : null;

  return { result: resultWithMetadata, deliveryPackage };
}
