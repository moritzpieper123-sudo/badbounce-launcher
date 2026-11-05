import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import { useSnapshot } from './store';
import { bb } from './bridge';
import { bufferInfo, dueAlerts, fmtLate, isQuiet, islandStatus, KONZEPTE, kColor, buildPlan, fmtIn, minsUntil, ymd, type Alert } from './logic';
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
  if (open) { width = 440; height = STRIP + 132; radius = 28; }
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

      {open && <div className="pop isl-body" style={{ padding: '2px 12px 12px', gap: 8 }}>
        {/* today: one bubble per slot */}
        <div className="isl-tile" style={{ flex: 1.45 }} title="Today's uploads">
          <Icon name="calendar" size={14} color="#AAC3F0" />
          <div className="isl-slots">
            {st.todaySlots.length ? st.todaySlots.map((s) => { const c = slotColor(s); return <div key={s.time} className="isl-slot" title={`${s.time} · ${s.video ? '#' + s.video.num : 'no video'} · ${s.uploaded ? 'uploaded' : s.state}`}>
              <span className="isl-bubble" style={{ borderColor: c, background: s.uploaded ? c : 'transparent' }}>{s.uploaded ? <Tick size={10} color="#0B2016" /> : !s.video ? <span style={{ color: c, fontWeight: 800, fontSize: 11 }}>!</span> : null}</span>
              <span className="num" style={{ fontSize: 10, color: 'var(--dim)' }}>{s.time}</span>
            </div>; }) : <span className="small dim">Rest day</span>}
          </div>
          {allDone ? <span className="isl-tag" style={{ color: '#7FD9A8' }}><Tick size={10} color="#7FD9A8" /> all done</span>
            : render ? <div className="row" style={{ gap: 6, width: '100%' }}><Icon name="film" size={12} color="#AAC3F0" /><div className="progress"><div style={{ width: `${Math.round((render.progress ?? 0) * 100)}%`, background: '#AAC3F0' }} /></div></div>
            : <span className="isl-tag" title="Buffer: days covered by ready videos"><Icon name="film" size={11} />{b.days}d buffer</span>}
        </div>

        {/* next upload */}
        <div className="isl-tile y" title="Next upload">
          {next ? <>
            <div className="row" style={{ gap: 6 }}><span className="dot" style={{ background: kColor(next.video!.konzept) }} title={KONZEPTE[next.video!.konzept ?? 0]?.name} /><span style={{ fontSize: 20, fontWeight: 800 }}>#{next.video!.num}</span></div>
            <span className="isl-tag" style={{ color: nextMins < 0 ? '#FF8F7A' : '#FFD978' }}>{next.time} · {nextMins < 0 ? (nextMins > -60 ? `${-nextMins}m late` : `${Math.floor(-nextMins / 60)}h late`) : fmtIn(nextMins)}</span>
            <div className="row" style={{ gap: 6, marginTop: 'auto' }}>
              <button className="isl-btn primary" onClick={() => doUploadPack(next.video!.num, flash)} title="Upload pack: video, thumbnail, description" aria-label="Upload pack"><Icon name="upload" size={15} color="#1A1404" sw={2.4} /></button>
              <button className="isl-btn" onClick={async () => { await update(markUploaded(snap, next.video!.num)); flash(`#${next.video!.num} done`); }} title="Mark uploaded" aria-label="Mark uploaded"><Tick size={13} color="#7FD9A8" /></button>
            </div>
          </> : <><Icon name="upload" size={18} color="#FFD978" /><span className="isl-tag">no video ready</span></>}
        </div>

        {/* make videos */}
        <div className="isl-tile f" title="Make videos">
          <div className="row" style={{ gap: 6 }}><Icon name="film" size={16} color="#C9CCF5" /><span style={{ fontSize: 20, fontWeight: 800 }}>{b.missing2 > 0 ? b.missing2 : <Tick size={16} color="#7FD9A8" />}</span></div>
          <span className="isl-tag">{b.missing2 > 0 ? 'to make' : `${b.readyCount} ready`}</span>
          <button className={`isl-btn ${b.missing2 > 0 ? 'white' : ''}`} style={{ marginTop: 'auto', width: 'auto', padding: '0 10px', gap: 5 }} onClick={async () => { const n = Math.max(1, b.missing2); await bb.runGen(n); flash(`"Gen x${n}" copied`); }} title={`Copy "Gen x${Math.max(1, b.missing2)}" and open Claude`} aria-label="Run Gen">
            <Icon name="play" size={12} color={b.missing2 > 0 ? '#12152A' : '#C9CCF5'} />{'Gen' + (b.missing2 > 1 ? ' x' + b.missing2 : '')}
          </button>
        </div>
        {note && <div className="isl-note">{note}</div>}
      </div>}
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Island />);
