/* Global search (Ctrl K): pages, quick actions, tasks, videos, Konzepte, ideas, mail, upload slots and vault notes.
   Forgiving: German + English words, any word order, umlauts, and small typos still match. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui';
import { bb, isDesktop, type GraphNode } from './bridge';
import { allTasks, buildPlan, KONZEPTE } from './logic';
import { setMode } from './theme';
import type { Snapshot } from './types';

export interface PageDef { id: string; label: string; icon: string }
interface Item { k: string; icon: string; title: string; sub: string; hay: string; weight: number; go: () => void; y?: boolean }

const norm = (s: string) => s.toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9#@.]+/g, ' ').trim();
// umlaut-insensitive both ways ("ue" and "u")
const variants = (s: string) => { const n = norm(s); return n + ' ' + n.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u'); };

/** Extra words people might type for each page (English + German). */
const PAGE_WORDS: Record<string, string> = {
  today: 'home start dashboard overview heute uebersicht startseite rings buffer',
  schedule: 'calendar plan slots zeitplan kalender termine uploadplan woche week posting times',
  upload: 'next upload post publish hochladen posten veroeffentlichen pack beschreibung description thumbnail',
  board: 'tasks todo to do aufgaben liste kanban board erledigt done in progress',
  analytics: 'stats statistics statistik views aufrufe follower followers csv tiktok studio insights zahlen milestones meilensteine watch time',
  library: 'videos results bibliothek ergebnisse clips renders archive',
  ideas: 'ideen idee inbox notes notizen reference referenz clip link',
  mail: 'email e-mail gmail posteingang nachrichten messages inbox post',
  vault: 'obsidian graph notes notizen vault wissen netz links verknuepfungen',
  tools: 'links tools werkzeuge claude chatgpt gemini tiktok studio apps',
  settings: 'einstellungen settings options optionen theme design appearance aussehen darstellung island insel quiet ruhezeiten autostart backup sicherung vault ordner sync',
};

