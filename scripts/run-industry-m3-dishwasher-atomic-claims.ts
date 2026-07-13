import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createIndustryAcquisitionTaskPlan,
  createIndustryAtomicClaimsArtifact,
  createIndustryPlan,
  dishwasherIndustryPlanningFixture,
  type IndustryAcquisitionRoute,
  type IndustryAtomicClaimCandidate,
  type IndustryM2WaveRawDocumentInput,
  type IndustryM2WaveVerification,
  type IndustryRawDocumentStore,
  serializeIndustryAtomicClaimsArtifact,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function writeTextAtomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

async function writeJsonAtomic(path: string, value: unknown) {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

const m2RunDir = resolve(
  argumentValue("m2-run-dir") ??
    (() => {
      throw new Error("m3_1_atomic_claims_requires_m2_run_dir");
    })(),
);
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m3.1", "dishwasher"),
);
const [rawDocuments, routes, rawStore, verification] = await Promise.all([
  readFile(join(m2RunDir, "raw_documents.json"), "utf8").then(
    (value) => JSON.parse(value) as IndustryM2WaveRawDocumentInput[],
  ),
  readFile(join(m2RunDir, "routes.json"), "utf8").then(
    (value) => JSON.parse(value) as IndustryAcquisitionRoute[],
  ),
  readFile(join(m2RunDir, "immutable_raw_store.json"), "utf8").then(
    (value) => JSON.parse(value) as IndustryRawDocumentStore,
  ),
  readFile(join(m2RunDir, "verification.json"), "utf8").then(
    (value) => JSON.parse(value) as IndustryM2WaveVerification,
  ),
]);
const marketUrl = "https://news.cheaa.com/2025/0228/644742.shtml";
const marketQuote =
  "据奥维云网数据显示，2024年我国洗碗机市场零售量规模达到229万台，同比增长18.0%，零售额规模突破132亿元，同比增长17.2%。";
const standardUrl =
  "https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=3270E61B15F6ED5C5AA3FFA0699612D8";
const taxonomyUrl = "https://www.fotile.com/product/5510.html";
const taxonomyQuote = "水槽洗碗机\n嵌入式洗碗机\n台嵌洗碗机";
const candidates: IndustryAtomicClaimCandidate[] = [
  {
    candidateId: "dishwasher-market-volume-2024",
    statement: "2024年我国洗碗机市场零售量规模达到229万台，同比增长18.0%",
    claimRole: "market_size_growth",
    sourceUrl: marketUrl,
    quote: marketQuote,
  },
  {
    candidateId: "dishwasher-market-value-2024",
    statement: "零售额规模突破132亿元，同比增长17.2%",
    claimRole: "market_size_growth",
    sourceUrl: marketUrl,
    quote: marketQuote,
  },
  {
    candidateId: "dishwasher-standard-number",
    statement: "标准号：GB 38383-2019",
    claimRole: "regulation_standard",
    sourceUrl: standardUrl,
    quote: "标准号：GB 38383-2019 |",
  },
  {
    candidateId: "dishwasher-standard-name",
    statement: "中文标准名称： 洗碗机能效水效限定值及等级",
    claimRole: "regulation_standard",
    sourceUrl: standardUrl,
    quote: "| 中文标准名称： 洗碗机能效水效限定值及等级 | |",
  },
  ...["水槽洗碗机", "嵌入式洗碗机", "台嵌洗碗机"].map((statement, index) => ({
    candidateId: `fotile-dishwasher-taxonomy-${index + 1}`,
    statement,
    claimRole: "brand_positioning_product" as const,
    sourceUrl: taxonomyUrl,
    quote: taxonomyQuote,
  })),
];
const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
const artifact = await createIndustryAtomicClaimsArtifact({
  runId: "dishwasher-m3-1-atomic-claims",
  category: "洗碗机",
  candidates,
  rawDocuments,
  routes,
  rawStore,
  verification,
  taskPlan,
});
const audit = {
  schemaVersion: "industry_m3_1_atomic_claims_audit.v1",
  artifactType: "industry-m3-1-atomic-claims-audit",
  sourceM2RunDir: m2RunDir,
  outputDir,
  summary: artifact.summary,
  rejectedCandidates: artifact.rejectedCandidates,
  excludedM2Documents: artifact.excludedM2Documents,
  assertions: artifact.assertions,
};
await Promise.all([
  writeTextAtomic(
    join(outputDir, "atomic_claims.json"),
    serializeIndustryAtomicClaimsArtifact(artifact),
  ),
  writeJsonAtomic(join(outputDir, "run_audit.json"), audit),
]);
console.log(
  JSON.stringify(
    {
      status:
        artifact.rejectedCandidates.length === 0 && artifact.claims.length > 0
          ? "ok"
          : "failed",
      ...artifact.summary,
      outputDir,
    },
    null,
    2,
  ),
);
if (artifact.rejectedCandidates.length > 0 || artifact.claims.length === 0) {
  throw new Error("m3_1_atomic_claim_generation_failed_closed");
}
