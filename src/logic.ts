import type { AppState, Snapshot, Video, Task, Col, DayStat, PostStat, Stats } from './types';

/* ---------- Konzepte ---------- */
export const KONZEPTE: Record<number, { name: string; color: string }> = {
  1: { name: 'Crush & multiply', color: '#7AA2FF' },
  2: { name: 'Edge increase', color: '#C49BFF' },
  3: { name: 'Meme drop', color: '#E7A0FF' },
  4: { name: 'Gap runner', color: '#FF9D5C' },
  5: { name: 'Line battle', color: '#5FD3E0' },
  6: { name: 'Math damage', color: '#7FD9A8' },
  7: { name: 'Shape filler', color: '#6FB3FF' },
  8: { name: 'Spiral roll', color: '#FF8FB1' },
  9: { name: 'Sheet drop', color: '#FFB05C' },
  10: { name: 'Gamble crush', color: '#FFD84A' },
};
/** Display a video number: 11 -> "11", 11.01 -> "11a" (letter variants such as #11a). */
export function vn(n: number | null | undefined): string {
  if (n == null) return '?';
  if (Number.isInteger(n)) return String(n);
  const i = Math.floor(n), l = Math.round((n - i) * 100);
  return l >= 1 && l <= 26 ? `${i}${String.fromCharCode(96 + l)}` : String(n);
}
export const ROTATION = [1, 2, 4, 5, 6, 7, 3, 8, 9, 10];
export const kName = (k: number | null | undefined) => (k && KONZEPTE[k] ? `Konzept ${k}` : 'No Konzept');
export const kColor = (k: number | null | undefined) => (k && KONZEPTE[k] ? KONZEPTE[k].color : '#AAC3F0');

/* ---------- dates (local time) ---------- */
export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayDiff = (a: Date, b: Date) => Math.round((parseYmd(ymd(a)).getTime() - parseYmd(ymd(b)).getTime()) / 86400000);
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const at = (day: Date, time: string) => { const [h, m] = time.split(':').map(Number); const x = new Date(day); x.setHours(h, m, 0, 0); return x; };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtDay = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fmtShort = (d: Date) => `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
export const fmtNum = (n: number | undefined | null) => {
  if (n == null || isNaN(n)) return '–';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString('en-US');
};
export const minsUntil = (t: Date, now: Date) => Math.round((t.getTime() - now.getTime()) / 60000);
export const fmtLate = (mins: number) => { const m = Math.abs(mins); if (m < 60) return `${m} min late`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min late` : `${h} h late`; };
export const fmtIn = (mins: number) => {
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  if (mins >= 24 * 60) { const d = Math.round(mins / 1440); return d <= 1 ? 'tomorrow' : `in ${d} days`; }
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
};

/* ---------- schedule (fast route, decided 4 Nov) ---------- */
export const SLOT_SETS: Record<number, string[]> = {
  0: [], 1: ['18:30'], 2: ['12:30', '18:30'], 3: ['12:30', '18:30', '21:00'], 4: ['12:30', '15:30', '18:30', '21:00'],
};
/** From 20 Nov 2026 (Mo): slots for the Berlin / UK / US East / US West audiences, 5 a day on the full plan, equally spaced (every 4.8 h).
 *  The times of a day are listed in clock order (02:00 and 05:00 are the early hours of that same date). Days before keep the old slots,
 *  so already posted videos keep their slot. */
export const SLOTS_FROM = '2026-11-20';
export const SLOT_SETS_V2: Record<number, string[]> = {
  0: [], 1: ['20:20'], 2: ['15:30', '20:20'], 3: ['10:40', '15:30', '20:20'], 4: ['01:05', '10:40', '15:30', '20:20'], 5: ['01:05', '05:55', '10:40', '15:30', '20:20'],
};
export function dayNumber(day: Date, day1: string) { return dayDiff(day, parseYmd(day1)) + 1; }
export function postsForDay(dayNo: number, day?: Date) {
  if (dayNo < 3) return 0;
  if (dayNo === 3) return 1;
  if (dayNo <= 5) return 2;
  if (dayNo <= 7) return 3;
  return day && ymd(day) >= SLOTS_FROM ? 5 : 4;
}
export function phaseLabel(dayNo: number, day?: Date) {
  if (dayNo < 1) return 'Before start';
  if (dayNo <= 2) return 'Warm-up · no posts';
  const p = postsForDay(dayNo, day);
  return p >= 4 ? `Full plan · ${p} a day` : `Ramp-up · ${p} a day`;
}
export function slotsForDay(day: Date, day1: string, skip?: string[]) {
  const n = postsForDay(dayNumber(day, day1), day);
  const all = (ymd(day) >= SLOTS_FROM ? SLOT_SETS_V2 : SLOT_SETS)[n] || [];
  return skip && skip.length ? all.filter((t) => !skip.includes(at(day, t).toISOString())) : all;
}

/* ---------- videos ---------- */
export const isReady = (v: Video) => v.hasVideo && v.hasThumb && v.hasDesc;
export const isUploaded = (st: AppState, n: number) => !!st.uploads[String(n)];

export interface PlannedSlot {
  date: string;
  time: string;
  when: Date;
  video: Video | null;
  uploaded: boolean;      // slot filled by an upload
  state: 'uploaded' | 'ready' | 'missing' | 'overdue' | 'next' | 'missed';
}

