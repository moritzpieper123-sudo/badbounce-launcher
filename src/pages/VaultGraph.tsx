/* Vault graph: the Obsidian vault as a live, interactive force graph (like Obsidian's graph view).
   Drag nodes, pan, zoom at the cursor, hover to highlight neighbours, click for a preview, double-click to open in Obsidian.
   The PC watches the vault folder, so the graph updates live when notes change. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { bb, isDesktop, type GraphNode, type VaultGraph } from '../bridge';

type N = GraphNode & SimulationNodeDatum & { deg: number; isTag?: boolean };
type L = SimulationLinkDatum<N> & { s: string; t: string };
const PALETTE = ['#F4F6FF', '#AAC3F0', '#7FD9A8', '#C9A7FF', '#FF9F7A', '#7EC8E3', '#E79BC6', '#B8E07A', '#9DB2FF'];
const TAG_COLOR = '#7FD9A8';

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
/** Small Markdown renderer for the preview panel (headings, lists, code, bold/italic, wikilinks, tags, links). */
function renderMd(md: string, has: (name: string) => string | null) {
  let body = md.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const blocks: string[] = [];
  body = body.replace(/```[\s\S]*?```/g, (m) => { blocks.push(`<pre><code>${esc(m.replace(/^```\w*\n?|```$/g, ''))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = (t: string) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => { const id = has(target.trim()); return `<a class="wl ${id ? '' : 'miss'}" data-id="${esc(id ?? '')}">${alias ?? target}</a>`; })
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a class="wl" data-url="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|\s)#([A-Za-zÀ-ɏ][\w/\-À-ɏ]*)/g, '$1<span class="tag">#$2</span>');
  const out: string[] = []; let list = false;
  for (const line of body.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.*)/), li = line.match(/^\s*[-*+]\s+(.*)/) || line.match(/^\s*\d+\.\s+(.*)/);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1].replace(/^\[( |x)\]\s*/, (_a, x) => (x === 'x' ? '☑ ' : '☐ ')))}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (/^\u0000\d+\u0000$/.test(line.trim())) { out.push(blocks[+line.trim().slice(1, -1)]); continue; }
    if (m) out.push(`<h${Math.min(3, m[1].length)}>${inline(m[2])}</h${Math.min(3, m[1].length)}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[+i]);
}

export default function VaultGraphPage({ solo = false }: { solo?: boolean }) {
  const { toast } = useApp();
  const [data, setData] = useState<VaultGraph | null>(null);
  const [q, setQ] = useState(() => { try { const v = sessionStorage.getItem('bb-graph-q') || ''; sessionStorage.removeItem('bb-graph-q'); return v; } catch { return ''; } });
  const [panel, setPanel] = useState(false);
  const [opt, setOpt] = useState(() => { try { return { orphans: true, unresolved: true, tags: false, repel: 220, dist: 70, center: .06, labels: true, ...JSON.parse(localStorage.getItem('bb-graph') || '{}') }; } catch { return { orphans: true, unresolved: true, tags: false, repel: 220, dist: 70, center: .06, labels: true }; } });
  const [sel, setSel] = useState<N | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const sim = useRef<Simulation<N, L> | null>(null);
  const nodesRef = useRef<N[]>([]); const linksRef = useRef<L[]>([]);
  const view = useRef({ k: 1, x: 0, y: 0, w: 800, h: 600 });
  const hover = useRef<N | null>(null);
  const dirty = useRef(true);
  const qRef = useRef(''); qRef.current = q.trim().toLowerCase();
  const selRef = useRef<N | null>(null); selRef.current = sel;
  const optRef = useRef(opt); optRef.current = opt;
  useEffect(() => { try { localStorage.setItem('bb-graph', JSON.stringify(opt)); } catch { /* ignore */ } }, [opt]);

  const load = useCallback(async () => { if (!bb.vaultGraph) return; const g = await bb.vaultGraph(); setData(g); }, []);
  useEffect(() => { load(); return bb.onGraphChanged?.(() => load()); }, [load]);

  // build the visible graph from data + filters, keeping positions of nodes that already exist
  const graph = useMemo(() => {
    if (!data?.ok) return { nodes: [] as N[], links: [] as L[] };
    const ns: N[] = data.nodes.filter((n) => opt.unresolved || !n.unresolved).map((n) => ({ ...n, deg: 0 }));
    const ls: L[] = data.links.map((l) => ({ ...l, source: l.s, target: l.t }));
    if (opt.tags) {
      const tags = new Set<string>();
      for (const n of data.nodes) for (const t of n.tags) { tags.add(t); ls.push({ s: n.id, t: '#' + t, source: n.id, target: '#' + t }); }
      for (const t of tags) ns.push({ id: '#' + t, name: '#' + t, folder: '', tags: [], deg: 0, isTag: true });
    }
    const ids = new Set(ns.map((n) => n.id));
    const keep = ls.filter((l) => ids.has(l.s) && ids.has(l.t) && l.s !== l.t);
    const deg = new Map<string, number>();
    for (const l of keep) { deg.set(l.s, (deg.get(l.s) ?? 0) + 1); deg.set(l.t, (deg.get(l.t) ?? 0) + 1); }
    let fin = ns.map((n) => ({ ...n, deg: deg.get(n.id) ?? 0 }));
    if (!opt.orphans) fin = fin.filter((n) => n.deg > 0);
    return { nodes: fin, links: keep };
  }, [data, opt.orphans, opt.unresolved, opt.tags]);

  const folders = useMemo(() => { const f = [...new Set(graph.nodes.filter((n) => !n.unresolved && !n.isTag).map((n) => n.folder))].sort(); return f; }, [graph]);
  const colorOf = useCallback((n: N) => (n.isTag ? TAG_COLOR : n.unresolved ? '#6B7591' : PALETTE[Math.max(0, folders.indexOf(n.folder)) % PALETTE.length]), [folders]);
  const colorRef = useRef(colorOf); colorRef.current = colorOf;

  // (re)start the simulation when the graph changes
  useEffect(() => {
    const old = new Map(nodesRef.current.map((n) => [n.id, n]));
    const byId = new Map<string, N>();
    const nodes = graph.nodes.map((n) => { const o = old.get(n.id); const m: N = o ? Object.assign(o, n, { x: o.x, y: o.y, vx: o.vx, vy: o.vy }) : { ...n }; byId.set(m.id, m); return m; });
    // new nodes start next to a neighbour, so live updates do not explode the layout
    for (const l of graph.links) { const a = byId.get(l.s), b = byId.get(l.t); if (a && b) { if (a.x == null && b.x != null) { a.x = b.x + (Math.random() - .5) * 30; a.y = b.y! + (Math.random() - .5) * 30; } if (b.x == null && a.x != null) { b.x = a.x + (Math.random() - .5) * 30; b.y = a.y! + (Math.random() - .5) * 30; } } }
    const links = graph.links.map((l) => ({ ...l, source: l.s, target: l.t }));
    nodesRef.current = nodes; linksRef.current = links;
    const fresh = old.size === 0;
    if (!sim.current) {
      sim.current = forceSimulation<N, L>(nodes).alphaDecay(0.025).velocityDecay(0.35).on('tick', () => { dirty.current = true; });
    } else sim.current.nodes(nodes);
    const o = optRef.current;
    sim.current
      .force('link', forceLink<N, L>(links).id((d) => d.id).distance(o.dist).strength(0.5))
      .force('charge', forceManyBody<N>().strength(-o.repel).distanceMax(900))
      .force('center', forceCenter(0, 0))
      .force('x', forceX<N>(0).strength(o.center)).force('y', forceY<N>(0).strength(o.center))
      .force('collide', forceCollide<N>((d) => radius(d) + 3));
    sim.current.alpha(fresh ? 1 : 0.35).restart();
    dirty.current = true;
  }, [graph]);
  // forces sliders
  useEffect(() => {
    const s = sim.current; if (!s) return;
    (s.force('link') as ReturnType<typeof forceLink<N, L>>)?.distance(opt.dist);
    (s.force('charge') as ReturnType<typeof forceManyBody<N>>)?.strength(-opt.repel);
    (s.force('x') as ReturnType<typeof forceX<N>>)?.strength(opt.center); (s.force('y') as ReturnType<typeof forceY<N>>)?.strength(opt.center);
    s.alpha(0.5).restart();
  }, [opt.dist, opt.repel, opt.center]);
  useEffect(() => () => { sim.current?.stop(); }, []);
  useEffect(() => { dirty.current = true; }, [q, sel, opt.labels, folders]);

  // canvas size
  useEffect(() => {
    const c = cv.current, b = box.current; if (!c || !b) return;
    const ro = new ResizeObserver(() => { const r = b.getBoundingClientRect(), d = devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; view.current.w = r.width; view.current.h = r.height; dirty.current = true; });
    ro.observe(b); return () => ro.disconnect();
  }, []);

  // draw loop
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty.current) return; dirty.current = false;
      const c = cv.current; if (!c) return; const ctx = c.getContext('2d')!; const d = devicePixelRatio || 1;
      const { k, x, y, w, h } = view.current;
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + x, h / 2 + y); ctx.scale(k, k);
      const nodes = nodesRef.current, links = linksRef.current;
      const focus = hover.current ?? selRef.current;
      const near = new Set<string>(); if (focus) { near.add(focus.id); for (const l of links) { const s = (l.source as N).id, t = (l.target as N).id; if (s === focus.id) near.add(t); if (t === focus.id) near.add(s); } }
      const qq = qRef.current; const match = (n: N) => !qq || n.name.toLowerCase().includes(qq);
      // links
      ctx.lineWidth = 1 / Math.max(k, .6);
      for (const l of links) {
        const s = l.source as N, t = l.target as N; if (s.x == null || t.x == null) continue;
        const hot = focus && (s.id === focus.id || t.id === focus.id);
        ctx.strokeStyle = hot ? 'rgba(255,198,58,.85)' : focus || qq ? 'rgba(170,195,240,.07)' : 'rgba(170,195,240,.28)';
        ctx.lineWidth = (hot ? 1.8 : 1) / Math.max(k, .6);
        ctx.beginPath(); ctx.moveTo(s.x, s.y!); ctx.lineTo(t.x, t.y!); ctx.stroke();
      }
      // nodes
      for (const n of nodes) {
        if (n.x == null) continue;
        const r = radius(n), dim = (focus && !near.has(n.id)) || (qq && !match(n));
        ctx.globalAlpha = dim ? .18 : 1;
        const col = colorRef.current(n);
        ctx.shadowColor = col; ctx.shadowBlur = dim ? 0 : (focus?.id === n.id ? 22 : 10) * Math.min(1, k);
        ctx.beginPath(); ctx.arc(n.x, n.y!, focus?.id === n.id ? r * 1.25 : r, 0, 7);
        if (n.unresolved) { ctx.strokeStyle = col; ctx.lineWidth = 1.4 / Math.max(k, .6); ctx.stroke(); } else { ctx.fillStyle = focus?.id === n.id || (qq && match(n)) ? '#FFC63A' : col; ctx.fill(); }
        ctx.shadowBlur = 0;
      }
      // labels: fade in with zoom, always for the focused neighbourhood
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const fs = 12 / k, base = optRef.current.labels ? Math.max(0, Math.min(1, (k - .55) / .5)) : 0;
      ctx.font = `500 ${fs}px Inter Variable, Inter, system-ui, sans-serif`;
      for (const n of nodes) {
        if (n.x == null) continue;
        const show = focus ? near.has(n.id) : qq ? match(n) : base > 0;
        if (!show) continue;
        ctx.globalAlpha = focus || qq ? 1 : base * (n.deg > 0 || k > 1.2 ? 1 : .7);
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(n.name, n.x + .6 / k, n.y! + radius(n) + 4 / k + .8 / k);
        ctx.fillStyle = focus?.id === n.id ? '#FFE29A' : '#E6ECF8'; ctx.fillText(n.name, n.x, n.y! + radius(n) + 4 / k);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // pointer interaction: drag node / pan / hover / click / double-click / wheel zoom
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const toWorld = (ex: number, ey: number) => { const r = c.getBoundingClientRect(), v = view.current; return { x: (ex - r.left - v.w / 2 - v.x) / v.k, y: (ey - r.top - v.h / 2 - v.y) / v.k }; };
    const hit = (ex: number, ey: number) => { const p = toWorld(ex, ey); let best: N | null = null, bd = Infinity; for (const n of nodesRef.current) { if (n.x == null) continue; const dd = Math.hypot(n.x - p.x, n.y! - p.y); const lim = radius(n) + 6 / view.current.k; if (dd < lim && dd < bd) { best = n; bd = dd; } } return best; };
    let mode: 'none' | 'pan' | 'node' = 'none', drag: N | null = null, sx = 0, sy = 0, moved = 0, last = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; moved = 0; last = { x: e.clientX, y: e.clientY };
      drag = hit(e.clientX, e.clientY);
      if (drag) { mode = 'node'; const p = toWorld(e.clientX, e.clientY); drag.fx = p.x; drag.fy = p.y; sim.current?.alphaTarget(.3).restart(); }
      else mode = 'pan';
      c.classList.add('grabbing');
    };
    const move = (e: PointerEvent) => {
      if (mode === 'none') { const h = hit(e.clientX, e.clientY); if (h !== hover.current) { hover.current = h; dirty.current = true; c.classList.toggle('pointing', !!h); } return; }
      moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
      if (mode === 'node' && drag) { const p = toWorld(e.clientX, e.clientY); drag.fx = p.x; drag.fy = p.y; }
      else { view.current.x += e.clientX - last.x; view.current.y += e.clientY - last.y; }
      last = { x: e.clientX, y: e.clientY }; dirty.current = true;
    };
    const up = () => {
      c.classList.remove('grabbing');
      if (mode === 'node' && drag) { drag.fx = null; drag.fy = null; sim.current?.alphaTarget(0); if (moved < 4) setSel(drag); }
      else if (mode === 'pan' && moved < 4) setSel(null);
      mode = 'none'; drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), v = view.current, mx = e.clientX - r.left - v.w / 2, my = e.clientY - r.top - v.h / 2;
      const nk = Math.max(.08, Math.min(8, v.k * Math.exp(-e.deltaY * .0015)));
      v.x = mx - (mx - v.x) * (nk / v.k); v.y = my - (my - v.y) * (nk / v.k); v.k = nk; dirty.current = true;
    };
    const dbl = (e: MouseEvent) => { const n = hit(e.clientX, e.clientY); if (n && !n.unresolved && !n.isTag) bb.openNote?.(n.id); };
    const leave = () => { if (hover.current) { hover.current = null; dirty.current = true; } };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false }); c.addEventListener('dblclick', dbl); c.addEventListener('pointerleave', leave);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); c.removeEventListener('wheel', wheel); c.removeEventListener('dblclick', dbl); c.removeEventListener('pointerleave', leave); };
  }, []);

  // smooth camera moves (fit / focus)
  const animateTo = (k: number, x: number, y: number) => {
    const v = view.current, a = { ...v }, t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - p, 3); v.k = a.k + (k - a.k) * e; v.x = a.x + (x - a.x) * e; v.y = a.y + (y - a.y) * e; dirty.current = true; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const fit = () => {
    const ns = nodesRef.current.filter((n) => n.x != null); if (!ns.length) return;
    const xs = ns.map((n) => n.x!), ys = ns.map((n) => n.y!);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const v = view.current, k = Math.max(.08, Math.min(2.5, Math.min((v.w - 80) / (x1 - x0 || 1), (v.h - 120) / (y1 - y0 || 1))));
    animateTo(k, -(x0 + x1) / 2 * k, -(y0 + y1) / 2 * k);
  };
  const focusNode = (n: N) => { const k = Math.max(view.current.k, 1.4); animateTo(k, -(n.x ?? 0) * k, -(n.y ?? 0) * k); setSel(n); };
  useEffect(() => { const t = setTimeout(fit, 1600); return () => clearTimeout(t); }, [data?.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  // preview text of the selected note
  useEffect(() => { setNote(null); if (!sel || sel.unresolved || sel.isTag || !bb.noteText) return; let live = true; bb.noteText(sel.id).then((t) => { if (live) setNote(t); }); return () => { live = false; }; }, [sel?.id, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const byName = useMemo(() => { const m = new Map<string, string>(); for (const n of data?.nodes ?? []) if (!n.unresolved) { m.set(n.name.toLowerCase(), n.id); m.set(n.id.replace(/\.md$/i, '').toLowerCase(), n.id); } return m; }, [data]);
  const html = useMemo(() => (note == null ? '' : renderMd(note, (name) => byName.get(name.toLowerCase().replace(/\.md$/i, '')) ?? null)), [note, byName]);
  const noteClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a'); if (!a) return; e.preventDefault();
    if (a.dataset.url) { bb.openUrl(a.dataset.url); return; }
    const n = nodesRef.current.find((x) => x.id === a.dataset.id); if (n) focusNode(n);
  };
  const onSearchKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { const n = nodesRef.current.find((x) => x.name.toLowerCase().includes(qRef.current)); if (n) focusNode(n); else toast('No note with that name'); } };
  const nLinks = graph.links.length, nNotes = graph.nodes.filter((n) => !n.unresolved && !n.isTag).length;

  return <>
    {!solo && <Header title="Vault graph" sub={data?.ok ? `${data.vaultName} · ${nNotes} notes · ${nLinks} links · updates live` : 'Your Obsidian vault as a live graph'} right={<>
      <button className="btn" onClick={fit}><Icon name="search" size={15} /> Fit to screen</button>
      {bb.openGraphWindow && <button className="btn" onClick={() => bb.openGraphWindow?.()}><Icon name="external" size={15} /> Own window</button>}
    </>} />}
    <section className="glass card graph-card" ref={box}>
      <canvas ref={cv} />
      {!isDesktop && <div className="g-empty">The vault graph runs in the PC launcher, where the vault lives.</div>}
      {isDesktop && data && !data.ok && <div className="g-empty">Could not read the vault: {data.error}</div>}
      {isDesktop && data?.ok && !data.nodes.length && <div className="g-empty">No notes found in the vault yet.</div>}
      <div className="g-tools">
        <label className="glass tpill"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="Search notes…" /></label>
        {solo && <span className="glass tpill" style={{ paddingLeft: 14 }}>{data?.vaultName} · {nNotes} notes</span>}
        <span style={{ flex: 1 }} />
        {solo && <button className="glass round" style={{ width: 38, height: 38 }} onClick={fit} title="Fit to screen" aria-label="Fit to screen"><Icon name="search" size={16} /></button>}
        <button className={`glass round ${panel ? 'ring-on' : ''}`} style={{ width: 38, height: 38 }} onClick={() => setPanel((p) => !p)} title="Filters and forces" aria-label="Filters and forces"><Icon name="gear" size={16} /></button>
      </div>
      {panel && <div className="glass g-panel" style={sel ? { right: 'calc(min(420px, 45%) + 28px)' } : undefined}>
        <b style={{ color: 'var(--text)' }}>Filters</b>
        <label className="tog">Orphans <input type="checkbox" checked={opt.orphans} onChange={(e) => setOpt({ ...opt, orphans: e.target.checked })} /></label>
        <label className="tog">Unresolved links <input type="checkbox" checked={opt.unresolved} onChange={(e) => setOpt({ ...opt, unresolved: e.target.checked })} /></label>
        <label className="tog">Tags <input type="checkbox" checked={opt.tags} onChange={(e) => setOpt({ ...opt, tags: e.target.checked })} /></label>
        <label className="tog">Labels <input type="checkbox" checked={opt.labels} onChange={(e) => setOpt({ ...opt, labels: e.target.checked })} /></label>
        <b style={{ color: 'var(--text)', marginTop: 4 }}>Forces</b>
        <label>Centre force<input type="range" min={0} max={.3} step={.01} value={opt.center} onChange={(e) => setOpt({ ...opt, center: +e.target.value })} /></label>
        <label>Repel force<input type="range" min={20} max={800} step={10} value={opt.repel} onChange={(e) => setOpt({ ...opt, repel: +e.target.value })} /></label>
        <label>Link distance<input type="range" min={20} max={250} step={5} value={opt.dist} onChange={(e) => setOpt({ ...opt, dist: +e.target.value })} /></label>
      </div>}
      {folders.length > 1 && <div className="g-legend">{folders.slice(0, 9).map((f, i) => <span key={f}><i style={{ background: PALETTE[i % PALETTE.length], boxShadow: `0 0 8px ${PALETTE[i % PALETTE.length]}` }} />{f || 'Vault root'}</span>)}</div>}
      {sel && <div className="glass g-note">
        <div className="g-note-head">
          <b title={sel.id}>{sel.name}</b>
          {!sel.unresolved && !sel.isTag && <button className="btn sm accent" onClick={() => bb.openNote?.(sel.id)}><Icon name="external" size={13} /> Open in Obsidian</button>}
          <button className="iconbtn sm" onClick={() => setSel(null)} aria-label="Close preview"><Icon name="x" size={14} /></button>
        </div>
        <div className="g-note-meta">{sel.isTag ? 'Tag' : sel.unresolved ? 'Not created yet (linked from other notes)' : `${sel.id}${sel.mtime ? ' · edited ' + new Date(sel.mtime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`} · {sel.deg} link{sel.deg === 1 ? '' : 's'}</div>
        <div className="g-note-body" onClick={noteClick}>{sel.unresolved || sel.isTag ? <p>Linked notes:</p> : note == null ? <p>Loading…</p> : <div dangerouslySetInnerHTML={{ __html: html || '<p><i>Empty note</i></p>' }} />}
          {(sel.unresolved || sel.isTag) && <ul>{linksRef.current.filter((l) => (l.source as N).id === sel.id || (l.target as N).id === sel.id).map((l) => { const o = (l.source as N).id === sel.id ? l.target as N : l.source as N; return <li key={o.id}><a className="wl" data-id={o.id}>{o.name}</a></li>; })}</ul>}
        </div>
      </div>}
    </section>
  </>;
}
function radius(n: { deg: number; isTag?: boolean }) { return (n.isTag ? 3.5 : 4) + Math.sqrt(n.deg) * 1.9; }
