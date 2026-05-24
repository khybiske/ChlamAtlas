# Favorites Fix + Mutant Edit Modal + Gene→Mutants Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix star-button favorites for genes and mutants, add `contributed_by` ownership column to mutants, build the mutant edit modal, and replace the "Coming soon" Mutants placeholder in gene detail with a live panel.

**Architecture:** Schema migration first (new column + trigger + RLS). Favorites fixed by re-rendering the active tab after `syncFavoritesFromDB` resolves on sign-in. Mutant edit modal follows the existing gene edit modal pattern in `genomes.js` (overlay, HTML builder, event wirer, diff-only PATCH). Gene→Mutants panel is a parallel query added to `loadDetailAsync` in `genomes.js`. Navigation from the gene Mutants panel to the Mutants tab uses the `window.__openMutantId` + `chlamatlas:navigate` convention already in place for search results.

**Tech Stack:** Vanilla JS ES modules, Supabase JS client, Tailwind-like inline styles, Supabase SQL migrations run manually in the Supabase dashboard.

---

## File Map

| File | What changes |
|---|---|
| `supabase/migrations/025_contributed_by.sql` | New — contributed_by column, BEFORE INSERT trigger, updated RLS policy |
| `web/js/app.js` | Re-render current tab after syncFavoritesFromDB on sign-in; v bump |
| `web/js/views/mutants.js` | Consume `window.__openMutantId` in renderMutants; fix fetchList to call loadDetail on pre-selected ID; add esc helper; extend loadDetail SELECT to include creator/contributed_by/background_strain_id; edit button reveal logic; openMutantEditModal + buildMutantEditHtml + wireMutantEditEvents functions; v bump |
| `web/js/views/genomes.js` | Add mutants query to loadDetailAsync; renderDetailMutants function; wire mutant-row click handlers; v bump |
| `web/index.html` | v bump on app.js import |

---

## Important constants / patterns

```
Current cache version: v=77  →  bump all changed files to v=78
Supabase URL: state is in client.js; sb client has auth session; use sb.from() for all queries
esc helper (genomes.js line 128): const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
TYPE_ACCENT in mutants.js (line 54): maps mutation_type string → { color, heroBg, badgeBg, badgeText, badgeBorder }
COLLECTIONS in mutants.js (line 4): [{ id, label, icon }]
heroBadge(text, textColor, border, bg) in mutants.js (line 99): returns inline-styled badge span
activateTab(name) in app.js (line 29): sets state.currentTab, re-renders tab container, updates nav
```

---

## Task 1 — Schema migration: contributed_by

**Files:**
- Create: `supabase/migrations/025_contributed_by.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 025: Add contributed_by for mutant edit ownership
-- contributed_by = the system user who has edit rights over this mutant.
-- Auto-set on INSERT (trigger); can be set explicitly by admin for batch imports.

ALTER TABLE public.mutants
  ADD COLUMN IF NOT EXISTS contributed_by uuid REFERENCES public.users(id);

-- Auto-fill contributed_by with auth.uid() when not explicitly provided
CREATE OR REPLACE FUNCTION public.mutants_set_contributed_by()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.contributed_by IS NULL THEN
    NEW.contributed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mutants_auto_contributed_by ON public.mutants;
CREATE TRIGGER mutants_auto_contributed_by
  BEFORE INSERT ON public.mutants
  FOR EACH ROW EXECUTE FUNCTION public.mutants_set_contributed_by();

-- Expand community UPDATE rights to include contributed_by
DROP POLICY IF EXISTS "mutants_community_update_own" ON public.mutants;
CREATE POLICY "mutants_community_update_own" ON public.mutants
  FOR UPDATE
  USING  (creator = auth.uid() OR contributed_by = auth.uid())
  WITH CHECK (
    (creator = auth.uid() OR contributed_by = auth.uid())
    AND is_published = false
  );
```

- [ ] **Step 2: Run the migration in the Supabase dashboard**

Go to the Supabase dashboard → SQL Editor → paste the migration → Run.
Verify: check the `mutants` table columns include `contributed_by uuid`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/025_contributed_by.sql
git commit -m "feat: add contributed_by column + trigger + updated RLS to mutants"
```

---

## Task 2 — Favorites fix in app.js

**Files:**
- Modify: `web/js/app.js`

- [ ] **Step 1: Locate the auth handler (line ~98)**

Find this block in `web/js/app.js`:

```js
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    if (session?.user) {
      state.user        = session.user;
      state.accessToken = session.access_token;
      await refreshRole(session.access_token);
      await syncFavoritesFromDB(session.access_token);
    }
    updateNavVisibility();
    renderAuthArea();
  }
