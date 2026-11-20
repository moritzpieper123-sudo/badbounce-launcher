/* More analytics (Mo 2026-11-20): 14 extra views on the Analytics page. 1-9 use data we already have (CSV + live stats fetch
   snapshots), 10-14 use the audience / traffic / retention numbers the stats fetch reads from TikTok Studio. */
import React, { useState } from 'react';
import { useApp } from '../ctx';
import { addDays, cleanDays, etaText, rewardsEstimate, fmtNum, kColor, kpis, matchPosts, MILESTONES, normLink, parseYmd, pctNorm, vn, ymd } from '../logic';
import { bb, isDesktop } from '../bridge';
import { Icon } from '../ui';
import type { Breakdown, Snapshot } from '../types';

const BLUE = 'rgba(170,195,240,.85)';
const METRICS = [['views', 'Views', '#AAC3F0', 0], ['likes', 'Likes', '#FF8F7A', 1], ['comments', 'Comments', '#7FD9A8', 2], ['shares', 'Shares', '#FFC63A', 3]] as const;
type Metric = (typeof METRICS)[number][0];
const DAY = 86400000;

/* ---------- data helpers ---------- */
/** Daily numbers: from the CSV days when they exist, else the growth between two fetch snapshots. */
function daily(snap: Snapshot, metric: Metric, range: number) {
  const st = snap.state.stats, now = new Date(snap.now), idx = METRICS.find((m) => m[0] === metric)![3], days = cleanDays(st.days);
  const haveDays = days.some((d) => d[metric] != null);
  const bySnap = new Map<string, number>();
  if (!haveDays) {
    const sn = st.snaps || [];
    for (let i = 1; i < sn.length; i++) {
      let add = 0;
      for (const [id, v] of Object.entries(sn[i].v)) { const p = sn[i - 1].v[id]; if (p) add += Math.max(0, (v[idx] ?? 0) - (p[idx] ?? 0)); }
      const d = sn[i].t.slice(0, 10); bySnap.set(d, (bySnap.get(d) || 0) + add);
    }
  }
  return Array.from({ length: range }, (_, i) => {
    const d = addDays(now, i - range + 1), k = ymd(d);
    const v = haveDays ? days.find((x) => x.date === k)?.[metric] : bySnap.get(k);
    return { d, v: v ?? 0, has: v != null };
  });
}
const sum = (a: { v: number }[]) => a.reduce((s, x) => s + x.v, 0);

