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

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.opponent_scouting enable row level security;

-- Mitglieder sehen ihr Team
create policy teams_select_member on public.teams
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = teams.id and tm.user_id = auth.uid()
    )
  );

create policy teams_insert_authenticated on public.teams
  for insert with check (auth.uid() is not null and created_by = auth.uid());

create policy team_members_select_member on public.team_members
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id and tm.user_id = auth.uid()
    )
  );

-- Inserts only via service-role API (/api/team/join) after invite validation.

create policy team_members_update_self on public.team_members
  for update using (user_id = auth.uid());

create policy opponent_scouting_select_member on public.opponent_scouting
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = opponent_scouting.team_id and tm.user_id = auth.uid()
    )
  );

create policy opponent_scouting_write_captain on public.opponent_scouting
  for all using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = opponent_scouting.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'captain', 'coach')
    )
  );
