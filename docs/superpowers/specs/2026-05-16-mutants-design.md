# Mutants Tab — Design Spec
**Date:** 2026-05-16  
**Status:** Approved for implementation

---

## Overview

The Mutants tab is a two-panel desktop-first interface for browsing and inspecting the ChlamAtlas mutant collections. It does **not** have a dedicated springboard/landing page — entry always arrives pre-filtered to a specific collection, either from the home page or from the nav dropdown.

---

## Entry Points

### 1. Nav "Mutants" button → dropdown
Clicking "Mutants" in the top nav opens a list-style dropdown (Option A from brainstorming). It shows only the 4 collections — no mutation type links.

```
Collections
🦠 C. trachomatis       247 mutants  ›
🐭 C. muridarum          52 mutants  ›
🍀 Lucky 17              17 mutants  ›
🧬 Chimeras             183 mutants  ›
```

Icons use custom graphics (`L2icon.jpg`, `CMicon.jpg`, `L17icon.jpg`, `Chimeraicon.jpg`), not emojis. (The emoji characters in the code block above are illustrative only.) Clicking any row loads the two-panel UI filtered to that collection.

### 2. Home page "Explore Mutants" section
Four collection cards (already planned for home page). Clicking one loads the same two-panel UI.

### No dedicated springboard tab
The Mutants tab content IS the two-panel view. There is no intermediate landing screen.

---

## Schema Changes Required

### 1. Rename `recombination` → `deletion` in `mutants.mutation_type`
```sql
-- Migration: update CHECK constraint + backfill
ALTER TABLE mutants DROP CONSTRAINT mutants_mutation_type_check;
UPDATE mutants SET mutation_type = 'deletion' WHERE mutation_type = 'recombination';
ALTER TABLE mutants ADD CONSTRAINT mutants_mutation_type_check
  CHECK (mutation_type IN ('transposon', 'deletion', 'chemical'));
-- Note: 'intron' removed; TargeTron mutants re-classified as 'deletion'
```

### 2. Add `mutation_method` column
```sql
ALTER TABLE mutants ADD COLUMN mutation_method text;
-- Values: 'lambda_red', 'targetron', 'crispr', or NULL
-- Covers deletion subtypes; transposon/chemical leave this NULL
```

---

## Mutation Type Vocabulary

| Display name | DB value | Covers |
|---|---|---|
| Transposon | `transposon` | Tn insertion mutants |
| Deletion | `deletion` | Lambda red KOs, TargeTron insertions, future CRISPR |
| Chemical | `chemical` | Chemical frameshift/mutagenesis mutants |

Deletion subtypes recorded in `mutation_method`: `lambda_red`, `targetron`, `crispr`.  
Intron is no longer a separate type — TargeTron mutants move to Deletion.

---

## Two-Panel Layout

Desktop: fixed-height viewport, list left, detail right.  
Mobile: full-screen list; tapping a row pushes full-screen detail (back button returns to list).

---

## Left Panel — Mutant List (width: ~300px)

### Collection strip (top)
- Custom circular icon (L2icon.jpg etc.) + collection name + mutant count
- "Switch ▾" button opens the same collection dropdown as the nav

### Search bar
- Full-text search across `mutant_id`, `name`, and resolved gene locus tags
- Filters the list in real time (debounced)

### Type filter pills
Horizontal pill row below search:  
`All` · `Transposon` · `Deletion` · `Chemical`

Active pill: dark green fill. Tapping a pill filters the list to that mutation type.

### Filters button → popover
Opens an overlay popover with grouped toggle pills:

| Group | Options |
|---|---|
| Published | All · Published · Unpublished |
| Phenotype | In vitro + · In vivo + · Any phenotype |
| Gene class | Hypothetical · Inc protein · T3 secreted · Characterized |
| Genotyping | Sequenced · Stocks available |
| Annotations | Has annotation |

Multiple filters can be active simultaneously.

**Implementation note:** Gene class filters (Hypothetical, Inc protein, T3 secreted, Characterized) and Genotyping filters (Sequenced, Stocks available) require joining across tables (`target_gene_ids` → `genes`, and `mutant_pipeline`). These may be applied client-side after fetching, or as a subquery. Implement as a post-fetch client filter first; optimize if list size warrants it.

### Sort button → dropdown
Options with clickable direction toggle (↕ reverses):
- Mutant ID (A → Z)
- Target gene (A → Z)
- Date added (Newest)
- Pipeline stage

### List rows
Each row:
```
[3px green border if selected]
KH001               (small, muted, monospace)
CTL0291::Tn         (bold, H3-weight)
                    [unpub] (tag, only if unpublished)  ›
```

Selected row: `#f0fdf4` background + 3px `#16a34a` left border.  
Public users never see unpublished rows (enforced by RLS).

---

## Right Panel — Mutant Detail

White cards on `#f8f8f8` gray background. Intentionally distinct from the gene detail view (which is a plain scroll with section heads). Cards give a dashboard / profile feel.

### Hero (white, top)
```
CTL0291::Tn                    (H1, 24px bold, letter-spacing tight)
KH001                          (11px, monospace, muted)

[C. trachomatis L2/434] [Transposon] [Published]   ← badge row
```

