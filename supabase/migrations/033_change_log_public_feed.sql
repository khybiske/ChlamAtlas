-- Migration: public read-only feed for the home page activity tracker
--
-- change_log's RLS is authenticated-only (per-record History panel needs
-- signed-in access to see who/what/when + old_data/new_data diffs). The
-- home page's aggregate tracker (sparkline, top contributors, recent
-- activity) is public-facing landing content and should be visible to
-- guests too — this function exposes only the low-sensitivity columns
-- (no old_data/new_data) via security definer, bypassing RLS for anon
-- callers while the underlying table and its detailed diffs stay
-- signed-in-only.

create or replace function public.change_log_public_feed()
returns table (
  entity_type text,
  action      text,
  changed_at  timestamptz,
  changed_by  uuid
)
language sql
security definer
stable
as $$
  select entity_type, action, changed_at, changed_by
  from public.change_log
  order by changed_at desc;
$$;

grant execute on function public.change_log_public_feed() to anon, authenticated;
