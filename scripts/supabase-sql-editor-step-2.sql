-- ============================================================
-- SUPABASE SQL EDITOR — Schritt 2 (nach Security-Hardening)
-- Kopieren, einfügen, Run (⌘↵). Kein "supabase db push" hier!
-- ============================================================

-- 2a) profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  favorite_position text,
  height_cm numeric,
  weight_kg numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles for delete using (id = auth.uid());

-- 2a) exercises — bestehende Legacy-Tabelle (ohne user_id) wird erweitert, nicht überschrieben
do $$
begin
  if to_regclass('public.exercises') is null then
    create table public.exercises (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade,
      name text not null,
      category text,
      subcategory text,
      metric_keys text[] default '{}',
      created_at timestamptz not null default now()
    );
  else
    alter table public.exercises add column if not exists user_id uuid references auth.users(id) on delete cascade;
    alter table public.exercises add column if not exists subcategory text;
    alter table public.exercises add column if not exists metric_keys text[] default '{}';
    alter table public.exercises add column if not exists created_at timestamptz not null default now();
  end if;
end $$;

create index if not exists exercises_user_id_idx on public.exercises(user_id) where user_id is not null;

alter table public.exercises enable row level security;

drop policy if exists exercises_select_own on public.exercises;
drop policy if exists exercises_select_authenticated on public.exercises;
create policy exercises_select_authenticated on public.exercises for select to authenticated using (true);

drop policy if exists exercises_insert_own on public.exercises;
drop policy if exists exercises_insert_authenticated on public.exercises;
create policy exercises_insert_authenticated on public.exercises for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists exercises_update_own on public.exercises;
drop policy if exists exercises_update_authenticated on public.exercises;
create policy exercises_update_authenticated on public.exercises for update to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

drop policy if exists exercises_delete_own on public.exercises;
drop policy if exists exercises_delete_authenticated on public.exercises;
create policy exercises_delete_authenticated on public.exercises for delete to authenticated
  using (user_id is null or user_id = auth.uid());

-- 2b) Liga-Spalte + Storage game-photos
alter table public.user_progress add column if not exists league_data text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-photos', 'game-photos', false, 5242880, array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public;

drop policy if exists game_photos_select_own on storage.objects;
create policy game_photos_select_own on storage.objects for select
  using (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists game_photos_insert_own on storage.objects;
create policy game_photos_insert_own on storage.objects for insert
  with check (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists game_photos_update_own on storage.objects;
create policy game_photos_update_own on storage.objects for update
  using (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists game_photos_delete_own on storage.objects;
create policy game_photos_delete_own on storage.objects for delete
  using (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);
