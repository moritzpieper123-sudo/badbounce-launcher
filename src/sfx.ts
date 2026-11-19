/* UI sounds (WebAudio, nothing to download).
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

/* Set D "frosted glass" (Mo 2026-11-20: no ball-bounce tocks, something that fits the liquid glass look):
   airy filtered-noise tick + tiny inharmonic glass "ting" (partials 1 / 2.76 / 5.4), a short soft room tail. */
let wet: GainNode | null = null;
let noise: AudioBuffer | null = null;
function bus(c: AudioContext) {
  if (wet) return wet;
  const conv = c.createConvolver(), len = Math.floor(c.sampleRate * 0.28), ir = c.createBuffer(1, len, c.sampleRate), d = ir.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.06));
  conv.buffer = ir;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000;
  wet = c.createGain(); wet.gain.value = 0.9; wet.connect(lp); lp.connect(conv); conv.connect(c.destination);
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const n = noise.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  return wet;
}
const OUT = 0.42; // master level
function send(c: AudioContext, node: AudioNode) { const g = c.createGain(); g.gain.value = OUT; node.connect(g); g.connect(c.destination); g.connect(bus(c)); }
function ting(c: AudioContext, t0: number, f: number, vol: number, tau: number, f1?: number) {
  const parts: [number, number, number][] = [[1, 1, 1], [2.76, 0.18, 0.5], [5.4, 0.05, 0.25]];
  for (const [m, a, k] of parts) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * m, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1 * m, t0 + 0.09);
    const e = c.createGain(); e.gain.setValueAtTime(0.0001, t0);
    e.gain.linearRampToValueAtTime(vol * a, t0 + 0.004); e.gain.setTargetAtTime(0.0001, t0 + 0.004, tau * k);
    o.connect(e); send(c, e); o.start(t0); o.stop(t0 + tau * k * 7 + 0.05);
  }
}
function air(c: AudioContext, t0: number, lo: number, hi: number, vol: number, tau: number) {
  bus(c);
  const src = c.createBufferSource(); src.buffer = noise;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = lo;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hi;
  const e = c.createGain(); e.gain.setValueAtTime(0.0001, t0);
  e.gain.linearRampToValueAtTime(vol, t0 + 0.002); e.gain.setTargetAtTime(0.0001, t0 + 0.002, tau);
  src.connect(hp); hp.connect(lp); lp.connect(e); send(c, e); src.start(t0, Math.random() * 0.5, tau * 8 + 0.05);
}
function swell(c: AudioContext, t0: number, vol: number) {
  for (const [f, a] of [[220, 1], [330, 0.6]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const e = c.createGain(); e.gain.setValueAtTime(0.0001, t0);
    e.gain.linearRampToValueAtTime(vol * a, t0 + 0.03); e.gain.setTargetAtTime(0.0001, t0 + 0.03, 0.32);
    o.connect(e); send(c, e); o.start(t0); o.stop(t0 + 2.4);
  }
}

export type SfxName = 'tap' | 'drop' | 'done' | 'pick' | 'bell';
export function sfx(name: SfxName) {
  if (!sfxOn()) return;
  const now = Date.now(); if (now - last < 45) return; last = now;
  const c = ac(); if (!c) return;
  const t = c.currentTime + 0.005;
  if (name === 'tap') { air(c, t, 2500, 6500, 0.22, 0.006); ting(c, t, 1760, 0.2, 0.07); }
  else if (name === 'pick') { air(c, t, 1500, 5000, 0.14, 0.005); ting(c, t, 900, 0.16, 0.05, 1250); }
  else if (name === 'drop') { air(c, t, 2000, 6000, 0.16, 0.008); ting(c, t, 520, 0.26, 0.09, 880); ting(c, t, 1318, 0.16, 0.1); }
  else if (name === 'bell') { swell(c, t, 0.26); [1318, 1760, 2637].forEach((f, i) => ting(c, t + 0.12 * (i + 1), f, 0.26, i === 2 ? 0.4 : 0.25)); air(c, t + 0.36, 3000, 8000, 0.08, 0.08); }
  else { [1318, 1760, 2349].forEach((f, i) => ting(c, t + 0.095 * i, f, 0.3, 0.2 + 0.05 * i)); }
}

/** play a tap for every button press in the whole app */
export function installClickSfx() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('button, .btn, [role="button"], .pnav-btn, .pmore-btn, select, input[type="checkbox"]')) sfx('tap');
  }, true);
}
