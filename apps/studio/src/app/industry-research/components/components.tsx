"use client";
/* components.tsx — icon set + shared UI primitives (ported verbatim from source/components.jsx).
   Visual/logic unchanged; only React import + TS types + exports differ. */
import { useState, useEffect, type CSSProperties } from "react";

// ---- icon set (stroke, 24 viewbox) ----
export type IconName =
  | "workbench" | "projects" | "database" | "weekly" | "capability" | "settings"
  | "arrow" | "search" | "chevron" | "spark" | "play" | "check" | "x" | "flag"
  | "download" | "sun" | "moon" | "source" | "competitor" | "structure" | "product"
  | "keyword" | "pain" | "content" | "opportunity";

const ICONS: Record<string, string[]> = {
  workbench: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  projects: ["M3 7l9-4 9 4-9 4-9-4z", "M3 7v6l9 4 9-4V7", "M3 13v4l9 4 9-4v-4"],
  database: ["M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3z", "M3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6", "M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"],
  weekly: ["M8 2v4M16 2v4", "M3 8h18", "M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z", "M8 13h4M8 17h6"],
  capability: ["M12 2l3 6 6 .9-4.5 4.4 1 6.2L12 17l-5.5 2.5 1-6.2L3 8.9 9 8z"],
  settings: ["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7.7 1.6 1.6 0 01-3.2 0 1.6 1.6 0 00-2.7-.7l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-.7-2.7 1.6 1.6 0 010-3.2 1.6 1.6 0 00.7-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-.7 1.6 1.6 0 013.2 0 1.6 1.6 0 002.7.7l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00.7 2.7 1.6 1.6 0 010 3.2 1.6 1.6 0 00-1 .9z"],
  arrow: ["M5 12h14M13 6l6 6-6 6"],
  search: ["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.3-4.3"],
  chevron: ["M9 6l6 6-6 6"],
  spark: ["M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"],
  play: ["M6 4l14 8-14 8V4z"],
  check: ["M5 13l4 4L19 7"],
  x: ["M6 6l12 12M18 6L6 18"],
  flag: ["M4 21V4M4 4h13l-2 4 2 4H4"],
  download: ["M12 3v12M7 10l5 5 5-5", "M5 21h14"],
  sun: ["M12 17a5 5 0 100-10 5 5 0 000 10z", "M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"],
  moon: ["M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"],
  source: ["M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1", "M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"],
  competitor: ["M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M22 21v-2a4 4 0 00-3-3.9", "M16 3.1a4 4 0 010 7.8"],
  structure: ["M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"],
  product: ["M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z", "M3.3 7L12 12l8.7-5M12 22V12"],
  keyword: ["M21 11.5L12.5 3H4a1 1 0 00-1 1v8.5L11.5 21a1.5 1.5 0 002 0l7.5-7.5a1.5 1.5 0 000-2z", "M7.5 7.5h.01"],
  pain: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  content: ["M4 4h16v12H4z", "M4 20h16", "M8 9h8M8 12h5"],
  opportunity: ["M9 18h6M10 22h4", "M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0012 2z"],
};

export function Icon({ name, size = 18 }: { name: IconName | string; size?: number }) {
  const paths = ICONS[name] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V9M9 19V5M14 19v-6M19 19v-9" />
    </svg>
  );
}

export type ReviewStatus = "approved" | "needs_review" | "rejected";
export function StatusPill({ status }: { status: ReviewStatus | string }) {
  const labels: Record<string, string> = { approved: "已通过", needs_review: "待复核", rejected: "已驳回" };
  return (
    <span className={"status-pill st-" + status}>
      <span className="d" />{labels[status] || status}
    </span>
  );
}

export function Score({ v }: { v: number }) {
  return (
    <span className="score-cell">
      <span className="score-bar"><i style={{ width: v + "%" }} /></span>
      <span className="score-num">{v}</span>
    </span>
  );
}

export function TotalPill({ v }: { v: number }) {
  const cls = v >= 75 ? "t-hi" : v >= 60 ? "t-mid" : "t-lo";
  return <span className={"total-pill " + cls}>{v}</span>;
}

export function FreqBars({ level }: { level: "high" | "medium" | "low" }) {
  const n = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const label = { high: "高频", medium: "中频", low: "低频" }[level];
  const wrap: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8 };
  const txt: CSSProperties = { fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--font-mono)" };
  return (
    <span style={wrap}>
      <span className={"freq-bars " + level}>
        {[10, 13, 16].map((h, i) => <i key={i} className={i < n ? "on" : ""} style={{ height: h }} />)}
      </span>
      <span style={txt}>{label}</span>
    </span>
  );
}

// animated number counter (interval-based + guaranteed final value)
export function useCountUp(target: number, run: boolean, ms?: number) {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) { setV(target); return; }
    const dur = ms || 900;
    const start = Date.now();
    setV(0);
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * e));
      if (p >= 1) clearInterval(id);
    }, 32);
    const done = setTimeout(() => { clearInterval(id); setV(target); }, dur + 80);
    return () => { clearInterval(id); clearTimeout(done); };
  }, [target, run, ms]);
  return v;
}
