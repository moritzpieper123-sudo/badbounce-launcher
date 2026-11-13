/* Progress screen: Claude's live Task Progress page in its own window on a monitor Mo picks.
   It starts in full screen and has no taskbar button. F11 (or the small button at the top) switches
   between full screen and a normal window. All settings live in the launcher's Settings page
   (config.json: progress { display, autostart, hideBar }). Ctrl+Alt+P shows / hides it. */
const { BrowserWindow, screen, shell, globalShortcut, ipcMain, session } = require('electron');
const path = require('path');

const URL = 'https://claude.ai/artifact/JmnkuAdKnUrbs6a9zyKAWJ';
const ICON = path.join(__dirname, process.platform === 'win32' ? 'progress.ico' : 'progress.png');
// Puts the page's own frame over the whole window, so claude.ai's top bar is out of sight
const HIDE_BAR_CSS = `iframe[src*="claudeusercontent"], iframe[title], main iframe {
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  max-width: none !important; max-height: none !important; border: 0 !important; border-radius: 0 !important; z-index: 2147483646 !important; }
html, body { overflow: hidden !important; background: #05080F !important; }`;
// Small button that slides in when the mouse is at the top edge: full screen <-> window
const FS_BUTTON_JS = `(() => {
  if (document.getElementById('bb-fs')) return;
  const b = document.createElement('button'); b.id = 'bb-fs';
  b.style.cssText = 'position:fixed;top:8px;left:50%;transform:translate(-50%,-60px);z-index:2147483647;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(10,16,30,.82);color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(10px);transition:transform .25s ease;';
  const label = () => { b.textContent = window.bbProgress && window.bbProgress.isFull() ? '\\u2922  Exit full screen (F11)' : '\\u2921  Full screen (F11)'; };
  b.onclick = () => { window.bbProgress && window.bbProgress.toggleFull(); setTimeout(label, 300); };
  let t = null;
  document.addEventListener('mousemove', (e) => {
    if (e.clientY < 40) { label(); b.style.transform = 'translate(-50%,0)'; clearTimeout(t); t = setTimeout(() => { if (!b.matches(':hover')) b.style.transform = 'translate(-50%,-60px)'; }, 2500); }
  }, true);
  b.onmouseleave = () => { b.style.transform = 'translate(-50%,-60px)'; };
  document.documentElement.appendChild(b);
})();`;

let win = null, loginWin = null, signedIn = null, cssKey = null, readCfg, writeCfg, onChange = () => {};

const cfg = () => Object.assign({ display: null, autostart: true, hideBar: true, url: URL }, (readCfg() || {}).progress || {});
function setCfg(patch) { const c = readCfg() || {}; c.progress = Object.assign(cfg(), patch); writeCfg(c); }

function targetDisplay() {
  const all = screen.getAllDisplays(), want = cfg().display;
  return all.find((d) => d.id === want) || screen.getPrimaryDisplay();
}
const alive = () => !!(win && !win.isDestroyed());
const isFull = () => alive() && win.isFullScreen();
/** moves the window to the chosen monitor; full = true -> full screen, false -> normal window there */
function place(full = true) {
  if (!alive()) return;
  const d = targetDisplay(), b = d.bounds, w = d.workArea;
  if (win.isFullScreen()) win.setFullScreen(false);
  if (full) { win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height }); win.setFullScreen(true); }
  else {
    const W = Math.round(w.width * 0.7), H = Math.round(w.height * 0.75);
    win.setBounds({ x: w.x + Math.round((w.width - W) / 2), y: w.y + Math.round((w.height - H) / 2), width: W, height: H });
  }
  win.setSkipTaskbar(true);
}
function toggleFull() { if (!alive()) return; place(!win.isFullScreen()); onChange(); }
async function applyCss() {
  if (!alive()) return;
  if (cssKey) { try { await win.webContents.removeInsertedCSS(cssKey); } catch { /* */ } cssKey = null; }
  if (cfg().hideBar) { try { cssKey = await win.webContents.insertCSS(HIDE_BAR_CSS); } catch { /* */ } }
}