```

- [ ] **Step 2: Add tab re-render after syncFavoritesFromDB**

Replace that block with:

```js
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    if (session?.user) {
      state.user        = session.user;
      state.accessToken = session.access_token;
      await refreshRole(session.access_token);
      await syncFavoritesFromDB(session.access_token);
      // Re-render active tab so star buttons appear with correct state.
      // Stars are omitted from the DOM for guests; this re-render injects them.
      if (state.currentTab === 'genomes' || state.currentTab === 'mutants') {
        const container = document.getElementById(`${state.currentTab}-content`);
        if (container) {
          container.innerHTML = '';
          RENDERERS[state.currentTab](container);
        }
      }
    }
    updateNavVisibility();
    renderAuthArea();
  }
```

- [ ] **Step 3: Bump cache version on the client.js import line**

Find (line ~2):
```js
import { sb, state, SUPABASE_URL, SUPABASE_ANON_KEY, syncFavoritesFromDB } from './client.js?v=77';
```
Change to `?v=78`.

Also update the mutants and genomes import lines when those files are changed in later tasks — leave them at v=77 for now; they'll be bumped in Tasks 3 and 4.

- [ ] **Step 4: Commit**

```bash
git add web/js/app.js
git commit -m "fix: re-render active tab after syncFavoritesFromDB so star buttons appear on sign-in"
```

---

## Task 3 — Consume window.__openMutantId + fix fetchList detail autoload

**Files:**
- Modify: `web/js/views/mutants.js`

This enables navigation from the gene-detail Mutants panel (Task 4) to arrive on the correct mutant.

- [ ] **Step 1: Add esc helper near the top of mutants.js**

After the `DEFAULT_ACCENT` constant (line ~61), add:

```js
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
```

- [ ] **Step 2: Read window.__openMutantId in renderMutants**

In `renderMutants` (line ~128), after all the module-state resets (the block ending `_geneDataMap = new Map();`), add:

```js
  // Pre-select a mutant navigated to from another tab (e.g. gene detail Mutants panel)
  if (window.__openMutantId) {
    _selectedId = window.__openMutantId;
    delete window.__openMutantId;
  }
```

- [ ] **Step 3: In fetchList, call loadDetail when a pre-selected ID is already set**

Find this block near the end of `fetchList` (lines ~527–533):

```js
  // Auto-select first row on initial load
  if (!_selectedId && displayRows.length) {
    const first = listEl.querySelector('.mut-row');
    if (first) { first.classList.add('selected'); _selectedId = first.dataset.id; loadDetail(first.dataset.id); }
  } else if (_selectedId) {
    const sel = listEl.querySelector(`[data-id="${_selectedId}"]`);
    if (sel) sel.classList.add('selected');
  }
```

Replace with:

```js
  // Auto-select first row on initial load, or re-select a pre-chosen ID
  if (!_selectedId && displayRows.length) {
    const first = listEl.querySelector('.mut-row');
    if (first) { first.classList.add('selected'); _selectedId = first.dataset.id; loadDetail(first.dataset.id); }
  } else if (_selectedId) {
    const sel = listEl.querySelector(`[data-id="${_selectedId}"]`);
    if (sel) { sel.classList.add('selected'); loadDetail(_selectedId); }
  }
```

- [ ] **Step 4: Bump cache version in mutants.js import line**

Find (line ~2):
```js
import { sb, state, toggleFavoriteDB } from '../client.js?v=77';
```
Change to `?v=78`.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/mutants.js
git commit -m "fix: consume __openMutantId on render; call loadDetail for pre-selected mutant in fetchList"
```

---

## Task 4 — Gene detail → Mutants panel

**Files:**
- Modify: `web/js/views/genomes.js`

- [ ] **Step 1: Add mutants query to loadDetailAsync**

Find `loadDetailAsync` (line ~906). The function currently ends with a `Promise.all` for protein/ortholog/neighbor queries, then a separate `expression_data` fetch. Add the mutants query to the initial `Promise.all`:

Replace the opening of `loadDetailAsync`:

```js
async function loadDetailAsync(detail, gene) {
  const [protResult, orthoFwdResult, orthoRevResult, neighborResult] = await Promise.all([
```

With:

```js
async function loadDetailAsync(detail, gene) {
  const [protResult, orthoFwdResult, orthoRevResult, neighborResult, mutantsResult] = await Promise.all([
```

And add as the last entry in the `Promise.all` array (after the neighborResult entry, before the closing `]);`):

```js
    sb.from('mutants')
      .select('id, mutant_id, name, mutation_type, is_published, collection')
      .contains('target_gene_ids', [gene.id])
      .order('mutant_id'),
```

- [ ] **Step 2: Add renderDetailMutants call at end of loadDetailAsync**

At the bottom of `loadDetailAsync`, after all existing `renderDetail*` calls, add:

```js
  renderDetailMutants(detail, gene, mutantsResult.data ?? []);
```

- [ ] **Step 3: Add renderDetailMutants function**

