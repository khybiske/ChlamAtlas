# Structure Alignment Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Structure Alignment tool page that lets users load 2–3 AlphaFold or crystal structures into a shared Mol* 3D viewer for visual comparison, with a prominent hint guiding manual superposition.

**Architecture:** A new SPA tab (`structure-alignment`) following the exact same module pattern as `web/js/views/alignment.js` — a single exported `renderStructureAlignment(container)` function, module-level state, `window._strAln*` globals for inline onclick handlers. The page has two phases: a **building phase** (picker visible) and a **loaded phase** (viewer visible, picker collapsed to chip strip). Mol* is loaded lazily from the CDN on first use, reusing the same singleton pattern as `genomes.js`.

**Tech Stack:** Vanilla JS ES modules, Supabase JS client, Mol* CDN bundle (`molstar@3.45.0`), Tailwind-free inline styles matching existing conventions, AlphaFold DB REST API (AF2 URL resolution), RCSB PDB (crystal structures).

**Dev server:** Run `vercel dev` from the project root. Visit `http://localhost:3000`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `web/js/views/structure-alignment.js` | **Create** | All view logic — state, render, picker, suggestion panel, viewer |
| `web/js/app.js` | **Modify** | Import new view, add tab to TABS/RENDERERS, enable Tools button, handle seed state |
| `web/index.html` | **Modify** | Add `<div id="tab-structure-alignment" class="hidden">` |

---

## Task 1: Tab infrastructure

Wire the new tab into the app shell so navigation works before any view logic exists.

**Files:**
- Modify: `web/index.html`
- Modify: `web/js/app.js`

- [ ] **Step 1.1 — Add the tab div to index.html**

Open `web/index.html`. Find the block of `<div id="tab-*" class="hidden">` divs (there is one for each tab: home, genomes, mutants, pipeline, roadmap, alignment). Add a new one immediately after the `tab-alignment` div:

```html
<div id="tab-structure-alignment" class="hidden"></div>
```

- [ ] **Step 1.2 — Import the new view in app.js**

Open `web/js/app.js`. Find the existing alignment import at the top:

```js
import { renderAlignment } from './views/alignment.js?v=96';
```

Add immediately after it:

```js
import { renderStructureAlignment } from './views/structure-alignment.js?v=1';
```

- [ ] **Step 1.3 — Add to TABS and RENDERERS**

In `app.js`, find:

```js
const TABS = ['home', 'genomes', 'mutants', 'pipeline', 'roadmap', 'alignment'];
```

Change to:

```js
const TABS = ['home', 'genomes', 'mutants', 'pipeline', 'roadmap', 'alignment', 'structure-alignment'];
```

Find the `RENDERERS` object and add:

```js
'structure-alignment': renderStructureAlignment,
```

- [ ] **Step 1.4 — Enable the Structure Alignment button in the Tools popover**

In `app.js`, find `showToolsPopover`. It currently renders a disabled Structure Alignment button:

```js
<button class="nav-popover-row" disabled style="opacity:0.4;cursor:not-allowed;">
  <span class="nav-popover-row-icon">🔬</span>
  <span class="nav-popover-row-name">Structure Alignment</span>
  <span class="nav-popover-row-count">soon</span>
</button>
```

Replace with an active button (add an `id` so we can wire the click handler):

```js
<button class="nav-popover-row" id="tools-pop-struct">
  <span class="nav-popover-row-icon">🔬</span>
  <span class="nav-popover-row-name">Structure Alignment</span>
</button>
```

Then in the block that wires `#tools-pop-seq`, add:

```js
pop?.querySelector('#tools-pop-struct')?.addEventListener('click', () => {
  pop.remove();
  activateTab('structure-alignment');
});
```

- [ ] **Step 1.5 — Handle the active state for the tools button**

In `app.js`, find the line that marks the tools button active:

```js
if (toolsBtn) toolsBtn.classList.toggle('active', name === 'alignment');
```

Change to:

```js
if (toolsBtn) toolsBtn.classList.toggle('active', name === 'alignment' || name === 'structure-alignment');
```

- [ ] **Step 1.6 — Verify tab wiring works**

Run `vercel dev`. Open the app. Click Tools → Structure Alignment. The tab should activate (blank white content). No console errors. The Tools button should be highlighted when on the structure-alignment tab.

- [ ] **Step 1.7 — Commit**

```bash
git add web/index.html web/js/app.js
git commit -m "feat: wire structure-alignment tab in app shell"
```

---

## Task 2: View scaffold + building-phase skeleton

Create the view file and render the building-phase UI: title, subtitle, empty entry list, disabled load button.

**Files:**
- Create: `web/js/views/structure-alignment.js`

- [ ] **Step 2.1 — Create the view file with state and exported entry point**

Create `web/js/views/structure-alignment.js`:

```js
// ChlamAtlas — Structure Alignment tool
import { sb, state } from '../client.js?v=80';

// ── Constants ─────────────────────────────────────────────────
const STRAIN_COLORS = { 'CT-L2': '#16a34a', 'CT-D': '#4b2e83', 'CM': '#2563eb' };
const MAX_STRUCTURES = 3;

// ── Module state ──────────────────────────────────────────────
let strState = {
  entries: [],        // { id, gene, modelType, urlData, status, isPrimary }
  loaded: false,      // true = viewer phase; false = picker phase
  bgDark: true,
  hintDismissed: false,
  viewer: null,
};
let _container = null;
let _strainMap = new Map();           // uuid → { name, color }
let _clickOutsideController = null;

// ── Strain lookup ─────────────────────────────────────────────
async function loadStrains() {
  if (_strainMap.size) return;
  const { data } = await sb.from('strains').select('id,common_name');
  for (const s of data || []) {
    _strainMap.set(s.id, {
      name:  s.common_name,
      color: STRAIN_COLORS[s.common_name] ?? '#64748b',
    });
  }
}

function strainColor(strainId) {
  return _strainMap.get(strainId)?.color ?? '#64748b';
}
function strainName(strainId) {
  return _strainMap.get(strainId)?.name ?? '';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Entry point ───────────────────────────────────────────────
export function renderStructureAlignment(container) {
  _container = container;
  strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
  loadStrains().then(() => render()).catch(() => render());
}

// ── Top-level render ──────────────────────────────────────────
function render() {
  _container.innerHTML = strState.loaded ? renderLoadedPhase() : renderBuildingPhase();
  wireEvents();
}
```

