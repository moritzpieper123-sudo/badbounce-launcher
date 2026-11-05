import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import '@fontsource-variable/inter';
import './styles.css';
import { useSnapshot } from './store';
import { bb } from './bridge';
import { bufferInfo, dueAlerts, fmtLate, isQuiet, islandStatus, KONZEPTE, kColor, buildPlan, fmtIn, minsUntil, ymd, addDays, allTasks, ROTATION, type Alert } from './logic';
import { AppCtx } from './ctx';
import { useTaskDrag, COLS } from './taskDrag';
import type { Task } from './types';
import { doUploadPack, markUploaded } from './actions';
import { Icon, Tick } from './ui';

/* The island window is transparent: never paint the page background behind the pill. */
document.documentElement.style.background = 'transparent';

const MOOD = { done: '#7FD9A8', due: '#FFC63A', overdue: '#FF6B5C', idle: '#7FD9A8' } as const;

function Island() {
  const { snap, update } = useSnapshot(15000);
  const [open, setOpen] = useState(false);
  const [alert, setAlert] = useState<Alert | { title: string; sub: string; kind: 'toast' } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const hoverT = useRef<number | undefined>();
  const alertT = useRef<number | undefined>();

  const show = useCallback((a: Alert | { title: string; sub: string; kind: 'toast' }) => {
    setAlert(a); clearTimeout(alertT.current);
    alertT.current = window.setTimeout(() => setAlert(null), 6500);
  }, []);
  useEffect(() => bb.onIslandToast((m) => show({ ...m, kind: 'toast' })), [show]);
  useEffect(() => bb.onNavigate((p) => { if (p === 'toggle') setOpen((o) => !o); }), []);
  useEffect(() => { bb.islandSize(open ? 'open' : alert ? 'alert' : 'pill'); }, [open, alert]);
  useEffect(() => { bb.islandHover(open); }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); bb.islandHover(false); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);

  // alert loop
  useEffect(() => {
    if (!snap || !snap.state.settings.islandEnabled) return;
    if (isQuiet(snap)) return;
    const seen = snap.state.alertsSeen;
    const next = dueAlerts(snap).find((a) => !seen[a.key]);
    if (!next || alert) return;
    show(next);
    const today = ymd(new Date());
    update((st) => {
      const keep: Record<string, string> = {};
      for (const [k, d] of Object.entries(st.alertsSeen)) if (d >= ymd(new Date(Date.now() - 2 * 86400000))) keep[k] = d;
      return { ...st, alertsSeen: { ...keep, [next.key]: today } };
    });
  }, [snap, alert, show, update]);

  if (!snap || !snap.state.settings.islandEnabled) return null;
  const now = new Date(snap.now);
  const st = islandStatus(snap);
  const mood = MOOD[st.mood];
  const plan = buildPlan(snap, now, 3).filter((s) => !s.uploaded && s.state !== 'missed');
  const next = plan.find((s) => s.video) || null;
  const b = bufferInfo(snap);
  const allDone = st.todaySlots.length > 0 && st.todaySlots.every((s) => s.uploaded) && b.missing2 === 0;
  const enter = () => {
    clearTimeout(hoverT.current); bb.islandHover(true);
    if (alert) { clearTimeout(alertT.current); return; } // keep the alert while the mouse is on it
    hoverT.current = window.setTimeout(() => setOpen(true), 180);
  };
  const leave = () => {
    clearTimeout(hoverT.current);
    if (alert && !open) { alertT.current = window.setTimeout(() => setAlert(null), 2500); }
    hoverT.current = window.setTimeout(() => { setOpen(false); bb.islandHover(false); }, 350);
  };
  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 2500); };

  const runAction = async (a: Alert | null) => {
    if (!a) return;
    if (a.action === 'mail' && a.url) { await bb.openUrl(a.url); }
    else if (a.action === 'upload' && a.videoNum != null) { await doUploadPack(a.videoNum, flash); }
    else if (a.action === 'gen') { await bb.runGen(Math.max(1, b.missing2)); flash('Gen copied · paste in Claude'); }
    else if (a.action === 'csv') bb.showMain('analytics');
    else bb.showMain('upload');
  };

  const render = snap.render;
  const STRIP = 34;
  let width = render ? 150 : 120, height = STRIP, radius = 999;
  if (alert && !open) { width = 340; height = STRIP + 48; radius = 24; }
  if (open) { width = 760; height = STRIP + 330; radius = 30; }
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const doneN = st.todaySlots.filter((s) => s.uploaded).length;
  const nextMins = next ? minsUntil(next.when, now) : 0;
  const slotColor = (s: (typeof st.todaySlots)[number]) => s.uploaded ? '#7FD9A8' : s.state === 'overdue' || s.state === 'missing' ? '#FF8F7A' : s.state === 'next' ? '#FFC63A' : '#AAC3F0';
  const alertIcon = alert ? (alert.kind === 'upload' || alert.kind === 'overdue' ? 'upload' : alert.kind === 'csv' ? 'csv' : alert.kind === 'toast' ? 'sparkle' : alert.kind === 'comment' ? 'bell' : alert.kind === 'mail' ? 'mail' : 'film') : 'film';

  return <div className="island-wrap">
    <div className="island" style={{ width, height, borderRadius: radius }} onMouseEnter={enter} onMouseLeave={leave}>
      {/* the two dots: same spot in every state, click = open launcher */}
      <button className="isl-dots" onClick={() => { setOpen(false); setAlert(null); bb.islandHover(false); bb.showMain('today'); }} title="Open launcher" aria-label="Open launcher">
        <span className={st.mood === 'due' ? 'dot pulse' : 'dot'} style={{ background: mood, boxShadow: `0 0 8px ${mood}` }} />
        <span className={st.mood === 'due' ? 'dot pulse' : 'dot'} style={{ background: mood, boxShadow: `0 0 8px ${mood}` }} />
      </button>

      {/* strip around the dots */}
      {!open && !alert && render && <div className="isl-strip">
        <Icon name="film" size={13} color="#AAC3F0" /><span className="small num" style={{ color: '#AAC3F0' }}>{Math.round((render.progress ?? 0) * 100)}%</span>
      </div>}
      {open && <div className="isl-strip">
        <span className="small num" style={{ fontWeight: 700 }}>{time}</span>
        <span className="isl-pill" title={`${doneN} of ${st.todaySlots.length} uploaded today`}><Icon name="upload" size={12} />{doneN}/{st.todaySlots.length}</span>
      </div>}

      {!open && alert && <div className="pop isl-body" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) { setAlert(null); setOpen(true); } }} style={{ cursor: 'pointer', alignItems: 'center', gap: 10, padding: '0 10px 10px 12px' }}>
        <div className="isl-ico" style={{ background: alert.kind === 'overdue' ? 'rgba(255,107,92,.18)' : 'rgba(255,198,58,.16)' }}><Icon name={alertIcon} size={16} color={alert.kind === 'overdue' ? '#FF6B5C' : '#FFC63A'} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alert.title}</div><div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alert.sub}</div></div>
        {'action' in alert && alert.action && <button className="isl-btn primary" onClick={() => runAction(alert as Alert)} title={alert.action === 'upload' ? 'Prepare upload' : alert.action === 'gen' ? 'Run Gen' : alert.action === 'csv' ? 'Import CSV' : 'Open'} aria-label="Do it">
          <Icon name={alert.action === 'upload' ? 'upload' : alert.action === 'gen' ? 'play' : alert.action === 'csv' ? 'csv' : alert.action === 'mail' ? 'mail' : 'link'} size={15} color="#1A1404" sw={2.4} />
        </button>}
      </div>}

      {open && <AppCtx.Provider value={{ snap, update, toast: flash, go: (p) => bb.showMain(p) }}><div className="pop isl-body isl-dock">
        <div className="isl-row">
          <GenTile flash={flash} />
          <UploadTile flash={flash} />
        </div>
        <TodoTile />
        {note && <div className="isl-note">{note}</div>}
      </div></AppCtx.Provider>}
    </div>
  </div>;
}

