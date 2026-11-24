/* Autopilot video generator: renders ONE new video from the standard engine of a Konzept (Engine\<ID>), in the background.
   Hidden, low priority (below normal) so games keep running. Output: Results\#N\ Badbounce #N.mp4 + Thumbnail #N.png + Description #N.txt + Notes #N.md.
   Only Konzepte whose engine can make a NEW video from a plain number are listed (K6b: boss 1-100, K9: shape 1-100).
   The other Konzepte need a Gen round with Claude (new machine, song, seed search): the Control Room says so instead of guessing.
   More recipes can be added without a new launcher: Engine\Auto\recipes.json (same shape as RECIPES below, see README in that folder). */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let running = null; // { num, cid, msg }

/* pick(usedNumbers) -> params; steps(params, out) -> [{ args, env }] run with `py -3` from Engine\<ID>; thumb(params, out) same;
   find(dir, params) -> path of a video the steps wrote somewhere else (K9 writes into its own folder) */
const RECIPES = {
  K6b: {
    label: 'Boss fight', konzept: 6, usedKey: 'Boss',
    pick: (used) => { const free = range(100).filter((n) => !used.has(n)); const boss = pickFrom(free.length ? free : range(100)); return { boss, seed: 1 + Math.floor(Math.random() * 9000) }; },
    video: (p, out) => ({ args: ['k9_video.py', out, '1.0'], env: { BOSS: String(p.boss), SEED: String(p.seed) } }),
    thumb: (p, out) => ({ args: ['thumb_k6b.py', out, String(p.boss)], env: {} }),
    notes: (p) => `Boss ${p.boss}\nSeed ${p.seed}`,
    title: (p) => `Boss fight, boss ${p.boss}`,
  },
  K9: {
    label: 'Sheet drop', konzept: 9, usedKey: 'Shape',
    pick: (used) => { const free = range(100).filter((n) => !used.has(n)); return { shape: pickFrom(free.length ? free : range(100)) }; },
    video: (p) => ({ args: ['sd_video_shapes.py'], env: { K9_SHAPE: String(p.shape) } }),
    thumb: (p, out) => ({ args: ['thumb_sd_shapes.py', out], env: { K9_SHAPE: String(p.shape) } }),
    found: (dir, p) => { const pre = `K9 shape ${String(p.shape).padStart(3, '0')} `; const f = safeLs(dir).find((n) => n.startsWith(pre) && n.endsWith('.mp4')); return f && path.join(dir, f); },
    notes: (p) => `Shape ${p.shape}`,
    title: (p) => `Sheet drop, shape ${p.shape}`,
  },
};
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const pickFrom = (a) => a[Math.floor(Math.random() * a.length)];
const safeLs = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

/** extra recipes the user (or Claude) adds in Engine\Auto\recipes.json: { "K8": { "label", "konzept", "video": {"args":[...],"env":{}}, "thumb": {...}, "usedKey" } }
 *  placeholders in args/env values: {out} {seed} {n} */
function loadExtra(vault) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(vault, 'Engine', 'Auto', 'recipes.json'), 'utf8')); const out = {};
    for (const [id, r] of Object.entries(j)) {
      if (RECIPES[id] || !r || !r.video) continue;
      const fill = (o, pr, outp) => ({ args: (o.args || []).map((a) => String(a).replace('{out}', outp).replace('{seed}', pr.seed).replace('{n}', pr.n)), env: Object.fromEntries(Object.entries(o.env || {}).map(([k, v]) => [k, String(v).replace('{seed}', pr.seed).replace('{n}', pr.n)])) });
      out[id] = { label: r.label || id, konzept: r.konzept, usedKey: 'Seed',
        pick: (used) => { let s; do { s = 1 + Math.floor(Math.random() * 9000); } while (used.has(s)); return { seed: s, n: s }; },
        video: (p, o) => fill(r.video, p, o), thumb: (p, o) => fill(r.thumb || { args: [] }, p, o), notes: (p) => `Seed ${p.seed}`, title: (p) => `${r.label || id}, seed ${p.seed}` };
    }
    return out;
  } catch { return {}; }
}
const recipes = (vault) => ({ ...loadExtra(vault), ...RECIPES });
const ready = (vault) => Object.keys(recipes(vault));

/** numbers of boss / shape / seed already used by earlier videos of this Konzept (read from the Notes files) */
function usedNumbers(vault, cid, key) {
  const used = new Set(); const dir = path.join(vault, 'Results');
  for (const d of safeLs(dir)) {
    const f = path.join(dir, d); let notes = '';
    for (const n of safeLs(f)) if (/^Notes.*\.md$/i.test(n)) { try { notes += fs.readFileSync(path.join(f, n), 'utf8') + '\n'; } catch { /* */ } }
    if (!new RegExp(`\\b${cid}\\b`).test(notes)) continue;
    const re = new RegExp(`^\\s*${key}\\s+(\\d+)`, 'gmi'); let m; while ((m = re.exec(notes))) used.add(+m[1]);
  }
  return used;
}
/** description = the Konzept's final description (reference file of the standard) */
function finalDescription(vault, cid) {
  const root = path.join(vault, 'Konzepte');
  for (const k of safeLs(root)) {
    const f = path.join(root, k, 'Final', `${cid} description.txt`);
    try { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; } catch { /* */ }
  }
  return '';
}

