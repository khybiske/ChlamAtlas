# Structure Panel — Design Spec
**Date:** 2026-05-08
**Status:** Approved for implementation

---

## Overview

A fully-featured Structure panel on the gene detail page that supports crystal structures (RCSB PDB), AlphaFold v3 predictions (Hybiske Lab), and AlphaFold v2 predictions (AlphaFoldDB/EBI). The panel occupies 2/3 of a row, with the remaining 1/3 reserved as a blank placeholder for future use.

---

## Layout

The Structure panel is placed in the lower portion of the gene detail page, after the 3-column row (Transcriptomics | EB/RB | Localization). It shares a row with a blank placeholder panel:

```
[ Structure panel — 2/3 width ] [ blank placeholder — 1/3 width ]
```

The blank placeholder has no label or content. It is a white card matching the Structure panel's border and border-radius, reserved for a future panel whose purpose is not yet determined.

The Structure panel itself uses the existing section layout: section header, tab bar, then viewer body. Within the viewer body, the Mol* viewer square sits on the left; metadata sits to the right of it.

---

## Tabs

Three tabs: **Crystal Structure**, **AlphaFold v3**, **AlphaFold v2**.

**Default active tab priority:** Crystal Structure > AlphaFold v3 > AlphaFold v2. The highest-priority tab that has data becomes active on load.

