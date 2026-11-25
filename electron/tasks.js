/* Task source for the progress screen: reads Claude's own task files on this PC
   (transcripts, tasks/ and todos/ folders of every .claude folder it finds), so nothing depends on a worker
   remembering to report. Everything is rebuilt from disk, so a crash or restart loses nothing.
   Watches the folders and polls as a safety net; calls onChange(list) quickly after any change. */
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_AGE = 12 * 3600e3;      // cards of sessions older than this disappear
const ACTIVE_MS = 5 * 60e3;       // "live" glow if the session wrote within this time
const TAIL = 3 * 1024 * 1024;     // read at most the last 3 MB of a transcript

function roots() {
  const r = new Set([path.join(os.homedir(), '.claude')]);
  const app = process.env.APPDATA;
  if (app) for (const sub of ['Claude/local-agent-mode-sessions', 'Claude/claude-code-sessions', 'Claude/agent-mode-sessions']) {
    const base = path.join(app, sub);
    (function walk(d, depth) {
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (!e.isDirectory()) continue;
        const p = path.join(d, e.name);
        if (e.name === '.claude') r.add(p); else if (depth < 6) walk(p, depth + 1);
      }
    })(base, 0);
  }
  return [...r].filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}
const st = (p) => { try { return fs.statSync(p); } catch { return null; } };
const norm = (s) => (s === 'completed' || s === 'done' ? 'done' : s === 'in_progress' || s === 'active' ? 'active' : s === 'deleted' ? 'gone' : 'pending');

function readTail(file, size) {
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.min(size, TAIL), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    let t = buf.toString('utf8');
    if (size > len) t = t.slice(t.indexOf('\n') + 1);
    return t;
  } finally { fs.closeSync(fd); }
}
function textOf(c) { if (typeof c === 'string') return c; if (Array.isArray(c)) return c.map((x) => (x && x.type === 'text' ? x.text : '')).join(' '); return ''; }

/** one transcript -> { title, steps (latest TodoWrite), taskOps } */
function parseTranscript(file, size) {
  let title = '', first = '', steps = null, ops = [], cwd = '';
  let text; try { text = readTail(file, size); } catch { return { title, steps, cwd }; }
  const created = {}; // tool_use id -> subject (TaskCreate)
  for (const line of text.split('\n')) {
    if (!line || line[0] !== '{') continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.cwd) cwd = o.cwd;
    if (o.type === 'ai-title' && o.aiTitle) title = o.aiTitle;
    if (o.type === 'summary' && o.summary && !title) title = o.summary;
    const m = o.message;
    if (!m) continue;
    if (o.type === 'user' && !first && !o.isSidechain) { const t = textOf(m.content).replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').trim(); if (t && !/^\[?Request interrupted/.test(t)) first = t.split('\n')[0].slice(0, 80); }
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (!b || b.type !== 'tool_use' || !b.input) continue;
      if (b.name === 'TodoWrite' && Array.isArray(b.input.todos)) steps = b.input.todos.map((t) => ({ label: String(t.content || t.subject || ''), state: norm(t.status), now: t.activeForm || '' }));
      else if (b.name === 'TaskCreate' || b.name === 'TaskUpdate') ops.push({ name: b.name, input: b.input });
    }
  }
  return { title: title || first, steps, ops, cwd };
}

/** rebuilds a list from TaskCreate / TaskUpdate calls (ids are 1, 2, 3 ... in creation order) */
function fromOps(ops) {
  const list = [];
  for (const o of ops) {
    if (o.name === 'TaskCreate') list.push({ id: list.length + 1, label: String(o.input.subject || ''), state: 'pending', now: o.input.activeForm || '' });
    else { const t = list.find((x) => String(x.id) === String(o.input.taskId)); if (t) { if (o.input.status) t.state = norm(o.input.status); if (o.input.subject) t.label = String(o.input.subject); if (o.input.activeForm) t.now = o.input.activeForm; } }
  }
  return list.filter((x) => x.state !== 'gone' && x.label);
}
function readTaskDir(dir) {
  const out = [];
  let files; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return out; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j && (j.subject || j.content)) out.push({ id: Number(j.id) || Number(path.basename(f, '.json')) || 0, label: String(j.subject || j.content), state: norm(j.status), now: j.activeForm || '' });
    } catch { /* half-written file: next scan gets it */ }
  }
  return out.filter((s) => s.state !== 'gone').sort((a, b) => a.id - b.id);
}