/** score per Konzept: average views of matched posts (needs ≥2 posts), else null */
export function konzeptScores(snap: Snapshot): Record<number, number> {
  const m = matchPosts(snap);
  const acc: Record<number, { s: number; n: number }> = {};
  for (const r of m) { if (r.konzept == null || r.post.views == null) continue; (acc[r.konzept] ||= { s: 0, n: 0 }); acc[r.konzept].s += r.post.views; acc[r.konzept].n++; }
  const out: Record<number, number> = {};
  for (const k in acc) if (acc[k].n >= 2) out[+k] = acc[k].s / acc[k].n;
  return out;
}

const BACKLOG_DAYS = 14;
/** Which slot each posted video fills (Mo 2026-11-14/15): posts fill the free slots strictly in order,
 *  oldest slot first, in the order they were posted, no matter when or on which device they were marked.
 *  Computed every time, so a wrong stored `slot` (e.g. marked on an older phone app) can never shift the plan.
 *  A slot more than BACKLOG_DAYS older than the post is skipped (counts as missed). */
export function slotMap(st: AppState): Map<number, string> {
  const out = new Map<number, string>();
  // posts the launcher itself scheduled in TikTok keep their real slot (so the next video goes into the next FREE slot, not behind them)
  const pinned = new Set<string>();
  for (const [n, u] of Object.entries(st.uploads)) if (u.scheduled && u.slot) { const iso = new Date(u.slot).toISOString(); out.set(+n, iso); pinned.add(iso); }
  const posted = Object.entries(st.uploads).filter(([, u]) => !(u.scheduled && u.slot)).map(([n, u]) => ({ n: +n, t: Date.parse(u.realAt || u.at) || 0 }))
    .sort((a, b) => a.t - b.t || a.n - b.n);
  if (!posted.length) return out;
  let day = parseYmd(st.settings.day1), guard = 0, i = 0;
  const queue: Date[] = [];
  while (i < posted.length && guard++ < 400) {
    for (const t of slotsForDay(day, st.settings.day1, st.settings.skipSlots)) queue.push(at(day, t));
    day = addDays(day, 1);
    while (queue.length && i < posted.length) {
      const s = queue[0];
      if (pinned.has(s.toISOString())) { queue.shift(); continue; }
      if (s.getTime() < posted[i].t - BACKLOG_DAYS * 86400000) { queue.shift(); continue; }
      out.set(posted[i].n, s.toISOString()); queue.shift(); i++;
    }
  }
  return out;
}
/** Builds the plan from the start of `from` for `days` days; fills open slots with ready videos (Konzept rotation). */
export function buildPlan(snap: Snapshot, from: Date, days: number): PlannedSlot[] {
  const st = snap.state, now = new Date(snap.now), today = ymd(now);
  const day1 = st.settings.day1;
  const byNum = new Map(snap.videos.map((v) => [v.num, v] as const));
  // uploads keyed by slot
  const uploadsBySlot = new Map<string, number>();
  for (const [n, slot] of slotMap(st)) uploadsBySlot.set(slot, n);
  const apr = st.auto?.approvals ?? {}, gated = !!st.auto?.enabled;   // autopilot on: only approved videos are offered for upload; a rejected video never is
  const pool = snap.videos.filter((v) => isReady(v) && !isUploaded(st, v.num) && apr[String(v.num)] !== 'no' && (!gated || apr[String(v.num)] === 'ok')).sort((a, b) => a.num - b.num);
  const scores = konzeptScores(snap);
  const useScores = Object.keys(scores).length >= 2;
  // last uploaded Konzept, for "never twice in a row"
  const lastUp = Object.entries(st.uploads).sort((a, b) => a[1].at.localeCompare(b[1].at)).pop();
  let prevK: number | null = lastUp ? byNum.get(+lastUp[0])?.konzept ?? null : null;
  let rotIdx = prevK != null ? ROTATION.indexOf(prevK) : -1;

  const pick = (): Video | null => {
    if (!pool.length) return null;
    let cands = pool.filter((v) => v.konzept == null || v.konzept !== prevK);
    if (!cands.length) cands = pool;
    let chosen: Video;
    if (useScores) {
      chosen = [...cands].sort((a, b) => (scores[b.konzept ?? 0] ?? 0) - (scores[a.konzept ?? 0] ?? 0) || a.num - b.num)[0];
    } else {
      const order = (k: number | null) => { if (k == null) return 99; const i = ROTATION.indexOf(k); if (i < 0) return 98; return (i - rotIdx - 1 + ROTATION.length) % ROTATION.length; };
      chosen = [...cands].sort((a, b) => order(a.konzept) - order(b.konzept) || a.num - b.num)[0];
    }
    pool.splice(pool.indexOf(chosen), 1);
    return chosen;
  };

  const out: PlannedSlot[] = [];
  let nextMarked = false;
  // Mo 2026-11-14: a posted video always fills the OLDEST free slot, whatever time it is posted.
  // So free slots of earlier days stay open ("overdue") and come first; only slots older than
  // BACKLOG_DAYS count as missed. Earlier days before `from` only add their open slots.
  const fromDay = parseYmd(ymd(from)), oldest = addDays(parseYmd(today), -BACKLOG_DAYS);
  let first = fromDay;
  for (let d = parseYmd(day1) > oldest ? parseYmd(day1) : oldest; d < fromDay; d = addDays(d, 1)) {
    if (slotsForDay(d, day1, st.settings.skipSlots).some((t) => !uploadsBySlot.has(at(d, t).toISOString()))) { first = d; break; }
  }
  const total = dayDiff(addDays(fromDay, days - 1), first) + 1;
  for (let i = 0; i < total; i++) {
    const day = addDays(first, i), ds = ymd(day), before = day < fromDay;
    for (const time of slotsForDay(day, day1, st.settings.skipSlots)) {
      const when = at(day, time), key = when.toISOString();
      const upNum = uploadsBySlot.get(key);
      if (upNum != null) {
        const v = byNum.get(upNum) || null;
        if (v) { prevK = v.konzept; if (v.konzept != null) rotIdx = ROTATION.indexOf(v.konzept); }
        if (!before) out.push({ date: ds, time, when, video: v, uploaded: true, state: 'uploaded' });
        continue;
      }
      const past = when.getTime() < now.getTime();
      if (past && day < oldest) { out.push({ date: ds, time, when, video: null, uploaded: false, state: 'missed' }); continue; }
      const v = pick();
      if (v) { prevK = v.konzept; if (v.konzept != null) rotIdx = ROTATION.indexOf(v.konzept); }
      let state: PlannedSlot['state'] = v ? 'ready' : 'missing';
      if (past) state = 'overdue';
      else if (!nextMarked) { state = v ? 'next' : 'missing'; nextMarked = true; }
      out.push({ date: ds, time, when, video: v, uploaded: false, state });
    }
  }
  return out;
}

