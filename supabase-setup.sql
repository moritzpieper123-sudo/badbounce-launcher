-- Badbounce Launcher: one-time setup. Paste all of this into Supabase -> SQL Editor -> New query -> Run.

-- 1) one row per user with the whole launcher state + the list of videos from the PC
create table if not exists public.launcher (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  videos     jsonb not null default '[]'::jsonb,
  render     jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.launcher enable row level security;
drop policy if exists "own row" on public.launcher;
create policy "own row" on public.launcher for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- live updates between PC and phone
alter publication supabase_realtime add table public.launcher;

-- 2) private storage for ready videos + thumbnails (phone "Upload pack")
insert into storage.buckets (id, name, public) values ('videos', 'videos', false)
  on conflict (id) do nothing;
drop policy if exists "own files read" on storage.objects;
drop policy if exists "own files write" on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;
create policy "own files read"   on storage.objects for select using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write"  on storage.objects for insert with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