Add this new function after `loadDetailAsync` (e.g. after `renderDetailOrthologs`). It replaces the "Coming soon" placeholder in `#d-mutants` (which we'll add as an id in Step 4):

```js
function renderDetailMutants(detail, gene, mutants) {
  const el = detail.querySelector('#d-mutants');
  if (!el) return;

  if (!mutants.length) {
    el.innerHTML = `
      <div style="padding:14px 16px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;margin-bottom:10px;">Mutants</div>
        <div style="font-size:10px;color:#bbb;font-style:italic;">No mutants target this gene</div>
      </div>`;
    return;
  }

  const COLL_ICONS = {
    CT_L2:    '/design/L2icon.jpg',
    CM:       '/design/CMicon.jpg',
    Lucky17:  '/design/L17icon.jpg',
    Chimeras: '/design/Chimeraicon.jpg',
  };

  const TYPE_ACCENT_LOCAL = {
    transposon: { color: '#059669', bg: 'rgba(209,250,229,0.5)',  border: 'rgba(5,150,105,0.35)'   },
    deletion:   { color: '#dc2626', bg: 'rgba(254,226,226,0.5)',  border: 'rgba(220,38,38,0.3)'    },
    chimera:    { color: '#7c3aed', bg: 'rgba(237,233,254,0.5)',  border: 'rgba(124,58,237,0.3)'   },
    chemical:   { color: '#2563eb', bg: 'rgba(219,234,254,0.5)',  border: 'rgba(37,99,235,0.3)'    },
    intron:     { color: '#ca8a04', bg: 'rgba(254,249,195,0.6)',  border: 'rgba(202,138,4,0.35)'   },
  };

  const rows = mutants.map(m => {
    const displayName = m.name || m.mutant_id;
    const accent = TYPE_ACCENT_LOCAL[m.mutation_type] ?? { color: '#6b7280', bg: 'rgba(243,244,246,0.6)', border: 'rgba(107,114,128,0.3)' };
    const typeLabel = (m.mutation_type ?? '').charAt(0).toUpperCase() + (m.mutation_type ?? '').slice(1);
    const collIcon = COLL_ICONS[m.collection]
      ? `<img src="${COLL_ICONS[m.collection]}" alt="" style="width:16px;height:16px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : '';
    const pubBadge = m.is_published
      ? `<span style="font-size:7px;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:6px;background:rgba(5,150,105,0.1);color:#059669;border:1px solid rgba(5,150,105,0.25);">Published</span>`
      : `<span style="font-size:7px;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:6px;background:rgba(180,83,9,0.1);color:#b45309;border:1px solid rgba(180,83,9,0.25);">Lab</span>`;
    const typeBadge = typeLabel
      ? `<span style="font-size:7px;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:6px;background:${accent.bg};color:${accent.color};border:1px solid ${accent.border};">${esc(typeLabel)}</span>`
      : '';
    return `
      <button class="d-mutant-row" data-mutant-id="${esc(m.id)}" data-collection="${esc(m.collection ?? 'CT_L2')}"
        style="display:flex;align-items:center;gap:7px;width:100%;text-align:left;background:none;border:none;
               border-bottom:1px solid #f5f5f5;padding:6px 0;cursor:pointer;border-radius:4px;">
        ${collIcon}
        <div style="flex:1;min-width:0;">
          <div style="font-size:10.5px;font-weight:600;color:#111;font-family:'DM Mono',monospace;">${esc(m.mutant_id)}</div>
          ${m.name ? `<div style="font-size:9px;color:#555;margin-top:1px;">${esc(m.name)}</div>` : ''}
        </div>
        <div style="display:flex;gap:3px;align-items:center;flex-shrink:0;">
          ${typeBadge}
          ${pubBadge}
        </div>
      </button>`;
  }).join('');

  el.innerHTML = `
    <div style="padding:14px 16px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;margin-bottom:8px;">
        Mutants (${mutants.length})
      </div>
      <div>${rows}</div>
    </div>`;

  el.querySelectorAll('.d-mutant-row').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__mutantCollection = btn.dataset.collection;
      window.__openMutantId     = btn.dataset.mutantId;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'mutants' } }));
    });
  });
}
```

- [ ] **Step 4: Add id="d-mutants" to the existing Mutants section in the detail HTML template**

Find the "Mutants (full width)" comment in the detail HTML template (around line 2237):

```js
      <!-- Mutants (full width) -->
      <div style="border-bottom:1px solid #f0f0f0;min-width:0;overflow:hidden;">
        <div style="padding:14px 16px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;margin-bottom:10px;">Mutants</div>
          <div style="font-size:10px;color:#bbb;font-style:italic;">Coming soon</div>
        </div>
      </div>
```

Replace with:

```js
      <!-- Mutants (full width) -->
      <div id="d-mutants" style="border-bottom:1px solid #f0f0f0;min-width:0;overflow:hidden;">
        <div style="padding:14px 16px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;margin-bottom:10px;">Mutants</div>
          <div style="font-size:10px;color:#bbb;font-style:italic;">Loading…</div>
        </div>
      </div>
