/* Soft liquid UI sounds (WebAudio, nothing to download). Mo 2026-11-19.
   Water-drop "bloops": a sine that glides up or down through a low-pass, with a quiet overtone. On by default;
   switch in Settings > Appearance (localStorage bb-sfx). */
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

/** one water bloop: pitch glides f0 -> f1 over `dur` seconds */
function bloop(c: AudioContext, t0: number, f0: number, f1: number, dur: number, vol: number) {
  const out = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.7;
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  out.connect(lp); lp.connect(c.destination);
  for (const [mul, v] of [[1, 1], [2.01, 0.22]] as const) {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0 * mul, t0);
    o.frequency.exponentialRampToValueAtTime(f1 * mul, t0 + dur * 0.7);
    const g = c.createGain(); g.gain.value = v;
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
}

export type SfxName = 'tap' | 'drop' | 'done' | 'pick';
export function sfx(name: SfxName) {
  if (!sfxOn()) return;
  const now = Date.now(); if (now - last < 45) return; last = now;
  const c = ac(); if (!c) return;
  const t = c.currentTime + 0.005;
  if (name === 'tap') bloop(c, t, 420, 700, 0.11, 0.07);
  else if (name === 'pick') bloop(c, t, 520, 420, 0.09, 0.05);
  else if (name === 'drop') { bloop(c, t, 300, 560, 0.13, 0.08); bloop(c, t + 0.09, 560, 380, 0.12, 0.045); }
  else { bloop(c, t, 520, 780, 0.14, 0.08); bloop(c, t + 0.1, 780, 1040, 0.16, 0.07); bloop(c, t + 0.21, 1040, 1320, 0.22, 0.04); }
}

/** play a tap for every button press in the whole app */
export function installClickSfx() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('button, .btn, [role="button"], .pnav-btn, .pmore-btn, select, input[type="checkbox"]')) sfx('tap');
  }, true);
}
