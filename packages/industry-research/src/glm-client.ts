import type { ResearchWorkflowDataset } from "./types";

export type GlmRuntimeEnv = Record<string, string | undefined>;
export type NineRouterRuntimeEnv = GlmRuntimeEnv;

export type GlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};
export type NineRouterConfig = GlmConfig;

export type GlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GlmFetch = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;
export type NineRouterFetch = GlmFetch;

type GlmChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
  message?: string;
};

function pick9RouterBaseUrl(env: GlmRuntimeEnv) {
  return (
    env.AGENT_FACTORY_LLM_BASE_URL ||
    env.AGENT_FACTORY_9ROUTER_BASE_URL ||
    env.NINE_ROUTER_BASE_URL ||
    env.HORIZON_AI_BASE_URL ||
    "http://localhost:20128/v1"
  ).replace(/\/$/, "");
}

function pick9RouterModel(env: GlmRuntimeEnv) {
  return (
    env.AGENT_FACTORY_LLM_MODEL ||
    env.AGENT_FACTORY_9ROUTER_MODEL ||
    env.NINE_ROUTER_MODEL ||
    env.HORIZON_AI_MODEL ||
    "kr/claude-sonnet-4.5"
  );
}

export function resolve9RouterConfig(env: GlmRuntimeEnv): GlmConfig {
  const apiKey =
    env.AGENT_FACTORY_LLM_API_KEY ||
    env.AGENT_FACTORY_9ROUTER_API_KEY ||
    env.NINE_ROUTER_API_KEY ||
    ((env.HORIZON_AI_BASE_URL ||
      env.AGENT_FACTORY_9ROUTER_BASE_URL ||
      env.NINE_ROUTER_BASE_URL) &&
      env.OPENAI_API_KEY) ||
    env.AGENT_FACTORY_DEEPSEEK_API_KEY ||
    "";

  if (!apiKey) {
    throw new Error(
      "未配置 LLM API Key：生产请设置 AGENT_FACTORY_LLM_API_KEY（自付费 provider）；本地 9router 可用 AGENT_FACTORY_9ROUTER_API_KEY。",
    );
  }

  const baseUrl = pick9RouterBaseUrl(env);
  const model = pick9RouterModel(env);

  // audit P1-5 / P3-2: 生产环境不要静默跑在本地 / 免费 9router 默认地址上。
  // 需显式配置自付费 provider；如确需在生产用本地路由，设
  // AGENT_FACTORY_ALLOW_LOCAL_LLM_IN_PROD=1 作为逃生阀。
  const isProduction = env.NODE_ENV === "production";
  const isLocalBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl);
  const allowLocalInProd =
    env.AGENT_FACTORY_ALLOW_LOCAL_LLM_IN_PROD === "1" ||
    env.AGENT_FACTORY_ALLOW_LOCAL_LLM_IN_PROD === "true";

  if (isProduction && isLocalBaseUrl && !allowLocalInProd) {
    throw new Error(
      "生产环境检测到本地 9router base URL（localhost）。请配置 AGENT_FACTORY_LLM_BASE_URL / _MODEL / _API_KEY 指向自付费 provider；如确需在生产使用本地路由，设 AGENT_FACTORY_ALLOW_LOCAL_LLM_IN_PROD=1。",
    );
  }

  return {
    apiKey,
    baseUrl,
    model,
  };
}

export function has9RouterConfig(env: GlmRuntimeEnv) {
  return Boolean(
    env.AGENT_FACTORY_LLM_API_KEY ||
      env.AGENT_FACTORY_9ROUTER_API_KEY ||
      env.NINE_ROUTER_API_KEY ||
      env.AGENT_FACTORY_DEEPSEEK_API_KEY,
  );
}

function parseGlmResponse(rawText: string): GlmChatCompletionResponse {
  try {
    return rawText ? (JSON.parse(rawText) as GlmChatCompletionResponse) : {};
  } catch {
    return {
      message: rawText.slice(0, 200),
    };
  }
}

function extract9RouterSseText(rawText: string) {
  if (!rawText.trimStart().startsWith("data:")) {
    return "";
  }

  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .filter((line) => line && line !== "[DONE]")
    .map((line) => {
      try {
        const chunk = JSON.parse(line) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };

        return (
          chunk.choices?.[0]?.delta?.content ??
          chunk.choices?.[0]?.message?.content ??
          ""
        );
      } catch {
        return "";
      }
    })
    .join("")
    .trim();
}

