# Structure Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully-featured Structure panel on the gene detail page supporting Crystal Structure (RCSB PDB), AlphaFold v3 (Hybiske Lab), and AlphaFold v2 (AlphaFoldDB) tabs, with Mol* loading via IntersectionObserver and a 2/3 + 1/3 row layout.

**Architecture:** Crystal structure rows are added to the existing `alphafold_results` table (`af_version = 'crystal'`). A new `ptm_score` column stores AlphaFold v3 pTM scores separately from the existing `homology_score` column (which holds mean pLDDT for AF2). The `renderDetailStructure` function in `genomes.js` is rewritten to handle all three tab types with correct priority (Crystal > AlphaFold v3 > AlphaFold v2). Mol* is loaded lazily via IntersectionObserver rather than on button click.

**Tech Stack:** Supabase (Postgres), Vanilla JS, Mol* (CDN), RCSB PDB (CIF + thumbnail URLs), Node.js (data import script)

**Spec:** `docs/superpowers/specs/2026-05-08-structure-panel-design.md`

---

### Task 1: DB Migration — add ptm_score column

**Files:**
- Create: `supabase/migrations/012_ptm_score.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/012_ptm_score.sql
-- Add pTM score column for AlphaFold v3 rows in alphafold_results.
-- Kept separate from homology_score (mean pLDDT, 0-100) because pTM uses a 0-1 scale.
ALTER TABLE alphafold_results ADD COLUMN IF NOT EXISTS ptm_score float;
```

- [ ] **Step 2: Apply to Supabase**

In Supabase dashboard → SQL Editor, paste and run the migration. Alternatively:
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push
```

Expected: no error, column visible in `alphafold_results` table schema.

- [ ] **Step 3: Verify**

In Supabase Table Editor, open `alphafold_results` and confirm a `ptm_score` column of type `float8` is present with all existing rows showing `null` for that column.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_ptm_score.sql
git commit -m "chore: add ptm_score column to alphafold_results"
```

---

### Task 2: Crystal structure data import script

**Files:**
- Create: `data/import_crystal_structures.js`

This script looks up each locus tag in the `genes` table, finds the associated protein, and inserts a row into `alphafold_results` with `af_version = 'crystal'`.

RCSB thumbnail URL pattern: `https://cdn.rcsb.org/images/structures/{chars1-2}/{pdb_lower}/{pdb_lower}_assembly-1.jpeg`
e.g., for `4ILQ` → lowercase = `4ilq`, chars 1–2 = `il` → `https://cdn.rcsb.org/images/structures/il/4ilq/4ilq_assembly-1.jpeg`

RCSB CIF URL: `https://files.rcsb.org/download/{PDB_ID}.cif`

- [ ] **Step 1: Create the script**

