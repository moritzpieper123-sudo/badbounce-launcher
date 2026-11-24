/* The screen saver, Apple style: huge soft clock, frosted square widgets, slow mesh gradient.
   Red when something failed. Everything drifts and dims after 10 minutes so nothing burns in. */
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './ctx';
import { bb } from './bridge';
import { useTheme } from './theme';
import { darkPalette, themePalette } from './scene';
import { homeData } from './homeData';
import type { HomeData } from './homeData';
import { Icon, Rings, Spark } from './ui';
import { fmtNum, kColor, minsUntil, fmtIn } from './logic';
import type { GenStatus } from './bridge';

export function useHomeData() {
  const { snap } = useApp();
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [gen, setGen] = useState<GenStatus>({ state: 'idle' });
  const [, tick] = useState(0);
  useEffect(() => { bb.genReady?.().then((r) => setReady(new Set(r))); bb.genStatus?.().then(setGen); const off = bb.onGenStatus?.(setGen); const t = setInterval(() => tick((n) => n + 1), 20e3); return () => { off?.(); clearInterval(t); }; }, []);
  return useMemo(() => homeData(snap, ready, gen), [snap, ready, gen]);   // eslint-disable-line react-hooks/exhaustive-deps
}

function Ring({ frac, color, size = 92, w = 11, children }: { frac: number; color: string; size?: number; w?: number; children?: React.ReactNode }) {
  const r = (size - w) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
  return <div className="ax-ring" style={{ width: size, height: size }}>
    <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity=".18" strokeWidth={w} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 1s ease' }} /></svg>
    <div className="ax-ring-in">{children}</div>
  </div>;
}

function Widgets({ d }: { d: HomeData }) {
  const n = d.nextSlot, mins = n ? minsUntil(n.when, d.now) : 0;
  const f = d.k.followers ?? 0, v = d.k.hasData ? d.k.views30 : 0;
  const cid = n?.cid ? parseInt(n.cid.slice(1), 10) : null;
  return <div className="ax-widgets">
    <div className="ax-w">
      <div className="ax-wh"><Icon name="calendar" size={15} color="currentColor" /><span>Next</span></div>
      <div className="ax-wtime num">{n?.time ?? '–'}</div>
      <div className="ax-bar"><i style={{ width: `${Math.max(0, Math.min(1, 1 - mins / 300)) * 100}%` }} /></div>
      <div className="ax-wfoot"><span className="dot" style={{ background: kColor(cid) }} />{n ? (n.cid ?? '–') : '–'}<em>{n ? fmtIn(mins).replace(/^in /, '') : ''}</em></div>
    </div>
    <div className="ax-w">
      <div className="ax-wh"><Icon name="radar" size={15} color="currentColor" /><span>Autopilot</span></div>
      <div className="ax-wmid"><Ring frac={d.enabled ? 1 : 0} color={d.rendering ? '#FFC63A' : '#7FD9A8'} size={120}><Icon name={d.rendering ? 'film' : 'radar'} size={26} color="currentColor" /></Ring></div>
      <div className="ax-wfoot"><Icon name="film" size={13} color="currentColor" />{d.pending}<Icon name="check" size={13} color="currentColor" />{d.approved}<Icon name="play" size={12} color="currentColor" />{d.queued}</div>
    </div>
    <div className="ax-w">
      <div className="ax-wh"><Icon name="sparkle" size={15} color="currentColor" /><span>Goals</span></div>
      <div className="ax-wmid"><Rings size={132} rings={[{ frac: f / 10000, color: '#AAC3F0' }, { frac: v / 100000, color: '#FFC63A' }, { frac: d.today.total ? d.today.uploaded / d.today.total : 0, color: '#7FD9A8' }]} /></div>
      <div className="ax-wfoot">{d.today.uploaded}/{d.today.total}<em>today</em></div>
    </div>
    <div className="ax-w">
      <div className="ax-wh"><Icon name="check" size={15} color="currentColor" /><span>Followers</span></div>
      <div className="ax-wnum num">{d.k.followers != null ? fmtNum(d.k.followers) : '–'}</div>
      <Spark values={d.followers14} color="#AAC3F0" height={46} area={false} />
      <div className="ax-wfoot">{d.k.followers7 != null ? `+${d.k.followers7}` : ''}<em>7 days</em></div>
    </div>
    <div className="ax-w">
      <div className="ax-wh"><Icon name="play" size={14} color="currentColor" /><span>Views</span></div>
      <div className="ax-wnum num">{d.k.hasData ? fmtNum(d.k.views30) : '–'}</div>
      <Spark values={d.views14} color="#FFC63A" height={46} area={false} />
      <div className="ax-wfoot">{d.hit ? `${d.hit.label}` : ''}<em>30 days</em></div>
    </div>
  </div>;
}

export default function Ambient() {
  const d = useHomeData();
  const { mode, theme } = useTheme();
  const [deep, setDeep] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const a = setTimeout(() => setDeep(true), 10 * 60e3); const t = setInterval(() => setNow(new Date()), 5e3); return () => { clearTimeout(a); clearInterval(t); }; }, []);
  const pal = useMemo(() => darkPalette(themePalette(mode, theme, now), deep ? 0.88 : 0.8), [mode, theme, now, deep]);
  const err = d.errors.length > 0;
  const vars = { '--a0': pal[0], '--a1': pal[1], '--a2': pal[2], '--a3': pal[3], '--a4': pal[4] } as React.CSSProperties;
  return <div className={`ax ${err ? 'err' : ''} ${deep ? 'deep' : ''}`} style={vars} aria-label="Screen saver">
    <div className="ax-bg"><i className="b1" /><i className="b2" /><i className="b3" /></div>
    <div className="ax-drift"><div className="ax-inner">
      <div className="ax-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="ax-clock num">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      {err ? <div className="ax-alert"><span><Icon name="bell" size={22} color="currentColor" /></span><div><b>{d.errors[0].title}</b>{d.errors.length > 1 && <small>+{d.errors.length - 1} more</small>}</div></div>
        : <div className="ax-slots">{d.slots.filter((s) => s.when.getTime() > now.getTime() - 3 * 3600e3).slice(0, 5).map((s) => <span key={s.when.toISOString()} className={s.state}><i /><small className="num">{s.time}</small></span>)}</div>}
      <Widgets d={d} />
    </div></div>
  </div>;
}
