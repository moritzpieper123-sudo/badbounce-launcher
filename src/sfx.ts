/* UI sounds (WebAudio, nothing to download). Mo 2026-11-19: copy the sounds of his reference video.
   On by default; switch in Settings > Appearance (localStorage bb-sfx). */
let ctx: AudioContext | null = null;
let last = 0;
export const sfxOn = () => { try { return localStorage.getItem('bb-sfx') !== '0'; } catch { return true; } };
export const setSfx = (on: boolean) => { try { localStorage.setItem('bb-sfx', on ? '1' : '0'); } catch { /* ignore */ } if (on) sfx('tap'); };

function ac(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = ctx || new C();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Sounds copied from Mo's reference video (analysed 2026-11-19): dry tonal ticks, a steep ~5 ms body
 *  (-20 dB after ~10 ms) plus a quiet ~180 ms tail, at 780 / 1050 / 2060 Hz, and one soft low bell
 *  (258 + 387 + 780 Hz + 102 Hz, ~600 ms) for "focus started" moments. */
function tick(c: AudioContext, t0: number, f: number, vol: number) {
  const g = c.createGain(); g.connect(c.destination);
  // body + tail envelope: two stacked sines on the same pitch
  for (const [amp, tau] of [[1, 0.0045], [0.05, 0.12]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.linearRampToValueAtTime(vol * amp, t0 + 0.0012);
    e.gain.setTargetAtTime(0.0001, t0 + 0.0012, tau);
    o.connect(e); e.connect(g); o.start(t0); o.stop(t0 + tau * 7 + 0.02);
  }
}
function bell(c: AudioContext, t0: number, vol: number) {
  for (const [f, amp, tau] of [[258, 1, 0.13], [387, 0.6, 0.11], [780, 0.5, 0.08], [102, 0.35, 0.12]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.linearRampToValueAtTime(vol * amp, t0 + 0.004);
    e.gain.setTargetAtTime(0.0001, t0 + 0.004, tau);
    o.connect(e); e.connect(c.destination); o.start(t0); o.stop(t0 + tau * 7 + 0.02);
  }
}

export type SfxName = 'tap' | 'drop' | 'done' | 'pick' | 'bell';
export function sfx(name: SfxName) {
  if (!sfxOn()) return;
  const now = Date.now(); if (now - last < 45) return; last = now;
  const c = ac(); if (!c) return;
  const t = c.currentTime + 0.005, V = 0.13;
  if (name === 'tap') tick(c, t, 1050, V);
  else if (name === 'pick') tick(c, t, 780, V);
  else if (name === 'drop') { tick(c, t, 780, V); tick(c, t + 0.07, 1050, V * 0.8); }
  else if (name === 'bell') { bell(c, t, V * 1.2); tick(c, t + 0.09, 2060, V * 0.7); }
  else { tick(c, t, 780, V); tick(c, t + 0.07, 1050, V); tick(c, t + 0.14, 2060, V * 0.85); }
}

/** play a tap for every button press in the whole app */
export function installClickSfx() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('button, .btn, [role="button"], .pnav-btn, .pmore-btn, select, input[type="checkbox"]')) sfx('tap');
  }, true);
}
