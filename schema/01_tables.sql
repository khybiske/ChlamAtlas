-- ============================================================
-- ChlamAtlas Database Schema
-- Run this in Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================

-- ─── STRAINS ─────────────────────────────────────────────────
CREATE TABLE strains (
    id          TEXT PRIMARY KEY,       -- 'CT-D', 'CT-L2', 'CM'
    species     TEXT NOT NULL,
    strain_name TEXT,
    common_name TEXT,
    ncbi_taxid  TEXT,
    emoji_icon  TEXT,
    color_hex   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO strains VALUES
    ('CT-D',  'Chlamydia trachomatis', 'D/UW-3',  'CT-D',  '272561', '🔵', '#4A90D9', true),
    ('CT-L2', 'Chlamydia trachomatis', 'L2/434',  'CT-L2', '471472', '🟣', '#9B59B6', true),
    ('CM',    'Chlamydia muridarum',   'Nigg',    'CM',    '243161', '🟠', '#E67E22', true);


-- ─── GENES ───────────────────────────────────────────────────
-- One row per gene (across all strains).
-- Expression columns are strain-specific; unused ones stay NULL.
-- mmcif_path and af_image_url are derived during migration from
-- uniprot_id and locus_tag respectively (see scripts/migrate.py).
CREATE TABLE genes (
    id                          SERIAL PRIMARY KEY,
    strain_id                   TEXT NOT NULL REFERENCES strains(id),
    locus_tag                   TEXT NOT NULL,          -- CT001, CTL0001, TC0001
    sort_index                  INTEGER,
    gene_name                   TEXT,                   -- hemB, gatC, etc. (NULL if uncharacterized)
    product                     TEXT,                   -- full protein description
    uniprot_id                  TEXT,
    length_bp                   INTEGER,
    mass_kd                     NUMERIC(8,1),
    protein_family              TEXT,
    function                    TEXT,                   -- broad category: Translation, Transcription, etc.
    pz                          TEXT,                   -- spare classification field

    -- Protein characteristics
    is_membrane                 BOOLEAN NOT NULL DEFAULT false,
    is_hypothetical             BOOLEAN NOT NULL DEFAULT false,
    is_dna_binding              BOOLEAN NOT NULL DEFAULT false,
    is_secreted                 BOOLEAN NOT NULL DEFAULT false,
    is_inc                      BOOLEAN NOT NULL DEFAULT false,  -- inclusion membrane protein

    -- Expression data
    -- D strain: full time-series (EB=elementary body, RB=reticulate body, 1h–40h microarray)
    -- L2 strain: EB, RB numeric + microarray_category (qualitative)
    -- CM strain: no expression data currently
    expr_eb                     NUMERIC,
    expr_rb                     NUMERIC,
    expr_1h                     NUMERIC,
    expr_3h                     NUMERIC,
    expr_8h                     NUMERIC,
    expr_16h                    NUMERIC,
    expr_24h                    NUMERIC,
    expr_40h                    NUMERIC,
    microarray_category         TEXT,   -- L2: 'Constitutive', 'Mid_Late', etc.

    -- Structure data
    pdb_id                      TEXT,
    pdb_image_url               TEXT,
    alphafold_id                TEXT,   -- UniProt-based AF ID (same as uniprot_id usually)
    af_image_url                TEXT,   -- GitHub raw URL to .png thumbnail
    mmcif_path                  TEXT,   -- GitHub raw URL to .cif file
    af_version                  TEXT,   -- 'AF2' or 'AF3'
    structural_homology_function TEXT,  -- Foldseek/homology inferred function

    -- GO / functional annotations
    biological_process          TEXT,
    cellular_component          TEXT,
    molecular_function          TEXT,
    go_ids                      TEXT,   -- semicolon-separated GO IDs
    subcellular_location        TEXT,
    subunit_structure           TEXT,

    -- Metadata
    last_edited                 TIMESTAMPTZ,
    edited_by_name              TEXT,

    UNIQUE (strain_id, locus_tag)
);


-- ─── ORTHOLOGS ────────────────────────────────────────────────
-- Derived during migration from OrthologID_* columns in each gene sheet.
-- Pairs are stored once (gene_id < ortholog_gene_id) to avoid duplication.
CREATE TABLE orthologs (
    id               SERIAL PRIMARY KEY,
    gene_id          INTEGER NOT NULL REFERENCES genes(id),
    ortholog_gene_id INTEGER NOT NULL REFERENCES genes(id),
    method           TEXT NOT NULL DEFAULT 'reciprocal_blast',
    UNIQUE (gene_id, ortholog_gene_id),
    CHECK (gene_id <> ortholog_gene_id)
);


-- ─── MUTANTS ──────────────────────────────────────────────────
CREATE TABLE mutants (
    id                      SERIAL PRIMARY KEY,
    mutant_id               TEXT UNIQUE NOT NULL,   -- UWCM001, KH001, etc.
    mutant_name             TEXT,
    category                TEXT,       -- 'C. muridarum', 'C. trachomatis', 'Lucky 17', 'Chimeras'
    strain_id               TEXT REFERENCES strains(id),
    target_genes            TEXT[],     -- array of locus tags
    mutation_type           TEXT,       -- 'Transposon', 'Lambda Red', etc.
    description             TEXT,
    status                  TEXT,       -- current workflow stage label
    creator                 TEXT,
    created_at              DATE,
    notes                   TEXT,
    priority                TEXT,

    -- Mutant construction details
    plasmid_used            TEXT,
    tn_insert_positions     TEXT,       -- raw text; may be multi-value
    recombined_start_gene   TEXT,
    recombined_end_gene     TEXT,
    ortholog_span_cm        TEXT,
    recombined_region_notes TEXT,
    selection_markers       TEXT,

    -- Sequencing
    sequenced               BOOLEAN DEFAULT false,
    sequencing_type         TEXT,       -- 'WGS', 'Sanger', etc.

    -- Phenotypes
    invitro_phenotype       BOOLEAN,
    invitro_notes           TEXT,
    invitro_data            TEXT,       -- GitHub image URL(s) or notes
    invivo_phenotype        BOOLEAN,
    invivo_notes            TEXT,
    invivo_data             TEXT,

    -- Flags
    is_archived             BOOLEAN NOT NULL DEFAULT false,
    stuck_stage             TEXT,
    assigned_to             TEXT,
    show_in_pipeline        BOOLEAN NOT NULL DEFAULT false,
    stock_locations         TEXT,
    shared_with             TEXT,
    is_published            BOOLEAN NOT NULL DEFAULT false,  -- drives public visibility (RLS)

    last_edited             TIMESTAMPTZ,
    last_edited_by          TEXT
);


-- ─── MUTANT PIPELINE ──────────────────────────────────────────
-- Tracks stage-by-stage completion for each mutant.
-- 1:1 with mutants; split out to keep mutants table clean.
CREATE TABLE mutant_pipeline (
    id                                  SERIAL PRIMARY KEY,
    mutant_id                           TEXT NOT NULL REFERENCES mutants(mutant_id),
    plasmid_complete                    BOOLEAN NOT NULL DEFAULT false,
    transformation_complete             BOOLEAN NOT NULL DEFAULT false,
    cloning_complete                    BOOLEAN NOT NULL DEFAULT false,
    genotyping_complete                 BOOLEAN NOT NULL DEFAULT false,
    invitro_test_complete               BOOLEAN NOT NULL DEFAULT false,
    invivo_test_complete                BOOLEAN NOT NULL DEFAULT false,
    include_in_pipeline_after_genotyping BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (mutant_id)
);


-- ─── USERS ────────────────────────────────────────────────────
-- Mirrors Supabase auth.users; populated via Auth trigger (see 02_rls.sql).
CREATE TABLE users (
    id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                TEXT UNIQUE,
    display_name         TEXT,
    institution          TEXT,
    institution_logo_url TEXT,
    role                 TEXT NOT NULL DEFAULT 'public'
                             CHECK (role IN ('public', 'lab_member', 'admin')),
    is_approved          BOOLEAN NOT NULL DEFAULT false,
    dismissed_onboarding BOOLEAN NOT NULL DEFAULT false
);
