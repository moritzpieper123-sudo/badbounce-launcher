/* Temp library: one-time-use assets Mo refills (songs for K2/K4, meme packs for K3). Lives in the vault folder Inbox\.
   Automation takes the next unused item and marks it used. Low stock raises a bell notification + island alert (AutoDriver). */
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { bb, isDesktop, type InboxScan, type InboxItem } from '../bridge';

export function TempLibrary() {
  const { toast } = useApp();
  const [scan, setScan] = useState<InboxScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const load = () => (bb.inbox ? bb.inbox() : Promise.resolve(null)).then(setScan).catch(() => setScan(null));
  useEffect(() => { load(); const off = bb.onInboxChanged?.(load); return () => { off?.(); audio.current?.pause(); }; }, []);
  const refresh = async () => { if (!bb.inboxRefresh) return; setBusy(true); try { setScan(await bb.inboxRefresh()); } finally { setBusy(false); } };
  const play = (it: InboxItem) => {
    if (!it.path) return; audio.current?.pause();
    if (playing === it.path) { setPlaying(null); return; }
    const a = new Audio(bb.fileUrl(it.path)); audio.current = a; setPlaying(it.path);
    a.onended = () => setPlaying((p) => (p === it.path ? null : p)); a.play().catch(() => { toast('Could not play this file'); setPlaying(null); });
  };
  const total = scan?.cats.reduce((n, c) => n + c.left, 0) ?? 0;
  return <>
    <Header title="Temp library" sub={scan ? `${total} unused items · one-time use, refill it · the automation takes the next unused item` : 'Loading…'}
      right={isDesktop ? <div className="row" style={{ gap: 6 }}>
        <button className="btn sm" disabled={busy} onClick={refresh}><Icon name="update" size={14} /> {busy ? 'Checking…' : 'Check now'}</button>
        <button className="btn sm" onClick={() => bb.openVault('Inbox')}><Icon name="folder" size={14} /> Open folder</button>
      </div> : undefined} />
    {!isDesktop && <div className="glass card"><div className="empty">The temp library lives in the vault on the PC. Open it in the Windows launcher.</div></div>}
    {isDesktop && scan && !scan.exists && <div className="glass card"><div className="empty">The vault folder Inbox (with inbox.py) was not found.</div></div>}
    {isDesktop && scan?.exists && scan.cats.map((c) => <div key={c.id} className="glass card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ flex: 1 }}><span className="ov-n">{c.id}</span>{c.title}</b>
        <span className={`chip ${c.low ? 'warn' : ''}`}>{c.left} left{c.low ? ' · running low' : ''}</span>
        <span className="chip">{c.used} used</span>
        {c.kind === 'song' && <button className="btn sm accent" onClick={async () => { const r = await bb.inboxAdd?.(c.id); if (r?.ok) { toast(`${r.added} song${r.added === 1 ? '' : 's'} added`); setTimeout(load, 1500); } else if (r && r.error !== 'cancelled') toast(r.error || 'Could not add'); }}><Icon name="upload" size={14} /> Add songs</button>}
        {c.kind === 'pack' && <>
          <input className="in" style={{ width: 150 }} placeholder="Theme name, e.g. Cats" value={theme} onChange={(e) => setTheme(e.target.value)} />
          <button className="btn sm accent" onClick={async () => { const r = await bb.inboxNewPack?.(theme); if (r?.ok) { setTheme(''); toast('Pack folder created: add 01-08 images + merge sound'); } else toast(r?.error || 'Could not create'); }}><Icon name="folder" size={14} /> New pack</button>
        </>}
      </div>
      <p className="small dim" style={{ margin: '8px 0' }}>{c.kind === 'song' ? 'mp3 / wav / m4a. The best section is found automatically. Each song is used once.' : 'One folder per video theme: images 01.png to 08.png (smallest to king) and one merge sound named merge.mp3. Each pack is used once.'}</p>
      {!c.items.length && <div className="small dim">Empty. {c.kind === 'song' ? 'Add songs' : 'Create a pack'} to keep the automation running.</div>}
      {c.items.map((it) => <div key={it.name} className="libs-snd" title={it.problem || ''}>
        {c.kind === 'song' ? <button className="btn sm icon" onClick={() => play(it)} aria-label={`Play ${it.name}`}><Icon name={playing === it.path ? 'pause' : 'play'} size={14} /></button>
          : it.path ? <img src={bb.fileUrl(it.path)} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} /> : <span style={{ width: 34 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="small">{it.name}</b>
          <div className="small dim">{it.problem ? <span style={{ color: 'var(--yellow)' }}>{it.problem}</span> : it.status === 'used' ? `used ${it.usedOn ?? ''}${it.video ? ` in video ${it.video}` : ''}` : c.kind === 'song' ? (it.start != null ? `unused · best section from ${Math.floor(it.start / 60)}:${String(it.start % 60).padStart(2, '0')}` : 'unused') : `unused · ${it.images?.length ?? 0} images${it.sound ? ' + sound' : ''}`}</div>
        </div>
        <span className={`chip ${it.status === 'used' ? '' : it.problem ? 'warn' : 'on'}`}>{it.status === 'used' ? 'used' : it.problem ? 'fix' : 'new'}</span>
      </div>)}
    </div>)}
  </>;
}

/* Category switch shown at the top of the Libraries page: reusable assets vs one-time (temp) assets, with a warning dot when stock is low. */
export const LIB_TAB_KEY = 'bb.libTab';
export function LibTabs({ tab, setTab }: { tab: 'reuse' | 'temp'; setTab: (t: 'reuse' | 'temp') => void }) {
  const [low, setLow] = useState(0);
  useEffect(() => {
    const f = () => bb.inbox?.().then((s) => setLow(s?.exists ? s.cats.filter((c) => c.low).length : 0)).catch(() => {});
    f(); return bb.onInboxChanged?.(f);
  }, []);
  return <div className={`libsw ${tab}`} role="tablist">
    <span className="libsw-glow" aria-hidden="true" />
    <button role="tab" aria-selected={tab === 'reuse'} className={`libsw-btn ${tab === 'reuse' ? 'on' : ''}`} onClick={() => setTab('reuse')}>
      <span className="libsw-ico"><Icon name="grid" size={22} /></span>
      <span className="libsw-txt"><b>Perma</b><small>Reusable assets, fill once</small></span>
    </button>
    {isDesktop && <button role="tab" aria-selected={tab === 'temp'} className={`libsw-btn ${tab === 'temp' ? 'on' : ''}`} onClick={() => setTab('temp')}>
      <span className="libsw-ico"><Icon name="update" size={22} /></span>
      <span className="libsw-txt"><b>Temp</b><small>One-time songs + meme packs, refill</small></span>
      {low > 0 && <span className="libsw-low">{low} low</span>}
    </button>}
  </div>;
}
