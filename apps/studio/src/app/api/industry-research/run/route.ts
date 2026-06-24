import {
  type ResearchWorkflowInput,
  runDeepSeekIndustryResearchWorkflow,
  runPublicDeepSeekIndustryResearchWorkflow,
  runPublicIndustryResearchWorkflow,
} from "@industry-research/core";
import { NextResponse } from "next/server";
import { persistIndustryResearchDeliveryPackage } from "../_lib/delivery-package-writer";
import {
  authorizeIndustryResearchRequest,
  loadServerEnv,
} from "../_lib/server-env";

type IndustryResearchRunMode =
  | "9router"
  | "public_web_9router"
  | "deepseek"
  | "public_web"
  | "public_web_deepseek"
  | "glm"
  | "public_web_glm";

// audit P0-2: input size caps — guard against unbounded LLM / crawl cost
const INPUT_LIMITS = {
  shortField: 2_000, // projectName / industry / category / market / researchGoal
  maxUrls: 50,
  urlLength: 2_000,
  longText: 200_000, // csvText / manualText
} as const;

// Distinguishes client input errors (400) from unexpected failures (500).
class RequestValidationError extends Error {}

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

function parseResearchWorkflowInput(value: unknown): ResearchWorkflowInput {
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

function parseRunMode(value: unknown): IndustryResearchRunMode {
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

function parseRunRequest(value: unknown) {
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

export async function POST(request: Request) {
  const env = loadServerEnv();

  const auth = authorizeIndustryResearchRequest(request, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const startedAt = new Date().toISOString();
    const { input, mode } = parseRunRequest(await request.json());
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
        ? await runPublicIndustryResearchWorkflow(input)
        : normalizedMode === "public_web_deepseek"
          ? await runPublicDeepSeekIndustryResearchWorkflow(input, { env })
          : await runDeepSeekIndustryResearchWorkflow(input, { env });
    const finishedAt = new Date().toISOString();
    const deliveryPackage = shouldPersistDeliveryPackage(env)
      ? await persistIndustryResearchDeliveryPackage({
          input,
          result,
          startedAt,
          finishedAt,
        })
      : null;

    return NextResponse.json({
      result,
      deliveryPackage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RequestValidationError ? 400 : 500;

    return NextResponse.json(
      {
        error: message,
      },
      {
        status,
      },
    );
  }
}