**Unavailable tabs** are rendered grayed out (`color: #d1d5db`, `cursor: not-allowed`, `disabled` attribute) with a `—` suffix on the label. They are never hidden — showing them communicates what structure data exists (or doesn't) for each protein at a glance.

---

## Mol* Viewer Loading

An `IntersectionObserver` watches the Structure section element. When it enters the viewport for the first time, the Mol* JS bundle begins loading from CDN in the background — no user action required.

The thumbnail image is visible immediately as a placeholder (dark background square). Once Mol* has loaded and the structure file is fetched, the thumbnail crossfades into the interactive viewer.

**Abandonment:** If the user scrolls away before loading completes, the pending fetch is aborted (no wasted bandwidth).

**Error fallback:** If Mol* fails to load (CDN unavailable, network error), the thumbnail stays visible permanently, and a small "View on RCSB ↗" or "View on AlphaFoldDB ↗" link appears as a fallback so the panel remains useful.

**Mobile:** The viewer fills full panel width at a fixed height (e.g., 240px) on small screens.

---

## Data Model

### alphafold_results table

Crystal structure records are added as new rows with `af_version = 'crystal'`. No changes to existing columns — one new column is added for pTM scores.

AF3 rows need one new column: **`ptm_score` (float, nullable)**. This is distinct from `homology_score` (which stores mean pLDDT for AF2 rows) because pTM and pLDDT are different metrics on different scales (0–1 vs 0–100). Keeping them in separate columns avoids ambiguity.

**Schema change required:**
```sql
ALTER TABLE alphafold_results ADD COLUMN ptm_score float;
```

### Column usage by af_version

| Column | Crystal | AlphaFold v3 | AlphaFold v2 |
|---|---|---|---|
| `af_version` | `'crystal'` | `'AF3'` | `'AF2'` |
| `mmcif_path` | `https://files.rcsb.org/download/{PDB_ID}.cif` | GitHub URL | AlphaFoldDB URL |
| `thumbnail_path` | RCSB CDN — pattern uses lowercase PDB ID and chars 2–3 as subdirectory (data script constructs this) | GitHub URL | AlphaFoldDB URL |
| `top_homolog_pdb_id` | PDB ID (primary identifier for this row) | homolog PDB ID | homolog PDB ID |
| `homology_score` | null | null | mean pLDDT (0–100) |
| `ptm_score` | null | pTM score (0–1) | null |
| `top_homolog_description` | null | homolog description | homolog description |
| `homology_method` | null | method (e.g. HHpred) | method |
| `inferred_function` | null | inferred function text | inferred function text |

### Crystal structure data population

A data script (`data/import_crystal_structures.js`) inserts 36 rows from the following list. For proteins with multiple PDB IDs, the **first listed** is used as the primary record. The extras are flagged with a comment for Kevin's review.

**CT-L2 (CTL locus tags):**
| Locus tag | PDB ID |
|---|---|
| CTL0140 | 4ILQ |
| CTL0246 | 6MRN |
| CTL0247 | 5B5Q |
| CTL0276 | 6UXD |
| CTL0505 | 6UXC |
| CTL0515 | 4QAQ |
| CTL0548 | 3QH6 |
| CTL0655 | 4ILO |
| CTL0700 | 4QL6 |
| CTL0847 | 4MLK |
| CTL0851 | 6MAB |
| CTL0886 | 5UE0 |
| CTL0894 | 2M1B |

**CT-D (CT locus tags):**
| Locus tag | Primary PDB ID | Flagged extras |
|---|---|---|
| CT045 | 6OME | — |
| CT067 | 6NSI | — |
| CT091 | 3T7Y | — |
| CT116 | 5TP1 | — |
| CT119 | 6E6A | — |
| CT170 | 6V82 | — |
| CT171 | 6V82 | shares PDB with CT170 — review |
| CT220 | 7KM2 | — |
| CT243 | 2IU8 | — |
| CT381 | 3DEL | — |
| CT390 | 3ASA | — |
| CT407 | 6PTG | — |
| CT505 | 6OK4 | 6WYC, 6X2E — review |
| CT585 | 6NCR | — |
| CT610 | 1RCW | — |
| CT664 | 3GQS | 4QO6 — review |
| CT670 | 3K29 | — |
| CT706 | 6X60 | — |
| CT736 | 3N08 | — |
| CT772 | 6WE5 | — |
| CT828 | 1SYY | 2ANI, 4D8F — review |
| CT858 | 3DJA | — |

---

## Panel Content by Tab

### Crystal Structure tab

- **Viewer:** Mol* loaded from `mmcif_path` (RCSB CIF URL) via IntersectionObserver
- **Thumbnail:** RCSB CDN image (`thumbnail_path`)
- **Metadata (right of viewer):**
  - Source label: `Crystal Structure · RCSB PDB` (small, gray, uppercase)
  - PDB ID: large monospace (`DM Mono`, ~22px)
  - Resolution and method if fetchable from RCSB API (e.g., `X-ray crystallography · 1.90 Å`) — omit gracefully if not available
  - **No confidence score** — pLDDT/pTM are not applicable to experimental structures
- **External links (gray pill style):**
  - `RCSB {PDB_ID} ↗`
  - `AlphaFoldDB ↗` (links to the protein's AlphaFoldDB page via UniProt ID — omit if UniProt ID not present)

### AlphaFold v3 tab

- **Viewer:** Mol* loaded from `mmcif_path` (GitHub URL)
- **Thumbnail:** GitHub thumbnail (`thumbnail_path`)
- **Metadata (right of viewer):**
  - Source label: `AlphaFold v3 · Hybiske Lab`
  - **pTM score:** displayed as a color-coded number (see Color Scale below), ~16px monospace, with label `pTM score` in small gray uppercase beside it
  - Top homolog name (bold, ~10.5px) if present
  - Homolog details line: `RCSB PDB: {id} · Method: {method}` (gray, ~9.5px)
  - Inferred function box: green left-border callout box, `Inferred function:` bold label in brand green
- **External links (gray pill style):**
  - `RCSB {PDB_ID} ↗` (if top_homolog_pdb_id present)
  - `AlphaFoldDB ↗`
  - `Download mmCIF ↗`

### AlphaFold v2 tab

- **Viewer:** Mol* loaded from `mmcif_path` (AlphaFoldDB URL)
- **Thumbnail:** AlphaFoldDB thumbnail (`thumbnail_path`)
- **Metadata (right of viewer):**
  - Source label: `AlphaFold v2 · AlphaFoldDB`
  - **Mean pLDDT:** color-coded number with qualitative label (Very high / High / Low / Very low) per AlphaFoldDB thresholds
  - Top homolog and inferred function if present (same layout as v3)
- **External links (gray pill style):**
  - `RCSB {PDB_ID} ↗` (if present)
  - `AlphaFoldDB ↗`

---

## Confidence Score Color Scale

Follows the AlphaFold convention: **orange → yellow → light blue → dark blue** (low to high confidence).

### pLDDT (AlphaFold v2, 0–100)

| Range | Qualitative label | Color |
|---|---|---|
| > 90 | Very high | Dark blue `#1d4ed8` |
| 70–90 | High | Light blue `#60a5fa` |
| 50–70 | Low | Yellow `#f59e0b` |
| < 50 | Very low | Orange `#f97316` |

### pTM (AlphaFold v3, 0–1)

Interpolated across the same four-stop palette:

| Range | Color |
|---|---|
| ≥ 0.8 | Dark blue `#1d4ed8` |
| 0.6–0.8 | Light blue `#60a5fa` |
| 0.4–0.6 | Yellow `#f59e0b` |
| < 0.4 | Orange `#f97316` |

The color scale legend is **not shown on the site** — the color-coded value is self-evident to the target audience. No tooltip or legend is needed.

---

## External Links Style

All external links in the Structure panel use the **gray pill style**: `color: #6b7280`, `border: 1px solid #d1d5db`, `background: #f9fafb`. Green is reserved for active/filtered states elsewhere on the page and must not be used for external links.

---

## Implementation Tasks (for writing-plans)

1. **DB migration:** Add `ptm_score float` column to `alphafold_results`
2. **Data script:** `data/import_crystal_structures.js` — insert 36 crystal rows
3. **Layout change:** Wrap Structure section in 2/3 + 1/3 row; add blank placeholder panel
4. **Tab logic:** Update `renderDetailStructure` — handle `af_version = 'crystal'`, fix tab priority (Crystal > v3 > v2), render correct metadata per tab
5. **Mol* loading:** Replace button-click trigger with `IntersectionObserver`; implement crossfade; add error fallback
6. **Scores:** Add pTM display for v3 (new `ptm_score` column); update v2 to show mean pLDDT with qualitative label and correct color scale
7. **Link style:** Change external link pills to gray throughout Structure panel
8. **Naming:** Replace all "AF2"/"AF3"/"AF" abbreviations in UI with "AlphaFold v2"/"AlphaFold v3"/"AlphaFold"
