"use client";
/* extras.tsx — command palette (⌘K), toast system, markdown renderer.
   Ported verbatim from source/extras.jsx. Structure/classes unchanged.
   `D` (the search index source) is now a typed model passed in, not window.IRP. */
import { useState, useEffect, useRef, useMemo, Fragment, type ReactNode } from "react";
import { Icon, type IconName } from "./components";

/* ---------------- Toasts ---------------- */
type ToastKind = "ok" | "copy" | "spark";
type ToastItem = { msg: string; kind: ToastKind; id: number };

export function showToast(msg: string, kind: ToastKind = "ok") {
  window.dispatchEvent(new CustomEvent("irp-toast", { detail: { msg, kind, id: Date.now() + Math.random() } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent).detail as ToastItem;
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 2800);
    };
    window.addEventListener("irp-toast", on);
    return () => window.removeEventListener("irp-toast", on);
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div className={"toast toast-" + t.kind} key={t.id}>
          <span className="toast-ico">
            {t.kind === "ok" ? <Icon name="check" size={13} /> : t.kind === "copy" ? <Icon name="download" size={13} /> : <Icon name="spark" size={13} />}
          </span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Command palette ---------------- */
export type NavTarget = { view: string; done?: boolean; tab?: string };
type IndexItem = { group: string; label: string; sub?: string; icon: IconName; target: NavTarget };

// Pass the slices of your UIResearchModel the palette should search.
export type SearchModel = {
  opportunities: { title: string; total: number }[];
  competitors: { name: string; channel: string }[];
  painPoints: { theme: string; need: string }[];
  keywords: { keyword: string; source: string }[];
};

export function buildIndex(D: SearchModel): IndexItem[] {
  const idx: IndexItem[] = [];
  const navs: { label: string; view: string; icon: IconName }[] = [
    { label: "研究台", view: "workbench", icon: "workbench" },
    { label: "数据库视图", view: "databases", icon: "database" },
    { label: "情报周报", view: "weekly", icon: "weekly" },
    { label: "研究项目", view: "projects", icon: "projects" },
    { label: "能力评估", view: "capability", icon: "capability" },
    { label: "设置", view: "settings", icon: "settings" },
  ];
  navs.forEach((n) => idx.push({ group: "导航", label: n.label, icon: n.icon, target: { view: n.view } }));
  const tabs: [string, string][] = [["opportunity", "机会评分"], ["competitor", "竞品"], ["product", "产品"], ["pain", "用户痛点"], ["content", "内容信号"], ["keyword", "关键词"], ["weekly", "周报"]];
  tabs.forEach(([id, label]) => idx.push({ group: "结果视图", label, icon: "database", target: { view: "workbench", done: true, tab: id } }));
  D.opportunities.forEach((o) => idx.push({ group: "机会", label: o.title, sub: "总分 " + o.total, icon: "opportunity", target: { view: "workbench", done: true, tab: "opportunity" } }));
  D.competitors.forEach((c) => idx.push({ group: "竞品", label: c.name, sub: c.channel, icon: "competitor", target: { view: "workbench", done: true, tab: "competitor" } }));
  D.painPoints.forEach((p) => idx.push({ group: "痛点", label: p.theme, sub: p.need, icon: "pain", target: { view: "workbench", done: true, tab: "pain" } }));
  D.keywords.forEach((k) => idx.push({ group: "关键词", label: k.keyword, sub: k.source, icon: "keyword", target: { view: "workbench", done: true, tab: "keyword" } }));
  return idx;
}

function fuzzy(q: string, s: string): number {
  q = q.toLowerCase(); s = s.toLowerCase();
  if (s.includes(q)) return 100 - s.indexOf(q);
  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) if (s[i] === q[qi]) qi++;
  return qi === q.length ? 30 : -1;
}

export function CommandPalette({ open, onClose, D, onNavigate }: {
  open: boolean; onClose: () => void; D: SearchModel; onNavigate: (t: NavTarget) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => buildIndex(D), [D]);
  const results = useMemo(() => {
    if (!q.trim()) return index.slice(0, 8);
    return index.map((it) => ({ it, score: Math.max(fuzzy(q, it.label), it.sub ? fuzzy(q, it.sub) - 10 : -1) }))
      .filter((x) => x.score > -1).sort((a, b) => b.score - a.score).slice(0, 9).map((x) => x.it);
  }, [q, index]);

  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); const r = results[sel]; if (r) { onNavigate(r.target); onClose(); } }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, results, sel, onClose, onNavigate]);

  if (!open) return null;
  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="search" size={16} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="检索竞品、痛点、关键词、机会、视图…" />
          <span className="cmdk-esc">ESC</span>
        </div>
        <div className="cmdk-list scroll">
          {results.length === 0 && <div className="cmdk-empty">没有匹配项</div>}
          {results.map((r, i) => (
            <div key={i} className={"cmdk-item" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onClick={() => { onNavigate(r.target); onClose(); }}>
              <span className="cmdk-ico"><Icon name={r.icon} size={15} /></span>
              <span className="cmdk-txt"><b>{r.label}</b>{r.sub && <small>{r.sub}</small>}</span>
              <span className="cmdk-grp">{r.group}</span>
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 跳转</span><span><kbd>esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Minimal markdown renderer ---------------- */
export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] | null = null;
  const inline = (txt: string): ReactNode[] => {
    const parts = txt.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>);
  };
  const flush = () => { if (list) { out.push(<ul key={"u" + out.length}>{list}</ul>); list = null; } };
  lines.forEach((ln, i) => {
    if (ln.startsWith("# ")) { flush(); out.push(<h1 key={i}>{inline(ln.slice(2))}</h1>); }
    else if (ln.startsWith("## ")) { flush(); out.push(<h2 key={i}>{inline(ln.slice(3))}</h2>); }
    else if (ln.startsWith("- ") || /^\d+\.\s/.test(ln)) { (list = list || []).push(<li key={i}>{inline(ln.replace(/^(-|\d+\.)\s/, ""))}</li>); }
    else if (ln.trim() === "") { flush(); }
    else { flush(); out.push(<p key={i}>{inline(ln)}</p>); }
  });
  flush();
  return out;
}
