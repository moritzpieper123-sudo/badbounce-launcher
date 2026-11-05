/* Background: a smooth, slowly moving colour gradient that follows the time of day in Hamm.
   Night = deep blue, sunrise = pink and orange, day = clear blue, golden hour, sunset = red and orange, dusk = purple.
   In auto mode the colours follow the real sun; a fixed theme picks night (dark), sunset (medium) or day (light). */
import React, { useEffect, useState } from 'react';
import { sunTimes, useTheme } from './theme';

// [top, bottom, blob 1, blob 2, blob 3]
type Pal = string[];
const P: Record<string, Pal> = {
  night: ['#060A1C', '#101833', '#1B2A6B', '#35205C', '#0D3552'],
  dawn: ['#2A2C66', '#E8896A', '#FF8A65', '#C3549A', '#FFC37A'],
  morning: ['#5F95DD', '#F3D6B6', '#93C2FF', '#FFD3A0', '#B4A3F0'],
  day: ['#3A78D2', '#A6CFF3', '#69B0FF', '#B5DEFF', '#8CA4FF'],
  golden: ['#5279C0', '#FFC98A', '#FFB466', '#FF8F7A', '#8EB2F0'],
  sunset: ['#33296A', '#FF7448', '#FF5A5F', '#FFA64A', '#9B4DCA'],
  dusk: ['#121941', '#683876', '#3D2C8D', '#B0487A', '#1E3C7A'],
};
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
const ease = (t: number) => t * t * (3 - 2 * t);

/** The palette for a moment in time, blended between anchors around sunrise and sunset. */
export function skyPalette(now: Date): Pal {
  const { rise, set } = sunTimes(now), m = 60e3, r = rise.getTime(), s = set.getTime();
  const keys: [number, Pal][] = [
    [r - 100 * m, P.night], [r - 15 * m, P.dawn], [r + 20 * m, P.dawn], [r + 110 * m, P.morning], [r + 220 * m, P.day],
    [s - 170 * m, P.day], [s - 70 * m, P.golden], [s - 5 * m, P.sunset], [s + 25 * m, P.sunset], [s + 70 * m, P.dusk], [s + 140 * m, P.night],
  ];
  const t = now.getTime();
  if (t <= keys[0][0] || t >= keys[keys.length - 1][0]) return P.night;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t >= t0 && t <= t1) { const k = ease((t - t0) / (t1 - t0)); return a.map((c, j) => mix(c, b[j], k)); }
  }
  return P.night;
}

export function Background() {
  const { mode, theme } = useTheme();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 60e3); return () => clearInterval(i); }, []);
  const pal = mode === 'auto' ? skyPalette(now) : theme === 'dark' ? P.night : theme === 'medium' ? P.sunset : P.day;
  const vars = { '--sky-top': pal[0], '--sky-bot': pal[1], '--sky-a': pal[2], '--sky-b': pal[3], '--sky-c': pal[4] } as React.CSSProperties;
  return <div className="bg sky" aria-hidden="true" style={vars}>
    <i className="blob a" /><i className="blob b" /><i className="blob c" />
    <i className="bg-shade" />
  </div>;
}
