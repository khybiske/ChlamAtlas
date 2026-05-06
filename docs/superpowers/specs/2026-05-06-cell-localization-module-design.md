# Cell Localization Module — Design Spec

**Date:** 2026-05-06  
**Status:** Approved

## Overview

Wire the SwissBioPics `<sib-swissbiopics-sl>` web component into the gene detail panel's Cell Localization column. Replace the current placeholder with a live bacterial cell diagram highlighting the protein's subcellular compartment, with localization pills moved from the Protein panel to live alongside the diagram.

## Data Model

Two new columns on `proteins`:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `subcellular_location_sl` | `text[]` | `null` | Array of SL term IDs (e.g. `["SL-0086"]`) used by SwissBioPics. Authoritative resolved value. |
| `localization_curated` | `boolean` | `false` | When `true`, protects this row from being overwritten by future fetch script re-runs. |

The existing `localization text` column is unchanged — it holds the raw UniProt string and is used for reference and spot-checking.

## Data Pipeline

A new script `data/fetch_localization.js` populates `subcellular_location_sl` in three passes:

### Pass 1 — UniProt API fetch

For each protein where `uniprot_id IS NOT NULL` and `localization_curated = false`, query:

```
GET https://rest.uniprot.org/uniprotkb/{uniprot_id}.json
```

Extract SL term IDs from:
```
entry.comments[type="SUBCELLULAR_LOCATION"].locations[*].location.id
```

This gives SL term IDs directly (e.g. `SL-0086`) — no text-to-ID mapping needed.

Store the array in `subcellular_location_sl` for that protein.

### Pass 2 — Flag-based overrides

After the fetch, apply Chlamydia-specific biological corrections that supersede generic UniProt annotations. These are applied even over successfully fetched UniProt data:

| Condition | Override value | Reason |
|---|---|---|
| Gene `functional_category = 'Inclusion membrane protein'` | `["SL-0204"]` (Secreted) | Incs are T3SS-secreted into the inclusion membrane — UniProt incorrectly places them in the bacterial cell membrane |
| Gene `is_t3_secreted = true` | `["SL-0204"]` (Secreted) | Type III secreted proteins exit the bacterium |

### Pass 3 — Spot-check output

Print a comparison table of proteins where the newly fetched SL terms disagree with the existing `localization` text, so discrepancies can be reviewed before committing. Script supports `--dry-run` flag for preview-only mode.

### Re-run safety

The script is re-runnable. Any row with `localization_curated = true` is skipped entirely, preserving manually curated values.

## Override Hierarchy (priority order)

1. **Community annotations** (future) — written by authenticated users via annotation form; sets `localization_curated = true`
2. **Flag-based overrides** — Inc genes and T3SS genes (applied by script)
3. **UniProt API data** — fetched by script
4. **Null** — hypotheticals and proteins with no UniProt ID and no flags

## UI Changes

### Protein panel

Remove the localization pills block. Panel now shows product → subunit structure only.

### Cell Localization panel (3rd column of the 3-col row — layout unchanged)

Replace `renderDetailLocalizationPlaceholder()` with a real render function that shows:

1. **SwissBioPics diagram** — `<sib-swissbiopics-sl>` web component loaded via CDN script tag in `index.html`. Attributes: `taxid="813"`, `sls` set to comma-joined `subcellular_location_sl` array (e.g. `sls="SL-0086,SL-0204"`).

2. **Localization pills** — same pill style as current Protein panel implementation, rendered below the diagram.

3. **Source badge** — small tag indicating data provenance: `UniProt` or `Curated`. Shown beside the section header or below the pills.

### Fallback states

| Condition | Display |
|---|---|
| `subcellular_location_sl` populated | SwissBioPics diagram + pills + source badge |
| Null/empty + gene is hypothetical | "Location unknown" placeholder (◎ icon, muted text) |
| Null/empty + gene is NOT hypothetical | Pills from raw `localization` text if available, no diagram; "Location unknown" if neither |

The third state should not occur after the fetch script runs against all non-hypothetical proteins, but is included as a graceful fallback.

## Future Edit Hook

The annotation editing form (planned Phase 2 feature) will write to `subcellular_location_sl` and set `localization_curated = true`. No further data model changes needed — the column is designed for this from day one.

## Key Technical Notes

- SwissBioPics CDN: `https://www.swissbiopics.org/static/swissbiopics.js` (load once in `index.html`)
- taxid 813 = *Chlamydia trachomatis* (CT-L2 and CT-D)
- taxid 243161 = *Chlamydia muridarum* Nigg (CM) — pass the correct taxid per gene's strain
- SL-0204 = Secreted (used for Inc and T3SS proteins)
- SL-0086 = Cytoplasm
- SL-0039 = Cell inner membrane
- SL-0116 = Cell outer membrane
- SL-0133 = Periplasm
- SL-0026 = Cell membrane (generic)
- Supabase returns `proteins` as an object not array (one-to-one FK) — access as `gene.proteins.subcellular_location_sl`
