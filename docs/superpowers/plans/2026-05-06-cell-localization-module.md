# Cell Localization Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire SwissBioPics `<sib-swissbiopics-sl>` into the gene detail panel's Cell Localization column, backed by UniProt-fetched SL term IDs with Chlamydia-specific flag overrides.

**Architecture:** Add `subcellular_location_sl text[]` and `localization_curated boolean` to the `proteins` table. A prefetch script populates those columns from the UniProt REST API, then applies Inc/T3SS overrides. The UI replaces the placeholder with the web component + pills (moved from the Protein panel).

**Tech Stack:** Supabase (Postgres), Node.js fetch script, SwissBioPics CDN web component, vanilla JS (genomes.js)

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/007_proteins_localization_sl.sql` | **Create** — adds two columns to `proteins` |
| `data/fetch_localization.js` | **Create** — UniProt fetch + flag overrides + spot-check |
| `web/index.html` | **Modify** — add SwissBioPics CDN script tag |
| `web/js/views/genomes.js` | **Modify** — remove pills from Protein panel, add real Localization renderer, update async loader |

---

### Task 1: DB Migration — add localization columns to proteins

**Files:**
- Create: `supabase/migrations/007_proteins_localization_sl.sql`

- [ ] **Step 1: Write migration**

```sql
-- Adds curated subcellular location SL term IDs and a curation protection flag.
ALTER TABLE public.proteins
  ADD COLUMN IF NOT EXISTS subcellular_location_sl text[],
  ADD COLUMN IF NOT EXISTS localization_curated     boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Run migration in Supabase**

Open the Supabase dashboard → SQL Editor → paste and run the migration.

Expected: no errors, two new columns appear in the `proteins` table.

- [ ] **Step 3: Verify columns exist**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'proteins'
  AND column_name IN ('subcellular_location_sl','localization_curated');
```

Expected output: two rows — `subcellular_location_sl` (ARRAY), `localization_curated` (boolean, default false).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_proteins_localization_sl.sql
git commit -m "feat: add subcellular_location_sl and localization_curated to proteins"
```

---

### Task 2: UniProt fetch script

**Files:**
- Create: `data/fetch_localization.js`

**Background:** The UniProt REST API returns structured JSON for each protein. Subcellular location entries live in `entry.comments` where `commentType === 'SUBCELLULAR LOCATION'`. Each location entry has a `.location.id` (the SL term ID, e.g. `"SL-0086"`) and `.location.value` (human-readable name). We fetch these, apply Chlamydia-specific overrides, then write to `proteins.subcellular_location_sl`.

**Rate limiting:** UniProt requests are made in batches of 5 concurrent requests, with a 300 ms pause between batches. ~2,687 proteins = ~90 batches ≈ 5–6 minutes total.

**Override rules (applied after fetch, regardless of UniProt result):**
- Gene `functional_category = 'Inclusion membrane protein'` → `["SL-0204"]`
- Gene `is_t3_secreted = true` → `["SL-0204"]`

SL-0204 = Secreted. Incs are type III secreted into the inclusion membrane; UniProt incorrectly places them in the bacterial cell membrane.

- [ ] **Step 1: Write the script**

```javascript
#!/usr/bin/env node
/**
 * Fetches subcellular location SL term IDs from UniProt and stores them in
 * proteins.subcellular_location_sl, applying Chlamydia-specific flag overrides.
 *
 * Run:       SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js
 * Dry run:   SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js --dry-run
 * Single:    SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js --uniprot=Q3KNA5
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN     = process.argv.includes('--dry-run');
const SINGLE_ID   = process.argv.find(a => a.startsWith('--uniprot='))?.split('=')[1] ?? null;
const CONCURRENCY = 5;
const BATCH_DELAY = 300; // ms between batches

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Fetch SL term IDs for a UniProt accession. Returns [] on error or no data. */
async function fetchSlTerms(uniprotId) {
  const url = `https://rest.uniprot.org/uniprotkb/${uniprotId}.json`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`  ⚠ UniProt ${uniprotId}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const ids = [];
    for (const comment of (data.comments ?? [])) {
      if (comment.commentType !== 'SUBCELLULAR LOCATION') continue;
      for (const sl of (comment.subcellularLocations ?? [])) {
        if (sl.location?.id) ids.push(sl.location.id);
      }
    }
    return [...new Set(ids)]; // deduplicate
  } catch (err) {
    console.warn(`  ⚠ UniProt ${uniprotId}: ${err.message}`);
    return [];
  }
}

