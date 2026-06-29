"use server";
/* =============================================================================
 * actions.ts — same-origin BFF for the research workbench (client component).
 * -----------------------------------------------------------------------------
 * The workbench is a "use client" component, so it cannot safely carry the
 * internal API key (`AGENT_FACTORY_INTERNAL_API_KEY`) into the browser. These
 * server actions run server-side, read env via `loadServerEnv()`, and reuse the
 * exact same run/review/download core as the REST routes — without exposing any
 * secret. The REST routes stay as the key-protected contract for n8n/external.
 *
 * Every action returns a discriminated `{ ok }` result so the client gets a
 * reliable error message (Next redacts thrown server-action errors in prod).
 * ===========================================================================*/
import {
  createReviewedIndustryResearchReport,
  type ResearchReviewItem,
  type ResearchWorkflowResult,
} from "@industry-research/core";
import {
  getLocalIndustryResearchDownloadPackage,
  LocalRunNotFoundError,
} from "../api/industry-research/_lib/local-runs";
import {
  executeIndustryResearchRun,
  type IndustryResearchRunResult,
  parseResearchWorkflowInput,
  parseRunMode,
} from "../api/industry-research/_lib/run-core";
import { loadServerEnv } from "../api/industry-research/_lib/server-env";

/** Real run modes the UI can trigger (Mock stays local, never hits this). */
type UiRunMode =
  | "9router"
  | "public_web"
  | "public_web_9router"
  | "deepseek"
  | "public_web_deepseek"
  | "glm"
  | "public_web_glm";

type RunActionResult =
  | ({ ok: true } & IndustryResearchRunResult)
  | { ok: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run the real workflow for one of the non-mock modes. Validates input with the
 * same size caps as the REST route, then normalizes the mode + persists the
 * delivery package. No auth header needed: this is same-origin and server-side.
 */
export async function runIndustryResearchAction(
  rawInput: unknown,
  uiMode: UiRunMode,
): Promise<RunActionResult> {
  try {
    const env = loadServerEnv();
    const input = parseResearchWorkflowInput(rawInput);
    const mode = parseRunMode(uiMode);
    const { result, deliveryPackage } = await executeIndustryResearchRun({
      input,
      mode,
      env,
    });

    return { ok: true, result, deliveryPackage };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

type ReviewActionResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

/**
 * Regenerate the human-reviewed report markdown from the run result + the
 * reviewer's picks. This is the online equivalent of `reviewed_report.md`.
 */
export async function reviewReportAction(
  result: ResearchWorkflowResult,
  reviewItems?: ResearchReviewItem[],
): Promise<ReviewActionResult> {
  try {
    if (!result || typeof result !== "object") {
      return { ok: false, error: "缺少有效的 run 结果，无法生成审核报告。" };
    }

    const markdown = createReviewedIndustryResearchReport(result, reviewItems);

    return { ok: true, markdown };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

type DownloadActionResult =
  | { ok: true; filename: string; json: string }
  | { ok: false; error: string };

/**
 * Read a persisted delivery package by runId and hand the JSON back to the
 * browser, which turns it into a downloadable Blob. Only real runs persist a
 * package, so mock runs never get a runId to call this with.
 */
export async function downloadDeliveryPackageAction(
  runId: string,
): Promise<DownloadActionResult> {
  try {
    if (!runId) {
      return { ok: false, error: "缺少 runId，无法下载交付包。" };
    }

    const deliveryPackage =
      await getLocalIndustryResearchDownloadPackage(runId);

    return {
      ok: true,
      filename: `industry-research-${runId}-delivery-package.json`,
      json: `${JSON.stringify(deliveryPackage, null, 2)}\n`,
    };
  } catch (error) {
    if (error instanceof LocalRunNotFoundError) {
      return { ok: false, error: error.message };
    }

    return { ok: false, error: errorMessage(error) };
  }
}
