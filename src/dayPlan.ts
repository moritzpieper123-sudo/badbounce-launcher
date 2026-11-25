/* The day planner (Mo 2026-11-24): every evening it picks the videos for TOMORROW's slots.
   Pure functions, no UI, so the whole rule set can be tested without the app.
   - Score of a post: reach 50% + new followers 30% + watched to the end 20% (PostScore.pick).
   - Test slots: every concept plain until it has 3 posts, both variants on every eligible concept until each has 2 posts.
   - Best-guess slots: the arm with the best score (upper confidence bound), the hot arm first.
   - Early days 4 test + 1 best-guess; the test share shrinks as the tests get done.
   - A concept is dropped after 3 judged posts with a median below half the channel median; a variant after 2 judged posts both below the plain posts of its concept.
     Dropped arms get one re-test every 14 days. */
import type { Snapshot, Video } from './types';
import { CIDS, CID_NAME, autoOf, scorePosts, type AutoState, type PostScore } from './autopilot';
import { VARIANTS, VARIANT_CIDS, variantOn, type VariantId } from './variants';
import { addDays, at, parseYmd, slotsForDay, ymd } from './logic';

export const TEST_PLAIN = 3;       // posts per concept before it can be judged
export const TEST_VARIANT = 2;     // posts per variant on a concept before it can be judged
export const JUDGED_H = 12;        // a post younger than this is only provisional
export const RETEST_DAYS = 14;
export const MAX_PER_CONCEPT_DAY = 3;

export type ArmKey = string;       // "K10|plain" | "K10|job" | "K10|cat"
export const armKey = (cid: string, v?: VariantId | null): ArmKey => `${cid}|${v ?? 'plain'}`;
export const armOf = (k: ArmKey) => { const [cid, v] = k.split('|'); return { cid, variant: v === 'plain' ? null : (v as VariantId) }; };
export const armLabel = (k: ArmKey) => { const a = armOf(k); return `${a.cid} ${CID_NAME[a.cid] ?? ''}${a.variant ? ` · ${a.variant === 'job' ? 'job form' : 'leopard'}` : ''}`.trim(); };

export type Verdict = 'testing' | 'keep' | 'winner' | 'drop' | 'retest';
export interface ArmStat {
  key: ArmKey; cid: string; variant: VariantId | null;
  posts: number;          // posted or scheduled videos of this arm
  judged: number;         // of them older than JUDGED_H
  pending: number;        // made or planned, not posted yet
  committed: number;      // posts + pending
  target: number;         // posts wanted before a verdict
  meanScore: number | null; medianViews: number | null;
  lastPostMs: number | null;
  verdict: Verdict; uncertain: boolean; hot: boolean; why: string;
}
export interface PlanItem { slotIso: string; cid: string; variant?: VariantId; kind: 'test' | 'best'; reason: string }

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Which arms exist: every concept plain, plus both variants on the eligible concepts that are switched on. */
export function allArms(au: AutoState): ArmKey[] {
  const out: ArmKey[] = [];
  for (const cid of CIDS) {
    out.push(armKey(cid));
    if (VARIANT_CIDS.has(cid)) for (const v of VARIANTS) if (variantOn(au, v.id)) out.push(armKey(cid, v.id));
  }
  return out;
}

