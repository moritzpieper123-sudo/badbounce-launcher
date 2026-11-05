import React, { useState } from 'react';
import { useApp } from '../ctx';
import { isReady, kColor, KONZEPTE, uid, ymd } from '../logic';
import { doUploadPack } from '../actions';
import { Header } from './parts';
import { Icon, KChip, Stages } from '../ui';
import { bb, isDesktop } from '../bridge';
import { TikTokLogo } from '../logos';
import type { Task } from '../types';

export default function Library() {
  const { snap, update, toast } = useApp();
  const [k, setK] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const vids = [...snap.videos].filter((v) => k == null || v.konzept === k).sort((a, b) => b.num - a.num);
  const partTwo = async (num: number, konzept: number | null) => {
    const t: Task = { id: uid(), title: `Part 2 of #${num}: rematch / follow-up`, tag: konzept ? `Konzept ${konzept}` : 'Part 2', konzept, prio: 'High', col: 'todo', due: ymd(new Date()), createdAt: new Date().toISOString() };
    await update((st) => ({ ...st, tasks: [t, ...st.tasks] }));
    toast(`Part 2 task for #${num} added`);
  };
  return <>
    <Header title="Library" sub={`${snap.videos.length} videos in Results`} right={<>
      <button className={`btn sm ${k == null ? 'white' : ''}`} onClick={() => setK(null)}>All</button>
      {[...new Set(snap.videos.map((v) => v.konzept).filter((n): n is number => n != null))].sort().map((n) => <button key={n} className={`btn sm ${k === n ? 'white' : ''}`} onClick={() => setK(n)}><span className="dot" style={{ background: kColor(n) }} />K{n}</button>)}
      {isDesktop && <button className="btn sm" onClick={() => bb.openVault('Results')}><Icon name="folder" size={14} /> Results</button>}
    </>} />
    {!vids.length && <div className="glass card"><div className="empty">No videos yet. Gen saves each finished video to Results/#X; it shows up here within seconds.</div></div>}
    <div className="lib">
      {vids.map((v) => {
        const up = snap.state.uploads[String(v.num)];
        const stage = up ? 5 : isReady(v) ? 4 : v.hasVideo ? 3 : v.hasThumb ? 2 : 1;
        const url = v.thumbFile ? bb.fileUrl(v.thumbFile) : '';
        const short = v.durationSec != null && v.durationSec < 60;
        return <div key={v.num} className="glass card" style={{ padding: 12, gap: 10 }}>
          <div className="poster" style={{ backgroundImage: url ? `url("${url}")` : undefined }}>
            {!url && <div className="ball" />}
            <span className="tag"><KChip k={v.konzept} label={`K${v.konzept ?? '?'}`} /></span>
            {v.durationSec != null && <span className="chip" style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(0,0,0,.55)' }} title={short ? 'Under 1 minute: counts for reach, not for Creator Rewards payouts' : 'Over 1 minute'}>{Math.round(v.durationSec)} s{short ? ' · <1 min' : ''}</span>}
          </div>
          <div className="between"><b>#{v.num}</b><span className="small muted">{KONZEPTE[v.konzept ?? 0]?.name ?? ''}</span></div>
          <Stages n={stage} />
          <span className="small dim">{up ? `Uploaded ${new Date(up.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : isReady(v) ? 'Ready to upload' : v.hasVideo ? 'Needs thumbnail/description' : 'In progress'}</span>
          <div className="row" style={{ gap: 6 }}>
            {isReady(v) && !up && <button className="btn sm primary" onClick={() => doUploadPack(v.num, toast)}><Icon name="upload" size={13} /> Upload</button>}
            {up?.link && <button className="btn sm icon" onClick={() => bb.openUrl(up.link!)} title="Open the TikTok post" aria-label="Open the TikTok post"><TikTokLogo size={14} /></button>}
            <span style={{ flex: 1 }} />
            {isDesktop && <button className="btn sm icon" onClick={() => bb.openPath(v.folder)} title="Open folder" aria-label="Open folder"><Icon name="folder" size={14} /></button>}
            <button className={`btn sm icon ${open === v.num ? 'white' : ''}`} onClick={() => setOpen(open === v.num ? null : v.num)} title="Notes" aria-label="Notes"><Icon name="pen" size={14} /></button>
            {up && <button className="btn sm icon" onClick={() => partTwo(v.num, v.konzept)} title="Did well: add a Part 2 task" aria-label="Did well: add a Part 2 task"><Icon name="plus" size={14} /></button>}
          </div>
          {open === v.num && <textarea className="in" rows={3} placeholder="What worked, what to try next…" defaultValue={snap.state.notes[String(v.num)] ?? ''} onBlur={(e) => update((st) => ({ ...st, notes: { ...st.notes, [String(v.num)]: e.target.value } }))} />}
          {open !== v.num && snap.state.notes[String(v.num)] && <span className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{snap.state.notes[String(v.num)]}</span>}
        </div>;
      })}
    </div>
  </>;
}