/** Run a batch of async tasks with limited concurrency. */
async function runBatched(tasks, concurrency, delayMs) {
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(t => t()));
    results.push(...batchResults);
    process.stdout.write(`  Processed ${Math.min(i + concurrency, tasks.length)}/${tasks.length}\r`);
    if (i + concurrency < tasks.length) await sleep(delayMs);
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Fetch proteins joined with gene flags (need functional_category, is_t3_secreted)
  //    Skip rows where localization_curated = true (manually curated, never overwrite).
  console.log('Loading proteins…');
  const PAGE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from('proteins')
      .select('id, uniprot_id, localization, subcellular_location_sl, genes!inner(functional_category, is_t3_secreted)')
      .eq('localization_curated', false)
      .range(from, from + PAGE - 1);
    if (SINGLE_ID) query = query.eq('uniprot_id', SINGLE_ID);
    const { data, error } = await query;
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data?.length) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const withUniProt    = allRows.filter(r => r.uniprot_id);
  const withoutUniProt = allRows.filter(r => !r.uniprot_id);
  console.log(`Loaded ${allRows.length} proteins (${withUniProt.length} have UniProt IDs, ${withoutUniProt.length} do not)`);
  if (DRY_RUN) console.log('[DRY RUN — no DB writes]\n');

  // 2. Fetch SL terms from UniProt for proteins with a uniprot_id
  console.log('\nFetching from UniProt API…');
  const fetchedMap = new Map(); // protein id → SL id array
  const tasks = withUniProt.map(row => async () => {
    const slIds = await fetchSlTerms(row.uniprot_id);
    fetchedMap.set(row.id, slIds);
  });
  await runBatched(tasks, CONCURRENCY, BATCH_DELAY);
  console.log('\nFetch complete.');

  // 3. Apply flag-based overrides (Inc and T3SS genes → Secreted)
  //    Override is applied over the UniProt-fetched value.
  const updates = [];
  const spotCheck = []; // rows where fetched value disagrees with existing localization text

  for (const row of allRows) {
    const gene = row.genes;
    let resolvedSl = fetchedMap.get(row.id) ?? null; // null for proteins with no uniprot_id

    // Flag-based override: Inclusion membrane proteins and T3SS-secreted → Secreted
    const isInc      = gene?.functional_category === 'Inclusion membrane protein';
    const isT3Secreted = gene?.is_t3_secreted === true;
    let overridden = false;
    if (isInc || isT3Secreted) {
      resolvedSl = ['SL-0204'];
      overridden = true;
    }

    if (!resolvedSl?.length) continue; // nothing to write

    // Spot-check: does the fetched value agree with existing localization text?
    if (!overridden && row.localization) {
      const existing = row.localization.toLowerCase();
      const fetched  = (resolvedSl ?? []).join(' ').toLowerCase();
      // Simple disagreement heuristic: fetched has 'secreted' but existing doesn't, or vice versa
      const existingHasSecr = existing.includes('secret');
      const fetchedHasSecr  = fetched.includes('sl-0204');
      if (existingHasSecr !== fetchedHasSecr) {
        spotCheck.push({ id: row.id, uniprot_id: row.uniprot_id, existing: row.localization, fetched: resolvedSl.join(', ') });
      }
    }

    updates.push({ id: row.id, subcellular_location_sl: resolvedSl });
  }

  // 4. Print spot-check report
  if (spotCheck.length) {
    console.log(`\n=== SPOT-CHECK — ${spotCheck.length} disagreements (secreted mismatch) ===`);
    for (const r of spotCheck) {
      console.log(`  UniProt ${r.uniprot_id}:`);
      console.log(`    Existing: ${r.existing}`);
      console.log(`    Fetched:  ${r.fetched}`);
    }
  } else {
    console.log('\n✓ Spot-check: no secreted/non-secreted disagreements found.');
  }

  console.log(`\n${updates.length} proteins to update.`);
  if (DRY_RUN) { console.log('Dry run — exiting without writes.'); return; }

  // 5. Write updates to Supabase
  const BATCH_SIZE = 50;
  let succeeded = 0, failed = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    for (const u of batch) {
      const { error } = await supabase
        .from('proteins')
        .update({ subcellular_location_sl: u.subcellular_location_sl })
        .eq('id', u.id);
      if (error) { console.error(`  ✗ ${u.id}: ${error.message}`); failed++; }
      else succeeded++;
    }
    process.stdout.write(`  Wrote ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}\r`);
  }

  console.log(`\n✓ ${succeeded} rows updated, ${failed} failed.`);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
```

- [ ] **Step 2: Run dry-run to verify logic (no DB writes)**

```bash
SUPABASE_SERVICE_KEY=<your-service-key> \
  node data/fetch_localization.js --dry-run
