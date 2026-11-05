/* PC side of the phone sync. Runs in the main launcher window (Windows app only).
   - pushes state + video list to Supabase when they change
   - takes over state changes made on the phone
   - uploads ready, not yet posted videos (+ thumbnails) so the phone can save them
   - pulls reference videos added on the phone into Ideas/files */
import { bb } from '../bridge';
import { isReady } from '../logic';
import type { AppState, Snapshot } from '../types';
import { sb, pullRow, pushRow, subscribeRow, uid, type CloudVideo } from './client';

const LS = 'bb-sync';
interface Mem { lastAt?: string; files: Record<string, string> } // files: storage path -> local file signature
const mem = (): Mem => { try { return { files: {}, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { files: {} }; } };
const save = (m: Mem) => { try { localStorage.setItem(LS, JSON.stringify(m)); } catch { /* ignore */ } };

const MAX_CLOUD_VIDEOS = 14;  // stays far below the free 1 GB
let lastPushed = '';
let busy = false;
let status = 'Not connected';
const listeners = new Set<(s: string) => void>();
const setStatus = (s: string) => { status = s; listeners.forEach((l) => l(s)); };
export const syncStatus = () => status;
export const onSyncStatus = (cb: (s: string) => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

function cloudVideos(snap: Snapshot, m: Mem, id: string): CloudVideo[] {
  return snap.videos.map((v) => {
    const vp = `${id}/v/${v.num}/video.mp4`, tp = `${id}/v/${v.num}/thumb.png`;
    return { num: v.num, konzept: v.konzept, title: v.title, hasVideo: v.hasVideo, hasThumb: v.hasThumb, hasDesc: v.hasDesc, description: v.description, durationSec: v.durationSec, createdMs: v.createdMs,
      videoPath: m.files[vp] ? vp : undefined, thumbPath: m.files[tp] ? tp : undefined };
  });
}
const strip = (st: AppState): AppState => ({ ...st, alertsSeen: {} }); // island bookkeeping stays on the PC

async function uploadFiles(snap: Snapshot, m: Mem, id: string) {
  if (!sb) return false;
  let changed = false;
  const wanted = snap.videos.filter((v) => isReady(v) && !snap.state.uploads[String(v.num)]).sort((a, b) => a.num - b.num).slice(0, MAX_CLOUD_VIDEOS);
  const keep = new Set<string>();
  for (const v of wanted) {
    for (const [file, name] of [[v.videoFile, 'video.mp4'], [v.thumbFile, 'thumb.png']] as const) {
      if (!file) continue;
      const p = `${id}/v/${v.num}/${name}`; keep.add(p);
      const sig = `${file}|${v.createdMs}`;
      if (m.files[p] === sig) continue;
      setStatus(`Uploading #${v.num} for the phone…`);
      const blob = await (await fetch(bb.fileUrl(file))).blob();
      const { error } = await sb.storage.from('videos').upload(p, blob, { upsert: true, contentType: name.endsWith('mp4') ? 'video/mp4' : 'image/png' });
      if (error) throw error;
      m.files[p] = sig; changed = true; save(m);
    }
  }
  const old = Object.keys(m.files).filter((p) => !keep.has(p));
  if (old.length) { await sb.storage.from('videos').remove(old); for (const p of old) delete m.files[p]; save(m); changed = true; }
  return changed;
}

async function pullIdeaFiles(st: AppState, id: string): Promise<AppState | null> {
  if (!sb) return null;
  const todo = st.ideas.filter((i) => i.file?.startsWith('cloud:'));
  if (!todo.length) return null;
  const ideas = [...st.ideas];
  for (const i of todo) {
    const name = i.file!.slice(6), p = `${id}/ideas/${name}`;
    const { data, error } = await sb.storage.from('videos').download(p);
    if (error || !data) continue;
    const local = await bb.saveIdeaFile(name.replace(/^\d+-/, ''), await data.arrayBuffer());
    await sb.storage.from('videos').remove([p]);
    const k = ideas.findIndex((x) => x.id === i.id); ideas[k] = { ...i, file: local };
  }
  return { ...st, ideas };
}

/** Call with every new snapshot. `apply` saves a state into the local launcher. */
export async function syncTick(snap: Snapshot, apply: (st: AppState) => Promise<void>) {
  if (busy || !sb) return;
  const id = await uid(); if (!id) { setStatus('Not signed in'); return; }
  busy = true;
  try {
    const m = mem();
    if (!lastPushed) {
      // first run this session: take the phone's changes if they are newer than our last push
      const row = await pullRow();
      if (row && row.updated_by === 'phone' && 'version' in row.state && (!m.lastAt || row.updated_at > m.lastAt)) {
        await apply({ ...(row.state as AppState), alertsSeen: snap.state.alertsSeen });
        m.lastAt = row.updated_at; save(m); lastPushed = 'x'; return;
      }
    }
    const pulled = await pullIdeaFiles(snap.state, id);
    if (pulled) { await apply(pulled); return; }
    const filesChanged = await uploadFiles(snap, m, id);
    const payload = { state: strip(snap.state), videos: cloudVideos(snap, m, id), render: snap.render, mail: snap.mail ?? null };
    const key = JSON.stringify(payload);
    if (key !== lastPushed || filesChanged) {
      m.lastAt = (await pushRow(payload, 'pc')) ?? m.lastAt; save(m); lastPushed = key;
    }
    setStatus(`Synced ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (e) {
    setStatus('Sync error: ' + (e instanceof Error ? e.message : String(e)));
  } finally { busy = false; }
}

/** Phone edits arrive live. */
export function listenPhone(getSnap: () => Snapshot | null, apply: (st: AppState) => Promise<void>) {
  return subscribeRow(async (row) => {
    const m = mem();
    if (row.updated_by !== 'phone' || !('version' in row.state)) return;
    if (m.lastAt && row.updated_at <= m.lastAt) return;
    const cur = getSnap();
    await apply({ ...(row.state as AppState), alertsSeen: cur?.state.alertsSeen ?? {} });
    m.lastAt = row.updated_at; save(m);
    lastPushed = ''; // force a fresh compare
    setStatus(`Phone change received ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
  });
}
