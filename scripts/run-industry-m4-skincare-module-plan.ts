import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createIndustryM4ModuleAcquisitionPlan,
  type IndustryPlanningInput,
  serializeIndustryM4ModuleAcquisitionPlan,
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

const inputPath = resolve(
  argumentValue("input") ??
    join("fixtures", "industry-planner", "skincare-input.json"),
);
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m4.1", "skincare"),
);
const planningInput = JSON.parse(
  await readFile(inputPath, "utf8"),
) as IndustryPlanningInput;
const artifact = createIndustryM4ModuleAcquisitionPlan({
  runId: "skincare-m4-1-six-module-plan",
  planningInput,
  scopeLevel: "broad_industry",
});

await Promise.all([
  writeTextAtomic(
    join(outputDir, "module_acquisition_plan.json"),
    serializeIndustryM4ModuleAcquisitionPlan(artifact),
  ),
  writeTextAtomic(
    join(outputDir, "run_audit.json"),
    `${JSON.stringify(
      {
        schemaVersion: "industry_m4_1_run_audit.v1",
        artifactType: "industry-m4-1-run-audit",
        inputPath,
        outputDir,
        inputScope: artifact.inputScope,
        summary: artifact.summary,
        moduleTaskGroups: artifact.moduleTaskGroups,
        assertions: artifact.assertions,
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
      inputScope: artifact.inputScope,
      summary: artifact.summary,
      modules: artifact.moduleTaskGroups.map((group) => ({
        moduleId: group.moduleId,
        taskCount: group.taskIds.length,
      })),
      outputDir,
    },
    null,
    2,
  ),
);
