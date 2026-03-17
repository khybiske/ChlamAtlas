# ChlamAtlas — Project Brief for Claude Code

## What This Is

ChlamAtlas is a model organism database (MOD) and research tool for the Chlamydia research community, built and maintained by the Hybiske Lab at the University of Washington. It is a **published, community-facing scientific resource** — design, code quality, and data integrity should reflect that standard at all times.

ChlamAtlas consolidates genomic, proteomic, structural, and mutant data for Chlamydia species that is otherwise siloed across spreadsheets, supplemental data files, and lab notebooks. It replaces a previous AppSheet-based prototype and is intended to be a significant upgrade in capability, design, and access control.

The project has a companion paper in preparation. Think of every feature as potentially being described in a methods section.

**Live domain:** chlamatlas.org
**GitHub repo:** https://github.com/khybiske/ChlamAtlas
**Primary developer/PI:** Kevin Hybiske (khybiske@uw.edu), Hybiske Lab, University of Washington

---

## Tech Stack

| Layer | Technology |
|---|---|
| Database & Auth | Supabase (Postgres + Row-Level Security + Supabase Auth) |
| Frontend | Vanilla JS or lightweight framework; hosted on Vercel |
| Styling | Tailwind CSS |
| 3D Structure Viewer | Mol* (Molstar) — loads mmCIF files directly |
| Image Storage | GitHub (existing repo) — static images served via raw URLs |
| mmCIF Files | GitHub repo — for interactive structure loading in Mol* |
| Hosting | Vercel (free tier) |

Do not introduce unnecessary dependencies. Prefer simple, maintainable solutions over clever ones.

---

## Repository Layout (current)

