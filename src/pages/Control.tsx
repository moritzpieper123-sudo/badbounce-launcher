/* Control Room: review the auto-made videos before they are scheduled, see which videos can go viral, which Konzepte win or fail,
   what the autopilot plans for the next slots, and what needs you. Logic lives in autopilot.ts / autoDecide.ts / AutoDriver.tsx. */
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { bb, isDesktop } from '../bridge';
import type { GenStatus } from '../bridge';
import { Header, Thumb } from './parts';
import { Icon, Spark } from '../ui';
import { fmtNum, hm, kColor, vn } from '../logic';
import type { AppState, Video } from '../types';
import { AUTO_GEN, CID_NAME, autoOf, cidOf, stockOf, type AutoState, type ConceptStat, type PostScore } from '../autopilot';
import { decide } from '../autoDecide';

const ST_COL: Record<string, string> = { hot: '#FF7A59', rising: '#FFC63A', new: '#AAC3F0', ok: '#7FD9A8', weak: '#B8A2FF', flop: '#FF8F7A', winner: '#FFC63A', failing: '#FF8F7A' };
const ST_TXT: Record<string, string> = { hot: 'HOT', rising: 'RISING', new: 'NEW', ok: 'OK', weak: 'WEAK', flop: 'FLOP', winner: 'WINNER', failing: 'FAILING' };
const cidColor = (cid: string | null) => kColor(cid ? parseInt(cid.slice(1), 10) : null);
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

const Badge = ({ s }: { s: string }) => <span className="cr-badge" style={{ ['--bc' as string]: ST_COL[s] ?? '#AAC3F0' }}>{ST_TXT[s] ?? s}</span>;
const Ring = ({ v, color }: { v: number; color: string }) => <div className="cr-ring" style={{ background: `conic-gradient(${color} ${v * 3.6}deg, rgba(var(--wrgb),.1) 0)` }}><span>{v}</span></div>;

