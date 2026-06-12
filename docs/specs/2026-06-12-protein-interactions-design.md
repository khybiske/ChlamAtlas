# Protein Interactions Module — Design Spec
_Date: 2026-06-12_

## Overview

Add a Protein Interactions section to the gene detail panel, replacing the existing "Coming soon" placeholder in `#d-interactions`. The section displays experimentally-demonstrated and computationally-inferred protein-protein interactions (PPIs) for each CT gene, covering both CT-host and CT-CT interactions. Data is stored in Supabase and populated by one-time import scripts.

---

## Data Sources

| Source | Evidence tier | Method tag | Confidence score | CT strains covered | Volume |
|--------|--------------|-----------|------------------|--------------------|--------|
| Mirrashidi et al. 2015 (S1.xlsx, High.Confidence.PPIs sheet) | experimental | ap_ms | MIST score (0–1) | D and/or L2 per bait | 354 pairs, 46 CT genes |
| Colleague Bac2H (flat file, TBD) | experimental | bac2h | — | TBD | TBD |
| Literature curation (manual SQL inserts) | experimental | literature | — | Strain as documented | Growing |
| STRING v12 physical network, experimental score ≥ 700 (272561.protein.physical.links.detailed) | inferred | string | STRING score (0–1000) | CT-D (propagates to orthologs) | ~1,767 pairs, 135 CT genes |

**Mirrashidi strain note:** The paper used both CT-D and CT-L2 baits. Bait names use CT-D locus tag conventions even for L2 experiments — the import script must check the paper's supplemental for per-bait strain assignment. Baits identified only by Inc protein name (e.g. IncE) without a strain-specific locus tag are treated as `strain_specific = false` and will surface on all orthologs.

**STRING note:** Data is downloaded as a one-time bulk import (file already retrieved locally). The STRING API is not queried at runtime. The experimental score ≥ 700 threshold captures 135 proteins; nearly all evidence is interolog-transferred from well-studied bacteria (E. coli etc.), not directly from Ct experiments — hence `inferred` tier.

---

## Database Schema

```sql
CREATE TABLE protein_interactions (
  id                  uuid primary key default gen_random_uuid(),
  gene_id             uuid references genes(id) not null,
  partner_ct_gene_id  uuid references genes(id),      -- CT-CT interactions only
  partner_external_id text,                            -- UniProt ID for human/external partners
  partner_name        text not null,                   -- gene symbol or locus tag
  partner_description text,                            -- short functional description
  partner_organism    text not null,                   -- 'human' | 'ct'
  evidence_tier       text not null,                   -- 'experimental' | 'inferred'
  method              text not null,                   -- 'ap_ms' | 'bac2h' | 'literature' | 'string'
  strain_specific     boolean not null default false,  -- false = show on all orthologs at query time
  confidence_score    numeric,                         -- MIST 0–1 for ap_ms; STRING 0–1000 for string; null for bac2h/literature
  study_reference     text,                            -- 'Mirrashidi 2015', 'STRING v12', etc.
  pubmed_id           text,
  notes               text,
  created_at          timestamptz not null default now()
);

CREATE INDEX ON protein_interactions(gene_id);
CREATE INDEX ON protein_interactions(partner_ct_gene_id);
```

**RLS:** Public-readable (no unpublished flag needed — interaction data is not access-controlled). Write restricted to authenticated admin.

---

## Query Logic

When loading a gene's detail panel, two queries are unioned:

1. **Direct rows:** `WHERE gene_id = $gene_id`
2. **Ortholog propagation:** `WHERE strain_specific = false AND gene_id IN (orthologs of $gene_id)`

Results are grouped by `evidence_tier` for display. Within each tier, sorted by `confidence_score DESC NULLS LAST`, then `partner_name ASC`.

For CT-CT interactions, both directions are stored at import time (A→B and B→A as separate rows), so querying is always the same simple `gene_id` lookup.

---

## UI Component