```

- [ ] **Step 5: Bump cache version in genomes.js import line**

Find (line ~2):
```js
import { sb, state, toggleFavoriteDB } from '../client.js?v=77';
```
Change to `?v=78`.

- [ ] **Step 6: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene detail Mutants panel — live query + navigation to mutants tab"
```

---

## Task 5 — Mutant edit modal

**Files:**
- Modify: `web/js/views/mutants.js`

This is the largest task. It is safe to implement in one commit but broken into clear sub-steps.

- [ ] **Step 1: Extend loadDetail SELECT to include creator, contributed_by, background_strain_id**

Find the mutant fetch inside `loadDetail` (line ~566):

```js
    sb.from('mutants')
      .select(`id,mutant_id,name,mutation_type,mutation_method,plasmid_used,marker,
               creator_name,is_published,notes,target_gene_ids,
               strains!background_strain_id(common_name,species)`)
      .eq('id', mutantUUID)
      .single(),
```

Replace with:

```js
    sb.from('mutants')
      .select(`id,mutant_id,name,mutation_type,mutation_method,plasmid_used,marker,
               creator,creator_name,contributed_by,background_strain_id,
               is_published,notes,target_gene_ids,
               strains!background_strain_id(common_name,species)`)
      .eq('id', mutantUUID)
      .single(),
```

- [ ] **Step 2: Update edit button reveal logic in loadDetail**

Find (line ~658):

```js
  // Edit button — placeholder until edit modal is built
  rightEl.querySelector('#mut-edit-btn')?.addEventListener('click', () => {});
```

Replace with:

```js
  // Edit button — wire modal + show only for authorized users
  const editBtn = rightEl.querySelector('#mut-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => openMutantEditModal(m, genes, rightEl));
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const uid = session.user.id;
      const isLabPlus = state.userRole === 'admin' || state.userRole === 'lab_member';
      const isOwner   = String(m.creator ?? '') === uid || String(m.contributed_by ?? '') === uid;
      if (isLabPlus || isOwner) editBtn.style.color = '#6b7280';
      if (isLabPlus || isOwner) editBtn.style.cursor = 'pointer';
      // Make it look enabled; keep display as-is (button is always in DOM)
    });
  }
```

Wait — the current button has no `display:none` gate unlike the gene edit button. Keep it simple: just wire the click and check auth inside the handler. Replace with:

```js
  // Edit button — wire to modal; visibility controlled by getSession check
  const editBtn = rightEl.querySelector('#mut-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (!state.user) { window.__showAuthModal?.('signin'); return; }
      openMutantEditModal(m, genes, rightEl);
    });
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const uid       = session.user.id;
      const isLabPlus = state.userRole === 'admin' || state.userRole === 'lab_member';
      const isOwner   = String(m.creator ?? '') === uid || String(m.contributed_by ?? '') === uid;
      if (isLabPlus || isOwner) editBtn.style.display = 'inline-flex';
    });
  }
```

Also update heroHTML to hide the pencil button initially. Find in `heroHTML` (line ~719):

```js
          <button id="mut-edit-btn" style="${btnBase}color:#9ca3af;" title="Edit">${pencilSvg}</button>
```

Replace with:

```js
          <button id="mut-edit-btn" style="${btnBase}color:#9ca3af;display:none;" title="Edit">${pencilSvg}</button>
```

- [ ] **Step 3: Add openMutantEditModal function**

Add this block at the bottom of `mutants.js` (after the last function):

```js
// ─── Mutant edit modal ────────────────────────────────────

async function openMutantEditModal(m, genes, rightEl) {
  document.getElementById('mut-edit-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mut-edit-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;',
    'display:flex;align-items:center;justify-content:center;padding:16px;',
  ].join('');

  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }
  document.addEventListener('keydown', onEsc);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.innerHTML = buildMutantEditHtml(m, genes);
  document.body.appendChild(overlay);

  wireMutantEditEvents(overlay, m, genes, closeModal, rightEl);
}
```

- [ ] **Step 4: Add buildMutantEditHtml function**

