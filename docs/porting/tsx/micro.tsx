"use client";
/* micro.tsx — SVG micro-visualizations (ported verbatim from source/micro.jsx).
   Geometry/classes unchanged. ONLY change: DbMicro takes a `model` prop instead
   of reading window.IRP. CSS-driven hover animations live in globals.css.
   NOTE: the `--i`/`--o`/`--hue` custom props are passed via style; TS needs the
   `as CSSProperties` cast because they aren't in the standard type. */
import type { CSSProperties } from "react";

type Seg = { v: number };
type CSSVars = CSSProperties & Record<string, string | number>;

export function Spark({ data, w = 132, h = 42, area = true }: { data: number[]; w?: number; h?: number; area?: boolean }) {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pad = 3;
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i * step, h - pad - ((v - min) / rng) * (h - pad * 2)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const areaD = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="micro micro-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {area && <path d={areaD} className="m-area" />}
      <path d={line} className="m-line draw" pathLength={1} />
      <circle cx={last[0]} cy={last[1]} r={2.6} className="m-dot" />
    </svg>
  );
}

export function VBars({ data, w = 132, h = 42 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(...data) || 1;
  const n = data.length;
  const gap = 4;
  const bw = (w - gap * (n - 1)) / n;
  return (
    <svg className="micro micro-vbars" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((v, i) => {
        const bh = Math.max(2, (v / max) * (h - 3));
        return <rect key={i} className="m-bar" x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={1.5} style={{ "--i": i } as CSSVars} />;
      })}
    </svg>
  );
}

export function HBars({ data, w = 132, h = 42 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(...data) || 1;
  const n = data.length;
  const gap = 4;
  const bh = (h - gap * (n - 1)) / n;
  return (
    <svg className="micro micro-hbars" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((v, i) => (
        <rect key={i} className="m-bar" x={0} y={i * (bh + gap)} width={Math.max(3, (v / max) * w)} height={bh} rx={1.5} style={{ "--i": i } as CSSVars} />
      ))}
    </svg>
  );
}

export function StackBar({ segs, w = 132, h = 12 }: { segs: Seg[]; w?: number; h?: number }) {
  const total = segs.reduce((s, x) => s + x.v, 0) || 1;
  let x = 0;
  return (
    <svg className="micro micro-stack" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {segs.map((s, i) => {
        const sw = (s.v / total) * w;
        const r = <rect key={i} x={x + 0.5} y={0} width={Math.max(0, sw - 1)} height={h} rx={2.5} className="m-seg" style={{ "--o": 0.35 + (1 - i / segs.length) * 0.55, "--i": i } as CSSVars} />;
        x += sw;
        return r;
      })}
    </svg>
  );
}

export function Donut({ segs, size = 42 }: { segs: Seg[]; size?: number }) {
  const total = segs.reduce((s, x) => s + x.v, 0) || 1;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg className="micro micro-donut" viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} className="m-track" fill="none" />
      {segs.map((s, i) => {
        const len = (s.v / total) * c;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" className="m-arc"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ "--o": 0.4 + (1 - i / segs.length) * 0.55, "--i": i } as CSSVars} />
        );
        off += len;
        return el;
      })}
    </svg>
  );
}

export function NodeMini({ w = 132, h = 44 }: { w?: number; h?: number }) {
  const nodes = [[20, 22], [52, 12], [50, 33], [82, 20], [80, 38], [108, 14], [110, 32], [36, 40]];
  const edges = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [3, 6], [4, 6], [0, 7], [2, 7]];
  return (
    <svg className="micro micro-node" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} className="m-edge draw" pathLength={1} style={{ "--i": i } as CSSVars} />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n[0]} cy={n[1]} r={i === 0 ? 3.4 : 2.2} className={"m-node" + (i === 0 ? " core" : "")} style={{ "--i": i } as CSSVars} />
      ))}
    </svg>
  );
}

export function Scatter({ pts, w = 132, h = 44 }: { pts: { x: number; y: number; r: number }[]; w?: number; h?: number }) {
  return (
    <svg className="micro micro-scatter" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1={2} y1={h - 2} x2={w - 2} y2={h - 2} className="m-axis" />
      <line x1={2} y1={2} x2={2} y2={h - 2} className="m-axis" />
      {pts.map((p, i) => (
        <circle key={i} cx={4 + p.x * (w - 10)} cy={h - 4 - p.y * (h - 10)} r={2 + p.r * 3.4} className="m-pt" style={{ "--i": i } as CSSVars} />
      ))}
    </svg>
  );
}

