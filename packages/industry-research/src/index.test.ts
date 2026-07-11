import { describe, expect, it } from "vitest";
import type {
  DeepSeekFetch,
  PublicCrawlerFetch,
  ResearchWorkflowInput,
} from "./index";
import {
  callDeepSeekChatCompletion,
  canUsePublicCrawlerTarget,
  createIndustryResearchDeliveryArtifacts,
  createIndustryResearchLocalJsonRepository,
  discoverPublicSources,
  ecommerceCompetitorResearchTemplate,
  generateResearchMarkdownReport,
  resolveDeepSeekConfig,
  runDeepSeekIndustryResearchWorkflow,
  runMockIndustryResearchWorkflow,
  runPublicCrawler,
  runPublicDeepSeekIndustryResearchWorkflow,
  runPublicIndustryResearchWorkflow,
  selectRotatedFreeModelRoutes,
  shouldUseAliyunFreeModelRouting,
  validateEvidenceQuotes,
} from "./index";

const input: ResearchWorkflowInput = {
  projectName: "宠物益生菌竞品研究",
  industry: "宠物健康电商",
  category: "宠物肠胃益生菌",
  market: "美国 DTC 电商",
  researchGoal: "找到适合小团队切入的产品和内容机会",
  templateId: "ecommerce_competitor_research",
  urls: ["https://example-pet-brand.com"],
  csvText:
    "product,price,tag\nDaily Gut Chews,29.99,digestion\nPumpkin Probiotic,24.99,sensitive stomach",
  manualText: "用户反复提到狗狗软便、换粮后肠胃不适、希望成分天然。",
};