```js
function buildMutantEditHtml(m, genes) {
  const isAdmin = state.userRole === 'admin';

  const field = (label, name, value, extra = '') =>
    `<div>
      <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:#64748b;margin-bottom:4px;">${label}</label>
      <input name="${name}" value="${esc(value ?? '')}" ${extra}
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
        font-size:12px;color:#111;box-sizing:border-box;background:#fff;">
    </div>`;

  const selectEl = (label, name, options, current) =>
    `<div>
      <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:#64748b;margin-bottom:4px;">${label}</label>
      <select name="${name}"
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
        font-size:12px;color:#111;box-sizing:border-box;background:#fff;">
        <option value="" ${!current ? 'selected' : ''}>— not set —</option>
        ${options.map(([val, label]) =>
          `<option value="${esc(val)}" ${current === val ? 'selected' : ''}>${esc(label)}</option>`
        ).join('')}
      </select>
    </div>`;

  const markerDisplay = Array.isArray(m.marker) ? m.marker.join(', ') : (m.marker ?? '');

  const existingGeneRows = genes.map(g => `
    <div class="mem-gene-existing" data-gene-id="${esc(g.id)}"
      style="display:flex;align-items:center;justify-content:space-between;
             background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;
             padding:5px 8px;margin-bottom:4px;">
      <span style="font-size:10px;font-family:'DM Mono',monospace;color:#111;">${esc(g.locus_tag)}</span>
      <span style="font-size:10px;color:#6b7280;">${esc(g.gene_name ?? '')}</span>
      <button type="button" class="mem-gene-remove" data-gene-id="${esc(g.id)}"
        style="font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;line-height:1;padding:0 2px;">×</button>
    </div>`).join('');

  const adminSection = isAdmin ? `
    <!-- Admin: contributed_by -->
    <div style="border-top:1px solid #f0f0f0;margin-top:4px;padding-top:12px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:8px;">Admin</div>
      <div>
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Contributed By (user)</label>
        <div id="mem-contrib-display" style="font-size:10px;color:#6b7280;margin-bottom:6px;">
          ${m.contributed_by ? `UUID: ${esc(m.contributed_by)}` : '— not set —'}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="mem-contrib-search" placeholder="Search by email…"
            style="flex:1;border:1.5px solid #e2e8f0;border-radius:7px;padding:6px 9px;
            font-size:11px;color:#111;box-sizing:border-box;">
          <button type="button" id="mem-contrib-lookup"
            style="background:#0f172a;border:none;border-radius:7px;padding:6px 12px;
            font-size:10px;color:white;font-weight:600;cursor:pointer;white-space:nowrap;">
            Look up
          </button>
        </div>
        <div id="mem-contrib-result" style="margin-top:6px;display:none;"></div>
        <input type="hidden" id="mem-contrib-value" value="${esc(m.contributed_by ?? '')}">
      </div>
    </div>
    <!-- Admin: publish toggle -->
    <div style="margin-top:12px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="mem-published" ${m.is_published ? 'checked' : ''}>
        <span style="font-size:11px;font-weight:600;color:#374151;">Published (visible to public)</span>
      </label>
    </div>` : '';

  return `
    <div id="mut-edit-modal"
      style="background:white;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.25);
             width:440px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;
             font-size:12px;overflow:hidden;">

      <!-- Header -->
      <div style="padding:16px 18px 12px;border-bottom:1px solid #f0f0f0;
        display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#111;">Edit Mutant</div>
          <div style="font-size:9px;color:#94a3b8;font-family:'DM Mono',monospace;margin-top:1px;">
            ${esc(m.mutant_id)}
          </div>
        </div>
        <button id="mem-close"
          style="font-size:18px;color:#d1d5db;background:none;border:none;cursor:pointer;line-height:1;padding:0;">✕</button>
      </div>

      <!-- Body (scrollable) -->
      <div style="padding:16px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;">

        ${field('Name', 'name', m.name)}
        ${field('Creator Name', 'creator_name', m.creator_name)}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${selectEl('Mutation Type', 'mutation_type', [
            ['transposon','Transposon'],['deletion','Deletion'],
            ['chemical','Chemical'],['intron','Intron'],['recombination','Recombination']
          ], m.mutation_type)}
          ${selectEl('Collection', 'collection', [
            ['CT_L2','CT/L2'],['CM','C. muridarum'],
            ['Lucky17','Lucky 17'],['Chimeras','Chimeras']
          ], m.collection)}
        </div>

        ${field('Plasmid Used', 'plasmid_used', m.plasmid_used)}
        ${field('Marker(s)', 'marker', markerDisplay, 'placeholder="e.g. aadA, gfp"')}

        <div>
          <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
            letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Notes</label>
          <textarea name="notes" rows="3"
            style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
            font-size:12px;color:#111;box-sizing:border-box;resize:vertical;">${esc(m.notes ?? '')}</textarea>
        </div>

        <!-- Target Genes -->
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
            color:#64748b;margin-bottom:6px;">Target Genes</div>
          <div id="mem-gene-list" style="margin-bottom:8px;">
            ${existingGeneRows}
          </div>
          <!-- Gene search -->
          <div style="display:flex;gap:6px;margin-bottom:4px;">
            <input id="mem-gene-input" placeholder="Locus tag (e.g. CT142)"
              style="flex:1;border:1.5px solid #e2e8f0;border-radius:7px;padding:6px 9px;
              font-size:11px;color:#111;box-sizing:border-box;">
            <button type="button" id="mem-gene-lookup"
              style="background:#0f172a;border:none;border-radius:7px;padding:6px 12px;
              font-size:10px;color:white;font-weight:600;cursor:pointer;white-space:nowrap;">
              Look up
            </button>
          </div>
          <div id="mem-gene-error" style="font-size:10px;color:#dc2626;display:none;margin-bottom:4px;"></div>
          <div id="mem-gene-result" style="display:none;"></div>
        </div>

        ${adminSection}

      </div>

      <!-- Footer -->
      <div style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;
        justify-content:flex-end;gap:8px;flex-shrink:0;">
        <button id="mem-cancel"
          style="border:1.5px solid #e2e8f0;border-radius:8px;padding:7px 16px;
          font-size:11px;font-weight:600;color:#374151;background:white;cursor:pointer;">
          Cancel
        </button>
        <button id="mem-save"
          style="background:#059669;border:none;border-radius:8px;padding:7px 16px;
          font-size:11px;font-weight:600;color:white;cursor:pointer;">
          Save
        </button>
      </div>
    </div>`;
}
```

