/* graph.jsx — signature animated knowledge graph (canvas).
   Nodes = project · 9 databases · scattered sources. Edges weave progressively.
   Props: progress (0..1), building (bool), accent (hex), height (px). */
const { useRef, useEffect } = React;

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildModel() {
  const dbs = (window.IRP?.databases || []).slice(0, 9);
  const nodes = [];
  const edges = [];
  // center
  nodes.push({ id: "c", x: 0.5, y: 0.50, r: 13, type: "core", label: "研究项目", appear: 0, phase: 0 });
  const N = 9;
  dbs.forEach((db, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const rx = 0.30, ry = 0.31, cy = 0.50;
    const x = 0.5 + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    const id = "db" + i;
    nodes.push({ id, x, y, r: 7.5, type: "db", label: db.label, count: db.count, appear: 0.06 + (i / N) * 0.5, phase: i * 0.7, a });
    edges.push({ a: "c", b: id, appear: 0.06 + (i / N) * 0.5, w: 1.3 });
    // leaf sources — kept inside a safe inset so nothing is clipped by the canvas rect
    const leaves = 1 + (i % 3);
    for (let k = 0; k < leaves; k++) {
      const spread = 0.26;
      const la = a + (k - (leaves - 1) / 2) * spread;
      const extra = 0.06 + 0.04 * ((k % 2) + 1);
      const lx = 0.5 + Math.cos(la) * (rx + extra);
      const ly = cy + Math.sin(la) * (ry + extra);
      const lid = id + "_" + k;
      nodes.push({ id: lid, x: lx, y: ly, r: 3, type: "leaf", appear: 0.4 + Math.random() * 0.55, phase: Math.random() * 6 });
      edges.push({ a: id, b: lid, appear: 0.42 + ((i + k) / (N + 3)) * 0.5, w: 0.7 });
    }
  });
  // ring neighbour links
  for (let i = 0; i < N; i++) {
    edges.push({ a: "db" + i, b: "db" + ((i + 1) % N), appear: 0.55 + (i / N) * 0.4, w: 0.6, faint: true });
  }
  return { nodes, edges };
}

