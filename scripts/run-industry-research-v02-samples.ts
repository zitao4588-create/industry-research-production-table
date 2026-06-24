import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createIndustryResearchDeliveryArtifacts,
  type PublicCrawlerFetch,
  type ResearchWorkflowInput,
  runPublicDeepSeekIndustryResearchWorkflow,
} from "../packages/industry-research/src/index.ts";

type V02Sample = {
  id: string;
  input: ResearchWorkflowInput;
};

const samples: V02Sample[] = [
  {
    id: "us-dtc-pet-treats",
    input: {
      projectName: "美国 DTC 宠物零食竞品研究",
      industry: "宠物食品电商",
      category: "宠物零食与功能性 treats",
      market: "美国 DTC 电商",
      researchGoal:
        "验证宠物零食赛道的公开官网、商品页和内容页是否足以支撑轻量竞品研究交付。",
      templateId: "ecommerce_competitor_research",
      urls: [
        "https://www.pawstruck.com/collections/dog-treats",
        "https://www.chewy.com/b/treats-335",
        "https://www.bark.co/products/dog-treats",
      ],
      csvText:
        "brand,product_hint,review_hint\nPawstruck,Dog Treats,关注天然咀嚼、蛋白和大包装\nChewy,Treats,关注平台类目、价格带和评论数量\nBark,Treats,关注订阅盒子和内容化包装",
      manualText:
        "人工假设：美国宠物零食 DTC 可能围绕天然成分、训练奖励、订阅复购和功能性场景做差异化；所有判断必须回到公开页面证据。",
    },
  },
  {
    id: "japan-niche-skincare",
    input: {
      projectName: "日本小众护肤品牌竞品研究",
      industry: "美妆护肤电商",
      category: "日本小众护肤品牌",
      market: "日本及北美跨境电商",
      researchGoal:
        "验证小众护肤品牌能否通过官网、商品页、品牌内容和公开 collection 支撑竞品定位分析。",
      templateId: "ecommerce_competitor_research",
      urls: [
        "https://www.tatcha.com/",
        "https://us.rmk.com/",
        "https://www.shiseido.com/us/en/skincare/",
      ],
      csvText:
        "brand,product_hint,review_hint\nTatcha,Skincare Ritual,关注日式仪式感和高端定位\nRMK,Base Makeup,关注底妆和简洁品牌表达\nShiseido,Skincare,关注成熟品牌的品类结构",
      manualText:
        "人工假设：日本小众护肤品牌常用成分故事、仪式感、极简视觉和跨境信任背书建立溢价；需要公开页面证据验证。",
    },
  },
  {
    id: "na-camping-gear",
    input: {
      projectName: "北美户外露营装备竞品研究",
      industry: "户外装备电商",
      category: "露营装备与便携户外用品",
      market: "北美 DTC 与零售电商",
      researchGoal:
        "验证露营装备赛道是否能从官网、collection、商品页和内容页抽取产品结构与机会信号。",
      templateId: "ecommerce_competitor_research",
      urls: [
        "https://www.bioliteenergy.com/collections/camping",
        "https://www.rei.com/c/camping-and-hiking",
        "https://www.snowpeak.com/collections/camping",
      ],
      csvText:
        "brand,product_hint,review_hint\nBioLite,Camping Energy,关注便携能源和照明\nREI,Camping and Hiking,关注平台类目和装备组合\nSnow Peak,Camping,关注高端露营生活方式",
      manualText:
        "人工假设：北美露营装备机会可能来自轻量化、便携能源、套装化和生活方式内容；必须由公开页面和证据链确认。",
    },
  },
];

function loadLocalEnv() {
  let envText = "";

  try {
    envText = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function selectedSamples() {
  const sampleArgIndex = process.argv.indexOf("--sample");
  const sampleId =
    process.argv
      .find((arg) => arg.startsWith("--sample="))
      ?.replace("--sample=", "") ??
    (sampleArgIndex >= 0 ? process.argv[sampleArgIndex + 1] : undefined);

  if (!sampleId) {
    return samples;
  }

  return samples.filter((sample) => sample.id === sampleId);
}

function createTimedPublicFetcher(timeoutMs = 12_000): PublicCrawlerFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function runSample(sample: V02Sample) {
  console.error(`[v02] start ${sample.id}`);

  const started = new Date();
  const runId = `v02-${sample.id}-${timestampForPath(started)}`;
  const result = await runPublicDeepSeekIndustryResearchWorkflow(sample.input, {
    env: process.env,
    maxDiscoveredTargets: 3,
    maxSitemapUrls: 5,
    now: started.toISOString(),
    publicFetcher: createTimedPublicFetcher(),
  });
  const finished = new Date();
  const artifacts = createIndustryResearchDeliveryArtifacts({
    input: sample.input,
    result,
    runId,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
  });
  const outputDir = join("outputs", "industry-research-runs", runId);

  await mkdir(outputDir, { recursive: true });
  await writeJson(join(outputDir, "input.json"), artifacts.input);
  await writeJson(
    join(outputDir, "raw_documents.json"),
    artifacts.raw_documents,
  );
  await writeJson(join(outputDir, "databases.json"), artifacts.databases);
  await writeJson(join(outputDir, "review_items.json"), artifacts.review_items);
  await writeFile(
    join(outputDir, "report.md"),
    artifacts.reportMarkdown,
    "utf8",
  );
  await writeFile(
    join(outputDir, "reviewed_report.md"),
    artifacts.reviewedReportMarkdown,
    "utf8",
  );
  await writeJson(join(outputDir, "run_log.json"), artifacts.run_log);
  await writeJson(join(outputDir, "manifest.json"), artifacts.manifest);

  const summary = {
    sampleId: sample.id,
    runId,
    outputDir,
    manifest: join(outputDir, "manifest.json"),
    mode: artifacts.run_log.mode,
    llmStatus: artifacts.run_log.llmStatus,
    rawDocuments: artifacts.run_log.counts.rawDocuments,
    evidence: artifacts.run_log.counts.evidence,
    reviewItems: artifacts.run_log.counts.reviewItems,
    crawlFailures: artifacts.run_log.crawlFailures.length,
    extractionNeedsReview: artifacts.run_log.extractionNeedsReview.length,
    sourceQualitySummary: artifacts.run_log.sourceQualitySummary,
    report: join(outputDir, "report.md"),
    reviewedReport: join(outputDir, "reviewed_report.md"),
  };

  console.error(
    `[v02] done ${sample.id}: ${summary.llmStatus}, raw=${summary.rawDocuments}, evidence=${summary.evidence}, accepted=${summary.sourceQualitySummary.acceptedForReport}`,
  );

  return summary;
}

async function main() {
  loadLocalEnv();

  const targetSamples = selectedSamples();

  if (targetSamples.length === 0) {
    throw new Error("没有匹配的 v0.2 样例。请检查 --sample 参数。");
  }

  const summaries = [];

  for (const sample of targetSamples) {
    summaries.push(await runSample(sample));
  }

  console.log(JSON.stringify({ samples: summaries }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exit(1);
});
