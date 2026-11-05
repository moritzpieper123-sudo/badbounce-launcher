// Badbounce Launcher — Electron main process
const { app, BrowserWindow, ipcMain, shell, clipboard, screen, globalShortcut, protocol, net, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const gmail = require('./gmail');

const DEFAULT_SETTINGS = { day1: '2026-11-05', quietFrom: 22, quietTo: 8, islandEnabled: true, quietEnabled: true, dnd: false, dndFullscreen: true, commentReminderMin: 20, projectUrl: 'https://claude.ai/code/project/chan_01RphMgk3koQT52rqVy41WMd', autostart: true, csvWeekday: 0 };
const HIDDEN = process.argv.includes('--hidden');
const DEV_URL = process.env.BB_DEV_URL; // e.g. http://localhost:5173 during development

protocol.registerSchemesAsPrivileged([{ scheme: 'bbfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }]);

/* ---------- config + paths ---------- */
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } }
function writeCfg(c) { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2)); }
function guessVault() {
  const home = os.homedir();
  const cands = [process.env.OneDrive && path.join(process.env.OneDrive, 'Badbounce'), path.join(home, 'OneDrive', 'Badbounce')].filter(Boolean);
  // the launcher normally lives in Badbounce\.claude-workspace\launcher\<app>
  let d = path.dirname(app.getPath('exe'));
  for (let i = 0; i < 5; i++) { if (path.basename(d) === 'Badbounce') { cands.unshift(d); break; } d = path.dirname(d); }
  return cands.find((c) => fs.existsSync(c)) || cands[cands.length - 1];
}
const vault = () => process.env.BB_VAULT || readCfg().vaultPath || guessVault();
const dataDir = () => path.join(vault(), '.claude-workspace', 'launcher-data');
const stateFile = () => path.join(dataDir(), 'state.json');

/* ---------- state ---------- */
function emptyState() { return { version: 1, uploads: {}, notes: {}, tasks: [], autoCols: {}, ideas: [], stats: { days: [], posts: [] }, milestonesSeen: [], alertsSeen: {}, settings: { ...DEFAULT_SETTINGS } }; }
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const base = emptyState();
    return { ...base, ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) }, stats: { ...base.stats, ...(s.stats || {}) } };
  } catch { return emptyState(); }
}
function saveState(st) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = stateFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(st, null, 1));
  fs.renameSync(tmp, stateFile());
  writeIdeasMd(st);
}
function writeIdeasMd(st) {
  try {
    const open = (st.ideas || []).filter((i) => !i.used);
    const lines = ['# Ideas', '', 'Written by the Badbounce Launcher. Open ideas for the next Gen (newest first). Edit ideas in the launcher, not here.', ''];
    if (!open.length) lines.push('_No open ideas._');
    for (const i of open) {
      lines.push(`- ${i.text || '(no text)'}${i.konzept ? ` · Konzept ${i.konzept}` : ''} · ${i.createdAt.slice(0, 10)}`);
      if (i.link) lines.push(`  - Link: ${i.link}`);
      if (i.file) lines.push(`  - File: Ideas/files/${i.file}`);
    }
    fs.writeFileSync(path.join(vault(), 'Ideas.md'), lines.join('\n') + '\n');
  } catch (e) { console.error('ideas.md', e); }
}

