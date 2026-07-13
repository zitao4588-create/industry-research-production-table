import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createIndustryAcquisitionTaskPlan,
  createIndustryPlan,
  type IndustryPlanningInput,
  serializeIndustryAcquisitionTaskPlan,
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
  argumentValue("input") ?? "fixtures/industry-planner/dishwasher-input.json",
);
const outputPath = resolve(
  argumentValue("output") ??
    "outputs/industry-acquisition-plans/dishwasher/industry-acquisition-task-plan.json",
);

const input = JSON.parse(
  await readFile(inputPath, "utf8"),
) as IndustryPlanningInput;
const industryPlan = createIndustryPlan(input);
const acquisitionPlan = createIndustryAcquisitionTaskPlan(industryPlan);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  serializeIndustryAcquisitionTaskPlan(acquisitionPlan),
  "utf8",
);

console.log(
  JSON.stringify(
    {
      status: "ok",
      artifactType: acquisitionPlan.artifactType,
      schemaVersion: acquisitionPlan.schemaVersion,
      planId: acquisitionPlan.planId,
      industry: industryPlan.inputCoordinates.industry,
      taskCount: acquisitionPlan.summary.taskCount,
      criticalTaskCount: acquisitionPlan.summary.criticalTaskCount,
      highPriorityTaskCount: acquisitionPlan.summary.highPriorityTaskCount,
      liveProviderCalls: acquisitionPlan.assertions.liveProviderCalls,
      livePublicRequests: acquisitionPlan.assertions.livePublicRequests,
      externalFactsProduced: acquisitionPlan.assertions.externalFactsProduced,
      outputPath,
    },
    null,
    2,
  ),
);