function KnowledgeGraph({ progress = 1, building = false, accent = "#3fd6c0", height = 440 }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const model = useRef(null);
  const progRef = useRef(progress);
  const buildRef = useRef(building);
  const accentRef = useRef(accent);
  const shownRef = useRef(building ? 0 : 1); // eased displayed progress

  useEffect(() => { progRef.current = progress; }, [progress]);
  useEffect(() => { buildRef.current = building; }, [building]);
  useEffect(() => { accentRef.current = accent; }, [accent]);

  useEffect(() => {
    if (!model.current) model.current = buildModel();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf, t0 = performance.now();
    let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      const rect = wrapRef.current.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrapRef.current);

    // hover hit-testing against last-drawn positions
    const drawn = {};
    const hover = { id: null };
    function hit(mx, my) {
      let best = null, bd = 1e9;
      for (const id in drawn) { const d = drawn[id]; if (d.type === "leaf") continue; const dx = mx - d.x, dy = my - d.y; const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = id; } }
      return best && bd < 22 * 22 ? best : null;
    }
    function onMove(e) { const rc = canvas.getBoundingClientRect(); hover.id = hit(e.clientX - rc.left, e.clientY - rc.top); canvas.style.cursor = hover.id ? "pointer" : "default"; }
    function onLeave() { hover.id = null; canvas.style.cursor = "default"; }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const { nodes, edges } = model.current;
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

    function pos(n, t) {
      const fx = Math.sin(t * 0.0006 + n.phase) * (n.type === "leaf" ? 7 : n.type === "db" ? 4 : 1.5);
      const fy = Math.cos(t * 0.0005 + n.phase * 1.3) * (n.type === "leaf" ? 7 : n.type === "db" ? 4 : 1.5);
      return { x: n.x * W + fx, y: n.y * H + fy };
    }

    function draw(now) {
      const t = now - t0;
      const [ar, ag, ab] = hexToRgb(accentRef.current);
      const A = (a) => `rgba(${ar},${ag},${ab},${a})`;

      // ease displayed progress toward target
      const target = buildRef.current ? progRef.current : 1;
      shownRef.current += (target - shownRef.current) * 0.06;
      const P = shownRef.current;

      ctx.clearRect(0, 0, W, H);

      // soft radial backdrop glow at center
      const cx = 0.5 * W, cy = 0.50 * H;
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.55);
      bg.addColorStop(0, A(0.08)); bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // edges
      edges.forEach((e, i) => {
        const reveal = Math.max(0, Math.min(1, (P - e.appear) / 0.12));
        if (reveal <= 0) return;
        const na = nodeMap[e.a], nb = nodeMap[e.b];
        const pa = pos(na, t), pb = pos(nb, t);
        const ex = pa.x + (pb.x - pa.x) * reveal;
        const ey = pa.y + (pb.y - pa.y) * reveal;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(ex, ey);
        ctx.strokeStyle = e.faint ? `rgba(${ar},${ag},${ab},0.07)` : A(0.16 * reveal + 0.05);
        ctx.lineWidth = e.w; ctx.stroke();

        // travelling pulse on core/db edges
        if (!e.faint && reveal >= 1 && na.type !== "leaf") {
          const sp = (t * 0.00022 + i * 0.13) % 1;
          const px = pa.x + (pb.x - pa.x) * sp;
          const py = pa.y + (pb.y - pa.y) * sp;
          ctx.beginPath(); ctx.arc(px, py, 1.6, 0, 7);
          ctx.fillStyle = A(0.9 * (1 - Math.abs(sp - 0.5) * 1.4)); ctx.fill();
        }
      });

      // nodes
      nodes.forEach((n) => {
        const vis = Math.max(0, Math.min(1, (P - n.appear) / 0.1));
        if (vis <= 0) return;
        const p = pos(n, t);
        const pulse = 1 + Math.sin(t * 0.002 + n.phase) * 0.08;
        const r = n.r * vis * (n.type === "core" ? pulse : 1);

        // glow
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.5);
        const isHover = hover.id === n.id;
        const ga = (n.type === "leaf" ? 0.18 : n.type === "db" ? 0.3 : 0.42) * (isHover ? 1.8 : 1);
        g.addColorStop(0, A(ga * vis)); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4.5, 0, 7); ctx.fill();

        drawn[n.id] = { x: p.x, y: p.y, r, type: n.type, label: n.label, count: n.count };
        if (isHover && n.type !== "leaf") {
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, 7); ctx.strokeStyle = A(0.9); ctx.lineWidth = 1.5; ctx.stroke();
        }

        // core ring
        if (n.type === "core") {
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.9, 0, 7);
          ctx.strokeStyle = A(0.4 * vis); ctx.lineWidth = 1; ctx.stroke();
        }

        // body
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
        if (n.type === "leaf") { ctx.fillStyle = `rgba(${ar},${ag},${ab},${0.55 * vis})`; }
        else { ctx.fillStyle = `rgba(245,248,250,${vis})`; }
        ctx.fill();
        if (n.type !== "leaf") {
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
          ctx.strokeStyle = A(0.85 * vis); ctx.lineWidth = 1.4; ctx.stroke();
        }

        // db labels
        if (n.type === "db" && vis > 0.6) {
          const out = n.x > 0.5 ? 1 : -1;
          ctx.font = "500 10.5px 'IBM Plex Mono', monospace";
          ctx.textAlign = out > 0 ? "left" : "right";
          ctx.textBaseline = "middle";
          ctx.fillStyle = `rgba(220,228,234,${0.62 * vis})`;
          ctx.fillText(n.label, p.x + out * (r + 7), p.y);
        }
      });

      // hover tooltip
      if (hover.id && drawn[hover.id] && drawn[hover.id].type !== "leaf") {
        const d = drawn[hover.id];
        const label = d.label + (d.count != null ? "  ·  " + d.count + " 条" : "");
        ctx.font = "600 11px 'IBM Plex Mono', monospace";
        const tw = ctx.measureText(label).width;
        const bw = tw + 18, bh = 24;
        let bx = d.x - bw / 2, by = d.y - d.r - bh - 8;
        bx = Math.max(6, Math.min(W - bw - 6, bx));
        if (by < 6) by = d.y + d.r + 8;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 7); else ctx.rect(bx, by, bw, bh);
        ctx.fillStyle = "rgba(8,12,16,0.92)"; ctx.fill();
        ctx.strokeStyle = A(0.55); ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "rgba(240,245,248,0.96)"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(label, bx + 9, by + bh / 2 + 0.5);
      }

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); };
  }, []);

  return React.createElement("div", { ref: wrapRef, className: "kg-wrap", style: { height } },
    React.createElement("canvas", { ref: canvasRef }));
}

window.KnowledgeGraph = KnowledgeGraph;
