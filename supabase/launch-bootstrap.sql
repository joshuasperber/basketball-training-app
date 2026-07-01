-- =============================================================================
-- Launch Bootstrap — einmal im Supabase SQL Editor ausführen (Dev + Prod)
-- Prüfen danach lokal: npm run verify:supabase
-- =============================================================================

-- ── 1) user_progress (Cloud-Sync) ───────────────────────────────────────────

create table if not exists public.user_progress (
  email text primary key,
  sessions jsonb not null default '{"workoutSessions":[],"exerciseHistory":{}}'::jsonb,
  daily_plan_map jsonb not null default '{}'::jsonb,
  manual_day_workouts_map jsonb not null default '{}'::jsonb,
  manual_day_disabled_map jsonb not null default '{}'::jsonb,
  manual_plan_overrides text,
  weekly_regen_slot_map jsonb not null default '{}'::jsonb,
  hidden_auto_workouts_map jsonb not null default '{}'::jsonb,
  profile_cache text,
  profile_username text,
  profile_week_config text,
  player_intake text,
  xp_history text,
  xp_progression text,
  performance_tips text,
  game_stats text,
  league_data text,
  training_goals text,
  custom_subcategories text,
  workout_history text,
  reminder_prefs text,
  coach_weekly_note text,
  training_exercises text,
  training_workouts text,
  workout_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_progress
  add column if not exists manual_plan_overrides text,
  add column if not exists weekly_regen_slot_map jsonb not null default '{}'::jsonb,
  add column if not exists profile_username text,
  add column if not exists profile_week_config text,
  add column if not exists player_intake text,
  add column if not exists custom_subcategories text,
  add column if not exists workout_history text,
  add column if not exists reminder_prefs text,
  add column if not exists coach_weekly_note text,
  add column if not exists training_exercises text,
  add column if not exists training_workouts text,
  add column if not exists workout_overrides jsonb not null default '{}'::jsonb,
  add column if not exists league_data text;

create unique index if not exists user_progress_user_id_uidx on public.user_progress(user_id);

create or replace function public.set_updated_at_user_progress()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_user_progress on public.user_progress;
create trigger trg_set_updated_at_user_progress
before update on public.user_progress
for each row execute function public.set_updated_at_user_progress();

alter table public.user_progress enable row level security;

drop policy if exists user_progress_select_own on public.user_progress;
create policy user_progress_select_own on public.user_progress for select
  using (user_id = auth.uid() or (user_id is null and email = lower((auth.jwt() ->> 'email'))));

drop policy if exists user_progress_insert_own on public.user_progress;
create policy user_progress_insert_own on public.user_progress for insert
  with check (user_id = auth.uid() or (user_id is null and email = lower((auth.jwt() ->> 'email'))));

drop policy if exists user_progress_update_own on public.user_progress;
create policy user_progress_update_own on public.user_progress for update
  using (user_id = auth.uid() or (user_id is null and email = lower((auth.jwt() ->> 'email'))))
  with check (user_id = auth.uid() or (user_id is null and email = lower((auth.jwt() ->> 'email'))));

drop policy if exists user_progress_delete_own on public.user_progress;
create policy user_progress_delete_own on public.user_progress for delete
  using (user_id = auth.uid() or (user_id is null and email = lower((auth.jwt() ->> 'email'))));

-- ── 2) user_id Backfill ─────────────────────────────────────────────────────

update public.user_progress p
set user_id = u.id
from auth.users u
where p.user_id is null
  and lower(u.email) = lower(p.email);

-- ── 3) Optional — falls verify-Script weitere Tabellen vermisst ─────────────
-- supabase/profiles.sql
-- supabase/exercises.sql
-- supabase/teams.sql
-- supabase/migrations/20260629120000_security_hardening.sql
-- supabase/migrations/20260629140000_league_data_and_storage.sql

-- ── 4) Verifikation ─────────────────────────────────────────────────────────

select to_regclass('public.user_progress') as user_progress_table;
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'user_progress' order by policyname;
select count(*) filter (where user_id is null) as rows_missing_user_id from public.user_progress;
