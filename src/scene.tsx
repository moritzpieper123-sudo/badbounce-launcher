/* Background: a rendered apartment (day / dusk / night) with a live, endlessly looping city behind the window:
   cars driving both ways, drifting clouds, birds by day, lit windows, street lamps, stars and a plane by night.
   The light follows the theme (which follows the sun in Hamm), and fades smoothly between the three moods. */
import React, { useEffect, useRef, useState } from 'react';
import dayWide from './assets/room/day-wide.webp';
import duskWide from './assets/room/dusk-wide.webp';
import nightWide from './assets/room/night-wide.webp';
import dayTall from './assets/room/day-tall.webp';
import duskTall from './assets/room/dusk-tall.webp';
import nightTall from './assets/room/night-tall.webp';
import { useTheme, type Theme } from './theme';

const IMG = { wide: { w: 2400, h: 1350, dark: nightWide, medium: duskWide, light: dayWide }, tall: { w: 1179, h: 2556, dark: nightTall, medium: duskTall, light: dayTall } };
// where the window glass sits in each render (fractions of the image)
const WIN = { wide: { x0: .1418, x1: .4641, y0: .2835, y1: .6519 }, tall: { x0: -.2985, x1: .7330, y0: .3406, y1: .6476 } };

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixC = (w: number[], cs: string[]) => { const c = cs.map(hex); const o = [0, 1, 2].map((i) => Math.round(c[0][i] * w[0] + c[1][i] * w[1] + c[2][i] * w[2])); return `rgb(${o[0]},${o[1]},${o[2]})`; };
// weights order: [light (day), medium (dusk), dark (night)]
const SKY_TOP = ['#5E93E0', '#3B3E7A', '#060A1C'], SKY_MID = ['#9CC3F2', '#C46E6A', '#0E1630'], SKY_LOW = ['#DCEBFB', '#FFB36B', '#1B2440'];
const FAR = ['#A9BCD6', '#5A4A6E', '#111830'], NEAR = ['#7E93B3', '#3C3150', '#0A0F20'], GROUND = ['#8E97A6', '#4A4250', '#0D1120'], ROAD = ['#5D6470', '#33303A', '#0B0E16'];

function rnd(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

interface Car { x: number; lane: number; v: number; len: number; col: string; kind: number }
function makeWorld() {
  const r = rnd(42);
  const far = Array.from({ length: 70 }, (_, i) => ({ x: i / 70, w: .01 + r() * .025, h: .05 + r() * .22, lit: Array.from({ length: 30 }, () => r()) }));
  const near = Array.from({ length: 16 }, (_, i) => ({ x: i / 16 + r() * .02, w: .045 + r() * .05, h: .12 + r() * .3, lit: Array.from({ length: 60 }, () => r()), blink: r() }));
  const clouds = Array.from({ length: 7 }, () => ({ x: r(), y: .05 + r() * .3, s: .08 + r() * .14, v: .002 + r() * .004 }));
  const stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * .45, s: .5 + r() * 1.2, p: r() * 6 }));
  const cols = ['#E9ECF2', '#2B2F38', '#9AA3B2', '#B23A3A', '#1F3D7A', '#D9D4C8', '#3A3D45', '#F2C14E'];
  const cars: Car[] = Array.from({ length: 9 }, (_, i) => ({ x: r(), lane: i % 2, v: (.035 + r() * .03) * (i % 2 ? -1 : 1), len: .05 + r() * .03, col: cols[Math.floor(r() * cols.length)], kind: r() < .2 ? 1 : 0 }));
  return { far, near, clouds, stars, cars, r, birds: { x: -1, y: .2, v: .05 }, plane: { x: -1, y: .12 } };
}