```

Expected: script loads proteins, fetches from UniProt, prints summary + spot-check report, ends with "Dry run — exiting without writes."

- [ ] **Step 3: Test single protein to verify UniProt parsing**

Pick a well-characterized protein (e.g. RecA = CTL0018, uniprot_id Q3KKZ5 for CT-L2):

```bash
SUPABASE_SERVICE_KEY=<your-service-key> \
  node data/fetch_localization.js --dry-run --uniprot=Q3KKZ5
```

Expected: prints the SL term IDs fetched for that protein. Verify they make biological sense (RecA should be cytoplasmic → SL-0086).

- [ ] **Step 4: Commit the script**

```bash
git add data/fetch_localization.js
git commit -m "data: add UniProt localization fetch script with Inc/T3SS overrides"
```

---

### Task 3: Run the fetch script and review results

**Files:** (none — data operation only)

- [ ] **Step 1: Run against Supabase (live)**

```bash
SUPABASE_SERVICE_KEY=<your-service-key> \
  node data/fetch_localization.js
```

Expected: ~5–6 minutes. Ends with "✓ N rows updated, 0 failed."

- [ ] **Step 2: Review spot-check output**

Read the spot-check section printed to stdout. Any secreted/non-secreted disagreements should be biologically reviewed. Inc proteins should all show `SL-0204` (the override ensures this, so they should NOT appear in spot-check).

- [ ] **Step 3: Verify in Supabase SQL Editor**

```sql
-- Count proteins with SL data
SELECT COUNT(*) FROM proteins WHERE subcellular_location_sl IS NOT NULL;

-- Verify Inc override: all Inclusion membrane proteins → SL-0204 only
SELECT p.subcellular_location_sl, COUNT(*)
FROM proteins p
JOIN genes g ON g.id = p.gene_id
WHERE g.functional_category = 'Inclusion membrane protein'
GROUP BY p.subcellular_location_sl;

-- Sample a few cytoplasmic proteins
SELECT g.locus_tag, p.localization, p.subcellular_location_sl
FROM proteins p
JOIN genes g ON g.id = p.gene_id
WHERE p.localization ILIKE '%cytoplasm%'
LIMIT 10;
```

Expected for Inc check: all rows should have `{SL-0204}`.

---

### Task 4: Add SwissBioPics CDN to index.html

**Files:**
- Modify: `web/index.html`

The SwissBioPics web component must be registered (via its CDN script) before it appears in the DOM. Add the script tag to `<head>` so it loads before any gene detail panel is rendered.

- [ ] **Step 1: Add CDN script tag**

In `web/index.html`, add after the Tailwind script block (after line ~29, before `</head>`):

```html
  <!-- SwissBioPics subcellular location web component -->
  <script defer src="https://www.swissbiopics.org/static/swissbiopics.js"></script>
```

- [ ] **Step 2: Verify component registers**

Open the app in browser, open DevTools console. Run:

```javascript
customElements.get('sib-swissbiopics-sl')
```

Expected: returns the class definition (not `undefined`).

- [ ] **Step 3: Commit**

```bash
git add web/index.html
git commit -m "feat: add SwissBioPics CDN script to index.html"
```

---

### Task 5: Remove localization pills from Protein panel

**Files:**
- Modify: `web/js/views/genomes.js` (lines ~911–946)

The `locTags`/`locHtml` block in `renderDetailProtein()` currently parses `protein.localization` and renders pills. Remove it — pills move to the Localization panel in Task 6.

- [ ] **Step 1: Delete the localization parsing and HTML from renderDetailProtein**

In `renderDetailProtein()`, remove the block from (approximately) line 911 to 926:

```javascript
  // DELETE this block entirely — pills move to Localization panel
  const locTags = protein.localization
    ? protein.localization
        .replace(/\s*\{[^}]+\}/g, '')
        .split(/[;.]+/)
        .map(s => s.trim())
        .filter(s => s && s.length > 1 && !/note=/i.test(s) && !/prorule/i.test(s) && !/hamap/i.test(s) && !/pubmed/i.test(s) && s.length < 60)
    : [];
  const locHtml = locTags.length
    ? `<div style="margin-top:10px;">
        <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:5px;">Localization</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${locTags.map(t => `<span style="font-size:9px;font-weight:500;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;">${esc(t)}</span>`).join('')}
        </div>
      </div>`
    : '';
