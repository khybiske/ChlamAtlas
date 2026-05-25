# Structure Alignment Tool — Design Spec
**Date:** 2026-05-25  
**Status:** Ready for implementation  

---

## Overview

A dedicated tool allowing users to load 2–3 AlphaFold or experimental crystal structures into a shared Mol* 3D viewer for visual comparison. Superposition is performed manually via Mol*'s built-in right-click menu, with a prominent in-page hint guiding the user to that action.

Primary use cases:
- AF2 vs AF3 model comparison for the same protein
- Ortholog comparison across CT-L2, CT-D, and CM
- Crystal structure vs AF2/AF3 comparison

---

## Entry Point

Tools dropdown → **Structure Alignment** (currently disabled with "soon" badge). On release, remove the `disabled` attribute and wire the click handler to `activateTab('structure-alignment')` in `app.js`.

A gene detail panel can seed the tool by setting `state.structureAlignmentSeedGeneId` before navigating — the tool picks this up on load and pre-populates the first gene pick, identical to the sequence alignment seed pattern.

---

## Page Layout (stacked)

The page has two phases: **building** (picker visible, viewer hidden) and **loaded** (picker collapsed, viewer visible).

### Building phase

```
┌─────────────────────────────────────────────┐
│ Structure Alignment                [h1]      │
│ Compare 2–3 structures…            [sub]     │
├─────────────────────────────────────────────┤
│ [Gene search input]                         │
│                                             │
│ ┌─ Entry card: confirmed pick ────────────┐ │
│ │ CT_L2_0001 · nqrA  ●CT-L2  [AF2] pick  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ Suggestion panel ──────────────────────┐ │
│ │ Same gene, other models                 │ │
│ │  CT_L2_0001  [AF2 ✓] [+AF3] [Crystal▪] │ │
│ │ ─── or pick an ortholog ─────────────── │ │
│ │  CT_D_0001   [+AF2] [+AF3] [Crystal▪]  │ │
│ │  CM_0001     [+AF2] [AF3▪] [Crystal▪]  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [＋ Add another gene]                       │
│ [Load structures ▶]   (enabled at 2+)      │
└─────────────────────────────────────────────┘
```

### Loaded phase

```
┌─────────────────────────────────────────────┐
│ [●CT_L2 nqrA AF2] [●CT_D nqrA AF3]  [+Add] │  ← compact chip strip
├─────────────────────────────────────────────┤
│ 💡 Right-click any chain → Superpose        │  ← amber hint (dismissible)
├─────────────────────────────────────────────┤
│                                             │
│              Mol* 3D viewer                 │  ← ~480px tall, full width
│         (dark bg by default)                │
│                                             │
│  [⤢ expand] [☀/🌙 bg toggle]  ← toolbar   │
│  ● CT_L2 AF2   ● CT_D AF3     ← legend     │
└─────────────────────────────────────────────┘
```

---

## Picker — Approach A Detail

### Gene search
- Typeahead input, same as sequence alignment tool (`genes` table: `locus_tag`, `gene_name`, `gene_symbol`)
- Results show locus tag, gene name, strain color dot

### On first pick (primary gene)
- Gene is added as a confirmed "your pick" entry card
- A **suggestion panel** renders immediately below showing:
  - **Same gene, other models** (one row): buttons for AF2, AF3, Crystal — greyed/strikethrough if not available for that protein, ✓ checkmark + disabled if already in the list
  - **Divider: "or pick an ortholog"**
  - **One row per known ortholog** (from `orthologs` table), each with AF2 / AF3 / Crystal quick-add buttons. Availability determined from `alphafold_results` and `proteins` tables.

### Subsequent picks (manual search)
- Searching and picking another gene adds it directly as a confirmed entry; no ortholog auto-fill for manually added genes (to avoid noise)
- The suggestion panel updates only on the primary pick

### Entry limits
- Minimum 2 to enable "Load structures"
- Maximum 3; the "+ Add another gene" button hides at 3
- Remove buttons on all non-primary entries

### Structure availability rules
| Source | Available when | URL source |
|--------|---------------|------------|
| AF2 | `proteins.uniprot_id` is set | Fetch `https://alphafold.ebi.ac.uk/api/prediction/{uniprotId}` → `[0].cifUrl` (versioned URL from AFDB API) |
| AF3 | `alphafold_results.mmcif_path` is set (AF3 row) | GitHub raw URL from `mmcif_path` |
| Crystal | `alphafold_results.top_homolog_pdb_id` is set | `https://files.rcsb.org/download/{pdbId}.cif` |

Fetch availability data for the primary gene and its orthologs in a single query when the suggestion panel renders.

---

## Viewer

### Mol* instance
- Reuse `_loadMolstarBundle()` from `genomes.js` (shared singleton bundle promise — import or duplicate)
- Create one `molstar.Viewer` instance per "Load structures" click (destroy previous if re-loading)
- Call `v.loadStructureFromUrl(url, 'mmcif')` once per selected structure — Mol* accumulates them into the same scene
- Apply the same toolbar suppression CSS as the gene detail viewer (`Screenshot`, `Toggle Controls Panel`, `Settings / Controls Info`)

### Background toggle
- A small `☀ / 🌙` icon button rendered in the viewer wrapper (not inside Mol*'s own toolbar)
- Toggles the viewer container's CSS background between `#0a1628` (dark) and `#ffffff` (light)
- Mol* renders transparently over the container background, so this works without touching the plugin API

### Superpose hint
- Amber callout box: `💡 Right-click any chain in the viewer → Superpose to align structures`
- Rendered between the chip strip and the viewer
- Dismissed by clicking an × button; dismissal stored in `sessionStorage` so it doesn't re-appear within the same session

### Legend
- Floating overlay at bottom-left of the viewer showing one colored dot + label per loaded structure
- Colors derived from strain color map (CT-L2 green, CT-D purple, CM blue) — same constants as sequence alignment tool

---

## State

```js
let structState = {
  entries: [],      // { id, gene, modelType, url, status: 'confirmed'|'suggested', isPrimary }
  loaded: false,    // true after "Load structures" clicked and viewer initialized
  bgDark: true,
  hintDismissed: false,
};
```

---

## App wiring

In `app.js`:
1. Import `renderStructureAlignment` from `./views/structure-alignment.js`
2. Add `'structure-alignment'` to `TABS` array and `RENDERERS` map
3. Add `<div id="tab-structure-alignment" class="hidden"></div>` to `index.html`
4. In `showToolsPopover()`, replace the disabled Structure Alignment button with an active one that calls `activateTab('structure-alignment')`
5. Handle `state.structureAlignmentSeedGeneId` on render (same pattern as `alignmentSeedGeneId`)

---

## Implementation file

`web/js/views/structure-alignment.js`

Follows the same module pattern as `alignment.js`:
- Module-level state object
- `renderStructureAlignment(container)` as the exported entry point
- All globals namespaced under `window._strAln*` for inline `onclick` handlers
- No external dependencies beyond Supabase client and Mol* bundle

---

## Out of scope

- Automatic programmatic superposition (deferred — requires lower-level Mol* plugin API)
- RMSD / TM-score display (no server-side alignment, so scores unavailable)
- Export / download of the superposed structure
- Sequence view synchronized with the 3D viewer
