import React from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { bb, isDesktop, type ProgressInfo } from '../bridge';
import { SyncCard } from '../cloud/SyncCard';
import type { Settings as S } from '../types';
import { MODES, setMode, sunTimes, useTheme, type Mode } from '../theme';

function Appearance() {
  const { mode, theme } = useTheme();
  const t = sunTimes(new Date()), f = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const shift = (d: Date, m: number) => new Date(d.getTime() + m * 60e3);
  const label: Record<Mode, string> = { auto: 'Auto', dark: 'Dark', medium: 'Medium', light: 'Light' };
  return <div className="glass card">
    <div className="between"><h2>Appearance</h2><span className="small dim">Now: {theme === 'dark' ? 'night' : theme === 'medium' ? 'dusk' : 'day'}</span></div>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{MODES.map((m) => <button key={m} className={`btn sm ${mode === m ? 'white' : ''}`} onClick={() => setMode(m)}>{label[m]}</button>)}</div>
    <div className="small muted" style={{ lineHeight: 1.6 }}>Auto follows the sun in Hamm (NRW). Today: sunrise {f(t.rise)}, sunset {f(t.set)}.<br />Dark until {f(shift(t.rise, -45))} · medium until {f(shift(t.rise, 45))} · light until {f(shift(t.set, -45))} · medium until {f(shift(t.set, 45))} · then dark.</div>
  </div>;
}

function ProgressScreen() {
  const [p, setP] = React.useState<ProgressInfo | null>(null);
  React.useEffect(() => {
    if (!bb.progressInfo) return;
    const load = () => bb.progressInfo!().then(setP).catch(() => {});
    load(); const off = bb.onProgressChanged?.(load); const t = setInterval(load, 5000);
    return () => { off?.(); clearInterval(t); };
  }, []);
  if (!bb.progressInfo) return null;
  if (!p) return <div className="glass card"><h2>Progress screen</h2><div className="small dim">Loading…</div></div>;
  const set = async (patch: Parameters<NonNullable<typeof bb.progressSet>>[0]) => setP(await bb.progressSet!(patch));
  const cmd = async (c: Parameters<NonNullable<typeof bb.progressCmd>>[0]) => setP(await bb.progressCmd!(c));
  const chosen = p.displays.find((d) => d.chosen)?.id ?? p.displays[0]?.id;
  return <div className="glass card">
    <div className="between"><h2>Progress screen</h2><span className="small dim">{p.visible ? (p.full ? 'Showing · full screen' : 'Showing · window') : 'Hidden'}</span></div>
    <div className="row" style={{ justifyContent: 'space-between' }}><span><b>Claude account</b><div className="small dim">{p.signedIn ? 'Signed in · the board updates live' : 'Not signed in · sign in with your email (Google may be blocked)'}</div></span>
      {p.signedIn ? <button className="btn sm" onClick={() => cmd('signout')}>Sign out</button> : <button className="btn primary sm" onClick={() => cmd('signin')}>Sign in</button>}</div>
    <label className="f">Show on monitor<select className="in" value={chosen} onChange={(e) => set({ display: +e.target.value })}>{p.displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
    <label className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}><span><b>Open when the launcher starts</b><div className="small dim">Always starts in full screen</div></span><input type="checkbox" checked={p.autostart} onChange={(e) => set({ autostart: e.target.checked })} style={{ width: 20, height: 20, accentColor: '#FFC63A' }} /></label>
    <label className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}><span><b>Hide the claude.ai bar</b><div className="small dim">Only the progress page fills the screen</div></span><input type="checkbox" checked={p.hideBar} onChange={(e) => set({ hideBar: e.target.checked })} style={{ width: 20, height: 20, accentColor: '#FFC63A' }} /></label>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <button className="btn primary sm" onClick={() => cmd('toggle')}>{p.visible ? 'Hide' : 'Show'}</button>
      <button className="btn sm" onClick={() => cmd('full')}>{p.visible && p.full ? 'Exit full screen' : 'Full screen'}</button>
      <button className="btn sm" onClick={() => cmd('reload')}>Reload</button>
      <button className="btn sm" onClick={() => cmd('browser')}>Open in browser</button>
    </div>
    <div className="small muted">Ctrl+Alt+P shows or hides it · F11 in the window switches full screen · mouse to the top edge shows an exit button</div>
  </div>;
}