- [ ] **Step 5: Add wireMutantEditEvents function**

```js
function wireMutantEditEvents(overlay, m, initialGenes, closeModal, rightEl) {
  overlay.querySelector('#mem-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#mem-cancel')?.addEventListener('click', closeModal);

  const isAdmin = state.userRole === 'admin';

  // Track staged gene changes: arrays of gene objects {id, locus_tag, gene_name}
  const stagedGenes   = [...initialGenes];  // mutable copy — reflects current desired state
  const genesToAdd    = [];                 // new gene objects staged for add
  const geneIdsToRemove = new Set();        // IDs staged for removal

  // Remove existing gene
  overlay.querySelector('#mem-gene-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.mem-gene-remove');
    if (!btn) return;
    const geneId = btn.dataset.geneId;
    geneIdsToRemove.add(geneId);
    const idx = stagedGenes.findIndex(g => g.id === geneId);
    if (idx !== -1) stagedGenes.splice(idx, 1);
    btn.closest('.mem-gene-existing')?.remove();
  });

  // Gene lookup
  overlay.querySelector('#mem-gene-lookup')?.addEventListener('click', async () => {
    const input   = overlay.querySelector('#mem-gene-input');
    const errorEl = overlay.querySelector('#mem-gene-error');
    const resultEl = overlay.querySelector('#mem-gene-result');
    const rawTag  = (input?.value ?? '').trim().toUpperCase();

    errorEl.style.display  = 'none';
    resultEl.style.display = 'none';
    resultEl.innerHTML = '';

    if (!rawTag) {
      errorEl.textContent   = 'Enter a locus tag.';
      errorEl.style.display = 'block';
      return;
    }

    const lookupBtn = overlay.querySelector('#mem-gene-lookup');
    lookupBtn.textContent = 'Looking up…';
    lookupBtn.disabled    = true;

    try {
      const { data: matches, error } = await sb
        .from('genes')
        .select('id, locus_tag, gene_name, strain_id, strains(common_name)')
        .eq('background_strain_id' in m && m.background_strain_id
          ? 'strain_id' : 'locus_tag',
          m.background_strain_id ?? rawTag)
        .ilike('locus_tag', rawTag)
        .limit(5);

      // Simpler query: just search by locus_tag, scoped to strain if available
      const { data: geneMatches } = await sb
        .from('genes')
        .select('id, locus_tag, gene_name, strains(common_name)')
        .ilike('locus_tag', rawTag)
        .eq('strain_id', m.background_strain_id ?? '00000000-0000-0000-0000-000000000000')
        .limit(5);

      const found = geneMatches?.[0] ?? null;
      if (!found) {
        errorEl.textContent   = `No gene found with locus tag "${rawTag}" in this strain.`;
        errorEl.style.display = 'block';
        return;
      }

      if (stagedGenes.some(g => g.id === found.id)) {
        errorEl.textContent   = 'This gene is already in the target list.';
        errorEl.style.display = 'block';
        return;
      }

      resultEl.innerHTML = `
        <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:5px;padding:7px 9px;">
          <div style="font-size:9px;font-weight:600;color:#065f46;">✓ Found: ${esc(found.locus_tag)}</div>
          <div style="font-size:9px;color:#047857;margin-top:2px;">
            ${esc(found.gene_name ?? 'Hypothetical protein')} · ${esc(found.strains?.common_name ?? '')}
          </div>
          <button type="button" id="mem-gene-add"
            data-gene-id="${esc(found.id)}"
            data-locus-tag="${esc(found.locus_tag)}"
            data-gene-name="${esc(found.gene_name ?? '')}"
            style="margin-top:6px;background:#059669;border:none;border-radius:4px;
            padding:3px 9px;font-size:9px;color:white;font-weight:600;cursor:pointer;">
            Add this gene
          </button>
        </div>`;
      resultEl.style.display = 'block';

      resultEl.querySelector('#mem-gene-add')?.addEventListener('click', e => {
        const b = e.currentTarget;
        const newGene = { id: b.dataset.geneId, locus_tag: b.dataset.locusTag, gene_name: b.dataset.geneName };
        genesToAdd.push(newGene);
        stagedGenes.push(newGene);

        const listEl = overlay.querySelector('#mem-gene-list');
        const row = document.createElement('div');
        row.className = 'mem-gene-existing';
        row.dataset.geneId = newGene.id;
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#f0fdf4;border:1px solid #6ee7b7;border-radius:5px;padding:5px 8px;margin-bottom:4px;';
        row.innerHTML = `
          <span style="font-size:10px;font-family:'DM Mono',monospace;color:#111;">${esc(newGene.locus_tag)}</span>
          <span style="font-size:10px;color:#6b7280;">${esc(newGene.gene_name)}</span>
          <button type="button" class="mem-gene-remove" data-gene-id="${esc(newGene.id)}"
            style="font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;line-height:1;padding:0 2px;">×</button>`;
        listEl?.appendChild(row);

        input.value           = '';
        resultEl.style.display = 'none';
        resultEl.innerHTML     = '';
      });
    } finally {
      lookupBtn.textContent = 'Look up';
      lookupBtn.disabled    = false;
    }
  });

  // Admin: contributed_by user lookup
  if (isAdmin) {
    overlay.querySelector('#mem-contrib-lookup')?.addEventListener('click', async () => {
      const input    = overlay.querySelector('#mem-contrib-search');
      const resultEl = overlay.querySelector('#mem-contrib-result');
      const query    = (input?.value ?? '').trim();
      if (!query) return;

      resultEl.style.display = 'none';
      resultEl.innerHTML     = '';

      const { data: users } = await sb
        .from('users')
        .select('id, display_name, email')
        .ilike('email', `%${query}%`)
        .limit(5);

      if (!users?.length) {
        resultEl.innerHTML     = `<div style="font-size:10px;color:#dc2626;">No users found.</div>`;
        resultEl.style.display = 'block';
        return;
      }

      resultEl.innerHTML = users.map(u => `
        <button type="button" class="mem-contrib-pick"
          data-uid="${esc(u.id)}" data-label="${esc(u.display_name || u.email)}"
          style="display:block;width:100%;text-align:left;background:#f8fafc;
                 border:1px solid #e2e8f0;border-radius:5px;padding:5px 9px;
                 margin-bottom:3px;font-size:10px;cursor:pointer;">
          ${esc(u.display_name || u.email)}
          <span style="color:#9ca3af;font-size:9px;margin-left:4px;">${esc(u.email)}</span>
        </button>`).join('');
      resultEl.style.display = 'block';

      resultEl.querySelectorAll('.mem-contrib-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelector('#mem-contrib-value').value = btn.dataset.uid;
          overlay.querySelector('#mem-contrib-display').textContent = btn.dataset.label;
          resultEl.style.display = 'none';
          input.value = '';
        });
      });
    });
  }

  // Save
  overlay.querySelector('#mem-save')?.addEventListener('click', async () => {
    const saveBtn = overlay.querySelector('#mem-save');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    const modal = overlay.querySelector('#mut-edit-modal');
    const diff  = {};

    // Collect changed scalar fields
    const scalarFields = ['name','creator_name','mutation_type','collection','plasmid_used','notes'];
    scalarFields.forEach(f => {
      const el = modal.querySelector(`[name="${f}"]`);
      if (!el) return;
      const val = el.value.trim() || null;
      if (val !== (m[f] ?? null)) diff[f] = val;
    });

    // marker: comma-split → array
    const markerRaw   = (modal.querySelector('[name="marker"]')?.value ?? '').trim();
    const markerArr   = markerRaw ? markerRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const origMarker  = Array.isArray(m.marker) ? [...m.marker].sort().join(',') : (m.marker ?? '');
    if (markerArr.sort().join(',') !== origMarker) diff.marker = markerArr;

    // target_gene_ids: replace full array if changed
    const newGeneIds = stagedGenes.map(g => g.id);
    const oldGeneIds = (m.target_gene_ids ?? []).slice().sort().join(',');
    if (newGeneIds.slice().sort().join(',') !== oldGeneIds) {
      diff.target_gene_ids = newGeneIds.length ? newGeneIds : null;
    }

    // contributed_by (admin only)
    if (isAdmin) {
      const newContrib = overlay.querySelector('#mem-contrib-value')?.value || null;
      if (newContrib !== (m.contributed_by ?? null)) diff.contributed_by = newContrib;
    }

    let saveError = null;

    // PATCH scalar + array fields
    if (Object.keys(diff).length) {
      diff.updated_by = state.user.id;
      const { error } = await sb.from('mutants').update(diff).eq('id', m.id);
      if (error) saveError = error.message;
    }

    // is_published RPC (admin only, if changed)
    if (isAdmin && !saveError) {
      const newPub = overlay.querySelector('#mem-published')?.checked ?? m.is_published;
      if (newPub !== m.is_published) {
        const { error } = await sb.rpc('set_mutant_published', {
          target_mutant_id: m.id,
          published: newPub,
        });
        if (error) saveError = error.message;
      }
    }

    saveBtn.textContent = 'Save';
    saveBtn.disabled    = false;

    if (saveError) {
      alert(`Save failed: ${saveError}`);
      return;
    }

    closeModal();
    // Re-render the detail panel with fresh data
    loadDetail(m.id);
  });
}
```

