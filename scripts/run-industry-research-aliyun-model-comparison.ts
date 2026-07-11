import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { assessEvidenceCompleteFindings } from "../packages/industry-research/src/evidence-completeness.ts";
import {
  applyGlmStructuredExtraction,
  callOpenAICompatibleChatCompletion,
  createGlmStructuredExtractionMessages,
  createResearchDocumentsFromRawDocuments,
  createResearchReviewItems,
  type Evidence,
  generateOpenAICompatibleResearchMarkdownReport,
  type OpenAICompatibleFetch,
  parseGlmStructuredExtraction,
  planExtractionBatches,
  type RawDocument,
  type ResearchSource,
  type ResearchWorkflowInput,
  runMockIndustryResearchWorkflow,
  type SourceDatabaseEntry,
} from "../packages/industry-research/src/index.ts";

const benchmarkVersion = "aliyun-all-free-glm-kimi-comparison-v2-uncapped";
const allowedModels = [
  "glm-5.2",
  "glm-5.1",
  "glm-5",
  "glm-4.7",
  "glm-4.6",
  "glm-4.5",
  "glm-4.5-air",
  "kimi-k2.6",
  "kimi-k2.5",
  "kimi-k2-thinking",
  "kimi-k2.7-code",
  "Moonshot-Kimi-K2-Instruct",
] as const;
const sourceRunDefault =
  "outputs/industry-research-benchmarks/aliyun-deepseek-amazon-evidence-v1/aliyun-deepseek-amazon-evidence-v1-2026-07-11T05-34-38-027Z";
const maxRequestsPerModel = 2;
const perModelWallTimeMs = 300_000;

type AllowedModel = (typeof allowedModels)[number];
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
      env[trimmed.slice(0, separatorIndex).trim()] = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      return env;
    }, {});
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
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

