# Navbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four navbar improvements — Option C popover style for all dropdowns, Genomes strain picker, Supabase-backed favorites with a Saved popover, and full-text universal search across genes and mutants.

**Architecture:** A shared `openNavPopover(anchorEl, contentHtml, id)` helper in `app.js` handles positioning and dismissal for all popovers. Favorites migrate from localStorage to the existing Supabase `favorites` table, synced into `state.favorites` on login. Search fires three parallel Supabase queries (gene fields, protein function, mutant-via-gene cross-reference) with 250 ms debounce.

**Tech Stack:** Vanilla JS, Supabase JS v2, Tailwind CSS (CDN), existing `sb` client from `client.js`

---

## File Map

| File | Changes |
|---|---|
| `web/css/app.css` | Add `.nav-popover*` classes; add search input/dropdown styles; remove `.mut-nav-dropdown*` classes |
| `web/js/client.js` | Replace `loadFavorites`/`toggleFavorite` with async Supabase functions; add `state.favorites`; export `syncFavoritesFromDB`, `toggleFavoriteDB` |
| `web/js/app.js` | Add `openNavPopover()` helper; wire Genomes nav click (strain picker); replace `wireNavStubs()` with real search + saved implementations; call `syncFavoritesFromDB` on sign-in |
| `web/js/views/mutants.js` | Replace `showCollectionDropdown()` with `openNavPopover()`; replace `loadFavorites`/`toggleFavorite` with async DB calls; read from `state.favorites` |
| `web/js/views/genomes.js` | Replace `loadFavorites`/`toggleFavorite` with async DB calls; read from `state.favorites` |
| `web/index.html` | Bump `app.css` cache version |

**Cache version:** bump every file import/link to `v=74` when touching it.

---

## Task 1: Shared popover CSS

**Files:**
- Modify: `web/css/app.css`
- Modify: `web/index.html` (cache bump)

- [ ] **Step 1: Add `.nav-popover*` CSS classes and search styles to `web/css/app.css`**

Find the `/* Nav dropdown — mutants */` block (around line 359) and replace the entire `.mut-nav-dropdown*` block with the following (keep all other CSS intact):

```css
/* ── Shared nav popovers ─────────────────────────────────── */
.nav-popover {
  position: fixed;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.06);
  border: 1px solid #f0f0f0;
  min-width: 220px;
  z-index: 300;
  overflow: hidden;
}
.nav-popover::before {
  content: '';
  position: absolute;
  top: -6px;
  left: var(--caret-left, 20px);
  width: 12px;
  height: 12px;
  background: #fff;
  border-left: 1px solid #f0f0f0;
  border-top: 1px solid #f0f0f0;
  transform: rotate(45deg);
}
.nav-popover-label {
  padding: 10px 14px 4px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #d1d5db;
}
.nav-popover-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  border-left: 3px solid transparent;
  transition: background 0.12s, border-color 0.12s;
  font-family: inherit;
}
.nav-popover-row:hover { background: #f0fdf4; border-left-color: #1a6b4a; }
.nav-popover-row-icon  { font-size: 15px; }
.nav-popover-row-name  { font-size: 0.875rem; font-weight: 500; color: #111; flex: 1; }
.nav-popover-row-count { font-size: 0.75rem; color: #9ca3af; }
.nav-popover-footer {
  display: block;
  padding: 8px 14px;
  border-top: 1px solid #f3f4f6;
  font-size: 0.75rem;
  color: #1a6b4a;
  font-weight: 500;
  cursor: pointer;
  background: none;
  border-left: 3px solid transparent;
  width: 100%;
  text-align: left;
  font-family: inherit;
}
.nav-popover-footer:hover { background: #f0fdf4; }

/* ── Nav search ─────────────────────────────────────────── */
.nav-search-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 4px 10px;
  min-width: 200px;
  transition: min-width 0.2s;
}
.nav-search-input {
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 12px;
  width: 100%;
  font-family: inherit;
}
.nav-search-input::placeholder { color: rgba(255,255,255,0.5); }
.nav-search-dropdown {
  position: fixed;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.06);
  border: 1px solid #f0f0f0;
  z-index: 300;
  overflow: hidden;
  min-width: 340px;
  max-height: 420px;
  overflow-y: auto;
}
.nav-search-section-label {
  padding: 8px 14px 4px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #d1d5db;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}
.nav-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s, border-color 0.1s;
}
.nav-search-row:hover { background: #f0fdf4; border-left-color: #1a6b4a; }
.nav-search-row-icon  { font-size: 14px; color: #9ca3af; }
.nav-search-row-main  { flex: 1; min-width: 0; }
.nav-search-row-title { font-size: 0.8125rem; font-weight: 500; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-search-row-sub   { font-size: 0.725rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-search-empty     { padding: 14px; font-size: 0.8125rem; color: #9ca3af; text-align: center; }
```

