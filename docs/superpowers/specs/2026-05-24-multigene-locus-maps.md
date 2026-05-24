# Spec: Per-Gene Locus Maps for Multi-Gene Mutants

**Date:** 2026-05-24  
**Status:** Approved for implementation

---

## Problem

Mutants with 2 target genes (e.g. UWCM035 Tn::ompBsucD) currently fetch a single genomic neighborhood spanning from the lowest to highest sort_index across all target genes. For genes far apart on the chromosome this produces a zoomed-out map that shows hundreds of genes and is unreadable.

---

## Solution

Fetch independent ±4 neighborhoods per gene and embed each map directly inside its gene card (Option B layout). Three cases:

| # target genes | Cards | Maps |
|---|---|---|
| 1 | Single card | Standalone map below (unchanged) |
| 2 | Two cards side by side | One map embedded at the bottom of each card |
| 3+ | Compact list | No maps |

---

## Data Changes

**File:** `web/js/views/mutants.js` — neighborhood fetch block (~line 644)

**Current:** One fetch spanning `minIdx−4` to `maxIdx+4` across all genes → single `neighborhood` array.

**New:**
- 1 gene: same as current (single fetch, ±4 around its `sort_index`)
- 2 genes: two parallel fetches via `Promise.all`, each ±4 around its own gene's `sort_index`. Returns `neighborhoods: [nb0, nb1]` — one array per gene, index-matched to `genes[]`.
- 3+ genes: skip fetch entirely. `neighborhoods = []`.

---

## Rendering Changes

**`geneCardsHTML(genes, neighborhoods, mutationType)`** — gains two new parameters.

- 1-gene case: unchanged (no neighborhoods passed to card, standalone map rendered separately as before)
- 2-gene case: each card div gets a `<div class="mut-gene-map-strip">` appended after the gene info row, containing the SVG output of a new helper `singleGeneMapSVG(gene, neighborhood, mutationType)`. The strip is separated from the info row by a `border-top: 1px solid #f3f4f6`.
- 3+ gene case: list layout, no map strip.

**`singleGeneMapSVG(gene, neighborhood, mutationType)`** — new helper. Extracts the existing SVG-building logic from `geneLociMapHTML` but scoped to a single gene and its neighborhood. Returns an SVG string (no outer section wrapper).

**`geneLociMapHTML`** — unchanged in signature. Called only for the 1-gene case from the detail renderer.

**Call site (~line 673):**
```js
${geneCardsHTML(genes, neighborhoods, m.mutation_type)}
${genes.length === 1 ? geneLociMapHTML(genes, neighborhoods[0] ?? [], m.mutation_type) : ''}
```

---

## Files Changed

| File | Change |
|---|---|
| `web/js/views/mutants.js` | Neighborhood fetch, `geneCardsHTML`, new `singleGeneMapSVG` helper, call site |

---

## Out of Scope

- Single-gene mutants (behavior unchanged)
- 3+ gene mutants (list already exists, no maps added)
- Edge case where 2 genes are adjacent (each map shows correct independent ±4 neighborhood; overlap is acceptable)