function score(hay: string, words: string[]) {
  let s = 0;
  const toks = hay.split(' ');
  for (const w of words) {
    if (!w) continue;
    if (toks.some((t) => t === w)) { s += 6; continue; }
    if (toks.some((t) => t.startsWith(w))) { s += 4; continue; }
    if (hay.includes(w)) { s += 2.5; continue; }
    // small typo: one letter wrong / missing / extra (words of 4+ letters)
    if (w.length >= 4 && toks.some((t) => Math.abs(t.length - w.length) <= 1 && lev1(t, w))) { s += 1.5; continue; }
    return 0; // every word must match somewhere
  }
  return s;
}
function lev1(a: string, b: string) {
  if (a === b) return true;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function Search({ snap, go, pages, actions }: { snap: Snapshot; go: (p: string) => void; pages: PageDef[]; actions: { backup: () => void; fetchCsv: () => void } }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [notes, setNotes] = useState<GraphNode[]>([]);
  const inp = useRef<HTMLInputElement>(null);
  const act = useRef(actions); act.current = actions;
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.current?.focus(); setOpen(true); } }; addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []);
  // vault note names (PC) for searching notes too
  useEffect(() => { if (!open || !bb.vaultGraph || notes.length) return; bb.vaultGraph().then((g) => { if (g.ok) setNotes(g.nodes.filter((n) => !n.unresolved)); }); }, [open, notes.length]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const add = (it: Omit<Item, 'hay'> & { words?: string }) => out.push({ ...it, hay: variants(`${it.title} ${it.sub} ${it.words ?? ''}`) });
    for (const p of pages) add({ k: 'p' + p.id, icon: p.icon, title: p.label, sub: 'Page', words: `${p.id} ${PAGE_WORDS[p.id] ?? ''}`, weight: 3, go: () => go(p.id) });
    add({ k: 'p-settings', icon: 'gear', title: 'Settings', sub: 'Page', words: PAGE_WORDS.settings, weight: 3, go: () => go('settings') });
    // quick actions
    add({ k: 'a-idea', icon: 'plus', title: 'New idea', sub: 'Action', words: 'add idee neue hinzufuegen capture', weight: 2.5, y: true, go: () => go('ideas') });
    add({ k: 'a-task', icon: 'plus', title: 'New task', sub: 'Action', words: 'add aufgabe neue todo hinzufuegen', weight: 2.5, y: true, go: () => go('board') });
    add({ k: 'a-gen', icon: 'film', title: 'Run Gen (make a video)', sub: 'Action', words: 'gen generate video machen erstellen render produce', weight: 2.5, y: true, go: () => bb.runGen(1) });
    add({ k: 'a-backup', icon: 'save', title: 'Save backup now', sub: 'Action', words: 'backup sicherung speichern save', weight: 2.5, go: () => act.current.backup() });
    if (isDesktop) add({ k: 'a-csv', icon: 'download', title: 'Fetch TikTok CSV automatically', sub: 'Action', words: 'csv stats statistik download herunterladen import tiktok studio daten', weight: 2.5, y: true, go: () => act.current.fetchCsv() });
    add({ k: 'a-studio', icon: 'external', title: 'Open TikTok Studio', sub: 'Action', words: 'tiktok studio upload analytics oeffnen open', weight: 2.2, go: () => bb.openUrl('https://www.tiktok.com/tiktokstudio') });
    for (const [m, l] of [['auto', 'Auto theme (follows the sun)'], ['dark', 'Dark mode'], ['medium', 'Medium mode'], ['light', 'Light mode']] as const)
      add({ k: 'a-th' + m, icon: m === 'dark' ? 'moon' : m === 'light' ? 'sun' : m === 'medium' ? 'half' : 'auto', title: l, sub: 'Theme', words: `theme design modus mode ${m === 'dark' ? 'dunkel nacht night' : m === 'light' ? 'hell tag day' : m === 'medium' ? 'mittel daemmerung dusk' : 'automatisch sonne sun'}`, weight: 2, go: () => setMode(m) });
    // Konzepte
    for (const [n, k] of Object.entries(KONZEPTE)) add({ k: 'k' + n, icon: 'sparkle', title: `Konzept ${n} · ${k.name}`, sub: 'Konzept · videos in the library', words: `k${n} concept konzept ${n}`, weight: 1.6, go: () => go('library') });
    // content
    for (const x of allTasks(snap)) add({ k: 't' + x.id, icon: 'check', title: x.title, sub: `Task · ${x.col === 'done' ? 'done' : x.col === 'prog' ? 'in progress' : 'to do'}${x.due ? ' · due ' + x.due : ''}`, words: `${x.tag} ${x.prio} aufgabe task`, weight: 1.4, go: () => go('board') });
    for (const v of snap.videos) add({ k: 'v' + v.num, icon: 'film', title: `#${v.num} ${v.title}`, sub: `Video · Konzept ${v.konzept ?? '?'} ${KONZEPTE[v.konzept ?? 0]?.name ?? ''}`, words: `${v.num} video ${(v.description ?? '').slice(0, 200)}`, weight: 1.3, go: () => go('library') });
    for (const i of snap.state.ideas) add({ k: 'i' + i.id, icon: 'bulb', title: i.text || '(idea)', sub: `Idea${i.used ? ' · used' : ''}`, words: `${i.link ?? ''} idee idea`, weight: 1.2, go: () => go('ideas') });
    for (const m of snap.mail?.items ?? []) add({ k: 'm' + m.id, icon: 'mail', title: m.subject || '(no subject)', sub: `Mail · ${m.from}`, words: `${m.snippet} ${m.fromAddr ?? ''} mail email`, weight: 1.1, go: () => go('mail') });
    try { for (const s of buildPlan(snap, new Date(snap.now), 7)) add({ k: 's' + s.date + s.time, icon: 'calendar', title: `${new Date(s.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} · ${s.time}`, sub: `Upload slot${s.video ? ` · #${s.video.num}` : ' · no video yet'}${s.uploaded ? ' · done' : ''}`, words: `slot upload termin ${new Date(s.date).toLocaleDateString('de-DE', { weekday: 'long' })}`, weight: 1, go: () => go('schedule') }); } catch { /* plan not available */ }
    for (const n of notes) add({ k: 'n' + n.id, icon: 'graph', title: n.name, sub: `Note · ${n.id}`, words: `note notiz obsidian ${n.tags.join(' ')}`, weight: 1.2, go: () => { try { sessionStorage.setItem('bb-graph-q', n.name); } catch { /* ignore */ } go('vault'); } });
    return out;
  }, [snap, pages, notes, go]);

  const words = norm(q).split(' ').filter(Boolean).flatMap((w) => [w]);
  const list = useMemo(() => {
    if (!words.length) return items.filter((i) => i.sub === 'Action').slice(0, 6);
    return items.map((i) => ({ i, s: score(i.hay, words) * i.weight + (norm(i.title).startsWith(words[0]) ? 4 : 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 10).map((x) => x.i);
  }, [items, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (r?: Item) => { if (!r) return; r.go(); setQ(''); setOpen(false); inp.current?.blur(); };
  return <div className="search">
    <label className="glass tpill">
      <Icon name="search" size={16} />
      <input ref={inp} value={q} placeholder="Search anything…" onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); } else if (e.key === 'Enter') pick(list[sel]); else if (e.key === 'Escape') { setQ(''); inp.current?.blur(); } }} />
      <span className="kbd">Ctrl K</span>
    </label>
    {open && <div className="glass dropdown">
      {!words.length && <div className="dd-head">Quick actions</div>}
      {list.length ? list.map((r, i) => <button key={r.k} className={`dd-item ${i === sel ? 'sel' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(r); }} onMouseEnter={() => setSel(i)}>
        <span className={`dd-ico ${r.y ? 'y' : ''}`}><Icon name={r.icon} size={15} /></span><span className="dd-txt"><span>{r.title}</span><small>{r.sub}</small></span>
      </button>) : <div className="dd-item" style={{ cursor: 'default' }}><span className="dd-txt"><span>Nothing found for “{q}”</span><small>Try a page name, a task, a video number like #12, or a note</small></span></div>}
    </div>}
  </div>;
}
