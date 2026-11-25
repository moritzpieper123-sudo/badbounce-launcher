/* Progress screen: Claude's live Task Progress page in its own window on a monitor Mo picks.
   It starts in full screen and has no taskbar button. F11 (or the small button at the top) switches
   between full screen and a normal window. All settings live in the launcher's Settings page
   (config.json: progress { display, autostart, sound, theme }). It shows Claude's own task lists, read from disk (tasks.js). Ctrl+Alt+P shows / hides it. */
const { BrowserWindow, screen, shell, globalShortcut, ipcMain, session } = require('electron');
const path = require('path');

const tasks = require('./tasks');
const ICON = path.join(__dirname, process.platform === 'win32' ? 'progress.ico' : 'progress.png');

let win = null, readCfg, writeCfg, onChange = () => {};

const cfg = () => Object.assign({ display: null, autostart: true, sound: true }, (readCfg() || {}).progress || {});
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
  win.loadFile(path.join(__dirname, 'viewer.html'));
  win.webContents.on('render-process-gone', () => setTimeout(() => { if (alive()) win.reload(); }, 1500));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.key === 'Escape' && win.isFullScreen())) { e.preventDefault(); toggleFull(); }
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
    autostart: c.autostart, sound: c.sound, visible: visible(), full: isFull(), hideBar: false, signedIn: true, // last two only keep the older launcher settings page quiet
  };
}
function set(patch) {
  const p = {};
  if ('display' in patch) p.display = Number(patch.display);
  if ('autostart' in patch) p.autostart = !!patch.autostart;
  if ('sound' in patch) p.sound = !!patch.sound;
  setCfg(p);
  if ('display' in p) { create(true); place(true); win.show(); }
  if ('sound' in p) pushConfig();
  onChange();
  return info();
}
function command(c) {
  if (c === 'toggle') toggle();
  else if (c === 'show') create(true);
  else if (c === 'full') { create(true); toggleFull(); }
  else if (c === 'reload') { if (alive()) win.reload(); }
  return info();
}

// Theme and sound come from the launcher's settings and are pushed into the viewer page
const THEMES = ['auto', 'dark', 'medium', 'light'];
function pushConfig() {
  if (!alive()) return;
  let m = cfg().theme; if (!THEMES.includes(m)) m = 'dark';
  if (m === 'auto') { const h = new Date().getHours(); m = autoTheme || (h >= 8 && h < 18 ? 'light' : h >= 6 && h < 20 ? 'medium' : 'dark'); }
  win.webContents.send('viewerConfig', { theme: m, sound: cfg().sound !== false });
}
let autoTheme = null;
function setTheme(m, resolved) {
  if (!THEMES.includes(m)) return;
  autoTheme = resolved || autoTheme;
  if (cfg().theme !== m) setCfg({ theme: m });
  pushConfig();
}

function start(opts) {
  readCfg = opts.readCfg; writeCfg = opts.writeCfg; onChange = opts.onChange || onChange;
  ipcMain.handle('progressInfo', async () => info());
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
  tasks.start((list) => { if (alive()) win.webContents.send('tasks', list); });
  ipcMain.on('viewerReady', (e) => { if (alive() && e.sender === win.webContents) { pushConfig(); win.webContents.send('tasks', tasks.get()); } });
}
module.exports = { start, toggle, setTheme, quitting: false, menuItems: () => [{ label: 'Show / hide progress screen', click: toggle }] };
