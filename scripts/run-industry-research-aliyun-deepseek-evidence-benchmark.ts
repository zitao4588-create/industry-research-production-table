import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assessEvidenceCompleteFindings } from "../packages/industry-research/src/evidence-completeness.ts";
import {
  collectAmazonPublicEvidence,
  createIndustryResearchDeliveryArtifacts,
  createResearchProjectId,
  type OpenAICompatibleFetch,
  type PublicCrawlerFetch,
  type ResearchWorkflowInput,
  runPublicOpenAICompatibleIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";

const benchmarkVersion = "aliyun-deepseek-amazon-evidence-v1";
const expectedModel = "deepseek-v4-flash";
const minimumConfirmedFindingRatio = 0.7;
const minimumReviewedAsins = 2;
const maxLlmRequests = 8;
const maxPublicRequests = 40;
const wallTimeMs = 300_000;

type UsageRecord = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

function loadLocalEnv() {
  if (!existsSync(".env.local")) return {};

  return readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return env;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) return env;
      const key = trimmed.slice(0, separatorIndex).trim();
      env[key] = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      return env;
    }, {});
}

function createInput(): ResearchWorkflowInput {
  return {
    projectName: "宠物肠胃益生菌商业化证据报告（阿里云 DeepSeek + Amazon）",
    industry: "宠物健康电商",
    category: "宠物肠胃益生菌",
    market: "美国 Amazon 与 DTC 电商",
    researchGoal:
      "用公开官网商品证据和至少两个 Amazon ASIN 的直接买家评论，形成可逐条验证的竞品、痛点与候选机会结论。",
    templateId: "ecommerce_competitor_research",
    urls: [],
    csvText: "",
    manualText:
      "所有需求、痛点和机会结论必须引用 acceptedForReport 原文；Amazon 评论只证明具体买家表达，不外推销量、市场份额或总体偏好。",
  };
}

function benchmarkEnv() {
  const env: Record<string, string | undefined> = {
    ...loadLocalEnv(),
    ...process.env,
    AGENT_FACTORY_AMAZON_PUBLIC_EVIDENCE_ENABLED: "true",
    AGENT_FACTORY_LLM_THINKING: "disabled",
    AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_QUERIES: "2",
    AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_RESULTS_PER_QUERY: "4",
    AGENT_FACTORY_PUBLIC_WEB_MAX_DISCOVERED_TARGETS: "10",
    AGENT_FACTORY_PUBLIC_WEB_MAX_PROBE_URLS: "8",
    AGENT_FACTORY_PUBLIC_WEB_MAX_SITEMAP_URLS: "4",
    AGENT_FACTORY_PUBLIC_WEB_MAX_CRAWL_TARGETS: "8",
    AGENT_FACTORY_PUBLIC_WEB_REQUEST_TIMEOUT_MS: "12000",
    AGENT_FACTORY_FIRECRAWL_ENABLED: "false",
    AGENT_FACTORY_FIRECRAWL_MAP_ENABLED: "false",
    AGENT_FACTORY_FIRECRAWL_CRAWL_FALLBACK_ENABLED: "false",
    AGENT_FACTORY_FIRECRAWL_API_KEY: "",
    FIRECRAWL_API_KEY: "",
    AGENT_FACTORY_YOUTUBE_API_KEY: "",
    AGENT_FACTORY_REDDIT_ACCESS_TOKEN: "",
    AGENT_FACTORY_DEEPSEEK_API_KEY: "",
    AGENT_FACTORY_DEEPSEEK_BASE_URL: "",
    AGENT_FACTORY_DEEPSEEK_MODEL: "",
    DEEPSEEK_API_KEY: "",
    DEEPSEEK_BASE_URL: "",
    DEEPSEEK_MODEL: "",
  };
  return env;
}