function scan() {
  const now = Date.now(), cards = [];
  for (const root of roots()) {
    const proj = path.join(root, 'projects');
    let dirs = []; try { dirs = fs.readdirSync(proj); } catch { /* */ }
    for (const d of dirs) {
      const dp = path.join(proj, d);
      let files = []; try { files = fs.readdirSync(dp).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of files) {
        const fp = path.join(dp, f), s = st(fp);
        if (!s || now - s.mtimeMs > MAX_AGE) continue;
        const sid = path.basename(f, '.jsonl');
        const t = parseTranscript(fp, s.size);
        let steps = readTaskDir(path.join(root, 'tasks', sid));
        let tmax = 0; for (const x of (fs.existsSync(path.join(root, 'tasks', sid)) ? fs.readdirSync(path.join(root, 'tasks', sid)) : [])) tmax = Math.max(tmax, (st(path.join(root, 'tasks', sid, x)) || {}).mtimeMs || 0);
        if (!steps.length && t.steps) steps = t.steps;
        if (!steps.length && t.ops && t.ops.length) steps = fromOps(t.ops);
        const todoMain = path.join(root, 'todos', `${sid}-agent-${sid}.json`);
        if (!steps.length) { try { const a = JSON.parse(fs.readFileSync(todoMain, 'utf8')); if (Array.isArray(a)) steps = a.map((x) => ({ label: String(x.content || ''), state: norm(x.status), now: x.activeForm || '' })); } catch { /* */ } }
        const updated = Math.max(s.mtimeMs, tmax);
        // never leave a working session out: no task list yet -> still a card
        if (!steps.length && now - updated < ACTIVE_MS) steps = [{ label: 'Working (no task list yet)', state: 'active', now: '' }];
        if (steps.length) cards.push({ id: sid, title: t.title || path.basename(t.cwd || d) || 'Session', where: path.basename(t.cwd || '') || '', steps, updated, live: now - updated < ACTIVE_MS });
        // subtasks: sub-agent todo files of this session
        try {
          for (const tf of fs.readdirSync(path.join(root, 'todos'))) {
            if (!tf.startsWith(sid + '-agent-') || tf === path.basename(todoMain)) continue;
            const tp = path.join(root, 'todos', tf), ts = st(tp);
            if (!ts || now - ts.mtimeMs > MAX_AGE) continue;
            const a = JSON.parse(fs.readFileSync(tp, 'utf8'));
            if (Array.isArray(a) && a.length) cards.push({ id: tf, parent: sid, title: 'Subtask · ' + (t.title || 'Session'), where: '', steps: a.map((x) => ({ label: String(x.content || ''), state: norm(x.status), now: x.activeForm || '' })), updated: ts.mtimeMs, live: now - ts.mtimeMs < ACTIVE_MS });
          }
        } catch { /* no todos folder */ }
      }
    }
  }
  // newest activity first, subtasks right after their parent
  const byId = new Map(cards.map((c) => [c.id, c]));
  const top = cards.filter((c) => !c.parent || !byId.has(c.parent)).sort((a, b) => b.updated - a.updated);
  const out = [];
  for (const c of top) { out.push(c); out.push(...cards.filter((x) => x.parent === c.id).sort((a, b) => b.updated - a.updated)); }
  return out;
}

let timer = null, last = '', cb = () => {}, current = [], watchers = [];
function emit() {
  let list; try { list = scan(); } catch (e) { return; }
  current = list;
  const key = JSON.stringify(list.map((c) => [c.id, c.updated, c.steps.map((s) => s.state + s.label)]));
  if (key !== last) { last = key; cb(list); }
}
function poke() { clearTimeout(timer); timer = setTimeout(emit, 120); }
function start(onChange) {
  cb = onChange; emit();
  for (const r of roots()) {
    try { watchers.push(fs.watch(r, { recursive: true }, (_e, f) => { if (!f || /(\.jsonl|\.json)$/.test(f)) poke(); })); } catch { /* recursive watch unsupported: polling covers it */ }
  }
  setInterval(emit, 2000);           // safety net, also finds new .claude folders slowly
  setInterval(() => { watchers.forEach((w) => { try { w.close(); } catch { /* */ } }); watchers = []; for (const r of roots()) { try { watchers.push(fs.watch(r, { recursive: true }, (_e, f) => { if (!f || /(\.jsonl|\.json)$/.test(f)) poke(); })); } catch { /* */ } } }, 10 * 60e3);
}
module.exports = { start, get: () => current };
