-- Security hardening: delete policies + close team self-join hole
-- Run via Supabase CLI or SQL Editor on existing projects.

-- user_progress: allow users to delete own row (GDPR Art. 17)
drop policy if exists user_progress_delete_own on public.user_progress;
create policy user_progress_delete_own
  on public.user_progress
  for delete
  using (
    user_id = auth.uid()
    or (user_id is null and email = lower((auth.jwt() ->> 'email')))
  );

-- profiles: allow users to delete own profile (if table exists)
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
  on public.profiles
  for delete
  using (id = auth.uid());

-- team_members: remove permissive self-insert (joins only via service-role API + invite flow)
drop policy if exists team_members_insert_self on public.team_members;
