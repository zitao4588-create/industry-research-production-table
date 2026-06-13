"use client";

import {
  ecommerceCompetitorResearchTemplate,
  type ResearchReviewItem,
  type ResearchWorkflowInput,
  type ResearchWorkflowResult,
  runMockIndustryResearchWorkflow,
} from "@industry-research/core";
import { useState } from "react";

const defaultInput: ResearchWorkflowInput = {
  projectName: "宠物益生菌竞品研究",
  industry: "宠物健康电商",
  category: "宠物肠胃益生菌",
  market: "美国 DTC 电商",
  researchGoal: "找到适合小团队切入的产品和内容机会",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText:
    "product,price,tag\nDaily Gut Chews,29.99,digestion\nPumpkin Probiotic,24.99,sensitive stomach",
  manualText: "用户反复提到狗狗软便、换粮后肠胃不适、希望成分天然。",
};

function parseUrlText(urlText: string) {
  return urlText
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);
}

function formatScore(score: number) {
  return `${score}/100`;
}

function createDatabaseSummaries(result: ResearchWorkflowResult) {
  return [
    {
      id: "source_database",
      label: "信息源库",
      count: result.source_database.length,
      sample: result.source_database[0]?.title,
    },
    {
      id: "competitor_database",
      label: "竞品库",
      count: result.competitor_database.length,
      sample: result.competitor_database[0]?.name,
    },
    {
      id: "website_structure_database",
      label: "网站结构库",
      count: result.website_structure_database.length,
      sample: result.website_structure_database[0]?.sections.join(" / "),
    },
    {
      id: "product_database",
      label: "产品库",
      count: result.product_database.length,
      sample: result.product_database[0]?.name,
    },
    {
      id: "keyword_database",
      label: "关键词库",
      count: result.keyword_database.length,
      sample: result.keyword_database[0]?.keyword,
    },
    {
      id: "pain_point_database",
      label: "用户痛点库",
      count: result.pain_point_database.length,
      sample: result.pain_point_database[0]?.theme,
    },
    {
      id: "content_database",
      label: "内容库",
      count: result.content_database.length,
      sample: result.content_database[0]?.topic,
    },
    {
      id: "opportunity_database",
      label: "机会库",
      count: result.opportunity_database.length,
      sample: result.opportunity_database[0]?.title,
    },
    {
      id: "weekly_intelligence_reports",
      label: "行业情报周报库",
      count: result.weekly_intelligence_reports.length,
      sample: result.weekly_intelligence_reports[0]?.title,
    },
  ];
}

function getApprovedReviewItems(reviewItems: ResearchReviewItem[]) {
  return reviewItems.map((item) => ({
    ...item,
    status: "approved" as const,
    note: item.note || "已人工审核通过。",
  }));
}

