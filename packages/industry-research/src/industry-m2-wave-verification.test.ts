import { describe, expect, it } from "vitest";
import {
  createIndustryAcquisitionRoute,
  createIndustryAcquisitionTaskPlan,
  createIndustryPlan,
} from "./index";
import { verifyIndustryM2Wave } from "./industry-m2-wave-verification";
import { dishwasherIndustryPlanningFixture } from "./industry-planner-fixtures";

const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(dishwasherIndustryPlanningFixture)),
);
function brandOfficialTask() {
  const candidate = taskPlan.tasks.find((task) =>
    task.allowedSourceRoles.includes("brand_official_site"),
  );
  if (!candidate) throw new Error("brand_official_acquisition_task_missing");
  return candidate;
}
const task = brandOfficialTask();

function route(url: string) {
  return createIndustryAcquisitionRoute({
    task,
    sourceRole: "brand_official_site",
    targetKind: "complex_public_page",
    targetReference: url,
    access: {
      requiresLogin: false,
      requiresCookie: false,
      requiresCaptcha: false,
      isPaywalled: false,
      containsPrivateData: false,
    },
  });
}

describe("M2 wave verification", () => {
  it("separates relevant raw candidates from cross-category false positives", () => {
    const routes = [
      route("https://brand.example/dishwasher/1"),
      route("https://brand.example/air-conditioners/2"),
    ];
    const verification = verifyIndustryM2Wave({
      runId: "dishwasher-wave-1",
      category: "洗碗机",
      categoryTerms: ["洗碗机", "dishwasher"],
      conflictingCategoryTerms: ["空调", "air-conditioner"],
      routes,
      taskPlan,
      rawDocuments: [
        {
          id: "raw-1",
          url: routes[0]?.targetReference ?? "",
          title: "洗碗机产品参数",
          extractedText: "洗碗机容量与安装参数",
          sourceQuality: { acceptedForReport: true },
        },
        {
          id: "raw-2",
          url: routes[1]?.targetReference ?? "",
          title: "空调售后收费标准",
          extractedText: "导航包含洗碗机，正文为空调服务。洗碗机。",
          sourceQuality: { acceptedForReport: true },
        },
      ],
    });

    expect(verification.summary.relevantRawCandidateCount).toBe(1);
    expect(verification.summary.categoryMismatchCount).toBe(1);
    expect(verification.documentAudit[1]?.legacySourceAccepted).toBe(true);
    expect(verification.documentAudit[1]?.status).toBe(
      "category_relevance_mismatch",
    );
    expect(verification.decision.canEnterM3).toBe(false);
  });

  it("keeps every row fail-closed when roles and samples are missing", () => {
    const url = "https://brand.example/dishwasher/1";
    const verification = verifyIndustryM2Wave({
      runId: "dishwasher-wave-1",
      category: "洗碗机",
      categoryTerms: ["洗碗机"],
      conflictingCategoryTerms: ["空调"],
      routes: [route(url)],
      taskPlan,
      rawDocuments: [
        {
          id: "raw-1",
          url,
          title: "洗碗机产品",
          extractedText: "洗碗机公开信息",
          sourceQuality: { acceptedForReport: true },
        },
      ],
    });

    expect(verification.summary.coverageRowsMetNotEvidence).toBe(0);
    expect(verification.summary.coverageRowsWithGaps).toBe(11);
    expect(verification.assertions.rawDocumentsAreNotEvidence).toBe(true);
  });

  it("accepts a narrowly verified official standard record despite navigation noise", () => {
    const regulationTask = taskPlan.tasks.find((candidate) =>
      candidate.allowedSourceRoles.includes("standards_body"),
    );
    if (!regulationTask) throw new Error("regulation_task_missing");
    const url =
      "https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=dishwasher";
    const regulationRoute = createIndustryAcquisitionRoute({
      task: regulationTask,
      sourceRole: "standards_body",
      targetKind: "complex_public_page",
      targetReference: url,
      access: {
        requiresLogin: false,
        requiresCookie: false,
        requiresCaptcha: false,
        isPaywalled: false,
        containsPrivateData: false,
      },
    });
    const verification = verifyIndustryM2Wave({
      runId: "dishwasher-standard-wave",
      category: "洗碗机",
      categoryTerms: ["洗碗机", "dishwasher"],
      conflictingCategoryTerms: ["空调"],
      routes: [regulationRoute],
      taskPlan,
      rawDocuments: [
        {
          id: "raw-standard",
          url,
          title: "国家标准|GB 38383-2019",
          extractedText:
            "中文标准名称：洗碗机能效水效限定值及等级。英文名称：dishwashers。标准号：GB 38383-2019。发布日期：2019-12-17。实施日期：2021-01-01。发布单位：国家市场监督管理总局。",
          sourceQuality: { acceptedForReport: false },
        },
      ],
    });

    expect(verification.documentAudit[0]?.officialAuthorityRecordOverride).toBe(
      true,
    );
    expect(verification.documentAudit[0]?.status).toBe(
      "raw_candidate_relevant_not_evidence",
    );
    expect(verification.summary.officialAuthorityRecordOverrideCount).toBe(1);
  });
});