- [ ] **Step 2.2 — Add renderBuildingPhase**

Append to the file:

```js
// ── Building phase ────────────────────────────────────────────
function renderBuildingPhase() {
  const canLoad = strState.entries.filter(e => e.status === 'confirmed').length >= 2;
  return `
    <div style="max-width:800px;margin:0 auto;padding:32px 24px 64px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:700;color:#0f4530;margin:0;">
          Structure Alignment
        </h1>
        ${strState.entries.length > 0 ? `
        <button onclick="window._strAlnReset()"
          style="flex-shrink:0;margin-top:6px;display:inline-flex;align-items:center;gap:5px;
                 font-size:11px;font-weight:600;color:#64748b;background:white;
                 border:1.5px solid #e2e8f0;border-radius:7px;padding:5px 12px;cursor:pointer;
                 font-family:'DM Sans',sans-serif;"
          onmouseover="this.style.borderColor='#cbd5e1'"
          onmouseout="this.style.borderColor='#e2e8f0'">
          ↺ Start over
        </button>` : ''}
      </div>
      <p style="color:#64748b;font-size:13px;margin-bottom:28px;">
        Load 2–3 AlphaFold or crystal structures into an interactive 3D viewer. Right-click any chain to superpose.
      </p>

      ${renderPickerSection()}

      <div style="margin-top:20px;">
        <button id="str-load-btn" ${canLoad ? '' : 'disabled'}
          onclick="window._strAlnLoad()"
          style="display:inline-flex;align-items:center;gap:7px;border:none;border-radius:10px;
                 padding:11px 22px;font-size:14px;font-weight:700;cursor:${canLoad ? 'pointer' : 'not-allowed'};
                 font-family:'DM Sans',sans-serif;
                 background:${canLoad ? '#0f4530' : '#e2e8f0'};color:${canLoad ? 'white' : '#94a3b8'};">
          ▶ Load structures
        </button>
        ${strState.entries.filter(e => e.status === 'confirmed').length < 2
          ? `<div style="font-size:11px;color:#94a3b8;margin-top:6px;">Add at least 2 structures to load</div>`
          : ''}
      </div>
    </div>
  `;
}

function renderPickerSection() {
  return `
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
                  color:#94a3b8;margin-bottom:10px;">Structures to compare</div>

      <div style="position:relative;margin-bottom:14px;">
        <input id="str-search" type="text" placeholder="Search by locus tag or gene name…"
          autocomplete="off"
          style="width:100%;max-width:480px;border:1.5px solid #cbd5e1;border-radius:8px;
                 padding:10px 12px;font-size:13px;color:#1e293b;outline:none;
                 font-family:'DM Sans',sans-serif;"/>
        <div id="str-search-results"
          style="display:none;position:absolute;top:100%;left:0;width:100%;max-width:480px;
                 background:white;border:1.5px solid #0f4530;border-top:none;
                 border-radius:0 0 8px 8px;z-index:50;max-height:220px;overflow-y:auto;"></div>
      </div>

      <div id="str-entry-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        ${strState.entries.length === 0
          ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">
               Search above to add the first structure…
             </div>`
          : strState.entries.map(renderEntryCard).join('')}
      </div>
    </div>
  `;
}
```

- [ ] **Step 2.3 — Add renderLoadedPhase placeholder and wireEvents stub**

Append to the file:

```js
// ── Loaded phase ──────────────────────────────────────────────
function renderLoadedPhase() {
  return `<div style="max-width:900px;margin:0 auto;padding:20px 16px 64px;">
    <div style="font-size:13px;color:#94a3b8;padding:32px 0;text-align:center;">Loading viewer…</div>
  </div>`;
}

// ── Wire events ───────────────────────────────────────────────
function wireEvents() {
  window._strAlnReset = () => {
    strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
    render();
  };
  window._strAlnLoad = () => {
    strState.loaded = true;
    render();
  };
}

