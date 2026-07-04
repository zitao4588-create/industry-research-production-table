// ============ EDITABLE CONSTANTS ============
// 电商竞品研究 Agent · 产品介绍视频 · 设计系统

export const BRAND = {
  // 背景渐变
  bgFrom: "#0A0E27",
  bgTo: "#0F172A",
  // 主强调色
  violet: "#8B5CF6",
  indigo: "#6366F1",
  // 次强调色（数据流）
  cyan: "#22D3EE",
  sky: "#38BDF8",
  // 语义色
  success: "#10B981",
  danger: "#F43F5E",
  // 文字
  textPrimary: "#F8FAFC",
  textMuted: "#94A3B8",
  textDim: "#64748B",
  // 玻璃卡片
  cardBg: "rgba(30, 41, 59, 0.55)",
  cardBorder: "rgba(99, 102, 241, 0.35)",
  glow: "rgba(139, 92, 246, 0.45)",
};

export const TYPOGRAPHY = {
  // 字体在组件内用 @remotion/google-fonts 加载
  headingSize: 76,
  subHeadingSize: 42,
  bodySize: 34,
  smallSize: 28,
  labelSize: 24,
  headingWeight: 800,
  bodyWeight: 500,
};

export const TIMING = {
  fps: 30,
  // 各场景时长（帧）
  scene1: 120, // 0-4s   痛点 Hook
  scene2: 120, // 4-8s   产品亮相
  scene3: 180, // 8-14s  自动发现信息源
  scene4: 180, // 14-20s 九类数据库
  scene5: 180, // 20-26s 机会评分+报告
  scene6: 120, // 26-30s CTA
  // 转场交叉淡入帧数
  crossfade: 15,
};

// 场景起始帧（累计）
export const SCENE_START = {
  s1: 0,
  s2: TIMING.scene1,
  s3: TIMING.scene1 + TIMING.scene2,
  s4: TIMING.scene1 + TIMING.scene2 + TIMING.scene3,
  s5: TIMING.scene1 + TIMING.scene2 + TIMING.scene3 + TIMING.scene4,
  s6: TIMING.scene1 + TIMING.scene2 + TIMING.scene3 + TIMING.scene4 + TIMING.scene5,
};

export const TOTAL_FRAMES = TIMING.scene1 + TIMING.scene2 + TIMING.scene3 + TIMING.scene4 + TIMING.scene5 + TIMING.scene6;

export const CONTENT = {
  product: "电商竞品研究 Agent",
  productEn: "E-commerce Competitor Research Agent",
  platform: "行业研究生产台",
  platformEn: "Industry Research Production Table",
  domain: "research.playgamelab.cn",
  hook: "做电商竞品调研，还在手动翻网页？",
  hookPain: "手动翻网页",
  hookSub: ["信息散落", "难以复用", "无法追踪"],
  reveal: "输入行业品类 · 自动建库 · 输出报告",
  // 场景3 输入
  inputs: ["宠物食品", "益生菌", "北美市场"],
  flowNodes: [
    { label: "公开搜索", tag: "search" },
    { label: "竞品官网", tag: "robots" },
    { label: "sitemap / RSS", tag: "sitemap" },
    { label: "Shopify 路径", tag: "collection" },
  ],
  foundCount: 24,
  // 场景4 九库
  databases: [
    { name: "信息源", count: 8, icon: "source" },
    { name: "竞品", count: 6, icon: "competitor" },
    { name: "网站结构", count: 3, icon: "structure" },
    { name: "产品", count: 6, icon: "product" },
    { name: "关键词", count: 6, icon: "keyword" },
    { name: "痛点", count: 5, icon: "pain" },
    { name: "内容", count: 5, icon: "content" },
    { name: "机会", count: 6, icon: "opportunity" },
    { name: "周报", count: 1, icon: "weekly" },
  ],
  // 场景5 机会
  opportunityName: "换粮过渡期肠道套装",
  opportunityScore: 88,
  reportTags: ["已确认发现", "证据不足但可能成立", "阻塞项"],
  reportTrace: "每条结论可溯源到 evidenceId + URL",
  // 场景6 特性
  features: ["CLI-first · 公开采集", "九库 + 机会评分", "人工审核 · 可溯源"],
};
// ============================================