/** Days of upcoming slots covered by ready, not-uploaded videos (from now). */
export function bufferInfo(snap: Snapshot) {
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 30).filter((s) => !s.uploaded && s.state !== 'missed');
  const readyCount = snap.videos.filter((v) => isReady(v) && !isUploaded(snap.state, v.num)).length;
  let coveredSlots = 0;
  for (const s of plan) { if (s.video) coveredSlots++; else break; }
  // days fully covered from today on
  let days = 0;
  const byDay = new Map<string, PlannedSlot[]>();
  for (const s of plan) (byDay.get(s.date) || byDay.set(s.date, []).get(s.date)!).push(s);
  const today = ymd(now);
  for (let i = 0; i < 30; i++) {
    const ds = ymd(addDays(now, i));
    const slots = byDay.get(ds) || [];
    if (!slots.length) { if (ds === today) continue; if (dayNumber(addDays(now, i), snap.state.settings.day1) < 3) { continue; } }
    if (slots.every((s) => s.video)) days += ds === today ? 0 : 1; else break;
  }
  // videos needed for today + tomorrow
  const need2 = plan.filter((s) => s.date === today || s.date === ymd(addDays(now, 1))).length;
  const missing2 = plan.filter((s) => (s.date === today || s.date === ymd(addDays(now, 1))) && !s.video).length;
  return { readyCount, coveredSlots, days, need2, missing2 };
}

/* ---------- tasks ---------- */
export function autoTasks(snap: Snapshot): Task[] {
  const st = snap.state, now = new Date(snap.now), today = ymd(now);
  const tasks: Task[] = [];
  const mk = (key: string, t: Omit<Task, 'id' | 'col' | 'createdAt' | 'auto'>, doneNow = false): Task => ({
    id: 'auto:' + key, auto: key, createdAt: snap.now, col: doneNow ? 'done' : st.autoCols[key] || 'todo', ...t,
  });
  // upload + Gen tasks removed (Mo 2026-11-19): auto tasks = weekly CSV only, everything else is Mo's own notes
  // (comment reminders removed, Mo 2026-11-14)
  // weekly CSV
  if (csvDue(snap)) tasks.push(mk(`csv:${csvWeekKey(now)}`, { title: 'Import weekly TikTok Studio CSV', tag: 'Analytics', prio: 'High', due: today }));
  return tasks;
}
export const DONE_KEEP_MS = 5 * 3600 * 1000; // done tasks vanish after 5 h (Mo 2026-11-19)
export function allTasks(snap: Snapshot): Task[] {
  const st = snap.state, now = snap.now;
  const nowMs = typeof now === 'number' ? now : Date.parse(String(now)) || Date.now();
  const stale = (t: Task, doneAt?: string) => t.col === 'done' && nowMs - (Date.parse(doneAt || '') || 0) > DONE_KEEP_MS;
  return [
    ...autoTasks(snap).filter((t) => !stale(t, t.auto ? st.autoDoneAt?.[t.auto] : undefined)),
    ...st.tasks.filter((t) => !stale(t, t.doneAt)),
  ];
}

/* ---------- CSV due ---------- */
export const csvWeekKey = (d: Date) => { const s = addDays(parseYmd(ymd(d)), -d.getDay()); return ymd(s); };
export function csvDue(snap: Snapshot) {
  const now = new Date(snap.now), st = snap.state;
  if (dayNumber(now, st.settings.day1) < 7) return false;
  const last = st.stats.importedAt ? new Date(st.stats.importedAt) : null;
  if (last && now.getTime() - last.getTime() < 6 * 86400000) return false;
  // due from 10:00 on the chosen weekday, and stays due until done
  const wd = st.settings.csvWeekday;
  const daysSince = (now.getDay() - wd + 7) % 7;
  const dueAt = at(addDays(now, -daysSince), '10:00');
  if (now < dueAt) return !!last && now.getTime() - last.getTime() > 8 * 86400000;
  return !last || last < dueAt;
}