```

Also remove `${locHtml}` from the `el.innerHTML` template (around line 945).

After the edit the `el.innerHTML` block should flow directly from `${propBlock('Product', ...)}` to `${propBlock('Subunit Structure', ...)}`.

- [ ] **Step 2: Verify Protein panel renders without pills**

Open the app, click any characterized gene. The Protein panel should show: mass/length/TM/signal peptide stats → Product → Subunit Structure. No "Localization" row.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "refactor: move localization pills out of Protein panel"
```

---

### Task 6: Implement the real Localization panel renderer

**Files:**
- Modify: `web/js/views/genomes.js`

Replace `renderDetailLocalizationPlaceholder()` with `renderDetailLocalization(detail, gene, protein)`, called from `loadDetailAsync()` after the protein is available.

The function must handle three states:
1. `protein.subcellular_location_sl` is populated → SwissBioPics diagram + pills + source badge
2. Null/empty + `gene.is_hypothetical = true` → "Location unknown" placeholder
3. Null/empty + not hypothetical → pills from raw `localization` text if available, else "Location unknown" placeholder

taxid is derived from the gene's strain: CT-L2 and CT-D → 813, CM → 243161.

Source badge: show `Curated` if `protein.localization_curated = true`, else `UniProt`.

- [ ] **Step 1: Add the taxid lookup constant near the top of the file** (after `CATEGORY_COLORS` or similar constants block)

```javascript
const STRAIN_TAXID = { 'CT-L2': 813, 'CT-D': 813, 'CM': 243161 };
```

- [ ] **Step 2: Replace renderDetailLocalizationPlaceholder with the real renderer**

Find and replace the entire `renderDetailLocalizationPlaceholder` function with:

```javascript
function renderDetailLocalization(detail, gene, protein) {
  const el = detail.querySelector('#d-localization');
  if (!el) return;

  const slTerms   = protein?.subcellular_location_sl ?? [];
  const curated   = protein?.localization_curated ?? false;
  const isHypo    = gene.is_hypothetical ?? false;
  const taxid     = STRAIN_TAXID[gene.strains?.common_name] ?? 813;

  // ── State 1: SL terms available — diagram + pills + source badge ──
  if (slTerms.length) {
    const sls = slTerms.join(',');

    // Parse human-readable pill labels from the SL IDs using the raw localization
    // text as a fallback label source. Strips ECO evidence codes first.
    const pillsHtml = buildLocPills(protein?.localization ?? '');

    const sourceLabel = curated ? 'Curated' : 'UniProt';
    const sourceBg    = curated ? '#fef3c7' : '#f3f4f6';
    const sourceColor = curated ? '#92400e' : '#6b7280';

    el.innerHTML = `
      ${sectionHead('Cell Localization',
        `<span style="font-size:7.5px;font-weight:600;padding:1px 6px;border-radius:8px;background:${sourceBg};color:${sourceColor};">${sourceLabel}</span>`)}
      <div style="padding:6px 12px 12px;">
        <sib-swissbiopics-sl taxid="${taxid}" sls="${sls}"
          style="display:block;max-width:100%;"></sib-swissbiopics-sl>
        ${pillsHtml}
      </div>`;
    return;
  }

  // ── State 2 & 3: no SL terms ──
  if (isHypo || !protein?.localization) {
    el.innerHTML = `
      ${sectionHead('Cell Localization')}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:18px 8px 14px;text-align:center;">
        <div style="font-size:20px;color:#d1d5db;">◎</div>
        <div style="font-size:9px;font-weight:600;color:#aaa;">Location unknown</div>
      </div>`;
    return;
  }

  // State 3: non-hypothetical, no SL terms yet — show pills from raw localization text
  const pillsHtml = buildLocPills(protein.localization);
  el.innerHTML = `
    ${sectionHead('Cell Localization')}
    <div style="padding:6px 12px 12px;">
      ${pillsHtml || '<div style="font-size:10px;color:#bbb;font-style:italic;padding:8px 0;">No diagram available</div>'}
    </div>`;
}

/** Parse raw UniProt localization string into pill HTML. */
function buildLocPills(localization) {
  if (!localization) return '';
  const tags = localization
    .replace(/\s*\{[^}]+\}/g, '')
    .split(/[;.]+/)
    .map(s => s.trim())
    .filter(s => s && s.length > 1
      && !/note=/i.test(s) && !/prorule/i.test(s)
      && !/hamap/i.test(s) && !/pubmed/i.test(s)
      && s.length < 60);
  if (!tags.length) return '';
  return `
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">
      ${tags.map(t => `<span style="font-size:9px;font-weight:500;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;">${esc(t)}</span>`).join('')}
    </div>`;
}
```

- [ ] **Step 3: Update loadDetailAsync to call the new renderer (not the placeholder)**

