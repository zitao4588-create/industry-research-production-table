"use client";
import type {
  ResearchWorkflowInput,
  ResearchWorkflowResult,
} from "@industry-research/core";
/* =============================================================================
 * SimpleResearch.tsx — 唯一的「3 步式」体验（普通人一看就懂）
 * -----------------------------------------------------------------------------
 * 定位：帮你做电商竞品研究并生成报告。只有三步：
 *   ① 输入：你想研究哪个品类 / 行业 / 竞品
 *   ② 运行：系统自动找资料、整理竞品、提炼机会
 *   ③ 报告：一份报告 + 竞品表 + 机会清单 + 下载
 *
 * 知识图谱（KnowledgeGraph）是贯穿三步的签名视觉元素：
 *   输入屏做氛围背景 → 运行屏随进度逐节点点亮 → 报告屏展示真实库计数。
 *
 * 后端不动：复用 actions.ts 的 server action、`/api/.../run/stream` 的 SSE、
 * adapters 里的 createModelFromInput / adaptRun / deriveRunState、extras 的
 * renderMarkdown。运行模式固定为 public_web_llm，优先产出结构化竞品/机会报告。
 * ===========================================================================*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type IndustryOsUiPayload,
  runIndustryOsFixtureAction,
  runIndustryResearchAction,
} from "./actions";
import {
  adaptRun,
  createModelFromInput,
  type UIResearchModel,
} from "./adapters/research";
import {
  createRunStartedEvents,
  deriveRunState,
  type RunEvent,
} from "./adapters/run-events";
import { Icon } from "./components/components";
import { renderMarkdown, showToast, Toaster } from "./components/extras";
import {
  type GraphDatabase,
  KnowledgeGraph,
} from "./components/KnowledgeGraph";
import { IndustryOsResult } from "./IndustryOsResult";
import { splitMarkdownSections } from "./report-sections";
import { fetchRunStreamToken } from "./run-stream-token";

const ACCENT = "#34dcc0";
/** 唯一的运行模式：公开采集 + LLM 结构化抽取/报告。 */
const DEFAULT_MODE = "public_web_llm" as const;

/** 输入屏背景图谱的占位数据（与 adapters/research 的九库顺序一致）。 */
const GRAPH_PLACEHOLDER: GraphDatabase[] = [
  "信息源库",
  "竞品库",
  "网站结构库",
  "产品库",
  "关键词库",
  "用户痛点库",
  "内容库",
  "机会库",
  "情报周报库",
].map((label) => ({ label, count: 0 }));

type Phase = "input" | "running" | "error" | "done" | "replay";

type ReportSummary = {
  quality?: {
    status: "usable" | "technical_blocked" | "insufficient_evidence";
    canUseReport: boolean;
    confirmedFindings: number;
    needsReviewFindings: number;
    effectiveEvidence: number;
    technicalFailureCount: number;
  };
  counts: { evidence: number; competitors: number; opportunities: number };
  competitors: Array<{
    name: string;
    channel: string;
    positioning: string;
    market: string;
  }>;
  opportunities: Array<{
    title: string;
    summary: string;
    total: number;
    status: string;
  }>;
};

type ReportPayload = {
  schemaVersion?:
    | "industry_research_run_report.v1"
    | "industry_research_run_report.v2"
    | "industry_research_run_report.v3";
  input?: {
    projectName?: string;
    category?: string;
    market?: string;
  } | null;
  reportMarkdown?: string | null;
  summary?: ReportSummary;
};

/** 从 ?run= 回放时可用的公开数据。 */
type ReplayData = {
  title: string;
  sub: string;
  markdown: string;
  summary?: ReportSummary;
};

/* ----------------------------- 小工具 ----------------------------- */
function parseUrlLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 浏览器侧把字符串存成文件（下载 Markdown 报告用）。 */
function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchReportPayload(runId: string): Promise<ReportPayload> {
  const response = await fetch(
    `/api/industry-research/runs/${encodeURIComponent(runId)}/report`,
  );
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as ReportPayload;
}