/* ---------- quiet / dnd ---------- */
export function isQuiet(snap: Snapshot) {
  const s = snap.state.settings, h = new Date(snap.now).getHours();
  const inQuiet = s.quietEnabled !== false && s.quietFrom !== s.quietTo && (s.quietFrom > s.quietTo ? h >= s.quietFrom || h < s.quietTo : h >= s.quietFrom && h < s.quietTo);
  return s.dnd || inQuiet || (s.dndFullscreen && snap.fullscreen);
}

/* ---------- island ---------- */
export type IslandMood = 'done' | 'due' | 'overdue' | 'idle';
export function islandStatus(snap: Snapshot) {
  const now = new Date(snap.now), today = ymd(now);
  const todaySlots = buildPlan(snap, now, 1).filter((s) => s.date === today);
  const tasks = allTasks(snap).filter((t) => t.col !== 'done' && (!t.due || t.due <= today));
  const overdue = todaySlots.some((s) => s.state === 'overdue');
  const open = todaySlots.filter((s) => !s.uploaded).length + tasks.filter((t) => !t.auto?.startsWith('up:')).length;
  // yellow blink ONLY when the next upload slot has no video yet (tasks never make it blink)
  const nextSlot = buildPlan(snap, now, 2).find((s) => !s.uploaded && s.state !== 'missed');
  const needVideo = !!nextSlot && !nextSlot.video;
  const mood: IslandMood = needVideo ? 'due' : overdue ? 'overdue' : todaySlots.length ? 'done' : 'idle';
  return { mood, todaySlots, tasks, open };
}

export interface Alert { key: string; title: string; sub: string; kind: 'upload' | 'make' | 'csv' | 'comment' | 'milestone' | 'overdue' | 'buffer' | 'mail'; action?: 'upload' | 'gen' | 'csv' | 'open' | 'mail'; url?: string; videoNum?: number; }
/** Alerts that should pop now (caller filters already-seen keys and quiet time). */
export const gmailLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`;
export function dueAlerts(snap: Snapshot): Alert[] {
  const now = new Date(snap.now), today = ymd(now), out: Alert[] = [];
  // new unread email (arrived in the last 20 min)
  for (const m of snap.mail?.items ?? []) if (m.unread && now.getTime() - new Date(m.date).getTime() < 20 * 60e3) out.push({ key: `mail:${m.id}`, kind: 'mail', title: `Mail from ${m.from}`, sub: m.subject, action: 'mail', url: gmailLink(m.threadId) });
  const plan = buildPlan(snap, now, 2);
  for (const s of plan.filter((p) => p.date === today && !p.uploaded)) {
    const m = minsUntil(s.when, now);
    if (m <= 30 && m > 0) out.push({ key: `pre:${s.date}:${s.time}`, kind: 'upload', title: s.video ? `Upload #${vn(s.video.num)} ${fmtIn(m)}` : `Upload at ${s.time}: no video ready`, sub: s.video ? `${s.time} · ${kName(s.video.konzept)} ${KONZEPTE[s.video.konzept ?? 0]?.name ?? ''}` : 'Make a video first', action: s.video ? 'upload' : 'gen', videoNum: s.video?.num });
    if (m <= 0 && m > -180) { const bucket = Math.floor(-m / 30); out.push({ key: `late:${s.date}:${s.time}:${bucket}`, kind: 'overdue', title: s.video ? `#${vn(s.video.num)} is overdue` : `Slot ${s.time} is overdue`, sub: `${fmtLate(m)} · was due ${s.time}`, action: s.video ? 'upload' : 'gen', videoNum: s.video?.num }); }
  }
  const b = bufferInfo(snap);
  const h = now.getHours();
  if (h >= 9 && b.missing2 > 0) out.push({ key: `make:${today}:${h >= 20 ? 'eve' : 'morn'}`, kind: 'make', title: `Make ${b.missing2} video${b.missing2 > 1 ? 's' : ''}`, sub: 'Today and tomorrow are not covered yet', action: 'gen' });
  else if (h >= 9 && b.days < 1 && dayNumber(addDays(now, 1), snap.state.settings.day1) >= 3) out.push({ key: `buffer:${today}`, kind: 'buffer', title: 'Video buffer under 1 day', sub: `${b.readyCount} ready video${b.readyCount === 1 ? '' : 's'} left`, action: 'gen' });
  if (csvDue(snap)) out.push({ key: `csv:${today}:${h}`, kind: 'csv', title: 'Import the weekly TikTok CSV', sub: 'TikTok Studio · Analytics · Download data', action: 'csv' });
  return out;
}

/* ---------- CSV parsing (TikTok Studio exports; tolerant) ---------- */
function splitCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
const num = (s: string | undefined) => { if (s == null) return undefined; const x = s.replace(/[%\s]/g, '').replace(/,(?=\d{3}\b)/g, ''); const v = parseFloat(x.replace(',', '.')); if (isNaN(v)) return undefined; return /k$/i.test(s.trim()) ? v * 1000 : /m$/i.test(s.trim()) ? v * 1e6 : v; };
function parseDate(s: string | undefined, year: number): string | undefined {
  if (!s) return undefined; const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/); if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  const mi = MONTHS.findIndex((mo) => t.toLowerCase().includes(mo.slice(0, 3).toLowerCase()));
  const dm = t.match(/(\d{1,2})/);
  if (mi >= 0 && dm) { const ym = t.match(/(\d{4})/); return `${ym ? ym[1] : year}-${pad(mi + 1)}-${pad(+dm[1])}`; }
  return undefined;
}
const findCol = (h: string[], ...keys: string[]) => h.findIndex((x) => keys.some((k) => x.includes(k)));

