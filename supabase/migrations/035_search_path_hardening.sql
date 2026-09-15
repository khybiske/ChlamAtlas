-- Migration: pin search_path on the two change_log security-definer
-- functions that predate this convention being applied consistently.
-- Every other SECURITY DEFINER function in this schema already sets
-- search_path (get_user_role, is_admin, set_mutant_published, etc.) —
-- these two were the only exceptions, flagged by Supabase's linter
-- (function_search_path_mutable). Re-declaring with CREATE OR REPLACE
-- is safe and does not require dropping/recreating the triggers that
-- reference log_change(), since the function's signature is unchanged.

create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
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