/* ---------- vault scan ---------- */
const durCache = new Map();
function mp4Duration(file) {
  try {
    const st = fs.statSync(file); const key = file + ':' + st.mtimeMs;
    if (durCache.has(key)) return durCache.get(key);
    const fd = fs.openSync(file, 'r'); let pos = 0, result = null;
    const hdr = Buffer.alloc(16);
    while (pos < st.size) {
      if (fs.readSync(fd, hdr, 0, 16, pos) < 8) break;
      let size = hdr.readUInt32BE(0); const type = hdr.toString('latin1', 4, 8);
      if (size === 1) size = Number(hdr.readBigUInt64BE(8)); else if (size === 0) size = st.size - pos;
      if (type === 'moov') {
        const buf = Buffer.alloc(Math.min(size, 8 * 1024 * 1024)); fs.readSync(fd, buf, 0, buf.length, pos);
        const i = buf.indexOf('mvhd', 0, 'latin1');
        if (i > 0) { const b = i - 4, v = buf[b + 8];
          if (v === 1) { const ts = buf.readUInt32BE(b + 28); const du = Number(buf.readBigUInt64BE(b + 32)); result = du / ts; }
          else { const ts = buf.readUInt32BE(b + 20); const du = buf.readUInt32BE(b + 24); result = du / ts; } }
        break;
      }
      if (size < 8) break; pos += size;
    }
    fs.closeSync(fd); durCache.set(key, result); return result;
  } catch { return null; }
}
function readIndex() {
  const map = {};
  try {
    const t = fs.readFileSync(path.join(vault(), 'Results', 'Results Index.md'), 'utf8');
    for (const line of t.split(/\r?\n/)) {
      const c = line.split('|').map((x) => x.trim()); if (c.length < 4) continue;
      const m = (c[1] || '').match(/#?(\d+)/); if (!m) continue;
      const k = (c[2] || '').match(/(\d)/);
      map[+m[1]] = { konzept: k ? +k[1] : null, title: c[3] || '' };
    }
  } catch { /* no index */ }
  return map;
}
function scanVideos() {
  const dir = path.join(vault(), 'Results'); const out = [];
  let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  const idx = readIndex();
  for (const name of names) {
    const m = name.match(/^#\s*(\d+)/); if (!m) continue;
    const num = +m[1], folder = path.join(dir, name);
    let files = []; try { files = fs.readdirSync(folder); } catch { continue; }
    const pick = (re, pref) => files.find((f) => pref && pref.test(f)) || files.find((f) => re.test(f));
    const vid = pick(/\.(mp4|mov)$/i, /^Badbounce/i);
    const th = pick(/\.(png|jpe?g)$/i, /^Thumbnail/i);
    const de = pick(/\.txt$/i, /^Description/i);
    const no = pick(/\.md$/i, /^Notes/i);
    let notes = ''; if (no) try { notes = fs.readFileSync(path.join(folder, no), 'utf8'); } catch { /* */ }
    let desc; if (de) try { desc = fs.readFileSync(path.join(folder, de), 'utf8'); } catch { /* */ }
    const km = notes.match(/Konzept\s*(\d)/i);
    const konzept = km ? +km[1] : idx[num]?.konzept ?? null;
    const titleM = notes.match(/^#\s+(.+)$/m);
    let created = 0; try { created = fs.statSync(folder).birthtimeMs || fs.statSync(folder).mtimeMs; } catch { /* */ }
    out.push({ num, folder, konzept, title: idx[num]?.title || (titleM ? titleM[1] : `#${num}`), hasVideo: !!vid, hasThumb: !!th, hasDesc: !!de,
      videoFile: vid && path.join(folder, vid), thumbFile: th && path.join(folder, th), descFile: de && path.join(folder, de), description: desc,
      durationSec: vid ? mp4Duration(path.join(folder, vid)) : null, createdMs: created });
  }
  return out.sort((a, b) => a.num - b.num);
}
function renderStatus() {
  try {
    const f = path.join(vault(), '.claude-workspace', 'render_status.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    const upd = s.updated ? Date.parse(s.updated) : fs.statSync(f).mtimeMs;
    if (Date.now() - upd > 120000 || (s.progress != null && s.progress >= 1)) return null;
    return s;
  } catch { return null; }
}

/* ---------- full-screen detection (Windows) ---------- */
let fullscreen = false;
function startFullscreenWatch() {
  if (process.platform !== 'win32') return;
  const ps = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class BBW {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
 [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
 public struct RECT { public int L, T, R, B; }
 [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
}
"@
while ($true) {
 $h = [BBW]::GetForegroundWindow(); $r = New-Object BBW+RECT; [void][BBW]::GetWindowRect($h, [ref]$r)
 $sb = New-Object System.Text.StringBuilder 256; [void][BBW]::GetClassName($h, $sb, 256); $c = $sb.ToString()
 $m = [BBW]::MonitorFromWindow($h, 2); $mi = New-Object BBW+MONITORINFO; $mi.cbSize = 40; [void][BBW]::GetMonitorInfo($m, [ref]$mi)
 $fs = ($c -ne 'Progman' -and $c -ne 'WorkerW' -and $c -ne 'Shell_TrayWnd' -and $r.L -le $mi.rcMonitor.L -and $r.T -le $mi.rcMonitor.T -and $r.R -ge $mi.rcMonitor.R -and $r.B -ge $mi.rcMonitor.B)
 if ($fs) { [Console]::Out.WriteLine('1') } else { [Console]::Out.WriteLine('0') }
 Start-Sleep -Seconds 4
}`;
  const enc = Buffer.from(ps, 'utf16le').toString('base64');
  try {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true });
    p.stdout.on('data', (d) => { const v = d.toString().trim().split(/\s+/).pop() === '1'; if (v !== fullscreen) { fullscreen = v; broadcast(); } });
    p.on('exit', () => setTimeout(startFullscreenWatch, 30000));
    app.on('before-quit', () => { try { p.kill(); } catch { /* */ } });
  } catch (e) { console.error('fullscreen watch', e); }
}

/* ---------- backups ---------- */
function backupNow() {
  const dir = path.join(dataDir(), 'backups'); fs.mkdirSync(dir, { recursive: true });
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const f = path.join(dir, `state-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`);
  const st = loadState(); st.lastBackup = d.toISOString(); saveState(st);
  fs.writeFileSync(f, JSON.stringify(st, null, 1));
  const all = fs.readdirSync(dir).filter((x) => x.startsWith('state-')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 30))) try { fs.unlinkSync(path.join(dir, old)); } catch { /* */ }
  return f;
}
function autoBackup() {
  try { const st = loadState(); if (!st.lastBackup || Date.now() - Date.parse(st.lastBackup) > 7 * 86400000) { if (fs.existsSync(stateFile())) { backupNow(); broadcast(); } } } catch (e) { console.error('backup', e); }
}

/* ---------- windows ---------- */
let mainWin = null, islandWin = null, tray = null, quitting = false;
const ISL_W = 900, ISL_H = 340;
const iconPath = () => path.join(__dirname, 'icon.png');
function load(win, page) {
  if (DEV_URL) win.loadURL(`${DEV_URL}/${page}.html`);
  else win.loadFile(path.join(__dirname, '..', 'dist', `${page}.html`));
}
function createMain(show) {
  mainWin = new BrowserWindow({ width: 1400, height: 920, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#0B1124', title: 'Badbounce Launcher', icon: iconPath(), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false } });
  mainWin.setMenuBarVisibility(false);
  load(mainWin, 'index');
  if (show) mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.on('close', (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function placeIsland() {
  if (!islandWin) return;
  const d = screen.getPrimaryDisplay(); const b = d.bounds;
  islandWin.setBounds({ x: Math.round(b.x + (b.width - ISL_W) / 2), y: b.y, width: ISL_W, height: ISL_H });
}
function createIsland() {
  islandWin = new BrowserWindow({ width: ISL_W, height: ISL_H, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false } });
  islandWin.setAlwaysOnTop(true, 'screen-saver');
  islandWin.setVisibleOnAllWorkspaces(true);
  islandWin.setIgnoreMouseEvents(true, { forward: true });
  placeIsland();
  load(islandWin, 'island');
  islandWin.once('ready-to-show', () => islandWin.showInactive());
  screen.on('display-metrics-changed', placeIsland);
}
function showMain(page) {
  if (!mainWin) createMain(true);
  mainWin.show(); mainWin.focus();
  if (page) mainWin.webContents.send('navigate', page);
}
function broadcast() { for (const w of [mainWin, islandWin]) if (w && !w.isDestroyed()) w.webContents.send('changed'); }

/* ---------- IPC ---------- */
function snapshot() {
  const v = vault();
  return { vaultPath: v, vaultOk: fs.existsSync(v), videos: scanVideos(), state: loadState(), render: renderStatus(), mail: gmail.status(), fullscreen, now: new Date().toISOString() };
}
ipcMain.handle('snapshot', () => snapshot());
ipcMain.handle('mailConnect', async (_e, id, secret) => { try { const r = await gmail.connect(String(id).trim(), String(secret).trim()); broadcast(); return { ok: true, email: r.email }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('mailDisconnect', () => { gmail.disconnect(); broadcast(); });
ipcMain.handle('mailBody', async (_e, id) => { try { return { ok: true, ...(await gmail.body(String(id))) }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('mailRefresh', async () => { await gmail.refresh(); broadcast(); });
ipcMain.handle('save', (_e, st) => { saveState(st); broadcast(); });
ipcMain.handle('copy', (_e, t) => clipboard.writeText(String(t)));
// claude.ai links open in the Claude desktop app when it is installed (claude:// protocol), else in the browser
function openLink(u) {
  if (!/^https?:\/\//.test(u)) return;
  if (/^https:\/\/claude\.ai\//.test(u) && app.getApplicationNameForProtocol('claude://')) return shell.openExternal(u.replace(/^https:\/\//, 'claude://')).catch(() => shell.openExternal(u));
  return shell.openExternal(u);
}
ipcMain.handle('openUrl', (_e, u) => openLink(u));
ipcMain.handle('openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('openVault', (_e, sub) => { const p = path.join(vault(), sub || ''); if (fs.existsSync(p)) return shell.openPath(p); fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); });
ipcMain.handle('uploadPack', (_e, num) => {
  try {
    const v = scanVideos().find((x) => x.num === num);
    if (!v || !v.videoFile) return { ok: false, error: 'video file not found' };
    const dest = path.join(app.getPath('downloads'), 'Badbounce upload');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(dest)) try { fs.unlinkSync(path.join(dest, f)); } catch { /* */ }
    fs.copyFileSync(v.videoFile, path.join(dest, path.basename(v.videoFile)));
    if (v.thumbFile) fs.copyFileSync(v.thumbFile, path.join(dest, path.basename(v.thumbFile)));
    if (v.description) clipboard.writeText(v.description.trim());
    shell.openPath(dest);
    return { ok: true, folder: 'Downloads\\Badbounce upload' };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('saveIdeaFile', (_e, name, data) => {
  const dir = path.join(vault(), 'Ideas', 'files'); fs.mkdirSync(dir, { recursive: true });
  const safe = `${new Date().toISOString().slice(0, 10)}-${String(name).replace(/[^\w.\- ]+/g, '_').slice(-80)}`;
  fs.writeFileSync(path.join(dir, safe), Buffer.from(data));
  return safe;
});
ipcMain.handle('backupNow', () => { const f = backupNow(); broadcast(); return f; });
ipcMain.handle('runGen', (_e, n) => { clipboard.writeText(n > 1 ? `Gen x${n}` : 'Gen'); openLink(loadState().settings.projectUrl); });
ipcMain.handle('setAutostart', (_e, on) => setAutostart(on));
ipcMain.handle('setVault', (_e, p) => { const c = readCfg(); c.vaultPath = p; writeCfg(c); broadcast(); });
ipcMain.on('islandHover', (_e, on) => { if (islandWin) islandWin.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('islandSize', () => { /* window keeps a fixed size; the pill is drawn inside */ });
ipcMain.on('showMain', (_e, page) => showMain(page));
ipcMain.on('islandToast', (_e, title, sub) => { if (islandWin) islandWin.webContents.send('islandToast', { title, sub }); });

function setAutostart(on) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath, args: ['--hidden'] });
}

/* ---------- app ---------- */
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(() => {
    app.setAppUserModelId('Badbounce.Launcher');
    protocol.handle('bbfile', (req) => {
      const u = new URL(req.url); const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
      return net.fetch(pathToFileURL(p).toString());
    });
    createMain(!HIDDEN);
    createIsland();
    try {
      tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }));
      tray.setToolTip('Badbounce Launcher');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open launcher', click: () => showMain() },
        { label: 'Show / hide island', click: () => { if (islandWin.isVisible()) islandWin.hide(); else islandWin.showInactive(); } },
        { type: 'separator' },
        { label: 'Quit', click: () => { quitting = true; app.quit(); } },
      ]));
      tray.on('click', () => showMain());
    } catch (e) { console.error('tray', e); }
    globalShortcut.register('Control+Alt+B', () => { if (islandWin) { islandWin.setIgnoreMouseEvents(false); islandWin.webContents.send('navigate', 'toggle'); } });
    const st = loadState(); setAutostart(st.settings.autostart);
    startFullscreenWatch();
    autoBackup(); setInterval(autoBackup, 3600000);
    // re-scan the vault every 20 s so new Gen results appear on their own
    setInterval(broadcast, 20000);
    gmail.refresh().then(broadcast); setInterval(() => gmail.refresh().then(broadcast), 3 * 60e3);
    if (process.env.BB_SHOT) setTimeout(async () => {
      try {
        if (process.env.BB_PAGE) mainWin.webContents.send('navigate', process.env.BB_PAGE);
        await new Promise((r) => setTimeout(r, 1500));
        fs.writeFileSync(process.env.BB_SHOT, (await mainWin.webContents.capturePage()).toPNG());
        fs.writeFileSync(process.env.BB_SHOT.replace('.png', '-island.png'), (await islandWin.webContents.capturePage()).toPNG());
        console.log('BB_SNAPSHOT', JSON.stringify(snapshot()).slice(0, 600));
      } catch (e) { console.error('shot', e); }
      quitting = true; app.quit();
    }, 4000);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* stay in tray */ });
}
