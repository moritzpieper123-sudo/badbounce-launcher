import React, { useState } from 'react';
import { useApp } from '../ctx';
import { addDays, dayDiff, buildPlan, dayNumber, parseYmd, phaseLabel, ymd, kColor, KONZEPTE, postsForDay } from '../logic';
import { Header, BufferMeter } from './parts';

export default function Schedule() {
  const { snap } = useApp();
  const now = new Date(snap.now);
  const [offset, setOffset] = useState(0);
  const monday = addDays(parseYmd(ymd(now)), -((now.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const start = offset > 0 ? parseYmd(ymd(now)) : monday;
  const plan = buildPlan(snap, start, dayDiff(addDays(monday, 6), start) + 1);
  const color = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: '#8F9BBA' } as const;
  const label = { uploaded: 'Uploaded', ready: 'Ready', next: 'Next', missing: 'No video', overdue: 'Overdue', missed: 'Missed' } as const;
  const dn = dayNumber(now, snap.state.settings.day1);
  return <>
    <Header title="Upload schedule" sub={`Fast route · Day 1 = ${snap.state.settings.day1} · today: ${phaseLabel(dn)}`} right={<>
      <button className="btn" onClick={() => setOffset(offset - 1)} aria-label="Previous week">‹</button>
      <button className="btn" onClick={() => setOffset(0)}>This week</button>
      <button className="btn" onClick={() => setOffset(offset + 1)} aria-label="Next week">›</button>
    </>} />
    <div className="glass card"><BufferMeter /><span className="small dim">Videos are placed in Konzept rotation (K1, K2, K4, K5, K6, K3), never the same Konzept twice in a row. Once the CSV shows which Konzepte do best, those get the slots first.</span></div>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {days.map((d) => {
        const ds = ymd(d), slots = plan.filter((s) => s.date === ds), n = dayNumber(d, snap.state.settings.day1), isT = ds === ymd(now);
        return <div key={ds} className="glass card" style={{ padding: 14, gap: 10, borderColor: isT ? 'rgba(255,198,58,.55)' : undefined }}>
          <div><div style={{ fontWeight: 700 }}>{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div><div className="small dim">{n >= 1 ? `Day ${n} · ${postsForDay(n)} post${postsForDay(n) === 1 ? '' : 's'}` : 'Before start'}</div></div>
          {n >= 1 && n <= 2 && <div className="small muted">Warm-up: profile, 20–30 min For You, no posts.</div>}
          {slots.map((s) => <div key={s.time} style={{ borderRadius: 12, padding: '8px 10px', background: 'rgba(255,255,255,.06)', borderLeft: `3px solid ${color[s.state]}` }}>
            <div className="between"><span className="num" style={{ fontWeight: 700 }}>{s.time}</span><span className="small" style={{ color: color[s.state] }}>{label[s.state]}</span></div>
            {s.video ? <div className="row small" style={{ gap: 6, marginTop: 4 }}><span className="dot" style={{ background: kColor(s.video.konzept) }} />#{s.video.num} · K{s.video.konzept ?? '?'} {KONZEPTE[s.video.konzept ?? 0]?.name ?? ''}</div> : <div className="small dim" style={{ marginTop: 4 }}>no video yet</div>}
          </div>)}
        </div>;
      })}
    </section>
  </>;
}