- [ ] **Step 2: Bump app.css cache version in `web/index.html`**

Change:
```html
<link rel="stylesheet" href="/web/css/app.css?v=50" />
```
To:
```html
<link rel="stylesheet" href="/web/css/app.css?v=74" />
```

- [ ] **Step 3: Commit**

```bash
git add web/css/app.css web/index.html
git commit -m "feat: nav popover and search CSS classes"
```

---

## Task 2: `openNavPopover()` helper in app.js

**Files:**
- Modify: `web/js/app.js`

- [ ] **Step 1: Add `openNavPopover` after `hideUserDropdown` (around line 243)**

Insert this block immediately after the `hideUserDropdown` function:

```js
// ─── Shared nav popover helper ─────────────────────────────
function openNavPopover(anchorEl, contentHtml, id = 'nav-popover') {
  document.getElementById(id)?.remove();

  const pop = document.createElement('div');
  pop.id = id;
  pop.className = 'nav-popover';
  pop.innerHTML = contentHtml;
  document.body.appendChild(pop);

  const anchorRect = anchorEl.getBoundingClientRect();
  const popWidth   = Math.max(pop.offsetWidth, 220);
  let left = anchorRect.left;
  // Keep within viewport
  if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - popWidth - 8;
  pop.style.top  = (anchorRect.bottom + 8) + 'px';
  pop.style.left = left + 'px';

  // Align caret to anchor center
  const caretLeft = (anchorRect.left + anchorRect.width / 2) - left - 6;
  pop.style.setProperty('--caret-left', Math.max(8, caretLeft) + 'px');

  const dismiss = (e) => {
    if (!pop.contains(e.target) && e.target !== anchorEl) {
      pop.remove();
      document.removeEventListener('click', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);

  return pop;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/js/app.js
git commit -m "feat: openNavPopover helper for shared nav popovers"
```

---

## Task 3: Restyle Mutants collection dropdown

**Files:**
- Modify: `web/js/views/mutants.js`

The current `showCollectionDropdown(anchor)` appends a `.mut-nav-dropdown` card to `.mut-strip`. Replace it to use the shared `openNavPopover` pattern with the new CSS classes.

- [ ] **Step 1: Import `openNavPopover` from app.js at the top of `mutants.js`**

`openNavPopover` is defined in `app.js` which is the module root. The cleanest way is to define a small re-export or pass it in. Since all views are imported from `app.js`, the simplest approach is to put `openNavPopover` on `window` in `app.js` so views can access it.

In `app.js`, after defining `openNavPopover`, add:

```js
window.__openNavPopover = openNavPopover;
```

- [ ] **Step 2: Replace `showCollectionDropdown` in `mutants.js`**

Find the entire `showCollectionDropdown` function (lines ~211–246) and replace it with:

```js
function showCollectionDropdown(anchor) {
  const openPop = window.__openNavPopover;
  if (!openPop) return;

  openPop(anchor, `
    <div class="nav-popover-label">Collections</div>
    ${COLLECTIONS.map(c => `
      <button class="nav-popover-row" data-collection="${c.id}">
        <img style="width:22px;height:22px;border-radius:50%;object-fit:cover;" src="${c.icon}" alt="">
        <span class="nav-popover-row-name">${c.label}</span>
      </button>`).join('')}
  `, 'mut-coll-popover');

  const pop = document.getElementById('mut-coll-popover');
  pop?.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      _collection = btn.dataset.collection;
      window.__mutantCollection = _collection;
      pop.remove();
      _selectedId = null;
      renderMutants(_container);
    });
  });
}
```

- [ ] **Step 3: Bump client.js import version in mutants.js** (line 2)

Change `from '../client.js?v=69'` → `from '../client.js?v=74'`

Also bump the mutants.js version in `app.js` import line:

In `app.js`, change:
```js
import { renderMutants } from './views/mutants.js?v=69';
```
To:
```js
import { renderMutants } from './views/mutants.js?v=74';
```