function run(py, args, env, cwd, onLine) {
  return new Promise((resolve) => {
    const p = spawn(py, ['-3', ...args], { cwd, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...env }, windowsHide: true });
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* */ }
    const cut = (b) => { const ln = String(b).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop(); if (ln) onLine(ln); };
    let tail = '';
    p.stdout.on('data', (b) => { cut(b); tail = String(b).slice(-300); }); p.stderr.on('data', (b) => { cut(b); tail = String(b).slice(-300); });
    p.on('error', (e) => resolve({ ok: false, msg: `could not start Python (${e.code || e.message})` }));
    p.on('close', (code) => resolve({ ok: code === 0, msg: code === 0 ? '' : `exit ${code}: ${tail.replace(/\s+/g, ' ').trim()}` }));
  });
}

/* ---------- Claude as the producer (Mo 2026-11-24: every video is rendered with Claude) ----------
   The launcher starts Claude Code headless (`claude -p`) in the vault, with the ranked job as the prompt. Claude follows the Konzept sheet + engine README
   and writes Results\#N like a normal Gen. Needs the `claude` command on the PC, signed in (Control Room > Autopilot checks it). */
const CONCEPT_NUM = (cid) => parseInt(String(cid).slice(1), 10);
function claudePrompt(cid, num, reason, deadline) {
  const k = CONCEPT_NUM(cid);
  return [
    `You are the Badbounce video producer. Make ONE new video now: concept ${cid} (Konzept ${k}), video number #${num}. Reason: ${reason}.${deadline ? ` It must be finished before ${deadline}.` : ''}`,
    `Do the normal Gen process without asking questions (nobody is watching; decide yourself):`,
    `- Read Konzepte\\Konzept ${k}\\*.md (the section "Standard rules" / "Final rules") and Engine\\${cid}\\README.md + report.md. Use only that Konzept's own engine in Engine\\${cid} (run commands from inside that folder) and its original sounds.`,
    `- Make a NEW variant: new seed, and the Konzept's variable (boss, shape, machine, flags, heads, song only if the sheet says a song is allowed without asking) that has not been used in an earlier Results folder. Never repeat an earlier video.`,
    `- Render at scale 1.0 (upload quality), 60-70 s, counts rounded to the nearest thousand, standard watermark, ALL CAPS titles, no slow motion. Check the file with ffprobe (duration) before you finish.`,
    `- Write exactly these files into Results\\#${num}\\ : "Badbounce #${num}.mp4", "Thumbnail #${num}.png" (the standard thumbnail of this Konzept), "Description #${num}.txt" (caption formula Opt #16 from Konzepte\\Konzepte Overview.md: searchable question, max 5 hashtags, no #badbounce, TikTok-flag safe, see the sheets), and "Notes #${num}.md" whose first line is "# <short title>" followed by the line "Konzept ${k} (${cid})" and the seed / variant numbers you used.`,
    `- Do NOT upload or post anything and do not change other Results folders, Final folders or engines. If something is impossible, write nothing into Results and say why in one sentence.`,
    `Finish with one line: DONE #${num} or FAILED #${num}: <reason>.`,
  ].join('\n');
}
function startClaude({ vault, cid, num, reason, deadline, model, onStatus, onDone }) {
  const dir = path.join(vault, 'Results', `#${num}`);
  if (fs.existsSync(dir) && safeLs(dir).length) return { ok: false, error: `Results\\#${num} already exists` };
  running = { num, cid, msg: 'Claude is starting…' };
  const emit = (state, msg) => { if (running) running.msg = msg; onStatus && onStatus({ state, num, cid, msg }); };
  emit('running', `${cid}: Claude is working`);
  // the prompt goes in through stdin (multi-line text with quotes cannot be passed safely as an argument, esp. through cmd.exe)
  const args = ['-p', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep', '--permission-mode', 'acceptEdits', '--add-dir', vault.includes(' ') ? `"${vault}"` : vault, '--output-format', 'text', '--model', /^(sonnet|haiku|opus)$/.test(model) ? model : 'sonnet'];
  // the launcher may start without the npm folder in PATH (autostart): look in the usual install folders
  const cands = [process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'), process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.cmd')].filter(Boolean);
  const exe = cands.find((c) => fs.existsSync(c)) || 'claude';
  const viaShell = process.platform === 'win32' && !/\.exe$/i.test(exe);
  const p = spawn(viaShell && exe.includes(' ') ? `"${exe}"` : exe, args, { cwd: vault, shell: viaShell, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  p.stdin.on('error', () => {}); p.stdin.end(claudePrompt(cid, num, reason || 'planned', deadline));
  try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* */ }
  let out = '', killed = false;
  const timer = setTimeout(() => { killed = true; try { p.kill(); } catch { /* */ } }, 100 * 60e3);
  const cut = (b) => { out += String(b); const ln = out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).pop(); if (ln) emit('running', `${cid}: ${ln}`.slice(0, 160)); };
  p.stdout.on('data', cut); p.stderr.on('data', cut);
  const finish = (ok, msg) => { clearTimeout(timer); const st = { state: ok ? 'done' : 'error', num, cid, msg }; running = null; onStatus && onStatus(st); onDone && onDone({ ...st, ok }); };
  p.on('error', (e) => finish(false, `could not start Claude (${e.code || e.message}). Is the claude command installed?`));
  p.on('close', (code) => {
    const have = ['Badbounce', 'Thumbnail', 'Description', 'Notes'].every((n) => safeLs(dir).some((f) => f.startsWith(n + ' #' + num)));
    if (!killed && have) finish(true, `${cid} #${num} is ready for review`);
    else if (/not logged in/i.test(out)) finish(false, 'Not logged in: run claude once and /login');
    else finish(false, killed ? 'Claude took longer than 100 min' : `Claude stopped (exit ${code}) without all four files: ${out.trim().split(/\r?\n/).pop() || 'no answer'}`.slice(0, 300));
  });
  return { ok: true };
}

