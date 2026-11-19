/* More analytics (Mo 2026-11-20): 14 extra views on the Analytics page. 1-9 use data we already have (CSV + live stats fetch
   snapshots), 10-14 use the audience / traffic / retention numbers the stats fetch reads from TikTok Studio. */
import React, { useState } from 'react';
import { useApp } from '../ctx';
import { addDays, fmtNum, kColor, kpis, matchPosts, MILESTONES, normLink, parseYmd, pctNorm, vn, ymd } from '../logic';
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
  const st = snap.state.stats, now = new Date(snap.now), idx = METRICS.find((m) => m[0] === metric)![3];
  const haveDays = st.days.some((d) => d[metric] != null);
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
    const v = haveDays ? st.days.find((x) => x.date === k)?.[metric] : bySnap.get(k);
    return { d, v: v ?? 0, has: v != null };
  });
}
const sum = (a: { v: number }[]) => a.reduce((s, x) => s + x.v, 0);

/* ---------- tiny SVG charts ---------- */
function Line({ lines, h = 150, xl }: { lines: { color: string; pts: [number, number][]; dot?: boolean }[]; h?: number; xl?: [string, string] }) {
  const all = lines.flatMap((l) => l.pts); if (all.length < 2) return <div className="empty">Not enough points yet.</div>;
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0])), y1 = Math.max(1e-9, ...all.map((p) => p[1])), y0 = Math.min(0, ...all.map((p) => p[1]));
  const X = (x: number) => 8 + ((x - x0) / Math.max(1e-9, x1 - x0)) * 584, Y = (y: number) => h - 10 - ((y - y0) / Math.max(1e-9, y1 - y0)) * (h - 24);
  return <div>
    <svg viewBox={`0 0 600 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h }} role="img">
      {[0, 0.5, 1].map((f) => <line key={f} x1="0" x2="600" y1={Y(y0 + (y1 - y0) * f)} y2={Y(y0 + (y1 - y0) * f)} stroke="rgba(170,195,240,.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      {lines.map((l, i) => { const d = l.pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' '); const e = l.pts[l.pts.length - 1];
        return <g key={i}><path d={d} fill="none" stroke={l.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${l.color})` }} />
          {l.dot !== false && <circle cx={X(e[0])} cy={Y(e[1])} r="4" fill={l.color} vectorEffect="non-scaling-stroke" />}</g>; })}
    </svg>
    <div className="between small dim"><span>{xl?.[0]}</span><span>{xl?.[1]} · peak {fmtNum(Math.round(y1))}</span></div>
  </div>;
}
function Bars({ rows, unit = '' }: { rows: { label: string; v: number; color?: string; sub?: string }[]; unit?: string }) {
  const mx = Math.max(1e-9, ...rows.map((r) => r.v));
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{rows.map((r, i) => <div key={i} className="row" style={{ gap: 8 }}>
    <span className="small" style={{ width: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
    <div className="progress" style={{ height: 11, borderRadius: 6 }}><div style={{ width: `${(r.v / mx) * 100}%`, background: r.color || BLUE, borderRadius: 6 }} /></div>
    <span className="small num" style={{ width: 70, textAlign: 'right' }}>{r.sub ?? `${Math.round(r.v * 10) / 10}${unit}`}</span></div>)}</div>;
}
function Donut({ rows }: { rows: Breakdown[] }) {
  const cols = ['#FFC63A', '#AAC3F0', '#7FD9A8', '#FF8F7A', '#B8A2FF', '#7FD0E8'], r = 42, c = 2 * Math.PI * r; let off = 0;
  const tot = rows.reduce((s, x) => s + x.pct, 0) || 1;
  return <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Traffic sources">{rows.slice(0, 6).map((x, i) => { const len = (x.pct / tot) * c, el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={cols[i]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />; off += len; return el; })}</svg>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{rows.slice(0, 6).map((x, i) => <span key={i} className="row small" style={{ gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: cols[i] }} />{x.label} <b>{x.pct}%</b></span>)}</div>
  </div>;
}
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
  const k = kpis(snap), matched = matchPosts(snap), aud = st.audience;
  const hasAny = st.days.length > 0 || st.posts.length > 0;
  if (!hasAny) return null;
  const fileUrl = (n: number | null) => { const v = n != null ? snap.videos.find((x) => x.num === n) : undefined; return v?.thumbFile ? bb.fileUrl(v.thumbFile) : ''; };
  const label = (m: (typeof matched)[number]) => (m.num != null ? `#${vn(m.num)}` : m.post.title.slice(0, 16) || 'Video');

  /* 1 followers over time */
  const fol = st.days.filter((d) => d.followers != null && d.date >= ymd(addDays(now, -range + 1))).map((d) => [parseYmd(d.date).getTime(), d.followers!] as [number, number]);
  /* 2 multi-metric lines */
  const series = METRICS.filter((m) => metrics.includes(m[0])).map((m) => { const d = daily(snap, m[0], range); return { m, d }; });
  /* 3 engagement per post */
  const eng = matched.filter((m) => (m.post.views || 0) > 0 && m.post.postTime).sort((a, b) => Date.parse(a.post.postTime!) - Date.parse(b.post.postTime!)).slice(-20)
    .map((m) => ({ m, rate: (((m.post.likes || 0) + (m.post.comments || 0) + (m.post.shares || 0) + (m.post.saves || 0)) / m.post.views!) * 100 }));
  /* 4 top / flop */
  const ranked = matched.filter((m) => (m.post.views || 0) > 0).sort((a, b) => (b.post.views || 0) - (a.post.views || 0));
  const top = ranked.slice(0, 3), flop = ranked.length >= 6 ? ranked.slice(-3).reverse() : [];
  /* 5 views since posting */
  const sn = st.snaps || [];
  const since = matched.filter((m) => m.post.link && m.post.postTime).map((m) => {
    const id = normLink(m.post.link!), t0 = Date.parse(m.post.postTime!);
    const pts = sn.map((s) => [(Date.parse(s.t) - t0) / 3600000, s.v[id]?.[0]] as [number, number | undefined]).filter((p): p is [number, number] => p[1] != null && p[0] >= 0 && p[0] <= 168);
    return { m, pts };
  }).filter((x) => x.pts.length >= 3).sort((a, b) => Date.parse(b.m.post.postTime!) - Date.parse(a.m.post.postTime!)).slice(0, 6);
  const lc = ['#FFC63A', '#AAC3F0', '#7FD9A8', '#FF8F7A', '#B8A2FF', '#7FD0E8'];
  /* 6 weekday x slot heatmap */
  const cell = new Map<string, { s: number; n: number }>(); const slots = new Set<string>();
  for (const m of matched) { if (!m.slot || !m.post.postTime || m.post.views == null) continue; const wd = (new Date(m.post.postTime).getDay() + 6) % 7; slots.add(m.slot); const c = cell.get(`${wd}|${m.slot}`) || { s: 0, n: 0 }; c.s += m.post.views; c.n++; cell.set(`${wd}|${m.slot}`, c); }
  const slotList = [...slots].sort(), cmax = Math.max(1, ...[...cell.values()].map((c) => c.s / c.n));
  /* 7 watch vs length */
  const sc = matched.filter((m) => m.num != null && m.post.fullWatch != null).map((m) => ({ m, len: snap.videos.find((v) => v.num === m.num)?.durationSec ?? null, y: pctNorm(m.post.fullWatch!) })).filter((x) => x.len != null) as { m: (typeof matched)[number]; len: number; y: number }[];
  /* 8 week vs last week */
  const w = (metric: Metric) => { const a = daily(snap, metric, 14); return [sum(a.slice(7)), sum(a.slice(0, 7))] as const; };
  const folAt = (off: number) => st.days.filter((d) => d.followers != null && d.date <= ymd(addDays(now, off))).pop()?.followers;
  const f0 = folAt(-14), f1 = folAt(-7), f2 = folAt(0);
  const postsIn = (a: number, b: number) => st.posts.filter((p) => p.postTime && Date.parse(p.postTime) >= now.getTime() - a * DAY && Date.parse(p.postTime) < now.getTime() - b * DAY).length;
  const rows8: { l: string; a: number; b: number; fmt?: (x: number) => string }[] = [
    ...METRICS.map((m) => { const [a, b] = w(m[0]); return { l: m[1], a, b }; }),
    { l: 'New followers', a: f2 != null && f1 != null ? f2 - f1 : 0, b: f1 != null && f0 != null ? f1 - f0 : 0 },
    { l: 'Posts', a: postsIn(7, 0), b: postsIn(14, 7) },
  ];
  /* 9 forecast */
  const ni = MILESTONES.findIndex((m) => (k.followers ?? 0) < m), next = ni < 0 ? null : MILESTONES[ni];
  const gain7 = k.followers7 ?? 0, daysTo = next && gain7 > 0 ? Math.ceil(((next - (k.followers ?? 0)) / gain7) * 7) : null;
  const pace30 = k.views7 * (30 / 7);
  const etaDate = (d: number) => addDays(now, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  /* 14 followers by video */
  const byFol = matched.filter((m) => (m.post.newFollowers || 0) > 0).sort((a, b) => (b.post.newFollowers || 0) - (a.post.newFollowers || 0)).slice(0, 8);
  const card = (m: (typeof matched)[number], i: number, bad = false) => <div key={i} className="glass card" style={{ padding: 10, gap: 6, minWidth: 0 }}>
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      {fileUrl(m.num) ? <img src={fileUrl(m.num)} alt="" style={{ width: 44, height: 78, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} /> : <div style={{ width: 44, height: 78, borderRadius: 8, background: 'rgba(170,195,240,.12)', flexShrink: 0 }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row small" style={{ gap: 6 }}><span className="dot" style={{ width: 8, height: 8, background: kColor(m.konzept) }} /><b>{label(m)}</b></div>
        <div style={{ fontWeight: 800, fontSize: 20, color: bad ? 'var(--red)' : 'var(--green)' }}>{fmtNum(m.post.views)}</div>
        <div className="small dim">{m.post.fullWatch != null ? `${pctNorm(m.post.fullWatch).toFixed(0)}% watched to end` : 'views'}{m.post.avgWatch != null ? ` · ${m.post.avgWatch.toFixed(1)} s avg` : ''}</div>
      </div></div>
    {m.post.retention && <><Spark v={m.post.retention} color={bad ? '#FF8F7A' : '#7FD9A8'} /><span className="small dim">Retention: share still watching, start to end</span></>}
  </div>;
  const askFetch = isDesktop && bb.statsFetch ? <button className="btn sm" onClick={() => bb.statsFetch?.()}><Icon name="download" size={13} /> Refresh stats now</button> : null;

  return <>
    <section className="between" style={{ marginTop: 6 }}><h2 style={{ margin: 0 }}>More analytics</h2>
      <div className="row" style={{ gap: 6 }}>{[7, 30, 90].map((r) => <button key={r} className={`btn sm ${range === r ? 'white' : ''}`} onClick={() => setRange(r)}>{r}D</button>)}</div></section>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Followers over time</h2><span style={{ fontWeight: 700, color: 'var(--green)' }}>{k.followers7 != null ? `${k.followers7 >= 0 ? '+' : ''}${k.followers7} in 7 days` : ''}</span></div>
        {fol.length >= 2 ? <Line lines={[{ color: '#FFC63A', pts: fol }]} xl={[new Date(fol[0][0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), 'Today']} /> : <Empty>The curve builds up day by day, from every stats refresh.</Empty>}</div>
      <div className="glass card"><div className="between"><h2>Daily numbers</h2>
        <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>{METRICS.map((m) => <button key={m[0]} className={`btn sm ${metrics.includes(m[0]) ? 'white' : ''}`} onClick={() => setMetrics((x) => (x.includes(m[0]) ? (x.length > 1 ? x.filter((y) => y !== m[0]) : x) : [...x, m[0]]))}>{m[1]}</button>)}</div></div>
        <Line lines={series.map(({ m, d }) => ({ color: m[2], pts: d.map((x, i) => [i, x.v] as [number, number]) }))} xl={[addDays(now, -range + 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), 'Today']} />
        <span className="small dim">{series.some((s) => s.d.some((x) => x.has)) ? 'Each metric is scaled to the biggest value shown.' : 'Fills from the CSV or after two stats refreshes.'}</span></div>
    </section>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Engagement per post</h2><span className="small dim">likes + comments + shares + saves per view · last 20</span></div>
        {eng.length ? <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 130 }}>{eng.map((e, i) => { const mx = Math.max(...eng.map((x) => x.rate)); return <div key={i} title={`${label(e.m)}: ${e.rate.toFixed(1)}%`} style={{ flex: 1, height: Math.max(4, (e.rate / mx) * 120), background: kColor(e.m.konzept), borderRadius: 6, opacity: 0.9 }} />; })}</div> : <Empty>Needs posts with views and post time.</Empty>}
        {eng.length > 0 && <div className="small dim">Colour = Konzept · best {Math.max(...eng.map((e) => e.rate)).toFixed(1)}% · average {(eng.reduce((s, e) => s + e.rate, 0) / eng.length).toFixed(1)}%</div>}</div>
      <div className="glass card"><h2>Week vs. last week</h2>
        <table className="t"><thead><tr><th></th><th>This week</th><th>Last week</th><th></th></tr></thead><tbody>{rows8.map((r) => <tr key={r.l}><td>{r.l}</td><td><b>{fmtNum(r.a)}</b></td><td className="dim">{fmtNum(r.b)}</td><td>{arrow(r.a, r.b)}</td></tr>)}</tbody></table></div>
    </section>

    <section className="glass card"><div className="between"><h2>Top and weakest videos</h2><span className="small dim">by views</span></div>
      {top.length ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>{top.map((m, i) => card(m, i))}{flop.map((m, i) => card(m, i + 10, true))}</div> : <Empty>Needs posts with views.</Empty>}
      {top.length > 0 && !top.some((m) => m.post.retention) && <span className="small dim">Retention curves appear here once the stats fetch has read them from TikTok Studio (needs the TikTok login).</span>}</section>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Views since posting</h2><span className="small dim">first 7 days, last 6 videos</span></div>
        {since.length ? <><Line lines={since.map((s, i) => ({ color: lc[i], pts: s.pts }))} xl={['Posted', '7 days']} /><div className="row small" style={{ gap: 10, flexWrap: 'wrap' }}>{since.map((s, i) => <span key={i} className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: lc[i] }} />{label(s.m)}</span>)}</div></> : <Empty>The stats refresh runs every 30 min. After a few runs, one line per video shows how fast it grows.</Empty>}</div>
      <div className="glass card"><div className="between"><h2>Weekday and slot</h2><span className="small dim">average views</span></div>
        {slotList.length ? <div style={{ display: 'grid', gridTemplateColumns: `38px repeat(${slotList.length}, 1fr)`, gap: 5, alignItems: 'center' }}>
          <span />{slotList.map((s) => <span key={s} className="small dim num" style={{ textAlign: 'center' }}>{s}</span>)}
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, wd) => <React.Fragment key={d}><span className="small dim">{d}</span>{slotList.map((s) => { const c = cell.get(`${wd}|${s}`); const a = c ? c.s / c.n : 0; return <div key={s} title={c ? `${fmtNum(Math.round(a))} avg views · ${c.n} post${c.n > 1 ? 's' : ''}` : 'no posts'} style={{ height: 26, borderRadius: 7, background: c ? `rgba(255,198,58,${0.12 + 0.8 * (a / cmax)})` : 'rgba(var(--wrgb),.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text)' }}>{c ? fmtNum(Math.round(a)) : ''}</div>; })}</React.Fragment>)}
        </div> : <Empty>Fills once posts are matched to slots and post times.</Empty>}</div>
    </section>

    <section className="grid g-2">
      <div className="glass card"><div className="between"><h2>Watched to the end vs. length</h2><span className="small dim">each dot = a video</span></div>
        {sc.length >= 2 ? (() => { const lx = Math.max(...sc.map((s) => s.len)), vx = Math.max(...sc.map((s) => s.m.post.views || 1)); return <><svg viewBox="0 0 300 150" style={{ width: '100%', height: 150 }} role="img">
          <line x1="22" y1="130" x2="296" y2="130" stroke="rgba(170,195,240,.25)" /><line x1="22" y1="8" x2="22" y2="130" stroke="rgba(170,195,240,.25)" />
          {sc.map((s, i) => <circle key={i} cx={22 + (s.len / lx) * 262} cy={130 - (Math.min(100, s.y) / 100) * 118} r={4 + ((s.m.post.views || 0) / vx) * 9} fill={kColor(s.m.konzept)} fillOpacity=".75"><title>{`${label(s.m)}: ${s.len.toFixed(0)} s, ${s.y.toFixed(0)}% watched, ${fmtNum(s.m.post.views)} views`}</title></circle>)}
          <text x="4" y="14" fontSize="9" fill="currentColor" opacity=".5">100%</text><text x="296" y="143" fontSize="9" textAnchor="end" fill="currentColor" opacity=".5">{lx.toFixed(0)} s</text></svg><span className="small dim">Up = more people watch to the end · right = longer video · size = views</span></>; })() : <Empty>Needs video length and the watched-to-end rate of at least 2 videos.</Empty>}</div>
      <div className="glass card"><h2>Forecast</h2>
        <div className="small" style={{ display: 'flex', flexDirection: 'column', gap: 9, lineHeight: 1.5 }}>
          <span>{next ? <>Next milestone <b>{fmtNum(next)} followers</b>: {daysTo ? <>about <b>{etaDate(daysTo)}</b> ({daysTo} days) at this week's pace of {gain7}/week</> : <span className="dim">needs a positive week to estimate</span>}</> : 'All milestones reached.'}</span>
          <span>Creator Rewards views (30 days): <b>{fmtNum(Math.round(pace30))}</b> at this week's pace, target 100K. {pace30 >= 100000 ? <b style={{ color: 'var(--green)' }}>On track.</b> : <span className="dim">Needs {fmtNum(Math.max(0, Math.round((100000 - k.views30) / 30)))} more views per day.</span>}</span>
          <span>Creator Rewards followers: <b>{fmtNum(k.followers ?? 0)}</b> / 10K{(k.followers ?? 0) < 10000 && gain7 > 0 ? <> · about <b>{etaDate(Math.ceil(((10000 - (k.followers ?? 0)) / gain7) * 7))}</b></> : null}</span>
        </div></div>
    </section>

    <section className="between"><h2 style={{ margin: 0 }}>Audience and traffic</h2>{askFetch}</section>
    <section className="grid g-2">
      <div className="glass card"><h2>Traffic sources</h2>{aud?.traffic?.length ? <Donut rows={aud.traffic} /> : <Empty>Read from TikTok Studio by the stats refresh. Needs the TikTok login once ("Fetch automatically").</Empty>}</div>
      <div className="glass card"><h2>Active hours of your followers</h2>
        {aud?.activeHours ? <><div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>{aud.activeHours.map((v, h) => <div key={h} title={`${h}:00 · ${v}%`} style={{ flex: 1, height: Math.max(3, v), background: v >= 90 ? 'var(--yellow)' : 'rgba(170,195,240,.4)', borderRadius: 3 }} />)}</div>
          <div className="between small dim"><span>0:00</span><span>12:00</span><span>23:00</span></div>
          <span className="small muted">Busiest: {[...aud.activeHours.map((v, h) => [v, h] as const)].sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => `${x[1]}:00`).join(', ')}. Compare with your slots 12:30 · 15:30 · 18:30 · 21:00.</span></> : <Empty>Appears after the stats refresh reads the Followers page.</Empty>}</div>
    </section>
    <section className="grid g-2">
      <div className="glass card"><h2>Who watches</h2>{aud && (aud.age?.length || aud.gender?.length || aud.countries?.length) ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {aud.age?.length ? <div><div className="small dim" style={{ marginBottom: 6 }}>Age</div><Bars unit="%" rows={aud.age.map((a) => ({ label: a.label, v: a.pct }))} /></div> : null}
        {aud.gender?.length ? <div><div className="small dim" style={{ marginBottom: 6 }}>Gender</div><Bars unit="%" rows={aud.gender.map((a) => ({ label: a.label, v: a.pct, color: '#FFC63A' }))} /></div> : null}
        {aud.countries?.length ? <div><div className="small dim" style={{ marginBottom: 6 }}>Top countries</div><Bars unit="%" rows={aud.countries.slice(0, 6).map((a) => ({ label: a.label, v: a.pct, color: '#7FD9A8' }))} /></div> : null}
      </div> : <Empty>Appears after the stats refresh reads the Viewers page.</Empty>}</div>
      <div className="glass card"><div className="between"><h2>Followers won per video</h2><span className="small dim">new followers</span></div>
        {byFol.length ? <Bars rows={byFol.map((m) => ({ label: label(m), v: m.post.newFollowers || 0, color: kColor(m.konzept), sub: `+${m.post.newFollowers}` }))} /> : <Empty>Needs the per-video numbers from TikTok Studio (new followers per video).</Empty>}</div>
    </section>
  </>;
}