No thumbnail in the hero. Clean typographic treatment.

**Null name fallback:** `mutants.name` can be NULL. If null, display `mutant_id` as the H1 instead (e.g. "KH001") and omit the secondary ID line.

**Initial state:** On first load (no mutant selected), the right panel shows a centered placeholder: collection icon + "Select a mutant from the list." Auto-select the first row once data loads.

### Card: Target Gene(s)
One card per target gene (most mutants: 1 gene; some: 2–3).  
Each card:
```
[AF3 thumbnail 48×48]  CTL0291                   (monospace, bold)
                       Exported protein with unknown function
                       [Hypothetical]             (functional badge)
                                        View in Genomes →
```

Thumbnail: `alphafold_results.thumbnail_path` for the gene's protein. Falls back to a monogram placeholder.  
"View in Genomes →" sets `window.__geneDetailId` and switches to the Genomes tab (existing pattern).  
Gene data fetched by resolving `mutants.target_gene_ids` (UUID[]) → genes + proteins + alphafold_results.

### Card: Recombinant Info & Genotyping (2-column grid)

Left column:
- Creator (resolved from `users.display_name`)
- Plasmid (`plasmid_used`)
- Marker (`marker[]` joined as comma list)
- Mutation method (`mutation_method`, shown if non-null)

Right column:
- Sequenced (`sequenced` boolean → "✓ WGS" / "No")
- Genotyping method (`genotyping_method`)
- Date genotyped (`genotyped_date`)

### Card: Pipeline (horizontal progress bar)
Stages in order: Plasmid · Transform · Cloning · Genotype · In vitro · In vivo · Sequenced

Each stage: colored bar + stage name + date below.  
- Done: green bar + green label + date
- Pending: gray bar + gray label + "—"

Data from `mutant_pipeline` table (lab-member only via RLS). If no pipeline record exists, card is hidden for public users; lab members see "No pipeline record."

Pipeline dates mapped:
| Stage | Column |
|---|---|
| Plasmid | Not tracked — show stage bar as done if `transformed_date` is set |
| Transform | `transformed_date` |
| Cloning | `plaque_cloned_date` |
| Genotype | `genotyped_date` |
| In vitro | `in_vitro_date` |
| In vivo | `in_vivo_date` |
| Sequenced | `sequenced_date` |

### Card: Phenotypes (side-by-side, 2 columns)
Positioned **below** pipeline (phenotype data is sparse; pipeline is more universally populated).

Left card — In vitro:
- "✓ Phenotype observed" (green) or "No phenotype recorded" (gray) or "Not tested" (amber)
- Description text
- Image thumbnails (from `mutant_phenotypes.image_paths[]` where `phenotype_type = 'in_vitro'`)

Right card — In vivo:
- Same structure
- Images where `phenotype_type = 'in_vivo'`

If no `mutant_phenotypes` records exist: both cards show "Not yet tested."

### Card: Stocks (2×2 grid, lab-member only)
Four fixed labs with green/gray dot:
- UW Hybiske (`stocks_uw_hybiske`)
- UW Bob (`stocks_uw_bob`)
- OSU Rockey (`stocks_osu_rockey`)
- KU Hefty (`stocks_ku_hefty`)

Sub-detail: dot only for now (no separate passage/notes field per lab in the schema). `pipeline_notes` is a single free-text field shown in a future Notes card.  
Hidden entirely for public users.

---

## Access Control Summary

| Section | Public | Lab member | Admin |
|---|---|---|---|
| Mutant list | Published only | All | All |
| Hero, gene card, recombinant info | Published only | All | All |
| Pipeline card | Hidden | Visible | Visible |
| Stocks card | Hidden | Visible | Visible |
| Notes (future) | Hidden | Visible | Visible |

All enforcement via existing Supabase RLS policies. No frontend-only gating.

---

## Design Principles

- **No emojis in UI chrome** — use clean SVG icons for section heads, controls, and buttons. Emojis acceptable only inside phenotype data if entered as text.
- **Custom collection icons** — use `L2icon.jpg`, `CMicon.jpg`, `L17icon.jpg`, `Chimeraicon.jpg` in the strip and nav dropdown. Never use emoji placeholders.
- **Distinct from gene view** — gene detail uses a flat scroll with green section-head accents. Mutant detail uses white cards on gray. Shared: monospace locus tags, green selected state, same header chrome.
- **Mobile collapse** — on narrow viewports, left panel takes full width; selecting a row slides to full-screen detail with a back button.
- **Cache busting** — bump `?v=N` in both `index.html` and `app.js` after any JS changes.

---

## Key Files

| File | Role |
|---|---|
| `web/js/views/mutants.js` | Full rewrite — existing skeleton uses wrong column names |
| `web/js/app.js` | Wire nav dropdown + tab routing |
| `web/index.html` | Add collection cards to "Explore Mutants" home section |
| `supabase/migrations/021_mutants_schema.sql` | Rename recombination→deletion, add mutation_method |
| `web/css/app.css` | Any new CSS classes needed |

---

## Out of Scope (this iteration)

- Edit/pencil FAB for admin — deferred
- Notes section — data exists but UI deferred
- Linked publications — deferred
- Mutation method sub-filter within Deletion type — display only for now
