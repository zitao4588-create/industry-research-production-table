import { describe, expect, it } from "vitest";
import {
  aliyunFreeModelCodes,
  aliyunFreeModelRoutes,
  canRouteWriteConfirmedFindings,
  routesForCadence,
} from "./aliyun-free-model-routing";

describe("Aliyun free-model routing", () => {
  it("assigns every verified free GLM/Kimi model exactly once", () => {
    expect(aliyunFreeModelRoutes.map((route) => route.model).sort()).toEqual(
      [...aliyunFreeModelCodes].sort(),
    );
    expect(
      new Set(aliyunFreeModelRoutes.map((route) => route.model)).size,
    ).toBe(aliyunFreeModelCodes.length);
  });

  it("allows only Kimi K2.6 and GLM 4.7 to write confirmed findings", () => {
    expect(
      aliyunFreeModelRoutes
        .filter(canRouteWriteConfirmedFindings)
        .map((route) => route.model)
        .sort(),
    ).toEqual(["glm-4.7", "kimi-k2.6"]);
  });

  it("keeps low-scoring and specialist models out of the authoritative path", () => {
    for (const model of [
      "glm-4.5",
      "glm-4.5-air",
      "kimi-k2-thinking",
      "kimi-k2.7-code",
    ]) {
      const route = aliyunFreeModelRoutes.find((item) => item.model === model);
      expect(route?.mayWriteConfirmedFindings).toBe(false);
    }
    expect(
      aliyunFreeModelRoutes.find((route) => route.model === "kimi-k2.7-code")
        ?.cadence,
    ).toBe("development");
  });

  it("uses streaming for the two GLM models that require it", () => {
    expect(
      aliyunFreeModelRoutes
        .filter((route) => route.stream)
        .map((route) => route.model)
        .sort(),
    ).toEqual(["glm-4.5", "glm-4.5-air"]);
  });

  it("keeps per-report calls small and rotates advisory models", () => {
    expect(routesForCadence("per_report").map((route) => route.model)).toEqual([
      "kimi-k2.6",
      "glm-4.7",
      "Moonshot-Kimi-K2-Instruct",
    ]);
    expect(routesForCadence("sampled_rotation")).toHaveLength(8);
  });
});