/* ---------- Gen: pick a number, run ---------- */
function GenTile({ flash }: { flash: (m: string) => void }) {
  const { snap } = React.useContext(AppCtx)!;
  const b = bufferInfo(snap);
  const [n, setN] = useState(() => Math.max(1, Math.min(10, b.missing2 || 1)));
  const last = [...snap.videos].sort((x, y) => y.num - x.num)[0];
  const startK = last?.konzept != null ? ROTATION.indexOf(last.konzept) : -1;
  const nextK = Array.from({ length: Math.min(n, 6) }, (_, i) => ROTATION[(startK + 1 + i + ROTATION.length) % ROTATION.length]);
  const r = snap.render;
  const bc = b.days < 1 ? '#FF8F7A' : b.days < 2 ? '#FFC63A' : '#7FD9A8';
  return <div className="isl-tile f dk">
    <div className="dk-h"><Icon name="film" size={14} color="#FFD978" /><b>Gen</b><span className="isl-tag" style={{ marginLeft: 'auto', color: bc }}>{b.days}d buffer · {b.readyCount} ready</span></div>
    <div className="dk-gen">
      <div className="dk-step"><button onClick={() => setN(Math.max(1, n - 1))} aria-label="Fewer">−</button><b className="num">{n}</b><button onClick={() => setN(Math.min(10, n + 1))} aria-label="More">+</button></div>
      <button className="dk-go" onClick={async () => { await bb.runGen(n); flash(`"${n > 1 ? `Gen x${n}` : 'Gen'}" copied · paste in Claude`); }}><Icon name="play" size={12} color="#1A1404" sw={2.4} /> Run Gen{n > 1 ? ` x${n}` : ''}</button>
    </div>
    {r ? <div className="row" style={{ gap: 6, width: '100%' }}><Icon name="film" size={12} color="#AAC3F0" /><span className="isl-tag">#{r.video ?? ''}</span><div className="progress" style={{ flex: 1 }}><div style={{ width: `${Math.round((r.progress ?? 0) * 100)}%`, background: '#AAC3F0' }} /></div><span className="isl-tag num">{Math.round((r.progress ?? 0) * 100)}%</span></div>
      : <div className="dk-ks"><span className="isl-tag">Next</span>{nextK.map((k, i) => <span key={i} className="dk-k" title={KONZEPTE[k]?.name}><i style={{ background: kColor(k) }} />K{k} {KONZEPTE[k]?.name}</span>)}</div>}
    {last && <span className="isl-tag" style={{ marginTop: 'auto' }}>Last made #{last.num} · K{last.konzept ?? '?'} {KONZEPTE[last.konzept ?? 0]?.name ?? ''}</span>}
  </div>;
}

/* ---------- uploads: next one + 3 days of slots ---------- */
const SC = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: 'rgba(255,255,255,.3)' } as const;
function UploadTile({ flash }: { flash: (m: string) => void }) {
  const { snap, update } = React.useContext(AppCtx)!;
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 3);
  const next = plan.filter((x) => !x.uploaded && x.state !== 'missed').find((x) => x.video) || null;
  const mins = next ? minsUntil(next.when, now) : 0;
  const days = [0, 1, 2].map((i) => { const d = addDays(now, i); return { d, i, slots: plan.filter((x) => x.date === ymd(d)) }; });
  return <div className="isl-tile y dk" style={{ flex: 1.3 }}>
    <div className="dk-h"><Icon name="upload" size={14} color="#FFD978" /><b>Uploads</b>
      {next && <span className="isl-tag" style={{ marginLeft: 'auto', color: mins < 0 ? '#FF8F7A' : '#FFD978' }}>#{next.video!.num} · {next.time} · {mins < 0 ? fmtLate(mins) : fmtIn(mins)}</span>}</div>
    <div className="dk-days">
      {days.map(({ d, i, slots }) => <div key={i} className="dk-day"><span className="dk-dl">{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
        <div className="dk-slots">{slots.length ? slots.map((x) => <span key={x.time} className={`dk-slot ${x.state}`} style={{ ['--c' as string]: SC[x.state] }}>{x.uploaded ? <Tick size={9} color="#7FD9A8" /> : null}<b className="num">{x.time}</b>{x.video && !x.uploaded ? <small>#{x.video.num}</small> : null}</span>) : <span className="isl-tag">no posts</span>}</div></div>)}
    </div>
    {next && <div className="row" style={{ gap: 6, marginTop: 'auto' }}>
      <button className="dk-btn y" onClick={() => doUploadPack(next.video!.num, flash)}><Icon name="upload" size={12} color="#1A1404" sw={2.4} /> Upload pack #{next.video!.num}</button>
      <button className="dk-btn" onClick={async () => { await update(markUploaded(snap, next.video!.num)); flash(`#${next.video!.num} done`); }}><Tick size={11} color="#7FD9A8" /> Done</button>
    </div>}
  </div>;
}

/* ---------- to-do: drag between To do / In progress / Done ---------- */
function TodoTile() {
  const { snap } = React.useContext(AppCtx)!;
  const today = ymd(new Date(snap.now));
  const all = allTasks(snap);
  const { drag, over, onDown } = useTaskDrag(all);
  const pick = (c: string) => all.filter((t) => t.col === c && (c === 'prog' || !t.due || (c === 'done' ? t.due >= today : t.due <= today)));
  const dragged = drag ? all.find((t) => t.id === drag.id) : null;
  const card = (t: Task, ghost = false) => <div key={t.id + (ghost ? 'g' : '')} className={`dk-card ${t.col} ${ghost ? 'ghost' : ''} ${!ghost && drag?.id === t.id ? 'drag' : ''}`}
    style={ghost ? { left: drag!.x, top: drag!.y, width: drag!.w } : undefined} onPointerDown={ghost ? undefined : (e) => onDown(e, t)}>
    <i style={{ background: kColor(t.konzept) }} /><span>{t.title}</span>{t.prio && <em>{t.prio}</em>}
  </div>;
  return <div className="isl-tile dk" style={{ flex: 'none' }}>
    <div className="dk-h"><Icon name="check" size={14} color="#AAC3F0" /><b>To do</b><span className="isl-tag" style={{ marginLeft: 'auto' }}>drag between columns</span></div>
    <div className="dk-board">
      {COLS.map((c) => { const list = pick(c.key); return <div key={c.key} data-col={c.key} className={`dk-col ${over === c.key ? 'over' : ''}`}>
        <div className="dk-ch"><i style={{ background: c.dot }} />{c.name}<span>{list.length}</span></div>
        {list.slice(0, 4).map((t) => card(t))}
        {list.length > 4 && <span className="isl-tag" style={{ paddingLeft: 4 }}>+{list.length - 4} more</span>}
        {!list.length && <span className="dk-empty">Drop here</span>}
      </div>; })}
    </div>
    {dragged && drag && createPortal(card(dragged, true), document.body)}
  </div>;
}

createRoot(document.getElementById('root')!).render(<Island />);
