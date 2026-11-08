import type { AppState, Snapshot, Video, Task, Col, DayStat, PostStat, Stats } from './types';

/* ---------- Konzepte ---------- */
export const KONZEPTE: Record<number, { name: string; color: string }> = {
  1: { name: 'Crush & multiply', color: '#7AA2FF' },
  2: { name: 'Edge increase', color: '#C49BFF' },
  3: { name: 'Meme drop', color: '#E7A0FF' },
  4: { name: 'Gap runner', color: '#FF9D5C' },
  5: { name: 'Line battle', color: '#5FD3E0' },
  6: { name: 'Math damage', color: '#7FD9A8' },
};
export const ROTATION = [1, 2, 4, 5, 6, 3];
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
export function dayNumber(day: Date, day1: string) { return dayDiff(day, parseYmd(day1)) + 1; }
export function postsForDay(dayNo: number) {
  if (dayNo < 3) return 0;
  if (dayNo === 3) return 1;
  if (dayNo <= 5) return 2;
  if (dayNo <= 7) return 3;
  return 4;
}
export function phaseLabel(dayNo: number) {
  if (dayNo < 1) return 'Before start';
  if (dayNo <= 2) return 'Warm-up · no posts';
  const p = postsForDay(dayNo);
  return p >= 4 ? 'Full plan · 4 a day' : `Ramp-up · ${p} a day`;
}
export function slotsForDay(day: Date, day1: string) { return SLOT_SETS[postsForDay(dayNumber(day, day1))] || []; }

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

