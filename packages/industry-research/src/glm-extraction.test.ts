import { describe, expect, it } from "vitest";
import type { GlmFetch } from "./glm-client";
import {
  type GlmStructuredExtraction,
  generateGlmStructuredExtractionBatched,
  mergeGlmStructuredExtractions,
  planExtractionBatches,
} from "./glm-extraction";
import { runMockIndustryResearchWorkflow } from "./mock-workflow";
import type {
  RawDocument,
  ResearchWorkflowInput,
  ResearchWorkflowResult,
  SourceQualityType,
} from "./types";

const testEnv = {
  AGENT_FACTORY_LLM_API_KEY: "test-key",
  AGENT_FACTORY_LLM_BASE_URL: "https://provider.test",
  AGENT_FACTORY_LLM_MODEL: "test-model",
};

const workflowInput: ResearchWorkflowInput = {
  projectName: "分批抽取测试",
  industry: "宠物健康电商",
  category: "宠物肠胃益生菌",
  market: "美国 DTC 电商",
  researchGoal: "验证分批 map-reduce 抽取",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

function createRawDocument(
  id: string,
  overrides: {
    textLength?: number;
    sourceType?: SourceQualityType;
    acceptedForReport?: boolean;
  } = {},
): RawDocument {
  const {
    textLength = 1000,
    sourceType = "official_site",
    acceptedForReport = true,
  } = overrides;

  return {
    id,
    projectId: "project-test",
    sourceId: `source-${id}`,
    crawlRunId: `crawl-run-${id}`,
    url: `https://example.com/${id}`,
    title: `${id} 标题`,
    contentType: "html",
    excerpt: `${id} 摘要`,
    extractedText: `${id} `
      .repeat(Math.ceil(textLength / (id.length + 1)))
      .slice(0, textLength),
    databaseTargets: ["competitor_database"],
    sourceQuality: {
      sourceType,
      sourceRelevance: "high",
      sourceConfidence: "high",
      needsReviewReason: "",
      acceptedForReport,
    },
  };
}

function createDataset(rawDocuments: RawDocument[]): ResearchWorkflowResult {
  const base = runMockIndustryResearchWorkflow(workflowInput);
  return { ...base, raw_documents: rawDocuments };
}

function extractionWithCompetitor(
  name: string,
  quote: string,
  extra: Partial<GlmStructuredExtraction> = {},
): GlmStructuredExtraction {
  return {
    competitors: [
      {
        name,
        channel: "DTC",
        positioning: `${name} 定位`,
        websiteStructure: [],
        collectionSignals: [],
        evidenceQuotes: [quote],
      },
    ],
    productSignals: [],
    painPoints: [],
    contentSignals: [],
    opportunities: [],
    ...extra,
  };
}

function createRecordingFetcher(
  responder: (
    callIndex: number,
    promptContent: string,
  ) => GlmStructuredExtraction,
) {
  const prompts: string[] = [];
  const fetcher: GlmFetch = async (_input, init) => {
    const body = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const prompt = body.messages[body.messages.length - 1]?.content ?? "";
    const callIndex = prompts.length;
    prompts.push(prompt);
    const extraction = responder(callIndex, prompt);

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(extraction) } }],
        }),
    };
  };

  return { fetcher, prompts };
}

describe("planExtractionBatches", () => {
  it("splits documents by per-batch document cap", () => {
    const documents = ["a", "b", "c", "d", "e"].map((id) =>
      createRawDocument(id),
    );
    const batches = planExtractionBatches(documents, { maxDocsPerBatch: 2 });

    expect(batches.map((batch) => batch.length)).toEqual([2, 2, 1]);
  });

  it("splits documents by per-batch character budget", () => {
    const documents = ["a", "b", "c"].map((id) =>
      createRawDocument(id, { textLength: 3000 }),
    );
    const batches = planExtractionBatches(documents, {
      maxCharsPerBatch: 4000,
    });

    expect(batches).toHaveLength(3);
  });

  it("orders confirmable sources before robots/sitemap and applies total cap", () => {
    const documents = [
      createRawDocument("robots-doc", { sourceType: "robots" }),
      createRawDocument("official-doc"),
      createRawDocument("sitemap-doc", { sourceType: "sitemap" }),
      createRawDocument("product-doc", { sourceType: "product_page" }),
    ];
    const batches = planExtractionBatches(documents, {
      maxDocsPerBatch: 2,
      maxTotalDocs: 3,
    });
    const orderedIds = batches.flat().map((document) => document.id);

    expect(orderedIds).toEqual(["official-doc", "product-doc", "robots-doc"]);
  });
});

