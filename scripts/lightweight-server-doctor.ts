import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadServerEnv,
  SUPABASE_PROJECT_REF_ENV,
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  SUPABASE_URL_ENV,
} from "../apps/studio/src/app/api/industry-research/_lib/server-env.ts";

type Check = {
  name: string;
  ok: boolean;
  severity: "info" | "warn" | "error";
  detail: string;
};

const DEFAULT_RUNS_DIR = "/var/lib/industry-research/runs";
const DEFAULT_ZVEC_DIR = "/var/lib/industry-research/zvec/chunks";
const EXPECTED_BASE_URL = "https://research.playgamelab.cn";

function truthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function check(name: string, ok: boolean, detail: string): Check {
  return {
    name,
    ok,
    severity: ok ? "info" : "error",
    detail,
  };
}

function warn(name: string, ok: boolean, detail: string): Check {
  return {
    name,
    ok,
    severity: ok ? "info" : "warn",
    detail,
  };
}

async function ensureWritableDir(path: string): Promise<Check> {
  try {
    await mkdir(path, { recursive: true });
    await access(path);
    return check("writable_dir", true, path);
  } catch (error) {
    return check(
      "writable_dir",
      false,
      `${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  const env = loadServerEnv();
  const port = env.PORT || "3010";
  const baseUrl = env.AGENT_FACTORY_BASE_URL || env.NEXT_PUBLIC_APP_URL || "";
  const runsDir =
    env.AGENT_FACTORY_INDUSTRY_RESEARCH_RUNS_DIR || DEFAULT_RUNS_DIR;
  const zvecDir = env.AGENT_FACTORY_ZVEC_DIR || DEFAULT_ZVEC_DIR;
  const supabaseEnabled = truthy(env.AGENT_FACTORY_SUPABASE_ENABLED);
  const zvecEnabled = truthy(env.AGENT_FACTORY_ZVEC_ENABLED);
  const checks: Check[] = [
    check(
      "deployment_target",
      env.AGENT_FACTORY_DEPLOYMENT_TARGET === "lightweight_server",
      "AGENT_FACTORY_DEPLOYMENT_TARGET should be lightweight_server in production.",
    ),
    check(
      "node_env",
      env.NODE_ENV === "production",
      "NODE_ENV should be production.",
    ),
    warn(
      "port",
      port === "3010",
      `PORT is ${port}; expected 3010 behind Caddy.`,
    ),
    check(
      "base_url",
      baseUrl === EXPECTED_BASE_URL,
      `base URL is ${baseUrl || "(empty)"}; expected ${EXPECTED_BASE_URL}.`,
    ),
    check(
      "internal_api_key",
      configured(env.AGENT_FACTORY_INTERNAL_API_KEY),
      "AGENT_FACTORY_INTERNAL_API_KEY must be set for protected run APIs.",
    ),
    check(
      "n8n_webhook_secret",
      configured(env.AGENT_FACTORY_N8N_WEBHOOK_SECRET),
      "AGENT_FACTORY_N8N_WEBHOOK_SECRET must match n8n Header Auth credential.",
    ),
    warn(
      "supabase_enabled",
      supabaseEnabled,
      supabaseEnabled
        ? "AGENT_FACTORY_SUPABASE_ENABLED is true; server run records will be persisted to Supabase."
        : "AGENT_FACTORY_SUPABASE_ENABLED is false; server run records will stay local only.",
    ),
    warn(
      "zvec_enabled",
      zvecEnabled,
      zvecEnabled
        ? "AGENT_FACTORY_ZVEC_ENABLED is true; zvec cache is part of server runtime."
        : "AGENT_FACTORY_ZVEC_ENABLED is false; zvec cache scripts can still run manually.",
    ),
  ];

  if (supabaseEnabled) {
    checks.push(
      check(
        "supabase_project_ref",
        configured(env[SUPABASE_PROJECT_REF_ENV]),
        `${SUPABASE_PROJECT_REF_ENV} must identify the dedicated industry-research project.`,
      ),
      check(
        "supabase_url",
        configured(env[SUPABASE_URL_ENV]),
        `${SUPABASE_URL_ENV} must be set on the lightweight server.`,
      ),
      check(
        "supabase_service_role",
        configured(env[SUPABASE_SERVICE_ROLE_KEY_ENV]),
        `${SUPABASE_SERVICE_ROLE_KEY_ENV} must stay server-only.`,
      ),
    );
  }

  checks.push(await ensureWritableDir(resolve(runsDir)));
  checks.push(await ensureWritableDir(resolve(zvecDir)));

  const hasErrors = checks.some(
    (item) => item.severity === "error" && !item.ok,
  );

  console.log(
    JSON.stringify(
      {
        status: hasErrors ? "failed" : "ok",
        checkedAt: new Date().toISOString(),
        expectedRuntime: {
          host: "research.playgamelab.cn",
          bind: "127.0.0.1:3010",
          processManager: "systemd",
          reverseProxy: "Caddy",
          runsDir: resolve(runsDir),
          zvecDir: resolve(zvecDir),
        },
        checks,
      },
      null,
      2,
    ),
  );

  if (hasErrors) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
