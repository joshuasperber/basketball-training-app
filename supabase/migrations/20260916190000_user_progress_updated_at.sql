-- Keep optimistic-sync revisions accurate on every progress write.
create or replace function public.set_updated_at_user_progress()
returns trigger
language plpgsql
security invoker
set search_path = public
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
