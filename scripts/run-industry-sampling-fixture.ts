import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createIndustryPlan,
  createIndustryRepresentativeSamplePlan,
  createSkincareSamplingContractFixture,
  type IndustryPlanningInput,
  type IndustrySourceCandidatePlan,
  serializeIndustryRepresentativeSamplePlan,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const planningInputPath = resolve(
  argumentValue("input") ?? "fixtures/industry-planner/skincare-input.json",
);
const officialSourcePlanPath = resolve(
  argumentValue("sources") ??
    "outputs/industry-source-candidate-plans/skincare/source-candidate-plan.json",
);
const outputDir = resolve(
  argumentValue("output") ?? "outputs/industry-sampling/skincare",
);
const planningInput = JSON.parse(
  await readFile(planningInputPath, "utf8"),
) as IndustryPlanningInput;
const industryPlan = createIndustryPlan(planningInput);
const officialSourcePlan = JSON.parse(
  await readFile(officialSourcePlanPath, "utf8"),
) as IndustrySourceCandidatePlan;
const officialOnlyPlan = createIndustryRepresentativeSamplePlan({
  industryPlan,
  sourceCandidatePlan: officialSourcePlan,
  samplingCandidates: [],
});
const contractFixture = createSkincareSamplingContractFixture(industryPlan);
const contractFixturePlan = createIndustryRepresentativeSamplePlan({
  industryPlan,
  sourceCandidatePlan: contractFixture.sourceCandidatePlan,
  samplingCandidates: contractFixture.samplingCandidates,
});

await mkdir(outputDir, { recursive: true });
await writeFile(
  join(outputDir, "official-only-sample-plan.json"),
  serializeIndustryRepresentativeSamplePlan(officialOnlyPlan),
  "utf8",
);
await writeFile(
  join(outputDir, "contract-fixture-sample-plan.json"),
  serializeIndustryRepresentativeSamplePlan(contractFixturePlan),
  "utf8",
);

console.log(
  JSON.stringify(
    {
      status: "ok",
      schemaVersion: contractFixturePlan.schemaVersion,
      officialOnly: {
        selectedSamples: officialOnlyPlan.selectedSamples.length,
        coverageGate: officialOnlyPlan.coverageGate.status,
        nextStageAllowed: officialOnlyPlan.nextStageAllowed,
      },
      contractFixture: {
        selectedSamples: contractFixturePlan.selectedSamples.length,
        competitorSamples: contractFixturePlan.competitorSampleIds.length,
        analogySamples: contractFixturePlan.analogySampleIds.length,
        coverageGate: contractFixturePlan.coverageGate.status,
        nextStageAllowed: contractFixturePlan.nextStageAllowed,
        synthesisAllowed: contractFixturePlan.assertions.synthesisAllowed,
      },
      liveProviderCalls: contractFixturePlan.assertions.liveProviderCalls,
      outputDir,
    },
    null,
    2,
  ),
);
