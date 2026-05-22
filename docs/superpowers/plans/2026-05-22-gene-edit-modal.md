# Gene Edit Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centered edit modal to the gene detail panel, letting any authenticated user update gene/protein fields live with a full audit trail.

**Architecture:** A single `openGeneEditModal(gene, protein)` function appended to `web/js/views/genomes.js`. A pencil button in the gene detail hero (next to the star) triggers it. Writes go to `genes`, `proteins`, and `alphafold_results` via the Supabase anon key (authenticated RLS); every save also inserts a row into a new `gene_edit_log` table.

**Tech Stack:** Vanilla JS, Supabase REST (existing `sb` client), RCSB public API (`data.rcsb.org`), Tailwind-style inline CSS matching existing patterns.

**Spec:** `docs/superpowers/specs/2026-05-22-gene-edit-modal.md`

---

## File map

| File | Action | What changes |
|---|---|---|
| `web/js/views/genomes.js` | Modify | Pencil button in hero HTML; new `openGeneEditModal` function at bottom |
| `web/js/app.js` | Modify | Bump `genomes.js` cache version |
| `web/index.html` | Modify | Bump `app.js` cache version |
| Supabase SQL | Run in dashboard | Create `gene_edit_log` table + RLS; updated_at trigger on `genes` |

---

## Task 1: Database — gene_edit_log table + RLS + trigger

**Files:**
- Run in Supabase SQL editor (Dashboard → SQL Editor)

- [ ] **Step 1: Run the migration SQL**

Open Supabase dashboard → SQL Editor and run:

```sql
-- 1. gene_edit_log audit table
create table if not exists public.gene_edit_log (
  id         uuid primary key default gen_random_uuid(),
  gene_id    uuid not null references public.genes(id) on delete cascade,
  editor_id  uuid not null references auth.users(id),
  edited_at  timestamptz not null default now(),
  changes    jsonb not null
);

-- RLS
alter table public.gene_edit_log enable row level security;

-- Authenticated users can insert
create policy "auth_insert_edit_log"
  on public.gene_edit_log for insert
  to authenticated
  with check (editor_id = auth.uid());

-- Admins can select (for dashboard review + rollback)
create policy "admin_select_edit_log"
  on public.gene_edit_log for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- 2. updated_at trigger on genes (set server-side, not client-supplied)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists genes_set_updated_at on public.genes;
create trigger genes_set_updated_at
  before update on public.genes
  for each row execute function public.set_updated_at();

-- 3. Verify authenticated users can UPDATE genes and proteins
-- Run these and confirm both return rows (not empty):
select policyname, cmd from pg_policies
where tablename in ('genes', 'proteins') and cmd = 'UPDATE';
```

- [ ] **Step 2: Confirm policies exist**

The final SELECT should return at least one UPDATE policy for `genes` and one for `proteins`. If either is missing, add it:

```sql
-- If genes UPDATE policy is missing:
create policy "auth_update_genes"
  on public.genes for update
  to authenticated
  using (true)
  with check (true);

-- If proteins UPDATE policy is missing:
create policy "auth_update_proteins"
  on public.proteins for update
  to authenticated
  using (true)
  with check (true);
```

- [ ] **Step 3: Commit note**

```bash
git commit --allow-empty -m "db: add gene_edit_log table, RLS policies, updated_at trigger"
```

---

## Task 2: Pencil button in gene detail hero

**Files:**
- Modify: `web/js/views/genomes.js:2176-2180`

- [ ] **Step 1: Locate the hero button block**

In `genomes.js`, find the line (around 2176):
```js
        <button id="detail-fav-btn" data-id="${gene.id}"
```

- [ ] **Step 2: Add pencil button after the star button**

Replace the existing star button block with the star + pencil pair:

```js
        <button id="detail-fav-btn" data-id="${gene.id}"
          style="font-size:16px;background:none;border:none;cursor:pointer;color:${isFav ? '#f59e0b' : '#d1d5db'};padding:0;flex-shrink:0;padding-top:2px;"
          title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          ${isFav ? '★' : '☆'}
        </button>
        ${state.user ? `
        <button id="detail-edit-btn"
          style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:0;flex-shrink:0;padding-top:2px;margin-left:2px;"
          title="Edit gene">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H2v-3L11.5 2.5z"/></svg>
        </button>` : ''}
```

- [ ] **Step 3: Wire the edit button after DOM injection**

In the same `showGeneDetailDesktop` function, after the existing fav-button listener (around line 2253), add:

```js
  // Wire edit button
  detail.querySelector('#detail-edit-btn')?.addEventListener('click', () => {
    openGeneEditModal(gene, null, detail, container);
  });
```

Note: `protein` is passed as `null` here because the protein loads asynchronously. `openGeneEditModal` will fetch it if needed (see Task 3).

- [ ] **Step 4: Manual test**

