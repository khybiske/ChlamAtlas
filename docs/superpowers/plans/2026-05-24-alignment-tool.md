# Sequence Alignment Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone sequence alignment page at the Tools tab that lets users pick Chlamydia genes (with ortholog auto-fill), run Clustal Omega alignment via the EMBL-EBI REST API, and view results with conditional identity coloring and differences-highlighted display.

**Architecture:** New `web/js/views/alignment.js` view registered as the `alignment` tab in the existing SPA router. Gene picker queries Supabase for typeahead; sequences fetched from `genes.dna_sequence` / `proteins.aa_sequence` before POSTing to the EBI API. Results rendered inline below the picker with no page navigation.

**Tech Stack:** Vanilla JS, Supabase JS client (already loaded), EMBL-EBI Clustal Omega REST API, Tailwind CSS (CDN, already loaded), DM Mono font (already loaded for monospace alignment display).

**Strain colors (from tailwind config in index.html):**
- CT-L2: `#16a34a` (green)
- CT-D: `#4b2e83` (UW purple)
- CM: `#2563eb` (blue)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web/index.html` | Modify | Add `tab-alignment` section; activate Tools nav button |
| `web/js/app.js` | Modify | Register `alignment` in TABS/RENDERERS; import renderAlignment; add "Align orthologs" activation helper |
| `web/js/views/alignment.js` | Create | Full alignment tool: picker, EBI integration, result display, export |
| `web/js/views/genomes.js` | Modify | Add "Align orthologs" button to gene detail panel |

---

## Task 1: Scaffold the alignment tab in HTML and router

**Files:**
- Modify: `web/index.html` (lines 63, 121–123)
- Modify: `web/js/app.js` (lines 1–8, 22–29)

- [ ] **Step 1: Add the tab section to index.html**

In `web/index.html`, after the roadmap section (after line 123, before `</main>`), add:

```html
    <!-- ALIGNMENT TAB -->
    <section id="tab-alignment" class="tab-panel hidden">
      <div id="alignment-content"></div>
    </section>
```

Also replace the disabled Tools button at line 63:

```html
<!-- BEFORE -->
<button class="nav-tab" disabled title="Coming soon" style="opacity:0.45;cursor:default;">Tools</button>

<!-- AFTER -->
<button data-tab="alignment" class="nav-tab">Tools</button>
```

- [ ] **Step 2: Register the tab in app.js**

In `web/js/app.js`, add the import at the top (after the roadmap import):

```js
import { renderAlignment } from './views/alignment.js?v=91';
```

Add `'alignment'` to the TABS array:

```js
const TABS = ['home', 'genomes', 'mutants', 'pipeline', 'roadmap', 'alignment'];
```

Add to RENDERERS:

```js
const RENDERERS = {
  home:      renderHome,
  genomes:   renderGenomes,
  mutants:   renderMutants,
  pipeline:  renderPipeline,
  roadmap:   renderRoadmap,
  alignment: renderAlignment,
};
```

- [ ] **Step 3: Create the stub alignment view**

Create `web/js/views/alignment.js` with just enough to confirm the tab renders:

```js
// ChlamAtlas — Sequence Alignment tool

export function renderAlignment(container) {
  container.innerHTML = `
    <div style="max-width:800px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:700;color:#0f4530;margin-bottom:6px;">
        Sequence Alignment
      </h1>
      <p style="color:#64748b;font-size:13px;">
        Align orthologous or arbitrary Chlamydia gene sequences using Clustal Omega.
      </p>
    </div>
  `;
}
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:3000` (or whatever dev server), click Tools tab — should show the page header with no errors in console.

- [ ] **Step 5: Commit**

```bash
git add web/index.html web/js/app.js web/js/views/alignment.js
git commit -m "feat: scaffold alignment tab and activate Tools nav button"
```

---

## Task 2: Build the gene picker UI

**Files:**
- Modify: `web/js/views/alignment.js`

- [ ] **Step 1: Add picker HTML structure to renderAlignment**

Replace the stub body in `renderAlignment` with the full picker scaffold. The view manages its own state in a local `alignState` object.

```js
// ChlamAtlas — Sequence Alignment tool
import { sb } from '../client.js?v=80';

// ── Local state ──────────────────────────────────────────────
let alignState = {
  seqType: 'dna',       // 'dna' | 'aa'
  entries: [],          // { gene: GeneRow, status: 'confirmed'|'suggested', id: string }
  results: null,        // parsed alignment results or null
  running: false,
};
let _container = null;

export function renderAlignment(container) {
  _container = container;
  alignState = { seqType: 'dna', entries: [], results: null, running: false };
  render();
}

function render() {
  _container.innerHTML = `
    <div style="max-width:800px;margin:0 auto;padding:32px 24px 64px;">
      <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:700;color:#0f4530;margin-bottom:6px;">
        Sequence Alignment
      </h1>
      <p style="color:#64748b;font-size:13px;margin-bottom:28px;">
        Align orthologous or arbitrary Chlamydia gene sequences using Clustal Omega.
      </p>

      ${renderSeqTypeToggle()}
      ${renderPicker()}
      ${renderResults()}
    </div>
  `;
  wirePickerEvents();
}

