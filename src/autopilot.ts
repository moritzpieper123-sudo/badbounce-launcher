/* Autopilot brain (pure functions, no UI, no Electron): viral scoring, concept stats, slot planner, alerts.
   Mo 2026-11-24: one day at a time, momentum on winners (max 5 identical in a row, then 1 other), hourly data, alert when something breaks. */
import type { AppState, PostStat, Snapshot, Video } from './types';
import { matchPosts, normLink } from './logic';

/* ---------- concepts ---------- */
export const CIDS = ['K1', 'K2', 'K3', 'K4', 'K5a', 'K5b', 'K5c', 'K6a', 'K6b', 'K7a', 'K7b', 'K8', 'K9', 'K10', 'K11'] as const;
export const CID_NAME: Record<string, string> = {
  K1: 'Crush & multiply', K2: 'Edge increase', K3: 'Meme drop', K4: 'Ball escape', K5a: 'Line battle', K5b: 'Battle box', K5c: 'Column break',
  K6a: 'Math damage', K6b: 'Boss fight', K7a: 'Shape filler · pulse', K7b: 'Shape filler · layers', K8: 'Spiral roll', K9: 'Sheet drop', K10: 'Gamble crush', K11: 'Paint conquer',
};
const OLD_SUB: Record<number, string> = { 5: 'K5a', 6: 'K6a', 7: 'K7a' };
/** Concept id of a video (Notes text wins, else the Konzept number). */
export function cidOf(v: Pick<Video, 'cid' | 'konzept'> | null | undefined): string | null {
  if (!v) return null;
  if (v.cid) return v.cid;
  if (v.konzept == null) return null;
  return OLD_SUB[v.konzept] ?? `K${v.konzept}`;
}

/** Concepts the launcher can render without Claude (recipes in electron/generator.js). Others need a Gen round. */
export const AUTO_GEN = new Set(['K6b', 'K9']);
export const RENDER_LEAD_MIN = 75;   // a render should be finished this long before its slot (Claude needs time)

/* ---------- tuning ---------- */
export const STREAK_MAX = 5;          // identical concept back to back, then ONE other, then it may continue
export const WARM_POSTS = 4;          // judged posts per concept before it counts as winner / failing
export const MOMENTUM_MIN_SLOTS = 5;  // a hot concept fills at least the next 5 slots
export const LEAD_MIN = 40;           // schedule a slot's video this many minutes before the slot (TikTok needs >= 16)
export const GEN_LEAD_H = 3;          // start the day's rendering this long before its first slot
const CHECK_H = [1, 3, 6, 12, 24];    // age checkpoints for the view velocity

/* ---------- state kept in AppState.auto ---------- */
export interface AutoAlert { id: string; kind: 'stats' | 'upload' | 'gen' | 'stock' | 'studio' | 'hot' | 'info'; title: string; sub: string; at: string; last: string; count: number; resolved?: boolean; read?: boolean }
export interface GenJob { id: string; cid: string; num: number; state: 'queued' | 'running' | 'done' | 'error'; at: string; msg?: string; reason: string; deadline?: string; endedAt?: string }
export interface AutoState {
  enabled: boolean;
  approvals: Record<string, 'ok' | 'no'>;   // video number -> Mo's decision in the Control Room
  genJobs: GenJob[];
  alerts: AutoAlert[];
  leadMin?: number;
  autoApprove?: boolean;                    // night slots: schedule a waiting video even if you have not approved it (off by default)
  model?: 'sonnet' | 'haiku' | 'opus';       // Claude model that renders (default sonnet: the videos are a fixed kit, Mo 2026-11-24)
  producer?: 'claude' | 'launcher';          // who renders: Claude Code on the PC (default, Mo 2026-11-24) or the launcher's own recipes
  hotSeen?: Record<string, string>;         // post link -> ISO when we announced it
  lastPlan?: { at: string; slots: PlanRow[] };
}
export const DEFAULT_AUTO: AutoState = { enabled: false, approvals: {}, genJobs: [], alerts: [] };
export const autoOf = (st: AppState): AutoState => ({ ...DEFAULT_AUTO, ...(st.auto || {}) });