Load the app, log in, open any gene detail. Confirm pencil icon appears next to the star. Confirm it does NOT appear when logged out.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: add edit pencil button to gene detail hero"
```

---

## Task 3: Modal scaffold — open, close, ESC, backdrop

**Files:**
- Modify: `web/js/views/genomes.js` (append at bottom)

- [ ] **Step 1: Add the modal scaffold function at the bottom of genomes.js**

```js
// ─── Gene Edit Modal ──────────────────────────────────────────────────────────

async function openGeneEditModal(gene, proteinArg, detail, container) {
  // Remove any stale modal
  document.getElementById('gene-edit-overlay')?.remove();

  // Fetch protein if not provided
  let protein = proteinArg;
  if (!protein && gene.id) {
    const { data } = await sb
      .from('proteins')
      .select('*')
      .eq('gene_id', gene.id)
      .maybeSingle();
    protein = data;
  }

  // Fetch existing PDB entries for this protein
  let pdbRows = [];
  if (protein?.id) {
    const { data } = await sb
      .from('alphafold_results')
      .select('id,top_homolog_pdb_id,top_homolog_description,homology_score')
      .eq('protein_id', protein.id)
      .eq('af_version', 'PDB');
    pdbRows = data ?? [];
  }

  const overlay = document.createElement('div');
  overlay.id = 'gene-edit-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;',
    'display:flex;align-items:center;justify-content:center;padding:16px;',
  ].join('');

  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', onEsc);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  overlay.innerHTML = buildModalHtml(gene, protein, pdbRows);
  document.body.appendChild(overlay);

  wireModalEvents(overlay, gene, protein, pdbRows, closeModal, detail, container);
}
```

- [ ] **Step 2: Add placeholder stubs so the file runs without errors**

Directly after the function above, add:

```js
function buildModalHtml(gene, protein, pdbRows) {
  return `<div id="gene-edit-modal" style="background:white;border-radius:14px;
    box-shadow:0 12px 40px rgba(0,0,0,0.25);width:420px;max-width:100%;
    font-size:12px;overflow:hidden;">
    <div style="padding:16px 18px 12px;border-bottom:1px solid #f0f0f0;
      display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#111;">Edit Gene</div>
        <div style="font-size:9px;color:#94a3b8;font-family:'DM Mono',monospace;margin-top:1px;">
          ${esc(gene.locus_tag)} · ${esc(gene.strains?.common_name ?? '')}
        </div>
      </div>
      <button id="gem-close" style="font-size:18px;color:#d1d5db;background:none;
        border:none;cursor:pointer;line-height:1;padding:0;">✕</button>
    </div>
    <div id="gem-body" style="padding:14px 18px;max-height:70vh;overflow-y:auto;">
      <p style="color:#94a3b8;font-size:11px;">Form coming in next task…</p>
    </div>
    <div id="gem-footer" style="padding:12px 18px;border-top:1px solid #f0f0f0;
      display:flex;gap:8px;background:#fafafa;">
      <button id="gem-cancel" style="flex:1;background:#f1f5f9;border:none;border-radius:7px;
        padding:9px;font-size:12px;color:#64748b;cursor:pointer;font-weight:500;">Cancel</button>
      <button id="gem-save" style="flex:2;background:#111;border:none;border-radius:7px;
        padding:9px;font-size:12px;color:white;font-weight:600;cursor:pointer;">Save Changes</button>
    </div>
  </div>`;
}

function wireModalEvents(overlay, gene, protein, pdbRows, closeModal, detail, container) {
  overlay.querySelector('#gem-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#gem-cancel')?.addEventListener('click', closeModal);
}
```

- [ ] **Step 3: Manual test**

Log in, open a gene detail, click pencil. Modal should appear with dark backdrop. Confirm it closes via: ✕ button, Cancel, ESC key, clicking outside the white box.

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene edit modal scaffold — open/close/ESC/backdrop"
```

---

## Task 4: Primary form fields HTML

**Files:**
- Modify: `web/js/views/genomes.js` — replace `buildModalHtml` stub

The functional category options come from the `CATEGORY_COLORS` constant already in genomes.js. The localization dropdown uses human-readable labels mapped to SL term IDs.

- [ ] **Step 1: Replace `buildModalHtml` with the full primary fields version**