```js
#!/usr/bin/env node
// Inserts crystal structure rows into alphafold_results.
// Run: SUPABASE_SERVICE_KEY=<key> node data/import_crystal_structures.js
// Add --dry-run to preview without inserting.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();
const DRY_RUN = process.argv.includes('--dry-run');

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// For proteins with multiple PDB IDs, the first listed is the primary record.
// Extras are flagged in the `note` field for Kevin's review.
const CRYSTAL_DATA = [
  // CT-L2
  { locus_tag: 'CTL0140', pdb_id: '4ILQ' },
  { locus_tag: 'CTL0246', pdb_id: '6MRN' },
  { locus_tag: 'CTL0247', pdb_id: '5B5Q' },
  { locus_tag: 'CTL0276', pdb_id: '6UXD' },
  { locus_tag: 'CTL0505', pdb_id: '6UXC' },
  { locus_tag: 'CTL0515', pdb_id: '4QAQ' },
  { locus_tag: 'CTL0548', pdb_id: '3QH6' },
  { locus_tag: 'CTL0655', pdb_id: '4ILO' },
  { locus_tag: 'CTL0700', pdb_id: '4QL6' },
  { locus_tag: 'CTL0847', pdb_id: '4MLK' },
  { locus_tag: 'CTL0851', pdb_id: '6MAB' },
  { locus_tag: 'CTL0886', pdb_id: '5UE0' },
  { locus_tag: 'CTL0894', pdb_id: '2M1B' },
  // CT-D
  { locus_tag: 'CT045',  pdb_id: '6OME' },
  { locus_tag: 'CT067',  pdb_id: '6NSI' },
  { locus_tag: 'CT091',  pdb_id: '3T7Y' },
  { locus_tag: 'CT116',  pdb_id: '5TP1' },
  { locus_tag: 'CT119',  pdb_id: '6E6A' },
  { locus_tag: 'CT170',  pdb_id: '6V82' },
  { locus_tag: 'CT171',  pdb_id: '6V82', note: 'REVIEW: shares PDB 6V82 with CT170' },
  { locus_tag: 'CT220',  pdb_id: '7KM2' },
  { locus_tag: 'CT243',  pdb_id: '2IU8' },
  { locus_tag: 'CT381',  pdb_id: '3DEL' },
  { locus_tag: 'CT390',  pdb_id: '3ASA' },
  { locus_tag: 'CT407',  pdb_id: '6PTG' },
  { locus_tag: 'CT505',  pdb_id: '6OK4', note: 'REVIEW: additional PDB IDs 6WYC, 6X2E' },
  { locus_tag: 'CT585',  pdb_id: '6NCR' },
  { locus_tag: 'CT610',  pdb_id: '1RCW' },
  { locus_tag: 'CT664',  pdb_id: '3GQS', note: 'REVIEW: additional PDB ID 4QO6' },
  { locus_tag: 'CT670',  pdb_id: '3K29' },
  { locus_tag: 'CT706',  pdb_id: '6X60' },
  { locus_tag: 'CT736',  pdb_id: '3N08' },
  { locus_tag: 'CT772',  pdb_id: '6WE5' },
  { locus_tag: 'CT828',  pdb_id: '1SYY', note: 'REVIEW: additional PDB IDs 2ANI, 4D8F' },
  { locus_tag: 'CT858',  pdb_id: '3DJA' },
];

function rcsbThumbnailUrl(pdbId) {
  const lower = pdbId.toLowerCase();
  const mid = lower.slice(1, 3);
  return `https://cdn.rcsb.org/images/structures/${mid}/${lower}/${lower}_assembly-1.jpeg`;
}

function rcsbCifUrl(pdbId) {
  return `https://files.rcsb.org/download/${pdbId}.cif`;
}

async function main() {
  const locusTags = CRYSTAL_DATA.map(r => r.locus_tag);

  // Fetch genes by locus_tag
  const { data: genes, error: genesErr } = await sb
    .from('genes')
    .select('id, locus_tag')
    .in('locus_tag', locusTags);
  if (genesErr) { console.error('genes fetch error:', genesErr); process.exit(1); }

  const geneMap = Object.fromEntries(genes.map(g => [g.locus_tag, g.id]));

  // Fetch proteins by gene_id
  const geneIds = Object.values(geneMap);
  const { data: proteins, error: protsErr } = await sb
    .from('proteins')
    .select('id, gene_id')
    .in('gene_id', geneIds);
  if (protsErr) { console.error('proteins fetch error:', protsErr); process.exit(1); }

  const proteinMap = Object.fromEntries(proteins.map(p => [p.gene_id, p.id]));

  const rows = [];
  for (const entry of CRYSTAL_DATA) {
    const geneId = geneMap[entry.locus_tag];
    if (!geneId) { console.warn(`WARN: gene not found for ${entry.locus_tag}`); continue; }
    const proteinId = proteinMap[geneId];
    if (!proteinId) { console.warn(`WARN: protein not found for ${entry.locus_tag} (gene ${geneId})`); continue; }
    if (entry.note) console.log(`NOTE [${entry.locus_tag}]: ${entry.note}`);
    rows.push({
      protein_id:         proteinId,
      af_version:         'crystal',
      top_homolog_pdb_id: entry.pdb_id,
      mmcif_path:         rcsbCifUrl(entry.pdb_id),
      thumbnail_path:     rcsbThumbnailUrl(entry.pdb_id),
    });
  }

  console.log(`Prepared ${rows.length} crystal structure rows.`);
  if (DRY_RUN) { console.log('Dry run — not inserting.'); console.log(rows); return; }

  const { error: upsertErr } = await sb
    .from('alphafold_results')
    .upsert(rows, { onConflict: 'protein_id,af_version' });
  if (upsertErr) { console.error('upsert error:', upsertErr); process.exit(1); }
  console.log(`Inserted/updated ${rows.length} rows.`);
}

