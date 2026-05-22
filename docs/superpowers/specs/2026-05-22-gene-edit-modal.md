# Gene Edit Modal — Design Spec
**Date:** 2026-05-22  
**Status:** Approved  

---

## Overview

A centered modal that lets any authenticated ChlamAtlas user edit gene and protein record fields directly from the gene detail panel. Edits are written live to Supabase immediately on save. An audit log records every change for admin rollback review.

---

## Trigger & Access

- A **pencil icon button** is added to the gene detail hero, to the right of the existing star (favorites) button — same SVG icon and style used in the mutant detail header.
- The button is **only rendered when `state.user` is set** (authenticated). Unauthenticated visitors never see it.
- Any authenticated user (public account, lab member, or admin) can open and save edits.
- There is no per-gene assignment or role gating beyond authentication.

---

## Modal Layout

**Type:** Centered modal with dark semi-transparent backdrop.  
**Dismiss:** ✕ button (top-right), clicking the backdrop, or pressing ESC. No "discard changes?" confirmation — the form is short enough that re-entry is low cost.  
**Scroll:** The modal body scrolls internally if content overflows (primarily relevant when Advanced is expanded on small screens).

### Header
- Title: "Edit Gene"
- Subtitle: `{locus_tag} · {strain}` in monospace

### Primary fields (always visible)

| Field | Input type | Notes |
|---|---|---|
| Gene Name | Text input | Maps to `genes.gene_name` |
| Symbol | Text input (monospace) | Maps to `genes.gene_symbol` |
| Product Description | Textarea (2 rows, resizable) | Maps to `genes.product` |
| Functional Category | `<select>` dropdown | Enum values from existing `CATEGORY_COLORS` map |
| Hypothetical | Checkbox | Maps to `genes.is_hypothetical` |
| Membrane | Checkbox | Maps to `genes.is_membrane_protein` |
| T3 Secreted | Checkbox | Maps to `genes.is_t3_secreted` |
| DNA Binding | Checkbox | Maps to `genes.is_dna_binding` |
| Localization (lab-curated) | `<select>` dropdown | Maps to `proteins.localization_curated`; options match existing SL vocabulary |

`is_characterized` is **never shown** — it is always written as `!is_hypothetical` in the same PATCH.

### Advanced / Technical Fields (collapsed by default)

Clicking the "Advanced Fields" expander reveals protein-level fields. Transcriptomic and proteomic data are not editable (published data, locked in the DB).

**Protein Identity sub-group:**

| Field | Input type | Notes |
|---|---|---|
| UniProt ID | Text input (monospace) | Maps to `proteins.uniprot_id`; validated against `[A-Z][0-9][A-Z0-9]{3}[0-9]` pattern |
| Protein Family | Text input | Maps to `proteins.protein_family` |
| Subunit Structure | Text input | Maps to `proteins.oligomeric_state` |
| Mass (kDa) | Number input | Maps to `proteins.mass_kd` |
| TM Domains | Number input (integer, ≥ 0) | Maps to `proteins.transmembrane_domains` |
| Signal Peptide | Checkbox | Maps to `proteins.signal_peptide` |

**Crystal / PDB Structures sub-group:**

- Existing PDB entries (rows in `alphafold_results` where `af_version = 'PDB'`) are listed with their PDB ID, title, and resolution. Each has a "remove" action.
- An "Add New PDB Entry" input area contains:
  1. A monospace text input for the PDB ID
  2. A **"Look up ↗"** button that calls the RCSB public REST API (`https://data.rcsb.org/rest/v1/core/entry/{pdbId}`) — no API key required
  3. On success: a verified result card showing title, resolution, and year with an **"Add this structure"** confirm button
  4. On failure: an inline error (see Error Handling)
- Clicking "Add this structure" stages the entry; it is committed to `alphafold_results` on modal Save.

### UniProt Sync placeholder

Below the Advanced expander (always visible, not inside it): a dashed-border row with a 🔄 icon, label "Sync with UniProt", subtitle "Coming soon — refresh protein data from UniProt", and a disabled "Sync" button. This communicates the future feature without implying it is functional.

### Footer

- **Cancel** button (left, muted) — dismisses without saving
- **Save Changes** button (right, black) — triggers the save flow
- Error banner appears between the form body and the footer when a save fails (see Error Handling)

---

## Save Flow