/** 单输入 → 完整 ResearchWorkflowInput：行业/市场/目标用合理默认值。 */
function buildInput(
  query: string,
  urlText: string,
  market: string,
  timeRange: string,
  researchGoal: string,
): ResearchWorkflowInput {
  const q = query.trim();
  return {
    projectName: `${q} 行业研究`,
    industry: q,
    category: q,
    market: market.trim(),
    researchGoal: `${researchGoal.trim()}；时间范围：${timeRange.trim()}`,
    templateId: "ecommerce_competitor_research",
    urls: parseUrlLines(urlText),
    csvText: "",
    manualText: "",
  };
}

/** 从结果模型生成一份普通人能读的 Markdown 报告（客户端、任何模式都可用）。 */
function buildReportMarkdown(model: UIResearchModel): string {
  const p = model.project;
  const top = [...model.opportunities]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const opps = top.length
    ? top
        .map(
          (o, i) =>
            `${i + 1}. **${o.title}**（综合评分 ${o.total}）— ${o.summary}`,
        )
        .join("\n")
    : "- 本轮暂无机会清单";
  const pains = model.painPoints.length
    ? model.painPoints
        .slice(0, 3)
        .map((pp) => `- ${pp.theme}：${pp.need}`)
        .join("\n")
    : "- 本轮暂无明显痛点";
  const comps = model.competitors.length
    ? model.competitors
        .slice(0, 5)
        .map((c) => `- ${c.name}（${c.channel}）：${c.positioning}`)
        .join("\n")
    : "- 本轮暂无竞品";
  return `# ${p.name}

**行业** ${p.industry} ｜ **品类** ${p.category} ｜ **市场** ${p.market}
**研究目标** ${p.goal}

## 摘要
基于公开信息源建立竞品与机会画像，共沉淀 ${model.stats.evidence} 条可溯源证据。

## 高分机会
${opps}

## 主要竞品
${comps}

## 高频用户痛点
${pains}

## 下一步
- 把高分机会转化为产品 / 内容选题
- 用公开渠道持续监控竞品更新`;
}

/** UIDatabaseSummary → KnowledgeGraph 的输入。 */
function toGraphDatabases(
  databases: Array<{ label: string; count: number }>,
): GraphDatabase[] {
  return databases.map((db) => ({ label: db.label, count: db.count }));
}

