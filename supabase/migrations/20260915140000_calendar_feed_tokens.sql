-- Revocable private calendar feed tokens for connected team schedules.

create table if not exists public.calendar_feed_tokens (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, team_id)
);

create index if not exists calendar_feed_tokens_team_id_idx on public.calendar_feed_tokens(team_id);
alter table public.calendar_feed_tokens enable row level security;

drop policy if exists calendar_feed_tokens_select_own on public.calendar_feed_tokens;
create policy calendar_feed_tokens_select_own on public.calendar_feed_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists calendar_feed_tokens_write_own on public.calendar_feed_tokens;
create policy calendar_feed_tokens_write_own on public.calendar_feed_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.calendar_feed_tokens from anon;
grant select, insert, update, delete on public.calendar_feed_tokens to authenticated;
