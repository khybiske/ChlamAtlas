-- ChlamAtlas — Supabase schema
-- Run in Supabase SQL editor: Dashboard → SQL Editor → New query
-- Run BEFORE 002_rls.sql and 003_seed.sql

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

-- Auto-update updated_at on row modifications
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mutants_set_updated_at ON public.mutants;
CREATE TRIGGER mutants_set_updated_at
  BEFORE UPDATE ON public.mutants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS pipeline_set_updated_at ON public.mutant_pipeline;
CREATE TRIGGER pipeline_set_updated_at
  BEFORE UPDATE ON public.mutant_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── STRAINS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.strains (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species     text NOT NULL,
  strain_name text NOT NULL,
  common_name text NOT NULL,
  ncbi_taxid  text,
  emoji_icon  text,
  color_hex   text,
  is_active   boolean NOT NULL DEFAULT true,
  UNIQUE (species, strain_name)
);

-- ─── GENES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strain_id               uuid NOT NULL REFERENCES public.strains(id),
  locus_tag               text NOT NULL,
  gene_name               text,
  gene_symbol             text,
  aliases                 text[],
  start_bp                integer,
  end_bp                  integer,
  strand                  text CHECK (strand IN ('+', '-')),
  CHECK (start_bp IS NULL OR end_bp IS NULL OR end_bp > start_bp),
  is_characterized        boolean NOT NULL DEFAULT false,
  functional_category     text,
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
  gene_id               uuid NOT NULL UNIQUE REFERENCES public.genes(id) ON DELETE CASCADE,
  uniprot_id            text,
  alphafold_id          text,
  mass_kd               numeric(6,1),
  length_aa             integer CHECK (length_aa IS NULL OR length_aa > 0),
  protein_family        text,
  function_narrative    text,
  localization          text,
  oligomeric_state      text,
  signal_peptide        boolean NOT NULL DEFAULT false,
  transmembrane_domains integer NOT NULL DEFAULT 0
);

-- ─── ORTHOLOGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orthologs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_id_a    uuid NOT NULL REFERENCES public.genes(id),
  gene_id_b    uuid NOT NULL REFERENCES public.genes(id),
  strain_id_a  uuid NOT NULL REFERENCES public.strains(id),
  strain_id_b  uuid NOT NULL REFERENCES public.strains(id),
  method       text CHECK (method IN ('reciprocal_blast', 'manual')),
  confidence   numeric(3,2) CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
  CHECK (gene_id_a <> gene_id_b),
  UNIQUE (gene_id_a, gene_id_b)
);

-- ─── EXPRESSION DATA ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expression_data (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_id               uuid NOT NULL REFERENCES public.genes(id),
  timepoint             text NOT NULL CHECK (timepoint IN ('T0','T1','T2','T3','T4','T5')),
  value                 numeric,
  eb_expression         numeric,
  rb_expression         numeric,
  enrichment            numeric,
  source_publication_id uuid REFERENCES public.publications(id),
  method                text CHECK (method IN ('microarray','rnaseq'))
);

CREATE INDEX IF NOT EXISTS expr_gene_idx ON public.expression_data(gene_id);

-- ─── ALPHAFOLD RESULTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alphafold_results (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protein_id              uuid NOT NULL REFERENCES public.proteins(id) ON DELETE CASCADE,
  af_version              text,
  mmcif_path              text,
  thumbnail_path          text,
  top_homolog_pdb_id      text,
  top_homolog_description text,
  homology_score          numeric(5,2),
  homology_method         text,
  inferred_function       text,
  UNIQUE (protein_id, af_version)
);

-- ─── MUTANTS ──────────────────────────────────────────────────────
-- is_published drives RLS: false = lab-only, true = publicly visible
CREATE TABLE IF NOT EXISTS public.mutants (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mutant_id            text NOT NULL,
  name                 text,
  background_strain_id uuid NOT NULL REFERENCES public.strains(id),
  target_gene_ids      uuid[],
  mutation_type        text CHECK (mutation_type IN ('transposon','chemical','recombination','intron')),
  plasmid_used         text,
  marker               text[],
  creator              uuid REFERENCES public.users(id),
  is_published         boolean NOT NULL DEFAULT false,
  is_priority          boolean NOT NULL DEFAULT false,
  collection           text CHECK (collection IN ('CT_L2','CM','Lucky17','Chimeras')),
  labs_shared_with     text[],
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES public.users(id),
  UNIQUE (mutant_id)
);

CREATE INDEX IF NOT EXISTS mutants_strain_idx     ON public.mutants(background_strain_id);
CREATE INDEX IF NOT EXISTS mutants_published_idx  ON public.mutants(is_published);

-- ─── MUTANT PIPELINE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mutant_pipeline (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mutant_id            uuid NOT NULL REFERENCES public.mutants(id) ON DELETE CASCADE,
  status               text NOT NULL CHECK (status IN ('active','archived')) DEFAULT 'active',
  stage                text CHECK (stage IN ('transformation','plaque_cloning','genotyping',
                                             'in_vitro_screening','in_vivo_screening','sequencing','archived')),
  is_priority          boolean NOT NULL DEFAULT false,
  responsible_lab      text,
  transformed_date     date,
  plaque_cloned_date   date,
  genotyped_date       date,
  genotyping_method    text,
  in_vitro_date        date,
  in_vivo_date         date,
  sequenced            boolean NOT NULL DEFAULT false,
  sequenced_date       date,
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
  publication_id  uuid REFERENCES public.publications(id)
);

-- ─── PUBLICATIONS ─────────────────────────────────────────────────
-- NOTE: linked_gene_ids/linked_mutant_ids use arrays for Phase 1 simplicity.
-- Replace with junction tables before building search/cross-linking (Phase 3).
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
  UNIQUE (user_id)
);

-- ─── SITE CONFIG ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_config (
  key         text PRIMARY KEY,
  title       text,
  body        text,
  link_url    text,
  link_label  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── SITE UPDATES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  category   text,
  created_at timestamptz NOT NULL DEFAULT now()
);
