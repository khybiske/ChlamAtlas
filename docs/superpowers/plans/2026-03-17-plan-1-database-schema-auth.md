# Database Schema & Auth — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Supabase schema (all tables, indexes, RLS policies) and wire up the four-tier auth system so every subsequent plan has a real data layer to work against.

**Architecture:** All tables live in the Supabase `public` schema. Row-Level Security (RLS) is enforced at the database level using a single helper function `get_user_role()` that reads from `public.users`. A Postgres trigger auto-creates a `public.users` row (with role = `community`) whenever a new Supabase Auth user signs up. SQL migration files are kept in `supabase/migrations/` for repeatability.

**Tech Stack:** Supabase (PostgreSQL 15, Supabase Auth, Row-Level Security). No ORM. SQL run via Supabase SQL editor (dashboard) or `psql`. JavaScript changes to `web/js/app.js` are minimal — just renaming role strings.

---

## Reference Documents

- Spec: `docs/superpowers/specs/2026-03-17-chlamatlas-ui-design.md` — Access Tiers, Schema Additions
- CLAUDE.md — Data Model section for full column definitions

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/001_schema.sql` | Create | All `CREATE TABLE` statements |
| `supabase/migrations/002_rls.sql` | Create | All RLS policies + helper functions |
| `supabase/migrations/003_seed.sql` | Create | Strains seed data + test user setup instructions |
| `web/js/app.js` | Modify | Rename `'public'` → `'guest'`; add `'community'` awareness |

---

## Important Context for the Developer

**Supabase SQL editor:** Dashboard → SQL Editor → "New query". Run each migration there. There is no local Supabase CLI set up — do not attempt `supabase db push`. Just paste and run in the dashboard.

**Auth users:** Supabase manages `auth.users` internally. We create a `public.users` table that mirrors/extends it. A Postgres trigger keeps them in sync.

**RLS mental model:** Every table has RLS enabled. A policy either ALLOWS or denies a query. If no policy matches, the query is denied. `auth.uid()` returns the current user's UUID (null for anonymous). `auth.role()` returns `'authenticated'` or `'anon'` — NOT our custom role. Our custom roles are stored in `public.users.role`.

**Four tiers:**
- `guest` — unauthenticated (anonymous Supabase session)
- `community` — authenticated, basic access
- `lab_member` — authenticated, full read + broad write
- `admin` — authenticated, full read/write everything

---

## Task 1: Create the migration directory

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Create: `supabase/migrations/002_rls.sql`
- Create: `supabase/migrations/003_seed.sql`

- [ ] **Step 1: Create directory and empty files**

```bash
mkdir -p supabase/migrations
touch supabase/migrations/001_schema.sql
touch supabase/migrations/002_rls.sql
touch supabase/migrations/003_seed.sql
```

- [ ] **Step 2: Verify directory structure**

```bash
ls supabase/migrations/
```

Expected output:
```
001_schema.sql  002_rls.sql  003_seed.sql
```

- [ ] **Step 3: Commit empty scaffolding**

```bash
git add supabase/
git commit -m "chore: scaffold supabase migration files"
```

---

## Task 2: Users table + auth trigger

The `public.users` table is the foundation of the entire permission system. Build this first so every subsequent table can reference it.

**Files:**
- Modify: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Write the verification query (run this — it should FAIL before migration)**

In Supabase SQL editor:
```sql
-- Should return an error: relation "public.users" does not exist
SELECT count(*) FROM public.users;
```

- [ ] **Step 2: Write the users table SQL**

Add to `supabase/migrations/001_schema.sql`:

```sql
-- ─── USERS ────────────────────────────────────────────────────────
-- Extends Supabase auth.users. Created automatically on signup via trigger.
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  display_name  text,
  lab_affiliation text,
  role          text NOT NULL DEFAULT 'community'
                CHECK (role IN ('guest','community','lab_member','admin')),
  role_request  text CHECK (role_request IN ('lab_member') OR role_request IS NULL),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-create public.users row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'community')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 3: Run it in Supabase SQL editor**

