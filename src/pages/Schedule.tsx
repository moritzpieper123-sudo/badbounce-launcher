import React, { useState } from 'react';
import { doUploadPack, markUploaded } from '../actions';
import { bb } from '../bridge';
import { Icon, Tick } from '../ui';
import { useApp } from '../ctx';
import { addDays, dayDiff, buildPlan, dayNumber, parseYmd, phaseLabel, ymd, kColor, KONZEPTE, postsForDay, ROTATION } from '../logic';
import { Header, BufferMeter } from './parts';

export default function Schedule() {
  const { snap, update, toast } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const now = new Date(snap.now);
  const [offset, setOffset] = useState(0);
  const monday = addDays(parseYmd(ymd(now)), -((now.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const start = offset > 0 ? parseYmd(ymd(now)) : monday;
  const plan = buildPlan(snap, start, dayDiff(addDays(monday, 6), start) + 1);
  const color = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: 'var(--dim)' } as const;
  const label = { uploaded: 'Uploaded', ready: 'Ready', next: 'Next', missing: 'No video', overdue: 'Overdue', missed: 'Missed' } as const;
  const dn = dayNumber(now, snap.state.settings.day1);
  return <>
    <Header title="Upload schedule" sub={`Fast route · Day 1 = ${snap.state.settings.day1} · today: ${phaseLabel(dn)}`} right={<>
      <button className="btn" onClick={() => setOffset(offset - 1)} aria-label="Previous week">‹</button>
      <button className="btn" onClick={() => setOffset(0)}>This week</button>
      <button className="btn" onClick={() => setOffset(offset + 1)} aria-label="Next week">›</button>
    </>} />
    <div className="glass card"><BufferMeter /><span className="small dim hide-phone">Videos are placed in Konzept rotation ({ROTATION.map((k) => `K${k}`).join(', ')}), never the same Konzept twice in a row. Once the CSV shows which Konzepte do best, those get the slots first.</span></div>

    {/* phone: week strip + one day at a time */}
    {(() => {
      const selDay = sel && days.some((d) => ymd(d) === sel) ? sel : (days.some((d) => ymd(d) === ymd(now)) ? ymd(now) : ymd(days[0]));
      const dd = parseYmd(selDay), slots = plan.filter((x) => x.date === selDay), n = dayNumber(dd, snap.state.settings.day1);
      return <div className="phone-only sched-phone">
        <div className="week-strip">
          {days.map((d) => { const ds = ymd(d), sl = plan.filter((x) => x.date === ds); return <button key={ds} className={`wday ${ds === selDay ? 'on' : ''} ${ds === ymd(now) ? 'today' : ''}`} onClick={() => setSel(ds)}>
            <span className="small">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <b>{d.getDate()}</b>
            <span className="wdots">{sl.map((x) => <i key={x.time} style={{ background: color[x.state] }} />)}</span>
          </button>; })}
        </div>
        <div className="glass card" style={{ gap: 12 }}>
          <div className="between"><b style={{ fontSize: 17 }}>{dd.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</b><span className="small dim">{n >= 1 ? `Day ${n}` : 'Before start'}</span></div>
          {n >= 1 && n <= 2 && <div className="small muted">Warm-up day: set up the profile and scroll For You for 20–30 min. No posts.</div>}
          {n >= 1 && !slots.length && n > 2 && <div className="small muted">No uploads planned.</div>}
          {n < 1 && <div className="small muted">The plan starts on {parseYmd(snap.state.settings.day1).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}.</div>}
          {slots.map((x) => <div key={x.time} className="pslot" style={{ borderLeftColor: color[x.state] }}>
            <div className="between" style={{ alignItems: 'center' }}><span className="num" style={{ fontSize: 22, fontWeight: 800 }}>{x.time}</span><span className="spill" style={{ color: color[x.state], borderColor: color[x.state] }}>{label[x.state]}</span></div>
            {x.video ? <div className="row small" style={{ gap: 8 }}><span className="dot" style={{ background: kColor(x.video.konzept) }} /><b>#{x.video.num}</b><span className="muted">K{x.video.konzept ?? '?'} {KONZEPTE[x.video.konzept ?? 0]?.name ?? ''}</span></div>
              : <div className="small muted">No video yet</div>}
            {!x.uploaded && x.state !== 'missed' && <div className="row" style={{ gap: 8 }}>
              {x.video ? <>
                <button className="btn sm primary" onClick={() => doUploadPack(x.video!.num, toast)}><Icon name="upload" size={13} /> Upload pack</button>
                <button className="btn sm" onClick={async () => { await update(markUploaded(snap, x.video!.num)); toast(`#${x.video!.num} marked uploaded`); }}><Tick size={11} color="currentColor" /> Done</button>
              </> : <button className="btn sm" onClick={() => { bb.runGen(1); toast('"Gen" copied'); }}><Icon name="play" size={12} /> Gen</button>}
            </div>}
          </div>)}
        </div>
      </div>;
    })()}

    <section className="hide-phone" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {days.map((d) => {
        const ds = ymd(d), slots = plan.filter((s) => s.date === ds), n = dayNumber(d, snap.state.settings.day1), isT = ds === ymd(now);
        return <div key={ds} className="glass card" style={{ padding: 14, gap: 10, borderColor: isT ? 'rgba(255,198,58,.55)' : undefined }}>
          <div><div style={{ fontWeight: 700 }}>{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div><div className="small dim">{n >= 1 ? `Day ${n} · ${postsForDay(n)} post${postsForDay(n) === 1 ? '' : 's'}` : 'Before start'}</div></div>
          {n >= 1 && n <= 2 && <div className="small muted">Warm-up: profile, 20–30 min For You, no posts.</div>}
          {slots.map((s) => <div key={s.time} style={{ borderRadius: 12, padding: '8px 10px', background: 'rgba(var(--wrgb),.06)', borderLeft: `3px solid ${color[s.state]}` }}>
            <div className="between"><span className="num" style={{ fontWeight: 700 }}>{s.time}</span><span className="small" style={{ color: color[s.state] }}>{label[s.state]}</span></div>
            {s.video ? <div className="row small" style={{ gap: 6, marginTop: 4 }}><span className="dot" style={{ background: kColor(s.video.konzept) }} />#{s.video.num} · K{s.video.konzept ?? '?'} {KONZEPTE[s.video.konzept ?? 0]?.name ?? ''}</div> : <div className="small dim" style={{ marginTop: 4 }}>no video yet</div>}
          </div>)}
        </div>;
      })}
    </section>
  </>;
}
