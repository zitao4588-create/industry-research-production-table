"use client";
/* =============================================================================
 * IndustryResearchWorkbench.tsx — REFERENCE ASSEMBLY (props/model version)
 * -----------------------------------------------------------------------------
 * 这是 source/app.jsx 的装配逻辑,改写为对接 Codex 已建的 UIResearchModel +
 * deriveRunState 事件流。类名与 source/app.jsx / globals.css 严格一致(契约)。
 *
 * 依赖(均已在仓库或本移植包中):
 *   ./components/components      ← porting/tsx/components.tsx
 *   ./components/KnowledgeGraph  ← porting/tsx/KnowledgeGraph.tsx
 *   ./components/micro           ← porting/tsx/micro.tsx
 *   ./components/extras          ← porting/tsx/extras.tsx
 *   ./adapters/research          ← Codex 已建(createModelFromInput / adaptRun / 类型)
 *   ./adapters/run-events        ← Codex 已建(deriveRunState / createMockRunEventTimeline / RunEvent)
 *   @industry-research/core      ← runMockIndustryResearchWorkflow 等
 *
 * 放置:apps/studio/src/app/industry-research/IndustryResearchWorkbench.tsx
 * 四个组件放:apps/studio/src/app/industry-research/components/
 *
 * 真实后端接入点只有一个 —— 见 §RUN「TODO: 真实事件流」。其余皆纯展示。
 * ===========================================================================*/
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon, Logo, StatusPill, Score, TotalPill, FreqBars, useCountUp, type ReviewStatus } from "./components/components";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { DbMicro, StatSpark, Radar, InlineBar, PriceScale } from "./components/micro";
import { CommandPalette, Toaster, showToast, renderMarkdown, type NavTarget } from "./components/extras";
import { EvidenceCell } from "./components/EvidencePopover";
import { EmptyTable } from "./components/states";
import {
  adaptRun,
  createModelFromInput,
  type UIResearchModel,
  type UICompetitor,
  type UIProduct,
  type UIPainPoint,
  type UIContentSignal,
  type UIKeyword,
  type UIOpportunity,
  type UIWeeklyReport,
} from "./adapters/research";
import {
  createMockRunEventTimeline,
  createRunStartedEvents,
  deriveRunState,
  type RunEvent,
} from "./adapters/run-events";
import {
  runMockIndustryResearchWorkflow,
  type ResearchReviewItem,
  type ResearchWorkflowInput,
  type ResearchWorkflowResult,
} from "@industry-research/core";
import {
  downloadDeliveryPackageAction,
  reviewReportAction,
  runIndustryResearchAction,
} from "./actions";

type CSSVars = CSSProperties & Record<string, string | number>;
type Phase = "setup" | "running" | "done";
type RunMode = "Mock" | "DeepSeek" | "Public Web" | "Public + DeepSeek";

const ACCENT = "#34dcc0";
const CONTENT_TYPE: Record<string, string> = { exposure: "曝光型", growth: "涨粉型", save: "收藏型", conversion: "转化型", personal_brand: "个人品牌" };
const INTENT: Record<string, string> = { research: "调研", comparison: "对比", purchase: "购买", pain_point: "痛点" };

const NAV = [
  { id: "workbench", label: "研究台", icon: "workbench", group: "工作区" },
  { id: "databases", label: "数据库", icon: "database", count: 9, group: "工作区" },
  { id: "weekly", label: "情报周报", icon: "weekly", count: 4, group: "工作区" },
  { id: "projects", label: "研究项目", icon: "projects", count: 3, group: "资料" },
  { id: "capability", label: "能力评估", icon: "capability", group: "资料" },
  { id: "settings", label: "设置", icon: "settings", group: "资料" },
] as const;

const DEFAULT_INPUT: ResearchWorkflowInput = {
  projectName: "宠物益生菌竞品研究",
  industry: "宠物健康电商",
  category: "宠物肠胃益生菌",
  market: "美国 DTC 电商",
  researchGoal: "找到适合小团队切入的产品和内容机会",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "product,price,tag\nDaily Gut Chews,29.99,digestion",
  manualText: "用户反复提到狗狗软便、换粮后肠胃不适、希望成分天然。",
};

/** UI 运行模式 → 真实 API 模式（Mock 留本地，不走 API）。 */
type UiRealMode = "deepseek" | "public_web" | "public_web_deepseek";
const REAL_RUN_MODE: Record<Exclude<RunMode, "Mock">, UiRealMode> = {
  DeepSeek: "deepseek",
  "Public Web": "public_web",
  "Public + DeepSeek": "public_web_deepseek",
};

const REQUIRED_FIELDS: [keyof ResearchWorkflowInput, string][] = [
  ["projectName", "项目名称"],
  ["industry", "目标行业"],
  ["category", "目标品类"],
  ["market", "目标市场"],
  ["researchGoal", "研究目标"],
];

function parseUrlLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 表单校验：必填项 + URL 行 http/https 轻校验（呼应 public_web 采集边界）。 */
function validateResearchInput(input: ResearchWorkflowInput, urlText: string) {
  const missing = REQUIRED_FIELDS.filter(
    ([key]) => !String(input[key] ?? "").trim(),
  ).map(([key]) => key);
  const urls = parseUrlLines(urlText);
  const invalidUrls = urls.filter((url) => !/^https?:\/\//i.test(url));
  return {
    missing,
    missingSet: new Set<keyof ResearchWorkflowInput>(missing),
    urls,
    invalidUrls,
    ok: missing.length === 0 && invalidUrls.length === 0,
  };
}

const ERR_STYLE: CSSProperties = {
  color: "var(--bad)",
  fontSize: 11.5,
  marginTop: 5,
  fontFamily: "var(--font-mono)",
};

/** 无障碍(P1-F):给 div/span 等非按钮可点元素加 Enter/Space 键盘激活。 */
function keyActivate(handler: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}

/** 浏览器侧把字符串内容存成文件(交付包 JSON / CSV 导出共用)。 */
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

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 客户端导出机会表为 CSV(不依赖后端);BOM 让 Excel 正确识别中文。 */
function exportOpportunitiesCsv(model: UIResearchModel) {
  const header = ["机会", "需求", "竞争", "内容缺口", "商业价值", "证据质量", "总分", "审核", "摘要"];
  const rows = [...model.opportunities]
    .sort((a, b) => b.total - a.total)
    .map((o) => [o.title, o.demand, o.competition, o.gap, o.value, o.evidence, o.total, o.status, o.summary]);
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  // ﻿ BOM 前缀，让 Excel 正确识别 UTF-8 中文
  const csv = `﻿${body}\n`;
  downloadBlob(
    `${model.project.name || "opportunities"}-机会评分.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
  showToast("已导出机会 CSV", "copy");
}

/* ===================== 刷新持久化(P1-G) ===================== */
const STORAGE_KEY = "irp.workbench.v1";
type PersistedSnapshot = {
  v: 1;
  runMode: RunMode;
  view: string;
  resultTab: string;
  input: ResearchWorkflowInput;
  urlText: string;
  isMockResult: boolean;
  deliveryRunId: string | null;
  resultModel: UIResearchModel;
  rawResult: ResearchWorkflowResult | null;
};
function loadSnapshot(): PersistedSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSnapshot;
    return parsed?.v === 1 && parsed.resultModel ? parsed : null;
  } catch {
    return null;
  }
}
function saveSnapshot(snapshot: PersistedSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* localStorage 不可用 / 超额时静默跳过 */
  }
}
function clearSnapshot() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/* =============================== App ================================= */
export default function IndustryResearchWorkbench({
  initialModel,
}: {
  /** 可选:服务端已有一次完成的 run 时传入(SSR)。否则从表单创建。 */
  initialModel?: UIResearchModel;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [view, setView] = useState<string>("workbench");
  const [phase, setPhase] = useState<Phase>(initialModel ? "done" : "setup");
  const [runMode, setRunMode] = useState<RunMode>("Mock");
  const [supOpen, setSupOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // 移动端抽屉侧栏(P2-H)
  const [resultTab, setResultTab] = useState("opportunity");

  // 表单(即 ResearchWorkflowInput)
  const [input, setInput] = useState<ResearchWorkflowInput>(DEFAULT_INPUT);
  // URL textarea 原文(运行时按行 split 进 input.urls)
  const [urlText, setUrlText] = useState("");

  // 两份模型:运行期的"目标模型"(知道全部步骤/最终值)+ 完成后的"结果模型"
  const [targetModel, setTargetModel] = useState<UIResearchModel | null>(initialModel ?? null);
  const [resultModel, setResultModel] = useState<UIResearchModel | null>(initialModel ?? null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const timers = useRef<number[]>([]);

  // 真实 run 接入:保留 raw 结果(给审核报告)、runId(给下载)、失败信息与状态标记
  const [rawResult, setRawResult] = useState<ResearchWorkflowResult | null>(null);
  const [deliveryRunId, setDeliveryRunId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isMockResult, setIsMockResult] = useState(false);
  const [indeterminate, setIndeterminate] = useState(false);
  const runSeq = useRef(0);

  // 主题挂到 <html>;主色可改成读你设计系统
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.setProperty("--accent", ACCENT);
    requestAnimationFrame(() => document.documentElement.classList.add("booted"));
  }, [theme]);

  // ⌘K
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  useEffect(() => () => { timers.current.forEach((id) => clearTimeout(id)); }, []);

  // 刷新持久化(P1-G):首帧用默认值(匹配 SSR),挂载后从 localStorage 恢复 done 态,
  // 避免 hydration mismatch;真实 run 等采集 + LLM,刷新丢结果代价大。
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || initialModel) return;
    restored.current = true;
    const snap = loadSnapshot();
    if (!snap) return;
    setRunMode(snap.runMode);
    setView(snap.view);
    setResultTab(snap.resultTab);
    setInput(snap.input);
    setUrlText(snap.urlText);
    setIsMockResult(snap.isMockResult);
    setDeliveryRunId(snap.deliveryRunId);
    setResultModel(snap.resultModel);
    setTargetModel(snap.resultModel);
    setRawResult(snap.rawResult);
    setPhase("done");
  }, [initialModel]);

  // done 态时把结果快照写入 localStorage(切视图 / tab 也同步)。
  useEffect(() => {
    if (phase === "done" && resultModel) {
      saveSnapshot({
        v: 1,
        runMode,
        view,
        resultTab,
        input,
        urlText,
        isMockResult,
        deliveryRunId,
        resultModel,
        rawResult,
      });
    }
  }, [phase, resultModel, runMode, view, resultTab, input, urlText, isMockResult, deliveryRunId, rawResult]);

  /* ============================ §RUN ============================= */
  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  }, []);

  // Mock 模式:本地 mock 结果 + setTimeout 回放编排好的事件时间线(演示数据)。
  const runMockTimeline = useCallback(
    (skeleton: UIResearchModel) => {
      const raw = runMockIndustryResearchWorkflow(input);
      const full = adaptRun(raw);
      setTargetModel(full);
      setRawResult(raw);
      setDeliveryRunId(null);
      setIsMockResult(true);
      setIndeterminate(false);

      const timeline = createMockRunEventTimeline(full);
      clearTimers();
      timeline.forEach((ev) => {
        const id = window.setTimeout(() => {
          setEvents((xs) => [...xs, ev]);
          if (ev.type === "run.done") {
            setResultModel(full);
            timers.current.push(window.setTimeout(() => setPhase("done"), 420));
          }
        }, ev.delayMs);
        timers.current.push(id);
      });
    },
    [input, clearTimers],
  );

  // 真实模式:优先订阅 SSE 流式逐步进度(public_web 细粒度,deriveRunState 直接吃);
  // 流式不可用 / 失败时回退到非流式 server action 的不确定态。失败注入 run.error(P0-B)。
  const runReal = useCallback(
    async (finalInput: ResearchWorkflowInput, mode: UiRealMode, seq: number) => {
      const skeleton = createModelFromInput(finalInput);
      setIsMockResult(false);
      setEvents(createRunStartedEvents(skeleton));

      const applySuccess = (
        result: ResearchWorkflowResult,
        runId: string | null,
      ) => {
        const full = adaptRun(result);
        setRawResult(result);
        setDeliveryRunId(runId);
        setTargetModel(full);
        setResultModel(full);
        setIndeterminate(false);
        setEvents((xs) => [...xs, { type: "run.done", at: new Date().toISOString() }]);
        timers.current.push(window.setTimeout(() => setPhase("done"), 200));
      };
      const applyError = (message: string) => {
        setIndeterminate(false);
        setRunError(message);
        setEvents((xs) => [
          ...xs,
          { type: "run.error", at: new Date().toISOString(), message },
        ]);
      };

      // ---- 完整版:流式订阅 ----
      try {
        setIndeterminate(false);
        const response = await fetch("/api/industry-research/run/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, input: finalInput }),
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
            let frame: { control?: string; result?: ResearchWorkflowResult; deliveryPackage?: { runId?: string } | null; message?: string };
            try {
              frame = JSON.parse(payload);
            } catch {
              continue;
            }
            if (runSeq.current !== seq) return;
            if (frame.control === "result" && frame.result) {
              applySuccess(frame.result, frame.deliveryPackage?.runId ?? null);
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

      // ---- 回退:非流式 server action(不确定态)----
      setIndeterminate(true);
      const res = await runIndustryResearchAction(finalInput, mode);
      if (runSeq.current !== seq) return;
      if (!res.ok) {
        applyError(res.error);
        return;
      }
      applySuccess(res.result, res.deliveryPackage?.runId ?? null);
    },
    [],
  );

  const startRun = useCallback(() => {
    const finalInput: ResearchWorkflowInput = {
      ...input,
      urls: parseUrlLines(urlText),
    };
    const check = validateResearchInput(input, urlText);
    if (!check.ok) {
      showToast(
        check.missing.length
          ? "请先填写所有必填项"
          : "URL 必须是公开 http/https 链接",
        "spark",
      );
      return;
    }

    const seq = ++runSeq.current;
    clearTimers();
    setRunError(null);
    setEvents([]);
    setView("workbench");
    setPhase("running");
    document.querySelector(".main")?.scrollTo({ top: 0 });

    // 先用输入建出"骨架模型"(步骤已知、数据为空),驱动 running 态布局
    setTargetModel(createModelFromInput(finalInput));

    if (runMode === "Mock") {
      runMockTimeline(createModelFromInput(finalInput));
      return;
    }
    void runReal(finalInput, REAL_RUN_MODE[runMode], seq);
  }, [input, urlText, runMode, clearTimers, runMockTimeline, runReal]);

  // 失败后从失败态原地重试当前模式。
  const retryRun = useCallback(() => {
    setRunError(null);
    startRun();
  }, [startRun]);

  const reset = useCallback(() => {
    runSeq.current++; // 让任何在途真实 run 的回调作废
    clearTimers();
    clearSnapshot();
    setRunError(null); setIndeterminate(false);
    setPhase("setup"); setView("workbench"); setEvents([]);
  }, [clearTimers]);

  const onNavigate = useCallback((target: NavTarget) => {
    if (!target) return;
    // P2-J:只有已有结果且不在运行中时,命令面板才允许跳到结果态;
    // 否则跑到一半搜一下不会被强行甩出运行态。
    const canShowResult = Boolean(resultModel) && phase !== "running";
    if (target.done && canShowResult) setPhase("done");
    if (target.tab && canShowResult) setResultTab(target.tab);
    setView(target.view || "workbench");
    setTimeout(() => {
      if (target.tab && canShowResult) document.querySelector(".deep")?.scrollIntoView({ behavior: "smooth", block: "start" });
      else document.querySelector(".main")?.scrollTo({ top: 0, behavior: "smooth" });
    }, 60);
  }, [resultModel, phase]);

  const setField =
    (k: keyof ResearchWorkflowInput) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setInput((f) => ({ ...f, [k]: e.target.value }));

  const searchModel = resultModel ?? targetModel ?? createModelFromInput(input);

  return (
    <div className="app">
      <Sidebar view={view} setView={(v) => { setView(v); setNavOpen(false); }} runMode={runMode} phase={phase} open={navOpen} />
      <div className={"nav-backdrop" + (navOpen ? " open" : "")} onClick={() => setNavOpen(false)} aria-hidden="true" />
      <main className="main scroll">
        <Topbar theme={theme} toggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} phase={phase} projectName={input.projectName} reset={reset} view={view} onOpenCmd={() => setCmdOpen(true)} onToggleNav={() => setNavOpen((o) => !o)} />

        {phase === "setup" && view === "workbench" && (
          <Setup input={input} setField={setField} urlText={urlText} setUrlText={setUrlText} runMode={runMode} setRunMode={setRunMode} supOpen={supOpen} setSupOpen={setSupOpen} startRun={startRun} skeletonDatabases={createModelFromInput(input).databases} />
        )}
        {phase === "running" && view === "workbench" && targetModel && (
          <Running model={targetModel} events={events} input={input} runMode={runMode} indeterminate={indeterminate} runError={runError} onRetry={retryRun} onBack={reset} isMock={isMockResult} />
        )}
        {phase === "done" && view === "workbench" && resultModel && (
          <Results model={resultModel} runMode={runMode} tab={resultTab} setTab={setResultTab} result={rawResult} runId={deliveryRunId} isMock={isMockResult} run />
        )}

        {view === "databases" && (phase === "done" && resultModel
          ? <Results model={resultModel} runMode={runMode} tab={resultTab} setTab={setResultTab} result={rawResult} runId={deliveryRunId} isMock={isMockResult} jumpDb />
          : <NeedRun reset={() => setView("workbench")} label="数据库视图" />)}
        {view === "weekly" && (phase === "done" && resultModel
          ? <WeeklyView wk={resultModel.weekly} />
          : <NeedRun reset={() => setView("workbench")} label="情报周报" />)}
        {view === "projects" && resultModel && <ProjectsView model={resultModel} setView={setView} />}
        {view === "projects" && !resultModel && <ProjectsView model={createModelFromInput(input)} setView={setView} />}
        {view === "capability" && <CapabilityView />}
        {view === "settings" && <SettingsView />}
      </main>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} D={searchModel} onNavigate={onNavigate} />
      <Toaster />
    </div>
  );
}

/* ============================= Sidebar ============================== */
function Sidebar({ view, setView, runMode, phase, open }: { view: string; setView: (v: string) => void; runMode: string; phase: Phase; open?: boolean }) {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand">
        <div className="brand-mark"><Logo /></div>
        <div>
          <div className="brand-name">行研生产台</div>
          <div className="brand-sub">Research · Production</div>
        </div>
      </div>
      {groups.map((g) => (
        <div key={g}>
          <div className="nav-group-label">{g}</div>
          {NAV.filter((n) => n.group === g).map((n) => (
            <div key={n.id} className={"nav-item" + (view === n.id ? " active" : "")} onClick={() => setView(n.id)} role="button" tabIndex={0} onKeyDown={keyActivate(() => setView(n.id))} aria-current={view === n.id ? "page" : undefined} aria-label={n.label}>
              <Icon name={n.icon} size={16} />
              <span>{n.label}</span>
              {"count" in n && n.count != null && <span className="count">{n.count}</span>}
            </div>
          ))}
        </div>
      ))}
      <div className="rail-spacer" />
      <div className="rail-card">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="label">运行模式</span>
          <span className="dot" />
        </div>
        <div className="row">
          <span className="mode">{runMode}</span>
          <span className="label" style={{ textTransform: "none", letterSpacing: 0 }}>{phase === "done" ? "已建库" : phase === "running" ? "采集中" : "待运行"}</span>
        </div>
      </div>
    </aside>
  );
}

/* ============================= Topbar =============================== */
function Topbar({ theme, toggleTheme, phase, projectName, reset, view, onOpenCmd, onToggleNav }: {
  theme: "dark" | "light"; toggleTheme: () => void; phase: Phase; projectName: string; reset: () => void; view: string; onOpenCmd: () => void; onToggleNav: () => void;
}) {
  const viewLabel = NAV.find((n) => n.id === view)?.label || "研究台";
  return (
    <div className="topbar">
      <button className="chip nav-burger" onClick={onToggleNav} aria-label="打开导航菜单" title="导航"><Icon name="workbench" size={15} /></button>
      <div className="crumb">行业研究 / <b>{viewLabel}</b></div>
      {view === "workbench" && phase !== "setup" && (
        <div className="crumb" style={{ color: "var(--accent)" }}>· {projectName}</div>
      )}
      <div className="spacer" />
      <div className="search-pill" onClick={onOpenCmd} title="命令面板" role="button" tabIndex={0} onKeyDown={keyActivate(onOpenCmd)} aria-label="打开命令面板，检索数据库与证据">
        <Icon name="search" size={14} /><span className="lbl">检索数据库 · 证据</span><span className="k">⌘K</span>
      </div>
      <span className="topbar-div" />
      {phase === "done" && view === "workbench" && (
        <button className="chip" onClick={reset}><Icon name="spark" size={14} />新研究</button>
      )}
      <button className="chip" onClick={toggleTheme}>
        <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />{theme === "dark" ? "浅色" : "深色"}
      </button>
    </div>
  );
}

/* ============================== Setup ============================== */
function Setup({ input, setField, urlText, setUrlText, runMode, setRunMode, supOpen, setSupOpen, startRun, skeletonDatabases }: {
  input: ResearchWorkflowInput;
  setField: (k: keyof ResearchWorkflowInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  urlText: string; setUrlText: (v: string) => void;
  runMode: RunMode; setRunMode: (m: RunMode) => void;
  supOpen: boolean; setSupOpen: (v: boolean) => void; startRun: () => void;
  skeletonDatabases: { label: string; count: number }[];
}) {
  const v = validateResearchInput(input, urlText);
  const reqHint = (key: keyof ResearchWorkflowInput) =>
    v.missingSet.has(key) ? <span style={ERR_STYLE}>必填项不能为空</span> : null;
  return (
    <>
      <div className="hero-split">
        <div className="hero-copy">
          <div className="hero-eyebrow"><span className="pulse" />Ecommerce Competitor Research</div>
          <h1>把<em>陌生行业</em>织成一张可检索的情报网。</h1>
          <p className="hero-lede">输入行业、品类与市场，Agent 自动发现公开信息源、规划采集、织入九类行业数据库，产出竞品、痛点、内容与机会评分，并交付可复用的研究报告。</p>
          <div className="hero-stats">
            <div className="hero-stat"><div className="n">9</div><div className="l">数据库视图</div></div>
            <div className="hero-stat"><div className="n">13</div><div className="l">建库步骤</div></div>
            <div className="hero-stat"><div className="n">6</div><div className="l">信息源类型</div></div>
          </div>
        </div>
        <div className="hero-viz">
          <KnowledgeGraph databases={skeletonDatabases} progress={1} building={false} accent={ACCENT} height={480} />
        </div>
      </div>

      <div className="console">
        <div className="console-head">
          <span className="tt">创建研究项目</span>
          <span className="badge">ecommerce_competitor_research</span>
        </div>
        <div className="console-body">
          <div className="field-grid">
            <div className="field wide">
              <label>项目名称 <span className="req">*</span></label>
              <input value={input.projectName} onChange={setField("projectName")} placeholder="例如：宠物益生菌竞品研究" />
              {reqHint("projectName")}
            </div>
            <div className="field"><label>目标行业 <span className="req">*</span></label><input value={input.industry} onChange={setField("industry")} />{reqHint("industry")}</div>
            <div className="field"><label>目标品类 <span className="req">*</span></label><input value={input.category} onChange={setField("category")} />{reqHint("category")}</div>
            <div className="field"><label>目标市场 <span className="req">*</span></label><input value={input.market} onChange={setField("market")} />{reqHint("market")}</div>
            <div className="field">
              <label>研究模板</label>
              <select value={input.templateId} onChange={setField("templateId")}><option value="ecommerce_competitor_research">电商竞品研究</option></select>
            </div>
            <div className="field wide"><label>研究目标 <span className="req">*</span></label><input value={input.researchGoal} onChange={setField("researchGoal")} />{reqHint("researchGoal")}</div>
          </div>

          <div className={"supplement-toggle" + (supOpen ? " open" : "")} onClick={() => setSupOpen(!supOpen)} role="button" tabIndex={0} onKeyDown={keyActivate(() => setSupOpen(!supOpen))} aria-expanded={supOpen}>
            <Icon name="chevron" size={15} />补充资料（可选）— URL 留空时先用公开搜索发现竞品官网
          </div>
          {supOpen && (
            <div className="supplement-grid fade-in">
              <div className="field">
                <label>URL</label>
                <textarea value={urlText} onChange={(e) => setUrlText(e.target.value)} placeholder={"每行一个公开 URL\n留空将自动公开搜索"} />
                {v.invalidUrls.length > 0 && <span style={ERR_STYLE}>仅支持公开 http/https 链接：{v.invalidUrls[0]}</span>}
              </div>
              <div className="field"><label>CSV</label><textarea value={input.csvText} onChange={setField("csvText")} /></div>
              <div className="field"><label>手动文本</label><textarea value={input.manualText} onChange={setField("manualText")} /></div>
            </div>
          )}
        </div>
        <div className="console-foot">
          <div className="runmode">
            {(["Mock", "DeepSeek", "Public Web", "Public + DeepSeek"] as RunMode[]).map((m) => (
              <button key={m} className={runMode === m ? "on" : ""} onClick={() => setRunMode(m)}>{m}</button>
            ))}
          </div>
          <span className="note" style={!v.ok ? { color: "var(--bad)" } : undefined}>
            {v.missing.length
              ? `还有 ${v.missing.length} 个必填项未填`
              : v.invalidUrls.length
                ? "补充资料里的 URL 必须是公开 http/https 链接"
                : "Mock 不抓真实网页；真实公开采集只处理公开 http/https URL。"}
          </span>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={startRun} disabled={!v.ok} style={!v.ok ? { opacity: 0.5, cursor: "not-allowed" } : undefined} title={v.ok ? undefined : "请先补全必填项与合法 URL"}><Icon name="play" size={15} />开始研究</button>
        </div>
      </div>
    </>
  );
}

/* ============================= Running ============================= */
function Running({ model, events, input, runMode, indeterminate, runError, onRetry, onBack, isMock }: { model: UIResearchModel; events: RunEvent[]; input: ResearchWorkflowInput; runMode: RunMode; indeterminate: boolean; runError: string | null; onRetry: () => void; onBack: () => void; isMock: boolean }) {
  const steps = model.workflowSteps;
  const d = useMemo(() => deriveRunState(events, model), [events, model]);
  const pct = Math.round(d.progress * 100);
  const stepIdx = d.completedSteps;
  const currentTitle = steps.find((s) => s.id === d.currentStepId)?.title || (d.done ? "完成" : steps[Math.min(steps.length - 1, stepIdx)]?.title || "");
  const revealed = d.sourceCandidates;

  return (
    <div className="run-wrap">
      {runError && (
        <div className="run-panel" style={{ marginBottom: 18, borderColor: "var(--bad)", padding: "16px 20px" }}>
          <div className="run-panel-head" style={{ padding: 0, border: 0, marginBottom: 10 }}>
            <div><div className="eyebrow" style={{ color: "var(--bad)" }}>Run failed</div><h3>运行失败</h3></div>
            <span className="badge" style={{ background: "color-mix(in oklch, var(--bad) 16%, transparent)", color: "var(--bad)" }}>{runMode}</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 14px", fontFamily: "var(--font-mono)", wordBreak: "break-word" }}>{runError}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={onRetry}><Icon name="play" size={14} />重试该轮</button>
            <button className="btn btn-ghost" onClick={onBack}>返回表单</button>
          </div>
        </div>
      )}
      <div className="run-stage">
        <KnowledgeGraph databases={d.databases} progress={Math.max(0.04, d.progress)} building accent={ACCENT} height={360} />
        <div className="run-stage-overlay">
          <div className="run-stage-top">
            <div>
              <h2>{input.projectName}</h2>
              <div className="now"><span className="spin" />{runError ? "运行失败" : currentTitle} · {runMode}{isMock && <span className="badge" style={{ marginLeft: 8 }}>演示数据</span>}</div>
            </div>
            <div className="run-pct">
              {runError ? <b style={{ color: "var(--bad)" }}>失败</b> : indeterminate && !d.done ? <b style={{ color: "var(--accent)" }}>运行中</b> : <b>{pct}%</b>}
              <span>{runError ? "已中断" : indeterminate ? "真实采集中" : "Weaving graph"}</span>
            </div>
          </div>
          <div className="run-stage-bottom">
            <div className="c"><b>{d.stats.candidates}</b><span>信息源候选</span></div>
            <div className="c"><b>{d.crawl.completed}</b><span>采集任务</span></div>
            <div className="c"><b>{d.crawl.rawDocs}</b><span>raw docs</span></div>
            <div className="c"><b>{stepIdx}/13</b><span>建库步骤</span></div>
          </div>
        </div>
      </div>

      <div className="run-cols">
        <div className="run-panel">
          <div className="run-panel-head">
            <div><div className="eyebrow">Build pipeline</div><h3>建库流程</h3></div>
            <span className="badge">{stepIdx} / {steps.length}</span>
          </div>
          <div className="steps scroll">
            {steps.map((s, i) => {
              const status = d.stepStatus[s.id];
              const st = status === "done" ? "done" : status === "running" ? "active" : status === "failed" ? "failed" : "pending";
              return (
                <div key={s.id} className={"step " + st}>
                  <div className="step-dot">{st === "done" ? <Icon name="check" size={11} /> : st === "failed" ? <Icon name="x" size={11} /> : i + 1}</div>
                  <div className="step-body"><strong>{s.title}</strong><p>{s.desc}</p></div>
                  <span className="step-tag">{st === "done" ? "done" : st === "active" ? "running" : st === "failed" ? "failed" : "pending"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="run-panel">
          <div className="run-panel-head">
            <div><div className="eyebrow">Source discovery</div><h3>实时信息源发现</h3></div>
            <span className="badge">{revealed.length} / {model.sourceCandidates.length || revealed.length}</span>
          </div>
          <div className="stream scroll">
            {revealed.map((c, i) => (
              <div className="stream-item" key={i}>
                <span className="m">{c.method.replace(/_/g, " ")}</span>
                <span className="t">{c.title}<small>{c.seed}</small></span>
                <span className={"pri " + c.priority}>{c.priority}</span>
              </div>
            ))}
            {revealed.length === 0 && <div style={{ padding: 24, color: "var(--faint)", fontSize: 13, fontFamily: "var(--font-mono)" }}>正在基于行业 / 品类 / 市场生成候选…</div>}
          </div>
        </div>
      </div>

      <div className="run-panel" style={{ marginTop: 22, padding: "18px 22px" }}>
        <div className="run-panel-head" style={{ padding: 0, border: 0, marginBottom: 12 }}>
          <div><div className="eyebrow">Activity log</div></div>
        </div>
        <div className="run-log">
          {d.error && <div className="log-line" style={{ color: "var(--bad)" }}><span className="ts">!!</span>{d.error}</div>}
          {d.logs.slice(0, 5).map((line, i) => (
            <div className="log-line" key={i}><span className="ts mono">{String(8 + i).padStart(2, "0")}:{String((i * 13) % 60).padStart(2, "0")}</span><span className="ok">✓</span>{line}</div>
          ))}
          {d.logs.length === 0 && <div className="log-line"><span className="ts">--:--</span>初始化研究项目…</div>}
        </div>
      </div>
    </div>
  );
}

/* ====================== Featured opportunity ====================== */
function FeaturedOpportunity({ model, onOpen }: { model: UIResearchModel; onOpen: () => void }) {
  const top = [...model.opportunities].sort((a, b) => b.total - a.total)[0];
  const scoreUp = useCountUp(top?.total ?? 0, true, 1100);
  if (!top) return null;
  const axes = [
    { k: "需求", v: top.demand }, { k: "竞争", v: top.competition }, { k: "缺口", v: top.gap },
    { k: "价值", v: top.value }, { k: "证据", v: top.evidence },
  ];
  const dims: [string, number][] = [
    ["需求强度", top.demand], ["竞争态势", top.competition], ["内容缺口", top.gap], ["商业价值", top.value], ["证据质量", top.evidence],
  ];
  return (
    <div className="feature">
      <div className="feature-main">
        <div className="feature-eyebrow"><Icon name="spark" size={13} />最高分机会 · Top opportunity</div>
        <h3>{top.title}</h3>
        <p>{top.summary}</p>
        <div className="feature-dims">
          {dims.map(([k, v], i) => (
            <div className="fdim" key={i}>
              <div className="fdim-head"><span>{k}</span><b>{v}</b></div>
              <div className="fdim-bar"><i style={{ width: v + "%", "--i": i } as CSSVars} /></div>
            </div>
          ))}
        </div>
        <div className="feature-foot">
          <StatusPill status={top.status} />
          <span className="feature-total">综合评分 <b>{top.total}</b></span>
          <button className="btn btn-ghost feature-cta" onClick={onOpen}>查看全部机会<Icon name="arrow" size={15} /></button>
        </div>
      </div>
      <div className="feature-viz">
        <div className="radar-grow"><Radar axes={axes} size={184} /></div>
        <div className="feature-score"><b>{scoreUp}</b><span>/ 100</span></div>
      </div>
    </div>
  );
}

/* ============================= Results ============================= */
const DB_TO_TAB: Record<string, string> = {
  competitor_database: "competitor", product_database: "product", pain_point_database: "pain",
  content_database: "content", opportunity_database: "opportunity", keyword_database: "keyword",
  weekly_intelligence_reports: "weekly",
};

function Results({ model, runMode, tab, setTab, result = null, runId = null, isMock = false, run = false, jumpDb = false }: {
  model: UIResearchModel; runMode: RunMode; tab: string; setTab: (t: string) => void;
  result?: ResearchWorkflowResult | null; runId?: string | null; isMock?: boolean;
  run?: boolean; jumpDb?: boolean;
}) {
  const animate = run && !jumpDb;
  const [reviewedMd, setReviewedMd] = useState<string | null>(null);
  useEffect(() => { if (animate) showToast("研究完成 · 已建立九类行业数据库", "ok"); /* eslint-disable-next-line */ }, []);

  const cands = useCountUp(model.stats.candidates, animate);
  const docs = useCountUp(model.stats.rawDocs, animate);
  const jobs = useCountUp(model.stats.extractionJobs, animate);
  const ev = useCountUp(model.stats.evidence, animate);

  const statCells = [
    { n: cands, l: "信息源候选", sub: "公开搜索 · 官网 · RSS", spark: [3, 6, 5, 9, 12, 16, 20, 24] },
    { n: docs, l: "Raw documents", sub: "采集产出", spark: [2, 4, 7, 6, 10, 14, 17, 19] },
    { n: jobs, l: "抽取任务", sub: "按数据库目标", spark: [1, 3, 6, 9, 13, 18, 23, 27] },
    { n: ev, l: "证据条目", sub: "可溯源引用", spark: [5, 12, 20, 31, 44, 56, 66, 74] },
    { n: 9, l: "数据库视图", sub: "已建库", spark: [1, 2, 3, 4, 6, 7, 8, 9] },
  ];

  const tabs: [string, string, number][] = [
    ["opportunity", "机会评分", model.opportunities.length], ["competitor", "竞品", model.competitors.length],
    ["product", "产品", model.products.length], ["pain", "用户痛点", model.painPoints.length],
    ["content", "内容信号", model.contentSignals.length], ["keyword", "关键词", model.keywords.length], ["weekly", "周报", 1],
  ];

  const jumpToDeep = () => document.querySelector(".deep")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="view">
      <div className="section-title">
        <h2>研究结果</h2>
        <span className="meta">{model.project.industry} · {model.project.category} · {model.project.market}</span>
        <span className="line" />
        <span className="meta">{runMode}{isMock ? " · 演示数据" : ""}</span>
      </div>

      <div className="stat-row">
        {statCells.map((s, i) => (
          <div className="stat-cell" key={i} style={{ "--hue": (i * 14 - 14) + "deg" } as CSSVars}>
            <div className="stat-top"><div className="n">{s.n}</div><StatSpark data={s.spark} /></div>
            <div className="l">{s.l}</div>
            <div className="sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <FeaturedOpportunity model={model} onOpen={() => { setTab("opportunity"); jumpToDeep(); }} />

      <div className="section-title"><h2 style={{ fontSize: 19 }}>九类数据库视图</h2><span className="meta">nine industry databases</span><span className="line" /></div>
      <div className="db-grid">
        {model.databases.map((db, i) => (
          <div className="db-card" key={db.id} style={{ "--hue": (i * 7 - 24) + "deg" } as CSSVars} onClick={() => { const t = DB_TO_TAB[db.id]; if (t) { setTab(t); jumpToDeep(); } }} role="button" tabIndex={0} onKeyDown={keyActivate(() => { const t = DB_TO_TAB[db.id]; if (t) { setTab(t); jumpToDeep(); } })} aria-label={`${db.label}，${db.count} 条`}>
            <div className="db-card-top">
              <div className="ico"><Icon name={db.icon} size={16} /></div>
              <span className="db-count">{db.count}<small>条</small></span>
            </div>
            <div className="id">{db.id}</div>
            <div className="lab">{db.label}</div>
            <div className="sample">{db.sample}</div>
            <div className="db-micro-wrap"><DbMicro id={db.id} model={model} /></div>
            <div className="arrow"><Icon name="arrow" size={16} /></div>
          </div>
        ))}
      </div>

      <div className="deep section-title"><h2 style={{ fontSize: 19 }}>结构化结果</h2><span className="line" /><button className="btn btn-ghost" style={{ padding: "7px 13px", fontSize: 12.5 }} onClick={() => exportOpportunitiesCsv(model)}><Icon name="download" size={14} />导出机会 CSV</button></div>
      <div className="tabs">
        {tabs.map(([id, label, n]) => (
          <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}<span className="num">{n}</span></button>
        ))}
      </div>

      <div className="fade-in" key={tab}>
        {tab === "opportunity" && (model.opportunities.length ? <OppTable rows={model.opportunities} /> : <EmptyTable label="机会评分" />)}
        {tab === "competitor" && (model.competitors.length ? <CompTable rows={model.competitors} /> : <EmptyTable label="竞品" />)}
        {tab === "product" && (model.products.length ? <ProdTable rows={model.products} /> : <EmptyTable label="产品" />)}
        {tab === "pain" && (model.painPoints.length ? <PainTable rows={model.painPoints} /> : <EmptyTable label="用户痛点" />)}
        {tab === "content" && (model.contentSignals.length ? <ContentTable rows={model.contentSignals} /> : <EmptyTable label="内容信号" />)}
        {tab === "keyword" && (model.keywords.length ? <KeywordTable rows={model.keywords} /> : <EmptyTable label="关键词" />)}
        {tab === "weekly" && <WeeklyCard wk={model.weekly} />}
      </div>

      <div className="split">
        <ReviewCard model={model} result={result} onSubmitted={setReviewedMd} />
        <ReportCard model={model} runId={runId} isMock={isMock} reviewedMarkdown={reviewedMd} />
      </div>
    </div>
  );
}

/* ============================== Tables ============================= */
function OppTable({ rows }: { rows: UIOpportunity[] }) {
  const [sortKey, setSortKey] = useState<keyof UIOpportunity>("total");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const cols: [keyof UIOpportunity, string, boolean][] = [
    ["title", "机会", false], ["demand", "需求", true], ["competition", "竞争", true], ["gap", "内容缺口", true],
    ["value", "商业价值", true], ["evidence", "证据质量", true], ["total", "总分", true], ["status", "审核", false],
  ];
  const sorted = [...rows].sort((a, b) => {
    const x = a[sortKey] as number | string, y = b[sortKey] as number | string;
    const r = typeof x === "number" ? (x as number) - (y as number) : String(x).localeCompare(String(y));
    return dir === "asc" ? r : -r;
  });
  const click = (k: keyof UIOpportunity) => { if (sortKey === k) setDir(dir === "asc" ? "desc" : "asc"); else { setSortKey(k); setDir("desc"); } };
  return (
    <div className="table-wrap"><table className="data">
      <thead><tr>{cols.map(([k, l, num]) => (
        <th key={k} scope="col" className={(num ? "num " : "") + (sortKey === k ? "sorted" : "")} onClick={() => click(k)} tabIndex={0} onKeyDown={keyActivate(() => click(k))} aria-sort={sortKey === k ? (dir === "asc" ? "ascending" : "descending") : "none"} title={`按${l}排序`}>{l}<span className="sortcaret" aria-hidden="true">{sortKey === k ? (dir === "asc" ? "▲" : "▼") : "↕"}</span></th>
      ))}</tr></thead>
      <tbody>{sorted.map((o, i) => (
        <tr key={i}>
          <td><div className="name">{o.title}</div><div className="desc">{o.summary}</div></td>
          <td className="num"><Score v={o.demand} /></td>
          <td className="num"><Score v={o.competition} /></td>
          <td className="num"><Score v={o.gap} /></td>
          <td className="num"><Score v={o.value} /></td>
          <td className="num"><EvidenceCell refs={o.evidenceRefs} ariaLabel={`${o.title} 证据质量`}><Score v={o.evidence} /></EvidenceCell></td>
          <td className="num"><TotalPill v={o.total} /></td>
          <td><StatusPill status={o.status} /></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
function CompTable({ rows }: { rows: UICompetitor[] }) {
  const maxEv = Math.max(1, ...rows.map((c) => c.evidence));
  const chMap: Record<string, number> = { "Shopify DTC": 0, "Shopify + Amazon": 26, "Amazon 主导": 52 };
  return (<div className="table-wrap"><table className="data">
    <thead><tr><th>竞品</th><th>渠道</th><th>定位</th><th>网站结构</th><th className="num">证据强度</th></tr></thead>
    <tbody>{rows.map((c, i) => (
      <tr key={i}>
        <td><div className="name">{c.name}</div><div className="desc">{c.market}</div></td>
        <td><span className="chan-tag" style={{ "--hue": (chMap[c.channel] || 0) + "deg" } as CSSVars}><span className="chan-dot" />{c.channel}</span></td>
        <td><div className="desc" style={{ color: "var(--ink-2)", maxWidth: "30ch" }}>{c.positioning}</div></td>
        <td><div className="tags">{c.structure.map((s, j) => <span className="tag" key={j}>{s}</span>)}</div></td>
        <td className="num"><EvidenceCell refs={c.evidenceRefs} ariaLabel={`${c.name} 证据强度`}><InlineBar v={c.evidence} max={maxEv} /></EvidenceCell></td>
      </tr>
    ))}</tbody>
  </table></div>);
}
function ProdTable({ rows }: { rows: UIProduct[] }) {
  const prices = rows.map((p) => parseFloat(String(p.price).replace(/[^0-9.]/g, "")) || 0);
  const min = Math.min(...prices, 0), max = Math.max(...prices, 1);
  const catHue: Record<string, number> = { "软糖": 0, "粉剂": 30, "胶囊": 60 };
  return (<div className="table-wrap"><table className="data">
    <thead><tr><th>产品</th><th>竞品</th><th>品类</th><th className="num" style={{ width: 180 }}>价格定位</th><th>标签</th></tr></thead>
    <tbody>{rows.map((p, i) => (
      <tr key={i}><td><div className="name">{p.name}</div></td><td>{p.competitor}</td>
        <td><span className="chan-tag" style={{ "--hue": (catHue[p.category] || 0) + "deg" } as CSSVars}><span className="chan-dot" />{p.category}</span></td>
        <td className="num"><PriceScale price={prices[i]} min={min} max={max} /></td>
        <td><div className="tags">{p.tags.map((x, j) => <span className="tag tag-accent" key={j}>{x}</span>)}</div></td></tr>
    ))}</tbody>
  </table></div>);
}
function PainTable({ rows }: { rows: UIPainPoint[] }) {
  const maxEv = Math.max(1, ...rows.map((p) => p.evidence));
  return (<div className="table-wrap"><table className="data">
    <thead><tr><th>痛点主题</th><th>用户需求</th><th>频次</th><th className="num">证据</th></tr></thead>
    <tbody>{rows.map((p, i) => (
      <tr key={i}><td><div className="name">{p.theme}</div></td><td><div className="desc" style={{ color: "var(--ink-2)" }}>{p.need}</div></td><td><FreqBars level={p.freq} /></td><td className="num"><EvidenceCell refs={p.evidenceRefs} ariaLabel={`${p.theme} 证据`}><InlineBar v={p.evidence} max={maxEv} /></EvidenceCell></td></tr>
    ))}</tbody>
  </table></div>);
}
function ContentTable({ rows }: { rows: UIContentSignal[] }) {
  const maxEv = Math.max(1, ...rows.map((c) => c.evidence));
  const typeHue: Record<string, number> = { exposure: 0, growth: 24, save: 48, conversion: 72, personal_brand: 96 };
  return (<div className="table-wrap"><table className="data">
    <thead><tr><th>平台</th><th>话题</th><th>内容类型</th><th>为什么有效</th><th className="num">证据</th></tr></thead>
    <tbody>{rows.map((c, i) => (
      <tr key={i}><td><span className="plat-badge">{c.platform}</span></td><td><div className="name">{c.topic}</div></td>
        <td><span className="chan-tag" style={{ "--hue": (typeHue[c.type] || 0) + "deg" } as CSSVars}><span className="chan-dot" />{CONTENT_TYPE[c.type]}</span></td>
        <td><div className="desc" style={{ color: "var(--ink-2)" }}>{c.why}</div></td><td className="num"><EvidenceCell refs={c.evidenceRefs} ariaLabel={`${c.topic} 证据`}><InlineBar v={c.evidence} max={maxEv} /></EvidenceCell></td></tr>
    ))}</tbody>
  </table></div>);
}
function KeywordTable({ rows }: { rows: UIKeyword[] }) {
  const intentHue: Record<string, number> = { research: 0, comparison: 30, purchase: 60, pain_point: 90 };
  return (<div className="table-wrap"><table className="data">
    <thead><tr><th>关键词</th><th>搜索意图</th><th>来源</th></tr></thead>
    <tbody>{rows.map((k, i) => (
      <tr key={i}><td><div className="name mono" style={{ fontSize: 12.5 }}>{k.keyword}</div></td>
        <td><span className="chan-tag" style={{ "--hue": (intentHue[k.intent] || 0) + "deg" } as CSSVars}><span className="chan-dot" />{INTENT[k.intent]}</span></td>
        <td><span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{k.source}</span></td></tr>
    ))}</tbody>
  </table></div>);
}
function WeeklyCard({ wk }: { wk: UIWeeklyReport }) {
  return (
    <div className="weekly-card">
      <div className="wk">{wk.weekOf}</div>
      <h3>{wk.title}</h3>
      <p className="sum">{wk.summary}</p>
      <div className="weekly-grid">
        <div className="col"><h4>新增信号</h4><ul>{wk.newSignals.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        <div className="col"><h4>监控列表 · Watch list</h4><ul>{wk.watchList.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      </div>
    </div>
  );
}

/* ========================== Review + report ======================= */
const REVIEW_TYPE_LABEL: Record<ResearchReviewItem["targetType"], string> = {
  competitor: "competitor",
  product_signal: "product_signal",
  pain_point: "pain_point",
  content_signal: "content_signal",
  opportunity: "opportunity",
};

function ReviewCard({ model, result, onSubmitted }: { model: UIResearchModel; result: ResearchWorkflowResult | null; onSubmitted: (markdown: string) => void }) {
  // 优先用真实 run 结果里的 review items(带真实 id/targetId,可回写后端);
  // 没有结果时(理论上不该发生)退回从 UI 模型派生的只读示意列表。
  const items = useMemo(() => {
    if (result?.reviewItems?.length) {
      const compName = new Map(result.competitors.map((c) => [c.id, c.name]));
      const oppTitle = new Map(result.opportunities.map((o) => [o.id, o.title]));
      return result.reviewItems.map((it) => ({
        id: it.id,
        type: REVIEW_TYPE_LABEL[it.targetType],
        label:
          it.targetType === "competitor"
            ? `${compName.get(it.targetId) ?? it.targetId} · 定位`
            : it.targetType === "opportunity"
              ? (oppTitle.get(it.targetId) ?? it.targetId)
              : it.targetId,
        status: it.status as ReviewStatus,
      }));
    }
    return [
      ...model.opportunities.slice(0, 4).map((o, i) => ({ id: "opp" + i, type: "opportunity", label: o.title, status: o.status as ReviewStatus })),
      ...(model.competitors[0] ? [{ id: "cmp0", type: "competitor", label: model.competitors[0].name + " · 定位", status: "approved" as ReviewStatus }] : []),
      ...(model.painPoints[0] ? [{ id: "pain0", type: "pain_point", label: model.painPoints[0].theme, status: "needs_review" as ReviewStatus }] : []),
    ];
  }, [model, result]);

  const [picks, setPicks] = useState<Record<string, ReviewStatus>>({});
  const [submitting, setSubmitting] = useState(false);
  // items 变化(新一轮 run / 切换结果)时同步初始勾选状态
  useEffect(() => { setPicks(Object.fromEntries(items.map((b) => [b.id, b.status]))); }, [items]);

  const approveAll = () => { setPicks(Object.fromEntries(items.map((b) => [b.id, "approved"]))); showToast("已通过全部 " + items.length + " 项审核", "ok"); };
  const okCount = Object.values(picks).filter((s) => s === "approved").length;

  const submit = async () => {
    if (!result) { showToast("演示数据不回写审核报告", "spark"); return; }
    setSubmitting(true);
    const reviewItems: ResearchReviewItem[] = result.reviewItems.map((it) => ({ ...it, status: picks[it.id] ?? it.status }));
    const res = await reviewReportAction(result, reviewItems);
    setSubmitting(false);
    if (!res.ok) { showToast("提交失败：" + res.error, "spark"); return; }
    onSubmitted(res.markdown);
    showToast("已生成审核版报告", "ok");
  };

  return (
    <div className="card">
      <div className="card-head">
        <div><div className="eyebrow">Human review</div><h3>人工审核</h3></div>
        <span className="right" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: "7px 13px", fontSize: 12.5 }} onClick={approveAll}><Icon name="check" size={14} />全部通过 {okCount}/{items.length}</button>
          <button className="btn btn-primary" style={{ padding: "7px 13px", fontSize: 12.5 }} onClick={submit} disabled={!result || submitting} title={result ? undefined : "演示数据不回写"}><Icon name="spark" size={14} />{submitting ? "提交中…" : "提交审核结果"}</button>
        </span>
      </div>
      <div className="scroll" style={{ maxHeight: 332, overflowY: "auto", margin: "0 -4px", padding: "0 4px" }}>
        {items.map((it) => (
          <div className="review-item" key={it.id}>
            <span className="typ">{it.type}</span>
            <span className="desc">{it.label}</span>
            <span className="review-actions" role="group" aria-label={`${it.label} 审核`}>
              <span className={"ra-btn" + (picks[it.id] === "approved" ? " pick-ok" : "")} onClick={() => setPicks((p) => ({ ...p, [it.id]: "approved" }))} role="button" tabIndex={0} onKeyDown={keyActivate(() => setPicks((p) => ({ ...p, [it.id]: "approved" })))} aria-pressed={picks[it.id] === "approved"} title="通过" aria-label="通过"><Icon name="check" size={13} /></span>
              <span className="ra-btn" style={picks[it.id] === "needs_review" ? { background: "var(--warn)", borderColor: "var(--warn)", color: "#fff" } : undefined} onClick={() => setPicks((p) => ({ ...p, [it.id]: "needs_review" }))} role="button" tabIndex={0} onKeyDown={keyActivate(() => setPicks((p) => ({ ...p, [it.id]: "needs_review" })))} aria-pressed={picks[it.id] === "needs_review"} title="待复核" aria-label="待复核"><Icon name="flag" size={13} /></span>
              <span className={"ra-btn" + (picks[it.id] === "rejected" ? " pick-no" : "")} onClick={() => setPicks((p) => ({ ...p, [it.id]: "rejected" }))} role="button" tabIndex={0} onKeyDown={keyActivate(() => setPicks((p) => ({ ...p, [it.id]: "rejected" })))} aria-pressed={picks[it.id] === "rejected"} title="驳回" aria-label="驳回"><Icon name="x" size={13} /></span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function ReportCard({ model, runId, isMock, reviewedMarkdown }: { model: UIResearchModel; runId: string | null; isMock: boolean; reviewedMarkdown: string | null }) {
  const p = model.project;
  const top = [...model.opportunities].sort((a, b) => b.total - a.total).slice(0, 3);
  const generated = `# ${p.name}\n\n**行业** ${p.industry} ｜ **品类** ${p.category} ｜ **市场** ${p.market}\n**研究目标** ${p.goal}\n\n## 摘要\n基于 ${model.stats.candidates} 个公开信息源候选与 ${model.stats.rawDocs} 份 raw document，建立九类行业数据库，共沉淀 ${model.stats.evidence} 条可溯源证据。\n\n## 高分机会\n${top.map((o, i) => `${i + 1}. **${o.title}**（总分 ${o.total}）— ${o.summary}`).join("\n")}\n\n## 高频用户痛点\n${model.painPoints.slice(0, 3).map((pp) => `- ${pp.theme}：${pp.need}（${pp.freq}）`).join("\n")}\n\n## 内容打法\n${model.contentSignals.slice(0, 3).map((c) => `- [${c.platform}] ${c.topic} — ${c.why}`).join("\n")}\n\n## 下一步\n- 将高分机会转化为产品 / 内容选题\n- 用 RSS / sitemap 持续监控竞品更新，输出周报`;
  // 审核回写后优先展示后端生成的 reviewed_report.md 在线版
  const reviewed = Boolean(reviewedMarkdown);
  const md = reviewedMarkdown ?? generated;
  const [downloading, setDownloading] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(md); showToast("报告已复制到剪贴板", "copy"); };
  const download = async () => {
    if (!runId) return;
    setDownloading(true);
    const res = await downloadDeliveryPackageAction(runId);
    setDownloading(false);
    if (!res.ok) { showToast("下载失败：" + res.error, "spark"); return; }
    downloadBlob(res.filename, res.json, "application/json;charset=utf-8");
    showToast("交付包已下载", "copy");
  };
  return (
    <div className="card">
      <div className="card-head">
        <div><div className="eyebrow">Deliverable</div><h3>{reviewed ? "已审核版报告" : "Markdown 报告"}</h3></div>
        <span className="right" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: "7px 13px", fontSize: 12.5, ...(runId ? {} : { opacity: 0.5, cursor: "not-allowed" }) }} onClick={download} disabled={!runId || downloading} title={runId ? undefined : (isMock ? "演示数据不生成交付包" : "本轮暂无交付包")}><Icon name="download" size={14} />{downloading ? "下载中…" : "下载交付包"}</button>
          <button className="btn btn-ghost" style={{ padding: "7px 13px", fontSize: 12.5 }} onClick={copy}><Icon name="check" size={14} />复制</button>
        </span>
      </div>
      <div className="report report-md scroll">{renderMarkdown(md)}</div>
    </div>
  );
}