/** Builds the plan from the start of `from` for `days` days; fills open slots with ready videos (Konzept rotation). */
export function buildPlan(snap: Snapshot, from: Date, days: number): PlannedSlot[] {
  const st = snap.state, now = new Date(snap.now), today = ymd(now);
  const day1 = st.settings.day1;
  const byNum = new Map(snap.videos.map((v) => [v.num, v] as const));
  // uploads keyed by slot
  const uploadsBySlot = new Map<string, number>();
  for (const [n, u] of Object.entries(st.uploads)) if (u.slot) uploadsBySlot.set(u.slot, +n);
  const pool = snap.videos.filter((v) => isReady(v) && !isUploaded(st, v.num)).sort((a, b) => a.num - b.num);
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
  for (let i = 0; i < days; i++) {
    const day = addDays(parseYmd(ymd(from)), i), ds = ymd(day);
    for (const time of slotsForDay(day, day1)) {
      const when = at(day, time), key = when.toISOString();
      const upNum = uploadsBySlot.get(key);
      if (upNum != null) {
        const v = byNum.get(upNum) || null;
        if (v) { prevK = v.konzept; if (v.konzept != null) rotIdx = ROTATION.indexOf(v.konzept); }
        out.push({ date: ds, time, when, video: v, uploaded: true, state: 'uploaded' });
        continue;
      }
      const past = when.getTime() < now.getTime();
      if (past && ds < today) { out.push({ date: ds, time, when, video: null, uploaded: false, state: 'missed' }); continue; }
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
  const plan = buildPlan(snap, now, 3);
  const tasks: Task[] = [];
  const mk = (key: string, t: Omit<Task, 'id' | 'col' | 'createdAt' | 'auto'>, doneNow = false): Task => ({
    id: 'auto:' + key, auto: key, createdAt: snap.now, col: doneNow ? 'done' : st.autoCols[key] || 'todo', ...t,
  });
  for (const s of plan.filter((p) => p.date === today)) {
    const key = `up:${s.date}:${s.time}`;
    if (s.video) tasks.push(mk(key, { title: `Upload #${s.video.num} at ${s.time}`, tag: kName(s.video.konzept), konzept: s.video.konzept, prio: s.state === 'overdue' ? 'Urgent' : 'High', due: s.date, videoNum: s.video.num }, s.uploaded));
    else if (!s.uploaded) tasks.push(mk(key, { title: `Upload at ${s.time}: no video ready`, tag: 'Schedule', prio: 'Urgent', due: s.date }));
  }
  const b = bufferInfo(snap);
  const genN = b.missing2;
  if (genN > 0) tasks.push(mk(`gen:${today}`, { title: `Make ${genN} video${genN > 1 ? 's' : ''} (Gen x${genN})`, tag: 'Gen batch', prio: b.days < 1 ? 'Urgent' : 'High', due: today }));
  // comment reminders
  for (const [n, u] of Object.entries(st.uploads)) {
    const t = new Date(u.at);
    const due = new Date(t.getTime() + st.settings.commentReminderMin * 60000);
    const key = `cm:${n}`;
    if (now.getTime() >= due.getTime() && now.getTime() - due.getTime() < 6 * 3600000) {
      const v = snap.videos.find((x) => x.num === +n);
      tasks.push(mk(key, { title: `Reply to comments on #${n}`, tag: kName(v?.konzept), konzept: v?.konzept ?? null, prio: '', due: today, videoNum: +n }));
    }
  }
  // weekly CSV
  if (csvDue(snap)) tasks.push(mk(`csv:${csvWeekKey(now)}`, { title: 'Import weekly TikTok Studio CSV', tag: 'Analytics', prio: 'High', due: today }));
  return tasks;
}
export function allTasks(snap: Snapshot): Task[] {
  return [...autoTasks(snap), ...snap.state.tasks];
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
    if (m <= 30 && m > 0) out.push({ key: `pre:${s.date}:${s.time}`, kind: 'upload', title: s.video ? `Upload #${s.video.num} ${fmtIn(m)}` : `Upload at ${s.time}: no video ready`, sub: s.video ? `${s.time} · ${kName(s.video.konzept)} ${KONZEPTE[s.video.konzept ?? 0]?.name ?? ''}` : 'Make a video first', action: s.video ? 'upload' : 'gen', videoNum: s.video?.num });
    if (m <= 0 && m > -180) { const bucket = Math.floor(-m / 30); out.push({ key: `late:${s.date}:${s.time}:${bucket}`, kind: 'overdue', title: s.video ? `#${s.video.num} is overdue` : `Slot ${s.time} is overdue`, sub: `${fmtLate(m)} · was due ${s.time}`, action: s.video ? 'upload' : 'gen', videoNum: s.video?.num }); }
  }
  const b = bufferInfo(snap);
  const h = now.getHours();
  if (h >= 9 && b.missing2 > 0) out.push({ key: `make:${today}:${h >= 20 ? 'eve' : 'morn'}`, kind: 'make', title: `Make ${b.missing2} video${b.missing2 > 1 ? 's' : ''}`, sub: 'Today and tomorrow are not covered yet', action: 'gen' });
  else if (h >= 9 && b.days < 1 && dayNumber(addDays(now, 1), snap.state.settings.day1) >= 3) out.push({ key: `buffer:${today}`, kind: 'buffer', title: 'Video buffer under 1 day', sub: `${b.readyCount} ready video${b.readyCount === 1 ? '' : 's'} left`, action: 'gen' });
  if (csvDue(snap)) out.push({ key: `csv:${today}:${h}`, kind: 'csv', title: 'Import the weekly TikTok CSV', sub: 'TikTok Studio · Analytics · Download data', action: 'csv' });
  for (const [n, u] of Object.entries(snap.state.uploads)) {
    const due = new Date(new Date(u.at).getTime() + snap.state.settings.commentReminderMin * 60000);
    const m = minsUntil(due, now);
    if (m <= 0 && m > -60) out.push({ key: `cm:${n}`, kind: 'comment', title: `Reply to comments on #${n}`, sub: `Posted ${snap.state.settings.commentReminderMin} min ago`, action: 'open', videoNum: +n });
  }
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
  return { importedAt: new Date().toISOString(), days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), posts: [...posts.values()] };
}