Copy the SQL above into the SQL editor and click Run.

Expected: `Success. No rows returned.`

- [ ] **Step 4: Verify the table was created**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
```

Expected: rows for `id`, `email`, `display_name`, `lab_affiliation`, `role`, `role_request`, `created_at`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat(db): users table + auth trigger"
```

---

## Task 3: Core organism tables (strains, genes, proteins)

**Files:**
- Modify: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Write verification queries (should all FAIL before migration)**

```sql
SELECT count(*) FROM public.strains;
SELECT count(*) FROM public.genes;
SELECT count(*) FROM public.proteins;
```

- [ ] **Step 2: Append to `001_schema.sql`**

```sql
-- ─── STRAINS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.strains (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species     text NOT NULL,
  strain_name text NOT NULL,
  common_name text NOT NULL,          -- e.g. "CT-L2"
  ncbi_taxid  text,
  emoji_icon  text,                   -- e.g. "🦠" used in UI organism cards
  color_hex   text,                   -- UI accent color e.g. "#7c3aed"
  is_active   boolean NOT NULL DEFAULT true,
  UNIQUE (species, strain_name)
);

-- ─── GENES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strain_id         uuid NOT NULL REFERENCES public.strains(id),
  locus_tag         text NOT NULL,
  gene_name         text,             -- NULL if uncharacterized
  gene_symbol       text,             -- abbreviated symbol for display
  aliases           text[],
  start_bp          integer,
  end_bp            integer,
  strand            text CHECK (strand IN ('+', '-')),
  is_characterized  boolean NOT NULL DEFAULT false,
  functional_category text,           -- e.g. 'T3SS', 'Inc', 'Cell division', 'Regulatory'
  -- Protein characteristics (manually curated booleans)
  is_membrane_protein     boolean NOT NULL DEFAULT false,
  is_hypothetical         boolean NOT NULL DEFAULT false,
  is_dna_binding          boolean NOT NULL DEFAULT false,
  is_t3_secreted          boolean NOT NULL DEFAULT false,
  UNIQUE (strain_id, locus_tag)
);

CREATE INDEX IF NOT EXISTS genes_strain_idx ON public.genes(strain_id);
CREATE INDEX IF NOT EXISTS genes_locus_idx  ON public.genes(locus_tag);

-- ─── PROTEINS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proteins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_id               uuid NOT NULL REFERENCES public.genes(id) ON DELETE CASCADE,
  uniprot_id            text,
  alphafold_id          text,
  mass_kd               numeric(6,1),
  length_aa             integer,
  protein_family        text,
  function_narrative    text,          -- free-text functional description
  localization          text,
  oligomeric_state      text,
  signal_peptide        boolean NOT NULL DEFAULT false,
  transmembrane_domains integer NOT NULL DEFAULT 0
);
```

- [ ] **Step 3: Run in Supabase SQL editor**

- [ ] **Step 4: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('strains', 'genes', 'proteins')
ORDER BY table_name;
```

Expected: 3 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat(db): strains, genes, proteins tables"
```

---

## Task 4: Genomic relationship tables

**Files:**
- Modify: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Append to `001_schema.sql`**