function drawCity(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, dt: number, w: number[], world: ReturnType<typeof makeWorld>) {
  const night = w[2], dusk = w[1], day = w[0], lit = Math.min(1, night + dusk * .7);
  const hz = H * .56; // horizon at eye height
  // sky
  let g = ctx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, mixC(w, SKY_TOP)); g.addColorStop(.6, mixC(w, SKY_MID)); g.addColorStop(1, mixC(w, SKY_LOW));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 2);
  // sun (day high, dusk low and orange) and moon
  if (day > .02) { ctx.globalAlpha = day; g = ctx.createRadialGradient(W * .78, H * .1, 0, W * .78, H * .1, W * .35); g.addColorStop(0, 'rgba(255,250,235,.9)'); g.addColorStop(.08, 'rgba(255,245,220,.6)'); g.addColorStop(1, 'rgba(255,245,220,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz); }
  if (dusk > .02) { ctx.globalAlpha = dusk; g = ctx.createRadialGradient(W * .3, hz * .95, 0, W * .3, hz * .95, W * .5); g.addColorStop(0, 'rgba(255,190,110,.95)'); g.addColorStop(.06, 'rgba(255,160,90,.7)'); g.addColorStop(1, 'rgba(255,140,90,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz); }
  if (night > .02) {
    ctx.globalAlpha = night;
    for (const s of world.stars) { ctx.globalAlpha = night * (.5 + .5 * Math.sin(t * 1.3 + s.p)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x * W, s.y * hz, s.s, 0, 7); ctx.fill(); }
    ctx.globalAlpha = night; ctx.fillStyle = '#F4F1E6'; ctx.shadowColor = 'rgba(244,241,230,.8)'; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(W * .8, H * .13, Math.max(6, W * .025), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  // clouds drift
  for (const c of world.clouds) {
    c.x += c.v * dt; if (c.x > 1.3) c.x = -.3;
    ctx.globalAlpha = (day * .85 + dusk * .7 + night * .12);
    ctx.fillStyle = dusk > .5 ? 'rgba(255,200,170,.55)' : night > .5 ? 'rgba(120,140,190,.3)' : 'rgba(255,255,255,.75)';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse((c.x + k * c.s * .3) * W, c.y * hz + Math.sin(k) * c.s * W * .03, c.s * W * .22, c.s * W * .07, 0, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  // far skyline
  ctx.fillStyle = mixC(w, FAR);
  for (const b of world.far) ctx.fillRect(b.x * W, hz - b.h * H, b.w * W, b.h * H + 2);
  if (lit > .02) { ctx.globalAlpha = lit * .8; ctx.fillStyle = '#FFD891'; for (const b of world.far) for (let i = 0; i < b.lit.length; i++) if (b.lit[i] > .72) { const cx = b.x * W + (i % 3 + .5) * b.w * W / 3.3, cy = hz - b.h * H + 4 + Math.floor(i / 3) * H * .02; if (cy < hz - 2) ctx.fillRect(cx, cy, 1.5, 1.5); } ctx.globalAlpha = 1; }
  // ground strip, then near buildings across the street
  ctx.fillStyle = mixC(w, GROUND); ctx.fillRect(0, hz, W, H - hz);
  const base = H * .79;
  ctx.fillStyle = mixC(w, NEAR);
  for (const b of world.near) ctx.fillRect(b.x * W, base - b.h * H, b.w * W, b.h * H);
  if (lit > .02) {
    for (const b of world.near) { const cols = 4, rows = Math.floor(b.h * H / (H * .03)); for (let i = 0; i < Math.min(rows * cols, b.lit.length); i++) { let on = b.lit[i] > .55; if (b.blink > .8 && i === 3) on = Math.sin(t * .4 + b.blink * 9) > 0; if (!on) continue; ctx.globalAlpha = lit * (.6 + .4 * b.lit[i]); ctx.fillStyle = b.lit[i] > .9 ? '#BFD4FF' : '#FFCF86'; ctx.fillRect(b.x * W + (i % cols + .3) * b.w * W / cols, base - b.h * H + (Math.floor(i / cols) + .4) * H * .03, b.w * W / cols * .45, H * .014); } }
    ctx.globalAlpha = 1;
  }
  if (day > .02) { ctx.globalAlpha = day * .35; ctx.fillStyle = '#DCE8F8'; for (const b of world.near) for (let i = 0; i < 10; i++) ctx.fillRect(b.x * W + (i % 4 + .3) * b.w * W / 4, base - b.h * H + (Math.floor(i / 4) + .4) * H * .03, b.w * W / 4 * .45, H * .014); ctx.globalAlpha = 1; }
  // sidewalk + road
  ctx.fillStyle = mixC(w, GROUND); ctx.fillRect(0, base, W, H * .03);
  ctx.fillStyle = mixC(w, ROAD); ctx.fillRect(0, base + H * .03, W, H);
  ctx.fillStyle = `rgba(240,236,220,${.25 + day * .3})`; const lanY = base + H * .095;
  for (let x = -((t * 60) % 60); x < W; x += 60) ctx.fillRect(x, lanY, 26, Math.max(1, H * .004));
  // street lamps
  for (let i = 0; i < 4; i++) {
    const lx = (i + .5) / 4 * W; ctx.fillStyle = '#1A1C22'; ctx.fillRect(lx, base - H * .13, 2, H * .13); ctx.fillRect(lx - 8, base - H * .13, 10, 2);
    if (lit > .02) { ctx.globalAlpha = lit; g = ctx.createRadialGradient(lx - 6, base - H * .125, 0, lx - 6, base - H * .125, H * .09); g.addColorStop(0, 'rgba(255,214,150,.95)'); g.addColorStop(1, 'rgba(255,214,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx - 6, base - H * .125, H * .09, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }
  // cars: two lanes, endless loop
  for (const c of world.cars) {
    c.x += c.v * dt; if (c.v > 0 && c.x > 1.15) { c.x = -.15 - world.r() * .3; } if (c.v < 0 && c.x < -.15) { c.x = 1.15 + world.r() * .3; }
    const y = c.lane ? base + H * .145 : base + H * .07, sc = c.lane ? 1.18 : 1, L = c.len * W * sc, Hh = H * .028 * sc * (c.kind ? 1.25 : 1), x = c.x * W;
    ctx.fillStyle = c.col; ctx.beginPath(); ctx.roundRect(x - L / 2, y - Hh, L, Hh * .62, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x - L * .3 + (c.v > 0 ? -L * .04 : L * .04), y - Hh * 1.38, L * .56, Hh * .5, 4); ctx.fill();
    ctx.fillStyle = `rgba(160,190,230,${.5 + day * .3})`; ctx.fillRect(x - L * .25 + (c.v > 0 ? -L * .04 : L * .04), y - Hh * 1.3, L * .5, Hh * .34);
    ctx.fillStyle = '#0B0C10'; for (const wx of [-.3, .3]) { ctx.beginPath(); ctx.arc(x + wx * L, y - Hh * .38, Hh * .26, 0, 7); ctx.fill(); }
    const fr = c.v > 0 ? 1 : -1;
    if (lit > .05) {
      ctx.globalAlpha = lit; g = ctx.createRadialGradient(x + fr * L / 2, y - Hh * .65, 0, x + fr * L / 2, y - Hh * .65, L * .7); g.addColorStop(0, 'rgba(255,248,225,.95)'); g.addColorStop(1, 'rgba(255,248,225,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + fr * L / 2, y - Hh * .65); ctx.arc(x + fr * L / 2, y - Hh * .65, L * .7, fr > 0 ? -.35 : Math.PI - .35, fr > 0 ? .35 : Math.PI + .35); ctx.fill();
      ctx.fillStyle = 'rgba(255,60,60,.95)'; ctx.shadowColor = 'rgba(255,60,60,.9)'; ctx.shadowBlur = 8; ctx.fillRect(x - fr * L / 2 - (fr > 0 ? 0 : 3), y - Hh * .75, 3, Hh * .18); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }
  // birds by day, a blinking plane by night
  const b = world.birds; if (day > .4) { b.x += b.v * dt; if (b.x > 1.2) { b.x = -.3 - world.r() * 2; b.y = .08 + world.r() * .25; } ctx.strokeStyle = 'rgba(40,50,70,.7)'; ctx.lineWidth = 1.4; for (let k = 0; k < 4; k++) { const bx = (b.x - k * .025) * W, by = b.y * hz + Math.sin(k * 2) * 5, f = Math.sin(t * 8 + k) * 3; ctx.beginPath(); ctx.moveTo(bx - 5, by - f); ctx.lineTo(bx, by); ctx.lineTo(bx + 5, by - f); ctx.stroke(); } }
  const p = world.plane; if (night > .4) { p.x += .012 * dt; if (p.x > 1.2) { p.x = -.4 - world.r(); p.y = .06 + world.r() * .18; } if (Math.sin(t * 6) > .6) { ctx.fillStyle = '#FF5A5A'; ctx.beginPath(); ctx.arc(p.x * W, p.y * hz, 2, 0, 7); ctx.fill(); } ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(p.x * W - 3, p.y * hz, 2, 1); }
  // a soft reflection on the glass
  g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.45, `rgba(255,255,255,${.04 + night * .03})`); g.addColorStop(.55, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

const target = (t: Theme) => (t === 'light' ? [1, 0, 0] : t === 'medium' ? [0, 1, 0] : [0, 0, 1]);

export function Background() {
  const { theme } = useTheme();
  const [orient, setOrient] = useState<'wide' | 'tall'>(() => (innerWidth / innerHeight < .8 ? 'tall' : 'wide'));
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme); themeRef.current = theme;
  useEffect(() => { const h = () => setOrient(innerWidth / innerHeight < .8 ? 'tall' : 'wide'); addEventListener('resize', h); return () => removeEventListener('resize', h); }, []);
  useEffect(() => {
    const c = cv.current, el = wrap.current; if (!c || !el) return;
    const img = IMG[orient], win = WIN[orient];
    // place the canvas exactly behind the window of the cover-scaled image
    const place = () => {
      const cw = el.clientWidth, ch = el.clientHeight, s = Math.max(cw / img.w, ch / img.h), ox = (cw - img.w * s) / 2, oy = (ch - img.h * s) / 2;
      const x = ox + win.x0 * img.w * s - 4, y = oy + win.y0 * img.h * s - 4, w = (win.x1 - win.x0) * img.w * s + 8, h = (win.y1 - win.y0) * img.h * s + 8;
      Object.assign(c.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      const d = Math.min(1.5, devicePixelRatio || 1); c.width = Math.round(w * d); c.height = Math.round(h * d);
    };
    place(); const ro = new ResizeObserver(place); ro.observe(el);
    const world = makeWorld();
    const wts = target(themeRef.current);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = performance.now(), acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt;
      if (acc < 1 / 30) return; // 30 fps is plenty for a background
      const step = acc; acc = 0;
      const tg = target(themeRef.current); for (let i = 0; i < 3; i++) wts[i] += (tg[i] - wts[i]) * Math.min(1, step * 1.2);
      const ctx = c.getContext('2d'); if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawCity(ctx, c.width, c.height, now / 1000, still ? 0 : step, wts, world);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis); vis();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [orient]);
  const img = IMG[orient];
  return <div className="bg" aria-hidden="true">
    <div className="room" ref={wrap}>
      <canvas className="city" ref={cv} />
      {(['dark', 'medium', 'light'] as Theme[]).map((t) => <img key={t} className={`room-img ${theme === t ? 'on' : ''}`} src={img[t]} alt="" decoding="async" />)}
    </div>
    <i className="bg-shade" />
  </div>;
}
