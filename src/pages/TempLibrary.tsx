/* Temp library: one-time-use assets Mo refills (songs for K2/K4, meme packs for K3). Lives in the vault folder Inbox\.
   Automation takes the next unused item and marks it used. Low stock raises a bell notification + island alert (AutoDriver). */
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { bb, isDesktop, type InboxScan, type InboxItem } from '../bridge';


/* K4 song editor: waveform, play, drag to mark the OPEN passages (music unmuffled), hear the gate (muffled outside the passages).
   Saved as `passages` [[from, to], ...] in seconds next to the song in Inbox\K4\Songs\index.json. */
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
function SongEditor({ cid, it, onClose }: { cid: string; it: InboxItem; onClose: () => void }) {
  const { toast } = useApp();
  const cv = useRef<HTMLCanvasElement | null>(null);
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [regs, setRegs] = useState<[number, number][]>(it.passages ?? []);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gate, setGate] = useState(true);
  const [err, setErr] = useState('');
  const ctx = useRef<AudioContext | null>(null);
  const play = useRef<{ src: AudioBufferSourceNode; filt: BiquadFilterNode; t0: number; off: number } | null>(null);
  const regsRef = useRef(regs); regsRef.current = regs;
  const gateRef = useRef(gate); gateRef.current = gate;
  const dur = buf?.duration ?? 0;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const ab = await (await fetch(bb.fileUrl(it.path!))).arrayBuffer();
        const c = (ctx.current ??= new AudioContext());
        const b = await c.decodeAudioData(ab);
        if (dead) return;
        const ch = b.getChannelData(0), n = 1400, step = Math.max(1, Math.floor(ch.length / n)), pk: number[] = [];
        for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 8) m = Math.max(m, Math.abs(ch[j])); pk.push(m); }
        setBuf(b); setPeaks(pk);
      } catch (e) { setErr('Could not read this audio file'); }
    })();
    return () => { dead = true; stop(); ctx.current?.close().catch(() => {}); };
  }, []);

  const inReg = (t: number) => regsRef.current.some(([a, b]) => t >= a && t <= b);
  const stop = () => { const p = play.current; if (p) { try { p.src.onended = null; p.src.stop(); } catch { /* */ } play.current = null; } setPlaying(false); };
  const start = (off: number) => {
    if (!buf || !ctx.current) return; stop();
    const c = ctx.current; if (c.state === 'suspended') c.resume();
    const src = c.createBufferSource(); src.buffer = buf;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 20000;
    src.connect(filt); filt.connect(c.destination);
    src.start(0, Math.max(0, Math.min(off, buf.duration - 0.05)));
    src.onended = () => { play.current = null; setPlaying(false); };
    play.current = { src, filt, t0: c.currentTime, off }; setPlaying(true);
  };
  // playhead + gate: open (20 kHz) inside a passage, muffled (450 Hz) outside, like the video
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = play.current, c = ctx.current;
      if (p && c) {
        const t = p.off + (c.currentTime - p.t0); setPos(t);
        const open = !gateRef.current || inReg(t);
        p.filt.frequency.setTargetAtTime(open ? 20000 : 450, c.currentTime, 0.03);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = 120; c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    const x = (t: number) => (dur ? (t / dur) * w : 0);
    for (const [a, b] of [...regs, ...(drag ? [[Math.min(...drag), Math.max(...drag)] as [number, number]] : [])]) { g.fillStyle = 'rgba(255,198,58,.28)'; g.fillRect(x(a), 0, Math.max(2, x(b) - x(a)), h); g.fillStyle = '#FFC63A'; g.fillRect(x(a), 0, 2, h); g.fillRect(x(b) - 2, 0, 2, h); }
    peaks.forEach((p, i) => { const px = (i / peaks.length) * w, t = (i / peaks.length) * dur, hh = Math.max(1.5, p * (h - 10)); g.fillStyle = inReg(t) ? '#FFE08A' : 'rgba(170,195,240,.55)'; g.fillRect(px, (h - hh) / 2, Math.max(1, w / peaks.length - 0.5), hh); });
    g.fillStyle = '#fff'; g.fillRect(x(pos) - 1, 0, 2, h);
  }, [peaks, regs, drag, pos, dur]);

  const tAt = (e: React.MouseEvent) => { const r = cv.current!.getBoundingClientRect(); return Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur)); };
  const merge = (a: [number, number][]) => { const s = [...a].sort((x, y) => x[0] - y[0]), out: [number, number][] = []; for (const r of s) { const l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); } return out; };
  const down = (e: React.MouseEvent) => { if (!dur) return; const t = tAt(e); setDrag([t, t]); };
  const move = (e: React.MouseEvent) => { if (drag) setDrag([drag[0], tAt(e)]); };
  const up = () => {
    if (!drag) return; const [a, b] = [Math.min(...drag), Math.max(...drag)]; setDrag(null);
    if (b - a < 0.4) { setPos(a); if (play.current) start(a); else setPos(a); return; }
    setRegs((r) => merge([...r, [Math.round(a * 10) / 10, Math.round(b * 10) / 10]]));
  };
  const toggle = () => { if (playing) stop(); else start(pos >= dur - 0.2 ? 0 : pos); };
  const save = async () => { const r = await bb.inboxSetPassages?.(cid, it.file!, regs); if (r?.ok) { toast(`${r.passages?.length ?? 0} passage${r.passages?.length === 1 ? '' : 's'} saved`); } else toast(r?.error || 'Could not save'); };
  return <div className="songed" style={{ margin: '8px 0 14px', padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
    {err ? <div className="small" style={{ color: 'var(--yellow)' }}>{err}</div> : !buf ? <div className="small dim">Loading waveform…</div> : <>
      <canvas ref={cv} style={{ width: '100%', height: 120, display: 'block', cursor: 'crosshair', borderRadius: 10, background: 'rgba(0,0,0,.25)' }} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={() => drag && up()} />
      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm accent" onClick={toggle}><Icon name={playing ? 'pause' : 'play'} size={14} /> {playing ? 'Pause' : 'Play'}</button>
        <span className="small dim">{fmt(pos)} / {fmt(dur)}</span>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={gate} onChange={(e) => setGate(e.target.checked)} /> Hear the gate (muffled outside the passages)</label>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setRegs([])} disabled={!regs.length}>Clear all</button>
        <button className="btn sm accent" onClick={save}>Save passages</button>
        <button className="btn sm" onClick={() => { stop(); onClose(); }}>Close</button>
      </div>
      <p className="small dim" style={{ margin: '8px 0 4px' }}>Drag on the wave to mark a passage where the music must be open (unmuffled). Click to jump. Yellow = open, grey = muffled.</p>
      {regs.map((r, i) => <div key={i} className="row small" style={{ gap: 8, alignItems: 'center', padding: '2px 0' }}>
        <button className="btn sm icon" aria-label="Play passage" onClick={() => start(r[0])}><Icon name="play" size={12} /></button>
        <span>{fmt(r[0])} to {fmt(r[1])}</span><span className="dim">{(r[1] - r[0]).toFixed(1)} s</span>
        <button className="btn sm icon" aria-label="Delete passage" onClick={() => setRegs((x) => x.filter((_, j) => j !== i))}>✕</button>
      </div>)}
    </>}
  </div>;
}

export function TempLibrary() {
  const { toast } = useApp();
  const [scan, setScan] = useState<InboxScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
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
        {c.id === 'K4' && it.status === 'new' && !it.problem && <button className="btn sm" onClick={() => setEdit(edit === it.name ? null : it.name)}><Icon name="music" size={14} /> {it.passages?.length ? `${it.passages.length} passage${it.passages.length === 1 ? '' : 's'}` : 'Mark passages'}</button>}
        <span className={`chip ${it.status === 'used' ? '' : it.problem ? 'warn' : 'on'}`}>{it.status === 'used' ? 'used' : it.problem ? 'fix' : 'new'}</span>
      </div>)}
      {c.id === 'K4' && c.items.filter((it) => it.name === edit).map((it) => <SongEditor key={it.name} cid={c.id} it={it} onClose={() => setEdit(null)} />)}
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