/* ---------- analytics ---------- */
export function matchPosts(snap: Snapshot) {
  const out: { post: PostStat; num: number | null; konzept: number | null; slot: string | null }[] = [];
  const byLink = new Map<string, number>();
  for (const [n, u] of Object.entries(snap.state.uploads)) if (u.link) byLink.set(normLink(u.link), +n);
  for (const p of snap.state.stats.posts) {
    let n: number | null = p.link ? byLink.get(normLink(p.link)) ?? null : null;
    if (n == null && p.postTime) {
      const t = Date.parse(p.postTime);
      if (!isNaN(t)) { let best: [number, number] | null = null; for (const [k, u] of Object.entries(snap.state.uploads)) { const d = Math.abs(Date.parse(u.at) - t); if (d < 3 * 3600000 && (!best || d < best[1])) best = [+k, d]; } if (best) n = best[0]; }
    }
    if (n == null) { const m = p.title.match(/#(\d+)/); if (m) n = +m[1]; }
    const v = n != null ? snap.videos.find((x) => x.num === n) : undefined;
    const u = n != null ? snap.state.uploads[String(n)] : undefined;
    const slot = u?.slot ? hm(new Date(u.slot)) : u ? hm(new Date(u.at)) : null;
    out.push({ post: p, num: n, konzept: v?.konzept ?? null, slot });
  }
  return out;
}
const normLink = (s: string) => { const m = s.match(/video\/(\d+)/); return m ? m[1] : s.trim().replace(/[?#].*$/, '').replace(/\/$/, ''); };

/** CSVs give watch rates as 35.2 or 0.352: always return percent */
export const pctNorm = (v: number) => (v <= 1 ? v * 100 : v);
export function kpis(snap: Snapshot) {
  const now = new Date(snap.now);
  const days = snap.state.stats.days;
  const withF = days.filter((d) => d.followers != null);
  const followers = withF.length ? withF[withF.length - 1].followers! : null;
  const f7 = withF.length ? withF.filter((d) => d.date <= ymd(addDays(now, -7))).pop()?.followers ?? withF[0].followers! : null;
  const sumViews = (from: Date, to: Date) => days.filter((d) => d.date >= ymd(from) && d.date <= ymd(to)).reduce((s, d) => s + (d.views || 0), 0);
  const views30 = sumViews(addDays(now, -29), now);
  const views7 = sumViews(addDays(now, -6), now), viewsPrev7 = sumViews(addDays(now, -13), addDays(now, -7));
  const posts = snap.state.stats.posts;
  const pv = posts.reduce((s, p) => s + (p.views || 0), 0);
  const per1k = (k: keyof PostStat) => (pv ? (posts.reduce((s, p) => s + ((p[k] as number) || 0), 0) / pv) * 1000 : null);
  const fullW = posts.filter((p) => p.fullWatch != null);
  const avgW = posts.filter((p) => p.avgWatch != null);
  const newF = days.filter((d) => d.date >= ymd(addDays(now, -29))).reduce((s, d) => s + (d.newFollowers || 0), 0);
  return {
    followers, followers7: followers != null && f7 != null ? followers - f7 : null,
    views30, views7, viewsPrev7,
    sharesPer1k: per1k('shares'), savesPer1k: per1k('saves'),
    followersPer1k: views30 ? (newF / views30) * 1000 : null,
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
  const ups = Object.values(st.uploads).map((u) => ymd(new Date(u.slot || u.at)));
  const out: { date: string; planned: number; done: number; future: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i), ds = ymd(d);
    out.push({ date: ds, planned: dayNumber(d, st.settings.day1) >= 1 ? slotsForDay(d, st.settings.day1).length : -1, done: ups.filter((x) => x === ds).length, future: false });
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
  if (t.auto) return { ...st, autoCols: { ...st.autoCols, [t.auto]: col } };
  return { ...st, tasks: st.tasks.map((x) => (x.id === t.id ? { ...x, col } : x)) };
}
