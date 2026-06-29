import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const INTERNAL_KEY_ENV = "AGENT_FACTORY_INTERNAL_API_KEY";
export const N8N_WEBHOOK_SECRET_ENV = "AGENT_FACTORY_N8N_WEBHOOK_SECRET";
export const SUPABASE_ENABLED_ENV = "AGENT_FACTORY_SUPABASE_ENABLED";
export const SUPABASE_PROJECT_REF_ENV = "AGENT_FACTORY_SUPABASE_PROJECT_REF";
export const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";
export const ZVEC_ENABLED_ENV = "AGENT_FACTORY_ZVEC_ENABLED";
export const ZVEC_DIR_ENV = "AGENT_FACTORY_ZVEC_DIR";
export const SERVER_ENV_FILE_ENV = "AGENT_FACTORY_ENV_FILE";
export const ALLOWED_ORIGINS_ENV = "AGENT_FACTORY_ALLOWED_ORIGINS";
export const ALLOWED_HOSTS_ENV = "AGENT_FACTORY_ALLOWED_HOSTS";
export const RUN_STREAM_TIMEOUT_MS_ENV = "AGENT_FACTORY_RUN_TIMEOUT_MS";
export const RUN_STREAM_MAX_BODY_BYTES_ENV = "AGENT_FACTORY_RUN_MAX_BODY_BYTES";
export const RUN_STREAM_RATE_LIMIT_ENV =
  "AGENT_FACTORY_MAX_RUNS_PER_IP_PER_HOUR";

const DEFAULT_SERVER_ENV_FILE = "/etc/industry-research/industry-research.env";

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
    DEFAULT_SERVER_ENV_FILE,
    process.env[SERVER_ENV_FILE_ENV]?.trim(),
  ].filter((filePath): filePath is string => Boolean(filePath));
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

export function isTruthyEnv(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}