```js
const CATEGORY_OPTIONS = Object.keys(CATEGORY_COLORS);

const LOC_OPTIONS = [
  { id: '',        label: '— not set —' },
  { id: 'SL-0086', label: 'Cytoplasm' },
  { id: 'SL-0037', label: 'Cell inner membrane' },
  { id: 'SL-0040', label: 'Cell outer membrane' },
  { id: 'SL-0200', label: 'Membrane' },
  { id: 'SL-0187', label: 'Periplasm' },
  { id: 'SL-0204', label: 'Secreted' },
  { id: 'SL-0310', label: 'Cell surface' },
  { id: 'SL-0122', label: 'Host cell membrane' },
  { id: 'SL-0478', label: 'Host cytoplasm' },
];

function buildModalHtml(gene, protein, pdbRows) {
  const curLoc = protein?.subcellular_location_sl?.[0] ?? '';
  const catOpts = CATEGORY_OPTIONS.map(c =>
    `<option value="${esc(c)}" ${gene.functional_category === c ? 'selected' : ''}>${esc(c)}</option>`
  ).join('');
  const locOpts = LOC_OPTIONS.map(o =>
    `<option value="${esc(o.id)}" ${curLoc === o.id ? 'selected' : ''}>${esc(o.label)}</option>`
  ).join('');

  const field = (label, name, value, extra = '') =>
    `<div>
      <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:#64748b;margin-bottom:4px;">${label}</label>
      <input name="${name}" value="${esc(value ?? '')}" ${extra}
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
        font-size:12px;color:#111;box-sizing:border-box;background:#fff;">
      <div id="gem-err-${name}" style="font-size:10px;color:#dc2626;margin-top:2px;display:none;"></div>
    </div>`;

  const checkEl = (label, name, checked) =>
    `<label style="display:flex;align-items:center;gap:5px;background:#f8fafc;
      border:1.5px solid #e2e8f0;border-radius:6px;padding:5px 9px;cursor:pointer;
      font-size:11px;color:#374151;">
      <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${label}
    </label>`;

  return `<div id="gene-edit-modal" style="background:white;border-radius:14px;
    box-shadow:0 12px 40px rgba(0,0,0,0.25);width:420px;max-width:100%;
    font-size:12px;overflow:hidden;">

    <!-- Header -->
    <div style="padding:16px 18px 12px;border-bottom:1px solid #f0f0f0;
      display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#111;">Edit Gene</div>
        <div style="font-size:9px;color:#94a3b8;font-family:'DM Mono',monospace;margin-top:1px;">
          ${esc(gene.locus_tag)} · ${esc(gene.strains?.common_name ?? '')}
        </div>
      </div>
      <button id="gem-close" style="font-size:18px;color:#d1d5db;background:none;
        border:none;cursor:pointer;line-height:1;padding:0;">✕</button>
    </div>

    <!-- Body -->
    <div id="gem-body" style="padding:14px 18px;max-height:70vh;overflow-y:auto;">

      <!-- Gene name + symbol -->
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:10px;margin-bottom:10px;">
        ${field('Gene Name', 'gene_name', gene.gene_name)}
        ${field('Symbol', 'gene_symbol', gene.gene_symbol, 'style="font-family:\'DM Mono\',monospace;"')}
      </div>

      <!-- Product -->
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Product Description</label>
        <textarea name="product" rows="2"
          style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
          font-size:11.5px;color:#111;box-sizing:border-box;resize:vertical;">${esc(gene.product ?? '')}</textarea>
      </div>

      <!-- Functional category -->
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Functional Category</label>
        <select name="functional_category"
          style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
          font-size:12px;color:#111;background:white;">
          ${catOpts}
        </select>
      </div>

      <!-- Flags -->
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:6px;">Properties</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${checkEl('Hypothetical', 'is_hypothetical', gene.is_hypothetical)}
          ${checkEl('Membrane',     'is_membrane_protein', gene.is_membrane_protein)}
          ${checkEl('T3 Secreted',  'is_t3_secreted', gene.is_t3_secreted)}
          ${checkEl('DNA Binding',  'is_dna_binding', gene.is_dna_binding)}
        </div>
      </div>

      <!-- Localization -->
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">
          Localization
          <span style="font-weight:400;color:#94a3b8;">(lab-curated)</span>
        </label>
        <select name="localization_sl"
          style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
          font-size:12px;color:#111;background:white;">
          ${locOpts}
        </select>
      </div>

      <!-- Advanced expander placeholder -->
      <div id="gem-advanced-wrap"></div>

      <!-- UniProt sync placeholder -->
      <div style="border:1.5px dashed #e2e8f0;border-radius:7px;padding:8px 10px;
        display:flex;align-items:center;gap:8px;background:#fafafa;margin-bottom:4px;">
        <div style="font-size:14px;">🔄</div>
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:600;color:#94a3b8;">Sync with UniProt</div>
          <div style="font-size:9px;color:#cbd5e1;">Coming soon — refresh protein data from UniProt</div>
        </div>
        <button disabled style="background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:5px;
          padding:4px 9px;font-size:9px;color:#cbd5e1;cursor:not-allowed;">Sync</button>
      </div>

    </div>

    <!-- Error banner (hidden by default) -->
    <div id="gem-error-banner" style="display:none;margin:0 18px;padding:8px 12px;
      background:#fef2f2;border:1px solid #fecaca;border-radius:7px;
      font-size:11px;color:#dc2626;line-height:1.4;"></div>

    <!-- Footer -->
    <div style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;background:#fafafa;">
      <button id="gem-cancel" style="flex:1;background:#f1f5f9;border:none;border-radius:7px;
        padding:9px;font-size:12px;color:#64748b;cursor:pointer;font-weight:500;">Cancel</button>
      <button id="gem-save" style="flex:2;background:#111;border:none;border-radius:7px;
        padding:9px;font-size:12px;color:white;font-weight:600;cursor:pointer;">Save Changes</button>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Manual test**