export interface CsvResult { kind: 'days' | 'posts' | 'followers' | 'unknown'; days: DayStat[]; posts: PostStat[]; found: string[]; rows: number; }
export function parseTikTokCsv(text: string, year = new Date().getFullYear()): CsvResult {
  const rows = splitCsv(text);
  if (rows.length < 2) return { kind: 'unknown', days: [], posts: [], found: [], rows: 0 };
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const body = rows.slice(1);
  const iDate = findCol(h, 'date', 'datum');
  const iViews = findCol(h, 'video views', 'views', 'aufrufe');
  const iLikes = findCol(h, 'likes');
  const iCom = findCol(h, 'comments', 'kommentare');
  const iSh = findCol(h, 'shares', 'geteilt');
  const iSaves = findCol(h, 'saves', 'favorites', 'gespeichert');
  const iProf = findCol(h, 'profile views', 'profilaufrufe');
  const iFol = h.findIndex((x) => (x.includes('follower') && !x.includes('difference') && !x.includes('new')) || x === 'followers');
  const iNewF = findCol(h, 'difference in followers', 'new followers', 'neue follower');
  const iTitle = findCol(h, 'video title', 'title', 'titel', 'caption');
  const iLink = findCol(h, 'video link', 'link', 'url');
  const iPost = findCol(h, 'post time', 'posted', 'create time', 'time', 'veröffentlicht');
  const iAvg = findCol(h, 'average watch time', 'avg. watch', 'average time');
  const iFull = findCol(h, 'watched full', 'full video', 'completion');
  const found = rows[0].filter((_, i) => [iDate, iViews, iLikes, iCom, iSh, iSaves, iProf, iFol, iNewF, iTitle, iLink, iPost, iAvg, iFull].includes(i));
  if (iTitle >= 0 || iLink >= 0) {
    const posts: PostStat[] = body.map((r) => ({ title: (r[iTitle] ?? '').trim(), link: iLink >= 0 ? r[iLink]?.trim() : undefined, postTime: iPost >= 0 ? r[iPost]?.trim() : undefined, views: num(r[iViews]), likes: num(r[iLikes]), comments: num(r[iCom]), shares: num(r[iSh]), saves: iSaves >= 0 ? num(r[iSaves]) : undefined, avgWatch: iAvg >= 0 ? num(r[iAvg]) : undefined, fullWatch: iFull >= 0 ? num(r[iFull]) : undefined, newFollowers: iNewF >= 0 ? num(r[iNewF]) : undefined }));
    return { kind: 'posts', days: [], posts, found, rows: posts.length };
  }
  if (iDate >= 0) {
    const days: DayStat[] = [];
    for (const r of body) {
      const date = parseDate(r[iDate], year); if (!date) continue;
      const d: DayStat = { date };
      if (iViews >= 0) d.views = num(r[iViews]);
      if (iLikes >= 0) d.likes = num(r[iLikes]);
      if (iCom >= 0) d.comments = num(r[iCom]);
      if (iSh >= 0) d.shares = num(r[iSh]);
      if (iProf >= 0) d.profileViews = num(r[iProf]);
      if (iFol >= 0) d.followers = num(r[iFol]);
      if (iNewF >= 0) d.newFollowers = num(r[iNewF]);
      days.push(d);
    }
    return { kind: iFol >= 0 && iViews < 0 ? 'followers' : 'days', days, posts: [], found, rows: days.length };
  }
  return { kind: 'unknown', days: [], posts: [], found: rows[0], rows: body.length };
}
export function mergeStats(old: Stats, res: CsvResult[]): Stats {
  const days = new Map(old.days.map((d) => [d.date, { ...d }] as const));
  for (const r of res) for (const d of r.days) days.set(d.date, { ...(days.get(d.date) || { date: d.date }), ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) });
  const postKey = (p: PostStat) => p.link || `${p.title}|${p.postTime}`;
  const posts = new Map(old.posts.map((p) => [postKey(p), p] as const));
  for (const r of res) for (const p of r.posts) posts.set(postKey(p), { ...(posts.get(postKey(p)) || {}), ...p });
  return { ...old, importedAt: new Date().toISOString(), days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), posts: [...posts.values()] };
}

/** Live stats fetch result -> stats: posts, today's follower count, a snapshot for the growth curves, audience data.
 *  TikTok's net-follower history (16 days) fills the new-followers per day and rebuilds the follower curve backwards from today's count. */
export function applyFetch(old: Stats, r: { posts: PostStat[]; followers?: number; at: string; audience?: import('./types').Audience }): Stats {
  const at = new Date(r.at), today = ymd(at);
  const have = new Map(old.days.map((d) => [d.date, d] as const));
  const extra = new Map<string, DayStat>();
  const put = (date: string, f: Partial<DayStat>) => { const o = have.get(date), e = extra.get(date) || { date }; for (const [k, v] of Object.entries(f)) if (v !== undefined && (o as any)?.[k] === undefined) (e as any)[k] = v; extra.set(date, e); };
  const nf = r.audience?.netFollowers, now = r.followers ?? r.audience?.followerNum;
  if (nf?.length) for (const x of nf) {
    if (x.ago < 1) continue; // today is still running
    const date = ymd(addDays(at, -x.ago));
    const after = nf.filter((y) => y.ago < x.ago).reduce((sum, y) => sum + y.n, 0); // gains after the end of that day
    put(date, { newFollowers: x.n, followers: now != null ? now - after : undefined });
  }
  const res: CsvResult = { kind: 'posts', days: [...(r.followers != null ? [{ date: today, followers: r.followers }] : []), ...extra.values()], posts: r.posts, found: [], rows: r.posts.length };
  const st = mergeStats(old, [res]);
  const v: Record<string, number[]> = {};
  for (const p of r.posts) if (p.link) v[normLink(p.link)] = [p.views ?? 0, p.likes ?? 0, p.comments ?? 0, p.shares ?? 0, p.saves ?? 0];
  const snaps = [...(old.snaps || [])];
  const last = snaps[snaps.length - 1];
  if (last && Date.parse(r.at) - Date.parse(last.t) < 2 * 3600000) snaps[snaps.length - 1] = { t: r.at, v }; else snaps.push({ t: r.at, v });
  return { ...st, snaps: snaps.slice(-800), audience: r.audience && Object.keys(r.audience).length > 1 ? { ...(old.audience || {}), ...r.audience } : old.audience };
}

