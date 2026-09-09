-- Teamrechte absichern und Gegnernamen eindeutig normalisieren.

drop policy if exists team_members_update_self on public.team_members;
revoke insert, update, delete on public.team_members from anon, authenticated;

drop policy if exists opponent_scouting_write_captain on public.opponent_scouting;
create policy opponent_scouting_write_captain
  on public.opponent_scouting
  for all
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = opponent_scouting.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'captain')
    )
  )
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = opponent_scouting.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'captain')
    )
  );

create or replace function public.normalize_opponent_name(value text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'))
$$;

-- Bestehende Dubletten werden nach Aktualität geordnet; der jüngste Datensatz bleibt bestehen.
with duplicates as (
  select id,
    row_number() over (
      partition by team_id, public.normalize_opponent_name(opponent_name)
      order by updated_at desc, id desc
    ) as duplicate_rank
  from public.opponent_scouting
)
delete from public.opponent_scouting scouting
using duplicates
where scouting.id = duplicates.id
  and duplicates.duplicate_rank > 1;

drop index if exists public.opponent_scouting_team_name_normalized_idx;
create unique index opponent_scouting_team_name_normalized_idx
  on public.opponent_scouting (team_id, public.normalize_opponent_name(opponent_name));