- [ ] **Step 6: Verify the gene lookup query is correct**

The gene lookup in `wireMutantEditEvents` has a stray attempted query that should be cleaned up. The actual lookup should be:

```js
const { data: geneMatches } = await sb
  .from('genes')
  .select('id, locus_tag, gene_name, strains(common_name)')
  .ilike('locus_tag', rawTag)
  .eq('strain_id', m.background_strain_id)
  .limit(5);
```

Replace the two `const { data: ... }` lines in the gene lookup handler (including the erroneous first attempt) with only:

```js
const { data: geneMatches } = await sb
  .from('genes')
  .select('id, locus_tag, gene_name, strains(common_name)')
  .ilike('locus_tag', rawTag)
  .eq('strain_id', m.background_strain_id)
  .limit(5);

const found = geneMatches?.[0] ?? null;
```

- [ ] **Step 7: Commit**

```bash
git add web/js/views/mutants.js
git commit -m "feat: mutant edit modal — fields, target gene search, admin controls, save with diff PATCH"
```

---

## Task 6 — Cache version bump + final wiring

**Files:**
- Modify: `web/index.html`
- Modify: `web/js/app.js` (genomes + mutants import lines)

- [ ] **Step 1: Bump genomes.js and mutants.js import version in app.js**

In `web/js/app.js`, find:

