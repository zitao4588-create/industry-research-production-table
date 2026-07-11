export const aliyunFreeModelCodes = [
  "glm-5.2",
  "glm-5.1",
  "glm-5",
  "glm-4.7",
  "glm-4.6",
  "glm-4.5",
  "glm-4.5-air",
  "kimi-k2.6",
  "kimi-k2.5",
  "kimi-k2-thinking",
  "kimi-k2.7-code",
  "Moonshot-Kimi-K2-Instruct",
] as const;

export type AliyunFreeModelCode = (typeof aliyunFreeModelCodes)[number];
export type AliyunFreeModelAuthority =
  | "authoritative"
  | "advisory"
  | "development_only";
export type AliyunFreeModelCadence =
  | "per_report"
  | "sampled_rotation"
  | "development";

export type AliyunFreeModelRoute = {
  model: AliyunFreeModelCode;
  task:
    | "final_report"
    | "evidence_verification"
    | "difficult_claim_audit"
    | "schema_and_format_qa"
    | "taxonomy_tagging"
    | "source_relevance_screen"
    | "report_completeness_audit"
    | "body_noise_scan"
    | "hypothesis_generation"
    | "contradiction_and_kill_rule_audit"
    | "code_and_test_maintenance"
    | "source_digest";
  authority: AliyunFreeModelAuthority;
  cadence: AliyunFreeModelCadence;
  stream: boolean;
  mayWriteConfirmedFindings: boolean;
  instruction: string;
};

export const aliyunFreeModelRoutes: AliyunFreeModelRoute[] = [
  {
    model: "kimi-k2.6",
    task: "final_report",
    authority: "authoritative",
    cadence: "per_report",
    stream: false,
    mayWriteConfirmedFindings: true,
    instruction: "基于已通过确定性校验的数据库生成完整报告，不新增证据外机会。",
  },
  {
    model: "glm-4.7",
    task: "evidence_verification",
    authority: "authoritative",
    cadence: "per_report",
    stream: false,
    mayWriteConfirmedFindings: true,
    instruction:
      "复核 quote、来源绑定和有限结论；只能否决或收窄，不能扩写商业机会。",
  },
  {
    model: "Moonshot-Kimi-K2-Instruct",
    task: "source_digest",
    authority: "advisory",
    cadence: "per_report",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction:
      "快速压缩 raw documents，保留 URL、原文片段和 public_web 状态；摘要不得直接入报告。",
  },
  {
    model: "glm-5.2",
    task: "difficult_claim_audit",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction:
      "只审计高风险数字、排名、因果和市场判断，输出问题清单，不生成整份报告。",
  },
  {
    model: "glm-5.1",
    task: "schema_and_format_qa",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction: "检查 JSON schema、必填字段和报告章节完整性，不改写事实内容。",
  },
  {
    model: "glm-5",
    task: "taxonomy_tagging",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction: "对已有文本做品类、渠道、痛点和内容主题标签，不产生新结论。",
  },
  {
    model: "glm-4.6",
    task: "source_relevance_screen",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction:
      "在确定性 sourceQuality 规则之后做第二层相关性筛选，只能降级来源。",
  },
  {
    model: "glm-4.5",
    task: "report_completeness_audit",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: true,
    mayWriteConfirmedFindings: false,
    instruction:
      "以流式模式检查规定章节、表格和审核声明是否缺失，不评价商业机会。",
  },
  {
    model: "glm-4.5-air",
    task: "body_noise_scan",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: true,
    mayWriteConfirmedFindings: false,
    instruction: "快速标记导航、重复文本、营销样板和页面噪音，不做证据判断。",
  },
  {
    model: "kimi-k2.5",
    task: "hypothesis_generation",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction:
      "生成待验证假设池，必须标记 hypothesis，不能进入 confirmed findings。",
  },
  {
    model: "kimi-k2-thinking",
    task: "contradiction_and_kill_rule_audit",
    authority: "advisory",
    cadence: "sampled_rotation",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction:
      "以自然语言寻找反例、证据冲突和 kill rule，不要求结构化实体输出。",
  },
  {
    model: "kimi-k2.7-code",
    task: "code_and_test_maintenance",
    authority: "development_only",
    cadence: "development",
    stream: false,
    mayWriteConfirmedFindings: false,
    instruction: "只用于 runner、validator 和测试维护，不接收客户报告任务。",
  },
];

export function routesForCadence(cadence: AliyunFreeModelCadence) {
  return aliyunFreeModelRoutes.filter((route) => route.cadence === cadence);
}

export function canRouteWriteConfirmedFindings(route: AliyunFreeModelRoute) {
  return route.authority === "authoritative" && route.mayWriteConfirmedFindings;
}
