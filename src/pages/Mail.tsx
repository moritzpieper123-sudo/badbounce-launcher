import React, { useState } from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { bb, isDesktop } from '../bridge';
import { gmailLink } from '../logic';
import type { MailItem } from '../types';

const when = (iso: string, now: Date) => {
  const d = new Date(iso), diff = (now.getTime() - d.getTime()) / 60e3;
  if (diff < 1) return 'now';
  if (diff < 60) return `${Math.round(diff)} min`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (diff < 6 * 1440) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const initials = (s: string) => (s.match(/[A-Za-z0-9]/g) || ['?']).slice(0, 1).join('').toUpperCase();
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export default function Mail() {
  const { snap, toast } = useApp();
  const m = snap.mail;
  const now = new Date(snap.now);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [id, setId] = useState(''); const [secret, setSecret] = useState(''); const [busy, setBusy] = useState(false);
  const open = (x: MailItem) => bb.openUrl(gmailLink(x.threadId));
  const connect = async () => {
    if (!bb.mailConnect) return;
    setBusy(true); toast('A Google sign-in opens in your browser…');
    const r = await bb.mailConnect(id, secret); setBusy(false);
    toast(r.ok ? `Gmail connected: ${r.email}` : `Not connected: ${r.error}`);
  };
  if (!m?.connected) return <>
    <Header title="Inbox" sub="Your Gmail inside the launcher" />
    {isDesktop ? <section className="glass card form" style={{ maxWidth: 640 }}>
      <h2>Connect Gmail</h2>
      <span className="small muted">Read-only: the launcher can show your emails but never send, change or delete anything. Paste the two values from your Google Cloud “Desktop app” client.</span>
      <label className="f">Client ID<input className="in" value={id} onChange={(e) => setId(e.target.value)} placeholder="…apps.googleusercontent.com" /></label>
      <label className="f">Client secret<input className="in" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" /></label>
      <div className="row"><button className="btn primary" disabled={busy || !id.trim() || !secret.trim()} onClick={connect}><Icon name="mail" size={15} /> {busy ? 'Waiting for Google…' : 'Connect Gmail'}</button></div>
      {m?.error && <span className="small" style={{ color: 'var(--red)' }}>{m.error}</span>}
    </section> : <div className="glass card"><div className="empty">Connect Gmail once in the PC launcher (Inbox page). The emails then show up here too.</div></div>}
  </>;
  const items = (m.items || []).filter((x) => filter === 'all' || x.unread);
  return <>
    <Header title="Inbox" sub={`${m.unread} unread · ${m.email ?? ''}`} right={<>
      <button className={`btn sm ${filter === 'all' ? 'white' : ''}`} onClick={() => setFilter('all')}>All</button>
      <button className={`btn sm ${filter === 'unread' ? 'white' : ''}`} onClick={() => setFilter('unread')}>Unread</button>
      {isDesktop && <button className="btn sm icon" title="Refresh" aria-label="Refresh" onClick={() => bb.mailRefresh?.()}><Icon name="sparkle" size={14} /></button>}
      <button className="btn sm" onClick={() => bb.openUrl('https://mail.google.com/mail/u/0/#inbox')}><Icon name="mail" size={14} /> Gmail</button>
    </>} />
    {m.error && <div className="glass card" style={{ borderColor: 'rgba(255,143,122,.5)' }}><span className="small" style={{ color: 'var(--red)' }}>Gmail: {m.error}</span></div>}
    <section className="glass card" style={{ gap: 0, padding: '6px 10px' }}>
      {items.length ? items.map((x) => <button key={x.id} className={`mrow ${x.unread ? 'unread' : ''}`} onClick={() => open(x)}>
        <span className="mav" style={{ background: `hsl(${hue(x.fromAddr || x.from)} 45% 32%)` }}>{initials(x.from)}</span>
        <span className="mtxt">
          <span className="between"><span className="mfrom">{x.from}</span><span className="small dim num">{when(x.date, now)}</span></span>
          <span className="msub">{x.subject}</span>
          <span className="msnip">{x.snippet}</span>
        </span>
        {x.unread && <span className="mdot" />}
      </button>) : <div className="empty" style={{ margin: 12 }}>{filter === 'unread' ? 'No unread emails.' : 'Inbox is empty.'}</div>}
    </section>
    {isDesktop && <div className="row small dim" style={{ justifyContent: 'space-between' }}><span>Updates every 3 minutes{m.updated ? ` · last ${new Date(m.updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span><button className="linkbtn" onClick={async () => { await bb.mailDisconnect?.(); toast('Gmail disconnected'); }}>Disconnect Gmail</button></div>}
  </>;
}
