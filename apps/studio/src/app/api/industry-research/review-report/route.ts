import {
  createReviewedIndustryResearchReport,
  type ResearchReviewItem,
  type ResearchWorkflowResult,
} from "@industry-research/core";
import { NextResponse } from "next/server";
import {
  authorizeIndustryResearchRequest,
  loadServerEnv,
} from "../_lib/server-env";

class RequestValidationError extends Error {}

function parseReviewReportRequest(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new RequestValidationError("请求体必须是审核报告 JSON。");
  }

  const body = value as Record<string, unknown>;

  if (!body.result || typeof body.result !== "object") {
    throw new RequestValidationError("请求体缺少 result。");
  }

  if ("reviewItems" in body && !Array.isArray(body.reviewItems)) {
    throw new RequestValidationError("reviewItems 必须是数组。");
  }

  return {
    result: body.result as ResearchWorkflowResult,
    reviewItems: body.reviewItems as ResearchReviewItem[] | undefined,
  };
}

export async function POST(request: Request) {
  const env = loadServerEnv();
  const auth = authorizeIndustryResearchRequest(
    request,
    env,
    "行业研究审核报告 API",
  );

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { result, reviewItems } = parseReviewReportRequest(
      await request.json(),
    );
    const markdown = createReviewedIndustryResearchReport(result, reviewItems);

    return NextResponse.json({ markdown });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RequestValidationError ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
