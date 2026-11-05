import React, { useState } from 'react';
import { useApp } from '../ctx';
import { bb } from '../bridge';
import { Icon, KChip, Tick } from '../ui';
import { buildPlan, fmtIn, fmtLate, KONZEPTE, minsUntil, setTaskCol, kColor, ymd, bufferInfo, dayDiff, parseYmd } from '../logic';
import { TikTokLogo } from '../logos';
import { doUploadPack, markUploaded, setLink, unmarkUploaded } from '../actions';
import type { Task, Video } from '../types';

export function Header({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return <header className="top"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{right && <div className="row" style={{ flexWrap: 'wrap' }}>{right}</div>}</header>;
}

export function Thumb({ v, w = 64, h = 112 }: { v: Video | null | undefined; w?: number; h?: number }) {
  const url = v?.thumbFile ? bb.fileUrl(v.thumbFile) : '';
  return <div className="thumb" style={{ width: w, height: h, backgroundImage: url ? `url("${url}")` : undefined }} aria-hidden="true">{!url && <div className="ball" />}</div>;
}

/** The "Up next" card with the one-click upload button. */
export function NextUpload({ compact = false }: { compact?: boolean }) {
  const { snap, update, toast } = useApp();
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 14).filter((s) => !s.uploaded && s.state !== 'missed');
  const next = plan.find((s) => s.video) || null;
  const [linkFor, setLinkFor] = useState<number | null>(null);
  const [link, setLinkTxt] = useState('');
  if (linkFor != null) {
    return <div className="next" style={{ flexDirection: 'column' }}>
      <span className="small" style={{ color: 'var(--green)', fontWeight: 700 }}>#{linkFor} MARKED UPLOADED</span>
      <span className="muted small">Paste the TikTok link of the post (optional, helps match stats):</span>
      <input className="in" placeholder="https://www.tiktok.com/@…/video/…" value={link} onChange={(e) => setLinkTxt(e.target.value)} autoFocus />
      <div className="row">
        <button className="btn primary sm" onClick={async () => { await update(setLink(linkFor, link)); setLinkFor(null); setLinkTxt(''); toast('Link saved'); }}>Save link</button>
        <button className="btn sm" onClick={() => { setLinkFor(null); setLinkTxt(''); }}>Skip</button>
        <button className="btn sm" onClick={async () => { await update(unmarkUploaded(linkFor)); setLinkFor(null); toast('Undone'); }}>Undo</button>
      </div>
    </div>;
  }
  if (!next) return <div className="empty">No ready video for the next slots. Make videos with Gen; they appear here as soon as Results/#X has video, thumbnail and description.</div>;
  const v = next.video!;
  const mins = minsUntil(next.when, now);
  const late = mins < 0;
  const dayLabel = next.date === ymd(now) ? '' : `${next.when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · `;
  return (
    <div className="next">
      {!compact && <Thumb v={v} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span className="small" style={{ fontWeight: 700, color: late ? 'var(--red)' : 'var(--yellow)', letterSpacing: '.04em' }}>{(late ? `${fmtLate(mins).toUpperCase()} · ` : `${fmtIn(mins).toUpperCase()} · `) + dayLabel + next.time}</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Upload #{v.num}</span>
        <span className="row small" style={{ color: '#CFD6E8', gap: 6 }}><span className="dot" style={{ background: kColor(v.konzept) }} />Konzept {v.konzept ?? '?'} · {KONZEPTE[v.konzept ?? 0]?.name ?? v.title}</span>
        <div className="row" style={{ marginTop: 6, gap: 8 }}>
          <button className="btn primary sm" onClick={() => doUploadPack(v.num, toast)}><Icon name="upload" size={15} /> Upload pack</button>
          <button className="btn sm" onClick={async () => { await update(markUploaded(snap, v.num)); setLinkFor(v.num); }} title="Mark uploaded"><Tick size={12} color="currentColor" /> Done</button>
          <button className="btn sm icon" onClick={() => bb.openUrl('https://www.tiktok.com/tiktokstudio/upload')} title="Open TikTok Studio upload" aria-label="Open TikTok Studio upload"><TikTokLogo size={16} /></button>
        </div>
      </div>
    </div>
  );
}

export function SlotList({ date }: { date: Date }) {
  const { snap } = useApp();
  const ds = ymd(date);
  const slots = buildPlan(snap, date, 1).filter((s) => s.date === ds);
  if (!slots.length) return <div className="muted small">No uploads planned for this day.</div>;
  const color = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: '#8F9BBA' } as const;
  const label = { uploaded: 'Uploaded', ready: 'Ready', next: 'Next', missing: 'No video', overdue: 'Overdue', missed: 'Missed' } as const;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {slots.map((s) => <div key={s.time} className="slotline">
      <span className="bar" style={{ background: color[s.state] }} />
      <span className="num muted" style={{ width: 48 }}>{s.time}</span>
      <span style={{ flex: 1, color: s.uploaded ? 'var(--dim)' : 'var(--text)' }}>{s.video ? `#${s.video.num} · Konzept ${s.video.konzept ?? '?'} ${KONZEPTE[s.video.konzept ?? 0]?.name ?? ''}` : 'No video assigned'}</span>
      <span className="small" style={{ color: color[s.state] }}>{label[s.state]}</span>
    </div>)}
  </div>;
}

