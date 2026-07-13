import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createIndustryAcquisitionRoute,
  createIndustryAcquisitionTaskPlan,
  createIndustryPlan,
  createIndustryRawDocumentStore,
  dishwasherIndustryPlanningFixture,
  putIndustryRawDocument,
  serializeIndustryRawDocumentStore,
} from "../packages/industry-research/src/index.ts";

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outputPath = resolve(
  argumentValue("output") ??
    "outputs/industry-raw-document-stores/dishwasher/fixture-store.json",
);
const task = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
).tasks[0];
if (!task) throw new Error("dishwasher_acquisition_task_fixture_missing");

function route(targetKind: "public_page" | "sitemap", targetReference: string) {
  return createIndustryAcquisitionRoute({
    task,
    sourceRole: task.allowedSourceRoles[0] ?? "government_statistics",
    targetKind,
    targetReference,
    access: {
      requiresLogin: false,
      requiresCookie: false,
      requiresCaptcha: false,
      isPaywalled: false,
      containsPrivateData: false,
    },
  });
}

const zeroUsage = {
  publicRequestsUsed: 0,
  providerRequestsUsed: 0,
  creditsUsed: 0,
  costYuan: 0,
};
let store = createIndustryRawDocumentStore("dishwasher-m2-offline-fixture");
const outcomes: string[] = [];

for (const input of [
  {
    route: route("public_page", "https://example.com/dishwashers"),
    originalUrl:
      "https://www.example.com/dishwashers/?utm_source=fixture#models",
    capturedAt: "2026-07-13T11:00:00.000Z",
    mediaType: "text/html",
    httpStatus: 200,
    originalContent: "离线样例：洗碗机产品页面第一版。",
    collectionMethod: "offline_fixture" as const,
    usage: zeroUsage,
  },
  {
    route: route("public_page", "https://example.com/dishwashers"),
    originalUrl: "https://example.com/dishwashers",
    capturedAt: "2026-07-13T11:01:00.000Z",
    mediaType: "text/html",
    httpStatus: 200,
    originalContent: "离线样例：洗碗机产品页面第一版。",
    collectionMethod: "offline_fixture" as const,
    usage: zeroUsage,
  },
  {
    route: route("public_page", "https://example.com/dishwashers"),
    originalUrl: "https://example.com/dishwashers",
    capturedAt: "2026-07-13T11:02:00.000Z",
    mediaType: "text/html",
    httpStatus: 200,
    originalContent: "离线样例：洗碗机产品页面第二版，保留第一版。",
    collectionMethod: "offline_fixture" as const,
    usage: zeroUsage,
  },
  {
    route: route("sitemap", "https://example.com/sitemap.xml"),
    originalUrl: "https://example.com/sitemap.xml",
    capturedAt: "2026-07-13T11:03:00.000Z",
    mediaType: "application/xml",
    httpStatus: 200,
    originalContent:
      "<urlset><url><loc>https://example.com/dishwashers</loc></url></urlset>",
    collectionMethod: "offline_fixture" as const,
    usage: zeroUsage,
  },
]) {
  const result = await putIndustryRawDocument(store, input);
  store = result.store;
  outcomes.push(result.outcome);
}

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(
  temporaryPath,
  await serializeIndustryRawDocumentStore(store),
  "utf8",
);
await rename(temporaryPath, outputPath);

console.log(
  JSON.stringify(
    {
      status: "ok",
      storeId: store.storeId,
      outcomes,
      ...store.summary,
      rawDocumentsAreNotEvidence: store.assertions.rawDocumentsAreNotEvidence,
      outputPath,
    },
    null,
    2,
  ),
);
