/* Video player in the launcher look: glass controls, a timeline with markers, and markers with notes. */
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { uid } from './logic';

export interface Marker { id: string; t: number; note?: string }
const fmt = (s: number) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
const COLORS = ['#FFC63A', '#AAC3F0', '#7FD9A8', '#FF8F7A', '#C9A7F5', '#5FD3E0'];

export function Player({ src, active, markers, onMarkers }: { src: string; active: boolean; markers: Marker[]; onMarkers: (m: Marker[]) => void }) {
  const v = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0); const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false); const [muted, setMuted] = useState(false); const [rate, setRate] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const sorted = [...markers].sort((a, b) => a.t - b.t);
  // pause when folded away, play when opened
  useEffect(() => { const el = v.current; if (!el) return; if (active) el.play().catch(() => {}); else el.pause(); }, [active]);
  useEffect(() => { const el = v.current; if (!el) return; let raf = 0; const loop = () => { setT(el.currentTime); raf = requestAnimationFrame(loop); }; if (playing) raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, [playing]);
  const seekTo = (s: number) => { const el = v.current; if (!el) return; el.currentTime = Math.max(0, Math.min(dur || 0, s)); setT(el.currentTime); };
  const at = (x: number) => { const r = bar.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * (dur || 0); };
  const toggle = () => { const el = v.current; if (!el) return; if (el.paused) el.play(); else el.pause(); };
  const add = (withNote: boolean) => { const m: Marker = { id: uid(), t: v.current?.currentTime ?? t }; onMarkers([...markers, m]); if (withNote) { v.current?.pause(); setEditing(m.id); } };
  const upd = (id: string, note: string) => onMarkers(markers.map((m) => (m.id === id ? { ...m, note } : m)));
  const del = (id: string) => onMarkers(markers.filter((m) => m.id !== id));
  const step = (dir: 1 | -1) => { const list = dir > 0 ? sorted.filter((m) => m.t > t + 0.05) : sorted.filter((m) => m.t < t - 0.3).reverse(); if (list[0]) seekTo(list[0].t); };
  const keys = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'm') add(e.shiftKey);
    else if (k === 'n') add(true);
    else if (e.key === 'ArrowRight') seekTo(t + (e.shiftKey ? 1 / 30 : 2));
    else if (e.key === 'ArrowLeft') seekTo(t - (e.shiftKey ? 1 / 30 : 2));
    else if (k === '.') step(1); else if (k === ',') step(-1);
  };
  const colorOf = (m: Marker) => COLORS[sorted.indexOf(m) % COLORS.length];
  return <div className="vp" tabIndex={0} onKeyDown={keys}>
    <div className="vp-stage" onClick={toggle}>
      <video ref={v} src={src} playsInline loop muted={muted}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setT(v.current?.currentTime ?? 0); }} onSeeked={() => setT(v.current?.currentTime ?? 0)} />
      {!playing && <span className="vp-big"><Icon name="play" size={26} color="#0B1124" /></span>}
      {sorted.filter((m) => m.note && Math.abs(m.t - t) < 0.6).map((m) => <span key={m.id} className="vp-pop" style={{ borderColor: colorOf(m) }}>{m.note}</span>)}
    </div>
    <div className="vp-ctl glass">
      <div className="vp-line"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag(true); seekTo(at(e.clientX)); }}
        onPointerMove={(e) => { setHover(at(e.clientX)); if (drag) seekTo(at(e.clientX)); }}
        onPointerUp={() => setDrag(false)} onPointerLeave={() => setHover(null)}>
        <div className="vp-track" ref={bar}>
          <div className="vp-fill" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} />
          {sorted.map((m) => <button key={m.id} className={`vp-mk ${m.note ? 'note' : ''}`} style={{ left: `${dur ? (m.t / dur) * 100 : 0}%`, background: colorOf(m) }} title={`${fmt(m.t)}${m.note ? ' · ' + m.note : ''}`}
            onPointerDown={(e) => { e.stopPropagation(); seekTo(m.t); }} />)}
          <span className="vp-head" style={{ left: `${dur ? (t / dur) * 100 : 0}%` }} />
          {hover != null && <span className="vp-tip" style={{ left: `${dur ? (hover / dur) * 100 : 0}%` }}>{fmt(hover)}</span>}
        </div>
      </div>
      <div className="vp-row">
        <button className="vp-btn" onClick={() => step(-1)} title="Previous marker (,)"><Icon name="skipb" size={14} /></button>
        <button className="vp-btn play" onClick={toggle} title="Play / pause (Space)"><Icon name={playing ? 'pause' : 'play'} size={16} color="#0B1124" /></button>
        <button className="vp-btn" onClick={() => step(1)} title="Next marker (.)"><Icon name="skipf" size={14} /></button>
        <span className="vp-time num">{fmt(t)} <i>/ {fmt(dur)}</i></span>
        <span style={{ flex: 1 }} />
        <button className="vp-btn" onClick={() => { const r = rate === 1 ? 0.5 : rate === 0.5 ? 0.25 : 1; setRate(r); if (v.current) v.current.playbackRate = r; }} title="Speed (slow motion)"><b className="num" style={{ fontSize: 11 }}>{rate}×</b></button>
        <button className="vp-btn" onClick={() => setMuted(!muted)} title={muted ? 'Sound on' : 'Mute'}><Icon name={muted ? 'mute' : 'vol'} size={15} /></button>
        <button className="vp-btn" onClick={() => v.current?.requestFullscreen?.()} title="Fullscreen"><Icon name="expand" size={14} /></button>
      </div>
      <div className="vp-row vp-row2">
        <button className="vp-add" onClick={() => add(false)} title="Set a marker here (M)"><Icon name="flag" size={14} /> Marker</button>
        <button className="vp-add y" onClick={() => add(true)} title="Marker with a note (N)"><Icon name="pen" size={14} /> Note</button>
        {sorted.length > 0 && <span className="small dim vp-count">{sorted.length} marker{sorted.length > 1 ? 's' : ''}</span>}
      </div>
    </div>
    {sorted.length > 0 && <div className="vp-list">
      {sorted.map((m) => <div key={m.id} className={`vp-li ${Math.abs(m.t - t) < 0.6 ? 'now' : ''}`}>
        <button className="vp-chip num" style={{ ['--c' as string]: colorOf(m) }} onClick={() => seekTo(m.t)} title="Jump here">{fmt(m.t)}</button>
        {editing === m.id
          ? <input className="in vp-note" autoFocus defaultValue={m.note ?? ''} placeholder="What happens here? (Enter saves)" onBlur={(e) => { upd(m.id, e.target.value.trim()); setEditing(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
          : <span className={`vp-ntext ${m.note ? '' : 'dim'}`} onClick={() => setEditing(m.id)} title="Click to write a note">{m.note || 'Add a note…'}</span>}
        <button className="vp-x" onClick={() => del(m.id)} aria-label="Delete marker" title="Delete marker"><Icon name="x" size={12} /></button>
      </div>)}
    </div>}
    {!sorted.length && <div className="vp-hint small dim">Press <b>M</b> for a marker, <b>N</b> for a marker with a note. Space plays, ← → jump, Shift+← → step one frame.</div>}
  </div>;
}
