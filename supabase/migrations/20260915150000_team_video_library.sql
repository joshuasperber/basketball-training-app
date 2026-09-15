-- Private, team-scoped video playbook. Uploads are sent directly to Storage by
-- a short-lived signed URL; metadata remains protected by team membership.

create table if not exists public.team_videos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploader_name text not null,
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  category text not null check (category in ('offense', 'defense')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm', 'video/quicktime')),
  file_size bigint not null check (file_size > 0 and file_size <= 209715200),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists team_videos_team_created_idx on public.team_videos(team_id, created_at desc);
alter table public.team_videos enable row level security;

drop policy if exists team_videos_select_member on public.team_videos;
create policy team_videos_select_member on public.team_videos
  for select to authenticated using (public.is_team_member(team_id));

drop policy if exists team_videos_insert_member on public.team_videos;
create policy team_videos_insert_member on public.team_videos
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.is_team_member(team_id));

drop policy if exists team_videos_update_uploader_or_manager on public.team_videos;
create policy team_videos_update_uploader_or_manager on public.team_videos
  for update to authenticated
  using (uploaded_by = auth.uid() or public.has_team_role(team_id, array['owner', 'captain']))
  with check (public.is_team_member(team_id));

drop policy if exists team_videos_delete_uploader_or_manager on public.team_videos;
create policy team_videos_delete_uploader_or_manager on public.team_videos
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.has_team_role(team_id, array['owner', 'captain']));

revoke all on public.team_videos from anon;
grant select, insert, update, delete on public.team_videos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-videos',
  'team-videos',
  false,
  209715200,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists team_videos_storage_select_member on storage.objects;
create policy team_videos_storage_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'team-videos'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_team_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists team_videos_storage_insert_member on storage.objects;
create policy team_videos_storage_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-videos'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_team_member(((storage.foldername(name))[1])::uuid)
      else false
    end
    and auth.uid()::text = (storage.foldername(name))[2]
  );

drop policy if exists team_videos_storage_delete_uploader_or_manager on storage.objects;
create policy team_videos_storage_delete_uploader_or_manager on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-videos'
    and (
      auth.uid()::text = (storage.foldername(name))[2]
      or case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then public.has_team_role(((storage.foldername(name))[1])::uuid, array['owner', 'captain'])
        else false
      end
    )
  );
