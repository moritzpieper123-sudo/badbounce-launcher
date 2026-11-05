import React, { useEffect, useState } from 'react';
import { kColor, kName } from './logic';
import { MODES, setMode, themeFor, useTheme, type Mode, type Theme } from './theme';

const P: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  chart: <path d="M5 20V11M12 20V4M19 20v-6" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" /></>,
  tools: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
  gear: <><path d="M10.3 3.2h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.6l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.6L3.9 8.6l1.7-2.9 2.3.8 1.6-.9z" /><circle cx="12" cy="12" r="2.8" /></>,
  save: <><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h8V3M8 21v-7h8v7" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  play: <path d="M7 4l13 8-13 8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  csv: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></>,
  pen: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  half: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  auto: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4" /><path d="M15 12a3 3 0 0 1-3 3" strokeWidth="2.6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  graph: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="9" cy="18" r="2.5" /><circle cx="18" cy="18" r="1.6" /><path d="M8.3 7l7.4.8M7 8.3l1.5 7.3M16.2 9.8l-5.6 6.6M11.5 18h4.9" /></>,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};
export function Icon({ name, size = 20, color = 'currentColor', sw = 2 }: { name: keyof typeof P | string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>;
}
export function Tick({ size = 13, color = '#1A1404' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>;
}
export function KChip({ k, label }: { k: number | null | undefined; label?: string }) {
  return <span className="chip"><span className="dot" style={{ width: 7, height: 7, background: kColor(k) }} />{label ?? kName(k)}</span>;
}
export function Rings({ rings, size = 150 }: { rings: { frac: number; color: string }[]; size?: number }) {
  const c = size / 2, w = 12;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Today rings">
      {rings.map((r, i) => {
        const rad = c - w / 2 - 1 - i * (w + 4), circ = 2 * Math.PI * rad, f = Math.max(0, Math.min(1, r.frac));
        return <g key={i}>
          <circle cx={c} cy={c} r={rad} fill="none" style={{ stroke: r.color }} strokeOpacity={0.14} strokeWidth={w} />
          {f > 0 && <circle cx={c} cy={c} r={rad} fill="none" strokeWidth={w} strokeLinecap="round" strokeDasharray={`${circ * f} ${circ}`} transform={`rotate(-90 ${c} ${c})`} style={{ stroke: r.color, transition: 'stroke-dasharray .6s ease' }} />}
        </g>;
      })}
    </svg>
  );
}
let sparkId = 0;
export function Spark({ values, color, height = 36, area = true }: { values: number[]; color: string; height?: number; area?: boolean }) {
  const [id] = useState(() => `sp${++sparkId}`);
  if (values.length < 2) return <svg width="100%" height={height} aria-hidden="true" />;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1, h = height;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * 196 + 2, h - 2 - ((v - min) / span) * (h - 6)]);
  // smooth curve through the points
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 1; i < xy.length; i++) { const [x0, y0] = xy[i - 1], [x1, y1] = xy[i], mx = (x0 + x1) / 2; d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`; }
  return <svg viewBox={`0 0 200 ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: color, stopOpacity: .35 }} /><stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} /></linearGradient></defs>
    {area && <path d={`${d} L198,${h} L2,${h} Z`} fill={`url(#${id})`} />}
    <path d={d} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}
export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => { if (!msg) return; const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [msg, onDone]);
  return msg ? <div className="toast pop" role="status">{msg}</div> : null;
}
export function useNow(ms = 30000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setN(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
/* Background = the Badbounce world as a scene (night / dusk / day), like a photo behind floating glass.
   All three layers are stacked; the theme fades the right one in. */
export function Background() {
  return <div className="bg" aria-hidden="true">
    <i className="scene s-dark" /><i className="scene s-medium" /><i className="scene s-light" />
    <i className="bg-shade" />
    {Array.from({ length: 18 }, (_, i) => <i key={'d' + i} className="dust" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, ['--d' as string]: `${14 + (i % 5) * 4}s`, opacity: .2 + ((i * 7) % 5) / 10 }} />)}
  </div>;
}
/** Number that counts up when it first appears. */
export function Count({ value, format = (n: number) => String(Math.round(n)) }: { value: number | null | undefined; format?: (n: number) => string }) {
  const [v, setV] = useState(() => (value == null || matchMedia('(prefers-reduced-motion: reduce)').matches ? value ?? 0 : 0));
  const prev = React.useRef(v);
  useEffect(() => {
    if (value == null) return;
    const from = prev.current, to = value, t0 = performance.now(), dur = 900;
    if (from === to) return;
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); const x = from + (to - from) * e; setV(x); prev.current = x; if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value == null) return <>–</>;
  return <>{format(Number.isInteger(value) ? Math.round(v) : v)}</>;
}
export const Stages = ({ n }: { n: number }) => (
  <div className="stages" title="Idea · Frame · Rendered · Thumbnail + description · Uploaded" aria-label={`${n} of 5 stages done`}>
    {[0, 1, 2, 3, 4].map((i) => <React.Fragment key={i}>{i > 0 && <i className={i < n ? 'on' : ''} />}<span className={i < n ? 'on' : ''} /></React.Fragment>)}
  </div>
);

/* ---------- theme button: Auto (sun) / Dark / Medium / Light, with a circular wipe ---------- */
const MODE_ICON: Record<Mode, string> = { auto: 'auto', dark: 'moon', medium: 'half', light: 'sun' };
const MODE_LABEL: Record<Mode, string> = { auto: 'Auto', dark: 'Dark', medium: 'Medium', light: 'Light' };
const THEME_WORD: Record<Theme, string> = { dark: 'night', medium: 'dusk', light: 'day' };
export function ThemeButton({ className = 'iconbtn', label = false }: { className?: string; label?: boolean }) {
  const { mode, theme } = useTheme();
  const nxt = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  const toggle = (e: React.MouseEvent) => {
    const apply = () => setMode(nxt);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || themeFor(nxt) === theme) return apply();
    const x = e.clientX, y = e.clientY, r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(apply).ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 750, easing: 'cubic-bezier(.45,0,.2,1)', pseudoElement: '::view-transition-new(root)' }));
  };
  const title = `${MODE_LABEL[mode]}${mode === 'auto' ? ` (${THEME_WORD[theme]} in Hamm)` : ''} · click for ${MODE_LABEL[nxt]}`;
  return <button className={className} onClick={toggle} title={title} aria-label={title}>
    <Icon name={MODE_ICON[mode]} size={16} />{label && <span>{MODE_LABEL[mode]}{mode === 'auto' && <small> · {THEME_WORD[theme]}</small>}</span>}
  </button>;
}
