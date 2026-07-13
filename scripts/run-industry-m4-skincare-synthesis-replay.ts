import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createIndustryAcquisitionTaskPlan,
  createIndustryGradedReport,
  createIndustryPlan,
  createIndustryReportBundle,
  dishwasherIndustryPlanningFixture,
  type IndustryAtomicClaimsArtifact,
  type IndustryM2WaveVerification,
  type IndustryModuleResultsArtifact,
  type IndustryOpportunityHypothesesArtifact,
  type IndustrySynthesisClaimInput,
  serializeIndustryClaimLedger,
  serializeIndustryGradedReport,
  serializeIndustryKnowledgeMap,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeTextAtomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

type ClaimEvidenceModule = {
  moduleId: string;
  claims: Array<{
    claimId: string;
    statement: string;
    evidenceIds: string[];
  }>;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    sourceRole: string;
  }>;
  evidence: Array<{
    id: string;
    sourceId: string;
    rawDocumentId: string;
    quote: string;
    claimRole: string;
    sourceRole: string;
  }>;
};

type DishwasherReview = {
  status: "passed_local_c2";
  deterministicReplay: {
    gradedReportJsonSha256: `sha256:${string}`;
    reportMarkdownSha256: `sha256:${string}`;
    expectedHashesMatched: boolean;
  };
  decisionBoundary: {
    commercializationDecisionProduced: boolean;
    realUserValidationCompleted: boolean;
  };
};

const skincareModuleDir = resolve(
  argumentValue("skincare-modules") ??
    "outputs/industry-data-report-loop/m4.2/skincare-m4-2-wave-6-2026-07-13T15-43-24-120Z/m4.3-module-research",
);
const dishwasherM2VerificationPath = resolve(
  argumentValue("dishwasher-m2-verification") ??
    "outputs/industry-data-report-loop/m2.4/dishwasher-m2-4-targeted-wave-3-2026-07-13T13-38-53-478Z/verification.json",
);
const dishwasherAtomicClaimsPath = resolve(
  argumentValue("dishwasher-atomic-claims") ??
    "outputs/industry-data-report-loop/m3.1/dishwasher/atomic_claims.json",
);
const dishwasherHypothesesPath = resolve(
  argumentValue("dishwasher-hypotheses") ??
    "outputs/industry-data-report-loop/m3.2/dishwasher/opportunity_hypotheses.json",
);
const dishwasherExpectedReportPath = resolve(
  argumentValue("dishwasher-expected-report") ??
    "outputs/industry-data-report-loop/m3.3/dishwasher/graded_report.json",
);
const dishwasherExpectedMarkdownPath = resolve(
  argumentValue("dishwasher-expected-markdown") ??
    "outputs/industry-data-report-loop/m3.3/dishwasher/report.md",
);
const dishwasherReviewPath = resolve(
  argumentValue("dishwasher-review") ??
    "outputs/industry-data-report-loop/m3.4/dishwasher/review.json",
);
const outputDir = resolve(
  argumentValue("output") ??
    "outputs/industry-data-report-loop/m4.4/skincare-dishwasher-compatibility",
);

const [
  skincareModuleResults,
  claimEvidenceIndex,
  dishwasherM2Verification,
  dishwasherAtomicClaims,
  dishwasherHypotheses,
  dishwasherExpectedReportJson,
  dishwasherExpectedMarkdown,
  dishwasherReview,
] = await Promise.all([
  readJson<IndustryModuleResultsArtifact>(
    join(skincareModuleDir, "module-results.json"),
  ),
  readJson<ClaimEvidenceModule[]>(
    join(skincareModuleDir, "claim-evidence-index.json"),
  ),
  readJson<IndustryM2WaveVerification>(dishwasherM2VerificationPath),
  readJson<IndustryAtomicClaimsArtifact>(dishwasherAtomicClaimsPath),
  readJson<IndustryOpportunityHypothesesArtifact>(dishwasherHypothesesPath),
  readFile(dishwasherExpectedReportPath, "utf8"),
  readFile(dishwasherExpectedMarkdownPath, "utf8"),
  readJson<DishwasherReview>(dishwasherReviewPath),
]);

if (
  skincareModuleResults.status !== "complete" ||
  skincareModuleResults.blockedModuleIds.length > 0 ||
  skincareModuleResults.moduleResults.length !== 6
) {
  throw new Error("m4_4_skincare_modules_not_complete");
}