export function Blocks({ w = 132, h = 44 }: { w?: number; h?: number }) {
  const cells = [
    [4, 4, 40, 11], [50, 4, 28, 11], [84, 4, 44, 11],
    [4, 19, 24, 9], [34, 19, 24, 9], [64, 19, 24, 9], [94, 19, 34, 9],
    [4, 32, 34, 8], [44, 32, 20, 8], [70, 32, 30, 8], [106, 32, 22, 8],
  ];
  return (
    <svg className="micro micro-blocks" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {cells.map((c, i) => (
        <rect key={i} x={c[0]} y={c[1]} width={c[2]} height={c[3]} rx={2} className="m-block" style={{ "--i": i, "--o": i % 3 === 0 ? 0.85 : 0.4 } as CSSVars} />
      ))}
    </svg>
  );
}

/* ---- per-database dispatcher: pass the parts of your UIResearchModel it needs ---- */
export type DbMicroModel = {
  competitors: { evidence: number }[];
  products: { price: string | number }[];
  keywords: { intent: string }[];
  painPoints: { evidence: number }[];
  contentSignals: { platform: string; evidence: number }[];
  opportunities: { competition: number; demand: number; total: number }[];
};

export function DbMicro({ id, model }: { id: string; model: DbMicroModel }) {
  const D = model;
  switch (id) {
    case "source_database": return <NodeMini />;
    case "competitor_database": return <HBars data={D.competitors.map((c) => c.evidence)} />;
    case "website_structure_database": return <Blocks />;
    case "product_database": return <VBars data={D.products.map((p) => parseFloat(String(p.price).replace(/[^0-9.]/g, ""))).sort((a, b) => a - b)} />;
    case "keyword_database": {
      const counts: Record<string, number> = {};
      D.keywords.forEach((k) => { counts[k.intent] = (counts[k.intent] || 0) + 1; });
      return <StackBar segs={Object.values(counts).sort((a, b) => b - a).map((v) => ({ v }))} />;
    }
    case "pain_point_database": return <VBars data={D.painPoints.map((p) => p.evidence)} />;
    case "content_database": {
      const counts: Record<string, number> = {};
      D.contentSignals.forEach((c) => { counts[c.platform] = (counts[c.platform] || 0) + c.evidence; });
      return <Donut segs={Object.values(counts).map((v) => ({ v }))} />;
    }
    case "opportunity_database": return <Scatter pts={D.opportunities.map((o) => ({ x: o.competition / 100, y: o.demand / 100, r: o.total / 100 }))} />;
    case "weekly_intelligence_reports": return <Spark data={[8, 11, 9, 14, 12, 17, 16, 21]} />;
    default: return <VBars data={[4, 7, 5, 9, 6]} />;
  }
}

export function InlineBar({ v, max = 100, w = 48, label }: { v: number; max?: number; w?: number; label?: number | string }) {
  return (
    <span className="inline-bar-wrap">
      <span className="inline-bar" style={{ width: w }}><i style={{ width: Math.max(4, (v / max) * 100) + "%" }} /></span>
      <span className="inline-bar-n">{label != null ? label : v}</span>
    </span>
  );
}

export function PriceScale({ price, min, max }: { price: number; min: number; max: number }) {
  const pct = Math.max(0, Math.min(100, ((price - min) / (max - min)) * 100));
  return (
    <span className="price-scale">
      <span className="ps-track"><span className="ps-dot" style={{ left: pct + "%" }} /></span>
      <span className="ps-val">${price.toFixed(2)}</span>
    </span>
  );
}

export function StatSpark({ data, w = 88, h = 22 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 2 - ((v - min) / rng) * (h - 4)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg className="stat-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={line} pathLength={1} className="ss-line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={1.8} className="ss-dot" />
    </svg>
  );
}

export function Radar({ axes, size = 150 }: { axes: { k: string; v: number }[]; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 16;
  const n = axes.length;
  const pt = (i: number, r: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const rings = [0.33, 0.66, 1];
  const grid = (f: number) => axes.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = axes.map((ax, i) => pt(i, R * (ax.v / 100)).map((v) => v.toFixed(1)).join(",")).join(" ");
  return (
    <svg className="micro micro-radar" viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      {rings.map((f, i) => <polygon key={i} points={grid(f)} className="r-grid" />)}
      {axes.map((_, i) => { const p = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} className="r-spoke" />; })}
      <polygon points={shape} className="r-shape" />
      {axes.map((ax, i) => { const p = pt(i, R * (ax.v / 100)); return <circle key={i} cx={p[0]} cy={p[1]} r={2.6} className="r-dot" />; })}
      {axes.map((ax, i) => { const p = pt(i, R + 11); return <text key={i} x={p[0]} y={p[1]} className="r-label" textAnchor="middle" dominantBaseline="middle">{ax.k}</text>; })}
    </svg>
  );
}