// ── Sequence type toggle ─────────────────────────────────────
function renderSeqTypeToggle() {
  return `
    <div style="display:inline-flex;background:#f1f5f9;border-radius:99px;padding:3px;gap:2px;margin-bottom:24px;">
      <button id="aln-type-dna" onclick="window._alnSetType('dna')"
        style="padding:6px 18px;border-radius:99px;border:none;font-size:13px;font-weight:600;cursor:pointer;
               ${alignState.seqType==='dna' ? 'background:white;color:#0f4530;box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:#94a3b8;'}">
        DNA
      </button>
      <button id="aln-type-aa" onclick="window._alnSetType('aa')"
        style="padding:6px 18px;border-radius:99px;border:none;font-size:13px;font-weight:600;cursor:pointer;
               ${alignState.seqType==='aa' ? 'background:white;color:#0f4530;box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:#94a3b8;'}">
        Amino Acid
      </button>
    </div>
  `;
}

// ── Gene list entries ────────────────────────────────────────
function strainColor(strainId) {
  if (!strainId) return '#64748b';
  const s = strainId.toUpperCase();
  if (s.includes('L2')) return '#16a34a';
  if (s.includes('CT-D') || s === 'CT-D') return '#4b2e83';
  if (s.includes('CM'))  return '#2563eb';
  return '#64748b';
}

function renderEntryRow(entry) {
  const g = entry.gene;
  const label = [g.locus_tag, g.gene_name].filter(Boolean).join(' · ');
  const sc = strainColor(g.strain_id);
  const isConfirmed = entry.status === 'confirmed';
  const border = isConfirmed
    ? '1.5px solid #86efac'
    : '1.5px dashed #fde68a';
  const bg = isConfirmed ? '#f0fdf4' : '#fffbeb';
  const badge = isConfirmed
    ? (entry.isPrimary
        ? `<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:99px;font-weight:700;">your pick</span>`
        : `<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:99px;font-weight:700;">confirmed ✓</span>`)
    : `<span style="font-size:9px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:99px;font-weight:700;">suggested ortholog</span>`;

  const lockBtn = (!entry.isPrimary && entry.status === 'suggested')
    ? `<button onclick="window._alnLock('${entry.id}')"
         title="Keep this sequence"
         style="width:28px;height:28px;border-radius:50%;border:1.5px solid #86efac;background:white;
                font-size:13px;color:#16a34a;cursor:pointer;display:flex;align-items:center;justify-content:center;">✓</button>`
    : '';
  const removeBtn = !entry.isPrimary
    ? `<button onclick="window._alnRemove('${entry.id}')"
         title="Remove"
         style="width:28px;height:28px;border-radius:50%;border:1.5px solid #fca5a5;background:white;
                font-size:13px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>`
    : '';

  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
                border:${border};background:${bg};">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:#0f4530;">${label}</div>
        <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px;margin-top:2px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${sc};display:inline-block;"></span>
          <span>${g.strain_id}</span>
          ${badge}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${lockBtn}
        ${removeBtn}
      </div>
    </div>
  `;
}

// ── Picker section ───────────────────────────────────────────
function renderPicker() {
  const canRun = alignState.entries.length >= 2 && !alignState.running;
  return `
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:10px;">
        Sequences to align
      </div>

      <!-- Typeahead search -->
      <div style="position:relative;margin-bottom:14px;">
        <input id="aln-search" type="text" placeholder="Search by locus tag or gene name…"
          autocomplete="off"
          style="width:100%;max-width:440px;border:1.5px solid #cbd5e1;border-radius:8px;
                 padding:10px 12px;font-size:13px;color:#1e293b;outline:none;
                 font-family:'DM Sans',sans-serif;"/>
        <div id="aln-search-results"
          style="display:none;position:absolute;top:100%;left:0;width:100%;max-width:440px;
                 background:white;border:1.5px solid #0f4530;border-top:none;
                 border-radius:0 0 8px 8px;z-index:50;max-height:220px;overflow-y:auto;"></div>
      </div>

      <!-- Entry list -->
      <div id="aln-entry-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        ${alignState.entries.length === 0
          ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">
               Search above to add sequences…
             </div>`
          : alignState.entries.map(renderEntryRow).join('')}
      </div>

      <!-- Add another -->
      ${alignState.entries.length > 0 ? `
        <button id="aln-add-another"
          style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#64748b;
                 border:1.5px dashed #cbd5e1;border-radius:8px;padding:7px 14px;cursor:pointer;
                 background:none;margin-bottom:16px;font-family:'DM Sans',sans-serif;">
          ＋ Add another gene
        </button>
      ` : ''}

      <!-- Run button -->
      <div>
        <button id="aln-run-btn" ${canRun ? '' : 'disabled'}
          onclick="window._alnRun()"
          style="display:inline-flex;align-items:center;gap:7px;border:none;border-radius:10px;
                 padding:11px 22px;font-size:14px;font-weight:700;cursor:${canRun?'pointer':'not-allowed'};
                 font-family:'DM Sans',sans-serif;
                 background:${canRun?'#0f4530':'#e2e8f0'};color:${canRun?'white':'#94a3b8'};">
          ▶ Run alignment
        </button>
        ${alignState.entries.length < 2
          ? `<div style="font-size:11px;color:#94a3b8;margin-top:6px;">Add at least 2 sequences to run</div>`
          : ''}
      </div>
    </div>
  `;
}

