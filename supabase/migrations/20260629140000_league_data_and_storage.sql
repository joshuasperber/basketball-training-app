-- Liga-Daten in Cloud-Sync + Storage-Bucket game-photos

alter table public.user_progress
  add column if not exists league_data text;

-- Storage bucket für Spiel-Fotos (privat)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-photos',
  'game-photos',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Nutzer dürfen nur in ihrem Ordner ({user_id}/...) lesen/schreiben
drop policy if exists game_photos_select_own on storage.objects;
create policy game_photos_select_own
  on storage.objects for select
  using (
    bucket_id = 'game-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists game_photos_insert_own on storage.objects;
create policy game_photos_insert_own
  on storage.objects for insert
  with check (
    bucket_id = 'game-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists game_photos_update_own on storage.objects;
create policy game_photos_update_own
  on storage.objects for update
  using (
    bucket_id = 'game-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'game-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists game_photos_delete_own on storage.objects;
create policy game_photos_delete_own
  on storage.objects for delete
  using (
    bucket_id = 'game-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
