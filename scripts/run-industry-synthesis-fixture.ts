import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createIndustryModuleResultsArtifact,
  createIndustryReportBundle,
  createSkincareModuleContractFixture,
  createSkincareSynthesisContractClaims,
  industryResearchModuleOrder,
  serializeIndustryClaimLedger,
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

const outputDir = resolve(
  argumentValue("output") ?? "outputs/industry-synthesis/skincare",
);
const fixtures = industryResearchModuleOrder.map((moduleId) => ({
  moduleId,
  fixture: createSkincareModuleContractFixture(moduleId),
}));
const shared = fixtures[0]?.fixture;
if (!shared) throw new Error("g8_contract_fixture_missing");
const moduleResults = createIndustryModuleResultsArtifact({
  industryPlan: shared.industryPlan,
  representativeSamplePlan: shared.representativeSamplePlan,
  moduleInputs: fixtures.map(({ moduleId, fixture }) => ({
    moduleId,
    claimInputs: fixture.claimInputs,
    sources: fixture.sources,
    rawDocuments: fixture.rawDocuments,
    evidence: fixture.evidence,
  })),
});
const bundle = createIndustryReportBundle({
  moduleResults,
  evidenceMode: "contract_fixture",
  synthesisClaims: createSkincareSynthesisContractClaims(),
});

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(
    join(outputDir, "claim-ledger.json"),
    serializeIndustryClaimLedger(bundle.claimLedger),
    "utf8",
  ),
  writeFile(
    join(outputDir, "industry-report.md"),
    bundle.reportMarkdown,
    "utf8",
  ),
  writeFile(
    join(outputDir, "knowledge-map.json"),
    serializeIndustryKnowledgeMap(bundle.knowledgeMap),
    "utf8",
  ),
  writeFile(
    join(outputDir, "report-bundle.json"),
    `${JSON.stringify(bundle, null, 2)}\n`,
    "utf8",
  ),
]);

console.log(
  JSON.stringify(
    {
      status: "ok",
      schemaVersion: bundle.schemaVersion,
      chapters: bundle.chapters.length,
      claimCounts: bundle.claimLedger.counts,
      eligibleExternalClaims: bundle.claimLedger.entries.filter(
        (entry) => entry.externalFactEligible,
      ).length,
      blockedChapters: bundle.chapters
        .filter((chapter) => chapter.status === "blocked")
        .map((chapter) => chapter.id),
      knowledgeMap: {
        nodes: bundle.knowledgeMap.nodes.length,
        edges: bundle.knowledgeMap.edges.length,
      },
      compatibility: bundle.compatibility,
      liveProviderCalls: bundle.claimLedger.assertions.liveProviderCalls,
      outputDir,
    },
    null,
    2,
  ),
);
