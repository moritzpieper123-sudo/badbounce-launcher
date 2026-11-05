// Background TikTok Studio CSV fetch.
// Opens TikTok Studio Analytics in a hidden window that keeps its own login (partition persist:tiktok),
// clicks "Download data", picks CSV, and catches the downloaded file. The launcher then imports it the same
// way as a dropped file. If TikTok needs a login, or the buttons cannot be found, the window is shown so Mo
// can do that one step by hand; the download is still caught automatically.
const { BrowserWindow, session, app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const STUDIO = process.env.BB_STUDIO_URL || 'https://www.tiktok.com/tiktokstudio/analytics/overview';
let job = null;

function chromeUA() { return (app.userAgentFallback || '').replace(/\s?Electron\/\S+/, '').replace(/\s?badbounce-launcher\/\S+/i, '').replace(/\s?Badbounce Launcher\/\S+/i, ''); }

/** Script run inside TikTok Studio: one step per call; returns what it did. */
const STEP = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const click = (el) => { el.scrollIntoView({ block: 'center' }); ['pointerdown','mousedown','pointerup','mouseup','click'].forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))); };
  const W = window; W.__bb = W.__bb || {};
  if (/login|passport|signup/i.test(location.href) || document.querySelector('form [type=password], [data-e2e=login-modal]')) return 'login';
  const dialogs = [...document.querySelectorAll('[role=dialog], [class*=Modal], [class*=modal], [class*=Drawer], [class*=drawer], [class*=Popover]')].filter(vis);
  const dlg = dialogs[dialogs.length - 1];
  if (dlg) {
    const els = [...dlg.querySelectorAll('button, [role=button], [role=radio], [role=option], [role=tab], label, div, span')].filter(vis);
    const csv = els.find((el) => /^csv$/i.test(txt(el)));
    if (csv && !W.__bb.csv) { click(csv.closest('label,[role=radio],[role=option],button,[role=button]') || csv); W.__bb.csv = 1; return 'picked csv'; }
    const range = els.find((el) => /^(last 28 days|letzte 28 tage|28 days|28 tage)$/i.test(txt(el)));
    if (range && !W.__bb.range) { click(range); W.__bb.range = 1; return 'picked 28 days'; }
    const go = els.filter((el) => /^(download|export|herunterladen|exportieren|daten herunterladen|download data|confirm|bestätigen)$/i.test(txt(el)) && el.matches('button, [role=button]')).pop();
    if (go && !W.__bb.go) { click(go); W.__bb.go = Date.now(); return 'confirmed'; }
    if (W.__bb.go && Date.now() - W.__bb.go > 15000) { W.__bb.go = 0; return 'retry'; }
    return 'dialog';
  }
  const all = [...document.querySelectorAll('button, [role=button], a')].filter(vis);
  const btn = all.find((el) => /^(download data|daten herunterladen|download|herunterladen|export data|daten exportieren|export|exportieren)$/i.test(txt(el)))
    || all.find((el) => /download|herunterladen|export/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-e2e') || '')));
  if (btn && (!W.__bb.open || Date.now() - W.__bb.open > 12000)) { click(btn); W.__bb.open = Date.now(); return 'opened download'; }
  return document.readyState === 'complete' ? 'looking' : 'loading';
})()`;

function extract(file, dir) {
  if (process.platform === 'win32') {
    try { execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', file, '-C', dir], { windowsHide: true }); return; } catch { /* fall back */ }
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${file.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`], { windowsHide: true });
  } else execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
}
function listFiles(dir) { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...listFiles(p)); else out.push(p); } return out; }
/** Minimal .xlsx reader: first sheets -> CSV text (TikTok sometimes offers only Excel). */
function xlsxToCsv(file, tmp) {
  const dir = fs.mkdtempSync(path.join(tmp, 'x-')); extract(file, dir);
  const read = (p) => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return ''; } };
  const unx = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unx([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const out = [];
  const sheets = fs.existsSync(path.join(dir, 'xl', 'worksheets')) ? fs.readdirSync(path.join(dir, 'xl', 'worksheets')).filter((f) => /\.xml$/.test(f)).sort() : [];
  for (const sh of sheets) {
    const xml = read('xl/worksheets/' + sh); const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (c[1].match(/r="([A-Z]+)/) || [])[1] || ''; let col = 0; for (const ch of ref) col = col * 26 + ch.charCodeAt(0) - 64; col = Math.max(1, col) - 1;
        const t = (c[1].match(/t="(\w+)"/) || [])[1]; const v = ((c[2] || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        const is = ((c[2] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
        cells[col] = t === 's' ? shared[+v] ?? '' : t === 'inlineStr' ? unx(is || '') : unx(v || '');
      }
      rows.push(Array.from(cells, (x) => { const s = x ?? ''; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','));
    }
    out.push({ name: path.basename(file).replace(/\.xlsx$/i, '') + '-' + sh.replace('.xml', '') + '.csv', text: rows.join('\n') });
  }
  return out;
}
function readDownload(file, tmp) {
  if (/\.csv$/i.test(file)) return [{ name: path.basename(file), text: fs.readFileSync(file, 'utf8') }];
  if (/\.xlsx$/i.test(file)) return xlsxToCsv(file, tmp);
  if (/\.zip$/i.test(file)) {
    const dir = fs.mkdtempSync(path.join(tmp, 'z-')); extract(file, dir);
    const out = [];
    for (const f of listFiles(dir)) { if (/\.csv$/i.test(f)) out.push({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') }); else if (/\.xlsx$/i.test(f)) out.push(...xlsxToCsv(f, tmp)); }
    return out;
  }
  return [];
}

function start({ status, files }) {
  if (job) { if (job.win && !job.win.isDestroyed() && (job.state === 'login' || job.state === 'needs-you')) job.win.show(); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-csv-'));
  const ses = session.fromPartition('persist:tiktok');
  ses.setUserAgent(chromeUA());
  const win = new BrowserWindow({ show: false, width: 1280, height: 860, title: 'TikTok Studio · Badbounce Launcher', autoHideMenuBar: true, webPreferences: { session: ses, sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  job = { win, state: 'running', shownByUs: false, t0: Date.now(), studioAt: 0, done: false, timer: null };
  const set = (state, msg) => { if (!job) return; job.state = state; status({ state, msg }); };
  const finish = (state, msg) => {
    if (!job || job.done) return; job.done = true; clearInterval(job.timer);
    ses.removeListener('will-download', onDl);
    try { if (!win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    job = null; status({ state, msg });
  };
  const onDl = (_e, item) => {
    const file = path.join(tmp, item.getFilename() || 'tiktok-data.csv');
    item.setSavePath(file);
    set('running', 'Downloading…');
    item.once('done', (_ev, st) => {
      if (st !== 'completed') return finish('error', 'The download was interrupted. Try again.');
      try {
        const got = readDownload(file, tmp);
        if (!got.length) return finish('error', `Downloaded ${path.basename(file)}, but found no CSV inside`);
        files(got); finish('done', `Imported ${got.length} file${got.length > 1 ? 's' : ''} from TikTok`);
      } catch (e) { finish('error', 'Could not read the download: ' + (e.message || e)); }
    });
  };
  ses.on('will-download', onDl);
  job.off = () => { ses.removeListener('will-download', onDl); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } };
  win.on('close', (e) => { if (job && !job.done) { e.preventDefault(); win.hide(); if (job.state === 'login' || job.state === 'needs-you') finish('idle', 'CSV fetch cancelled'); } });
  win.webContents.setWindowOpenHandler(({ url }) => { win.loadURL(url); return { action: 'deny' }; });
  set('running', 'Opening TikTok Studio…');
  win.loadURL(STUDIO).catch(() => { /* handled by the loop */ });

  job.timer = setInterval(async () => {
    if (!job || job.done || win.isDestroyed()) return;
    const url = win.webContents.getURL();
    let r = 'loading';
    try { r = await win.webContents.executeJavaScript(STEP, true); } catch { r = 'loading'; }
    if (!job || job.done) return;
    if (r === 'login') {
      if (job.state !== 'login') { set('login', 'Log in to TikTok once in the window that opened. The launcher remembers it.'); win.show(); win.focus(); job.shownByUs = true; }
      return;
    }
    if (job.state === 'login') { // logged in now: hide again and go to analytics
      set('running', 'Logged in, opening Analytics…'); if (job.shownByUs) win.hide(); job.shownByUs = false;
      if (!/tiktokstudio\/analytics/.test(url)) win.loadURL(STUDIO);
      return;
    }
    if (/tiktokstudio/.test(url) && !job.studioAt) job.studioAt = Date.now();
    if (!process.env.BB_STUDIO_URL && !/tiktokstudio\/analytics/.test(url) && /tiktok\.com/.test(url) && Date.now() - job.t0 > 8000 && !/login/.test(url)) { win.loadURL(STUDIO); return; }
    if (job.state === 'running') set('running', r === 'opened download' || r === 'dialog' || r === 'picked csv' || r === 'picked 28 days' ? 'Choosing CSV…' : r === 'confirmed' ? 'Waiting for the file…' : 'Looking for Download data…');
    const since = Date.now() - (job.studioAt || job.t0);
    if (job.state === 'running' && since > 75000) {
      set('needs-you', 'I could not find the Download button. Click "Download data" in the TikTok window; I catch the file automatically.');
      win.show(); win.focus();
    }
    if (Date.now() - job.t0 > 12 * 60e3) finish('error', 'The CSV fetch timed out. Use Import by hand.');
  }, 1500);
}
function show() { if (job?.win && !job.win.isDestroyed()) { job.win.show(); job.win.focus(); } }
function cancel(status) { if (!job) return; const w = job.win; job.done = true; job.off?.(); clearInterval(job.timer); job = null; try { w.destroy(); } catch { /* ignore */ } status({ state: 'idle', msg: 'CSV fetch cancelled' }); }
const running = () => !!job;
module.exports = { start, show, cancel, running };
