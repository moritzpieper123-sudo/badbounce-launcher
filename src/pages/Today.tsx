import React from 'react';
import { useApp } from '../ctx';
import { addDays, allTasks, buildPlan, dayNumber, fmtDay, fmtNum, kpis, phaseLabel, ymd, parseYmd, konzeptTable, KONZEPTE, isReady, weeklyReview } from '../logic';
import { Rings, Spark, Icon } from '../ui';
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
      <button className="btn" onClick={() => go('ideas')}><Icon name="plus" size={15} /> Idea</button>
      <button className="btn" onClick={() => go('board')}><Icon name="plus" size={15} /> New task</button>
    </>} />

    <section className="grid g-kpi" aria-label="Key numbers">
      <div className="glass card lift kpi"><div className="between"><span className="l">Followers</span>{k.followers7 != null && <span className="small" style={{ color: 'var(--green)', fontWeight: 600 }}>+{k.followers7} · 7d</span>}</div><div className="v">{fmtNum(k.followers)}</div><Spark values={days.filter((d) => d.followers != null).slice(-14).map((d) => d.followers!)} color="#F4F6FF" /><span className="dim small">Goal: 10,000 for Creator Rewards</span></div>
      <div className="glass card lift kpi"><div className="between"><span className="l">Views · last 30 days</span></div><div className="v">{fmtNum(k.hasData ? k.views30 : null)}</div><Spark values={days.slice(-14).map((d) => d.views || 0)} color="#AAC3F0" /><span className="dim small">Goal: 100,000 in 30 days{k.views30 >= 100000 ? ' ✓' : ''}</span></div>
      <div className="glass card lift kpi"><div className="between"><span className="l">Watched to the end</span></div><div className="v">{k.fullWatch != null ? `${k.fullWatch.toFixed(0)}%` : '–'}</div><span className="dim small">{k.avgWatch != null ? `Avg watch time ${k.avgWatch.toFixed(1)} s` : 'From the weekly CSV'}</span></div>
      <div className="glass card lift kpi"><div className="between"><span className="l">Best Konzept</span></div><div className="v" style={{ fontSize: 22 }}>{kt[0] ? `K${kt[0].k} ${KONZEPTE[kt[0].k]?.name}` : '–'}</div><span className="dim small">{kt[0] ? `${fmtNum(Math.round(kt[0].avgViews))} avg views` : 'Needs matched posts from the CSV'}</span></div>
    </section>

    {rev && <div className="glass card" style={{ borderColor: 'rgba(255,198,58,.4)' }}>
      <div className="between"><h2>Monday review</h2><button className="btn sm" onClick={() => go('analytics')}>Open</button></div>
      <span className="muted">Last week: {rev.posted} posted · {fmtNum(rev.k.views7)} views{rev.change != null ? ` (${rev.change >= 0 ? '+' : ''}${rev.change.toFixed(0)}%)` : ''}{rev.bestK ? ` · best Konzept K${rev.bestK.k}` : ''}{rev.bestSlot ? ` · best slot ${rev.bestSlot.slot}` : ''}</span>
    </div>}

    <section className="grid g-auto">
      <div className="glass card lift" style={{ justifyContent: 'space-between' }}>
        <div><h2>Today</h2><p className="sub">{plan.length ? 'Close your rings' : dn < 1 ? 'Warm-up has not started yet' : dn <= 2 ? 'Warm-up day: no posts, just scroll For You' : 'No uploads planned'}</p></div>
        <div className="row" style={{ gap: 22 }}>
          <Rings rings={[{ frac: plan.length ? made / plan.length : 0, color: '#F4F6FF' }, { frac: plan.length ? uploaded / plan.length : 0, color: '#FFC63A' }, { frac: tasks.length ? tasksDone / tasks.length : 0, color: '#AAC3F0' }]} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['Made', made, plan.length, '#F4F6FF'], ['Uploaded', uploaded, plan.length, '#FFC63A'], ['Tasks', tasksDone, tasks.length, '#AAC3F0']].map(([l, a, b, c]) =>
              <div key={l as string} style={{ borderLeft: `3px solid ${c}`, paddingLeft: 10 }}><div className="small muted">{l}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{a}<span className="dim" style={{ fontSize: 14, fontWeight: 500 }}> / {b}</span></div></div>)}
          </div>
        </div>
        <BufferMeter />
      </div>

      <div className="glass card lift">
        <div className="between"><h2>Up next</h2><button className="btn sm" onClick={() => go('schedule')}>Schedule</button></div>
        <NextUpload />
        <SlotList date={now} />
        {snap.render && <div className="row small" style={{ gap: 8 }}><Icon name="film" size={16} color="#AAC3F0" /><span className="muted">Rendering {snap.render.video ?? ''} {snap.render.label ?? ''}</span><div className="progress"><div style={{ width: `${Math.round((snap.render.progress ?? 0) * 100)}%`, background: '#AAC3F0' }} /></div><span className="num">{Math.round((snap.render.progress ?? 0) * 100)}%</span></div>}
      </div>

      <div className="glass card lift" style={{ gap: 4 }}>
        <div className="between" style={{ marginBottom: 6 }}><div><h2>My tasks</h2><p className="sub">Due today and late</p></div><button className="btn sm" onClick={() => go('board')}>Open board</button></div>
        {tasks.length ? tasks.slice(0, 6).map((t) => <TaskRow key={t.id} t={t} />) : <div className="empty">Nothing due. Nice.</div>}
        {tasks.length > 6 && <button className="linkbtn" onClick={() => go('board')}>+{tasks.length - 6} more on the board</button>}
      </div>
    </section>

    <section className="glass card">
      <div className="between"><div><h2>This week</h2><p className="sub">{hasWeek ? 'Views per day (from your TikTok CSV)' : 'Uploads per day (views appear after the first CSV import)'}</p></div><button className="btn sm" onClick={() => bb.openUrl('https://www.tiktok.com/tiktokstudio/analytics')}>TikTok Studio</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 14, alignItems: 'end', height: 170 }}>
        {week.map((d, i) => { const isT = i === 6; const v = barVals[i]; return <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
          <span className="small" style={{ color: isT ? 'var(--yellow)' : 'var(--dim)', fontWeight: 600 }}>{hasWeek ? (weekVals[i] == null ? '' : fmtNum(weekVals[i])) : v}</span>
          <div style={{ width: '100%', maxWidth: 64, height: Math.max(6, (v / maxBar) * 120), borderRadius: 14, background: isT ? 'linear-gradient(180deg,#FFD978,#FFC63A)' : 'rgba(170,195,240,.25)', boxShadow: isT ? '0 0 30px rgba(255,198,58,.45)' : 'none' }} />
          <span className="small" style={{ color: isT ? 'var(--yellow)' : 'var(--dim)' }}>{isT ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
        </div>; })}
      </div>
    </section>
  </>;
}
