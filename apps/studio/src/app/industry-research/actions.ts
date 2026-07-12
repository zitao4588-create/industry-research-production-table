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
  createIndustryModuleResultsArtifact,
  createIndustryReportBundle,
  createReviewedIndustryResearchReport,
  createSkincareModuleContractFixture,
  createSkincareSynthesisContractClaims,
  type IndustryModuleResultsArtifact,
  type IndustryPlan,
  type IndustryReportBundle,
  type IndustryRepresentativeSamplePlan,
  industryResearchModuleOrder,
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
import { getIndustryResearchSupabaseDownloadPackage } from "../api/industry-research/_lib/supabase-run-store";

/** Real run modes the UI can trigger (Mock stays local, never hits this). */
type UiRunMode =
  | "public_web"
  | "public_web_llm"
  | "llm_only"
  | "9router"
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

export type IndustryOsUiPayload = {
  schemaVersion: "industry_os_ui_payload.v1";
  evidenceMode: "contract_fixture";
  industryPlan: IndustryPlan;
  representativeSamplePlan: IndustryRepresentativeSamplePlan;
  moduleResults: IndustryModuleResultsArtifact;
  reportBundle: IndustryReportBundle;
  stages: Array<{
    id:
      | "planning"
      | "breadth_scan"
      | "sampling"
      | "module_research"
      | "synthesis"
      | "reporting";
    label: string;
    status: "completed";
  }>;
};

type IndustryOsFixtureActionResult =
  | { ok: true; payload: IndustryOsUiPayload }
  | { ok: false; error: string };

/**
 * G9 本地完整流程验收入口。它只组装 G2-G8 contract fixture，不访问 env、
 * 网络、provider、数据库或生产，也不会写入旧 8 文件交付包。
 */
export async function runIndustryOsFixtureAction(): Promise<IndustryOsFixtureActionResult> {
  try {
    const fixtures = industryResearchModuleOrder.map((moduleId) => ({
      moduleId,
      fixture: createSkincareModuleContractFixture(moduleId),
    }));
    const shared = fixtures[0]?.fixture;
    if (!shared) throw new Error("industry_os_ui_fixture_missing");
    const moduleResults = createIndustryModuleResultsArtifact({
      industryPlan: shared.industryPlan,
      representativeSamplePlan: shared.representativeSamplePlan,
      moduleInputs: fixtures.map(({ moduleId, fixture }) => ({
        moduleId,
        claimInputs: fixture.claimInputs,
        sources: fixture.sources,
        rawDocuments: fixture.rawDocuments,
        evidence: fixture.evidence,
      })),
    });
    const reportBundle = createIndustryReportBundle({
      moduleResults,
      evidenceMode: "contract_fixture",
      synthesisClaims: createSkincareSynthesisContractClaims(),
    });
    return {
      ok: true,
      payload: {
        schemaVersion: "industry_os_ui_payload.v1",
        evidenceMode: "contract_fixture",
        industryPlan: shared.industryPlan,
        representativeSamplePlan: shared.representativeSamplePlan,
        moduleResults,
        reportBundle,
        stages: [
          { id: "planning", label: "研究规划", status: "completed" },
          { id: "breadth_scan", label: "广度扫描", status: "completed" },
          { id: "sampling", label: "代表抽样", status: "completed" },
          { id: "module_research", label: "模块研究", status: "completed" },
          { id: "synthesis", label: "跨模块综合", status: "completed" },
          { id: "reporting", label: "报告与知识地图", status: "completed" },
        ],
      },
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
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

    const env = loadServerEnv();
    const deliveryPackage =
      (await getIndustryResearchSupabaseDownloadPackage({ runId, env })) ??
      (await getLocalIndustryResearchDownloadPackage(runId));

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
