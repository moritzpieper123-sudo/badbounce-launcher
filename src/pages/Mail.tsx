import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Header } from './parts';
import { Icon } from '../ui';
import { bb, isDesktop } from '../bridge';
import { gmailLink } from '../logic';
import type { MailBody, MailItem } from '../types';

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
  const [read, setRead] = useState<{ item: MailItem; body: MailBody | null } | null>(null);
  const open = async (x: MailItem) => {
    if (!bb.mailBody) return bb.openUrl(gmailLink(x.threadId));
    setRead({ item: x, body: null });
    const b = await bb.mailBody(x.id);
    setRead((r) => (r?.item.id === x.id ? { item: x, body: b } : r));
  };
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
  if (read) return <Reader item={read.item} body={read.body} onBack={() => setRead(null)} />;
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

/* Render the email inside the launcher design: strip scripts, foreign styles and colours, keep text, images, links and layout. */
const DROP = 'script,style,link,meta,title,base,iframe,frame,frameset,object,embed,applet,form,input,button,textarea,select,noscript,template';
const BAD_CSS = /^(color|background|background-color|background-image|font-family|box-shadow|border|border-top|border-bottom|border-left|border-right|border-color|border-radius|text-shadow|position|z-index|top|left|right|bottom|float|min-width|height|min-height|line-height|filter|opacity)$/i;
function cleanMail(html: string): string {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  doc.querySelectorAll(DROP).forEach((n) => n.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    let hadBg = el.hasAttribute('bgcolor');
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || ['bgcolor', 'color', 'background', 'face', 'border', 'class', 'id', 'height', 'srcset'].includes(n)) el.removeAttribute(a.name);
    }
    const st = el.getAttribute('style');
    if (st) {
      if (/background/i.test(st)) hadBg = true;
      const kept = st.split(';').map((d) => d.trim()).filter((d) => d && !BAD_CSS.test(d.split(':')[0].trim()));
      if (kept.length) el.setAttribute('style', kept.join(';')); else el.removeAttribute('style');
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? '';
      if (!/^(https?:|mailto:)/i.test(href)) el.removeAttribute('href');
      if (hadBg && (el.textContent ?? '').trim()) el.classList.add('mbtn');
    }
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      if (!/^(https?:|data:image\/)/i.test(src)) el.remove();
      else { el.setAttribute('loading', 'lazy'); el.setAttribute('referrerpolicy', 'no-referrer'); }
    }
  });
  return doc.body.innerHTML;
}

function Reader({ item, body, onBack }: { item: MailItem; body: MailBody | null; onBack: () => void }) {
  const html = useMemo(() => (body?.ok ? cleanMail(body.html ?? '') : ''), [body]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelectorAll('img').forEach((im) => { const hide = () => { im.style.display = 'none'; }; if (im.complete && !im.naturalWidth) hide(); else im.addEventListener('error', hide); }); }, [html]);
  const click = (e: React.MouseEvent) => { const a = (e.target as HTMLElement).closest('a'); if (!a) return; e.preventDefault(); const href = a.getAttribute('href'); if (href) bb.openUrl(href); };
  const addr = body?.from?.match(/<([^>]+)>/)?.[1] ?? item.fromAddr ?? '';
  return <>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <button className="btn sm" onClick={onBack}><span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>‹</span> Inbox</button>
      <button className="btn sm" onClick={() => bb.openUrl(gmailLink(item.threadId))}><Icon name="mail" size={14} /> Reply in Gmail</button>
    </div>
    <section className="glass card" style={{ gap: 10 }}>
      <h2 style={{ fontSize: 20, lineHeight: 1.3 }}>{body?.subject ?? item.subject}</h2>
      <div className="row" style={{ gap: 10 }}>
        <span className="mav" style={{ background: `hsl(${hue(addr || item.from)} 45% 32%)` }}>{initials(item.from)}</span>
        <div style={{ minWidth: 0 }}><b>{item.from}</b> <span className="small dim">{addr}</span><div className="small dim">{new Date(item.date).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{body?.to ? ` · to ${body.to}` : ''}</div></div>
      </div>
      {!!body?.files?.length && <div className="row small" style={{ gap: 6, flexWrap: 'wrap' }}>{body.files.map((f) => <span key={f} className="chip">📎 {f}</span>)}<span className="dim">open attachments in Gmail</span></div>}
    </section>
    <section className="glass card mailcard">
      {!body ? <div className="empty">Loading…</div>
        : !body.ok ? <div className="empty" style={{ color: 'var(--red)' }}>Could not load this email: {body.error}</div>
        : html.trim() ? <div ref={box} className="mailhtml" onClick={click} dangerouslySetInnerHTML={{ __html: html }} /> : <div className="empty">This email has no text.</div>}
    </section>
  </>;
}