describe("mergeGlmStructuredExtractions", () => {
  it("dedupes competitors by name and unions evidence", () => {
    const merged = mergeGlmStructuredExtractions([
      extractionWithCompetitor("Finn", "quote-1"),
      extractionWithCompetitor("finn ", "quote-2"),
      extractionWithCompetitor("Native Pet", "quote-3"),
    ]);

    expect(merged.competitors).toHaveLength(2);
    const finn = merged.competitors.find((item) =>
      item.name?.toLowerCase().includes("finn"),
    );
    expect(finn?.evidenceQuotes).toEqual(["quote-1", "quote-2"]);
  });

  it("keeps the highest pain point frequency and longest text fields", () => {
    const merged = mergeGlmStructuredExtractions([
      {
        competitors: [],
        productSignals: [],
        painPoints: [
          {
            theme: "软便",
            userNeed: "短",
            frequency: "medium",
            evidenceQuotes: ["q1"],
          },
        ],
        contentSignals: [],
        opportunities: [],
      },
      {
        competitors: [],
        productSignals: [],
        painPoints: [
          {
            theme: "软便",
            userNeed: "更长的用户需求描述",
            frequency: "high",
            evidenceQuotes: ["q2"],
          },
        ],
        contentSignals: [],
        opportunities: [],
      },
    ]);

    expect(merged.painPoints).toHaveLength(1);
    expect(merged.painPoints[0]?.frequency).toBe("high");
    expect(merged.painPoints[0]?.userNeed).toBe("更长的用户需求描述");
    expect(merged.painPoints[0]?.evidenceQuotes).toEqual(["q1", "q2"]);
  });

  it("dedupes opportunities by title and unions quotes", () => {
    const merged = mergeGlmStructuredExtractions([
      {
        competitors: [],
        productSignals: [],
        painPoints: [],
        contentSignals: [],
        opportunities: [
          { title: "换粮套装", summary: "A", evidenceQuotes: ["q1"] },
        ],
      },
      {
        competitors: [],
        productSignals: [],
        painPoints: [],
        contentSignals: [],
        opportunities: [
          {
            title: "换粮套装",
            summary: "更长的机会说明",
            evidenceQuotes: ["q2"],
          },
        ],
      },
    ]);

    expect(merged.opportunities).toHaveLength(1);
    expect(merged.opportunities[0]?.summary).toBe("更长的机会说明");
    expect(merged.opportunities[0]?.evidenceQuotes).toEqual(["q1", "q2"]);
  });
});

describe("generateGlmStructuredExtractionBatched", () => {
  it("sends one request per batch with only that batch's documents", async () => {
    const documents = ["doc-a", "doc-b", "doc-c", "doc-d"].map((id) =>
      createRawDocument(id),
    );
    const dataset = createDataset(documents);
    const { fetcher, prompts } = createRecordingFetcher((callIndex) =>
      callIndex === 0
        ? extractionWithCompetitor("Finn", "quote-1")
        : extractionWithCompetitor("Finn", "quote-2", {
            painPoints: [
              {
                theme: "软便",
                userNeed: "需要温和配方",
                frequency: "high",
                evidenceQuotes: ["quote-2"],
              },
            ],
          }),
    );

    const result = await generateGlmStructuredExtractionBatched({
      dataset,
      env: testEnv,
      fetcher,
      batchOptions: { maxDocsPerBatch: 2 },
    });

    expect(result.batchCount).toBe(2);
    expect(result.failedBatchCount).toBe(0);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("doc-a");
    expect(prompts[0]).toContain("doc-b");
    expect(prompts[0]).not.toContain("doc-c");
    expect(prompts[1]).toContain("doc-c");
    expect(prompts[1]).toContain("doc-d");
    expect(prompts[1]).not.toContain('"doc-a"');
    expect(prompts[0]).toContain("第 1/2 批");
    expect(prompts[1]).toContain("第 2/2 批");
    expect(result.extraction.competitors).toHaveLength(1);
    expect(result.extraction.competitors[0]?.evidenceQuotes).toEqual([
      "quote-1",
      "quote-2",
    ]);
    expect(result.extraction.painPoints).toHaveLength(1);
  });

  it("injects historical context into every batch prompt with the evidence constraint", async () => {
    const documents = ["doc-a", "doc-b"].map((id) => createRawDocument(id));
    const dataset = createDataset(documents);
    const { fetcher, prompts } = createRecordingFetcher(() =>
      extractionWithCompetitor("Finn", "quote-1"),
    );

    await generateGlmStructuredExtractionBatched({
      dataset,
      env: testEnv,
      fetcher,
      batchOptions: { maxDocsPerBatch: 1 },
      historicalContext: ["上一次 run（run-prev）已识别竞品：Finn"],
    });

    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain("历史研究上下文");
      expect(prompt).toContain("run-prev");
      expect(prompt).toContain("evidenceQuotes 仍只能来自本次 rawDocuments");
    }
  });

  it("degrades a failed batch without losing successful batches", async () => {
    const documents = ["doc-a", "doc-b", "doc-c", "doc-d"].map((id) =>
      createRawDocument(id),
    );
    const dataset = createDataset(documents);
    let calls = 0;
    const fetcher: GlmFetch = async (_input, init) => {
      calls += 1;
      if (calls === 2) {
        throw new Error("provider unavailable");
      }
      const body = JSON.parse(init.body) as { messages: unknown[] };
      expect(body.messages.length).toBeGreaterThan(0);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(
                    extractionWithCompetitor("Finn", "quote-1"),
                  ),
                },
              },
            ],
          }),
      };
    };

    const result = await generateGlmStructuredExtractionBatched({
      dataset,
      env: testEnv,
      fetcher,
      batchOptions: { maxDocsPerBatch: 2 },
    });

    expect(result.batchCount).toBe(2);
    expect(result.failedBatchCount).toBe(1);
    expect(result.failedBatchDocumentIds).toEqual(["doc-c", "doc-d"]);
    expect(result.failureMessages).toEqual(["provider unavailable"]);
    expect(result.extraction.competitors).toHaveLength(1);
  });

  it("throws when every batch fails so the workflow-level fallback still applies", async () => {
    const documents = ["doc-a", "doc-b"].map((id) => createRawDocument(id));
    const dataset = createDataset(documents);
    const fetcher: GlmFetch = async () => {
      throw new Error("provider down");
    };

    await expect(
      generateGlmStructuredExtractionBatched({
        dataset,
        env: testEnv,
        fetcher,
        batchOptions: { maxDocsPerBatch: 1 },
      }),
    ).rejects.toThrow("全部批次失败");
  });
});
