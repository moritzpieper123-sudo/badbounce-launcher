/* Runs Mo's own bb_upload.py (Badbounce\Engine\Upload) for ONE video at a time.
   Modes: 'schedule' (schedules the post in TikTok Studio), 'test' (everything except the final click).
   The script writes last_result.json; this module reads it after the process ends. */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let running = null; // { key, mode }

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const scriptDir = (vault) => path.join(vault, 'Engine', 'Upload');
const status = () => (running ? { state: 'running', key: running.key, mode: running.mode, msg: running.msg || 'starting…' } : { state: 'idle' });

function start({ vault, key, mode, slotIso, onStatus, onDone }) {
  if (running) return { ok: false, error: `an upload is already running (#${running.key})` };
  const dir = scriptDir(vault), script = path.join(dir, 'bb_upload.py');
  if (!fs.existsSync(script)) return { ok: false, error: `bb_upload.py not found in ${dir}` };
  if (!/^\d+[a-z]?$/i.test(String(key))) return { ok: false, error: 'bad video number' };
  const args = [script, String(key), '--launcher'];
  if (mode === 'test' || mode === 'schedule') {
    if (!slotIso) return { ok: false, error: 'no slot given' };
    args.push('--at', fmt(new Date(slotIso)));
    if (mode === 'test') args.push('--test');
  } else return { ok: false, error: 'bad mode' };

  running = { key: String(key), mode, msg: 'starting…' };
  const startedAt = Date.now();
  const emit = (extra) => onStatus && onStatus({ ...status(), ...extra });
  emit();
  const finish = (ok, msg) => {
    const was = running; running = null;
    const st = { state: ok ? 'ok' : 'error', key: was.key, mode: was.mode, msg };
    onStatus && onStatus(st);
    onDone && onDone({ ...st, slotIso, ok });
  };
  const launch = (exe) => {
    const p = spawn(exe, args, { cwd: dir, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: false });
    const onLine = (b) => { const ln = String(b).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop(); if (ln && running) { running.msg = ln; emit(); } };
    p.stdout.on('data', onLine); p.stderr.on('data', onLine);
    p.on('error', (e) => { if (e.code === 'ENOENT' && exe === 'py') return launch('python'); finish(false, `could not start Python (${e.code || e.message})`); });
    p.on('close', () => {
      let r = null; try { r = JSON.parse(fs.readFileSync(path.join(dir, 'last_result.json'), 'utf8')); } catch { /* */ }
      const fresh = r && r.at && new Date(r.at).getTime() >= startedAt - 5000 && String(r.key) === String(key);
      if (fresh && r.ok) finish(true, mode === 'test' ? 'test done, nothing published' : 'scheduled in TikTok Studio');
      else finish(false, fresh ? (r.msg || 'failed') : 'no result from the script, see Engine\\Upload\\upload.log');
    });
  };
  launch('py');
  return { ok: true };
}

module.exports = { start, status };
