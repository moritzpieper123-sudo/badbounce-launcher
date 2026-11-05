import React, { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { kColor, KONZEPTE, uid } from '../logic';
import { Header } from './parts';
import { Icon, KChip } from '../ui';
import { bb, isDesktop } from '../bridge';
import type { Idea } from '../types';

export default function Ideas() {
  const { snap, update, toast } = useApp();
  const [text, setText] = useState(''); const [k, setK] = useState<string>(''); const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null); const [over, setOver] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = Array.from(e.clipboardData?.files || []).find((x) => /^(video|image)\//.test(x.type)); if (f) { setFile(f); e.preventDefault(); } };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  }, []);
  const save = async () => {
    if (!text.trim() && !file && !link.trim()) return;
    setBusy(true);
    let stored: string | undefined;
    if (file) stored = await bb.saveIdeaFile(file.name, await file.arrayBuffer());
    const idea: Idea = { id: uid(), text: text.trim(), konzept: k ? +k : null, link: link.trim() || undefined, file: stored, createdAt: new Date().toISOString() };
    await update((st) => ({ ...st, ideas: [idea, ...st.ideas] }));
    setText(''); setLink(''); setFile(null); setBusy(false);
    toast('Idea saved · Gen will see it in Ideas.md');
  };
  const open = snap.state.ideas.filter((i) => !i.used), used = snap.state.ideas.filter((i) => i.used);
  const row = (i: Idea) => <div key={i.id} className="task" style={{ alignItems: 'center' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="t" style={{ textDecoration: i.used ? 'line-through' : 'none', color: i.used ? 'var(--dim)' : undefined }}>{i.text || '(no text)'}</div>
      <div className="row small muted" style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}><KChip k={i.konzept} />{i.link && <button className="chip chip-btn" onClick={() => bb.openUrl(i.link!)}><Icon name="link" size={11} /> Link</button>}{i.file && <button className="chip chip-btn" onClick={() => bb.openVault('Ideas/files/' + i.file)}><Icon name="film" size={11} /> {i.file}</button>}<span>{new Date(i.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
    </div>
    <button className="btn sm" onClick={() => update((st) => ({ ...st, ideas: st.ideas.map((x) => (x.id === i.id ? { ...x, used: !x.used } : x)) }))}>{i.used ? 'Reopen' : 'Used'}</button>
    <button className="btn sm" aria-label="Delete idea" onClick={() => update((st) => ({ ...st, ideas: st.ideas.filter((x) => x.id !== i.id) }))}><Icon name="x" size={13} /></button>
  </div>;
  return <>
    <Header title="Idea inbox" sub="Collect ideas for the next videos." right={isDesktop ? <button className="btn" onClick={() => bb.openVault('Ideas.md')}><Icon name="folder" size={14} /> Ideas.md</button> : undefined} />
    <section className="glass card form">
      <h2>New idea</h2>
      <label className="f">Idea<textarea className="in" rows={2} placeholder="In one line, e.g. flag battle with the World Cup 2026 groups" value={text} onChange={(e) => setText(e.target.value)} /></label>
      <div className="form-row">
        <label className="f" style={{ flex: '1 1 220px' }}>Konzept<select className="in" value={k} onChange={(e) => setK(e.target.value)}><option value="">Any Konzept</option>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>Konzept {n} · {KONZEPTE[n].name}</option>)}</select></label>
        <label className="f" style={{ flex: '3 1 300px' }}>Reference link (optional)<input className="in" placeholder="TikTok video or sound link" value={link} onChange={(e) => setLink(e.target.value)} /></label>
      </div>
      <div className="f">Reference video (optional)
        <label className={`drop drop-row ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
          <span className="drop-ico"><Icon name="film" size={18} color="var(--yellow)" /></span>
          {file ? <><span style={{ flex: 1, minWidth: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name} · {(file.size / 1e6).toFixed(1)} MB</span><button className="btn sm" onClick={(e) => { e.preventDefault(); setFile(null); }}>Remove</button></>
            : <span style={{ flex: 1, color: 'var(--text)', fontWeight: 400, fontSize: 13 }}>Drop a video here, paste it with Ctrl+V, or click to choose</span>}
          <input type="file" accept="video/*,image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
        </label>
      </div>
      <div className="row"><button className="btn primary" disabled={busy} onClick={save}><Icon name="plus" size={15} /> {busy ? 'Saving…' : 'Save idea'}</button><span className="small muted">Open ideas go to Ideas.md, where Gen picks them up.</span></div>
    </section>
    <section className="glass card" style={{ gap: 0 }}>
      <h2 style={{ marginBottom: 6 }}>Open ideas · {open.length}</h2>
      {open.length ? open.map(row) : <div className="empty">No open ideas.</div>}
    </section>
    {used.length > 0 && <section className="glass card" style={{ gap: 0 }}><h2 style={{ marginBottom: 6 }}>Used</h2>{used.map(row)}</section>}
  </>;
}