```sql
-- ─── ORTHOLOGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orthologs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_id_a    uuid NOT NULL REFERENCES public.genes(id),
  gene_id_b    uuid NOT NULL REFERENCES public.genes(id),
  strain_id_a  uuid NOT NULL REFERENCES public.strains(id),
  strain_id_b  uuid NOT NULL REFERENCES public.strains(id),
  method       text CHECK (method IN ('reciprocal_blast', 'manual')),
  confidence   numeric(3,2),
  CHECK (gene_id_a <> gene_id_b)
);

-- ─── EXPRESSION DATA ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expression_data (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_id            uuid NOT NULL REFERENCES public.genes(id),
  timepoint          text NOT NULL CHECK (timepoint IN ('T0','T1','T2','T3','T4','T5')),
  value              numeric,
  eb_expression      numeric,
  rb_expression      numeric,
  enrichment         numeric,
  source_publication_id uuid,          -- FK added after publications table
  method             text CHECK (method IN ('microarray','rnaseq'))
);

CREATE INDEX IF NOT EXISTS expr_gene_idx ON public.expression_data(gene_id);

-- ─── ALPHAFOLD RESULTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alphafold_results (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protein_id            uuid NOT NULL REFERENCES public.proteins(id) ON DELETE CASCADE,
  af_version            text,
  mmcif_path            text,           -- GitHub raw URL for Mol* viewer
  thumbnail_path        text,           -- GitHub raw URL for static preview
  top_homolog_pdb_id    text,
  top_homolog_description text,
  homology_score        numeric(5,2),
  homology_method       text,
  inferred_function     text
);
```

- [ ] **Step 2: Run in SQL editor and verify**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('orthologs', 'expression_data', 'alphafold_results');
```

Expected: 3 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat(db): orthologs, expression_data, alphafold_results tables"
```

---

## Task 5: Mutant tables

**Files:**
- Modify: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Append to `001_schema.sql`**

```sql
-- ─── MUTANTS ──────────────────────────────────────────────────────
-- is_published drives RLS: false = lab-only, true = publicly visible
CREATE TABLE IF NOT EXISTS public.mutants (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mutant_id            text NOT NULL,   -- e.g. KH001, YW082
  name                 text,
  background_strain_id uuid NOT NULL REFERENCES public.strains(id),
  target_gene_ids      uuid[],          -- array of gene IDs
  mutation_type        text CHECK (mutation_type IN ('transposon','chemical','recombination','intron')),
  plasmid_used         text,
  marker               text[],          -- resistance/fluorescent markers
  creator              uuid REFERENCES public.users(id),
  is_published         boolean NOT NULL DEFAULT false,
  is_priority          boolean NOT NULL DEFAULT false,
  collection           text CHECK (collection IN ('CT_L2','CM','Lucky17','Chimeras')),
  labs_shared_with     text[],          -- lab names
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS mutants_strain_idx ON public.mutants(background_strain_id);
CREATE INDEX IF NOT EXISTS mutants_published_idx ON public.mutants(is_published);

-- ─── MUTANT PIPELINE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mutant_pipeline (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mutant_id            uuid NOT NULL REFERENCES public.mutants(id) ON DELETE CASCADE,
  status               text CHECK (status IN ('active','archived')) DEFAULT 'active',
  stage                text CHECK (stage IN ('transformation','plaque_cloning','genotyping',
                                             'in_vitro_screening','in_vivo_screening','sequencing','archived')),
  is_priority          boolean NOT NULL DEFAULT false,
  responsible_lab      text,
  -- Stage completion dates
  transformed_date     date,
  plaque_cloned_date   date,
  genotyped_date       date,
  genotyping_method    text,
  in_vitro_date        date,
  in_vivo_date         date,
  sequenced            boolean NOT NULL DEFAULT false,
  sequenced_date       date,
  -- Stock locations (checkboxes)
  stocks_uw_hybiske    boolean NOT NULL DEFAULT false,
  stocks_uw_bob        boolean NOT NULL DEFAULT false,
  stocks_osu_rockey    boolean NOT NULL DEFAULT false,
  stocks_ku_hefty      boolean NOT NULL DEFAULT false,
  pipeline_notes       text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES public.users(id)
);

-- ─── MUTANT PHENOTYPES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mutant_phenotypes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mutant_id       uuid NOT NULL REFERENCES public.mutants(id) ON DELETE CASCADE,
  phenotype_type  text CHECK (phenotype_type IN ('in_vitro','in_vivo')),
  has_phenotype   boolean,
  description     text,
  image_paths     text[],
  notes           text,
  publication_id  uuid
);
```

- [ ] **Step 2: Run in SQL editor and verify**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('mutants', 'mutant_pipeline', 'mutant_phenotypes');
```

Expected: 3 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat(db): mutants, mutant_pipeline, mutant_phenotypes tables"
```

