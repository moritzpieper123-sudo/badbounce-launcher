/* Shared pieces of the home page and the screen saver. */
import React from 'react';
import { Icon, Spark } from './ui';
import { fmtNum, fmtIn, minsUntil } from './logic';
import { kColor } from './logic';
import type { HomeData } from './homeData';

const SC: Record<string, string> = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: 'rgba(255,255,255,.25)' };
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
      <b className="num">{s.time}</b><small>{s.state === 'uploaded' ? (s.auto ? 'auto' : 'posted') : s.num != null ? `#${s.num}` : 'no video'}</small>
    </span>)}
  </div>;
}

export function AutopilotPanel({ d, big }: { d: HomeData; big?: boolean }) {
  const bad = d.problems.length > 0;
  return <div className={`hm-card hm-ap ${big ? 'big' : ''}`}>
    <div className="hm-h"><span className={`hm-led ${bad ? 'bad' : d.enabled ? 'on' : ''}`} /><b>Autopilot</b><span className="hm-tag">{bad ? `${d.problems.length} needs you` : d.enabled ? 'running' : 'off'}</span></div>
    <div className="hm-big">{d.headline}</div>
    <div className="hm-rows">
      <div><Icon name="film" size={14} color="currentColor" /><span>{d.pending} to review</span>{d.autoApprove && <em>auto-approve on</em>}</div>
      <div><Icon name="check" size={14} color="currentColor" /><span>{d.approved} approved, ready</span></div>
      {bad && <div className="warn"><Icon name="bell" size={14} color="currentColor" /><span>{d.problems[0].title}</span></div>}
    </div>
  </div>;
}

export function NextSlotPanel({ d }: { d: HomeData }) {
  const n = d.nextSlot;
  if (!n) return <div className="hm-card"><div className="hm-h"><Icon name="calendar" size={14} color="currentColor" /><b>Next slot</b></div><div className="hm-big">No slot ahead</div></div>;
  const mins = minsUntil(n.when, d.now);
  return <div className="hm-card hm-next">
    <div className="hm-h"><Icon name="calendar" size={14} color="currentColor" /><b>Next slot</b><span className="hm-tag">in {fmtIn(mins).replace(/^in /, '')}</span></div>
    <div className="hm-time num">{n.time}</div>
    <div className="hm-concept"><span className="dot" style={{ background: kColor(cidNum(n.cid)) }} />{n.cid ? `${n.cid} ${n.name}` : n.name}</div>
    <div className="hm-why">{n.why}</div>
    <div className="hm-why" style={{ opacity: .7 }}>{d.enabled ? `The video goes into TikTok at about ${String(n.actionAt.getHours()).padStart(2, '0')}:${String(n.actionAt.getMinutes()).padStart(2, '0')}` : 'Autopilot is off: post it yourself'}</div>
  </div>;
}

export function StatsPanel({ d }: { d: HomeData }) {
  const k = d.k;
  return <div className="hm-card hm-stats">
    <div className="hm-h"><Icon name="chart" size={14} color="currentColor" /><b>Channel</b>{d.hit && <span className="hm-tag hot">hit: {d.hit.label}</span>}</div>
    <div className="hm-kpis">
      <div><small>Followers</small><b className="num">{k.followers != null ? fmtNum(k.followers) : '–'}</b><span>{k.followers7 != null ? `+${k.followers7} in 7 days` : 'goal 10,000'}</span><Spark values={d.followers14} color="#AAC3F0" height={26} area={false} /></div>
      <div><small>Views, 30 days</small><b className="num">{k.hasData ? fmtNum(k.views30) : '–'}</b><span>{k.views7 && k.viewsPrev7 ? `${k.views7 >= k.viewsPrev7 ? '+' : ''}${Math.round(((k.views7 - k.viewsPrev7) / Math.max(1, k.viewsPrev7)) * 100)}% vs last week` : 'goal 100,000'}</span><Spark values={d.views14} color="#FFC63A" height={26} area={false} /></div>
      <div><small>Watched to the end</small><b className="num">{k.fullWatch != null ? `${k.fullWatch.toFixed(0)}%` : '–'}</b><span>{k.avgWatch != null ? `avg ${k.avgWatch.toFixed(1)} s` : 'needs Studio data'}</span></div>
      <div><small>{d.hit ? 'Best video' : 'Best concept'}</small><b className="num">{d.hit ? fmtNum(d.hit.views) : d.best ? d.best.cid : '–'}</b><span>{d.hit ? `${d.hit.label}${d.hit.ratio != null ? ` · ${d.hit.ratio.toFixed(1)}x usual` : ''}` : d.best ? `${d.best.name} · ${fmtNum(d.best.medianViews)} median` : 'no data yet'}</span></div>
    </div>
  </div>;
}
