/* Temp library: one-time-use assets Mo refills (songs for K2/K4, meme packs for K3). Lives in the vault folder Inbox\.
   Automation takes the next unused item and marks it used. Low stock raises a bell notification + island alert (AutoDriver). */
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { bb, isDesktop, type InboxScan, type InboxItem } from '../bridge';


/* K4 song editor: waveform with zoom, play, drag to mark the OPEN passages (music unmuffled), hear the gate (muffled outside the passages).
   Precise: wheel = zoom, drag edges to adjust, type exact seconds, nudge 0.01 s, I / O keys mark in/out at the playhead.
   Saved as `passages` [[from, to], ...] in seconds next to the song in Inbox\K4\Songs\index.json. */
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const r2 = (t: number) => Math.round(t * 100) / 100;
type Reg = [number, number];
function SongEditor({ cid, it, onClose }: { cid: string; it: InboxItem; onClose: () => void }) {
  const { toast } = useApp();
  const cv = useRef<HTMLCanvasElement | null>(null);
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [regs, setRegs] = useState<Reg[]>(it.passages ?? []);
  const [view, setView] = useState<[number, number]>([0, 0]);               // visible window in seconds
  const [drag, setDrag] = useState<{ kind: 'new' | 'edge' | 'pan'; i?: number; side?: 0 | 1; a: number; b: number } | null>(null);
  const [hover, setHover] = useState<string>('crosshair');
  const [inMark, setInMark] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gate, setGate] = useState(true);
  const [err, setErr] = useState('');
  const [vol, setVol] = useState(() => { try { const v = parseFloat(localStorage.getItem('bb.songVol') || ''); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; } catch { return 0.8; } });
  const volRef = useRef(vol); volRef.current = vol;
  const ctx = useRef<AudioContext | null>(null);
  const play = useRef<{ src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode; t0: number; off: number } | null>(null);
  const regsRef = useRef(regs); regsRef.current = regs;
  const gateRef = useRef(gate); gateRef.current = gate;
  const dur = buf?.duration ?? 0;
  const [v0, v1] = view[1] > view[0] ? view : [0, dur];

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const ab = await (await fetch(bb.fileUrl(it.path!))).arrayBuffer();
        const c = (ctx.current ??= new AudioContext());
        const b = await c.decodeAudioData(ab);
        if (dead) return;
        setBuf(b); setView([0, b.duration]);
      } catch { setErr('Could not read this audio file'); }
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
    const gain = c.createGain(); gain.gain.value = volRef.current * volRef.current;
    src.connect(filt); filt.connect(gain); gain.connect(c.destination);
    src.start(0, Math.max(0, Math.min(off, buf.duration - 0.05)));
    src.onended = () => { play.current = null; setPlaying(false); };
    play.current = { src, filt, gain, t0: c.currentTime, off }; setPlaying(true);
  };
  // playhead + gate: open (20 kHz) inside a passage, muffled (450 Hz) outside, like the video
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = play.current, c = ctx.current;
      if (p && c) {
        const t = p.off + (c.currentTime - p.t0); setPos(t);
        const open = !gateRef.current || inReg(t);
        p.filt.frequency.setTargetAtTime(open ? 20000 : 450, c.currentTime, 0.015);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);

  const tOf = (clientX: number) => { const r = cv.current!.getBoundingClientRect(); return Math.max(0, Math.min(dur, v0 + ((clientX - r.left) / r.width) * (v1 - v0))); };
  const xOf = (t: number, w: number) => ((t - v0) / (v1 - v0)) * w;

  useEffect(() => {
    const c = cv.current; if (!c || !buf) return;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = 150; c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    // ruler
    const span = v1 - v0, steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60], tick = steps.find((x) => (x / span) * w >= 70) ?? 60;
    g.font = '10px sans-serif'; g.textBaseline = 'top';
    for (let t = Math.ceil(v0 / tick) * tick; t <= v1; t += tick) { const x = xOf(t, w); g.fillStyle = 'rgba(170,195,240,.25)'; g.fillRect(x, 0, 1, h); g.fillStyle = 'rgba(244,246,255,.7)'; g.fillText(fmt(t), x + 3, 2); }
    // regions
    const regsNow: Reg[] = regs.map((r, i) => (drag && drag.kind === 'edge' && drag.i === i ? [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)] : r) as Reg);
    if (drag && drag.kind === 'new') regsNow.push([Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)]);
    for (const [a, b] of regsNow) { const xa = xOf(a, w), xb = xOf(b, w); g.fillStyle = 'rgba(255,198,58,.26)'; g.fillRect(xa, 0, Math.max(2, xb - xa), h); g.fillStyle = '#FFC63A'; g.fillRect(xa - 1, 0, 3, h); g.fillRect(xb - 2, 0, 3, h); }
    if (inMark != null) { g.fillStyle = '#7CF'; g.fillRect(xOf(inMark, w), 0, 2, h); }
    // waveform: per pixel max over the visible samples
    const ch = buf.getChannelData(0), sr = buf.sampleRate;
    for (let px = 0; px < w; px++) {
      const t0 = v0 + (px / w) * span, t1 = v0 + ((px + 1) / w) * span;
      const i0 = Math.floor(t0 * sr), i1 = Math.min(ch.length, Math.ceil(t1 * sr)), st = Math.max(1, Math.floor((i1 - i0) / 24));
      let mx = 0; for (let i = i0; i < i1; i += st) { const a = Math.abs(ch[i]); if (a > mx) mx = a; }
      const hh = Math.max(1.5, mx * (h - 26)); g.fillStyle = inReg((t0 + t1) / 2) ? '#FFE08A' : 'rgba(170,195,240,.6)'; g.fillRect(px, 16 + (h - 16 - hh) / 2, 1, hh);
    }
    g.fillStyle = '#fff'; g.fillRect(xOf(pos, w) - 1, 0, 2, h);
  }, [buf, view, regs, drag, pos, inMark]);

  const hit = (clientX: number): { i: number; side: 0 | 1 } | null => {
    const r = cv.current!.getBoundingClientRect(), w = r.width;
    for (let i = 0; i < regsRef.current.length; i++) for (const side of [0, 1] as const) if (Math.abs(xOf(regsRef.current[i][side], w) - (clientX - r.left)) <= 7) return { i, side };
    return null;
  };
  const merge = (a: Reg[]) => { const s2 = [...a].sort((x, y) => x[0] - y[0]), out: Reg[] = []; for (const r of s2) { const l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); } return out; };
  const down = (e: React.MouseEvent) => {
    if (!dur) return; const t = tOf(e.clientX);
    if (e.button === 1 || e.altKey) { setDrag({ kind: 'pan', a: e.clientX, b: v0 }); return; }
    const h2 = hit(e.clientX); if (h2) { setDrag({ kind: 'edge', i: h2.i, side: h2.side, a: regsRef.current[h2.i][0], b: regsRef.current[h2.i][1] }); return; }
    setDrag({ kind: 'new', a: t, b: t });
  };
  const move = (e: React.MouseEvent) => {
    if (!drag) { setHover(hit(e.clientX) ? 'ew-resize' : 'crosshair'); return; }
    const t = tOf(e.clientX);
    if (drag.kind === 'new') setDrag({ ...drag, b: t });
    else if (drag.kind === 'edge') setDrag(drag.side === 0 ? { ...drag, a: Math.min(t, drag.b) } : { ...drag, b: Math.max(t, drag.a) });
    else { const r = cv.current!.getBoundingClientRect(), dt = ((drag.a - e.clientX) / r.width) * (v1 - v0), s0 = Math.max(0, Math.min(dur - (v1 - v0), drag.b + dt)); setView([s0, s0 + (v1 - v0)]); }
  };
  const up = () => {
    if (!drag) return; const d = drag; setDrag(null);
    if (d.kind === 'pan') return;
    if (d.kind === 'edge') { setRegs((rs) => merge(rs.map((r, i): Reg => (i === d.i ? [r2(Math.min(d.a, d.b)), r2(Math.max(d.a, d.b))] : r)).filter((r) => r[1] - r[0] >= 0.05))); return; }
    const [a, b] = [Math.min(d.a, d.b), Math.max(d.a, d.b)];
    const minLen = 4 * ((v1 - v0) / (cv.current?.clientWidth || 800));
    if (b - a < Math.max(0.05, minLen)) { seek(a); return; }
    setRegs((rs) => merge([...rs, [r2(a), r2(b)]]));
  };
  const wheel = (e: React.WheelEvent) => {
    if (!dur) return; const t = tOf(e.clientX), f = e.deltaY < 0 ? 0.8 : 1.25, len = Math.max(0.05, Math.min(dur, (v1 - v0) * f));
    const frac = (t - v0) / (v1 - v0), s0 = Math.max(0, Math.min(dur - len, t - frac * len)); setView([s0, s0 + len]);
  };
  const zoomBy = (f: number) => { const mid = pos >= v0 && pos <= v1 ? pos : (v0 + v1) / 2, len = Math.max(0.05, Math.min(dur, (v1 - v0) * f)), frac = (mid - v0) / (v1 - v0), s0 = Math.max(0, Math.min(dur - len, mid - frac * len)); setView([s0, s0 + len]); };
  const setVolume = (v: number) => { setVol(v); try { localStorage.setItem('bb.songVol', String(v)); } catch { /* */ } const p = play.current, c = ctx.current; if (p && c) p.gain.gain.setTargetAtTime(v * v, c.currentTime, 0.02); };
  const seek = (t: number) => { const n = Math.max(0, Math.min(dur, t)); setPos(n); if (play.current) start(n); };
  const toggle = () => { if (playing) stop(); else start(pos >= dur - 0.2 ? 0 : pos); };
  const markIn = () => setInMark(r2(pos));
  const markOut = () => { if (inMark == null) { toast('Press I (or Mark in) first'); return; } const a = Math.min(inMark, pos), b = Math.max(inMark, pos); if (b - a < 0.05) return; setRegs((rs) => merge([...rs, [r2(a), r2(b)]])); setInMark(null); };
  const setReg = (i: number, side: 0 | 1, v: number) => setRegs((rs) => rs.map((r, j) => { if (j !== i) return r; const n: Reg = [r[0], r[1]]; n[side] = r2(Math.max(0, Math.min(dur, v))); return n[0] < n[1] ? n : r; }));
  const key = (e: React.KeyboardEvent) => {
    const tg = e.target as HTMLInputElement; if (tg.tagName === 'INPUT' && (tg.type === 'number' || (tg.type === 'range' && e.key.startsWith('Arrow')))) return;
    const k = e.key.toLowerCase(), big = e.shiftKey ? 15 : e.ctrlKey ? 0.1 : 5;
    if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'arrowleft') { e.preventDefault(); seek(pos - (e.altKey ? 0.01 : big)); } else if (k === 'arrowright') { e.preventDefault(); seek(pos + (e.altKey ? 0.01 : big)); }
    else if (k === 'arrowup') { e.preventDefault(); setVolume(Math.min(1, vol + 0.05)); } else if (k === 'arrowdown') { e.preventDefault(); setVolume(Math.max(0, vol - 0.05)); }
    else if (k === 'i') markIn(); else if (k === 'o') markOut(); else if (k === 'f') setView([0, dur]);
  };
  const save = async () => { const r = await bb.inboxSetPassages?.(cid, it.file!, regs); if (r?.ok) toast(`${r.passages?.length ?? 0} passage${r.passages?.length === 1 ? '' : 's'} saved`); else toast(r?.error || 'Could not save'); };
  const zoomed = dur > 0 && v1 - v0 < dur - 0.01;
  return <div className="songed" tabIndex={0} onKeyDown={key} style={{ outline: 'none', margin: '8px 0 14px', padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
    {err ? <div className="small" style={{ color: 'var(--yellow)' }}>{err}</div> : !buf ? <div className="small dim">Loading waveform…</div> : <>
      <canvas ref={cv} style={{ width: '100%', height: 150, display: 'block', cursor: drag?.kind === 'pan' ? 'grabbing' : hover, borderRadius: 10, background: 'rgba(0,0,0,.25)' }} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={() => drag && up()} onWheel={wheel} />
      {zoomed && <input type="range" className="songed-range" min={0} max={Math.max(0.01, dur - (v1 - v0))} step={0.01} value={v0} onChange={(e) => { const s0 = parseFloat(e.target.value); setView([s0, s0 + (v1 - v0)]); }} aria-label="Scroll the zoomed view" style={{ width: '100%', marginTop: 8, ['--p' as string]: `${(v0 / Math.max(0.01, dur - (v1 - v0))) * 100}%` }} />}
      <div className="songed-tl" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <span className="small dim" style={{ width: 52 }}>{fmt(pos)}</span>
        <input type="range" className="songed-range" min={0} max={dur} step={0.01} value={Math.min(pos, dur)} onChange={(e) => seek(parseFloat(e.target.value))} aria-label="Timeline" style={{ flex: 1, ['--p' as string]: `${dur ? (pos / dur) * 100 : 0}%` }} />
        <span className="small dim" style={{ width: 52, textAlign: 'right' }}>{fmt(dur)}</span>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => seek(pos - 5)} title="Back 5 s (Left)">-5 s</button>
        <button className="btn sm" onClick={() => seek(pos - 0.1)} title="Back 0.1 s (Ctrl+Left)">-0.1</button>
        <button className="btn sm accent" onClick={toggle} title="Space"><Icon name={playing ? 'pause' : 'play'} size={14} /> {playing ? 'Pause' : 'Play'}</button>
        <button className="btn sm" onClick={() => seek(pos + 0.1)} title="Forward 0.1 s (Ctrl+Right)">+0.1</button>
        <button className="btn sm" onClick={() => seek(pos + 5)} title="Forward 5 s (Right)">+5 s</button>
        <span className="row small" style={{ gap: 6, alignItems: 'center' }}><Icon name={vol === 0 ? 'mute' : 'vol'} size={14} /><input type="range" className="songed-range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVolume(parseFloat(e.target.value))} aria-label="Volume" style={{ width: 110, ['--p' as string]: `${vol * 100}%` }} />{Math.round(vol * 100)}%</span>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={gate} onChange={(e) => setGate(e.target.checked)} /> Hear the gate</label>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => zoomBy(0.5)} title="Zoom in (mouse wheel)">Zoom +</button>
        <button className="btn sm" onClick={() => zoomBy(2)} title="Zoom out (mouse wheel)">Zoom -</button>
        <button className="btn sm" onClick={() => setView([0, dur])} title="Fit whole song (F)">Fit</button>
        <span className="small dim">{(v1 - v0).toFixed(2)} s visible</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={markIn} title="I">{inMark != null ? `In ${fmt(inMark)}` : 'Mark in (I)'}</button>
        <button className="btn sm" onClick={markOut} title="O">Mark out (O)</button>
        <button className="btn sm" onClick={() => setRegs([])} disabled={!regs.length}>Clear all</button>
        <button className="btn sm accent" onClick={save}>Save passages</button>
        <button className="btn sm" onClick={() => { stop(); onClose(); }}>Close</button>
      </div>
      <p className="small dim" style={{ margin: '8px 0 4px' }}>Drag on the wave = new open passage. Drag a yellow edge = adjust. Wheel = zoom, Alt+drag = scroll. Click = jump. Keys: Space play, Left/Right 5 s (Ctrl 0.1 s, Alt 0.01 s, Shift 15 s), I / O mark in/out at the playhead, F fit, Up/Down volume. Yellow = open, grey = muffled.</p>
      {regs.map((r, i) => <div key={i} className="row small" style={{ gap: 6, alignItems: 'center', padding: '3px 0', flexWrap: 'wrap' }}>
        <button className="btn sm icon" aria-label="Play passage" title="Play from 0.5 s before" onClick={() => start(Math.max(0, r[0] - 0.5))}><Icon name="play" size={12} /></button>
        {([0, 1] as const).map((side) => <span key={side} className="row" style={{ gap: 3, alignItems: 'center' }}>
          <span className="dim">{side ? 'to' : 'from'}</span>
          <button className="btn sm icon" onClick={() => setReg(i, side, r[side] - 0.01)} title="-0.01 s">-</button>
          <input className="in" type="number" step={0.01} min={0} max={dur} value={r[side]} style={{ width: 84 }} onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) setReg(i, side, v); }} />
          <button className="btn sm icon" onClick={() => setReg(i, side, r[side] + 0.01)} title="+0.01 s">+</button>
          <button className="btn sm" onClick={() => setReg(i, side, pos)} title="Set to the playhead">playhead</button>
        </span>)}
        <span className="dim">{(r[1] - r[0]).toFixed(2)} s</span>
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
        <b style={{ flex: 1 }}><span className="ov-n" style={{ marginRight: 8 }}>{c.id}</span>{c.title}</b>
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
