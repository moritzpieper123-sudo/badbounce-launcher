import React from 'react';
import { useApp } from '../ctx';
import { dayNumber, fmtDay, phaseLabel, allTasks, ymd } from '../logic';
import { Icon } from '../ui';
import { Header } from './parts';
import { NowPlaying } from '../music';
import { Timeline, AutopilotPanel, NextSlotPanel, GoalsPanel, WeekPanel, QueuePanel, ActivityPanel } from '../homeWidgets';
import { Spark, Count } from '../ui';
import { fmtNum, kpis, konzeptTable, KONZEPTE } from '../logic';
import { useHomeData } from '../Ambient';
import { enterAmbient, setIdleEnabled, useIdle } from '../idle';
import { isDesktop } from '../bridge';
import { briefing } from '../briefing';

/** Home: the same overview the screen saver shows, plus a few buttons. */
export default function Today() {
  const { snap, go } = useApp();
  const d = useHomeData();
  const idle = useIdle(() => undefined);
  const now = new Date(snap.now), today = ymd(now);
  const h = now.getHours();
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const dn = dayNumber(now, snap.state.settings.day1);
  const k = kpis(snap), kt = konzeptTable(snap);
  const due = allTasks(snap).filter((t) => t.col !== 'done' && (!t.due || t.due <= today)).length;
  const sub = dn < 1 ? `${fmtDay(now)} · warm-up not started` : `${fmtDay(now)} · Day ${dn} · ${phaseLabel(dn, now)}`;
  return <>
    <Header title={`${greet}, Mo`} sub={sub} center={<NowPlaying />} right={<>
      {due > 0 && <button className="btn" onClick={() => go('board')}><Icon name="check" size={15} /> {due} task{due > 1 ? 's' : ''} due</button>}
      {isDesktop && <button className="btn" onClick={enterAmbient} title="Hides all bars and shows the screen saver"><Icon name="sparkle" size={15} /> Screen saver</button>}
      {isDesktop && <button className="btn" onClick={() => setIdleEnabled(!idle.enabled)} title="Screen saver after 60 s without mouse or keyboard">Idle: {idle.enabled ? 'on' : 'off'}</button>}
    </>} />
    <section className="grid g-kpi" aria-label="Key numbers">
      <div className="glass card lift kpi t-frost"><span className="l"><Icon name="check" size={15} />Followers</span>
        <div className="v num"><Count value={k.followers} format={fmtNum} /></div>
        <div className="kfoot"><span className="small dim">{k.followers7 != null ? <span className="delta">↑ {k.followers7} · 7d</span> : 'Goal 10,000'}</span><Spark values={d.followers14} color="var(--glow)" height={40} /></div></div>
      <div className="glass card lift kpi t-yellow"><span className="l"><Icon name="play" size={14} />Views · 30 days</span>
        <div className="v num"><Count value={k.hasData ? k.views30 : null} format={fmtNum} /></div>
        <div className="kfoot"><span className="small dim">Goal 100,000{k.views30 >= 100000 ? ' ✓' : ''}</span><Spark values={d.views14} color="#FFC63A" height={40} /></div></div>
      <div className="glass card lift kpi t-navy"><span className="l"><Icon name="film" size={15} />Watched to the end</span>
        <div className="v num">{k.fullWatch != null ? `${k.fullWatch.toFixed(0)}%` : '–'}</div>
        <div className="kfoot"><span className="small dim">{k.avgWatch != null ? `Avg watch ${k.avgWatch.toFixed(1)} s` : 'From the weekly CSV'}</span></div></div>
      <div className="glass card lift kpi t-white"><span className="l"><Icon name="sparkle" size={15} />Best Konzept</span>
        <div className="v" style={{ fontSize: 24 }}>{kt[0] ? `K${kt[0].k} ${KONZEPTE[kt[0].k]?.name}` : '–'}</div>
        <div className="kfoot"><span className="small dim">{kt[0] ? `${fmtNum(Math.round(kt[0].avgViews))} avg views` : 'Needs matched posts'}</span></div></div>
    </section>
    {(() => { const b = briefing(snap, now); return <section className="glass card" aria-label="Report"><h2>{b.title}</h2>{b.lines.map((l, i) => <p key={i} className="sub" style={{ margin: '6px 0' }}>{l}</p>)}</section>; })()}
    <section className="glass card"><h2>Next 24 hours</h2><Timeline d={d} /></section>
    <section className="hm-grid">
      <AutopilotPanel d={d} big g />
      <NextSlotPanel d={d} g />
      <GoalsPanel d={d} g />
      <WeekPanel d={d} g />
      <QueuePanel d={d} g />
      <ActivityPanel d={d} g />
    </section>
  </>;
}
