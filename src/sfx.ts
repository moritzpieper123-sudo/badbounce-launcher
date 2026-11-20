/* UI sounds. Mo 2026-11-20: real sounds from a library instead of my synth.
   Source: UI SFX by romainsimon (github.com/romainsimon/uisfx), CC0, via the npm package @wubbleai/community-sfx.
   14 sound themes are bundled (silk = soft low tock, tock = clean clicky; both picked from the same CC0 catalog and loudness-matched) (src/assets/sfx/<theme>/); Settings > Appearance picks the theme. On by default. */
const FILES = import.meta.glob('./assets/sfx/*/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const SFX_THEMES = ['silk', 'tock', 'organic', 'rubber', 'soft', 'minimal', 'glass', 'dreamy', 'zen', 'studio', 'mechanical', 'arcade', 'scifi', 'cinematic'] as const;
export type SfxTheme = (typeof SFX_THEMES)[number];
export type SfxName = 'tap' | 'drop' | 'done' | 'pick' | 'bell';
const FILE_OF: Record<SfxName, string> = { tap: 'press', pick: 'drag-start', drop: 'drop', done: 'complete', bell: 'success' };
const GAIN: Record<SfxName, number> = { tap: 0.9, pick: 0.9, drop: 1, done: 1, bell: 1 };

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
export const sfxOn = () => read('bb-sfx') !== '0';
export const setSfx = (on: boolean) => { write('bb-sfx', on ? '1' : '0'); if (on) sfx('tap'); };
export const sfxTheme = (): SfxTheme => { const t = read('bb-sfx-theme') as SfxTheme | null; return t && (SFX_THEMES as readonly string[]).includes(t) ? t : 'silk'; };
export const setSfxTheme = (t: SfxTheme) => { write('bb-sfx-theme', t); sfx('tap'); setTimeout(() => sfx('drop'), 450); setTimeout(() => sfx('done'), 950); };

const cache = new Map<string, HTMLAudioElement>();
let last = 0;
export function sfx(name: SfxName) {
  if (!sfxOn()) return;
  const now = Date.now(); if (now - last < 45) return; last = now;
  const url = FILES[`./assets/sfx/${sfxTheme()}/${FILE_OF[name]}.mp3`]; if (!url) return;
  try {
    let a = cache.get(url);
    if (!a) { a = new Audio(url); a.preload = 'auto'; cache.set(url, a); }
    const p = a.paused ? a : (a.cloneNode() as HTMLAudioElement); // overlapping presses: play a copy
    p.volume = Math.min(1, GAIN[name] * 0.9); p.currentTime = 0; void p.play().catch(() => {});
  } catch { /* no audio available */ }
}

/** preload the chosen theme so the first click is instant, and play a tap for every button press in the whole app */
export function installClickSfx() {
  for (const n of ['tap', 'pick', 'drop', 'done', 'bell'] as SfxName[]) { const u = FILES[`./assets/sfx/${sfxTheme()}/${FILE_OF[n]}.mp3`]; if (u && !cache.has(u)) { const a = new Audio(u); a.preload = 'auto'; cache.set(u, a); } }
  document.addEventListener('pointerdown', (e) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('button, .btn, [role="button"], .pnav-btn, .pmore-btn, select, input[type="checkbox"]')) sfx('tap');
  }, true);
}
