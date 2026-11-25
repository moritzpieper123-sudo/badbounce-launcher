/* The evening routine of the autopilot (Mo 2026-11-24): plan tomorrow's videos, write the plan file for the mother thread, notice the finished videos in Results, warn when something is missing.
   The mother thread (Claude) reads day-plan.json (Badbounce\.claude-workspace\launcher-data) and opens one sub thread per video; each sub thread renders with Gen and saves into Results\#N. */
import { bb } from '../bridge';
import type { Snapshot } from '../types';
import { autoOf, cidOf, type AutoState } from '../autopilot';
import { armKey, openSlots, planDay } from '../dayPlan';
import { addDays, parseYmd, ymd } from '../logic';

export const PLAN_HOUR = 22;       // the plan for tomorrow is made from 22:00 (Berlin), so it is ready well before the 00:00 render run
export const CHECK_HOUR = 22;      // at 22:00 the launcher warns about videos that did not arrive
type Ctx = { snap: Snapshot; now: Date; patch: (f: (a: AutoState) => AutoState) => Promise<void>; note: (t: string, k?: 'info' | 'plan' | 'render' | 'warn') => unknown; alert: (a: { id: string; kind: 'gen'; title: string; sub: string }) => unknown; clear: (id: string) => void };
const checked = new Set<string>();
let planning = false;
const done = new Set<string>();   // days planned (or without a free slot) in this run: the state patch may lag one tick behind   // the tick runs every few seconds: never plan twice while the first plan is still being written

export async function dayTick(c: Ctx) {
  const { snap, now } = c, au = autoOf(snap.state);
  const today = parseYmd(ymd(now));
  // 1. planning: always TWO days ahead (Mo 2026-11-24): from 22:00 on day D the plan for D+2 is made; before 22:00 the days up to D+1 are covered. A day with no open slot is skipped.
  const lastDay = addDays(today, now.getHours() >= PLAN_HOUR ? 2 : 1);
  // videos that already exist (not rejected, not posted) or are planned but not rendered yet will fill the earliest free slots: those slots are not planned again
  let reserve = snap.videos.filter((v) => v.hasVideo && v.hasThumb && v.hasDesc && !snap.state.uploads[String(v.num)] && au.approvals[String(v.num)] !== 'no').length;
  { const haveN = new Set(snap.videos.map((v) => v.num)); for (const pl of Object.values(au.plans ?? {})) reserve += pl.items.filter((i) => !haveN.has(i.num)).length; }
  for (let d = today; d.getTime() <= lastDay.getTime(); d = addDays(d, 1)) {
    const date = ymd(d);
    if (au.plans?.[date] || au.dayPlan?.date === date || done.has(date)) { reserve = Math.max(0, reserve - openSlots(snap, now, d).length); continue; }
    if (planning) return;
    planning = true;
    try {
      const plans = { ...(au.plans ?? {}) };
      const pendingBy: Record<string, number> = {};
      const bump = (cid: string | null, variant?: string) => { if (cid) { const k = armKey(cid, variant as 'job' | 'cat' | undefined); pendingBy[k] = (pendingBy[k] || 0) + 1; } };
      for (const v of snap.videos) if (!snap.state.uploads[String(v.num)]) bump(cidOf(v), v.variant ?? undefined);
      const have = new Set(snap.videos.map((v) => v.num));
      for (const pl of Object.values(plans)) for (const i of pl.items) if (!have.has(i.num)) bump(i.cid, i.variant);   // planned, not rendered yet
      const r = planDay(snap, now, d, pendingBy, null, reserve);
      if (!r.items.length) { reserve = Math.max(0, reserve - openSlots(snap, now, d).length); done.add(date); continue; }
      let n = Math.max(0, ...snap.videos.map((v) => Math.floor(v.num)), ...Object.values(plans).flatMap((pl) => pl.items.map((i) => i.num)));   // failed numbers are reused: only delivered or planned videos count
      const items = r.items.map((i) => ({ ...i, num: ++n }));
      const plan = { date, at: now.toISOString(), items, got: [] as number[] };
      plans[date] = plan;
      const open = Object.values(plans).filter((pl) => pl.date >= ymd(now)).sort((x, y) => x.date.localeCompare(y.date));
      const file = bb.dayPlanWrite ? await bb.dayPlanWrite({ made: now.toISOString(), results: 'Results\\#<num>', files: ['Badbounce #<num>.mp4', 'Thumbnail #<num>.png', 'Description #<num>.txt', 'Notes #<num>.md'], plans: open }) : null;
      if (!file) { c.alert({ id: 'day-plan', kind: 'gen', title: 'Could not write the plan file', sub: 'day-plan.json in launcher-data was not written.' }); return; }
      c.clear('day-plan');
      done.add(date);
      reserve = Math.max(0, reserve - openSlots(snap, now, d).length);   // the reserve was used up by this day
      await c.patch((a) => ({ ...a, plans: { ...(a.plans ?? {}), [date]: plan }, dayPlan: plan }));
      c.note(`The ${items.length} video${items.length === 1 ? '' : 's'} for ${date} ${items.length === 1 ? 'is' : 'are'} planned (${r.tests} test, ${items.length - r.tests} best guess): ${items.map((i) => `#${i.num} ${i.cid}${i.variant ? '/' + i.variant : ''}`).join(', ')}.`, 'plan');
    } finally { planning = false; }
    return;   // one plan per tick
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
  for (const pl of Object.values(au.plans ?? {})) {
    const have = new Set(snap.videos.filter((v) => v.hasVideo && v.hasThumb && v.hasDesc).map((v) => v.num));
    const got = pl.items.map((i) => i.num).filter((n) => have.has(n));
    const old = new Set(pl.got ?? []);
    const fresh = got.filter((n) => !old.has(n));
    if (fresh.length) {
      for (const n of fresh) c.note(`Video #${n} arrived in Results and waits in the review queue${au.autoApprove ? ' (auto-approve checks it first)' : ''}.`, 'render');
      await c.patch((a) => ({ ...a, plans: a.plans?.[pl.date] ? { ...a.plans, [pl.date]: { ...a.plans[pl.date], got: [...new Set([...(a.plans[pl.date].got ?? []), ...got])] } } : a.plans }));
    }
  }
  // 3. 22:00: tomorrow's videos should be finished by now (they were planned the day before yesterday's evening)
  const tdate = ymd(addDays(today, 1)), p = au.plans?.[tdate];
  const haveAll = new Set(snap.videos.filter((v) => v.hasVideo).map((v) => v.num));
  if (p && now.getHours() >= CHECK_HOUR && !p.missingAlerted) {
    const missing = p.items.filter((i) => !haveAll.has(i.num));
    if (missing.length) {
      c.alert({ id: 'day-missing', kind: 'gen', title: `${missing.length} of tomorrow's ${p.items.length} videos are missing`, sub: `Not delivered yet: ${missing.map((m) => `#${m.num} ${m.cid}`).join(', ')}. The sub threads may still be rendering (K10 takes longest). Check the Control Room.` });
      await c.patch((a) => ({ ...a, plans: a.plans?.[tdate] ? { ...a.plans, [tdate]: { ...a.plans[tdate], missingAlerted: true } } : a.plans }));
    }
  }
  if (p && p.items.every((i) => haveAll.has(i.num))) c.clear('day-missing');
}
