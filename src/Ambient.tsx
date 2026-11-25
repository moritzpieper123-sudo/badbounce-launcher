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
import type { GenStatus, MediaNow } from './bridge';

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

const hh = (x: Date) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;

/** The autopilot as a pipeline: queued → rendering → review → approved → in TikTok. */
function Pipeline({ d }: { d: HomeData }) {
  const st = [
    { k: 'queue', icon: 'play', n: d.queued, label: 'Queued' },
    { k: 'render', icon: 'film', n: d.rendering ? 1 : 0, label: 'Rendering' },
    { k: 'review', icon: 'sparkle', n: d.pending, label: 'Review' },
    { k: 'ready', icon: 'check', n: d.approved, label: 'Approved' },
  ];
  const n = d.nextSlot, mins = n ? minsUntil(n.when, d.now) : 0;
  return <div className="ax-p ax-pipe">
    <div className="ax-ph"><span className={`ax-led ${d.errors.length ? 'bad' : d.enabled ? 'on' : ''}`} /><b>Autopilot</b><em>{d.enabled ? (d.paused ? 'paused' : 'running') : 'off'}</em>{d.autoApprove && <span className="ax-badge"><Icon name="check" size={13} color="currentColor" sw={3} />auto-approve</span>}</div>
    <div className="ax-now">{d.headline}</div>
    <div className="ax-stages">{st.map((x, i) => <React.Fragment key={x.k}>
      {i > 0 && <i className={`ax-link ${x.n || st[i - 1].n ? 'lit' : ''}`} />}
      <div className={`ax-st ${x.n ? 'has' : ''} ${x.k === 'render' && d.rendering ? 'busy' : ''}`}>
        <span className="ax-st-ico"><Icon name={x.icon} size={26} color="currentColor" /></span>
        <b className="num">{x.n}</b><small>{x.label}</small></div>
    </React.Fragment>)}</div>
    <div className="ax-next">
      <div><small>Next slot</small><b className="num">{n?.time ?? '–'}</b></div>
      <div><small>Concept</small><b><span className="dot" style={{ background: kColor(n?.cid ? parseInt(n.cid.slice(1), 10) : null) }} />{n ? (n.cid ?? 'not planned') : '–'}</b></div>
      <div><small>In</small><b className="num">{n ? fmtIn(mins).replace(/^in /, '') : '–'}</b></div>
      <div><small>Post by</small><b className="num">{n ? hh(n.when) : '–'}</b></div>
    </div>
  </div>;
}

/** Today's and tomorrow's slots as cards. */
function Slots({ d }: { d: HomeData }) {
  const list = d.slots.filter((s) => s.when.getTime() > d.now.getTime() - 2 * 3600e3).slice(0, 5);
  return <div className="ax-p ax-day">
    <div className="ax-ph"><Icon name="calendar" size={17} color="currentColor" /><b>Schedule</b></div>
    <div className="ax-sl">{list.map((s) => <div key={s.when.toISOString()} className={`ax-slot ${s.state}`}>
      <b className="num">{s.time}</b>
      <span className="ax-slot-ico">{s.state === 'uploaded' ? <Icon name="check" size={16} color="currentColor" sw={3} /> : s.num != null ? <Icon name="film" size={16} color="currentColor" /> : <Icon name="bell" size={16} color="currentColor" />}</span>
      <small>{s.num != null ? `#${s.num}` : 'no video'}</small>
    </div>)}</div>
  </div>;
}

function Activity({ d }: { d: HomeData }) {
  const col: Record<string, string> = { plan: '#AAC3F0', render: '#FFC63A', upload: '#7FD9A8', info: '#96AFDC', warn: '#FF8F7A' };
  return <div className="ax-p ax-act">
    <div className="ax-ph"><Icon name="radar" size={17} color="currentColor" /><b>Latest</b></div>
    <div className="ax-log">{d.log.slice(0, 3).map((l, i) => <div key={i}><i style={{ background: col[l.kind] ?? '#AAC3F0', boxShadow: `0 0 10px ${col[l.kind] ?? '#AAC3F0'}` }} /><span className="num">{hh(new Date(l.t))}</span><em>{l.text}</em></div>)}
      {!d.log.length && <div className="ax-empty">–</div>}</div>
  </div>;
}