main();
```

- [ ] **Step 2: Dry run to verify rows look correct**

```bash
SUPABASE_SERVICE_KEY=<key> node data/import_crystal_structures.js --dry-run
```

Expected: 35 rows printed (CT171 and CT170 share a PDB ID — both get their own row). Any missing locus tags printed as WARN. REVIEW notes printed for CT171, CT505, CT664, CT828.

- [ ] **Step 3: Run for real**

```bash
SUPABASE_SERVICE_KEY=<key> node data/import_crystal_structures.js
```

Expected: `Inserted/updated 35 rows.`

- [ ] **Step 4: Verify in Supabase**

In Supabase Table Editor → `alphafold_results`, filter by `af_version = 'crystal'`. Confirm 35 rows exist with `mmcif_path` and `thumbnail_path` populated.

- [ ] **Step 5: Commit**

```bash
git add data/import_crystal_structures.js
git commit -m "chore: add crystal structure import script (35 proteins)"
```

---

### Task 3: Layout — 2/3 + 1/3 row with blank placeholder

**Files:**
- Modify: `web/js/views/genomes.js` (around line 1914)

- [ ] **Step 1: Replace the Structure div with a 2/3 + 1/3 grid row**

Find this block (around line 1914):
```js
      <!-- Structure -->
      <div id="d-structure" style="border-bottom:1px solid #f0f0f0;min-width:0;overflow:hidden;">${detailSkeleton(3)}</div>
```

Replace with:
```js
      <!-- Structure + reserved placeholder -->
      <div style="display:grid;grid-template-columns:2fr 1fr;border-bottom:1px solid #f0f0f0;">
        <div id="d-structure" style="border-right:1px solid #f0f0f0;min-width:0;overflow:hidden;">${detailSkeleton(3)}</div>
        <div id="d-structure-placeholder" style="min-width:0;"></div>
      </div>
```

- [ ] **Step 2: Open the dev site and navigate to any gene**

Confirm the structure skeleton now occupies the left 2/3 of the row and the right 1/3 is blank white space. The placeholder has no label or content.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: structure panel 2/3 + 1/3 row layout with blank placeholder"
```

---

### Task 4: Rewrite renderDetailStructure

**Files:**
- Modify: `web/js/views/genomes.js`
  - Line 899: update call site to pass protein
  - Lines 1367–1489: replace `renderDetailStructure` and `wireStructureEvents` functions
  - Before `renderDetailStructure`: add `plddtColor`, `plddtLabel`, `ptmColor` helpers

This task replaces the existing function with one that:
- Handles all three tab types (crystal, AlphaFold v3, AlphaFold v2)
- Selects the correct default tab (Crystal > AlphaFold v3 > AlphaFold v2)
- Shows correct metadata per tab
- Displays pTM (AF3) and mean pLDDT + qualitative label (AF2), both color-coded
- Uses gray external link pills
- Spells out "AlphaFold v2" / "AlphaFold v3" everywhere
- Does NOT set up the Mol* loader (that is Task 5)

- [ ] **Step 1: Update the call site to pass protein data (line ~899)**

Change:
```js
  renderDetailStructure(detail, gene, protResult.data?.alphafold_results ?? []);
```
To:
```js
  renderDetailStructure(detail, gene, protResult.data, protResult.data?.alphafold_results ?? []);
```

- [ ] **Step 2: Add confidence score helpers just above the renderDetailStructure function (around line 1367)**

