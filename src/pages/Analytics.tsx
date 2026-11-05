import gsap from 'gsap';
import React, { useRef, useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { addDays, consistency, fmtNum, konzeptTable, kpis, MILESTONES, slotTable, weeklyReview, ymd, KONZEPTE, kColor, type CsvResult } from '../logic';
import { Header } from './parts';
import { Icon, Rings, Count } from '../ui';
import { bb, isDesktop } from '../bridge';
import { importCsvTexts } from '../csvImport';
import { TikTokLogo } from '../logos';

export default function Analytics() {
  const { snap, update, toast } = useApp();
  const [range, setRange] = useState(30);
  const [over, setOver] = useState(false);
  const [last, setLast] = useState<CsvResult[] | null>(null);
  const now = new Date(snap.now);
  const k = kpis(snap), kt = konzeptTable(snap), sl = slotTable(snap), cons = consistency(snap, 35), rev = weeklyReview(snap);
  const days = snap.state.stats.days;
  const series = Array.from({ length: range }, (_, i) => { const d = addDays(now, i - range + 1); return { d, v: days.find((x) => x.date === ymd(d))?.views ?? 0 }; });
  const maxV = Math.max(1, ...series.map((s) => s.v));
  const maxSlot = Math.max(1, ...sl.map((s) => s.avg));

  const importFiles = async (files: FileList | File[]) => {
    const list = await Promise.all(Array.from(files).map(async (f) => ({ name: f.name, text: /\.(csv|txt)$/i.test(f.name) ? await f.text() : '' })));
    const res = await importCsvTexts(list, update, toast);
    if (res.length) setLast(res);
  };

  return <>
    <Header title="Analytics" sub={snap.state.stats.importedAt ? `Last CSV import: ${new Date(snap.state.stats.importedAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'No data yet. Import your first TikTok Studio CSV below.'} right={<>
      {[7, 30, 90].map((r) => <button key={r} className={`btn sm ${range === r ? 'white' : ''}`} onClick={() => setRange(r)}>{r}D</button>)}
    </>} />

    <section className="glass card" style={{ padding: 16 }}>
      <label className={`drop drop-row ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); importFiles(e.dataTransfer.files); }}>
        <span className="drop-ico"><Icon name="csv" size={20} color="var(--yellow)" /></span>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <b style={{ color: 'var(--text)' }}>Weekly CSV import</b>
          <span className="small dim" style={{ display: 'block' }}>TikTok Studio → Analytics → Download data. Fetch it automatically, or drop the CSV files here / click to choose.</span>
        </span>
        {isDesktop && bb.csvFetch && <button type="button" className="btn sm accent" onClick={(e) => { e.preventDefault(); bb.csvFetch?.(); toast('Fetching the CSV in the background'); }}><Icon name="download" size={14} sw={2.4} /> Fetch automatically</button>}
        <button type="button" className="btn sm" onClick={(e) => { e.preventDefault(); bb.openUrl('https://www.tiktok.com/tiktokstudio/analytics'); }}><TikTokLogo size={14} /> TikTok Studio</button>
        <input type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && importFiles(e.target.files)} />
      </label>
      {last && <div className="small muted">{last.map((r, i) => <div key={i}>File {i + 1}: {r.kind === 'unknown' ? 'not recognised' : `${r.kind}, ${r.rows} rows`} · columns used: {r.found.join(', ') || 'none'}</div>)}</div>}
    </section>

    <section className="grid g-kpi">
      <div className="glass card kpi"><span className="l">Creator Rewards</span>
        <div className="row" style={{ gap: 14 }}>
          <Rings size={76} rings={[{ frac: (k.followers ?? 0) / 10000, color: 'var(--glow)' }, { frac: k.views30 / 100000, color: '#FFC63A' }]} />
          <div className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span><b style={{ color: 'var(--glow)' }}>{fmtNum(k.followers ?? 0)}</b><span className="dim"> / 10K followers</span></span>
            <span><b style={{ color: 'var(--yellow-text)' }}>{fmtNum(k.views30)}</b><span className="dim"> / 100K views</span></span>
          </div>
        </div>
        <span className="small dim">Views in 30 days · only videos over 1 min pay</span>
      </div>
      <div className="glass card kpi"><span className="l">Views · last 7 days</span><span className="v"><Count value={k.hasData ? k.views7 : null} format={fmtNum} /></span><span className="small" style={{ color: k.views7 >= k.viewsPrev7 ? 'var(--green)' : 'var(--red)' }}>{k.viewsPrev7 >= 100 ? `${k.views7 >= k.viewsPrev7 ? '+' : ''}${(((k.views7 - k.viewsPrev7) / k.viewsPrev7) * 100).toFixed(0)}% vs previous week` : <span className="dim">No previous week to compare yet</span>}</span></div>
      <div className="glass card kpi"><span className="l">New followers per 1K views</span><span className="v">{k.followersPer1k != null ? k.followersPer1k.toFixed(1) : '–'}</span><span className="small dim">How well views turn into followers</span></div>
      <div className="glass card kpi"><span className="l">Shares · saves per 1K views</span><span className="v">{k.sharesPer1k != null ? k.sharesPer1k.toFixed(1) : '–'}<span className="dim" style={{ fontWeight: 500 }}> · </span>{k.savesPer1k != null ? k.savesPer1k.toFixed(1) : '–'}</span><span className="small dim">Stronger reach signal than likes</span></div>
      <div className="glass card kpi"><span className="l">Watched to the end</span><span className="v">{k.fullWatch != null ? `${k.fullWatch.toFixed(0)}%` : '–'}</span><span className="small dim">{k.avgWatch != null ? `Avg watch time ${k.avgWatch.toFixed(1)} s` : 'Needs the content CSV'}</span></div>
    </section>

    <section className="glass card">
      <div className="between"><h2>Views per day</h2><span className="small dim">{range} days · peak {fmtNum(maxV > 1 ? maxV : 0)}</span></div>
      {days.length ? <>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: range > 30 ? 2 : 6, height: 160 }}>
          {series.map((s, i) => <div key={i} title={`${s.d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${fmtNum(s.v)} views`} className="bar-grow" style={{ animationDelay: `${Math.min(i, 40) * 15}ms`, flex: 1, height: Math.max(3, (s.v / maxV) * 150), borderRadius: range > 30 ? 3 : 8, boxShadow: i === series.length - 1 ? '0 0 20px var(--hl-glow)' : 'none', background: i === series.length - 1 ? 'var(--bar-hl)' : s.v === maxV ? 'rgba(170,195,240,.6)' : 'rgba(170,195,240,.28)' }} />)}
        </div>
        <div className="between small dim"><span>{series[0].d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span><span>Today</span></div>
      </> : <div className="empty">The chart fills after the first CSV import.</div>}
    </section>

    <section className="grid g-2">
      <div className="glass card">
        <h2>Konzept comparison</h2>
        {kt.length ? <table className="t"><thead><tr><th>Konzept</th><th>Posts</th><th>Avg views</th><th>Shares/1K</th><th>Full watch</th></tr></thead><tbody>
          {kt.map((r) => <tr key={r.k}><td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: kColor(r.k) }} />K{r.k} {KONZEPTE[r.k]?.name}</span></td><td>{r.posts}</td><td>{fmtNum(Math.round(r.avgViews))}</td><td>{r.sharesPer1k.toFixed(1)}</td><td>{r.full != null ? `${r.full.toFixed(0)}%` : '–'}</td></tr>)}
        </tbody></table> : <div className="empty">Matches CSV posts to videos by the TikTok link you paste after uploading (or by post time).</div>}
      </div>
      <div className="glass card">
        <div className="between"><h2>Best slot</h2><span className="small dim">avg views · posts</span></div>
        {sl.length ? sl.map((s) => <div key={s.slot} className="row"><span className="num" style={{ width: 48 }}>{s.slot}</span><div className="progress" style={{ height: 12, borderRadius: 6 }}><div style={{ width: `${(s.avg / maxSlot) * 100}%`, background: s.avg === maxSlot ? 'var(--yellow)' : 'rgba(170,195,240,.5)', borderRadius: 6 }} /></div><span className="small num" style={{ width: 84, textAlign: 'right' }}>{fmtNum(Math.round(s.avg))} · {s.posts}</span></div>) : <div className="empty">Fills once posts are matched to slots.</div>}
      </div>
    </section>

    <Milestones followers={k.followers} gain7={k.followers7} />

    <section className="grid g-2">
      <div className="glass card">
        <div className="between"><h2>Consistency</h2><span style={{ fontWeight: 700, color: 'var(--yellow-text)' }}>{cons.streak} day streak</span></div>
        <div className="heat" role="img" aria-label="Days the plan was kept">
          {cons.days.map((d) => { const bg = d.planned < 0 ? 'rgba(var(--wrgb),.04)' : d.planned === 0 ? 'rgba(170,195,240,.15)' : d.done >= d.planned ? '#7FD9A8' : d.done > 0 ? '#FFC63A' : d.date === ymd(now) ? 'rgba(var(--wrgb),.12)' : '#FF8F7A'; return <div key={d.date} title={`${d.date}: ${d.done}/${d.planned < 0 ? 0 : d.planned}`} style={{ background: bg }} />; })}
        </div>
        <div className="row small dim" style={{ flexWrap: 'wrap', gap: 12 }}>
          {[['#7FD9A8', 'all posted'], ['#FFC63A', 'some'], ['#FF8F7A', 'none'], ['rgba(170,195,240,.4)', 'warm-up']].map(([c, l]) => <span key={l} className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>)}
        </div>
      </div>
      <div className="glass card">
        <div className="between"><h2>Weekly review</h2><button className="btn sm primary" onClick={async () => { await bb.copyText(rev.text); await bb.openUrl(snap.state.settings.projectUrl); toast('Review copied: paste it into Claude'); }}><Icon name="sparkle" size={14} /> Ask Claude</button></div>
        <pre className="muted review">{rev.text}</pre>
      </div>
    </section>
  </>;
}

