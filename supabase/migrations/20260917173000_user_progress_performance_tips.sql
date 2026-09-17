-- Persist generated performance tips across devices. Existing projects may
-- predate the consolidated core schema, so add the column idempotently.
alter table public.user_progress
  add column if not exists performance_tips text;
