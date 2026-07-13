import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createIndustryOpportunityHypothesesArtifact,
  type IndustryAtomicClaimsArtifact,
  type IndustryOpportunityHypothesisCandidate,
  serializeIndustryOpportunityHypothesesArtifact,
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

async function writeJsonAtomic(path: string, value: unknown) {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

const atomicClaimsPath = resolve(
  argumentValue("atomic-claims") ??
    join(
      "outputs",
      "industry-data-report-loop",
      "m3.1",
      "dishwasher",
      "atomic_claims.json",
    ),
);
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m3.2", "dishwasher"),
);
const atomicClaims = JSON.parse(
  await readFile(atomicClaimsPath, "utf8"),
) as IndustryAtomicClaimsArtifact;
const validationBoundary = {
  permissionRequiredBeforeExecution: "L5" as const,
  executionStatus: "not_started" as const,
};
const candidates: IndustryOpportunityHypothesisCandidate[] = [
  {
    hypothesisId: "dishwasher-installation-fit-guide",
    title: "待验证：厨房条件与洗碗机形态的适配引导",
    hypothesisStatement:
      "如果把水槽、嵌入式和台嵌三种已出现的产品形态转成安装条件对照，那么目标用户可能更快排除不适配选项；该效果待验证。",
    targetUser: "正在为既有厨房加装洗碗机、且尚未确定安装形式的家庭决策者",
    problem:
      "用户可能难以快速判断不同产品形态与现有空间、水电和改造条件的适配关系",
    supportingClaimIds: [
      "fotile-dishwasher-taxonomy-1",
      "fotile-dishwasher-taxonomy-2",
      "fotile-dishwasher-taxonomy-3",
    ],
    assumptions: [
      "三种品牌官网产品形态可以作为概念原型起点，但不代表完整市场分类",
      "目标用户会在购买前主动比较安装条件",
    ],
    unknowns: [
      "目标用户是否真的因形态与安装条件不清而延迟决策",
      "哪些厨房参数足以支持初步排除而不造成错误推荐",
      "用户是否愿意提供厨房尺寸和改造条件",
    ],
    validationPlan: {
      method: "半结构访谈加两版静态适配表任务测试",
      participantProfile: "近12个月考虑为既有厨房加装洗碗机的家庭决策者",
      minimumSampleSize: 5,
      steps: [
        "先让参与者按现有认知选择形态并说明理由",
        "展示安装条件对照原型后再次选择",
        "记录误解、缺失参数和是否愿意继续咨询",
      ],
      successCriteria: [
        "至少4/5名参与者能用原型排除一个不适配选项并说出依据",
        "至少3/5名参与者认为原型减少了下一步咨询所需时间",
      ],
      failureCriteria: [
        "不超过2/5名参与者能正确完成排除任务",
        "至少3/5名参与者因参数不足产生新的错误理解",
      ],
      stopConditions: ["连续3名参与者认为目标任务不真实时停止并重写问题"],
      ...validationBoundary,
    },
  },
  {
    hypothesisId: "dishwasher-efficiency-standard-explainer",
    title: "待验证：洗碗机能效水效标准的消费决策解释层",
    hypothesisStatement:
      "如果把现行洗碗机能效水效标准转成可比较的消费语言，那么关注长期水电消耗的换新用户可能更容易提出有效问题；该理解提升待验证。",
    targetUser: "在换新时关注长期用水用电、但不熟悉国家标准字段的家庭用户",
    problem:
      "标准编号和名称本身可能无法帮助普通用户理解具体机型应比较哪些能效水效信息",
    supportingClaimIds: [
      "dishwasher-standard-number",
      "dishwasher-standard-name",
    ],
    assumptions: [
      "目标用户关心长期水电消耗，并愿意在购买前阅读简短解释",
      "标准字段可以在不替代官方原文的前提下转换为提问清单",
    ],
    unknowns: [
      "用户是否把能效水效视为真实决策因素",
      "何种解释粒度既能提升理解又不产生错误外推",
      "用户是否会据此比较具体机型而不是只看价格",
    ],
    validationPlan: {
      method: "标准原页与解释原型的对照理解测试",
      participantProfile: "未来12个月计划换新或首次购买洗碗机的家庭用户",
      minimumSampleSize: 5,
      steps: [
        "先阅读官方标准记录并复述其含义",
        "再阅读消费语言解释原型并完成机型提问任务",
        "记录正确理解、误解和仍需查询的信息",
      ],
      successCriteria: [
        "至少4/5名参与者能正确说出标准涉及能效和水效",
        "至少3/5名参与者能提出一个不超出标准事实边界的机型比较问题",
      ],
      failureCriteria: [
        "不超过2/5名参与者在解释后仍能正确复述标准范围",
        "至少2/5名参与者把标准名称误解为具体机型性能结论",
      ],
      stopConditions: ["出现2次相同的高风险误解时停止测试并重写解释"],
      ...validationBoundary,
    },
  },
  {
    hypothesisId: "dishwasher-category-decision-monitor",
    title: "待验证：面向品类负责人的洗碗机连续研究看板",
    hypothesisStatement:
      "如果把量额变化、产品形态和标准边界放进连续更新的研究看板，那么品类负责人可能更快识别需要补证的决策问题；是否有持续使用价值待验证。",
    targetUser: "需要决定洗碗机品类资源配置的中小厨电品牌负责人",
    problem:
      "单一年份的量额增长和零散产品形态不足以解释增长驱动、持续性与具体进入条件",
    supportingClaimIds: [
      "dishwasher-market-volume-2024",
      "dishwasher-market-value-2024",
      "fotile-dishwasher-taxonomy-1",
      "fotile-dishwasher-taxonomy-2",
      "fotile-dishwasher-taxonomy-3",
      "dishwasher-standard-name",
    ],
    assumptions: [
      "目标负责人存在至少季度级的品类研究或资源配置任务",
      "来源边界和研究缺口会比单一机会分数更有决策价值",
    ],
    unknowns: [
      "目标负责人真实的决策频率和现有替代方案",
      "哪些指标需要持续更新以及可接受的更新延迟",
      "用户是否愿意为持续研究、原文追溯或定制补证付费",
      "交付成本能否支持用户可接受的价格",
    ],
    validationPlan: {
      method: "决策回放访谈加一页研究看板原型任务",
      participantProfile: "近12个月参与过厨电品类规划或资源配置的负责人",
      minimumSampleSize: 5,
      steps: [
        "回放最近一次真实品类决策及其信息缺口",
        "用看板原型完成一次补证优先级排序",
        "询问使用频率、现有替代方案、采购流程和可接受价格区间",
      ],
      successCriteria: [
        "至少3/5名参与者能把看板用于一个真实决策并指出下一项补证动作",
        "至少3/5名参与者愿意进入有明确范围和价格的后续试用讨论",
      ],
      failureCriteria: [
        "不超过2/5名参与者存在季度级或更高频的真实决策任务",
        "至少4/5名参与者认为现有免费来源已完全满足同一任务",
      ],
      stopConditions: [
        "连续3名参与者无法提供真实决策案例时停止并重新选择用户对象",
      ],
      ...validationBoundary,
    },
  },
];
const artifact = createIndustryOpportunityHypothesesArtifact({
  runId: "dishwasher-m3-2-opportunity-hypotheses",
  category: "洗碗机",
  atomicClaims,
  candidates,
  unresolvedCoverageGapCount: 7,
});
await Promise.all([
  writeTextAtomic(
    join(outputDir, "opportunity_hypotheses.json"),
    serializeIndustryOpportunityHypothesesArtifact(artifact),
  ),
  writeJsonAtomic(join(outputDir, "run_audit.json"), {
    schemaVersion: "industry_m3_2_hypotheses_audit.v1",
    artifactType: "industry-m3-2-hypotheses-audit",
    atomicClaimsPath,
    outputDir,
    summary: artifact.summary,
    decisionGuidance: artifact.decisionGuidance,
    assertions: artifact.assertions,
    rejectedCandidates: artifact.rejectedCandidates,
  }),
]);
console.log(
  JSON.stringify(
    {
      status:
        artifact.hypotheses.length > 0 &&
        artifact.rejectedCandidates.length === 0
          ? "ok"
          : "failed",
      ...artifact.summary,
      researchReadiness: artifact.decisionGuidance.researchReadiness,
      commercializationAssessment:
        artifact.decisionGuidance.commercializationAssessment,
      outputDir,
    },
    null,
    2,
  ),
);
if (
  artifact.hypotheses.length === 0 ||
  artifact.rejectedCandidates.length > 0
) {
  throw new Error("m3_2_hypothesis_generation_failed_closed");
}
