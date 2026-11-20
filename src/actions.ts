import type { AppState, Snapshot } from './types';
import { bb } from './bridge';
import { buildPlan, vn } from './logic';

/** Upload pack: video + thumbnail to Downloads, description to clipboard. */
export async function doUploadPack(num: number, toast: (m: string) => void) {
  const r = await bb.uploadPack(num);
  if (r.ok) toast(`#${vn(num)}: video + thumbnail are in ${r.folder ?? 'Downloads'}, description copied`);
  else toast(`Could not prepare #${vn(num)}: ${r.error ?? 'unknown error'}`);
}
/** Marks a video uploaded. It fills the oldest free slot (Mo 2026-11-14), no matter when it is posted. */
export function markUploaded(snap: Snapshot, num: number) {
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 30);
  const slot = plan.find((s) => !s.uploaded && s.state !== 'missed');
  const real = new Date().toISOString(), slotIso = slot ? slot.when.toISOString() : undefined;
  // counts as posted at its slot time, whenever it was really posted (Mo 2026-11-14)
  return (st: AppState): AppState => ({ ...st, uploads: { ...st.uploads, [String(num)]: { at: slotIso ?? real, realAt: real, slot: slotIso } } });
}
export function unmarkUploaded(num: number) {
  return (st: AppState): AppState => { const u = { ...st.uploads }; delete u[String(num)]; return { ...st, uploads: u }; };
}
export function setLink(num: number, link: string) {
  return (st: AppState): AppState => { const u = st.uploads[String(num)]; if (!u) return st; return { ...st, uploads: { ...st.uploads, [String(num)]: { ...u, link: link.trim() || undefined } } }; };
}

/** Assisted scheduling: next free slot, files + description ready, visible TikTok Studio window with the slot time (PC only). */
export async function doSchedule(snap: Snapshot, num: number, toast: (m: string) => void) {
  if (!bb.scheduleOpen) { toast('Scheduling opens TikTok Studio on the PC, not on the phone'); return; }
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 30);
  const slot = plan.find((s) => !s.uploaded && s.state !== 'missed');
  if (!slot) { toast('No free slot found in the next 30 days'); return; }
  const fmt = (d: Date, tz: string) => d.toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const t = (tz: string) => slot.when.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const r = await bb.scheduleOpen({ num, slotISO: slot.when.toISOString(), slotLabel: fmt(slot.when, 'Europe/Berlin'), uk: t('Europe/London'), et: t('America/New_York'), pt: t('America/Los_Angeles'), tooSoon: slot.when.getTime() - now.getTime() < 20 * 60000 });
  if (r.ok) toast(`#${vn(num)}: Studio is open for slot ${fmt(slot.when, 'Europe/Berlin')}. Files are in ${r.folder}, description copied`);
  else toast(`Could not open the scheduler: ${r.error ?? 'unknown error'}`);
}
