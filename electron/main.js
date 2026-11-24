// Badbounce Launcher — Electron main process
const { app, BrowserWindow, ipcMain, shell, clipboard, screen, globalShortcut, protocol, net, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { Readable } = require('stream');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const gmail = require('./gmail');
const updater = require('./updater');
const graph = require('./graph');
const csvfetch = require('./csvfetch');
const statsfetch = require('./statsfetch');
const media = require('./media');
const progress = require('./progress');
const generator = require('./generator');

const DEFAULT_SETTINGS = { day1: '2026-11-11', quietFrom: 22, quietTo: 8, islandEnabled: true, quietEnabled: true, dnd: false, dndFullscreen: true, commentReminderMin: 20, projectUrl: 'https://claude.ai/code/project/chan_01RphMgk3koQT52rqVy41WMd', autostart: true, csvWeekday: 0 };
const HIDDEN = process.argv.includes('--hidden');
const DEV_URL = process.env.BB_DEV_URL; // e.g. http://localhost:5173 during development

// Overview video picture froze after ~1 s on Mo's PC while the clock ran on: keep video out of
// DirectComposition overlays (known Chromium/Windows freeze with layered, blurred UIs).
app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
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
function emptyState() { return { version: 1, migrations: { firstUpload1111: true, warmup1113: true, firstPostToday1113: true, posted1114: true, postTime1114: true, posted1115: true, skip1119: true, skip1124: true, skip1124b: true }, uploads: {}, notes: {}, tasks: [], autoCols: {}, ideas: [], stats: { days: [], posts: [] }, milestonesSeen: [], alertsSeen: {}, settings: { ...DEFAULT_SETTINGS } }; }
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const base = emptyState();
    const st = { ...base, ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) }, stats: { ...base.stats, ...(s.stats || {}) } };
    // Mo 2026-11-10: first upload on 11 Nov, so the plan moves to Day 1 = 9 Nov (11 Nov = Day 3 = first post). One time only.
    if (!(st.migrations || {}).firstUpload1111) {
      st.settings.day1 = '2026-11-09'; st.migrations = { ...(st.migrations || {}), firstUpload1111: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    // Mo 2026-11-13: the Konzepte are final, the upload warm-up starts again today (Day 1 = 13 Nov). One time only.
    if (!(st.migrations || {}).warmup1113) {
      st.settings.day1 = '2026-11-13'; st.migrations = { ...(st.migrations || {}), warmup1113: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    // Mo 2026-11-13: the first video gets posted today (13 Nov = Day 3 = first post), so Day 1 = 11 Nov. One time only.
    if (!(st.migrations || {}).firstPostToday1113) {
      st.settings.day1 = '2026-11-11'; st.migrations = { ...(st.migrations || {}), firstPostToday1113: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    // Mo 2026-11-14: #1 was posted on 13 Nov at 18:30 (Day 3 slot), #2 on 14 Nov at 12:30. #3 was only generated, not posted. One time only.
    if (!(st.migrations || {}).posted1114) {
      st.settings.day1 = '2026-11-11';
      const up = { ...(st.uploads || {}) };
      const slot1 = new Date(2026, 10, 13, 18, 30, 0, 0).toISOString(), slot2 = new Date(2026, 10, 14, 12, 30, 0, 0).toISOString();
      up['1'] = { ...(up['1'] || {}), at: (up['1'] && up['1'].at) || slot1, slot: slot1 };
      up['2'] = { ...(up['2'] || {}), at: (up['2'] && up['2'].at) || slot2, slot: slot2 };
      delete up['3'];
      st.uploads = up; st.migrations = { ...(st.migrations || {}), posted1114: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    // Mo 2026-11-15: #3 is online too (posted for the 14 Nov 18:30 slot) but was never marked. One time only.
    if (!(st.migrations || {}).posted1115) {
      st.uploads = st.uploads || {};
      if (!st.uploads['3']) { const s3 = new Date(2026, 10, 14, 18, 30, 0, 0).toISOString(); st.uploads['3'] = { at: s3, slot: s3 }; }
      st.migrations = { ...(st.migrations || {}), posted1115: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    // #1 was marked at 00:21 on 14 Nov but went online on 13 Nov at 18:30: use the real post time (day counts, CSV matching).
    if (!(st.migrations || {}).postTime1114) {
      const u1 = (st.uploads || {})['1'];
      if (u1 && u1.slot) u1.at = u1.slot;
      st.migrations = { ...(st.migrations || {}), postTime1114: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    // Mo 2026-11-19: #19 fills today's 15:30 slot, today's 18:30 and 21:00 slots are skipped, #18 goes to 20 Nov 12:30. One time only.
    if (!(st.migrations || {}).skip1119) {
      const skip = [new Date(2026, 10, 19, 18, 30, 0, 0).toISOString(), new Date(2026, 10, 19, 21, 0, 0, 0).toISOString()];
      st.settings.skipSlots = Array.from(new Set([...(st.settings.skipSlots || []), ...skip]));
      st.migrations = { ...(st.migrations || {}), skip1119: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    // Mo 2026-11-24: he uploads by hand; the plan starts with tomorrow's first slot. Every free slot from 21 to 24 Nov is skipped (a slot that already holds an upload stays), so nothing shows as "late". One time only.
    if (!(st.migrations || {}).skip1124b) {
      const have = new Set(Object.values(st.uploads || {}).map((u) => new Date(u.slot || u.at).toISOString()));
      const skip = [];
      for (const day of [21, 22, 23, 24]) for (const [h, m] of [[1, 5], [5, 55], [10, 40], [15, 30], [20, 20]]) { const iso = new Date(2026, 10, day, h, m, 0, 0).toISOString(); if (!have.has(iso)) skip.push(iso); }
      st.settings.skipSlots = Array.from(new Set([...(st.settings.skipSlots || []), ...skip]));
      st.migrations = { ...(st.migrations || {}), skip1124: true, skip1124b: true };
      try { const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('migrate', e); }
    }
    return st;
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
      lines.push(`- ${i.text || '(no text)'}${i.newKonzept ? ' · NEW KONZEPT (run NewStyle)' : i.konzept ? ` · Konzept ${i.konzept}` : ''} · ${i.createdAt.slice(0, 10)}`);
      if (i.link) lines.push(`  - Link: ${i.link}`);
      if (i.file) lines.push(`  - File: [[Ideas/files/${i.file}|${i.file}]]`);
    }
    lines.push('', 'Back to [[Home]]');
    fs.mkdirSync(path.join(vault(), 'Ideas'), { recursive: true });
    fs.writeFileSync(path.join(vault(), 'Ideas', 'Ideas.md'), lines.join('\n') + '\n');
    // Ideas.md used to live in the vault root (before the 2026-11 vault restructure); drop that generated copy
    const old = path.join(vault(), 'Ideas.md');
    if (fs.existsSync(old) && fs.readFileSync(old, 'utf8').includes('Written by the Badbounce Launcher')) fs.unlinkSync(old);
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
/** "#11" -> 11, "#11a" -> 11.01, "#11b" -> 11.02: letter variants get their own number (Mo 2026-11-17:
 *  #11a was hidden because it shared 11 with #11, so marking #11 as posted also hid #11a). */
function vnum(m) { return +m[1] + (m[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) / 100 : 0); }
function readIndex() {
  const map = {};
  try {
    const t = fs.readFileSync(path.join(vault(), 'Results', 'Results Index.md'), 'utf8');
    for (const line of t.split(/\r?\n/)) {
      const c = line.split('|').map((x) => x.trim()); if (c.length < 4) continue;
      const m = (c[1] || '').match(/#?(\d+)([a-z])?/i); if (!m) continue;
      const k = (c[2] || '').match(/(\d+)/);
      map[vnum(m)] = { konzept: k ? +k[1] : null, title: c[3] || '' };
    }
  } catch { /* no index */ }
  return map;
}
function scanVideos() {
  const dir = path.join(vault(), 'Results'); const out = [];
  let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  const idx = readIndex();
  for (const name of names) {
    const m = name.match(/^#\s*(\d+)([a-z])?(?![\w])/i); if (!m) continue;
    const num = vnum(m), folder = path.join(dir, name);
    let files = []; try { files = fs.readdirSync(folder); } catch { continue; }
    const pick = (re, pref) => files.find((f) => pref && pref.test(f)) || files.find((f) => re.test(f));
    const vid = pick(/\.(mp4|mov)$/i, /^Badbounce/i);
    const th = pick(/\.(png|jpe?g)$/i, /^Thumbnail/i);
    const de = pick(/\.txt$/i, /^Description/i);
    const no = pick(/\.md$/i, /^Notes/i);
    let notes = ''; if (no) try { notes = fs.readFileSync(path.join(folder, no), 'utf8'); } catch { /* */ }
    let desc; if (de) try { desc = fs.readFileSync(path.join(folder, de), 'utf8'); } catch { /* */ }
    const km = notes.match(/Konzept\s*(\d+)/i);
    const konzept = km ? +km[1] : idx[num]?.konzept ?? null;
    const cm = notes.match(/\bK(1[01]|[1-9])([abc])?\b/);
    const cid = cm ? `K${cm[1]}${cm[2] || ''}` : null;
    const titleM = notes.match(/^#\s+(.+)$/m);
    let created = 0; try { created = fs.statSync(folder).birthtimeMs || fs.statSync(folder).mtimeMs; } catch { /* */ }
    out.push({ num, folder, konzept, cid, title: idx[num]?.title || (titleM ? titleM[1] : name), hasVideo: !!vid, hasThumb: !!th, hasDesc: !!de, hasNotes: !!no,
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
const ISL_W = 900, ISL_H = 520;
const iconPath = () => path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
function load(win, page) {
  if (DEV_URL) win.loadURL(`${DEV_URL}/${page}.html`);
  else win.loadFile(path.join(__dirname, '..', 'dist', `${page}.html`));
}
function createMain(show) {
  mainWin = new BrowserWindow({ width: 1400, height: 920, minWidth: 900, minHeight: 600, show: false, frame: false, backgroundColor: '#0B1124', title: 'Badbounce Launcher', icon: iconPath(), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false } });
  mainWin.setMenuBarVisibility(false);
  load(mainWin, 'index');
  // borderless fullscreen by default (F11 or the window button switches to a normal window)
  if (readCfg().windowed !== true) mainWin.setFullScreen(true);
  if (show) mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { e.preventDefault(); toggleFull(); } });
  mainWin.on('enter-full-screen', () => { broadcast(); setTimeout(keepIslandOnTop, 200); }); mainWin.on('leave-full-screen', () => { broadcast(); setTimeout(keepIslandOnTop, 200); });
  for (const ev of ['focus', 'blur', 'show', 'restore']) mainWin.on(ev, () => setTimeout(keepIslandOnTop, 100));
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
  // Windows drops "always on top" when other windows (or our own fullscreen window) take focus: re-assert it all the time
  setInterval(keepIslandOnTop, 1500);
}
function keepIslandOnTop() {
  if (!islandWin || islandWin.isDestroyed() || !islandWin.isVisible()) return;
  islandWin.setAlwaysOnTop(true, 'screen-saver', 1);
  islandWin.moveTop();
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
  return { vaultPath: v, vaultOk: fs.existsSync(v), videos: scanVideos(), state: loadState(), render: renderStatus(), mail: gmail.status(), update: updater.status(), fullscreen, winFull: !!(mainWin && !mainWin.isDestroyed() && mainWin.isFullScreen()), now: new Date().toISOString() };
}
ipcMain.handle('snapshot', () => snapshot());
/* Overview page: the final reference video of every Konzept (Konzepte/Konzept N/Drafts/Final/**). Reference only, never uploaded. */
function scanFinals() {
  // 2026-11-23 standard: Konzepte/Konzept N/Final/<ID> video.mp4 | <ID> thumbnail.png | <ID> description.txt
  // old layout (fallback): Konzepte/Konzept N/Drafts/Final/**/<ID> Final video.mp4
  const root = path.join(vault(), 'Konzepte'); const out = []; const seen = new Set();
  const add = (id, d, f, thumbName, descName) => {
    const key = id.toLowerCase(); if (seen.has(key)) return; seen.add(key);
    const sib = (n) => { const x = path.join(d, n); return fs.existsSync(x) ? x : null; };
    const descFile = sib(descName); let description = ''; try { if (descFile) description = fs.readFileSync(descFile, 'utf8').trim(); } catch { /* ignore */ }
    let size = 0, mtime = 0; try { const s = fs.statSync(f); size = s.size; mtime = s.mtimeMs; } catch { /* ignore */ }
    out.push({ id, folder: d, video: f, thumb: sib(thumbName), description, size, mtime }); };
  const walkOld = (d, depth) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const f = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 3) walkOld(f, depth + 1); continue; }
      const m = e.name.match(/^(.+?) Final video\.mp4$/i); if (m) add(m[1], d, f, `${m[1]} Final thumbnail.png`, `${m[1]} Final description.txt`); } };
  let ks = []; try { ks = fs.readdirSync(root).filter((k) => /^Konzept \d+$/.test(k)); } catch { return out; }
  for (const k of ks) { const d = path.join(root, k, 'Final'); let ents = []; try { ents = fs.readdirSync(d); } catch { /* none */ }
    for (const n of ents) { const m = n.match(/^(K\d+[a-z]?) video\.mp4$/i); if (m) add(m[1], d, path.join(d, n), `${m[1]} thumbnail.png`, `${m[1]} description.txt`); } }
  for (const k of ks) walkOld(path.join(root, k, 'Drafts', 'Final'), 0);
  return out;
}
ipcMain.handle('finals', () => scanFinals());
/* Libraries page: <vault>/Libraries/<Library>/index.json, written by Engine/Libraries/build_libraries.py (images) and build_sounds.py (sounds). */
function scanLibraries() {
  const root = path.join(vault(), 'Libraries'); const out = [];
  let ds = []; try { ds = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const d of ds) {
    if (/\.(new|old)$/.test(d)) continue;
    const dir = path.join(root, d); let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { continue; }
    if (j.kind === 'sounds') {
      const concepts = (j.concepts || []).map((c) => ({ id: c.id, name: c.name, items: (c.items || []).map((it) => ({ ...it, path: it.file ? path.join(dir, c.id, it.file) : null })) }));
      out.push({ folder: dir, kind: 'sounds', title: j.title || d, concept: null, desc: 'Every sound the concept engines put into the videos, nothing else.', items: [], concepts });
    } else {
      out.push({ folder: dir, kind: 'images', title: j.title || d, concept: j.concept || null, desc: j.desc || '', items: (j.items || []).map((it) => ({ ...it, path: path.join(dir, it.file) })), concepts: [] });
    }
  }
  let mtime = 0; try { mtime = fs.statSync(path.join(root, 'index.json')).mtimeMs; } catch { /* */ }
  return { root, built: mtime, libraries: out };
}
ipcMain.handle('libraries', () => ({ ...scanLibraries(), status: libStatus }));
/* Libraries stay current by themselves: at start, every 15 min and when an Engine file changes, run the generator with
   --if-changed (it compares a stamp of all engine files and exits at once when nothing changed). Low priority, hidden. */
let libStatus = { state: 'idle', msg: '', at: 0 }; let libProc = null; let libAgain = false; let libWatch = null; let libTimer = null;
function libSet(state, msg) { libStatus = { state, msg, at: Date.now() }; sendAll('librariesStatus', libStatus); }
function rebuildLibraries(force) {
  const v = vault(); const script = path.join(v, 'Engine', 'Libraries', 'build_libraries.py');
  if (!fs.existsSync(script)) return;
  if (libProc) { libAgain = true; return; }
  const tries = process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []]];
  const logp = path.join(dataDir(), 'libraries-build-log.txt');
  const run = (i) => {
    if (i >= tries.length) { libSet('error', 'Python not found, libraries not rebuilt'); return; }
    const [cmd, pre] = tries[i]; let out = '';
    let p; try { p = spawn(cmd, [...pre, script, 'Engine', 'Libraries', ...(force ? [] : ['--if-changed'])], { cwd: v, windowsHide: true, env: { ...process.env, OMP_NUM_THREADS: '1', PYTHONIOENCODING: 'utf-8' } }); } catch { run(i + 1); return; }
    libProc = p; let started = false;
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* */ }
    const onData = (d) => { out += d; if (!started && !/^up to date/m.test(out)) { started = true; libSet('running', 'Rebuilding libraries…'); } const m = String(d).trim().split('\n').pop(); if (started && m) libSet('running', m.slice(0, 120)); };
    p.stdout.on('data', onData); p.stderr.on('data', (d) => { out += d; });
    p.on('error', () => { libProc = null; run(i + 1); });
    p.on('close', (code) => {
      libProc = null; try { fs.writeFileSync(logp, `${new Date().toISOString()} exit ${code}\n${out}`); } catch { /* */ }
      if (/^up to date/m.test(out)) { if (libStatus.state !== 'idle') libSet('idle', ''); }
      else { const f = (out.match(/failed: (.*)/) || [])[1]; libSet(code === 0 ? 'done' : 'error', code === 0 ? 'Libraries rebuilt' : `Rebuild had errors${f && f !== 'none' ? ': ' + f : ''} (log: ${logp})`); }
      if (libAgain) { libAgain = false; setTimeout(() => rebuildLibraries(false), 5000); }
    });
  };
  run(0);
}
function startLibrariesAuto() {
  setTimeout(() => rebuildLibraries(false), 20000);
  clearInterval(libTimer); libTimer = setInterval(() => rebuildLibraries(false), 15 * 60000);
  try { libWatch?.close(); let t = null; libWatch = fs.watch(path.join(vault(), 'Engine'), { recursive: true }, (_ev, f) => { if (f && /__pycache__|\.(pyc|mp4|log|tmp)$/i.test(String(f))) return; clearTimeout(t); t = setTimeout(() => rebuildLibraries(false), 60000); }); } catch { /* no Engine folder */ }
}
ipcMain.handle('librariesRebuild', () => { rebuildLibraries(true); return libStatus; });
ipcMain.handle('mailConnect', async (_e, id, secret) => { try { const r = await gmail.connect(String(id).trim(), String(secret).trim(), true); broadcast(); return { ok: true, email: r.email }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('mailRead', async (_e, id) => { const r = await gmail.markRead(String(id)); broadcast(); return r; });
ipcMain.handle('mailAllowModify', async () => { try { await gmail.allowModify(); broadcast(); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('mailDisconnect', () => { gmail.disconnect(); broadcast(); });
ipcMain.handle('mailBody', async (_e, id) => { try { return { ok: true, ...(await gmail.body(String(id))) }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
/* Mo 2026-11-24: an update must not stop a running render. While Claude renders, the new files are unpacked and the
   windows are only RELOADED (the render is a child of this process, a restart would kill it). Changes to electron/*.js
   take effect at the next real start; the screens (dist) are new immediately. */
function restartWithUpdate(hidden) {
  const rendering = (() => { try { return generator.status().state === 'running'; } catch { return false; } })();
  if (updater.apply(vault())) {
    if (rendering) {
      for (const w of BrowserWindow.getAllWindows()) { if (!w.isDestroyed() && w.webContents) { try { w.webContents.reloadIgnoringCache(); } catch { /* */ } } }
      return true;
    }
    quitting = true; app.relaunch({ args: hidden ? ['--hidden'] : [] }); app.exit(0); return true;
  }
  broadcast(); return false;
}
ipcMain.handle('applyUpdate', () => restartWithUpdate(false));
const allWins = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== islandWin);
const sendAll = (ch, ...a) => { for (const w of allWins()) w.webContents.send(ch, ...a); };
/* vault graph (Obsidian view) */
let graphWatched = '';
ipcMain.handle('vaultGraph', () => { const v = vault(); if (graphWatched !== v) { graphWatched = v; graph.watch(v, () => sendAll('graphChanged')); } return graph.build(v); });
ipcMain.handle('noteText', (_e, id) => graph.noteText(vault(), String(id)));
ipcMain.handle('openNote', async (_e, id) => { const abs = path.resolve(vault(), String(id)); if (!abs.startsWith(path.resolve(vault()))) return; try { await shell.openExternal('obsidian://open?path=' + encodeURIComponent(abs)); } catch { shell.openPath(abs); } });
let graphWin = null;
ipcMain.on('openGraphWindow', () => {
  if (graphWin && !graphWin.isDestroyed()) { graphWin.show(); graphWin.focus(); return; }
  graphWin = new BrowserWindow({ width: 1200, height: 820, minWidth: 600, minHeight: 400, backgroundColor: '#04050A', title: 'Vault graph · Badbounce', icon: iconPath(), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false } });
  if (DEV_URL) graphWin.loadURL(`${DEV_URL}/index.html#vault-solo`); else graphWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'vault-solo' });
  graphWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  graphWin.on('closed', () => { graphWin = null; });
});
/* background TikTok CSV fetch */
ipcMain.handle('csvFetch', () => csvfetch.start({ status: (st) => sendAll('csvStatus', st), files: (f) => sendAll('csvFiles', f) }));
/* Studio pages are only opened for fresh videos (<= 72 h) and for a few that never got their numbers: keeps each run short, so we can pull often */
function deepFn() {
  const known = new Set(); let unknown = 0;
  try { for (const p of loadState().stats.posts || []) if (p.link && (p.avgWatch != null || p.retention)) known.add((p.link.match(/video\/(\d+)/) || [])[1]); } catch { /* */ }
  return (p) => {
    const age = p.postTime ? (Date.now() - Date.parse(p.postTime)) / 3600e3 : 0;
    if (age <= 72) return true;
    const id = (p.link.match(/video\/(\d+)/) || [])[1];
    return !known.has(id) && unknown++ < 8;
  };
}
let lastStatsAt = 0;
const runStats = () => { lastStatsAt = Date.now(); statsfetch.run({ dataDir, deep: deepFn(), status: (st) => sendAll('statsStatus', st), result: (r) => sendAll('statsPosts', r) }); };
ipcMain.handle('statsFetch', () => { runStats(); });
/* Hourly or better (Mo 2026-11-24): every 20 min while a video is younger than 12 h (viral watch), else every 45 min. Never while a run is active. */
function statsDue() {
  if (statsfetch.isRunning()) return false;
  let fresh = false;
  try { fresh = (loadState().stats.posts || []).some((p) => p.postTime && Date.now() - Date.parse(p.postTime) < 12 * 3600e3); } catch { /* */ }
  return Date.now() - lastStatsAt >= (fresh ? 20 : 45) * 60e3;
}
ipcMain.on('csvShow', () => csvfetch.show());
ipcMain.on('csvCancel', () => csvfetch.cancel((st) => sendAll('csvStatus', st)));
function toggleFull() { if (!mainWin) return; const full = !mainWin.isFullScreen(); mainWin.setFullScreen(full); const c = readCfg(); c.windowed = !full; writeCfg(c); }
ipcMain.on('win', (_e, a) => { if (!mainWin) return; if (a === 'min') { if (mainWin.isFullScreen()) mainWin.minimize(); else mainWin.minimize(); } else if (a === 'close') mainWin.hide(); else if (a === 'full') toggleFull(); });
ipcMain.handle('checkUpdate', () => { const st = updater.check(vault()); broadcast(); return st; });
ipcMain.handle('mailRefresh', async () => { await gmail.refresh(); broadcast(); });
/* an upload that was just scheduled must survive a stale save from the window (race: the window saves its old copy right after the status event) */
const freshMarks = {};
ipcMain.handle('save', (_e, st) => {
  try { const now = Date.now(); for (const [n, m] of Object.entries(freshMarks)) { if (now - m.t > 120000) delete freshMarks[n]; else if (st && st.uploads && !st.uploads[n]) st.uploads[n] = m.e; } } catch { /* */ }
  saveState(st); broadcast();
});
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
/* Autopilot: render one new video in the background (hidden, low priority) */
ipcMain.handle('genStart', (_e, job) => generator.start({ vault: vault(), cid: String(job.cid), num: +job.num, via: job.via, reason: job.reason, deadline: job.deadline, model: job.model, onStatus: (st) => sendAll('genStatus', st) }));
ipcMain.handle('genStatus', () => generator.status());
ipcMain.handle('genStop', () => generator.cancel());
/* small atomic changes of the autopilot state from the island window (it must not save a whole stale copy of the state) */
ipcMain.handle('autoPatch', (_e, op) => {
  const st = loadState(); const a = st.auto = st.auto || { enabled: false, approvals: {}, genJobs: [], alerts: [] };
  a.approvals = a.approvals || {}; a.genJobs = a.genJobs || []; a.alerts = a.alerts || [];
  if (op.type === 'enabled') a.enabled = !!op.value;
  else if (op.type === 'autoApprove') a.autoApprove = !!op.value;
  else if (op.type === 'approve') for (const n of op.nums || []) a.approvals[String(n)] = 'ok';
  else if (op.type === 'dismiss') a.alerts = a.alerts.map((x) => (x.id === op.id ? { ...x, resolved: true } : x));
  else return false;
  saveState(st); broadcast(); return true;
});
ipcMain.handle('genReady', () => generator.ready(vault()));
/* ranked render queue as a file (for Claude and for you): Engine\Auto\gen-requests.json */
ipcMain.handle('genQueueWrite', (_e, jobs) => { try { const d = path.join(vault(), 'Engine', 'Auto'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'gen-requests.json'), JSON.stringify({ updated: new Date().toISOString(), jobs }, null, 1)); return true; } catch { return false; } });
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
ipcMain.handle('mediaNow', () => media.status());
ipcMain.on('mediaCmd', (_e, c) => media.command(c));
ipcMain.on('islandHover', (_e, on) => { if (islandWin) islandWin.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('islandSize', () => { /* window keeps a fixed size; the pill is drawn inside */ });
ipcMain.on('showMain', (_e, page) => showMain(page));
ipcMain.on('islandToast', (_e, title, sub) => { if (islandWin) islandWin.webContents.send('islandToast', { title, sub }); });

function setAutostart(on) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath, args: ['--hidden'] });
}

/* ---------- taskbar: shortcuts must carry the same app id as the running app,
   otherwise Windows shows a second taskbar icon next to the pinned one ---------- */
const AUMID = 'Badbounce.Launcher';
function fixShortcuts() {
  if (process.platform !== 'win32') return;
  const ad = app.getPath('appData');
  const dirs = [app.getPath('desktop'), path.join(ad, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(ad, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'), path.join(ad, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')];
  const exe = process.execPath.toLowerCase();
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith('.lnk')); } catch { continue; }
    for (const f of files) {
      const p = path.join(d, f);
      try {
        const l = shell.readShortcutLink(p);
        if ((l.target || '').toLowerCase() !== exe || l.appUserModelId === AUMID) continue;
        shell.writeShortcutLink(p, 'update', { appUserModelId: AUMID, icon: path.join(__dirname, 'icon.ico'), iconIndex: 0 });
      } catch (e) { console.error('shortcut', p, e.message); }
    }
  }
}

/* ---------- app ---------- */
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(() => {
    app.setAppUserModelId(AUMID);
    fixShortcuts();
    if (restartWithUpdate(HIDDEN)) return;
    startLibrariesAuto();
    // vault files for the UI. Videos need byte ranges (206), else Chromium stalls after the first chunk (Overview player froze after ~1 s).
    const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
    protocol.handle('bbfile', async (req) => {
      const u = new URL(req.url); const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
      let size;
      try { size = (await fs.promises.stat(p)).size; } catch { return new Response('not found', { status: 404 }); }
      const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
      if (!m) return new Response(Readable.toWeb(fs.createReadStream(p)), { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
      let start = m[1] ? +m[1] : size - +m[2], end = m[1] && m[2] ? +m[2] : size - 1;
      if (!m[1]) end = size - 1;
      start = Math.max(0, start); end = Math.min(end, size - 1);
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      return new Response(Readable.toWeb(fs.createReadStream(p, { start, end })), { status: 206, headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' } });
    });
    createMain(!HIDDEN);
    createIsland();
    progress.start({ readCfg, writeCfg, onChange: () => sendAll('progressChanged') });
    // the launcher's theme button also sets the Progress screen's theme
    ipcMain.on('themeMode', (_e, m) => progress.setTheme(String(m)));
    try {
      tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }));
      tray.setToolTip('Badbounce Launcher');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open launcher', click: () => showMain() },
        { label: 'Show / hide island', click: () => { if (islandWin.isVisible()) islandWin.hide(); else islandWin.showInactive(); } },
        ...progress.menuItems(),
        { type: 'separator' },
        { label: 'Quit', click: () => { quitting = true; progress.quitting = true; app.quit(); } },
      ]));
      tray.on('click', () => showMain());
    } catch (e) { console.error('tray', e); }
    globalShortcut.register('Control+Alt+B', () => { if (islandWin) { islandWin.setIgnoreMouseEvents(false); islandWin.webContents.send('navigate', 'toggle'); } });
    const st = loadState(); setAutostart(st.settings.autostart); if (fs.existsSync(vault())) writeIdeasMd(st);
    startFullscreenWatch();
    media.start((m) => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('media', m); }, path.join(dataDir(), 'media-log.txt'));
    app.on('before-quit', () => media.stop());
    autoBackup(); setInterval(autoBackup, 3600000);
    setTimeout(runStats, 40e3); setInterval(() => { if (statsDue()) runStats(); }, 60e3); // live stats in the background, 20-45 min apart (hidden window)
    // re-scan the vault every 20 s so new Gen results appear on their own
    setInterval(broadcast, 20000);
    // look for a new version in OneDrive every 5 min; install it right away while the window is hidden
    setInterval(() => { const u = updater.check(vault()); if (u.ready) { if (!mainWin || !mainWin.isVisible()) restartWithUpdate(true); else broadcast(); } }, 5 * 60e3);
    gmail.refresh().then(broadcast); setInterval(() => gmail.refresh().then(broadcast), 3 * 60e3);
    if (process.env.BB_SHOT) setTimeout(async () => {
      try {
        if (process.env.BB_PAGE) mainWin.webContents.send('navigate', process.env.BB_PAGE);
        if (process.env.BB_ISLAND_OPEN) islandWin.webContents.send('navigate', 'toggle');
        await new Promise((r) => setTimeout(r, +(process.env.BB_SHOT_WAIT || 1500)));
        if (process.env.BB_JS) { await mainWin.webContents.executeJavaScript(process.env.BB_JS); await new Promise((r) => setTimeout(r, 1500)); }
        fs.writeFileSync(process.env.BB_SHOT, (await mainWin.webContents.capturePage()).toPNG());
        fs.writeFileSync(process.env.BB_SHOT.replace('.png', '-island.png'), (await islandWin.webContents.capturePage()).toPNG());
        console.log('BB_SNAPSHOT', JSON.stringify(snapshot()).slice(0, 600));
      } catch (e) { console.error('shot', e); }
      quitting = true; app.quit();
    }, 4000);
  });
  app.on('before-quit', () => { quitting = true; progress.quitting = true; try { generator.stop(); } catch { /* */ } });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* stay in tray */ });
}
