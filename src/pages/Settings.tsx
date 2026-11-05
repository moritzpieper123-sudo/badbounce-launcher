import React from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { bb, isDesktop } from '../bridge';
import { SyncCard } from '../cloud/SyncCard';
import type { Settings as S } from '../types';

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
        <label className="f">Comment reminder after upload (minutes)<input className="in" type="number" min={5} max={120} value={s.commentReminderMin} onChange={(e) => set({ commentReminderMin: +e.target.value || 20 })} /></label>
      </div>
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
      <SyncCard />
    </section>
  </>;
}