1. Client-side validation runs first (see Validation). If any field fails, save is aborted and inline errors are shown — no network request is made.
2. Save button shows a spinner and is disabled during the operation.
3. Collect the diff — only fields that changed from their original loaded values are included in each PATCH.
4. **PATCH `genes`** — writes all changed gene-level fields plus `updated_by` (authenticated user's display name or email). `updated_at` is set by a Postgres `BEFORE UPDATE` trigger on the `genes` table — do not pass it from the client to avoid clock skew. Always writes `is_characterized = !is_hypothetical` when `is_hypothetical` changed.
5. **PATCH `proteins`** — writes all changed protein-level fields. Skipped entirely if no protein fields changed.
6. **INSERT `alphafold_results`** — one row per newly staged PDB entry (`af_version = 'PDB'`, `top_homolog_pdb_id`, title, resolution from RCSB response). Skipped if no PDB entries were added.
7. **DELETE `alphafold_results`** — removes rows for any PDB entries the user marked for removal.
8. **INSERT `gene_edit_log`** — one row recording the full diff (see Audit Log). Written regardless of whether proteins PATCH was needed.
9. On full success: modal closes, gene detail panel re-renders using the updated data.
10. On any failure: modal stays open, spinner clears, error banner shown (see Error Handling).

**Partial write failure:** If the `genes` PATCH succeeds but `proteins` fails, the error message identifies which part failed so the user knows their gene-level changes are already live. No rollback of the successful write — the audit log is the recovery path.

---

## Audit Log

A new table: **`gene_edit_log`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `gene_id` | uuid, FK → genes | |
| `editor_id` | uuid, FK → auth.users | |
| `edited_at` | timestamptz | server `now()` |
| `changes` | jsonb | `{field: {old: value, new: value}}` for every changed field |

**RLS policies:**
- Authenticated users: INSERT only
- Admins: SELECT, UPDATE (for applying rollbacks)
- Public: no access

The `changes` jsonb covers fields across both `genes` and `proteins` in a single record — prefixed by table if needed (e.g., `genes.gene_name`, `proteins.protein_family`) to avoid ambiguity.

---

## Validation

All validation is client-side, fires on Save before any network request.

| Field | Rule | Inline error |
|---|---|---|
| TM Domains | Whole number ≥ 0 | "Must be a whole number (0 or greater)." |
| UniProt ID | Matches `^[A-Z][0-9][A-Z0-9]{3}[0-9]$` if non-empty | "Doesn't look like a valid UniProt ID (e.g. Q3KLD0)." |
| PDB ID (lookup) | 4-character alphanumeric | "PDB IDs are 4 characters (e.g. 5YKG)." |

No other fields are required — all can be cleared (set to null).

---

## Error Handling

Every error message has two parts: **what went wrong** and **what to do next**.

**Save errors** — shown in a red banner above the footer, modal stays open:

| Situation | Message |
|---|---|
| Network timeout / no connection | "Couldn't reach the server. Check your internet connection and try again." |
| Supabase server error (5xx) | "The server returned an error. Try again in a moment — if it keeps failing, contact the lab at khybiske@uw.edu." |
| genes saved, proteins failed | "Gene info was saved, but protein fields couldn't be updated. Your name, product, and category changes are live. Try saving again to retry the protein fields." |
| Session expired | "Your session expired. Refresh the page to log back in — your edits are still shown in the form." |

**PDB lookup errors** — shown inline below the lookup input:

| Situation | Message |
|---|---|
| 404 from RCSB | "No PDB entry found for '[ID]'. Double-check the ID at rcsb.org." |
| Network failure | "Couldn't reach RCSB right now. Check your connection or try again in a moment." |

**Validation errors** — shown inline under the offending field, cleared when the field is corrected.

---

## Implementation Notes

- The modal is implemented entirely within `genomes.js` as a new `openGeneEditModal(gene, protein)` function. The modal `<div>` is appended to `document.body` and removed on close.
- The pencil button is added to the hero HTML inside `renderDetailHero()`, adjacent to the existing `#detail-fav-btn`.
- The `gene_edit_log` table must be created in Supabase with the RLS policies described above before the feature ships.
- RCSB API calls are unauthenticated fetch requests — no proxy or server function needed.
- The service role key is not used client-side. All writes use the anon key with RLS; authenticated users have INSERT/UPDATE on `genes` and `proteins` via existing policies (confirm these exist before implementation).
- Cache version must be bumped in `app.js` and `index.html` when `genomes.js` is modified.
