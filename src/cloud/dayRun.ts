/* The evening routine of the cloud autopilot: plan tomorrow's videos, hand the plan to the cloud, download what arrives, warn when something is missing. */
import { bb } from '../bridge';
import type { Snapshot } from '../types';
import { autoOf, cidOf, type AutoState } from '../autopilot';
import { armKey, planDay, planTarget } from '../dayPlan';
import { ymd } from '../logic';
import { fetchOne, publishPlan, scan, type CloudPlan } from './renders';

export const PLAN_HOUR = 18;       // the plan for tomorrow is made from 18:00
export const CHECK_HOUR = 22;      // at 22:00 the launcher warns about videos that did not arrive
type Ctx = { snap: Snapshot; now: Date; patch: (f: (a: AutoState) => AutoState) => Promise<void>; note: (t: string, k?: 'info' | 'plan' | 'render' | 'warn') => unknown; alert: (a: { id: string; kind: 'gen'; title: string; sub: string }) => unknown; clear: (id: string) => void };
let lastFetch = 0;

export async function dayTick(c: Ctx) {
  const { snap, now } = c, au = autoOf(snap.state);
  const tomorrow = planTarget(now), date = ymd(tomorrow);
  // 1. evening: make and publish tomorrow's plan once
  if (now.getHours() >= PLAN_HOUR && au.dayPlan?.date !== date) {
    const taken = snap.videos.filter((v) => !snap.state.uploads[String(v.num)]);
    const pendingBy: Record<string, number> = {};
    for (const v of taken) { const cid = cidOf(v); if (cid) { const k = armKey(cid, v.variant as 'job' | 'cat' | undefined); pendingBy[k] = (pendingBy[k] || 0) + 1; } }
    const lastCid = null;
    const r = planDay(snap, now, tomorrow, pendingBy, lastCid);
    if (!r.items.length) return;
    let n = Math.max(0, ...snap.videos.map((v) => Math.floor(v.num)));   // failed numbers are reused: only delivered videos count
    const items = r.items.map((i) => ({ ...i, num: ++n }));
    const plan: CloudPlan = { date, made: now.toISOString(), items };
    const err = await publishPlan(plan);
    if (err) { c.alert({ id: 'cloud-plan', kind: 'gen', title: 'Could not hand tomorrow\'s plan to the cloud', sub: err }); return; }
    c.clear('cloud-plan');
    await c.patch((a) => ({ ...a, dayPlan: { date, at: now.toISOString(), items, got: [] } }));
    c.note(`Tomorrow's ${items.length} videos planned (${r.tests} test, ${items.length - r.tests} best guess): ${items.map((i) => `#${i.num} ${i.cid}${i.variant ? '/' + i.variant : ''}`).join(', ')}.`, 'plan');
    return;
  }
  // 2. download finished videos (every 2 minutes)
  if (Date.now() - lastFetch >= 120e3 && bb.renderSave) {
    lastFetch = Date.now();
    const { ready } = await scan();
    for (const num of ready) {
      const err = await fetchOne(num);
      if (err) { c.note(`Video #${num} from the cloud failed the check: ${err}. It stays in the cloud and is tried again.`, 'warn'); continue; }
      c.note(`Video #${num} arrived from the cloud and waits in the review queue${au.autoApprove ? ' (auto-approve checks it first)' : ''}.`, 'render');
      await c.patch((a) => ({ ...a, dayPlan: a.dayPlan ? { ...a.dayPlan, got: [...new Set([...(a.dayPlan.got ?? []), num])] } : a.dayPlan }));
    }
    bb.cleanBuilding?.(au.genJobs.filter((j) => j.state === 'running').map((j) => j.num));
  }
  // 3. 22:00: tomorrow's plan is not complete
  const p = au.dayPlan;
  if (p && p.date === date && now.getHours() >= CHECK_HOUR && !p.missingAlerted) {
    const have = new Set(snap.videos.filter((v) => v.hasVideo).map((v) => v.num));
    const missing = p.items.filter((i) => !have.has(i.num));
    if (missing.length) {
      c.alert({ id: 'cloud-missing', kind: 'gen', title: `${missing.length} of tomorrow's ${p.items.length} videos are missing`, sub: `Not delivered yet: ${missing.map((m) => `#${m.num} ${m.cid}`).join(', ')}. The cloud tasks may still be rendering (K10 takes about 3 hours). Check the Control Room.` });
      await c.patch((a) => ({ ...a, dayPlan: a.dayPlan ? { ...a.dayPlan, missingAlerted: true } : a.dayPlan }));
    }
  }
  if (p && p.date === date && p.items.every((i) => new Set(snap.videos.filter((v) => v.hasVideo).map((v) => v.num)).has(i.num))) c.clear('cloud-missing');
}