function renderResults() { return ''; } // placeholder until Task 4

function wirePickerEvents() {
  // expose globals for inline onclick handlers
  window._alnSetType = (type) => {
    alignState.seqType = type;
    alignState.results = null;
    render();
  };
  window._alnLock = (id) => {
    const e = alignState.entries.find(x => x.id === id);
    if (e) e.status = 'confirmed';
    reRenderEntries();
  };
  window._alnRemove = (id) => {
    alignState.entries = alignState.entries.filter(x => x.id !== id);
    reRenderEntries();
  };
  window._alnRun = () => runAlignment();

  // Search input
  const input = document.getElementById('aln-search');
  const results = document.getElementById('aln-search-results');
  if (!input) return;

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    searchTimer = setTimeout(() => searchGenes(q), 220);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) results.style.display = 'block';
  });
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.style.display = 'none';
    }
  }, { capture: true });

  // "Add another gene" re-focuses search
  document.getElementById('aln-add-another')?.addEventListener('click', () => {
    input.value = '';
    input.focus();
  });
}

function reRenderEntries() {
  const list = document.getElementById('aln-entry-list');
  if (!list) return;
  list.innerHTML = alignState.entries.length === 0
    ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">Search above to add sequences…</div>`
    : alignState.entries.map(renderEntryRow).join('');

  // also update run button state
  const btn = document.getElementById('aln-run-btn');
  const hint = btn?.nextElementSibling;
  const canRun = alignState.entries.length >= 2 && !alignState.running;
  if (btn) {
    btn.disabled = !canRun;
    btn.style.background = canRun ? '#0f4530' : '#e2e8f0';
    btn.style.color = canRun ? 'white' : '#94a3b8';
    btn.style.cursor = canRun ? 'pointer' : 'not-allowed';
  }
  if (hint) hint.style.display = alignState.entries.length < 2 ? 'block' : 'none';

  // show/hide "add another"
  const addBtn = document.getElementById('aln-add-another');
  if (!addBtn && alignState.entries.length > 0) {
    // re-render picker section fully to show the add button
    const pickerWrap = document.getElementById('aln-entry-list')?.parentElement;
    if (pickerWrap) pickerWrap.outerHTML = renderPicker();
    wirePickerEvents();
  }
}

