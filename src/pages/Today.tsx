import React from 'react';
import { useApp } from '../ctx';
import { dayNumber, fmtDay, phaseLabel, allTasks, ymd } from '../logic';
import { Icon } from '../ui';
import { Header } from './parts';
import { NowPlaying } from '../music';
import { Timeline, AutopilotPanel, NextSlotPanel, StatsPanel } from '../homeWidgets';
import { useHomeData } from '../Ambient';
import { enterAmbient, setIdleEnabled, useIdle } from '../idle';
import { isDesktop } from '../bridge';

/** Home: the same overview the screen saver shows, plus a few buttons. */
export default function Today() {
  const { snap, go } = useApp();
  const d = useHomeData();
  const idle = useIdle(() => undefined);
  const now = new Date(snap.now), today = ymd(now);
  const h = now.getHours();
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const dn = dayNumber(now, snap.state.settings.day1);
  const due = allTasks(snap).filter((t) => t.col !== 'done' && (!t.due || t.due <= today)).length;
  const sub = dn < 1 ? `${fmtDay(now)} · warm-up not started` : `${fmtDay(now)} · Day ${dn} · ${phaseLabel(dn, now)}`;
  return <>
    <Header title={`${greet}, Mo`} sub={sub} center={<NowPlaying />} right={<>
      {due > 0 && <button className="btn" onClick={() => go('board')}><Icon name="check" size={15} /> {due} task{due > 1 ? 's' : ''} due</button>}
      {isDesktop && <button className="btn" onClick={enterAmbient} title="Hides all bars and shows the screen saver"><Icon name="sparkle" size={15} /> Screen saver</button>}
      {isDesktop && <button className="btn" onClick={() => setIdleEnabled(!idle.enabled)} title="Screen saver after 60 s without mouse or keyboard">Idle: {idle.enabled ? 'on' : 'off'}</button>}
    </>} />
    <section className="glass card"><h2>Next 24 hours</h2><Timeline d={d} /></section>
    <section className="hm-grid">
      <AutopilotPanel d={d} big />
      <NextSlotPanel d={d} />
      <StatsPanel d={d} />
    </section>
  </>;
}
