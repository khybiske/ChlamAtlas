-- Migration: single-row heartbeat table for the Supabase Keep-Alive workflow.
--
-- Free-tier projects pause after a week of too little database activity, and
-- read-only pings drew a pause warning on a sibling project. The GitHub
-- workflow writes last_ping_at here every few hours using the service key.
-- RLS with no policies plus the revokes keep anon and authenticated users out.

create table public.keepalive_heartbeat (
  id smallint primary key default 1 check (id = 1),
  last_ping_at timestamptz not null default now()
);

alter table public.keepalive_heartbeat enable row level security;

revoke all on public.keepalive_heartbeat from anon, authenticated;

insert into public.keepalive_heartbeat (id) values (1);
