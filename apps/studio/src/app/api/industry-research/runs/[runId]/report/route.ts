import { NextResponse } from "next/server";
import {
  getLocalIndustryResearchPublicReportPackage,
  LocalRunNotFoundError,
} from "../../../_lib/local-runs";
import {
  buildSafePublicReportMarkdown,
  buildSafeReportInput,
  buildSafeReportSummary,
} from "../../../_lib/report-summary";
import {
  RunSecurityError,
  validateRunStreamTokenRequest,
} from "../../../_lib/run-security";
import { loadServerEnv } from "../../../_lib/server-env";
import { getIndustryResearchSupabasePublicReportPackage } from "../../../_lib/supabase-run-store";

export const runtime = "nodejs";

type RouteContext = {
  params: { runId: string } | Promise<{ runId: string }>;
};

/**
 * 报告只读端点：给 ?run= 分享链接用的浏览器同源入口。
 * 与 run/stream 相同的 Host/Origin 白名单校验（不要求内网 key），
 * 只返回报告 Markdown、项目基本信息与白名单摘要，不暴露完整 run 细节。
 */
export async function GET(request: Request, context: RouteContext) {
  const env = loadServerEnv();

  try {
    validateRunStreamTokenRequest(request, env);
  } catch (error) {
    if (error instanceof RunSecurityError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }

  try {
    const { runId } = await context.params;
    const run =
      (await getIndustryResearchSupabasePublicReportPackage({ runId, env })) ??
      (await getLocalIndustryResearchPublicReportPackage(runId));
    const reportMarkdown =
      run.reviewedReportMarkdown || run.reportMarkdown || null;

    if (!reportMarkdown) {
      return NextResponse.json(
        { error: "该运行记录没有可展示的报告。" },
        { status: 404 },
      );
    }

    const input = buildSafeReportInput(run.input);
    const summary = buildSafeReportSummary({
      databases: run.databases,
      runLog: run.run_log,
      reportMarkdown,
    });

    return NextResponse.json({
      schemaVersion: "industry_research_run_report.v3",
      runId: run.runId,
      input,
      reportMarkdown: buildSafePublicReportMarkdown({
        input,
        reportMarkdown,
        summary,
      }),
      summary,
    });
  } catch (error) {
    if (error instanceof LocalRunNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
