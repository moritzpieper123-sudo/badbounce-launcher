import React, { useRef, useState } from 'react';
import { useApp } from '../ctx';
import { allTasks, kColor, kName, setTaskCol, uid, ymd } from '../logic';
import { markUploaded, unmarkUploaded } from '../actions';
import { Icon, Tick } from '../ui';
import { Header, DueLabel } from './parts';
import { bb } from '../bridge';
import type { Col, Task } from '../types';

const COLS: { key: Col; name: string; dot: string }[] = [
  { key: 'todo', name: 'To do', dot: '#AAC3F0' },
  { key: 'prog', name: 'In progress', dot: '#FFC63A' },
  { key: 'done', name: 'Done', dot: '#7FD9A8' },
];

export default function Board() {
  const { snap, update, toast } = useApp();
  const tasks = allTasks(snap);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; w: number } | null>(null);
  const [over, setOver] = useState<Col | null>(null);
  const [undo, setUndo] = useState<{ t: Task; from: Col } | null>(null);
  const start = useRef<{ id: string; x: number; y: number; w: number; sx: number; sy: number; dragging: boolean } | null>(null);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState(''); const [k, setK] = useState<string>(''); const [prio, setPrio] = useState<Task['prio']>(''); const [due, setDue] = useState(ymd(new Date()));

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
  const addTask = async () => {
    if (!title.trim()) return;
    const kn = k ? +k : null;
    const t: Task = { id: uid(), title: title.trim(), tag: kn ? kName(kn) : 'Task', konzept: kn, prio, col: 'todo', due: due || undefined, createdAt: new Date().toISOString() };
    await update((st) => ({ ...st, tasks: [t, ...st.tasks] }));
    setTitle(''); setForm(false); toast('Task added');
  };
  const dragged = drag ? tasks.find((t) => t.id === drag.id) : null;
  const card = (t: Task, ghost = false) => {
    const done = t.col === 'done';
    return <article key={t.id + (ghost ? 'g' : '')} className={`kcard ${ghost ? 'ghost' : ''} ${!ghost && drag?.id === t.id ? 'drag' : ''}`}
      style={ghost ? { left: drag!.x, top: drag!.y, width: drag!.w } : undefined}
      onPointerDown={ghost ? undefined : (e) => onDown(e, t)} onContextMenu={(e) => e.preventDefault()}>
      <div className="row small" style={{ gap: 6 }}>
        <span className="chip"><span className="dot" style={{ width: 6, height: 6, background: kColor(t.konzept) }} />{t.tag}</span>
        {t.prio && <span className={`prio-${t.prio}`}>{t.prio}</span>}
        <span style={{ flex: 1 }} />
        {t.auto && <span title="Added automatically by the launcher" style={{ display: 'flex' }}><Icon name="sparkle" size={13} color="var(--dim)" /></span>}
        {!t.auto && !ghost && <button className="btn sm" style={{ height: 24, padding: '0 6px', border: 0, background: 'transparent' }} aria-label={`Delete ${t.title}`} onClick={() => update((st) => ({ ...st, tasks: st.tasks.filter((x) => x.id !== t.id) }))}><Icon name="x" size={13} /></button>}
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        {done && <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Tick size={10} color="#04050A" /></span>}
        <span style={{ fontWeight: 600, color: done ? 'var(--muted)' : 'var(--text)' }}>{t.title}</span>
      </div>
      {(t.due || t.col === 'prog') && <div className="row small dim" style={{ gap: 10 }}>
        {t.due && <span className="row" style={{ gap: 5 }}><Icon name="calendar" size={12} /><DueLabel due={t.due} now={snap.now} /></span>}
        {t.col === 'prog' && <div className="progress"><div style={{ width: '50%', background: 'var(--yellow)' }} /></div>}
      </div>}
    </article>;
  };
  return <>
    <Header title="Tasks" sub={<>{tasks.filter((t) => t.col !== 'done').length} open · <span className="hide-phone">drag a card between columns</span><span className="phone-inline">hold a card, then drag it</span></>} right={<>
      {undo && <button className="btn" onClick={async () => { await move(undo.t, undo.from); setUndo(null); }}>Undo “{undo.t.title.slice(0, 24)}”</button>}
      <button className="btn primary" onClick={() => setForm(!form)}><Icon name="plus" size={15} /> New task</button>
    </>} />
    {form && <div className="glass card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label className="f" style={{ flex: '2 1 260px' }}>Task<input className="in" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} autoFocus placeholder="What needs doing?" /></label>
      <label className="f">Konzept<select className="in" value={k} onChange={(e) => setK(e.target.value)}><option value="">None</option>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>Konzept {n}</option>)}</select></label>
      <label className="f">Priority<select className="in" value={prio} onChange={(e) => setPrio(e.target.value as Task['prio'])}><option value="">Normal</option><option>High</option><option>Urgent</option></select></label>
      <label className="f">Due<input className="in" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      <button className="btn primary" onClick={addTask}>Add</button>
    </div>}
    <div className="board">
      {COLS.map((c) => {
        const list = tasks.filter((t) => t.col === c.key);
        return <section key={c.key} data-col={c.key} className={`glass col ${over === c.key ? 'over' : ''}`} aria-label={c.name}>
          <div className="row" style={{ padding: '2px 4px 4px' }}><span className="dot" style={{ background: c.dot }} /><b>{c.name}</b><span className="chip">{list.length}</span></div>
          {list.map((t) => card(t))}
          {!list.length && <div className="empty">Drop tasks here</div>}
        </section>;
      })}
    </div>
    {dragged && drag && card(dragged, true)}
    {drag && <div className="drop-bar">{COLS.map((c) => <div key={c.key} data-col={c.key} className={`drop-target ${over === c.key ? 'over' : ''}`}><span className="dot" style={{ background: c.dot }} />{c.name}</div>)}</div>}
  </>;
}
