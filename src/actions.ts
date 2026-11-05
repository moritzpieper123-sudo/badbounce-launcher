import type { AppState, Snapshot } from './types';
import { bb } from './bridge';
import { buildPlan } from './logic';

/** Upload pack: video + thumbnail to Downloads, description to clipboard. */
export async function doUploadPack(num: number, toast: (m: string) => void) {
  const r = await bb.uploadPack(num);
  if (r.ok) toast(`#${num}: video + thumbnail are in ${r.folder ?? 'Downloads'}, description copied`);
  else toast(`Could not prepare #${num}: ${r.error ?? 'unknown error'}`);
}
/** Marks a video uploaded; it keeps the slot it filled. */
export function markUploaded(snap: Snapshot, num: number) {
  const now = new Date(snap.now);
  const plan = buildPlan(snap, now, 2);
  const slot = plan.find((s) => s.video?.num === num && !s.uploaded);
  return (st: AppState): AppState => ({ ...st, uploads: { ...st.uploads, [String(num)]: { at: new Date().toISOString(), slot: slot ? slot.when.toISOString() : undefined } } });
}
export function unmarkUploaded(num: number) {
  return (st: AppState): AppState => { const u = { ...st.uploads }; delete u[String(num)]; return { ...st, uploads: u }; };
}
export function setLink(num: number, link: string) {
  return (st: AppState): AppState => { const u = st.uploads[String(num)]; if (!u) return st; return { ...st, uploads: { ...st.uploads, [String(num)]: { ...u, link: link.trim() || undefined } } }; };
}