export default function Control() {
  const { snap, update, toast, go } = useApp();
  const au = autoOf(snap.state);
  const [gen, setGen] = useState<GenStatus>({ state: 'idle' });
  const [ready, setReady] = useState<Set<string>>(new Set(AUTO_GEN));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30e3); return () => clearInterval(t); }, []);
  useEffect(() => { bb.genStatus?.().then(setGen); bb.genReady?.().then((r) => setReady(new Set(r))); return bb.onGenStatus?.(setGen); }, []);
  const set = (f: (a: AutoState) => AutoState) => update((st: AppState) => ({ ...st, auto: f(autoOf(st)) }));
  const d = useMemo(() => decide(snap, now, { uploadBusy: false, canGen: isDesktop, canUpload: isDesktop, genReady: ready }), [snap, now, ready]);
  const viaClaude = au.producer !== 'launcher';
  const stock = stockOf(snap);
  const byNum = new Map(snap.videos.map((v) => [v.num, v] as const));
  const radar = [...d.scores].filter((s) => s.ageH <= 72).sort((a, b) => b.score - a.score).slice(0, 8);
  const maxMed = Math.max(1, ...d.stats.map((s) => s.medianViews));
  const alerts = au.alerts.filter((a) => !a.resolved && a.kind !== 'hot').slice(0, 8);
  const lastPull = snap.state.stats.snaps?.[snap.state.stats.snaps.length - 1]?.t;
  const decide1 = (num: number, v: 'ok' | 'no' | null) => set((a) => { const n = { ...a.approvals }; if (v) n[String(num)] = v; else delete n[String(num)]; return { ...a, approvals: n }; });
  const approveAll = () => set((a) => ({ ...a, approvals: { ...a.approvals, ...Object.fromEntries(stock.pending.map((v) => [String(v.num), 'ok' as const])) } }));
  const queueNow = (cid: string) => { if (!bb.genStart) return; set((a) => ({ ...a, genJobs: [...a.genJobs, { id: `${Date.now()}`, cid, num: Math.max(0, ...snap.videos.map((v) => Math.floor(v.num)), ...a.genJobs.map((j) => j.num)) + 1, state: 'queued' as const, at: new Date().toISOString(), reason: 'you asked' }] })); toast(`${cid} is queued for rendering`); };
  const copyGen = async (cid: string, n: number) => { await bb.copyText(`Gen x${n} ${cid}`); toast(`Copied "Gen x${n} ${cid}", paste it in the project chat`); };
  const nextRow = d.rows[0];
  const nextSlot = d.slots.find((s) => s.when.getTime() > now.getTime() && !s.taken);

  return <>
    <Header title="Control Room" sub="Review what the autopilot made, watch what is going viral, and see what it plans next." right={<>
      <button className={`btn ${au.enabled ? 'primary' : ''}`} onClick={() => set((a) => ({ ...a, enabled: !a.enabled }))} title="When on: renders videos 3 h before the day's first slot, schedules approved videos shortly before each slot, reacts to viral videos">
        <Icon name="sparkle" size={15} /> Autopilot {au.enabled ? 'ON' : 'OFF'}</button>
      <button className="btn" onClick={() => set((a) => ({ ...a, producer: viaClaude ? 'launcher' : 'claude' }))} title="Who renders the videos"><Icon name="film" size={15} /> Rendered by {viaClaude ? 'Claude' : 'launcher (K6b, K9 only)'}</button>
      {isDesktop && <button className="btn" onClick={() => bb.statsFetch?.()}><Icon name="update" size={15} /> Pull data now</button>}
    </>} />

    <section className="glass card cr-status">
      <div className="cr-stat"><small>Autopilot</small><b style={{ color: au.enabled ? 'var(--green)' : 'var(--dim)' }}>{au.enabled ? 'Running' : 'Off'}</b></div>
      <div className="cr-stat"><small>Next slot</small><b>{nextSlot ? hm(nextSlot.when) : '–'}</b>{nextRow && nextSlot && <span className="small" style={{ color: cidColor(nextRow.cid) }}>{nextRow.cid} {CID_NAME[nextRow.cid]}</span>}</div>
      <div className="cr-stat"><small>Waiting for your review</small><b style={{ color: stock.pending.length ? 'var(--yellow)' : undefined }}>{stock.pending.length}</b></div>
      <div className="cr-stat"><small>Approved, ready</small><b>{stock.approved.length}</b></div>
      <div className="cr-stat"><small>Rendering</small><b>{gen.state === 'running' ? `${gen.cid} #${gen.num}` : au.genJobs.filter((j) => j.state === 'queued').length ? `${au.genJobs.filter((j) => j.state === 'queued').length} queued` : 'idle'}</b>{gen.state === 'running' && <span className="small dim">{gen.msg}</span>}</div>
      <div className="cr-stat"><small>Last data pull</small><b>{lastPull ? ago(lastPull) : '–'}</b></div>
    </section>

    {alerts.length > 0 && <section className="glass card cr-alerts">
      <h2><Icon name="bell" size={16} /> Needs you</h2>
      {alerts.map((a) => <div key={a.id} className="cr-alert">
        <div><b>{a.title}</b><div className="small muted">{a.sub}</div><div className="small dim">{ago(a.at)}{a.count > 1 ? ` · ${a.count}x` : ''}</div></div>
        <div className="row" style={{ gap: 6 }}>
          {a.id.startsWith('claude-') && <button className="btn sm" onClick={() => copyGen(a.id.slice(7), 3)}><Icon name="copy" size={13} /> Copy Gen x3</button>}
          <button className="btn sm" onClick={() => set((x) => ({ ...x, alerts: x.alerts.map((y) => (y.id === a.id ? { ...y, resolved: true } : y)) }))}>Dismiss</button>
        </div>
      </div>)}
    </section>}

    <section className="glass card">
      <div className="between"><h2>Review queue <span className="chip">{stock.pending.length} new</span></h2>
        {stock.pending.length > 0 && <button className="btn sm primary" onClick={approveAll}><Icon name="check" size={14} /> Approve all</button>}</div>
      {!stock.pending.length && !stock.approved.length && <div className="empty">Nothing waiting. New videos appear here the moment they are rendered; nothing is scheduled before you approve it.</div>}
      <div className="cr-queue">
        {[...stock.pending, ...stock.approved].map((v) => <ReviewCard key={v.num} v={v} approved={au.approvals[String(v.num)] === 'ok'} onDecide={decide1} planned={d.rows.find((r) => r.cid === cidOf(v))} />)}
      </div>
      {stock.rejected.length > 0 && <p className="small dim">{stock.rejected.length} rejected video{stock.rejected.length > 1 ? 's' : ''} stay in Results and are never scheduled. <button className="chip chip-btn" onClick={() => stock.rejected.forEach((v) => decide1(v.num, null))}>Undo all</button></p>}
    </section>

    <section className="glass card">
      <h2>Viral radar <span className="small dim" style={{ fontWeight: 400 }}>· videos from the last 3 days, data every 20-45 min</span></h2>
      {!radar.length ? <div className="empty">No posted video with data yet. The radar fills after the first data pull.</div> :
        <div className="grid g-auto">{radar.map((s) => <RadarCard key={s.link} s={s} snapPost={snap.state.stats.posts.find((p) => p.link && p.link.includes(s.link))} />)}</div>}
    </section>

    <div className="grid g-auto" style={{ alignItems: 'start' }}>
      <section className="glass card">
        <h2>Concepts <span className="small dim" style={{ fontWeight: 400 }}>· who wins, who fails</span></h2>
        {[...d.stats].sort((a, b) => b.hotScore - a.hotScore || b.medianViews - a.medianViews).map((s) => <ConceptRow key={s.cid} s={s} max={maxMed} canGen={viaClaude || ready.has(s.cid)} onQueue={() => queueNow(s.cid)} onCopy={() => copyGen(s.cid, 3)} />)}
        <p className="small dim">Winner = median views 1.5x the channel; Failing = under 0.5x after {4} judged posts; Hot = a video of it is going viral right now.</p>
      </section>
      <section className="glass card">
        <h2>Plan for the next slots</h2>
        {!au.enabled && <div className="small dim">Autopilot is off: this is what it would do.</div>}
        {(() => {
          const rows = d.slots.filter((s) => s.when.getTime() > now.getTime()).slice(0, 8);
          if (!rows.length) return <div className="empty">No upcoming slots in the next 3 days (warm-up days post nothing).</div>;
          return <table className="t"><tbody>{rows.map((s) => {
            const r = d.rows.find((x) => x.slotIso === s.iso);
            const u = Object.entries(snap.state.uploads).find(([, x]) => new Date(x.slot ?? x.at).toISOString() === s.iso);
            const v = u ? byNum.get(+u[0]) : null;
            return <tr key={s.iso}>
              <td className="num">{s.when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} {hm(s.when)}</td>
              <td>{u ? <span><b style={{ color: 'var(--green)' }}>Scheduled</b> #{vn(+u[0])} {cidOf(v) ?? ''}</span> : r ? <span title={r.reason}><span className="dot" style={{ background: cidColor(r.cid), display: 'inline-block', marginRight: 6 }} /><b>{r.cid}</b> {CID_NAME[r.cid]} <span className="small dim">· {r.kind}</span></span> : <span className="small dim">{s.inWindow ? '–' : 'planned 3 h before the first slot of its day'}</span>}</td>
            </tr>;
          })}</tbody></table>;
        })()}
        {d.rows[0] && <p className="small muted">Why the next one: {d.rows[0].reason}</p>}
        {au.genJobs.length > 0 && <>
          <h2 style={{ marginTop: 6 }}>Render queue</h2>
          {[...au.genJobs].reverse().slice(0, 6).map((j) => <div key={j.id} className="row between small"><span><b>{j.cid}</b> #{j.num} <span className="dim">· {j.reason}</span></span><span style={{ color: j.state === 'error' ? 'var(--red)' : j.state === 'done' ? 'var(--green)' : 'var(--muted)' }}>{j.state}{j.msg && j.state === 'error' ? `: ${j.msg.slice(0, 60)}` : ''}</span></div>)}
          <button className="btn sm" onClick={() => set((a) => ({ ...a, genJobs: a.genJobs.filter((j) => j.state === 'queued' || j.state === 'running') }))}>Clear finished</button>
        </>}
      </section>
    </div>
    <p className="small dim">Rules in force: one day at a time (renders start 3 h before the day's first slot), each video is scheduled about {au.leadMin ?? 40} min before its slot, at most 5 of the same concept in a row then one other, a hot concept gets the next slots and follow-ups. <button className="chip chip-btn" onClick={() => go('upload')}>Upload page</button></p>
  </>;
}

function ReviewCard({ v, approved, onDecide, planned }: { v: Video; approved: boolean; onDecide: (n: number, d: 'ok' | 'no' | null) => void; planned?: { cid: string } }) {
  const [play, setPlay] = useState(false);
  const cid = cidOf(v);
  return <div className={`cr-card ${approved ? 'ok' : ''}`}>
    <div className="cr-vid" onClick={() => setPlay(true)}>
      {play && v.videoFile ? <video src={bb.fileUrl(v.videoFile)} controls autoPlay playsInline /> : <><Thumb v={v} w={108} h={192} /><span className="cr-play"><Icon name="play" size={20} /></span></>}
    </div>
    <div className="cr-info">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><b>#{vn(v.num)}</b>{cid && <span className="chip" style={{ color: cidColor(cid) }}><span className="dot" style={{ background: cidColor(cid) }} />{cid} {CID_NAME[cid]}</span>}{approved && <span className="chip" style={{ color: 'var(--green)' }}>approved</span>}{planned && planned.cid === cid && <span className="chip">planned today</span>}</div>
      <div className="small muted cr-desc">{(v.description || '').split('\n').filter(Boolean).slice(0, 2).join(' ')}</div>
      <div className="small dim">{v.durationSec ? `${Math.round(v.durationSec)} s` : ''}{v.durationSec && (v.durationSec < 60 || v.durationSec > 70) ? ' · outside 60-70 s' : ''}</div>
      <div className="row" style={{ gap: 6 }}>
        {approved ? <button className="btn sm" onClick={() => onDecide(v.num, null)}>Undo</button> : <button className="btn sm primary" onClick={() => onDecide(v.num, 'ok')}><Icon name="check" size={13} /> Approve</button>}
        <button className="btn sm danger" onClick={() => onDecide(v.num, 'no')}>Reject</button>
        <button className="btn sm icon" title="Open folder" onClick={() => bb.openPath(v.folder)}><Icon name="folder" size={13} /></button>
      </div>
    </div>
  </div>;
}

function RadarCard({ s, snapPost }: { s: PostScore; snapPost?: { hist?: [number, number][]; histStep?: number; postTime?: string; title: string } }) {
  const col = ST_COL[s.status];
  const pts = useMemo(() => { const h = snapPost?.hist; if (!h || h.length < 3) return []; let c = 0; return [...h].sort((a, b) => a[0] - b[0]).map(([, v]) => (c += v)); }, [snapPost]);
  return <div className="cr-radar" style={{ ['--bc' as string]: col }}>
    <Ring v={s.score} color={col} />
    <div className="cr-rbody">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Badge s={s.status} />{s.cid && <span className="chip" style={{ color: cidColor(s.cid) }}>{s.cid}</span>}<b>{s.num != null ? `#${vn(s.num)}` : ''}</b><span className="small dim">{s.ageH < 48 ? `${Math.round(s.ageH)} h` : `${Math.round(s.ageH / 24)} d`} old</span></div>
      <div className="small"><b>{fmtNum(s.views)}</b> views{s.ratio != null && <span className="muted"> · {s.ratio.toFixed(1)}x usual</span>}{s.lastHour != null && <span className="muted"> · +{fmtNum(s.lastHour)} last hour</span>}</div>
      {pts.length > 2 && <Spark values={pts} color={col} height={34} />}
      <div className="small dim">{s.reasons.slice(0, 2).join(' · ') || 'not enough data yet'}</div>
    </div>
  </div>;
}

function ConceptRow({ s, max, canGen, onQueue, onCopy }: { s: ConceptStat; max: number; canGen: boolean; onQueue: () => void; onCopy: () => void }) {
  const st = s.status;
  return <div className="cr-concept">
    <div className="row between"><span><span className="dot" style={{ background: cidColor(s.cid), display: 'inline-block', marginRight: 6 }} /><b>{s.cid}</b> <span className="muted">{s.name}</span></span><Badge s={st} /></div>
    <div className="cr-bar"><i style={{ width: `${Math.max(2, (s.medianViews / max) * 100)}%`, background: cidColor(s.cid) }} /></div>
    <div className="row between small dim"><span>{s.judged ? `median ${fmtNum(s.medianViews)} views · ${s.posts} posts${s.trend ? ` · ${s.trend === 'up' ? '▲' : s.trend === 'down' ? '▼' : '–'}` : ''}` : `${s.posts} posts, no verdict yet`}</span>
      <span>{s.stock ? `${s.stock} in stock ` : 'no stock '}{canGen ? <button className="chip chip-btn" onClick={onQueue}>render 1</button> : <button className="chip chip-btn" title="This Konzept needs Claude (new machine, song or seed search)" onClick={onCopy}>Gen x3</button>}</span></div>
  </div>;
}