/* ---------- helpers ---------- */
const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const l2 = (x: number) => Math.log(x) / Math.LN2;

/** Views the post had `h` hours after posting, from TikTok's own per-video history (per bucket, not cumulative); null when unknown. */
export function viewsAtAge(p: PostStat, h: number): number | null {
  if (!p.postTime || !p.hist || !p.hist.length || !p.histStep) return null;
  const t0 = Date.parse(p.postTime); if (isNaN(t0)) return null;
  let cum = 0, last = -1;
  for (const [key, v] of [...p.hist].sort((a, b) => a[0] - b[0])) {
    const end = (key + p.histStep) * 1000 - t0;
    if (end > h * 3600e3) break;
    cum += v; last = end;
  }
  return last < 0 ? null : cum;
}
export const ageHours = (p: PostStat, now: Date) => (p.postTime ? (now.getTime() - Date.parse(p.postTime)) / 3600e3 : NaN);

export type Status = 'new' | 'hot' | 'rising' | 'ok' | 'weak' | 'flop';
export interface PostScore {
  link: string; num: number | null; cid: string | null; title: string; ageH: number; views: number;
  ratio: number | null;        // views at the latest checkpoint / median of the other videos at that checkpoint
  quality: number | null;      // 0..100 from completion + watch time vs the channel
  engagement: number | null;   // 0..100
  score: number;               // 0..100 viral potential
  status: Status; reasons: string[]; checkpointH: number | null; lastHour: number | null; accel: number | null;
}

