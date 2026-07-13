import type { IndustryPlanningInput } from "./industry-planner";

export const skincareIndustryPlanningFixture = {
  industry: "护肤品",
  market: "中国大陆",
  timeRange: "2024-2026",
  researchGoals: [
    "建立可持续更新的行业知识地图",
    "理解行业分类、产业链、渠道、消费者需求和商业模式",
    "为后续代表性竞品、内容生态和机会假设研究制定覆盖计划",
  ],
  constraints: [
    "第一阶段只生成研究计划，不调用 live provider",
    "不产出未经外部证据支持的市场事实",
    "中国大陆监管分类与商业子市场分开记录，化妆品类统计不得直接外推护肤品规模",
  ],
} satisfies IndustryPlanningInput;

export const dishwasherIndustryPlanningFixture = {
  industry: "洗碗机",
  market: "中国大陆",
  timeRange: "2024-2026",
  researchGoals: [
    "建立洗碗机品牌、产品形态、价格带和渠道的可追溯数据基础",
    "识别用户问题、内容信号、监管标准和供应链数据缺口",
    "为证据充分的行业报告和可验证机会假设准备代表性采集计划",
  ],
  constraints: [
    "本阶段只生成离线采集任务，不发送公网或 provider 请求",
    "搜索候选不是证据，品牌官网不能单独证明用户需求或市场规模",
    "不绕过登录、验证码或付费墙，不采集私人数据、支付信息或联系方式",
  ],
} satisfies IndustryPlanningInput;
