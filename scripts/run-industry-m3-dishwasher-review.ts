import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createIndustryM3ReportReview,
  type IndustryAtomicClaimsArtifact,
  type IndustryGradedReportArtifact,
  type IndustryM2WaveRawDocumentInput,
  type IndustryM2WaveVerification,
  type IndustryOpportunityHypothesesArtifact,
  type IndustryRawDocumentStore,
  serializeIndustryM3ReportReview,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

const m2RunDir = resolve(
  argumentValue("m2-run") ??
    join(
      "outputs",
      "industry-data-report-loop",
      "m2.4",
      "dishwasher-m2-4-targeted-wave-3-2026-07-13T13-38-53-478Z",
    ),
);
const reportPath = resolve(
  argumentValue("report") ??
    join(
      "outputs",
      "industry-data-report-loop",
      "m3.3",
      "dishwasher",
      "graded_report.json",
    ),
);
const atomicClaimsPath = resolve(
  argumentValue("atomic-claims") ??
    join(
      "outputs",
      "industry-data-report-loop",
      "m3.1",
      "dishwasher",
      "atomic_claims.json",
    ),
);
const hypothesesPath = resolve(
  argumentValue("hypotheses") ??
    join(
      "outputs",
      "industry-data-report-loop",
      "m3.2",
      "dishwasher",
      "opportunity_hypotheses.json",
    ),
);
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m3.4", "dishwasher"),
);

const [
  report,
  atomicClaims,
  hypotheses,
  rawDocuments,
  rawStore,
  m2Verification,
] = await Promise.all([
  readJson<IndustryGradedReportArtifact>(reportPath),
  readJson<IndustryAtomicClaimsArtifact>(atomicClaimsPath),
  readJson<IndustryOpportunityHypothesesArtifact>(hypothesesPath),
  readJson<IndustryM2WaveRawDocumentInput[]>(
    join(m2RunDir, "raw_documents.json"),
  ),
  readJson<IndustryRawDocumentStore>(
    join(m2RunDir, "immutable_raw_store.json"),
  ),
  readJson<IndustryM2WaveVerification>(join(m2RunDir, "verification.json")),
]);

const review = await createIndustryM3ReportReview({
  runId: "dishwasher-m3-4-local-review",
  report,
  atomicClaims,
  hypotheses,
  rawDocuments,
  rawStore,
  m2Verification,
  expectedHashes: {
    gradedReportJsonSha256:
      "sha256:21b255295ec63b3756925995eee42881c598a7e283957b1b43aa224365b28603",
    reportMarkdownSha256:
      "sha256:5dc72ea937ce71958e90bdf2893b83c6ae225be9c6599d7ded98711a56709ed7",
  },
});

await Promise.all([
  writeTextAtomic(
    join(outputDir, "review.json"),
    serializeIndustryM3ReportReview(review),
  ),
  writeTextAtomic(
    join(outputDir, "run_audit.json"),
    `${JSON.stringify(
      {
        schemaVersion: "industry_m3_4_run_audit.v1",
        artifactType: "industry-m3-4-run-audit",
        reportPath,
        atomicClaimsPath,
        hypothesesPath,
        m2RunDir,
        outputDir,
        status: review.status,
        reviewOperator: review.reviewOperator,
        sourceChainAudit: review.sourceChainAudit,
        reportContractAudit: review.reportContractAudit,
        readabilityAudit: review.readabilityAudit,
        deterministicReplay: review.deterministicReplay,
        decisionBoundary: review.decisionBoundary,
        assertions: review.assertions,
      },
      null,
      2,
    )}\n`,
  ),
]);

console.log(
  JSON.stringify(
    {
      status: review.status,
      representativeSpotChecks: review.representativeSpotChecks.map(
        (spotCheck) => spotCheck.claimId,
      ),
      auditedClaims: review.sourceChainAudit.auditedClaimCount,
      reportContractAudit: review.reportContractAudit,
      readabilityAudit: review.readabilityAudit,
      decisionBoundary: review.decisionBoundary,
      outputDir,
    },
    null,
    2,
  ),
);
