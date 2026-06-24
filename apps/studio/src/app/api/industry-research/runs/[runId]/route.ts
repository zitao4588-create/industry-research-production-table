import { NextResponse } from "next/server";
import {
  getLocalIndustryResearchRunDetail,
  LocalRunNotFoundError,
} from "../../_lib/local-runs";
import {
  authorizeIndustryResearchRequest,
  loadServerEnv,
} from "../../_lib/server-env";

export const runtime = "nodejs";

type RouteContext = {
  params: { runId: string } | Promise<{ runId: string }>;
};

async function routeParams(context: RouteContext) {
  return await context.params;
}

export async function GET(request: Request, context: RouteContext) {
  const env = loadServerEnv();
  const auth = authorizeIndustryResearchRequest(
    request,
    env,
    "行业研究 run 详情 API",
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { runId } = await routeParams(context);
    const run = await getLocalIndustryResearchRunDetail(runId);

    return NextResponse.json({
      schemaVersion: "industry_research_run_detail.v1",
      run,
    });
  } catch (error) {
    if (error instanceof LocalRunNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
