import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const INTERNAL_KEY_ENV = "AGENT_FACTORY_INTERNAL_API_KEY";
export const N8N_WEBHOOK_SECRET_ENV = "AGENT_FACTORY_N8N_WEBHOOK_SECRET";

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

export function loadServerEnv() {
  // Provider keys live at the monorepo root. Keep app-local env as a fallback.
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

export function authorizeIndustryResearchRequest(
  request: Request,
  env: Record<string, string | undefined>,
  apiLabel = "行业研究 API",
): { ok: true } | { ok: false; status: number; message: string } {
  const configuredKey = env[INTERNAL_KEY_ENV]?.trim();
  const isProduction = env.NODE_ENV === "production";

  if (!configuredKey) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        message: `${apiLabel} 未配置 ${INTERNAL_KEY_ENV}，生产环境拒绝在无鉴权下运行。`,
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

export function authorizeN8nWebhookRequest(
  request: Request,
  env: Record<string, string | undefined>,
): { ok: true } | { ok: false; status: number; message: string } {
  const configuredSecret = env[N8N_WEBHOOK_SECRET_ENV]?.trim();
  const isProduction = env.NODE_ENV === "production";

  if (!configuredSecret) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        message: `n8n webhook 未配置 ${N8N_WEBHOOK_SECRET_ENV}，生产环境拒绝在无 shared secret 下运行。`,
      };
    }
    return { ok: true };
  }

  const provided =
    request.headers.get("x-agent-factory-webhook-secret") ??
    request.headers.get("x-n8n-webhook-secret");

  if (!provided || provided !== configuredSecret) {
    return {
      ok: false,
      status: 401,
      message: "未授权：缺少或不匹配的 n8n webhook shared secret。",
    };
  }

  return { ok: true };
}