- [ ] **Step 4: Verify in browser**

Load the app, go to Mutants tab, click "Switch ▾". Confirm the popover has the Option C style (white card, green left-border hover, rounded corners). Dismiss by clicking outside.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/mutants.js web/js/app.js
git commit -m "feat: restyle mutant collection dropdown to Option C popover"
```

---

## Task 4: Genomes nav strain picker

**Files:**
- Modify: `web/js/app.js`

The Genomes tab click should show a strain picker popover. On selection, it sets `window.__preferredStrain` and calls `activateTab('genomes')` — which triggers `renderGenomes()`, which already reads `window.__preferredStrain` on line 133 of `genomes.js`.

- [ ] **Step 1: Add strain picker click handler in `app.js`**

In `app.js`, find the nav tab click wiring (the `document.querySelectorAll('.nav-tab').forEach(...)` block). Currently it calls `activateTab(btn.dataset.tab)` for all tabs. Modify it to intercept the Genomes tab:

Find this pattern (around the init block that wires nav tabs) and update the click handler:

```js
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'genomes') {
      showGenomesStrainPicker(btn);
      return;
    }
    activateTab(tab);
  });
});
```

- [ ] **Step 2: Add `showGenomesStrainPicker` function in `app.js`**

Add this function alongside `openNavPopover`:

```js
const STRAINS = [
  { id: 'CT-L2', label: 'C. trachomatis L2', emoji: '🦠' },
  { id: 'CT-D',  label: 'C. trachomatis D',  emoji: '🔬' },
  { id: 'CM',    label: 'C. muridarum',       emoji: '🐭' },
];

function showGenomesStrainPicker(anchor) {
  // If Genomes tab is already active, just re-render with the picker
  const content = `
    <div class="nav-popover-label">Select strain</div>
    ${STRAINS.map(s => `
      <button class="nav-popover-row" data-strain="${s.id}">
        <span class="nav-popover-row-icon">${s.emoji}</span>
        <span class="nav-popover-row-name">${s.label}</span>
      </button>`).join('')}
  `;

  const pop = openNavPopover(anchor, content, 'genomes-strain-popover');

  pop.querySelectorAll('[data-strain]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__preferredStrain = btn.dataset.strain;
      pop.remove();
      activateTab('genomes');
    });
  });
}
```

- [ ] **Step 3: Verify in browser**

Click the Genomes nav tab. Confirm popover appears with 3 strains and correct emojis. Click CT-D — confirm the Genomes tab loads with CT-D genes. Click Genomes again — picker appears again.

- [ ] **Step 4: Commit**

```bash
git add web/js/app.js
git commit -m "feat: Genomes nav strain picker popover"
```

---

## Task 5: Favorites — migrate client.js to Supabase

**Files:**
- Modify: `web/js/client.js`

Replace the localStorage `loadFavorites`/`toggleFavorite` functions with async Supabase versions. Add `state.favorites` to hold the in-memory set.

- [ ] **Step 1: Rewrite `web/js/client.js`**

Replace the entire file contents with:

```js
// ChlamAtlas — shared Supabase client and app state
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js?v=65';
export { SUPABASE_URL, SUPABASE_ANON_KEY };

const { createClient } = window.supabase;

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const state = {
  user:        null,
  userRole:    'guest',
  userProfile: null,
  accessToken: null,
  currentTab:  'home',
  favorites:   { genes: new Set(), mutants: new Set() },
};

// ── Supabase-backed favorites ─────────────────────────────

export async function syncFavoritesFromDB() {
  if (!state.user) {
    state.favorites = { genes: new Set(), mutants: new Set() };
    return;
  }
  try {
    const { data, error } = await sb
      .from('favorites')
      .select('entity_type, entity_id');
    if (error) throw error;
    state.favorites.genes   = new Set((data ?? []).filter(r => r.entity_type === 'gene').map(r => String(r.entity_id)));
    state.favorites.mutants = new Set((data ?? []).filter(r => r.entity_type === 'mutant').map(r => String(r.entity_id)));
  } catch (e) {
    console.warn('[ChlamAtlas] syncFavoritesFromDB error:', e);
  }
}

