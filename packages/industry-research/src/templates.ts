import type { ResearchTemplateId, ResearchWorkflowStep } from "./types";

export type IndustryResearchTemplate = {
  id: ResearchTemplateId;
  name: string;
  description: string;
  sourceTypes: string[];
  databaseNodes: string[];
  workflowSteps: ResearchWorkflowStep[];
};

export const ecommerceCompetitorResearchTemplate: IndustryResearchTemplate = {
  id: "ecommerce_competitor_research",
  name: "电商竞品研究",
  description:
    "输入行业、品类和市场后，先自动发现信息源并建立行业数据库，再输出竞品、产品、痛点、内容、机会和周报。",
  sourceTypes: [
    "公开搜索",
    "竞品官网",
    "Shopify collection/product/blog",
    "sitemap/RSS",
    "用户导出 CSV",
    "手动补充",
  ],
  databaseNodes: [
    "source_database 信息源库",
    "competitor_database 竞品库",
    "website_structure_database 网站结构库",
    "product_database 产品库",
    "keyword_database 关键词库",
    "pain_point_database 用户痛点库",
    "content_database 内容库",
    "opportunity_database 机会库",
    "weekly_intelligence_reports 行业情报周报库",
  ],
  workflowSteps: [
    {
      id: "create_project",
      title: "创建研究项目",
      description: "确定品类、市场、研究目标和模板。",
      status: "pending",
    },
    {
      id: "discover_sources",
      title: "自动发现信息源",
      description: "基于行业、品类、市场和研究目标生成公开信息源候选。",
      status: "pending",
    },
    {
      id: "generate_crawl_plan",
      title: "生成采集计划",
      description:
        "规划公开搜索、竞品官网、Shopify、sitemap、RSS 和 CSV 采集任务。",
      status: "pending",
    },
    {
      id: "crawl_sources",
      title: "执行采集",
      description:
        "执行公开网页或演示采集，生成 crawl job、crawl run 和 raw document。",
      status: "pending",
    },
    {
      id: "build_industry_databases",
      title: "建立行业数据库",
      description:
        "写入信息源、竞品、网站结构、产品、关键词、痛点、内容、机会和周报库。",
      status: "pending",
    },
    {
      id: "supplement_sources",
      title: "补充输入资料",
      description: "URL、CSV 和手动文本作为补充证据，不再作为主流程入口。",
      status: "pending",
    },
    {
      id: "extract_competitors",
      title: "抽取竞品信息",
      description: "拆导航、collection、tag、SEO、blog 和社媒结构。",
      status: "pending",
    },
    {
      id: "extract_product_signals",
      title: "抽取产品信号",
      description: "识别价格、标签、卖点、品类和爆品线索。",
      status: "pending",
    },
    {
      id: "extract_pain_points",
      title: "抽取用户痛点",
      description: "整理高频抱怨、需求、问题和用户目标。",
      status: "pending",
    },
    {
      id: "extract_content_signals",
      title: "抽取内容信号",
      description: "识别爆款话题、内容类型、渠道和转化线索。",
      status: "pending",
    },
    {
      id: "score_opportunities",
      title: "生成机会评分",
      description: "按需求、竞争、内容缺口、商业价值和证据质量打分。",
      status: "pending",
    },
    {
      id: "human_review",
      title: "人工审核",
      description: "标记批准、待复核或驳回，保留人工判断。",
      status: "pending",
    },
    {
      id: "generate_report",
      title: "生成 Markdown 报告",
      description: "输出可复制到客户交付材料或知识库的报告。",
      status: "pending",
    },
  ],
};

export const industryResearchTemplates = [ecommerceCompetitorResearchTemplate];

export function findIndustryResearchTemplate(templateId: ResearchTemplateId) {
  return industryResearchTemplates.find(
    (template) => template.id === templateId,
  );
}