// ── Entry card ────────────────────────────────────────────────
function renderEntryCard(entry) {
  const g = entry.gene;
  const label = [g.locus_tag, g.gene_name].filter(Boolean).join(' · ');
  const sc = strainColor(g.strain_id);
  const sn = strainName(g.strain_id);
  const modelLabel = { af2: 'AF2', af3: 'AF3', crystal: 'Crystal' }[entry.modelType] ?? entry.modelType;
  const modelColors = {
    af2:     { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    af3:     { bg: '#fdf4ff', color: '#7c3aed', border: '#e9d5ff' },
    crystal: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  };
  const mc = modelColors[entry.modelType] ?? { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  const isPrimary = entry.isPrimary;

  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
                border:1.5px solid #86efac;background:#f0fdf4;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:#0f4530;">${esc(label)}</div>
        <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px;margin-top:2px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${sc};display:inline-block;"></span>
          <span>${esc(sn)}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;
                       background:${mc.bg};color:${mc.color};border:1.5px solid ${mc.border};">
            ${modelLabel}
          </span>
          ${isPrimary ? `<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:99px;font-weight:700;">your pick</span>` : ''}
        </div>
      </div>
      ${!isPrimary ? `
        <button onclick="window._strAlnRemove('${esc(entry.id)}')"
          title="Remove"
          style="width:28px;height:28px;border-radius:50%;border:1.5px solid #fca5a5;background:white;
                 font-size:13px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;
                 flex-shrink:0;">✕</button>
      ` : ''}
    </div>
  `;
}
```

- [ ] **Step 2.4 — Verify scaffold renders**

Run `vercel dev`. Navigate to Tools → Structure Alignment. You should see:
- Title "Structure Alignment"
- Subtitle text
- "Search by locus tag…" input
- "Add at least 2 structures to load" hint
- Greyed "Load structures" button

No console errors.

- [ ] **Step 2.5 — Commit**

```bash
git add web/js/views/structure-alignment.js
git commit -m "feat: scaffold structure alignment view with building-phase shell"
```

---

## Task 3: Gene search + entry management

Wire the typeahead search so users can find genes and add them to the entry list. Picking a gene adds a confirmed "your pick" entry and activates the suggestion panel (rendered as a placeholder in this task, filled in Task 4).

**Files:**
- Modify: `web/js/views/structure-alignment.js`

- [ ] **Step 3.1 — Add searchGenes function**

Append to the file:

```js
// ── Gene search ───────────────────────────────────────────────
async function searchGenes(q) {
  const resultsEl = document.getElementById('str-search-results');
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
    const sn = strainName(g.strain_id);
    const gStr = esc(JSON.stringify(JSON.stringify(g)));
    return `
      <div data-gene-id="${g.id}"
           style="padding:9px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;
                  display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
           onmouseover="this.style.background='#f8fafc'"
           onmouseout="this.style.background='white'"
           onclick="window._strAlnPickGene(${gStr})">
        <div>
          <span style="font-weight:700;color:#0f4530;">${esc(g.locus_tag)}</span>
          ${g.gene_name ? `<span style="color:#64748b;margin-left:5px;">${esc(g.gene_name)}</span>` : ''}
        </div>
        <span style="font-size:9px;font-weight:700;background:#f1f5f9;color:${sc};
                     padding:2px 7px;border-radius:4px;">${esc(sn)}</span>
      </div>
    `;
  }).join('');

  window._strAlnPickGene = (gStr) => {
    const g = JSON.parse(gStr);
    document.getElementById('str-search').value = '';
    document.getElementById('str-search-results').style.display = 'none';
    addPrimaryGene(g);
  };
}
```

- [ ] **Step 3.2 — Add addPrimaryGene**

Append to the file:

```js
// ── Adding genes ──────────────────────────────────────────────
async function addPrimaryGene(gene) {
  // Only one primary pick allowed; if one already exists this is a manual add
  const hasPrimary = strState.entries.some(e => e.isPrimary);

  if (strState.entries.find(e => e.gene.id === gene.id)) return; // no duplicates

  const entry = {
    id: `entry-${Date.now()}-${gene.id}`,
    gene,
    modelType: 'af2',    // default; updated by quick-add buttons
    urlData: null,       // { uniprotId } | { mmcifPath } | { pdbId } — filled at load time
    status: 'confirmed',
    isPrimary: !hasPrimary,
  };
  strState.entries.push(entry);

  reRenderEntries();

  // Fetch suggestion data for the primary pick only
  if (!hasPrimary) {
    await fetchAndRenderSuggestions(gene);
  }
}

function addManualEntry(gene, modelType, urlData) {
  // Called from suggestion panel quick-add buttons
  const existingKey = `${gene.id}-${modelType}`;
  if (strState.entries.find(e => `${e.gene.id}-${e.modelType}` === existingKey)) return;
  if (strState.entries.length >= MAX_STRUCTURES) return;

  strState.entries.push({
    id: `entry-${Date.now()}-${gene.id}-${modelType}`,
    gene,
    modelType,
    urlData,
    status: 'confirmed',
    isPrimary: false,
  });
  reRenderEntries();
  updateLoadBtn();
}

window._strAlnRemove = (id) => {
  strState.entries = strState.entries.filter(e => e.id !== id);
  reRenderEntries();
  updateLoadBtn();
};
```

- [ ] **Step 3.3 — Add reRenderEntries and updateLoadBtn**

Append to the file:

```js
function reRenderEntries() {
  const list = document.getElementById('str-entry-list');
  if (!list) return;
  list.innerHTML = strState.entries.length === 0
    ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">Search above to add the first structure…</div>`
    : strState.entries.map(renderEntryCard).join('');
  updateLoadBtn();
}

function updateLoadBtn() {
  const btn = document.getElementById('str-load-btn');
  if (!btn) return;
  const canLoad = strState.entries.filter(e => e.status === 'confirmed').length >= 2;
  btn.disabled = !canLoad;
  btn.style.background = canLoad ? '#0f4530' : '#e2e8f0';
  btn.style.color = canLoad ? 'white' : '#94a3b8';
  btn.style.cursor = canLoad ? 'pointer' : 'not-allowed';
}
```

- [ ] **Step 3.4 — Add fetchAndRenderSuggestions placeholder**

Append to the file (full implementation in Task 4):

```js
// ── Suggestion panel ──────────────────────────────────────────
async function fetchAndRenderSuggestions(primaryGene) {
  // Placeholder — full implementation in Task 4
  const panel = document.getElementById('str-suggestion-panel');
  if (panel) panel.innerHTML = `<div style="font-size:12px;color:#94a3b8;padding:8px;">Loading suggestions…</div>`;
}
```

- [ ] **Step 3.5 — Add suggestion panel placeholder to renderPickerSection**

In `renderPickerSection()`, after the `str-entry-list` div, add:

```js
      <div id="str-suggestion-panel" style="margin-bottom:14px;"></div>
```

The updated function body should look like:

```js
function renderPickerSection() {
  return `
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
                  color:#94a3b8;margin-bottom:10px;">Structures to compare</div>

      <div style="position:relative;margin-bottom:14px;">
        <input id="str-search" type="text" placeholder="Search by locus tag or gene name…"
          autocomplete="off"
          style="width:100%;max-width:480px;border:1.5px solid #cbd5e1;border-radius:8px;
                 padding:10px 12px;font-size:13px;color:#1e293b;outline:none;
                 font-family:'DM Sans',sans-serif;"/>
        <div id="str-search-results"
          style="display:none;position:absolute;top:100%;left:0;width:100%;max-width:480px;
                 background:white;border:1.5px solid #0f4530;border-top:none;
                 border-radius:0 0 8px 8px;z-index:50;max-height:220px;overflow-y:auto;"></div>
      </div>

      <div id="str-entry-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
        ${strState.entries.length === 0
          ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">
               Search above to add the first structure…
             </div>`
          : strState.entries.map(renderEntryCard).join('')}
      </div>

      <div id="str-suggestion-panel" style="margin-bottom:14px;"></div>
    </div>
  `;
}
```

- [ ] **Step 3.6 — Wire search events in wireEvents()**

Replace the `wireEvents` stub with:

```js
function wireEvents() {
  window._strAlnReset = () => {
    strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
    render();
  };
  window._strAlnLoad = () => {
    strState.loaded = true;
    render();
    initViewer();
  };

  // Typeahead
  const input = document.getElementById('str-search');
  const results = document.getElementById('str-search-results');
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

  if (_clickOutsideController) _clickOutsideController.abort();
  _clickOutsideController = new AbortController();
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results?.contains(e.target)) {
      results.style.display = 'none';
    }
  }, { capture: true, signal: _clickOutsideController.signal });
}
```

- [ ] **Step 3.7 — Verify search works**

Run `vercel dev`. Navigate to Structure Alignment. Type "nqr" in the search box. A dropdown should appear with matching genes. Click one — it should appear as a green entry card with "your pick" badge. Removing it (✕) should work. Searching again and picking a second gene should add it as a second entry. The Load button should become green at 2 entries. No console errors.

- [ ] **Step 3.8 — Commit**

```bash
git add web/js/views/structure-alignment.js
git commit -m "feat: gene search and entry management for structure alignment"
```

---

## Task 4: Suggestion panel

After picking the primary gene, fetch availability data (AF2/AF3/crystal) for that gene and its orthologs, then render the contextual suggestion panel with quick-add buttons.

**Files:**
- Modify: `web/js/views/structure-alignment.js`

- [ ] **Step 4.1 — Replace fetchAndRenderSuggestions with the real implementation**

Replace the placeholder `fetchAndRenderSuggestions` function with:

```js
async function fetchAndRenderSuggestions(primaryGene) {
  const panel = document.getElementById('str-suggestion-panel');
  if (!panel) return;
  panel.innerHTML = `<div style="font-size:12px;color:#94a3b8;padding:8px 0;">Loading suggestions…</div>`;

  // 1. Fetch availability for primary gene
  const primaryAvail = await fetchGeneAvailability(primaryGene.id);

  // 2. Fetch orthologs
  const { data: orthoRows } = await sb
    .from('orthologs')
    .select('gene_id_a,gene_id_b')
    .or(`gene_id_a.eq.${primaryGene.id},gene_id_b.eq.${primaryGene.id}`);

  const orthologGeneIds = (orthoRows || [])
    .map(r => r.gene_id_a === primaryGene.id ? r.gene_id_b : r.gene_id_a)
    .filter(id => id !== primaryGene.id);

  // 3. Fetch ortholog gene info + availability
  let orthologData = [];
  if (orthologGeneIds.length) {
    const { data: orthoGenes } = await sb
      .from('genes')
      .select('id,locus_tag,gene_name,strain_id')
      .in('id', orthologGeneIds);

    orthologData = await Promise.all(
      (orthoGenes || []).map(async (og) => ({
        gene: og,
        avail: await fetchGeneAvailability(og.id),
      }))
    );
  }

  if (!panel.isConnected) return; // user navigated away
  panel.innerHTML = renderSuggestionPanel(primaryGene, primaryAvail, orthologData);
  wireSuggestionButtons(primaryGene, primaryAvail, orthologData);
}
```

- [ ] **Step 4.2 — Add fetchGeneAvailability**

Append to the file:

```js
async function fetchGeneAvailability(geneId) {
  const { data } = await sb
    .from('genes')
    .select('id,proteins(uniprot_id,alphafold_results(af_version,mmcif_path,top_homolog_pdb_id))')
    .eq('id', geneId)
    .single();

  const protein = data?.proteins;
  const afRows  = protein?.alphafold_results ?? [];

  const af3Row     = afRows.find(r => r.af_version === 'AF3');
  const crystalRow = afRows.find(r => r.af_version === 'crystal');

  return {
    af2:     protein?.uniprot_id
               ? { uniprotId: protein.uniprot_id }
               : null,
    af3:     af3Row?.mmcif_path
               ? { mmcifPath: af3Row.mmcif_path }
               : null,
    crystal: crystalRow?.top_homolog_pdb_id
               ? { pdbId: crystalRow.top_homolog_pdb_id }
               : null,
  };
}
```

- [ ] **Step 4.3 — Add renderSuggestionPanel**

Append to the file:

```js
function renderSuggestionPanel(primaryGene, primaryAvail, orthologData) {
  // Check which model types the primary gene already has in the entry list
  const alreadyAdded = (geneId, modelType) =>
    strState.entries.some(e => e.gene.id === geneId && e.modelType === modelType);

  const atMax = strState.entries.length >= MAX_STRUCTURES;

  function modelBtn(geneId, modelType, avail, key) {
    const labels   = { af2: 'AF2', af3: 'AF3', crystal: 'Crystal' };
    const colors   = {
      af2:     { color: '#1d4ed8', border: '#bfdbfe', hoverBg: '#eff6ff' },
      af3:     { color: '#7c3aed', border: '#e9d5ff', hoverBg: '#fdf4ff' },
      crystal: { color: '#c2410c', border: '#fed7aa', hoverBg: '#fff7ed' },
    };
    const c        = colors[modelType];
    const added    = alreadyAdded(geneId, modelType);
    const disabled = !avail || added || atMax;

    let title = '';
    if (!avail)   title = 'Not available for this protein';
    else if (added) title = 'Already in list';
    else if (atMax) title = `Maximum ${MAX_STRUCTURES} structures`;

    return `
      <button
        data-gene-id="${geneId}" data-model="${modelType}"
        ${disabled ? 'disabled' : ''}
        title="${title}"
        style="font-size:11px;font-weight:700;padding:4px 11px;border-radius:99px;border:1.5px solid;
               cursor:${disabled ? 'not-allowed' : 'pointer'};background:white;
               font-family:'DM Sans',sans-serif;
               color:${disabled ? '#d1d5db' : c.color};
               border-color:${disabled ? '#e5e7eb' : c.border};
               opacity:${disabled ? '0.5' : '1'};">
        ${added ? `${labels[modelType]} ✓` : `+ ${labels[modelType]}`}
      </button>
    `;
  }

  // Same-gene row
  const sameGeneRow = `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#374151;">
          ${esc(primaryGene.locus_tag)}${primaryGene.gene_name ? ` · ${esc(primaryGene.gene_name)}` : ''}
        </div>
        <div style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;margin-top:1px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${strainColor(primaryGene.strain_id)};display:inline-block;"></span>
          ${esc(strainName(primaryGene.strain_id))}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${modelBtn(primaryGene.id, 'af2', primaryAvail.af2, 'primary-af2')}
        ${modelBtn(primaryGene.id, 'af3', primaryAvail.af3, 'primary-af3')}
        ${modelBtn(primaryGene.id, 'crystal', primaryAvail.crystal, 'primary-crystal')}
      </div>
    </div>
  `;

  // Ortholog rows
  const divider = orthologData.length ? `
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
                color:#cbd5e1;text-align:center;margin:8px 0 6px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
      or pick an ortholog
      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
    </div>
  ` : '';

  const orthologRows = orthologData.map(({ gene, avail }) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#374151;">
          ${esc(gene.locus_tag)}${gene.gene_name ? ` · ${esc(gene.gene_name)}` : ''}
        </div>
        <div style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;margin-top:1px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${strainColor(gene.strain_id)};display:inline-block;"></span>
          ${esc(strainName(gene.strain_id))}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${modelBtn(gene.id, 'af2', avail.af2, `${gene.id}-af2`)}
        ${modelBtn(gene.id, 'af3', avail.af3, `${gene.id}-af3`)}
        ${modelBtn(gene.id, 'crystal', avail.crystal, `${gene.id}-crystal`)}
      </div>
    </div>
  `).join('');

  return `
    <div style="max-width:680px;background:white;border:1.5px solid #e2e8f0;border-radius:12px;
                padding:14px 16px;margin-top:14px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
                  color:#94a3b8;margin-bottom:10px;">Quick add</div>
      ${sameGeneRow}
      ${divider}
      ${orthologRows}
    </div>
  `;
}
```

- [ ] **Step 4.4 — Add wireSuggestionButtons**

Append to the file:

```js
function wireSuggestionButtons(primaryGene, primaryAvail, orthologData) {
  const panel = document.getElementById('str-suggestion-panel');
  if (!panel) return;

  // Build a lookup: geneId → { gene, avail }
  const geneMap = new Map();
  geneMap.set(primaryGene.id, { gene: primaryGene, avail: primaryAvail });
  for (const { gene, avail } of orthologData) {
    geneMap.set(gene.id, { gene, avail });
  }

  panel.querySelectorAll('button[data-gene-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const geneId    = btn.dataset.geneId;
      const modelType = btn.dataset.model;
      const entry     = geneMap.get(geneId);
      if (!entry) return;

      const urlData =
        modelType === 'af2'     ? entry.avail.af2 :
        modelType === 'af3'     ? entry.avail.af3 :
        modelType === 'crystal' ? entry.avail.crystal : null;

      addManualEntry(entry.gene, modelType, urlData);

      // Re-render suggestion panel buttons to reflect new state
      panel.innerHTML = renderSuggestionPanel(primaryGene, primaryAvail, orthologData);
      wireSuggestionButtons(primaryGene, primaryAvail, orthologData);
    });
  });
}
```

- [ ] **Step 4.5 — Verify suggestion panel**

Run `vercel dev`. Navigate to Structure Alignment. Search for a gene with known orthologs (e.g. `nqrA` or `CT_L2_0001`). After picking it:
- A "Quick add" panel appears below the entry card
- Same-gene row shows AF2 ✓ (already added), plus AF3/Crystal buttons (greyed if unavailable)
- Ortholog rows appear with available model buttons
- Clicking a quick-add button adds a second entry card and marks that button as ✓
- At 3 entries, all buttons disable
- Load button becomes green

- [ ] **Step 4.6 — Commit**

```bash
git add web/js/views/structure-alignment.js
git commit -m "feat: suggestion panel with ortholog and model availability for structure alignment"
```

---

## Task 5: Mol* viewer — URL resolution and multi-structure load

Implement the loaded phase: resolve real mmCIF URLs for all selected entries, initialize Mol*, load all structures into the same viewer instance, render the chip strip and superpose hint.

**Files:**
- Modify: `web/js/views/structure-alignment.js`

- [ ] **Step 5.1 — Add Mol* bundle loader**

Append to the file:

```js
// ── Mol* bundle ───────────────────────────────────────────────
let _bundlePromise = null;

