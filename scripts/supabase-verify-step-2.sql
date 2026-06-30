-- Nach Migration ausführen: Prüfen ob Tabellen, Spalten und Policies existieren

select to_regclass('public.profiles') as profiles_table;
select to_regclass('public.exercises') as exercises_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_progress'
  and column_name = 'league_data';

select policyname, cmd, tablename
from pg_policies
where schemaname = 'public'
  and tablename in ('user_progress', 'profiles', 'exercises', 'team_members')
order by tablename, policyname;

select id, name, public from storage.buckets where id = 'game-photos';

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'game_photos%';