const synthesisClaims: IndustrySynthesisClaimInput[] = [
  {
    claimId: "synthesis:price-choice-relationship-inference",
    kind: "inference",
    statement:
      "公开资料同时显示护肤品存在分层价格带，消费者也会在实用主义与犒赏自我之间选择；两者可能相关，但当前证据不能证明因果或购买转化。",
    supportingClaimIds: [
      "ledger:m4-3-market_landscape-claim-5",
      "ledger:m4-3-consumer_demand-claim-14",
    ],
    moduleIds: ["market_landscape", "consumer_demand"],
    counterEvidence: [
      "价格带来源与消费者研究的样本、口径和时间并不相同。",
      "公开研究没有提供同一批用户的实际购买路径。",
    ],
    validationPlan: [],
    opportunity: false,
  },
  {
    claimId: "synthesis:skincare-comparison-page-hypothesis",
    kind: "hypothesis",
    statement:
      "待验证机会假设：面向正在多个价位间权衡、同时关心功效、耐受性、成分和使用注意事项的护肤消费者，提供结构化对比决策页，可能提高完成选择的效率。",
    supportingClaimIds: [
      "ledger:m4-3-consumer_demand-claim-14",
      "ledger:m4-3-consumer_demand-claim-15",
      "ledger:m4-3-ecommerce_competitor_research-claim-20",
      "ledger:m4-3-ecommerce_competitor_research-claim-21",
      "ledger:m4-3-ecommerce_competitor_research-claim-22",
    ],
    moduleIds: ["consumer_demand", "ecommerce_competitor_research"],
    counterEvidence: [
      "社区公开讨论不能代表全体消费者。",
      "当前价格只是单一品牌三个公开页面的观察值，不能代表完整市场价格分布。",
    ],
    validationPlan: [
      "目标用户：最近 30 天主动选购面霜、并在至少两个价位间比较的消费者。",
      "任务：不给现场指导，让参与者用对比页完成三款候选比较并说明选择理由。",
      "成功标准：5 名目标用户中至少 4 名在 10 分钟内完成选择，且至少 3 名能准确复述功效、耐受性或使用限制。",
      "业务记录：单独询问付费意愿、获客来源和交付成本，不用任务完成率替代商业结论。",
    ],
    opportunity: true,
  },
  {
    claimId: "synthesis:structured-content-entry-hypothesis",
    kind: "hypothesis",
    statement:
      "待验证机会假设：面向需要成分和使用注意事项解释的年轻护肤消费者，用结构化内容连接抖音、小红书触点与同一对比决策页，可能带来有效研究任务完成；互动量本身不能证明转化。",
    supportingClaimIds: [
      "ledger:m4-3-consumer_demand-claim-15",
      "ledger:m4-3-ecommerce_competitor_research-claim-19",
      "ledger:m4-3-content_and_traffic-claim-25",
      "ledger:m4-3-content_and_traffic-claim-26",
    ],
    moduleIds: [
      "consumer_demand",
      "ecommerce_competitor_research",
      "content_and_traffic",
    ],
    counterEvidence: [
      "内容供给增长和高互动样本都不能直接证明点击、购买或留存。",
      "年轻人群描述来自品牌自身定位，不能外推为全行业用户结构。",
    ],
    validationPlan: [
      "先离线测试两种内容入口的信息理解度，不公开发布、不联系用户。",
      "获得 L5 后，再对同一目标人群测试内容理解、进入对比页和任务完成三个独立指标。",
      "失败标准：互动存在但目标用户无法完成对比任务，或有效获客成本、交付成本不可接受。",
    ],
    opportunity: true,
  },
];

const skincareBundle = createIndustryReportBundle({
  moduleResults: skincareModuleResults,
  evidenceMode: "verified_external_evidence",
  synthesisClaims,
});
const sourceById = new Map(
  claimEvidenceIndex.flatMap((module) =>
    module.sources.map((source) => [source.id, source] as const),
  ),
);
const evidenceById = new Map(
  claimEvidenceIndex.flatMap((module) =>
    module.evidence.map((evidence) => [evidence.id, evidence] as const),
  ),
);
const evidenceAppendixLines = skincareBundle.claimLedger.entries
  .filter((entry) => entry.sourceClaimId !== null)
  .flatMap((entry) => {
    const evidence = entry.evidenceIds.map((id) => evidenceById.get(id));
    if (evidence.some((item) => !item)) {
      throw new Error(`m4_4_evidence_index_missing:${entry.claimId}`);
    }
    return [
      `### ${entry.statement}`,
      "",
      `- claimId：${entry.claimId}`,
      ...evidence.flatMap((item) => {
        if (!item) return [];
        const source = sourceById.get(item.sourceId);
        if (!source) {
          throw new Error(`m4_4_source_index_missing:${item.sourceId}`);
        }
        return [
          `- 来源：[${source.title}](${source.url})（${source.sourceRole}）`,
          `- 不可变原文：${item.rawDocumentId}`,
          `- 逐字证据：> ${item.quote.replace(/\n/g, " ")}`,
        ];
      }),
      "",
    ];
  });