function _loadMolstarBundle() {
  if (window.molstar) return Promise.resolve();
  if (_bundlePromise) return _bundlePromise;
  _bundlePromise = new Promise((resolve, reject) => {
    const s   = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.js';
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
    const l  = document.createElement('link');
    l.rel    = 'stylesheet';
    l.href   = 'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.css';
    document.head.appendChild(l);
  });
  return _bundlePromise;
}
```

- [ ] **Step 5.2 — Add URL resolver**

Append to the file:

```js
// ── URL resolution ────────────────────────────────────────────
async function resolveUrl(entry) {
  if (entry.modelType === 'af3' && entry.urlData?.mmcifPath) {
    return entry.urlData.mmcifPath;
  }
  if (entry.modelType === 'crystal' && entry.urlData?.pdbId) {
    return `https://files.rcsb.org/download/${encodeURIComponent(entry.urlData.pdbId)}.cif`;
  }
  if (entry.modelType === 'af2' && entry.urlData?.uniprotId) {
    const res = await fetch(
      `https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(entry.urlData.uniprotId)}`
    );
    if (!res.ok) throw new Error(`AFDB API error for ${entry.urlData.uniprotId}: ${res.status}`);
    const data = await res.json();
    const cifUrl = data[0]?.cifUrl;
    if (!cifUrl) throw new Error(`No cifUrl returned for ${entry.urlData.uniprotId}`);
    return cifUrl;
  }
  throw new Error(`Cannot resolve URL for entry ${entry.id} (modelType: ${entry.modelType})`);
}
```

- [ ] **Step 5.3 — Add initViewer**

Append to the file:

```js
// ── Viewer init ───────────────────────────────────────────────
async function initViewer() {
  const container = document.getElementById('str-viewer-wrap');
  if (!container) return;

  // Show loading state
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:32px 20px;">
      <div style="width:18px;height:18px;border:2px solid #0f4530;border-top-color:transparent;
                  border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <span id="str-viewer-status" style="font-size:13px;color:#64748b;">Resolving structure URLs…</span>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;

  const confirmedEntries = strState.entries.filter(e => e.status === 'confirmed');

  try {
    // 1. Resolve all URLs
    const urls = await Promise.all(confirmedEntries.map(resolveUrl));
    setViewerStatus('Loading Mol* viewer…');

    // 2. Load Mol* bundle
    await _loadMolstarBundle();
    setViewerStatus('Initializing viewer…');

    // 3. Create viewer
    const vpId  = 'str-vp-' + Date.now();
    const vpDiv = document.createElement('div');
    vpDiv.id    = vpId;
    vpDiv.style.cssText = 'position:absolute;inset:0;';
    container.style.position = 'relative';
    container.innerHTML = '';
    container.appendChild(vpDiv);

    const v = await molstar.Viewer.create(vpId, {
      layoutIsExpanded:          false,
      layoutShowControls:        false,
      layoutShowRemoteState:     false,
      layoutShowSequence:        false,
      layoutShowLog:             false,
      layoutShowLeftPanel:       false,
      viewportShowExpand:        true,
      viewportShowSelectionMode: false,
      viewportShowAnimation:     false,
    });

    // 4. Load each structure
    for (let i = 0; i < urls.length; i++) {
      setViewerStatus(`Loading structure ${i + 1} of ${urls.length}…`);
      await v.loadStructureFromUrl(urls[i], 'mmcif');
    }

    strState.viewer = v;

    // 5. Suppress noisy toolbar buttons
    const suppress = document.createElement('style');
    suppress.textContent = `
      #${vpId} button[title="Screenshot / State Snapshot"],
      #${vpId} button[title="Toggle Controls Panel"],
      #${vpId} button[title="Settings / Controls Info"] { display:none !important; }`;
    document.head.appendChild(suppress);

  } catch (err) {
    console.error('[StructureAlignment] viewer init failed:', err);
    container.innerHTML = `
      <div style="padding:24px;color:#be123c;font-size:13px;background:#fff1f2;
                  border:1.5px solid #fecdd3;border-radius:10px;">
        ⚠ ${esc(err.message)}
        <button onclick="window._strAlnRetryLoad()"
          style="margin-left:12px;background:#0f4530;color:white;border:none;border-radius:6px;
                 padding:4px 12px;font-size:12px;cursor:pointer;">Retry</button>
      </div>`;
  }
}