const ses = () => session.fromPartition('persist:progress');
// asks claude.ai itself (from a claude.ai page) whether this window's account is signed in
async function probe(wc) {
  try { if (!wc || wc.isDestroyed() || !/^https:\/\/claude\.ai\//.test(wc.getURL())) return null;
    return await wc.executeJavaScript("fetch('/api/organizations',{credentials:'include'}).then(r=>r.status).catch(()=>0)"); } catch { return null; }
}
async function checkLogin() {
  let now = false;
  try { const c = await ses().cookies.get({ domain: 'claude.ai' }); now = c.some((k) => /^session/i.test(k.name)); } catch { /* */ }
  if (!now) { const st = (await probe(loginWin && !loginWin.isDestroyed() ? loginWin.webContents : null)) ?? (await probe(alive() ? win.webContents : null)); now = st === 200; }
  if (now !== signedIn) { signedIn = now; onChange(); }
  return signedIn;
}
// bar at the bottom of the sign-in window: paste the link from the sign-in email here (it would open in the normal browser otherwise)
const PASTE_BAR_JS = `(() => {
  if (document.getElementById('bb-paste')) return;
  const d = document.createElement('div'); d.id = 'bb-paste';
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;gap:6px;padding:8px;background:#0A101E;font:13px system-ui,sans-serif;';
  d.innerHTML = '<input placeholder="Sign-in link from the email? Paste it here" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #334;background:#111a2e;color:#fff"><button style="padding:8px 14px;border-radius:8px;border:0;background:#FFC63A;color:#111;font-weight:700;cursor:pointer">Go</button>';
  const go = () => { const v = d.querySelector('input').value.trim(); if (/^https:\\/\\/claude\\.ai\\//.test(v)) location.href = v; else d.querySelector('input').value = ''; };
  d.querySelector('button').onclick = go; d.querySelector('input').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  document.documentElement.appendChild(d);
})();`;
/** separate, normal window on top of everything for the claude.ai sign-in; closes itself once signed in */
function signIn(url = 'https://claude.ai/login') {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.show(); loginWin.focus(); return; }
  const w = targetDisplay().workArea, W = Math.min(520, w.width), H = Math.min(760, w.height);
  loginWin = new BrowserWindow({
    x: w.x + Math.round((w.width - W) / 2), y: w.y + Math.round((w.height - H) / 2), width: W, height: H,
    title: 'Sign in to Claude', icon: ICON, alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#ffffff',
    webPreferences: { partition: 'persist:progress', contextIsolation: true, sandbox: true },
  });
  loginWin.setMenu(null);
  loginWin.webContents.setUserAgent(loginWin.webContents.getUserAgent().replace(/\s(Electron|badbounce-launcher|Badbounce Launcher)\/\S+/gi, ''));
  loginWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https:\/\/(claude\.ai|[^/]*\.anthropic\.com|accounts\.google\.com)\//.test(u)) { loginWin.loadURL(u); return { action: 'deny' }; }
    shell.openExternal(u); return { action: 'deny' };
  });
  const lw = loginWin;
  const done = async () => {
    if (lw.isDestroyed()) return;
    const u = lw.webContents.getURL();
    if (!/^https:\/\/claude\.ai\//.test(u) || /claude\.ai\/(login|signup|magic-link|onboarding)/.test(u)) return;
    if (await checkLogin()) { if (!lw.isDestroyed()) lw.destroy(); }
  };
  lw.webContents.on('did-navigate', done);
  lw.webContents.on('did-navigate-in-page', done);
  lw.webContents.on('dom-ready', () => { lw.webContents.executeJavaScript(PASTE_BAR_JS).catch(() => {}); });
  const poll = setInterval(done, 3000);
  // closing the sign-in window (by itself or by hand) always reloads the board
  lw.on('closed', () => { clearInterval(poll); loginWin = null; create(true); if (alive()) { win.loadURL(cfg().url); win.show(); } setTimeout(checkLogin, 4000); });
  loginWin.loadURL(url);
}
async function signOut() {
  try { await ses().clearStorageData(); } catch { /* */ }
  signedIn = false; if (alive()) win.loadURL(cfg().url); onChange();
}

