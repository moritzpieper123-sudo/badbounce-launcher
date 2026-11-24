import React, { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { buildPlan, kColor, KONZEPTE, ymd, vn } from '../logic';
import { doAutoAll, doUploadPack, markUploaded, setLink, unmarkUploaded } from '../actions';
import { AutoUpload, Header, NextUpload, Thumb } from './parts';
import { Icon } from '../ui';
import { bb } from '../bridge';
import type { UploadStatus } from '../bridge';
import { autoOf } from '../autopilot';

const STEPS = ['Upload pack: video + thumbnail land in Downloads\\Badbounce upload, description is copied', 'TikTok Studio · Upload: pick the video', 'Paste the description (Ctrl+V)', 'Cover: upload the thumbnail or pick the matching frame', 'Post, then tick "Mark uploaded" here and paste the post link'];

/** Two categories: AUTOMATIC (the launcher puts the video into TikTok Studio itself) and MANUAL (you post by hand). */
function Cat({ icon, title, sub, right }: { icon: string; title: string; sub: string; right?: React.ReactNode }) {
  return <div className="cat-head"><span className="cat-ico"><Icon name={icon as never} size={18} /></span><div style={{ flex: 1, minWidth: 0 }}><h2 style={{ margin: 0 }}>{title}</h2><div className="small muted">{sub}</div></div>{right}</div>;
}

export default function Upload() {
  const { snap, update, toast } = useApp();
  const now = new Date(snap.now);
  const au = autoOf(snap.state);
  const plan = buildPlan(snap, now, 4).filter((s) => !s.uploaded && s.state !== 'missed' && s.video);
  const [filter, setFilter] = useState<'all' | 'auto' | 'manual'>('all');
  const all = Object.entries(snap.state.uploads).sort((a, b) => b[1].at.localeCompare(a[1].at));
  const recent = all.filter(([, u]) => filter === 'all' || (filter === 'auto') === !!u.scheduled).slice(0, 8);
  const scheduled = all.filter(([, u]) => u.scheduled && new Date(u.slot ?? u.at).getTime() > now.getTime()).sort((a, b) => (a[1].slot ?? a[1].at).localeCompare(b[1].slot ?? b[1].at));
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [st, setSt] = useState<UploadStatus>({ state: 'idle' });
  useEffect(() => { if (!bb.onUploadStatus) return; bb.uploadStatus?.().then(setSt); return bb.onUploadStatus(setSt); }, []);
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const label = (v: { konzept: number | null } | undefined) => v ? `K${v.konzept ?? '?'} ${KONZEPTE[v.konzept ?? 0]?.name ?? ''}` : '';
  return <>
    <Header title="Upload" sub="Automatic: the launcher puts videos into TikTok Studio. Manual: you post by hand." right={<button className="btn" onClick={() => bb.openUrl('https://www.tiktok.com/tiktokstudio/upload')}><Icon name="upload" size={15} /> Open TikTok Studio</button>} />

    <Cat icon="radar" title="Automatic upload" sub="The launcher opens Chrome in the background and schedules the post in TikTok Studio."
      right={<><span className="chip" style={{ color: au.enabled ? 'var(--green)' : 'var(--muted)' }}>Autopilot {au.enabled ? 'ON' : 'OFF'}</span>
        <button className="btn primary" onClick={() => doAutoAll(snap, 'schedule', toast)} title="Puts every ready video into the next free slots, one after another"><Icon name="upload" size={15} /> Schedule all ready</button>
        <button className="btn" onClick={() => doAutoAll(snap, 'test', toast)} title="Everything except the final click, nothing is published">Test all</button></>} />
    <section className="grid g-auto">
      <div className="glass card">
        <h2>Scheduled by the launcher</h2>
        <p className="sub" style={{ marginTop: -10 }}>Waiting in TikTok Studio for their time.</p>
        {st.state !== 'idle' && <p className="small" style={{ color: st.state === 'error' ? 'var(--red)' : st.state === 'ok' ? 'var(--green)' : 'var(--muted)' }}>{st.state === 'running' ? 'Working on #' + st.key + ': ' : 'Last run: '}{st.msg}</p>}
        {scheduled.length ? scheduled.map(([n, u]) => { const v = snap.videos.find((x) => x.num === +n); return <div key={n} className="row" style={{ borderTop: '1px solid rgba(var(--wrgb),.07)', paddingTop: 8 }}>
          <Thumb v={v} w={30} h={53} /><div style={{ flex: 1 }}><b>#{vn(+n)}</b> <span className="small muted">{label(v)}</span></div><span className="chip" style={{ color: 'var(--green)' }}>{when(u.slot ?? u.at)}</span></div>; }) : <div className="empty">Nothing scheduled by the launcher right now.</div>}
      </div>
      <div className="glass card">
        <h2>Ready for automatic upload</h2>
        <p className="sub" style={{ marginTop: -10 }}>Next 4 days. {au.enabled ? 'The autopilot also fills these by itself.' : 'Autopilot is off: press Auto yourself.'}</p>
        {plan.length ? <table className="t"><tbody>{plan.map((s) => <tr key={s.when.toISOString()}>
          <td className="num">{s.date === ymd(now) ? 'Today' : s.when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} {s.time}</td>
          <td>#{vn(s.video!.num)}</td>
          <td style={{ textAlign: 'right' }}><div className="row" style={{ justifyContent: 'flex-end' }}><AutoUpload num={s.video!.num} /></div></td>
        </tr>)}</tbody></table> : <div className="empty">No ready videos in the queue.</div>}
      </div>
    </section>

    <Cat icon="upload" title="Manual upload" sub="You post in TikTok Studio yourself: upload pack, paste, post, then tick Done." />
    <section className="grid g-auto">
      <div className="glass card"><h2>Up next</h2><NextUpload manual /></div>
      <div className="glass card"><h2>Steps</h2><ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }} className="muted">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol></div>
    </section>
    <section className="glass card">
      <h2>Manual queue · next 4 days</h2>
      {plan.length ? <table className="t"><thead><tr><th>Slot</th><th>Video</th><th>Konzept</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead><tbody>
        {plan.map((s) => <tr key={s.when.toISOString()}>
          <td className="num">{s.date === ymd(now) ? 'Today' : s.when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} {s.time}</td>
          <td>#{vn(s.video!.num)}</td>
          <td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: kColor(s.video!.konzept) }} />K{s.video!.konzept ?? '?'} {KONZEPTE[s.video!.konzept ?? 0]?.name}</span></td>
          <td style={{ textAlign: 'right' }}><div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm" onClick={() => doUploadPack(s.video!.num, toast)}>Upload pack</button>
            <button className="btn sm" onClick={async () => { await update(markUploaded(snap, s.video!.num)); toast(`#${vn(s.video!.num)} marked uploaded`); }}>Mark uploaded</button>
          </div></td>
        </tr>)}
      </tbody></table> : <div className="empty">No ready videos in the queue.</div>}
    </section>

    <section className="glass card">
      <div className="between"><h2>Recently uploaded</h2>
        <div className="row" style={{ gap: 6 }}>{(['all', 'auto', 'manual'] as const).map((f) => <button key={f} className={`btn sm ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'auto' ? 'Automatic' : 'Manual'}</button>)}</div></div>
      <p className="sub" style={{ marginTop: -10 }}>Paste the TikTok link so the weekly CSV can be matched to each video.</p>
      {recent.length ? recent.map(([n, u]) => {
        const v = snap.videos.find((x) => x.num === +n);
        return <div key={n} className="row" style={{ borderTop: '1px solid rgba(var(--wrgb),.07)', paddingTop: 10, flexWrap: 'wrap' }}>
          <Thumb v={v} w={36} h={64} />
          <div style={{ flex: '1 1 160px' }}><b>#{n}</b> <span className="chip" style={{ color: u.scheduled ? 'var(--green)' : 'var(--muted)' }}>{u.scheduled ? 'Automatic' : 'Manual'}</span> <span className="muted small">· {new Date(u.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>{v && <div className="small muted">{label(v)}</div>}</div>
          <input className="in" style={{ flex: '2 1 260px' }} placeholder="TikTok post link" value={edit[n] ?? u.link ?? ''} onChange={(e) => setEdit({ ...edit, [n]: e.target.value })} onBlur={() => edit[n] != null && update(setLink(+n, edit[n]))} />
          {u.link && <button className="btn sm" onClick={() => bb.openUrl(u.link!)}><Icon name="link" size={14} /> Open</button>}
          <button className="btn sm" onClick={() => update(unmarkUploaded(+n))}>Undo</button>
        </div>;
      }) : <div className="empty">Nothing uploaded yet.</div>}
    </section>
  </>;
}