function Milestones({ followers, gain7 }: { followers: number | null; gain7: number | null }) {
  const f = followers ?? 0;
  const ni = MILESTONES.findIndex((m) => f < m);
  const next = ni < 0 ? null : MILESTONES[ni];
  const prev = ni <= 0 ? 0 : MILESTONES[ni - 1];
  const part = next ? (f - prev) / (next - prev) : 1;
  const lineW = Math.max(0, Math.min(100, ni < 0 ? 100 : ni === 0 ? 0 : ((ni - 1 + part) / (MILESTONES.length - 1)) * 100));
  const weeks = next && gain7 && gain7 > 0 ? Math.ceil((next - f) / gain7) : null;
  return <div className="glass card">
    <div className="between">
      <h2>Milestones</h2>
      <span className="small dim">{followers == null ? 'Import a CSV with followers to start' : `${fmtNum(f)} followers now`}</span>
    </div>
    <div className="row" style={{ gap: 18, alignItems: 'center' }}>
      <Ring value={part} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="small dim">{next ? 'Next milestone' : 'All milestones reached'}</div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>{next ? `${fmtNum(next)} followers` : '100K ★'}</div>
        <div className="small muted">{next ? `${fmtNum(next - f)} to go${weeks ? ` · about ${weeks} week${weeks === 1 ? '' : 's'} at this week's pace` : ''}` : 'Time for new goals, Sir.'}</div>
      </div>
    </div>
    <RouteTracker stops={MILESTONES.map((m) => ({ label: fmtNum(m), hit: f >= m }))} progress={ni < 0 ? 1 : ni === 0 ? 0 : (ni - 1 + part) / (MILESTONES.length - 1)} />
  </div>;
}

function Ring({ value }: { value: number }) {
  const r = 30, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`${Math.round(v * 100)}% to next milestone`} style={{ flexShrink: 0 }}>
    <circle cx="38" cy="38" r={r} fill="none" style={{ stroke: 'rgba(var(--wrgb),.1)' }} strokeWidth="7" />
    <circle cx="38" cy="38" r={r} fill="none" stroke="#FFC63A" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 38 38)" style={{ filter: 'drop-shadow(0 0 6px rgba(255,198,58,.6))' }} />
    <text x="38" y="43" textAnchor="middle" style={{ fill: 'var(--text)' }} fontSize="15" fontWeight="700">{Math.round(v * 100)}%</text>
  </svg>;
}

