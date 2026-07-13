import { describe, expect, it } from "vitest";
import { createIndustryAcquisitionTaskPlan, createIndustryPlan } from "./index";
import { createIndustryAcquisitionRoute } from "./industry-acquisition-router";
import { dishwasherIndustryPlanningFixture } from "./industry-planner-fixtures";
import {
  assertIndustryRawDocumentStore,
  canonicalizeIndustryRawDocumentUrl,
  createIndustryRawDocumentStore,
  putIndustryRawDocument,
  serializeIndustryRawDocumentStore,
  sha256IndustryContent,
} from "./industry-raw-document-store";

const task = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
).tasks[0];
if (!task) throw new Error("dishwasher_acquisition_task_fixture_missing");

const route = createIndustryAcquisitionRoute({
  task,
  sourceRole: task.allowedSourceRoles[0] ?? "government_statistics",
  targetKind: "public_page",
  targetReference: "https://example.com/dishwashers",
  access: {
    requiresLogin: false,
    requiresCookie: false,
    requiresCaptcha: false,
    isPaywalled: false,
    containsPrivateData: false,
  },
});

function rawInput(
  originalContent: string,
  overrides: Partial<Parameters<typeof putIndustryRawDocument>[1]> = {},
): Parameters<typeof putIndustryRawDocument>[1] {
  return {
    route,
    originalUrl: "https://www.example.com/dishwashers/?utm_source=test#models",
    capturedAt: "2026-07-13T11:00:00.000Z",
    mediaType: "text/html",
    httpStatus: 200,
    originalContent,
    collectionMethod: "offline_fixture",
    usage: {
      publicRequestsUsed: 0,
      providerRequestsUsed: 0,
      creditsUsed: 0,
      costYuan: 0,
    },
    ...overrides,
  };
}

describe("industry raw document store", () => {
  it("computes a real SHA-256 digest and canonicalizes tracking URLs", async () => {
    expect(await sha256IndustryContent("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      canonicalizeIndustryRawDocumentUrl(
        "https://www.Example.com/a//b/?utm_source=x&b=2&a=1#top",
      ),
    ).toBe("https://example.com/a/b?a=1&b=2");
  });

  it("stores once and deduplicates the same canonical URL and content", async () => {
    const empty = createIndustryRawDocumentStore("dishwasher-m2-fixture");
    const first = await putIndustryRawDocument(empty, rawInput("version one"));
    const duplicate = await putIndustryRawDocument(
      first.store,
      rawInput("version one", {
        originalUrl: "https://example.com/dishwashers",
        capturedAt: "2026-07-13T11:05:00.000Z",
      }),
    );

    expect(first.outcome).toBe("stored_new_document");
    expect(duplicate.outcome).toBe("deduplicated");
    expect(duplicate.store).toBe(first.store);
    expect(duplicate.store.documents).toHaveLength(1);
    expect(duplicate.store.auditEvents).toHaveLength(1);
  });

  it("retains old content when the same page changes", async () => {
    const first = await putIndustryRawDocument(
      createIndustryRawDocumentStore("dishwasher-m2-fixture"),
      rawInput("version one"),
    );
    const second = await putIndustryRawDocument(
      first.store,
      rawInput("version two", { capturedAt: "2026-07-13T11:10:00.000Z" }),
    );

    expect(second.outcome).toBe("stored_new_version");
    expect(
      second.store.documents.map((document) => document.originalContent),
    ).toEqual(["version one", "version two"]);
    expect(second.store.documents[1]?.supersedesDocumentId).toBe(
      second.store.documents[0]?.documentId,
    );
    expect(second.store.summary.versionedDocumentCount).toBe(1);
  });

  it("detects mutation of a stored immutable snapshot", async () => {
    const result = await putIndustryRawDocument(
      createIndustryRawDocumentStore("dishwasher-m2-fixture"),
      rawInput("original"),
    );
    const tampered = structuredClone(result.store);
    if (!tampered.documents[0]) throw new Error("stored_document_missing");
    tampered.documents[0].originalContent = "silently changed";
    await expect(assertIndustryRawDocumentStore(tampered)).rejects.toThrow(
      "immutable_raw_document_tampered",
    );
  });

  it("rejects blocked routes and non-zero offline usage", async () => {
    const blockedRoute = createIndustryAcquisitionRoute({
      task,
      sourceRole: task.allowedSourceRoles[0] ?? "government_statistics",
      targetKind: "public_page",
      targetReference: "http://127.0.0.1/private",
      access: {
        requiresLogin: false,
        requiresCookie: false,
        requiresCaptcha: false,
        isPaywalled: false,
        containsPrivateData: false,
      },
    });
    const empty = createIndustryRawDocumentStore("dishwasher-m2-fixture");
    await expect(
      putIndustryRawDocument(
        empty,
        rawInput("blocked", { route: blockedRoute }),
      ),
    ).rejects.toThrow("raw_document_route_not_eligible");
    await expect(
      putIndustryRawDocument(
        empty,
        rawInput("costed fixture", {
          usage: {
            publicRequestsUsed: 1,
            providerRequestsUsed: 0,
            creditsUsed: 0,
            costYuan: 0,
          },
        }),
      ),
    ).rejects.toThrow("offline_raw_document_usage_forbidden");
  });

  it("rejects credential-bearing and private-network original URLs", async () => {
    const empty = createIndustryRawDocumentStore("dishwasher-m2-fixture");
    await expect(
      putIndustryRawDocument(
        empty,
        rawInput("secret location", {
          originalUrl: "https://user:password@example.com/dishwashers",
        }),
      ),
    ).rejects.toThrow("raw_document_public_url_invalid");
    await expect(
      putIndustryRawDocument(
        empty,
        rawInput("internal", { originalUrl: "http://192.168.1.10/data" }),
      ),
    ).rejects.toThrow("raw_document_public_url_invalid");
  });

  it("serializes a validated store deterministically", async () => {
    const result = await putIndustryRawDocument(
      createIndustryRawDocumentStore("dishwasher-m2-fixture"),
      rawInput("stable"),
    );
    expect(await serializeIndustryRawDocumentStore(result.store)).toBe(
      await serializeIndustryRawDocumentStore(result.store),
    );
  });
});
