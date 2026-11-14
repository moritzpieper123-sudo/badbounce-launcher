import React, { useState } from 'react';
import { useApp } from '../ctx';
import { addDays, allTasks, buildPlan, dayNumber, fmtDay, fmtNum, kpis, phaseLabel, ymd, parseYmd, konzeptTable, KONZEPTE, isReady, weeklyReview, ROTATION, kColor, uid } from '../logic';
import { Rings, Spark, Icon, Count } from '../ui';
import { Header, NextUpload, BufferMeter, DueLabel } from './parts';
import { NowPlaying } from '../music';
import { useTaskDrag, DropBar, COLS } from '../taskDrag';
import type { Task } from '../types';
import { bb, isDesktop } from '../bridge';

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
  const upByDay = week.map((d) => Object.values(snap.state.uploads).filter((u) => ymd(new Date(u.slot || u.at)) === ymd(d)).length); // the day of the slot it filled
  const barVals = hasWeek ? weekVals.map((v) => v ?? 0) : upByDay;
  const maxBar = Math.max(1, ...barVals);
  const isMonday = now.getDay() === 1;
  const rev = isMonday ? weeklyReview(snap) : null;
  return <>
    <Header title={`${greet}, Mo`} sub={sub} center={<NowPlaying />} right={<>
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

    <section className="dash">
      <GenTool />
      <UploadPlan />
      <div className="glass card lift s3" style={{ justifyContent: 'space-between' }}>
        <div><h2>Today</h2><p className="sub">{plan.length ? 'Close your rings' : dn < 1 ? 'Warm-up has not started yet' : dn <= 2 ? 'Warm-up day: no posts, just scroll For You' : 'No uploads planned'}</p></div>
        <div className="row rings-row" style={{ gap: 18 }}>
          <Rings rings={[{ frac: plan.length ? made / plan.length : 0, color: 'var(--glow)' }, { frac: plan.length ? uploaded / plan.length : 0, color: 'var(--yellow-text)' }, { frac: tasks.length ? tasksDone / tasks.length : 0, color: 'var(--frost)' }]} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[['Made', made, plan.length, 'var(--glow)'], ['Uploaded', uploaded, plan.length, 'var(--yellow)'], ['Tasks', tasksDone, tasks.length, 'var(--frost)']].map(([l, a, b, c]) =>
              <div key={l as string} style={{ borderLeft: `3px solid ${c}`, paddingLeft: 9 }}><div className="small muted">{l}</div><div style={{ fontSize: 19, fontWeight: 600 }}>{a}<span className="dim" style={{ fontSize: 13, fontWeight: 500 }}> / {b}</span></div></div>)}
          </div>
        </div>
      </div>
      <TaskOverview />
      <section className="glass card s4">
      <div className="between"><div><h2>This week</h2><p className="sub">{hasWeek ? 'Views per day (from your TikTok CSV)' : 'Uploads per day (views appear after the first CSV import)'}</p></div><button className="btn sm" onClick={() => bb.openUrl('https://www.tiktok.com/tiktokstudio/analytics')}>TikTok Studio</button></div>
      <div className="weekbars" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 8, alignItems: 'end', height: 'auto', flex: 1, minHeight: 150 }}>
        {week.map((d, i) => { const isT = i === 6; const v = barVals[i]; return <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
          <span className="small" style={{ color: isT ? 'var(--glow)' : 'var(--dim)', fontWeight: 600 }}>{hasWeek ? (weekVals[i] == null ? '' : fmtNum(weekVals[i])) : v}</span>
          <div className="bar-grow" style={{ animationDelay: `${i * 60}ms`, width: '100%', maxWidth: 64, height: Math.max(6, (v / maxBar) * 110), borderRadius: 10, background: isT ? 'var(--bar-hl)' : 'var(--bar)', boxShadow: isT ? '0 0 34px var(--hl-glow)' : 'inset 0 1px 0 rgba(var(--wrgb),.18)' }} />
          <span className="small" style={{ color: isT ? 'var(--glow)' : 'var(--dim)' }}>{isT ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}</span>
        </div>; })}
      </div>
    </section>
    </section>
  </>;
}