**Location:** `#d-interactions` in the gene detail panel right column (already present as a placeholder in `genomes.js`).

**Layout:** Accordion with two groups, styled to match the existing `sectionHead()` pattern.

### Group 1 — Experimental (open by default)
- Header: green dot · "EXPERIMENTAL" · count badge (green pill)
- Shows when `evidence_tier = 'experimental'`

### Group 2 — Inferred (collapsed by default)
- Header: gray dot · "INFERRED (STRING)" · count badge (gray pill)
- Italic footnote when expanded: "Inferred from orthologous experiments in other bacteria"
- Shows when `evidence_tier = 'inferred'`

If a gene has zero experimental interactions, the Experimental group is omitted entirely (not shown as empty). If a gene has zero interactions of either type, section shows "No interaction data available."

### Row anatomy (within each group)

```
[partner_name] [org-tag]      [method]
[partner_description]         [score-bar · score]
```

- `partner_name`: bold, 11px
- `[org-tag]`: inline colored label after the name — amber "Human" or blue "CT" — no left-side badge, no stripe
- `partner_description`: 9.5px muted, truncated at one line
- `method` (right): 8px uppercase, green for experimental, gray for inferred
- `score-bar` (right): 3px height, max ~42px wide; scaled within tier — ap_ms/bac2h/lit bars scale against 1.0 (MIST), string bars scale against 1000 (STRING score); green for experimental, gray for inferred; score value in 8px beside it; omitted if `confidence_score` is null

Inferred rows are rendered at 72% opacity; hovering restores full opacity.

### Navigation on click

- `partner_organism = 'ct'` → open that gene's detail panel (same as clicking the gene in the list); calls `openGeneById(partner_ct_gene_id, container)` which dispatches to `showGeneDetailMobile` or `showGeneDetailDesktop` per viewport
- `partner_organism = 'human'` → `window.open('https://www.uniprot.org/uniprotkb/' + partner_external_id, '_blank')`

### Mobile

The right column stacks full-width below the left column on mobile. The accordion component is unchanged — the collapsed-by-default inferred group keeps the section compact on small screens.

---

## Import Scripts

Three Python scripts, all in `data/`:

### `import_mirrashidi_ppi.py`
- Reads `Mirrashidi S1.xlsx`, sheet `High.Confidence.PPIs`
- Requires a bait → (locus_tag, strain_id) lookup table (manually verified against paper supplemental)
- Baits with strain-ambiguous names (Inc protein names only): `strain_specific = false`
- Baits with clear D or L2 locus tags: `strain_specific = true`, attached to that strain's gene
- Confidence score = MIST score (col C)
- Partner: UniProt ID (col B), gene symbol from col J, description from col I, organism = 'human'

### `import_string_ppi.py`
- Reads `272561.protein.physical.links.detailed.v12.0.txt.gz` (already downloaded to `/tmp/`)
- Filters: `experimental >= 700`
- Maps STRING protein IDs (e.g. `272561.CT_002`) → gene IDs via `locus_tag` in `genes` table (CT-D strain)
- Both directions stored (A→B and B→A)
- `strain_specific = false` for all rows
- `study_reference = 'STRING v12'`
- Also requires downloading `272561.protein.info.v12.0.txt.gz` for `partner_description`

### `import_bac2h_ppi.py`
- Placeholder; structure TBD pending colleague's flat file format
- Will follow the same pattern as Mirrashidi import

---

## Out of Scope (this version)

- Admin UI for adding literature interactions (manual SQL inserts for now)
- Network graph / force-directed visualization
- Filtering or searching within the interaction list
- IntAct / BioGRID as additional sources
- Showing interaction directionality (bait vs. prey label)

---

## Open Questions

- Mirrashidi per-bait strain assignment: needs verification against paper supplemental before import runs
- Bac2H data format: pending colleague's file
- Whether to show a "source" tooltip on hover for the method tag (e.g. hovering "AP-MS" shows "Mirrashidi et al. 2015, PMID 26450094")
