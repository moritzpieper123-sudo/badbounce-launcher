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
import { TikTokLogo } from './logos';

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
  if (open) { width = 600; height = STRIP + 262; radius = 30; }
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

/* ---------- small visual helpers ---------- */
const short = (mins: number) => { const m = Math.abs(mins); const t = m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; return mins < 0 ? `-${t}` : t; };
function Ring({ frac, color, size = 54, children, title }: { frac: number; color: string; size?: number; children?: React.ReactNode; title?: string }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return <div className="dk-ring" style={{ width: size, height: size }} title={title}>
    <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(170,195,240,.14)" strokeWidth="4" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, frac)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset .6s' }} /></svg>
    <span>{children}</span>
  </div>;
}

/* ---------- Gen: buffer ring, big play button, next Konzepte ---------- */
function GenTile({ flash }: { flash: (m: string) => void }) {
  const { snap } = React.useContext(AppCtx)!;
  const b = bufferInfo(snap);
  const [n, setN] = useState(() => Math.max(1, Math.min(10, b.missing2 || 1)));
  const last = [...snap.videos].sort((x, y) => y.num - x.num)[0];
  const startK = last?.konzept != null ? ROTATION.indexOf(last.konzept) : -1;
  const nextK = Array.from({ length: Math.min(n, 6) }, (_, i) => ROTATION[(startK + 1 + i + ROTATION.length) % ROTATION.length]);
  const r = snap.render;
  const bc = b.days < 1 ? '#FF8F7A' : b.days < 2 ? '#FFC63A' : '#7FD9A8';
  return <div className="isl-tile f dk dk-gen">
    {r ? <Ring frac={r.progress ?? 0} color="#AAC3F0" title={`Rendering ${r.video ?? ''}`}><Icon name="film" size={13} color="#AAC3F0" /><b>{Math.round((r.progress ?? 0) * 100)}%</b></Ring>
      : <Ring frac={b.days / 3} color={bc} title={`Buffer: ${b.days} day(s) covered · ${b.readyCount} videos ready`}><Icon name="film" size={13} color={bc} /><b>{b.days}d</b></Ring>}
    <div className="dk-genmid">
      <div className="dk-play-row">
        <button className="dk-pm" onClick={() => setN(Math.max(1, n - 1))} aria-label="Fewer" title="Fewer">−</button>
        <button className="dk-play" onClick={async () => { await bb.runGen(n); flash(`"${n > 1 ? `Gen x${n}` : 'Gen'}" copied`); }} title={`Run Gen x${n} (copies the command and opens Claude)`} aria-label="Run Gen"><Icon name="play" size={22} color="#1A1404" sw={2.4} /><i>×{n}</i></button>
        <button className="dk-pm" onClick={() => setN(Math.min(10, n + 1))} aria-label="More" title="More">+</button>
      </div>
      <div className="dk-kdots">{nextK.map((k, i) => <span key={i} className="dk-kd" style={{ background: kColor(k), boxShadow: `0 0 8px ${kColor(k)}` }} title={`Next: Konzept ${k} · ${KONZEPTE[k]?.name}`}>{k}</span>)}</div>
    </div>
  </div>;
}

