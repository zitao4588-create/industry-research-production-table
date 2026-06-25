import type { WorkflowProgressEvent } from "@industry-research/core";
import { NextResponse } from "next/server";
import {
  executeIndustryResearchRun,
  parseRunRequest,
  RequestValidationError,
} from "../../_lib/run-core";
import { loadServerEnv } from "../../_lib/server-env";

export const runtime = "nodejs";

/**
 * SSE 完整版流式 run —— 浏览器同源入口(与 server action 一致,不要求内网 key)。
 * 把 core 的 WorkflowProgressEvent 译成前端 deriveRunState 直接吃的 RunEvent 帧,
 * 末尾发一个 {control:"result"|"error"} 控制帧。public_web 模式会逐阶段上报真实进度;
 * 其余模式当前只发 start/result(粗粒度),但同样以流式返回结果。
 */

// 真实阶段 → 模板 13 步的桶映射(让 completedSteps/13 在真实边界推进)。
const PHASE_STEPS: Record<"discover" | "crawl" | "build" | "report", string[]> =
  {
    discover: ["create_project", "discover_sources", "generate_crawl_plan"],
    crawl: ["mock_crawl_sources"],
    build: [
      "build_industry_databases",
      "supplement_sources",
      "extract_competitors",
      "extract_product_signals",
      "extract_pain_points",
      "extract_content_signals",
      "score_opportunities",
    ],
    report: ["human_review", "generate_report"],
  };

function translateProgress(
  event: WorkflowProgressEvent,
  send: (frame: unknown) => void,
) {
  switch (event.type) {
    case "phase": {
      const steps = PHASE_STEPS[event.phase] ?? [];
      if (event.status === "start") {
        const first = steps[0];
        if (first) {
          send({ type: "step.start", at: event.at, stepId: first });
        }
      } else {
        for (const stepId of steps) {
          send({ type: "step.done", at: event.at, stepId });
        }
      }
      break;
    }
    case "source":
      send({
        type: "source.found",
        at: event.at,
        candidate: {
          method: event.method,
          title: event.title,
          seed: event.seed,
          priority: event.priority,
          db: [],
        },
      });
      break;
    case "crawl":
      send({
        type: "crawl.progress",
        at: event.at,
        completed: event.completed,
        total: event.total,
        rawDocs: event.rawDocs,
      });
      break;
    case "db":
      send({
        type: "db.upserted",
        at: event.at,
        database: event.database,
        count: event.count,
      });
      break;
    case "log":
      send({ type: "log", at: event.at, message: event.message });
      break;
  }
}

export async function POST(request: Request) {
  const env = loadServerEnv();

  let parsed: ReturnType<typeof parseRunRequest>;
  try {
    parsed = parseRunRequest(await request.json().catch(() => null));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RequestValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
  const { input, mode } = parsed;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(frame)}\n\n`),
        );
      };
      try {
        const { result, deliveryPackage } = await executeIndustryResearchRun({
          input,
          mode,
          env,
          onProgress: (event) => translateProgress(event, send),
        });
        send({ control: "result", result, deliveryPackage });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send({ control: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
