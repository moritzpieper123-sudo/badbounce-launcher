/* The evening routine of the autopilot (Mo 2026-11-24): plan tomorrow's videos, write the plan file for the mother thread, notice the finished videos in Results, warn when something is missing.
   The mother thread (Claude) reads day-plan.json (Badbounce\.claude-workspace\launcher-data) and opens one sub thread per video; each sub thread renders with Gen and saves into Results\#N. */
import { bb } from '../bridge';
import type { Snapshot } from '../types';
import { autoOf, cidOf, type AutoState } from '../autopilot';
import { armKey, planDay, planTarget } from '../dayPlan';
import { ymd } from '../logic';

export const PLAN_HOUR = 22;       // the plan for tomorrow is made from 22:00 (Berlin), so it is ready well before the 00:00 render run
export const CHECK_HOUR = 22;      // at 22:00 the launcher warns about videos that did not arrive
type Ctx = { snap: Snapshot; now: Date; patch: (f: (a: AutoState) => AutoState) => Promise<void>; note: (t: string, k?: 'info' | 'plan' | 'render' | 'warn') => unknown; alert: (a: { id: string; kind: 'gen'; title: string; sub: string }) => unknown; clear: (id: string) => void };
const checked = new Set<string>();
let planning = false, plannedDate = '';   // the tick runs every few seconds: never plan twice while the first plan is still being written

export async function dayTick(c: Ctx) {
  const { snap, now } = c, au = autoOf(snap.state);
  const tomorrow = planTarget(now), date = ymd(tomorrow);
  // 1. evening: make and publish tomorrow's plan once
  if (au.dayPlan?.date !== date) {
    if (planning || plannedDate === date) return;
    planning = true;
    try {
    const taken = snap.videos.filter((v) => !snap.state.uploads[String(v.num)]);
    const pendingBy: Record<string, number> = {};
    for (const v of taken) { const cid = cidOf(v); if (cid) { const k = armKey(cid, v.variant as 'job' | 'cat' | undefined); pendingBy[k] = (pendingBy[k] || 0) + 1; } }
    const lastCid = null;
    const r = planDay(snap, now, tomorrow, pendingBy, lastCid);
    if (!r.items.length) return;
    let n = Math.max(0, ...snap.videos.map((v) => Math.floor(v.num)));   // failed numbers are reused: only delivered videos count
    const items = r.items.map((i) => ({ ...i, num: ++n }));
    const plan = { date, made: now.toISOString(), results: 'Results\\#<num>', files: ['Badbounce #<num>.mp4', 'Thumbnail #<num>.png', 'Description #<num>.txt', 'Notes #<num>.md'], items };
    const file = bb.dayPlanWrite ? await bb.dayPlanWrite(plan) : null;
    if (!file) { c.alert({ id: 'day-plan', kind: 'gen', title: 'Could not write tomorrow\'s plan file', sub: 'day-plan.json in launcher-data was not written.' }); return; }
    c.clear('day-plan');
    plannedDate = date;
    await c.patch((a) => ({ ...a, dayPlan: { date, at: now.toISOString(), items, got: [] } }));
    c.note(`Tomorrow's ${items.length} videos planned (${r.tests} test, ${items.length - r.tests} best guess): ${items.map((i) => `#${i.num} ${i.cid}${i.variant ? '/' + i.variant : ''}`).join(', ')}.`, 'plan');
    return;
    } finally { planning = false; }
  }
  // 1b. auto-approve ON: every new video passes the checks first; pass = approved (free to upload), fail = stays in manual review with the reason
  if (au.autoApprove && bb.checkVideo) {
    for (const v of snap.videos) {
      const key = `${v.num}|${v.createdMs}`;
      if (checked.has(key) || !v.hasVideo || !v.hasThumb || !v.hasDesc || snap.state.uploads[String(v.num)] || au.approvals[String(v.num)]) continue;
      if (Date.now() - v.createdMs < 60e3) continue;   // still being written
      checked.add(key);
      const r = await bb.checkVideo(v.num, v.durationSec ?? null);
      if (r.ok) { await c.patch((a) => ({ ...a, approvals: { ...a.approvals, [String(v.num)]: 'ok' } })); c.note(`#${v.num} passed the checks and is approved${r.notes.length ? ' (' + r.notes[0] + ')' : ''}.`, 'render'); c.clear(`check-${v.num}`); }
      else { c.note(`#${v.num} failed the checks: ${r.fails.join('; ')}. It waits for your review.`, 'warn'); c.alert({ id: `check-${v.num}`, kind: 'gen', title: `#${v.num} needs your review`, sub: `Auto-approve checks failed: ${r.fails.join('; ')}.` }); }
    }
  }
  // 2. finished videos: whatever the sub threads saved into Results counts as delivered
  if (au.dayPlan) {
    const have = new Set(snap.videos.filter((v) => v.hasVideo && v.hasThumb && v.hasDesc).map((v) => v.num));
    const got = au.dayPlan.items.map((i) => i.num).filter((n) => have.has(n));
    const old = new Set(au.dayPlan.got ?? []);
    const fresh = got.filter((n) => !old.has(n));
    if (fresh.length) {
      for (const n of fresh) c.note(`Video #${n} arrived in Results and waits in the review queue${au.autoApprove ? ' (auto-approve checks it first)' : ''}.`, 'render');
      await c.patch((a) => ({ ...a, dayPlan: a.dayPlan ? { ...a.dayPlan, got: [...new Set([...(a.dayPlan.got ?? []), ...got])] } : a.dayPlan }));
    }
  }
  // 3. 22:00: tomorrow's plan is not complete
  const p = au.dayPlan;
  if (p && p.date === date && now.getHours() >= CHECK_HOUR && !p.missingAlerted) {
    const have = new Set(snap.videos.filter((v) => v.hasVideo).map((v) => v.num));
    const missing = p.items.filter((i) => !have.has(i.num));
    if (missing.length) {
      c.alert({ id: 'day-missing', kind: 'gen', title: `${missing.length} of tomorrow's ${p.items.length} videos are missing`, sub: `Not delivered yet: ${missing.map((m) => `#${m.num} ${m.cid}`).join(', ')}. The sub threads may still be rendering (K10 takes longest). Check the Control Room.` });
      await c.patch((a) => ({ ...a, dayPlan: a.dayPlan ? { ...a.dayPlan, missingAlerted: true } : a.dayPlan }));
    }
  }
  if (p && p.date === date && p.items.every((i) => new Set(snap.videos.filter((v) => v.hasVideo).map((v) => v.num)).has(i.num))) c.clear('day-missing');
}
