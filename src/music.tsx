/* Now playing: Spotify (or any player) through the Windows media controls. PC only. */
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { bb, type MediaNow } from './bridge';

const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function NowPlaying() {
  const [m, setM] = useState<MediaNow | null>(null);
  const [, tick] = useState(0);
  const [opt, setOpt] = useState<boolean | null>(null); // optimistic play state after a click
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { bb.mediaNow?.().then(setM); return bb.onMedia?.((x) => { setM(x); setOpt(null); }); }, []);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(i); }, []);
  if (!bb.onMedia) return null;
  if (!m || !m.title) return <button className="glass np np-empty" onClick={() => bb.openUrl('spotify:')} title="Open Spotify">
    <span className="np-ico"><Icon name="music" size={18} /></span><span className="small muted">Nothing playing · open Spotify</span>
  </button>;
  const playing = opt ?? m.playing;
  const pos = Math.min(m.dur || 0, m.pos + (m.playing && m.at ? (Date.now() - m.at) / 1000 : 0));
  const frac = m.dur ? pos / m.dur : 0;
  const cmd = (c: string) => { bb.mediaCmd?.(c); if (c === 'toggle') setOpt(!playing); };
  const seek = (e: React.MouseEvent) => { const r = bar.current!.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); if (m.dur) cmd(`seek:${(f * m.dur).toFixed(1)}`); };
  return <div className="glass np">
    <div className="np-cover" style={m.cover ? { backgroundImage: `url("${m.cover}")` } : undefined}>{!m.cover && <Icon name="music" size={20} />}{playing && <span className="np-eq"><i /><i /><i /></span>}</div>
    <div className="np-mid">
      <div className="np-t" title={m.title}>{m.title}</div>
      <div className="np-a" title={m.artist}>{m.artist}{/spotify/i.test(m.app) && <span className="np-src" title="Spotify" />}</div>
      <div className="np-time"><span className="num">{mmss(pos)}</span>
        <div className="np-bar" ref={bar} onClick={seek} title="Jump to"><div style={{ width: `${frac * 100}%` }} /><b style={{ left: `${frac * 100}%` }} /></div>
        <span className="num">{mmss(m.dur)}</span></div>
    </div>
    <div className="np-ctl">
      <button onClick={() => cmd('prev')} aria-label="Previous" title="Previous"><Icon name="skipb" size={16} /></button>
      <button className="np-play" onClick={() => cmd('toggle')} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={18} color="#0B1124" /></button>
      <button onClick={() => cmd('next')} aria-label="Next" title="Next"><Icon name="skipf" size={16} /></button>
    </div>
  </div>;
}