export function IndustryResearchWorkbench() {
  const [projectName, setProjectName] = useState(defaultInput.projectName);
  const [industry, setIndustry] = useState(defaultInput.industry);
  const [category, setCategory] = useState(defaultInput.category);
  const [market, setMarket] = useState(defaultInput.market);
  const [researchGoal, setResearchGoal] = useState(defaultInput.researchGoal);
  const [urlsText, setUrlsText] = useState(defaultInput.urls.join("\n"));
  const [csvText, setCsvText] = useState(defaultInput.csvText);
  const [manualText, setManualText] = useState(defaultInput.manualText);
  const [result, setResult] = useState<ResearchWorkflowResult | null>(null);
  const [reviewItems, setReviewItems] = useState<ResearchReviewItem[]>([]);
  const [report, setReport] = useState("");
  const [runMode, setRunMode] = useState<
    "Mock" | "9router" | "Public Web" | "Public Web + 9router"
  >("Mock");
  const [isRunning9Router, setIsRunning9Router] = useState(false);
  const [isRunningPublicWeb, setIsRunningPublicWeb] = useState(false);
  const [isRunningPublicWeb9Router, setIsRunningPublicWeb9Router] =
    useState(false);
  const [modelError, setModelError] = useState("");

  function createWorkflowInput(): ResearchWorkflowInput {
    return {
      projectName,
      industry,
      category,
      market,
      researchGoal,
      templateId: "ecommerce_competitor_research",
      urls: parseUrlText(urlsText),
      csvText,
      manualText,
    };
  }

  function handleRunWorkflow() {
    const nextResult = runMockIndustryResearchWorkflow(createWorkflowInput());

    setResult(nextResult);
    setReviewItems(nextResult.reviewItems);
    setReport("");
    setRunMode("Mock");
    setModelError("");
  }

  async function runServerWorkflow(
    mode: "9router" | "public_web" | "public_web_9router",
    nextRunMode: "9router" | "Public Web" | "Public Web + 9router",
  ) {
    if (mode === "9router") {
      setIsRunning9Router(true);
    } else if (mode === "public_web") {
      setIsRunningPublicWeb(true);
    } else {
      setIsRunningPublicWeb9Router(true);
    }

    setModelError("");
    setReport("");

    try {
      const response = await fetch("/api/industry-research/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          input: createWorkflowInput(),
        }),
      });
      const payload = (await response.json()) as {
        result?: ResearchWorkflowResult;
        error?: string;
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "行业研究工作流运行失败。");
      }

      setResult(payload.result);
      setReviewItems(payload.result.reviewItems);
      setReport(
        mode === "9router" || mode === "public_web_9router"
          ? (payload.result.research_reports[0]?.content ?? "")
          : "",
      );
      setRunMode(nextRunMode);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error));
    } finally {
      if (mode === "9router") {
        setIsRunning9Router(false);
      } else if (mode === "public_web") {
        setIsRunningPublicWeb(false);
      } else {
        setIsRunningPublicWeb9Router(false);
      }
    }
  }

  function handleRunPublicWebWorkflow() {
    void runServerWorkflow("public_web", "Public Web");
  }

  function handleRun9RouterWorkflow() {
    void runServerWorkflow("9router", "9router");
  }

  function handleRunPublicWeb9RouterWorkflow() {
    void runServerWorkflow("public_web_9router", "Public Web + 9router");
  }

  function handleApproveAll() {
    setReviewItems((items) => getApprovedReviewItems(items));
  }

  function handleGenerateReport() {
    setReport(result?.research_reports[0]?.content ?? "");
  }

  const doneStepCount =
    result?.workflowSteps.filter((step) => step.status === "done").length ?? 0;
  const approvedReviewCount = reviewItems.filter(
    (item) => item.status === "approved",
  ).length;
  const sourceDiscoveryPlan = result?.source_discovery_plans[0];
  const crawlPlan = result?.crawl_plans[0];
  const isPublicWebResult = crawlPlan?.mode === "public_web";
  const databaseSummaries = result ? createDatabaseSummaries(result) : [];
  const crawlJobRows =
    result?.crawl_jobs.map((job) => {
      const target = crawlPlan?.targets.find(
        (item) => item.id === job.targetId,
      );
      const run = result.crawl_runs.find((item) => item.jobId === job.id);

      return {
        id: job.id,
        kind: target?.kind ?? "unknown",
        target: target?.target ?? job.targetId,
        status: job.status,
        summary: run?.summary ?? job.plannedAction,
      };
    }) ?? [];

  return (
    <>
      <section className="stats" aria-label="Industry research stats">
        <div className="stat">
          <span>模板</span>
          <strong>{ecommerceCompetitorResearchTemplate.name}</strong>
        </div>
        <div className="stat">
          <span>建库流程</span>
          <strong>
            {doneStepCount ||
              ecommerceCompetitorResearchTemplate.workflowSteps.length}
          </strong>
        </div>
        <div className="stat">
          <span>运行模式</span>
          <strong>{runMode}</strong>
        </div>
        <div className="stat">
          <span>数据库视图</span>
          <strong>{databaseSummaries.length || 9}</strong>
        </div>
      </section>

      <section className="panel researchPanel">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Project</p>
            <h3>创建研究项目</h3>
          </div>
          <span className="badge">ecommerce_competitor_research</span>
        </div>

        <div className="researchForm">
          <div className="field">
            <label htmlFor="research-project-name">项目名称</label>
            <input
              id="research-project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="research-template">研究模板</label>
            <select
              id="research-template"
              defaultValue="ecommerce_competitor_research"
            >
              <option value="ecommerce_competitor_research">
                电商竞品研究
              </option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="research-industry">目标行业</label>
            <input
              id="research-industry"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="research-category">目标品类</label>
            <input
              id="research-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="research-market">目标市场</label>
            <input
              id="research-market"
              value={market}
              onChange={(event) => setMarket(event.target.value)}
            />
          </div>
          <div className="field wideField">
            <label htmlFor="research-goal">研究目标</label>
            <input
              id="research-goal"
              value={researchGoal}
              onChange={(event) => setResearchGoal(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="panel researchPanel">
        <div>
          <p className="eyebrow">Supplement</p>
          <h3>补充资料（可选）</h3>
        </div>
        <div className="researchSourceGrid">
          <div className="field">
            <label htmlFor="research-urls">URL</label>
            <textarea
              id="research-urls"
              rows={7}
              placeholder="可选，每行一个公开 URL；留空时会先尝试公开搜索发现竞品官网。"
              value={urlsText}
              onChange={(event) => setUrlsText(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="research-csv">CSV</label>
            <textarea
              id="research-csv"
              rows={7}
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="research-manual">手动文本</label>
            <textarea
              id="research-manual"
              rows={7}
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
            />
          </div>
        </div>
        <div className="actionRow">
          <button
            className="primaryButton"
            type="button"
            onClick={handleRunWorkflow}
          >
            生成采集计划并 mock 建库
          </button>
          <button
            className="secondaryButton"
            type="button"
            onClick={handleRunPublicWebWorkflow}
            disabled={isRunningPublicWeb}
          >
            {isRunningPublicWeb ? "公开采集中" : "真实公开采集"}
          </button>
          <button
            className="secondaryButton"
            type="button"
            onClick={handleRun9RouterWorkflow}
            disabled={isRunning9Router}
          >
            {isRunning9Router ? "9router 生成中" : "用 9router 生成报告"}
          </button>
          <button
            className="secondaryButton"
            type="button"
            onClick={handleRunPublicWeb9RouterWorkflow}
            disabled={isRunningPublicWeb9Router}
          >
            {isRunningPublicWeb9Router
              ? "抽取生成中"
              : "公开采集 + 9router 抽取"}
          </button>
          <span>
            mock 不抓真实网页；真实公开采集只处理公开 http/https URL。
          </span>
        </div>
        {modelError ? (
          <div className="statusNote" role="status">
            {modelError}
          </div>
        ) : null}
      </section>

      {result ? (
        <>
          <section className="panel researchPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Source Discovery</p>
                <h3>自动采集计划</h3>
              </div>
              <span className="badge">
                候选源 {sourceDiscoveryPlan?.candidates.length ?? 0}
              </span>
            </div>

            <div className="researchResultGrid">
              {sourceDiscoveryPlan?.candidates.map((candidate) => (
                <article key={candidate.id}>
                  <span>{candidate.method}</span>
                  <strong>{candidate.title}</strong>
                  <p>{candidate.seed}</p>
                  <small>
                    {candidate.status} /{" "}
                    {candidate.expectedDatabases.join(" / ")}
                  </small>
                </article>
              ))}
            </div>
          </section>

          <section className="panel researchPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">
                  {isPublicWebResult ? "Public Crawl" : "Mock Crawl"}
                </p>
                <h3>{isPublicWebResult ? "公开采集结果" : "mock 采集结果"}</h3>
              </div>
              <span className="badge">
                raw documents {result.raw_documents.length}
              </span>
            </div>

            <div className="researchResultGrid">
              <article>
                <span>crawl plan</span>
                <strong>{crawlPlan?.targets.length ?? 0}</strong>
                <p>
                  {isPublicWebResult
                    ? "公开 URL、sitemap、RSS、官网和内容页采集目标。"
                    : "公开搜索、官网、Shopify、RSS 和 CSV 采集目标。"}
                </p>
              </article>
              <article>
                <span>crawl jobs</span>
                <strong>{result.crawl_jobs.length}</strong>
                <p>{result.crawl_runs[0]?.summary}</p>
              </article>
              <article>
                <span>extraction jobs</span>
                <strong>{result.extraction_jobs.length}</strong>
                <p>按数据库目标写入 mock 抽取任务。</p>
              </article>
            </div>

            <div className="resultTableWrap">
              <table className="resultTable">
                <thead>
                  <tr>
                    <th>采集目标</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>运行摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {crawlJobRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.target}</td>
                      <td>{row.kind}</td>
                      <td>{row.status}</td>
                      <td>{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="resultTableWrap">
              <table className="resultTable">
                <thead>
                  <tr>
                    <th>文档</th>
                    <th>类型</th>
                    <th>目标库</th>
                    <th>摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {result.raw_documents.map((document) => (
                    <tr key={document.id}>
                      <td>{document.title}</td>
                      <td>{document.contentType}</td>
                      <td>{document.databaseTargets.join(", ")}</td>
                      <td>{document.excerpt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel researchPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Database Build</p>
                <h3>数据库建设结果</h3>
              </div>
              <span className="badge">九类数据库视图</span>
            </div>

            <div className="databaseGrid">
              {databaseSummaries.map((database) => (
                <article key={database.id}>
                  <span>{database.id}</span>
                  <strong>{database.count}</strong>
                  <p>{database.label}</p>
                  <small>{database.sample ?? "等待数据"}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="panel researchPanel">
            <div>
              <p className="eyebrow">Workflow</p>
              <h3>工作流运行</h3>
            </div>
            <ol className="workflowTimeline">
              {result.workflowSteps.map((step, index) => (
                <li key={step.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                  <em>{step.status}</em>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel researchPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Structured Data</p>
                <h3>结构化结果</h3>
              </div>
              <span className="badge">证据 {result.evidence.length}</span>
            </div>

            <div className="researchResultGrid">
              <article>
                <span>竞品</span>
                <strong>{result.competitors[0]?.name}</strong>
                <p>{result.competitors[0]?.positioning}</p>
              </article>
              <article>
                <span>产品信号</span>
                <strong>{result.product_signals.length}</strong>
                <p>{result.product_signals[0]?.signal}</p>
              </article>
              <article>
                <span>用户痛点</span>
                <strong>{result.pain_points.length}</strong>
                <p>{result.pain_points[0]?.theme}</p>
              </article>
              <article>
                <span>内容信号</span>
                <strong>{result.content_signals.length}</strong>
                <p>{result.content_signals[0]?.topic}</p>
              </article>
            </div>

            <div className="resultTableWrap">
              <table className="resultTable">
                <thead>
                  <tr>
                    <th>机会</th>
                    <th>需求</th>
                    <th>竞争</th>
                    <th>内容缺口</th>
                    <th>商业价值</th>
                    <th>总分</th>
                    <th>审核</th>
                  </tr>
                </thead>
                <tbody>
                  {result.opportunities.map((opportunity) => (
                    <tr key={opportunity.id}>
                      <td>{opportunity.title}</td>
                      <td>{formatScore(opportunity.demandScore)}</td>
                      <td>{formatScore(opportunity.competitionScore)}</td>
                      <td>{formatScore(opportunity.contentGapScore)}</td>
                      <td>{formatScore(opportunity.businessValueScore)}</td>
                      <td>{formatScore(opportunity.totalScore)}</td>
                      <td>{opportunity.reviewStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel researchPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Review</p>
                <h3>人工审核</h3>
              </div>
              <span className="badge">
                {approvedReviewCount}/{reviewItems.length} 已通过
              </span>
            </div>
            <ul className="reviewList">
              {reviewItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.targetType}</strong>
                  <span>{item.targetId}</span>
                  <em>{item.status}</em>
                  <p>{item.note}</p>
                </li>
              ))}
            </ul>
            <div className="actionRow">
              <button
                className="secondaryButton"
                type="button"
                onClick={handleApproveAll}
              >
                全部标记通过
              </button>
              <button
                className="primaryButton"
                type="button"
                onClick={handleGenerateReport}
              >
                生成 Markdown 报告
              </button>
            </div>
          </section>

          {report ? (
            <section className="panel researchPanel">
              <div>
                <p className="eyebrow">Report</p>
                <h3>Markdown 报告</h3>
              </div>
              <div className="mockOutput">
                <span>{result.research_reports[0]?.title}</span>
                <pre>{report}</pre>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
