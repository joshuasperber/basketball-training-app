create table if not exists public.user_progress (
  email text primary key,
  sessions jsonb not null default '{"workoutSessions":[],"exerciseHistory":{}}'::jsonb,
  daily_plan_map jsonb not null default '{}'::jsonb,
  manual_day_workouts_map jsonb not null default '{}'::jsonb,
  manual_day_disabled_map jsonb not null default '{}'::jsonb,
  hidden_auto_workouts_map jsonb not null default '{}'::jsonb,
  profile_cache text,
  xp_history text,
  xp_progression text,
  performance_tips text,
  game_stats text,
  training_goals text,
  updated_at timestamptz not null default now()
);

-- Multi-User light: user_id (auth.uid) als bevorzugter Lookup-Key.
-- Email bleibt als Legacy-Fallback erhalten.
alter table public.user_progress
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists user_progress_user_id_uidx on public.user_progress(user_id);

create or replace function public.set_updated_at_user_progress()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_user_progress on public.user_progress;
create trigger trg_set_updated_at_user_progress
before update on public.user_progress
for each row
execute function public.set_updated_at_user_progress();

-- Row Level Security: jeder User sieht/schreibt nur seine eigene Zeile.
alter table public.user_progress enable row level security;

drop policy if exists user_progress_select_own on public.user_progress;
create policy user_progress_select_own
  on public.user_progress
  for select
  using (
    user_id = auth.uid()
    or (user_id is null and email = lower((auth.jwt() ->> 'email')))
  );

drop policy if exists user_progress_insert_own on public.user_progress;
create policy user_progress_insert_own
  on public.user_progress
  for insert
  with check (
    user_id = auth.uid()
    or (user_id is null and email = lower((auth.jwt() ->> 'email')))
  );

drop policy if exists user_progress_update_own on public.user_progress;
create policy user_progress_update_own
  on public.user_progress
  for update
  using (
    user_id = auth.uid()
    or (user_id is null and email = lower((auth.jwt() ->> 'email')))
  )
  with check (
    user_id = auth.uid()
    or (user_id is null and email = lower((auth.jwt() ->> 'email')))
  );

-- Bestehende Datenbanken ohne Spalten – manuell ausführen falls noch nicht migriert:
-- alter table public.user_progress add column if not exists game_stats text;
-- alter table public.user_progress add column if not exists training_goals text;
-- alter table public.user_progress add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- update public.user_progress p set user_id = u.id from auth.users u where p.user_id is null and lower(u.email) = p.email;
