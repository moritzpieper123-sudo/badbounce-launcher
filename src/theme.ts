/* Theme: auto (follows the sun in Hamm, NRW) or a fixed dark / medium / light.
   Auto: night = dark, around sunrise and sunset = medium (the transition), day = light. */
import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'medium' | 'light';
export type Mode = 'auto' | Theme;
export const MODES: Mode[] = ['auto', 'dark', 'medium', 'light'];
const HAMM = { lat: 51.6739, lon: 7.8150 };
const TWILIGHT_MIN = 45; // medium mode lasts from 45 min before to 45 min after sunrise / sunset

/** Sunrise and sunset for a day (the same maths as the SunCalc library). */
export function sunTimes(date: Date, lat = HAMM.lat, lon = HAMM.lon) {
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const noon = new Date(date); noon.setHours(12, 0, 0, 0);
  const d = noon.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const lw = rad * -lon, phi = rad * lat;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const Jtransit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const w = Math.acos((Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
  const Jset = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jrise = Jtransit - (Jset - Jtransit);
  const toDate = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
  return { rise: toDate(Jrise), set: toDate(Jset) };
}
export function sunTheme(now = new Date()): Theme {
  const { rise, set } = sunTimes(now), t = now.getTime(), m = TWILIGHT_MIN * 60e3;
  if (t < rise.getTime() - m || t > set.getTime() + m) return 'dark';
  if (t < rise.getTime() + m || t > set.getTime() - m) return 'medium';
  return 'light';
}

const readMode = (): Mode => { try { const t = localStorage.getItem('bb-theme-mode') as Mode; return MODES.includes(t) ? t : 'auto'; } catch { return 'auto'; } };
let mode: Mode = readMode();
const listeners = new Set<() => void>();
export const themeFor = (m: Mode): Theme => (m === 'auto' ? sunTheme() : m);
function apply() { const t = themeFor(mode); if (document.documentElement.dataset.theme !== t) document.documentElement.dataset.theme = t; listeners.forEach((l) => l()); }
// tells the launcher (and with it the Progress screen) which theme mode is chosen
const sendMode = () => { try { (window as unknown as { bb?: { themeMode?: (m: Mode) => void } }).bb?.themeMode?.(mode); } catch { /* ignore */ } };
export function setMode(m: Mode) { mode = m; try { localStorage.setItem('bb-theme-mode', m); } catch { /* ignore */ } apply(); sendMode(); }
export const getMode = () => mode;
if (!document.body.classList.contains('island-body')) {
  apply();
  sendMode();
  setInterval(() => { if (mode === 'auto') apply(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && mode === 'auto') apply(); });
}
export function useTheme() {
  const [, setN] = useState(0);
  useEffect(() => { const l = () => setN((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return { mode, theme: themeFor(mode) };
}
