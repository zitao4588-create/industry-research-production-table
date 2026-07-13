"use client";

import { useMemo } from "react";
import type { IndustryOsUiPayload } from "./actions";
import { Icon } from "./components/components";
import { renderMarkdown, showToast } from "./components/extras";
import {
  type GraphDatabase,
  KnowledgeGraph,
} from "./components/KnowledgeGraph";
import { splitMarkdownSections } from "./report-sections";

const ACCENT = "#34dcc0";

function downloadReport(title: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title}-Industry-OS-报告.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Industry OS 报告已下载", "copy");
}

const relationshipLabels: Record<string, string> = {
  direct_competitor: "直接竞品",
  supply_chain_actor: "供应链参与者",
  channel_actor: "渠道参与者",
  content_actor: "内容参与者",
  business_model_analogy: "商业模式类比",
};

export function IndustryOsResult({
  payload,
  onRestart,
}: {
  payload: IndustryOsUiPayload;
  onRestart: () => void;
}) {
  const {
    industryPlan,
    representativeSamplePlan,
    moduleResults,
    reportBundle,
  } = payload;
  const reportSections = useMemo(
    () => splitMarkdownSections(reportBundle.reportMarkdown),
    [reportBundle.reportMarkdown],
  );
  const graphDatabases = useMemo<GraphDatabase[]>(
    () => [
      ...moduleResults.moduleResults.map((module) => ({
        label: module.moduleName,
        count: module.claims.length,
      })),
      {
        label: "Claim Ledger",
        count: reportBundle.claimLedger.entries.length,
      },
      {
        label: "Coverage",
        count: moduleResults.moduleResults.flatMap((module) => module.coverage)
          .length,
      },
      {
        label: "知识地图",
        count: reportBundle.knowledgeMap.nodes.length,
      },
    ],
    [moduleResults, reportBundle],
  );
  const axisGroups = [
    ["分类轴", industryPlan.taxonomy],
    ["产业链", industryPlan.valueChain],
    ["价格带", industryPlan.priceTiers],
    ["渠道", industryPlan.channels],
    ["消费者需求", industryPlan.consumerNeeds],
    ["商业模式", industryPlan.businessModels],
  ] as const;
  const title = `${industryPlan.inputCoordinates.industry} Industry OS`;
  const runtime = payload.runtime;
  const isContractFixture = payload.evidenceMode === "contract_fixture";

  return (
    <article
      className="view sr-report-view ios-result"
      data-testid="industry-os-result"
    >
      <header className="sr-report-head ios-result-head">
        <div>
          <div className="sr-report-eyebrow">Industry Research OS</div>
          <h1>{title}</h1>
          <p>
            {industryPlan.inputCoordinates.market} ·{" "}
            {industryPlan.inputCoordinates.timeRange}
          </p>
        </div>
        <div className="ios-head-actions">
          <span className="ios-contract-badge">
            {isContractFixture
              ? "CONTRACT ONLY · 非行业事实"
              : "PUBLIC EVIDENCE · 公开证据"}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadReport(title, reportBundle.reportMarkdown)}
          >
            <Icon name="download" size={14} />
            下载报告
          </button>
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            再次研究
          </button>
        </div>
      </header>

      <section
        className="ios-coordinate-card"
        aria-labelledby="ios-coordinate-title"
      >
        <div>
          <span>研究坐标</span>
          <h2 id="ios-coordinate-title">{industryPlan.scope.definition}</h2>
        </div>
        <dl>
          <div>
            <dt>行业</dt>
            <dd>{industryPlan.inputCoordinates.industry}</dd>
          </div>
          <div>
            <dt>市场</dt>
            <dd>{industryPlan.inputCoordinates.market}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{industryPlan.inputCoordinates.timeRange}</dd>
          </div>
          <div>
            <dt>目标</dt>
            <dd>{industryPlan.inputCoordinates.researchGoals.join("；")}</dd>
          </div>
        </dl>
      </section>

      <section className="ios-section" aria-labelledby="ios-stage-title">
        <div className="section-title">
          <h2 id="ios-stage-title">六阶段进度</h2>
          <span className="line" />
          <span className="meta">
            {runtime.progress.completedStages} / {runtime.progress.totalStages}
            checkpoints
          </span>
        </div>
        <ol className="ios-stage-list">
          {payload.stages.map((stage, index) => (
            <li key={stage.id}>
              <span>{index + 1}</span>
              <div>
                <b>{stage.label}</b>
                <small>{stage.status}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ios-section" aria-labelledby="ios-runtime-title">
        <div className="section-title">
          <h2 id="ios-runtime-title">运行状态与费用</h2>
          <span className="line" />
          <span className="meta">公开安全摘要</span>
        </div>
        <div className="ios-runtime-grid">
          <div className="ios-runtime-card">
            <span>阶段</span>
            <b>
              {runtime.progress.completedStages}/{runtime.progress.totalStages}
            </b>
            <small>已完成</small>
          </div>
          <div className="ios-runtime-card">
            <span>Coverage</span>
            <b>
              {runtime.coverage.passedRows}/{runtime.coverage.totalRows}
            </b>
            <small>通过行</small>
          </div>
          <div className="ios-runtime-card">
            <span>研究缺口</span>
            <b>{runtime.gaps.length}</b>
            <small>缺口 {runtime.gaps.length}</small>
          </div>
          <div className="ios-runtime-card">
            <span>本轮费用</span>
            <b>¥{runtime.usage.costYuan.toFixed(3)}</b>
            <small>
              public {runtime.usage.publicRequests} · search{" "}
              {runtime.usage.searchRequests}
              {" · "}crawl {runtime.usage.firecrawlRequests} · LLM{" "}
              {runtime.usage.llmRequests}
            </small>
          </div>
        </div>
        <div className="ios-runtime-meta">
          <span>存储：复用 Supabase / 本地 8 文件交付</span>
          <span>进度：复用同源 SSE run/stream</span>
          <span>
            本页写入：{runtime.persistence.writePerformed ? "是" : "否"}
          </span>
        </div>
        {runtime.gaps.length > 0 && (
          <ul className="ios-runtime-gaps">
            {runtime.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="ios-section" aria-labelledby="ios-plan-title">
        <div className="section-title">
          <h2 id="ios-plan-title">Industry Plan</h2>
          <span className="line" />
          <span className="meta">{industryPlan.plannerStatus}</span>
        </div>
        <div className="ios-axis-grid">
          {axisGroups.map(([label, items]) => (
            <div className="ios-axis-card" key={label}>
              <div>
                <span>{label}</span>
                <b>{items.length}</b>
              </div>
              <p>{items.map((item) => item.label).join(" · ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ios-section" aria-labelledby="ios-coverage-title">
        <div className="section-title">
          <h2 id="ios-coverage-title">Coverage Matrix</h2>
          <span className="line" />
          <span className="meta">
            {industryPlan.coverageMatrix.length} rows
          </span>
        </div>
        <div className="ios-coverage-list">
          {moduleResults.moduleResults.flatMap((module) =>
            module.coverage.map((row) => (
              <div className="ios-coverage-row" key={row.coverageRowId}>
                <div>
                  <b>{row.coverageRowId}</b>
                  <span>{module.moduleName}</span>
                </div>
                <div className="ios-coverage-metrics">
                  <span>
                    来源 {row.independentSourceIds.length}/
                    {row.target.minIndependentSources}
                  </span>
                  <span>
                    角色 {row.sourceRoles.length}/{row.target.minSourceRoles}
                  </span>
                  <span>
                    样本 {row.representativeSampleIds.length}/
                    {row.target.minRepresentativeSamples}
                  </span>
                </div>
                <span className={`ios-status ios-status-${row.status}`}>
                  {row.status}
                </span>
              </div>
            )),
          )}
        </div>
      </section>

      <section className="ios-section" aria-labelledby="ios-sample-title">
        <div className="section-title">
          <h2 id="ios-sample-title">Representative Samples</h2>
          <span className="line" />
          <span className="meta">
            {representativeSamplePlan.selectedSamples.length} contract samples
          </span>
        </div>
        <div className="ios-sample-grid">
          {representativeSamplePlan.selectedSamples.map((sample) => (
            <div className="ios-sample-card" key={sample.id}>
              <div>
                <b>{sample.name}</b>
                <span>{relationshipLabels[sample.relationshipToIndustry]}</span>
              </div>
              <p>{sample.selectionReason}</p>
              <small>{sample.evidenceGaps.join(" · ") || "无缺口"}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="ios-section" aria-labelledby="ios-module-title">
        <div className="section-title">
          <h2 id="ios-module-title">六个研究模块</h2>
          <span className="line" />
          <span className="meta">{moduleResults.status}</span>
        </div>
        <div className="ios-module-grid">
          {moduleResults.moduleResults.map((module) => (
            <div className="ios-module-card" key={module.moduleId}>
              <div>
                <span>{module.moduleId}</span>
                <span
                  className={`ios-status ios-status-${module.status === "complete" ? "pass" : "blocked"}`}
                >
                  {module.status}
                </span>
              </div>
              <h3>{module.moduleName}</h3>
              <p>
                {module.claims.length} claims · {module.coverage.length}{" "}
                coverage rows
              </p>
              {module.gaps.length > 0 && (
                <small>{module.gaps.join("；")}</small>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="ios-section" aria-labelledby="ios-graph-title">
        <div className="section-title">
          <h2 id="ios-graph-title">知识地图摘要</h2>
          <span className="line" />
          <span className="meta">
            {reportBundle.knowledgeMap.nodes.length} nodes ·{" "}
            {reportBundle.knowledgeMap.edges.length} edges
          </span>
        </div>
        <div className="run-stage ios-knowledge-graph">
          <KnowledgeGraph
            databases={graphDatabases}
            progress={1}
            building={false}
            accent={ACCENT}
            height={300}
          />
          <div className="run-stage-overlay sr-report-graph-overlay">
            <div className="ios-graph-summary">
              <div>
                <b>{reportBundle.claimLedger.entries.length}</b>
                <span>ledger entries</span>
              </div>
              <div>
                <b>{reportBundle.claimLedger.counts.eligible}</b>
                <span>eligible facts</span>
              </div>
              <div>
                <b>{reportBundle.claimLedger.counts.contract_only}</b>
                <span>contract only</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ios-section" aria-labelledby="ios-report-title">
        <div className="section-title">
          <h2 id="ios-report-title">12 章行业报告</h2>
          <span className="line" />
          <span className="meta">{reportBundle.chapters.length} chapters</span>
        </div>
        <div className="report report-md sr-report-desktop ios-report-desktop">
          {renderMarkdown(reportBundle.reportMarkdown)}
        </div>
        <div className="sr-report-mobile ios-report-mobile">
          {reportSections.map((section, index) => (
            <details key={`${section.title}-${index}`} open={index === 0}>
              <summary>
                <span>{section.title}</span>
                <Icon name="chevron" size={14} />
              </summary>
              <div className="report report-md">
                {renderMarkdown(section.markdown)}
              </div>
            </details>
          ))}
        </div>
      </section>
    </article>
  );
}