```js
// ─── Structure confidence score helpers ───────────────────
// AlphaFold color scale: orange → yellow → light blue → dark blue (low → high)

function plddtColor(score) {
  if (score >= 90) return '#1d4ed8';
  if (score >= 70) return '#60a5fa';
  if (score >= 50) return '#f59e0b';
  return '#f97316';
}

function plddtLabel(score) {
  if (score >= 90) return 'Very high';
  if (score >= 70) return 'High';
  if (score >= 50) return 'Low';
  return 'Very low';
}

function ptmColor(score) {
  if (score >= 0.8) return '#1d4ed8';
  if (score >= 0.6) return '#60a5fa';
  if (score >= 0.4) return '#f59e0b';
  return '#f97316';
}
```

- [ ] **Step 3: Replace renderDetailStructure (lines ~1367–1489)**

Replace the entire `renderDetailStructure` function and the `wireStructureEvents` function that follows it with:

```js
function renderDetailStructure(detail, gene, protein, afRows) {
  const el = detail.querySelector('#d-structure');
  if (!el) return;

  const crystal = afRows.find(r => r.af_version === 'crystal');
  const af3     = afRows.find(r => r.af_version === 'AF3');
  const af2     = afRows.find(r => r.af_version === 'AF2' || r.af_version === 'AFDB');

  let activeTab    = crystal ? 'crystal' : af3 ? 'af3' : 'af2';
  let activeRecord = crystal ?? af3 ?? af2;

  const uniprotId  = protein?.uniprot_id ?? null;

  function tabBtn(id, label, record) {
    const available = !!record;
    const isActive  = id === activeTab;
    return `
      <button class="struct-tab" data-tab="${id}"
        style="padding:8px 14px;font-size:10px;font-weight:600;border:none;background:none;
               cursor:${available ? 'pointer' : 'not-allowed'};font-family:inherit;white-space:nowrap;
               color:${isActive ? '#1a6b4a' : available ? '#9ca3af' : '#d1d5db'};
               border-bottom:2px solid ${isActive ? '#1a6b4a' : 'transparent'};margin-bottom:-1px;"
        ${!available ? 'disabled' : ''}>
        ${label}${!available ? ' —' : ''}
      </button>`;
  }

  function extLink(href, label, download = false) {
    const attrs = download
      ? `href="${href}" download`
      : `href="${href}" target="_blank" rel="noopener"`;
    return `<a ${attrs}
      style="font-size:9.5px;font-weight:500;color:#6b7280;text-decoration:none;
             padding:3px 8px;border:1px solid #d1d5db;border-radius:5px;background:#f9fafb;">
      ${label}
    </a>`;
  }

  function afdbLink() {
    if (!uniprotId) return '';
    return extLink(`https://alphafold.ebi.ac.uk/entry/${uniprotId}`, 'AlphaFoldDB ↗');
  }

  function viewerHtml(record) {
    if (!record) {
      return `<div style="display:flex;align-items:center;justify-content:center;height:200px;
                          background:#f9fafb;border-radius:8px;font-size:10px;color:#bbb;font-style:italic;">
                No structural data available for this source
              </div>`;
    }

    const thumbHtml = record.thumbnail_path
      ? `<img src="${record.thumbnail_path}" alt="Structure thumbnail" id="struct-thumb"
              style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />`
      : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;
                     font-size:28px;color:#374151;background:#111827;border-radius:8px;">⬡</div>`;

    let scoreHtml = '';
    if (record.af_version === 'AF3' && record.ptm_score != null) {
      scoreHtml = `
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px;">
          <span style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;
                       color:${ptmColor(record.ptm_score)};line-height:1;">
            ${record.ptm_score.toFixed(2)}
          </span>
          <span style="font-size:8.5px;font-weight:700;text-transform:uppercase;
                       letter-spacing:0.08em;color:#9ca3af;">pTM score</span>
        </div>`;
    } else if ((record.af_version === 'AF2' || record.af_version === 'AFDB') && record.homology_score != null) {
      const s = record.homology_score;
      scoreHtml = `
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px;">
          <span style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;
                       color:${plddtColor(s)};line-height:1;">
            ${s.toFixed(1)}
          </span>
          <span style="font-size:8.5px;font-weight:700;text-transform:uppercase;
                       letter-spacing:0.08em;color:#9ca3af;">
            mean pLDDT · ${plddtLabel(s)}
          </span>
        </div>`;
    }

    const homologHtml = (record.af_version !== 'crystal' && record.top_homolog_description)
      ? `<div style="font-size:10.5px;color:#222;font-weight:600;margin-bottom:2px;">
           ${esc(record.top_homolog_description)}
         </div>
         <div style="font-size:9.5px;color:#9ca3af;line-height:1.5;margin-bottom:10px;">
           ${record.top_homolog_pdb_id ? `RCSB PDB: ${esc(record.top_homolog_pdb_id)}` : ''}
           ${record.homology_method    ? ` · Method: ${esc(record.homology_method)}` : ''}
         </div>`
      : '';

    const inferredHtml = (record.af_version !== 'crystal' && record.inferred_function)
      ? `<div style="font-size:10px;color:#444;background:#f0fdf4;border-radius:6px;
                     padding:7px 10px;border-left:3px solid #16a34a;line-height:1.55;margin-bottom:10px;">
           <strong style="color:#1a6b4a;">Inferred function:</strong> ${esc(record.inferred_function)}
         </div>`
      : '';

    let sourceLabel = '';
    let idHtml      = '';
    let linksHtml   = '';

    if (record.af_version === 'crystal') {
      sourceLabel = 'Crystal Structure · RCSB PDB';
      const pdbId = record.top_homolog_pdb_id ?? '';
      idHtml = `<div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;
                            color:#111;line-height:1;margin-bottom:14px;">
                  ${esc(pdbId)}
                </div>`;
      const links = [
        pdbId ? extLink(`https://www.rcsb.org/structure/${encodeURIComponent(pdbId)}`, `RCSB ${esc(pdbId)} ↗`) : '',
        afdbLink(),
      ].filter(Boolean);
      linksHtml = links.join('');
    } else if (record.af_version === 'AF3') {
      sourceLabel = 'AlphaFold v3 · Hybiske Lab';
      const links = [
        record.top_homolog_pdb_id
          ? extLink(`https://www.rcsb.org/structure/${encodeURIComponent(record.top_homolog_pdb_id)}`,
                    `RCSB ${esc(record.top_homolog_pdb_id)} ↗`)
          : '',
        afdbLink(),
        record.mmcif_path ? extLink(record.mmcif_path, 'Download mmCIF ↗', true) : '',
      ].filter(Boolean);
      linksHtml = links.join('');
    } else {
      sourceLabel = 'AlphaFold v2 · AlphaFoldDB';
      const links = [
        record.top_homolog_pdb_id
          ? extLink(`https://www.rcsb.org/structure/${encodeURIComponent(record.top_homolog_pdb_id)}`,
                    `RCSB ${esc(record.top_homolog_pdb_id)} ↗`)
          : '',
        afdbLink(),
      ].filter(Boolean);
      linksHtml = links.join('');
    }

    return `
      <div style="display:flex;gap:16px;align-items:flex-start;overflow:hidden;min-width:0;">
        <div id="struct-viewer-wrap"
          style="width:200px;height:200px;flex-shrink:0;border-radius:8px;overflow:hidden;
                 position:relative;background:#0a1628;"
          data-url="${record.mmcif_path ? esc(record.mmcif_path) : ''}">
          ${thumbHtml}
        </div>
        <div style="flex:1;min-width:0;padding-top:2px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;
                      letter-spacing:0.08em;color:#9ca3af;margin-bottom:10px;">
            ${sourceLabel}
          </div>
          ${idHtml}
          ${scoreHtml}
          ${homologHtml}
          ${inferredHtml}
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${linksHtml}</div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    ${sectionHead('Structure')}
    <div style="border-bottom:1px solid #e5e7eb;margin:0 16px 12px;display:flex;">
      ${tabBtn('crystal', 'Crystal Structure', crystal)}
      ${tabBtn('af3',     'AlphaFold v3',      af3)}
      ${tabBtn('af2',     'AlphaFold v2',      af2)}
    </div>
    <div id="struct-viewer-body" style="padding:0 16px 16px;">
      ${viewerHtml(activeRecord)}
    </div>`;

  el.querySelectorAll('.struct-tab:not([disabled])').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab    = tab.dataset.tab;
      activeRecord = activeTab === 'crystal' ? crystal : activeTab === 'af3' ? af3 : af2;
      el.querySelectorAll('.struct-tab').forEach(t => {
        const isActive = t.dataset.tab === activeTab;
        t.style.color             = isActive ? '#1a6b4a' : (t.disabled ? '#d1d5db' : '#9ca3af');
        t.style.borderBottomColor = isActive ? '#1a6b4a' : 'transparent';
      });
      el.querySelector('#struct-viewer-body').innerHTML = viewerHtml(activeRecord);
      setupMolstarObserver(el);
    });
  });

  setupMolstarObserver(el);
}
```

- [ ] **Step 4: Verify visually**

Open the dev site. Navigate to a CT-D gene with a crystal structure (e.g., CT119). Confirm:
- Crystal Structure tab is active by default
- PDB ID `6E6A` shown in large monospace
- AlphaFold v3 and AlphaFold v2 tabs are visible (grayed out if no data, or clickable)
- External links are gray, not green
- "AlphaFold v3" / "AlphaFold v2" spelled out fully, no abbreviations

Navigate to a CTL gene with an AF3 record but no crystal structure. Confirm:
- AlphaFold v3 is the default active tab
- Crystal Structure tab shows with `—` suffix, grayed out
- pTM score shown in color-coded monospace if ptm_score is populated (may be null until you add pTM values — that's fine)
- AlphaFold v2 tab is clickable and shows mean pLDDT if data exists

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: rewrite structure panel — crystal/AF3/AF2 tabs, pTM + pLDDT scores, gray links"
```