/* ---------- uploads: next video + slot bubbles for 3 days ---------- */
const SC = { uploaded: '#7FD9A8', ready: '#AAC3F0', next: '#FFC63A', missing: '#FF8F7A', overdue: '#FF8F7A', missed: 'rgba(255,255,255,.25)' } as const;
function UploadTile({ flash }: { flash: (m: string) => void }) {
  const { snap, update } = React.useContext(AppCtx)!;
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 3);
  const next = plan.filter((x) => !x.uploaded && x.state !== 'missed').find((x) => x.video) || null;
  const mins = next ? minsUntil(next.when, now) : 0;
  const days = [0, 1, 2].map((i) => { const d = addDays(now, i); return { d, i, slots: plan.filter((x) => x.date === ymd(d)) }; });
  const v = next?.video;
  const thumb = v?.thumbFile ? bb.fileUrl(v.thumbFile) : '';
  return <div className="isl-tile y dk dk-up">
    {v ? <div className="dk-next">
      <div className="dk-thumb" style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined} title={`Next upload #${v.num} · ${next!.time}`}>
        {!thumb && <Icon name="film" size={16} color="#FFD978" />}<b>#{v.num}</b>
      </div>
      <div className="dk-nextside">
        <span className="dk-count" style={{ color: mins < 0 ? '#FF8F7A' : '#FFD978' }} title={`${next!.time} · ${mins < 0 ? fmtLate(mins) : fmtIn(mins)}`}><Icon name="calendar" size={11} color="currentColor" />{short(mins)}</span>
        <button className="dk-ib y" onClick={() => doUploadPack(v.num, flash)} title="Upload pack: video, thumbnail, description" aria-label="Upload pack"><Icon name="upload" size={15} color="#1A1404" sw={2.4} /></button>
        <button className="dk-ib" onClick={async () => { await update(markUploaded(snap, v.num)); flash(`#${v.num} done`); }} title="Mark uploaded" aria-label="Mark uploaded"><Tick size={12} color="#7FD9A8" /></button>
        <button className="dk-ib" onClick={() => bb.openUrl('https://www.tiktok.com/tiktokstudio/upload')} title="Open TikTok Studio" aria-label="Open TikTok Studio"><TikTokLogo size={14} /></button>
      </div>
    </div> : <div className="dk-next empty" title="No ready video"><Icon name="film" size={20} color="#FF8F7A" /></div>}
    <div className="dk-week">
      {days.map(({ d, i, slots }) => <div key={i} className={`dk-dcol ${i === 0 ? 'today' : ''}`} title={d.toLocaleDateString('en-GB', { weekday: 'long' })}>
        <span className="dk-wd">{i === 0 ? '●' : d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}</span>
        {slots.length ? slots.map((x) => <span key={x.time} className="dk-bub" style={{ borderColor: SC[x.state], background: x.uploaded ? SC[x.state] : x.state === 'next' ? 'rgba(255,198,58,.18)' : 'transparent', boxShadow: x.state === 'next' ? '0 0 10px rgba(255,198,58,.5)' : undefined }}
          title={`${x.time} · ${x.video ? '#' + x.video.num : 'no video'} · ${x.state}`}>{x.uploaded ? <Tick size={9} color="#0B2016" /> : x.video ? <small>{x.video.num}</small> : <small style={{ color: SC[x.state] }}>!</small>}</span>)
          : <span className="dk-rest" title="No posts">–</span>}
      </div>)}
    </div>
  </div>;
}

/* ---------- to-do: drag between To do / In progress / Done ---------- */
const COL_ICON: Record<string, string> = { todo: 'check', prog: 'half', done: 'check' };
function TodoTile() {
  const { snap } = React.useContext(AppCtx)!;
  const today = ymd(new Date(snap.now));
  const all = allTasks(snap);
  const { drag, over, onDown } = useTaskDrag(all);
  const pick = (c: string) => all.filter((t) => t.col === c && (c === 'prog' || !t.due || (c === 'done' ? t.due >= today : t.due <= today)));
  const dragged = drag ? all.find((t) => t.id === drag.id) : null;
  const card = (t: Task, ghost = false) => <div key={t.id + (ghost ? 'g' : '')} className={`dk-card ${t.col} ${ghost ? 'ghost' : ''} ${!ghost && drag?.id === t.id ? 'drag' : ''}`}
    style={ghost ? { left: drag!.x, top: drag!.y, width: drag!.w } : undefined} onPointerDown={ghost ? undefined : (e) => onDown(e, t)} title={t.title}>
    <i style={{ background: kColor(t.konzept) }} /><span>{t.title}</span>{t.prio && <em>!</em>}
  </div>;
  return <div className="isl-tile dk" style={{ flex: 'none', padding: 8 }}>
    <div className="dk-board">
      {COLS.map((c) => { const list = pick(c.key); return <div key={c.key} data-col={c.key} className={`dk-col ${c.key} ${over === c.key ? 'over' : ''}`} title={c.name}>
        <div className="dk-ch"><span className="dk-ci" style={{ color: c.dot, borderColor: c.dot, background: c.key === 'done' ? c.dot : 'transparent' }}>{c.key === 'done' ? <Tick size={9} color="#0B2016" /> : c.key === 'prog' ? <Icon name="half" size={10} color={c.dot} /> : null}</span><b>{list.length}</b></div>
        {list.slice(0, 4).map((t) => card(t))}
        {list.length > 4 && <span className="dk-more">+{list.length - 4}</span>}
      </div>; })}
    </div>
    {dragged && drag && createPortal(card(dragged, true), document.body)}
  </div>;
}

createRoot(document.getElementById('root')!).render(<Island />);