/* =============================== App ================================ */
export default function SimpleResearch() {
  const [phase, setPhase] = useState<Phase>("input");
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("线上电商 / DTC");
  const [timeRange, setTimeRange] = useState("近 24 个月");
  const [researchGoal, setResearchGoal] = useState(
    "理解行业结构、竞品与待验证机会",
  );
  const [urlText, setUrlText] = useState("");
  const [showUrls, setShowUrls] = useState(false);

  const [events, setEvents] = useState<RunEvent[]>([]);
  const [skeleton, setSkeleton] = useState<UIResearchModel | null>(null);
  const [model, setModel] = useState<UIResearchModel | null>(null);
  const [indeterminate, setIndeterminate] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [remoteReport, setRemoteReport] = useState<ReportPayload | null>(null);
  const [industryOsPayload, setIndustryOsPayload] =
    useState<IndustryOsUiPayload | null>(null);
  const [industryOsFixtureMode, setIndustryOsFixtureMode] = useState(false);

  const runSeq = useRef(0);

  // 主题挂到 <html>，让 globals.css 的 CSS 变量解析。
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.setProperty("--accent", ACCENT);
    requestAnimationFrame(() =>
      document.documentElement.classList.add("booted"),
    );
  }, []);

  // 同一路由的本地 G9 验收开关；不出现在产品模式选择中，也不访问网络。
  useEffect(() => {
    const fixture =
      new URLSearchParams(window.location.search).get("fixture") ===
      "industry-os";
    setIndustryOsFixtureMode(fixture);
    if (fixture) {
      setQuery("护肤品");
      setMarket("中国大陆");
      setTimeRange("2024-2026");
      setResearchGoal("建立行业结构、覆盖状态与待验证机会地图");
    }
  }, []);

  // ?run=<id> 回放：从运行记录 API 取报告，直接进入报告屏。
  useEffect(() => {
    const sharedRunId = new URLSearchParams(window.location.search).get("run");
    if (!sharedRunId) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await fetchReportPayload(sharedRunId);
        const markdown = payload.reportMarkdown || "";
        if (cancelled || !markdown) throw new Error("empty");
        const input = payload.input;
        setRunId(sharedRunId);
        setReplay({
          title: input?.projectName || "行业研究报告",
          sub:
            input?.category && input?.market
              ? `${input.category} · ${input.market}`
              : `运行记录 ${sharedRunId}`,
          markdown,
          summary: payload.summary,
        });
        setPhase("replay");
      } catch {
        if (!cancelled) {
          showToast("没有找到这条运行记录，或当前环境未开放读取", "spark");
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 完成后读取持久化报告，让当前结果与分享回放使用同一内容；失败时保留本地模型。
  useEffect(() => {
    if (phase !== "done" || !runId) return;
    let cancelled = false;
    void fetchReportPayload(runId)
      .then((payload) => {
        if (!cancelled) setRemoteReport(payload);
      })
      .catch(() => {
        // 本地适配结果已可展示，持久化报告读取失败不阻断完成页。
      });
    return () => {
      cancelled = true;
    };
  }, [phase, runId]);

  const startRun = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      showToast("请先填写要研究的品类 / 行业 / 竞品", "spark");
      return;
    }
    if (!market.trim() || !timeRange.trim() || !researchGoal.trim()) {
      showToast("请补全市场、时间范围和研究目标", "spark");
      return;
    }
    const invalidUrls = parseUrlLines(urlText).filter(
      (u) => !/^https?:\/\//i.test(u),
    );
    if (invalidUrls.length) {
      showToast("竞品网址必须是公开 http/https 链接", "spark");
      return;
    }

    const input = buildInput(q, urlText, market, timeRange, researchGoal);
    const skel = createModelFromInput(input);
    const seq = ++runSeq.current;
    setErrorMsg(null);
    setShowErrorDetail(false);
    setModel(null);
    setRemoteReport(null);
    setIndustryOsPayload(null);
    setIndeterminate(false);
    setSkeleton(skel);
    setEvents(createRunStartedEvents(skel));
    setPhase("running");

    const applySuccess = (
      result: ResearchWorkflowResult,
      nextRunId?: string | null,
    ) => {
      setModel(adaptRun(result));
      setRunId(nextRunId ?? null);
      window.history.replaceState(
        null,
        "",
        nextRunId
          ? `?run=${encodeURIComponent(nextRunId)}`
          : window.location.pathname,
      );
      setEvents((xs) => [
        ...xs,
        { type: "run.done", at: new Date().toISOString() },
      ]);
      setTimeout(() => {
        if (runSeq.current === seq) setPhase("done");
      }, 200);
    };
    const applyError = (message: string) => {
      setIndeterminate(false);
      setErrorMsg(message);
      setPhase("error");
    };

    if (industryOsFixtureMode) {
      const fixtureResult = await runIndustryOsFixtureAction();
      if (runSeq.current !== seq) return;
      if (!fixtureResult.ok) {
        applyError(fixtureResult.error);
        return;
      }
      setIndustryOsPayload(fixtureResult.payload);
      setEvents((xs) => [
        ...xs,
        { type: "run.done", at: new Date().toISOString() },
      ]);
      setTimeout(() => {
        if (runSeq.current === seq) setPhase("done");
      }, 200);
      return;
    }

    // ---- 优先订阅 SSE 流式进度 ----
    try {
      const runToken = await fetchRunStreamToken();
      const response = await fetch("/api/industry-research/run/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-industry-research-run-token": runToken,
        },
        body: JSON.stringify({ mode: DEFAULT_MODE, input }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`stream ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let settled = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const payload = part.replace(/^data: ?/, "").trim();
          if (!payload) continue;
          let frame: {
            control?: string;
            result?: ResearchWorkflowResult;
            deliveryPackage?: { runId?: string } | null;
            message?: string;
          };
          try {
            frame = JSON.parse(payload);
          } catch {
            continue;
          }
          if (runSeq.current !== seq) return;
          if (frame.control === "result" && frame.result) {
            applySuccess(frame.result, frame.deliveryPackage?.runId);
            settled = true;
          } else if (frame.control === "error") {
            applyError(frame.message ?? "运行失败");
            settled = true;
          } else if (!frame.control) {
            setEvents((xs) => [...xs, frame as unknown as RunEvent]);
          }
        }
      }
      if (runSeq.current !== seq) return;
      if (settled) return;
      throw new Error("stream ended without result");
    } catch {
      if (runSeq.current !== seq) return;
    }

    // ---- 回退：非流式 server action（不确定态）----
    setIndeterminate(true);
    const res = await runIndustryResearchAction(input, DEFAULT_MODE);
    if (runSeq.current !== seq) return;
    setIndeterminate(false);
    if (!res.ok) {
      applyError(res.error);
      return;
    }
    applySuccess(res.result, res.deliveryPackage?.runId);
  }, [industryOsFixtureMode, market, query, researchGoal, timeRange, urlText]);

  const resetToInput = useCallback(() => {
    runSeq.current++; // 让任何在途 run 的回调作废
    setPhase("input");
    setEvents([]);
    setModel(null);
    setErrorMsg(null);
    setIndeterminate(false);
    setRunId(null);
    setReplay(null);
    setRemoteReport(null);
    setIndustryOsPayload(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <div className="sr-app">
      <header className="sr-header">
        <div className="sr-brand">行研生产台</div>
      </header>

      <main className="sr-main">
        {phase === "input" && (
          <InputScreen
            query={query}
            setQuery={setQuery}
            market={market}
            setMarket={setMarket}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            researchGoal={researchGoal}
            setResearchGoal={setResearchGoal}
            urlText={urlText}
            setUrlText={setUrlText}
            showUrls={showUrls}
            setShowUrls={setShowUrls}
            onStart={startRun}
          />
        )}
        {phase === "running" && skeleton && (
          <RunningScreen
            events={events}
            skeleton={skeleton}
            indeterminate={indeterminate}
            industryOs={industryOsFixtureMode}
          />
        )}
        {phase === "error" && (
          <ErrorScreen
            message={errorMsg}
            showDetail={showErrorDetail}
            toggleDetail={() => setShowErrorDetail((v) => !v)}
            onRetry={startRun}
            onBack={resetToInput}
          />
        )}
        {phase === "done" && industryOsPayload && (
          <IndustryOsResult
            payload={industryOsPayload}
            onRestart={resetToInput}
          />
        )}
        {phase === "done" && !industryOsPayload && model && (
          <DoneScreen
            model={model}
            runId={runId}
            remoteReport={remoteReport}
            onRestart={resetToInput}
          />
        )}
        {phase === "replay" && replay && (
          <ReplayScreen data={replay} onRestart={resetToInput} />
        )}
      </main>

      <Toaster />
    </div>
  );
}

/* ============================== 输入 =============================== */
function InputScreen({
  query,
  setQuery,
  market,
  setMarket,
  timeRange,
  setTimeRange,
  researchGoal,
  setResearchGoal,
  urlText,
  setUrlText,
  showUrls,
  setShowUrls,
  onStart,
}: {
  query: string;
  setQuery: (v: string) => void;
  market: string;
  setMarket: (v: string) => void;
  timeRange: string;
  setTimeRange: (v: string) => void;
  researchGoal: string;
  setResearchGoal: (v: string) => void;
  urlText: string;
  setUrlText: (v: string) => void;
  showUrls: boolean;
  setShowUrls: (v: boolean) => void;
  onStart: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 桌面自动聚焦；触屏不主动拉起软键盘。
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);
  return (
    <div className="sr-hero">
      <div className="sr-hero-viz" aria-hidden>
        <KnowledgeGraph
          databases={GRAPH_PLACEHOLDER}
          progress={1}
          building={false}
          accent={ACCENT}
          height={560}
          showLabels={false}
        />
      </div>
      <div className="sr-hero-content">
        <div className="sr-title-wrap">
          <h1 className="sr-title">
            输入一个行业，
            <br />
            得到一份可追溯研究报告
          </h1>
        </div>

        <div className="console">
          <div className="console-body">
            <div className="field">
              <label htmlFor="sr-query">品类 / 行业 / 竞品</label>
              <input
                id="sr-query"
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onStart();
                }}
                placeholder="例如：宠物肠胃益生菌"
              />
            </div>
            <div className="sr-coordinate-grid">
              <div className="field">
                <label htmlFor="sr-market">市场 / 地区</label>
                <input
                  id="sr-market"
                  value={market}
                  onChange={(event) => setMarket(event.target.value)}
                  placeholder="例如：中国大陆"
                />
              </div>
              <div className="field">
                <label htmlFor="sr-time-range">时间范围</label>
                <input
                  id="sr-time-range"
                  value={timeRange}
                  onChange={(event) => setTimeRange(event.target.value)}
                  placeholder="例如：2024-2026"
                />
              </div>
            </div>
            <div className="field sr-goal-field">
              <label htmlFor="sr-research-goal">研究目标</label>
              <input
                id="sr-research-goal"
                value={researchGoal}
                onChange={(event) => setResearchGoal(event.target.value)}
                placeholder="例如：理解行业结构与待验证机会"
              />
            </div>
            <div className="sr-examples">
              <span>试试</span>
              {["宠物肠胃益生菌", "大豆蜡香薰", "电解质气泡水"].map(
                (example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setQuery(example);
                      inputRef.current?.focus();
                    }}
                  >
                    {example}
                  </button>
                ),
              )}
            </div>

            <button
              type="button"
              className={`supplement-toggle${showUrls ? " open" : ""}`}
              onClick={() => setShowUrls(!showUrls)}
              aria-expanded={showUrls}
              data-mobile-control="true"
            >
              <Icon name="chevron" size={15} />
              竞品网址（可选）— 留空将自动公开搜索
            </button>
            {showUrls && (
              <div className="field fade-in sr-url-field">
                <textarea
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                  placeholder={"每行一个公开 URL\n留空将自动公开搜索竞品官网"}
                />
              </div>
            )}
          </div>
          <div className="console-foot">
            <span className="note">
              自动找资料 · 整理竞品 · 提炼机会，约 2-4 分钟
            </span>
            <div className="spacer" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStart}
              disabled={
                !query.trim() ||
                !market.trim() ||
                !timeRange.trim() ||
                !researchGoal.trim()
              }
            >
              <Icon name="play" size={15} />
              开始研究
            </button>
          </div>
        </div>
        <p className="sr-hint">将自动建立 9 类行业数据库，全部结论可溯源</p>
      </div>
    </div>
  );
}

/* ============================== 运行 =============================== */
const LEGACY_MILESTONES = ["找资料", "整理竞品", "提炼机会"];
const INDUSTRY_OS_MILESTONES = [
  "研究规划",
  "广度扫描",
  "代表抽样",
  "模块研究",
  "跨模块综合",
  "报告与知识地图",
];

function RunningScreen({
  events,
  skeleton,
  indeterminate,
  industryOs,
}: {
  events: RunEvent[];
  skeleton: UIResearchModel;
  indeterminate: boolean;
  industryOs: boolean;
}) {
  const d = useMemo(() => deriveRunState(events, skeleton), [events, skeleton]);
  const pct = Math.round(d.progress * 100);
  const milestones = industryOs ? INDUSTRY_OS_MILESTONES : LEGACY_MILESTONES;
  const stage = Math.min(
    milestones.length,
    Math.floor(d.progress * milestones.length),
  );
  const headline = indeterminate
    ? "正在研究，请稍候…"
    : industryOs
      ? `${milestones[Math.min(stage, milestones.length - 1)]}…`
      : ["正在找资料…", "正在整理竞品…", "正在提炼机会…", "即将完成…"][stage];
  const graphDatabases = useMemo(
    () => toGraphDatabases(d.databases),
    [d.databases],
  );

  return (
    <div className="run-stage sr-running-stage">
      <KnowledgeGraph
        databases={graphDatabases}
        progress={indeterminate ? 0.9 : Math.max(0.12, d.progress)}
        building={!d.done}
        accent={ACCENT}
        height={430}
      />
      <div className="run-stage-overlay">
        <div className="run-stage-top">
          <div>
            <h2>{skeleton.project.name}</h2>
            <div className="now">
              <span className="spin" />
              {headline}
            </div>
          </div>
          {!indeterminate && (
            <div className="run-pct">
              <b>{pct}%</b>
              <span>progress</span>
            </div>
          )}
        </div>

        <div>
          {!indeterminate && d.logs.length > 0 && (
            <div className="sr-feed" aria-live="polite">
              {d.logs.slice(0, 3).map((line, i) => (
                <div key={`${line}-${i}`}>{line}</div>
              ))}
            </div>
          )}
          <div
            className="sr-progress-track"
            role="progressbar"
            aria-valuenow={indeterminate ? undefined : pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="研究进度"
          >
            <div
              className={`sr-progress-value${indeterminate ? " indeterminate" : ""}`}
              style={{ width: indeterminate ? "100%" : `${Math.max(4, pct)}%` }}
            />
          </div>
          <div className="sr-milestones">
            {milestones.map((label, i) => {
              const done = i < stage;
              const active = i === stage;
              const color = done
                ? "var(--accent)"
                : active
                  ? "var(--ink)"
                  : "var(--faint)";
              return (
                <div key={label} className="sr-milestone" style={{ color }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 99,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      border: `1.5px solid ${color}`,
                      background: done ? "var(--accent)" : "transparent",
                      color: done ? "#04201b" : color,
                    }}
                  >
                    {done ? <Icon name="check" size={11} /> : i + 1}
                  </span>
                  <span className={active ? "active" : undefined}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== 失败 =============================== */
function ErrorScreen({
  message,
  showDetail,
  toggleDetail,
  onRetry,
  onBack,
}: {
  message: string | null;
  showDetail: boolean;
  toggleDetail: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div
      className="console"
      style={{ marginTop: 40, padding: "40px 28px", textAlign: "center" }}
    >
      <h3 style={{ fontSize: 20, margin: "0 0 10px" }}>研究失败</h3>
      <p
        style={{
          color: "var(--ink-2)",
          fontSize: 14,
          lineHeight: 1.7,
          maxWidth: 440,
          margin: "0 auto 22px",
        }}
      >
        可能是网络或数据源暂时不可用。稍等片刻重试，或换一个品类关键词再试一次。
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          <Icon name="play" size={14} />
          重试
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          onClick={toggleDetail}
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            cursor: "pointer",
            textDecoration: "underline",
            background: "none",
            border: 0,
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          {showDetail ? "收起详情" : "查看详情"}
        </button>
        {showDetail && message && (
          <pre
            style={{
              marginTop: 12,
              textAlign: "left",
              fontSize: 11.5,
              color: "var(--ink-2)",
              background: "var(--line)",
              borderRadius: 10,
              padding: "12px 14px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--font-mono)",
            }}
          >
            {message}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ============================== 报告 =============================== */
async function shareReport(title: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url: window.location.href });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast("报告链接已复制", "copy");
  } catch {
    showToast("复制失败，请手动复制地址栏链接", "spark");
  }
}

function reportSummaryFromModel(model: UIResearchModel): ReportSummary {
  return {
    counts: {
      evidence: model.stats.evidence,
      competitors: model.competitors.length,
      opportunities: model.opportunities.length,
    },
    competitors: model.competitors.slice(0, 5).map((item) => ({
      name: item.name,
      channel: item.channel,
      positioning: item.positioning,
      market: item.market,
    })),
    opportunities: [...model.opportunities]
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((item) => ({
        title: item.title,
        summary: item.summary,
        total: item.total,
        status: item.status,
      })),
  };
}

function graphFromSummary(summary?: ReportSummary): GraphDatabase[] {
  return GRAPH_PLACEHOLDER.map((item) => {
    if (!summary) return item;
    if (item.label === "信息源库") {
      return { ...item, count: summary.counts.evidence };
    }
    if (item.label === "竞品库") {
      return { ...item, count: summary.counts.competitors };
    }
    if (item.label === "机会库") {
      return { ...item, count: summary.counts.opportunities };
    }
    return item;
  });
}

function DoneScreen({
  model,
  runId,
  remoteReport,
  onRestart,
}: {
  model: UIResearchModel;
  runId: string | null;
  remoteReport: ReportPayload | null;
  onRestart: () => void;
}) {
  const localMarkdown = useMemo(() => buildReportMarkdown(model), [model]);
  const localSummary = useMemo(() => reportSummaryFromModel(model), [model]);
  const graphDatabases = useMemo(
    () => toGraphDatabases(model.databases),
    [model.databases],
  );
  const markdown = remoteReport?.reportMarkdown || localMarkdown;
  const summary = remoteReport?.summary || localSummary;

  return (
    <ReportView
      title={model.project.name}
      sub={`${model.project.industry} · ${model.project.category} · ${model.project.market}`}
      markdown={markdown}
      summary={summary}
      graphDatabases={graphDatabases}
      runId={runId}
      onRestart={onRestart}
    />
  );
}

/* ====================== 回放（?run= 分享链接） ====================== */
function ReplayScreen({
  data,
  onRestart,
}: {
  data: ReplayData;
  onRestart: () => void;
}) {
  const sharedRunId =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("run");

  return (
    <ReportView
      title={data.title}
      sub={`${data.sub} · 来自运行记录`}
      markdown={data.markdown}
      summary={data.summary}
      graphDatabases={graphFromSummary(data.summary)}
      runId={sharedRunId}
      onRestart={onRestart}
    />
  );
}

function ReportView({
  title,
  sub,
  markdown,
  summary,
  graphDatabases,
  runId,
  onRestart,
}: {
  title: string;
  sub: string;
  markdown: string;
  summary?: ReportSummary;
  graphDatabases: GraphDatabase[];
  runId: string | null;
  onRestart: () => void;
}) {
  const sections = useMemo(() => splitMarkdownSections(markdown), [markdown]);
  const counts = summary?.counts ?? {
    evidence: 0,
    competitors: 0,
    opportunities: 0,
  };
  const download = () => {
    downloadBlob(
      `${title || "research"}-报告.md`,
      markdown,
      "text/markdown;charset=utf-8",
    );
    showToast("报告已下载", "copy");
  };

  if (summary?.quality && !summary.quality.canUseReport) {
    const isTechnical = summary.quality.status === "technical_blocked";

    return (
      <article className="view sr-report-view sr-report-failure">
        <div className="sr-report-head">
          <div>
            <div className="sr-report-eyebrow">本次研究未完成</div>
            <h1>{title}</h1>
            <p>{sub}</p>
          </div>
        </div>

        <section className="sr-failure-card">
          <span className="sr-failure-badge">
            {isTechnical ? "运行出现技术问题" : "公开证据不足"}
          </span>
          <h2>
            {isTechnical
              ? "这次没有生成可用的行业报告"
              : "目前还不能形成可靠的行业结论"}
          </h2>
          <p className="sr-failure-lead">
            {isTechnical
              ? `资料采集或处理过程中出现了 ${summary.quality.technicalFailureCount} 个问题，并且没有形成任何已确认发现。`
              : "系统没有找到足够多、能回到原网页核对的有效资料。"}
          </p>

          <dl className="sr-failure-metrics">
            <div>
              <dt>已确认发现</dt>
              <dd>{summary.quality.confirmedFindings}</dd>
            </div>
            <div>
              <dt>待核查线索</dt>
              <dd>{summary.quality.needsReviewFindings}</dd>
            </div>
            <div>
              <dt>技术问题</dt>
              <dd>{summary.quality.technicalFailureCount}</dd>
            </div>
          </dl>

          <div className="sr-failure-explanation">
            <div>
              <span>这意味着什么</span>
              <strong>本次研究失败了，需要重新采集和验证资料。</strong>
            </div>
            <div>
              <span>这不意味着什么</span>
              <strong>不代表这个行业没有机会，也不代表应该停止商业化。</strong>
            </div>
            <div>
              <span>下一步</span>
              <strong>
                重新搜索公开市场，只保留与目标品类直接相关、能核对原文的材料。
              </strong>
            </div>
          </div>

          <div className="sr-failure-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRestart}
            >
              <Icon name="spark" size={14} />
              重新研究
            </button>
            <details>
              <summary>查看技术记录</summary>
              <div className="report report-md">{renderMarkdown(markdown)}</div>
            </details>
          </div>
        </section>
      </article>
    );
  }

  return (
    <article className="view sr-report-view">
      <div className="sr-report-head">
        <div>
          <div className="sr-report-eyebrow">研究结果</div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        <ReportActions
          className="sr-actions-desktop"
          title={title}
          canShare={Boolean(runId)}
          onDownload={download}
          onRestart={onRestart}
        />
      </div>

      <div className="run-stage sr-report-graph">
        <KnowledgeGraph
          databases={graphDatabases}
          progress={1}
          building={false}
          accent={ACCENT}
          height={300}
        />
        <div className="run-stage-overlay sr-report-graph-overlay">
          <div className="run-stage-bottom">
            <div className="c">
              <b>{counts.evidence}</b>
              <span>可溯源证据</span>
            </div>
            <div className="c">
              <b>{counts.competitors}</b>
              <span>竞品</span>
            </div>
            <div className="c">
              <b>{counts.opportunities}</b>
              <span>机会</span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">
        <h2>高分机会</h2>
        <span className="line" />
        <span className="meta">{counts.opportunities} 条</span>
      </div>
      <OpportunityList rows={summary?.opportunities ?? []} />

      <div className="section-title">
        <h2>主要竞品</h2>
        <span className="line" />
        <span className="meta">{counts.competitors} 个</span>
      </div>
      <CompetitorList rows={summary?.competitors ?? []} />

      <div className="section-title">
        <h2>完整报告</h2>
        <span className="line" />
      </div>
      <div className="report report-md sr-report-desktop">
        {renderMarkdown(markdown)}
      </div>
      <div className="sr-report-mobile">
        {sections.map((section, index) => (
          <details key={`${section.title}-${index}`} open={index === 0}>
            <summary>
              <span>{section.title}</span>
              <Icon name="chevron" size={15} />
            </summary>
            <div className="report report-md">
              {renderMarkdown(section.markdown)}
            </div>
          </details>
        ))}
      </div>

      <ReportActions
        className="sr-actions-mobile"
        title={title}
        canShare={Boolean(runId)}
        onDownload={download}
        onRestart={onRestart}
      />
    </article>
  );
}

function ReportActions({
  className,
  title,
  canShare,
  onDownload,
  onRestart,
}: {
  className: string;
  title: string;
  canShare: boolean;
  onDownload: () => void;
  onRestart: () => void;
}) {
  return (
    <div className={`sr-report-actions ${className}`}>
      {canShare ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void shareReport(title)}
        >
          <Icon name="source" size={14} />
          分享报告
        </button>
      ) : null}
      <button type="button" className="btn btn-ghost" onClick={onDownload}>
        <Icon name="download" size={14} />
        下载
      </button>
      <button type="button" className="btn btn-ghost" onClick={onRestart}>
        <Icon name="spark" size={14} />
        再研究
      </button>
    </div>
  );
}

function CompetitorList({ rows }: { rows: ReportSummary["competitors"] }) {
  if (!rows.length) {
    return (
      <p className="sr-empty-copy">
        本轮没有抽取到竞品。换一个更具体的品类，或在输入时加上竞品网址，再试一次。
      </p>
    );
  }
  return (
    <>
      <div className="table-wrap sr-competitor-table">
        <table className="data">
          <thead>
            <tr>
              <th>竞品</th>
              <th>渠道</th>
              <th>定位</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((competitor) => (
              <tr key={`${competitor.name}-${competitor.channel}`}>
                <td>
                  <div className="name">{competitor.name}</div>
                  <div className="desc">{competitor.market}</div>
                </td>
                <td>{competitor.channel}</td>
                <td>
                  <div className="desc sr-positioning">
                    {competitor.positioning}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sr-competitor-cards">
        {rows.map((competitor) => (
          <article
            key={`${competitor.name}-${competitor.channel}`}
            className="sr-competitor-card"
          >
            <div className="sr-competitor-card-head">
              <h3>{competitor.name}</h3>
              <span>{competitor.channel}</span>
            </div>
            <p>{competitor.positioning}</p>
            <small>{competitor.market}</small>
          </article>
        ))}
      </div>
    </>
  );
}

function OpportunityList({ rows }: { rows: ReportSummary["opportunities"] }) {
  if (!rows.length) {
    return <p className="sr-empty-copy">本轮没有产出机会清单。</p>;
  }
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  return (
    <div className="sr-opportunity-list">
      {sorted.map((opportunity, index) => (
        <article key={opportunity.title} className="card sr-opportunity-card">
          <div className="sr-opportunity-rank">{index + 1}</div>
          <div className="sr-opportunity-copy">
            <h3>{opportunity.title}</h3>
            <p>{opportunity.summary}</p>
          </div>
          <div className="sr-opportunity-score">
            <b>{opportunity.total}</b>
            <span> /100</span>
          </div>
        </article>
      ))}
    </div>
  );
}
