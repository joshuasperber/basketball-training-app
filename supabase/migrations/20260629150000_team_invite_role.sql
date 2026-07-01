-- Trainer-Einladungen: Rolle am Invite speichern
alter table public.team_invites
  add column if not exists invited_role text not null default 'player'
  check (invited_role in ('player', 'coach'));