---

## Task 6: Supporting tables (publications, annotations, site content)

**Files:**
- Modify: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Append to `001_schema.sql`**

```sql
-- ─── PUBLICATIONS ─────────────────────────────────────────────────
-- NOTE: linked_gene_ids and linked_mutant_ids use arrays for Phase 1 simplicity.
-- Before building search or cross-linking features (Phase 3), replace with
-- junction tables: publication_genes(publication_id, gene_id) and
-- publication_mutants(publication_id, mutant_id) for proper indexing.
CREATE TABLE IF NOT EXISTS public.publications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pubmed_id         text,
  doi               text,
  title             text NOT NULL,
  authors           text[],
  year              integer,
  linked_gene_ids   uuid[],
  linked_mutant_ids uuid[]
);

-- ─── ANNOTATIONS ──────────────────────────────────────────────────
-- Community/lab evidence-based annotations not in NCBI/UniProt
CREATE TABLE IF NOT EXISTS public.annotations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_id          uuid NOT NULL REFERENCES public.genes(id),
  annotation_type  text NOT NULL,
  value            text NOT NULL,
  evidence_code    text,
  curator_id       uuid REFERENCES public.users(id),
  publication_id   uuid REFERENCES public.publications(id),
  curator_note     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── ANNOTATION HISTORY ───────────────────────────────────────────
-- Powers the admin annotation log (before/after diffs + revert)
CREATE TABLE IF NOT EXISTS public.annotation_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id uuid NOT NULL REFERENCES public.annotations(id) ON DELETE CASCADE,
  field_name    text NOT NULL,
  old_value     text,
  new_value     text,
  edited_by     uuid REFERENCES public.users(id),
  edited_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── FAVORITES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('gene','mutant')),
  entity_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

-- ─── LAB MEMBER REQUESTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_member_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  reviewed_by  uuid REFERENCES public.users(id),
  reviewed_at  timestamptz,
  UNIQUE (user_id)   -- one open request per user at a time
);

-- ─── SITE CONFIG ──────────────────────────────────────────────────
-- Admin-editable featured spotlight card on home page
CREATE TABLE IF NOT EXISTS public.site_config (
  key         text PRIMARY KEY,
  title       text,
  body        text,
  link_url    text,
  link_label  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── SITE UPDATES ─────────────────────────────────────────────────
-- Admin-managed recent updates list on home page
CREATE TABLE IF NOT EXISTS public.site_updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  category   text,             -- e.g. "CT-L2", "Structures", "Mutants"
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Run in SQL editor and verify**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected: 17 tables including all of the above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat(db): publications, annotations, favorites, site content tables"
```

---

## Task 7: RLS helper functions

RLS policies across 17 tables all call two helper functions. Define these first.

**Files:**
- Modify: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: Write and run the helper functions**

Append to `supabase/migrations/002_rls.sql` and run in SQL editor:

```sql
-- ─── ROLE HELPER ──────────────────────────────────────────────────
-- Returns the current user's role, or 'guest' for anonymous sessions.
-- SECURITY DEFINER so it can read public.users even when caller is anon.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'guest'
  );
$$;

-- Convenience wrappers used in policies
CREATE OR REPLACE FUNCTION public.is_lab_member_or_above()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_user_role() IN ('lab_member', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_user_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT auth.uid() IS NOT NULL;
$$;
```

- [ ] **Step 2: Verify functions exist**

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_user_role','is_lab_member_or_above','is_admin','is_authenticated');
```

Expected: 4 rows.

- [ ] **Step 3: Test role functions with a quick check**

```sql
-- Should return 'guest' when run in the SQL editor
-- (SQL editor runs as Postgres superuser; auth.uid() returns NULL → coalesces to 'guest')
SELECT public.get_user_role();
```

Expected: `guest` — this is correct. The SQL editor has no JWT context, so `auth.uid()` is NULL and the coalesce returns `'guest'`. This is the expected behavior for unauthenticated callers.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat(db): RLS helper functions"
```

