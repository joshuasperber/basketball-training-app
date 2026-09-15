-- Reproducible base schema. Later migrations add policies, storage and hardening.

create table if not exists public.user_progress (
  email text primary key,
  user_id uuid references auth.users(id) on delete cascade,
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
  readiness_history text,
  coach_weekly_note text,
  training_exercises text,
  training_workouts text,
  workout_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_progress_user_id_uidx on public.user_progress(user_id);

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

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  subcategory text,
  metric_keys text[] default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text,
  club_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('owner', 'captain', 'player', 'coach')),
  display_name text,
  member_email text,
  position text,
  play_style text,
  share_level text not null default 'summary' check (share_level in ('summary', 'full')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists team_members_user_id_idx on public.team_members(user_id);
create index if not exists team_members_team_id_idx on public.team_members(team_id);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  token text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  max_uses int not null default 10,
  use_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists team_invites_team_id_idx on public.team_invites(team_id);

create table if not exists public.opponent_scouting (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  opponent_name text not null,
  styles text[] not null default '{}',
  notes text,
  updated_at timestamptz not null default now(),
  unique (team_id, opponent_name)
);

create index if not exists opponent_scouting_team_id_idx on public.opponent_scouting(team_id);

create table if not exists public.team_videos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploader_name text not null,
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  category text not null check (category in ('offense', 'defense')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm', 'video/quicktime')),
  file_size bigint not null check (file_size > 0 and file_size <= 209715200),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists team_videos_team_created_idx on public.team_videos(team_id, created_at desc);