Open edit modal on a gene with known values (e.g., a named gene like `tarp` / CTL0008). Confirm all primary fields are pre-filled correctly. Verify the localization dropdown shows the current curated value if one exists.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene edit modal — primary form fields HTML"
```

---

## Task 5: Advanced expander + protein fields

**Files:**
- Modify: `web/js/views/genomes.js` — add `buildAdvancedHtml` and call it from `wireModalEvents`

- [ ] **Step 1: Add `buildAdvancedHtml` function**

```js
function buildAdvancedHtml(protein, pdbRows) {
  const v = k => esc(String(protein?.[k] ?? ''));

  const advField = (label, name, value, extra = '') =>
    `<div>
      <label style="display:block;font-size:8px;color:#64748b;font-weight:600;
        margin-bottom:3px;">${label}</label>
      <input name="${name}" value="${esc(value ?? '')}" ${extra}
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:5px;padding:5px 7px;
        font-size:11px;box-sizing:border-box;">
      <div id="gem-err-${name}" style="font-size:10px;color:#dc2626;margin-top:2px;display:none;"></div>
    </div>`;

  const pdbList = pdbRows.map(r => `
    <div class="gem-pdb-existing" data-pdb-id="${esc(r.id)}"
      style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:6px;
      padding:7px 9px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;">
        <div style="font-size:10px;font-weight:600;font-family:'DM Mono',monospace;color:#111;">
          ${esc(r.top_homolog_pdb_id ?? '')}
        </div>
        <div style="font-size:9px;color:#64748b;margin-top:1px;">
          ${esc(r.top_homolog_description ?? '')}
        </div>
      </div>
      <button class="gem-pdb-remove" data-row-id="${esc(r.id)}"
        style="font-size:9px;color:#94a3b8;background:none;border:none;cursor:pointer;
        padding:2px 4px;">remove</button>
    </div>`).join('');

  return `
    <div style="border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:10px;">
      <button id="gem-adv-toggle" type="button"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;
        padding:8px 12px;background:#f8fafc;border:none;cursor:pointer;">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#94a3b8;">Advanced Fields</span>
        <span id="gem-adv-arrow" style="font-size:10px;color:#cbd5e1;">▸</span>
      </button>
      <div id="gem-adv-body" style="display:none;padding:12px;border-top:1px solid #e2e8f0;">

        <div style="font-size:8px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#94a3b8;margin-bottom:8px;">Protein Identity</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          ${advField('UniProt ID', 'uniprot_id', protein?.uniprot_id, 'style="font-family:\'DM Mono\',monospace;"')}
          ${advField('Protein Family', 'protein_family', protein?.protein_family)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          ${advField('Subunit Structure', 'oligomeric_state', protein?.oligomeric_state)}
          ${advField('Mass (kDa)', 'mass_kd', protein?.mass_kd)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
          ${advField('TM Domains', 'transmembrane_domains', protein?.transmembrane_domains, 'type="number" min="0"')}
          <div>
            <label style="display:block;font-size:8px;color:#64748b;font-weight:600;margin-bottom:5px;">
              Signal Peptide
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151;margin-top:5px;">
              <input type="checkbox" name="signal_peptide" ${protein?.signal_peptide ? 'checked' : ''}> Yes
            </label>
          </div>
        </div>

        <!-- PDB structures -->
        <div style="border-top:1px solid #e2e8f0;padding-top:10px;">
          <div style="font-size:8px;font-weight:700;text-transform:uppercase;
            letter-spacing:.05em;color:#94a3b8;margin-bottom:8px;">Crystal / PDB Structures</div>
          <div id="gem-pdb-list">${pdbList || '<div style="font-size:10px;color:#bbb;margin-bottom:6px;">No PDB entries on record.</div>'}</div>
          <!-- Add new PDB -->
          <div style="border:1.5px dashed #c7d2fe;border-radius:6px;padding:8px 9px;background:#fafffe;">
            <div style="font-size:8px;font-weight:700;text-transform:uppercase;
              letter-spacing:.05em;color:#6366f1;margin-bottom:5px;">Add New PDB Entry</div>
            <div style="display:flex;gap:6px;align-items:center;">
              <input id="gem-pdb-input" placeholder="e.g. 5YKG"
                style="flex:1;border:1.5px solid #c7d2fe;border-radius:5px;padding:5px 7px;
                font-size:11px;font-family:'DM Mono',monospace;box-sizing:border-box;text-transform:uppercase;">
              <button id="gem-pdb-lookup" type="button"
                style="background:#6366f1;border:none;border-radius:5px;padding:5px 10px;
                font-size:9px;color:white;font-weight:600;white-space:nowrap;cursor:pointer;">
                Look up ↗
              </button>
            </div>
            <div id="gem-pdb-error" style="font-size:10px;color:#dc2626;margin-top:4px;display:none;"></div>
            <div id="gem-pdb-result" style="display:none;margin-top:7px;"></div>
          </div>
        </div>
      </div>
    </div>`;
}
```

- [ ] **Step 2: Inject advanced HTML and wire toggle in `wireModalEvents`**

In `wireModalEvents`, after the close/cancel wiring, add:

```js
  // Inject advanced section
  const advWrap = overlay.querySelector('#gem-advanced-wrap');
  if (advWrap) advWrap.innerHTML = buildAdvancedHtml(protein, pdbRows);

  // Toggle advanced expander
  overlay.querySelector('#gem-adv-toggle')?.addEventListener('click', () => {
    const body  = overlay.querySelector('#gem-adv-body');
    const arrow = overlay.querySelector('#gem-adv-arrow');
    const open  = body.style.display === 'none';
    body.style.display  = open ? 'block' : 'none';
    arrow.textContent   = open ? '▾' : '▸';
  });
