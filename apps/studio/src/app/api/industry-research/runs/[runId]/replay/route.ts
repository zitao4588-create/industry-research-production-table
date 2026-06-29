import { NextResponse } from "next/server";
import {
  getLocalIndustryResearchRunDetail,
  LocalRunNotFoundError,
} from "../../../_lib/local-runs";
import {
  executeIndustryResearchRun,
  parseRunMode,
} from "../../../_lib/run-core";
import {
  authorizeIndustryResearchRequest,
  loadServerEnv,
} from "../../../_lib/server-env";
import { getIndustryResearchSupabaseRunDetail } from "../../../_lib/supabase-run-store";

export const runtime = "nodejs";

type RouteContext = {
  params: { runId: string } | Promise<{ runId: string }>;
};

async function routeParams(context: RouteContext) {
  return await context.params;
}

export async function POST(request: Request, context: RouteContext) {
  const env = loadServerEnv();
  const auth = authorizeIndustryResearchRequest(
    request,
    env,
    "行业研究 run replay API",
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { runId } = await routeParams(context);
    const sourceRun =
      (await getIndustryResearchSupabaseRunDetail({ runId, env })) ??
      (await getLocalIndustryResearchRunDetail(runId));

    if (!sourceRun.input) {
      return NextResponse.json(
        { error: "原 run 缺少 input.json，无法 replay。" },
        { status: 409 },
      );
    }

    const mode = parseRunMode(
      sourceRun.run_log.providerMetadata?.requestedMode ??
        sourceRun.run_log.providerMetadata?.canonicalMode ??
        sourceRun.mode,
    );
    const replay = await executeIndustryResearchRun({
      input: sourceRun.input,
      mode,
      env,
    });

    return NextResponse.json({
      schemaVersion: "industry_research_run_replay.v1",
      replayOf: runId,
      mode,
      ...replay,
    });
  } catch (error) {
    if (error instanceof LocalRunNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