// Returns true if now favorited, false if removed.
export async function toggleFavoriteDB(entityType, entityId) {
  if (!state.user) return false;
  const id     = String(entityId);
  const favSet = entityType === 'gene' ? state.favorites.genes : state.favorites.mutants;

  if (favSet.has(id)) {
    const { error } = await sb.from('favorites').delete()
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);
    if (!error) favSet.delete(id);
    return false;
  } else {
    const { error } = await sb.from('favorites').insert({
      user_id:     state.user.id,
      entity_type: entityType,
      entity_id:   entityId,
    });
    if (!error) favSet.add(id);
    return true;
  }
}
```

- [ ] **Step 2: Bump client.js version in `app.js` import**

In `app.js` line 1, change `from './client.js?v=65'` → `from './client.js?v=74'`

- [ ] **Step 3: Commit**

```bash
git add web/js/client.js web/js/app.js
git commit -m "feat: migrate favorites from localStorage to Supabase"
```

---

## Task 6: Wire favorites sync to auth events

**Files:**
- Modify: `web/js/app.js`

Call `syncFavoritesFromDB()` on sign-in and clear favorites on sign-out.

- [ ] **Step 1: Update imports in `app.js`**

At the top of `app.js`, add `syncFavoritesFromDB` to the client import:

```js
import { sb, state, SUPABASE_URL, SUPABASE_ANON_KEY, syncFavoritesFromDB } from './client.js?v=74';
```

- [ ] **Step 2: Update the `onAuthStateChange` handler in `app.js`**

Find the `if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')` block and add `syncFavoritesFromDB()` after `refreshRole`:

```js
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    showAuthModal('reset');
    return;
  }
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    if (session?.user) {
      state.user        = session.user;
      state.accessToken = session.access_token;
      await refreshRole(session.access_token);
      await syncFavoritesFromDB();
    }
    updateNavVisibility();
    renderAuthArea();
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    state.user        = session.user;
    state.accessToken = session.access_token;
    await refreshRole(session.access_token);
  } else if (event === 'SIGNED_OUT') {
    state.user        = null;
    state.userRole    = 'guest';
    state.userProfile = null;
    state.accessToken = null;
    state.favorites   = { genes: new Set(), mutants: new Set() };
    updateNavVisibility();
    renderAuthArea();
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add web/js/app.js
git commit -m "feat: sync Supabase favorites on sign-in, clear on sign-out"
```

---

## Task 7: Update star buttons — genomes.js

**Files:**
- Modify: `web/js/views/genomes.js`

Replace all uses of `loadFavorites(GENE_FAVORITES_KEY)` and `toggleFavorite(id, GENE_FAVORITES_KEY)` with the Supabase-backed equivalents.

- [ ] **Step 1: Update import in `genomes.js` (line 2)**

```js
import { sb, state, toggleFavoriteDB } from '../client.js?v=74';
```

(Remove `loadFavorites`, `toggleFavorite`, `GENE_FAVORITES_KEY` from the import.)

- [ ] **Step 2: Replace all `loadFavorites(GENE_FAVORITES_KEY).has(id)` reads**

There are multiple places that read whether a gene is favorited. Replace all of them:

- Any `loadFavorites(GENE_FAVORITES_KEY).has(String(id))` → `state.favorites.genes.has(String(id))`
- Any `loadFavorites(GENE_FAVORITES_KEY)` used to build a Set for filtering → `state.favorites.genes`

**Locations to update** (search for `GENE_FAVORITES_KEY` in genomes.js):
1. The favorites filter in `fetchGenes` (around line 641): change `const favs = loadFavorites(GENE_FAVORITES_KEY);` → remove that line, use `state.favorites.genes` directly in the filter.
2. The star button render (around line 705): change `const favs = loadFavorites(GENE_FAVORITES_KEY); ... favs.has(...)` → `state.favorites.genes.has(...)`.
3. The detail panel star render (around line 2147): same pattern.

- [ ] **Step 3: Replace the star click handler in the gene list (around line 260)**

