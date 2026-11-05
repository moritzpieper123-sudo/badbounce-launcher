/* Self-updater: new versions arrive through OneDrive.
   Claude drops  <vault>/.claude-workspace/launcher/update/update.json  ({ "version": "1.8.0" })
   and app-update.zip (dist/, electron/, package.json). When the version is newer than the
   installed one, the files are unpacked over the app folder and the launcher restarts. */
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const APP_DIR = app.getAppPath();
const current = () => { try { return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } };
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
let status = { current: current(), ready: null, error: null };

function check(vault) {
  status.current = current();
  try {
    const dir = path.join(vault, '.claude-workspace', 'launcher', 'update');
    const v = JSON.parse(fs.readFileSync(path.join(dir, 'update.json'), 'utf8')).version;
    status.ready = v && newer(String(v), status.current) && fs.existsSync(path.join(dir, 'app-update.zip')) ? String(v) : null;
  } catch { status.ready = null; }
  return status;
}

/** Unpacks the update over the app folder. Returns true when a restart is needed. */
function apply(vault) {
  if (!check(vault).ready || app.isPackaged === false && !process.env.BB_UPDATE_TEST) return false;
  const zip = path.join(vault, '.claude-workspace', 'launcher', 'update', 'app-update.zip');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-upd-'));
  try {
    const win = process.platform === 'win32';
    let r = win ? spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', tmp], { windowsHide: true })
      : spawnSync('unzip', ['-q', '-o', zip, '-d', tmp]);
    if (r.status !== 0 && win) r = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`], { windowsHide: true });
    for (const f of ['package.json', 'electron/main.js', 'dist/index.html']) if (!fs.existsSync(path.join(tmp, f))) throw new Error('update zip incomplete: ' + f);
    const v = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')).version;
    if (!newer(v, current())) throw new Error(`update zip has version ${v}`);
    fs.rmSync(path.join(APP_DIR, 'dist'), { recursive: true, force: true });
    for (const f of fs.readdirSync(tmp)) fs.cpSync(path.join(tmp, f), path.join(APP_DIR, f), { recursive: true, force: true });
    status = { current: v, ready: null, error: null };
    return true;
  } catch (e) { status.error = String(e.message || e); console.error('update', e); return false; }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
}
module.exports = { check, apply, status: () => status };
