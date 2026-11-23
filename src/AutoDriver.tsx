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

  const alert = (a: { id: string; kind: 'stats' | 'upload' | 'gen' | 'stock' | 'studio' | 'hot' | 'info'; title: string; sub: string }) =>
    upd.current((st) => patch(st, (au) => ({ ...au, alerts: raise(au.alerts, a).alerts })));
  const clear = (id: string) => {
    if (!autoOf(ref.current.state).alerts.some((x) => x.id === id && !x.resolved)) return;
    upd.current((st) => patch(st, (au) => ({ ...au, alerts: resolve(au.alerts, id).alerts })));
  };

  // ---- events: data pull, upload, render -> alerts
  useEffect(() => bb.onStatsPosts?.((r) => {
    clear('stats');
    const h = r.health;
    if (!h) return;
    if (h.studio === 'login') alert({ id: 'studio-login', kind: 'studio', title: 'TikTok Studio login needed', sub: 'Watch time and retention cannot be read until you log in once (Analytics > fetch, or Settings).' });
    else clear('studio-login');
    if (h.studio === 'changed') alert({ id: 'studio-changed', kind: 'studio', title: 'TikTok Studio changed its data format', sub: `${h.probed} video pages answered, none in the format the launcher reads. Views still work; retention and watch time are missing. Tell Claude: "Studio format changed", raw answers are in launcher-data\\stats-debug.` });
    else if (h.studio === 'ok') clear('studio-changed');
  }), []);
  useEffect(() => bb.onStatsStatus?.((st) => {
    if (st.state === 'error') alert({ id: 'stats', kind: 'stats', title: 'Data pull failed', sub: st.msg });
  }), []);
  useEffect(() => bb.onUploadStatus?.((st) => {
    if (st.state === 'error' && st.mode === 'schedule') alert({ id: 'upload', kind: 'upload', title: `Upload failed${st.key ? ` (#${st.key})` : ''}`, sub: `${st.msg ?? ''} · screenshot in Engine\\Upload\\upload_logs. TikTok Studio probably changed, or the login ran out (run: py bb_upload.py --login).` });
    if (st.state === 'ok' && st.mode === 'schedule') { clear('upload'); clear('stock-slot'); }
  }), []);
  useEffect(() => bb.onGenStatus?.((st) => {
    if (st.state === 'running') { genRunning.current = true; return; }
    genRunning.current = false;
    if (st.state !== 'done' && st.state !== 'error') return;
    upd.current((s0) => patch(s0, (au) => ({ ...au, genJobs: au.genJobs.map((j) => (j.num === st.num && j.state === 'running' ? { ...j, state: st.state === 'done' ? 'done' : 'error', msg: st.msg } : j)) })));
    if (st.state === 'error') alert({ id: `gen-${st.cid}`, kind: 'gen', title: `Rendering ${st.cid} failed`, sub: st.msg ?? '' });
    else clear(`gen-${st.cid}`);
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
        genRunning.current = gs?.state === 'running';
        const d = decide(s, now, { uploadBusy: up?.state === 'running', canGen: !!bb.genStart, canUpload: !!bb.autoUploadBatch, genReady: ready });

        // 1. announce new viral videos (once)
        const seen = au.hotSeen ?? {}; const fresh = d.scores.filter((x) => x.status === 'hot' && !seen[x.link]);
        if (fresh.length) {
          await upd.current((st) => patch(st, (a) => ({ ...a, hotSeen: { ...(a.hotSeen ?? {}), ...Object.fromEntries(fresh.map((x) => [x.link, new Date().toISOString()])) } })));
          for (const x of fresh) await alert({ id: `hot-${x.link}`, kind: 'hot', title: `Going viral: ${x.cid ?? 'video'}${x.num != null ? ` #${vn(x.num)}` : ''}`, sub: `score ${x.score}${x.ratio != null ? `, ${x.ratio.toFixed(1)}x the usual views` : ''}. The next slots go to ${x.cid ?? 'it'}.` });
        }
        // 2. reset a render job that was running when the launcher closed
        if (gs?.state !== 'running' && au.genJobs.some((j) => j.state === 'running')) await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: a.genJobs.map((j) => (j.state === 'running' ? { ...j, state: 'queued' as const } : j)) })));
        // 3. queue renders the plan needs
        if (d.enqueue.length) {
          const maxNum = Math.max(0, ...s.videos.map((v) => Math.floor(v.num)), ...au.genJobs.map((j) => j.num));
          const jobs: GenJob[] = d.enqueue.map((e, i) => ({ id: `${Date.now()}-${i}`, cid: e.cid, num: maxNum + 1 + i, state: 'queued', at: new Date().toISOString(), reason: e.reason }));
          await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: [...a.genJobs, ...jobs].slice(-40) })));
        }
        // 4. start the next queued render (one at a time)
        const next = au.genJobs.find((j) => j.state === 'queued');
        if (next && gs?.state !== 'running' && !genRunning.current) {
          const r = await bb.genStart!({ cid: next.cid, num: next.num });
          if (r.ok) await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: a.genJobs.map((j) => (j.id === next.id ? { ...j, state: 'running' as const } : j)) })));
          else { await upd.current((st) => patch(st, (a) => ({ ...a, genJobs: a.genJobs.map((j) => (j.id === next.id ? { ...j, state: 'error' as const, msg: r.error } : j)) }))); await alert({ id: `gen-${next.cid}`, kind: 'gen', title: `Cannot render ${next.cid}`, sub: r.error ?? '' }); }
        }
        // 5. concepts that need Claude (hot or winning, no automatic recipe)
        for (const c of d.claude) await alert({ id: `claude-${c.cid}`, kind: 'stock', title: `${c.cid} needs a Gen round with Claude`, sub: `${c.why}. Make ${c.need} more: Gen x${c.need} ${c.cid} (Control Room > copy).` });
        // 6. put the next video into TikTok (quiet Chrome, just in time)
        if (d.noVideo) await alert({ id: 'stock-slot', kind: 'stock', title: 'No approved video for the next slot', sub: `${new Date(d.noVideo.slotIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} has nothing approved. ${d.noVideo.waiting} video${d.noVideo.waiting === 1 ? '' : 's'} wait for your review in the Control Room.` });
        if (d.schedule) {
          const key = d.schedule.slotIso, t = tries.current[key];
          if (!t || (t.n < 2 && Date.now() - t.at > 5 * 60e3)) {
            tries.current[key] = { n: (t?.n ?? 0) + 1, at: Date.now() };
            await bb.autoUploadBatch!([{ num: d.schedule.num, slotIso: d.schedule.slotIso }], 'schedule', true);
          } else if (t.n >= 2) await alert({ id: 'upload-giveup', kind: 'upload', title: `Gave up on the ${new Date(key).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} slot`, sub: 'Two tries failed. Post it by hand or fix the upload (see the alert above).' });
        }
      } catch (e) { console.error('autopilot tick', e); }
      finally { busy.current = false; }
    };
    const t0 = setTimeout(tick, 8000), t = setInterval(tick, 60e3);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  return null;
}