---

## Task 8: RLS on genomic tables (public read)

Genomic data (strains, genes, proteins, orthologs, expression_data, alphafold_results) is publicly readable. No write access from the frontend — data entry is via CSV import.

**Files:**
- Modify: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: Append to `002_rls.sql` and run**

```sql
-- ─── STRAINS: public read ─────────────────────────────────────────
ALTER TABLE public.strains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strains_public_read" ON public.strains
  FOR SELECT USING (true);

-- ─── GENES: public read ───────────────────────────────────────────
ALTER TABLE public.genes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "genes_public_read" ON public.genes
  FOR SELECT USING (true);

-- ─── PROTEINS: public read ────────────────────────────────────────
ALTER TABLE public.proteins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proteins_public_read" ON public.proteins
  FOR SELECT USING (true);

-- ─── ORTHOLOGS: public read ───────────────────────────────────────
ALTER TABLE public.orthologs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orthologs_public_read" ON public.orthologs
  FOR SELECT USING (true);

-- ─── EXPRESSION DATA: public read ────────────────────────────────
ALTER TABLE public.expression_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expression_public_read" ON public.expression_data
  FOR SELECT USING (true);

-- ─── ALPHAFOLD RESULTS: public read ──────────────────────────────
ALTER TABLE public.alphafold_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "af_results_public_read" ON public.alphafold_results
  FOR SELECT USING (true);

-- ─── PUBLICATIONS: public read ───────────────────────────────────
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publications_public_read" ON public.publications
  FOR SELECT USING (true);

-- ─── ANNOTATIONS: public read, authenticated write ───────────────
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "annotations_public_read" ON public.annotations
  FOR SELECT USING (true);
CREATE POLICY "annotations_community_insert" ON public.annotations
  FOR INSERT WITH CHECK (public.is_authenticated() AND curator_id = auth.uid());
-- Only admin can update/delete annotations (revert workflow)
CREATE POLICY "annotations_admin_write" ON public.annotations
  FOR ALL USING (public.is_admin());

-- ─── ANNOTATION HISTORY: lab_member+ read, system insert ─────────
ALTER TABLE public.annotation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "annot_history_lab_read" ON public.annotation_history
  FOR SELECT USING (public.is_lab_member_or_above());
-- Inserts happen via trigger (SECURITY DEFINER function), not direct client
```

- [ ] **Step 2: Verify RLS is enabled**

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('strains','genes','proteins','orthologs','expression_data','alphafold_results')
ORDER BY tablename;
```

Expected: all rows show `rowsecurity = true`.

- [ ] **Step 3: Test public read works (no auth)**

Insert a test strain first (in SQL editor, which runs as superuser):
```sql
INSERT INTO public.strains (species, strain_name, common_name, color_hex)
VALUES ('Chlamydia trachomatis', 'L2/434', 'CT-L2', '#7c3aed');
```

Then test via the anon key (paste this into a browser console on your site, or use Supabase client):
```js
// This should return the strain even without auth
const { data } = await sb.from('strains').select('common_name');
console.log(data); // [{common_name: 'CT-L2'}]
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat(db): RLS policies for genomic tables"
```

---

## Task 9: RLS on mutant tables (is_published gate)

This is the most security-critical part. `is_published = false` must be invisible to guest and community users.

**Files:**
- Modify: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: Append to `002_rls.sql` and run**

```sql
-- ─── MUTANTS ──────────────────────────────────────────────────────
-- Guest/community: published only
-- Lab member+: all mutants
-- Community: can insert own mutants; can update their own
-- Lab member+: can update any
-- Admin: full access
ALTER TABLE public.mutants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mutants_public_read" ON public.mutants
  FOR SELECT USING (
    is_published = true
    OR public.is_lab_member_or_above()
  );