describe("industry research mock workflow", () => {
  it("creates the required research data buckets", () => {
    const result = runMockIndustryResearchWorkflow(input);

    expect(result.research_projects).toHaveLength(1);
    expect(result.source_discovery_plans).toHaveLength(1);
    expect(result.crawl_plans).toHaveLength(1);
    expect(result.crawl_jobs.length).toBeGreaterThan(0);
    expect(result.crawl_runs.length).toBe(result.crawl_jobs.length);
    expect(result.raw_documents.length).toBeGreaterThan(0);
    expect(result.extraction_jobs.length).toBeGreaterThan(0);
    expect(result.research_sources.length).toBeGreaterThanOrEqual(3);
    expect(result.research_documents.length).toBeGreaterThanOrEqual(
      result.raw_documents.length,
    );
    expect(result.competitors).toHaveLength(6);
    expect(result.product_signals.length).toBeGreaterThan(0);
    expect(result.pain_points.length).toBeGreaterThan(0);
    expect(result.content_signals.length).toBeGreaterThan(0);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.research_reports).toHaveLength(1);
  });

  it("builds every database-first MVP view", () => {
    const result = runMockIndustryResearchWorkflow(input);

    expect(result.source_database.length).toBeGreaterThan(0);
    expect(result.competitor_database.length).toBeGreaterThan(0);
    expect(result.website_structure_database.length).toBeGreaterThan(0);
    expect(result.product_database.length).toBeGreaterThan(0);
    expect(result.keyword_database.length).toBeGreaterThan(0);
    expect(result.pain_point_database.length).toBeGreaterThan(0);
    expect(result.content_database.length).toBeGreaterThan(0);
    expect(result.opportunity_database.length).toBeGreaterThan(0);
    expect(result.weekly_intelligence_reports.length).toBeGreaterThan(0);
  });

  it("marks every MVP workflow step as done in mock mode", () => {
    const result = runMockIndustryResearchWorkflow(input);

    expect(result.workflowSteps).toHaveLength(
      ecommerceCompetitorResearchTemplate.workflowSteps.length,
    );
    expect(result.workflowSteps.every((step) => step.status === "done")).toBe(
      true,
    );
  });

  it("generates a markdown report with opportunity scores", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const report = generateResearchMarkdownReport(result);

    expect(report).toContain("# 宠物益生菌竞品研究");
    expect(report).toContain("## 自动采集计划");
    expect(report).toContain("## 数据库建设结果");
    expect(report).toContain("source_database 信息源库");
    expect(report).toContain("## 机会评分");
    expect(report).toContain("总分");
    expect(result.research_reports[0]?.content).toContain("## Mock 采集结果");
  });

  it("packages a run into delivery artifacts with evidence-backed sections", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId: "delivery-test-run",
      startedAt: "2026-06-17T00:00:00.000Z",
      finishedAt: "2026-06-17T00:00:01.500Z",
    });

    expect(artifacts.raw_documents.length).toBeGreaterThan(0);
    expect(artifacts.databases.source_database.length).toBeGreaterThan(0);
    expect(artifacts.databases.evidence.length).toBeGreaterThan(0);
    expect(artifacts.review_items.summary.needs_review).toBeGreaterThan(0);
    expect(artifacts.run_log.durationMs).toBe(1500);
    expect(artifacts.run_log.counts.rawDocuments).toBe(
      result.raw_documents.length,
    );
    expect(artifacts.run_log.crawlFailureSummary.total).toBe(0);
    expect(artifacts.manifest.packageVersion).toBe("v0.3");
    expect(artifacts.manifest.runId).toBe("delivery-test-run");
    expect(artifacts.manifest.files.map((file) => file.fileName)).toEqual([
      "input.json",
      "raw_documents.json",
      "databases.json",
      "review_items.json",
      "report.md",
      "reviewed_report.md",
      "run_log.json",
      "manifest.json",
    ]);
    expect(artifacts.manifest.runDetailApiPath).toBe(
      "/api/industry-research/runs/delivery-test-run",
    );
    expect(artifacts.manifest.downloadPackageApiPath).toBe(
      "/api/industry-research/runs/delivery-test-run/download",
    );
    expect(artifacts.reportMarkdown).toContain("## 已确认发现");
    expect(artifacts.reportMarkdown).toContain("## 候选发现");
    expect(artifacts.reportMarkdown).toContain("## 不确定 / 阻塞项");
    expect(artifacts.reportMarkdown).toContain("## 剩余不确定性");
    expect(artifacts.reportMarkdown).toContain("## 证据索引");
    expect(artifacts.reportMarkdown).toContain("URL：");
    expect(artifacts.reportMarkdown).toContain("needs_review");
  });

  it("prints evidence context around the matched quote instead of the page prefix", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const evidence = result.evidence[0];
    if (!evidence) throw new Error("mock fixture must provide evidence");
    const rawDocument = result.raw_documents.find(
      (document) =>
        document.id === evidence.rawDocumentId ||
        document.sourceId === evidence.sourceId,
    );
    if (!rawDocument) throw new Error("mock evidence must match a document");

    const navigationPrefix = "首页 产品 分类 品牌 服务 ".repeat(20);
    const distinctiveContext = "这是引用后方的关键上下文，用于解释证据边界。";
    const contextualResult = {
      ...result,
      raw_documents: result.raw_documents.map((document) =>
        document.id === rawDocument.id
          ? {
              ...document,
              excerpt: navigationPrefix.slice(0, 160),
              extractedText: `${navigationPrefix}${evidence.quote}${distinctiveContext}`,
            }
          : document,
      ),
      competitors: result.competitors.map((competitor, index) =>
        index === 0
          ? { ...competitor, evidenceIds: [evidence.id] }
          : competitor,
      ),
    };

    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result: contextualResult,
      runId: "quote-context-run",
      startedAt: "2026-07-11T00:00:00.000Z",
      finishedAt: "2026-07-11T00:00:01.000Z",
    });

    expect(artifacts.reportMarkdown).toContain(distinctiveContext);
  });

  it("isolates provider report content when no source is accepted for report", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const blockedResult = {
      ...result,
      raw_documents: result.raw_documents.map((document) => ({
        ...document,
        sourceQuality: {
          sourceType: "unknown" as const,
          sourceRelevance: "low" as const,
          sourceConfidence: "low" as const,
          needsReviewReason: "测试用低质量来源，不能作为交付报告证据。",
          acceptedForReport: false,
        },
      })),
      research_reports: result.research_reports.map((report) => ({
        ...report,
        content:
          "LLM_MOCK_DISHWASHER_CONTENT_SHOULD_NOT_SHIP 方太 美的 海尔 mock 机会评分",
      })),
    };

    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result: blockedResult,
      runId: "blocked-provider-report-run",
      startedAt: "2026-07-07T00:00:00.000Z",
      finishedAt: "2026-07-07T00:00:01.000Z",
    });

    expect(artifacts.run_log.sourceQualitySummary.acceptedForReport).toBe(0);
    expect(artifacts.reportMarkdown).toContain("Provider 原始报告已隔离");
    expect(artifacts.reportMarkdown).not.toContain(
      "LLM_MOCK_DISHWASHER_CONTENT_SHOULD_NOT_SHIP",
    );
    expect(artifacts.manifest.notes).toContain(
      "没有 acceptedForReport=true 的数据源，报告只能作为内部分析草稿。",
    );
  });

  it("keeps provider free text out of formal report even with accepted sources", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const providerMarker =
      "LLM_ACCEPTED_SOURCE_CONTENT_MUST_STILL_NOT_ENTER_FORMAL_REPORT";
    const providerResult = {
      ...result,
      research_reports: result.research_reports.map((report) => ({
        ...report,
        content: `${providerMarker} 未逐条绑定来源的机会评分与市场判断`,
      })),
      runMetadata: {
        canonicalMode: "public_web_llm" as const,
        provider: "openai_compatible" as const,
        llmUsed: true,
      },
    };

    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result: providerResult,
      runId: "accepted-source-provider-isolation-run",
      startedAt: "2026-07-10T00:00:00.000Z",
      finishedAt: "2026-07-10T00:00:01.000Z",
    });

    expect(
      artifacts.run_log.sourceQualitySummary.acceptedForReport,
    ).toBeGreaterThan(0);
    expect(artifacts.reportMarkdown).toContain("Provider 原始报告已隔离");
    expect(artifacts.reportMarkdown).not.toContain(providerMarker);
    expect(artifacts.reviewedReportMarkdown).not.toContain(providerMarker);
    expect(artifacts.manifest.notes).toContain(
      "provider 原始自由文本报告与正式 report.md 隔离，不能绕过逐条证据门禁进入交付正文。",
    );
  });

  it("keeps missing, partial, and high-risk unsupported evidence out of confirmed findings", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const baseDocument = result.raw_documents[0];
    const baseCompetitor = result.competitors[0];
    const baseOpportunity = result.opportunities[0];

    if (!baseDocument || !baseCompetitor || !baseOpportunity) {
      throw new Error(
        "mock fixture must provide a document and review targets",
      );
    }

    const rawDocument = {
      ...baseDocument,
      url: "https://brand.example/evidence",
      sourceQuality: {
        sourceType: "official_site" as const,
        sourceRelevance: "high" as const,
        sourceConfidence: "high" as const,
        needsReviewReason: "",
        acceptedForReport: true,
      },
    };
    const competitor = {
      ...baseCompetitor,
      id: "competitor-missing-validation",
      name: "缺失 validation 的候选",
      evidenceIds: ["evidence-missing-validation"],
    };
    const metadataMissingCompetitor = {
      ...baseCompetitor,
      id: "competitor-missing-claim-metadata",
      name: "缺失声明完整性元数据的候选",
      evidenceIds: ["evidence-missing-claim-metadata"],
    };
    const partialOpportunity = {
      ...baseOpportunity,
      id: "opportunity-partial-support",
      title: "部分证据候选",
      summary: "一条 quote 命中，但同一声明的另一条 quote 未命中。",
      reviewStatus: "approved" as const,
      evidenceIds: ["evidence-partial-support"],
    };
    const highRiskOpportunity = {
      ...baseOpportunity,
      id: "opportunity-high-risk",
      title: "高风险数字候选",
      summary: "该品牌拥有 30% market share。",
      reviewStatus: "approved" as const,
      evidenceIds: ["evidence-high-risk"],
    };
    const strictResult = {
      ...result,
      raw_documents: [rawDocument],
      competitors: [competitor, metadataMissingCompetitor],
      opportunities: [partialOpportunity, highRiskOpportunity],
      evidence: [
        {
          id: "evidence-missing-validation",
          projectId: rawDocument.projectId,
          sourceId: rawDocument.sourceId,
          rawDocumentId: rawDocument.id,
          quote: "直接观察到的品牌页面",
          note: "缺失 validation",
        },
        {
          id: "evidence-partial-support",
          projectId: rawDocument.projectId,
          sourceId: rawDocument.sourceId,
          rawDocumentId: rawDocument.id,
          quote: "直接观察到的一条事实",
          note: "同一声明只有部分 quote 通过",
          validation: {
            quoteMatched: true,
            sourceAccepted: true,
            matchedRawDocumentId: rawDocument.id,
            claimSupportComplete: false,
            claimQuoteCount: 2,
            confirmedQuoteCount: 1,
          },
        },
        {
          id: "evidence-missing-claim-metadata",
          projectId: rawDocument.projectId,
          sourceId: rawDocument.sourceId,
          rawDocumentId: rawDocument.id,
          quote: "直接观察到的另一品牌页面",
          note: "quote/source 已通过但没有 claimSupportComplete",
          validation: {
            quoteMatched: true,
            sourceAccepted: true,
            matchedRawDocumentId: rawDocument.id,
          },
        },
        {
          id: "evidence-high-risk",
          projectId: rawDocument.projectId,
          sourceId: rawDocument.sourceId,
          rawDocumentId: rawDocument.id,
          quote: "The brand sells a starter kit.",
          note: "没有直接支持市场份额数字",
          validation: {
            quoteMatched: true,
            sourceAccepted: true,
            matchedRawDocumentId: rawDocument.id,
            claimSupportComplete: true,
            claimQuoteCount: 1,
            confirmedQuoteCount: 1,
          },
        },
      ],
      reviewItems: [
        {
          id: "review-missing-validation",
          targetType: "competitor" as const,
          targetId: competitor.id,
          status: "approved" as const,
          note: "人工误标 approved",
        },
        {
          id: "review-partial-support",
          targetType: "opportunity" as const,
          targetId: partialOpportunity.id,
          status: "approved" as const,
          note: "人工误标 approved",
        },
        {
          id: "review-missing-claim-metadata",
          targetType: "competitor" as const,
          targetId: metadataMissingCompetitor.id,
          status: "approved" as const,
          note: "人工误标 approved",
        },
        {
          id: "review-high-risk",
          targetType: "opportunity" as const,
          targetId: highRiskOpportunity.id,
          status: "approved" as const,
          note: "人工误标 approved",
        },
      ],
    };

    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result: strictResult,
      runId: "strict-confirmation-gate-run",
      startedAt: "2026-07-10T00:00:00.000Z",
      finishedAt: "2026-07-10T00:00:01.000Z",
    });
    const confirmedSection = artifacts.reviewedReportMarkdown
      .split("## 已确认发现")[1]
      ?.split("## 候选发现")[0];

    expect(artifacts.run_log.credibility.confirmedFindings).toBe(0);
    expect(artifacts.run_log.credibility.needsReviewFindings).toBe(4);
    expect(confirmedSection).not.toContain("缺失 validation 的候选");
    expect(confirmedSection).not.toContain("缺失声明完整性元数据的候选");
    expect(confirmedSection).not.toContain("部分证据候选");
    expect(confirmedSection).not.toContain("高风险数字候选");
    expect(artifacts.reviewedReportMarkdown).toContain("部分证据候选");
    expect(artifacts.reviewedReportMarkdown).toContain("高风险数字候选");
  });

  it("allows a fully supported approved finding and prints its unique raw document trace", () => {
    const result = runMockIndustryResearchWorkflow(input);
    const baseDocument = result.raw_documents[0];
    const baseCompetitor = result.competitors[0];

    if (!baseDocument || !baseCompetitor) {
      throw new Error("mock fixture must provide a document and competitor");
    }

    const rawDocument = {
      ...baseDocument,
      url: "https://confirmed-brand.example/products/probiotic",
      sourceQuality: {
        sourceType: "product_page" as const,
        sourceRelevance: "high" as const,
        sourceConfidence: "high" as const,
        needsReviewReason: "",
        acceptedForReport: true,
      },
    };
    const competitor = {
      ...baseCompetitor,
      id: "competitor-fully-supported",
      name: "可确认品牌",
      positioning: "公开产品页展示宠物益生菌产品",
      websiteStructure: [],
      collectionSignals: [],
      evidenceIds: ["evidence-fully-supported"],
    };
    const fullySupportedResult = {
      ...result,
      raw_documents: [rawDocument],
      competitors: [competitor],
      opportunities: [],
      evidence: [
        {
          id: "evidence-fully-supported",
          projectId: rawDocument.projectId,
          sourceId: rawDocument.sourceId,
          rawDocumentId: rawDocument.id,
          quote: "公开产品页展示宠物益生菌产品",
          note: "完整声明由唯一产品页直接支持",
          validation: {
            quoteMatched: true,
            sourceAccepted: true,
            matchedRawDocumentId: rawDocument.id,
            claimSupportComplete: true,
            claimQuoteCount: 1,
            confirmedQuoteCount: 1,
          },
        },
      ],
      reviewItems: [
        {
          id: "review-fully-supported",
          targetType: "competitor" as const,
          targetId: competitor.id,
          status: "approved" as const,
          note: "人工已核对完整声明与证据",
        },
      ],
    };

    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result: fullySupportedResult,
      runId: "fully-supported-confirmation-run",
      startedAt: "2026-07-10T00:00:00.000Z",
      finishedAt: "2026-07-10T00:00:01.000Z",
    });
    const confirmedSection = artifacts.reviewedReportMarkdown
      .split("## 已确认发现")[1]
      ?.split("## 候选发现")[0];

    expect(artifacts.run_log.credibility.confirmedFindings).toBe(1);
    expect(confirmedSection).toContain("可确认品牌");
    expect(confirmedSection).toContain(`rawDocumentId：${rawDocument.id}`);
    expect(confirmedSection).toContain(`URL：${rawDocument.url}`);
  });

  it("stores the minimum v0.3 persistence boundary in a local JSON repository", async () => {
    const result = runMockIndustryResearchWorkflow(input);
    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId: "repository-test-run",
      startedAt: "2026-06-17T00:00:00.000Z",
      finishedAt: "2026-06-17T00:00:02.000Z",
    });
    const repository = createIndustryResearchLocalJsonRepository();

    await repository.upsertRun({
      runId: artifacts.run_log.runId,
      status: "ready_for_review",
      createdAt: artifacts.run_log.startedAt,
      updatedAt: artifacts.run_log.finishedAt,
      input,
      manifest: artifacts.manifest,
    });
    await repository.saveRawDocuments(
      artifacts.run_log.runId,
      artifacts.raw_documents,
    );
    await repository.saveReviewItems(
      artifacts.run_log.runId,
      artifacts.review_items.items,
    );
    await repository.saveReports({
      runId: artifacts.run_log.runId,
      reportMarkdown: artifacts.reportMarkdown,
      reviewedReportMarkdown: artifacts.reviewedReportMarkdown,
      updatedAt: artifacts.run_log.finishedAt,
    });
    await repository.saveRunLog(artifacts.run_log.runId, artifacts.run_log);

    const snapshot = await repository.snapshot();

    expect(await repository.getRun("repository-test-run")).toMatchObject({
      runId: "repository-test-run",
      status: "ready_for_review",
    });
    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.rawDocuments[0]?.documents.length).toBe(
      artifacts.raw_documents.length,
    );
    expect(snapshot.reviewItems[0]?.items.length).toBe(
      artifacts.review_items.items.length,
    );
    expect(snapshot.reports[0]?.reviewedReportMarkdown).toContain(
      "已审核版行业竞品研究轻量版报告",
    );
    expect(snapshot.runLogs[0]?.runLog.runId).toBe("repository-test-run");
  });
});

