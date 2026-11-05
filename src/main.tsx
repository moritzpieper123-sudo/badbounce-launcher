import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { useSnapshot } from './store';
import { AppCtx } from './ctx';
import { Background, Icon, Toast } from './ui';
import { bb, isDesktop } from './bridge';
import { Gate, ShareSheet } from './cloud/Gate';
import { cloudConfigured } from './cloud/client';
import { listenPhone, syncTick } from './cloud/pcSync';
import { useRef } from 'react';
import { csvDue, bufferInfo } from './logic';
import type { AppState } from './types';
import Today from './pages/Today';
import Schedule from './pages/Schedule';
import Board from './pages/Board';
import Upload from './pages/Upload';
import Analytics from './pages/Analytics';
import Library from './pages/Library';
import Ideas from './pages/Ideas';
import Tools from './pages/Tools';
import Settings from './pages/Settings';

const PAGES = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'schedule', label: 'Upload schedule', icon: 'calendar' },
  { id: 'upload', label: 'Next upload', icon: 'upload' },
  { id: 'board', label: 'To do', icon: 'check' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'library', label: 'Library', icon: 'grid' },
  { id: 'ideas', label: 'Idea inbox', icon: 'bulb' },
  { id: 'tools', label: 'Tools', icon: 'tools' },
];

function App() {
  const { snap, update } = useSnapshot();
  const [page, setPage] = useState(() => (location.hash.slice(1) || 'today'));
  const [msg, setMsg] = useState<string | null>(null);
  const go = useCallback((p: string) => { setPage(p); location.hash = p; window.scrollTo(0, 0); }, []);
  useEffect(() => bb.onNavigate((p) => go(p)), [go]);
  const toast = useCallback((m: string) => setMsg(m), []);
  // PC: keep the phone in sync
  const snapRef = useRef(snap); snapRef.current = snap;
  const apply = useCallback((st: AppState) => update(() => st), [update]);
  useEffect(() => { if (!isDesktop || !cloudConfigured) return; return listenPhone(() => snapRef.current, apply); }, [apply]);
  useEffect(() => { if (!isDesktop || !cloudConfigured || !snap) return; const t = setTimeout(() => syncTick(snap, apply), 2500); return () => clearTimeout(t); }, [snap, apply]);
  if (!snap) return <><Background /><div style={{ padding: 40, position: 'relative' }} className="muted">Loading…</div></>;
  const due = csvDue(snap);
  const buf = bufferInfo(snap);
  const Page = { today: Today, schedule: Schedule, board: Board, upload: Upload, analytics: Analytics, library: Library, ideas: Ideas, tools: Tools, settings: Settings }[page] || Today;
  return (
    <AppCtx.Provider value={{ snap, update, toast, go }}>
      <Background />
      <div className="shell">
        <nav className="glass rail" aria-label="Main">
          <svg className="brand" viewBox="0 0 40 40" aria-hidden="true">
            <defs><radialGradient id="bg-ball" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#F4F6FF" /><stop offset="1" stopColor="#AAC3F0" stopOpacity="0" /></radialGradient></defs>
            <rect x="1" y="1" width="38" height="38" rx="12" fill="#0B1124" stroke="rgba(170,195,240,.35)" />
            <circle cx="20" cy="17" r="9" fill="url(#bg-ball)" opacity=".5" />
            <circle cx="20" cy="17" r="5.5" fill="#F4F6FF" />
            <rect x="9" y="29" width="22" height="3" rx="1.5" fill="#FFC63A" />
          </svg>
          {PAGES.map((p) => (
            <button key={p.id} className={`rail-btn ${page === p.id ? 'on' : ''}`} onClick={() => go(p.id)} aria-label={p.label}>
              <Icon name={p.icon} /><span className="tip">{p.label}</span>
              {p.id === 'analytics' && due && <span className="badge-dot" />}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="rail-btn hide-phone" onClick={async () => { const p = await bb.backupNow(); update((s) => ({ ...s, lastBackup: new Date().toISOString() })); toast(`Saved backup: ${p.split(/[\\/]/).pop()}`); }} aria-label="Save backup now"><Icon name="save" /><span className="tip">Save backup now</span></button>
          <button className={`rail-btn ${page === 'settings' ? 'on' : ''}`} onClick={() => go('settings')} aria-label="Settings"><Icon name="gear" /><span className="tip">Settings</span></button>
        </nav>
        <main className="content">
          {!snap.vaultOk && <div className="glass card" style={{ borderColor: 'rgba(255,143,122,.5)' }}><b>Vault not found.</b><span className="muted">Expected the Badbounce folder at {snap.vaultPath}. Change it in Settings (gear icon).</span></div>}
          {(due || buf.days < 1) && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {due && <button className="btn sm pill-alert" onClick={() => go('analytics')}><Icon name="csv" size={15} /> Weekly TikTok CSV is due · import now</button>}
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
createRoot(document.getElementById('root')!).render(<Gate><App /></Gate>);
