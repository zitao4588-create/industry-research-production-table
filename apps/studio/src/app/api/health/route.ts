import { NextResponse } from "next/server";
import {
  isTruthyEnv,
  loadServerEnv,
} from "../industry-research/_lib/server-env";

export const runtime = "nodejs";

export async function GET() {
  const env = loadServerEnv();

  return NextResponse.json({
    status: "ok",
    service: "industry-research-studio",
    checkedAt: new Date().toISOString(),
    industryResearch: {
      deploymentTarget: env.AGENT_FACTORY_DEPLOYMENT_TARGET || "local_dev",
      productionRuntime: "lightweight_server",
      baseUrl: env.AGENT_FACTORY_BASE_URL || env.NEXT_PUBLIC_APP_URL || null,
      defaultWorkflowMode: "public_web",
      llmProvider: "9router_or_openai_compatible",
      llmDefaultSafeForProduction: false,
      runStorage: isTruthyEnv(env.AGENT_FACTORY_SUPABASE_ENABLED)
        ? "supabase_and_local_json_markdown"
        : "local_json_markdown",
      runsDir:
        env.AGENT_FACTORY_INDUSTRY_RESEARCH_RUNS_DIR ||
        "outputs/industry-research-runs",
      zvecCache: isTruthyEnv(env.AGENT_FACTORY_ZVEC_ENABLED)
        ? "enabled"
        : "available_disabled",
      automation: "n8n_public_web",
    },
  });
}
