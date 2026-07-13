import { readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createIndustryAcquisitionTaskPlan,
  createIndustryPlan,
  dishwasherIndustryPlanningFixture,
  type IndustryAcquisitionRoute,
  type IndustryM2WaveRawDocumentInput,
  serializeIndustryM2WaveVerification,
  verifyIndustryM2Wave,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const runDir = resolve(
  argumentValue("run-dir") ??
    (() => {
      throw new Error("m2_wave_verifier_requires_run_dir");
    })(),
);
const input = JSON.parse(
  await readFile(join(runDir, "input.json"), "utf8"),
) as {
  runId: string;
};
const rawDocuments = JSON.parse(
  await readFile(join(runDir, "raw_documents.json"), "utf8"),
) as IndustryM2WaveRawDocumentInput[];
const normalizedRawDocuments = rawDocuments.map((document, index) => ({
  ...document,
  id: `m2-raw-candidate-${index + 1}`,
}));
const routes = JSON.parse(
  await readFile(join(runDir, "routes.json"), "utf8"),
) as IndustryAcquisitionRoute[];
const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
const verification = verifyIndustryM2Wave({
  runId: input.runId,
  category: "洗碗机",
  categoryTerms: ["洗碗机", "洗碟机", "dishwasher"],
  conflictingCategoryTerms: [
    "洗地机",
    "空调",
    "air_conditioner",
    "air-conditioner",
    "冰箱",
    "洗衣机",
  ],
  rawDocuments: normalizedRawDocuments,
  routes,
  taskPlan,
});
const outputPath = join(runDir, "verification.json");
const temporaryPath = `${outputPath}.tmp`;
await writeFile(
  temporaryPath,
  serializeIndustryM2WaveVerification(verification),
  "utf8",
);
await rename(temporaryPath, outputPath);

try {
  const auditPath = join(runDir, "run_audit.json");
  const audit = JSON.parse(await readFile(auditPath, "utf8")) as Record<
    string,
    unknown
  >;
  const auditTemporaryPath = `${auditPath}.tmp`;
  await writeFile(
    auditTemporaryPath,
    `${JSON.stringify(
      {
        ...audit,
        verification: verification.summary,
        verificationDecision: verification.decision,
        offlineReverifiedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await rename(auditTemporaryPath, auditPath);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      ...verification.summary,
      recommendedNextSourceRoles: verification.recommendedNextSourceRoles,
      decision: verification.decision,
      outputPath,
    },
    null,
    2,
  ),
);
