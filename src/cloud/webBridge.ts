/* Bridge for the phone / iPad web app: data comes from Supabase instead of the PC. */
import type { BB } from '../bridge';
import type { AppState, Snapshot, Video } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { sb, pullRow, pushRow, subscribeRow, uid, type CloudVideo } from './client';

const emptyState = (): AppState => ({ version: 1, uploads: {}, notes: {}, tasks: [], autoCols: {}, ideas: [], stats: { days: [], posts: [] }, milestonesSeen: [], alertsSeen: {}, settings: { ...DEFAULT_SETTINGS } });
let lastVideos: CloudVideo[] = [];
const signed = new Map<string, { url: string; until: number }>();

async function signAll(paths: string[]) {
  const need = paths.filter((p) => { const s = signed.get(p); return !s || s.until < Date.now() + 5 * 60e3; });
  if (sb && need.length) {
    const { data } = await sb.storage.from('videos').createSignedUrls(need, 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) signed.set(d.path, { url: d.signedUrl, until: Date.now() + 3600e3 });
  }
}
const urlOf = (p?: string) => (p ? signed.get(p)?.url : undefined);

export interface ShareDetail { num: number; files: File[]; desc: string }

export const webBridge: BB = {
  async getSnapshot(): Promise<Snapshot> {
    const row = await pullRow();
    lastVideos = row?.videos ?? [];
    await signAll(lastVideos.map((v) => v.thumbPath).filter(Boolean) as string[]).catch(() => undefined);
    const videos: Video[] = lastVideos.map((v) => ({ ...v, folder: '', thumbFile: urlOf(v.thumbPath), videoFile: v.videoPath }));
    const st = row?.state && 'version' in row.state ? (row.state as AppState) : emptyState();
    st.settings = { ...DEFAULT_SETTINGS, ...st.settings };
    return { vaultPath: '', vaultOk: true, videos, state: st, render: row?.render ?? null, fullscreen: false, now: new Date().toISOString() };
  },
  async saveState(state) { await pushRow({ state }, 'phone'); },
  onChange(cb) { return subscribeRow(() => cb()); },
  async uploadPack(num) {
    const v = lastVideos.find((x) => x.num === num);
    if (!v) return { ok: false, error: 'video not found' };
    const desc = v.description ?? '';
    // copy right away, while the tap still counts (iOS rule)
    try { await navigator.clipboard.writeText(desc); } catch { /* sheet offers copy again */ }
    if (!v.videoPath) return { ok: false, error: 'the PC has not uploaded this video yet (keep the launcher open on the PC)' };
    await signAll([v.videoPath, v.thumbPath].filter(Boolean) as string[]);
    const files: File[] = [];
    const vu = urlOf(v.videoPath); if (vu) files.push(new File([await (await fetch(vu)).blob()], `Badbounce #${num}.mp4`, { type: 'video/mp4' }));
    const tu = urlOf(v.thumbPath); if (tu) files.push(new File([await (await fetch(tu)).blob()], `Thumbnail #${num}.png`, { type: 'image/png' }));
    window.dispatchEvent(new CustomEvent<ShareDetail>('bb-share', { detail: { num, files, desc } }));
    return { ok: true, folder: 'the share sheet' };
  },
  async copyText(t) { try { await navigator.clipboard.writeText(t); } catch { /* ignore */ } },
  async openUrl(u) { window.open(u, '_blank'); },
  async openPath() { /* PC only */ },
  async openVault() { /* PC only */ },
  async saveIdeaFile(name, data) {
    const id = await uid(); if (!sb || !id) throw new Error('not signed in');
    const safe = `${Date.now()}-${name.replace(/[^\w.\- ]+/g, '_')}`;
    const { error } = await sb.storage.from('videos').upload(`${id}/ideas/${safe}`, new Blob([data]), { upsert: true });
    if (error) throw error;
    return 'cloud:' + safe;
  },
  async backupNow() {
    const row = await pullRow();
    const blob = new Blob([JSON.stringify(row?.state ?? {}, null, 2)], { type: 'application/json' });
    const name = `badbounce-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    return name;
  },
  async runGen(n) { /* copy + open Claude */ try { await navigator.clipboard.writeText(n > 1 ? `Gen x${n}` : 'Gen'); } catch { /* ignore */ } },
  async setAutostart() { /* PC only */ },
  fileUrl(p) { return p; },
  islandHover() { /* PC only */ },
  islandSize() { /* PC only */ },
  showMain() { /* PC only */ },
  onNavigate() { return () => undefined; },
  onIslandToast() { return () => undefined; },
  islandToast() { /* PC only */ },
};