CREATE POLICY "mutants_community_insert" ON public.mutants
  FOR INSERT WITH CHECK (
    public.is_authenticated()
    AND creator = auth.uid()
    AND is_published = false    -- community users cannot self-publish
  );

CREATE POLICY "mutants_community_update_own" ON public.mutants
  FOR UPDATE USING (
    creator = auth.uid()
  )
  WITH CHECK (
    creator = auth.uid()
    AND is_published = false    -- community users cannot toggle is_published on their own mutants
  );

CREATE POLICY "mutants_lab_member_update_all" ON public.mutants
  FOR UPDATE USING (public.is_lab_member_or_above());

CREATE POLICY "mutants_admin_delete" ON public.mutants
  FOR DELETE USING (public.is_admin());

-- ─── MUTANT PIPELINE ──────────────────────────────────────────────
-- Only lab members and above can see or edit pipeline records
ALTER TABLE public.mutant_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_lab_read" ON public.mutant_pipeline
  FOR SELECT USING (public.is_lab_member_or_above());

CREATE POLICY "pipeline_lab_write" ON public.mutant_pipeline
  FOR ALL USING (public.is_lab_member_or_above());

-- ─── MUTANT PHENOTYPES ────────────────────────────────────────────
-- Follows mutant's is_published status
ALTER TABLE public.mutant_phenotypes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phenotypes_read" ON public.mutant_phenotypes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mutants m
      WHERE m.id = mutant_id
      AND (m.is_published = true OR public.is_lab_member_or_above())
    )
  );

CREATE POLICY "phenotypes_lab_write" ON public.mutant_phenotypes
  FOR ALL USING (public.is_lab_member_or_above());
```

- [ ] **Step 2: Test the is_published gate**

First insert a published and an unpublished mutant (as superuser in SQL editor):
```sql
-- Get the strain ID
SELECT id FROM public.strains WHERE common_name = 'CT-L2' LIMIT 1;
-- Use that ID below:

INSERT INTO public.mutants (mutant_id, background_strain_id, mutation_type, is_published)
VALUES
  ('TEST001', '<strain-id>', 'transposon', true),
  ('TEST002', '<strain-id>', 'transposon', false);
```

Then test in browser console (unauthenticated — use the anon key):
```js
const { data } = await sb.from('mutants').select('mutant_id, is_published');
console.log(data);
// Should only show TEST001 (is_published=true), NOT TEST002
```

- [ ] **Step 3: Delete test records**

```sql
DELETE FROM public.mutants WHERE mutant_id IN ('TEST001', 'TEST002');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat(db): RLS policies for mutant tables — is_published gate"
```

---

## Task 10: RLS on user/site tables

**Files:**
- Modify: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: Append to `002_rls.sql` and run**

```sql
-- ─── USERS ────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row; admins can read all
CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (
    id = auth.uid() OR public.is_admin()
  );

-- Users can update their own display_name, lab_affiliation, role_request
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_admin_all" ON public.users
  FOR ALL USING (public.is_admin());

-- Prevent ANY non-superuser from directly updating the role column.
-- Role changes must go through set_user_role() below.
REVOKE UPDATE (role) ON public.users FROM authenticated, anon;

-- Admin-only function to change a user's role (bypasses the REVOKE above)
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  IF new_role NOT IN ('guest','community','lab_member','admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$$;

-- ─── FAVORITES ────────────────────────────────────────────────────
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_own" ON public.favorites
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── LAB MEMBER REQUESTS ──────────────────────────────────────────
ALTER TABLE public.lab_member_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_own_read" ON public.lab_member_requests
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "requests_own_insert" ON public.lab_member_requests
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.is_authenticated()
  );

CREATE POLICY "requests_admin_update" ON public.lab_member_requests
  FOR UPDATE USING (public.is_admin());

-- ─── SITE CONFIG / UPDATES ────────────────────────────────────────
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_config_public_read" ON public.site_config
  FOR SELECT USING (true);
CREATE POLICY "site_config_admin_write" ON public.site_config
  FOR ALL USING (public.is_admin());

