-- profiles + exercises tables with RLS (versioned copy of supabase/profiles.sql + exercises.sql)

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

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  subcategory text,
  metric_keys text[] default '{}',
  created_at timestamptz not null default now()
);

-- Legacy: Tabelle kann ohne user_id existieren (tracking_type, default_duration_min, …)
alter table public.exercises add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.exercises add column if not exists subcategory text;
alter table public.exercises add column if not exists metric_keys text[] default '{}';
alter table public.exercises add column if not exists created_at timestamptz not null default now();

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
