-- Keep database-side account cleanup atomic. Storage and Auth remain separate services
-- and are handled idempotently by the API around this transaction.

create or replace function public.prepare_account_deletion(target_user_id uuid, target_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  owned_team record;
  successor_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  for owned_team in
    select team_id from public.team_members
    where user_id = target_user_id and role = 'owner'
  loop
    select tm.user_id into successor_user_id
    from public.team_members tm
    where tm.team_id = owned_team.team_id and tm.user_id <> target_user_id
    order by case when tm.role = 'captain' then 0 else 1 end, tm.joined_at asc
    limit 1;

    if successor_user_id is null then
      delete from public.teams where id = owned_team.team_id;
    else
      update public.team_members
      set role = 'owner'
      where team_id = owned_team.team_id and user_id = successor_user_id;
    end if;
  end loop;

  delete from public.user_progress
  where user_id = target_user_id
    or (target_email <> '' and lower(email) = lower(target_email));
  delete from public.profiles where id = target_user_id;
  delete from public.team_members where user_id = target_user_id;
  delete from public.exercises where user_id = target_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.prepare_account_deletion(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid, text) to service_role;
