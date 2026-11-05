import React, { useEffect, useRef, useState } from 'react';
import { cloudConfigured, onAuth, session } from './client';
import { LoginForm } from './SyncCard';
import { isDesktop } from '../bridge';
import { Background } from '../ui';
import type { ShareDetail } from './webBridge';

/** On phone / iPad: show the login until signed in. On the PC: always pass. */
export function Gate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'wait' | 'in' | 'out'>(isDesktop || !cloudConfigured ? 'in' : 'wait');
  useEffect(() => {
    if (isDesktop || !cloudConfigured) return;
    session().then((s) => setState(s ? 'in' : 'out'));
    return onAuth((s) => setState(s ? 'in' : 'out'));
  }, []);
  if (state === 'in') return <>{children}</>;
  return <><Background />
    <div className="login-wrap">
      <div className="glass card login">
        <svg width="52" height="52" viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="12" fill="#0B1124" stroke="rgba(170,195,240,.35)" /><circle cx="20" cy="17" r="5.5" fill="#F4F6FF" /><rect x="9" y="29" width="22" height="3" rx="1.5" fill="#FFC63A" /></svg>
        <h1 style={{ margin: 0, fontSize: 24 }}>Badbounce Launcher</h1>
        {state === 'wait' ? <span className="muted">Loading…</span> : <LoginForm />}
      </div>
    </div>
  </>;
}

/** Phone: after "Upload pack" the files are ready; one more tap opens the iOS share sheet (Save Video). */
export function ShareSheet() {
  const [d, setD] = useState<ShareDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<ShareDetail | null>(null);
  useEffect(() => {
    const h = (e: Event) => { const det = (e as CustomEvent<ShareDetail>).detail; ref.current = det; setD(det); setMsg(null); };
    window.addEventListener('bb-share', h); return () => window.removeEventListener('bb-share', h);
  }, []);
  if (!d) return null;
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: d.files });
  const share = async () => {
    try { await navigator.share({ files: d.files }); setMsg('Saved? Now open TikTok and paste the description.'); }
    catch (e) { if ((e as Error).name !== 'AbortError') setMsg('Sharing failed: ' + (e as Error).message); }
  };
  const save = () => { for (const f of d.files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); } };
  return <div className="sheet-back" onClick={() => setD(null)}>
    <div className="glass card sheet" onClick={(e) => e.stopPropagation()}>
      <h2>#{d.num} is ready</h2>
      <span className="small muted">1. Save the video and thumbnail · 2. Open TikTok and upload · 3. Paste the description (already copied) · 4. Tick it done here.</span>
      {canShare ? <button className="btn primary" onClick={share}>Save video + thumbnail</button> : <button className="btn primary" onClick={save}>Download files</button>}
      <button className="btn" onClick={() => navigator.clipboard.writeText(d.desc).then(() => setMsg('Description copied'))}>Copy description again</button>
      <a className="btn" href="https://www.tiktok.com/upload" target="_blank" rel="noreferrer">Open TikTok</a>
      {msg && <span className="small" style={{ color: 'var(--green)' }}>{msg}</span>}
      <button className="btn" onClick={() => setD(null)}>Close</button>
    </div>
  </div>;
}
