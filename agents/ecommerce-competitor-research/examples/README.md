# 电商竞品研究 Agent 输入输出样例

这些样例用于确认电商竞品研究 Agent 如何先生成自动采集计划、mock 采集资料、建立行业数据库，再整理成竞品、产品信号、用户痛点、内容信号、机会评分和 Markdown 报告。

## 样例 1：宠物益生菌 DTC 竞品研究

### 输入

```json
{
  "projectName": "宠物益生菌竞品研究",
  "industry": "宠物健康电商",
  "category": "宠物肠胃益生菌",
  "market": "美国 DTC 电商",
  "researchGoal": "找到适合小团队切入的产品和内容机会",
  "urls": ["https://example-pet-brand.com", "https://example-pet-brand.com/blog"],
  "csvText": "product,price,tag\nDaily Gut Chews,29.99,digestion\nPumpkin Probiotic,24.99,sensitive stomach",
  "manualText": "用户反复提到狗狗软便、换粮后肠胃不适、希望成分天然。"
}
```

### 预期输出

```json
{
  "sourceDiscoveryPlans": [{ "candidates": ["公开搜索发现竞品官网", "Shopify collection / product / blog 结构"] }],
  "databaseViews": ["source_database", "competitor_database", "product_database", "pain_point_database", "weekly_intelligence_reports"],
  "competitors": [{ "name": "Example Pet Brand", "positioning": "天然宠物肠胃护理" }],
  "productSignals": [{ "signal": "咀嚼片比粉剂更适合日常复购" }],
  "painPoints": [{ "theme": "软便和换粮不适", "userNeed": "更温和的日常护理方案" }],
  "contentSignals": [{ "topic": "换粮后肠胃护理", "contentType": "教程型内容" }],
  "opportunities": [{ "title": "换粮过渡期肠胃护理套装", "totalScore": 84 }],
  "reportFormat": "markdown"
}
```

## 样例 2：女性运动服 Shopify 竞品研究

### 输入

```json
{
  "projectName": "女性运动服竞品研究",
  "industry": "女性运动服电商",
  "category": "女性瑜伽裤和运动内衣",
  "market": "北美 Shopify 品牌",
  "researchGoal": "识别 collection、tag 和内容打法",
  "urls": ["https://example-activewear.com/collections/best-sellers"],
  "csvText": "product,price,tag\nHigh Waist Legging,68,best seller\nSeamless Bra,48,summer",
  "manualText": "导航里突出 Best Sellers、New Arrivals、Under $50、Matching Sets。"
}
```

### 预期输出

```json
{
  "sourceDiscoveryPlans": [{ "candidates": ["公开搜索发现竞品官网", "Shopify collection / product / blog 结构"] }],
  "databaseViews": ["source_database", "website_structure_database", "product_database", "keyword_database", "content_database"],
  "competitors": [{ "name": "Example Activewear", "positioning": "高性价比女性运动服" }],
  "productSignals": [{ "signal": "Matching Sets 是更强的成交路径" }],
  "painPoints": [{ "theme": "尺码和支撑性不确定", "userNeed": "清晰尺码建议和真实上身评价" }],
  "contentSignals": [{ "topic": "一套穿搭多场景", "contentType": "转化型内容" }],
  "opportunities": [{ "title": "小个子瑜伽套装 collection", "totalScore": 78 }],
  "reportFormat": "markdown"
}
```

## 样例 3：家居收纳 Amazon 竞品研究

### 输入

```json
{
  "projectName": "家居收纳竞品研究",
  "industry": "家居收纳电商",
  "category": "厨房抽屉收纳盒",
  "market": "美国 Amazon 和独立站",
  "researchGoal": "找到差异化卖点和评论痛点",
  "urls": ["https://example-storage-brand.com/products/drawer-organizer"],
  "csvText": "review,rating\nToo small for my drawer,3\nEasy to clean and looks premium,5",
  "manualText": "用户在评论中反复提到尺寸不匹配、安装麻烦、希望可调节。"
}
```

### 预期输出

```json
{
  "sourceDiscoveryPlans": [{ "candidates": ["公开搜索发现竞品官网", "评论、商品和关键词 CSV"] }],
  "databaseViews": ["source_database", "product_database", "keyword_database", "pain_point_database", "opportunity_database"],
  "competitors": [{ "name": "Example Storage Brand", "positioning": "厨房抽屉模块化收纳" }],
  "productSignals": [{ "signal": "可调节尺寸是核心差异化信号" }],
  "painPoints": [{ "theme": "尺寸不匹配", "userNeed": "购买前确认适配抽屉尺寸" }],
  "contentSignals": [{ "topic": "整理前后对比", "contentType": "收藏型内容" }],
  "opportunities": [{ "title": "可调节厨房抽屉收纳套装", "totalScore": 81 }],
  "reportFormat": "markdown"
}
```