function validateProvider(env: Record<string, string | undefined>) {
  const baseUrl = env.AGENT_FACTORY_LLM_BASE_URL?.trim() ?? "";
  const model = env.AGENT_FACTORY_LLM_MODEL?.trim() ?? "";
  const apiKeyConfigured = Boolean(env.AGENT_FACTORY_LLM_API_KEY?.trim());
  let host = "";
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    host = "";
  }

  const errors: string[] = [];
  if (!apiKeyConfigured) errors.push("aliyun_deepseek_api_key_missing");
  if (!host.endsWith("aliyuncs.com")) {
    errors.push("aliyun_deepseek_base_url_not_aliyuncs");
  }
  if (!baseUrl.endsWith("/compatible-mode/v1")) {
    errors.push("aliyun_deepseek_base_url_not_openai_compatible");
  }
  if (model !== expectedModel) {
    errors.push(`aliyun_deepseek_model_must_be_${expectedModel}`);
  }
  if (host === "api.deepseek.com" || !/^deepseek-/i.test(model)) {
    errors.push("deepseek_official_or_non_deepseek_route_forbidden");
  }

  return { baseUrl, host, model, apiKeyConfigured, errors };
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function usageFromPayload(payload: unknown): UsageRecord | undefined {
  if (!payload || typeof payload !== "object" || !("usage" in payload)) {
    return undefined;
  }
  const usage = (payload as { usage?: Record<string, unknown> }).usage;
  if (!usage) return undefined;
  const numberValue = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  return {
    promptTokens: numberValue(usage.prompt_tokens),
    completionTokens: numberValue(usage.completion_tokens),
    totalTokens: numberValue(usage.total_tokens),
  };
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(process.cwd(), "[workspace]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
}

function auditMarkdown(result: {
  runId: string;
  status: "passed" | "failed";
  durationMs: number;
  providerHost: string;
  model: string;
  llmRequests: number;
  llmUsage: UsageRecord[];
  publicRequests: number;
  reviewedAsinCount: number;
  reviewedAsins: string[];
  confirmedFindings: number;
  findingCount: number;
  confirmedFindingRatio: number;
  blockers: string[];
}) {
  return [
    "# 阿里云百炼 DeepSeek + Amazon 完整报告 benchmark",
    "",
    `- 状态：${result.status}`,
    `- 模型：${result.model}`,
    `- Provider：${result.providerHost}`,
    "- DeepSeek 官方接口调用：0（runner 硬性拒绝 api.deepseek.com）",
    "- LLM 路由：仅允许阿里云百炼 aliyuncs.com 上的 DeepSeek",
    "- Firecrawl 调用：0（本 runner 显式清空 Firecrawl key 并关闭开关）",
    `- LLM 请求：${result.llmRequests}`,
    `- 公开网页请求：${result.publicRequests}`,
    `- 运行耗时：${result.durationMs} ms`,
    `- 评论覆盖 ASIN：${result.reviewedAsinCount}（${result.reviewedAsins.join(", ") || "无"}）`,
    `- 完整可证实结论：${result.confirmedFindings}/${result.findingCount}（${(result.confirmedFindingRatio * 100).toFixed(1)}%）`,
    `- 验收线：评论覆盖 >= ${minimumReviewedAsins} 个 ASIN；完整可证实结论 >= ${(minimumConfirmedFindingRatio * 100).toFixed(0)}%`,
    `- 阻塞项：${result.blockers.length > 0 ? result.blockers.join(", ") : "无"}`,
    "",
    "说明：免费额度状态由运行前百炼控制台人工核对；本文件只记录模型调用的 token usage，不把免费额度推断为现金成本。",
    "",
  ].join("\n");
}

async function main() {
  const execute = process.argv.includes("--execute");
  const amazonPreflightOnly = process.argv.includes("--amazon-preflight-only");
  const freeTierOnlyConfirmed = process.argv.includes(
    "--free-tier-only-confirmed",
  );
  const env = benchmarkEnv();
  const provider = validateProvider(env);
  const plan = {
    benchmarkVersion,
    execute,
    amazonPreflightOnly,
    freeTierOnlyConfirmed,
    provider: {
      host: provider.host,
      model: provider.model,
      apiKeyConfigured: provider.apiKeyConfigured,
      validationErrors: provider.errors,
    },
    limits: {
      maxLlmRequests,
      maxPublicRequests,
      wallTimeMs,
      minimumReviewedAsins,
      minimumConfirmedFindingRatio,
    },
    routes: {
      deepseekOfficialAllowed: false,
      aliyunHostedDeepseekAllowed: true,
      firecrawlAllowed: false,
      amazonJinaAllowed: true,
    },
  };

  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (!amazonPreflightOnly && !freeTierOnlyConfirmed) {
    throw new Error("aliyun_deepseek_free_tier_only_confirmation_required");
  }
  if (!amazonPreflightOnly && provider.errors.length > 0) {
    throw new Error(
      `aliyun_deepseek_provider_preflight_failed:${provider.errors.join(",")}`,
    );
  }

  const started = new Date();
  const runId = `${benchmarkVersion}-${timestampForPath(started)}`;
  const outputDir = join(
    "outputs",
    "industry-research-benchmarks",
    benchmarkVersion,
    runId,
  );
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(new Error("aliyun_deepseek_benchmark_wall_time_exceeded")),
    wallTimeMs,
  );
  let publicRequests = 0;
  let llmRequests = 0;
  const llmUsage: UsageRecord[] = [];

  const publicFetcher: PublicCrawlerFetch = async (input, init) => {
    if (publicRequests >= maxPublicRequests) {
      throw new Error("aliyun_deepseek_public_request_cap_exceeded");
    }
    publicRequests += 1;
    return fetch(input, { ...init, signal: init?.signal ?? deadline.signal });
  };
  const llmFetcher: OpenAICompatibleFetch = async (input, init) => {
    if (new URL(input).hostname === "api.deepseek.com") {
      throw new Error("deepseek_official_route_forbidden");
    }
    if (llmRequests >= maxLlmRequests) {
      throw new Error("aliyun_deepseek_llm_request_cap_exceeded");
    }
    llmRequests += 1;
    const response = await fetch(input, {
      ...init,
      signal: init.signal ?? deadline.signal,
    });
    try {
      const usage = usageFromPayload(await response.clone().json());
      if (usage) llmUsage.push(usage);
    } catch {
      // Error responses and some compatible providers may omit usage.
    }
    return response;
  };

  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "benchmark_run.json"), {
    ...plan,
    runId,
    outputDir,
    status: "running",
    startedAt: started.toISOString(),
  });

  try {
    const input = createInput();
    const projectId = createResearchProjectId(input);
    const amazonResult = await collectAmazonPublicEvidence(projectId, input, {
      env,
      fetcher: publicFetcher,
    });
    if (amazonResult.reviewedAsinCount < minimumReviewedAsins) {
      throw new Error(
        `amazon_review_asin_coverage_failed:${amazonResult.reviewedAsinCount}/${minimumReviewedAsins}`,
      );
    }

    if (amazonPreflightOnly) {
      const finished = new Date();
      const preflightResult = {
        ...plan,
        runId,
        outputDir,
        status: "amazon_preflight_passed",
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        publicRequests,
        amazon: {
          requestCount: amazonResult.requestCount,
          discoveredAsins: amazonResult.discoveredAsins,
          probedAsins: amazonResult.probedAsins,
          reviewedAsinCount: amazonResult.reviewedAsinCount,
          reviewedAsins: amazonResult.pages
            .filter((page) => page.reviewSnippets.length > 0)
            .map((page) => page.asin),
        },
      };
      await writeJson(join(outputDir, "benchmark_run.json"), preflightResult);
      console.log(JSON.stringify(preflightResult, null, 2));
      return;
    }

    const result = await runPublicOpenAICompatibleIndustryResearchWorkflow(
      input,
      {
        env,
        fetcher: llmFetcher,
        publicFetcher,
        now: started.toISOString(),
        amazonPublicEvidenceResult: amazonResult,
      },
    );
    const finished = new Date();
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
    });
    const evidenceCompleteness = assessEvidenceCompleteFindings({
      competitors: artifacts.databases.competitor_database,
      opportunities: artifacts.databases.opportunity_database,
      evidence: artifacts.databases.evidence,
      rawDocuments: artifacts.raw_documents,
    });
    const findingCount = evidenceCompleteness.findingCount;
    const confirmedFindings = evidenceCompleteness.evidenceCompleteFindings;
    const confirmedFindingRatio =
      evidenceCompleteness.evidenceCompleteFindingRatio;
    const reviewedAsins = amazonResult.pages
      .filter((page) => page.reviewSnippets.length > 0)
      .map((page) => page.asin);
    const blockers = [
      ...(confirmedFindingRatio < minimumConfirmedFindingRatio
        ? ["confirmed_finding_ratio_below_70_percent"]
        : []),
      ...(amazonResult.reviewedAsinCount < minimumReviewedAsins
        ? ["amazon_review_asin_coverage_below_2"]
        : []),
      ...(artifacts.run_log.credibility.llmFallback
        ? ["llm_fallback_used"]
        : []),
    ];
    const status = blockers.length === 0 ? "passed" : "failed";

    await writeJson(join(outputDir, "input.json"), artifacts.input);
    await writeJson(
      join(outputDir, "raw_documents.json"),
      artifacts.raw_documents,
    );
    await writeJson(join(outputDir, "databases.json"), artifacts.databases);
    await writeJson(
      join(outputDir, "review_items.json"),
      artifacts.review_items,
    );
    await writeFile(join(outputDir, "report.md"), artifacts.reportMarkdown);
    await writeFile(
      join(outputDir, "reviewed_report.md"),
      artifacts.reviewedReportMarkdown,
    );
    await writeJson(join(outputDir, "run_log.json"), artifacts.run_log);
    await writeJson(join(outputDir, "manifest.json"), artifacts.manifest);

    const audit = {
      runId,
      status,
      durationMs: finished.getTime() - started.getTime(),
      providerHost: provider.host,
      model: provider.model,
      llmRequests,
      llmUsage,
      publicRequests,
      amazon: {
        requestCount: amazonResult.requestCount,
        discoveredAsins: amazonResult.discoveredAsins,
        probedAsins: amazonResult.probedAsins,
        reviewedAsinCount: amazonResult.reviewedAsinCount,
        reviewedAsins,
      },
      confirmedFindings,
      findingCount,
      confirmedFindingRatio,
      evidenceCompleteFindingAssessments: evidenceCompleteness.findings,
      blockers,
    };
    await writeJson(join(outputDir, "benchmark_run.json"), {
      ...plan,
      ...audit,
      outputDir,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
    });
    await writeFile(
      join(outputDir, "benchmark_audit.md"),
      auditMarkdown({
        ...audit,
        reviewedAsinCount: amazonResult.reviewedAsinCount,
        reviewedAsins,
      }),
    );
    console.log(JSON.stringify({ ...audit, outputDir }, null, 2));
  } catch (error) {
    const finished = new Date();
    const message = sanitizeError(error);
    await writeJson(join(outputDir, "benchmark_run.json"), {
      ...plan,
      runId,
      outputDir,
      status: "failed",
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      publicRequests,
      llmRequests,
      llmUsage,
      error: message,
    });
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error: unknown) => {
  console.error(sanitizeError(error));
  process.exit(1);
});
