import React, { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { kColor, KONZEPTE, uid } from '../logic';
import { Header } from './parts';
import { Icon, KChip } from '../ui';
import { bb, isDesktop } from '../bridge';
import type { Idea } from '../types';
import { Player } from '../player';

const KNUMS = Object.keys(KONZEPTE).map(Number);
/** Konzept picker: any, an existing Konzept, or a brand-new one */
function KSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <select className="in" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">Any Konzept</option>
    <option value="new">✦ New Konzept (NewStyle)</option>
    {KNUMS.map((n) => <option key={n} value={n}>Konzept {n} · {KONZEPTE[n].name}</option>)}
  </select>;
}
const kVal = (i: Pick<Idea, 'konzept' | 'newKonzept'>) => (i.newKonzept ? 'new' : i.konzept ? String(i.konzept) : '');
const kFields = (v: string) => ({ konzept: v && v !== 'new' ? +v : null, newKonzept: v === 'new' || undefined });
function IdeaK({ i }: { i: Idea }) {
  return i.newKonzept ? <span className="chip" style={{ background: 'rgba(255,198,58,.18)', color: 'var(--yellow-text)' }}>✦ New Konzept</span> : <KChip k={i.konzept} />;
}

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
    const idea: Idea = { id: uid(), text: text.trim(), ...kFields(k), link: link.trim() || undefined, file: stored, createdAt: new Date().toISOString() };
    await update((st) => ({ ...st, ideas: [idea, ...st.ideas] }));
    setText(''); setLink(''); setK(''); setFile(null); setBusy(false);
    toast('Idea saved · Gen will see it in Ideas/Ideas.md');
  };
  const [edit, setEdit] = useState<{ id: string; text: string; k: string; link: string } | null>(null);
  const saveEdit = async () => {
    if (!edit) return;
    await update((st) => ({ ...st, ideas: st.ideas.map((x) => (x.id === edit.id ? { ...x, text: edit.text.trim(), link: edit.link.trim() || undefined, ...kFields(edit.k) } : x)) }));
    setEdit(null); toast('Idea updated');
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const sep = snap.vaultPath.includes('\\') ? '\\' : '/';
  const filePath = (f: string) => [snap.vaultPath, 'Ideas', 'files', f].join(sep);
  const tiktokId = (l?: string) => l?.match(/tiktok\.com\/.*\/video\/(\d+)/)?.[1];
  const hasMedia = (i: Idea) => !!(i.file || tiktokId(i.link));
  const [seen, setSeen] = useState<Set<string>>(new Set()); // mounted players stay mounted so folding up animates
  const toggleOpen = (id: string) => { setSeen((x) => new Set(x).add(id)); setOpenId(openId === id ? null : id); };
  const setMarkers = (id: string, m: Idea['markers']) => update((st) => ({ ...st, ideas: st.ideas.map((x) => (x.id === id ? { ...x, markers: m } : x)) }));
  const media = (i: Idea) => {
    const tid = tiktokId(i.link), on = openId === i.id;
    return <div className={`fold ${on ? 'open' : ''}`} aria-hidden={!on}><div className="fold-in"><div className="idea-media">
      {i.file && (isDesktop ? (/\.(png|jpe?g|webp|gif)$/i.test(i.file)
        ? <img src={bb.fileUrl(filePath(i.file))} alt="" />
        : <Player src={bb.fileUrl(filePath(i.file))} active={on} markers={i.markers ?? []} onMarkers={(m) => setMarkers(i.id, m)} />)
        : <div className="empty">The video is stored on the PC. Open the idea in the PC launcher to watch it.</div>)}
      {tid && on && <iframe src={`https://www.tiktok.com/embed/v2/${tid}`} title="TikTok reference" allow="autoplay; encrypted-media; fullscreen" />}
    </div></div></div>;
  };
  const open = snap.state.ideas.filter((i) => !i.used), used = snap.state.ideas.filter((i) => i.used);
  const row = (i: Idea) => edit?.id === i.id ? <div key={i.id} className="task idea-edit" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
    <textarea className="in" rows={2} value={edit.text} autoFocus onChange={(e) => setEdit({ ...edit, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(); if (e.key === 'Escape') setEdit(null); }} />
    <div className="form-row">
      <label className="f" style={{ flex: '1 1 220px' }}>Konzept<KSelect value={edit.k} onChange={(v) => setEdit({ ...edit, k: v })} /></label>
      <label className="f" style={{ flex: '3 1 260px' }}>Reference link<input className="in" value={edit.link} onChange={(e) => setEdit({ ...edit, link: e.target.value })} placeholder="TikTok video or sound link" /></label>
    </div>
    <div className="row"><button className="btn primary sm" onClick={saveEdit}><Icon name="check" size={14} /> Save</button><button className="btn sm" onClick={() => setEdit(null)}>Cancel</button><span className="small dim">Ctrl+Enter saves · Esc cancels</span></div>
  </div> : <div key={i.id} className={`task idea-row ${openId === i.id ? 'open' : ''}`} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
    <div style={{ flex: 1, minWidth: 0, cursor: hasMedia(i) ? 'pointer' : undefined }} onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; if (hasMedia(i)) toggleOpen(i.id); }} title={hasMedia(i) ? (openId === i.id ? 'Fold up' : 'Click to watch the reference') : undefined}>
      <div className="t" style={{ textDecoration: i.used ? 'line-through' : 'none', color: i.used ? 'var(--dim)' : undefined }}>{i.text || '(no text)'}</div>
      <div className="row small muted" style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}><IdeaK i={i} />{i.link && <button className="chip chip-btn" onClick={() => bb.openUrl(i.link!)}><Icon name="link" size={11} /> Link</button>}{i.file && <button className="chip chip-btn" onClick={() => toggleOpen(i.id)}><Icon name="film" size={11} /> {i.file}</button>}<span>{new Date(i.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
    </div>
    <button className="btn sm icon" title="Edit idea" aria-label="Edit idea" onClick={() => setEdit({ id: i.id, text: i.text, k: kVal(i), link: i.link ?? '' })}><Icon name="pen" size={13} /></button>
    <button className="btn sm" onClick={() => update((st) => ({ ...st, ideas: st.ideas.map((x) => (x.id === i.id ? { ...x, used: !x.used } : x)) }))}>{i.used ? 'Reopen' : 'Used'}</button>
    <button className="btn sm" aria-label="Delete idea" onClick={() => update((st) => ({ ...st, ideas: st.ideas.filter((x) => x.id !== i.id) }))}><Icon name="x" size={13} /></button>
    {hasMedia(i) && <button className={`btn sm icon chev ${openId === i.id ? 'up' : ''}`} aria-label={openId === i.id ? 'Hide video' : 'Show video'} title={openId === i.id ? 'Hide video' : 'Watch video'} onClick={() => toggleOpen(i.id)}><Icon name="play" size={12} /></button>}
    {hasMedia(i) && (seen.has(i.id) || openId === i.id) && media(i)}
  </div>;
  return <>
    <Header title="Idea inbox" sub="Collect ideas for the next videos." right={isDesktop ? <button className="btn" onClick={() => bb.openVault('Ideas/Ideas.md')}><Icon name="folder" size={14} /> Ideas.md</button> : undefined} />
    <section className="glass card form">
      <h2>New idea</h2>
      <label className="f">Idea<textarea className="in" rows={2} placeholder="In one line, e.g. flag battle with the World Cup 2026 groups" value={text} onChange={(e) => setText(e.target.value)} /></label>
      <div className="form-row">
        <label className="f" style={{ flex: '1 1 220px' }}>Konzept<KSelect value={k} onChange={setK} /></label>
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
      <div className="row"><button className="btn primary" disabled={busy} onClick={save}><Icon name="plus" size={15} /> {busy ? 'Saving…' : 'Save idea'}</button><span className="small muted">Open ideas go to Ideas/Ideas.md, where Gen picks them up.</span></div>
    </section>
    <section className="glass card" style={{ gap: 0 }}>
      <h2 style={{ marginBottom: 6 }}>Open ideas · {open.length}</h2>
      {open.length ? open.map(row) : <div className="empty">No open ideas.</div>}
    </section>
    {used.length > 0 && <section className="glass card" style={{ gap: 0 }}><h2 style={{ marginBottom: 6 }}>Used</h2>{used.map(row)}</section>}
  </>;
}
