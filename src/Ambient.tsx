/* The screen saver: a dark, slowly moving gradient with the home overview on top.
   Everything drifts by a few pixels per minute and gets darker after 10 minutes, so nothing burns into the screen. */
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './ctx';
import { bb } from './bridge';
import { useTheme } from './theme';
import { darkPalette, themePalette } from './scene';
import { homeData } from './homeData';
import { AutopilotPanel, NextSlotPanel, StatsPanel, Timeline, GoalsPanel, WeekPanel, ActivityPanel } from './homeWidgets';
import { fmtDay } from './logic';
import type { GenStatus } from './bridge';

export function useHomeData() {
  const { snap } = useApp();
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [gen, setGen] = useState<GenStatus>({ state: 'idle' });
  const [, tick] = useState(0);
  useEffect(() => { bb.genReady?.().then((r) => setReady(new Set(r))); bb.genStatus?.().then(setGen); const off = bb.onGenStatus?.(setGen); const t = setInterval(() => tick((n) => n + 1), 20e3); return () => { off?.(); clearInterval(t); }; }, []);
  return useMemo(() => homeData(snap, ready, gen), [snap, ready, gen]);   // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Ambient() {
  const d = useHomeData();
  const { mode, theme } = useTheme();
  const [deep, setDeep] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const a = setTimeout(() => setDeep(true), 10 * 60e3); const t = setInterval(() => setNow(new Date()), 5e3); return () => { clearTimeout(a); clearInterval(t); }; }, []);
  const pal = useMemo(() => darkPalette(themePalette(mode, theme, now), deep ? 0.88 : 0.8), [mode, theme, now, deep]);
  const vars = { '--a0': pal[0], '--a1': pal[1], '--a2': pal[2], '--a3': pal[3], '--a4': pal[4] } as React.CSSProperties;
  const h = d.now.getHours(), greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return <div className={`amb ${deep ? 'deep' : ''}`} style={vars} aria-label="Screen saver">
    <div className="amb-grad" /><i className="amb-orb o1" /><i className="amb-orb o2" /><i className="amb-orb o3" />
    <div className="amb-floor"><i className="amb-line" /><i className="amb-ball"><b /></i></div>
    <div className="amb-drift"><div className="amb-inner">
      <div className="amb-clock num">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="amb-date">{greet}, Mo · {fmtDay(now)}{d.dayNo >= 1 ? ` · Day ${d.dayNo}` : ''}</div>
      <div className="amb-tl"><Timeline d={d} /></div>
      <div className="amb-cards"><AutopilotPanel d={d} big /><NextSlotPanel d={d} /><StatsPanel d={d} /></div>
      <div className="amb-cards c3"><GoalsPanel d={d} /><WeekPanel d={d} /><ActivityPanel d={d} /></div>
    </div></div>
    <div className="amb-hint">move the mouse to return</div>
  </div>;
}