describe("industry research OpenAI-compatible workflow", () => {
  it("requires explicit Aliyun free-tier routing gates", () => {
    const base = {
      AGENT_FACTORY_LLM_BASE_URL:
        "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      AGENT_FACTORY_ALIYUN_FREE_MODEL_ROUTING_ENABLED: "true",
      AGENT_FACTORY_ALIYUN_FREE_TIER_ONLY_CONFIRMED: "true",
    };

    expect(shouldUseAliyunFreeModelRouting(base)).toBe(true);
    expect(
      shouldUseAliyunFreeModelRouting({
        ...base,
        AGENT_FACTORY_ALIYUN_FREE_TIER_ONLY_CONFIRMED: "false",
      }),
    ).toBe(false);
    expect(
      shouldUseAliyunFreeModelRouting({
        ...base,
        AGENT_FACTORY_LLM_BASE_URL: "https://provider.example/v1",
      }),
    ).toBe(false);
  });

  it("selects two stable advisory routes without the development-only code model", () => {
    const first = selectRotatedFreeModelRoutes("project-stable");
    const second = selectRotatedFreeModelRoutes("project-stable");

    expect(first).toHaveLength(2);
    expect(first).toEqual(second);
    expect(first.every((route) => route.authority === "advisory")).toBe(true);
    expect(first.map((route) => route.model)).not.toContain("kimi-k2.7-code");
  });

  it("runs the gated Aliyun free-model production chain without advisory write-back", async () => {
    const calledModels: string[] = [];
    const fakePublicFetch: PublicCrawlerFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head><title>GutPet Labs</title></head>
          <body>
            <h1>Daily Gut Starter Kit</h1>
            <p>Subscription probiotic bundle for sensitive stomach support.</p>
          </body>
        </html>
      `,
      headers: {
        get: (name) =>
          name.toLowerCase() === "content-type" ? "text/html" : null,
      },
    });
    const fakeModelFetch: DeepSeekFetch = async (_url, init) => {
      const body = JSON.parse(init.body) as {
        model: string;
        response_format?: { type?: string };
      };
      calledModels.push(body.model);
      const content = body.response_format
        ? JSON.stringify({
            competitors: [
              {
                name: "GutPet Labs",
                channel: "DTC",
                positioning: "Subscription probiotic bundle",
                websiteStructure: [],
                collectionSignals: [],
                evidenceReferences: [
                  {
                    rawDocumentId: "public-raw-document-1",
                    quote: "Daily Gut Starter Kit",
                  },
                ],
              },
            ],
            productSignals: [],
            painPoints: [],
            contentSignals: [],
            opportunities: [],
          })
        : body.model === "kimi-k2.6"
          ? "# Kimi 路由报告\n\n仅使用已校验证据。"
          : "# 内部辅助审计\n\n不得进入 confirmed findings。";
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content } }] }),
      };
    };

    const result = await runPublicDeepSeekIndustryResearchWorkflow(
      { ...input, urls: ["https://brand.example"] },
      {
        env: {
          AGENT_FACTORY_LLM_API_KEY: "test-key",
          AGENT_FACTORY_LLM_BASE_URL:
            "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
          AGENT_FACTORY_LLM_MODEL: "unused-default",
          AGENT_FACTORY_ALIYUN_FREE_MODEL_ROUTING_ENABLED: "true",
          AGENT_FACTORY_ALIYUN_FREE_TIER_ONLY_CONFIRMED: "true",
        },
        fetcher: fakeModelFetch,
        publicFetcher: fakePublicFetch,
      },
    );

    expect(calledModels).toHaveLength(5);
    expect(calledModels).toContain("Moonshot-Kimi-K2-Instruct");
    expect(calledModels).toContain("glm-4.7");
    expect(calledModels).toContain("kimi-k2.6");
    expect(calledModels).not.toContain("kimi-k2.7-code");
    expect(result.research_reports[0]?.content).toContain("Kimi 路由报告");
    expect(result.runMetadata?.model).toBe("kimi-k2.6");
    expect(result.runMetadata?.modelRouting).toMatchObject({
      enabled: true,
      reportModel: "kimi-k2.6",
      extractionModel: "glm-4.7",
      sourceDigestModel: "Moonshot-Kimi-K2-Instruct",
    });
    expect(result.runMetadata?.modelRouting?.rotatedModels).toHaveLength(2);
    expect(result.runMetadata?.modelRouting?.calls).toHaveLength(5);
  });

  it("resolves DeepSeek config from the DeepSeek env shape", () => {
    const config = resolveDeepSeekConfig({
      AGENT_FACTORY_DEEPSEEK_API_KEY: "test-key",
      AGENT_FACTORY_DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    });

    expect(config).toEqual({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
  });

  it("calls DeepSeek chat completions without leaking the API key into the body", async () => {
    const calls: Array<{
      input: string;
      init: Parameters<DeepSeekFetch>[1];
    }> = [];
    const fakeFetch: DeepSeekFetch = async (input, init) => {
      calls.push({ input, init });

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: "# DeepSeek 报告" } }],
          }),
      };
    };

    const result = await callDeepSeekChatCompletion({
      env: {
        AGENT_FACTORY_DEEPSEEK_API_KEY: "secret-key",
        AGENT_FACTORY_DEEPSEEK_BASE_URL: "https://example.test",
        AGENT_FACTORY_DEEPSEEK_MODEL: "deepseek-v4-flash",
      },
      fetcher: fakeFetch,
      messages: [{ role: "user", content: "生成报告" }],
    });

    expect(result).toEqual({
      content: "# DeepSeek 报告",
      model: "deepseek-v4-flash",
    });
    expect(calls[0]?.input).toBe("https://example.test/chat/completions");
    expect(calls[0]?.init.headers.Authorization).toBe("Bearer secret-key");
    expect(calls[0]?.init.body).not.toContain("secret-key");
    expect(calls[0]?.init.body).toContain('"model":"deepseek-v4-flash"');
    expect(calls[0]?.init.body).not.toContain("thinking");
  });

  it("can disable Alibaba-hosted DeepSeek thinking for structured output", async () => {
    const calls: Array<Parameters<DeepSeekFetch>[1]> = [];
    const fakeFetch: DeepSeekFetch = async (_input, init) => {
      calls.push(init);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
      };
    };

    await callDeepSeekChatCompletion({
      env: {
        AGENT_FACTORY_LLM_API_KEY: "secret-key",
        AGENT_FACTORY_LLM_BASE_URL:
          "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        AGENT_FACTORY_LLM_MODEL: "deepseek-v4-flash",
        AGENT_FACTORY_LLM_THINKING: "disabled",
      },
      fetcher: fakeFetch,
      messages: [{ role: "user", content: "只返回 JSON" }],
      responseFormat: "json_object",
    });

    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      model: "deepseek-v4-flash",
      enable_thinking: false,
      response_format: { type: "json_object" },
    });
  });

  it("can omit the structured-output token cap explicitly", async () => {
    const calls: Array<Parameters<DeepSeekFetch>[1]> = [];
    const fakeFetch: DeepSeekFetch = async (_input, init) => {
      calls.push(init);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
      };
    };

    await callDeepSeekChatCompletion({
      env: {
        AGENT_FACTORY_LLM_API_KEY: "secret-key",
        AGENT_FACTORY_LLM_BASE_URL: "https://example.test",
        AGENT_FACTORY_LLM_MODEL: "test-model",
      },
      fetcher: fakeFetch,
      messages: [{ role: "user", content: "只返回 JSON" }],
      maxTokens: null,
      responseFormat: "json_object",
    });

    expect(JSON.parse(calls[0]?.body ?? "{}")).not.toHaveProperty("max_tokens");
  });

  it("parses OpenAI-compatible SSE chat completion chunks", async () => {
    const calls: Array<Parameters<DeepSeekFetch>[1]> = [];
    const fakeFetch: DeepSeekFetch = async (_input, init) => {
      calls.push(init);
      return {
        ok: true,
        status: 200,
        text: async () =>
          [
            'data: {"choices":[{"delta":{"role":"assistant","content":"# 报告"}}]}',
            'data: {"choices":[{"delta":{"content":"\\n\\nDeepSeek 路由可用。"}}]}',
            "data: [DONE]",
          ].join("\n\n"),
      };
    };

    const result = await callDeepSeekChatCompletion({
      env: {
        AGENT_FACTORY_DEEPSEEK_API_KEY: "secret-key",
        AGENT_FACTORY_DEEPSEEK_MODEL: "deepseek-v4-flash",
      },
      fetcher: fakeFetch,
      messages: [{ role: "user", content: "生成报告" }],
      stream: true,
    });

    expect(result).toEqual({
      content: "# 报告\n\nDeepSeek 路由可用。",
      model: "deepseek-v4-flash",
    });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ stream: true });
  });

  it("redacts provider error messages before surfacing them", async () => {
    const fakeFetch: DeepSeekFetch = async () => ({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: {
            message: "Authentication Fails, Your api key: ****lfgX is invalid",
          },
        }),
    });
    await expect(
      callDeepSeekChatCompletion({
        env: {
          AGENT_FACTORY_DEEPSEEK_API_KEY: "secret-key",
        },
        fetcher: fakeFetch,
        messages: [{ role: "user", content: "生成报告" }],
      }),
    ).rejects.toThrow("api key: [redacted]");
  });

  it("uses an OpenAI-compatible provider to replace only the markdown report while keeping database outputs", async () => {
    const fakeFetch: DeepSeekFetch = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: "# DeepSeek 行业研究报告\n\n## 数据库建设结果",
              },
            },
          ],
        }),
    });

    const result = await runDeepSeekIndustryResearchWorkflow(input, {
      env: {
        AGENT_FACTORY_DEEPSEEK_API_KEY: "test-key",
        AGENT_FACTORY_DEEPSEEK_MODEL: "deepseek-v4-flash",
      },
      fetcher: fakeFetch,
    });

    expect(result.source_database.length).toBeGreaterThan(0);
    expect(result.raw_documents.length).toBeGreaterThan(0);
    expect(result.research_reports[0]?.title).toContain(
      "9router / OpenAI-compatible Markdown 报告",
    );
    expect(result.research_reports[0]?.content).toContain(
      "DeepSeek 行业研究报告",
    );
  });

  it("uses an OpenAI-compatible provider to extract structured data from public raw documents before report generation", async () => {
    let deepSeekCallCount = 0;
    const fakePublicFetch: PublicCrawlerFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head><title>GutPet Labs</title></head>
          <body>
            <nav>Best Sellers Reviews Blog</nav>
            <h1>Daily Gut Starter Kit</h1>
            <p>Subscription probiotic bundle for sensitive stomach support.</p>
          </body>
        </html>
      `,
      headers: {
        get: (name) =>
          name.toLowerCase() === "content-type" ? "text/html" : null,
      },
    });
    const fakeDeepSeekFetch: DeepSeekFetch = async () => {
      deepSeekCallCount += 1;

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    deepSeekCallCount === 1
                      ? JSON.stringify({
                          competitors: [
                            {
                              name: "GutPet Labs",
                              channel: "DTC",
                              positioning: "宠物肠胃益生菌订阅套装品牌。",
                              websiteStructure: [
                                "Best Sellers",
                                "Reviews",
                                "Blog",
                              ],
                              collectionSignals: [
                                "Subscription probiotic bundle",
                              ],
                              evidenceQuotes: [
                                "Daily Gut Starter Kit",
                                "Subscription probiotic bundle",
                              ],
                            },
                          ],
                          productSignals: [
                            {
                              competitorName: "GutPet Labs",
                              category: "宠物肠胃益生菌",
                              signal: "订阅型益生菌套装是明确产品信号。",
                              tags: ["subscription", "starter-kit"],
                              evidenceQuotes: ["Subscription probiotic bundle"],
                            },
                          ],
                          painPoints: [
                            {
                              theme: "肠胃敏感",
                              userNeed: "需要温和、可持续的益生菌支持。",
                              frequency: "high",
                              evidenceQuotes: ["sensitive stomach support"],
                            },
                          ],
                          contentSignals: [
                            {
                              platform: "Blog",
                              topic: "益生菌购买指南",
                              contentType: "save",
                              whyItWorks: "适合解释成分、场景和复购。",
                              evidenceQuotes: ["Blog"],
                            },
                          ],
                          opportunities: [
                            {
                              title: "敏感肠胃入门套装",
                              summary: "用订阅套装降低新用户选择成本。",
                              demandScore: 82,
                              competitionScore: 58,
                              contentGapScore: 76,
                              businessValueScore: 80,
                              evidenceQualityScore: 72,
                              reviewStatus: "needs_review",
                              reviewNote: "需要补充真实评论和价格。",
                              evidenceQuotes: ["Daily Gut Starter Kit"],
                            },
                          ],
                        })
                      : "# DeepSeek 公开采集结构化报告\n\n## 竞品拆解",
                },
              },
            ],
          }),
      };
    };

    const result = await runPublicDeepSeekIndustryResearchWorkflow(
      {
        ...input,
        urls: ["https://brand.example"],
      },
      {
        env: {
          AGENT_FACTORY_DEEPSEEK_API_KEY: "test-key",
          AGENT_FACTORY_DEEPSEEK_MODEL: "deepseek-v4-flash",
        },
        fetcher: fakeDeepSeekFetch,
        publicFetcher: fakePublicFetch,
      },
    );

    expect(deepSeekCallCount).toBe(2);
    expect(result.crawl_plans[0]?.mode).toBe("public_web");
    expect(result.competitors[0]?.name).toBe("GutPet Labs");
    expect(result.product_signals[0]?.signal).toContain("订阅型益生菌套装");
    expect(result.pain_points[0]?.theme).toBe("肠胃敏感");
    expect(result.opportunities[0]?.title).toBe("敏感肠胃入门套装");
    expect(result.reviewItems[0]?.targetId).toBe("deepseek-competitor-1");
    expect(result.research_reports[0]?.content).toContain(
      "DeepSeek 公开采集结构化报告",
    );
  });

  it("keeps public crawl results when provider report generation fails", async () => {
    let deepSeekCallCount = 0;
    const fakePublicFetch: PublicCrawlerFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head><title>GutPet Labs</title></head>
          <body>
            <h1>Daily Gut Starter Kit</h1>
            <p>Subscription probiotic bundle for sensitive stomach support.</p>
          </body>
        </html>
      `,
      headers: {
        get: (name) =>
          name.toLowerCase() === "content-type" ? "text/html" : null,
      },
    });
    const fakeDeepSeekFetch: DeepSeekFetch = async () => {
      deepSeekCallCount += 1;

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    deepSeekCallCount === 1
                      ? JSON.stringify({
                          competitors: [
                            {
                              name: "GutPet Labs",
                              channel: "DTC",
                              positioning: "宠物肠胃益生菌订阅套装品牌。",
                              websiteStructure: ["Product", "Reviews"],
                              collectionSignals: [
                                "Subscription probiotic bundle",
                              ],
                              evidenceQuotes: ["Daily Gut Starter Kit"],
                            },
                          ],
                          productSignals: [],
                          painPoints: [],
                          contentSignals: [],
                          opportunities: [],
                        })
                      : "",
                },
              },
            ],
          }),
      };
    };

    const result = await runPublicDeepSeekIndustryResearchWorkflow(
      {
        ...input,
        urls: ["https://brand.example"],
      },
      {
        env: {
          AGENT_FACTORY_DEEPSEEK_API_KEY: "test-key",
          AGENT_FACTORY_DEEPSEEK_MODEL: "deepseek-v4-flash",
        },
        fetcher: fakeDeepSeekFetch,
        publicFetcher: fakePublicFetch,
      },
    );

    expect(deepSeekCallCount).toBe(2);
    expect(result.raw_documents.length).toBeGreaterThan(0);
    expect(result.competitors[0]?.name).toBe("GutPet Labs");
    expect(result.research_reports[0]?.title).toContain("本地回退");
    expect(result.research_reports[0]?.content).toContain(
      "OpenAI-compatible provider 报告节点暂时失败",
    );
    expect(result.research_reports[0]?.content).toContain("## 公开采集结果");
  });
});

describe("industry research public crawl adapter", () => {
  const projectId = "research-public-crawl";
  const sources = [
    {
      id: "source-homepage",
      projectId,
      type: "url" as const,
      title: "Competitor homepage",
      value: "https://brand.example",
      automationHint: "公开首页。",
      discoveryCandidateId: "seed-homepage",
      priority: "high" as const,
    },
    {
      id: "source-rss",
      projectId,
      type: "rss" as const,
      title: "Competitor RSS",
      value: "https://brand.example/feed.xml",
      automationHint: "公开 RSS。",
      discoveryCandidateId: "seed-rss",
      priority: "medium" as const,
    },
    {
      id: "source-sitemap",
      projectId,
      type: "crawler" as const,
      title: "Competitor sitemap",
      value: "https://brand.example/sitemap.xml",
      automationHint: "公开 sitemap。",
      discoveryCandidateId: "seed-sitemap",
      priority: "medium" as const,
    },
  ];
  const crawlPlan = {
    id: "public-plan-1",
    projectId,
    mode: "public_web" as const,
    guardrails: ["只抓公开 http/https URL。"],
    targets: [
      {
        id: "target-homepage",
        projectId,
        candidateId: "seed-homepage",
        kind: "homepage" as const,
        target: "https://brand.example",
        reason: "抽取首页结构。",
        maxPages: 1,
        databaseTargets: ["website_structure_database" as const],
      },
      {
        id: "target-rss",
        projectId,
        candidateId: "seed-rss",
        kind: "rss" as const,
        target: "https://brand.example/feed.xml",
        reason: "抽取内容更新。",
        maxPages: 5,
        databaseTargets: ["content_database" as const],
      },
      {
        id: "target-sitemap",
        projectId,
        candidateId: "seed-sitemap",
        kind: "sitemap" as const,
        target: "https://brand.example/sitemap.xml",
        reason: "抽取产品页面 URL。",
        maxPages: 20,
        databaseTargets: ["source_database" as const],
      },
    ],
  };

  it("extracts public HTML, RSS and sitemap targets into raw documents", async () => {
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const bodies: Record<string, { body: string; contentType: string }> = {
        "https://brand.example": {
          body: `
            <html>
              <head><title>Brand Home</title><script>ignore()</script></head>
              <body><h1>宠物益生菌 Starter kits</h1><p>Bundle, reviews, subscription.</p></body>
            </html>
          `,
          contentType: "text/html",
        },
        "https://brand.example/feed.xml": {
          body: `
            <rss><channel><title>Brand Blog</title>
              <item><title>Buying Guide</title><link>https://brand.example/blog/guide</link><description>How to compare starter kits.</description></item>
            </channel></rss>
          `,
          contentType: "application/rss+xml",
        },
        "https://brand.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://brand.example/products/a</loc></url>
              <url><loc>https://brand.example/blog/guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
      };
      const fixture = bodies[String(url)];

      if (!fixture) {
        return {
          ok: false,
          status: 404,
          text: async () => "",
          headers: { get: () => null },
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => fixture.body,
        headers: {
          get: (name) =>
            name.toLowerCase() === "content-type" ? fixture.contentType : null,
        },
      };
    };

    const result = await runPublicCrawler(projectId, crawlPlan, sources, {
      fetcher: fakeFetch,
      input,
    });

    expect(result.crawl_jobs.every((job) => job.status === "done")).toBe(true);
    expect(result.crawl_runs.every((run) => run.documentsCreated === 1)).toBe(
      true,
    );
    expect(result.raw_documents).toHaveLength(3);
    expect(
      result.raw_documents.map((document) => document.contentType),
    ).toEqual(["html", "rss", "text"]);
    expect(result.raw_documents[0]?.extractedText).toContain("Starter kits");
    expect(result.raw_documents[1]?.extractedText).toContain("Buying Guide");
    expect(result.raw_documents[2]?.extractedText).toContain(
      "https://brand.example/products/a",
    );
    expect(result.raw_documents[0]?.sourceQuality.sourceType).toBe(
      "official_site",
    );
    expect(result.raw_documents[0]?.sourceQuality.acceptedForReport).toBe(true);
    expect(result.raw_documents[2]?.sourceQuality.sourceType).toBe("sitemap");
    expect(result.extraction_jobs).toHaveLength(3);
  });

  it("skips unsupported public crawl targets instead of fetching mock URLs", async () => {
    const target = {
      ...crawlPlan.targets[0],
      kind: "search_results" as const,
      target: "mock://search?q=pet",
    };
    const fetchCalls: string[] = [];
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        status: 200,
        text: async () => "",
        headers: { get: () => null },
      };
    };

    expect(canUsePublicCrawlerTarget(target)).toBe(false);

    const result = await runPublicCrawler(
      projectId,
      { ...crawlPlan, targets: [target] },
      sources,
      { fetcher: fakeFetch },
    );

    expect(fetchCalls).toHaveLength(0);
    expect(result.crawl_jobs[0]?.status).toBe("failed");
    expect(result.crawl_runs[0]?.documentsCreated).toBe(0);
    expect(result.crawl_runs[0]?.summary).toContain(
      "UNSUPPORTED_PUBLIC_TARGET",
    );
    expect(result.raw_documents).toHaveLength(0);
  });
});

describe("industry research public source discovery", () => {
  it("discovers robots, sitemap, RSS, Shopify and content URLs from a seed site", async () => {
    const projectId = "research-public-source-discovery";
    const crawlPlan = {
      id: "public-plan-discovery",
      projectId,
      mode: "public_web" as const,
      guardrails: ["只抓公开 http/https URL。"],
      targets: [
        {
          id: "target-homepage",
          projectId,
          candidateId: "seed-homepage",
          kind: "homepage" as const,
          target: "https://brand.example/",
          reason: "抽取首页结构。",
          maxPages: 1,
          databaseTargets: ["website_structure_database" as const],
        },
      ],
    };
    const fetchCalls: string[] = [];
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      fetchCalls.push(String(url));
      const fixtures: Record<string, { body: string; contentType: string }> = {
        "https://brand.example/": {
          body: `
            <html>
              <head><link rel="alternate" type="application/rss+xml" href="/feed.xml" /></head>
              <body><a href="/collections/all">Shop all</a><a href="/blogs/guides">Guides</a></body>
            </html>
          `,
          contentType: "text/html",
        },
        "https://brand.example/robots.txt": {
          body: "User-agent: *\nAllow: /\nSitemap: https://brand.example/sitemap.xml",
          contentType: "text/plain",
        },
        "https://brand.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://brand.example/products/starter-kit</loc></url>
              <url><loc>https://brand.example/blogs/guides/probiotic-guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
        "https://brand.example/feed.xml": {
          body: `
            <rss><channel><title>Brand Feed</title>
              <item><title>Guide</title><link>https://brand.example/blogs/guides/probiotic-guide</link></item>
            </channel></rss>
          `,
          contentType: "application/rss+xml",
        },
        "https://brand.example/collections/all": {
          body: "<html><title>All products</title></html>",
          contentType: "text/html",
        },
      };
      const fixture = fixtures[String(url)];

      return fixture
        ? {
            ok: true,
            status: 200,
            text: async () => fixture.body,
            headers: {
              get: (name) =>
                name.toLowerCase() === "content-type"
                  ? fixture.contentType
                  : null,
            },
          }
        : {
            ok: false,
            status: 404,
            text: async () => "",
            headers: { get: () => null },
          };
    };

    const result = await discoverPublicSources(
      projectId,
      { ...input, urls: ["https://brand.example/"] },
      crawlPlan,
      {
        fetcher: fakeFetch,
      },
    );
    const kinds = result.targets.map((target) => target.kind);
    const targetUrls = result.targets.map((target) => target.target);

    expect(fetchCalls).not.toContain("https://brand.example/rss.xml");
    expect(fetchCalls).not.toContain(
      "https://brand.example/products.json?limit=20",
    );
    expect(fetchCalls).not.toContain(
      "https://brand.example/collections/best-sellers",
    );
    expect(result.candidates.every((candidate) => candidate.status)).toBe(true);
    expect(kinds).toContain("robots");
    expect(kinds).toContain("sitemap");
    expect(kinds).toContain("rss");
    expect(kinds).toContain("collection");
    expect(kinds).toContain("product");
    expect(kinds).toContain("blog");
    expect(targetUrls).not.toContain("https://brand.example/");
    expect(result.notes.some((note) => note.includes("自动发现"))).toBe(true);
  });
});

describe("industry research public workflow", () => {
  it("discovers competitor websites from public search when no seed URLs are provided", async () => {
    const fetchCalls: string[] = [];
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const urlText = String(url);
      fetchCalls.push(urlText);

      if (urlText.startsWith("https://duckduckgo.com/html/")) {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html><body>
              <a class="result__a" href="/l/?uddg=${encodeURIComponent("https://gutpet.example/")}">GutPet Labs</a>
            </body></html>
          `,
          headers: {
            get: (name) =>
              name.toLowerCase() === "content-type" ? "text/html" : null,
          },
        };
      }

      const bodyByUrl: Record<string, { body: string; contentType: string }> = {
        "https://gutpet.example/": {
          body: `
            <html><head><title>GutPet Labs</title></head>
            <body><nav>Best Sellers Blog Reviews</nav><p>Subscription starter kits for sensitive stomach.</p></body></html>
          `,
          contentType: "text/html",
        },
        "https://gutpet.example/robots.txt": {
          body: "User-agent: *\nAllow: /\nSitemap: https://gutpet.example/sitemap.xml",
          contentType: "text/plain",
        },
        "https://gutpet.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://gutpet.example/products/starter-kit</loc></url>
              <url><loc>https://gutpet.example/blogs/guides/probiotic-guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
        "https://gutpet.example/products/starter-kit": {
          body: `
            <html><head><title>Daily Gut Starter Kit</title></head>
            <body><h1>Daily Gut Starter Kit</h1><p>Bundle and subscription probiotic.</p></body></html>
          `,
          contentType: "text/html",
        },
        "https://gutpet.example/blogs/guides/probiotic-guide": {
          body: `
            <html><head><title>Probiotic Guide</title></head>
            <body><h1>Probiotic Guide</h1><p>Education content for sensitive stomach support.</p></body></html>
          `,
          contentType: "text/html",
        },
      };
      const fixture = bodyByUrl[urlText];

      return fixture
        ? {
            ok: true,
            status: 200,
            text: async () => fixture.body,
            headers: {
              get: (name) =>
                name.toLowerCase() === "content-type"
                  ? fixture.contentType
                  : null,
            },
          }
        : {
            ok: false,
            status: 404,
            text: async () => "",
            headers: { get: () => null },
          };
    };

    const result = await runPublicIndustryResearchWorkflow(
      {
        ...input,
        urls: [],
      },
      {
        fetcher: fakeFetch,
        maxDiscoveredTargets: 8,
        maxSitemapUrls: 4,
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
        },
      },
    );
    const targets = result.crawl_plans[0]?.targets.map(
      (target) => target.target,
    );

    expect(fetchCalls.some((url) => url.includes("duckduckgo.com/html"))).toBe(
      true,
    );
    expect(
      result.source_discovery_plans[0]?.notes.some((note) =>
        note.includes("public_search_discovery 自动发现"),
      ),
    ).toBe(true);
    expect(targets).toContain("https://gutpet.example/");
    expect(targets).toContain("https://gutpet.example/sitemap.xml");
    expect(targets).toContain("https://gutpet.example/products/starter-kit");
    expect(targets?.some((target) => target.startsWith("mock://"))).toBe(false);
    expect(targets).not.toContain(
      "https://gutpet.example/collections/best-sellers",
    );
    expect(result.crawl_runs.every((run) => run.status === "done")).toBe(true);
    expect(
      result.raw_documents.some((document) =>
        document.extractedText.includes("GutPet Labs"),
      ),
    ).toBe(true);
  });

  it("runs a database-first workflow with public raw documents", async () => {
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const bodyByUrl: Record<string, { body: string; contentType: string }> = {
        "https://brand.example": {
          body: `
            <html><head><title>Brand Home</title></head>
            <body><nav>Home Catalog Contact</nav><main><h1>Best Sellers</h1><p>Subscription starter kits for sensitive stomach.</p></main></body></html>
          `,
          contentType: "text/html",
        },
        "https://brand.example/feed.xml": {
          body: `
            <rss><channel><title>Brand Updates</title>
              <item><title>New comparison guide</title><description>Bundle and starter kit comparisons.</description></item>
            </channel></rss>
          `,
          contentType: "application/rss+xml",
        },
        "https://brand.example/sitemap.xml": {
          body: `
            <urlset>
              <url><loc>https://brand.example/products/starter-kit</loc></url>
              <url><loc>https://brand.example/blog/comparison-guide</loc></url>
            </urlset>
          `,
          contentType: "application/xml",
        },
        "https://brand.example/products/starter-kit": {
          body: `
            <html><head><title>Starter Kit</title></head>
            <body><h1>Starter Kit</h1><p>Subscription starter kit and bundle.</p></body></html>
          `,
          contentType: "text/html",
        },
        "https://brand.example/blog/comparison-guide": {
          body: `
            <html><head><title>Comparison Guide</title></head>
            <body><h1>Comparison Guide</h1><p>Guide content for buyer education.</p></body></html>
          `,
          contentType: "text/html",
        },
      };
      const fixture = bodyByUrl[String(url)];

      return fixture
        ? {
            ok: true,
            status: 200,
            text: async () => fixture.body,
            headers: {
              get: (name) =>
                name.toLowerCase() === "content-type"
                  ? fixture.contentType
                  : null,
            },
          }
        : {
            ok: false,
            status: 404,
            text: async () => "",
            headers: { get: () => null },
          };
    };

    const result = await runPublicIndustryResearchWorkflow(
      {
        ...input,
        urls: [
          "https://brand.example",
          "https://brand.example/feed.xml",
          "https://brand.example/sitemap.xml",
        ],
      },
      {
        fetcher: fakeFetch,
        env: {
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
        },
      },
    );

    expect(result.crawl_plans[0]?.mode).toBe("public_web");
    expect(result.raw_documents.length).toBeGreaterThanOrEqual(3);
    expect(result.crawl_runs.every((run) => run.status === "done")).toBe(true);
    expect(result.raw_documents[0]?.extractedText).toContain("Best Sellers");
    expect(result.raw_documents[0]?.extractedText).not.toContain(
      "Home Catalog Contact",
    );
    expect(
      result.source_discovery_plans[0]?.candidates.some(
        (candidate) => candidate.status === "discovered",
      ),
    ).toBe(true);
    expect(
      result.crawl_plans[0]?.targets.some(
        (target) =>
          target.target === "https://brand.example/products/starter-kit",
      ),
    ).toBe(true);
    expect(result.source_database[0]?.reliability).toBe("needs_validation");
    expect(result.competitors).toHaveLength(0);
    expect(result.product_signals).toHaveLength(0);
    expect(result.opportunities).toHaveLength(0);
    expect(
      result.evidence.every(
        (evidence) =>
          evidence.rawDocumentId && evidence.validation?.quoteMatched,
      ),
    ).toBe(true);
    expect(
      result.workflowSteps.some((step) => step.title === "采集公开资料"),
    ).toBe(true);
    expect(result.research_reports[0]?.content).toContain("## 公开采集结果");

    const artifacts = createIndustryResearchDeliveryArtifacts({
      input,
      result,
      runId: "public-web-no-template-run",
      startedAt: "2026-06-29T00:00:00.000Z",
      finishedAt: "2026-06-29T00:00:01.000Z",
    });
    const combinedReport = [
      artifacts.reportMarkdown,
      artifacts.reviewedReportMarkdown,
      JSON.stringify(artifacts.databases),
    ].join("\n");

    expect(combinedReport).toContain("## 已确认发现");
    expect(combinedReport).toContain("## 候选发现");
    expect(combinedReport).toContain("## 不确定 / 阻塞项");
    expect(combinedReport).not.toMatch(
      /头部竞品 A|Subscription Pack|mock 周报|mock：/,
    );

    const unmatched = validateEvidenceQuotes(
      ["this quote does not exist in any crawled document"],
      result.raw_documents,
    );
    expect(unmatched.status).toBe("needs_review");
    expect(unmatched.failureReasons).toContain(
      "quote_not_found_in_raw_documents",
    );
  });

  it("honors env crawl target caps for public workflow runs", async () => {
    const crawledUrls: string[] = [];
    const pageUrls = new Set([
      "https://brand.example/page-1",
      "https://brand.example/page-2",
      "https://brand.example/page-3",
      "https://brand.example/page-4",
    ]);
    const fakeFetch: PublicCrawlerFetch = async (url) => {
      const urlText = String(url);

      if (!pageUrls.has(urlText)) {
        return {
          ok: false,
          status: 404,
          text: async () => "",
          headers: { get: () => null },
        };
      }

      crawledUrls.push(urlText);
      return {
        ok: true,
        status: 200,
        text: async () =>
          `<html><head><title>${urlText}</title></head><body><p>Public competitor evidence.</p></body></html>`,
        headers: {
          get: (name) =>
            name.toLowerCase() === "content-type" ? "text/html" : null,
        },
      };
    };

    const result = await runPublicIndustryResearchWorkflow(
      {
        ...input,
        urls: [...pageUrls],
      },
      {
        fetcher: fakeFetch,
        env: {
          AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_QUERIES: "1",
          AGENT_FACTORY_PUBLIC_WEB_MAX_SEARCH_RESULTS_PER_QUERY: "1",
          AGENT_FACTORY_PUBLIC_WEB_MAX_PROBE_URLS: "1",
          AGENT_FACTORY_PUBLIC_WEB_MAX_SITEMAP_URLS: "1",
          AGENT_FACTORY_PUBLIC_WEB_MAX_DISCOVERED_TARGETS: "1",
          AGENT_FACTORY_PUBLIC_WEB_MAX_CRAWL_TARGETS: "2",
          AGENT_FACTORY_SOURCE_REGISTRY_DISABLED: "true",
        },
      },
    );

    expect(crawledUrls).toHaveLength(2);
    expect(result.raw_documents).toHaveLength(2);
    expect(
      result.crawl_runs.filter((run) =>
        run.summary.includes("TARGET_CAP_EXCEEDED"),
      ),
    ).toHaveLength(2);
  });
});