// ── Gene search ──────────────────────────────────────────────
async function searchGenes(q) {
  const resultsEl = document.getElementById('aln-search-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:#94a3b8;">Searching…</div>`;
  resultsEl.style.display = 'block';

  const term = q.toLowerCase();
  const { data, error } = await sb
    .from('genes')
    .select('id,locus_tag,gene_name,gene_symbol,strain_id')
    .or(`locus_tag.ilike.%${term}%,gene_name.ilike.%${term}%,gene_symbol.ilike.%${term}%`)
    .order('strain_id')
    .limit(20);

  if (error || !data?.length) {
    resultsEl.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:#94a3b8;">No genes found</div>`;
    return;
  }

  resultsEl.innerHTML = data.map(g => {
    const label = [g.locus_tag, g.gene_name].filter(Boolean).join(' · ');
    const sc = strainColor(g.strain_id);
    return `
      <div data-gene-id="${g.id}" style="padding:9px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;
           display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
           onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'"
           onclick="window._alnPickGene(${JSON.stringify(JSON.stringify(g))})">
        <div>
          <span style="font-weight:700;color:#0f4530;">${g.locus_tag}</span>
          ${g.gene_name ? `<span style="color:#64748b;margin-left:5px;">${g.gene_name}</span>` : ''}
        </div>
        <span style="font-size:9px;font-weight:700;background:#f1f5f9;color:${sc};padding:2px 7px;border-radius:4px;">
          ${g.strain_id}
        </span>
      </div>
    `;
  }).join('');

  window._alnPickGene = (gStr) => {
    const g = JSON.parse(gStr);
    document.getElementById('aln-search').value = '';
    document.getElementById('aln-search-results').style.display = 'none';
    addGeneWithOrthologs(g);
  };
}
```

- [ ] **Step 2: Verify picker renders and search works**

Open the Tools tab, type `incA` in the search box — dropdown should appear with matching genes from all strains. No console errors.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/alignment.js
git commit -m "feat: alignment picker UI with typeahead gene search"
```

---

## Task 3: Ortholog auto-fill and entry state management

**Files:**
- Modify: `web/js/views/alignment.js`

- [ ] **Step 1: Add addGeneWithOrthologs function**

Add this function to `alignment.js`:

```js
// ── Ortholog auto-fill ───────────────────────────────────────
async function addGeneWithOrthologs(gene) {
  // Don't add duplicates
  if (alignState.entries.find(e => e.gene.id === gene.id)) return;

  const isPrimary = alignState.entries.length === 0 || !alignState.entries.some(e => e.isPrimary);
  const primaryId = `entry-${Date.now()}-${gene.id}`;

  alignState.entries.push({ id: primaryId, gene, status: 'confirmed', isPrimary });
  reRenderEntries();

  if (!isPrimary) return; // manual additions don't trigger ortholog fetch

  // Fetch orthologs
  const { data: orthoRows } = await sb
    .from('orthologs')
    .select('gene_id,ortholog_gene_id')
    .or(`gene_id.eq.${gene.id},ortholog_gene_id.eq.${gene.id}`);

  if (!orthoRows?.length) return;

  const orthologGeneIds = orthoRows
    .map(r => r.gene_id === gene.id ? r.ortholog_gene_id : r.gene_id)
    .filter(id => id !== gene.id);

  if (!orthologGeneIds.length) return;

  const { data: orthoGenes } = await sb
    .from('genes')
    .select('id,locus_tag,gene_name,gene_symbol,strain_id')
    .in('id', orthologGeneIds);

  if (!orthoGenes?.length) return;

  for (const og of orthoGenes) {
    if (alignState.entries.find(e => e.gene.id === og.id)) continue;
    alignState.entries.push({
      id: `entry-${Date.now()}-${og.id}`,
      gene: og,
      status: 'suggested',
      isPrimary: false,
    });
  }
  reRenderEntries();
}
```

- [ ] **Step 2: Verify ortholog auto-fill**

Search for `incA`, select CTL0522 — should see it appear as "your pick" (green), then CT-D and CM orthologs appear below as "suggested ortholog" (amber dashed). Clicking ✓ on one turns it confirmed-green. Clicking ✕ removes it.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/alignment.js
git commit -m "feat: ortholog auto-fill with confirm/remove entry states"
```

---

## Task 4: EMBL-EBI Clustal Omega integration

**Files:**
- Modify: `web/js/views/alignment.js`

- [ ] **Step 1: Add sequence fetching**

Add these functions to `alignment.js`:

```js
// ── Sequence fetching from Supabase ──────────────────────────
async function fetchSequences() {
  const geneIds = alignState.entries.map(e => e.gene.id);
  const missing = [];

  if (alignState.seqType === 'dna') {
    const { data } = await sb
      .from('genes')
      .select('id,locus_tag,gene_name,dna_sequence')
      .in('id', geneIds);

    const seqMap = Object.fromEntries((data || []).map(r => [r.id, r]));
    for (const entry of alignState.entries) {
      const row = seqMap[entry.gene.id];
      if (!row?.dna_sequence) missing.push(entry.gene.locus_tag);
    }
    if (missing.length) throw new Error(`No DNA sequence on file for: ${missing.join(', ')}`);

    return alignState.entries.map(e => {
      const row = seqMap[e.gene.id];
      const seqId = row.locus_tag.replace(/\s+/g, '_');
      return `>${seqId}\n${row.dna_sequence}`;
    }).join('\n');

  } else {
    // AA: join through proteins table
    const { data: geneRows } = await sb
      .from('genes')
      .select('id,locus_tag,proteins(id,aa_sequence)')
      .in('id', geneIds);

    const seqMap = Object.fromEntries((geneRows || []).map(r => [r.id, r]));
    for (const entry of alignState.entries) {
      const row = seqMap[entry.gene.id];
      if (!row?.proteins?.[0]?.aa_sequence) missing.push(entry.gene.locus_tag);
    }
    if (missing.length) throw new Error(`No amino acid sequence on file for: ${missing.join(', ')}`);

    return alignState.entries.map(e => {
      const row = seqMap[e.gene.id];
      const seq = row.proteins[0].aa_sequence;
      const seqId = row.locus_tag.replace(/\s+/g, '_');
      return `>${seqId}\n${seq}`;
    }).join('\n');
  }
}
```

- [ ] **Step 2: Add EBI API polling functions**

```js
// ── EMBL-EBI Clustal Omega REST API ─────────────────────────
const EBI_BASE = 'https://www.ebi.ac.uk/Tools/services/rest/clustalo';
const EBI_EMAIL = 'chlamatlas@chlamatlas.org';

async function submitToEBI(fasta) {
  const body = new URLSearchParams({
    email:    EBI_EMAIL,
    sequence: fasta,
    stype:    alignState.seqType === 'dna' ? 'dna' : 'protein',
    outfmt:   'clustal_num',
  });
  const res = await fetch(`${EBI_BASE}/run`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/plain' },
    body,
  });
  if (!res.ok) throw new Error(`EBI submission failed: ${res.status}`);
  return (await res.text()).trim(); // returns jobId
}

