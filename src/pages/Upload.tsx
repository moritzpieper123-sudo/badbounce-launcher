import React, { useState } from 'react';
import { useApp } from '../ctx';
import { buildPlan, kColor, KONZEPTE, ymd } from '../logic';
import { doUploadPack, markUploaded, setLink, unmarkUploaded } from '../actions';
import { Header, NextUpload, Thumb } from './parts';
import { Icon } from '../ui';
import { bb } from '../bridge';

const STEPS = ['Upload pack: video + thumbnail land in Downloads\\Badbounce upload, description is copied', 'TikTok Studio · Upload: pick the video', 'Paste the description (Ctrl+V)', 'Cover: upload the thumbnail or pick the matching frame', 'Post, then tick "Mark uploaded" here and paste the post link'];

export default function Upload() {
  const { snap, update, toast } = useApp();
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 4).filter((s) => !s.uploaded && s.state !== 'missed' && s.video);
  const recent = Object.entries(snap.state.uploads).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 8);
  const [edit, setEdit] = useState<Record<string, string>>({});
  return <>
    <Header title="Next upload" sub="One click prepares everything; you only upload, paste and tick." right={<button className="btn" onClick={() => bb.openUrl('https://www.tiktok.com/tiktokstudio/upload')}><Icon name="upload" size={15} /> Open TikTok Studio</button>} />
    <section className="grid g-auto">
      <div className="glass card"><h2>Up next</h2><NextUpload /></div>
      <div className="glass card"><h2>Steps</h2><ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }} className="muted">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol></div>
    </section>
    <section className="glass card">
      <h2>Queue · next 4 days</h2>
      {plan.length ? <table className="t"><thead><tr><th>Slot</th><th>Video</th><th>Konzept</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead><tbody>
        {plan.map((s) => <tr key={s.when.toISOString()}>
          <td className="num">{s.date === ymd(now) ? 'Today' : s.when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} {s.time}</td>
          <td>#{s.video!.num}</td>
          <td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: kColor(s.video!.konzept) }} />K{s.video!.konzept ?? '?'} {KONZEPTE[s.video!.konzept ?? 0]?.name}</span></td>
          <td style={{ textAlign: 'right' }}><div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm" onClick={() => doUploadPack(s.video!.num, toast)}>Upload pack</button>
            <button className="btn sm" onClick={async () => { await update(markUploaded(snap, s.video!.num)); toast(`#${s.video!.num} marked uploaded`); }}>Mark uploaded</button>
          </div></td>
        </tr>)}
      </tbody></table> : <div className="empty">No ready videos in the queue.</div>}
    </section>
    <section className="glass card">
      <h2>Recently uploaded</h2>
      <p className="sub" style={{ marginTop: -10 }}>Paste the TikTok link so the weekly CSV can be matched to each video.</p>
      {recent.length ? recent.map(([n, u]) => {
        const v = snap.videos.find((x) => x.num === +n);
        return <div key={n} className="row" style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 10, flexWrap: 'wrap' }}>
          <Thumb v={v} w={36} h={64} />
          <div style={{ flex: '1 1 160px' }}><b>#{n}</b> <span className="muted small">· {new Date(u.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>{v && <div className="small muted">K{v.konzept ?? '?'} {KONZEPTE[v.konzept ?? 0]?.name}</div>}</div>
          <input className="in" style={{ flex: '2 1 260px' }} placeholder="TikTok post link" value={edit[n] ?? u.link ?? ''} onChange={(e) => setEdit({ ...edit, [n]: e.target.value })} onBlur={() => edit[n] != null && update(setLink(+n, edit[n]))} />
          {u.link && <button className="btn sm" onClick={() => bb.openUrl(u.link!)}><Icon name="link" size={14} /> Open</button>}
          <button className="btn sm" onClick={() => update(unmarkUploaded(+n))}>Undo</button>
        </div>;
      }) : <div className="empty">Nothing uploaded yet.</div>}
    </section>
  </>;
}