function reportNoise(markdown: string) {
  const certaintyPatterns = [
    /已经被市场验证/gi,
    /明确的市场缺口/gi,
    /巨大(?:市场|商业)?机会/gi,
    /必然(?:成功|增长)/gi,
    /能够填补市场空白/gi,
    /销量领先/gi,
    /市场份额/gi,
  ];
  const unsupportedCertaintyHits = certaintyPatterns.reduce(
    (count, pattern) => count + (markdown.match(pattern)?.length ?? 0),
    0,
  );
  const lines = markdown.split(/\r?\n/);
  const requiredClosingSections = ["人工审核建议", "下一步真实采集建议"];
  const presentClosingSections = requiredClosingSections.filter((section) =>
    markdown.includes(section),
  );
  return {
    chars: markdown.length,
    lines: lines.length,
    headingCount: lines.filter((line) => /^#{1,4}\s/.test(line)).length,
    evidenceIdMentions: markdown.match(/evidence-[a-z0-9-]+/gi)?.length ?? 0,
    unsupportedCertaintyHits,
    requiredClosingSectionCount: presentClosingSections.length,
    likelyTruncated:
      presentClosingSections.length < requiredClosingSections.length,
  };
}

function envForModel(
  baseEnv: Record<string, string | undefined>,
  model: AllowedModel,
) {
  const env: Record<string, string | undefined> = {
    ...baseEnv,
    AGENT_FACTORY_LLM_MODEL: model,
    AGENT_FACTORY_DEEPSEEK_API_KEY: "",
    AGENT_FACTORY_DEEPSEEK_BASE_URL: "",
    AGENT_FACTORY_DEEPSEEK_MODEL: "",
    DEEPSEEK_API_KEY: "",
    DEEPSEEK_BASE_URL: "",
    DEEPSEEK_MODEL: "",
    AGENT_FACTORY_FIRECRAWL_API_KEY: "",
    FIRECRAWL_API_KEY: "",
  };
  env.AGENT_FACTORY_LLM_THINKING =
    model === "kimi-k2-thinking" || model === "kimi-k2.7-code"
      ? "enabled"
      : model === "Moonshot-Kimi-K2-Instruct"
        ? undefined
        : "disabled";
  env.AGENT_FACTORY_DEEPSEEK_THINKING = undefined;
  return env;
}

function validateBaseEnv(env: Record<string, string | undefined>) {
  const baseUrl = env.AGENT_FACTORY_LLM_BASE_URL?.trim() ?? "";
  let host = "";
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    host = "";
  }
  const errors = [
    ...(!env.AGENT_FACTORY_LLM_API_KEY?.trim() ? ["api_key_missing"] : []),
    ...(!host.endsWith("aliyuncs.com") ? ["host_not_aliyuncs"] : []),
    ...(!baseUrl.endsWith("/compatible-mode/v1")
      ? ["base_url_not_openai_compatible"]
      : []),
  ];
  return { baseUrl, host, errors };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const freeTierOnlyConfirmed = process.argv.includes(
    "--free-tier-only-confirmed",
  );
  const sourceRunDir = resolve(
    argumentValue("--source-run-dir") ?? sourceRunDefault,
  );
  const requestedModels = argumentValue("--models")
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const selectedModels = requestedModels?.length
    ? requestedModels.map((model) => {
        if (!(allowedModels as readonly string[]).includes(model)) {
          throw new Error(`model_not_in_free_allowlist:${model}`);
        }
        return model as AllowedModel;
      })
    : [...allowedModels];
  const baseEnv: Record<string, string | undefined> = {
    ...loadLocalEnv(),
    ...process.env,
  };
  const provider = validateBaseEnv(baseEnv);
  const plan = {
    benchmarkVersion,
    execute,
    freeTierOnlyConfirmed,
    sourceRunDir,
    providerHost: provider.host,
    allowedModels: selectedModels,
    forbiddenModelPatterns: ["deepseek", "qwen"],
    publicRequestsAllowed: 0,
    maxRequestsPerModel,
    perModelWallTimeMs,
  };
  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (!freeTierOnlyConfirmed) {
    throw new Error("free_tier_only_confirmation_required");
  }
  if (provider.errors.length > 0) {
    throw new Error(`provider_preflight_failed:${provider.errors.join(",")}`);
  }

  const input = await readJson<ResearchWorkflowInput>(
    join(sourceRunDir, "input.json"),
  );
  const rawDocuments = await readJson<RawDocument[]>(
    join(sourceRunDir, "raw_documents.json"),
  );
  const savedDatabases = await readJson<{
    research_sources: ResearchSource[];
    source_database: SourceDatabaseEntry[];
    evidence: Evidence[];
  }>(join(sourceRunDir, "databases.json"));
  const comparisonInput = {
    ...input,
    projectName: "宠物肠胃益生菌商业化证据报告（同证据模型对比）",
  };
  const mock = runMockIndustryResearchWorkflow(comparisonInput);
  const project = mock.research_projects[0];
  if (!project) throw new Error("source_project_missing");
  const baseline = {
    ...mock,
    crawl_plans: mock.crawl_plans.map((plan) => ({
      ...plan,
      mode: "public_web" as const,
    })),
    raw_documents: rawDocuments,
    research_sources: savedDatabases.research_sources,
    research_documents: createResearchDocumentsFromRawDocuments(
      project.id,
      rawDocuments,
      savedDatabases.research_sources,
    ),
    competitors: [],
    product_signals: [],
    pain_points: [],
    content_signals: [],
    opportunities: [],
    evidence: savedDatabases.evidence.filter((item) =>
      item.id.startsWith("evidence-public-"),
    ),
    source_database: savedDatabases.source_database,
    competitor_database: [],
    website_structure_database: [],
    product_database: [],
    keyword_database: [],
    pain_point_database: [],
    content_database: [],
    opportunity_database: [],
    weekly_intelligence_reports: [],
    reviewItems: [],
    research_reports: [],
  };
  const extractionDocuments = planExtractionBatches(rawDocuments, {
    maxTotalDocs: 10,
    maxDocsPerBatch: 10,
    maxCharsPerBatch: 60_000,
  }).flat();
  if (extractionDocuments.length === 0) {
    throw new Error("no_confirmable_source_documents");
  }

  const started = new Date();
  const runId = `${benchmarkVersion}-${timestampForPath(started)}`;
  const outputDir = join(
    "outputs",
    "industry-research-benchmarks",
    benchmarkVersion,
    runId,
  );
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "benchmark_plan.json"),
    `${JSON.stringify({ ...plan, runId, startedAt: started.toISOString() }, null, 2)}\n`,
    "utf8",
  );

  const results = [];
  for (const model of selectedModels) {
    if (/deepseek|qwen/i.test(model)) {
      throw new Error(`forbidden_model_selected:${model}`);
    }
    const modelStarted = Date.now();
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new Error("per_model_wall_time_exceeded")),
      perModelWallTimeMs,
    );
    let requestCount = 0;
    const usage: UsageRecord[] = [];
    const requestDurationsMs: number[] = [];
    const errors: string[] = [];
    const modelEnv = envForModel(baseEnv, model);
    const stream = model === "glm-4.5" || model === "glm-4.5-air";
    const fetcher: OpenAICompatibleFetch = async (inputUrl, init) => {
      const requestUrl = new URL(inputUrl);
      if (!requestUrl.hostname.endsWith("aliyuncs.com")) {
        throw new Error("non_aliyun_route_forbidden");
      }
      const requestedModel = (JSON.parse(init.body) as { model?: unknown })
        .model;
      if (
        typeof requestedModel !== "string" ||
        /deepseek|qwen/i.test(requestedModel)
      ) {
        throw new Error("forbidden_model_in_request_body");
      }
      if (requestCount >= maxRequestsPerModel) {
        throw new Error("per_model_request_cap_exceeded");
      }
      requestCount += 1;
      const requestStarted = Date.now();
      const response = await fetch(inputUrl, {
        ...init,
        signal: init.signal ?? deadline.signal,
      });
      requestDurationsMs.push(Date.now() - requestStarted);
      try {
        const record = usageFromPayload(await response.clone().json());
        if (record) usage.push(record);
      } catch {
        // Compatible error responses may omit JSON usage.
      }
      return response;
    };

    let extractionSuccess = false;
    let reportSuccess = false;
    let evidenceCompleteness:
      | ReturnType<typeof assessEvidenceCompleteFindings>
      | undefined;
    let entityCounts: Record<string, number> = {};
    let noise: ReturnType<typeof reportNoise> | undefined;
    let reportMarkdown = "";
    try {
      const extractionResponse = await callOpenAICompatibleChatCompletion({
        env: modelEnv,
        fetcher,
        messages: createGlmStructuredExtractionMessages(baseline, {
          documents: extractionDocuments,
        }),
        temperature: 0.1,
        maxTokens: null,
        responseFormat: "json_object",
        stream,
        timeoutMs: 150_000,
      });
      const extraction = parseGlmStructuredExtraction(
        extractionResponse.content,
      );
      if (
        extraction.competitors.length === 0 &&
        extraction.productSignals.length === 0 &&
        extraction.painPoints.length === 0 &&
        extraction.contentSignals.length === 0 &&
        extraction.opportunities.length === 0
      ) {
        throw new Error("structured_extraction_empty");
      }
      extractionSuccess = true;
      const structured = applyGlmStructuredExtraction(baseline, extraction);
      const reviewed = {
        ...structured,
        reviewItems: createResearchReviewItems(structured),
      };
      evidenceCompleteness = assessEvidenceCompleteFindings({
        competitors: reviewed.competitor_database,
        opportunities: reviewed.opportunity_database,
        evidence: reviewed.evidence,
        rawDocuments: reviewed.raw_documents,
      });
      entityCounts = {
        competitors: reviewed.competitor_database.length,
        products: reviewed.product_database.length,
        painPoints: reviewed.pain_point_database.length,
        contentSignals: reviewed.content_database.length,
        opportunities: reviewed.opportunity_database.length,
      };
      await writeFile(
        join(outputDir, `${model}-extraction.json`),
        `${JSON.stringify(extraction, null, 2)}\n`,
        "utf8",
      );

      const report = await generateOpenAICompatibleResearchMarkdownReport({
        dataset: reviewed,
        env: modelEnv,
        fetcher,
        stream,
      });
      reportMarkdown = report.content;
      reportSuccess = true;
      noise = reportNoise(reportMarkdown);
      await writeFile(
        join(outputDir, `${model}-report.md`),
        reportMarkdown,
        "utf8",
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
    }

    results.push({
      model,
      extractionSuccess,
      reportSuccess,
      requestCount,
      requestDurationsMs,
      durationMs: Date.now() - modelStarted,
      usage,
      entityCounts,
      evidenceCompleteFindings:
        evidenceCompleteness?.evidenceCompleteFindings ?? 0,
      findingCount: evidenceCompleteness?.findingCount ?? 0,
      evidenceCompleteFindingRatio:
        evidenceCompleteness?.evidenceCompleteFindingRatio ?? 0,
      evidenceAssessments: evidenceCompleteness?.findings ?? [],
      reportNoise: noise,
      endToEndQualified: Boolean(
        extractionSuccess &&
          reportSuccess &&
          evidenceCompleteness &&
          evidenceCompleteness.evidenceCompleteFindingRatio >= 0.7 &&
          noise &&
          !noise.likelyTruncated,
      ),
      reportPreview: reportMarkdown.slice(0, 500),
      errors,
    });
  }

  const ranked = [...results].sort(
    (a, b) =>
      Number(b.extractionSuccess) - Number(a.extractionSuccess) ||
      Number(b.endToEndQualified) - Number(a.endToEndQualified) ||
      b.evidenceCompleteFindingRatio - a.evidenceCompleteFindingRatio ||
      Number(b.reportSuccess) - Number(a.reportSuccess) ||
      (a.reportNoise?.unsupportedCertaintyHits ?? Number.MAX_SAFE_INTEGER) -
        (b.reportNoise?.unsupportedCertaintyHits ?? Number.MAX_SAFE_INTEGER) ||
      a.durationMs - b.durationMs,
  );
  const finished = new Date();
  const output = {
    ...plan,
    runId,
    sourceRunId: basename(sourceRunDir),
    outputDir: resolve(outputDir),
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    extractionDocumentIds: extractionDocuments.map((document) => document.id),
    publicRequests: 0,
    results,
    ranking: ranked.map((item, index) => ({
      rank: index + 1,
      model: item.model,
      evidenceCompleteFindingRatio: item.evidenceCompleteFindingRatio,
      endToEndQualified: item.endToEndQualified,
      extractionSuccess: item.extractionSuccess,
      reportSuccess: item.reportSuccess,
      durationMs: item.durationMs,
    })),
  };
  await writeFile(
    join(outputDir, "comparison.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(outputDir, "comparison.md"),
    [
      "# 阿里云全部免费 GLM / Kimi 模型同证据对比",
      "",
      `- 来源 live run：${output.sourceRunId}`,
      "- DeepSeek/Qwen：禁止",
      "- 新增网页请求：0",
      `- 总耗时：${output.durationMs} ms`,
      "",
      "| 排名 | 模型 | 端到端合格 | 抽取 | 报告 | 可证实结论 | 耗时 | 请求 | 报告风险措辞 |",
      "|---:|---|---|---|---|---:|---:|---:|---:|",
      ...ranked.map(
        (item, index) =>
          `| ${index + 1} | ${item.model} | ${item.endToEndQualified ? "是" : "否"} | ${item.extractionSuccess ? "成功" : "失败"} | ${item.reportSuccess ? "成功" : "失败"} | ${item.evidenceCompleteFindings}/${item.findingCount}（${(item.evidenceCompleteFindingRatio * 100).toFixed(1)}%） | ${item.durationMs} ms | ${item.requestCount} | ${item.reportNoise?.unsupportedCertaintyHits ?? "-"} |`,
      ),
      "",
      "端到端合格口径：结构化抽取和报告均成功、证据完整度 >=70%、报告包含人工审核建议与下一步真实采集建议。随后再比较证据完整度、风险措辞和耗时。商业价值仍需真实使用或付费意愿验证。",
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