skincareBundle.reportMarkdown = `${skincareBundle.reportMarkdown.trimEnd()}\n\n${[
  "## 公开来源与逐字证据附录",
  "",
  "以下只列出通过模块门禁的直接事实与信号；跨模块推断和机会假设必须回到其 supporting claim，不能当成新的外部事实。",
  "",
  ...evidenceAppendixLines,
]
  .join("\n")
  .trimEnd()}\n`;

const dishwasherTaskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
const dishwasherReplay = createIndustryGradedReport({
  runId: "dishwasher-m3-3-graded-report",
  category: "洗碗机",
  atomicClaims: dishwasherAtomicClaims,
  hypotheses: dishwasherHypotheses,
  m2Verification: dishwasherM2Verification,
  taskPlan: dishwasherTaskPlan,
});
const dishwasherReplayJson = serializeIndustryGradedReport(dishwasherReplay);
const dishwasherReplayMarkdown = dishwasherReplay.reportMarkdown;
const dishwasherJsonHash = sha256(dishwasherReplayJson);
const dishwasherMarkdownHash = sha256(dishwasherReplayMarkdown);
const directEntries = skincareBundle.claimLedger.entries.filter(
  (entry) => entry.sourceClaimId !== null,
);
const opportunityEntries = skincareBundle.claimLedger.entries.filter(
  (entry) => entry.opportunity,
);
const forbiddenCommercialConclusion =
  /(?:建议|应当|结论[:：]?|决定).{0,16}(?:停止|终止|退出).{0,8}(?:商业化|项目|市场)/;
const audit = {
  schemaVersion: "industry_m4_4_synthesis_replay_audit.v1",
  artifactType: "industry-m4-4-synthesis-replay-audit",
  status: "passed_local_c2",
  skincare: {
    industryPlanId: skincareModuleResults.industryPlanId,
    moduleCount: skincareModuleResults.moduleResults.length,
    blockedModuleIds: skincareModuleResults.blockedModuleIds,
    directConfirmedClaims: directEntries.length,
    eligibleLedgerEntries: skincareBundle.claimLedger.counts.eligible,
    inferenceCount: skincareBundle.claimLedger.counts.inference,
    opportunityHypothesisCount: opportunityEntries.length,
    reportChapterCount: skincareBundle.chapters.length,
    evidenceAppendixEntries: directEntries.length,
    decisionGuidance: skincareBundle.decisionGuidance,
  },
  dishwasherReplay: {
    category: dishwasherReplay.category,
    confirmedFacts: dishwasherReplay.confirmedFacts.length,
    unverifiedHypotheses: dishwasherReplay.unverifiedHypotheses.length,
    status: dishwasherReview.status,
    jsonHash: dishwasherJsonHash,
    markdownHash: dishwasherMarkdownHash,
    expectedJsonByteMatch:
      dishwasherReplayJson === dishwasherExpectedReportJson,
    expectedMarkdownByteMatch:
      dishwasherReplayMarkdown === dishwasherExpectedMarkdown,
    priorReviewHashesMatch:
      dishwasherJsonHash ===
        dishwasherReview.deterministicReplay.gradedReportJsonSha256 &&
      dishwasherMarkdownHash ===
        dishwasherReview.deterministicReplay.reportMarkdownSha256,
  },
  compatibility: {
    skincareContainsDishwasherContent: /洗碗机/.test(
      skincareBundle.reportMarkdown,
    ),
    dishwasherContainsSkincareContent: /护肤|化妆品/.test(
      dishwasherReplayMarkdown,
    ),
    legacyEightFilePackageUnchanged:
      skincareBundle.compatibility.legacyEightFilePackageUnchanged,
    broadAndNarrowIndustryPlanIdsDistinct:
      skincareModuleResults.industryPlanId !==
      dishwasherTaskPlan.industryPlanId,
  },
  assertions: {
    publicMarketOnly: true,
    manualSupplements: 0,
    authorizedImports: 0,
    allSixSkincareModulesComplete: skincareModuleResults.moduleResults.every(
      (module) => module.status === "complete",
    ),
    everyDirectClaimEligibleAndTraceable: directEntries.every(
      (entry) =>
        entry.status === "eligible" &&
        entry.evidenceIds.length > 0 &&
        entry.rawDocumentIds.length > 0 &&
        entry.quotes.length > 0,
    ),
    everyOpportunityIsUnverifiedHypothesis: opportunityEntries.every(
      (entry) =>
        entry.kind === "hypothesis" &&
        entry.validationPlan.length > 0 &&
        entry.status === "eligible",
    ),
    commercializationAssessmentRequiresRealWorldValidation:
      skincareBundle.decisionGuidance.commercializationAssessment ===
      "requires_real_world_validation",
    commercializationStopConclusionProduced: forbiddenCommercialConclusion.test(
      skincareBundle.reportMarkdown,
    ),
    dishwasherReplayExact:
      dishwasherReplayJson === dishwasherExpectedReportJson &&
      dishwasherReplayMarkdown === dishwasherExpectedMarkdown,
    crossCategoryContaminationDetected:
      /洗碗机/.test(skincareBundle.reportMarkdown) ||
      /护肤|化妆品/.test(dishwasherReplayMarkdown),
    livePublicRequests: 0,
    liveProviderCalls: 0,
    llmRequests: 0,
    externalMessages: 0,
    productionWrite: false,
  },
};

