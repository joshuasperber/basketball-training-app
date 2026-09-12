-- Team-Modus: Teams, Mitglieder, Einladungen, Gegner-Scouting
-- Ausführen in Supabase SQL Editor nach user_progress.sql

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

create table if not exists public.team_league_data (
  team_id uuid primary key references public.teams(id) on delete cascade,
  league_data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.opponent_scouting enable row level security;
alter table public.team_league_data enable row level security;

-- SECURITY DEFINER avoids recursive RLS when a team_members policy checks membership.
create or replace function public.is_team_member(target_team_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = target_team_id and tm.user_id = target_user_id
  )
$$;

create or replace function public.has_team_role(target_team_id uuid, allowed_roles text[], target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = target_team_id
      and tm.user_id = target_user_id
      and tm.role = any(allowed_roles)
  )
$$;

revoke all on function public.is_team_member(uuid, uuid) from public;
revoke all on function public.has_team_role(uuid, text[], uuid) from public;
grant execute on function public.is_team_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_team_role(uuid, text[], uuid) to authenticated, service_role;

drop policy if exists teams_select_member on public.teams;
create policy teams_select_member on public.teams
  for select to authenticated
  using (created_by = auth.uid() or public.is_team_member(id));

drop policy if exists teams_insert_authenticated on public.teams;
create policy teams_insert_authenticated on public.teams
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists team_members_select_member on public.team_members;
create policy team_members_select_member on public.team_members
  for select to authenticated
  using (public.is_team_member(team_id));

-- Inserts only via service-role API (/api/team/join) after invite validation.

-- Änderungen laufen ausschließlich über die validierten Service-Role-API-Routen.
-- Insbesondere darf ein Mitglied seine Rolle nicht direkt selbst hochstufen.
drop policy if exists team_members_update_self on public.team_members;
revoke insert, update, delete on public.team_members from anon, authenticated;

drop policy if exists opponent_scouting_select_member on public.opponent_scouting;
create policy opponent_scouting_select_member on public.opponent_scouting
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists opponent_scouting_write_captain on public.opponent_scouting;
create policy opponent_scouting_write_captain on public.opponent_scouting
  for all to authenticated
  using (public.has_team_role(team_id, array['owner', 'captain']))
  with check (public.has_team_role(team_id, array['owner', 'captain']));

drop policy if exists team_league_data_select_member on public.team_league_data;
create policy team_league_data_select_member on public.team_league_data
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists team_league_data_write_captain on public.team_league_data;
create policy team_league_data_write_captain on public.team_league_data
  for all to authenticated
  using (public.has_team_role(team_id, array['owner', 'captain']))
  with check (public.has_team_role(team_id, array['owner', 'captain']));