```

- [ ] **Step 3: Manual test**

Open edit modal. Advanced section should be collapsed. Click "Advanced Fields" — it expands to show protein fields pre-filled with existing data. Click again — it collapses.

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene edit modal — advanced fields expander with protein fields"
```

---

## Task 6: PDB lookup — RCSB fetch + staged entries

**Files:**
- Modify: `web/js/views/genomes.js` — add PDB wiring to `wireModalEvents`

- [ ] **Step 1: Add PDB state tracking and wiring in `wireModalEvents`**

After the advanced section injection, add:

```js
  // PDB staged state: entries to add (objects) and row IDs to delete (strings)
  const pdbToAdd    = [];   // { pdb_id, title, resolution }
  const pdbToDelete = [];   // alphafold_results.id strings

  // Remove existing PDB entry
  overlay.querySelector('#gem-pdb-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.gem-pdb-remove');
    if (!btn) return;
    const rowId = btn.dataset.rowId;
    pdbToDelete.push(rowId);
    btn.closest('.gem-pdb-existing').remove();
  });

  // PDB lookup
  overlay.querySelector('#gem-pdb-lookup')?.addEventListener('click', async () => {
    const input    = overlay.querySelector('#gem-pdb-input');
    const errorEl  = overlay.querySelector('#gem-pdb-error');
    const resultEl = overlay.querySelector('#gem-pdb-result');
    const rawId    = (input?.value ?? '').trim().toUpperCase();

    errorEl.style.display  = 'none';
    resultEl.style.display = 'none';
    resultEl.innerHTML     = '';

    if (!/^[A-Z0-9]{4}$/.test(rawId)) {
      errorEl.textContent    = 'PDB IDs are 4 characters (e.g. 5YKG).';
      errorEl.style.display  = 'block';
      return;
    }

    const btn = overlay.querySelector('#gem-pdb-lookup');
    btn.textContent = 'Looking up…';
    btn.disabled    = true;

    try {
      const res  = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${rawId}`);
      if (!res.ok) {
        throw Object.assign(new Error('not_found'), { status: res.status });
      }
      const data  = await res.json();
      const title = data.struct?.title ?? rawId;
      const res_a = data.rcsb_entry_info?.resolution_combined?.[0] ?? null;
      const year  = data.rcsb_accession_info?.initial_release_date?.slice(0, 4) ?? '';

      resultEl.innerHTML = `
        <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:5px;padding:7px 9px;">
          <div style="font-size:9px;font-weight:600;color:#065f46;">✓ Found: ${esc(rawId)}</div>
          <div style="font-size:9px;color:#047857;margin-top:2px;">
            ${esc(title)}${res_a ? ` · ${res_a} Å` : ''}${year ? ` · ${year}` : ''}
          </div>
          <button id="gem-pdb-add" type="button"
            data-pdb-id="${esc(rawId)}"
            data-title="${esc(title)}"
            data-resolution="${esc(String(res_a ?? ''))}"
            style="margin-top:6px;background:#059669;border:none;border-radius:4px;
            padding:3px 9px;font-size:9px;color:white;font-weight:600;cursor:pointer;">
            Add this structure
          </button>
        </div>`;
      resultEl.style.display = 'block';

      resultEl.querySelector('#gem-pdb-add')?.addEventListener('click', e => {
        const b = e.currentTarget;
        pdbToAdd.push({ pdb_id: b.dataset.pdbId, title: b.dataset.title, resolution: b.dataset.resolution });
        // Show staged entry in the list
        const listEl = overlay.querySelector('#gem-pdb-list');
        listEl.insertAdjacentHTML('beforeend', `
          <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:6px;
            padding:7px 9px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
            <div style="flex:1;">
              <div style="font-size:10px;font-weight:600;font-family:'DM Mono',monospace;color:#111;">
                ${esc(b.dataset.pdbId)} <span style="font-size:8px;color:#059669;">(staged)</span>
              </div>
              <div style="font-size:9px;color:#64748b;">${esc(b.dataset.title)}</div>
            </div>
          </div>`);
        resultEl.style.display = 'none';
        resultEl.innerHTML     = '';
        input.value            = '';
      });
    } catch (err) {
      errorEl.textContent   = err.status === 404 || err.message === 'not_found'
        ? `No PDB entry found for '${rawId}'. Double-check the ID at rcsb.org.`
        : "Couldn't reach RCSB right now. Check your connection or try again in a moment.";
      errorEl.style.display = 'block';
    } finally {
      btn.textContent = 'Look up ↗';
      btn.disabled    = false;
    }
  });

  // Expose staged state on the overlay element for the save handler
  overlay._pdbToAdd    = pdbToAdd;
  overlay._pdbToDelete = pdbToDelete;