export function TaskRow({ t }: { t: Task }) {
  const { snap, update, toast } = useApp();
  const done = t.col === 'done';
  const toggle = async () => {
    if (t.auto?.startsWith('up:') && t.videoNum != null) {
      if (!done) { await update(markUploaded(snap, t.videoNum)); toast(`#${t.videoNum} marked uploaded`); }
      else { await update(unmarkUploaded(t.videoNum)); }
      return;
    }
    await update((st) => setTaskCol(st, t, done ? 'todo' : 'done'));
  };
  return <div className={`task ${done ? 'done' : ''}`}>
    <button className={`chk ${done ? 'on' : ''}`} onClick={toggle} aria-label={(done ? 'Mark not done: ' : 'Mark done: ') + t.title}>{done && <Tick />}</button>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="t">{t.title}</div>
      <div className="row small muted" style={{ marginTop: 4, gap: 8 }}><KChip k={t.konzept} label={t.tag} />{t.due && <DueLabel due={t.due} now={snap.now} />}</div>
    </div>
    {t.auto?.startsWith('gen:') && !done && <button className="btn sm" onClick={() => bb.runGen(parseInt(t.title.match(/x(\d+)/)?.[1] || '1'))}>Run Gen</button>}
    {t.auto?.startsWith('csv:') && !done && <button className="btn sm" onClick={() => location.hash = 'analytics'}>Import</button>}
    {t.prio && <span className={`prio-${t.prio}`}>{t.prio}</span>}
  </div>;
}

export function DueLabel({ due, now }: { due: string; now: string }) {
  const today = ymd(new Date(now));
  const d = dayDiff(parseYmd(due), parseYmd(today));
  const txt = d === 0 ? 'Today' : d === -1 ? 'Yesterday' : d === 1 ? 'Tomorrow' : parseYmd(due).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return <span style={{ color: d < 0 ? 'var(--red)' : undefined }}>{txt}</span>;
}

export function BufferMeter() {
  const { snap } = useApp();
  const b = bufferInfo(snap);
  const pct = Math.min(1, b.days / 3);
  const col = b.days < 1 ? 'var(--red)' : b.days < 2 ? 'var(--yellow)' : 'var(--green)';
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div className="between"><span className="muted small">Video buffer</span><span style={{ fontWeight: 700, color: col }}>{b.days} day{b.days === 1 ? '' : 's'} · {b.readyCount} ready</span></div>
    <div className="progress" style={{ height: 8 }}><div style={{ width: `${pct * 100}%`, background: col }} /></div>
    {b.days < 1 && b.missing2 > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span className="small" style={{ color: 'var(--red)' }}>{b.missing2} slot{b.missing2 > 1 ? 's' : ''} today/tomorrow without a video</span><button className="btn sm primary" onClick={() => bb.runGen(b.missing2)}>Gen x{b.missing2}</button></div>}
  </div>;
}
