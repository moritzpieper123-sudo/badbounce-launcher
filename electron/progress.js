/* Progress screen: Claude's live Task Progress page as a borderless full-screen window
   on a monitor Mo picks. It has no taskbar button; its own tray icon shows, hides and configures it.
   Settings live in config.json (progress: { display, autostart, hideBar }). */
const { BrowserWindow, Tray, Menu, nativeImage, screen, shell, globalShortcut } = require('electron');
const path = require('path');

const URL = 'https://claude.ai/artifact/JmnkuAdKnUrbs6a9zyKAWJ';
const ICON = path.join(__dirname, process.platform === 'win32' ? 'progress.ico' : 'progress.png');
// Puts the page's own frame over the whole window, so claude.ai's top bar is out of sight
const HIDE_BAR_CSS = `iframe[src*="claudeusercontent"], iframe[title], main iframe {
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  max-width: none !important; max-height: none !important; border: 0 !important; border-radius: 0 !important; z-index: 2147483646 !important; }
html, body { overflow: hidden !important; background: #05080F !important; }`;

let win = null, tray = null, cssKey = null, readCfg, writeCfg;

const cfg = () => Object.assign({ display: null, autostart: true, hideBar: true, url: URL }, (readCfg() || {}).progress || {});
function setCfg(patch) { const c = readCfg() || {}; c.progress = Object.assign(cfg(), patch); writeCfg(c); }

function targetDisplay() {
  const all = screen.getAllDisplays(), want = cfg().display;
  return all.find((d) => d.id === want) || screen.getPrimaryDisplay();
}
function place() {
  if (!win || win.isDestroyed()) return;
  const b = targetDisplay().bounds;
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  win.setFullScreen(true);
  win.setSkipTaskbar(true);
}
async function applyCss() {
  if (!win || win.isDestroyed()) return;
  if (cssKey) { try { await win.webContents.removeInsertedCSS(cssKey); } catch { /* */ } cssKey = null; }
  if (cfg().hideBar) { try { cssKey = await win.webContents.insertCSS(HIDE_BAR_CSS); } catch { /* */ } }
}

function create(show) {
  if (win && !win.isDestroyed()) { if (show) { place(); win.show(); } return win; }
  const b = targetDisplay().bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, frame: false, show: false, skipTaskbar: true, backgroundColor: '#05080F',
    title: 'Badbounce Progress', icon: ICON, autoHideMenuBar: true, fullscreenable: true,
    webPreferences: { partition: 'persist:progress', contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  // a plain Chrome user agent, so claude.ai treats the window like a normal browser
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s(Electron|badbounce-launcher|Badbounce Launcher)\/\S+/gi, ''));
  win.loadURL(cfg().url);
  win.webContents.on('dom-ready', applyCss);
  win.webContents.on('did-fail-load', () => setTimeout(() => { if (win && !win.isDestroyed()) win.loadURL(cfg().url); }, 15000));
  win.webContents.on('render-process-gone', () => setTimeout(() => { if (win && !win.isDestroyed()) win.reload(); }, 3000));
  // links that leave claude.ai open in the normal browser; claude.ai sign-in pages stay in the window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(claude\.ai|[^/]*\.anthropic\.com|accounts\.google\.com)\//.test(url)) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'Escape' && !i.control && !i.alt) { /* keep Esc for the page (closes its dialogs) */ }
    if (i.key === 'F5') { e.preventDefault(); win.reload(); }
    if (i.key === 'F4' && i.alt) { e.preventDefault(); win.hide(); }
  });
  win.on('close', (e) => { if (!module.exports.quitting) { e.preventDefault(); win.hide(); } });
  win.once('ready-to-show', () => { place(); if (show) win.showInactive(); });
  return win;
}
const visible = () => !!(win && !win.isDestroyed() && win.isVisible());
function toggle() { if (visible()) win.hide(); else { create(true); place(); win.show(); } refreshMenu(); }

function refreshMenu() {
  if (!tray) return;
  const c = cfg(), prim = screen.getPrimaryDisplay().id;
  const mons = screen.getAllDisplays().map((d, i) => ({
    label: `Monitor ${i + 1}  (${d.size.width}×${d.size.height}${d.id === prim ? ', main' : ''})`, type: 'radio',
    checked: (c.display == null && d.id === prim) || d.id === c.display,
    click: () => { setCfg({ display: d.id }); create(true); place(); win.show(); refreshMenu(); },
  }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: visible() ? 'Hide progress screen' : 'Show progress screen', click: toggle },
    { label: 'Reload', click: () => { if (win && !win.isDestroyed()) win.reload(); } },
    { type: 'separator' },
    { label: 'Show on', submenu: mons },
    { label: 'Open when the PC starts', type: 'checkbox', checked: c.autostart, click: (m) => { setCfg({ autostart: m.checked }); refreshMenu(); } },
    { label: 'Hide the claude.ai bar', type: 'checkbox', checked: c.hideBar, click: (m) => { setCfg({ hideBar: m.checked }); applyCss(); refreshMenu(); } },
    { type: 'separator' },
    { label: 'Open in browser', click: () => shell.openExternal(c.url) },
  ]));
  tray.setToolTip(visible() ? 'Badbounce Progress (showing)' : 'Badbounce Progress');
}

function start(opts) {
  readCfg = opts.readCfg; writeCfg = opts.writeCfg;
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.on('click', toggle);
    refreshMenu();
  } catch (e) { console.error('progress tray', e); }
  try { globalShortcut.register('Control+Alt+P', toggle); } catch { /* */ }
  screen.on('display-added', () => { refreshMenu(); if (visible()) place(); });
  screen.on('display-removed', () => { refreshMenu(); if (visible()) place(); });
  screen.on('display-metrics-changed', () => { if (visible()) place(); });
  if (cfg().autostart) create(true);
}
module.exports = { start, toggle, quitting: false, menuItems: () => [{ label: 'Show / hide progress screen', click: toggle }] };
