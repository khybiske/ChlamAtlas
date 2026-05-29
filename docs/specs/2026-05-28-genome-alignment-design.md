# Genome Alignment Tool — Design Spec
**Date:** 2026-05-28  
**Status:** Approved, ready for implementation

---

## Overview

A synteny viewer comparing two Chlamydia genomes side-by-side, added as a third entry in the Tools dropdown. Named "Genome Alignment" to match the existing "Sequence Alignment" and "Structure Alignment" tools. The tool emphasizes the strong synteny shared across Chlamydia species while making divergence (absent orthologs, rearrangements) immediately visible.

---

## Goals

- Let users scroll through the full chromosome of any two strains, seeing ortholog pairs connected by ribbons and gaps where orthologs are absent
- Highlight functional category clusters visually (T3SS block, Inc block, Translation block, etc.) so blocks of conserved function stand out at a glance
- Provide low-friction navigation for 1,100+ gene genomes without requiring users to know a specific region of interest
- Field-first for the Chlamydia community; especially valuable when Cpn is added as a fourth strain

---

## Out of Scope (this version)

- % identity calculation (Needleman-Wunsch or otherwise) — deferred to v2
- Virtual scrolling — paginated DOM append is sufficient
- Same-strain comparison
- Plasmid genes (excluded; chromosome only)
- Mobile layout (deferred to the broader mobile pass)

---

## Architecture

### New file
`web/js/views/genome-alignment.js` — module pattern identical to `alignment.js` and `structure-alignment.js`.

### Registration
- Added to `TABS` array in `app.js` as `'genome-alignment'`
- Added to `RENDERERS` map as `renderGenomeAlignment`
- Added to `showToolsPopover()` in `app.js` as a third entry in the Tools dropdown

### Data flow

1. **On mount:** Fetch all strains from `strains` table → populate Reference and Comparison pickers
2. **On strain pair selection:** 
   - Fetch all chromosome genes for the reference strain: `genes` table filtered by `strain_id`, `sort_index < 871`, ordered by `sort_index`. Store as `_refGenes[]`.
   - Fetch all chromosome genes for the comparison strain: same query. Store as `_cmpGenes[]`.
   - Fetch all ortholog pairs linking the two strain IDs from `orthologs` table. Build `Map<refGeneId, cmpGeneId>` for O(1) lookup.
3. **Render first page** (100 reference genes), then use `IntersectionObserver` on a sentinel element at the bottom to load the next page as the user scrolls.

### Pagination
- Page size: 100 reference genes
- Each page: slice `_refGenes`, resolve comparison ortholog for each via the Map, append rows to DOM, add SVG path elements to the ribbon SVG
- No "load more" button — scroll-triggered via `IntersectionObserver`

---

## UI Layout

### Top bar (sticky, two rows)

**Row 1 — Strain pickers + search:**
```
[ 🔵 CT L2/434 ▼ ]  ⇄  [ Comparison genome ▼ ]      [ 🔍 Search gene… ]
```
- Strain pickers show strain icon + common name, styled with strain color border (matching existing strain color system)
- The ⇄ icon between pickers is non-interactive (not a swap button)
- Search box: filters reference gene list by `locus_tag` or `gene_name`, scrolls to and highlights first match

**Row 2 — Jump chips:**
```
JUMP TO: [CTL0001] [CTL0100] [CTL0200] … [CTL0870 (end)]
```
- Chips generated dynamically from `_refGenes` at every 100th gene by `sort_index`
- Clicking a chip synchronously renders all intermediate pages up to that position, then scrolls to the target row
- Last chip always shows the final gene (labeled with locus tag + "(end)")

**Row 3 — Category legend:**
- Colored swatches + `FUNC_LABELS` abbreviations for all 17 categories
- Reuses `CATEGORY_COLORS` and `FUNC_LABELS` from `genomes.js` (copy constants into new file)

### Three-column body

| Column | Width | Content |
|--------|-------|---------|
| Reference | 38% | Gene rows, left-anchored |
| Ribbon | 24% | SVG, absolutely positioned, grows with list |
| Comparison | 38% | Gene rows, left-anchored |

### Gene rows

- Height: ~20px (compact)
- Font: monospace for locus tags
- Left border: 4px solid, color = `CATEGORY_COLORS[functional_category]` (default `#E5E7EB`)
- Background tint: category color at ~6% opacity
- Named/characterized genes: slightly bolder weight, colored text matching category
- Uncharacterized genes: muted gray text

**Comparison-side ortholog rows** use the *same* functional category color as their reference counterpart (same gene, same function).

**Gap rows** (no ortholog in comparison genome):
- Reference side: renders normally
- Center: faint ✕ circle at midpoint
- Comparison side: `— no ortholog —` in light gray italic, no border, no background tint

### Ribbon (SVG)

- One `<path>` per ortholog pair: cubic bezier from ref row midpoint to cmp row midpoint
- Stroke color: `CATEGORY_COLORS[functional_category]` at ~55% opacity
- Stroke width: 7–9px (named genes slightly wider than uncharacterized)
- Gap indicator: small circle (radius 5px) at center x, filled light red (`#fca5a5`)
- SVG is in-flow inside the center column div; its `height` attribute is updated on each page append to match the total rendered list height
- Rearrangements (crossing ribbons) are intentional signal — no special handling

### Expand-on-click

Clicking any gene row expands that pair in place (both reference and comparison sides expand together):
- Full gene name
- Product description
- Functional category badge (uses existing `CATEGORY_BADGE` styles from `genomes.js`)
- `→ Gene detail` link (navigates to gene detail in the Genomes tab)
- Ribbon highlights that pair's connector (increased stroke width + opacity)
- Clicking again collapses

Only one pair expanded at a time — expanding a new row collapses the previous one.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No strains selected | Centered empty state: "Select two genomes above to begin." |
| Same strain on both sides | Inline warning below pickers: "Select two different genomes." No load. |
| Reference gene has no ortholog | Gap row on comparison side, ✕ in ribbon |
| Comparison gene not in reference | Not shown (tool is anchored to reference sort_index order) |
| Rearrangement (out-of-order ortholog) | Crossing ribbon lines — intentional, no special handling |
| Supabase load error | Error banner below top bar with retry button |
| Plasmid genes (sort_index ≥ 871) | Excluded from both sides; small footer note: "Plasmid genes excluded." |

---

## Reused Patterns & Assets

| Resource | Source | Usage |
|----------|--------|-------|
| `CATEGORY_COLORS` | `genomes.js` | Row border, background tint, ribbon stroke |
| `CATEGORY_BADGE` | `genomes.js` | Expanded row badge style |
| `FUNC_LABELS` | `genomes.js` | Category legend abbreviations |
| Strain icons + colors | `genomes.js` / `strains` table | Strain picker display |
| `openNavPopover()` / Tools dropdown | `app.js` | Add third Tools entry |
| `activateTab()` | `app.js` | Navigation |
| Error banner pattern | Existing views | Load failure UI |

---

## Future Work (explicitly deferred)

- **% identity:** Client-side Needleman-Wunsch on AA sequences, computed on expand. Requires `proteins.aa_sequence` join. Shown as a colored chip in the expanded row (green ≥ 90%, yellow 70–89%, red < 70%).
- **Virtual scrolling:** Replace paginated DOM append if performance degrades with Cpn (~1,000 additional genes).
- **Mobile layout:** Part of the broader mobile design pass (backlog item #12).
- **Download / export:** TSV export of the ortholog comparison table.
