import { cloudConfigured } from './cloud/client';
import { webBridge } from './cloud/webBridge';
import type { AppState, MailBody, Snapshot, Video } from './types';
import { DEFAULT_SETTINGS } from './types';

export interface BB {
  getSnapshot(): Promise<Snapshot>;
  saveState(state: AppState): Promise<void>;
  onChange(cb: () => void): () => void;
  uploadPack(num: number): Promise<{ ok: boolean; folder?: string; error?: string }>;
  copyText(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  openPath(p: string): Promise<void>;
  openVault(sub?: string): Promise<void>;
  saveIdeaFile(name: string, data: ArrayBuffer): Promise<string>;
  backupNow(): Promise<string>;
  runGen(n: number): Promise<void>;
  setAutostart(on: boolean): Promise<void>;
  setVault?(p: string): Promise<void>;
  fileUrl(p: string): string;
  islandHover(on: boolean): void;
  islandSize(mode: 'pill' | 'alert' | 'open'): void;
  showMain(page?: string): void;
  onNavigate(cb: (page: string) => void): () => void;
  onIslandToast(cb: (msg: { title: string; sub: string }) => void): () => void;
  islandToast(title: string, sub: string): void;
  mailConnect?(clientId: string, secret: string): Promise<{ ok: boolean; email?: string; error?: string }>;
  mailDisconnect?(): Promise<void>;
  mailRefresh?(): Promise<void>;
  mailBody?(id: string): Promise<MailBody>;
}

declare global { interface Window { bb?: BB } }

/* Browser fallback (for previews): demo data in localStorage. */
function demoSnapshot(): Snapshot {
  const now = new Date();
  const mk = (num: number, k: number, ready = true): Video => ({ num, folder: `/demo/Results/#${num}`, konzept: k, title: `Demo video #${num}`, hasVideo: ready, hasThumb: ready, hasDesc: ready, description: `Demo description for #${num}\n#satisfying #physics`, durationSec: 30 + num, createdMs: now.getTime() - (30 - num) * 3600000 });
  let state: AppState | null = null;
  try { const raw = localStorage.getItem('bb-demo-state'); if (raw) state = JSON.parse(raw); } catch { /* ignore */ }
  if (!state) state = { version: 1, uploads: {}, notes: {}, tasks: [], autoCols: {}, ideas: [], stats: { days: [], posts: [] }, milestonesSeen: [], alertsSeen: {}, settings: { ...DEFAULT_SETTINGS } };
  return { vaultPath: 'C:\\Users\\Morit\\OneDrive\\Badbounce', vaultOk: true, videos: [mk(1, 1), mk(2, 2), mk(3, 4), mk(4, 5), mk(5, 6), mk(6, 3), mk(7, 1, false)], state, render: null, mail: { connected: true, email: 'demo@gmail.com', unread: 2, updated: now.toISOString(), error: null, items: [
    { id: 'm1', threadId: 'm1', from: 'TikTok', subject: 'Your video is trending', snippet: 'Congrats! Your video reached 10K views in the last 24 hours…', date: new Date(now.getTime() - 8 * 60e3).toISOString(), unread: true },
    { id: 'm2', threadId: 'm2', from: 'Brand Partner GmbH', subject: 'Collaboration request for Badbounce', snippet: 'Hi Mo, we love your physics simulations and would like to…', date: new Date(now.getTime() - 3 * 3600e3).toISOString(), unread: true },
    { id: 'm3', threadId: 'm3', from: 'Google', subject: 'Security alert', snippet: 'A new sign-in on Windows…', date: new Date(now.getTime() - 30 * 3600e3).toISOString(), unread: false }] }, fullscreen: false, now: now.toISOString() };
}
const listeners = new Set<() => void>();
const fallback: BB = {
  async getSnapshot() { return demoSnapshot(); },
  async mailBody(id) { const it = demoSnapshot().mail?.items.find((x) => x.id === id); return { ok: true, id, from: `${it?.from} <hello@example.com>`, to: 'demo@gmail.com', subject: it?.subject ?? '', date: it?.date ?? '', files: ['stats.pdf'], html: `<div style="font-family:Arial;max-width:560px;margin:auto"><h2 style="color:#111">${it?.subject}</h2><p>${it?.snippet}</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante.</p><p><a href="https://example.com">Open the details</a></p><p>Best,<br>The team</p></div>` }; },
  async saveState(s) { try { localStorage.setItem('bb-demo-state', JSON.stringify(s)); } catch { /* ignore */ } listeners.forEach((l) => l()); },
  onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  async uploadPack() { return { ok: true, folder: 'Downloads\\Badbounce upload' }; },
  async copyText(t) { try { await navigator.clipboard.writeText(t); } catch { /* ignore */ } },
  async openUrl(u) { window.open(u, '_blank'); },
  async openPath() { /* no-op */ },
  async openVault() { /* no-op */ },
  async saveIdeaFile(name) { return name; },
  async backupNow() { return 'demo-backup.json'; },
  async runGen() { /* no-op */ },
  async setAutostart() { /* no-op */ },
  fileUrl() { return ''; },
  islandHover() { /* no-op */ },
  islandSize() { /* no-op */ },
  showMain() { /* no-op */ },
  onNavigate() { return () => undefined; },
  onIslandToast() { return () => undefined; },
  islandToast() { /* no-op */ },
};
/** true inside the Windows app (vault, island, folders); false on phone / iPad */
export const isDesktop = !!window.bb;
export const bb: BB = window.bb ?? (cloudConfigured ? webBridge : fallback);
