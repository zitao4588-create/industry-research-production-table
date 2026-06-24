import { NextResponse } from "next/server";
import { listLocalIndustryResearchRuns } from "../_lib/local-runs";
import {
  authorizeIndustryResearchRequest,
  loadServerEnv,
} from "../_lib/server-env";

export const runtime = "nodejs";

function parseLimit(request: Request) {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get("limit") ?? 50);

  return Number.isFinite(value) ? Math.max(1, Math.min(100, value)) : 50;
}

export async function GET(request: Request) {
  const env = loadServerEnv();
  const auth = authorizeIndustryResearchRequest(
    request,
    env,
    "行业研究 run 列表 API",
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const runs = await listLocalIndustryResearchRuns(parseLimit(request));

  return NextResponse.json({
    schemaVersion: "industry_research_run_list.v1",
    runs,
  });
}
