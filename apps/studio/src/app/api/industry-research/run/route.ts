import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type ResearchWorkflowInput,
  run9RouterIndustryResearchWorkflow,
  runPublic9RouterIndustryResearchWorkflow,
  runPublicIndustryResearchWorkflow,
} from "@industry-research/core";
import { NextResponse } from "next/server";

type IndustryResearchRunMode =
  | "9router"
  | "public_web_9router"
  | "deepseek"
  | "public_web"
  | "public_web_deepseek"
  | "glm"
  | "public_web_glm";

// audit P0-2: shared-secret auth gate
const INTERNAL_KEY_ENV = "AGENT_FACTORY_INTERNAL_API_KEY";

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

function parseEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return env;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex <= 0) {
        return env;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      env[key] = rawValue.replace(/^["']|["']$/g, "");

      return env;
    }, {});
}

function loadServerEnv() {
  // NOTE: root `.env.local` (two levels up) is intentional — the 9router /
  // provider keys live at the monorepo root, not in apps/studio. Keep this.
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, ".env.local"),
    resolve(cwd, "../..", ".env.local"),
    join(cwd, "apps/studio/.env.local"),
  ];
  const fileEnv = candidates.reduce<Record<string, string>>((env, filePath) => {
    Object.assign(env, parseEnvFile(filePath));
    return env;
  }, {});

  return {
    ...fileEnv,
    ...process.env,
  };
}

// audit P0-2: require a shared secret. In production an unconfigured key
// refuses to run (no open endpoint); in development it stays frictionless.
function authorizeRequest(
  request: Request,
  env: Record<string, string | undefined>,
): { ok: true } | { ok: false; status: number; message: string } {
  const configuredKey = env[INTERNAL_KEY_ENV]?.trim();
  const isProduction = env.NODE_ENV === "production";

  if (!configuredKey) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        message: `行业研究 API 未配置 ${INTERNAL_KEY_ENV}，生产环境拒绝在无鉴权下运行。`,
      };
    }
    return { ok: true };
  }

  const provided = request.headers.get("x-internal-key");

  if (!provided || provided !== configuredKey) {
    return {
      ok: false,
      status: 401,
      message: "未授权：缺少或不匹配的 x-internal-key 请求头。",
    };
  }

  return { ok: true };
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

  return "9router";
}

function parseRunRequest(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      mode: "9router" as const,
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
    mode: "9router" as const,
    input: parseResearchWorkflowInput(value),
  };
}

export async function POST(request: Request) {
  const env = loadServerEnv();

  const auth = authorizeRequest(request, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { input, mode } = parseRunRequest(await request.json());
    const normalizedMode =
      mode === "glm" || mode === "deepseek"
        ? "9router"
        : mode === "public_web_glm" || mode === "public_web_deepseek"
          ? "public_web_9router"
          : mode;
    const result =
      normalizedMode === "public_web"
        ? await runPublicIndustryResearchWorkflow(input)
        : normalizedMode === "public_web_9router"
          ? await runPublic9RouterIndustryResearchWorkflow(input, { env })
          : await run9RouterIndustryResearchWorkflow(input, { env });

    return NextResponse.json({
      result,
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
