/* Everything the home page and the screen saver show, computed in one place. */
import type { Snapshot, Video } from './types';
import type { LogEntry } from './autopilot';
import { autoOf, stockOf, CID_NAME } from './autopilot';
import { decide } from './autoDecide';
import { addDays, buildPlan, dayNumber, etaText, followerPace, hm, isReady, kpis, phaseLabel, rewardsEstimate, ymd } from './logic';

export interface HomeData {
  now: Date; dayNo: number; phase: string;
  enabled: boolean; autoApprove: boolean; headline: string; rendering: string | null; queued: number; paused: string | null;
  nextSlot: { time: string; when: Date; cid: string | null; name: string; why: string; actionAt: Date } | null;
  scheduled: number;
  errors: { title: string; sub: string }[];   // real failures only (red screen)
  pending: number; approved: number; problems: { title: string; sub: string }[];
  slots: { time: string; when: Date; state: string; num: number | null; auto: boolean }[];   // today and tomorrow
  hit: { label: string; views: number; ratio: number | null; score: number; ageH: number } | null;
  best: { cid: string; name: string; medianViews: number; status: string } | null;
  k: ReturnType<typeof kpis>;
  views14: number[]; followers14: number[];
  week: { label: string; v: number; today: boolean }[]; weekViews: boolean;
  queue: { v: Video; time: string; day: string }[];
  today: { made: number; uploaded: number; total: number };
  log: LogEntry[];
  followerEta: string; perDay: number | null;
  income: [number, number] | null;
}

export function homeData(snap: Snapshot, ready: Set<string>, gen: { state?: string; cid?: string; num?: number }): HomeData {
  const now = new Date(snap.now), st = snap.state, au = autoOf(st), stock = stockOf(snap);
  const dec = decide(snap, now, { uploadBusy: false, canGen: true, canUpload: true, genReady: ready });
  const problems = au.alerts.filter((a) => !a.resolved && a.kind !== 'hot').map((a) => ({ title: a.title, sub: a.sub }));
  const queued = au.genJobs.filter((j) => j.state === 'queued').length;
  const rendering = gen.state === 'running' ? `${gen.cid} #${gen.num}` : null;
  const ns = dec.slots.find((s) => s.when.getTime() > now.getTime() && !s.taken) ?? null;
  const row = ns ? dec.rows.find((r) => r.slotIso === ns.iso) ?? null : null;
  const lead = Math.max(20, au.leadMin ?? 40);
  const headline = !au.enabled ? 'Autopilot is off'
    : dec.paused ? `Paused: ${dec.paused}`
    : rendering ? `Rendering ${rendering}${queued ? ` · ${queued} queued` : ''}`
    : queued ? `${queued} render${queued > 1 ? 's' : ''} queued`
    : 'Idle, waiting for the next slot';
  const plan = buildPlan(snap, now, 2);
  const auto = new Set(Object.entries(st.uploads).filter(([, u]) => u.scheduled).map(([n]) => +n));
  const slots = plan.map((p) => ({ time: p.time, when: p.when, state: p.state, num: p.video ? p.video.num : null, auto: !!p.video && auto.has(p.video.num) }));
  const hotP = dec.scores.filter((s) => s.ageH <= 120).sort((a, b) => b.views - a.views)[0] ?? null;
  const bestC = [...dec.stats].filter((c) => c.posts > 0).sort((a, b) => b.medianViews - a.medianViews)[0] ?? null;
  const days = st.stats.days;
  const wk = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  const wv = wk.map((x) => days.find((y) => y.date === ymd(x))?.views ?? null);
  const weekViews = wv.some((v) => v != null);
  const upBy = wk.map((x) => Object.values(st.uploads).filter((u) => ymd(new Date(u.slot ?? u.at)) === ymd(x)).length);
  const week = wk.map((x, i) => ({ label: i === 6 ? 'Today' : x.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2), v: weekViews ? (wv[i] ?? 0) : upBy[i], today: i === 6 }));
  const p3 = buildPlan(snap, now, 3);
  const queue = p3.filter((x) => !x.uploaded && x.video && isReady(x.video)).slice(0, 5).map((x) => ({ v: x.video!, time: x.time, day: x.date === ymd(now) ? 'Today' : x.when.toLocaleDateString('en-GB', { weekday: 'short' }) }));
  const tp = plan.filter((x) => x.date === ymd(now));
  const kk = kpis(snap), pace = followerPace(snap), inc = rewardsEstimate(snap);
  return {
    week, weekViews, queue, log: (au.log ?? []).slice(-4).reverse(), perDay: pace.perDay,
    followerEta: kk.followers != null ? etaText(10000 - kk.followers, pace.perDay, now) : 'no follower number yet',
    income: inc ? inc.revenue : null,
    today: { made: tp.filter((x) => x.uploaded || (x.video && isReady(x.video))).length, uploaded: tp.filter((x) => x.uploaded).length, total: tp.length },
    now, dayNo: dayNumber(now, st.settings.day1), phase: phaseLabel(dayNumber(now, st.settings.day1), now),
    enabled: au.enabled, autoApprove: !!au.autoApprove, headline, rendering, queued, paused: dec.paused,
    nextSlot: ns ? { time: hm(ns.when), when: ns.when, cid: row?.cid ?? null, name: row ? CID_NAME[row.cid] : 'not planned yet', why: row?.reason ?? 'planning starts 3 h before the first slot of the day', actionAt: stock.approved.length || au.autoApprove && stock.pending.length ? now : new Date(ns.when.getTime() - lead * 60e3) } : null,
    scheduled: Object.values(st.uploads).filter((u) => u.scheduled && new Date(u.slot ?? u.at).getTime() > now.getTime()).length,
    errors: [...au.alerts.filter((a) => !a.resolved && ['stats', 'upload', 'gen', 'studio'].includes(a.kind)).map((a) => ({ title: a.title, sub: a.sub })), ...(dec.paused && !au.alerts.some((a) => a.id === 'gen-paused' && !a.resolved) ? [{ title: 'Rendering paused', sub: dec.paused }] : [])],
    pending: stock.pending.length, approved: stock.approved.length, problems, slots,
    hit: hotP ? { label: `${hotP.cid ?? 'Video'}${hotP.num != null ? ` #${hotP.num}` : ''}`, views: hotP.views, ratio: hotP.ratio, score: hotP.score, ageH: hotP.ageH } : null,
    best: bestC ? { cid: bestC.cid, name: bestC.name, medianViews: bestC.medianViews, status: bestC.status } : null,
    k: kpis(snap), views14: days.slice(-14).map((d) => d.views || 0), followers14: days.filter((d) => d.followers != null).slice(-14).map((d) => d.followers!),
  };
}
export const todayKey = (d: Date) => ymd(d);
