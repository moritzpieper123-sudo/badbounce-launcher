/* Screen saver state: after 60 s without mouse / keyboard in the launcher window the home screen takes over (all bars hidden). */
import { useEffect, useState } from 'react';
import { isDesktop } from './bridge';

export const IDLE_SECONDS = 60;
const KEY = 'bb-idle';
const read = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
let enabled = read(), ambient = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const setIdleEnabled = (v: boolean) => { enabled = v; try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* ignore */ } if (!v) ambient = false; emit(); };
export const enterAmbient = () => { if (!ambient) { ambient = true; emit(); } };
export const exitAmbient = () => { if (ambient) { ambient = false; emit(); } };

/** Installs the activity watcher once (desktop only) and returns the live state. */
let watching = false;
export function useIdle(onEnter: () => void) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEffect(() => {
    if (!isDesktop || watching) return;
    watching = true;
    let last = Date.now(), lx = -1, ly = -1;
    const wake = () => { last = Date.now(); if (ambient && Date.now() - enteredAt > 1500) exitAmbient(); };
    let enteredAt = 0;
    const onMove = (e: MouseEvent) => { if (lx < 0 || Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) > 6) { lx = e.clientX; ly = e.clientY; if (lx >= 0) wake(); } lx = e.clientX; ly = e.clientY; };
    const evs: [string, EventListener][] = [['mousemove', onMove as EventListener], ['mousedown', wake], ['keydown', wake], ['wheel', wake], ['touchstart', wake]];
    for (const [n, f] of evs) addEventListener(n, f, { passive: true });
    const t = setInterval(() => {
      if (!enabled || ambient || document.hidden) return;
      const playing = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended);   // reviewing a video counts as active
      if (playing) { last = Date.now(); return; }
      if (Date.now() - last >= IDLE_SECONDS * 1000) { enteredAt = Date.now(); onEnter(); enterAmbient(); }
    }, 3000);
    return () => { clearInterval(t); for (const [n, f] of evs) removeEventListener(n, f); watching = false; };
  }, [onEnter]);
  return { ambient, enabled };
}
