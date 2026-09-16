-- Migration: public name resolution for change_log-derived UI
--
-- The users table's RLS only lets a signed-in user read their own row
-- (018_fix_auth_uid.sql). That's correct for the users table itself, but
-- it silently breaks every "resolve a list of OTHER users' display names"
-- lookup added by the change_log feature: the history panel, the home
-- page's top-contributors list, and its activity feed. All three need to
-- show whose edit something was, for any viewer, not just the viewer's
-- own name.
--
-- These two security-definer functions expose ONLY display_name and
-- lab_affiliation (already effectively public information shown all over
-- the app already, e.g. on mutant "Creator" fields) — never email, role,
-- or any other users column.

-- Extend the existing public feed (033) with resolved names, so the home
-- page's three widgets need no separate users lookup at all. Postgres
-- won't let CREATE OR REPLACE change a function's return columns, so the
-- old two-column-narrower version (033) must be dropped first.
drop function if exists public.change_log_public_feed();

create or replace function public.change_log_public_feed()
returns table (
  entity_type      text,
  action           text,
  changed_at       timestamptz,
  changed_by       uuid,
  changed_by_name  text,
  changed_by_lab   text
)
language sql
security definer
stable
set search_path = public
as $$
  select cl.entity_type, cl.action, cl.changed_at, cl.changed_by,
         u.display_name, u.lab_affiliation
  from public.change_log cl
  left join public.users u on u.id = cl.changed_by
  order by cl.changed_at desc;
$$;

grant execute on function public.change_log_public_feed() to anon, authenticated;

-- Companion lookup for the per-record History panel, which already has
-- the ids it needs (from change_log rows it fetched directly) and just
-- needs their names.
create or replace function public.public_user_names(ids uuid[])
returns table (
  id              uuid,
  display_name    text,
  lab_affiliation text
)
language sql
security definer
stable
set search_path = public
as $$
  select id, display_name, lab_affiliation
  from public.users
  where id = any(ids);
$$;

grant execute on function public.public_user_names(uuid[]) to anon, authenticated;