ALTER TABLE public.site_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_updates_public_read" ON public.site_updates
  FOR SELECT USING (true);
CREATE POLICY "site_updates_admin_write" ON public.site_updates
  FOR ALL USING (public.is_admin());
```

- [ ] **Step 2: Verify RLS on all remaining tables**

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Expected: all 17 tables show `rowsecurity = true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat(db): RLS policies for user and site tables"
```

---

## Task 11: Add annotation history trigger

Gene annotation edits should automatically log to `annotation_history`. This ensures the admin revert workflow has data to work with.

**Files:**
- Modify: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: Append and run**

```sql
-- Log every update to annotations.value into annotation_history.
-- NOTE: auth.uid() calls current_setting('request.jwt.claim.sub') which IS
-- populated by PostgREST in the same transaction context, so it works in triggers
-- triggered by PostgREST requests. It returns NULL when run in SQL editor (superuser
-- context), which is expected — history rows from test/admin SQL runs will have
-- edited_by = NULL, which is acceptable.
CREATE OR REPLACE FUNCTION public.log_annotation_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_id uuid;
BEGIN
  -- Read the PostgREST JWT subject; falls back to NULL in SQL editor / trigger contexts
  caller_id := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO public.annotation_history
      (annotation_id, field_name, old_value, new_value, edited_by, edited_at)
    VALUES
      (NEW.id, 'value', OLD.value, NEW.value, caller_id, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS annotations_history_trigger ON public.annotations;
CREATE TRIGGER annotations_history_trigger
  AFTER UPDATE ON public.annotations
  FOR EACH ROW EXECUTE FUNCTION public.log_annotation_change();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat(db): annotation history trigger"
```

---

## Task 12: Seed data (strains + site defaults)

**Files:**
- Modify: `supabase/migrations/003_seed.sql`

- [ ] **Step 1: Write and run the seed**

```sql
-- ─── STRAINS SEED ─────────────────────────────────────────────────
-- Run this once to populate the three primary strains.
INSERT INTO public.strains (species, strain_name, common_name, ncbi_taxid, color_hex, is_active)
VALUES
  ('Chlamydia trachomatis', 'L2/434',  'CT-L2', '471472', '#7c3aed', true),
  ('Chlamydia trachomatis', 'D/UW-3',  'CT-D',  '272561', '#1d4ed8', true),
  ('Chlamydia muridarum',   'Nigg',    'CM',    '243161', '#c2410c', true)
ON CONFLICT (species, strain_name) DO NOTHING;   -- idempotent: safe to run multiple times

-- ─── SITE CONFIG DEFAULT ──────────────────────────────────────────
INSERT INTO public.site_config (key, title, body, link_url, link_label)
VALUES (
  'featured_spotlight',
  'Welcome to ChlamAtlas',
  'ChlamAtlas integrates genomic, structural, and mutant data for Chlamydia research. Start by exploring a strain or browsing mutants.',
  '#genomes',
  'Browse genomes'
)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Verify strains**

```sql
SELECT common_name, color_hex FROM public.strains ORDER BY common_name;
```

Expected:
```
 CM    | #c2410c
 CT-D  | #1d4ed8
 CT-L2 | #7c3aed
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_seed.sql
git commit -m "feat(db): seed strains and default site config"
```

---

## Task 13: Update app.js role names

The existing `app.js` uses `'public'` as the unauthenticated role name. The spec uses `'guest'`. Update to match.

**Files:**
- Modify: `web/js/app.js`

- [ ] **Step 1: Find all occurrences of the old role name**

```bash
grep -n "public\|userRole" web/js/app.js
```

- [ ] **Step 2: Update role references**

In `web/js/app.js`, change:
```js
// OLD
state.userRole = 'public';
```
```js
// NEW
state.userRole = 'guest';
```

And in `refreshRole()`:
```js
// OLD
state.userRole = data?.role ?? 'public';
```
```js
// NEW
state.userRole = data?.role ?? 'guest';
```

- [ ] **Step 3: Add Pipeline tab visibility enforcement**

In `activateTab()`, add after `state.currentTab = name;`:
```js
// Pipeline tab is lab_member and admin only
if (name === 'pipeline' && !['lab_member','admin'].includes(state.userRole)) {
  name = 'home';
  state.currentTab = 'home';
}
```

Also hide the Pipeline tab button for non-lab-members. Add a standalone function (not inside `renderAuthArea()`):
```js
function updateNavVisibility() {
  const showPipeline = ['lab_member','admin'].includes(state.userRole);
  document.querySelectorAll('[data-tab="pipeline"]').forEach(btn => {
    btn.style.display = showPipeline ? '' : 'none';
  });
}
```

Call `updateNavVisibility()` in **two** places:
1. After every `await refreshRole()` call (in `loadUser()` and after sign-in)
2. At the end of the boot IIFE, after `await loadUser()` completes — this ensures the tab is hidden on initial page load for unauthenticated users before any tab is rendered:

```js
(async () => {
  await loadUser();
  renderAuthArea();
  updateNavVisibility();  // ← must be here too, before activateTab()
  const hash = location.hash.replace('#', '');
  activateTab(TABS.includes(hash) ? hash : 'home');
})();
```

- [ ] **Step 4: Verify in browser**

1. Open the site unauthenticated — Pipeline tab should be hidden
2. Sign in with a community user — Pipeline tab should still be hidden
3. Sign in with a lab_member user — Pipeline tab appears

- [ ] **Step 5: Commit**

```bash
git add web/js/app.js
git commit -m "feat(auth): update role names to 4-tier system, hide pipeline for community/guest"
```

---

## Task 14: Create test users in Supabase

Create one user per role tier for development/testing. Do this manually in the Supabase dashboard.

**Files:** None — all in Supabase Auth dashboard.

- [ ] **Step 1: Create test users via Supabase Auth dashboard**

Dashboard → Authentication → Users → Invite user (or Add user). Create:
- `guest-test@test.local` — do not sign in, leave as no-account (just use the site without auth)
- `community@test.local` / password: `testtest` — will auto-get `community` role via trigger
- `labmember@test.local` / password: `testtest`
- `admin@test.local` / password: `testtest`

- [ ] **Step 2: Promote labmember and admin users**

After they're created (via trigger they'll have `community` role), promote them in SQL editor:

