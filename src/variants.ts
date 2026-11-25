/* Overlay variants (Mo 2026-11-24): a finished normal video gets the job-application form (+ example sound) or the snow-leopard picture (no sound)
   fading in slowly behind the sim. Same recipe for every eligible concept. The recipe itself lives in Engine\Variants\apply_variant.py. */
import type { Video } from './types';
import type { AutoState, GenJob, PostScore } from './autopilot';

export type VariantId = 'job' | 'cat';
export const VARIANTS: { id: VariantId; label: string; sub: string }[] = [
  { id: 'job', label: 'Job form', sub: 'job-application form + example sound' },
  { id: 'cat', label: 'Leopard', sub: 'snow-leopard picture, no sound' },
];
export const VARIANT_LABEL: Record<string, string> = { job: 'Job form', cat: 'Leopard' };
/** Concepts that may get a variant (Mo's list: K1, K5, K6a, K7a, K7b, K8, K9, K10; K5 = all three K5 modes). Add a concept id here to allow it. */
export const VARIANT_CIDS = new Set(['K1', 'K5a', 'K5b', 'K5c', 'K6a', 'K7a', 'K7b', 'K8', 'K9', 'K10']);
export const variantOn = (au: AutoState, v: VariantId) => au.variants?.[v] !== false;   // both on by default

/** Which variant (or none) the next video of `cid` gets.
 *  1) the concept is hot and its hot post was a variant: same variant again (ride the momentum of that combination, not the raw concept)
 *  2) a variant this concept has not tried yet (posted, in stock or queued): test it once
 *  3) a variant whose posts beat the concept's plain posts clearly: every second video
 *  else none. */
export function pickVariant(cid: string, o: { au: AutoState; videos: Video[]; scores: PostScore[]; hotNum: number | null }): { variant?: VariantId; why?: string } {
  if (!VARIANT_CIDS.has(cid)) return {};
  const on = VARIANTS.map((v) => v.id).filter((v) => variantOn(o.au, v));
  if (!on.length) return {};
  const mine = o.videos.filter((v) => (v.cid ?? null) === cid || (v.cid == null && `K${v.konzept}` === cid));
  const varOf = new Map(mine.map((v) => [v.num, v.variant as VariantId | undefined] as const));
  const jobs = o.au.genJobs.filter((j: GenJob) => j.cid === cid && j.state !== 'error');
  if (o.hotNum != null) { const hv = varOf.get(o.hotNum); if (hv && on.includes(hv)) return { variant: hv, why: `${VARIANT_LABEL[hv]} variant: its post is the hot one` }; }
  const tried = new Set<string>([...mine.map((v) => v.variant).filter(Boolean) as string[], ...jobs.map((j) => j.variant).filter(Boolean) as string[]]);
  const fresh = on.find((v) => !tried.has(v));
  if (fresh) return { variant: fresh, why: `${VARIANT_LABEL[fresh]} variant: first test on ${cid}` };
  const judged = o.scores.filter((s) => s.cid === cid && s.num != null && s.ageH >= 12);
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const plain = med(judged.filter((s) => !varOf.get(s.num as number)).map((s) => s.views));
  let best: { v: VariantId; m: number } | null = null;
  for (const v of on) { const m = med(judged.filter((s) => varOf.get(s.num as number) === v).map((s) => s.views)); if (!isNaN(m) && (!best || m > best.m)) best = { v, m }; }
  if (best && (isNaN(plain) || best.m >= plain * 1.3)) {
    const last = [...mine].sort((a, b) => b.num - a.num)[0];
    if (!last || !last.variant) return { variant: best.v, why: `${VARIANT_LABEL[best.v]} variant: beats the plain ${cid} posts` };
  }
  return {};
}
