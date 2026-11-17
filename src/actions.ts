import type { AppState, Snapshot } from './types';
import { bb } from './bridge';
import { buildPlan } from './logic';

/** Upload pack: video + thumbnail to Downloads, description to clipboard. */
export async function doUploadPack(num: number, toast: (m: string) => void) {
  const r = await bb.uploadPack(num);
  if (r.ok) toast(`#${num}: video + thumbnail are in ${r.folder ?? 'Downloads'}, description copied`);
  else toast(`Could not prepare #${num}: ${r.error ?? 'unknown error'}`);
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
