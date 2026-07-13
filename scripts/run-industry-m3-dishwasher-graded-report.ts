import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createIndustryAcquisitionTaskPlan,
  createIndustryGradedReport,
  createIndustryPlan,
  dishwasherIndustryPlanningFixture,
  type IndustryAtomicClaimsArtifact,
  type IndustryM2WaveVerification,
  type IndustryOpportunityHypothesesArtifact,
  serializeIndustryGradedReport,
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

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

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
const m2VerificationPath = resolve(
  argumentValue("m2-verification") ??
    join(
      "outputs",
      "industry-data-report-loop",
      "m2.4",
      "dishwasher-m2-4-targeted-wave-3-2026-07-13T13-38-53-478Z",
      "verification.json",
    ),
);
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m3.3", "dishwasher"),
);
const [atomicClaims, hypotheses, m2Verification] = await Promise.all([
  readJson<IndustryAtomicClaimsArtifact>(atomicClaimsPath),
  readJson<IndustryOpportunityHypothesesArtifact>(hypothesesPath),
  readJson<IndustryM2WaveVerification>(m2VerificationPath),
]);
const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
const report = createIndustryGradedReport({
  runId: "dishwasher-m3-3-graded-report",
  category: "洗碗机",
  atomicClaims,
  hypotheses,
  m2Verification,
  taskPlan,
});
await Promise.all([
  writeTextAtomic(
    join(outputDir, "graded_report.json"),
    serializeIndustryGradedReport(report),
  ),
  writeTextAtomic(join(outputDir, "report.md"), report.reportMarkdown),
  writeTextAtomic(
    join(outputDir, "run_audit.json"),
    `${JSON.stringify(
      {
        schemaVersion: "industry_m3_3_graded_report_audit.v1",
        artifactType: "industry-m3-3-graded-report-audit",
        inputs: { atomicClaimsPath, hypothesesPath, m2VerificationPath },
        outputDir,
        status: report.status,
        evidenceGrade: report.evidenceGrade,
        counts: {
          confirmedFacts: report.confirmedFacts.length,
          unverifiedHypotheses: report.unverifiedHypotheses.length,
          coverageRows: report.coverage.totalRows,
          coverageGaps: report.coverage.gapRows,
          rejectedSources: report.rejectedSources.length,
        },
        decisionBoundary: report.decisionBoundary,
        assertions: report.assertions,
      },
      null,
      2,
    )}\n`,
  ),
]);
console.log(
  JSON.stringify(
    {
      status: "ok",
      reportStatus: report.status,
      evidenceGrade: report.evidenceGrade,
      confirmedFacts: report.confirmedFacts.length,
      unverifiedHypotheses: report.unverifiedHypotheses.length,
      coverage: `${report.coverage.passedRows}/${report.coverage.totalRows}`,
      criticalCoverage: `${report.coverage.criticalRowsPassed}/${report.coverage.criticalRows}`,
      coverageGaps: report.coverage.gapRows,
      rejectedSources: report.rejectedSources.length,
      conclusion: report.decisionBoundary.conclusion,
      outputDir,
    },
    null,
    2,
  ),
);