The existing GitHub repo (https://github.com/khybiske/ChlamAtlas) currently serves primarily as a static asset store — it contains protein structure images and mmCIF files referenced by URL from the previous AppSheet app. The new web app will be built into this same repo, with the existing assets preserved in place.

When building the new app, organize new code cleanly without disrupting existing asset paths that may still be in use during transition.

---

## Access Tiers

This is a core architectural requirement. Three tiers must be enforced:

1. **Public (unauthenticated):** Can browse all genomic/proteomic data, view published mutants, view published pipeline entries, and view AlphaFold structural data. Cannot see unpublished/in-progress mutants or pipeline records.

2. **Lab member (authenticated):** Full read access to everything including unpublished mutants, in-progress pipeline records, and internal notes. Can edit records they are assigned to.

3. **Admin (Kevin):** Full read/write access to all records. Can toggle `is_published` status, manage user accounts, triage bugs, manage feature requests.

Access control must be enforced at the **database level** using Supabase Row-Level Security (RLS), not just at the UI level. Never trust the frontend alone to gate sensitive data.

---

## Organisms / Strains in Scope

### Current (fully supported)
- *Chlamydia trachomatis* D/UW-3 (CT-D)
- *Chlamydia trachomatis* L2/434 (CT-L2) — primary experimental strain
- *Chlamydia muridarum* Nigg (CM)

### Future (planned, not immediate)
- *Chlamydia pneumoniae* (Cpn)
- *C. trachomatis* rectal strain
- *C. trachomatis* ocular strain

Design the data model to accommodate additional strains without schema changes. Every organism-linked table should have a `strain_id` foreign key.

---

## Data Model

### Core Tables

**strains**
- id, species, strain_name, common_name, ncbi_taxid, emoji_icon (used in UI), color_hex, is_active

**genes**
- id, strain_id, locus_tag, gene_name, gene_symbol, aliases[], coordinates (start, end, strand), genome_position, is_characterized

**proteins**
- id, gene_id, uniprot_id, alphafold_id, mass_kd, length_aa, protein_family, function, localization, signal_peptide (bool), transmembrane_domains (int)

**orthologs**
- id, gene_id_a, gene_id_b, strain_id_a, strain_id_b, method (reciprocal_blast, manual), confidence

**expression_data**
- id, gene_id, timepoint (T0–T5), value, eb_expression, rb_expression, enrichment, source_publication_id, method (microarray, rnaseq)

**alphafold_results**
- id, protein_id, af_version, mmcif_path (GitHub URL), thumbnail_path (GitHub URL), top_homolog_pdb_id, top_homolog_description, homology_score, homology_method, inferred_function

**mutants**
- id, mutant_id (e.g. KH001, YW082), name, background_strain_id, target_gene_ids[], mutation_type (transposon, chemical, recombination, intron), plasmid_used, marker, creator, is_published (bool — drives RLS), collection (CT_L2, CM, Lucky17, Chimeras), notes

**mutant_pipeline**
- id, mutant_id, status (active, archived), plasmid_made_date, transformed_date, plaque_cloned_date, genotyped_date, genotyping_method, sequenced (bool), tested_in_vitro_date, tested_in_vivo_date, stocks_available_at, stage (transformation, plaque_cloning, genotyping, in_vitro_screening, in_vivo_screening, archived)

**mutant_phenotypes**
- id, mutant_id, phenotype_type (in_vitro, in_vivo), has_phenotype (bool), description, image_paths[] (GitHub URLs), notes, publication_id

**publications**
- id, pubmed_id, doi, title, authors[], year, linked_gene_ids[], linked_mutant_ids[]

**users** (managed via Supabase Auth)
- id, email, display_name, lab_affiliation, role (public, lab_member, admin)

**annotations** (community/lab evidence-based annotations not in NCBI/UniProt)
- id, gene_id, annotation_type, value, evidence_code, curator_id, publication_id, created_at

---

## Collaborating Labs (Pipeline)

The mutant pipeline is a multi-lab effort. Labs and their pipeline roles:

| Lab | Institution | Pipeline Roles |
|---|---|---|
| Hybiske Lab | University of Washington | Mutant generation, In vitro screening |
| Rockey Lab | Oregon State University | Genome sequencing |
| Hefty Lab | Kansas State University | Mutant generation, In vitro screening, In vivo screening |

Pipeline records should track which lab is responsible for each stage.

---

## Mutant Collections

| Collection | Background | Approx. Count | Notes |
|---|---|---|---|
| CT/L2 | C. trachomatis L2/434 | 200–300 | Primary collection |
| CM | C. muridarum | ~50 | |
| Lucky 17 | L2 backbone | 17 | Curated subset of chimeras; high-priority |
| Chimeras | L2 (majority), some CM | Several hundred | L2 x CM recombinants; mostly unpublished |

---

## UI / Design Principles

**This is the most important section.** ChlamAtlas should look and feel like a well-designed scientific product, not a database viewer. Kevin has strong design instincts and visual polish is a primary project value.

### Guiding aesthetic
- Clean white backgrounds with generous whitespace
- Scientific but not sterile — closer to a well-designed journal interface than to NCBI or a generic CRUD app
- Mobile-first and phone-friendly throughout (this was a core AppSheet strength to preserve)
- Data-rich pages should feel like profiles, not forms

### Navigation
Four primary tabs (matching the AppSheet prototype, preserve this structure):
- **Home** — landing/overview
- **Genomes** — strain → gene list → gene/protein detail page
- **Mutants** — collection → mutant list → mutant detail page
- **Pipeline** — multi-lab workflow overview + per-mutant progress tracking

### Specific UI patterns to preserve from prototype
- Species emoji/avatar icons (distinctive, charming, community-appropriate)
- Color-coded gene names: green = named/characterized, tan/muted = uncharacterized
- AlphaFold structure thumbnails as list item icons in gene list (signature feature)
- Pipeline progress dots per mutant showing stage completion
- Section headers with emojis (🧬 Genotyping, 🔬 In vitro testing, 🐭 In vivo testing, etc.)
- Floating action button (pencil icon) for edit mode on detail pages
- "Publicly available: Yes/No" clearly displayed on mutant records

### Structure viewer (new in v2)
- On gene/protein detail pages, embed an interactive Mol* viewer loading the mmCIF file from GitHub
- The static thumbnail image should remain visible as a preview; the interactive viewer loads on demand (tap/click to expand) to avoid performance issues on mobile
- Mol* should be configured with a clean, minimal toolbar — hide options not relevant to a general research audience

### Expression data (new in v2)
- T0–T5 microarray bar charts should be interactive (hover for values)
- Where ortholog expression data exists, allow toggling between strains on the same chart for comparison

### Do not make it look like
- A spreadsheet rendered as a web page
- A generic Bootstrap/Material Design template
- NCBI, UniProt, or any other public database UI

---

## Key Features (by priority)

### Phase 1 — Core (parity with AppSheet prototype)
- [ ] Strain browser → gene list with structure thumbnails → gene detail page
- [ ] Gene detail: orthologs, protein info, expression chart, structure viewer (Mol*), external DB links
- [ ] Mutant browser by collection → mutant detail page
- [ ] Mutant detail: target genes (linked), mutation info, genotyping, in vitro/in vivo phenotypes with images
- [ ] Pipeline overview with lab assignments and per-mutant progress dots
- [ ] Supabase auth with three-tier access control (public / lab member / admin)
- [ ] `is_published` flag on mutants enforced via RLS

### Phase 2 — Upgrades over prototype
- [ ] Interactive Mol* 3D structure viewer (mmCIF from GitHub)
- [ ] Interactive expression charts with cross-strain ortholog comparison
- [ ] Cross-strain ortholog navigation from any gene page
- [ ] Full-text search across genes, proteins, mutants
- [ ] Admin dashboard: user management, bug triage, feature requests

### Phase 3 — Community/publication features
- [ ] Evidence-based annotation submission (with PubMed ID requirement)
- [ ] Downloadable FASTA sequences per gene/protein
- [ ] API endpoints for programmatic access
- [ ] Additional strain support (Cpn, ocular CT, rectal CT)

---

## Project Status

### Session 1 — 2026-03-16 (completed)
- Homebrew, GitHub CLI installed and authenticated
- Local repo (`/Users/khybiske/Developer/web/ChlamAtlas`) connected to `github.com/khybiske/ChlamAtlas`
- `.gitignore` added
- Supabase project `ChlamAtlas` created (free tier, RLS enabled, data API enabled)
- Vercel account created
- **Next:** Export Google Sheets as CSVs, then build Supabase schema (Step 1)

### Design philosophy note
The AppSheet screenshots are a reference for *what data to show*, not a constraint on how to show it. The new stack opens up capabilities that AppSheet could not support: interactive 3D structure browsing, genome/chromosome browsers (e.g. JBrowse2), interactive pipeline views, and live connections to external databases. The pipeline UI in particular should be rethought from scratch using modern web tools — the AppSheet version was heavily constrained by the platform. Let the science and data drive design decisions.

---

## Data Migration Notes

All current data lives in Google Sheets (maintained by Kevin and lab members). Migration to Supabase will be done via CSV export + import scripts. The Google Sheets are the authoritative data source until migration is complete and validated.

Image assets (structure thumbnails, microscopy images) are already in the GitHub repo and will be served via raw GitHub URLs — no migration needed for images.

mmCIF files for all Chlamydia proteins (AlphaFold v3 predictions) are in the GitHub repo and will be loaded directly by the Mol* viewer.

---

## What Makes ChlamAtlas Unique

To keep this front of mind during development:

1. The only resource integrating genomic annotations, mutant phenotypes, pipeline tracking, and AlphaFold structural homology data for Chlamydia in a single interface
2. Lab-internal pipeline tracking with multi-lab assignment (no public equivalent)
3. Tiered access control for unpublished mutant data (solved the AppSheet paywall problem)
4. Interactive Mol* structural viewer with homology-inferred function annotations
5. Cross-strain ortholog navigation across the three primary model strains
6. Designed from the ground up to be phone-friendly

---

## Conventions

- Use `snake_case` for all database column names
- Use semantic HTML — accessibility matters for a published scientific resource
- Comment non-obvious logic, especially anything touching RLS policies
- All dates stored as ISO 8601 in UTC
- Locus tags are the canonical gene identifier (not gene names, which are not always assigned)
- `is_published: false` records must never appear in any public-facing query, even partially