function setViewerStatus(msg) {
  const el = document.getElementById('str-viewer-status');
  if (el) el.textContent = msg;
}
```

- [ ] **Step 5.4 — Replace renderLoadedPhase with full implementation**

Replace the placeholder `renderLoadedPhase()` function with:

```js
function renderLoadedPhase() {
  const confirmedEntries = strState.entries.filter(e => e.status === 'confirmed');
  const modelLabels = { af2: 'AF2', af3: 'AF3', crystal: 'Crystal' };

  // Chip strip
  const chips = confirmedEntries.map(e => {
    const sc = strainColor(e.gene.strain_id);
    const sn = strainName(e.gene.strain_id);
    const label = e.gene.locus_tag;
    const ml = modelLabels[e.modelType] ?? e.modelType;
    return `
      <div style="display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;
                  border:1.5px solid #86efac;border-radius:99px;padding:5px 12px;
                  font-size:12px;font-weight:700;color:#0f4530;white-space:nowrap;">
        <span style="width:7px;height:7px;border-radius:50%;background:${sc};display:inline-block;"></span>
        ${esc(label)} · ${esc(sn)}
        <span style="font-size:9px;background:white;border-radius:4px;padding:1px 5px;
                     color:${sc};border:1px solid ${sc}30;">${ml}</span>
      </div>
    `;
  }).join('');

  // Superpose hint
  const hint = strState.hintDismissed ? '' : `
    <div id="str-superpose-hint"
         style="display:flex;align-items:flex-start;gap:10px;background:#fffbeb;
                border:1.5px solid #fde68a;border-radius:10px;padding:10px 14px;
                font-size:12px;color:#92400e;margin-bottom:12px;">
      <span style="flex-shrink:0;">💡</span>
      <span>Right-click any chain or structure in the viewer and choose <strong>Superpose</strong> to align structures.</span>
      <button onclick="window._strAlnDismissHint()"
        style="flex-shrink:0;margin-left:auto;background:none;border:none;cursor:pointer;
               color:#b45309;font-size:14px;line-height:1;padding:0 0 0 8px;">×</button>
    </div>
  `;

  return `
    <div style="max-width:900px;margin:0 auto;padding:20px 16px 64px;">

      <!-- Chip strip -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;
                  background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;
                  padding:12px 16px;margin-bottom:14px;">
        ${chips}
        ${strState.entries.length < MAX_STRUCTURES ? `
          <button onclick="window._strAlnAddMore()"
            style="font-size:12px;color:#64748b;border:1.5px dashed #cbd5e1;border-radius:99px;
                   padding:5px 12px;background:none;cursor:pointer;font-family:'DM Sans',sans-serif;">
            ＋ Add structure
          </button>` : ''}
        <button onclick="window._strAlnReset()"
          style="margin-left:auto;font-size:11px;font-weight:600;color:#64748b;background:white;
                 border:1.5px solid #e2e8f0;border-radius:7px;padding:5px 12px;cursor:pointer;
                 font-family:'DM Sans',sans-serif;flex-shrink:0;">
          ↺ Start over
        </button>
      </div>

      ${hint}

      <!-- Viewer wrapper -->
      <div style="position:relative;border-radius:12px;overflow:hidden;
                  background:${strState.bgDark ? '#0a1628' : '#ffffff'};
                  border:1px solid #e2e8f0;" id="str-viewer-outer">

        <!-- Background toggle -->
        <button onclick="window._strAlnToggleBg()"
          title="${strState.bgDark ? 'Switch to light background' : 'Switch to dark background'}"
          style="position:absolute;top:10px;right:10px;z-index:10;
                 background:rgba(255,255,255,0.15);backdrop-filter:blur(4px);
                 border:1px solid rgba(255,255,255,0.2);border-radius:7px;
                 width:32px;height:32px;cursor:pointer;font-size:15px;
                 display:flex;align-items:center;justify-content:center;">
          ${strState.bgDark ? '☀️' : '🌙'}
        </button>

        <!-- Mol* viewport target -->
        <div id="str-viewer-wrap" style="height:480px;"></div>
      </div>

    </div>
  `;
}
```

- [ ] **Step 5.5 — Wire loaded-phase globals in wireEvents()**

Add to the `wireEvents()` function, **before the `if (!input) return` line** (these globals must be set in both phases — the search input only exists in building phase, but the viewer buttons only exist in loaded phase):

```js
  window._strAlnDismissHint = () => {
    strState.hintDismissed = true;
    document.getElementById('str-superpose-hint')?.remove();
  };
  window._strAlnAddMore = () => {
    strState.loaded = false;
    render();
  };
  window._strAlnToggleBg = () => {
    strState.bgDark = !strState.bgDark;
    const outer = document.getElementById('str-viewer-outer');
    if (outer) outer.style.background = strState.bgDark ? '#0a1628' : '#ffffff';
    // Update button icon
    const btn = outer?.querySelector('button[title]');
    if (btn) {
      btn.title = strState.bgDark ? 'Switch to light background' : 'Switch to dark background';
      btn.textContent = strState.bgDark ? '☀️' : '🌙';
    }
  };
  window._strAlnRetryLoad = () => {
    initViewer();
  };