function create(show) {
  if (alive()) { if (show) { if (!win.isVisible()) place(true); win.show(); } return win; }
  const b = targetDisplay().bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, show: false, skipTaskbar: true, backgroundColor: '#05080F',
    title: 'Badbounce Progress', icon: ICON, autoHideMenuBar: true, fullscreenable: true, minWidth: 360, minHeight: 300,
    webPreferences: { partition: 'persist:progress', contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'progress-preload.js') },
  });
  win.setMenu(null);
  // a plain Chrome user agent, so claude.ai treats the window like a normal browser
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s(Electron|badbounce-launcher|Badbounce Launcher)\/\S+/gi, ''));
  win.loadURL(cfg().url);
  win.webContents.on('dom-ready', () => { applyCss(); win.webContents.executeJavaScript(FS_BUTTON_JS).catch(() => {}); });
  win.webContents.on('did-fail-load', () => setTimeout(() => { if (alive()) win.loadURL(cfg().url); }, 15000));
  win.webContents.on('render-process-gone', () => setTimeout(() => { if (alive()) win.reload(); }, 3000));
  // links that leave claude.ai open in the normal browser; claude.ai sign-in pages stay in the window
  win.webContents.setWindowOpenHandler(({ url }) => {
    // claude.ai / sign-in pages open in our own sign-in window (a popup would hide behind the full-screen window)
    if (/^https:\/\/(claude\.ai|[^/]*\.anthropic\.com|accounts\.google\.com)\//.test(url)) { signIn(url); return { action: 'deny' }; }
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (/^https:\/\/claude\.ai\/(login|signup|magic-link)/.test(url)) { e.preventDefault(); signIn(url); } });
  win.webContents.on('did-finish-load', () => { checkLogin(); pushTheme(); });
  win.webContents.on('did-frame-finish-load', () => setTimeout(pushTheme, 300));
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { e.preventDefault(); toggleFull(); }
    if (i.key === 'F5') { e.preventDefault(); win.reload(); }
    if (i.key === 'F4' && i.alt) { e.preventDefault(); win.hide(); }
  });
  win.on('close', (e) => { if (!module.exports.quitting) { e.preventDefault(); win.hide(); } });
  win.on('show', () => onChange()); win.on('hide', () => onChange());
  win.on('enter-full-screen', () => onChange()); win.on('leave-full-screen', () => onChange());
  win.once('ready-to-show', () => { place(true); if (show) win.showInactive(); });
  return win;
}
const visible = () => alive() && win.isVisible();
function toggle() { if (visible()) win.hide(); else create(true); onChange(); }

/** what the launcher's Settings page shows */
function info() {
  const c = cfg(), prim = screen.getPrimaryDisplay().id, cur = targetDisplay().id;
  return {
    displays: screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `Monitor ${i + 1} (${d.size.width}×${d.size.height}${d.id === prim ? ', main' : ''})`, chosen: d.id === cur })),
    autostart: c.autostart, hideBar: c.hideBar, visible: visible(), full: isFull(), signedIn: signedIn === true,
  };
}
function set(patch) {
  const p = {};
  if ('display' in patch) p.display = Number(patch.display);
  if ('autostart' in patch) p.autostart = !!patch.autostart;
  if ('hideBar' in patch) p.hideBar = !!patch.hideBar;
  setCfg(p);
  if ('display' in p) { create(true); place(true); win.show(); }
  if ('hideBar' in p) applyCss();
  onChange();
  return info();
}
function command(c) {
  if (c === 'toggle') toggle();
  else if (c === 'show') create(true);
  else if (c === 'full') { create(true); toggleFull(); }
  else if (c === 'reload') { if (alive()) win.reload(); }
  else if (c === 'browser') shell.openExternal(cfg().url);
  else if (c === 'signin') signIn();
  else if (c === 'signout') signOut();
  return info();
}

// Theme: the launcher's theme mode (auto / dark / medium / light) is pushed into the Progress page.
// The page lives in a claudeusercontent frame inside claude.ai, so every frame of the window gets it;
// the page saves it to its own data, so the iPad follows too.
const THEMES = ['auto', 'dark', 'medium', 'light'];
function pushTheme() {
  if (!alive()) return;
  const m = cfg().theme; if (!THEMES.includes(m)) return;
  const js = `window.bbSetTheme && window.bbSetTheme(${JSON.stringify(m)})`;
  let frames = [];
  try { frames = win.webContents.mainFrame.framesInSubtree; } catch { /* */ }
  for (const f of frames) { try { f.executeJavaScript(js).catch(() => {}); } catch { /* */ } }
}
function setTheme(m) {
  if (!THEMES.includes(m)) return;
  if (cfg().theme !== m) setCfg({ theme: m });
  pushTheme();
}

function start(opts) {
  readCfg = opts.readCfg; writeCfg = opts.writeCfg; onChange = opts.onChange || onChange;
  ipcMain.handle('progressInfo', async () => { await checkLogin(); return info(); });
  ipcMain.handle('progressSet', (_e, patch) => set(patch || {}));
  ipcMain.handle('progressCmd', (_e, c) => command(String(c)));
  // used by the small full-screen button inside the progress window
  ipcMain.on('progressFull', (e) => { if (alive() && e.sender === win.webContents) toggleFull(); });
  ipcMain.on('progressIsFull', (e) => { e.returnValue = isFull(); });
  try { globalShortcut.register('Control+Alt+P', toggle); } catch { /* */ }
  const moved = () => { onChange(); if (visible()) place(isFull()); };
  screen.on('display-added', moved); screen.on('display-removed', moved);
  screen.on('display-metrics-changed', () => { if (visible() && isFull()) place(true); });
  if (cfg().autostart) create(true);
  setInterval(pushTheme, 60e3);
}
module.exports = { start, toggle, setTheme, quitting: false, menuItems: () => [{ label: 'Show / hide progress screen', click: toggle }] };