```

- [ ] **Step 2: Manual test**

Expand Advanced. Enter `5YKG` → "Look up ↗" → verified result card appears. Click "Add this structure" → it moves to the staged list. Enter an invalid ID like `XXXX` → appropriate error. Remove an existing entry → it disappears from the list.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene edit modal — PDB lookup with RCSB verification"
```

---

## Task 7: Client-side validation

**Files:**
- Modify: `web/js/views/genomes.js` — add `validateGeneEditForm`

- [ ] **Step 1: Add validation function**

```js
function validateGeneEditForm(overlay) {
  let valid = true;

  function fieldErr(name, msg) {
    const el = overlay.querySelector(`#gem-err-${name}`);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    valid = false;
  }
  function fieldOk(name) {
    const el = overlay.querySelector(`#gem-err-${name}`);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  const form = overlay.querySelector('#gene-edit-modal');
  const val  = name => (form?.querySelector(`[name="${name}"]`)?.value ?? '').trim();

  // TM domains: non-negative integer
  const tm = val('transmembrane_domains');
  if (tm !== '' && (!/^\d+$/.test(tm) || Number(tm) < 0)) {
    fieldErr('transmembrane_domains', 'Must be a whole number (0 or greater).');
  } else {
    fieldOk('transmembrane_domains');
  }

  // UniProt ID: standard format if non-empty
  const uid = val('uniprot_id');
  if (uid !== '' && !/^[A-Z][0-9][A-Z0-9]{3}[0-9]$/.test(uid)) {
    fieldErr('uniprot_id', "Doesn't look like a valid UniProt ID (e.g. Q3KLD0).");
  } else {
    fieldOk('uniprot_id');
  }

  return valid;
}
```

- [ ] **Step 2: Call validation in `wireModalEvents` save handler (stub)**

In `wireModalEvents`, before the real save logic (which comes in Task 8), add:

```js
  overlay.querySelector('#gem-save')?.addEventListener('click', async () => {
    if (!validateGeneEditForm(overlay)) return;
    // Save logic added in Task 8
  });
```

- [ ] **Step 3: Manual test**

Open edit modal, expand Advanced, enter `abc` in TM Domains → red inline error appears on Save click. Enter `2` → error clears. Enter `BADINPUT` in UniProt ID → inline error. Enter `Q3KLD0` → clears. Primary fields have no validation (all nullable).

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene edit modal — client-side validation"
```

---

## Task 8: Save flow — diff, PATCH genes, PATCH proteins

**Files:**
- Modify: `web/js/views/genomes.js` — replace the save click stub

- [ ] **Step 1: Add `collectGeneDiff` and `collectProteinDiff` helpers**

```js
function collectGeneDiff(overlay, original) {
  const f   = name => overlay.querySelector(`[name="${name}"]`);
  const str = name => f(name)?.value?.trim() || null;
  const chk = name => f(name)?.checked ?? false;

  const diff = {};
  const next = {
    gene_name:           str('gene_name'),
    gene_symbol:         str('gene_symbol'),
    product:             str('product'),
    functional_category: str('functional_category'),
    is_hypothetical:     chk('is_hypothetical'),
    is_membrane_protein: chk('is_membrane_protein'),
    is_t3_secreted:      chk('is_t3_secreted'),
    is_dna_binding:      chk('is_dna_binding'),
  };

  for (const [k, v] of Object.entries(next)) {
    if (v !== (original[k] ?? null)) diff[k] = { old: original[k] ?? null, new: v };
  }

  // is_characterized always mirrors is_hypothetical
  if ('is_hypothetical' in diff) {
    diff['is_characterized'] = { old: !diff.is_hypothetical.old, new: !diff.is_hypothetical.new };
  }

  return diff;
}

function collectProteinDiff(overlay, original) {
  const f   = name => overlay.querySelector(`[name="${name}"]`);
  const str = name => f(name)?.value?.trim() || null;
  const num = name => { const v = f(name)?.value?.trim(); return v === '' || v == null ? null : Number(v); };
  const chk = name => f(name)?.checked ?? false;

  const diff = {};
  const next = {
    uniprot_id:             str('uniprot_id'),
    protein_family:         str('protein_family'),
    oligomeric_state:       str('oligomeric_state'),
    mass_kd:                num('mass_kd'),
    transmembrane_domains:  num('transmembrane_domains'),
    signal_peptide:         chk('signal_peptide'),
  };

  for (const [k, v] of Object.entries(next)) {
    const orig = original?.[k] ?? null;
    if (String(v) !== String(orig)) diff[k] = { old: orig, new: v };
  }

  // Localization: read from the genes-section select (localization_sl)
  // (handled separately in the save handler below)
  return diff;
}
```

