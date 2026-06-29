import {
  loadServerEnv,
  SUPABASE_ENABLED_ENV,
} from "../apps/studio/src/app/api/industry-research/_lib/server-env.ts";
import {
  createIndustryResearchSupabaseAdminClient,
  resolveSupabaseInfraConfig,
} from "../apps/studio/src/app/api/industry-research/_lib/supabase-run-store.ts";

const REQUIRED_TABLES = [
  "industry_research_runs",
  "industry_research_artifacts",
  "industry_research_n8n_events",
  "industry_research_zvec_chunks",
] as const;

async function checkTable(tableName: string) {
  const client = createIndustryResearchSupabaseAdminClient();

  if (!client) {
    return { tableName, ok: false, reason: "supabase_disabled" };
  }

  const { error } = await client
    .from(tableName)
    .select("*", { count: "exact", head: true });

  return {
    tableName,
    ok: !error,
    reason: error?.message,
  };
}

async function main() {
  const env = loadServerEnv();
  const config = resolveSupabaseInfraConfig(env);

  if (!config.enabled) {
    console.log(
      JSON.stringify(
        {
          status: "disabled",
          message: `Set ${SUPABASE_ENABLED_ENV}=true to enable Supabase persistence checks.`,
          missingWhenEnabled: config.missing,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (config.missing.length > 0) {
    console.log(
      JSON.stringify(
        {
          status: "failed_missing_env",
          projectRef: config.projectRef ?? null,
          missing: config.missing,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const tableChecks = await Promise.all(REQUIRED_TABLES.map(checkTable));
  const ok = tableChecks.every((check) => check.ok);

  console.log(
    JSON.stringify(
      {
        status: ok ? "ok" : "failed_table_check",
        projectRef: config.projectRef,
        urlConfigured: Boolean(config.url),
        serviceRoleKeyConfigured: Boolean(config.serviceRoleKey),
        rlsModel: "deny_by_default_service_role_only",
        tableChecks,
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