```

- [ ] **Step 5.6 — Verify viewer loads**

Run `vercel dev`. Add two genes with AF2 model type. Click "Load structures". You should see:
- Chip strip with the two structure chips
- Amber superpose hint
- Mol* loading spinner → actual 3D viewer with both structures loaded
- Background toggle button (☀️) in top-right of viewer — clicking it switches to white background
- "× " on the hint dismisses it
- "+ Add structure" returns to picker phase with entries preserved
- "↺ Start over" resets everything

- [ ] **Step 5.7 — Commit**

```bash
git add web/js/views/structure-alignment.js
git commit -m "feat: Mol* multi-structure viewer with chip strip, superpose hint, bg toggle"
```

---

## Task 6: Seed from gene detail

When a user clicks "Align structures" from a gene detail panel, the tool should pre-populate with that gene's primary AF2 entry so they don't have to search again.

**Files:**
- Modify: `web/js/views/structure-alignment.js`
- Modify: `web/js/views/genomes.js` (add the seed trigger)

- [ ] **Step 6.1 — Handle structureAlignmentSeedGeneId on renderStructureAlignment**

In `renderStructureAlignment(container)`, after `loadStrains().then(...)`, add:

```js
  if (state.structureAlignmentSeedGeneId) {
    const seedId = state.structureAlignmentSeedGeneId;
    state.structureAlignmentSeedGeneId = null;
    sb.from('genes')
      .select('id,locus_tag,gene_name,gene_symbol,strain_id')
      .eq('id', seedId)
      .single()
      .then(({ data }) => { if (data) addPrimaryGene(data); })
      .catch(err => console.error('[StructureAlignment] seed fetch failed:', err));
  }
