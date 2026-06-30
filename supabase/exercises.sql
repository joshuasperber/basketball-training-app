-- Legacy-Übungstabelle (Create-Exercise / ältere Komponenten)
-- Nach profiles.sql ausführen

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  subcategory text,
  metric_keys text[] default '{}',
  created_at timestamptz not null default now()
);

alter table public.exercises add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.exercises add column if not exists subcategory text;
alter table public.exercises add column if not exists metric_keys text[] default '{}';
alter table public.exercises add column if not exists created_at timestamptz not null default now();

create index if not exists exercises_user_id_idx on public.exercises(user_id) where user_id is not null;

alter table public.exercises enable row level security;

drop policy if exists exercises_select_own on public.exercises;
drop policy if exists exercises_select_authenticated on public.exercises;
create policy exercises_select_authenticated
  on public.exercises for select
  to authenticated
  using (true);

drop policy if exists exercises_insert_own on public.exercises;
drop policy if exists exercises_insert_authenticated on public.exercises;
create policy exercises_insert_authenticated
  on public.exercises for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists exercises_update_own on public.exercises;
drop policy if exists exercises_update_authenticated on public.exercises;
create policy exercises_update_authenticated
  on public.exercises for update
  to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

drop policy if exists exercises_delete_own on public.exercises;
drop policy if exists exercises_delete_authenticated on public.exercises;
create policy exercises_delete_authenticated
  on public.exercises for delete
  to authenticated
  using (user_id is null or user_id = auth.uid());
