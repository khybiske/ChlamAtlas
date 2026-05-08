# EB/RB Proteomics Filter + Data Source Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add EB-enriched / RB-enriched filter chips to the Expression section of the filter bar, backed by computed boolean columns on the genes table, and add data-source citation captions to the Transcriptomics and EB/RB Proteomics detail panels.

**Architecture:** Mirror the existing `expression_pattern` pattern exactly — migration adds columns, compute script populates them, genomes.js adds a new state variable + filter chips + query conditions. Proteomics data is CT-L2 only so chips are hidden on CT-D and CM strains.

**Tech Stack:** Supabase (Postgres), vanilla JS (genomes.js), Node.js (compute script)

---

## Files

| File | Action |
|---|---|
| `supabase/migrations/011_eb_rb_enriched.sql` | Create — adds `eb_enriched`, `rb_enriched` boolean columns to genes |
| `data/compute_eb_rb_enriched.js` | Create — paginates expression_data, applies 2× threshold, writes to genes |
| `web/js/views/genomes.js` | Modify — state var, SELECT, query filters, filter chips, event listeners, captions |
| `web/index.html` | Modify — cache bump v=20 → v=21 |
| `web/js/app.js` | Modify — cache bump v=20 → v=21 |

---

## Task 1: Add DB columns

**Files:**
- Create: `supabase/migrations/011_eb_rb_enriched.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/011_eb_rb_enriched.sql
ALTER TABLE genes ADD COLUMN IF NOT EXISTS eb_enriched boolean;
ALTER TABLE genes ADD COLUMN IF NOT EXISTS rb_enriched boolean;
```

- [ ] **Step 2: Apply migration via Supabase dashboard SQL editor**

