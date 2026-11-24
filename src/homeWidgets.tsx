/* Shared pieces of the home page and the screen saver. */
import React from 'react';
import { Icon, Spark, Rings } from './ui';
import { Thumb } from './pages/parts';
import { fmtNum, fmtIn, minsUntil } from './logic';
import { kColor } from './logic';
import type { HomeData } from './homeData';

const SC: Record<string, string> = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: 'rgba(255,255,255,.25)' };
const cls = (g?: boolean, x = '') => `${g ? 'glass card lift ' : ''}hm-card ${x}`.trim();
const cidNum = (cid: string | null) => (cid ? parseInt(cid.slice(1), 10) : null);

/** The next 24 hours as a line: every slot is a dot, a thin marker shows now. */
export function Timeline({ d }: { d: HomeData }) {
  const t0 = d.now.getTime() - 3 * 3600e3, span = 24 * 3600e3;
  const pos = (t: number) => ((t - t0) / span) * 100;
  const items = d.slots.filter((s) => s.when.getTime() >= t0 && s.when.getTime() <= t0 + span);
  const hours = Array.from({ length: 9 }, (_, i) => { const t = new Date(t0); t.setMinutes(0, 0, 0); t.setHours(t.getHours() + 1 + i * 3); return t; });
  return <div className="hm-tl" aria-label="Next 24 hours">
    <div className="hm-tl-line" />
    {hours.map((h, i) => pos(h.getTime()) > 0 && pos(h.getTime()) < 100 && <span key={i} className="hm-tl-h" style={{ left: `${pos(h.getTime())}%` }}>{String(h.getHours()).padStart(2, '0')}</span>)}
    <span className="hm-tl-now" style={{ left: `${pos(d.now.getTime())}%` }}><i /></span>
    {items.map((s) => <span key={s.when.toISOString()} className={`hm-tl-slot ${s.state}`} style={{ left: `${pos(s.when.getTime())}%`, ['--c' as string]: SC[s.state] ?? '#AAC3F0' }}>
      <i />{s.state === 'uploaded' ? <Icon name="check" size={11} color="currentColor" sw={3} /> : null}
      <b className="num">{s.time}</b><small>{s.state === 'uploaded' ? (s.auto ? 'auto' : 'posted') : s.num != null ? `#${s.num}` : '–'}</small>
    </span>)}
  </div>;
}

export function AutopilotPanel({ d, big, g }: { d: HomeData; big?: boolean; g?: boolean }) {
  const bad = d.problems.length > 0;
  const state = bad ? 'bad' : d.enabled ? 'on' : '';
  return <div className={cls(g, `hm-ap ${big ? 'big' : ''}`)} title={bad ? d.problems.map((p) => p.title).join(' · ') : d.headline}>
    <div className="hm-h"><span className={`hm-led ${state}`} /><b>Autopilot</b>{d.autoApprove && <span className="hm-tag" title="Auto-approve is on"><Icon name="check" size={11} color="currentColor" sw={3} /> auto</span>}</div>
    <div className="hm-status"><span className={`hm-orb ${state} ${d.rendering ? 'busy' : ''}`}><Icon name={bad ? 'bell' : d.rendering ? 'film' : 'radar'} size={26} color="currentColor" /></span>
      <div className="hm-big">{d.rendering ?? (bad ? `${d.problems.length} alert${d.problems.length > 1 ? 's' : ''}` : d.enabled ? 'Ready' : 'Off')}</div></div>
    <div className="hm-chips">
      <span title="To review"><Icon name="film" size={14} color="currentColor" /><b className="num">{d.pending}</b></span>
      <span title="Approved and ready"><Icon name="check" size={14} color="currentColor" /><b className="num">{d.approved}</b></span>
      <span title="Rendering queue"><Icon name="play" size={13} color="currentColor" /><b className="num">{d.queued}</b></span>
      {bad && <span className="warn" title={d.problems[0].title}><Icon name="bell" size={14} color="currentColor" /><b className="num">{d.problems.length}</b></span>}
    </div>
  </div>;
}

export function NextSlotPanel({ d, g }: { d: HomeData; g?: boolean }) {
  const n = d.nextSlot;
  if (!n) return <div className={cls(g)}><div className="hm-h"><Icon name="calendar" size={14} color="currentColor" /><b>Next slot</b></div><div className="hm-big">–</div></div>;
  const mins = minsUntil(n.when, d.now);
  const frac = Math.max(0, Math.min(1, 1 - mins / 300));
  return <div className={cls(g, 'hm-next')} title={n.why}>
    <div className="hm-h"><Icon name="calendar" size={14} color="currentColor" /><b>Next slot</b><span className="hm-tag">{fmtIn(mins).replace(/^in /, '')}</span></div>
    <div className="hm-time num">{n.time}</div>
    <div className="hm-bar"><i style={{ width: `${frac * 100}%` }} /></div>
    <div className="hm-concept"><span className="dot" style={{ background: kColor(cidNum(n.cid)) }} />{n.cid ? `${n.cid} ${n.name}` : n.name}</div>
  </div>;
}

