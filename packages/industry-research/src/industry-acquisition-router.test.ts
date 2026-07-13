import { describe, expect, it } from "vitest";
import { createIndustryAcquisitionTaskPlan, createIndustryPlan } from "./index";
import {
  createIndustryAcquisitionRoute,
  type IndustryAcquisitionRouteInput,
  type IndustryAcquisitionTargetKind,
  isSafeIndustryPublicUrl,
  serializeIndustryAcquisitionRoute,
} from "./industry-acquisition-router";
import { dishwasherIndustryPlanningFixture } from "./industry-planner-fixtures";

const task = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
).tasks[0];

if (!task) throw new Error("dishwasher_acquisition_task_fixture_missing");

function input(
  targetKind: IndustryAcquisitionTargetKind,
  targetReference: string,
  overrides: Partial<IndustryAcquisitionRouteInput> = {},
): IndustryAcquisitionRouteInput {
  return {
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
    ...overrides,
  };
}

describe("industry acquisition router", () => {
  it.each([
    ["public_page", "https://example.com/dishwasher", "native_public_fetch"],
    ["public_search", "洗碗机 行业 标准", "public_search_discovery"],
    ["sitemap", "https://example.com/sitemap.xml", "public_feed_discovery"],
    ["rss", "https://example.com/feed.xml", "public_feed_discovery"],
    [
      "complex_public_page",
      "https://example.com/products",
      "complex_public_extractor",
    ],
  ] as const)("plans %s through %s", (targetKind, targetReference, adapter) => {
    const route = createIndustryAcquisitionRoute(
      input(targetKind, targetReference),
    );
    expect(route.adapter).toBe(adapter);
    expect(route.status).toBe("planned");
    expect(route.permissionRequirement).toBe("live_budget");
    expect(route.assertions.liveRequestExecuted).toBe(false);
    expect(route.assertions.externalFactsProduced).toBe(false);
  });

  it("keeps search and feed discovery as candidates rather than evidence", () => {
    for (const [kind, target] of [
      ["public_search", "洗碗机 市场"],
      ["sitemap", "https://example.com/sitemap.xml"],
      ["rss", "https://example.com/feed.xml"],
    ] as const) {
      expect(
        createIndustryAcquisitionRoute(input(kind, target)).evidenceDisposition,
      ).toBe("candidate_only");
    }
  });

  it("requires explicit authorization for user imports", () => {
    expect(
      createIndustryAcquisitionRoute(
        input("authorized_import", "user-upload:dishwasher-reviews.csv"),
      ).blockingReasons,
    ).toContain("user_authorization_missing");

    const route = createIndustryAcquisitionRoute(
      input("authorized_import", "user-upload:dishwasher-reviews.csv", {
        userAuthorizationConfirmed: true,
      }),
    );
    expect(route.adapter).toBe("authorized_file_import");
    expect(route.permissionRequirement).toBe("user_authorization");
    expect(route.evidenceDisposition).toBe("user_input_pending_validation");
  });

  it("blocks a source role not allowed by the acquisition task", () => {
    const route = createIndustryAcquisitionRoute(
      input("public_page", "https://example.com/dishwasher", {
        sourceRole: "brand_official_site",
      }),
    );
    expect(route.status).toBe("blocked");
    expect(route.blockingReasons).toContain("source_role_not_allowed_for_task");
  });

  it("allows manual input without claiming it is verified evidence", () => {
    const route = createIndustryAcquisitionRoute(
      input("manual_input", "manual-input:dishwasher-observation"),
    );
    expect(route.permissionRequirement).toBeNull();
    expect(route.evidenceDisposition).toBe("user_input_pending_validation");
    expect(route.assertions.candidateIsNotEvidence).toBe(true);
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://10.0.0.1/internal",
    "http://192.168.1.10/data",
    "http://service.local/private",
    "http://[::1]/admin",
    "http://[fd00::1]/internal",
    "ftp://example.com/file",
    "https://user:password@example.com/private",
  ])("blocks unsafe or non-public target %s", (targetReference) => {
    expect(isSafeIndustryPublicUrl(targetReference)).toBe(false);
    const route = createIndustryAcquisitionRoute(
      input("public_page", targetReference),
    );
    expect(route.status).toBe("blocked");
    expect(route.adapter).toBe("blocked");
    expect(route.blockingReasons).toContain("unsafe_or_non_public_url");
  });

  it.each([
    ["requiresLogin", "login_required"],
    ["requiresCookie", "cookie_required"],
    ["requiresCaptcha", "captcha_required"],
    ["isPaywalled", "paywall_detected"],
    ["containsPrivateData", "private_data_detected"],
  ] as const)("fails closed on %s", (field, reason) => {
    const route = createIndustryAcquisitionRoute(
      input("public_page", "https://example.com/dishwasher", {
        access: {
          requiresLogin: false,
          requiresCookie: false,
          requiresCaptcha: false,
          isPaywalled: false,
          containsPrivateData: false,
          [field]: true,
        },
      }),
    );
    expect(route.status).toBe("blocked");
    expect(route.blockingReasons).toContain(reason);
  });

  it("serializes route plans deterministically", () => {
    const route = createIndustryAcquisitionRoute(
      input("public_page", "https://example.com/dishwasher"),
    );
    expect(serializeIndustryAcquisitionRoute(route)).toBe(
      serializeIndustryAcquisitionRoute(route),
    );
    expect(
      createIndustryAcquisitionRoute(
        input("public_page", "https://example.com/another-page"),
      ).routeId,
    ).not.toBe(route.routeId);
  });
});
