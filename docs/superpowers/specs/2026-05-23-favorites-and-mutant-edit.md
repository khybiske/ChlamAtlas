# Spec: Favorites Fix + Mutant Edit Modal + Gene→Mutants Panel

**Date:** 2026-05-23  
**Status:** Approved

---

## Scope

Four coordinated pieces:

1. Fix favorites (star buttons) for genes and mutants — both broken since localStorage→Supabase migration
2. `contributed_by` schema migration
3. Mutant edit modal
4. Gene detail → Mutants panel (replaces "Coming soon" placeholder)

---

## 1. Favorites Fix

### Root cause

`onAuthStateChange(INITIAL_SESSION | SIGNED_IN)` calls `syncFavoritesFromDB` then `renderAuthArea()` and `updateNavVisibility()` — but never re-renders the current tab view. Gene list rows render **no star element at all** when `state.user` is null (stars are conditionally rendered as empty string for guests). After sign-in, those rows have no star in the DOM to update.

### Fix

In `app.js`, after `syncFavoritesFromDB` resolves inside the `INITIAL_SESSION | SIGNED_IN` branch, call the tab re-render function for the currently active tab. This re-runs the view with `state.user` set and `state.favorites` populated.

- Gene list rows now include `.fav-btn` buttons with correct initial fill/empty state
- Mutant list `★ Favorites` filter chip now reflects correct data
- Detail panel star initial states are correct (they read `state.favorites.*` at render time)

**Side effect:** Any open detail panel closes when the tab re-renders. Acceptable — this fires once per sign-in, never mid-session.

No changes to `toggleFavoriteDB`, `syncFavoritesFromDB`, or the star click handlers — those are correct.

Guest users see no stars (current behavior preserved — option B, by design).

---

## 2. Schema: `contributed_by`

### New column

```sql
ALTER TABLE public.mutants
  ADD COLUMN IF NOT EXISTS contributed_by uuid REFERENCES public.users(id);
```

### Semantics

| Field | Type | Purpose |
|---|---|---|
| `creator_name` | text | Freeform display name of the person who made the mutant in the lab (may not be a system user) |
| `creator` | uuid FK | System user who inserted the record; used by existing community insert RLS |
| `contributed_by` | uuid FK (new) | System user who owns edit rights — auto-set on insert, or explicitly set by admin for batch imports |

### Auto-set trigger

A `BEFORE INSERT` trigger sets `contributed_by = auth.uid()` when the field is null. This covers:
- Community user adds a mutant → their ID is auto-filled
- Admin batch-imports for another lab → sets `contributed_by` explicitly to the contributing user's ID; trigger leaves it alone

### Updated RLS

Drop and replace `mutants_community_update_own` to include `contributed_by`:

```sql
DROP POLICY "mutants_community_update_own" ON public.mutants;

CREATE POLICY "mutants_community_update_own" ON public.mutants
  FOR UPDATE
  USING  (creator = auth.uid() OR contributed_by = auth.uid())
  WITH CHECK (
    (creator = auth.uid() OR contributed_by = auth.uid())
    AND is_published = false
  );
```

Admin and lab_member update rights are unchanged (`mutants_lab_member_update_all` covers them).

---

## 3. Mutant Edit Modal

### Edit button visibility

Same DOM pattern as the gene edit button: always in DOM, `display:none`, revealed after `sb.auth.getSession()` confirms the user meets the edit criteria:

```
admin OR lab_member
OR (authenticated AND state.user.id === m.creator)
OR (authenticated AND state.user.id === m.contributed_by)
```

`m` (the mutant record) is already in scope when the button is wired. The query that fetches `m` must include `creator` and `contributed_by` fields.

### Modal fields

| Field | Control | Who can edit | Notes |
|---|---|---|---|
| `name` | text input | all editors | |
| `creator_name` | text input | all editors | Freeform lab person name |
| `mutation_type` | select | all editors | transposon / chemical / recombination / intron |
| `collection` | select | all editors | CT_L2 / CM / Lucky17 / Chimeras |
| `plasmid_used` | text input | all editors | |
| `marker` | text input | all editors | Comma-separated display; saved as `text[]` |
| `notes` | textarea | all editors | |
| Target genes | staged locus-tag search | all editors | See below |
| `contributed_by` | user lookup | admin only | Type email/name, search users table, select; hidden for non-admins |
| Publish toggle | toggle | admin only | Calls `set_mutant_published()` RPC; `is_published` column is REVOKED for non-superuser |

### Target gene search (staged add/remove)

Mirrors the PDB entry UX in the gene edit modal:

1. Text input: user types a locus tag (e.g. `CT142`)
2. "Look up" button → query `genes` table by `locus_tag`, scoped to mutant's background strain
3. Result card shows: locus tag, gene name, strain — "Add this gene" button stages the addition
4. Staged additions appear in a list with a remove (×) button
5. Existing target genes shown with remove buttons
6. On save: the full `target_gene_ids` array is replaced with the final set

### Save logic

- Collect only changed scalar fields → PATCH via `sb.from('mutants').update(diff).eq('id', m.id)`
- Set `updated_by = state.user.id` in the PATCH (column already exists, no REVOKE on it)
- If target gene set changed → include `target_gene_ids` in the PATCH
- If `is_published` toggle changed → call `set_mutant_published(m.id, newValue)` RPC separately
- `contributed_by` change (admin only) → include in PATCH if changed
- Existing `updated_at` trigger fires server-side; no client-side date math needed

### No separate audit log

`updated_at` (trigger) + `updated_by` (PATCH) are sufficient for now. A `mutant_edit_log` table can be added later if Kevin wants a full change history.

### Post-save

Refresh the mutant detail panel in-place (re-fetch and re-render `rightEl`) so changes are immediately visible.

---

## 4. Gene Detail → Mutants Panel

### Replaces

The "Coming soon" placeholder in the gene detail panel's Mutants section (currently at the bottom of the right panel).

### Query

```js
sb.from('mutants')
  .select('id, mutant_id, name, mutation_type, is_published, collection')
  .contains('target_gene_ids', [gene.id])
  .order('mutant_id')
```

RLS handles visibility: guests see only published mutants; lab members see all.

### Display

- If no mutants: brief "No mutants target this gene" message in muted style
- Each row: mutant_id (monospace), name (if present), mutation_type badge (using existing `TYPE_ACCENT` colors), collection icon, published/unpublished pill
- Clicking a row: navigate to Mutants tab with that mutant pre-selected (same mechanism as the "View in Genomes →" button in mutant detail — dispatch `chlamatlas:navigate` event with tab + id)

### Loading state

The mutant query runs alongside the existing protein/expression/ortholog queries that build the gene detail. It can run in parallel; the Mutants section renders last or shows a brief spinner if needed.

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/025_contributed_by.sql` | New — adds column, trigger, updated RLS policy |
| `web/js/app.js` | Re-render current tab after `syncFavoritesFromDB` in auth handler |
| `web/js/views/mutants.js` | Mutant edit modal (new functions); update mutant fetch query to include `creator`/`contributed_by`; edit button reveal logic |
| `web/js/views/genomes.js` | Replace "Coming soon" with live Mutants panel; update gene detail fetch to load mutants in parallel |
| `web/index.html` + `web/js/app.js` | Cache version bump |