export function StatsPanel({ d, g }: { d: HomeData; g?: boolean }) {
  const k = d.k;
  return <div className={cls(g, "hm-stats")}>
    <div className="hm-h"><Icon name="chart" size={14} color="currentColor" /><b>Channel</b>{d.hit && <span className="hm-tag hot">hit: {d.hit.label}</span>}</div>
    <div className="hm-kpis">
      <div><small>Followers</small><b className="num">{k.followers != null ? fmtNum(k.followers) : '–'}</b><span>{k.followers7 != null ? `+${k.followers7} in 7 days` : 'goal 10,000'}</span><Spark values={d.followers14} color="#AAC3F0" height={26} area={false} /></div>
      <div><small>Views, 30 days</small><b className="num">{k.hasData ? fmtNum(k.views30) : '–'}</b><span>{k.views7 && k.viewsPrev7 ? `${k.views7 >= k.viewsPrev7 ? '+' : ''}${Math.round(((k.views7 - k.viewsPrev7) / Math.max(1, k.viewsPrev7)) * 100)}% vs last week` : 'goal 100,000'}</span><Spark values={d.views14} color="#FFC63A" height={26} area={false} /></div>
      <div><small>Watched to the end</small><b className="num">{k.fullWatch != null ? `${k.fullWatch.toFixed(0)}%` : '–'}</b><span>{k.avgWatch != null ? `avg ${k.avgWatch.toFixed(1)} s` : 'needs Studio data'}</span></div>
      <div><small>{d.hit ? 'Best video' : 'Best concept'}</small><b className="num">{d.hit ? fmtNum(d.hit.views) : d.best ? d.best.cid : '–'}</b><span>{d.hit ? `${d.hit.label}${d.hit.ratio != null ? ` · ${d.hit.ratio.toFixed(1)}x usual` : ''}` : d.best ? `${d.best.name} · ${fmtNum(d.best.medianViews)} median` : 'no data yet'}</span></div>
    </div>
  </div>;
}

const eur = (n: number) => `${Math.round(n)}`;

/** Goals as rings: followers to 10,000, views to 100,000, today's uploads. */
export function GoalsPanel({ d, g }: { d: HomeData; g?: boolean }) {
  const f = d.k.followers ?? 0, v = d.k.hasData ? d.k.views30 : 0;
  const rows: [string, string, number, string][] = [
    ['Followers', `${fmtNum(f)} / 10,000`, f / 10000, '#AAC3F0'],
    ['Views, 30 days', `${fmtNum(v)} / 100,000`, v / 100000, '#FFC63A'],
    ['Uploaded today', `${d.today.uploaded} / ${d.today.total}`, d.today.total ? d.today.uploaded / d.today.total : 0, '#7FD9A8'],
  ];
  return <div className={cls(g, 'hm-goals')}>
    <div className="hm-h"><Icon name="sparkle" size={14} color="currentColor" /><b>Goals</b></div>
    <div className="hm-goals-body">
      <Rings size={128} rings={rows.map((r) => ({ frac: r[2], color: r[3] }))} />
      <div className="hm-goals-list">{rows.map((r) => <div key={r[0]} style={{ borderLeft: `3px solid ${r[3]}` }}><small>{r[0]}</small><b className="num">{r[1]}</b></div>)}</div>
    </div>
    <div className="hm-chips">
      <span title="Estimated date for 10,000 followers"><Icon name="calendar" size={14} color="currentColor" /><b>{d.followerEta.replace(/ \(.*\)/, '').replace('about ', '')}</b></span>
      {d.perDay != null && <span title="Followers per day"><Icon name="chart" size={14} color="currentColor" /><b className="num">{d.perDay >= 0 ? '+' : ''}{d.perDay.toFixed(1)}/d</b></span>}
      {d.income && <span title="Estimated Creator Rewards, 30 days"><Icon name="sparkle" size={14} color="currentColor" /><b className="num">{eur(d.income[0])}–{eur(d.income[1])} €</b></span>}
    </div>
  </div>;
}

export function WeekPanel({ d, g }: { d: HomeData; g?: boolean }) {
  const max = Math.max(1, ...d.week.map((w) => w.v));
  return <div className={cls(g, 'hm-week')}>
    <div className="hm-h"><Icon name="chart" size={14} color="currentColor" /><b>This week</b><span className="hm-tag"><Icon name={d.weekViews ? 'play' : 'upload'} size={11} color="currentColor" /></span></div>
    <div className="hm-bars">{d.week.map((w, i) => <div key={i} className={w.today ? 'on' : ''}>
      <span className="num">{w.v ? (d.weekViews ? fmtNum(w.v) : w.v) : ''}</span>
      <i style={{ height: `${Math.max(5, (w.v / max) * 100)}%`, animationDelay: `${i * 60}ms` }} /><small>{w.label}</small></div>)}</div>
  </div>;
}

export function QueuePanel({ d, g }: { d: HomeData; g?: boolean }) {
  return <div className={cls(g, 'hm-queue')}>
    <div className="hm-h"><Icon name="film" size={14} color="currentColor" /><b>Ready to post</b><span className="hm-tag">{d.queue.length}</span></div>
    {d.queue.length ? <div className="hm-q">{d.queue.map((q) => <div key={q.v.num}><Thumb v={q.v} w={52} h={92} /><b className="num">{q.day} {q.time}</b><small>#{q.v.num}</small></div>)}</div>
      : <div className="hm-empty"><Icon name="film" size={22} color="currentColor" /></div>}
  </div>;
}

export function ActivityPanel({ d, g }: { d: HomeData; g?: boolean }) {
  const col: Record<string, string> = { plan: '#AAC3F0', render: '#FFC63A', upload: '#7FD9A8', info: '#96AFDC', warn: '#FF8F7A' };
  return <div className={cls(g, 'hm-act')}>
    <div className="hm-h"><Icon name="radar" size={14} color="currentColor" /><b>What the autopilot did</b></div>
    {d.log.length ? <div className="hm-log">{d.log.map((l, i) => <div key={i}><i style={{ background: col[l.kind] ?? '#AAC3F0' }} /><span className="num">{new Date(l.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span><em>{l.text}</em></div>)}</div>
      : <div className="hm-empty"><Icon name="radar" size={22} color="currentColor" /></div>}
  </div>;
}