async function pollEBI(jobId, onStatus) {
  const MAX_POLLS = 40; // 40 × 3s = 2 min max
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`${EBI_BASE}/status/${jobId}`, { headers: { Accept: 'text/plain' } });
    const status = (await res.text()).trim();
    onStatus(status, i);
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'FAILURE') throw new Error(`EBI job ${status}`);
  }
  throw new Error('Alignment timed out after 2 minutes');
}

async function fetchEBIResult(jobId, resultType = 'aln-clustal_num') {
  const res = await fetch(`${EBI_BASE}/result/${jobId}/${resultType}`, {
    headers: { Accept: 'text/plain' },
  });
  if (!res.ok) throw new Error(`Failed to fetch result ${resultType}: ${res.status}`);
  return res.text();
}
```

- [ ] **Step 3: Add the runAlignment orchestrator**

```js
// ── Run orchestration ────────────────────────────────────────
async function runAlignment() {
  alignState.running = true;
  alignState.results = null;
  render();

  try {
    // 1. Fetch sequences
    setSpinner('Fetching sequences…');
    const fasta = await fetchSequences();

    // 2. Submit to EBI
    setSpinner('Submitting to Clustal Omega…');
    const jobId = await submitToEBI(fasta);

    // 3. Poll
    await pollEBI(jobId, (status, poll) => {
      setSpinner(`Waiting for alignment… (${poll * 3}s)`);
    });

    // 4. Fetch results
    setSpinner('Retrieving results…');
    const [clustalText, fastaText] = await Promise.all([
      fetchEBIResult(jobId, 'aln-clustal_num'),
      fetchEBIResult(jobId, 'aln-fasta'),
    ]);
    // Phylip fetched on demand at export time
    alignState.results = { jobId, clustalText, fastaText, seqType: alignState.seqType };

  } catch (err) {
    alignState.results = { error: err.message };
  }

  alignState.running = false;
  render();
}

