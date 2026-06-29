import {
  fetchIndustryResearchSupabaseRun,
  persistIndustryResearchArtifactsToSupabase,
  resolveSupabaseInfraConfig,
} from "../apps/studio/src/app/api/industry-research/_lib/supabase-run-store.ts";
import {
  createIndustryResearchDeliveryArtifacts,
  type ResearchWorkflowInput,
  runMockIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";

function smokeInput(): ResearchWorkflowInput {
  return {
    projectName: "Supabase smoke 行业研究",
    industry: "电商竞品研究",
    category: "基础设施验证",
    market: "内部环境",
    researchGoal: "验证 Supabase service role 能写入并读回行业研究 run。",
    templateId: "ecommerce_competitor_research",
    urls: [],
    csvText: "",
    manualText: "Supabase smoke test，不调用真实 LLM，不抓取外部网页。",
  };
}

async function main() {
  const config = resolveSupabaseInfraConfig();

  if (!config.enabled || config.missing.length > 0) {
    console.log(
      JSON.stringify(
        {
          status: "skipped_supabase_not_ready",
          enabled: config.enabled,
          projectRef: config.projectRef ?? null,
          missing: config.missing,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const input = smokeInput();
  const result = runMockIndustryResearchWorkflow(input);
  const finishedAt = new Date().toISOString();
  const runId = `supabase-smoke-${startedAt.replace(/[:.]/g, "-")}`;
  const artifacts = createIndustryResearchDeliveryArtifacts({
    input,
    result,
    runId,
    startedAt,
    finishedAt,
  });

  await persistIndustryResearchArtifactsToSupabase({ artifacts });

  const savedRun = await fetchIndustryResearchSupabaseRun({ runId });

  console.log(
    JSON.stringify(
      {
        status: savedRun?.run_id === runId ? "ok" : "failed_readback",
        projectRef: config.projectRef,
        runId,
        artifactKinds: artifacts.manifest.files.map((file) => file.kind),
        readBack: Boolean(savedRun),
      },
      null,
      2,
    ),
  );

  if (savedRun?.run_id !== runId) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