function sanitizeProviderErrorMessage(message: string) {
  return message
    .replace(/api key:\s*[^,\s]+/gi, "api key: [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

export function extractGlmText(data: GlmChatCompletionResponse) {
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function call9RouterChatCompletion({
  env,
  messages,
  fetcher = fetch,
  temperature = 0.2,
  maxTokens = 4000,
  timeoutMs = 30_000,
}: {
  env: GlmRuntimeEnv;
  messages: GlmChatMessage[];
  fetcher?: GlmFetch;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}) {
  const config = resolve9RouterConfig(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Awaited<ReturnType<GlmFetch>>;

  try {
    response = await fetcher(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`9router API 请求超时（${timeoutMs}ms）。`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();
  const sseContent = extract9RouterSseText(rawText);
  const data = sseContent
    ? ({
        choices: [{ message: { content: sseContent } }],
      } satisfies GlmChatCompletionResponse)
    : parseGlmResponse(rawText);

  if (!response.ok) {
    const message =
      data.error?.message ||
      data.message ||
      `9router API 请求失败，HTTP ${response.status}`;

    throw new Error(sanitizeProviderErrorMessage(message));
  }

  const content = extractGlmText(data);

  if (!content) {
    throw new Error("9router API 没有返回可用文本。");
  }

  return {
    content,
    model: config.model,
  };
}

function createReportInput(dataset: ResearchWorkflowDataset) {
  const project = dataset.research_projects[0];

  if (!project) {
    throw new Error(
      "Cannot generate 9router report without a research project.",
    );
  }

  return {
    project,
    sourceDiscoveryPlan: dataset.source_discovery_plans[0],
    databaseCounts: {
      source_database: dataset.source_database.length,
      competitor_database: dataset.competitor_database.length,
      website_structure_database: dataset.website_structure_database.length,
      product_database: dataset.product_database.length,
      keyword_database: dataset.keyword_database.length,
      pain_point_database: dataset.pain_point_database.length,
      content_database: dataset.content_database.length,
      opportunity_database: dataset.opportunity_database.length,
      weekly_intelligence_reports: dataset.weekly_intelligence_reports.length,
    },
    competitors: dataset.competitors,
    productSignals: dataset.product_signals,
    painPoints: dataset.pain_points,
    contentSignals: dataset.content_signals,
    opportunities: dataset.opportunities,
    weeklyReports: dataset.weekly_intelligence_reports,
    evidence: dataset.evidence,
    crawlMode: dataset.crawl_plans[0]?.mode ?? "mock",
    rawDocuments: dataset.raw_documents.slice(0, 10).map((document) => ({
      id: document.id,
      url: document.url,
      title: document.title,
      contentType: document.contentType,
      excerpt: document.excerpt,
      databaseTargets: document.databaseTargets,
    })),
  };
}

export function create9RouterReportMessages(dataset: ResearchWorkflowDataset) {
  const reportInput = createReportInput(dataset);

  return [
    {
      role: "system",
      content:
        "你是 Agent Factory 的行业研究报告写作助手。只输出 Markdown，不要输出 JSON，不要解释你的推理过程。所有结论必须基于用户给定的数据；如果数据是 mock，要明确标记为 mock/待验证。",
    },
    {
      role: "user",
      content: [
        "请基于下面的行业研究数据库结果，生成一份中文 Markdown 行业研究报告。",
        "",
        "报告必须包含：",
        "1. 研究范围",
        "2. 自动采集计划摘要",
        "3. 九类数据库建设情况",
        "4. 竞品拆解",
        "5. 产品信号",
        "6. 用户痛点",
        "7. 内容信号",
        "8. 机会评分和机会地图",
        "9. 人工审核建议",
        "10. 下一步真实采集建议",
        "",
        "注意：如果 crawlMode 是 mock，不要声称已经真实抓取网页；如果 crawlMode 是 public_web，可以说明已经从公开 URL 抽取 raw documents，但所有结构化结论仍需标记为待人工验证。",
        "",
        JSON.stringify(reportInput, null, 2),
      ].join("\n"),
    },
  ] satisfies GlmChatMessage[];
}

export async function generate9RouterResearchMarkdownReport({
  dataset,
  env,
  fetcher,
}: {
  dataset: ResearchWorkflowDataset;
  env: GlmRuntimeEnv;
  fetcher?: GlmFetch;
}) {
  return call9RouterChatCompletion({
    env,
    fetcher,
    messages: create9RouterReportMessages(dataset),
    timeoutMs: 180_000,
  });
}