Paste the SQL above into the Supabase dashboard SQL editor (https://supabase.com/dashboard/project/ihobumwetoidqioifknt/sql) and run it. Both columns should appear on the genes table with null values.

- [ ] **Step 3: Verify columns exist**

Run this in the SQL editor:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'genes'
  AND column_name IN ('eb_enriched', 'rb_enriched');
```
Expected: 2 rows returned.

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/011_eb_rb_enriched.sql
git commit -m "feat: add eb_enriched, rb_enriched columns to genes table"
```

---

## Task 2: Write and run compute script

**Files:**
- Create: `data/compute_eb_rb_enriched.js`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Computes eb_enriched and rb_enriched for CT-L2 genes and writes to genes table.
 *
 * Thresholds (Saka et al. 2011, PMID 22014092 — label-free LC/LC-MS/MS spectral counts):
 *   eb_enriched: eb_expression >= 2 * rb_expression  OR  (rb_expression IS NULL AND eb_expression > 0)
 *   rb_enriched: rb_expression >= 2 * eb_expression
 *
 * Run:     SUPABASE_SERVICE_KEY=<key> node data/compute_eb_rb_enriched.js
 * Dry run: SUPABASE_SERVICE_KEY=<key> node data/compute_eb_rb_enriched.js --dry-run
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE    = 1000;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllProtRows() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('expression_data')
      .select('gene_id, eb_expression, rb_expression')
      .not('eb_expression', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function classify(eb, rb) {
  // eb and rb are numbers or null
  const ebVal = eb ?? 0;
  const rbVal = rb ?? 0;
  const ebEnriched = ebVal > 0 && (rb === null || ebVal >= 2 * rbVal);
  const rbEnriched = rbVal > 0 && rbVal >= 2 * ebVal;
  return { eb_enriched: ebEnriched || null, rb_enriched: rbEnriched || null };
}

async function main() {
  console.log(DRY_RUN ? '--- DRY RUN ---' : '--- LIVE RUN ---');

  const rows = await fetchAllProtRows();
  console.log(`Fetched ${rows.length} proteomic rows`);

  let ebCount = 0, rbCount = 0, neitherCount = 0;
  const updates = rows.map(r => {
    const { eb_enriched, rb_enriched } = classify(r.eb_expression, r.rb_expression);
    if (eb_enriched) ebCount++;
    if (rb_enriched) rbCount++;
    if (!eb_enriched && !rb_enriched) neitherCount++;
    return { id: r.gene_id, eb_enriched: eb_enriched ?? false, rb_enriched: rb_enriched ?? false };
  });

  console.log(`EB enriched: ${ebCount} | RB enriched: ${rbCount} | Neither: ${neitherCount}`);

  if (DRY_RUN) {
    console.log('Sample updates:', updates.slice(0, 5));
    return;
  }

  // Upsert in pages
  for (let i = 0; i < updates.length; i += PAGE) {
    const batch = updates.slice(i, i + PAGE);
    const { error } = await sb.from('genes').upsert(batch, { onConflict: 'id' });
    if (error) throw error;
    console.log(`Updated genes ${i + 1}–${Math.min(i + PAGE, updates.length)}`);
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry run to verify logic**

```bash
SUPABASE_SERVICE_KEY=<your-service-key> node data/compute_eb_rb_enriched.js --dry-run
```

Expected output includes:
```
--- DRY RUN ---
Fetched 677 proteomic rows
EB enriched: 431 | RB enriched: 98 | Neither: ...
Sample updates: [ { id: '...', eb_enriched: true, rb_enriched: false }, ... ]
```

- [ ] **Step 3: Run live**

```bash
SUPABASE_SERVICE_KEY=<your-service-key> node data/compute_eb_rb_enriched.js
```

Expected: `Done.` with no errors.

- [ ] **Step 4: Spot-check in SQL editor**

```sql
SELECT COUNT(*) FILTER (WHERE eb_enriched = true)  AS eb_count,
       COUNT(*) FILTER (WHERE rb_enriched = true)  AS rb_count,
       COUNT(*) FILTER (WHERE eb_enriched = false AND rb_enriched = false) AS neither
FROM genes
WHERE eb_enriched IS NOT NULL OR rb_enriched IS NOT NULL;
```

Expected: eb_count ~431, rb_count ~98.

- [ ] **Step 5: Commit**

```bash
git add data/compute_eb_rb_enriched.js
git commit -m "feat: compute script for eb_enriched / rb_enriched gene columns"
```

---

## Task 3: Wire filter into genomes.js

**Files:**
- Modify: `web/js/views/genomes.js`

### 3a — Add state variable and reset

- [ ] **Step 1: Add `_ebRbFilter` state variable**

Find (around line 105):
```js
let _expressionFilter  = null;  // 'Early' | 'Mid' | 'Late' | 'Constitutive'
```
Replace with:
```js
let _expressionFilter  = null;  // 'Early' | 'Mid' | 'Late' | 'Constitutive'
let _ebRbFilter        = null;  // 'eb' | 'rb'
```

- [ ] **Step 2: Reset in `renderGenomes()`**

Find (around line 135):
```js
_search = ''; _offset = 0; _selectedId = null; _categoryFilter = null; _locationFilter = null;
_expressionFilter = null;
```
Replace with:
```js
_search = ''; _offset = 0; _selectedId = null; _categoryFilter = null; _locationFilter = null;
_expressionFilter = null; _ebRbFilter = null;
```

- [ ] **Step 3: Reset on strain tab switch**

Find the strain tab click handler — it sets `_strain` and calls `renderGenomes`. The `renderGenomes` reset above covers it. No extra change needed.

### 3b — Add `eb_enriched,rb_enriched` to SELECT

- [ ] **Step 4: Extend the SELECT string**

Find (around line 524):
```js
      'id,strain_id,locus_tag,gene_name,gene_symbol,product,sort_index,' +
      'start_bp,end_bp,strand,expression_pattern,' +
```
Replace with:
```js
      'id,strain_id,locus_tag,gene_name,gene_symbol,product,sort_index,' +
      'start_bp,end_bp,strand,expression_pattern,eb_enriched,rb_enriched,' +
```

### 3c — Add query filter conditions

- [ ] **Step 5: Add filter conditions after `_expressionFilter` block**

Find (around line 550):
```js
  if (_expressionFilter)       q = q.eq('expression_pattern', _expressionFilter);
```
Replace with:
```js
  if (_expressionFilter)       q = q.eq('expression_pattern', _expressionFilter);
  if (_ebRbFilter === 'eb')    q = q.eq('eb_enriched', true);
  if (_ebRbFilter === 'rb')    q = q.eq('rb_enriched', true);
```

### 3d — Add chip to main filter bar

- [ ] **Step 6: Add active EB/RB chip in the main bar active-chips row**

Find (around line 377):
```js
      ${_expressionFilter ? `<button data-clear-expression style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #a5f3fc;background:#ecfeff;color:#164e63;cursor:pointer;white-space:nowrap;font-family:inherit;">📈 ${esc(_expressionFilter)} ×</button>` : ''}
```
Replace with:
```js
      ${_expressionFilter ? `<button data-clear-expression style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #a5f3fc;background:#ecfeff;color:#164e63;cursor:pointer;white-space:nowrap;font-family:inherit;">📈 ${esc(_expressionFilter)} ×</button>` : ''}
      ${_ebRbFilter ? `<button data-clear-ebrb style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #a5f3fc;background:#ecfeff;color:#164e63;cursor:pointer;white-space:nowrap;font-family:inherit;">📈 ${_ebRbFilter === 'eb' ? 'EB enriched' : 'RB enriched'} ×</button>` : ''}
```

- [ ] **Step 7: Update `anyActive` to include `_ebRbFilter`**

Find (around line 332):
```js
  const anyActive    = activeChar.length || activeStruct.length || _locationFilter || _categoryFilter || _expressionFilter;
```
Replace with:
```js
  const anyActive    = activeChar.length || activeStruct.length || _locationFilter || _categoryFilter || _expressionFilter || _ebRbFilter;
```

### 3e — Add chips to Expression section in More panel

- [ ] **Step 8: Add EB/RB chips below EXPR_FILTERS in the Expression section**

Find (around line 402):
```js
      ${groupHead('expression', '📈', 'Expression', secOpen.expression, '— click chart or peak label on any gene')}
      <div style="display:${secOpen.expression ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${EXPR_FILTERS.map(f => exprChip(f.value, f.label)).join('')}
      </div>
```
Replace with:
```js
      ${groupHead('expression', '📈', 'Expression', secOpen.expression, '— click chart or peak label on any gene')}
      <div style="display:${secOpen.expression ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${EXPR_FILTERS.map(f => exprChip(f.value, f.label)).join('')}
        ${_strain === 'CT-L2' ? ebRbChip('eb', 'EB enriched') + ebRbChip('rb', 'RB enriched') : ''}
      </div>
```

- [ ] **Step 9: Define `ebRbChip` helper alongside `exprChip`**

Find the `exprChip` function definition (around line 321):
```js
  const exprChip = (value, label) => {
    const active = _expressionFilter === value;
    return `<button data-expr-filter="${esc(value)}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid ${active ? '#a5f3fc' : '#e5e7eb'};
             background:${active ? '#ecfeff' : 'white'};color:${active ? '#164e63' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${active ? '📈 ' : ''}${label}${active ? ' ×' : ''}
    </button>`;
  };
```
Add `ebRbChip` immediately after:
```js
  const ebRbChip = (value, label) => {
    const active = _ebRbFilter === value;
    return `<button data-ebrb-filter="${esc(value)}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid ${active ? '#a5f3fc' : '#e5e7eb'};
             background:${active ? '#ecfeff' : 'white'};color:${active ? '#164e63' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${active ? '📈 ' : ''}${label}${active ? ' ×' : ''}
    </button>`;
  };
```

### 3f — Add event listeners

- [ ] **Step 10: Add EB/RB chip click handler**

Find the "Clear expression filter" handler block (around line 486):
```js
  // Clear expression filter
  bar.querySelector('[data-clear-expression]')?.addEventListener('click', () => {
    _expressionFilter = null;
    _offset = 0;
    renderFilterBar(container);
    fetchGenes(container, true);
  });
```
Add immediately after:
```js
  // EB/RB proteomics filter chips
  bar.querySelectorAll('[data-ebrb-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.ebrbFilter;
      _ebRbFilter = _ebRbFilter === val ? null : val;
      _offset = 0;
      renderFilterBar(container, true);
      fetchGenes(container, true);
    });
  });

  // Clear EB/RB filter
  bar.querySelector('[data-clear-ebrb]')?.addEventListener('click', () => {
    _ebRbFilter = null;
    _offset = 0;
    renderFilterBar(container);
    fetchGenes(container, true);
  });
```

---

## Task 4: Add data source captions

**Files:**
- Modify: `web/js/views/genomes.js`

### 4a — Transcriptomics CT-L2 caption

- [ ] **Step 1: Replace the CT-L2 qualitative caption**

Find (around line 1169):
```js
        <div style="font-size:8.5px;color:#bbb;margin-top:6px;font-style:italic;">
          Qualitative · quantitative timepoints not available for CT-L2
          ${clickable ? '· click to filter' : ''}
        </div>
```
Replace with:
```js
        <div style="font-size:8.5px;color:#bbb;margin-top:6px;font-style:italic;">
          Qualitative · Nicholson et al. 2003, J Bacteriol · PMID 12730178
          ${clickable ? '· click to filter' : ''}
        </div>
```

### 4b — Transcriptomics CT-D caption

- [ ] **Step 2: Replace the CT-D subtitle line**

Find (around line 1218):
```js
      <div style="font-size:8px;color:#9ca3af;margin-bottom:6px;">CT-D microarray · 1h–40h</div>
```
Replace with:
```js
      <div style="font-size:8px;color:#9ca3af;margin-bottom:6px;">CT-D microarray · 1h–40h · Belland et al. 2003, PNAS · PMID 12815105</div>
```

### 4c — EB/RB Proteomics caption

- [ ] **Step 3: Replace the existing "CT-L2 spectral counts" caption**

Find (around line 1286):
```js
      <div style="font-size:8.5px;color:#bbb;font-style:italic;">CT-L2 spectral counts</div>
```
Replace with:
```js
      <div style="font-size:8.5px;color:#bbb;font-style:italic;">CT-L2 spectral counts · Saka et al. 2011, Mol Microbiol · PMID 22014092</div>
```

---

## Task 5: Bump cache and deploy

**Files:**
- Modify: `web/index.html`
- Modify: `web/js/app.js`

- [ ] **Step 1: Bump cache version v=20 → v=21**

```bash
sed -i '' 's/?v=20/?v=21/g' web/index.html web/js/app.js
```

- [ ] **Step 2: Verify**

```bash
grep "v=21" web/index.html web/js/app.js
```
Expected: 5 matches (1 CSS in index.html, 1 script tag in index.html, 4 imports in app.js).

- [ ] **Step 3: Commit all genomes.js + cache changes**

```bash
git add web/js/views/genomes.js web/index.html web/js/app.js
git commit -m "feat: EB/RB enrichment filter chips + data source captions"
```

- [ ] **Step 4: Deploy**

```bash
vercel --prod
```

- [ ] **Step 5: Smoke test in browser**

1. Open the Genomes tab on CT-L2 strain
2. Click "+ More" → expand Expression section
3. Confirm "EB enriched" and "RB enriched" chips appear below Early/Mid/Late/Constitutive
4. Click "EB enriched" → gene list filters (should show ~431 genes), active chip "📈 EB enriched ×" appears in the main filter bar
5. Click the × on the chip to clear
6. Switch to CT-D strain → EB/RB chips should NOT appear in Expression section
7. Open any CT-L2 gene detail → check caption in Transcriptomics and EB/RB Proteomics sections
8. Open any CT-D gene detail → check Transcriptomics caption includes "Belland et al."
