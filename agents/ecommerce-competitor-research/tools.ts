export const ecommerceCompetitorResearchTools = [
  {
    id: "source-discovery-plan",
    name: "自动信息源发现",
    description:
      "根据行业、品类和市场生成公开搜索、竞品官网、Shopify、RSS、sitemap 和 CSV 信息源候选。",
    status: "mock",
  },
  {
    id: "mock-crawler",
    name: "mock crawler",
    description:
      "生成 crawl job、crawl run、raw document 和 extraction job，不访问真实网页。",
    status: "mock",
  },
  {
    id: "database-builder",
    name: "行业数据库建设",
    description:
      "建立信息源、竞品、网站结构、产品、关键词、痛点、内容、机会和周报九类数据库视图。",
    status: "mock",
  },
  {
    id: "supplemental-intake",
    name: "补充资料导入",
    description:
      "接收用户提供的 URL、CSV 和手动文本，作为补充证据而不是主流程。",
    status: "mock",
  },
  {
    id: "deepseek-report-generator",
    name: "DeepSeek 抽取与报告生成",
    description:
      "服务端通过 DeepSeek v4 flash，把 public_web raw documents 抽取成结构化结果，并生成 Markdown 行业研究报告。",
    status: "enabled",
  },
  {
    id: "real-crawler-adapter",
    name: "真实爬虫 adapter",
    description:
      "后续可评估 Crawlee、Hermes XCrawl、OpenClaw Scrapling、RSS 和 n8n Readability 节点。",
    status: "reserved",
  },
];