const mmss = (x: number) => { x = Math.max(0, Math.floor(x)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
/** Spotify (or any player) via the Windows media controls: display only, any mouse move ends the screen saver. */
function Player({ m }: { m: MediaNow }) {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, []);
  const pos = Math.min(m.dur || 0, m.pos + (m.playing && m.at ? (Date.now() - m.at) / 1000 : 0));
  return <div className={`ax-p ax-pl ${m.playing ? 'on' : ''}`}>
    <div className="ax-cover" style={m.cover ? { backgroundImage: `url("${m.cover}")` } : undefined}>{!m.cover && <Icon name="music" size={44} color="currentColor" />}</div>
    <div className="ax-pl-mid">
      <div className="ax-pl-src"><Icon name="music" size={14} color="currentColor" />{/spotify/i.test(m.app) ? 'Spotify' : 'Now playing'}{m.playing && <span className="ax-eq"><i /><i /><i /><i /></span>}</div>
      <div className="ax-pl-t">{m.title}</div>
      <div className="ax-pl-a">{m.artist}</div>
      <div className="ax-pl-bar"><i style={{ width: `${m.dur ? (pos / m.dur) * 100 : 0}%` }} /></div>
      <div className="ax-pl-time num"><span>{mmss(pos)}</span><span>{mmss(m.dur)}</span></div>
    </div>
  </div>;
}

function Stats({ d }: { d: HomeData }) {
  const f = d.k.followers ?? 0, v = d.k.hasData ? d.k.views30 : 0;
  return <div className="ax-p ax-strip">
    <div className="ax-sg"><Rings size={78} rings={[{ frac: f / 10000, color: '#AAC3F0' }, { frac: v / 100000, color: '#FFC63A' }, { frac: d.today.total ? d.today.uploaded / d.today.total : 0, color: '#7FD9A8' }]} />
      <div><small>Today</small><b className="num">{d.today.uploaded}/{d.today.total}</b></div></div>
    <div className="ax-sg"><div><small><Icon name="check" size={13} color="currentColor" /> Followers</small><b className="num">{d.k.followers != null ? fmtNum(d.k.followers) : '–'}</b></div><Spark values={d.followers14} color="#AAC3F0" height={44} area={false} /></div>
    <div className="ax-sg"><div><small><Icon name="play" size={12} color="currentColor" /> Views · 30 d</small><b className="num">{d.k.hasData ? fmtNum(d.k.views30) : '–'}</b></div><Spark values={d.views14} color="#FFC63A" height={44} area={false} /></div>
  </div>;
}

/** Glass clock drawn as SVG so the rim can sit INSIDE the digits (a stroke clipped to the glyphs). */
function GlassClock({ text }: { text: string }) {
  return <svg className="ax-clock" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid meet" aria-label={text} role="img">
    <defs>
      <linearGradient id="axg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".66" /><stop offset=".48" stopColor="#fff" stopOpacity=".14" /><stop offset=".62" stopColor="#fff" stopOpacity=".05" /><stop offset="1" stopColor="#fff" stopOpacity=".3" /></linearGradient>
      <linearGradient id="axr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset=".5" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity=".55" /></linearGradient>
      <clipPath id="axc"><text x="200" y="80" textAnchor="middle" className="ax-clock-t">{text}</text></clipPath>
    </defs>
    <text x="200" y="80" textAnchor="middle" className="ax-clock-t" fill="url(#axg)">{text}</text>
    <g clipPath="url(#axc)"><text x="200" y="80" textAnchor="middle" className="ax-clock-t" fill="none" stroke="url(#axr)" strokeWidth="3.4">{text}</text></g>
  </svg>;
}

export default function Ambient() {
  const d = useHomeData();
  const { mode, theme } = useTheme();
  const [deep, setDeep] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const a = setTimeout(() => setDeep(true), 10 * 60e3); const t = setInterval(() => setNow(new Date()), 5e3); return () => { clearTimeout(a); clearInterval(t); }; }, []);
  const pal = useMemo(() => darkPalette(themePalette(mode, theme, now), deep ? 0.88 : 0.8), [mode, theme, now, deep]);
  const [media, setMedia] = useState<MediaNow | null>(null);
  useEffect(() => { bb.mediaNow?.().then(setMedia); return bb.onMedia?.(setMedia); }, []);
  const night = now.getHours() >= 22 || now.getHours() < 7;   // night version: far less light, for leaving it on overnight
  const err = d.errors.length > 0;
  const vars = { '--a0': pal[0], '--a1': pal[1], '--a2': pal[2], '--a3': pal[3], '--a4': pal[4] } as React.CSSProperties;
  return <div className={`ax ${err ? 'err' : ''} ${deep ? 'deep' : ''} ${night ? 'night' : ''}`} style={vars} aria-label="Screen saver">
    <div className="ax-bg"><i className="b1" /><i className="b2" /><i className="b3" /></div>
    <div className="ax-drift"><div className="ax-inner">
      <div className="ax-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <GlassClock text={now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />
      {err && <div className="ax-alert"><span><Icon name="bell" size={22} color="currentColor" /></span><div><b>{d.errors[0].title}</b>{d.errors.length > 1 && <small>+{d.errors.length - 1} more</small>}</div></div>}
      {media && <Player m={media} />}
      <div className="ax-grid">
        <Pipeline d={d} />
        <Slots d={d} />
        <Activity d={d} />
        <Stats d={d} />
      </div>
    </div></div>
  </div>;
}
