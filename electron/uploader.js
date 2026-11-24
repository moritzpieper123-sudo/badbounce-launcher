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

/* Quiet mode (autopilot): Chrome opens far off-screen instead of maximised, so it never pops over a game. Done by a tiny, idempotent
   patch of Mo's bb_upload.py (marker BB_QUIET). Nothing is hidden from TikTok: it is the same normal Chrome with the same login. */
function patchQuiet(dir) {
  const f = path.join(dir, 'bb_upload.py');
  try {
    let t = fs.readFileSync(f, 'utf8');
    if (t.includes('BB_QUIET')) return true;
    const a = "args=['--start-maximized'])";
    if (!t.includes(a)) return false;
    t = t.replace(a, "args=(['--window-position=-32000,-32000', '--window-size=1400,1000', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] if os.environ.get('BB_QUIET') else ['--start-maximized']))  # BB_QUIET");
    t = t.replace("page.wait_for_timeout(300000)", "page.wait_for_timeout(8000 if os.environ.get('BB_QUIET') else 300000)");
    t = t.replace("page.wait_for_timeout(120000)", "page.wait_for_timeout(3000 if os.environ.get('BB_QUIET') else 120000)");
    fs.writeFileSync(f, t); return true;
  } catch { return false; }
}

/* TikTok Studio sometimes shows a guided-tour overlay (react-joyride) that blocks every click ("subtree intercepts pointer events").
   Idempotent patch of bb_upload.py (marker BB_NOJOY): a style that hides the overlay on every Studio page. */
function patchNoJoy(dir) {
  const f = path.join(dir, 'bb_upload.py');
  try {
    let t = fs.readFileSync(f, 'utf8');
    if (t.includes('BB_NOJOY')) return true;
    const a = "    page = ctx.pages[0] if ctx.pages else ctx.new_page()\n    page.goto(UPLOAD_URL";
    if (!t.includes(a)) return false;
    const js = "(()=>{const k=()=>{if(document.getElementById('bb-nojoy'))return;const s=document.createElement('style');s.id='bb-nojoy';s.textContent='#react-joyride-portal,.react-joyride__overlay,.react-joyride__spotlight{display:none!important;pointer-events:none!important}';(document.head||document.documentElement).appendChild(s)};k();document.addEventListener('DOMContentLoaded',k);setInterval(k,1500)})()";
    t = t.replace(a, "    try: ctx.add_init_script(\"" + js + "\")  # BB_NOJOY\n    except Exception: pass\n" + a);
    fs.writeFileSync(f, t); return true;
  } catch { return false; }
}
/** One short line for the UI: Playwright errors carry a huge call log. */
const shorten = (m) => { const s = String(m || '').split(/\s+Call log:/)[0].replace(/\s+/g, ' ').trim(); return s.length > 220 ? s.slice(0, 217) + '...' : s; };

function start({ vault, key, mode, slotIso, quiet, onStatus, onDone }) {
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

  patchNoJoy(dir);
  const quietOk = quiet && patchQuiet(dir);
  running = { key: String(key), mode, msg: 'starting…' };
  const startedAt = Date.now();
  const emit = (extra) => onStatus && onStatus({ ...status(), ...extra });
  emit();
  const finish = (ok, msg) => {
    const was = running; running = null;
    const st = { state: ok ? 'ok' : 'error', key: was.key, mode: was.mode, msg: ok ? msg : shorten(msg) };
    onStatus && onStatus(st);
    onDone && onDone({ ...st, slotIso, ok });
  };
  const launch = (exe) => {
    const p = spawn(exe, args, { cwd: dir, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...(quietOk ? { BB_QUIET: '1' } : {}) }, windowsHide: !!quietOk });
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

module.exports = { start, status, patchQuiet, patchNoJoy };