function start({ vault, cid, num, via, reason, deadline, model, onStatus, onDone }) {
  if (running) return { ok: false, error: `already rendering #${running.num}` };
  const R = recipes(vault)[cid];
  if (via === 'claude' || !R) return startClaude({ vault, cid, num, reason, deadline, model, onStatus, onDone });
  const engine = path.join(vault, 'Engine', cid);
  if (!fs.existsSync(engine)) return { ok: false, error: `Engine\\${cid} not found` };
  const dir = path.join(vault, 'Results', `#${num}`);
  if (fs.existsSync(dir) && safeLs(dir).length) return { ok: false, error: `Results\\#${num} already exists` };
  const params = R.pick(usedNumbers(vault, cid, R.usedKey || 'Seed'));
  running = { num, cid, msg: 'starting…' };
  const emit = (state, msg) => { if (running) running.msg = msg; onStatus && onStatus({ state, num, cid, msg }); };
  emit('running', `${cid}: starting (${R.title(params)})`);
  (async () => {
    const tmp = path.join(os.tmpdir(), `bb-gen-${num}`); fs.mkdirSync(tmp, { recursive: true });
    const outVideo = path.join(tmp, 'video.mp4'), outThumb = path.join(tmp, 'thumb.png');
    let res = null;
    try {
      const v = R.video(params, outVideo);
      emit('running', `${cid}: rendering the video (this takes a while)`);
      res = await run('py', v.args, v.env, engine, (ln) => emit('running', `${cid}: ${ln}`.slice(0, 160)));
      let made = fs.existsSync(outVideo) ? outVideo : R.found ? R.found(engine, params) : null;
      if (!res.ok || !made) throw new Error(res.msg || 'no video file came out');
      const t = R.thumb(params, outThumb);
      emit('running', `${cid}: thumbnail`);
      res = await run('py', t.args, t.env, engine, () => {});
      if (!res.ok || !fs.existsSync(outThumb)) throw new Error('thumbnail failed: ' + (res.msg || 'no file'));
      const desc = finalDescription(vault, cid);
      if (!desc) throw new Error(`no ${cid} description.txt in Konzepte\\...\\Final`);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(made, path.join(dir, `Badbounce #${num}.mp4`));
      fs.copyFileSync(outThumb, path.join(dir, `Thumbnail #${num}.png`));
      fs.writeFileSync(path.join(dir, `Description #${num}.txt`), desc + '\n');
      fs.writeFileSync(path.join(dir, `Notes #${num}.md`), `# ${R.title(params)}\n\nKonzept ${R.konzept} (${cid})\n${R.notes(params)}\n\nMade automatically by the launcher autopilot on ${new Date().toISOString().slice(0, 10)}. Waiting for review in the Control Room.\n`);
      try { if (made !== outVideo) fs.unlinkSync(made); } catch { /* */ }
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
      const st = { state: 'done', num, cid, msg: `${cid} #${num} is ready for review` };
      running = null; onStatus && onStatus(st); onDone && onDone({ ...st, ok: true });
    } catch (e) {
      const st = { state: 'error', num, cid, msg: String(e.message || e) };
      running = null; onStatus && onStatus(st); onDone && onDone({ ...st, ok: false });
    }
  })();
  return { ok: true };
}

const status = () => (running ? { state: 'running', num: running.num, cid: running.cid, msg: running.msg } : { state: 'idle' });

module.exports = { start, status, ready, finalDescription, usedNumbers, RECIPES };
