import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createIndustryPlan,
  createIndustrySourceCandidatePlan,
  type IndustryPlanningInput,
  type IndustrySourceCandidateInput,
  serializeIndustrySourceCandidatePlan,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

type CandidateFixture = {
  schemaVersion: "industry_source_candidate_fixture.v1";
  fixtureStatus: "audited_public_seeds_not_evidence";
  candidates: Array<Omit<IndustrySourceCandidateInput, "access">>;
};

const planningInputPath = resolve(
  argumentValue("input") ?? "fixtures/industry-planner/skincare-input.json",
);
const candidateFixturePath = resolve(
  argumentValue("candidates") ??
    "fixtures/industry-source-candidates/skincare-official-seeds.json",
);
const outputPath = resolve(
  argumentValue("output") ??
    "outputs/industry-source-candidate-plans/skincare/source-candidate-plan.json",
);

const planningInput = JSON.parse(
  await readFile(planningInputPath, "utf8"),
) as IndustryPlanningInput;
const fixture = JSON.parse(
  await readFile(candidateFixturePath, "utf8"),
) as CandidateFixture;
if (
  fixture.schemaVersion !== "industry_source_candidate_fixture.v1" ||
  fixture.fixtureStatus !== "audited_public_seeds_not_evidence"
) {
  throw new Error("industry_source_candidate_fixture_invalid");
}

const publicAccess = {
  loginRequired: false,
  cookieRequired: false,
  apiKeyRequired: false,
  creditsRequired: false,
  paywallExpected: false,
  captchaExpected: false,
  privateDataExpected: false,
};
const industryPlan = createIndustryPlan(planningInput);
const plan = createIndustrySourceCandidatePlan({
  industryPlan,
  candidateInputs: fixture.candidates.map((candidate) => ({
    ...candidate,
    access: publicAccess,
  })),
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serializeIndustrySourceCandidatePlan(plan), "utf8");

console.log(
  JSON.stringify(
    {
      status: "ok",
      artifactType: plan.artifactType,
      schemaVersion: plan.schemaVersion,
      planId: plan.planId,
      candidateCount: plan.candidates.length,
      eligibleCandidateCount: plan.candidates.filter(
        (candidate) => candidate.status === "eligible_candidate",
      ).length,
      blockedCandidateGapCount: plan.coverageRowCandidateCoverage.filter(
        (coverage) => coverage.status === "blocked_candidate_gap",
      ).length,
      livePublicRequestsUsed: plan.budgetUsage.livePublicRequestsUsed,
      providerCallsUsed: plan.budgetUsage.providerCallsUsed,
      creditsUsed: plan.budgetUsage.creditsUsed,
      outputPath,
    },
    null,
    2,
  ),
);