/** Viral potential of every post: velocity vs the channel at the same age, retention quality, engagement. */
export function scorePosts(snap: Snapshot): PostScore[] {
  const now = new Date(snap.now);
  const matched = matchPosts(snap).filter((m) => m.post.postTime && m.post.views != null);
  const posts = matched.map((m) => m.post);
  const baseAt = (h: number, self: PostStat) => {
    const xs = posts.filter((p) => p !== self).map((p) => viewsAtAge(p, h)).filter((x): x is number => x != null && ageHours(self, now) >= 0);
    const old = posts.filter((p) => p !== self && ageHours(p, now) >= h).map((p) => viewsAtAge(p, h)).filter((x): x is number => x != null);
    const m = median(old.length >= 3 ? old : xs.length >= 3 ? xs : []);
    if (!isNaN(m) && m > 0) return m;
    const mv = median(posts.filter((p) => p !== self && ageHours(p, now) >= 24).map((p) => p.views || 0));   // fallback: whole-video median scaled to the age
    return !isNaN(mv) && mv > 0 ? mv * Math.pow(h / 24, 0.6) : null;
  };
  const med = (f: (p: PostStat) => number | undefined) => median(posts.map(f).filter((x): x is number => x != null && x > 0));
  const mFull = med((p) => p.fullWatch), mAvgRatio = med((p) => (p.avgWatch && p.retentionSecs ? p.avgWatch / p.retentionSecs : undefined));
  const eng = (p: PostStat) => (p.views ? ((p.likes || 0) + 2 * (p.shares || 0) + 1.5 * (p.saves || 0) + (p.comments || 0)) / p.views : undefined);
  const mEng = med(eng);
  const out: PostScore[] = [];
  for (const m of matched) {
    const p = m.post, ageH = ageHours(p, now); if (isNaN(ageH) || ageH < 0) continue;
    const cid = cidOf(snap.videos.find((v) => v.num === m.num) ?? null);
    const reasons: string[] = [];
    // 1. velocity at the latest checkpoint we already have
    let ratio: number | null = null, cp: number | null = null;
    for (const h of CHECK_H) {
      if (ageH < h) break;
      const v = viewsAtAge(p, h), b = baseAt(h, p);
      if (v != null && b) { ratio = v / b; cp = h; }
    }
    if (ratio == null && ageH >= 1) { const b = baseAt(Math.min(24, Math.max(1, Math.round(ageH))), p); const h = Math.min(24, Math.max(1, Math.round(ageH))); if (b) { ratio = ((p.views || 0) * (h / Math.min(ageH, 24)) ) / b; cp = h; } }
    const vel = ratio == null ? null : clamp(25 + 25 * l2(Math.max(ratio, 0.05)));
    if (ratio != null) reasons.push(`${ratio >= 1 ? '' : 'only '}${ratio.toFixed(1)}x the usual views after ${cp} h`);
    // 2. what the last hour did (acceleration)
    let lastHour: number | null = null, accel: number | null = null;
    if (p.hist && p.hist.length >= 3 && p.histStep === 3600) {
      const h = [...p.hist].sort((a, b) => a[0] - b[0]); lastHour = h[h.length - 1][1]; const prev = h.slice(-4, -1).map((x) => x[1]); const pm = prev.reduce((s, x) => s + x, 0) / prev.length;
      accel = pm > 0 ? lastHour / pm : null;
      if (accel != null && accel > 1.3 && lastHour > 20) reasons.push(`still speeding up (${accel.toFixed(1)}x vs the last hours)`);
    }
    // 3. retention quality vs the channel
    const parts: number[] = [];
    if (p.fullWatch && mFull > 0) { const r = p.fullWatch / mFull; parts.push(clamp(25 + 25 * l2(Math.max(r, 0.05)))); if (r >= 1.3) reasons.push(`${p.fullWatch.toFixed(0)}% watch it to the end (${r.toFixed(1)}x channel)`); if (r <= 0.6) reasons.push('weak watch-to-end rate'); }
    if (p.avgWatch && p.retentionSecs && mAvgRatio > 0) { const r = p.avgWatch / p.retentionSecs / mAvgRatio; parts.push(clamp(25 + 25 * l2(Math.max(r, 0.05)))); }
    const quality = parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
    const e = eng(p), engagement = e != null && mEng > 0 ? clamp(25 + 25 * l2(Math.max(e / mEng, 0.05))) : null;
    if (engagement != null && engagement >= 62) reasons.push('people like / share / save it a lot');
    // 4. blend (missing parts do not count)
    const w: [number | null, number][] = [[vel, 0.55], [quality, 0.3], [engagement, 0.15]];
    const have = w.filter((x) => x[0] != null) as [number, number][];
    const wsum = have.reduce((s, x) => s + x[1], 0);
    let score = wsum ? have.reduce((s, x) => s + x[0] * x[1], 0) / wsum : 0;
    if (accel != null && accel > 1.3) score = Math.min(100, score + 6);
    score = Math.round(score);
    let status: Status = 'ok';
    if (ageH < 1 || ratio == null) status = 'new';
    else if (score >= 70 && ratio >= 2.2) status = 'hot';
    else if (score >= 56 || ratio >= 1.6) status = 'rising';
    else if (ageH >= 6 && ratio < 0.4) status = 'flop';
    else if (ageH >= 3 && (ratio < 0.7 || score < 28)) status = 'weak';
    out.push({ link: p.link ? normLink(p.link) : p.title, num: m.num, cid, title: p.title, ageH, views: p.views || 0, ratio, quality, engagement, score, status, reasons, checkpointH: cp, lastHour, accel });
  }
  return out.sort((a, b) => a.ageH - b.ageH);
}