/** Test board: one row per arm with its verdict. `pendingBy` = videos made or planned but not posted yet, per arm. */
export function armStats(snap: Snapshot, now: Date, pendingBy: Record<ArmKey, number> = {}, scores: PostScore[] = scorePosts(snap)): ArmStat[] {
  const au = autoOf(snap.state);
  const byNum = new Map<number, Video>(snap.videos.map((v) => [v.num, v]));
  const variantOfNum = (n: number | null): VariantId | null => (n != null ? ((byNum.get(n)?.variant as VariantId | undefined) ?? null) : null);
  const judgedAll = scores.filter((s) => s.cid && s.ageH >= JUDGED_H);
  const channelMed = median(judgedAll.map((s) => s.views));
  const arms = allArms(au);
  const mineOf = (key: ArmKey) => { const a = armOf(key); return scores.filter((s) => s.cid === a.cid && variantOfNum(s.num) === a.variant); };
  const raw = arms.map((key) => {
    const a = armOf(key), mine = mineOf(key), j = mine.filter((s) => s.ageH >= JUDGED_H);
    const picks = j.map((s) => s.pick).filter((x): x is number => x != null);
    const pend = pendingBy[key] || 0;
    const lastPostMs = mine.length ? Math.max(...mine.map((s) => now.getTime() - s.ageH * 3600e3)) : null;
    return { key, ...a, mine, j, picks, pend, lastPostMs };
  });
  const plainMedian = (cid: string) => median(raw.find((r) => r.cid === cid && r.variant == null)!.j.map((s) => s.views));
  return raw.map((r) => {
    const target = r.variant ? TEST_VARIANT : TEST_PLAIN;
    const mv = median(r.j.map((s) => s.views));
    let verdict: Verdict = 'testing', why = `${r.j.length} of ${target} judged posts`;
    const hot = r.mine.some((s) => s.status === 'hot' && s.ageH <= 48);
    if (r.j.length >= target) {
      if (!r.variant) {
        if (channelMed && mv != null && mv < channelMed * 0.5) { verdict = 'drop'; why = `median ${Math.round(mv)} views, under half the channel median (${Math.round(channelMed)})`; }
        else if (channelMed && mv != null && mv >= channelMed * 1.5) { verdict = 'winner'; why = `median ${Math.round(mv)} views, ${(mv / channelMed).toFixed(1)}x the channel`; }
        else { verdict = 'keep'; why = mv != null ? `median ${Math.round(mv)} views` : 'judged'; }
      } else {
        const pm = plainMedian(r.cid);
        if (pm != null && r.j.length >= 2 && r.j.every((s) => s.views < pm)) { verdict = 'drop'; why = `both posts under the plain ${r.cid} median (${Math.round(pm)})`; }
        else if (pm != null && mv != null && mv >= pm * 1.3) { verdict = 'winner'; why = `median ${Math.round(mv)} views vs ${Math.round(pm)} plain`; }
        else { verdict = 'keep'; why = mv != null ? `median ${Math.round(mv)} views` : 'judged'; }
      }
      if (verdict === 'drop' && r.lastPostMs != null && now.getTime() - r.lastPostMs > RETEST_DAYS * 86400e3 && r.pend === 0) { verdict = 'retest'; why += ` · dropped, re-test after ${RETEST_DAYS} days`; }
    }
    return { key: r.key, cid: r.cid, variant: r.variant, posts: r.mine.length, judged: r.j.length, pending: r.pend, committed: r.mine.length + r.pend, target,
      meanScore: mean(r.picks), medianViews: mv, lastPostMs: r.lastPostMs, verdict, uncertain: r.j.length < 3, hot, why };
  });
}

/** Share of test slots from how much testing is still open: 4 of 5 early, then fewer, at least 1 while any arm is open or re-testable. */
export function testShare(stats: ArmStat[], n: number): number {
  const open = stats.reduce((s, a) => s + (a.verdict === 'testing' || a.verdict === 'retest' ? Math.max(0, a.target - a.committed) : 0), 0);
  const t = open > 20 ? 4 : open > 8 ? 3 : open > 0 ? 2 : 1;
  return Math.min(n, Math.round((t * n) / 5));
}

/** Plan one day: returns one item per slot (in slot order). */
/** Slots that already hold an upload (Mo posts by hand and marks them). */
const heldSlots = (st: Snapshot['state']) => new Set(Object.values(st.uploads || {}).map((u) => new Date(u.slot || u.at).getTime()));

