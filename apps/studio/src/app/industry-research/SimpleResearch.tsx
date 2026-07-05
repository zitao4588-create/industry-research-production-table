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
 * renderMarkdown。运行模式固定为 public_web，保证无 LLM 成本也能稳定交付。
 * ===========================================================================*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runIndustryResearchAction } from "./actions";
import {
  adaptRun,
  createModelFromInput,
  type UICompetitor,
  type UIOpportunity,
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
import { fetchRunStreamToken } from "./run-stream-token";

const ACCENT = "#34dcc0";
/** 唯一的运行模式：真实公开采集，无 LLM 成本也能稳定交付。 */
const DEFAULT_MODE = "public_web" as const;

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

type Phase = "input" | "running" | "error" | "done";

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

/** 单输入 → 完整 ResearchWorkflowInput：行业/市场/目标用合理默认值。 */
function buildInput(query: string, urlText: string): ResearchWorkflowInput {
  const q = query.trim();
  return {
    projectName: `${q} 竞品研究`,
    industry: q,
    category: q,
    market: "线上电商 / DTC",
    researchGoal: "找到可切入的产品与内容机会",
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
  const [urlText, setUrlText] = useState("");
  const [showUrls, setShowUrls] = useState(false);

  const [events, setEvents] = useState<RunEvent[]>([]);
  const [skeleton, setSkeleton] = useState<UIResearchModel | null>(null);
  const [model, setModel] = useState<UIResearchModel | null>(null);
  const [indeterminate, setIndeterminate] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);

  const runSeq = useRef(0);

  // 主题挂到 <html>，让 globals.css 的 CSS 变量解析。
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.setProperty("--accent", ACCENT);
    requestAnimationFrame(() =>
      document.documentElement.classList.add("booted"),
    );
  }, []);

  const startRun = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      showToast("请先填写要研究的品类 / 行业 / 竞品", "spark");
      return;
    }
    const invalidUrls = parseUrlLines(urlText).filter(
      (u) => !/^https?:\/\//i.test(u),
    );
    if (invalidUrls.length) {
      showToast("竞品网址必须是公开 http/https 链接", "spark");
      return;
    }

    const input = buildInput(q, urlText);
    const skel = createModelFromInput(input);
    const seq = ++runSeq.current;
    setErrorMsg(null);
    setShowErrorDetail(false);
    setModel(null);
    setIndeterminate(false);
    setSkeleton(skel);
    setEvents(createRunStartedEvents(skel));
    setPhase("running");

    const applySuccess = (result: ResearchWorkflowResult) => {
      setModel(adaptRun(result));
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
            message?: string;
          };
          try {
            frame = JSON.parse(payload);
          } catch {
            continue;
          }
          if (runSeq.current !== seq) return;
          if (frame.control === "result" && frame.result) {
            applySuccess(frame.result);
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
    applySuccess(res.result);
  }, [query, urlText]);

  const resetToInput = useCallback(() => {
    runSeq.current++; // 让任何在途 run 的回调作废
    setPhase("input");
    setEvents([]);
    setModel(null);
    setErrorMsg(null);
    setIndeterminate(false);
  }, []);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 880,
          margin: "0 auto",
          padding: "22px 24px 8px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ fontWeight: 700, letterSpacing: ".3px" }}>行研生产台</div>
      </header>

      <main
        style={{ maxWidth: 880, margin: "0 auto", padding: "8px 24px 64px" }}
      >
        {phase === "input" && (
          <InputScreen
            query={query}
            setQuery={setQuery}
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
        {phase === "done" && model && (
          <DoneScreen model={model} onRestart={resetToInput} />
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
  urlText,
  setUrlText,
  showUrls,
  setShowUrls,
  onStart,
}: {
  query: string;
  setQuery: (v: string) => void;
  urlText: string;
  setUrlText: (v: string) => void;
  showUrls: boolean;
  setShowUrls: (v: boolean) => void;
  onStart: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 进入输入屏时自动聚焦主输入框（替代被 a11y 规则禁用的 autoFocus）。
  useEffect(() => {
    inputRef.current?.focus();
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
        />
      </div>
      <div className="sr-hero-content">
        <div style={{ textAlign: "center", margin: "32px 0 24px" }}>
          <h1 style={{ fontSize: 30, margin: "0 0 12px", lineHeight: 1.25 }}>
            帮你做电商竞品研究，
            <br />
            一键生成报告
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 15,
              lineHeight: 1.7,
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            输入一个品类、行业或竞品，系统会自动找资料、整理竞品、提炼机会，给你一份可下载的报告。
          </p>
        </div>

        <div className="console">
          <div className="console-body">
            <div className="field">
              <label htmlFor="sr-query">你想研究哪个品类 / 行业 / 竞品？</label>
              <input
                id="sr-query"
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onStart();
                }}
                placeholder="例如：宠物肠胃益生菌 / 大豆蜡香薰 / 电解质气泡水"
              />
            </div>

            <button
              type="button"
              className={`supplement-toggle${showUrls ? " open" : ""}`}
              onClick={() => setShowUrls(!showUrls)}
              aria-expanded={showUrls}
              style={{
                width: "100%",
                textAlign: "left",
                background: "none",
                borderRight: 0,
                borderBottom: 0,
                borderLeft: 0,
                paddingRight: 0,
                paddingLeft: 0,
                paddingBottom: 0,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <Icon name="chevron" size={15} />
              竞品网址（可选）— 留空将自动公开搜索
            </button>
            {showUrls && (
              <div className="field fade-in" style={{ marginTop: 12 }}>
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
              点击开始后，自动找资料 · 整理竞品 · 提炼机会，约一两分钟。
            </span>
            <div className="spacer" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStart}
              disabled={!query.trim()}
              style={
                !query.trim()
                  ? { opacity: 0.5, cursor: "not-allowed" }
                  : undefined
              }
            >
              <Icon name="play" size={15} />
              开始研究
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== 运行 =============================== */
const MILESTONES = ["找资料", "整理竞品", "提炼机会"];

function RunningScreen({
  events,
  skeleton,
  indeterminate,
}: {
  events: RunEvent[];
  skeleton: UIResearchModel;
  indeterminate: boolean;
}) {
  const d = useMemo(() => deriveRunState(events, skeleton), [events, skeleton]);
  const pct = Math.round(d.progress * 100);
  // 0 找资料 · 1 整理竞品 · 2 提炼机会 · 3 完成
  const stage = pct < 34 ? 0 : pct < 67 ? 1 : pct < 100 ? 2 : 3;
  const headline = indeterminate
    ? "正在研究，请稍候…"
    : ["正在找资料…", "正在整理竞品…", "正在提炼机会…", "即将完成…"][stage];
  const graphDatabases = useMemo(
    () => toGraphDatabases(d.databases),
    [d.databases],
  );

  return (
    <div className="run-stage" style={{ marginTop: 40 }}>
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
          <div
            style={{
              height: 6,
              borderRadius: 99,
              background: "var(--line)",
              overflow: "hidden",
              maxWidth: 520,
            }}
            role="progressbar"
            aria-valuenow={indeterminate ? undefined : pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="研究进度"
          >
            <div
              style={{
                height: "100%",
                width: indeterminate ? "100%" : `${Math.max(4, pct)}%`,
                background: "var(--accent)",
                opacity: indeterminate ? 0.55 : 1,
                transition: "width .45s ease",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 14,
              flexWrap: "wrap",
            }}
          >
            {MILESTONES.map((label, i) => {
              const done = i < stage;
              const active = i === stage;
              const color = done
                ? "var(--accent)"
                : active
                  ? "var(--ink)"
                  : "var(--faint)";
              return (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color,
                  }}
                >
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
                  <span
                    style={{ fontSize: 13.5, fontWeight: active ? 600 : 400 }}
                  >
                    {label}
                  </span>
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
function DoneScreen({
  model,
  onRestart,
}: {
  model: UIResearchModel;
  onRestart: () => void;
}) {
  const markdown = useMemo(() => buildReportMarkdown(model), [model]);
  const graphDatabases = useMemo(
    () => toGraphDatabases(model.databases),
    [model.databases],
  );

  const download = () => {
    downloadBlob(
      `${model.project.name || "research"}-报告.md`,
      markdown,
      "text/markdown;charset=utf-8",
    );
    showToast("报告已下载", "copy");
  };

  return (
    <div className="view" style={{ paddingTop: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, margin: 0 }}>{model.project.name}</h2>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {model.project.industry} · {model.project.category} ·{" "}
            {model.project.market}
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={download}>
          <Icon name="download" size={14} />
          下载报告
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          <Icon name="spark" size={14} />
          再研究一次
        </button>
      </div>

      <div className="run-stage" style={{ marginTop: 14 }}>
        <KnowledgeGraph
          databases={graphDatabases}
          progress={1}
          building={false}
          accent={ACCENT}
          height={300}
        />
        <div
          className="run-stage-overlay"
          style={{ justifyContent: "flex-end" }}
        >
          <div className="run-stage-bottom">
            <div className="c">
              <b>{model.stats.evidence}</b>
              <span>可溯源证据</span>
            </div>
            <div className="c">
              <b>{model.competitors.length}</b>
              <span>竞品</span>
            </div>
            <div className="c">
              <b>{model.opportunities.length}</b>
              <span>机会</span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">
        <h2 style={{ fontSize: 18 }}>研究报告</h2>
        <span className="line" />
      </div>
      <div className="report report-md" style={{ maxHeight: "none" }}>
        {renderMarkdown(markdown)}
      </div>

      <div className="section-title">
        <h2 style={{ fontSize: 18 }}>竞品</h2>
        <span className="line" />
        <span className="meta">{model.competitors.length} 个</span>
      </div>
      <CompetitorList rows={model.competitors} />

      <div className="section-title">
        <h2 style={{ fontSize: 18 }}>机会清单</h2>
        <span className="line" />
        <span className="meta">{model.opportunities.length} 条</span>
      </div>
      <OpportunityList rows={model.opportunities} />
    </div>
  );
}

function CompetitorList({ rows }: { rows: UICompetitor[] }) {
  if (!rows.length) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 2px" }}>
        本轮没有抽取到竞品。换一个更具体的品类，或在输入时加上竞品网址，再试一次。
      </p>
    );
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>竞品</th>
            <th>渠道</th>
            <th>定位</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <td>
                <div className="name">{c.name}</div>
                <div className="desc">{c.market}</div>
              </td>
              <td>{c.channel}</td>
              <td>
                <div
                  className="desc"
                  style={{ color: "var(--ink-2)", maxWidth: "40ch" }}
                >
                  {c.positioning}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpportunityList({ rows }: { rows: UIOpportunity[] }) {
  if (!rows.length) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 2px" }}>
        本轮没有产出机会清单。
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map((o, i) => (
        <div
          key={i}
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "14px 18px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              fontWeight: 700,
              color: "var(--accent)",
              width: 26,
              textAlign: "center",
            }}
          >
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{o.title}</div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.55,
              }}
            >
              {o.summary}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <b style={{ fontSize: 20 }}>{o.total}</b>
            <span style={{ fontSize: 12, color: "var(--muted)" }}> /100</span>
          </div>
        </div>
      ))}
    </div>
  );
}
