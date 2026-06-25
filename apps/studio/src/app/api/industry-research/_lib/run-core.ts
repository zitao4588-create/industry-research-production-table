import {
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
  | "9router"
  | "public_web_9router"
  | "deepseek"
  | "public_web"
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
    value === "9router" ||
    value === "public_web_9router" ||
    value === "deepseek" ||
    value === "public_web" ||
    value === "public_web_deepseek" ||
    value === "glm" ||
    value === "public_web_glm"
  ) {
    return value;
  }

  return "deepseek";
}

export function parseRunRequest(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      mode: "deepseek" as const,
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
    mode: "deepseek" as const,
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
  /** SSE 完整版:public_web 模式会逐阶段 emit 进度;其余模式暂不细粒度上报。 */
  onProgress?: WorkflowProgressHandler;
}): Promise<IndustryResearchRunResult> {
  const startedAt = new Date().toISOString();
  const normalizedMode =
    mode === "glm" || mode === "9router" || mode === "deepseek"
      ? "deepseek"
      : mode === "public_web_glm" ||
          mode === "public_web_9router" ||
          mode === "public_web_deepseek"
        ? "public_web_deepseek"
        : mode;

  const result =
    normalizedMode === "public_web"
      ? await runPublicIndustryResearchWorkflow(input, { onProgress })
      : normalizedMode === "public_web_deepseek"
        ? await runPublicDeepSeekIndustryResearchWorkflow(input, {
            env,
            onProgress,
          })
        : await runDeepSeekIndustryResearchWorkflow(input, { env, onProgress });

  const finishedAt = new Date().toISOString();
  const deliveryPackage = shouldPersistDeliveryPackage(env)
    ? await persistIndustryResearchDeliveryPackage({
        input,
        result,
        startedAt,
        finishedAt,
      })
    : null;

  return { result, deliveryPackage };
}