Find the delegation block that calls `toggleFavorite`:
```js
const nowFav = toggleFavorite(geneId, GENE_FAVORITES_KEY);
```
Replace with the async version and add auth gate:
```js
container.querySelector('#gene-scroll').addEventListener('click', async e => {
  const favBtn = e.target.closest('.fav-btn');
  if (!favBtn) return;
  e.stopPropagation();
  if (!state.user) { window.__showAuthModal?.('signin'); return; }
  const geneId = favBtn.dataset.id;
  const nowFav = await toggleFavoriteDB('gene', geneId);
  favBtn.textContent = nowFav ? '★' : '☆';
  favBtn.style.color  = nowFav ? '#f59e0b' : '#e5e7eb';
  if (_filters.favorites && !nowFav) {
    favBtn.closest('.gene-row')?.remove();
    _total = Math.max(0, _total - 1);
    const countEl = container.querySelector('#result-count');
    if (countEl) countEl.textContent = `${_total.toLocaleString()} gene${_total !== 1 ? 's' : ''}`;
  }
  const detailFav = container.querySelector('#detail-fav-btn');
  if (detailFav && String(detailFav.dataset.id) === String(geneId)) {
    detailFav.textContent = nowFav ? '★' : '☆';
    detailFav.style.color  = nowFav ? '#f59e0b' : '#e5e7eb';
  }
});
```

- [ ] **Step 4: Replace the detail panel star click handler (around line 2251)**

Find `const nowFav = toggleFavorite(id, GENE_FAVORITES_KEY);` in the detail panel wiring and replace with:
```js
if (!state.user) { window.__showAuthModal?.('signin'); return; }
const nowFav = await toggleFavoriteDB('gene', id);
```
Make the surrounding function `async`.

- [ ] **Step 5: Expose `showAuthModal` on window in `app.js`**

In `app.js`, after `showAuthModal` is defined, add:
```js
window.__showAuthModal = showAuthModal;
```

- [ ] **Step 6: Bump genomes.js version in `app.js` import**

Change `from './views/genomes.js?v=73'` → `from './views/genomes.js?v=74'`

- [ ] **Step 7: Verify in browser**

1. When not signed in: click a gene star → auth modal should appear.
2. Sign in, click a gene star → star fills yellow. Refresh page (still signed in) → star should still be yellow (read from Supabase).
3. Click star again → star empties. Refresh → stays empty.

- [ ] **Step 8: Commit**

```bash
git add web/js/views/genomes.js web/js/app.js
git commit -m "feat: gene stars use Supabase favorites, auth-gated"
```

---

## Task 8: Update star buttons — mutants.js

**Files:**
- Modify: `web/js/views/mutants.js`

Same pattern as Task 7 but for mutants.

- [ ] **Step 1: Update import in `mutants.js` (line 2)**

```js
import { sb, state, toggleFavoriteDB } from '../client.js?v=74';
```

(Remove `loadFavorites`, `toggleFavorite`, `MUTANT_FAVORITES_KEY` from the import.)

- [ ] **Step 2: Replace `loadFavorites(MUTANT_FAVORITES_KEY)` reads**

**Locations** (search `MUTANT_FAVORITES_KEY` in mutants.js):

1. Favorites filter in `fetchList` (around line 473–474):
   ```js
   // Old:
   const favs = loadFavorites(MUTANT_FAVORITES_KEY);
   displayRows = displayRows.filter(m => favs.has(String(m.id)));
   // New:
   displayRows = displayRows.filter(m => state.favorites.mutants.has(String(m.id)));
   ```

2. Star render in mutant list row (around line 693):
   ```js
   // Old:
   const isFav = loadFavorites(MUTANT_FAVORITES_KEY).has(String(m.id))
   // New:
   const isFav = state.favorites.mutants.has(String(m.id))
   ```

- [ ] **Step 3: Replace star click handler in detail panel (around line 675)**

Find:
```js
rightEl.querySelector('#mut-fav-btn')?.addEventListener('click', e => {
```

Replace the body with:
```js
rightEl.querySelector('#mut-fav-btn')?.addEventListener('click', async e => {
  e.stopPropagation();
  if (!state.user) { window.__showAuthModal?.('signin'); return; }
  const btn    = e.currentTarget;
  const id     = btn.dataset.id;
  const nowFav = await toggleFavoriteDB('mutant', id);
  btn.textContent = nowFav ? '★' : '☆';
  btn.title       = nowFav ? 'Remove from favorites' : 'Add to favorites';
  btn.style.color = nowFav ? '#f59e0b' : '#e5e7eb';
});
```

- [ ] **Step 4: Verify in browser**