/** Stage tracker: a route line with checkpoints; a glowing ball travels along the SVG path to the current progress (GSAP). */
const ROUTE = 'M20 70 C 120 20, 200 20, 300 55 S 480 100, 560 60 S 760 10, 860 50 S 960 80, 980 60';
function RouteTracker({ stops, progress }: { stops: { label: string; hit: boolean }[]; progress: number }) {
  const path = useRef<SVGPathElement>(null), done = useRef<SVGPathElement>(null), ball = useRef<SVGGElement>(null);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    const p = path.current; if (!p) return;
    const L = p.getTotalLength();
    setPts(stops.map((_, i) => { const q = p.getPointAtLength((i / (stops.length - 1)) * L); return { x: q.x, y: q.y }; }));
    const st = { t: 0 };
    const place = () => {
      const l = st.t * L, q = p.getPointAtLength(l), q2 = p.getPointAtLength(Math.min(L, l + 1));
      ball.current?.setAttribute('transform', `translate(${q.x} ${q.y}) rotate(${Math.atan2(q2.y - q.y, q2.x - q.x) * 180 / Math.PI})`);
      done.current?.setAttribute('stroke-dasharray', `${l} ${L}`);
    };
    const target = Math.max(0, Math.min(1, progress));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { st.t = target; place(); return; }
    const tw = gsap.to(st, { t: target, duration: 1.6, ease: 'power3.inOut', delay: .2, onUpdate: place });
    place();
    return () => { tw.kill(); };
  }, [progress, stops.length]);
  return <div className="route">
    <svg viewBox="0 0 1000 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><radialGradient id="route-ball"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#F4F6FF" /><stop offset="1" stopColor="#F4F6FF" stopOpacity="0" /></radialGradient></defs>
      <path ref={path} d={ROUTE} className="route-base" />
      <path ref={done} d={ROUTE} className="route-done" strokeDasharray="0 2000" />
      {pts.map((q, i) => <g key={i} transform={`translate(${q.x} ${q.y})`} className={`route-stop ${stops[i].hit ? 'hit' : ''}`}>
        <circle r="11" />{stops[i].hit && <path d="M-4.5 0 l3 3 l6 -6.5" />}
      </g>)}
      <g ref={ball} className="route-ball"><circle r="20" fill="url(#route-ball)" opacity=".55" /><circle r="8.5" /></g>
    </svg>
    <div className="route-labels">{pts.map((q, i) => <span key={i} className={stops[i].hit ? 'hit' : ''} style={{ left: `${q.x / 10}%` }}>{stops[i].label}</span>)}</div>
  </div>;
}
