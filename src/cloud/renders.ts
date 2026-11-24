/* Cloud render delivery (Mo 2026-11-24). Bucket "videos", folder renders/ only (the cloud user and Mo's login may use nothing else).
   Launcher -> cloud : renders/plan-YYYY-MM-DD.json  { date, items: [{ slot, num, cid, variant?, reason }] }
   Cloud -> launcher : renders/<num>/ with the four finished files (Badbounce #N.mp4, Thumbnail #N.png, Description #N.txt, Notes #N.md)
                       and, last, done.json { num, files: { name: bytes } }. A folder without done.json is still being uploaded.
   The launcher downloads, checks the sizes, saves into Results\#N and deletes the cloud copy. */
import { bb } from '../bridge';
import { sb, session } from './client';
import type { PlanItem } from '../dayPlan';

const B = 'videos', R = 'renders';
export interface CloudPlan { date: string; made: string; items: (PlanItem & { num: number })[] }
export const FILES = (n: number) => [`Badbounce #${n}.mp4`, `Thumbnail #${n}.png`, `Description #${n}.txt`, `Notes #${n}.md`];

export async function publishPlan(plan: CloudPlan): Promise<string | null> {
  if (!sb || !(await session())) return 'not signed in';
  const { error } = await sb.storage.from(B).upload(`${R}/plan-${plan.date}.json`, new Blob([JSON.stringify(plan, null, 1)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  return error ? error.message : null;
}
export async function planPublished(date: string): Promise<boolean> {
  if (!sb || !(await session())) return false;
  const { data } = await sb.storage.from(B).list(R, { search: `plan-${date}.json` });
  return !!data?.some((f) => f.name === `plan-${date}.json`);
}
/** numbers whose folder holds a done.json (ready to download) and numbers that are only partly uploaded */
export async function scan(): Promise<{ ready: number[]; partial: number[] }> {
  const out = { ready: [] as number[], partial: [] as number[] };
  if (!sb || !(await session())) return out;
  const { data } = await sb.storage.from(B).list(R, { limit: 200 });
  for (const e of data ?? []) {
    const n = /^\d+$/.test(e.name) ? +e.name : null; if (n == null) continue;
    const { data: inner } = await sb.storage.from(B).list(`${R}/${n}`, { limit: 20 });
    (inner?.some((f) => f.name === 'done.json') ? out.ready : out.partial).push(n);
  }
  return out;
}
/** Download, verify, save into Results\#N, then delete from the cloud. Returns an error text or null. */
export async function fetchOne(num: number): Promise<string | null> {
  if (!sb || !bb.renderSave) return 'not available';
  const bucket = sb.storage.from(B);
  const d = await bucket.download(`${R}/${num}/done.json`); if (d.error || !d.data) return 'done.json missing';
  let meta: { files?: Record<string, number> }; try { meta = JSON.parse(await d.data.text()); } catch { return 'done.json unreadable'; }
  const files: { name: string; data: ArrayBuffer }[] = [];
  for (const name of FILES(num)) {
    const r = await bucket.download(`${R}/${num}/${name}`); if (r.error || !r.data) return `${name} could not be downloaded`;
    const buf = await r.data.arrayBuffer(), want = meta.files?.[name];
    if (!buf.byteLength || (want != null && want !== buf.byteLength)) return `${name} is incomplete (${buf.byteLength} of ${want ?? '?'} bytes)`;
    files.push({ name, data: buf });
  }
  const res = await bb.renderSave(num, files); if (!res.ok) return res.error ?? 'save failed';
  await bucket.remove([...FILES(num), 'done.json'].map((n) => `${R}/${num}/${n}`));   // only after the files are safely in Results
  return null;
}

/** Engine mirror: one zip per Konzept + "common" in renders/engine/, uploaded only when something changed. The cloud tasks unzip what they need. */
export async function syncEngines(): Promise<string | null> {
  if (!sb || !bb.engineParts || !bb.engineZip || !(await session())) return null;
  const bucket = sb.storage.from(B), mp = `${R}/engine/manifest.json`;
  let man: { zips: Record<string, { sig: string; bytes: number }> } = { zips: {} };
  const cur = await bucket.download(mp); if (cur.data) { try { man = JSON.parse(await cur.data.text()); } catch { /* start fresh */ } }
  let changed = false;
  for (const part of await bb.engineParts()) {
    const r = await bb.engineZip(part, man.zips[part]?.sig); if (!r.ok) return `engine ${part}: ${r.error}`;
    if (!r.data || !r.sig) continue;
    if (r.data.byteLength > 49e6) return `engine ${part} zip is ${(r.data.byteLength / 1e6).toFixed(0)} MB, over the 50 MB free-plan limit`;
    const up = await bucket.upload(`${R}/engine/${part}.zip`, new Blob([r.data], { type: 'application/zip' }), { upsert: true, contentType: 'application/zip' });
    if (up.error) return `engine ${part}: ${up.error.message}`;
    man.zips[part] = { sig: r.sig, bytes: r.data.byteLength }; changed = true;
  }
  if (changed) { const up = await bucket.upload(mp, new Blob([JSON.stringify({ ...man, updated: new Date().toISOString() }, null, 1)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' }); if (up.error) return up.error.message; }
  return null;
}
