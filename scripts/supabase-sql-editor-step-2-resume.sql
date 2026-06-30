-- Nur ausführen, wenn Schritt 2 bei exercises abgebrochen ist
-- (profiles ist dann meist schon angelegt — dieser Block ist idempotent)

-- exercises: Legacy-Tabelle erweitern
do $$
begin
  if to_regclass('public.exercises') is null then
    create table public.exercises (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade,
      name text not null,
      category text,
      subcategory text,
      metric_keys text[] default '{}',
      created_at timestamptz not null default now()
    );
  else
    alter table public.exercises add column if not exists user_id uuid references auth.users(id) on delete cascade;
    alter table public.exercises add column if not exists subcategory text;
    alter table public.exercises add column if not exists metric_keys text[] default '{}';
    alter table public.exercises add column if not exists created_at timestamptz not null default now();
  end if;
end $$;

create index if not exists exercises_user_id_idx on public.exercises(user_id) where user_id is not null;

alter table public.exercises enable row level security;

drop policy if exists exercises_select_own on public.exercises;
drop policy if exists exercises_select_authenticated on public.exercises;
create policy exercises_select_authenticated on public.exercises for select to authenticated using (true);

drop policy if exists exercises_insert_own on public.exercises;
drop policy if exists exercises_insert_authenticated on public.exercises;
create policy exercises_insert_authenticated on public.exercises for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists exercises_update_own on public.exercises;
drop policy if exists exercises_update_authenticated on public.exercises;
create policy exercises_update_authenticated on public.exercises for update to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

drop policy if exists exercises_delete_own on public.exercises;
drop policy if exists exercises_delete_authenticated on public.exercises;
create policy exercises_delete_authenticated on public.exercises for delete to authenticated
  using (user_id is null or user_id = auth.uid());

-- Rest von Schritt 2
alter table public.user_progress add column if not exists league_data text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-photos', 'game-photos', false, 5242880, array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public;

drop policy if exists game_photos_select_own on storage.objects;
create policy game_photos_select_own on storage.objects for select
  using (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists game_photos_insert_own on storage.objects;
create policy game_photos_insert_own on storage.objects for insert
  with check (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists game_photos_update_own on storage.objects;
create policy game_photos_update_own on storage.objects for update
  using (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists game_photos_delete_own on storage.objects;
create policy game_photos_delete_own on storage.objects for delete
  using (bucket_id = 'game-photos' and auth.uid()::text = (storage.foldername(name))[1]);
