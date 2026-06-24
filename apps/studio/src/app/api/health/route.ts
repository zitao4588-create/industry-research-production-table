import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "agent-factory-studio",
    checkedAt: new Date().toISOString(),
    industryResearch: {
      defaultProvider: "deepseek-v4-flash",
      runStorage: "local_json_markdown",
      automation: "n8n_reserved",
    },
  });
}
