-- Prevent silent last-write-wins updates for shared team league data and keep a
-- compact, user-visible audit trail. The API still performs role checks; RLS
-- remains the final database boundary for direct authenticated access.

alter table public.team_league_data
  add column if not exists version bigint not null default 1,
  add column if not exists change_log jsonb not null default '[]'::jsonb;

update public.team_league_data
set version = greatest(version, 1),
    change_log = case
      when jsonb_typeof(change_log) = 'array' then change_log
      else '[]'::jsonb
    end;

alter table public.team_league_data
  drop constraint if exists team_league_data_version_positive,
  add constraint team_league_data_version_positive check (version >= 1),
  drop constraint if exists team_league_data_change_log_array,
  add constraint team_league_data_change_log_array check (jsonb_typeof(change_log) = 'array');

alter table public.user_progress
  add column if not exists readiness_history text;