- [ ] **Step 2: Replace the save click stub with the full handler**

Replace the existing `gem-save` event listener stub in `wireModalEvents` with:

```js
  overlay.querySelector('#gem-save')?.addEventListener('click', async () => {
    if (!validateGeneEditForm(overlay)) return;

    const saveBtn = overlay.querySelector('#gem-save');
    const banner  = overlay.querySelector('#gem-error-banner');
    banner.style.display = 'none';
    saveBtn.textContent  = 'Saving…';
    saveBtn.disabled     = true;

    const showBanner = msg => {
      banner.textContent   = msg;
      banner.style.display = 'block';
      saveBtn.textContent  = 'Save Changes';
      saveBtn.disabled     = false;
    };

    try {
      // ── 1. Collect diffs ──────────────────────────────────────
      const geneDiff    = collectGeneDiff(overlay, gene);
      const proteinDiff = collectProteinDiff(overlay, protein);

      // Localization diff
      const locSelect  = overlay.querySelector('[name="localization_sl"]');
      const newLocSlId = locSelect?.value ?? '';
      const oldLocSlId = protein?.subcellular_location_sl?.[0] ?? '';
      if (newLocSlId !== oldLocSlId) {
        proteinDiff['subcellular_location_sl'] = {
          old: oldLocSlId ? [oldLocSlId] : [],
          new: newLocSlId ? [newLocSlId] : [],
        };
        if (newLocSlId) {
          proteinDiff['localization_source']  = { old: protein?.localization_source, new: 'user' };
          proteinDiff['localization_curated'] = { old: protein?.localization_curated, new: true };
        }
      }

      const allDiff = { ...Object.fromEntries(Object.entries(geneDiff).map(([k,v]) => [`genes.${k}`, v])),
                        ...Object.fromEntries(Object.entries(proteinDiff).map(([k,v]) => [`proteins.${k}`, v])) };

      // ── 2. PATCH genes ────────────────────────────────────────
      let genesSaved = false;
      if (Object.keys(geneDiff).length > 0) {
        const genePayload = Object.fromEntries(
          Object.entries(geneDiff).map(([k, v]) => [k, v.new])
        );
        genePayload.updated_by = state.user?.email ?? state.user?.user_metadata?.full_name ?? 'unknown';

        const { error: gErr } = await sb
          .from('genes')
          .update(genePayload)
          .eq('id', gene.id);

        if (gErr) {
          showBanner("The server returned an error. Try again in a moment — if it keeps failing, contact the lab at khybiske@uw.edu.");
          return;
        }
        genesSaved = true;
      }

      // ── 3. PATCH proteins ─────────────────────────────────────
      if (Object.keys(proteinDiff).length > 0 && protein?.id) {
        const protPayload = Object.fromEntries(
          Object.entries(proteinDiff).map(([k, v]) => [k, v.new])
        );
        const { error: pErr } = await sb
          .from('proteins')
          .update(protPayload)
          .eq('id', protein.id);

        if (pErr) {
          const msg = genesSaved
            ? "Gene info was saved, but protein fields couldn't be updated. Your name, product, and category changes are live. Try saving again to retry the protein fields."
            : "The server returned an error. Try again in a moment — if it keeps failing, contact the lab at khybiske@uw.edu.";
          showBanner(msg);
          return;
        }
      }

      // ── 4. INSERT new PDB entries ─────────────────────────────
      const pdbToAdd = overlay._pdbToAdd ?? [];
      for (const entry of pdbToAdd) {
        if (!protein?.id) continue;
        await sb.from('alphafold_results').insert({
          protein_id:              protein.id,
          af_version:              'PDB',
          top_homolog_pdb_id:      entry.pdb_id,
          top_homolog_description: entry.title,
          homology_score:          entry.resolution ? Number(entry.resolution) : null,
        });
      }

      // ── 5. DELETE removed PDB entries ─────────────────────────
      const pdbToDelete = overlay._pdbToDelete ?? [];
      for (const rowId of pdbToDelete) {
        await sb.from('alphafold_results').delete().eq('id', rowId);
      }

      // ── 6. INSERT audit log ───────────────────────────────────
      if (Object.keys(allDiff).length > 0) {
        await sb.from('gene_edit_log').insert({
          gene_id:   gene.id,
          editor_id: state.user.id,
          changes:   allDiff,
        });
      }

      // ── 7. Success ────────────────────────────────────────────
      overlay.remove();
      document.removeEventListener('keydown', overlay._onEsc);

      // Refresh the detail panel with updated data
      const updatedGene = { ...gene, ...Object.fromEntries(
        Object.entries(geneDiff).map(([k, v]) => [k, v.new])
      )};
      showGeneDetailDesktop(updatedGene, container);

    } catch (err) {
      const msg = err.message?.includes('fetch') || err.message?.includes('network')
        ? "Couldn't reach the server. Check your internet connection and try again."
        : "The server returned an error. Try again in a moment — if it keeps failing, contact the lab at khybiske@uw.edu.";
      showBanner(msg);
    }
  });
```