/* ---------- concepts: winners, failing ---------- */
export type CStatus = 'new' | 'ok' | 'winner' | 'hot' | 'failing';
export interface ConceptStat { cid: string; name: string; posts: number; judged: number; medianViews: number; rel: number | null; medianScore: number | null; best: number; trend: 'up' | 'down' | 'flat' | null; status: CStatus; hotScore: number; hotPost: PostScore | null; fading: boolean; stock: number }
export function conceptStats(scores: PostScore[], stockBy: Record<string, number> = {}): ConceptStat[] {
  const judged = scores.filter((s) => s.ageH >= 12 && s.cid);
  const all = median(judged.map((s) => s.views));
  return CIDS.map((cid) => {
    const mine = scores.filter((s) => s.cid === cid), j = judged.filter((s) => s.cid === cid);
    const mv = median(j.map((s) => s.views)), rel = !isNaN(mv) && all > 0 ? mv / all : null;
    const ms = median(j.map((s) => s.score));
    const byAge = [...j].sort((a, b) => b.ageH - a.ageH), half = Math.floor(byAge.length / 2);
    let trend: ConceptStat['trend'] = null;
    if (byAge.length >= 4) { const a = median(byAge.slice(0, half).map((s) => s.views)), b = median(byAge.slice(half).map((s) => s.views)); trend = b > a * 1.25 ? 'up' : b < a * 0.75 ? 'down' : 'flat'; }
    // momentum: a hot / rising post in the last 48 h that is still above the channel
    const live = mine.filter((s) => s.ageH <= 48 && (s.status === 'hot' || (s.status === 'rising' && s.score >= 62)));
    const hotPost = live.sort((a, b) => b.score - a.score)[0] ?? null;
    // fading: the newest 2 posts (older than 3 h) are both clearly below the channel
    const recent = mine.filter((s) => s.ageH >= 3 && s.ratio != null).sort((a, b) => a.ageH - b.ageH).slice(0, 2);
    const fading = recent.length === 2 && recent.every((s) => (s.ratio as number) < 0.7);
    let status: CStatus = 'new';
    if (hotPost && !fading) status = 'hot';
    else if (j.length >= WARM_POSTS) status = rel != null && rel >= 1.5 ? 'winner' : rel != null && rel < 0.5 ? 'failing' : 'ok';
    else if (j.length >= 2 && rel != null && rel >= 2) status = 'winner';
    return { cid, name: CID_NAME[cid], posts: mine.length, judged: j.length, medianViews: isNaN(mv) ? 0 : Math.round(mv), rel, medianScore: isNaN(ms) ? null : Math.round(ms), best: Math.max(0, ...mine.map((s) => s.views)), trend, status, hotScore: hotPost ? hotPost.score : 0, hotPost, fading, stock: stockBy[cid] || 0 };
  });
}

/* ---------- planner ---------- */
export interface PlanRow { slotIso: string; cid: string; reason: string; kind: 'momentum' | 'warm-up' | 'rotation' | 'streak-break' | 'boost' | 'fallback' }
export const trailingRun = (seq: string[]) => { let n = 0; for (let i = seq.length - 1; i >= 0 && seq[i] === seq[seq.length - 1]; i--) n++; return n; };

