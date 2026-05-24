# Sequence Alignment Tool — Design Spec

**Date:** 2026-05-24  
**Status:** Approved  
**Scope:** Standalone alignment page accessible from the navbar Tools tab

---

## Overview

A standalone sequence alignment tool at `/tools/alignment` (routed via the existing SPA router). Users pick DNA or amino acid sequences from ChlamAtlas genes, run a multiple sequence alignment via the EMBL-EBI Clustal Omega REST API, and view results with export options. The primary use case is cross-strain ortholog comparison, but the tool is open-ended enough to align arbitrary genes within or across strains.

---

## Entry Points

- **Navbar Tools tab** — activates (currently disabled/greyed) and routes to the alignment page
- **Gene detail page** — an "Align orthologs" button pre-populates the picker with that gene and its known orthologs (suggested state, ready to confirm or remove)

---

## Page Layout

Single scrolling page. No modals, no multi-step wizard navigation.

```
┌─────────────────────────────────┐
│  Navbar (Tools tab active)      │
├─────────────────────────────────┤
│  Page header: "Sequence         │
│  Alignment"                     │
├─────────────────────────────────┤
│  Step 1: DNA / AA toggle        │
├─────────────────────────────────┤
│  Step 2: Gene picker            │
│    Search box (typeahead)       │
│    Gene list (confirmed +       │
│    suggested entries)           │
│    + Add another gene           │
│    ▶ Run alignment button       │
├─────────────────────────────────┤
│  Step 3: (spinner while         │
│  waiting for EBI response)      │
├─────────────────────────────────┤
│  Step 4: Results                │
│    Stats cards                  │
│    Alignment panel              │
│    Export buttons               │
└─────────────────────────────────┘
```

Results appear below the picker in the same page; the picker stays visible so users can modify and re-run.

---

## Step 1 — Sequence Type

Pill toggle: **DNA** | **Amino Acid**

- DNA: fetches `genes.dna_sequence` from Supabase
- AA: fetches `proteins.aa_sequence` from Supabase (via the gene's associated protein row)
- Changing type after sequences are selected clears any cached results but keeps the gene list

---

## Step 2 — Gene Picker

### Search

- Single typeahead input searches across all strains simultaneously
- Matches on: `locus_tag`, `gene_name`, `gene_symbol`, `aliases[]`
- Dropdown shows matching genes with locus tag, gene name (if set), and strain badge
- Selecting a gene from the dropdown triggers ortholog auto-fill (see below)

### Entry states

Each gene in the list has one of two states:

**Confirmed** (green, solid border)
- The gene the user explicitly searched and selected ("your pick")
- Genes the user has clicked ✓ to lock in
- Genes added via "+ Add another gene" manually
- No removal button for "your pick"; all other confirmed entries show ✕

**Suggested** (amber, dashed border, labelled "suggested ortholog")
- Orthologs of the confirmed primary gene, auto-populated on selection
- Each shows: ✓ button to confirm (turns green) and ✕ button to remove
- Removed suggestions disappear immediately; they do not reappear unless the user re-runs the search

### Ortholog auto-fill

When the user selects a gene, the app queries the `orthologs` table for all linked genes and adds them as suggested entries. If no orthologs exist in the DB, no suggestions appear (no error — just the single confirmed gene).

### "+ Add another gene"

Opens a second typeahead search. The selected gene is added as a confirmed entry (no suggested state — manually added genes are always confirmed). Supports arbitrary within-strain or cross-strain additions.

### Run button

- Enabled when ≥ 2 sequences are present (confirmed or suggested — suggested entries are included unless removed)
- Label: **▶ Run alignment**
- Disabled with explanatory text if < 2 sequences

---

## Step 3 — Running the Alignment

### API

**EMBL-EBI Clustal Omega REST API** (`https://www.ebi.ac.uk/Tools/services/rest/clustalo`)

Workflow:
1. Fetch `dna_sequence` or `aa_sequence` for each selected gene from Supabase
2. Build a FASTA string with locus tags as sequence IDs
3. POST to EBI `/run` endpoint with `sequence=<fasta>`, `outfmt=clustal_num`, `stype=dna` or `protein`
4. Poll `/status/<jobId>` every 3 seconds until status is `FINISHED`
5. Fetch result from `/result/<jobId>/aln-clustal_num`
6. Parse and render

### Loading state

Show a spinner with a status message that updates as polling progresses:
- "Submitting sequences…"
- "Waiting for alignment… (this usually takes 5–30 seconds)"
- "Retrieving results…"

### Error handling

- EBI API unavailable or timeout (>120s): show a user-friendly error message with a retry button
- Missing sequence data for a gene: warn the user before running ("CTL0522 has no DNA sequence on file — remove it or switch to AA")

---

## Step 4 — Result Display

### Summary stats row

Four cards displayed horizontally (wrap on mobile):

| Card | Value | Styling |
|---|---|---|
| Identity % | Parsed from alignment | Conditional color (see below) |
| Alignment length | Total aligned columns | Neutral grey |
| Gaps | Total gap characters | Neutral grey |
| Sequences | Count of sequences | Neutral grey |

**Identity % color scale:**
- ≥ 90%: green card (`#f0fdf4` background, `#15803d` text)
- 70–89%: amber card (`#fffbeb` background, `#b45309` text)
- < 70%: red card (`#fff1f2` background, `#be123c` text)

Identity is computed as the fraction of alignment columns where all sequences share the same residue.

### Sequence legend

Small colored dots + labels for each sequence: CT-L2 (dark green), CT-D (blue), CM (amber). Matches alignment row label colors.

### Alignment panel

Horizontally scrollable monospace panel. Sequences rendered in blocks of 60 columns with position numbers.

**Default view: Differences-only**
- Positions identical across all sequences shown as `·` (muted grey)
- Divergent positions show the actual base/residue, highlighted in amber (`#fef3c7` background)
- DNA base coloring at divergent sites: A=green, T=red, G=amber, C=blue
- AA coloring at divergent sites: ClustalX residue-type color scheme

**Toggle: Full color view**
- All positions shown with base/residue coloring
- Conservation histogram below each block (dark green = fully conserved, light green = partially conserved)

Toggle button sits above the alignment panel, right-aligned: "Show full color view" / "Show differences only"

### Export buttons

- **⬇ FASTA** — aligned sequences in FASTA format
- **⬇ Clustal** — raw Clustal format output from EBI
- **⬇ Phylip** — fetch alternate format from EBI `/result/<jobId>/phylip`
- **📋 Copy to clipboard** — copies FASTA to clipboard

---

## Access Control

The alignment tool is publicly accessible. No authentication required. Sequence data is already public. The EBI API is a public service.

---

## Routing

Extend the existing SPA router in `web/js/app.js`:
- New route: `tools/alignment` (or hash `#tools/alignment` following existing pattern)
- New view file: `web/js/views/alignment.js`
- Navbar Tools tab: remove `disabled` attribute, add click handler routing to this view

---

## Files to Create / Modify

| File | Change |
|---|---|
| `web/js/views/alignment.js` | New — full alignment tool view |
| `web/js/app.js` | Add route + activate Tools tab |
| `web/index.html` | Remove `disabled` from Tools nav button |

---

## Out of Scope

- Phylogenetic tree rendering (export only, no in-browser tree)
- Saving alignment history
- Pairwise-only mode (Clustal Omega handles 2+ sequences natively)
- Custom alignment parameters (gap penalties, etc.) — use EBI defaults
