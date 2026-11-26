/* Libraries: every asset a Konzept engine can use (machines, heads, flags, weapons, bosses, shapes, boxes) + the sound library.
   Built in the vault by Engine/Libraries/build_libraries.py (re-run after every engine change to keep it current). */
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { TempLibrary, LibTabs, LIB_TAB_KEY } from './TempLibrary';
import { bb, isDesktop, type LibrariesScan, type LibItem, type LibStatus } from '../bridge';

function ReusableLibraries() {
  const { toast } = useApp();
  const [scan, setScan] = useState<LibrariesScan | null>(null);
  const [sel, setSel] = useState<string>('');
  const [q, setQ] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const load = () => (bb.libraries ? bb.libraries() : Promise.resolve({ root: '', built: 0, libraries: [] })).then((s) => { setScan(s); setSel((x) => x || s.libraries[0]?.folder || ''); }).catch(() => setScan({ root: '', built: 0, libraries: [] }));
  const [st, setSt] = useState<LibStatus | null>(null);
  useEffect(() => { load(); return () => { audio.current?.pause(); }; }, []);
  useEffect(() => { if (scan?.status) setSt(scan.status); }, [scan]);
  useEffect(() => bb.onLibrariesStatus?.((s) => { setSt(s); if (s.state === 'done') load(); }), []);
  const libs = scan?.libraries ?? [];
  const cur = libs.find((l) => l.folder === sel) ?? libs[0];
  const m = (it: LibItem) => !q || `${it.name} ${it.desc ?? ''} ${it.when ?? ''} ${it.tag ?? ''}`.toLowerCase().includes(q.toLowerCase());
  const play = (it: LibItem) => {
    if (!it.path) return;
    audio.current?.pause();
    if (playing === it.path) { setPlaying(null); return; }
    const a = new Audio(bb.fileUrl(it.path)); audio.current = a; setPlaying(it.path);
    a.onended = () => setPlaying((p) => (p === it.path ? null : p)); a.play().catch(() => { toast('Could not play sound'); setPlaying(null); });
  };
  const count = (l: typeof libs[number]) => l.kind === 'sounds' ? l.concepts.reduce((n, c) => n + c.items.filter((i) => i.file).length, 0) : l.items.length;
  const built = scan?.built ? new Date(scan.built).toLocaleString() : '';
  return <>
    <Header title="Libraries" sub={scan ? `${libs.length} libraries · ${libs.reduce((n, l) => n + count(l), 0)} items${built ? ` · built ${built}` : ''} · rebuilt automatically when an engine changes` : 'Loading…'}
      right={isDesktop ? <div className="row" style={{ gap: 6 }}>
        {st && st.state !== 'idle' && <span className={`chip ${st.state === 'error' ? 'warn' : ''}`} title={st.msg}>{st.state === 'running' ? 'Rebuilding…' : st.state === 'done' ? 'Up to date' : 'Rebuild error'}</span>}
        <button className="btn sm" disabled={st?.state === 'running'} onClick={async () => { if (bb.librariesRebuild) { setSt(await bb.librariesRebuild()); toast('Rebuilding libraries from the engines…'); } else load(); }}><Icon name="update" size={14} /> Rebuild now</button>
        <button className="btn sm" onClick={() => bb.openVault('Libraries')}><Icon name="folder" size={14} /> Open folder</button>
      </div> : undefined} />
    {!isDesktop && <div className="glass card"><div className="empty">The libraries live in the vault on the PC. Open them in the Windows launcher.</div></div>}
    {isDesktop && scan && !libs.length && <div className="glass card"><div className="empty">No libraries found in the vault folder Libraries. Build them with: python Engine\Libraries\build_libraries.py Engine Libraries</div></div>}
    {isDesktop && cur && <>
      <div className="glass card libs-bar">
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {libs.map((l) => <button key={l.folder} className={`chip chip-btn ${l.folder === cur.folder ? 'on' : ''}`} onClick={() => { setSel(l.folder); setQ(''); }}>
            <Icon name={l.kind === 'sounds' ? 'music' : 'grid'} size={12} />{l.concept ? `${l.concept} ` : ''}{l.title} <span className="dim">{count(l)}</span></button>)}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
          <p className="small dim" style={{ flex: 1, margin: 0 }}>{cur.desc}</p>
          <input className="in libs-q" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {cur.kind === 'images' && <div className="libs-grid">
        {cur.items.filter(m).map((it) => <div key={it.file ?? it.name} className="glass card libs-item" title={it.desc || it.name}>
          {it.path && <img src={bb.fileUrl(it.path)} alt={it.name} loading="lazy" />}
          <b>{it.name}</b>
          {it.tag && <span className="chip libs-tag">{it.tag}</span>}
          {it.desc && <span className="small dim">{it.desc}</span>}
        </div>)}
      </div>}
      {cur.kind === 'sounds' && <div className="libs-sounds">
        {cur.concepts.map((c) => { const its = c.items.filter(m); if (!its.length) return null; return <div key={c.id} className="glass card">
          <b className="libs-ch"><span className="ov-n">{c.id}</span>{c.name}</b>
          {its.map((it) => <div key={it.name} className="libs-snd">
            <button className="btn sm icon" disabled={!it.path} onClick={() => play(it)} aria-label={`Play ${it.name}`}><Icon name={playing === it.path ? 'pause' : 'play'} size={14} /></button>
            <div style={{ flex: 1, minWidth: 0 }}><b className="small">{it.name}</b>{it.when && <div className="small dim">{it.when}</div>}</div>
            {it.seconds ? <span className="small dim">{it.seconds.toFixed(2)} s</span> : null}
          </div>)}
        </div>; })}
      </div>}
    </>}
  </>;
}

export default function Libraries() {
  const [tab, setTab] = useState<'reuse' | 'temp'>(() => { try { const t = sessionStorage.getItem(LIB_TAB_KEY); sessionStorage.removeItem(LIB_TAB_KEY); return t === 'temp' ? 'temp' : 'reuse'; } catch { return 'reuse'; } });
  return <>
    <LibTabs tab={tab} setTab={setTab} />
    {tab === 'temp' ? <TempLibrary /> : <ReusableLibraries />}
  </>;
}