/* ---------- analytics ---------- */
export function matchPosts(snap: Snapshot) {
  const out: { post: PostStat; num: number | null; konzept: number | null; slot: string | null }[] = [];
  // Mo schedules every post himself, so there are no links: match by caption first (the description starts with the video's question), then by scheduled time
  const capKey = (t: string) => t.toLowerCase().replace(/#\S+/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const byCap = new Map<string, number>();
  for (const v of snap.videos) if (v.description) { const k = capKey(v.description); if (k.length >= 12 && snap.state.uploads[String(v.num)]) byCap.set(k, v.num); }
  for (const p of snap.state.stats.posts) {
    let n: number | null = null;
    const ck = capKey(p.title || ''); if (ck.length >= 12) { for (const [k, num] of byCap) if (ck.startsWith(k) || k.startsWith(ck)) { n = num; break; } }
    if (n == null && p.postTime) {
      const t = Date.parse(p.postTime);
      if (!isNaN(t)) { let best: [number, number] | null = null; for (const [k, u] of Object.entries(snap.state.uploads)) { const d = Math.min(Math.abs(Date.parse(u.slot ?? u.at) - t), Math.abs(Date.parse(u.at) - t), u.realAt ? Math.abs(Date.parse(u.realAt) - t) : Infinity); if (d < 3 * 3600000 && (!best || d < best[1])) best = [+k, d]; } if (best) n = best[0]; }
    }
    if (n == null) { const m = p.title.match(/#(\d+)([a-z])?\b/i); if (m) n = +m[1] + (m[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) / 100 : 0); }
    const v = n != null ? snap.videos.find((x) => x.num === n) : undefined;
    const u = n != null ? snap.state.uploads[String(n)] : undefined;
    const sm = n != null ? slotMap(snap.state).get(n) : undefined;
    const slot = sm ? hm(new Date(sm)) : u ? hm(new Date(u.at)) : null;
    out.push({ post: p, num: n, konzept: v?.konzept ?? null, slot });
  }
  return out;
}
export const normLink = (s: string) => { const m = s.match(/video\/(\d+)/); return m ? m[1] : s.trim().replace(/[?#].*$/, '').replace(/\/$/, ''); };

/** CSVs give watch rates as 35.2 or 0.352: always return percent */
export const pctNorm = (v: number) => (v <= 1 ? v * 100 : v);
/** TikTok's CSV sometimes repeats yesterday's row for a day it has no numbers for yet: such a row is treated as "no data". */
export function cleanDays(days: DayStat[]): DayStat[] {
  return days.map((d, i) => {
    const p = days[i - 1];
    const same = p && (d.views || 0) > 0 && d.views === p.views && d.likes === p.likes && d.comments === p.comments && d.shares === p.shares && parseYmd(d.date).getTime() - parseYmd(p.date).getTime() === 86400000;
    return same ? { date: d.date, followers: d.followers, newFollowers: d.newFollowers } : d;
  });
}
/** Follower pace per day = average net gain of the last 7 finished days (needs 4+ days with a number). Spiky = one day made over 60 %. */
export function followerPace(snap: Snapshot) {
  const now = new Date(snap.now), days = snap.state.stats.days;
  const w = days.filter((d) => d.newFollowers != null && d.date >= ymd(addDays(now, -7)) && d.date < ymd(now));
  if (w.length < 4) return { perDay: null as number | null, days: w.length, total: 0, spiky: false, best: 0 };
  const total = w.reduce((s, d) => s + d.newFollowers!, 0), best = Math.max(...w.map((d) => d.newFollowers!));
  return { perDay: total / w.length, days: w.length, total, spiky: total > 10 && best / total > 0.6, best };
}
/** "in 3 weeks" style estimate; honest about long / impossible ETAs */
export function etaText(remaining: number, perDay: number | null, now: Date) {
  if (remaining <= 0) return 'reached';
  if (perDay == null) return 'needs 4+ days of follower numbers';
  if (perDay <= 0) return 'no growth in the last 7 days';
  const d = Math.ceil(remaining / perDay);
  if (d > 730) return 'more than 2 years at this pace';
  return `about ${addDays(now, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined })} (${d < 14 ? `${d} days` : d < 120 ? `${Math.round(d / 7)} weeks` : `${Math.round(d / 30)} months`})`;
}
export function kpis(snap: Snapshot) {
  const now = new Date(snap.now);
  const days = cleanDays(snap.state.stats.days);
  const withF = days.filter((d) => d.followers != null);
  const followers = withF.length ? withF[withF.length - 1].followers! : null;
  const old7 = withF.filter((d) => d.date <= ymd(addDays(now, -7))).pop()?.followers; // only a real value from 7+ days ago counts
  const sumViews = (from: Date, to: Date) => days.filter((d) => d.date >= ymd(from) && d.date <= ymd(to)).reduce((s, d) => s + (d.views || 0), 0);
  const views30 = sumViews(addDays(now, -29), now);
  const views7 = sumViews(addDays(now, -6), now), viewsPrev7 = sumViews(addDays(now, -13), addDays(now, -7));
  const posts = snap.state.stats.posts;
  const pv = posts.reduce((s, p) => s + (p.views || 0), 0);
  const per1k = (k: keyof PostStat) => (pv ? (posts.reduce((s, p) => s + ((p[k] as number) || 0), 0) / pv) * 1000 : null);
  const fullW = posts.filter((p) => p.fullWatch != null);
  const avgW = posts.filter((p) => p.avgWatch != null);
  const both = days.filter((d) => d.date >= ymd(addDays(now, -29)) && d.date < ymd(now) && (d.views || 0) > 0 && d.newFollowers != null);
  const pf = posts.filter((p) => p.newFollowers != null && (p.views || 0) > 0);
  const bothViews = both.reduce((s, d) => s + d.views!, 0), pfViews = pf.reduce((s, p) => s + p.views!, 0);
  let followersPer1k: number | null = null, per1kBasis = '';
  if (both.length >= 3 && bothViews > 0) { followersPer1k = (both.reduce((s, d) => s + d.newFollowers!, 0) / bothViews) * 1000; per1kBasis = `${both.length} days with both numbers`; }
  else if (pf.length >= 3 && pfViews > 0) { followersPer1k = (pf.reduce((s, p) => s + p.newFollowers!, 0) / pfViews) * 1000; per1kBasis = `${pf.length} videos`; }
  const pace = followerPace(snap);
  return {
    followers, followers7: followers != null && old7 != null ? followers - old7 : pace.perDay != null ? Math.round(pace.perDay * 7) : null, pace,
    views30, views7, viewsPrev7,
    sharesPer1k: per1k('shares'), savesPer1k: per1k('saves'),
    followersPer1k, per1kBasis,
    fullWatch: fullW.length ? fullW.reduce((s, p) => s + pctNorm(p.fullWatch!), 0) / fullW.length : null,
    avgWatch: avgW.length ? avgW.reduce((s, p) => s + p.avgWatch!, 0) / avgW.length : null,
    hasData: days.length > 0 || posts.length > 0,
  };
}
export function konzeptTable(snap: Snapshot) {
  const rows: Record<number, { k: number; posts: number; views: number; shares: number; full: number[]; }> = {};
  for (const m of matchPosts(snap)) {
    if (m.konzept == null) continue;
    const r = (rows[m.konzept] ||= { k: m.konzept, posts: 0, views: 0, shares: 0, full: [] });
    r.posts++; r.views += m.post.views || 0; r.shares += m.post.shares || 0; if (m.post.fullWatch != null) r.full.push(pctNorm(m.post.fullWatch));
  }
  return Object.values(rows).map((r) => ({ k: r.k, posts: r.posts, avgViews: r.views / r.posts, sharesPer1k: r.views ? (r.shares / r.views) * 1000 : 0, full: r.full.length ? r.full.reduce((a, b) => a + b, 0) / r.full.length : null })).sort((a, b) => b.avgViews - a.avgViews);
}
export function slotTable(snap: Snapshot) {
  const rows: Record<string, { slot: string; posts: number; views: number }> = {};
  for (const m of matchPosts(snap)) { if (!m.slot) continue; const r = (rows[m.slot] ||= { slot: m.slot, posts: 0, views: 0 }); r.posts++; r.views += m.post.views || 0; }
  return Object.values(rows).map((r) => ({ ...r, avg: r.views / r.posts })).sort((a, b) => a.slot.localeCompare(b.slot));
}
/** consistency: per day since day 1 → planned, uploaded */
export function consistency(snap: Snapshot, days = 35) {
  const now = new Date(snap.now), st = snap.state;
  const sm = slotMap(st);
  const ups = Object.entries(st.uploads).map(([n, u]) => ymd(new Date(sm.get(+n) || u.at)));
  const out: { date: string; planned: number; done: number; future: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i), ds = ymd(d);
    out.push({ date: ds, planned: dayNumber(d, st.settings.day1) >= 1 ? slotsForDay(d, st.settings.day1, st.settings.skipSlots).length : -1, done: ups.filter((x) => x === ds).length, future: false });
  }
  let streak = 0;
  for (let i = out.length - 1; i >= 0; i--) { const o = out[i]; if (o.planned < 0) break; if (i === out.length - 1 && o.done < o.planned) continue; if (o.done >= o.planned) streak++; else break; }
  return { days: out, streak };
}
export const MILESTONES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

export function weeklyReview(snap: Snapshot) {
  const now = new Date(snap.now), k = kpis(snap), kt = konzeptTable(snap), sl = slotTable(snap);
  const weekAgo = addDays(now, -7).toISOString();
  const posted = Object.values(snap.state.uploads).filter((u) => u.at >= weekAgo).length;
  const bestK = kt[0] || null, bestSlot = [...sl].sort((a, b) => b.avg - a.avg)[0] || null;
  const change = k.viewsPrev7 ? ((k.views7 - k.viewsPrev7) / k.viewsPrev7) * 100 : null;
  const text = [
    `Badbounce weekly review (${fmtShort(addDays(now, -6))} – ${fmtShort(now)})`,
    `Posted: ${posted} videos`,
    `Views 7 days: ${fmtNum(k.views7)}${change != null ? ` (${change >= 0 ? '+' : ''}${change.toFixed(0)}% vs last week)` : ''}`,
    `Followers: ${fmtNum(k.followers)}${k.followers7 != null ? ` (+${k.followers7} in 7 days)` : ''}`,
    `Per Konzept (avg views): ${kt.map((r) => `K${r.k} ${fmtNum(Math.round(r.avgViews))} (${r.posts})`).join(', ') || 'no matched posts yet'}`,
    `Per slot (avg views): ${sl.map((r) => `${r.slot} ${fmtNum(Math.round(r.avg))}`).join(', ') || 'no data yet'}`,
    '',
    'Please suggest what to change for next week (Konzepte, slots, Gen ideas).',
  ].join('\n');
  return { posted, bestK, bestSlot, change, text, k };
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export function setTaskCol(st: AppState, t: Task, col: Col): AppState {
  const stamp = new Date().toISOString();
  if (t.auto) return { ...st, autoCols: { ...st.autoCols, [t.auto]: col }, autoDoneAt: { ...(st.autoDoneAt || {}), [t.auto]: col === 'done' ? stamp : '' } };
  return { ...st, tasks: st.tasks.map((x) => (x.id === t.id ? { ...x, col, doneAt: col === 'done' ? stamp : undefined } : x)) };
}

/* ---------- Creator Rewards income estimate (Mo 2026-11-20): a RANGE from public, unofficial numbers, never a promise ---------- */
/** RPM in EUR per 1,000 QUALIFIED views, low / high. Sources: blog + calculator sites, 2026 (UK £ converted at 1.15). TikTok publishes no official RPM.
 *  0 low = country not (clearly) in the program, so it is only counted in the high case. */
export const RPM_EUR: Record<string, [number, number]> = { DE: [0.6, 0.95], FR: [0.5, 0.85], ES: [0.35, 0.65], IT: [0.4, 0.7], GB: [0.95, 1.55], US: [0.45, 1.7], PL: [0, 0.35], RO: [0, 0.3], NL: [0, 0.4], PT: [0, 0.35], HR: [0, 0.3], Others: [0, 0.2] };
export function rewardsEstimate(snap: Snapshot) {
  const k = kpis(snap), st = snap.state.stats, aud = st.audience;
  if (!k.views30 || !aud?.countries?.length) return null;
  const matched = matchPosts(snap).filter((m) => (m.post.views || 0) > 0);
  const lenOf = (m: (typeof matched)[number]) => snap.videos.find((v) => v.num === m.num)?.durationSec ?? m.post.retentionSecs ?? null;
  const tot = matched.reduce((s, m) => s + m.post.views!, 0) || 1;
  const longV = matched.filter((m) => (lenOf(m) ?? 0) >= 60).reduce((s, m) => s + m.post.views!, 0);
  const unknownV = matched.filter((m) => lenOf(m) == null).reduce((s, m) => s + m.post.views!, 0);
  const len: [number, number] = [(longV + 0.5 * unknownV) / tot, Math.min(1, (longV + unknownV) / tot)]; // only videos over 1 min pay
  const tp = st.posts.filter((p) => p.traffic?.length && (p.views || 0) > 0); let fy = 0, prof = 0, w = 0;
  for (const p of tp) { w += p.views!; fy += p.views! * ((p.traffic!.find((x) => x.label === 'For You')?.pct || 0) / 100); prof += p.views! * ((p.traffic!.find((x) => x.label === 'Personal Profile')?.pct || 0) / 100); }
  const fyp: [number, number] = w ? [fy / w, Math.min(1, fy / w + 0.5 * (prof / w))] : [0.7, 0.95]; // only For You views count
  const qual: [number, number] = [0.6, 0.95]; // assumption: repeat views, views under 5 s, invalid traffic and validation drop 5-40 %
  const countries = aud.countries.map((c) => ({ code: c.label, share: c.pct / 100, rpm: RPM_EUR[c.label] || RPM_EUR.Others }));
  const rpmMix = (i: 0 | 1) => countries.reduce((s, c) => s + c.share * c.rpm[i], 0); // EUR per 1K qualified views, whole audience
  const elig: [number, number] = [countries.filter((c) => c.rpm[0] > 0).reduce((s, c) => s + c.share, 0), countries.filter((c) => c.rpm[1] > 0).reduce((s, c) => s + c.share, 0)];
  const q = (i: 0 | 1) => k.views30 * len[i] * fyp[i] * qual[i];
  const revenue: [number, number] = [(q(0) * rpmMix(0)) / 1000, (q(1) * rpmMix(1)) / 1000];
  const qualified: [number, number] = [q(0) * elig[0], q(1) * elig[1]]; // views that can pay: right length, For You, valid, from a program country
  const rpm: [number, number] = [qualified[0] ? (revenue[0] / qualified[0]) * 1000 : 0, qualified[1] ? (revenue[1] / qualified[1]) * 1000 : 0];
  return { views30: k.views30, len, fyp, qual, elig, qualified, rpm, revenue, per1kViews: [(revenue[0] / k.views30) * 1000, (revenue[1] / k.views30) * 1000] as [number, number], countries };
}