```js
import { renderGenomes } from './views/genomes.js?v=77';
import { renderMutants } from './views/mutants.js?v=77';
```

Change both to `?v=78`.

- [ ] **Step 2: Bump app.js version in index.html**

In `web/index.html`, find the script tag importing `app.js`:

```html
<script type="module" src="/js/app.js?v=77"></script>
```

Change to `?v=78`.

- [ ] **Step 3: Verify the app loads cleanly**

Open the browser. Sign in as Kevin. Check:
- Gene list rows show star buttons for your favorited genes
- Clicking a star in the gene list toggles it correctly
- Mutant detail hero shows the star in correct filled/empty state
- Clicking a mutant star toggles it correctly
- Gene detail → Mutants section shows a list (or "No mutants target this gene")
- Clicking a mutant row in the gene detail Mutants panel navigates to Mutants tab with that mutant pre-selected
- Pencil button in mutant detail hero is visible (since Kevin is admin)
- Mutant edit modal opens, all fields populated
- Save patches the record and re-renders the detail

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/js/app.js
git commit -m "chore: bump cache version to v=78 across app.js, genomes.js, mutants.js, index.html"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Fix star buttons — both gene and mutant | Task 2 (re-render after sync) |
| contributed_by column + trigger + RLS | Task 1 |
| Edit button hidden from guests; shown for lab+/admin/owner | Task 5 Step 2 |
| Mutant edit modal with all fields | Task 5 Steps 3–5 |
| Target gene staged add/remove with locus search | Task 5 Step 5 |
| contributed_by user lookup (admin only) | Task 5 Step 5 |
| is_published via set_mutant_published RPC (admin only) | Task 5 Step 5 |
| Post-save re-render | Task 5 Step 5 |
| Gene detail Mutants panel — live query | Task 4 Steps 1–3 |
| Mutants panel — click navigates to Mutants tab | Task 4 Step 3 |
| window.__openMutantId consumed on render | Task 3 Steps 2–3 |

**Type/name consistency check:**
- `openMutantEditModal(m, genes, rightEl)` — called in Task 5 Step 2, defined in Step 3 ✓
- `buildMutantEditHtml(m, genes)` — called in Step 3, defined in Step 4 ✓
- `wireMutantEditEvents(overlay, m, genes, closeModal, rightEl)` — called in Step 3, defined in Step 5 ✓
- `loadDetail(m.id)` post-save — already defined at line ~559 ✓
- `#mem-gene-list`, `#mem-gene-input`, `#mem-gene-lookup`, `#mem-gene-result`, `#mem-gene-error` — IDs in Step 4 HTML, listeners in Step 5 ✓
- `#mem-contrib-value`, `#mem-contrib-display`, `#mem-contrib-search`, `#mem-contrib-lookup`, `#mem-contrib-result` — IDs in Step 4, listeners in Step 5 ✓
- `#mem-published`, `#mem-save`, `#mem-cancel`, `#mem-close` — IDs in Step 4, listeners in Step 5 ✓
- `.mem-gene-existing`, `.mem-gene-remove` — class in Step 4, delegation target in Step 5 ✓
- `d-mutants` id — added in Task 4 Step 4, queried in `renderDetailMutants` Step 3 ✓

**Placeholder scan:** No TBDs, no "implement later", no "handle edge cases" without code. All code blocks complete.

**One known simplification:** The gene lookup in Step 5 includes a stray duplicate query block; Step 6 calls it out explicitly to clean up. This ensures the subagent sees it as a deliberate fix step.