/* ---------- Gen tool: make videos with Claude ---------- */
function GenTool() {
  const { snap, toast } = useApp();
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 3).filter((x) => !x.uploaded && x.state !== 'missed');
  const need = plan.filter((x) => !x.video).length;
  const [n, setN] = useState(() => Math.max(1, Math.min(10, need || 1)));
  const last = [...snap.videos].sort((a, b) => b.num - a.num)[0];
  const startK = last?.konzept != null ? ROTATION.indexOf(last.konzept) : -1;
  const nextK = Array.from({ length: Math.min(n, 6) }, (_, i) => ROTATION[(startK + 1 + i + ROTATION.length) % ROTATION.length]);
  const r = snap.render;
  const run = async () => {
    if (!isDesktop) { const cmd = n > 1 ? `Gen x${n}` : 'Gen'; try { await navigator.clipboard.writeText(cmd); } catch { /* ignore */ } const u = snap.state.settings.projectUrl; if (u) bb.openUrl(u); toast(`"${cmd}" copied · paste it in Claude`); return; }
    await bb.runGen(n); toast(`"${n > 1 ? `Gen x${n}` : 'Gen'}" copied · paste it in the Claude chat that just opened`); };
  return <div className="glass card lift s4 gen">
    <div className="between"><div><h2 className="row" style={{ gap: 8 }}><Icon name="film" size={18} color="var(--yellow-text)" />Gen</h2><p className="sub">Make new videos with Claude</p></div>
      <span className={`chip ${need ? 'warn' : ''}`}>{need ? `${need} slot${need > 1 ? 's' : ''} need a video` : 'Next 3 days covered'}</span></div>
    <div className="gen-row">
      <div className="stepper" role="group" aria-label="How many videos">
        <button onClick={() => setN(Math.max(1, n - 1))} aria-label="Fewer">−</button>
        <b className="num">{n}</b>
        <button onClick={() => setN(Math.min(10, n + 1))} aria-label="More">+</button>
      </div>
      <button className="btn primary gen-go" onClick={run}><Icon name="sparkle" size={16} /> Run Gen{n > 1 ? ` x${n}` : ''}</button>
    </div>
    <div className="row small" style={{ gap: 6, flexWrap: 'wrap' }}><span className="dim">Next Konzepte</span>{nextK.map((k, i) => <span key={i} className="chip"><span className="dot" style={{ width: 6, height: 6, background: kColor(k) }} />K{k} {KONZEPTE[k]?.name}</span>)}</div>
    {r ? <div className="row small" style={{ gap: 8 }}><Icon name="film" size={15} color="var(--frost)" /><span className="muted" style={{ whiteSpace: 'nowrap' }}>Rendering {r.video ?? ''}</span><div className="progress" style={{ flex: 1 }}><div style={{ width: `${Math.round((r.progress ?? 0) * 100)}%`, background: 'var(--frost)' }} /></div><span className="num">{Math.round((r.progress ?? 0) * 100)}%</span></div>
      : last ? <span className="small dim">Last made: #{last.num} · K{last.konzept ?? '?'} {KONZEPTE[last.konzept ?? 0]?.name ?? ''}{isReady(last) ? '' : ' · not complete yet'}</span> : null}
    <div style={{ marginTop: 'auto' }}><BufferMeter /></div>
  </div>;
}

/* ---------- compact upload schedule: next 3 days ---------- */
const SLOT_COL = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: 'rgba(255,255,255,.3)' } as const;
function UploadPlan() {
  const { snap, go } = useApp();
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 3);
  const days = [0, 1, 2].map((i) => { const d = addDays(now, i); return { d, ds: ymd(d), slots: plan.filter((x) => x.date === ymd(d)) }; });
  return <div className="glass card lift s5">
    <div className="between"><h2>Upload schedule</h2><button className="btn sm" onClick={() => go('schedule')}>Full plan</button></div>
    <NextUpload compact />
    <div className="uplan">
      {days.map(({ d, ds, slots }, i) => <div key={ds} className="uday">
        <span className="uday-l">{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
        <div className="uslots">{slots.length ? slots.map((x) => <span key={x.time} className={`uslot ${x.state}`} title={x.state} style={{ ['--c' as string]: SLOT_COL[x.state] }}>
          <b className="num">{x.time}</b><small>{x.uploaded ? '✓' : x.video ? `#${x.video.num}` : '–'}</small></span>)
          : <span className="small dim">{dayNumber(d, snap.state.settings.day1) <= 2 ? 'Warm-up, no posts' : 'No slots'}</span>}</div>
      </div>)}
    </div>
  </div>;
}

/* ---------- to-do overview: drag cards between columns ---------- */
function TaskOverview() {
  const { snap, update, go } = useApp();
  const today = ymd(new Date(snap.now));
  const all = allTasks(snap);
  const { drag, over, onDown } = useTaskDrag(all);
  const [txt, setTxt] = useState('');
  const add = async () => { const t = txt.trim(); if (!t) return; const task: Task = { id: uid(), title: t, tag: 'Task', konzept: null, prio: '', col: 'todo', due: today, createdAt: new Date().toISOString() }; setTxt(''); await update((st) => ({ ...st, tasks: [task, ...st.tasks] })); };
  // done column: only today's and recent, keeps it short
  const show = (c: string) => all.filter((t) => t.col === c && (c !== 'done' || !t.due || t.due >= ymd(addDays(new Date(snap.now), -2))));
  const dragged = drag ? all.find((t) => t.id === drag.id) : null;
  const mcard = (t: Task, ghost = false) => <div key={t.id + (ghost ? 'g' : '')} className={`mcard ${t.col} ${ghost ? 'ghost' : ''} ${!ghost && drag?.id === t.id ? 'drag' : ''}`}
    style={ghost ? { left: drag!.x, top: drag!.y, width: drag!.w } : undefined} onPointerDown={ghost ? undefined : (e) => onDown(e, t)} onContextMenu={(e) => e.preventDefault()}>
    <span className="dot" style={{ background: kColor(t.konzept) }} />
    <span className="mt">{t.title}</span>
    {t.prio && <span className={`prio-${t.prio}`}>{t.prio}</span>}
    {t.due && t.col !== 'done' && <span className="small dim"><DueLabel due={t.due} now={snap.now} /></span>}
  </div>;
  return <section className="glass card s8 tview">
    <div className="between"><div><h2>To do</h2><p className="sub">{all.filter((t) => t.col !== 'done').length} open · drag cards between the columns</p></div><button className="btn sm" onClick={() => go('board')}>Open board</button></div>
    <div className="mini-board">
      {COLS.map((c) => { const list = show(c.key); return <div key={c.key} data-col={c.key} className={`mcol ${over === c.key ? 'over' : ''}`}>
        <div className="mcol-h"><span className="dot" style={{ background: c.dot }} /><b>{c.name}</b><span className="chip">{list.length}</span></div>
        {c.key === 'todo' && <input className="in madd" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="+ Add a task, press Enter" />}
        {list.slice(0, 6).map((t) => mcard(t))}
        {list.length > 6 && <button className="linkbtn small" onClick={() => go('board')}>+{list.length - 6} more</button>}
        {!list.length && <div className="mempty">Drop here</div>}
      </div>; })}
    </div>
    {dragged && drag && mcard(dragged, true)}
    {drag && <DropBar over={over} />}
  </section>;
}