export function planDay(snap: Snapshot, now: Date, day: Date, pendingBy: Record<ArmKey, number> = {}, lastCid?: string | null): { items: PlanItem[]; stats: ArmStat[]; tests: number } {
  const st = snap.state;
  const stats = armStats(snap, now, pendingBy);
  const slots = slotsForDay(day, st.settings.day1, st.settings.skipSlots).map((t) => at(day, t)).filter((d) => d.getTime() > now.getTime() && !heldSlots(st).has(d.getTime()));   // slots that already hold an upload (by hand) are not planned again
  const n = slots.length;
  if (!n) return { items: [], stats, tests: 0 };
  const dayCount: Record<string, number> = {}, armCount: Record<ArmKey, number> = {};
  const used = (s: ArmStat) => dayCount[s.cid] || 0;
  const take = (s: ArmStat) => { dayCount[s.cid] = (dayCount[s.cid] || 0) + 1; armCount[s.key] = (armCount[s.key] || 0) + 1; s.committed += 1; };

  // 1. test picks: the arm furthest from its target first, plain before variant on ties, a retest counts as one open post
  const nTest = testShare(stats, n);
  const testPicks: { s: ArmStat; why: string }[] = [];
  for (let i = 0; i < nTest; i++) {
    const cands = stats.filter((s) => (s.verdict === 'testing' || s.verdict === 'retest') && s.committed < s.target && used(s) < MAX_PER_CONCEPT_DAY && !(s.committed >= s.target));
    const retest = stats.filter((s) => s.verdict === 'retest' && !armCount[s.key]);
    const pool = cands.length ? cands : retest;
    if (!pool.length) break;
    pool.sort((a, b) => a.committed / a.target - b.committed / b.target || (a.variant ? 1 : 0) - (b.variant ? 1 : 0) || (used(a) - used(b)));
    const s = pool.find((x) => x.cid !== (testPicks[testPicks.length - 1]?.s.cid)) ?? pool[0];
    testPicks.push({ s, why: s.verdict === 'retest' ? `re-test: ${s.why}` : `test: ${armLabel(s.key)} has ${s.committed} of ${s.target} posts` });
    take(s);
  }

  // 2. best-guess picks: hot arm first, then the best upper confidence bound
  const bestPicks: { s: ArmStat; why: string }[] = [];
  const totalJudged = Math.max(2, stats.reduce((s, a) => s + a.judged, 0));
  const live = stats.filter((s) => s.verdict !== 'drop' && s.verdict !== 'retest');
  const value = (s: ArmStat) => (s.meanScore == null ? -1 : s.meanScore / 100 + 0.35 * Math.sqrt(Math.log(totalJudged) / Math.max(1, s.judged)));
  for (let i = n - nTest; i > 0; i--) {
    const hot = live.filter((s) => s.hot && used(s) < MAX_PER_CONCEPT_DAY && (armCount[s.key] || 0) < 2).sort((a, b) => (b.meanScore ?? 0) - (a.meanScore ?? 0))[0];
    let pick = hot, why = hot ? `best guess: ${armLabel(hot.key)} is hot, riding the momentum` : '';
    if (!pick) {
      const c = live.filter((s) => s.judged >= 1 && used(s) < MAX_PER_CONCEPT_DAY && (armCount[s.key] || 0) < 2).sort((a, b) => value(b) - value(a));
      pick = c.find((s) => s.cid !== bestPicks[bestPicks.length - 1]?.s.cid) ?? c[0];
      if (pick) why = `best guess: ${armLabel(pick.key)} scores ${pick.meanScore != null ? Math.round(pick.meanScore) : '?'} over ${pick.judged} post${pick.judged === 1 ? '' : 's'}${pick.verdict === 'winner' ? ', a winner' : ''}`;
    }
    if (!pick) {   // no data yet: fall back to the arm with the fewest posts
      const c = live.filter((s) => used(s) < MAX_PER_CONCEPT_DAY).sort((a, b) => a.committed - b.committed || (a.variant ? 1 : 0) - (b.variant ? 1 : 0));
      pick = c.find((s) => s.cid !== bestPicks[bestPicks.length - 1]?.s.cid) ?? c[0];
      if (pick) why = `no scored posts yet: ${armLabel(pick.key)} has the fewest posts`;
    }
    if (!pick) break;
    bestPicks.push({ s: pick, why }); take(pick);
  }

  // 3. order: best-guess slots spread through the day, tests rotate over all slot times day by day
  const kinds: ('test' | 'best')[] = Array(n).fill('test');
  const bestAt = bestPicks.map((_, i) => Math.floor(((i + 0.5) * n) / Math.max(1, bestPicks.length)));
  for (const i of bestAt) kinds[Math.min(n - 1, i)] = 'best';
  const rot = Math.floor(day.getTime() / 86400e3) % n;
  const rotated = kinds.map((_, i) => kinds[(i + rot) % n]);
  const tq = [...testPicks], bq = [...bestPicks], items: PlanItem[] = [];
  for (let i = 0; i < n; i++) {
    const wantBest = rotated[i] === 'best';
    const src = wantBest ? (bq.shift() ?? tq.shift()) : (tq.shift() ?? bq.shift());
    if (!src) break;
    items.push({ slotIso: slots[i].toISOString(), cid: src.s.cid, variant: src.s.variant ?? undefined, kind: (wantBest ? bestPicks : testPicks).includes(src) ? (wantBest ? 'best' : 'test') : (wantBest ? 'test' : 'best'), reason: src.why });
  }
  // never the same concept in two neighbouring slots (also across midnight)
  for (let i = 0; i < items.length; i++) {
    const prev = i === 0 ? lastCid ?? null : items[i - 1].cid;
    if (items[i].cid !== prev) continue;
    const j = items.findIndex((x, k) => k > i && x.cid !== prev && x.cid !== (items[i + 1]?.cid));
    if (j > i) [items[i], items[j]] = [{ ...items[j], slotIso: items[i].slotIso }, { ...items[i], slotIso: items[j].slotIso }];
  }
  return { items, stats, tests: nTest };
}

/** Day to plan: tomorrow, unless the evening has not started and today still has open slots (then today). */
/** From 18:00 the plan is for tomorrow; before that it is for today (its remaining open slots), so a day never goes unplanned after midnight. */
export const planTarget = (now: Date) => now.getHours() >= 18 ? addDays(parseYmd(ymd(now)), 1) : parseYmd(ymd(now));
