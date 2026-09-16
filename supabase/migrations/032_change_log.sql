-- Migration: universal change_log audit table, triggers, and admin rollback RPC
--
-- Tracks genes, mutants (published only), mutant_phenotypes (of published
-- mutants only), and alphafold_results (structures). Whole-row snapshots,
-- not field lists — the app diffs old_data/new_data client-side. See
-- docs/superpowers/specs/2026-09-15-change-history-design.md for the design
-- this implements.

create table if not exists public.change_log (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('gene','mutant','mutant_phenotype','structure')),
  entity_id    uuid not null,
  action       text not null check (action in ('insert','update','delete')),
  old_data     jsonb,
  new_data     jsonb,
  changed_by   uuid references auth.users(id),
  changed_at   timestamptz not null default now()
);

create index if not exists change_log_entity_idx
  on public.change_log (entity_type, entity_id, changed_at desc);

alter table public.change_log enable row level security;

drop policy if exists "authenticated_select_change_log" on public.change_log;
create policy "authenticated_select_change_log"
  on public.change_log for select
  to authenticated
  using (true);

-- ─── Trigger function ──────────────────────────────────────────────
-- security definer: writes to change_log regardless of the editing user's
-- own grants on that table — no INSERT policy exists for regular roles at
-- all, only this function (and rollback_change below) ever write to it.
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_entity_type text := TG_ARGV[0];
  v_action      text;
  v_old         jsonb;
  v_new         jsonb;
  v_entity_id   uuid;
  v_mutant_pub  boolean;
begin
  if TG_OP = 'INSERT' then
    v_action    := 'insert';
    v_new       := to_jsonb(NEW);
    v_entity_id := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_action    := 'update';
    v_old       := to_jsonb(OLD);
    v_new       := to_jsonb(NEW);
    v_entity_id := NEW.id;
  elsif TG_OP = 'DELETE' then
    v_action    := 'delete';
    v_old       := to_jsonb(OLD);
    v_entity_id := OLD.id;
  end if;

  -- Privacy gating: mutants/phenotypes only tracked once published.
  if v_entity_type = 'mutant' then
    if TG_OP = 'INSERT' then
      if not coalesce(NEW.is_published, false) then
        return coalesce(NEW, OLD);
      end if;
    elsif TG_OP = 'DELETE' then
      if not coalesce(OLD.is_published, false) then
        return coalesce(NEW, OLD);
      end if;
    else
      if not (coalesce(OLD.is_published, false) or coalesce(NEW.is_published, false)) then
        return coalesce(NEW, OLD);
      end if;
    end if;
  elsif v_entity_type = 'mutant_phenotype' then
    if TG_OP = 'DELETE' then
      select is_published into v_mutant_pub from public.mutants where id = OLD.mutant_id;
    else
      select is_published into v_mutant_pub from public.mutants where id = NEW.mutant_id;
    end if;
    if not coalesce(v_mutant_pub, false) then
      return coalesce(NEW, OLD);
    end if;
  end if;

  insert into public.change_log (entity_type, entity_id, action, old_data, new_data, changed_by)
  values (v_entity_type, v_entity_id, v_action, v_old, v_new, auth.uid());

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists genes_log_change on public.genes;
create trigger genes_log_change
  after insert or update or delete on public.genes
  for each row execute function public.log_change('gene');

drop trigger if exists mutants_log_change on public.mutants;
create trigger mutants_log_change
  after insert or update or delete on public.mutants
  for each row execute function public.log_change('mutant');

drop trigger if exists mutant_phenotypes_log_change on public.mutant_phenotypes;
create trigger mutant_phenotypes_log_change
  after insert or update or delete on public.mutant_phenotypes
  for each row execute function public.log_change('mutant_phenotype');

drop trigger if exists alphafold_results_log_change on public.alphafold_results;
create trigger alphafold_results_log_change
  after insert or update or delete on public.alphafold_results
  for each row execute function public.log_change('structure');

-- ─── Rollback RPC ──────────────────────────────────────────────────
-- Admin-only. Re-applies old_data onto the live row via a generic dynamic
-- UPDATE (column list built from old_data's own keys, values cast through
-- jsonb_populate_record so arrays/uuids/timestamps come back correctly
-- typed) — no per-table branch needed for the UPDATE itself, only for
-- picking the table name. The UPDATE fires log_change() again, so a
-- rollback always shows up as a brand-new history entry.
create or replace function public.rollback_change(log_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  entry public.change_log;
  tbl   text;
  cols  text;
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
    from jsonb_object_keys(entry.old_data) as key;

  execute format(
    'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) as s where t.id = $2',
    tbl, cols, tbl
  ) using entry.old_data, entry.entity_id;
end;
$$;
