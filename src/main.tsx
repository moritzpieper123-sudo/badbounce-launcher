import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import { useSnapshot } from './store';
import { AppCtx } from './ctx';
import { Background, Icon, Toast, useNow, ThemeButton } from './ui';
import './theme';
import { bb, isDesktop } from './bridge';
import { Gate, ShareSheet } from './cloud/Gate';
import { cloudConfigured } from './cloud/client';
import { listenPhone, syncTick } from './cloud/pcSync';
import { useRef } from 'react';
import { csvDue, bufferInfo, allTasks, ymd } from './logic';
import type { AppState, Snapshot } from './types';
import type { CsvStatus } from './bridge';
import { importCsvTexts } from './csvImport';
import VaultGraphPage from './pages/VaultGraph';
import { Search } from './search';
import avatarUrl from './assets/avatar.webp';
import Today from './pages/Today';
import Schedule from './pages/Schedule';
import Board from './pages/Board';
import Upload from './pages/Upload';
import Analytics from './pages/Analytics';
import Library from './pages/Library';
import Overview from './pages/Overview';
import Ideas from './pages/Ideas';
import Tools from './pages/Tools';
import Settings from './pages/Settings';
import Mail from './pages/Mail';

const PAGES = [
  { id: 'today', label: 'Today', short: 'Today', icon: 'home' },
  { id: 'schedule', label: 'Upload schedule', short: 'Schedule', icon: 'calendar' },
  { id: 'upload', label: 'Next upload', short: 'Upload', icon: 'upload' },
  { id: 'board', label: 'To do', short: 'To do', icon: 'check' },
  { id: 'analytics', label: 'Analytics', short: 'Analytics', icon: 'chart' },
  { id: 'library', label: 'Library', short: 'Library', icon: 'grid' },
  { id: 'overview', label: 'Overview (final Konzepte)', short: 'Overview', icon: 'film' },
  { id: 'ideas', label: 'Idea inbox', short: 'Ideas', icon: 'bulb' },
  { id: 'mail', label: 'Inbox', short: 'Inbox', icon: 'mail' },
  { id: 'vault', label: 'Vault graph', short: 'Vault', icon: 'graph', desktop: true },
  { id: 'tools', label: 'Tools', short: 'Tools', icon: 'tools' },
].filter((p) => !p.desktop || isDesktop);
const PHONE_NAV = ['today', 'schedule', 'board', 'mail'];
const Logo = ({ id }: { id: string }) => <svg className="brand" viewBox="0 0 40 40" aria-hidden="true">
  <defs><radialGradient id={`bb-ball-${id}`} cx=".42" cy=".38" r=".6"><stop offset="0" stopColor="#fff" /><stop offset=".55" stopColor="#F4F6FF" /><stop offset="1" stopColor="#AAC3F0" /></radialGradient>
    <radialGradient id={`bb-halo-${id}`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#F4F6FF" stopOpacity=".55" /><stop offset="1" stopColor="#F4F6FF" stopOpacity="0" /></radialGradient></defs>
  <rect x="1" y="1" width="38" height="38" rx="12" fill="#0E162A" stroke="#AAC3F0" strokeOpacity=".45" />
  <circle cx="20" cy="17" r="11" fill={`url(#bb-halo-${id})`} />
  <circle cx="20" cy="17" r="6" fill={`url(#bb-ball-${id})`} />
  <rect x="9" y="29" width="22" height="3" rx="1.5" fill="#FFC63A" />
</svg>;

function App() {
  const { snap, update } = useSnapshot();
  const [page, setPage] = useState(() => (location.hash.slice(1) || 'today'));
  const [msg, setMsg] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [csv, setCsv] = useState<CsvStatus>({ state: 'idle', msg: '' });
  const go = useCallback((p: string) => { setPage(p); location.hash = p; window.scrollTo(0, 0); }, []);
  useEffect(() => bb.onNavigate((p) => go(p)), [go]);
  useEffect(() => { const h = () => { const p = location.hash.slice(1); if (p) setPage(p); }; addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  const toast = useCallback((m: string) => setMsg(m), []);
  // background CSV fetch: status + the files it brings back
  const updRef = useRef(update); updRef.current = update;
  useEffect(() => bb.onCsvStatus?.((st) => { setCsv(st); if (st.state === 'error' || st.state === 'login' || st.state === 'needs-you') setMsg(st.msg); }), []);
  useEffect(() => bb.onCsvFiles?.(async (files) => { await importCsvTexts(files, updRef.current, setMsg); }), []);
  // PC: keep the phone in sync
  const snapRef = useRef(snap); snapRef.current = snap;
  const apply = useCallback((st: AppState) => update(() => st), [update]);
  useEffect(() => { if (!isDesktop || !cloudConfigured) return; return listenPhone(() => snapRef.current, apply); }, [apply]);
  useEffect(() => { if (!isDesktop || !cloudConfigured || !snap) return; const t = setTimeout(() => syncTick(snap, apply), 2500); return () => clearTimeout(t); }, [snap, apply]);
  if (!snap) return <><Background /><div style={{ padding: 40, position: 'relative' }} className="muted">Loading…</div></>;
  const ctx = { snap, update, toast, go };
  if (page === 'vault-solo') return <AppCtx.Provider value={ctx}><Background /><div className="graph-solo" style={{ position: 'relative', padding: 16 }}><VaultGraphPage solo /></div><Toast msg={msg} onDone={() => setMsg(null)} /></AppCtx.Provider>;
  const due = csvDue(snap);
  const buf = bufferInfo(snap);
  const today = ymd(new Date(snap.now));
  const dueTasks = allTasks(snap).filter((t) => t.col !== 'done' && (!t.due || t.due <= today)).length;
  const counts: Record<string, number> = { board: dueTasks, mail: snap.mail?.unread ?? 0 };
  const cur = PAGES.find((p) => p.id === page) ?? { label: 'Settings', short: 'Settings' };
  const backup = async () => { const p = await bb.backupNow(); update((s) => ({ ...s, lastBackup: new Date().toISOString() })); toast(`Saved backup: ${p.split(/[\\/]/).pop()}`); };
  const checkUpdate = async () => {
    if (snap.update?.ready) { toast(`Installing update ${snap.update.ready}…`); if (!(await bb.applyUpdate?.())) toast('Update failed, try again later'); return; }
    if (!bb.checkUpdate) return;
    toast('Checking for updates…');
    const r = await bb.checkUpdate();
    toast(r.error ? `Update check failed: ${r.error}` : r.ready ? `Update ${r.ready} is ready · click the button again to install` : `You are up to date (v${r.current})`);
  };
  const fetchCsv = () => { if (!bb.csvFetch) { go('analytics'); return; } setCsv({ state: 'running', msg: 'Starting…' }); bb.csvFetch(); };
  const Page = { today: Today, schedule: Schedule, board: Board, upload: Upload, analytics: Analytics, library: Library, overview: Overview, ideas: Ideas, mail: Mail, tools: Tools, settings: Settings, vault: VaultGraphPage }[page] || Today;
  const notes = notifications(snap, { due, buf, dueTasks, csv });
  const bellProps = { notes, go, fetchCsv, csv };
  const navIdx = PAGES.findIndex((p) => p.id === page);
  return (
    <AppCtx.Provider value={ctx}>
      <Background />
      <aside className="glass vrail hide-phone" aria-label="Main">
        <button className="brand-btn" onClick={() => go('today')} aria-label="Today"><Logo id="pc" /></button>
        <nav className="vnav">
          <i className="vind" style={{ transform: `translateY(${Math.max(0, navIdx) * 50}px)`, opacity: navIdx < 0 ? 0 : 1 }} />
          {PAGES.map((p) => <button key={p.id} className={`vbtn ${page === p.id ? 'on' : ''}`} onClick={() => go(p.id)} aria-label={p.label}>
            <Icon name={p.icon} size={19} />
            {counts[p.id] > 0 && <span className="vcount">{Math.min(99, counts[p.id])}</span>}
            {p.id === 'analytics' && due && <span className="vdot" />}
            <span className="tip">{p.label}</span>
          </button>)}
        </nav>
        <div className="vfoot">
          {isDesktop && <button className={`vbtn upd ${snap.update?.ready ? 'ready' : ''}`} onClick={checkUpdate} aria-label="Updates"><Icon name="update" size={18} />{snap.update?.ready && <span className="vdot" />}<span className="tip">{snap.update?.ready ? `Install update ${snap.update.ready}` : 'Check for updates'}</span></button>}
          <button className="vbtn" onClick={backup} aria-label="Save backup now"><Icon name="save" size={18} /><span className="tip">Save backup now</span></button>
          <button className={`vbtn ${page === 'settings' ? 'on' : ''}`} style={page === 'settings' ? { background: 'var(--hl)', boxShadow: '0 0 24px var(--hl-glow)' } : undefined} onClick={() => go('settings')} aria-label="Settings"><Icon name="gear" size={18} /><span className="tip">Settings</span></button>
        </div>
      </aside>
      <div className="shell">
        <header className="topline hide-phone">
          <div className="tl-left">
            <div className="glass tpill ws">
              <span className="ws-av"><img src={avatarUrl} alt="" /><i className={snap.vaultOk ? '' : 'bad'} /></span>
              <span className="ws-name"><b>Badbounce</b><small>@badb0unce</small></span>
              <span className="crumb"><span>Launcher</span><span>›</span><b>{cur.short}</b></span>
            </div>
            <Search snap={snap} go={go} pages={PAGES} actions={{ backup, fetchCsv }} />
          </div>
          <div className="tl-island" aria-hidden="true" />
          <div className="tl-right">
            {csv.state !== 'idle' && csv.state !== 'done' && <CsvPill csv={csv} />}
            <button className="btn accent pillbtn" onClick={() => go('ideas')}><Icon name="plus" size={15} sw={2.4} /> Idea</button>
            <ThemeButton className="glass theme-pill" label />
            <Clock ok={snap.vaultOk} />
            <Bell {...bellProps} />
            {isDesktop && bb.win && <div className="glass tpill winbtns">
              <button onClick={() => bb.win!('min')} title="Minimize" aria-label="Minimize"><Icon name="wmin" size={14} /></button>
              <button onClick={() => bb.win!('full')} title={snap.winFull ? 'Window (F11)' : 'Fullscreen (F11)'} aria-label="Toggle fullscreen"><Icon name={snap.winFull ? 'wrestore' : 'wmax'} size={14} /></button>
              <button className="x" onClick={() => bb.win!('close')} title="Close to tray" aria-label="Close"><Icon name="wclose" size={14} /></button>
            </div>}
          </div>
        </header>
        <header className="ptop phone-only">
          <button className="tb-brand" onClick={() => go('today')} aria-label="Today"><Logo id="ph" /></button>
          <div className="ptitle"><span>Badbounce</span><b>{cur.short}</b></div>
          <ThemeButton className="iconbtn sm" />
          <Bell {...bellProps} small />
          <button className="btn sm accent" onClick={() => go('ideas')} aria-label="New idea"><Icon name="plus" size={14} sw={2.6} /> Idea</button>
        </header>
        <nav className="glass pnav phone-only" aria-label="Main">
          {PHONE_NAV.map((id) => { const p = PAGES.find((x) => x.id === id)!; return (
            <button key={id} className={`pnav-btn ${page === id ? 'on' : ''}`} onClick={() => { setMore(false); go(id); }} aria-label={p.label}>
              <span className="pi"><Icon name={p.icon} size={21} />{counts[id] > 0 && <span className="count">{Math.min(99, counts[id])}</span>}</span>
              <span className="pl">{p.short}</span>
            </button>); })}
          <button className={`pnav-btn ${more || !PHONE_NAV.includes(page) ? 'on' : ''}`} onClick={() => setMore((m) => !m)} aria-label="More pages">
            <span className="pi"><Icon name="more" size={21} />{due && <span className="badge-dot" />}</span><span className="pl">More</span>
          </button>
        </nav>
        {more && <div className="pmore-back phone-only" onClick={() => setMore(false)}>
          <div className="glass pmore" onClick={(e) => e.stopPropagation()}>
            {[...PAGES.filter((p) => !PHONE_NAV.includes(p.id)), { id: 'settings', label: 'Settings', short: 'Settings', icon: 'gear' }].map((p) =>
              <button key={p.id} className={`pmore-btn ${page === p.id ? 'on' : ''}`} onClick={() => { setMore(false); go(p.id); }}>
                <span className="pi"><Icon name={p.icon} size={20} />{p.id === 'analytics' && due && <span className="badge-dot" />}</span>{p.short}
              </button>)}
          </div>
        </div>}
        <main className="content" key={page}>
          {!snap.vaultOk && <div className="glass card" style={{ borderColor: 'rgba(255,143,122,.5)' }}><b>Vault not found.</b><span className="muted">Expected the Badbounce folder at {snap.vaultPath}. Change it in Settings (gear icon).</span></div>}
          {(due || buf.days < 1) && page !== 'vault' && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {due && <button className="btn sm pill-alert" onClick={fetchCsv} disabled={csv.state === 'running'}><Icon name="download" size={15} /> Weekly TikTok CSV is due · {isDesktop ? 'fetch it automatically' : 'import on the PC'}</button>}
              {due && isDesktop && <button className="btn sm" onClick={() => go('analytics')}><Icon name="csv" size={15} /> Import by hand</button>}
              {buf.days < 1 && buf.missing2 > 0 && <button className="btn sm pill-alert" onClick={() => bb.runGen(buf.missing2)}><Icon name="film" size={15} /> Buffer under 1 day · Gen x{buf.missing2}</button>}
            </div>
          )}
          <Page />
        </main>
      </div>
      <Toast msg={msg} onDone={() => setMsg(null)} />
      {!isDesktop && <ShareSheet />}
    </AppCtx.Provider>
  );
}

/* ---------- top bar pieces ---------- */
interface Note { key: string; icon: string; title: string; sub: string; y?: boolean; act?: () => void; extra?: React.ReactNode }
function notifications(snap: Snapshot, o: { due: boolean; buf: ReturnType<typeof bufferInfo>; dueTasks: number; csv: CsvStatus }): (Note & { kind: string })[] {
  const out: (Note & { kind: string })[] = [];
  if (o.due) out.push({ kind: 'csv', key: 'csv', icon: 'csv', y: true, title: 'Weekly TikTok CSV is due', sub: o.csv.state === 'running' ? o.csv.msg : 'Fetch it in the background, or import it by hand' });
  if (o.buf.days < 1 && o.buf.missing2 > 0) out.push({ kind: 'gen', key: 'buf', icon: 'film', y: true, title: `Buffer under 1 day`, sub: `Make ${o.buf.missing2} video${o.buf.missing2 > 1 ? 's' : ''} with Gen` });
  if (o.dueTasks) out.push({ kind: 'board', key: 'tasks', icon: 'check', title: `${o.dueTasks} task${o.dueTasks > 1 ? 's' : ''} due`, sub: 'Today and late' });
  if (snap.mail?.unread) out.push({ kind: 'mail', key: 'mail', icon: 'mail', title: `${snap.mail.unread} unread email${snap.mail.unread > 1 ? 's' : ''}`, sub: snap.mail.items.find((m) => m.unread)?.subject ?? '' });
  if (snap.update?.ready) out.push({ kind: 'update', key: 'upd', icon: 'sparkle', y: true, title: `Update ${snap.update.ready} is ready`, sub: 'Restarts the launcher' });
  return out;
}
function Bell({ notes, go, fetchCsv, csv, small }: { notes: ReturnType<typeof notifications>; go: (p: string) => void; fetchCsv: () => void; csv: CsvStatus; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; addEventListener('mousedown', h); return () => removeEventListener('mousedown', h); }, [open]);
  const n = notes.length, hot = notes.some((x) => x.y);
  const act = (k: string) => { setOpen(false); if (k === 'board') go('board'); else if (k === 'mail') go('mail'); else if (k === 'gen') go('today'); else if (k === 'update') bb.applyUpdate?.(); };
  return <div ref={ref} style={{ position: 'relative' }}>
    <button className={small ? 'iconbtn sm' : `glass round ${hot ? 'ring-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={`${n} notifications`} title="Notifications" style={small ? { position: 'relative' } : undefined}>
      <Icon name="bell" size={small ? 16 : 18} />{n > 0 && <span className="vcount" style={small ? { position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--yellow)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>{n}</span>}
    </button>
    {open && <div className="glass dropdown right" style={small ? { position: 'fixed', top: 64, left: 12, right: 12, width: 'auto' } : undefined}>
      <div className="dd-head">Notifications</div>
      {!n && <div className="dd-item" style={{ cursor: 'default' }}><span className="dd-ico"><Icon name="check" size={16} /></span><span className="dd-txt"><span>All clear</span><small>Nothing needs you right now</small></span></div>}
      {notes.map((x) => <React.Fragment key={x.key}>
        <button className="dd-item" onClick={() => (x.kind === 'csv' ? undefined : act(x.kind))} style={x.kind === 'csv' ? { cursor: 'default' } : undefined}>
          <span className={`dd-ico ${x.y ? 'y' : ''}`}><Icon name={x.icon} size={16} /></span>
          <span className="dd-txt"><span>{x.title}</span><small>{x.sub}</small></span>
        </button>
        {x.kind === 'csv' && <div className="dd-acts">
          {isDesktop ? <>
            <button className="btn sm accent" disabled={csv.state === 'running' || csv.state === 'login'} onClick={() => { fetchCsv(); setOpen(false); }}><Icon name="download" size={14} sw={2.4} /> {csv.state === 'running' ? 'Fetching…' : 'Fetch automatically'}</button>
            <button className="btn sm" onClick={() => { setOpen(false); go('analytics'); }}>Import by hand</button>
          </> : <span className="small dim">The automatic fetch runs on the PC launcher.</span>}
        </div>}
        {x.kind === 'gen' && <div className="dd-acts"><button className="btn sm accent" onClick={() => { setOpen(false); bb.runGen(1); }}><Icon name="film" size={14} /> Run Gen</button></div>}
      </React.Fragment>)}
    </div>}
  </div>;
}
function CsvPill({ csv }: { csv: CsvStatus }) {
  const need = csv.state === 'login' || csv.state === 'needs-you' || csv.state === 'error';
  return <button className={`glass fetch-pill ${need ? 'need' : ''}`} onClick={() => (need ? bb.csvShow?.() : undefined)} title={csv.msg}>
    {need ? <Icon name="csv" size={15} /> : <Icon name="download" size={15} />}
    {csv.state === 'running' ? <><span>CSV · {csv.msg}</span><span className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.25)', borderTopColor: 'var(--yellow)', borderRadius: '50%' }} /></> : <span>{csv.state === 'login' ? 'Log in to TikTok' : csv.state === 'needs-you' ? 'CSV needs one click' : 'CSV fetch failed'}</span>}
    {need && <span className="small dim" onClick={(e) => { e.stopPropagation(); bb.csvCancel?.(); }} style={{ marginLeft: 4 }}>✕</span>}
  </button>;
}
function Clock({ ok }: { ok: boolean }) {
  const now = useNow(15000);
  return <div className="glass tpill clock" title={isDesktop ? (ok ? 'Vault connected' : 'Vault missing') : 'Synced with PC'}>
    <b>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
    <small>{now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</small>
  </div>;
}
// phone: GitHub Pages caches the page ~10 min; check for a newer build when the app comes to the front
if (!isDesktop) {
  const mine = [...document.scripts].map((x) => x.src).find((x) => /assets\/main-/.test(x)) ?? '';
  const check = async () => {
    try {
      const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
      const m = html.match(/assets\/main-[\w-]+\.js/);
      if (m && mine && !mine.endsWith(m[0])) {
        let last = 0; try { last = +(sessionStorage.getItem('bb-reload') || 0); sessionStorage.setItem('bb-reload', String(Date.now())); } catch { /* ignore */ }
        if (Date.now() - last > 60e3) location.replace('./index.html?v=' + m[0].slice(12, 20) + location.hash);
      }
    } catch { /* offline */ }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60e3);
  check();
}
// iOS ignores user-scalable=no in Safari: block pinch and double-tap zoom by hand (phone only)
if (!isDesktop) {
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTouch < 300 && !(e.target as HTMLElement).closest('input,textarea,select')) e.preventDefault(); lastTouch = n; }, { passive: false });
}
createRoot(document.getElementById('root')!).render(<Gate><App /></Gate>);