function setSpinner(msg) {
  const el = document.getElementById('aln-spinner-msg');
  if (el) el.textContent = msg;
}
```

- [ ] **Step 4: Add spinner HTML to renderResults**

Replace the `renderResults` stub:

```js
function renderResults() {
  if (alignState.running) {
    return `
      <div style="padding:32px 0;display:flex;align-items:center;gap:14px;">
        <div style="width:20px;height:20px;border:2px solid #0f4530;border-top-color:transparent;
                    border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <span id="aln-spinner-msg" style="font-size:13px;color:#64748b;">Submitting…</span>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
  }
  if (!alignState.results) return '';
  if (alignState.results.error) {
    return `
      <div style="background:#fff1f2;border:1.5px solid #fecdd3;border-radius:10px;padding:14px 16px;color:#be123c;font-size:13px;">
        ⚠ ${alignState.results.error}
        <button onclick="window._alnRun()"
          style="margin-left:12px;background:#0f4530;color:white;border:none;border-radius:6px;
                 padding:4px 12px;font-size:12px;cursor:pointer;">Retry</button>
      </div>
    `;
  }
  return renderAlignmentResults(alignState.results);
}
```

- [ ] **Step 5: Verify end-to-end**

Select two genes with sequences (e.g. CTL0522 incA + CT396 incA), click Run alignment — spinner should appear, then results (or error) after ~15–30 seconds. Open DevTools Network tab to confirm the EBI requests are firing correctly.

- [ ] **Step 6: Commit**

```bash
git add web/js/views/alignment.js
git commit -m "feat: Clustal Omega EBI API integration with sequence fetch and polling"
```

---

## Task 5: Result display — stats cards and alignment panel

**Files:**
- Modify: `web/js/views/alignment.js`

- [ ] **Step 1: Add alignment parser**

```js
// ── Alignment parsing ────────────────────────────────────────
function parseClustalAlignment(clustalText) {
  // Clustal format: sequence lines are "LABEL    SEQUENCE"
  // Interleaved blocks separated by blank lines
  const seqMap = {}; // label → accumulated sequence string
  const labels = []; // insertion order

  for (const line of clustalText.split('\n')) {
    if (line.startsWith('CLUSTAL') || line.startsWith(' ') || line.trim() === '') continue;
    const match = line.match(/^(\S+)\s+([A-Za-z\-]+)/);
    if (!match) continue;
    const [, label, seq] = match;
    if (!seqMap[label]) { seqMap[label] = ''; labels.push(label); }
    seqMap[label] += seq;
  }

  const sequences = labels.map(label => ({ label, seq: seqMap[label] }));
  const alnLength = sequences[0]?.seq.length ?? 0;

  // Compute identity: fraction of columns where all sequences agree (ignoring gaps)
  let identical = 0, comparable = 0;
  for (let i = 0; i < alnLength; i++) {
    const col = sequences.map(s => s.seq[i]);
    if (col.some(c => c === '-')) continue; // skip gap columns
    comparable++;
    if (col.every(c => c === col[0])) identical++;
  }
  const identity = comparable > 0 ? ((identical / comparable) * 100).toFixed(1) : '0.0';

  const gapCount = sequences.reduce((acc, s) =>
    acc + (s.seq.match(/-/g)?.length ?? 0), 0);

  return { sequences, alnLength, identity: parseFloat(identity), gapCount, labels };
}
```

- [ ] **Step 2: Add stats cards**

```js
// ── Stats cards ──────────────────────────────────────────────
function identityStyle(pct) {
  if (pct >= 90) return { bg: '#f0fdf4', border: '#86efac', color: '#15803d' };
  if (pct >= 70) return { bg: '#fffbeb', border: '#fde68a', color: '#b45309' };
  return { bg: '#fff1f2', border: '#fecdd3', color: '#be123c' };
}

function renderStatsCards(parsed) {
  const s = identityStyle(parsed.identity);
  const statCard = (val, label, bg='#f8fafc', border='#e2e8f0', color='#374151') => `
    <div style="border-radius:12px;padding:12px 18px;background:${bg};border:2px solid ${border};min-width:80px;text-align:center;">
      <div style="font-size:24px;font-weight:900;color:${color};line-height:1;">${val}</div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${color};opacity:0.7;margin-top:3px;">${label}</div>
    </div>
  `;
  return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      ${statCard(parsed.identity + '%', 'Identity', s.bg, s.border, s.color)}
      ${statCard(parsed.alnLength, 'Aln. length')}
      ${statCard(parsed.gapCount, 'Gaps')}
      ${statCard(parsed.sequences.length, 'Sequences')}
    </div>
  `;
}
```

- [ ] **Step 3: Add sequence legend**

```js
function renderLegend(parsed) {
  return `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">
      ${parsed.sequences.map(s => {
        // match label (locus tag) back to entry to get strain color
        const entry = alignState.entries.find(e => e.gene.locus_tag === s.label);
        const color = entry ? strainColor(entry.gene.strain_id) : '#64748b';
        const strainId = entry?.gene.strain_id ?? '';
        return `
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151;">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>
            <span style="font-weight:600;">${s.label}</span>
            ${strainId ? `<span style="color:#94a3b8;">${strainId}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}
```

- [ ] **Step 4: Add alignment panel with differences-only / full-color toggle**

```js
// ── DNA base colors ──────────────────────────────────────────
const DNA_COLORS = { A: '#16a34a', T: '#dc2626', G: '#d97706', C: '#2563eb' };

// ClustalX amino acid colors by residue type
const AA_COLORS = {
  G:'#f97316',P:'#f97316',
  A:'#64748b',V:'#64748b',L:'#64748b',I:'#64748b',M:'#64748b',
  F:'#8b5cf6',Y:'#8b5cf6',W:'#8b5cf6',
  K:'#ef4444',R:'#ef4444',H:'#ef4444',
  D:'#f59e0b',E:'#f59e0b',
  S:'#22c55e',T:'#22c55e',N:'#22c55e',Q:'#22c55e',
  C:'#eab308',
};

function colorBase(ch, seqType) {
  const c = seqType === 'dna' ? DNA_COLORS[ch.toUpperCase()] : AA_COLORS[ch.toUpperCase()];
  return c ?? '#64748b';
}

function renderAlignmentPanel(parsed, diffOnly) {
  const BLOCK = 60;
  const seqType = alignState.results.seqType;
  let html = '';

  for (let start = 0; start < parsed.alnLength; start += BLOCK) {
    const end = Math.min(start + BLOCK, parsed.alnLength);
    html += `<div style="margin-bottom:14px;">`;
    html += `<div style="font-size:9px;color:#94a3b8;margin-bottom:4px;">${start + 1} – ${end}</div>`;

    // Compute which columns are variable (not all same and no gap)
    const variableCols = new Set();
    for (let i = start; i < end; i++) {
      const col = parsed.sequences.map(s => s.seq[i]);
      if (!col.every(c => c === col[0])) variableCols.add(i);
    }

    for (const { label, seq } of parsed.sequences) {
      const entry = alignState.entries.find(e => e.gene.locus_tag === label);
      const color = entry ? strainColor(entry.gene.strain_id) : '#64748b';
      const block = seq.slice(start, end);

      let seqHtml = '';
      for (let i = 0; i < block.length; i++) {
        const ch = block[i];
        const colIdx = start + i;
        const isVar = variableCols.has(colIdx);
        const isGap = ch === '-';

        if (diffOnly) {
          if (isVar && !isGap) {
            seqHtml += `<span style="background:#fef3c7;color:${colorBase(ch, seqType)};font-weight:800;padding:0 1px;">${ch}</span>`;
          } else if (isVar && isGap) {
            seqHtml += `<span style="color:#cbd5e1;">-</span>`;
          } else {
            seqHtml += `<span style="color:#d1d5db;">·</span>`;
          }
        } else {
          if (isGap) {
            seqHtml += `<span style="color:#cbd5e1;">-</span>`;
          } else {
            seqHtml += `<span style="color:${colorBase(ch, seqType)};font-weight:700;">${ch}</span>`;
          }
        }
      }

      html += `
        <div style="display:flex;align-items:center;gap:10px;line-height:1.6;">
          <span style="width:100px;flex-shrink:0;font-size:10px;color:${color};font-weight:600;
                       text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                       font-family:'DM Mono',monospace;">${label}</span>
          <span style="font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.04em;">${seqHtml}</span>
        </div>
      `;
    }

    // Conservation bar
    let consHtml = '<div style="display:flex;gap:1px;height:5px;align-items:flex-end;margin-left:110px;margin-top:2px;">';
    for (let i = start; i < end; i++) {
      const col = parsed.sequences.map(s => s.seq[i]).filter(c => c !== '-');
      const allSame = col.length > 0 && col.every(c => c === col[0]);
      const anyMatch = col.length > 0 && col.filter(c => c === col[0]).length > 1;
      const h = allSame ? 5 : anyMatch ? 3 : 1;
      const bg = allSame ? '#0f4530' : anyMatch ? '#86efac' : '#e2e8f0';
      consHtml += `<div style="width:7.6px;height:${h}px;background:${bg};border-radius:1px;"></div>`;
    }
    consHtml += '</div>';
    if (!diffOnly) html += consHtml;

    html += '</div>';
  }

  return html;
}

// ── Full result section ───────────────────────────────────────
function renderAlignmentResults(results) {
  const parsed = parseClustalAlignment(results.clustalText);
  const diffOnly = alignState.diffOnly !== false; // default true

  window._alnToggleView = () => {
    alignState.diffOnly = !diffOnly;
    render();
  };
  window._alnExport = (format) => exportAlignment(results, format);

  return `
    ${renderStatsCards(parsed)}
    ${renderLegend(parsed)}

    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button onclick="window._alnToggleView()"
        style="font-size:11px;color:#64748b;background:white;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;">
        ${diffOnly ? 'Show full color view' : 'Show differences only'}
      </button>
    </div>

    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:16px;
                overflow-x:auto;">
      ${renderAlignmentPanel(parsed, diffOnly)}
      ${diffOnly ? '<div style="font-size:9px;color:#94a3b8;margin-top:6px;text-align:right;">amber = diverges from consensus · · = identical</div>' : ''}
    </div>

    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button onclick="window._alnExport('fasta')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">⬇ FASTA</button>
      <button onclick="window._alnExport('clustal')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">⬇ Clustal</button>
      <button onclick="window._alnExport('phylip')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">⬇ Phylip</button>
      <button onclick="window._alnExport('clipboard')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">📋 Copy</button>
    </div>
  `;
}
```

- [ ] **Step 5: Verify result display**

Run an alignment with 2–3 genes. Should see:
- Colored identity card (green at ≥90%, amber 70–89%, red <70%)
- Legend with colored strain dots
- Differences-only view (dots for identical positions, amber highlights for variable)
- Toggle button switches to full-color view with conservation bars

- [ ] **Step 6: Commit**

```bash
git add web/js/views/alignment.js
git commit -m "feat: alignment result display with stats cards and differences-only panel"
```

---

## Task 6: Export functions

**Files:**
- Modify: `web/js/views/alignment.js`

- [ ] **Step 1: Add export function**

```js
// ── Export ───────────────────────────────────────────────────
async function exportAlignment(results, format) {
  if (format === 'clipboard') {
    await navigator.clipboard.writeText(results.fastaText);
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Copy'));
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = orig; }, 1800);
    }
    return;
  }

  let content, filename, mime;

  if (format === 'fasta') {
    content = results.fastaText;
    filename = 'alignment.fasta';
    mime = 'text/plain';
  } else if (format === 'clustal') {
    content = results.clustalText;
    filename = 'alignment.aln';
    mime = 'text/plain';
  } else if (format === 'phylip') {
    try {
      content = await fetchEBIResult(results.jobId, 'phylip');
    } catch {
      content = '# Phylip result unavailable — EBI job may have expired.';
    }
    filename = 'alignment.phy';
    mime = 'text/plain';
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

- [ ] **Step 2: Verify all export formats**

After running an alignment:
- Click ⬇ FASTA — browser downloads `alignment.fasta`, open it and confirm it's valid FASTA with aligned sequences
- Click ⬇ Clustal — downloads `alignment.aln` with Clustal format
- Click ⬇ Phylip — downloads `alignment.phy` (note: EBI job results expire after ~24h)
- Click 📋 Copy — button briefly shows "✓ Copied", paste into a text editor to confirm FASTA is on clipboard

- [ ] **Step 3: Commit**

```bash
git add web/js/views/alignment.js
git commit -m "feat: alignment export — FASTA, Clustal, Phylip, clipboard"
```

---

## Task 7: "Align orthologs" entry point from gene detail

**Files:**
- Modify: `web/js/app.js`
- Modify: `web/js/views/genomes.js`

- [ ] **Step 1: Add activation helper to app.js**

In `web/js/app.js`, export a function to activate the alignment tab with a seed gene. Add after the `activateTab` function:

```js
// Activate alignment tab pre-seeded with a gene id
export function openAlignmentWith(geneId) {
  state.alignmentSeedGeneId = geneId;
  activateTab('alignment');
}
```

- [ ] **Step 2: Consume the seed in alignment.js**

At the top of `renderAlignment`, after setting `_container`, check for a seed:

```js
export function renderAlignment(container) {
  _container = container;
  alignState = { seqType: 'dna', entries: [], results: null, running: false, diffOnly: true };

  // Pre-seed from gene detail "Align orthologs" button
  const { state } = await import('../client.js?v=80').catch(() => ({ state: {} }));
  // Use a simpler synchronous approach via a module-level import:
}
```

Actually, use a module-level import. Update the top of alignment.js imports:

```js
import { sb, state } from '../client.js?v=80';
```

Then in `renderAlignment`:

```js
export function renderAlignment(container) {
  _container = container;
  alignState = { seqType: 'dna', entries: [], results: null, running: false, diffOnly: true };
  render();

  // Pre-seed if navigated from a gene detail page
  if (state.alignmentSeedGeneId) {
    const seedId = state.alignmentSeedGeneId;
    state.alignmentSeedGeneId = null;
    sb.from('genes')
      .select('id,locus_tag,gene_name,gene_symbol,strain_id')
      .eq('id', seedId)
      .single()
      .then(({ data }) => { if (data) addGeneWithOrthologs(data); });
  }
}
```

- [ ] **Step 3: Add the button in genomes.js**

In `web/js/views/genomes.js`, find the gene detail panel function (around line 919 where `seqCopyBtn` is used and `sectionHead('Gene Info'...)` appears). Add an "Align orthologs" button in the Gene Info section header area.

Search for the line that renders the Gene Info section head. It looks like:

```js
${sectionHead('Gene Info', seqCopyBtn('Copy DNA', gene.dna_sequence))}
```

Add an align button alongside the copy button. First, add a helper near `seqCopyBtn`:

```js
function alignOrthologsBtn(geneId) {
  return `<button onclick="(async()=>{const {openAlignmentWith}=await import('./app.js?v=80');openAlignmentWith(${geneId});})()"
    style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;
           color:#0f4530;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;
           padding:3px 8px;cursor:pointer;">
    ⇔ Align orthologs
  </button>`;
}
```

Then update the Gene Info section head to include it:

```js
${sectionHead('Gene Info', `
  <div style="display:flex;gap:6px;align-items:center;">
    ${seqCopyBtn('Copy DNA', gene.dna_sequence)}
    ${alignOrthologsBtn(gene.id)}
  </div>
`)}
```

- [ ] **Step 4: Verify end-to-end navigation**

Navigate to any gene detail page → click "⇔ Align orthologs" → Tools tab activates → gene appears as "your pick" → orthologs auto-populate as "suggested".

- [ ] **Step 5: Commit**

```bash
git add web/js/app.js web/js/views/alignment.js web/js/views/genomes.js
git commit -m "feat: align orthologs shortcut from gene detail panel"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Standalone page at alignment tab — Task 1
- ✅ DNA / AA toggle — Task 2
- ✅ Typeahead search across all strains — Task 2
- ✅ Confirmed / suggested entry states with ✓ and ✕ — Task 2 & 3
- ✅ Ortholog auto-fill on gene selection — Task 3
- ✅ "+ Add another gene" for arbitrary sequences — Task 2 (Add another button)
- ✅ EBI Clustal Omega API — Task 4
- ✅ Spinner with status messages — Task 4
- ✅ Error handling with retry — Task 4
- ✅ Identity % card with conditional color — Task 5
- ✅ Alignment length / gap / sequence count cards — Task 5
- ✅ Sequence legend with strain colors — Task 5
- ✅ Differences-only view (default) — Task 5
- ✅ Full color view toggle — Task 5
- ✅ Conservation histogram — Task 5
- ✅ FASTA / Clustal / Phylip / clipboard export — Task 6
- ✅ "Align orthologs" entry point from gene detail — Task 7
- ✅ Publicly accessible (no auth guard) — alignment tab has no role check in activateTab

**Placeholder scan:** No TBDs or incomplete steps found.

**Type consistency:** `addGeneWithOrthologs`, `reRenderEntries`, `runAlignment`, `fetchEBIResult` all defined before use. `alignState.diffOnly` initialized in `renderAlignment` and read in `renderAlignmentResults`. `state.alignmentSeedGeneId` set by `openAlignmentWith` and cleared in `renderAlignment`.