/** Which concept goes into the next slot. `seq` = concepts of the posted + scheduled videos in slot order (oldest first). */
export function pickConcept(seq: string[], stats: ConceptStat[], avail: (cid: string) => boolean): { cid: string; reason: string; kind: PlanRow['kind'] } {
  const ok = stats.filter((s) => avail(s.cid));
  const pool = ok.length ? ok : stats;
  const last = seq[seq.length - 1], run = last ? trailingRun(seq) : 0;
  const hot = pool.filter((s) => s.status === 'hot').sort((a, b) => b.hotScore - a.hotScore);
  const win = [...seq.slice(-30)];
  const deficit = (s: ConceptStat, w: number, tot: number) => (w / tot) * (win.length + 1) - win.filter((x) => x === s.cid).length;
  const rotation = (exclude?: string, why = 'rotation') => {
    const cands = pool.filter((s) => s.cid !== exclude);
    const cold = cands.filter((s) => s.judged < WARM_POSTS).sort((a, b) => win.filter((x) => x === a.cid).length - win.filter((x) => x === b.cid).length || a.judged - b.judged);
    if (cold.length && !pool.some((s) => s.status === 'winner' && s.rel != null && s.rel >= 2.5)) {
      const c = cold.find((s) => s.cid !== last) ?? cold[0];
      return { cid: c.cid, kind: 'warm-up' as const, reason: `warm-up: ${c.judged} of ${WARM_POSTS} judged posts so far, every concept gets the same chance` };
    }
    const wOf = (s: ConceptStat) => (s.status === 'winner' ? 2.2 : s.status === 'failing' ? 0.3 : 1);
    const tot = cands.reduce((s, x) => s + wOf(x), 0) || 1;
    const best = [...cands].sort((a, b) => deficit(b, wOf(b), tot) - deficit(a, wOf(a), tot) || b.medianViews - a.medianViews)[0];
    const w = wOf(best);
    return { cid: best.cid, kind: 'rotation' as const, reason: w > 1 ? `${why}: winner, gets a bigger share` : w < 1 ? `${why}: failing, only a small share` : `${why}: even share` };
  };
  if (hot.length) {
    const h = hot[0];
    if (h.cid === last && run >= STREAK_MAX) { const r = rotation(h.cid, 'streak break'); return { cid: r.cid, kind: 'streak-break', reason: `${h.cid} had ${run} in a row, one ${r.cid} in between (${r.reason.split(': ')[1] ?? r.reason})` }; }
    return { cid: h.cid, kind: 'momentum', reason: `${h.cid} is hot (score ${h.hotScore}${h.hotPost?.ratio != null ? `, ${h.hotPost.ratio.toFixed(1)}x views` : ''}), riding the momentum` };
  }
  // no hot concept: never the same concept twice in a row during rotation (warm-up and winners are mixed)
  return rotation(last && pool.length > 1 ? last : undefined);
}

/** Plans `slots` one after another (each pick feeds the next). */
export function planSlots(slotsIso: string[], seq: string[], stats: ConceptStat[], avail: (cid: string) => boolean): PlanRow[] {
  const s = [...seq], out: PlanRow[] = [];
  for (const slotIso of slotsIso) { const p = pickConcept(s, stats, avail); s.push(p.cid); out.push({ slotIso, ...p }); }
  return out;
}

/* ---------- alerts ---------- */
const DAY = 86400e3;
/** Adds or updates an alert (same id = same problem). Repeats are quiet: one new entry per problem per 24 h. */
export function raise(alerts: AutoAlert[], a: { id: string; kind: AutoAlert['kind']; title: string; sub: string }, now = new Date()): { alerts: AutoAlert[]; fresh: boolean } {
  const iso = now.toISOString(), cur = alerts.find((x) => x.id === a.id && !x.resolved);
  if (cur) {
    const fresh = now.getTime() - Date.parse(cur.last) > DAY;
    return { alerts: alerts.map((x) => (x === cur ? { ...x, sub: a.sub, count: x.count + 1, last: fresh ? iso : x.last, read: fresh ? false : x.read } : x)), fresh };
  }
  return { alerts: [{ ...a, at: iso, last: iso, count: 1 }, ...alerts].slice(0, 60), fresh: true };
}
/** Marks a problem solved (the next failure raises a new alert). */
export function resolve(alerts: AutoAlert[], id: string): { alerts: AutoAlert[]; changed: boolean } {
  let changed = false;
  const next = alerts.map((x) => { if (x.id === id && !x.resolved) { changed = true; return { ...x, resolved: true }; } return x; });
  return { alerts: next, changed };
}

/* ---------- stock ---------- */
export interface Stock { approved: Video[]; pending: Video[]; rejected: Video[] }
/** Videos that are made, not posted / scheduled yet, split by Mo's review decision. */
export function stockOf(snap: Snapshot): Stock {
  const st = snap.state, au = autoOf(st);
  const free = snap.videos.filter((v) => v.hasVideo && v.hasThumb && v.hasDesc && !st.uploads[String(v.num)]);
  return {
    approved: free.filter((v) => au.approvals[String(v.num)] === 'ok'),
    rejected: free.filter((v) => au.approvals[String(v.num)] === 'no'),
    pending: free.filter((v) => !au.approvals[String(v.num)]),
  };
}