/* ---------- tiny SVG charts ---------- */
type LineDef = { name?: string; color: string; pts: [number, number][]; dot?: boolean };
/** Line chart. Move the mouse over it: a guide line + a box show the exact value of every line at that point. */
function Line({ lines, h = 150, xl, fx, fy = fmtNum, unit = '' }: { lines: LineDef[]; h?: number; xl?: [string, string]; fx?: (x: number) => string; fy?: (y: number) => string; unit?: string }) {
  const [hv, setHv] = useState<number | null>(null);
  const all = lines.flatMap((l) => l.pts); if (all.length < 2) return <div className="empty">Not enough points yet.</div>;
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0])), y1 = Math.max(1e-9, ...all.map((p) => p[1])), y0 = Math.min(0, ...all.map((p) => p[1]));
  const X = (x: number) => 8 + ((x - x0) / Math.max(1e-9, x1 - x0)) * 584, Y = (y: number) => h - 10 - ((y - y0) / Math.max(1e-9, y1 - y0)) * (h - 24);
  const near = (l: LineDef, x: number) => l.pts.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b), l.pts[0]);
  const snapX = hv == null ? null : near({ color: '', pts: all }, hv)[0];
  return <div style={{ position: 'relative' }}>
    <svg viewBox={`0 0 600 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, cursor: 'crosshair' }} role="img"
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHv(x0 + (((e.clientX - r.left) / r.width) * 600 - 8) / 584 * (x1 - x0)); }} onMouseLeave={() => setHv(null)}>
      {[0, 0.5, 1].map((f) => <line key={f} x1="0" x2="600" y1={Y(y0 + (y1 - y0) * f)} y2={Y(y0 + (y1 - y0) * f)} stroke="rgba(170,195,240,.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      {lines.map((l, i) => { const d = l.pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' '); const e = l.pts[l.pts.length - 1];
        return <g key={i}><path d={d} fill="none" stroke={l.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${l.color})` }} />
          {l.dot !== false && <circle cx={X(e[0])} cy={Y(e[1])} r="4" fill={l.color} vectorEffect="non-scaling-stroke" />}</g>; })}
      {snapX != null && <line x1={X(snapX)} x2={X(snapX)} y1="0" y2={h} stroke="rgba(255,255,255,.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
    </svg>
    {snapX != null && <div className="small" style={{ position: 'absolute', top: 0, left: `${Math.min(80, Math.max(20, (X(snapX) / 600) * 100))}%`, transform: 'translateX(-50%)', background: 'rgba(14,18,32,.94)', color: '#F4F6FF', border: '1px solid rgba(170,195,240,.3)', borderRadius: 10, padding: '6px 9px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
      <div style={{ opacity: 0.7 }}>{fx ? fx(snapX) : fy(snapX)}</div>
      {lines.map((l, i) => { const p = near(l, snapX); return <div key={i} className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: l.color }} />{l.name ? `${l.name}: ` : ''}<b>{fy(p[1])}{unit}</b></div>; })}</div>}
    <div className="between small dim"><span>{xl?.[0]}</span><span>{xl?.[1]} · peak {fy(y1)}{unit}</span></div>
  </div>;
}
function Bars({ rows, unit = '' }: { rows: { label: string; v: number; color?: string; sub?: string }[]; unit?: string }) {
  const mx = Math.max(1e-9, ...rows.map((r) => r.v));
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{rows.map((r, i) => <div key={i} className="row" title={`${r.label}: ${r.sub ?? `${Math.round(r.v * 10) / 10}${unit}`}`} style={{ gap: 8 }}>
    <span className="small" style={{ width: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
    <div className="progress" style={{ height: 11, borderRadius: 6 }}><div style={{ width: `${(r.v / mx) * 100}%`, background: r.color || BLUE, borderRadius: 6 }} /></div>
    <span className="small num" style={{ width: 70, textAlign: 'right' }}>{r.sub ?? `${Math.round(r.v * 10) / 10}${unit}`}</span></div>)}</div>;
}
function Donut({ rows }: { rows: Breakdown[] }) {
  const cols = ['#FFC63A', '#AAC3F0', '#7FD9A8', '#FF8F7A', '#B8A2FF', '#7FD0E8'], r = 42, c = 2 * Math.PI * r; let off = 0;
  const tot = rows.reduce((s, x) => s + x.pct, 0) || 1;
  return <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Traffic sources">{rows.slice(0, 6).map((x, i) => { const len = (x.pct / tot) * c, el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={cols[i]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 60 60)"><title>{`${x.label}: ${x.pct}%`}</title></circle>; off += len; return el; })}</svg>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{rows.slice(0, 6).map((x, i) => <span key={i} className="row small" title={`${x.label}: ${x.pct}%`} style={{ gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: cols[i] }} />{x.label} <b>{x.pct}%</b></span>)}</div>
  </div>;
}
const Help = ({ children }: { children: React.ReactNode }) => <span className="small dim" style={{ lineHeight: 1.4 }}>{children}</span>;
const country = (c: string) => { if (c === 'Others') return 'Other countries'; try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c) || c; } catch { return c; } };
const fd = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty" style={{ lineHeight: 1.5 }}>{children}</div>;
const Spark = ({ v, color = '#FFC63A' }: { v: number[]; color?: string }) => {
  if (v.length < 3) return null; const mx = Math.max(...v, 1);
  return <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={{ width: '100%', height: 24 }}><path d={v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * 100} ${22 - (y / mx) * 20}`).join(' ')} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></svg>;
};
const arrow = (a: number, b: number) => b >= 10 ? <b style={{ color: a >= b ? 'var(--green)' : 'var(--red)' }}>{a >= b ? '▲' : '▼'} {Math.abs(((a - b) / b) * 100).toFixed(0)}%</b> : <span className="dim">–</span>;

export default function AnalyticsExtra() {
  const { snap } = useApp();
  const st = snap.state.stats, now = new Date(snap.now);
  const [range, setRange] = useState(30);
  const [metrics, setMetrics] = useState<Metric[]>(['views']);
  const [sinceMode, setSinceMode] = useState<'abs' | 'pct'>('abs');
  const [who, setWho] = useState<'viewers' | 'followers'>('viewers');
  const k = kpis(snap), matched = matchPosts(snap), aud = st.audience;
  const days = cleanDays(st.days);
  const hasAny = st.days.length > 0 || st.posts.length > 0;
  if (!hasAny) return null;
  const fileUrl = (n: number | null) => { const v = n != null ? snap.videos.find((x) => x.num === n) : undefined; return v?.thumbFile ? bb.fileUrl(v.thumbFile) : ''; };
  const label = (m: (typeof matched)[number]) => (m.num != null ? `#${vn(m.num)}` : m.post.title.slice(0, 16) || 'Video');
  const dayLabel = (i: number, n: number) => fd(addDays(now, i - n + 1));

  /* 1 followers over time */
  const fol = days.filter((d) => d.followers != null && d.date >= ymd(addDays(now, -range + 1))).map((d) => [parseYmd(d.date).getTime(), d.followers!] as [number, number]);
  /* 2 multi-metric lines */
  const series = METRICS.filter((m) => metrics.includes(m[0])).map((m) => { const d = daily(snap, m[0], range); return { m, d }; });
  /* 3 engagement per post */
  const eng = matched.filter((m) => (m.post.views || 0) > 0 && m.post.postTime).sort((a, b) => Date.parse(a.post.postTime!) - Date.parse(b.post.postTime!)).slice(-20)
    .map((m) => ({ m, rate: (((m.post.likes || 0) + (m.post.comments || 0) + (m.post.shares || 0) + (m.post.saves || 0)) / m.post.views!) * 100 }));
  /* 4 top / flop */
  const ranked = matched.filter((m) => (m.post.views || 0) > 0).sort((a, b) => (b.post.views || 0) - (a.post.views || 0));
  const top = ranked.slice(0, 3), flop = ranked.length >= 6 ? ranked.slice(-3).reverse() : [];
  /* 5 views since posting: TikTok's own per-video view history (hourly for new videos, daily for older ones), else our fetch snapshots */
  const sn = st.snaps || [];
  const since = matched.filter((m) => m.post.postTime).map((m) => {
    const t0 = Date.parse(m.post.postTime!); let pts: [number, number][] = [], src = '';
    const h = m.post.hist;
    if (h && h.length >= 2 && m.post.histStep) {
      let cum = 0; const step = m.post.histStep;
      pts = ([[0, 0], ...h.map(([key, v]) => { cum += v; return [Math.max(0, (key + step) * 1000 - t0) / DAY, cum] as [number, number]; })] as [number, number][]).filter((p) => p[0] <= 14);
      src = 'TikTok history';
    } else if (m.post.link) {
      const id = normLink(m.post.link);
      pts = sn.map((x) => [(Date.parse(x.t) - t0) / DAY, x.v[id]?.[0]] as [number, number | undefined]).filter((p): p is [number, number] => p[1] != null && p[0] >= 0 && p[0] <= 14);
      src = 'our refreshes';
    }
    const fin = pts.length ? pts[pts.length - 1][1] : 0;
    if (sinceMode === 'pct' && fin > 0) pts = pts.map((p) => [p[0], (p[1] / fin) * 100]);
    return { m, pts, src };
  }).filter((x) => x.pts.length >= 3).sort((a, b) => Date.parse(b.m.post.postTime!) - Date.parse(a.m.post.postTime!)).slice(0, 6);
  const lc = ['#FFC63A', '#AAC3F0', '#7FD9A8', '#FF8F7A', '#B8A2FF', '#7FD0E8'];
  /* 6 weekday x slot heatmap */
  const cell = new Map<string, { s: number; n: number }>(); const slots = new Set<string>();
  for (const m of matched) { if (!m.slot || !m.post.postTime || m.post.views == null) continue; const wd = (new Date(m.post.postTime).getDay() + 6) % 7; slots.add(m.slot); const c = cell.get(`${wd}|${m.slot}`) || { s: 0, n: 0 }; c.s += m.post.views; c.n++; cell.set(`${wd}|${m.slot}`, c); }
  const slotList = [...slots].sort(), cmax = Math.max(1, ...[...cell.values()].map((c) => c.s / c.n));
  /* 7 watch vs length */
  const sc = matched.filter((m) => m.num != null && m.post.fullWatch != null).map((m) => ({ m, len: snap.videos.find((v) => v.num === m.num)?.durationSec ?? m.post.retentionSecs ?? null, y: pctNorm(m.post.fullWatch!) })).filter((x) => x.len != null) as { m: (typeof matched)[number]; len: number; y: number }[];
  /* 8 week vs last week (week = last 7 days incl. today) */
  const w = (metric: Metric) => { const a = daily(snap, metric, 14); return [sum(a.slice(7)), sum(a.slice(0, 7))] as const; };
  const nfIn = (from: number, to: number) => { const r = days.filter((d) => d.newFollowers != null && d.date >= ymd(addDays(now, from)) && d.date <= ymd(addDays(now, to))); return r.length >= 4 ? r.reduce((x, d) => x + d.newFollowers!, 0) : null; };
  const postsIn = (a: number, b: number) => st.posts.filter((p) => p.postTime && Date.parse(p.postTime) >= now.getTime() - a * DAY && Date.parse(p.postTime) < now.getTime() - b * DAY).length;
  const rows8: { l: string; a: number | null; b: number | null }[] = [
    ...METRICS.map((m) => { const [a, b] = w(m[0]); return { l: m[1], a, b }; }),
    { l: 'New followers', a: nfIn(-6, 0), b: nfIn(-13, -7) },
    { l: 'Posts', a: postsIn(7, 0), b: postsIn(14, 7) },
  ];
  /* 9 forecast: pace = average net follower gain of the last 7 finished days */
  const ni = MILESTONES.findIndex((m) => (k.followers ?? 0) < m), next = ni < 0 ? null : MILESTONES[ni];
  const pace = k.pace, f = k.followers ?? 0;
  const pace30 = k.views7 * (30 / 7);
  const rw = rewardsEstimate(snap);
  const eur = (x: number) => (x >= 100 ? `€${Math.round(x / 10) * 10}` : `€${x.toFixed(x < 10 ? 2 : 0)}`);
  const pc = (a: [number, number]) => (a[0] === a[1] ? `${Math.round(a[0] * 100)}%` : `${Math.round(a[0] * 100)}–${Math.round(a[1] * 100)}%`);
  /* traffic: per video shares, weighted by that video's views */
  const trafficPosts = st.posts.filter((p) => p.traffic?.length && (p.views || 0) > 0);
  const trafficAgg = (() => { if (!trafficPosts.length) return aud?.traffic || null; const t = new Map<string, number>(); let tot = 0; for (const p of trafficPosts) { for (const x of p.traffic!) t.set(x.label, (t.get(x.label) || 0) + x.pct * p.views!); tot += 100 * p.views!; } return [...t.entries()].map(([label, v]) => ({ label, pct: Math.round((v / tot) * 1000) / 10 })).filter((x) => x.pct >= 0.1).sort((a, b) => b.pct - a.pct); })();
  /* followers by video */
  const byFol = matched.filter((m) => (m.post.newFollowers || 0) > 0).sort((a, b) => (b.post.newFollowers || 0) - (a.post.newFollowers || 0)).slice(0, 8);
  const hours = who === 'followers' ? (aud?.activeHours || null) : (aud?.viewerHours || aud?.activeHours || null);
  const ageR = who === 'viewers' ? aud?.age : aud?.fAge, genR = who === 'viewers' ? aud?.gender : aud?.fGender, couR = who === 'viewers' ? aud?.countries : aud?.fCountries;
  const card = (m: (typeof matched)[number], i: number, bad = false) => <div key={i} className="glass card" title={`${label(m)} · ${fmtNum(m.post.views)} views${m.post.fullWatch != null ? ` · ${pctNorm(m.post.fullWatch).toFixed(1)}% watched to the end` : ''}`} style={{ padding: 10, gap: 6, minWidth: 0 }}>
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      {fileUrl(m.num) ? <img src={fileUrl(m.num)} alt="" style={{ width: 44, height: 78, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} /> : <div style={{ width: 44, height: 78, borderRadius: 8, background: 'rgba(170,195,240,.12)', flexShrink: 0 }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row small" style={{ gap: 6 }}><span className="dot" style={{ width: 8, height: 8, background: kColor(m.konzept) }} /><b>{label(m)}</b></div>
        <div style={{ fontWeight: 800, fontSize: 20, color: bad ? 'var(--red)' : 'var(--green)' }}>{fmtNum(m.post.views)}</div>
        <div className="small dim">{m.post.fullWatch != null ? `${pctNorm(m.post.fullWatch).toFixed(0)}% watched to end` : 'views'}{m.post.avgWatch != null ? ` · ${m.post.avgWatch.toFixed(1)} s avg` : ''}</div>
      </div></div>
    {m.post.retention && <div title={`Retention: ${m.post.retention.map((x, j) => `${Math.round((j / Math.max(1, m.post.retention!.length - 1)) * (m.post.retentionSecs || 0))}s ${x}%`).filter((_, j) => j % 6 === 0).join(' · ')}`}><Spark v={m.post.retention} color={bad ? '#FF8F7A' : '#7FD9A8'} /><span className="small dim">Share still watching, start to end{m.post.retentionSecs ? ` (${m.post.retentionSecs} s)` : ''}</span></div>}
  </div>;
  const askFetch = isDesktop && bb.statsFetch ? <button className="btn sm" onClick={() => bb.statsFetch?.()}><Icon name="download" size={13} /> Refresh stats now</button> : null;

  return <>
    <section className="between" style={{ marginTop: 6 }}><h2 style={{ margin: 0 }}>More analytics</h2>
      <div className="row" style={{ gap: 6 }}>{[7, 30, 90].map((r) => <button key={r} className={`btn sm ${range === r ? 'white' : ''}`} onClick={() => setRange(r)}>{r}D</button>)}</div></section>
    <span className="small dim">Move the mouse over any chart, bar or box to see the exact numbers. Every card says in one line what it means.</span>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Followers over time</h2><span style={{ fontWeight: 700, color: 'var(--green)' }} title="Followers now minus followers 7 days ago">{k.followers7 != null ? `${k.followers7 >= 0 ? '+' : ''}${k.followers7} in 7 days` : ''}</span></div>
        {fol.length >= 2 ? <Line lines={[{ name: 'Followers', color: '#FFC63A', pts: fol }]} fx={(x) => new Date(x).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} xl={[fd(new Date(fol[0][0])), 'Today']} /> : <Empty>The curve builds up day by day, from every stats refresh.</Empty>}
        <Help>Your follower count at the end of each day. Older days are rebuilt from TikTok's daily follower changes.</Help></div>
      <div className="glass card"><div className="between"><h2>Daily numbers</h2>
        <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>{METRICS.map((m) => <button key={m[0]} className={`btn sm ${metrics.includes(m[0]) ? 'white' : ''}`} onClick={() => setMetrics((x) => (x.includes(m[0]) ? (x.length > 1 ? x.filter((y) => y !== m[0]) : x) : [...x, m[0]]))}>{m[1]}</button>)}</div></div>
        <Line lines={series.map(({ m, d }) => ({ name: m[1], color: m[2], pts: d.map((x, i) => [i, x.v] as [number, number]) }))} fx={(x) => dayLabel(Math.round(x), range)} xl={[fd(addDays(now, -range + 1)), 'Today']} />
        <Help>{series.some((s) => s.d.some((x) => x.has)) ? 'One line per metric (the lines share one scale, so views dwarf likes). Days TikTok has no numbers for yet show as 0.' : 'Fills from the CSV or after two stats refreshes.'}</Help></div>
    </section>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Engagement per post</h2><span className="small dim">last 20 posts</span></div>
        {eng.length ? <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 130 }}>{eng.map((e, i) => { const mx = Math.max(...eng.map((x) => x.rate)); return <div key={i} title={`${label(e.m)}: ${e.rate.toFixed(1)}% (${fmtNum(e.m.post.views)} views)`} style={{ flex: 1, height: Math.max(4, (e.rate / mx) * 120), background: kColor(e.m.konzept), borderRadius: 6, opacity: 0.9 }} />; })}</div> : <Empty>Needs posts with views and post time.</Empty>}
        {eng.length > 0 && <div className="small dim">Colour = Konzept · best {Math.max(...eng.map((e) => e.rate)).toFixed(1)}% · average {(eng.reduce((s, e) => s + e.rate, 0) / eng.length).toFixed(1)}%</div>}
        <Help>(likes + comments + shares + saves) ÷ views, per video. Higher = the video made people react, not only watch.</Help></div>
      <div className="glass card"><h2>Week vs. last week</h2>
        <table className="t"><thead><tr><th></th><th>This week</th><th>Last week</th><th></th></tr></thead><tbody>{rows8.map((r) => <tr key={r.l} title={`${r.l}: ${r.a == null ? 'no data' : fmtNum(r.a)} in the last 7 days vs ${r.b == null ? 'no data' : fmtNum(r.b)} in the 7 days before`}><td>{r.l}</td><td><b>{r.a == null ? '–' : fmtNum(r.a)}</b></td><td className="dim">{r.b == null ? '–' : fmtNum(r.b)}</td><td>{r.a != null && r.b != null ? arrow(r.a, r.b) : <span className="dim">–</span>}</td></tr>)}</tbody></table>
        <Help>This week = the last 7 days including today. "–" = TikTok gave no number for that week yet. The arrow shows up only when last week had at least 10.</Help></div>
    </section>

    <section className="glass card"><div className="between"><h2>Top and weakest videos</h2><span className="small dim">by views</span></div>
      {top.length ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>{top.map((m, i) => card(m, i))}{flop.map((m, i) => card(m, i + 10, true))}</div> : <Empty>Needs posts with views.</Empty>}
      <Help>Green = best 3, red = weakest 3. The small curve is the retention: how many viewers are still watching at each second (100% at the start). A steep drop in the first seconds = weak hook.</Help></section>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Views since posting</h2>
        <div className="row" style={{ gap: 5 }}><button className={`btn sm ${sinceMode === 'abs' ? 'white' : ''}`} onClick={() => setSinceMode('abs')}>Views</button><button className={`btn sm ${sinceMode === 'pct' ? 'white' : ''}`} onClick={() => setSinceMode('pct')}>% of total</button></div></div>
        {since.length ? <><Line lines={since.map((x, i) => ({ name: label(x.m), color: lc[i], pts: x.pts }))} fx={(x) => `${x < 1 ? `${Math.round(x * 24)} h` : `${x.toFixed(1)} days`} after posting`} fy={sinceMode === 'pct' ? (y) => y.toFixed(0) : fmtNum} unit={sinceMode === 'pct' ? '%' : ''} xl={['Posted', 'days after posting →']} /><div className="row small" style={{ gap: 10, flexWrap: 'wrap' }}>{since.map((x, i) => <span key={i} className="row" title={`${label(x.m)} · source: ${x.src}`} style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: lc[i] }} />{label(x.m)}</span>)}</div></> : <Empty>Needs the stats refresh with the TikTok login. Every video then shows how fast it collects views.</Empty>}
        <Help>Running total of views per video after it went online (last 6 videos). "% of total" shows how fast a video gets its views, even if one is much bigger. TikTok only keeps hourly numbers for the first days and daily numbers for about a week, so older videos start later.</Help></div>
      <div className="glass card"><div className="between"><h2>Weekday and slot</h2><span className="small dim">average views</span></div>
        {slotList.length ? <div style={{ display: 'grid', gridTemplateColumns: `38px repeat(${slotList.length}, 1fr)`, gap: 5, alignItems: 'center' }}>
          <span />{slotList.map((s) => <span key={s} className="small dim num" style={{ textAlign: 'center' }}>{s}</span>)}
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, wd) => <React.Fragment key={d}><span className="small dim">{d}</span>{slotList.map((s) => { const c = cell.get(`${wd}|${s}`); const a = c ? c.s / c.n : 0; return <div key={s} title={c ? `${d} ${s}: ${fmtNum(Math.round(a))} avg views · ${c.n} post${c.n > 1 ? 's' : ''}` : `${d} ${s}: no posts`} style={{ height: 26, borderRadius: 7, background: c ? `rgba(255,198,58,${0.12 + 0.8 * (a / cmax)})` : 'rgba(var(--wrgb),.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text)' }}>{c ? fmtNum(Math.round(a)) : ''}</div>; })}</React.Fragment>)}
        </div> : <Empty>Fills once posts are matched to slots and post times.</Empty>}
        <Help>Average views of the videos posted at that weekday and time. Brighter = more views. One viral video can colour a whole cell, so look at the post count in the hover box.</Help></div>
    </section>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Watched to the end vs. length</h2><span className="small dim">each dot = a video</span></div>
        {sc.length >= 2 ? (() => { const lx = Math.max(...sc.map((s) => s.len)), vx = Math.max(...sc.map((s) => s.m.post.views || 1)), my = Math.max(10, ...sc.map((s) => s.y)); return <><svg viewBox="0 0 300 150" style={{ width: '100%', height: 150 }} role="img">
          <line x1="22" y1="130" x2="296" y2="130" stroke="rgba(170,195,240,.25)" /><line x1="22" y1="8" x2="22" y2="130" stroke="rgba(170,195,240,.25)" />
          {sc.map((s, i) => <circle key={i} cx={22 + (s.len / lx) * 262} cy={130 - (Math.min(my, s.y) / my) * 118} r={4 + ((s.m.post.views || 0) / vx) * 9} fill={kColor(s.m.konzept)} fillOpacity=".75"><title>{`${label(s.m)}: ${s.len.toFixed(0)} s long, ${s.y.toFixed(1)}% watched to the end, ${fmtNum(s.m.post.views)} views`}</title></circle>)}
          <text x="4" y="14" fontSize="9" fill="currentColor" opacity=".5">{my.toFixed(0)}%</text><text x="296" y="143" fontSize="9" textAnchor="end" fill="currentColor" opacity=".5">{lx.toFixed(0)} s</text></svg></>; })() : <Empty>Needs the watched-to-the-end rate of at least 2 videos (stats refresh with login).</Empty>}
        <Help>Up = more people watch to the very end. Right = longer video. Bigger dot = more views. The scale goes up to the best video, not to 100%.</Help></div>
      <div className="glass card"><h2>Forecast</h2>
        <div className="small" style={{ display: 'flex', flexDirection: 'column', gap: 9, lineHeight: 1.5 }}>
          <span title="Average net follower gain of the last 7 finished days">Pace: {pace.perDay != null ? <><b>{pace.perDay >= 0 ? '+' : ''}{pace.perDay.toFixed(1)} followers/day</b> <span className="dim">({pace.total >= 0 ? '+' : ''}{pace.total} in the last {pace.days} days)</span></> : <span className="dim">needs 4+ days of follower numbers</span>}</span>
          {pace.spiky && <span style={{ color: 'var(--yellow-text)' }}>One day gave {pace.best} of {pace.total} followers. A viral spike is not a steady pace, so read the dates below as a rough guide.</span>}
          <span>{next ? <>Next milestone <b>{fmtNum(next)}</b>: {etaText(next - f, pace.perDay, now)}</> : 'All milestones reached.'}</span>
          <span>Creator Rewards followers <b>{fmtNum(f)} / 10K</b>: {f >= 10000 ? 'reached' : etaText(10000 - f, pace.perDay, now)}</span>
          <span>Creator Rewards views (30 days): <b>{fmtNum(Math.round(pace30))}</b> at this week's pace, target 100K. {pace30 >= 100000 ? <b style={{ color: 'var(--green)' }}>On track.</b> : <span className="dim">Needs {fmtNum(Math.max(0, Math.round((100000 - k.views30) / 30)))} more views per day.</span>}</span>
        </div>
        <Help>Simple maths: followers still missing ÷ average daily gain of the last 7 finished days. It is a straight line, not a prediction. Without 4 days of data it says so instead of guessing.</Help></div>
    </section>

    <section className="glass card"><div className="between"><h2>Creator Rewards income estimate</h2><span className="small dim">if you were in the program · last 30 days</span></div>
      {rw ? <>
        <div className="row" style={{ gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span title={`Low case ${eur(rw.revenue[0])}, high case ${eur(rw.revenue[1])}`} style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--yellow-text)' }}>{eur(rw.revenue[0])} – {eur(rw.revenue[1])}</span>
          <span className="small dim">per 30 days at your current views ({fmtNum(rw.views30)} views)</span></div>
        <table className="t"><thead><tr><th>Step</th><th>Low</th><th>High</th><th></th></tr></thead><tbody>
          <tr title="Only videos over 1 minute can earn. Videos whose length is unknown count half in the low case and fully in the high case."><td>Videos over 1 min</td><td>{Math.round(rw.len[0] * 100)}%</td><td>{Math.round(rw.len[1] * 100)}%</td><td className="small dim">of your views</td></tr>
          <tr title="Only views from the For You feed qualify. Share read from TikTok Studio (traffic sources). High case adds half of the profile views."><td>From For You</td><td>{Math.round(rw.fyp[0] * 100)}%</td><td>{Math.round(rw.fyp[1] * 100)}%</td><td className="small dim">of those</td></tr>
          <tr title="Assumption, not measured: repeat views, views under 5 seconds, invalid traffic and TikTok's validation remove 5 to 40 percent."><td>Valid after checks</td><td>{Math.round(rw.qual[0] * 100)}%</td><td>{Math.round(rw.qual[1] * 100)}%</td><td className="small dim">guess</td></tr>
          <tr title="Viewers in countries where the program clearly runs (DE, FR, ES, IT, UK, US). The high case adds PL, RO, NL, PT, HR and others at a low rate."><td>In program countries</td><td>{Math.round(rw.elig[0] * 100)}%</td><td>{Math.round(rw.elig[1] * 100)}%</td><td className="small dim">your viewers</td></tr>
          <tr><td><b>Qualified views</b></td><td><b>{fmtNum(Math.round(rw.qualified[0]))}</b></td><td><b>{fmtNum(Math.round(rw.qualified[1]))}</b></td><td className="small dim">= {pc([rw.qualified[0] / rw.views30, rw.qualified[1] / rw.views30])} of all</td></tr>
          <tr title="Weighted by where your viewers live. Public estimates: Germany 0.60-0.95, France 0.50-0.85, Spain 0.35-0.65, Italy 0.40-0.70, UK 0.95-1.55 euro per 1,000 qualified views."><td><b>RPM</b> per 1K qualified</td><td><b>{eur(rw.rpm[0])}</b></td><td><b>{eur(rw.rpm[1])}</b></td><td className="small dim">euro</td></tr>
        </tbody></table>
        <Help>Qualified views × RPM ÷ 1,000. An estimate from public, unofficial numbers: TikTok publishes no RPM, and the program is not open to you yet (it needs 10K followers and 100K views in 30 days; you have {fmtNum(k.followers ?? 0)} followers). It also pays only after TikTok's checks, so treat it as a rough range, not a forecast. In the end it is about {eur(rw.per1kViews[0])}–{eur(rw.per1kViews[1])} per 1,000 views you get.</Help>
      </> : <Empty>Needs the last 30 days of views and the audience countries (stats refresh with the TikTok login).</Empty>}</section>

    <section className="between"><h2 style={{ margin: 0 }}>Audience and traffic</h2>{askFetch}</section>
    <section className="grid g-2">
      <div className="glass card"><h2>Where views come from</h2>{trafficAgg?.length ? <Donut rows={trafficAgg} /> : <Empty>Read from TikTok Studio by the stats refresh. Needs the TikTok login once ("Fetch automatically").</Empty>}
        <Help>Share of views by source, added up over all videos (a big video counts more). "For You" = TikTok recommended it. "Personal Profile" = people came from your profile.</Help></div>
      <div className="glass card"><div className="between"><h2>Active hours</h2>
        <div className="row" style={{ gap: 5 }}><button className={`btn sm ${who === 'viewers' ? 'white' : ''}`} onClick={() => setWho('viewers')}>Viewers</button><button className={`btn sm ${who === 'followers' ? 'white' : ''}`} onClick={() => setWho('followers')}>Followers</button></div></div>
        {hours ? <><div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>{hours.map((v, h) => <div key={h} title={`${h}:00–${h}:59 · ${v}% of the busiest hour`} style={{ flex: 1, height: Math.max(3, v), background: v >= 90 ? 'var(--yellow)' : 'rgba(170,195,240,.4)', borderRadius: 3 }} />)}</div>
          <div className="between small dim"><span>0:00</span><span>12:00</span><span>23:00</span></div>
          <span className="small muted">Busiest: {[...hours.map((v, h) => [v, h] as const)].sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => `${x[1]}:00`).join(', ')}. Your slots (Berlin): 10:40 · 15:30 · 20:20 · 01:05 · 05:55.</span></> : <Empty>Appears after the stats refresh reads the Followers / Viewers page.</Empty>}
        <Help>When your {who} are on TikTok (your local time). The tallest bar is 100%. Post a little before the busy hours.</Help></div>
    </section>
    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Who {who === 'viewers' ? 'watches' : 'follows'}</h2>
        <div className="row" style={{ gap: 5 }}><button className={`btn sm ${who === 'viewers' ? 'white' : ''}`} onClick={() => setWho('viewers')}>Viewers</button><button className={`btn sm ${who === 'followers' ? 'white' : ''}`} onClick={() => setWho('followers')}>Followers</button></div></div>
        {ageR?.length || genR?.length || couR?.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ageR?.length ? <div><div className="small dim" style={{ marginBottom: 6 }}>Age</div><Bars unit="%" rows={[...ageR].sort((a, b) => a.label.localeCompare(b.label)).map((a) => ({ label: a.label, v: a.pct }))} /></div> : null}
          {genR?.length ? <div><div className="small dim" style={{ marginBottom: 6 }}>Gender</div><Bars unit="%" rows={genR.map((a) => ({ label: a.label, v: a.pct, color: '#FFC63A' }))} /></div> : null}
          {couR?.length ? <div><div className="small dim" style={{ marginBottom: 6 }}>Top countries</div><Bars unit="%" rows={couR.slice(0, 8).map((a) => ({ label: country(a.label), v: a.pct, color: '#7FD9A8' }))} /></div> : null}
        </div> : <Empty>Appears after the stats refresh reads the Viewers / Followers page.</Empty>}
        <Help>Percent of {who} (last 7 days for viewers). With only about {fmtNum(k.followers ?? 0)} followers the follower numbers are small, so they jump around.</Help></div>
      <div className="glass card"><div className="between"><h2>New vs. returning viewers</h2><span className="small dim">per day</span></div>
        {aud?.viewers?.length ? <><Bars rows={[...aud.viewers].sort((a, b) => b.ago - a.ago).map((x) => ({ label: fd(addDays(now, -x.ago)), v: x.total, color: '#AAC3F0', sub: `${fmtNum(x.total)} · ${x.total ? Math.round((x.fresh / x.total) * 100) : 0}% new` }))} /></> : <Empty>Appears after the stats refresh reads the Viewers page.</Empty>}
        <Help>Different people who watched on each day. "% new" = never watched you before. Yesterday is missing while TikTok is still counting.{aud?.uniqueViewers != null ? ` Last 7 days together: ${fmtNum(aud.uniqueViewers)} people.` : ''}</Help></div>
    </section>
    <section className="glass card"><div className="between"><h2>Followers won per video</h2><span className="small dim">new followers</span></div>
      {byFol.length ? <Bars rows={byFol.map((m) => ({ label: label(m), v: m.post.newFollowers || 0, color: kColor(m.konzept), sub: `+${m.post.newFollowers}` }))} /> : <Empty>No video has won followers in the window TikTok reports (hours to days after posting), or the per-video numbers are not read yet.</Empty>}
      <Help>Followers gained from each video in TikTok's report window. Compare with the account total: followers can also come from older videos or the profile.</Help></section>
  </>;
}
