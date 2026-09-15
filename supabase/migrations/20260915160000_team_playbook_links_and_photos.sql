-- The team playbook now stores three kinds of entries: uploaded videos,
-- uploaded photos and external video links. Uploads keep using the existing
-- private bucket; links carry no storage object at all.

alter table public.team_videos
  add column if not exists media_kind text not null default 'video_upload',
  add column if not exists link_url text;

alter table public.team_videos
  alter column storage_path drop not null,
  alter column mime_type drop not null,
  alter column file_size drop not null;

alter table public.team_videos drop constraint if exists team_videos_mime_type_check;
alter table public.team_videos drop constraint if exists team_videos_file_size_check;
alter table public.team_videos drop constraint if exists team_videos_media_kind_check;
alter table public.team_videos drop constraint if exists team_videos_media_shape_check;
alter table public.team_videos drop constraint if exists team_videos_link_url_check;

alter table public.team_videos
  add constraint team_videos_media_kind_check
  check (media_kind in ('video_upload', 'video_link', 'image'));

alter table public.team_videos
  add constraint team_videos_mime_type_check
  check (
    mime_type is null
    or mime_type in ('video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp')
  );

alter table public.team_videos
  add constraint team_videos_file_size_check
  check (file_size is null or (file_size > 0 and file_size <= 209715200));

alter table public.team_videos
  add constraint team_videos_link_url_check
  check (link_url is null or (char_length(link_url) between 8 and 500 and link_url ~* '^https?://'));

-- Uploads must point at a storage object and carry a mime type; links must not.
alter table public.team_videos
  add constraint team_videos_media_shape_check
  check (
    case media_kind
      when 'video_link' then storage_path is null and mime_type is null and link_url is not null
      else storage_path is not null and mime_type is not null and link_url is null
    end
  );

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id = 'team-videos';
