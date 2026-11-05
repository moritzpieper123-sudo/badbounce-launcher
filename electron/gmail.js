/* Gmail (read-only) for the Badbounce launcher.
   OAuth "Desktop app" flow with a loopback redirect + PKCE. The refresh token is
   encrypted with Windows' own protection (safeStorage) and never leaves this PC. */
const { app, net, shell, safeStorage } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const file = () => path.join(app.getPath('userData'), 'gmail.json');
let cfg = null;          // { clientId, clientSecret, refresh (encrypted b64), email }
let access = null;       // { token, until }
let cache = { connected: false, email: null, unread: 0, items: [], updated: null, error: null };

function load() {
  if (cfg) return cfg;
  try { cfg = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cfg = {}; }
  cache.connected = !!cfg.refresh; cache.email = cfg.email || null;
  return cfg;
}
function save() { fs.writeFileSync(file(), JSON.stringify(cfg)); }
const enc = (s) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s).toString('base64') : 'plain:' + Buffer.from(s).toString('base64'));
const dec = (s) => (s.startsWith('plain:') ? Buffer.from(s.slice(6), 'base64').toString() : safeStorage.decryptString(Buffer.from(s, 'base64')));
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function postForm(url, body) {
  const r = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || `HTTP ${r.status}`);
  return j;
}

/** Opens the Google sign-in in the browser and waits for the answer on 127.0.0.1 */
function connect(clientId, clientSecret) {
  load();
  return new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const stateTok = b64url(crypto.randomBytes(16));
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
      const code = u.searchParams.get('code'), err = u.searchParams.get('error');
      const ok = code && u.searchParams.get('state') === stateTok;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<body style="background:#05080F;color:#F3EFE6;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><h2>${ok ? 'Gmail connected. You can close this tab.' : 'Gmail was not connected: ' + (err || 'unknown error')}</h2></body>`);
      server.close();
      if (!ok) return reject(new Error(err || 'sign-in failed'));
      try {
        const port = server.address()?.port ?? redirectPort;
        const t = await postForm('https://oauth2.googleapis.com/token', { code, client_id: clientId, client_secret: clientSecret, redirect_uri: `http://127.0.0.1:${port}`, grant_type: 'authorization_code', code_verifier: verifier });
        if (!t.refresh_token) throw new Error('Google sent no refresh token. Remove the launcher under myaccount.google.com → Security → Third-party access and try again.');
        cfg = { clientId, clientSecret, refresh: enc(t.refresh_token) };
        access = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
        const prof = await api('profile');
        cfg.email = prof.emailAddress; save();
        cache.connected = true; cache.email = cfg.email; cache.error = null;
        await refresh();
        resolve(cache);
      } catch (e) { reject(e); }
    });
    let redirectPort = 0;
    server.listen(0, '127.0.0.1', () => {
      redirectPort = server.address().port;
      const q = new URLSearchParams({ client_id: clientId, redirect_uri: `http://127.0.0.1:${redirectPort}`, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state: stateTok });
      shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
    });
    setTimeout(() => { try { server.close(); } catch { /* */ } reject(new Error('Timed out waiting for the Google sign-in (5 min)')); }, 5 * 60e3);
  });
}

async function token() {
  load();
  if (!cfg.refresh) throw new Error('not connected');
  if (access && access.until > Date.now()) return access.token;
  const t = await postForm('https://oauth2.googleapis.com/token', { client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: dec(cfg.refresh), grant_type: 'refresh_token' });
  access = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  return access.token;
}
async function api(p) {
  const r = await net.fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + p, { headers: { Authorization: 'Bearer ' + (await token()) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

/** Latest 30 inbox emails + unread count */
async function refresh() {
  load();
  if (!cfg.refresh) { cache = { connected: false, email: null, unread: 0, items: [], updated: null, error: null }; return cache; }
  try {
    const list = await api('messages?maxResults=30&labelIds=INBOX');
    const items = [];
    for (const m of list.messages || []) {
      const d = await api(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      const h = (n) => d.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || '';
      const from = h('From');
      items.push({ id: d.id, threadId: d.threadId, from: from.replace(/\s*<[^>]+>\s*$/, '').replace(/^"|"$/g, '') || from, fromAddr: (from.match(/<([^>]+)>/) || [, from])[1], subject: h('Subject') || '(no subject)', snippet: (d.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'), date: new Date(+d.internalDate).toISOString(), unread: (d.labelIds || []).includes('UNREAD') });
    }
    const lab = await api('labels/INBOX');
    cache = { connected: true, email: cfg.email, unread: lab.messagesUnread ?? items.filter((i) => i.unread).length, items, updated: new Date().toISOString(), error: null };
  } catch (e) { cache = { ...cache, connected: !!cfg.refresh, email: cfg.email, error: String(e.message || e) }; }
  return cache;
}
/** One full email for the reader: prefers the HTML part, else plain text */
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unb64 = (d) => Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
async function body(id) {
  const d = await api(`messages/${encodeURIComponent(id)}?format=full`);
  let html = '', text = ''; const files = [];
  const walk = (p) => {
    if (!p) return;
    if (p.filename) files.push(p.filename);
    else if (p.mimeType === 'text/html' && p.body?.data && !html) html = unb64(p.body.data);
    else if (p.mimeType === 'text/plain' && p.body?.data && !text) text = unb64(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(d.payload);
  if (!html) html = `<pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;margin:0">${esc(text || d.snippet || '')}</pre>`
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const h = (n) => d.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || '';
  return { id: d.id, from: h('From'), to: h('To'), subject: h('Subject') || '(no subject)', date: new Date(+d.internalDate).toISOString(), html, files };
}
function disconnect() { load(); cfg = {}; access = null; save(); cache = { connected: false, email: null, unread: 0, items: [], updated: null, error: null }; return cache; }
function hasClient() { load(); return { clientId: cfg.clientId || '' }; }
module.exports = { body, connect, refresh, disconnect, status: () => (load(), cache), hasClient };
