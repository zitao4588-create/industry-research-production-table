import { NextResponse } from "next/server";
import {
  authorizeN8nWebhookRequest,
  loadServerEnv,
} from "../../_lib/server-env";
import { recordIndustryResearchN8nEvent } from "../../_lib/supabase-run-store";

export const runtime = "nodejs";

const MAX_WEBHOOK_BODY_BYTES = 64_000;

class WebhookValidationError extends Error {}

type WebhookStatus = "queued" | "running" | "completed" | "failed";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseWebhookPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new WebhookValidationError("webhook 请求体必须是 JSON object。");
  }

  const body = value as Record<string, unknown>;

  if (!isString(body.runId) || !body.runId.trim()) {
    throw new WebhookValidationError("webhook 请求体缺少 runId。");
  }

  if (
    body.status !== "queued" &&
    body.status !== "running" &&
    body.status !== "completed" &&
    body.status !== "failed"
  ) {
    throw new WebhookValidationError(
      "webhook status 必须是 queued、running、completed 或 failed。",
    );
  }

  return {
    runId: body.runId.trim(),
    status: body.status as WebhookStatus,
    n8nExecutionId: isString(body.n8nExecutionId)
      ? body.n8nExecutionId.trim()
      : undefined,
    deliveryPackageApiPath: isString(body.deliveryPackageApiPath)
      ? body.deliveryPackageApiPath.trim()
      : undefined,
    message: isString(body.message) ? body.message.trim() : undefined,
  };
}

export async function POST(request: Request) {
  const env = loadServerEnv();
  const auth = authorizeN8nWebhookRequest(request, env);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const rawBody = await request.text();

    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
      throw new WebhookValidationError("webhook 请求体超过 64KB 上限。");
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new WebhookValidationError("webhook 请求体不是合法 JSON。");
    }

    const payload = parseWebhookPayload(parsed);
    const persistence = await recordIndustryResearchN8nEvent({
      event: {
        ...payload,
        payload: parsed as Record<string, unknown>,
      },
      env,
    });

    return NextResponse.json({
      schemaVersion: "industry_research_n8n_run_complete_ack.v1",
      accepted: true,
      receivedAt: new Date().toISOString(),
      event: payload,
      persistence: persistence.enabled ? "supabase" : "disabled",
      note: persistence.enabled
        ? "n8n 回调事件已写入 Supabase 事件表。"
        : "Supabase persistence 未启用；本次只完成回调鉴权与 payload 校验。",
    });
  } catch (error) {
    const status = error instanceof WebhookValidationError ? 400 : 500;
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json({ error: message }, { status });
  }
}