/* ============================ Other views ========================= */
function NeedRun({ reset, label }: { reset: () => void; label: string }) {
  return (<div className="view"><div className="empty">
    <div className="empty-ico"><Icon name="database" size={26} /></div>
    <h3>还没有{label}</h3><p>先在研究台创建并运行一次研究项目，建库后即可查看{label}。</p>
    <div style={{ marginTop: 22 }}><button className="btn btn-primary" onClick={reset} style={{ display: "inline-flex" }}><Icon name="play" size={15} />去研究台</button></div>
  </div></div>);
}
function WeeklyView({ wk }: { wk: UIWeeklyReport }) {
  return (<div className="view"><div className="section-title"><h2>行业情报周报</h2><span className="line" /><span className="meta">weekly_intelligence_reports</span></div><WeeklyCard wk={wk} /></div>);
}
function ProjectsView({ model, setView }: { model: UIResearchModel; setView: (v: string) => void }) {
  const items = [
    { name: model.project.name, cat: model.project.category, status: "reported", date: "今天" },
    { name: "家居香薰蜡烛竞品研究", cat: "大豆蜡香薰", status: "review", date: "3 天前" },
    { name: "无糖功能饮料行业研究", cat: "电解质气泡水", status: "draft", date: "上周" },
  ];
  const ST: Record<string, [string, string]> = { reported: ["已交付", "var(--good)"], review: ["审核中", "var(--warn)"], draft: ["草稿", "var(--faint)"] };
  return (<div className="view"><div className="section-title"><h2>研究项目</h2><span className="line" /><span className="meta">{items.length} projects</span></div>
    <div className="table-wrap"><table className="data">
      <thead><tr><th>项目</th><th>品类</th><th>模板</th><th>状态</th><th className="num">更新</th></tr></thead>
      <tbody>{items.map((pj, i) => (
        <tr key={i} style={{ cursor: "pointer" }} onClick={() => setView("workbench")}>
          <td><div className="name">{pj.name}</div></td><td>{pj.cat}</td><td><span className="tag">电商竞品研究</span></td>
          <td><span className="status-pill" style={{ color: ST[pj.status][1], background: "color-mix(in oklch," + ST[pj.status][1] + " 12%, transparent)" }}><span className="d" style={{ background: ST[pj.status][1] }} />{ST[pj.status][0]}</span></td>
          <td className="num" style={{ color: "var(--muted)" }}>{pj.date}</td>
        </tr>
      ))}</tbody>
    </table></div></div>);
}
function CapabilityView() {
  const caps = [
    { name: "DeepSeek 抽取 / 报告", src: "DeepSeek", status: "reusable_now", use: "公开资料结构化抽取与 Markdown 报告" },
    { name: "公开搜索源发现", src: "agent_factory", status: "reusable_now", use: "竞品官网与内容源候选发现" },
    { name: "RSS / sitemap 监控", src: "future_plugin", status: "future_candidate", use: "低风险持续情报更新" },
    { name: "Crawlee crawler", src: "github", status: "future_candidate", use: "TypeScript 浏览器型采集" },
    { name: "Hermes XCrawl", src: "hermes", status: "mock_only_now", use: "scrape / search / crawl（需 API key）" },
    { name: "Supabase 落库", src: "future_plugin", status: "future_candidate", use: "项目 / 证据 / 报告持久化" },
  ];
  const ST: Record<string, [string, string]> = { reusable_now: ["可复用", "var(--good)"], future_candidate: ["后续候选", "var(--accent)"], mock_only_now: ["仅 mock", "var(--warn)"] };
  return (<div className="view"><div className="section-title"><h2>能力评估</h2><span className="line" /><span className="meta">capability assessment</span></div>
    <div className="table-wrap"><table className="data">
      <thead><tr><th>能力</th><th>来源</th><th>用途</th><th>状态</th></tr></thead>
      <tbody>{caps.map((c, i) => (
        <tr key={i}><td><div className="name">{c.name}</div></td><td><span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{c.src}</span></td><td><div className="desc" style={{ color: "var(--ink-2)" }}>{c.use}</div></td>
          <td><span className="status-pill" style={{ color: ST[c.status][1], background: "color-mix(in oklch," + ST[c.status][1] + " 12%, transparent)" }}><span className="d" style={{ background: ST[c.status][1] }} />{ST[c.status][0]}</span></td></tr>
      ))}</tbody>
    </table></div></div>);
}
function SettingsView() {
  return (<div className="view"><div className="section-title"><h2>设置</h2><span className="line" /></div>
    <div className="card" style={{ padding: 24, maxWidth: 560 }}>
      <div className="field" style={{ marginBottom: 18 }}><label style={{ marginBottom: 8 }}>LLM Provider Base URL</label><input defaultValue="http://localhost:20128/v1" /></div>
      <div className="field" style={{ marginBottom: 18 }}><label style={{ marginBottom: 8 }}>Model</label><input defaultValue="DeepSeek / openai-compatible" /></div>
      <p style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>生产 / 付费交付必须切换自付费 provider。生产环境若仍指向 localhost LLM 将被拒绝，除非显式允许。不做登录、支付与多租户。</p>
    </div></div>);
}