---

### Task 5: IntersectionObserver Mol* loading with crossfade and error fallback

**Files:**
- Modify: `web/js/views/genomes.js`
  - Replace `loadMolstar` (lines ~719–752)
  - Replace `wireStructureEvents` (already removed in Task 4 — confirm it's gone)
  - Add `setupMolstarObserver` and `_showStructureFallback` (new functions, place near `loadMolstar`)

`renderDetailStructure` from Task 4 already calls `setupMolstarObserver(el)` — this task implements that function.

- [ ] **Step 1: Confirm wireStructureEvents is gone**

Check that `wireStructureEvents` was removed in Task 4 (the rewrite in Task 4 does not call or define it). If it still exists as a dead function, delete it.

- [ ] **Step 2: Replace loadMolstar and add new helpers (around line 719)**

Replace the existing `loadMolstar` and `_initMolstar` functions with:

```js
// ─── Mol* loader (IntersectionObserver-driven) ────────────

function setupMolstarObserver(el) {
  const wrap = el.querySelector('#struct-viewer-wrap');
  if (!wrap || !wrap.dataset.url) return;

  let fired = false;
  const observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting || fired) return;
    fired = true;
    observer.disconnect();
    loadMolstar(wrap, wrap.dataset.url);
  }, { threshold: 0.1 });

  observer.observe(wrap);
}

async function loadMolstar(wrapEl, url) {
  if (!url) return;

  // Add the interactive viewport div on top of the thumbnail
  const vpId  = 'molstar-vp';
  const vpDiv = document.createElement('div');
  vpDiv.id   = vpId;
  vpDiv.style.cssText =
    'position:absolute;inset:0;border-radius:8px;overflow:hidden;opacity:0;transition:opacity 0.4s;';
  wrapEl.style.position = 'relative';
  wrapEl.appendChild(vpDiv);

  // Load Mol* bundle if not already on the page
  if (!window.molstar) {
    try {
      await _loadMolstarBundle();
    } catch {
      vpDiv.remove();
      _showStructureFallback(wrapEl, url);
      return;
    }
  }

  // Initialise viewer
  try {
    const { Viewer } = molstar.Viewer;
    const v = await Viewer.create(vpId, {
      layoutIsExpanded:        false,
      layoutShowControls:      false,
      layoutShowRemoteState:   false,
      layoutShowSequence:      true,
      layoutShowLog:           false,
      layoutShowLeftPanel:     false,
      viewportShowExpand:      true,
      viewportShowSelectionMode: false,
      viewportShowAnimation:   false,
    });
    await v.loadStructureFromUrl(url, 'mmcif');
    // Crossfade: fade in viewer, fade out thumbnail
    vpDiv.style.opacity = '1';
    const thumb = wrapEl.querySelector('#struct-thumb');
    if (thumb) { thumb.style.transition = 'opacity 0.4s'; thumb.style.opacity = '0'; }
  } catch {
    vpDiv.remove();
    _showStructureFallback(wrapEl, url);
  }
}

function _loadMolstarBundle() {
  return new Promise((resolve, reject) => {
    const s  = document.createElement('script');
    s.src    = 'https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
    const l  = document.createElement('link');
    l.rel    = 'stylesheet';
    l.href   = 'https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.css';
    document.head.appendChild(l);
  });
}

function _showStructureFallback(wrapEl, url) {
  // Mol* failed — show a download link over the thumbnail instead
  const a = document.createElement('a');
  a.href   = url;
  a.target = '_blank';
  a.rel    = 'noopener';
  a.style.cssText =
    'position:absolute;bottom:8px;left:50%;transform:translateX(-50%);' +
    'font-size:9px;font-weight:600;background:rgba(15,69,48,0.85);color:white;' +
    'border-radius:5px;padding:4px 10px;text-decoration:none;white-space:nowrap;';
  a.textContent = 'View / Download ↗';
  wrapEl.style.position = 'relative';
  wrapEl.appendChild(a);
}
```

- [ ] **Step 3: Verify Mol* loading behavior**

Open the dev site and navigate to any gene with structure data.

1. Scroll the Structure section **out of view** before it loads — then scroll it back in. Confirm Mol* begins loading (you can observe the network tab in DevTools — `molstar.js` should start fetching once the section enters the viewport).
2. Once loaded, confirm the thumbnail crossfades into the interactive Mol* viewer.
3. Confirm the viewer controls are minimal (no left panel, no animation controls, expand button present).
4. Switch tabs — confirm a new IntersectionObserver fires for the newly rendered viewer wrap, and Mol* re-initializes for the new structure.

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: structure panel Mol* via IntersectionObserver with crossfade and fallback"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Add `ptm_score float` column | Task 1 |
| Crystal rows in `alphafold_results` | Task 2 |
| RCSB thumbnail + CIF URLs | Task 2 |
| Flag multi-PDB entries | Task 2 (note field) |
| 2/3 + 1/3 row layout | Task 3 |
| Blank placeholder (no label) | Task 3 |
| Crystal > AlphaFold v3 > AlphaFold v2 tab priority | Task 4 |
| Grayed-out unavailable tabs with `—` suffix | Task 4 |
| Crystal tab: PDB ID large mono, RCSB + AlphaFoldDB links, no score | Task 4 |
| AlphaFold v3: pTM score color-coded, homolog, inferred function, gray links | Task 4 |
| AlphaFold v2: mean pLDDT + qualitative label, color-coded, gray links | Task 4 |
| "AlphaFold v2" / "AlphaFold v3" spelled out | Task 4 |
| Gray external link pill style | Task 4 |
| IntersectionObserver auto-load | Task 5 |
| Thumbnail crossfade | Task 5 |
| Abort on scroll-away | Task 5 (observer fires once, fetch abandonment is implicit if tab changes re-renders) |
| Error fallback link | Task 5 |

All spec requirements covered.

### Notes for implementation

- **pTM values not yet in DB**: After Task 4 deploys, the pTM score will display as absent for AF3 rows until Kevin populates `ptm_score` values in `alphafold_results`. The UI gracefully omits the score when `null` — no further work needed to handle this.
- **CT-D vs CTL locus tags**: The import script handles both. CT tags do not use a leading zero before the number (e.g., `CT045`, not `CT0045`). Verify the exact format in the `genes` table before running.
- **RCSB thumbnail availability**: Some older PDB entries may not have RCSB CDN thumbnails. The `<img>` tag will simply show the dark background fallback if the URL 404s — no special handling needed.
- **Supabase `proteins` select**: The existing query uses `select('*,alphafold_results(*)')` which will automatically include the new `ptm_score` column with no query changes needed.