```sql
UPDATE public.users SET role = 'lab_member'
WHERE email = 'labmember@test.local';

UPDATE public.users SET role = 'admin'
WHERE email = 'admin@test.local';
```

- [ ] **Step 3: Verify roles**

```sql
SELECT email, role FROM public.users ORDER BY role;
```

Expected: 3 rows with the correct roles.

- [ ] **Step 4: Confirm RLS gate with real auth**

Sign into the site as `community@test.local`. Check browser console:
```js
// Should return only published mutants (empty for now since no data loaded)
const { data, error } = await sb.from('mutants').select('mutant_id');
console.log(data, error);
```

Sign in as `labmember@test.local`:
```js
// Should return all mutants including unpublished (empty for now)
const { data } = await sb.from('mutants').select('mutant_id');
console.log(data);
```

---

## Completion Checklist

Before marking this plan done:

- [ ] All 17 tables exist in Supabase
- [ ] RLS is enabled on all 17 tables (verified with `pg_tables` query)
- [ ] `get_user_role()` returns correct role for authenticated and anonymous callers
- [ ] Unauthenticated query to `mutants` returns only `is_published = true` rows
- [ ] Lab member query to `mutants` returns all rows
- [ ] Pipeline tab hidden for guest and community users in the UI
- [ ] All three test users exist and have correct roles
- [ ] All migration SQL files committed to `supabase/migrations/`

---

## Next Plans

After this plan is complete:
- **Plan 2:** Navigation Chrome & App Shell Redesign (can start immediately — no data dependency)
- **Plan 3:** Home Tab
- **Plan 4:** Genomes Tab (requires strains data from this plan)