1. Not signed in: click mutant star → auth modal.
2. Sign in, star a mutant → stays starred on refresh.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/mutants.js
git commit -m "feat: mutant stars use Supabase favorites, auth-gated"
```

---

## Task 9: Saved popover

**Files:**
- Modify: `web/js/app.js`

Wire `btn-nav-saved` to show a popover listing saved genes and mutants, fetching display labels from Supabase.

- [ ] **Step 1: Replace the Saved stub in `wireNavStubs()` in `app.js`**

Find `wireNavStubs()` and replace the saved button listener:

```js
function wireNavStubs() {
  document.getElementById('btn-nav-search')?.addEventListener('click', (e) => {
    showNavSearch(e.currentTarget);
  });
  document.getElementById('btn-nav-saved')?.addEventListener('click', (e) => {
    showSavedPopover(e.currentTarget);
  });
}
```

- [ ] **Step 2: Add `showSavedPopover` function in `app.js`**

```js
async function showSavedPopover(anchor) {
  if (!state.user) {
    showAuthModal('signin');
    return;
  }

  // Show loading state immediately
  const loadingPop = openNavPopover(anchor, `
    <div class="nav-popover-label">Saved</div>
    <div style="padding:14px;font-size:0.8125rem;color:#9ca3af;">Loading…</div>
  `, 'saved-popover');

  const geneIds   = [...state.favorites.genes];
  const mutantIds = [...state.favorites.mutants];

  const [genesRes, mutantsRes] = await Promise.all([
    geneIds.length
      ? sb.from('genes').select('id, locus_tag, gene_name, strain_id').in('id', geneIds)
      : { data: [] },
    mutantIds.length
      ? sb.from('mutants').select('id, mutant_id, name').in('id', mutantIds)
      : { data: [] },
  ]);

  const genes   = genesRes.data   ?? [];
  const mutants = mutantsRes.data ?? [];

  if (!document.getElementById('saved-popover')) return; // dismissed while loading

  const genesHtml = genes.length
    ? genes.map(g => `
        <button class="nav-popover-row" data-type="gene" data-id="${g.id}">
          <span class="nav-popover-row-icon">🧬</span>
          <span class="nav-popover-row-name">${g.locus_tag}${g.gene_name ? ' — ' + g.gene_name : ''}</span>
        </button>`).join('')
    : '';

  const mutantsHtml = mutants.length
    ? mutants.map(m => `
        <button class="nav-popover-row" data-type="mutant" data-id="${m.id}">
          <span class="nav-popover-row-icon">🔬</span>
          <span class="nav-popover-row-name">${m.mutant_id}${m.name ? ' — ' + m.name : ''}</span>
        </button>`).join('')
    : '';

  const emptyHtml = !genes.length && !mutants.length
    ? `<div style="padding:14px 14px 12px;font-size:0.8125rem;color:#9ca3af;text-align:center;">No saved items yet —<br>star a gene or mutant to save it here</div>`
    : '';

  const pop = openNavPopover(anchor, `
    ${genes.length    ? '<div class="nav-popover-label">Genes</div>' + genesHtml : ''}
    ${mutants.length  ? '<div class="nav-popover-label">Mutants</div>' + mutantsHtml : ''}
    ${emptyHtml}
  `, 'saved-popover');

  pop.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      pop.remove();
      if (btn.dataset.type === 'gene') {
        window.__preferredStrain = null;
        activateTab('genomes');
        // Signal genomes view to open this gene's detail panel
        window.__openGeneId = btn.dataset.id;
      } else {
        activateTab('mutants');
        window.__openMutantId = btn.dataset.id;
      }
    });
  });
}
```

- [ ] **Step 3: Verify in browser**

1. Not signed in: click Saved → auth modal appears.
2. Sign in, star a gene and a mutant, click Saved → popover shows both grouped.
3. Click a saved gene → navigates to Genomes tab. (Full deep-link into gene detail is a future enhancement; this just navigates to the tab.)
4. With no favorites: Saved shows the empty state message.

- [ ] **Step 4: Commit**

```bash
git add web/js/app.js
git commit -m "feat: Saved popover with Supabase-backed favorites"
```

---

## Task 10: Universal search

**Files:**
- Modify: `web/js/app.js`

Replace the Search stub with a real inline search that fires three parallel Supabase queries and renders grouped results.

- [ ] **Step 1: Update the Search button HTML in `web/index.html`**

Give the search button an id it already has (`btn-nav-search`) — no change needed there. But we need a container for the expanded search input. The search input replaces the button in-place. The button's parent is the right-side flex row. The approach: show/hide an input that overlays in the same area.

Add a search input element alongside the button in `index.html`. Find the search button block and wrap both in a relative container:

```html
<!-- Right side: search, saved, auth -->
<div class="flex items-center gap-2 flex-shrink-0">
  <div id="nav-search-area" style="position:relative;">
    <button id="btn-nav-search"
      class="hover:bg-white/10 transition rounded-md"
      style="display:flex;align-items:center;gap:5px;padding:5px 11px;cursor:pointer;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:500;">Search</span>
    </button>
    <div id="nav-search-expanded" class="nav-search-wrap" style="display:none;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="nav-search-input" class="nav-search-input" type="text" placeholder="Search genes, mutants…" autocomplete="off" />
    </div>
  </div>
  <button id="btn-nav-saved" ...>