if (
  audit.skincare.directConfirmedClaims !== 33 ||
  audit.skincare.eligibleLedgerEntries !== 36 ||
  audit.skincare.inferenceCount !== 1 ||
  audit.skincare.opportunityHypothesisCount !== 2 ||
  audit.skincare.evidenceAppendixEntries !== 33 ||
  audit.assertions.allSixSkincareModulesComplete !== true ||
  audit.assertions.everyDirectClaimEligibleAndTraceable !== true ||
  audit.assertions.everyOpportunityIsUnverifiedHypothesis !== true ||
  audit.assertions.commercializationAssessmentRequiresRealWorldValidation !==
    true ||
  audit.assertions.commercializationStopConclusionProduced !== false ||
  audit.assertions.dishwasherReplayExact !== true ||
  audit.assertions.crossCategoryContaminationDetected !== false ||
  audit.dishwasherReplay.priorReviewHashesMatch !== true ||
  dishwasherReview.deterministicReplay.expectedHashesMatched !== true ||
  dishwasherReview.decisionBoundary.commercializationDecisionProduced !==
    false ||
  dishwasherReview.decisionBoundary.realUserValidationCompleted !== false
) {
  throw new Error("m4_4_synthesis_replay_gate_failed");
}

await Promise.all([
  writeTextAtomic(
    join(outputDir, "claim-ledger.json"),
    serializeIndustryClaimLedger(skincareBundle.claimLedger),
  ),
  writeTextAtomic(
    join(outputDir, "knowledge-map.json"),
    serializeIndustryKnowledgeMap(skincareBundle.knowledgeMap),
  ),
  writeTextAtomic(
    join(outputDir, "report-bundle.json"),
    `${JSON.stringify(skincareBundle, null, 2)}\n`,
  ),
  writeTextAtomic(
    join(outputDir, "skincare-industry-report.md"),
    skincareBundle.reportMarkdown,
  ),
  writeTextAtomic(
    join(outputDir, "dishwasher-replay", "graded_report.json"),
    dishwasherReplayJson,
  ),
  writeTextAtomic(
    join(outputDir, "dishwasher-replay", "report.md"),
    dishwasherReplayMarkdown,
  ),
  writeTextAtomic(
    join(outputDir, "compatibility-audit.json"),
    `${JSON.stringify(audit, null, 2)}\n`,
  ),
]);

console.log(
  JSON.stringify(
    {
      status: audit.status,
      skincare: audit.skincare,
      dishwasherReplay: audit.dishwasherReplay,
      compatibility: audit.compatibility,
      assertions: audit.assertions,
      outputDir,
    },
    null,
    2,
  ),
);
