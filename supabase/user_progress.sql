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
  updated_at timestamptz not null default now()
);

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
