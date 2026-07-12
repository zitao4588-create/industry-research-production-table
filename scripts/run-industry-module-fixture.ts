import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createIndustryModuleResultsArtifact,
  createSkincareModuleContractFixture,
  industryResearchModuleOrder,
  serializeIndustryModuleResultsArtifact,
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
  argumentValue("output") ?? "outputs/industry-module-results/skincare",
);
const fixtures = industryResearchModuleOrder.map((moduleId) => ({
  moduleId,
  fixture: createSkincareModuleContractFixture(moduleId),
}));
const shared = fixtures[0]?.fixture;
if (!shared) throw new Error("g7_contract_fixture_missing");
const artifact = createIndustryModuleResultsArtifact({
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

await mkdir(outputDir, { recursive: true });
await writeFile(
  join(outputDir, "module-results.json"),
  serializeIndustryModuleResultsArtifact(artifact),
  "utf8",
);

console.log(
  JSON.stringify(
    {
      status: "ok",
      schemaVersion: artifact.schemaVersion,
      moduleOrder: artifact.moduleOrder,
      moduleStatuses: artifact.moduleResults.map((result) => ({
        moduleId: result.moduleId,
        status: result.status,
        claimCount: result.claims.length,
        coverageRows: result.coverage.length,
      })),
      blockedModuleIds: artifact.blockedModuleIds,
      synthesisAllowed: artifact.assertions.synthesisAllowed,
      contractFixtureTreatedAsExternalFact:
        artifact.assertions.contractFixtureTreatedAsExternalFact,
      liveProviderCalls: artifact.assertions.liveProviderCalls,
      outputDir,
    },
    null,
    2,
  ),
);