In `showGeneDetailDesktop()`, find the synchronous call:
```javascript
  renderDetailLocalizationPlaceholder(detail);
```
Replace it with the placeholder inline so the column isn't empty while async loads:
```javascript
  // Show loading state until protein data arrives
  const locEl = detail.querySelector('#d-localization');
  if (locEl) locEl.innerHTML = `
    ${sectionHead('Cell Localization')}
    <div style="padding:18px 8px 14px;text-align:center;">
      <div style="font-size:20px;color:#e5e7eb;">◎</div>
    </div>`;
```

Then in `loadDetailAsync()`, add the call after `renderDetailProtein`:
```javascript
  renderDetailLocalization(detail, gene, protResult.data);
```

The full updated call block in `loadDetailAsync` should read:

```javascript
  renderDetailOrthologs(detail, orthoRows, gene);
  renderDetailGeneMap(detail, gene, neighborResult.data ?? []);
  renderDetailProtein(detail, gene, protResult.data);
  renderDetailTranscriptomics(detail, gene, exprRows ?? []);
  renderDetailProteomics(detail, gene, exprRows ?? []);
  renderDetailStructure(detail, gene, protResult.data?.alphafold_results ?? []);
  renderDetailLocalization(detail, gene, protResult.data);   // ← add this line
```

- [ ] **Step 4: Hide SwissBioPics internal term list via CSS** (it renders its own term list which duplicates our pills)

In `web/css/app.css`, add at the end:

```css
/* SwissBioPics — hide internal term list; we render our own pills */
sib-swissbiopics-sl::part(terms),
sib-swissbiopics-sl .subcellular-location-terms,
sib-swissbiopics-sl ul {
  display: none !important;
}
```

Note: if the SwissBioPics component uses a shadow DOM, `::part(terms)` may not work — test and adjust. If the list is still visible, inspect the component's DOM structure and update the selector.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genomes.js web/css/app.css
git commit -m "feat: implement Cell Localization panel with SwissBioPics and moved pills"
```

---

### Task 7: Verify in browser

**Files:** (none — browser verification only)

- [ ] **Step 1: Open app and check a characterized, cytoplasmic gene**

Navigate to a CT-L2 gene known to be cytoplasmic (e.g. CTL0018 / RecA). The Localization panel should show:
- The SwissBioPics bacterial cell diagram with cytoplasm highlighted
- Source badge: "UniProt"
- Pill(s) showing the location terms

- [ ] **Step 2: Check an Inc protein**

Navigate to a known Inc gene (functional_category = 'Inclusion membrane protein', e.g. CTL0115 / IncA). The Localization panel should show:
- SwissBioPics diagram with "Secreted" compartment highlighted
- Source badge: "UniProt" (the override is applied by the script, not flagged as curated)
- Pill: "Secreted" or equivalent

- [ ] **Step 3: Check a hypothetical gene**

Navigate to a gene with `is_hypothetical = true` and no SL data. The Localization panel should show:
- ◎ icon
- "Location unknown" label

- [ ] **Step 4: Check a CM gene**

Navigate to a CM gene with known localization. Confirm the SwissBioPics diagram renders (taxid 243161 should work — if it shows an error, the component may not have data for that taxid, in which case fall back to taxid 813 for all strains and note this in a code comment).

- [ ] **Step 5: Push to Vercel**

```bash
git push origin main
```

Vercel auto-deploys. Verify the live site shows the localization panel correctly.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `subcellular_location_sl text[]` and `localization_curated boolean` — Task 1
- ✅ UniProt API fetch with rate limiting — Task 2
- ✅ Flag-based overrides (Inc → SL-0204, T3SS → SL-0204) — Task 2
- ✅ Spot-check output — Task 2
- ✅ Re-run safety (`localization_curated = true` skip) — Task 2
- ✅ SwissBioPics CDN loaded — Task 4
- ✅ Pills removed from Protein panel — Task 5
- ✅ Diagram + pills + source badge in Localization panel — Task 6
- ✅ All three fallback states — Task 6
- ✅ Correct taxid per strain (813 for CT-L2/CT-D, 243161 for CM) — Task 6
- ✅ `buildLocPills` helper extracted (shared between State 1 and State 3 renders) — Task 6

**Type consistency:**
- `renderDetailLocalization(detail, gene, protein)` — consistent across Task 6 call sites
- `buildLocPills(localization: string) → string` — used in Task 6 only
- `STRAIN_TAXID` constant — defined once in Task 6 Step 1, used in Task 6 Step 2
- `protein.subcellular_location_sl` — array accessed via `?.` throughout, consistent with Supabase one-to-one FK returning object (access as `protResult.data.subcellular_location_sl`)