```

The full updated function:

```js
export function renderStructureAlignment(container) {
  _container = container;
  strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
  loadStrains().then(() => render()).catch(() => render());

  if (state.structureAlignmentSeedGeneId) {
    const seedId = state.structureAlignmentSeedGeneId;
    state.structureAlignmentSeedGeneId = null;
    sb.from('genes')
      .select('id,locus_tag,gene_name,gene_symbol,strain_id')
      .eq('id', seedId)
      .single()
      .then(({ data }) => { if (data) addPrimaryGene(data); })
      .catch(err => console.error('[StructureAlignment] seed fetch failed:', err));
  }
}
```

- [ ] **Step 6.2 — Add "Compare structures" button in genomes.js gene detail**

Open `web/js/views/genomes.js`. Find the structure section render function (`renderDetailStructure`). Locate where external action links are rendered — look for the block that renders "Open mmCIF ↗" or similar external links. Add a "Compare structures ↗" button that seeds the structure alignment tool:

Find the line(s) that render the mmCIF external link (around line 1867):

```js
record.mmcif_path ? extLink(record.mmcif_path, 'Open mmCIF ↗') : '',
```

Add after it (inside the same container):

```js
`<button onclick="window._seedStructureAlignment('${esc(gene.id)}')"
  style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;
         color:#0f4530;background:#f0fdf4;border:1.5px solid #86efac;border-radius:7px;
         padding:5px 11px;cursor:pointer;font-family:'DM Sans',sans-serif;">
  🔬 Compare structures
</button>`,
```

And add the global handler — append near the bottom of `genomes.js` or within the section that wires gene detail globals:

```js
window._seedStructureAlignment = (geneId) => {
  state.structureAlignmentSeedGeneId = geneId;
  // activateTab is on the app module — reach it via the dispatched event pattern
  document.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'structure-alignment' } }));
};
```

Then in `app.js`, listen for that event — add inside the `init` function or DOMContentLoaded handler:

```js
document.addEventListener('chlamatlas:navigate', (e) => {
  const { tab } = e.detail ?? {};
  if (tab) activateTab(tab);
});
```

- [ ] **Step 6.3 — Verify seeding works**

Run `vercel dev`. Go to Genomes, open any gene detail. In the Structure section, click "Compare structures". The app should navigate to Tools → Structure Alignment with that gene pre-populated as the first pick and the suggestion panel already loaded.

- [ ] **Step 6.4 — Bump version strings**

In `app.js`, bump the structure-alignment import version:

```js
import { renderStructureAlignment } from './views/structure-alignment.js?v=2';
```

Bump the genomes import version by 1 as well.

- [ ] **Step 6.5 — Commit**

```bash
git add web/js/views/structure-alignment.js web/js/views/genomes.js web/js/app.js
git commit -m "feat: seed structure alignment from gene detail panel"
```

---

## Task 7: Polish and release

Final cleanup: remove the "soon" text fully from the Tools popover, update the roadmap page if there's a planned features section, and do a quick cross-browser smoke test.

**Files:**
- Modify: `web/js/views/roadmap.js` (if structure alignment appears in planned features)
- Modify: `web/js/app.js` (version bump)

- [ ] **Step 7.1 — Check roadmap for structure alignment entry**

Open `web/js/views/roadmap.js`. Search for "structure alignment" or "Structure Alignment". If it's listed under a "Planned" section, move it to the changelog (similar to how sequence alignment was moved in commit `4afd1e8`). If not found, skip this step.

- [ ] **Step 7.2 — Final smoke test checklist**

Manually verify:
- [ ] Tools → Structure Alignment navigates correctly; Tools button stays highlighted
- [ ] Searching a gene with no orthologs shows only the same-gene row in suggestion panel
- [ ] Searching a gene with orthologs shows all three strains (with availability correctly reflected)
- [ ] AF3 buttons grey out for proteins without an AF3 mmcif_path
- [ ] Crystal buttons grey out for proteins without a crystal structure
- [ ] Adding 3 structures disables all quick-add buttons and hides "+ Add structure"
- [ ] "Load structures" button stays disabled below 2 confirmed entries
- [ ] Mol* loads both/all structures (verify by seeing multiple chains in the viewer)
- [ ] Background toggle works (dark ↔ light)
- [ ] Superpose hint dismisses and stays dismissed after dismissal
- [ ] "+ Add structure" returns to picker with entries preserved
- [ ] "↺ Start over" fully resets
- [ ] Seeding from gene detail pre-populates correctly
- [ ] No console errors throughout

- [ ] **Step 7.3 — Commit**

```bash
git add -p   # stage only intentional changes
git commit -m "feat: structure alignment tool — release"
```
