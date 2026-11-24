/* What the autopilot does right now: pure function (snapshot in, decision out), so it can be tested without the app. */
import type { Snapshot, Video } from './types';
import { addDays, at, parseYmd, slotsForDay, slotMap, ymd } from './logic';
import {
  AUTO_GEN, CIDS, GEN_LEAD_H, RENDER_LEAD_MIN, LEAD_MIN, MOMENTUM_MIN_SLOTS, autoOf, cidOf, conceptStats, pickConcept, planSlots, scorePosts, stockOf,
  type ConceptStat, type PlanRow, type PostScore,
} from './autopilot';

export interface Decision {
  scores: PostScore[]; stats: ConceptStat[];
  slots: { iso: string; when: Date; taken: boolean; inWindow: boolean }[];   // next 3 days
  rows: PlanRow[];                                                        // plan for the open slots of the generation window
  enqueue: { cid: string; reason: string; deadline?: string }[];                             // videos to render now
  claude: { cid: string; need: number; why: string }[];                   // concepts that need a Gen round with Claude
  paused: string | null;                                                  // renders are on hold after repeated failures
  schedule: { num: number; slotIso: string; cid: string; reason: string } | null;   // video to put into TikTok now
  noVideo: { slotIso: string; waiting: number } | null;                   // a slot is due but nothing is approved
}

export function decide(snap: Snapshot, now: Date, o: { uploadBusy: boolean; canGen: boolean; canUpload: boolean; genReady?: Set<string>; skip?: Set<string> }): Decision {
  const st = snap.state, au = autoOf(st), day1 = st.settings.day1, skip = st.settings.skipSlots;
  const lead = Math.max(20, au.leadMin ?? LEAD_MIN) * 60e3;
  const scores = scorePosts(snap);
  const stock = stockOf(snap);
  const gen: Set<string> = au.producer === 'launcher' ? (o.genReady ?? AUTO_GEN) : new Set<string>(CIDS);   // Claude can render every Konzept
  const stockBy: Record<string, number> = {};
  for (const v of [...stock.approved, ...stock.pending]) { const c = cidOf(v); if (c) stockBy[c] = (stockBy[c] || 0) + 1; }
  for (const j of au.genJobs) if (j.state === 'queued' || j.state === 'running') stockBy[j.cid] = (stockBy[j.cid] || 0) + 1;
  const stats = conceptStats(scores, stockBy);

  // slots of the next 3 days, and which are taken (scheduled or posted)
  const taken = new Set<string>(); for (const u of Object.values(st.uploads)) taken.add(new Date(u.slot ?? u.at).toISOString()); for (const s of slotMap(st).values()) taken.add(s);
  const today = parseYmd(ymd(now)), slots: Decision['slots'] = [];
  for (let i = 0; i < 3; i++) {
    const day = addDays(today, i), list = slotsForDay(day, day1, skip).map((t) => at(day, t));
    const first = list[0];
    for (const when of list) slots.push({ iso: when.toISOString(), when, taken: taken.has(when.toISOString()), inWindow: !!first && first.getTime() - GEN_LEAD_H * 3600e3 <= now.getTime() });
  }
  slots.sort((a, b) => a.when.getTime() - b.when.getTime());
  const open = slots.filter((s) => s.when.getTime() > now.getTime() && !s.taken && !o.skip?.has(s.iso));   // skip = slots the autopilot already gave up on (the video goes into the next one)
  const win = open.filter((s) => s.inWindow);

  // concepts of the posted + scheduled videos in slot order
  const byNum = new Map(snap.videos.map((v) => [v.num, v] as const));
  const seq = Object.entries(st.uploads).sort((a, b) => new Date(a[1].slot ?? a[1].at).getTime() - new Date(b[1].slot ?? b[1].at).getTime())
    .map(([n]) => cidOf(byNum.get(+n))).filter((c): c is string => !!c);

  const avail = (cid: string) => (stockBy[cid] || 0) > 0 || (o.canGen && gen.has(cid));
  const rows = planSlots(win.map((s) => s.iso), seq, stats, avail);

  // supply: render what the plan needs; a hot concept gets follow-ups on top (up to 5 in stock)
  const need: Record<string, number> = {}; for (const r of rows) need[r.cid] = (need[r.cid] || 0) + 1;
  const enqueue: Decision['enqueue'] = [], claude: Decision['claude'] = [];
  let slotsLeft = Math.max(0, 6 - au.genJobs.filter((j) => j.state === 'queued' || j.state === 'running').length);
  // failsafe: after repeated render failures stop re-queuing (it would burn Claude usage in a loop); "Clear finished" in the Control Room lifts it
  const failed = (cid?: string) => au.genJobs.filter((j) => j.state === 'error' && (!cid || j.cid === cid) && now.getTime() - new Date(j.endedAt ?? j.at).getTime() < 90 * 60e3).length;
  const paused = failed() >= 3 ? 'Three renders failed in the last 90 minutes' : null;
  for (const s of stats) {
    if (paused || failed(s.cid) >= 2) continue;
    const have = stockBy[s.cid] || 0, hot = s.status === 'hot';
    const want = Math.max(need[s.cid] || 0, hot ? MOMENTUM_MIN_SLOTS : 0) - have;
    if (want <= 0) continue;
    if (o.canGen && gen.has(s.cid)) {
      const mine = rows.filter((r) => r.cid === s.cid);   // job i is for the i-th planned slot of this concept (earliest deadline first)
      for (let i = 0; i < want && slotsLeft > 0; i++, slotsLeft--) {
        const slot = mine[Math.max(0, have) + i]?.slotIso;
        enqueue.push({ cid: s.cid, reason: hot ? 'follow-up for a hot video' : 'plan for today', deadline: slot ? new Date(new Date(slot).getTime() - RENDER_LEAD_MIN * 60e3).toISOString() : undefined });
      }
    } else if (hot || s.status === 'winner') {
      claude.push({ cid: s.cid, need: want, why: hot ? 'hot right now, follow-ups wanted' : 'a winner, stock is low' });
    }
  }

  // just-in-time: the next open slot is filled shortly before it (TikTok needs >= 16 min), so a new hot video can still change what goes in
  let schedule: Decision['schedule'] = null, noVideo: Decision['noVideo'] = null;
  const cand = open.find((s) => s.when.getTime() - now.getTime() >= 18 * 60e3);
  if (au.enabled && o.canUpload && cand && cand.when.getTime() - now.getTime() <= lead) {
    const appr = [...stock.approved, ...(au.autoApprove ? stock.pending.filter((v) => v.hasVideo && v.hasThumb && v.hasDesc && v.hasNotes && v.durationSec != null && v.durationSec >= 60 && v.durationSec <= 75) : [])].sort((a, b) => a.num - b.num);
    if (!appr.length) noVideo = { slotIso: cand.iso, waiting: stock.pending.length };
    else if (!o.uploadBusy) {
      const have = new Set(appr.map((v) => cidOf(v)).filter(Boolean) as string[]);
      const p = pickConcept(seq, stats, (c) => have.has(c));
      const v: Video = appr.find((x) => cidOf(x) === p.cid) ?? appr[0];
      schedule = { num: v.num, slotIso: cand.iso, cid: cidOf(v) ?? p.cid, reason: p.reason };
    }
  }
  return { scores, stats, slots, rows, enqueue, claude, paused, schedule, noVideo };
}
