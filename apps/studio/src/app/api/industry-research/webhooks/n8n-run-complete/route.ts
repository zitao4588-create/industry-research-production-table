import { NextResponse } from "next/server";
import {
  authorizeN8nWebhookRequest,
  loadServerEnv,
} from "../../_lib/server-env";

export const runtime = "nodejs";

const MAX_WEBHOOK_BODY_BYTES = 64_000;

class WebhookValidationError extends Error {}

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
    status: body.status,
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

    return NextResponse.json({
      schemaVersion: "industry_research_n8n_run_complete_ack.v1",
      accepted: true,
      receivedAt: new Date().toISOString(),
      event: payload,
      persistence: "reserved_only",
      note: "当前仅预留 n8n 回调合约，尚未写入 Supabase 或启动公网 n8n。",
    });
  } catch (error) {
    const status = error instanceof WebhookValidationError ? 400 : 500;
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json({ error: message }, { status });
  }
}
