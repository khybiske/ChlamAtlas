# ChlamAtlas

**A model organism database for *Chlamydia* research**

[chlamatlas.org](https://chlamatlas.org) · Hybiske Lab · University of Washington

---

ChlamAtlas is a community-facing scientific resource that consolidates genomic, proteomic, structural, and mutant data for *Chlamydia* species — data that is otherwise scattered across spreadsheets, supplemental files, and lab notebooks.

## What's Inside

- **Genomes** — Browse annotated genes across *C. trachomatis* D/UW-3, *C. trachomatis* L2/434, and *C. muridarum* Nigg; view protein properties, expression data, and cross-strain orthologs
- **AlphaFold Structures** — Interactive 3D structure viewer (Mol*) with homology-inferred function annotations for every protein
- **Mutant Library** — Curated collection of characterized and in-progress mutants with phenotype data and pipeline tracking
- **Pipeline** — Multi-lab workflow tracking across the Hybiske, Rockey, and Hefty labs
- **Tools** — Sequence alignment and structure alignment utilities

## Access Tiers

| Tier | Access |
|---|---|
| Public | All genomic/proteomic data, published mutants, AlphaFold structures |
| Lab member | Everything above + unpublished mutants, pipeline records, internal notes |
| Admin | Full read/write access, user management |

Access is enforced at the database level via Supabase Row-Level Security.

## Tech Stack

Vanilla JS · Tailwind CSS · Supabase (Postgres + Auth + RLS) · Mol* · Vercel

## Repository Layout

```
web/          Main application (HTML/CSS/JS)
structures/   AlphaFold mmCIF files
images/       Protein structure thumbnails and microscopy images
schema/       Database schema and migration files
scripts/      Data import and utility scripts
```

## Contact

Kevin Hybiske · khybiske@uw.edu · [Hybiske Lab](https://hybiskelab.org)
