import React from 'react';
import { useApp } from '../ctx';
import { addDays, allTasks, buildPlan, dayNumber, fmtDay, fmtNum, kpis, phaseLabel, ymd, parseYmd, konzeptTable, KONZEPTE, isReady, weeklyReview } from '../logic';
import { Rings, Spark, Icon, Count } from '../ui';
import { Header, NextUpload, SlotList, TaskRow, BufferMeter } from './parts';
import { bb } from '../bridge';

export default function Today() {
  const { snap, go } = useApp();
  const now = new Date(snap.now), today = ymd(now);
  const h = now.getHours();
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const dn = dayNumber(now, snap.state.settings.day1);
  const plan = buildPlan(snap, now, 1).filter((s) => s.date === today);
  const uploaded = plan.filter((s) => s.uploaded).length;
  const made = plan.filter((s) => s.uploaded || (s.video && isReady(s.video))).length;
  const tasks = allTasks(snap).filter((t) => !t.due || t.due <= today);
  const tasksDone = tasks.filter((t) => t.col === 'done').length;
  const k = kpis(snap);
  const kt = konzeptTable(snap);
  const days = snap.state.stats.days;
  const sub = dn < 1 ? `${fmtDay(now)} · Warm-up starts ${parseYmd(snap.state.settings.day1).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : `${fmtDay(now)} · Day ${dn} · ${phaseLabel(dn)} · ${plan.length ? `${uploaded} of ${plan.length} uploads done` : 'no uploads today'}`;
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  const weekVals = week.map((d) => days.find((x) => x.date === ymd(d))?.views ?? null);
  const hasWeek = weekVals.some((v) => v != null);
  const upByDay = week.map((d) => Object.values(snap.state.uploads).filter((u) => ymd(new Date(u.at)) === ymd(d)).length);
  const barVals = hasWeek ? weekVals.map((v) => v ?? 0) : upByDay;
  const maxBar = Math.max(1, ...barVals);
  const isMonday = now.getDay() === 1;
  const rev = isMonday ? weeklyReview(snap) : null;
  return <>
    <Header title={`${greet}, Mo`} sub={sub} right={<>
      <button className="btn" onClick={() => go('schedule')}><Icon name="calendar" size={15} /> Schedule</button>
      <button className="btn accent" onClick={() => go('board')}><Icon name="plus" size={15} sw={2.4} /> New task</button>
    </>} />

    <section className="grid g-kpi" aria-label="Key numbers">
      <div className="glass card lift kpi t-frost">
        <span className="l"><Icon name="check" size={15} />Followers</span>
        <div className="v num"><Count value={k.followers} format={fmtNum} /></div>
        <div className="kfoot"><span className="small dim">{k.followers7 != null ? <span className="delta">↑ {k.followers7} · 7d</span> : 'Goal 10,000 for Creator Rewards'}</span><Spark values={days.filter((d) => d.followers != null).slice(-14).map((d) => d.followers!)} color="var(--glow)" height={40} /></div>
      </div>
      <div className="glass card lift kpi t-yellow">
        <span className="l"><Icon name="play" size={14} />Views · last 30 days</span>
        <div className="v num"><Count value={k.hasData ? k.views30 : null} format={fmtNum} /></div>
        <div className="kfoot"><span className="small dim">Goal 100,000{k.views30 >= 100000 ? ' ✓' : ''}</span><Spark values={days.slice(-14).map((d) => d.views || 0)} color="#FFC63A" height={40} /></div>
      </div>
      <div className="glass card lift kpi t-navy">
        <span className="l"><Icon name="film" size={15} />Watched to the end</span>
        <div className="v num">{k.fullWatch != null ? `${k.fullWatch.toFixed(0)}%` : '–'}</div>
        <div className="kfoot"><span className="small dim">{k.avgWatch != null ? `Avg watch ${k.avgWatch.toFixed(1)} s` : 'From the weekly CSV'}</span><Spark values={days.slice(-14).map((d) => d.views || 0)} color="var(--frost)" height={40} area={false} /></div>
      </div>
      <div className="glass card lift kpi t-white">
        <span className="l"><Icon name="sparkle" size={15} />Best Konzept</span>
        <div className="v" style={{ fontSize: 24 }}>{kt[0] ? `K${kt[0].k} ${KONZEPTE[kt[0].k]?.name}` : '–'}</div>
        <div className="kfoot"><span className="small dim">{kt[0] ? `${fmtNum(Math.round(kt[0].avgViews))} avg views` : 'Needs matched posts from the CSV'}</span></div>
      </div>
    </section>

    {rev && <div className="glass card" style={{ borderColor: 'rgba(255,198,58,.4)' }}>
      <div className="between"><h2>Monday review</h2><button className="btn sm" onClick={() => go('analytics')}>Open</button></div>
      <span className="muted">Last week: {rev.posted} posted · {fmtNum(rev.k.views7)} views{rev.change != null ? ` (${rev.change >= 0 ? '+' : ''}${rev.change.toFixed(0)}%)` : ''}{rev.bestK ? ` · best Konzept K${rev.bestK.k}` : ''}{rev.bestSlot ? ` · best slot ${rev.bestSlot.slot}` : ''}</span>
    </div>}

    <section className="grid g-auto">
      <div className="glass card lift" style={{ justifyContent: 'space-between' }}>
        <div><h2>Today</h2><p className="sub">{plan.length ? 'Close your rings' : dn < 1 ? 'Warm-up has not started yet' : dn <= 2 ? 'Warm-up day: no posts, just scroll For You' : 'No uploads planned'}</p></div>
        <div className="row rings-row" style={{ gap: 22 }}>
          <Rings rings={[{ frac: plan.length ? made / plan.length : 0, color: 'var(--glow)' }, { frac: plan.length ? uploaded / plan.length : 0, color: 'var(--yellow-text)' }, { frac: tasks.length ? tasksDone / tasks.length : 0, color: 'var(--frost)' }]} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['Made', made, plan.length, 'var(--glow)'], ['Uploaded', uploaded, plan.length, 'var(--yellow)'], ['Tasks', tasksDone, tasks.length, 'var(--frost)']].map(([l, a, b, c]) =>
              <div key={l as string} style={{ borderLeft: `3px solid ${c}`, paddingLeft: 10 }}><div className="small muted">{l}</div><div style={{ fontSize: 22, fontWeight: 600 }}>{a}<span className="dim" style={{ fontSize: 14, fontWeight: 500 }}> / {b}</span></div></div>)}
          </div>
        </div>
        <BufferMeter />
      </div>

      <div className="glass card lift">
        <div className="between"><h2>Up next</h2><button className="btn sm" onClick={() => go('schedule')}>Schedule</button></div>
        <NextUpload />
        <SlotList date={now} />
        {snap.render && <div className="row small" style={{ gap: 8 }}><Icon name="film" size={16} color="var(--frost)" /><span className="muted">Rendering {snap.render.video ?? ''} {snap.render.label ?? ''}</span><div className="progress"><div style={{ width: `${Math.round((snap.render.progress ?? 0) * 100)}%`, background: 'var(--frost)' }} /></div><span className="num">{Math.round((snap.render.progress ?? 0) * 100)}%</span></div>}
      </div>

      <div className="glass card lift" style={{ gap: 4 }}>
        <div className="between" style={{ marginBottom: 6 }}><div><h2>My tasks</h2><p className="sub">Due today and late</p></div><button className="btn sm" onClick={() => go('board')}>Open board</button></div>
        {tasks.length ? tasks.slice(0, 6).map((t) => <TaskRow key={t.id} t={t} />) : <div className="empty">Nothing due. Nice.</div>}
        {tasks.length > 6 && <button className="linkbtn" onClick={() => go('board')}>+{tasks.length - 6} more on the board</button>}
      </div>
    </section>

    <section className="glass card">
      <div className="between"><div><h2>This week</h2><p className="sub">{hasWeek ? 'Views per day (from your TikTok CSV)' : 'Uploads per day (views appear after the first CSV import)'}</p></div><button className="btn sm" onClick={() => bb.openUrl('https://www.tiktok.com/tiktokstudio/analytics')}>TikTok Studio</button></div>
      <div className="weekbars" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 14, alignItems: 'end', height: 170 }}>
        {week.map((d, i) => { const isT = i === 6; const v = barVals[i]; return <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
          <span className="small" style={{ color: isT ? 'var(--glow)' : 'var(--dim)', fontWeight: 600 }}>{hasWeek ? (weekVals[i] == null ? '' : fmtNum(weekVals[i])) : v}</span>
          <div className="bar-grow" style={{ animationDelay: `${i * 60}ms`, width: '100%', maxWidth: 64, height: Math.max(6, (v / maxBar) * 120), borderRadius: 14, background: isT ? 'var(--bar-hl)' : 'var(--bar)', boxShadow: isT ? '0 0 34px var(--hl-glow)' : 'inset 0 1px 0 rgba(var(--wrgb),.18)' }} />
          <span className="small" style={{ color: isT ? 'var(--glow)' : 'var(--dim)' }}>{isT ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
        </div>; })}
      </div>
    </section>
  </>;
}
