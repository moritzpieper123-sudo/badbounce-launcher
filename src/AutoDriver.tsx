/* The autopilot runner: invisible component, lives as long as the launcher (also hidden in the tray).
   Every minute it asks decide() what to do, and listens to stats / upload / render events to raise or clear alerts. */
import { useEffect, useRef } from 'react';
import { bb, isDesktop } from './bridge';
import type { AppState, Snapshot } from './types';
import { autoOf, raise, resolve, type AutoState, type GenJob } from './autopilot';
import { decide } from './autoDecide';
import { vn } from './logic';

type Update = (fn: (st: AppState) => AppState) => Promise<void>;
const patch = (st: AppState, f: (a: AutoState) => AutoState): AppState => ({ ...st, auto: f(autoOf(st)) });

export function AutoDriver({ snap, update }: { snap: Snapshot; update: Update }) {
  const ref = useRef(snap); ref.current = snap;
  const upd = useRef(update); upd.current = update;
  const busy = useRef(false);
  const tries = useRef<Record<string, { n: number; at: number }>>({});
  const genRunning = useRef(false);
  const fails = useRef({ stats: 0, studio: 0, slots: 0 });     // consecutive failures: one-off hiccups heal themselves silently
  const skip = useRef(new Set<string>());                      // slots given up on
  const limitUntil = useRef(0);                                // Claude usage limit: no new render before this time

  const alert = (a: { id: string; kind: 'stats' | 'upload' | 'gen' | 'stock' | 'studio' | 'hot' | 'info'; title: string; sub: string }) =>
    upd.current((st) => patch(st, (au) => ({ ...au, alerts: raise(au.alerts, a).alerts })));
  const clear = (id: string) => {
    if (!autoOf(ref.current.state).alerts.some((x) => x.id === id && !x.resolved)) return;
    upd.current((st) => patch(st, (au) => ({ ...au, alerts: resolve(au.alerts, id).alerts })));
  };

  // ---- events: data pull, upload, render -> alerts
  useEffect(() => bb.onStatsPosts?.((r) => {
    clear('stats'); fails.current.stats = 0;
    const h = r.health;
    if (!h) return;
    fails.current.studio = h.studio === 'login' ? fails.current.studio + 1 : 0;
    if (h.studio === 'login' && fails.current.studio >= 2) alert({ id: 'studio-login', kind: 'studio', title: 'TikTok Studio login needed', sub: 'Watch time and retention cannot be read until you log in once (Analytics > fetch, or Settings).' });
    else clear('studio-login');
    if (h.studio === 'changed') alert({ id: 'studio-changed', kind: 'studio', title: 'TikTok Studio changed its data format', sub: `${h.probed} video pages answered, none in the format the launcher reads. Views still work; retention and watch time are missing. Tell Claude: "Studio format changed", raw answers are in launcher-data\\stats-debug.` });
    else if (h.studio === 'ok') clear('studio-changed');
  }), []);
  useEffect(() => bb.onStatsStatus?.((st) => {
    if (st.state === 'error' && ++fails.current.stats >= 3) alert({ id: 'stats', kind: 'stats', title: 'Data pull keeps failing', sub: `${fails.current.stats} pulls in a row failed (the launcher retries by itself). Last message: ${st.msg}` });
  }), []);
  useEffect(() => bb.onUploadStatus?.((st) => {
    if (st.state === 'error' && st.mode === 'schedule') {
      if (/not logged in|login/i.test(st.msg ?? '')) alert({ id: 'upload-login', kind: 'upload', title: 'TikTok upload login ran out', sub: 'Open cmd, go to Badbounce\\Engine\\Upload and run:  py bb_upload.py --login  , log in once, close Chrome. Scheduling continues by itself afterwards.' });
      else if (!autoOf(ref.current.state).enabled) alert({ id: 'upload', kind: 'upload', title: `Upload failed${st.key ? ` (#${st.key})` : ''}`, sub: st.msg ?? '' });   // with the autopilot on, the driver retries and only reports what it cannot fix
    }
    if (st.state === 'ok' && st.mode === 'schedule') { clear('upload'); clear('upload-giveup'); clear('upload-login'); clear('stock-slot'); fails.current.slots = 0; }
  }), []);
  useEffect(() => bb.onGenStatus?.((st) => {
    if (st.state === 'running') { genRunning.current = true; return; }
    genRunning.current = false;
    if (st.state !== 'done' && st.state !== 'error') return;
    upd.current((s0) => patch(s0, (au) => ({ ...au, genJobs: au.genJobs.map((j) => (j.num === st.num && j.state === 'running' ? { ...j, state: st.state === 'done' ? 'done' : 'error', msg: st.msg, endedAt: new Date().toISOString() } : j)) })));
    if (st.state === 'error' && /usage limit|limit reached|rate limit|quota|try again (later|at)/i.test(st.msg ?? '')) limitUntil.current = Date.now() + 60 * 60e3;   // wait it out, no alert: the planner retries after the limit resets
    else if (st.state === 'error' && /not logged in|\/login/i.test(st.msg ?? '')) alert({ id: 'claude-login', kind: 'gen', title: 'Claude is not signed in on this PC', sub: 'Open cmd, type  claude  , press Enter, then type  /login  and sign in once. After that the autopilot renders by itself.' });
    else if (st.state === 'error' && /could not start (claude|python)/i.test(st.msg ?? '')) alert({ id: 'gen-missing', kind: 'gen', title: 'Claude or Python cannot be started', sub: st.msg ?? '' });
    else if (st.state === 'done') { clear('claude-login'); clear('gen-missing'); clear('gen-paused'); limitUntil.current = 0; }
  }), []);

  // ---- the minute tick
  useEffect(() => {
    if (!isDesktop || !bb.genStart) return;
    const tick = async () => {
      if (busy.current) return; busy.current = true;
      try {
        const s = ref.current, au = autoOf(s.state); if (!au.enabled) return;
        const now = new Date();
        const up = await bb.uploadStatus?.(); const gs = await bb.genStatus?.(); const ready = new Set(await (bb.genReady?.() ?? Promise.resolve([] as string[])));
        const via = au.producer === 'launcher' ? undefined : 'claude' as const;
        genRunning.current = gs?.state === 'running';
        const d = decide(s, now, { uploadBusy: up?.state === 'running', canGen: !!bb.genStart, canUpload: !!bb.autoUploadBatch, genReady: ready, skip: skip.current });

        // 1. announce new viral videos (once)
        const seen = au.hotSeen ?? {}; const fresh = d.scores.filter((x) => x.status === 'hot' && !seen[x.link]);
        if (fresh.length) {
          await upd.current((st) => patch(st, (a) => ({ ...a, hotSeen: { ...(a.hotSeen ?? {}), ...Object.fromEntries(fresh.map((x) => [x.link, new Date().toISOString()])) } })));
          for (const x of fresh) await alert({ id: `hot-${x.link}`, kind: 'hot', title: `Going viral: ${x.cid ?? 'video'}${x.num != null ? ` #${vn(x.num)}` : ''}`, sub: `score ${x.score}${x.ratio != null ? `, ${x.ratio.toFixed(1)}x the usual views` : ''}. The next slots go to ${x.cid ?? 'it'}.` });
        }
        if (d.paused) await alert({ id: 'gen-paused', kind: 'gen', title: 'Rendering paused after repeated failures', sub: `${d.paused}. Nothing new is queued. Fix the cause (see the alerts), then press "Clear finished" in the Control Room to try again.` });
        else clear('gen-paused');
        // 2. reset a render job that was running when the launcher closed
        if (gs?.state !== 'running' && au.genJobs.some((j) => j.state === 'running')) await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: a.genJobs.map((j) => (j.state === 'running' ? { ...j, state: 'queued' as const } : j)) })));
        // 3. queue renders the plan needs
        if (d.enqueue.length) {
          const maxNum = Math.max(0, ...s.videos.map((v) => Math.floor(v.num)), ...au.genJobs.map((j) => j.num));
          const jobs: GenJob[] = d.enqueue.map((e, i) => ({ id: `${Date.now()}-${i}`, cid: e.cid, num: maxNum + 1 + i, state: 'queued', at: new Date().toISOString(), reason: e.reason, deadline: e.deadline }));
          await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: [...a.genJobs, ...jobs].slice(-40) })));
        }
        // 4. start the next queued render (one at a time)
        const next = [...au.genJobs].filter((j) => j.state === 'queued').sort((a, b) => Number(!!b.first) - Number(!!a.first) || Number(/follow-up/.test(b.reason)) - Number(/follow-up/.test(a.reason)) || (a.deadline ?? '9').localeCompare(b.deadline ?? '9') || a.num - b.num)[0];   // your pick first, then viral follow-ups (they lose value every hour), then the earliest deadline
        bb.genQueueWrite?.(au.genJobs.filter((j) => j.state === 'queued' || j.state === 'running'));
        if (next && gs?.state !== 'running' && !genRunning.current && Date.now() >= limitUntil.current) {
          const r = await bb.genStart!({ cid: next.cid, num: next.num, via, model: au.model ?? 'sonnet', reason: next.reason, deadline: next.deadline && new Date(new Date(next.deadline).getTime() + 75 * 60e3).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) });
          if (r.ok) await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: a.genJobs.map((j) => (j.id === next.id ? { ...j, state: 'running' as const } : j)) })));
          else await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: a.genJobs.map((j) => (j.id === next.id ? { ...j, state: 'error' as const, msg: r.error, endedAt: new Date().toISOString() } : j)) })));   // the planner queues a new job; repeated failures end in the pause alert
        }
        // 5. concepts that need Claude (hot or winning, no automatic recipe)
        for (const c of d.claude) await alert({ id: `claude-${c.cid}`, kind: 'stock', title: `${c.cid} needs a Gen round with Claude`, sub: `${c.why}. Make ${c.need} more: Gen x${c.need} ${c.cid} (Control Room > copy).` });
        // 6. put the next video into TikTok (quiet Chrome, just in time)
        if (!d.noVideo) clear('stock-slot');
        for (const x of autoOf(ref.current.state).alerts) if (!x.resolved && x.id.startsWith('claude-') && x.kind === 'stock' && !d.claude.some((c) => `claude-${c.cid}` === x.id)) clear(x.id);
        if (d.noVideo && (Date.parse(d.noVideo.slotIso) - Date.now() <= 22 * 60e3 || !au.genJobs.some((j) => j.state === 'queued' || j.state === 'running'))) await alert({ id: 'stock-slot', kind: 'stock', title: 'No approved video for the next slot', sub: `${new Date(d.noVideo.slotIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} has nothing approved. ${d.noVideo.waiting} video${d.noVideo.waiting === 1 ? '' : 's'} wait for your review in the Control Room.` });
        if (d.schedule) {
          const key = d.schedule.slotIso, t = tries.current[key];
          if (!t || (t.n < 4 && Date.now() - t.at > 4 * 60e3)) {
            tries.current[key] = { n: (t?.n ?? 0) + 1, at: Date.now() };
            const r = await bb.autoUploadBatch!([{ num: d.schedule.num, slotIso: d.schedule.slotIso }], 'schedule', true);
            if (r && !r.ok) { if (t) tries.current[key] = t; else delete tries.current[key]; }   // refused because another upload runs: that is not a failed try
          } else if (t.n >= 4 && !skip.current.has(key)) {
            skip.current.add(key); fails.current.slots++;                                         // this slot is lost: the video goes into the next free slot at the next tick
            if (fails.current.slots >= 2) await alert({ id: 'upload-giveup', kind: 'upload', title: 'Uploads keep failing', sub: `${fails.current.slots} slots in a row could not be filled after 4 tries each (the last one: ${new Date(key).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}). TikTok Studio probably changed or the login ran out. Post by hand and tell Claude.` });
          }
        }
      } catch (e) { console.error('autopilot tick', e); }
      finally { busy.current = false; }
    };
    const t0 = setTimeout(tick, 8000), t = setInterval(tick, 60e3);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  return null;
}
