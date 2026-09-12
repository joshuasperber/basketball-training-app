-- Avoid recursive team_members RLS and keep shared exercises immutable to users.

create or replace function public.is_team_member(target_team_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.team_members tm
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
    select 1
    from public.team_members tm
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

drop policy if exists team_members_select_member on public.team_members;
create policy team_members_select_member on public.team_members
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists opponent_scouting_select_member on public.opponent_scouting;
create policy opponent_scouting_select_member on public.opponent_scouting
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists opponent_scouting_write_captain on public.opponent_scouting;
create policy opponent_scouting_write_captain on public.opponent_scouting
  for all to authenticated
  using (public.has_team_role(team_id, array['owner', 'captain']))
  with check (public.has_team_role(team_id, array['owner', 'captain']));

drop policy if exists exercises_insert_authenticated on public.exercises;
create policy exercises_insert_authenticated on public.exercises
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists exercises_update_authenticated on public.exercises;
create policy exercises_update_authenticated on public.exercises
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists exercises_delete_authenticated on public.exercises;
create policy exercises_delete_authenticated on public.exercises
  for delete to authenticated
  using (user_id = auth.uid());
