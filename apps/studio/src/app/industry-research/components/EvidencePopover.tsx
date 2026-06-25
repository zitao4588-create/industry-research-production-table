"use client";
/* EvidencePopover.tsx — 证据溯源弹层(P1-E)。
   把表格里的"证据"单元格变成可点按钮,弹出来源标题 / 可信度 / 原文片段 / URL。
   数据来自 adapter 解析的 UIEvidenceRef(真实 run 用真实来源,mock 用合成占位)。*/
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { UIEvidenceRef } from "../adapters/research";
import { Icon } from "./components";

const isHttp = (url?: string) => Boolean(url && /^https?:\/\//i.test(url));

const triggerStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  borderBottom: "1px dashed var(--line-2)",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};

export function EvidenceCell({
  refs,
  children,
  ariaLabel,
}: {
  refs?: UIEvidenceRef[];
  children: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const count = refs?.length ?? 0;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 没有证据时退回纯展示,不诱导点击。
  if (count === 0) {
    return <>{children}</>;
  }

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${ariaLabel ? `${ariaLabel}，` : ""}查看 ${count} 条证据来源`}
        title="查看证据来源"
        style={triggerStyle}
      >
        {children}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 2 }}>
          <Icon name="source" size={11} />
          {count}
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="证据来源"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 60,
            width: 330,
            maxWidth: "min(360px, 78vw)",
            background: "var(--surface-3)",
            border: "1px solid var(--line-2)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            padding: 13,
            textAlign: "left",
            cursor: "default",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 9 }}>
            <Icon name="source" size={12} />证据来源 · {count}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, maxHeight: 280, overflowY: "auto" }}>
            {refs?.map((r) => (
              <div key={r.id} style={{ borderLeft: "2px solid var(--accent-line)", paddingLeft: 11 }}>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>“{r.quote}”</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, alignItems: "center" }}>
                  {r.source && <span style={{ fontSize: 11, color: "var(--muted)" }}>{r.source}</span>}
                  {r.reliability && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--accent)", border: "1px solid var(--accent-line)", borderRadius: 5, padding: "1px 5px" }}>
                      {r.reliability}
                    </span>
                  )}
                </div>
                {r.url &&
                  (isHttp(r.url) ? (
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent)", wordBreak: "break-all", display: "inline-block", marginTop: 4 }}>
                      {r.url}
                    </a>
                  ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--faint)", wordBreak: "break-all", display: "inline-block", marginTop: 4 }}>
                      {r.url}
                    </span>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