- [ ] **Step 3: Fix ESC cleanup — store onEsc on overlay**

In `openGeneEditModal`, change:

```js
  function onEsc(e) {
    if (e.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', onEsc);
```

And after `document.body.appendChild(overlay)`, add:

```js
  overlay._onEsc = onEsc;
```

This ensures the save handler can remove the ESC listener when it closes the modal programmatically.

- [ ] **Step 4: Manual test**

Edit a gene: change its gene name, save. Verify the detail panel re-renders with the new name. Check Supabase dashboard → `gene_edit_log` table → confirm a row was inserted with the correct `changes` jsonb. Check `genes` table → `updated_at` was bumped by the trigger, `updated_by` shows your email.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene edit modal — save flow (diff, PATCH genes+proteins, audit log)"
```

---

## Task 9: Cache version bump + final wiring check

**Files:**
- Modify: `web/js/app.js:4`
- Modify: `web/index.html:334`

- [ ] **Step 1: Bump genomes.js import version in app.js**

In `web/js/app.js`, change:
```js
import { renderGenomes } from './views/genomes.js?v=66';
```
to:
```js
import { renderGenomes } from './views/genomes.js?v=73';
```

- [ ] **Step 2: Bump app.js script version in index.html**

In `web/index.html`, change:
```html
<script type="module" src="/web/js/app.js?v=71"></script>
```
to:
```html
<script type="module" src="/web/js/app.js?v=73"></script>
```

- [ ] **Step 3: Full end-to-end test**

Hard-refresh the browser (Cmd+Shift+R). Run through all flows:
1. Not logged in → pencil button not visible ✓
2. Log in → pencil button visible ✓
3. Open modal → all primary fields pre-filled ✓
4. Open Advanced → protein fields pre-filled ✓
5. PDB lookup with valid ID → result card ✓
6. PDB lookup with invalid ID → inline error ✓
7. Invalid TM domains → inline validation error ✓
8. Save with no changes → nothing written, modal closes ✓
9. Save with gene name change → detail re-renders, `gene_edit_log` row appears in Supabase ✓
10. Save with localization change → `subcellular_location_sl` updated, `localization_source = 'user'` ✓
11. ESC / ✕ / backdrop → modal closes without saving ✓
12. Network error (disable wifi, try save) → red banner with helpful message ✓

- [ ] **Step 4: Commit and push**

```bash
git add web/js/app.js web/index.html
git commit -m "chore: bump cache version to v73 for gene edit modal"
git push
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Pencil button in hero, next to star, auth-gated | Task 2 |
| Centered modal, dark backdrop | Task 3 |
| ESC / ✕ / backdrop close | Task 3 |
| Primary fields: name, symbol, product, category, flags | Task 4 |
| Localization (lab-curated) dropdown | Task 4 |
| is_characterized never shown, derived from is_hypothetical | Task 8 (collectGeneDiff) |
| Advanced expander, collapsed by default | Task 5 |
| Protein fields: UniProt, family, subunit, mass, TM, signal peptide | Task 5 |
| Transcriptomics/proteomics NOT editable | Not exposed in form — covered by omission |
| PDB list, remove, RCSB lookup, verify, stage | Task 6 |
| UniProt sync placeholder (disabled) | Task 4 (in buildModalHtml) |
| Client-side validation: TM domains, UniProt format, PDB format | Task 7 |
| Diff-only writes (only changed fields sent) | Task 8 |
| PATCH genes + updated_by | Task 8 |
| updated_at via Postgres trigger (not client) | Task 1 |
| PATCH proteins | Task 8 |
| INSERT/DELETE alphafold_results for PDB | Task 8 |
| INSERT gene_edit_log with changes jsonb | Task 8 |
| Descriptive error messages (what + what to do) | Task 8 |
| Red banner above footer, modal stays open on error | Task 8 |
| Partial write error identifies which table failed | Task 8 |
| Success: close modal, refresh detail | Task 8 |
| gene_edit_log table + RLS | Task 1 |
| Cache version bump | Task 9 |

All spec requirements covered. ✓
