import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type IndustryOsUiPayload,
  runIndustryOsFixtureAction,
} from "./actions";
import { IndustryOsResult } from "./IndustryOsResult";

async function payload(): Promise<IndustryOsUiPayload> {
  const result = await runIndustryOsFixtureAction();
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}

describe("G9 single-route Industry OS local flow", () => {
  it("builds the complete G2-G8 payload without env or external services", async () => {
    const result = await payload();

    expect(result.schemaVersion).toBe("industry_os_ui_payload.v1");
    expect(result.evidenceMode).toBe("contract_fixture");
    expect(result.stages).toHaveLength(6);
    expect(result.stages.every((stage) => stage.status === "completed")).toBe(
      true,
    );
    expect(result.industryPlan.coverageMatrix).toHaveLength(11);
    expect(
      result.representativeSamplePlan.selectedSamples.length,
    ).toBeGreaterThan(0);
    expect(result.moduleResults.moduleResults).toHaveLength(6);
    expect(result.reportBundle.chapters).toHaveLength(12);
    expect(result.reportBundle.knowledgeMap.nodes).toHaveLength(75);
    expect(result.reportBundle.claimLedger.counts.eligible).toBe(0);
  });

  it("renders every required Industry OS surface in the existing result experience", async () => {
    const html = renderToStaticMarkup(
      <IndustryOsResult
        payload={await payload()}
        onRestart={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="industry-os-result"');
    expect(html).toContain("研究坐标");
    expect(html).toContain("Industry Plan");
    expect(html).toContain("Coverage Matrix");
    expect(html).toContain("Representative Samples");
    expect(html).toContain("六阶段进度");
    expect(html).toContain("六个研究模块");
    expect(html).toContain("12 章行业报告");
    expect(html).toContain("知识地图摘要");
    expect(html).toContain("CONTRACT ONLY · 非行业事实");
  });
});
