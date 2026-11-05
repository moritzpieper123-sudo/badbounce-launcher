import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_URL, CLOUD_KEY } from './config';
import type { AppState, RenderStatus } from '../types';

export const cloudConfigured = !!(CLOUD_URL && CLOUD_KEY);
export const sb: SupabaseClient | null = cloudConfigured
  ? createClient(CLOUD_URL, CLOUD_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bb-auth' } })
  : null;

/** Video info as the phone sees it (no local paths, files live in storage). */
export interface CloudVideo {
  num: number; konzept: number | null; title: string;
  hasVideo: boolean; hasThumb: boolean; hasDesc: boolean;
  description?: string; durationSec?: number | null; createdMs: number;
  videoPath?: string; thumbPath?: string;
}
export interface CloudRow { user_id: string; state: AppState | Record<string, never>; videos: CloudVideo[]; render: RenderStatus | null; updated_at: string; updated_by: string | null; }

export async function session(): Promise<Session | null> {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function signIn(email: string, password: string) {
  if (!sb) throw new Error('Cloud is not set up');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signOut() { await sb?.auth.signOut(); }
export function onAuth(cb: (s: Session | null) => void) {
  if (!sb) return () => undefined;
  const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s));
  return () => data.subscription.unsubscribe();
}
export async function pullRow(): Promise<CloudRow | null> {
  const s = await session(); if (!sb || !s) return null;
  const { data, error } = await sb.from('launcher').select('*').eq('user_id', s.user.id).maybeSingle();
  if (error) throw error;
  return data as CloudRow | null;
}
export async function pushRow(patch: Partial<Omit<CloudRow, 'user_id'>>, by: 'pc' | 'phone') {
  const s = await session(); if (!sb || !s) return null;
  const updated_at = new Date().toISOString();
  const { error } = await sb.from('launcher').upsert({ user_id: s.user.id, ...patch, updated_at, updated_by: by });
  if (error) throw error;
  return updated_at;
}
export function subscribeRow(cb: (row: CloudRow) => void) {
  if (!sb) return () => undefined;
  const ch = sb.channel('launcher-row').on('postgres_changes', { event: '*', schema: 'public', table: 'launcher' }, (p) => { if (p.new && 'user_id' in p.new) cb(p.new as CloudRow); }).subscribe();
  return () => { sb.removeChannel(ch); };
}
export async function uid() { return (await session())?.user.id ?? null; }
