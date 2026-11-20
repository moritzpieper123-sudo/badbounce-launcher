import type { AppState, Snapshot } from './types';
import { bb } from './bridge';
import { buildPlan, vn } from './logic';

/** Upload pack: video + thumbnail to Downloads, description to clipboard. */
export async function doUploadPack(num: number, toast: (m: string) => void) {
  const r = await bb.uploadPack(num);
  if (r.ok) toast(`#${vn(num)}: video + thumbnail are in ${r.folder ?? 'Downloads'}, description copied`);
  else toast(`Could not prepare #${vn(num)}: ${r.error ?? 'unknown error'}`);
}
/** Next free slot that is at least 20 min away (TikTok needs 15 min lead, 5-min steps). */
export function pickAutoSlot(snap: Snapshot) {
  const now = new Date(snap.now), min = now.getTime() + 20 * 60000;
  return buildPlan(snap, now, 10).find((s) => !s.uploaded && s.state !== 'missed' && s.when.getTime() >= min) ?? null;
}
/** Starts Mo's bb_upload.py for one video: 'schedule' = schedules it in TikTok Studio, 'test' = all but the last click. */
export async function doAutoUpload(snap: Snapshot, num: number, mode: 'schedule' | 'test', toast: (m: string) => void) {
  if (!bb.autoUpload) { toast('Auto upload only works in the Windows app'); return; }
  const slot = pickAutoSlot(snap);
  if (!slot) { toast('No free slot at least 20 min away in the next 10 days'); return; }
  const r = await bb.autoUpload(num, slot.when.toISOString(), mode);
  if (!r.ok) toast(r.error ?? 'Could not start the upload script');
  else toast(`#${vn(num)}: ${mode === 'test' ? 'test run' : 'scheduling'} for ${slot.when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} ${slot.time} started, a Chrome window opens`);
}
/** All ready videos into the next free slots (>= 20 min away, within 10 days), in one sequential run. */
export async function doAutoAll(snap: Snapshot, mode: 'schedule' | 'test', toast: (m: string) => void) {
  if (!bb.autoUploadBatch) { toast('Auto upload only works in the Windows app'); return; }
  const now = new Date(snap.now), min = now.getTime() + 20 * 60000;
  const items = buildPlan(snap, now, 10).filter((s) => s.video && !s.uploaded && s.state !== 'missed' && s.when.getTime() >= min).map((s) => ({ num: s.video!.num, slotIso: s.when.toISOString() }));
  if (!items.length) { toast('No ready video has a free slot at least 20 min away'); return; }
  const r = await bb.autoUploadBatch(items, mode);
  toast(r.ok ? `${items.length} video${items.length > 1 ? 's' : ''}: ${mode === 'test' ? 'test run' : 'scheduling'} started, one after another` : r.error ?? 'Could not start');
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
