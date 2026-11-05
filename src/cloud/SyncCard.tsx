import React, { useEffect, useState } from 'react';
import { cloudConfigured, onAuth, session, signIn, signOut } from './client';
import { onSyncStatus, syncStatus } from './pcSync';
import { isDesktop } from '../bridge';

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await signIn(email.trim(), pw); onDone?.(); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
  };
  return <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <label className="f">Email<input className="in" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
    <label className="f">Password<input className="in" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
    {err && <span className="small" style={{ color: 'var(--red)' }}>{err}</span>}
    <button className="btn primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>;
}

export function SyncCard() {
  const [email, setEmail] = useState<string | null>(null);
  const [st, setSt] = useState(syncStatus());
  useEffect(() => { session().then((s) => setEmail(s?.user.email ?? null)); return onAuth((s) => setEmail(s?.user.email ?? null)); }, []);
  useEffect(() => onSyncStatus(setSt), []);
  if (!cloudConfigured) return <div className="glass card"><h2>Phone sync</h2><span className="small dim">Not set up in this version.</span></div>;
  return <div className="glass card">
    <h2>Phone sync</h2>
    {email ? <>
      <span className="small muted">Signed in as <b style={{ color: 'var(--text)' }}>{email}</b></span>
      {isDesktop && <span className="small dim">{st}</span>}
      <span className="small dim">{isDesktop ? 'Changes sync both ways. Ready videos are uploaded so the phone can save them.' : 'Changes sync with the PC launcher.'}</span>
      <button className="btn" onClick={() => signOut()}>Sign out</button>
    </> : <>
      <span className="small dim">Sign in with your Supabase login to sync with {isDesktop ? 'your phone' : 'the PC'}.</span>
      <LoginForm />
    </>}
  </div>;
}
