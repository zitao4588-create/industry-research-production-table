import { readFileSync } from "node:fs";

type ProbeResult = {
  model: string;
  ok: boolean;
  status?: number;
  contentLength?: number;
  error?: string;
};

const DEFAULT_CANDIDATES = [
  "mmf/mimo-auto",
  "mimo-free/mimo-auto",
  "gh/goldeneye-free-auto",
  "opencode/gpt-oss-20b",
  "opencode/gpt-oss-120b",
  "cloudflare-ai/llama-3.1-8b-instruct",
  "groq/llama-3.1-8b-instant",
  "glm/glm-4.5-air",
  "qwen/qwen3-coder-free",
];

const FREE_MODEL_PATTERN =
  /free|mimo|goldeneye|opencode|cloudflare|groq|glm|qwen/i;

function loadLocalEnv() {
  let envText = "";

  try {
    envText = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function sanitizeMessage(message: string) {
  return message
    .replace(/api key:\s*[^,\s]+/gi, "api key: [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function getConfig() {
  const apiKey =
    process.env.AGENT_FACTORY_LLM_API_KEY ||
    process.env.NINE_ROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";
  const baseUrl = (
    argValue("base-url") ||
    process.env.AGENT_FACTORY_LLM_BASE_URL ||
    process.env.NINE_ROUTER_BASE_URL ||
    "https://router.playgamelab.cn/v1"
  ).replace(/\/$/, "");
  const timeoutMs = Number(process.env.NINE_ROUTER_PROBE_TIMEOUT_MS ?? 15_000);

  return { apiKey, baseUrl, timeoutMs };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchModels({
  apiKey,
  baseUrl,
  timeoutMs,
}: {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}) {
  const response = await fetchWithTimeout(
    `${baseUrl}/models`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
    timeoutMs,
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`models HTTP ${response.status}: ${sanitizeMessage(text)}`);
  }

  const data = JSON.parse(text) as {
    data?: Array<string | { id?: string; name?: string }>;
    models?: Array<string | { id?: string; name?: string }>;
  };

  return (data.data ?? data.models ?? [])
    .map((item) =>
      typeof item === "string" ? item : (item.id ?? item.name ?? ""),
    )
    .filter(Boolean);
}

async function probeModel({
  apiKey,
  baseUrl,
  model,
  timeoutMs,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}): Promise<ProbeResult> {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Return exactly: pong" }],
          temperature: 0,
          max_tokens: 8,
          stream: false,
        }),
      },
      timeoutMs,
    );
    const text = await response.text();

    if (!response.ok) {
      return {
        model,
        ok: false,
        status: response.status,
        error: sanitizeMessage(text),
      };
    }

    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";

    return {
      model,
      ok: content.length > 0,
      status: response.status,
      contentLength: content.length,
      error: content.length > 0 ? undefined : "empty content",
    };
  } catch (error) {
    return {
      model,
      ok: false,
      error: sanitizeMessage(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

async function main() {
  loadLocalEnv();

  const { apiKey, baseUrl, timeoutMs } = getConfig();
  const checkedAt = new Date().toISOString();

  if (!apiKey) {
    console.log(
      JSON.stringify(
        {
          status: "skipped_missing_api_key",
          checkedAt,
          baseUrl,
          requiredEnv:
            "Set AGENT_FACTORY_LLM_API_KEY or NINE_ROUTER_API_KEY before probing chat completions.",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const cliModels = (argValue("models") ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const warnings: string[] = [];
  let modelList: string[] = [];

  if (cliModels.length === 0) {
    try {
      modelList = await fetchModels({ apiKey, baseUrl, timeoutMs });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  const candidates = unique([
    ...cliModels,
    ...modelList.filter((model) => FREE_MODEL_PATTERN.test(model)),
    ...DEFAULT_CANDIDATES,
  ]);

  const results: ProbeResult[] = [];
  for (const model of candidates) {
    results.push(await probeModel({ apiKey, baseUrl, model, timeoutMs }));
  }

  console.log(
    JSON.stringify(
      {
        status: results.some((result) => result.ok)
          ? "usable_model_found"
          : "no_usable_model_found",
        checkedAt,
        baseUrl,
        modelListCount: modelList.length,
        candidateCount: candidates.length,
        usableModels: results
          .filter((result) => result.ok)
          .map((result) => result.model),
        warnings,
        results,
      },
      null,
      2,
    ),
  );

  if (!results.some((result) => result.ok)) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    sanitizeMessage(error instanceof Error ? error.message : String(error)),
  );
  process.exit(1);
});
