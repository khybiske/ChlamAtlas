-- Migration: gene_edit_log audit table + RLS + updated_at trigger on genes

-- 1. Audit table
create table if not exists public.gene_edit_log (
  id         uuid primary key default gen_random_uuid(),
  gene_id    uuid not null references public.genes(id) on delete cascade,
  editor_id  uuid not null references auth.users(id),
  edited_at  timestamptz not null default now(),
  changes    jsonb not null
);

-- RLS
alter table public.gene_edit_log enable row level security;

-- Authenticated users can insert their own rows
create policy "auth_insert_edit_log"
  on public.gene_edit_log for insert
  to authenticated
  with check (editor_id = auth.uid());

-- Admins can select (for dashboard review + rollback)
create policy "admin_select_edit_log"
  on public.gene_edit_log for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- 2. updated_at trigger on genes
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists genes_set_updated_at on public.genes;
create trigger genes_set_updated_at
  before update on public.genes
  for each row execute function public.set_updated_at();

-- 3. Ensure authenticated users can UPDATE genes and proteins
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'genes' and cmd = 'UPDATE' and policyname = 'auth_update_genes'
  ) then
    execute 'create policy auth_update_genes on public.genes for update to authenticated using (true) with check (true)';
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'proteins' and cmd = 'UPDATE' and policyname = 'auth_update_proteins'
  ) then
    execute 'create policy auth_update_proteins on public.proteins for update to authenticated using (true) with check (true)';
  end if;
end;
$$;