```

(Keep the Saved button and auth area unchanged.)

- [ ] **Step 2: Add `showNavSearch` function in `app.js`**

```js
let _searchDebounce = null;

function showNavSearch(btn) {
  const btn_el    = document.getElementById('btn-nav-search');
  const expanded  = document.getElementById('nav-search-expanded');
  const input     = document.getElementById('nav-search-input');

  btn_el.style.display  = 'none';
  expanded.style.display = 'flex';
  input.value = '';
  input.focus();

  function closeSearch() {
    btn_el.style.display   = '';
    expanded.style.display = 'none';
    document.getElementById('nav-search-results')?.remove();
    document.removeEventListener('click', onOutsideClick);
  }

  function onOutsideClick(e) {
    const results = document.getElementById('nav-search-results');
    if (!expanded.contains(e.target) && !results?.contains(e.target)) closeSearch();
  }
  setTimeout(() => document.addEventListener('click', onOutsideClick), 0);

  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });

  input.addEventListener('input', () => {
    clearTimeout(_searchDebounce);
    const q = input.value.trim();
    if (q.length < 2) { document.getElementById('nav-search-results')?.remove(); return; }
    _searchDebounce = setTimeout(() => runSearch(q, input), 250);
  });
}

async function runSearch(q, inputEl) {
  // Three parallel queries
  const [geneFieldRes, proteinRes, directMutantRes] = await Promise.all([
    sb.from('genes')
      .select('id, locus_tag, gene_name, gene_symbol, strain_id')
      .or(`locus_tag.ilike.%${q}%,gene_name.ilike.%${q}%,gene_symbol.ilike.%${q}%`)
      .limit(5),
    sb.from('proteins')
      .select('gene_id, function, genes(id, locus_tag, gene_name, gene_symbol, strain_id)')
      .ilike('function', `%${q}%`)
      .limit(5),
    sb.from('mutants')
      .select('id, mutant_id, name, target_gene_ids')
      .or(`mutant_id.ilike.%${q}%,name.ilike.%${q}%,notes.ilike.%${q}%`)
      .limit(5),
  ]);

  // Merge gene results and deduplicate by id
  const geneMap = new Map();
  (geneFieldRes.data ?? []).forEach(g => geneMap.set(g.id, g));
  (proteinRes.data ?? []).forEach(p => {
    if (p.genes && !geneMap.has(p.genes.id)) geneMap.set(p.genes.id, p.genes);
  });
  const genes = [...geneMap.values()].slice(0, 5);

  // Mutant-via-gene cross-reference
  const matchingGeneIds = [...geneMap.keys()];
  let mutantsViaGene = [];
  if (matchingGeneIds.length) {
    const { data } = await sb.from('mutants')
      .select('id, mutant_id, name, target_gene_ids')
      .overlaps('target_gene_ids', matchingGeneIds)
      .limit(5);
    mutantsViaGene = data ?? [];
  }

  // Merge mutant results and deduplicate by id
  const mutantMap = new Map();
  (directMutantRes.data ?? []).forEach(m => mutantMap.set(m.id, m));
  mutantsViaGene.forEach(m => { if (!mutantMap.has(m.id)) mutantMap.set(m.id, m); });
  const mutants = [...mutantMap.values()].slice(0, 5);

  // Bail if input changed while querying
  if (document.getElementById('nav-search-input')?.value.trim() !== q) return;

  renderSearchResults(genes, mutants, inputEl);
}

