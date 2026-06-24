# 数据契约与集成指引 · DATA_CONTRACT

> 给 Codex:这份描述 **UI 期望的数据形状**、它与仓库 `packages/industry-research/src/types.ts` 的关系,以及推荐的**适配层**和**事件流**。接后端时主要参考本文件。原型里所有数据挂在 `window.IRP`(见 `prototype/data.js`),可直接当作 fixtures。

---

## 1. 顶层对象 `window.IRP`

```
IRP = {
  project,            // 当前研究项目元信息
  workflowSteps[],    // 13 步建库流程(对应 templates.ts)
  sourceCandidates[], // 信息源发现候选(running 态流式展示)
  competitors[],      // 竞品库
  products[],         // 产品库
  painPoints[],       // 用户痛点库
  contentSignals[],   // 内容库
  keywords[],         // 关键词库
  opportunities[],    // 机会库(含五维评分 + 审核状态)
  weekly,             // 行业情报周报
  databases[],        // 九类数据库视图的元信息(计数 + 摘要)
  stats,              // 结果页头部统计
}
```

## 2. 各结构的字段(UI 当前消费的最小集合)

> 字段名是 UI 当前用的。真实 agent 输出若不同,**不要改 UI**——在适配层(§3)做映射。

```ts
project = { name, template, templateName, industry, category, market, goal }

workflowSteps[] = { id, title, desc }
// id 枚举(与仓库 templates 对齐):
// create_project · discover_sources · generate_crawl_plan · mock_crawl_sources ·
// build_industry_databases · supplement_sources · extract_competitors ·
// extract_product_signals · extract_pain_points · extract_content_signals ·
// score_opportunities · human_review · generate_report

sourceCandidates[] = { method, title, seed, priority, db[] }
// method 枚举: search_query | shopify_public_endpoint | rss | sitemap | csv_seed | robots
// priority: high | medium | low ; db[]: 命中的数据库 id 列表

competitors[]   = { name, channel, positioning, market, structure[], evidence }
products[]      = { name, competitor, category, price, tags[] }
painPoints[]    = { theme, need, freq /* high|medium|low */, evidence }
contentSignals[]= { platform, topic, type, why, evidence }
// type 枚举: exposure | growth | save | conversion | personal_brand
keywords[]      = { keyword, intent, source }
// intent 枚举: research | comparison | purchase | pain_point

opportunities[] = { title, summary, demand, competition, gap, value, evidence, total, status }
// 五维分 0–100: demand 需求 / competition 竞争 / gap 内容缺口 / value 商业价值 / evidence 证据质量
// total 综合分 0–100 ; status: approved | needs_review | rejected

weekly = { weekOf, title, summary, newSignals[], watchList[] }

databases[] = { id, label, count, sample, icon }
// id 即九类库:source_database, competitor_database, website_structure_database,
//   product_database, keyword_database, pain_point_database, content_database,
//   opportunity_database, weekly_intelligence_reports

stats = { candidates, rawDocs, extractionJobs, evidence, crawlJobs }
```

## 3. 适配层(强烈建议先落地)

把 UI 模型和 agent 真实输出**解耦**。前端只认上面的形状;真实数据进来时只改一个 `adapt()`:

```ts
// adapters/research.ts —— 唯一的"翻译"入口
import type { ResearchRun } from '@/packages/industry-research/types'; // 仓库真实类型

export function adaptRun(raw: ResearchRun): UIModel {
  return {
    project: {
      name: raw.projectName, industry: raw.industry,
      category: raw.category, market: raw.market, goal: raw.goal,
      /* … */
    },
    opportunities: raw.opportunities.map(o => ({
      title: o.title, summary: o.summary,
      demand: o.scores.demand, competition: o.scores.competition,
      gap: o.scores.contentGap, value: o.scores.businessValue,
      evidence: o.scores.evidenceQuality, total: o.scores.total,
      status: o.reviewStatus,         // 若枚举不同在此映射
    })),
    databases: NINE_DB_IDS.map(id => ({
      id, label: LABELS[id], icon: ICONS[id],
      count: raw.counts[id] ?? 0,
      sample: raw.samples[id] ?? '',
    })),
    /* competitors / products / painPoints / contentSignals / keywords / weekly / stats … */
  };
}
```

好处:agent 的 I/O 还没定型也能并行开发;真实接口确定后改动集中在 `adapt()` 一处,界面零改动。`data.js` 当前内容直接迁为 `fixtures.ts` 供 Storybook / 测试 / 离线预览用。

## 4. running 态:事件流规范(把模拟换成真实)

原型用 `setInterval`(`app.jsx` 里 `TOTAL=15`)假装进度。真实 agent 是**逐步吐事件**的。建议定义一条**追加式事件流**(SSE / WebSocket),UI 消费后驱动同一套 running UI:

```ts
type RunEvent =
  | { type: 'step.start',     step: WorkflowStepId, ts }
  | { type: 'step.done',      step: WorkflowStepId, ts }
  | { type: 'source.found',   payload: SourceCandidate, ts }   // → 信息源发现流追加一条
  | { type: 'crawl.progress', done: number, total: number, ts }
  | { type: 'db.upserted',    db: DatabaseId, count: number, ts } // 九类库逐个填充
  | { type: 'stat.update',    key: keyof Stats, value: number, ts }
  | { type: 'log',            level: 'info'|'warn'|'error', msg, ts }
  | { type: 'run.error',      step?, code, msg, retriable: boolean, ts }
  | { type: 'run.done',       ts };
```

UI 侧:维护一个 `events: RunEvent[]`,从中**派生**当前步骤、百分比(done 步数 / 13)、计数器、信息源流。这样:
- mock 模式 = 喂一串假事件;真实模式 = 接后端 stream —— **同一套渲染**。
- 半截失败 / 中断也有事件可渲染(见 ROADMAP P0 错误态)。
- 顺手定义清楚 agent 该发哪些信号,反过来帮你理顺架构。

## 5. 运行模式与合规(沿用仓库语义)
- 顶栏运行模式:`Mock`(不抓真实网页)/ `9router` / `Public Web`(仅公开 http/https URL)/ `Public + 9router`。
- 仓库约束:真实公开采集只处理公开 URL;生产/付费交付必须切换自付费 provider,不可指向 localhost LLM(除非显式允许)。这些约束建议在 UI 上以**禁用态 + 说明**呈现(设置页已有文案占位)。

## 6. 证据溯源(预留字段)
UI 已规划"点单元格看来源"的交互(ROADMAP P1)。建议每条抽取结果都带:
```ts
evidence?: { id, sourceUrl, snippet, confidence /* 0–1 */, capturedAt }[]
```
即使先返回空数组也行——**先让字段贯穿全链路**,后面补 UI 即可。
