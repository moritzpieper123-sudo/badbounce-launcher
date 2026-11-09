// Vault graph: reads every Markdown note in the vault, finds [[wiki links]] / [md](links.md) / #tags,
// and watches the folder so the graph in the launcher updates live (like Obsidian's graph view).
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', '.obsidian', '.trash', '.claude-workspace', '.claude', 'Trash']);
const MAX_FILES = 5000;

function walk(root) {
  const out = []; const stack = [root];
  while (stack.length && out.length < MAX_FILES) {
    const d = stack.pop(); let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.md$/i.test(e.name)) out.push(p);
    }
  }
  return out;
}
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');
const WIKI = /!?\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const MDLINK = /\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/gi;
const TAG = /(?:^|\s)#([A-Za-zÀ-ɏ][\w/\-À-ɏ]*)/g;

function build(root) {
  if (!root || !fs.existsSync(root)) return { ok: false, vaultName: path.basename(root || ''), nodes: [], links: [], error: 'Vault folder not found' };
  const files = walk(root);
  const nodes = []; const byName = new Map(); const byPath = new Map();
  for (const f of files) {
    const id = rel(root, f); let st; try { st = fs.statSync(f); } catch { continue; }
    const name = path.basename(f).replace(/\.md$/i, '');
    const folder = id.includes('/') ? id.split('/')[0] : '';
    const n = { id, name, folder, tags: [], mtime: st.mtimeMs };
    nodes.push(n); byPath.set(id.replace(/\.md$/i, '').toLowerCase(), id);
    const k = name.toLowerCase(); if (!byName.has(k) || byName.get(k).length > id.length) byName.set(k, id);
  }
  const resolve = (target, fromId) => {
    let t = target.trim().replace(/\\/g, '/'); try { t = decodeURIComponent(t); } catch { /* keep */ }
    t = t.replace(/\.md$/i, '');
    if (t.includes('/')) {
      const fromDir = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : '';
      const joined = path.posix.normalize(path.posix.join(fromDir, t)).toLowerCase();
      if (byPath.has(joined)) return byPath.get(joined);
      const tl = t.toLowerCase().replace(/^\.?\//, '');
      if (byPath.has(tl)) return byPath.get(tl);
      for (const [k, v] of byPath) if (k.endsWith('/' + tl)) return v;
      t = t.split('/').pop();
    }
    return byName.get(t.toLowerCase()) || null;
  };
  const links = []; const seen = new Set(); const unresolved = new Map();
  for (const n of nodes) {
    let text = ''; try { text = fs.readFileSync(path.join(root, n.id), 'utf8'); } catch { continue; }
    if (text.length > 2e6) text = text.slice(0, 2e6);
    const body = text.replace(/```[\s\S]*?```/g, '');
    const add = (t) => { if (!t || t === n.id) return; const key = n.id < t ? n.id + '\u0000' + t : t + '\u0000' + n.id; if (seen.has(key)) return; seen.add(key); links.push({ s: n.id, t }); };
    for (const m of body.matchAll(WIKI)) { const r = resolve(m[1], n.id); if (r) add(r); else { const nm = m[1].trim().split('/').pop(); const uid = '?' + nm.toLowerCase(); if (!unresolved.has(uid)) unresolved.set(uid, { id: uid, name: nm, folder: '', tags: [], unresolved: true }); add(uid); } }
    for (const m of body.matchAll(MDLINK)) { if (/^https?:/i.test(m[1])) continue; const r = resolve(m[1], n.id); if (r) add(r); }
    const fm = text.match(/^---\n([\s\S]*?)\n---/); const tags = new Set();
    if (fm) { const tm = fm[1].match(/^tags:\s*(.*(?:\n\s+-\s.*)*)/m); if (tm) for (const t of tm[1].replace(/[\[\]]/g, '').split(/[,\n]/)) { const x = t.replace(/^\s*-\s*/, '').trim().replace(/^#/, ''); if (x) tags.add(x); } }
    for (const m of body.replace(/^---\n[\s\S]*?\n---/, '').matchAll(TAG)) tags.add(m[1]);
    n.tags = [...tags].slice(0, 30);
  }
  return { ok: true, vaultName: path.basename(root), nodes: [...nodes, ...unresolved.values()], links };
}

let watcher = null, timer = null;
function watch(root, onChange) {
  try { watcher?.close(); } catch { /* ignore */ }
  watcher = null;
  if (!root || !fs.existsSync(root)) return;
  try {
    watcher = fs.watch(root, { recursive: true }, (_ev, file) => {
      if (!file || !/\.md$/i.test(String(file))) return;
      const f = String(file).split(path.sep);
      if (f.some((p) => p.startsWith('.') || SKIP.has(p))) return;
      clearTimeout(timer); timer = setTimeout(onChange, 700);
    });
    watcher.on('error', () => { /* folder vanished: ignore */ });
  } catch (e) { console.error('graph watch', e); }
}
function noteText(root, id) {
  const p = path.resolve(root, id);
  if (!p.startsWith(path.resolve(root) + path.sep) || !/\.md$/i.test(p)) return '';
  try { return fs.readFileSync(p, 'utf8').slice(0, 300000); } catch { return ''; }
}
module.exports = { build, watch, noteText };
