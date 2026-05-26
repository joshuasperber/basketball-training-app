-- Einmalig in Supabase SQL Editor ausführen (nach teams.sql)
alter table public.team_members
  add column if not exists member_email text;

update public.team_members tm
set member_email = lower(u.email)
from auth.users u
where tm.member_email is null and tm.user_id = u.id;