function renderSearchResults(genes, mutants, inputEl) {
  document.getElementById('nav-search-results')?.remove();

  const drop = document.createElement('div');
  drop.id = 'nav-search-results';
  drop.className = 'nav-search-dropdown';
  document.body.appendChild(drop);

  // Position below the expanded search area
  const rect = document.getElementById('nav-search-expanded').getBoundingClientRect();
  drop.style.top  = (rect.bottom + 6) + 'px';
  drop.style.left = rect.left + 'px';

  if (!genes.length && !mutants.length) {
    drop.innerHTML = `<div class="nav-search-empty">No results</div>`;
    return;
  }

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const genesHtml = genes.length ? `
    <div class="nav-search-section-label">Genes</div>
    ${genes.map(g => `
      <div class="nav-search-row" data-type="gene" data-id="${g.id}" style="cursor:pointer;">
        <span class="nav-search-row-icon">🧬</span>
        <div class="nav-search-row-main">
          <div class="nav-search-row-title">${esc(g.locus_tag)}${g.gene_symbol ? ' · ' + esc(g.gene_symbol) : ''}</div>
          ${g.gene_name ? `<div class="nav-search-row-sub">${esc(g.gene_name)}</div>` : ''}
        </div>
      </div>`).join('')}` : '';

  const mutantsHtml = mutants.length ? `
    <div class="nav-search-section-label">Mutants</div>
    ${mutants.map(m => `
      <div class="nav-search-row" data-type="mutant" data-id="${m.id}" style="cursor:pointer;">
        <span class="nav-search-row-icon">🔬</span>
        <div class="nav-search-row-main">
          <div class="nav-search-row-title">${esc(m.mutant_id)}</div>
          ${m.name ? `<div class="nav-search-row-sub">${esc(m.name)}</div>` : ''}
        </div>
      </div>`).join('')}` : '';

  drop.innerHTML = genesHtml + mutantsHtml;

  drop.querySelectorAll('[data-type]').forEach(row => {
    row.addEventListener('click', () => {
      drop.remove();
      // Collapse search
      document.getElementById('btn-nav-search').style.display = '';
      document.getElementById('nav-search-expanded').style.display = 'none';
      if (row.dataset.type === 'gene') {
        activateTab('genomes');
        window.__openGeneId = row.dataset.id;
      } else {
        activateTab('mutants');
        window.__openMutantId = row.dataset.id;
      }
    });
  });
}
```

- [ ] **Step 3: Bump index.html script module version**

The app.js is loaded as a module in index.html — find that `<script type="module" src="/web/js/app.js?v=...">` tag and bump the version to `v=74`.

- [ ] **Step 4: Verify in browser**

1. Click Search → button disappears, input appears with placeholder.
2. Type "CT119" → after 250 ms, dropdown shows gene results for CT119 and any mutants targeting it.
3. Type "IncA" → shows IncA gene and matching mutants.
4. Type gibberish → "No results" appears.
5. Press Escape → search collapses back to button.
6. Click outside the dropdown → collapses.

- [ ] **Step 5: Commit**

```bash
git add web/js/app.js web/index.html
git commit -m "feat: universal search — inline dropdown with genes + mutants"
```

---

## Task 11: Deploy

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Deploy to Vercel**

```bash
vercel --prod
```

Expected: deployment succeeds, new URL printed.

- [ ] **Step 3: Smoke test on live URL**

1. Open the live URL in an incognito browser window.
2. Click Genomes → strain picker appears; select CT-D → CT-D genes load.
3. Click Mutants → go to Mutants tab; click "Switch ▾" → Option C popover appears.
4. Click Search → type a gene locus tag → results appear grouped.
5. Sign in → click Saved → empty state message.
6. Star a gene → click Saved → gene appears in popover.
7. Sign out → star button on genes should require sign-in.

---

## Self-Review Notes

- **Spec coverage:** All four sections covered — dropdown style (Tasks 1–3), Genomes picker (Task 4), Favorites migration (Tasks 5–8), Search (Task 10). Saved popover (Task 9) wired to the new favorites store. ✓
- **Type consistency:** `toggleFavoriteDB('gene', id)` and `toggleFavoriteDB('mutant', id)` used consistently across Tasks 5, 7, 8. `state.favorites.genes` / `state.favorites.mutants` used for reads throughout. ✓
- **`window.__openGeneId` / `window.__openMutantId`:** Set by search and saved results clicks, but the genomes/mutants views don't yet read these to auto-open a detail panel. This is a known limitation noted in Task 9 Step 3 — navigates to tab but doesn't deep-link into a specific record. Full deep-link is a follow-up task.
- **Mobile:** Genomes strain picker is desktop-only by design (mobile bottom nav goes directly to Genomes tab which has strain tabs inside it). No mobile changes needed for this plan. ✓