export default function Settings() {
  const { snap, update, toast } = useApp();
  const s = snap.state.settings;
  const set = (p: Partial<S>) => update((st) => ({ ...st, settings: { ...st.settings, ...p } }));
  const Toggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) =>
    <label className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}><span><b>{label}</b>{hint && <div className="small dim">{hint}</div>}</span><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#FFC63A' }} /></label>;
  return <>
    <Header title="Settings" sub={isDesktop ? `Vault: ${snap.vaultPath}` : 'Shared with the PC launcher'} />
    <section className="grid g-auto">
      <div className="glass card">
        <h2>Schedule</h2>
        <label className="f">Day 1 of the warm-up<input className="in" type="date" value={s.day1} onChange={(e) => set({ day1: e.target.value })} /></label>
        <label className="f">CSV reminder day<select className="in" value={s.csvWeekday} onChange={(e) => set({ csvWeekday: +e.target.value })}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
      </div>
      <Appearance />
      {isDesktop && <div className="glass card">
        <h2>Dynamic Island</h2>
        <Toggle on={s.islandEnabled} onChange={(v) => set({ islandEnabled: v })} label="Show the island" hint="Ctrl+Alt+B opens it any time" />
        <Toggle on={s.dnd} onChange={(v) => set({ dnd: v })} label="Do not disturb" hint="No pop-downs until you switch it off" />
        <Toggle on={s.dndFullscreen} onChange={(v) => set({ dndFullscreen: v })} label="Quiet during full-screen apps" hint="Games, videos, presentations" />
        <Toggle on={s.quietEnabled !== false} onChange={(v) => set({ quietEnabled: v })} label="Quiet hours" hint={s.quietEnabled !== false ? `No pop-downs from ${s.quietFrom}:00 to ${s.quietTo}:00` : 'Off: alerts can pop down at any hour'} />
        {s.quietEnabled !== false && <div className="row"><label className="f" style={{ flex: 1 }}>Quiet from<input className="in" type="number" min={0} max={23} value={s.quietFrom} onChange={(e) => set({ quietFrom: +e.target.value })} /></label><label className="f" style={{ flex: 1 }}>Quiet until<input className="in" type="number" min={0} max={23} value={s.quietTo} onChange={(e) => set({ quietTo: +e.target.value })} /></label></div>}
        <button className="btn" onClick={() => bb.islandToast('Test alert', 'This is how a pop-down looks')}>Test the island</button>
      </div>}
      {isDesktop && <div className="glass card">
        <div className="between"><h2>App</h2>{snap.update && <span className="small dim">Version {snap.update.current}{snap.update.error ? ` · update failed: ${snap.update.error}` : ''}</span>}</div>
        <Toggle on={s.autostart} onChange={(v) => { set({ autostart: v }); bb.setAutostart(v); }} label="Start with Windows" />
        <label className="f">Badbounce vault folder<input className="in" defaultValue={snap.vaultPath} onBlur={async (e) => { if (e.target.value !== snap.vaultPath && bb.setVault) { await bb.setVault(e.target.value); toast('Vault folder changed'); } }} /></label>
        <label className="f">Claude project link<input className="in" value={s.projectUrl} onChange={(e) => set({ projectUrl: e.target.value })} /></label>
        <div className="row" style={{ justifyContent: 'space-between' }}><span><b>Backup</b><div className="small dim">Weekly automatic · last: {snap.state.lastBackup ? new Date(snap.state.lastBackup).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'}</div></span>
          <button className="btn primary sm" onClick={async () => { const p = await bb.backupNow(); await update((st) => ({ ...st, lastBackup: new Date().toISOString() })); toast(`Saved ${p.split(/[\\/]/).pop()}`); }}>Save now</button></div>
        <button className="btn" onClick={() => bb.openVault('.claude-workspace/launcher-data/backups')}>Open backups folder</button>
      </div>}
      {isDesktop && <ProgressScreen />}
      <SyncCard />
    </section>
  </>;
}
