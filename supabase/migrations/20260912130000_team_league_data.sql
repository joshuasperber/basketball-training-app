-- A connected Team shares one league bundle across all team members.

create table if not exists public.team_league_data (
  team_id uuid primary key references public.teams(id) on delete cascade,
  league_data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.team_league_data enable row level security;

drop policy if exists team_league_data_select_member on public.team_league_data;
create policy team_league_data_select_member on public.team_league_data
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists team_league_data_write_captain on public.team_league_data;
create policy team_league_data_write_captain on public.team_league_data
  for all to authenticated
  using (public.has_team_role(team_id, array['owner', 'captain']))
  with check (public.has_team_role(team_id, array['owner', 'captain']));

revoke insert, update, delete on public.team_league_data from anon;
