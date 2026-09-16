-- Migration: harden rollback_change — search_path, zero-row detection,
-- and stale-column tolerance.
--
-- Three fixes to the original rollback_change() from 032_change_log.sql:
-- 1. Pin search_path (matches house convention for SECURITY DEFINER fns).
-- 2. If the dynamic UPDATE matches zero rows (the record was deleted, or
--    this log entry itself represents a 'delete' action so there is
--    nothing left to update), raise a clear error instead of silently
--    "succeeding" at doing nothing.
-- 3. Build the column list only from keys that are still real columns on
--    the live table, so a column renamed/dropped after an old entry was
--    written doesn't break reverting that entry.

create or replace function public.rollback_change(log_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry    public.change_log;
  tbl      text;
  cols     text;
  affected int;
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can roll back changes';
  end if;

  select * into entry from public.change_log where id = log_id;
  if entry is null then
    raise exception 'Change log entry not found';
  end if;
  if entry.old_data is null then
    raise exception 'Cannot roll back an insert — delete the record instead';
  end if;

  tbl := case entry.entity_type
           when 'gene'             then 'genes'
           when 'mutant'           then 'mutants'
           when 'mutant_phenotype' then 'mutant_phenotypes'
           when 'structure'        then 'alphafold_results'
         end;

  select string_agg(format('%I = s.%I', key, key), ', ')
    into cols
    from jsonb_object_keys(entry.old_data) as key
    where exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = tbl and c.column_name = key
    );

  execute format(
    'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) as s where t.id = $2',
    tbl, cols, tbl
  ) using entry.old_data, entry.entity_id;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'Record no longer exists — cannot roll back (it may have been deleted since this change)';
  end if;
end;
$$;
