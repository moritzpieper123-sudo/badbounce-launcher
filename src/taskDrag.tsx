/* Drag a task card between columns (To do / In progress / Done). Used by the Tasks board and the Today overview.
   Mouse: press and move. Touch: hold ~0.3 s, then drag (a quick swipe still scrolls). */
import React, { useRef, useState } from 'react';
import { useApp } from './ctx';
import { setTaskCol } from './logic';
import { markUploaded, unmarkUploaded } from './actions';
import { bb } from './bridge';
import type { Col, Task } from './types';

export const COLS: { key: Col; name: string; dot: string }[] = [
  { key: 'todo', name: 'To do', dot: '#AAC3F0' },
  { key: 'prog', name: 'In progress', dot: '#FFC63A' },
  { key: 'done', name: 'Done', dot: '#7FD9A8' },
];

export function useTaskDrag(tasks: Task[]) {
  const { snap, update } = useApp();
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; w: number } | null>(null);
  const [over, setOver] = useState<Col | null>(null);
  const [undo, setUndo] = useState<{ t: Task; from: Col } | null>(null);
  const start = useRef<{ id: string; x: number; y: number; w: number; sx: number; sy: number; dragging: boolean } | null>(null);
  const move = async (t: Task, col: Col) => {
    if (t.col === col) return;
    const from = t.col;
    if (t.auto?.startsWith('up:') && t.videoNum != null) {
      if (col === 'done') await update((st) => setTaskCol(markUploaded(snap, t.videoNum!)(st), t, col));
      else await update((st) => setTaskCol(from === 'done' ? unmarkUploaded(t.videoNum!)(st) : st, t, col));
    } else await update((st) => setTaskCol(st, t, col));
    if (col === 'done') { setUndo({ t: { ...t, col }, from }); bb.islandToast(`Done: ${t.title}`, 'Undo in the launcher'); setTimeout(() => setUndo((u) => (u?.t.id === t.id ? null : u)), 6000); }
  };
  const colAt = (x: number, y: number): Col | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null;
    return (el?.dataset.col as Col) || null;
  };
  // Drag: mouse = press and move; touch (phone) = hold ~0.3 s, then drag (a quick swipe still scrolls the page)
  const onDown = (e: React.PointerEvent, t: Task) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const touch = e.pointerType !== 'mouse';
    const s = { id: t.id, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, sx: e.clientX, sy: e.clientY, dragging: false };
    start.current = s as typeof start.current;
    let timer = 0;
    const begin = (cx: number, cy: number) => { s.dragging = true; setDrag({ id: s.id, x: cx - s.x, y: cy - s.y, w: s.w }); setOver(colAt(cx, cy)); };
    const at = (cx: number, cy: number) => {
      setDrag({ id: s.id, x: cx - s.x, y: cy - s.y, w: s.w }); setOver(colAt(cx, cy));
      if (!touch) { if (cy < 60) window.scrollBy(0, -12); else if (cy > window.innerHeight - 60) window.scrollBy(0, 12); }
    };
    const end = async (cx: number | null, cy: number | null) => {
      clearTimeout(timer); cleanup();
      const was = s.dragging; start.current = null;
      const col = was && cx != null && cy != null ? colAt(cx, cy) : null;
      setDrag(null); setOver(null);
      const task = tasks.find((x) => x.id === s.id);
      if (task && col) await move(task, col);
    };
    const pm = (ev: PointerEvent) => { if (!s.dragging && Math.hypot(ev.clientX - s.sx, ev.clientY - s.sy) > 6) begin(ev.clientX, ev.clientY); if (s.dragging) at(ev.clientX, ev.clientY); };
    const pu = (ev: PointerEvent) => end(ev.clientX, ev.clientY);
    const tm = (ev: TouchEvent) => {
      const p = ev.touches[0]; if (!p) return;
      if (!s.dragging) { if (Math.hypot(p.clientX - s.sx, p.clientY - s.sy) > 10) { clearTimeout(timer); cleanup(); start.current = null; } return; }
      ev.preventDefault(); at(p.clientX, p.clientY);
    };
    const te = (ev: TouchEvent) => { const p = ev.changedTouches[0]; end(p ? p.clientX : null, p ? p.clientY : null); };
    const cleanup = () => {
      window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu);
      document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); document.removeEventListener('touchcancel', te);
      document.body.classList.remove('dragging');
    };
    if (touch) {
      document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('touchend', te); document.addEventListener('touchcancel', te);
      timer = window.setTimeout(() => { begin(s.sx, s.sy); document.body.classList.add('dragging'); navigator.vibrate?.(15); }, 280);
    } else {
      window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
    }
  };
  return { drag, over, undo, setUndo, move, onDown };
}

/** Phone: big drop targets above the bottom bar while dragging. */
export function DropBar({ over }: { over: Col | null }) {
  return <div className="drop-bar">{COLS.map((c) => <div key={c.key} data-col={c.key} className={`drop-target ${over === c.key ? 'over' : ''}`}><span className="dot" style={{ background: c.dot }} />{c.name}</div>)}</div>;
}
