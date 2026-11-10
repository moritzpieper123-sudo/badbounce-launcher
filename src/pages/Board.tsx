import React, { useRef, useState } from 'react';
import { useApp } from '../ctx';
import { allTasks, kColor, kName, setTaskCol, uid, ymd, KONZEPTE } from '../logic';
import { markUploaded, unmarkUploaded } from '../actions';
import { Icon, Tick } from '../ui';
import { Header, DueLabel } from './parts';
import { useTaskDrag } from '../taskDrag';
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
  const { drag, over, undo, setUndo, move, onDown } = useTaskDrag(tasks);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState(''); const [k, setK] = useState<string>(''); const [prio, setPrio] = useState<Task['prio']>(''); const [due, setDue] = useState(ymd(new Date()));

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
      <label className="f">Konzept<select className="in" value={k} onChange={(e) => setK(e.target.value)}><option value="">None</option>{Object.keys(KONZEPTE).map(Number).map((n) => <option key={n} value={n}>Konzept {n} · {KONZEPTE[n].name}</option>)}</select></label>
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
