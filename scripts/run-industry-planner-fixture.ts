import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createIndustryPlan,
  type IndustryPlanningInput,
  serializeIndustryPlan,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputPath = resolve(
  argumentValue("input") ?? "fixtures/industry-planner/skincare-input.json",
);
const outputPath = resolve(
  argumentValue("output") ??
    "outputs/industry-plans/skincare/industry-plan.json",
);

const input = JSON.parse(
  await readFile(inputPath, "utf8"),
) as IndustryPlanningInput;
const plan = createIndustryPlan(input);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serializeIndustryPlan(plan), "utf8");

console.log(
  JSON.stringify(
    {
      status: "ok",
      artifactType: plan.artifactType,
      schemaVersion: plan.schemaVersion,
      plannerStatus: plan.plannerStatus,
      planId: plan.planId,
      industry: plan.inputCoordinates.industry,
      moduleCount: plan.researchModules.length,
      coverageRowCount: plan.coverageMatrix.length,
      evidenceGapCount: plan.evidenceGaps.length,
      liveProviderCalls: plan.budget.liveProviderCalls,
      livePublicRequests: plan.budget.livePublicRequests,
      outputPath,
    },
    null,
    2,
  ),
);
