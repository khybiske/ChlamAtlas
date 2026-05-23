# Navbar Redesign — Design Spec
**Date:** 2026-05-23

## Scope

Four functional changes to the top navigation bar:
1. **Dropdown style** — restyle both nav popovers (Mutants collection picker, new Genomes strain picker) to Option C: soft white card with arrow caret, green left-border hover accent on rows
2. **Genomes dropdown** — add a strain picker popover (CT-L2, CT-D, CM) to the Genomes nav button
3. **Universal search** — implement the Search stub: full-text inline dropdown across genes and mutants
4. **Saved button** — implement the Saved stub: migrate favorites from localStorage to Supabase, show a popover of saved genes/mutants

Logo/favicon changes are out of scope (handled separately by Kevin).

---

## 1. Popover Style (shared component pattern)

All nav popovers use the same CSS class set and JS helper:

```
.nav-popover          — white card, border-radius 14px, shadow, border: 1px solid #f0f0f0, min-width 220px
.nav-popover::before  — triangle caret (12×12px rotated square), white fill, same border, positioned above card
.nav-popover-label    — "COLLECTIONS" / "STRAINS" section header: 0.6rem, uppercase, gray-300
.nav-popover-row      — flex row: icon + label + right-slot; border-left: 3px solid transparent; on hover → bg #f0fdf4, border-left #1a6b4a
.nav-popover-footer   — optional bottom row (link style, green text)
```

A single `openNavPopover(anchorEl, contentHtml, opts)` helper in `app.js`:
- Positions card below anchor with caret aligned to anchor center
- Dismisses on outside click or Escape
- Replaces any existing popover first

---

## 2. Genomes Dropdown — Strain Picker

**Trigger:** clicking the Genomes nav tab (desktop only; mobile bottom nav goes directly to Genomes).

**Content:** three rows, one per strain:
| Emoji | Label | Strain ID |
|---|---|---|
| 🦠 | *C. trachomatis* L2 | CT-L2 |
| 🔬 | *C. trachomatis* D | CT-D |
| 🐭 | *C. muridarum* | CM |

**Behavior:** selecting a strain calls `activateTab('genomes')` and sets the strain selection state in the genomes view (same as if the user had clicked the strain pill on the Genomes tab). If Genomes is already active, just updates the strain filter.

**Caret position:** aligned to the "Genomes" button.

---

## 3. Universal Search

**Trigger:** clicking the Search button expands an input field inline in the nav right-side area (replaces the "Search" label with a text `<input>`). Pressing Escape or clicking away collapses it.

**Query logic (debounced 250 ms):**
- Minimum 2 characters before querying
- **Genes:** `ilike` on `locus_tag`, `gene_name`, `gene_symbol`, `product` — limit 5 results
- **Mutants:** `ilike` on `mutant_id`, `name`, `notes` — limit 5 results
- Both queries fire in parallel via `Promise.all`

**Results dropdown:** rendered below the search input, full width of nav or clamped to 380px, same popover shadow style:
```
── Genes ──────────────────────
  🧬 CT_L2_0001  IncA — inclusion membrane protein
  🧬 CT_L2_0042  ...
── Mutants ────────────────────
  🔬 KH042  IncA transposon mutant
```
- Each row is clickable: navigates to that gene/mutant detail
- If a section has no results it is hidden (not shown with "No results")
- If both sections empty: single "No results" message

**Fields searched on genes:** `locus_tag`, `gene_name`, `gene_symbol` — no join to proteins. Protein function search is deferred to a future iteration.

---

## 4. Saved / Favorites — Supabase Migration

### Database
`favorites` table already exists (migration 001) with RLS policy `favorites_own`. No schema changes needed.

### client.js changes
Replace `loadFavorites` / `toggleFavorite` (localStorage) with:

```js
// state.favorites = { genes: Set<uuid>, mutants: Set<uuid> }
// Populated on login, cleared on logout

async function syncFavoritesFromDB(accessToken)
// Fetches all rows for current user, populates state.favorites

async function toggleFavoriteDB(entityType, entityId)
// Upserts or deletes from favorites table
// Returns boolean (is now favorited)
// Updates state.favorites in place
```

`GENE_FAVORITES_KEY` / `MUTANT_FAVORITES_KEY` constants removed after migration.

### Auth integration
- On `SIGNED_IN`: call `syncFavoritesFromDB()`, then update star button states visible in the DOM
- On `SIGNED_OUT`: clear `state.favorites`, reset all star buttons to unfilled

### Star buttons
- Gate on session: if `state.user` is null, clicking star opens the auth modal instead of toggling
- On toggle: call `toggleFavoriteDB`, update button state immediately (optimistic)
- Both `genomes.js` and `mutants.js` star buttons updated

### Saved popover
- Requires auth: if guest clicks Saved, open auth modal
- Content: two sections (Genes / Mutants) listing saved items with name + locus_tag or mutant_id
- Fetches display labels from DB on open (join entity_id → gene or mutant row) — or use cached data if available
- Clicking a row navigates to that detail panel
- Empty state: "No saved items yet — star a gene or mutant to save it here"

---

## Files Changed

| File | What changes |
|---|---|
| `web/index.html` | No structural change needed; popover rendered by JS |
| `web/js/app.js` | `wireNavStubs()` → real implementations; `openNavPopover()` helper; Genomes tab click handler for strain picker |
| `web/js/client.js` | Replace localStorage favorites with Supabase async functions; add `state.favorites` |
| `web/js/views/genomes.js` | Star buttons → `toggleFavoriteDB`; accept strain param from nav picker |
| `web/js/views/mutants.js` | Star buttons → `toggleFavoriteDB`; restyle collection dropdown to Option C |
| `web/css/app.css` | Add `.nav-popover*` classes; search input styles; remove `.mut-nav-dropdown*` classes |

---

## Out of Scope

- Logo/favicon update (Kevin handling)
- Mobile bottom nav (no changes — Genomes strain picker is desktop-only; mobile goes directly to Genomes tab)
- Pipeline tab gating (unchanged)
- Saved items persistence across the mutant filter bar "Favorites" chip — that chip reads from `state.favorites` after migration so it works automatically
