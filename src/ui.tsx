import React, { useEffect, useState } from 'react';
import { kColor, kName } from './logic';

const P: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  chart: <path d="M5 20V11M12 20V4M19 20v-6" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" /></>,
  tools: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>,
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
          <circle cx={c} cy={c} r={rad} fill="none" stroke={r.color} strokeOpacity={0.14} strokeWidth={w} />
          {f > 0 && <circle cx={c} cy={c} r={rad} fill="none" stroke={r.color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${circ * f} ${circ}`} transform={`rotate(-90 ${c} ${c})`} style={{ transition: 'stroke-dasharray .6s ease' }} />}
        </g>;
      })}
    </svg>
  );
}
export function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg width="100%" height="36" aria-hidden="true" />;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 196 + 2},${34 - ((v - min) / span) * 30}`).join(' L');
  return <svg viewBox="0 0 200 36" width="100%" height="36" preserveAspectRatio="none" aria-hidden="true"><path d={`M${pts}`} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
export function Background() {
  return <div className="bg" aria-hidden="true">
    <i style={{ left: '4%', top: '2%', width: 520, height: 520, background: '#2C4C92', filter: 'blur(120px)', opacity: .6 }} />
    <i style={{ right: '2%', top: '22%', width: 460, height: 460, background: '#34509E', filter: 'blur(130px)', opacity: .45 }} />
    <i style={{ left: '38%', bottom: '-10%', width: 420, height: 420, background: '#8A6818', filter: 'blur(140px)', opacity: .35 }} />
    <i style={{ left: '22%', top: '34%', width: 120, height: 120, background: '#F4F6FF', filter: 'blur(40px)', opacity: .12 }} />
    <i style={{ left: '74%', top: '60%', width: 90, height: 90, background: '#F4F6FF', filter: 'blur(34px)', opacity: .1 }} />
    <i style={{ left: '52%', top: '26%', width: 60, height: 60, background: '#FFC63A', filter: 'blur(26px)', opacity: .22 }} />
  </div>;
}
export const Stages = ({ n }: { n: number }) => (
  <div className="stages" title="Idea · Frame · Rendered · Thumbnail + description · Uploaded" aria-label={`${n} of 5 stages done`}>
    {[0, 1, 2, 3, 4].map((i) => <React.Fragment key={i}>{i > 0 && <i className={i < n ? 'on' : ''} />}<span className={i < n ? 'on' : ''} /></React.Fragment>)}
  </div>
);
