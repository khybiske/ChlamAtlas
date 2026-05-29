# Genome Alignment Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the genome alignment view to use a 3-column layout (jump chips sidebar | constrained gene columns | legend sidebar) with a narrowed connector column, strain icon pickers, and an improved expand card.

**Architecture:** All changes are confined to `web/js/views/genome-alignment.js`. The HTML template is replaced with a flex-row 3-column layout; the SVG ribbon column is narrowed from 24% to 72px with thin lines replacing filled beziers; jump chips and legend move from the topbar into persistent sidebars; the `<select>` pickers gain icon overlays and dynamic strain colors.

**Tech Stack:** Vanilla JS, Supabase JS client (`sb`), SVG

---

## File Map

**Modify only:** `web/js/views/genome-alignment.js`

Functions changing in each task:
- **Task 1** — `renderGenomeAlignment` (HTML template)
- **Task 2** — constants block (add `STRAIN_ICONS`), `loadStrains`, new `updatePickerDisplay`
- **Task 3** — `buildJumpChips`
- **Task 4** — `buildLegend`
- **Task 5** — `appendPage`, `collapseExpanded`, `toggleExpand`, `onPickerChange`
- **Task 6** — `expandRowEl`

---

## Task 1: Replace HTML template with 3-column layout

**Files:**
- Modify: `web/js/views/genome-alignment.js:97-160`

Replace the `container.innerHTML` string inside `renderGenomeAlignment` with the new 3-column layout. Keep all existing element IDs so downstream functions continue to work. Also add `_closePickersListener` to module state for Task 2.

- [ ] **Step 1: Add `_closePickersListener` to module state block (line ~81)**

```js
let _observer     = null;      // IntersectionObserver for pagination
let _container    = null;      // root container div
let _closePickersListener = null; // document click handler for custom pickers
```

- [ ] **Step 2: Reset `_closePickersListener` at top of `renderGenomeAlignment`**

In the reset block at the top of `renderGenomeAlignment` (lines 85–95), add:

```js
if (_closePickersListener) {
  document.removeEventListener('click', _closePickersListener);
  _closePickersListener = null;
}
```

- [ ] **Step 3: Replace the entire `container.innerHTML = \`...\`` block**

Replace lines 97–160 (the full template string) with:

```js
  container.innerHTML = `
    <div id="ga-wrap" style="display:flex;height:calc(100vh - 56px);font-family:system-ui,sans-serif;background:#fff;overflow:hidden;">

      <!-- Left sidebar: Jump chips -->
      <div id="ga-sidebar-left" style="width:88px;flex-shrink:0;position:sticky;top:0;height:calc(100vh - 56px);display:flex;flex-direction:column;align-items:center;padding:24px 8px 16px;overflow-y:auto;border-right:1px solid #f0f4f8;">
        <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;">Jump to</div>
        <div id="ga-jump-chips" style="display:flex;flex-direction:column;width:100%;gap:4px;"></div>
      </div>

      <!-- Center column -->
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;">

        <!-- Sticky picker row -->
        <div id="ga-picker-row" style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0;padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;">
          <div style="position:relative;display:inline-flex;align-items:center;flex-shrink:0;">
            <img id="ga-ref-icon" style="width:16px;height:16px;object-fit:contain;position:absolute;left:8px;z-index:1;pointer-events:none;display:none;">
            <select id="ga-ref-picker" style="border:1.5px solid #e2e8f0;border-radius:6px;padding:5px 10px 5px 10px;font-size:12px;font-weight:600;color:#9ca3af;background:#fff;cursor:pointer;">
              <option value="">Reference genome…</option>
            </select>
          </div>
          <span style="color:#94a3b8;font-size:16px;flex-shrink:0;">⇄</span>
          <div style="position:relative;display:inline-flex;align-items:center;flex-shrink:0;">
            <img id="ga-cmp-icon" style="width:16px;height:16px;object-fit:contain;position:absolute;left:8px;z-index:1;pointer-events:none;display:none;">
            <select id="ga-cmp-picker" style="border:1.5px solid #e2e8f0;border-radius:6px;padding:5px 10px 5px 10px;font-size:12px;font-weight:600;color:#9ca3af;background:#fff;cursor:pointer;">
              <option value="">Comparison genome…</option>
            </select>
          </div>
          <input id="ga-search" placeholder="🔍 Search gene…" style="border:1px solid #e2e8f0;border-radius:6px;padding:5px 10px;font-size:12px;color:#374151;width:170px;outline:none;background:#f8fafc;">
        </div>

        <!-- Warning banner (same strain) -->
        <div id="ga-warning" style="display:none;padding:4px 16px;background:#fef9c3;color:#854d0e;font-size:11px;border-bottom:1px solid #fde68a;">
          ⚠️ Select two different genomes to compare.
        </div>

        <!-- Error banner -->
        <div id="ga-error" style="display:none;padding:6px 16px;background:#fef2f2;color:#991b1b;font-size:11px;border-bottom:1px solid #fecaca;">
          Failed to load genome data.
          <button id="ga-retry" style="margin-left:8px;font-size:11px;color:#1d4ed8;background:none;border:none;cursor:pointer;text-decoration:underline;">Retry</button>
        </div>

        <!-- Empty state -->
        <div id="ga-empty" style="display:flex;align-items:center;justify-content:center;flex:1;color:#94a3b8;font-size:14px;">
          Select two genomes above to begin.
        </div>

        <!-- Gene list -->
        <div id="ga-list" style="display:none;flex:1;overflow-y:auto;padding:16px 0 24px;">
          <div style="max-width:680px;margin:0 auto;display:flex;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.07),0 0 0 1px #e2e8f0;">
            <div id="ga-ref-col" style="flex:1;min-width:0;"></div>
            <div id="ga-ribbon-col" style="width:72px;flex-shrink:0;position:relative;background:#fafafa;border-left:1px solid #ececec;border-right:1px solid #ececec;">
              <svg id="ga-svg" width="72" height="0" viewBox="0 0 72 0"
                style="position:absolute;top:0;left:0;pointer-events:none;"></svg>
            </div>
            <div id="ga-cmp-col" style="flex:1;min-width:0;"></div>
          </div>
          <div id="ga-sentinel" style="height:1px;"></div>
          <div id="ga-footer" style="display:none;padding:6px 12px;font-size:10px;color:#9ca3af;text-align:center;">
            Plasmid genes excluded from this view.
          </div>
        </div>

      </div>

      <!-- Right sidebar: Legend -->
      <div id="ga-sidebar-right" style="width:110px;flex-shrink:0;position:sticky;top:0;height:calc(100vh - 56px);display:flex;flex-direction:column;padding:24px 10px 16px;overflow-y:auto;border-left:1px solid #f0f4f8;">
        <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;text-align:center;">Key</div>
        <div id="ga-legend-row"></div>
      </div>

    </div>
  `;
```

- [ ] **Step 4: Open the app in the browser and confirm the 3-column skeleton renders**

Navigate to the Tools → Genome Alignment page. You should see: left sidebar (empty, "Jump to" label), center column with picker row, right sidebar ("Key" label). No gene data yet — that's fine.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genome-alignment.js
git commit -m "feat: genome alignment — 3-column layout skeleton"
```

---

## Task 2: Strain picker icon overlay + dynamic color

**Files:**
- Modify: `web/js/views/genome-alignment.js` — constants block, `loadStrains`, new `updatePickerDisplay`

Add a `STRAIN_ICONS` constant. When a strain is selected, show its PNG icon overlaid on the left of the `<select>` and update the select's border/text to `strain.color_hex`. Remove `emoji_icon` from option labels.

- [ ] **Step 1: Add `STRAIN_ICONS` constant after the existing constants block (after line ~64)**

```js
const STRAIN_ICONS = {
  'CT-L2': '/design/icons_transparent/L2icon_transparent.png',
  'CT-D':  '/design/icons_transparent/CTDicon_transparent.png',
  'CM':    '/design/icons_transparent/CMicon_transparent.png',
};
```

- [ ] **Step 2: Update option labels in `loadStrains` to use only `common_name` (no emoji)**

In `loadStrains`, replace:

```js
  data.forEach(s => {
    const label = `${s.emoji_icon ?? ''} ${s.common_name}`.trim();
    refPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
    cmpPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
  });
```

With:

```js
  data.forEach(s => {
    const label = s.common_name;
    refPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
    cmpPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
  });
```

- [ ] **Step 3: Add `updatePickerDisplay` helper function after `loadStrains`**

```js
function updatePickerDisplay(pickerId, iconElId, strainId) {
  const strain  = _strains.find(s => s.id === strainId);
  const picker  = _container.querySelector(`#${pickerId}`);
  const iconEl  = _container.querySelector(`#${iconElId}`);
  if (!strain || !picker || !iconEl) return;

  const color   = strain.color_hex ?? '#374151';
  const iconSrc = STRAIN_ICONS[strain.common_name] ?? '';

  picker.style.borderColor = color;
  picker.style.color       = color;
  // Make room for icon when one exists
  picker.style.paddingLeft = iconSrc ? '30px' : '10px';

  if (iconSrc) {
    iconEl.src           = iconSrc;
    iconEl.style.display = '';
  } else {
    iconEl.style.display = 'none';
  }
}
```

- [ ] **Step 4: Call `updatePickerDisplay` inside `onPickerChange`**

Add these two calls at the top of `onPickerChange`, after reading `refId` and `cmpId`:

```js
async function onPickerChange() {
  const refId = _container.querySelector('#ga-ref-picker').value;
  const cmpId = _container.querySelector('#ga-cmp-picker').value;

  if (refId) updatePickerDisplay('ga-ref-picker', 'ga-ref-icon', refId);
  if (cmpId) updatePickerDisplay('ga-cmp-picker', 'ga-cmp-icon', cmpId);

  if (refId === cmpId && refId !== '') {
    showWarning(true);
    return;
  }
  showWarning(false);

  // (remaining existing body of onPickerChange continues unchanged from here)
  _loadGen++;
  _refStrainId  = refId;
  _cmpStrainId  = cmpId;
  _renderedCount = 0;
  _expandedRefId = null;
  if (_observer) { _observer.disconnect(); _observer = null; }

  _container.querySelector('#ga-ref-col').innerHTML  = '';
  _container.querySelector('#ga-cmp-col').innerHTML  = '';
  _container.querySelector('#ga-svg').innerHTML      = '';
  _container.querySelector('#ga-svg').setAttribute('height', '0');
  _container.querySelector('#ga-svg').setAttribute('viewBox', '0 0 72 0');
  _container.querySelector('#ga-list').style.display = 'none';
  _container.querySelector('#ga-empty').style.display = 'flex';
  _container.querySelector('#ga-empty').textContent  = 'Loading…';
  _container.querySelector('#ga-footer').style.display = 'none';
  showError(false);

  await loadGenes();
}
```

- [ ] **Step 5: Select CT-L2 and CT-D in the browser; confirm each picker shows the strain icon with colored border**

The CT-L2 picker should show the L2 icon image with border colored to CT-L2's `color_hex`. CT-D similarly.

- [ ] **Step 6: Commit**

```bash
git add web/js/views/genome-alignment.js
git commit -m "feat: genome alignment — strain icon overlay + dynamic picker color"
```

---

## Task 3: Move jump chips to left sidebar

**Files:**
- Modify: `web/js/views/genome-alignment.js` — `buildJumpChips`

The left sidebar already has `#ga-jump-chips`. Update `buildJumpChips` to render vertical chips into it and remove references to the now-gone `#ga-jump-row`.

- [ ] **Step 1: Replace `buildJumpChips` entirely**

```js
function buildJumpChips() {
  if (!_refGenes.length) return;
  const chipsEl = _container.querySelector('#ga-jump-chips');
  if (!chipsEl) return;
  chipsEl.innerHTML = '';

  const indices = [];
  for (let i = 0; i < _refGenes.length; i += 100) indices.push(i);
  if (indices[indices.length - 1] !== _refGenes.length - 1) {
    indices.push(_refGenes.length - 1);
  }

  indices.forEach(idx => {
    const gene  = _refGenes[idx];
    const label = idx === _refGenes.length - 1
      ? `${gene.locus_tag} (end)`
      : gene.locus_tag;

    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'display:block',
      'width:100%',
      'background:#f8fafc',
      'border:1px solid #e2e8f0',
      'border-radius:5px',
      'padding:4px 5px',
      'font-size:8.5px',
      'color:#475569',
      'cursor:pointer',
      'font-family:monospace',
      'text-align:center',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#eff6ff';
      btn.style.borderColor = '#93c5fd';
      btn.style.color = '#1d4ed8';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#f8fafc';
      btn.style.borderColor = '#e2e8f0';
      btn.style.color = '#475569';
    });
    btn.addEventListener('click', () => jumpToIndex(idx));
    chipsEl.appendChild(btn);
  });
}
```

- [ ] **Step 2: Verify no remaining references to `#ga-jump-row`**

```bash
grep -n "ga-jump-row" web/js/views/genome-alignment.js
```

Expected: no output. If any remain, remove them.

- [ ] **Step 3: Load genomes and confirm jump chips appear in left sidebar as a vertical list**

- [ ] **Step 4: Click a chip and confirm it scrolls the gene list to the correct row**

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genome-alignment.js
git commit -m "feat: genome alignment — jump chips moved to left sidebar"
```

---

## Task 4: Move legend to right sidebar

**Files:**
- Modify: `web/js/views/genome-alignment.js` — `buildLegend`

The right sidebar already has `#ga-legend-row`. Update `buildLegend` to render vertical legend items into it and append the connector legend (line = ortholog, dot = no ortholog).

- [ ] **Step 1: Replace `buildLegend` entirely**

```js
function buildLegend() {
  const legendRow = _container.querySelector('#ga-legend-row');
  if (!legendRow) return;
  legendRow.innerHTML = '';

  Object.entries(FUNC_LABELS).forEach(([cat, label]) => {
    const color = CATEGORY_COLORS[cat] ?? CATEGORY_COLOR_DEFAULT;
    const item  = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:8.5px;color:#64748b;padding:2.5px 0;';
    item.innerHTML =
      `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;` +
      (color === '#FFF100' || color === '#EBEBEB' ? 'border:1px solid #ccc;' : '') +
      `"></span>` +
      `<span>${label}</span>`;
    legendRow.appendChild(item);
  });

  // Connector legend
  const connectorLegend = document.createElement('div');
  connectorLegend.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e8edf2;';
  connectorLegend.innerHTML =
    `<div style="display:flex;align-items:center;gap:5px;font-size:8.5px;color:#64748b;padding:2.5px 0;">` +
      `<svg width="20" height="4" style="flex-shrink:0"><line x1="0" y1="2" x2="20" y2="2" stroke="#888" stroke-width="1.5" opacity="0.6"/></svg>` +
      `Ortholog` +
    `</div>` +
    `<div style="display:flex;align-items:center;gap:5px;font-size:8.5px;color:#64748b;padding:2.5px 0;margin-top:2px;">` +
      `<svg width="20" height="10" style="flex-shrink:0"><circle cx="10" cy="5" r="3.5" fill="#fca5a5" opacity="0.85"/></svg>` +
      `No ortholog` +
    `</div>`;
  legendRow.appendChild(connectorLegend);
}
```

- [ ] **Step 2: Verify no remaining references to `#ga-legend-row` using `style.display`**

```bash
grep -n "ga-legend-row" web/js/views/genome-alignment.js
```

The only hit should be inside `buildLegend`. Remove any `legendRow.style.display = 'flex'` lines that may remain from the old implementation.

- [ ] **Step 3: Load genomes and confirm the right sidebar populates with all categories plus the ortholog/no-ortholog connector legend at the bottom**

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genome-alignment.js
git commit -m "feat: genome alignment — legend moved to right sidebar with connector key"
```

---

## Task 5: Narrow connector column — thin SVG lines + column subheaders

**Files:**
- Modify: `web/js/views/genome-alignment.js` — `appendPage`, `collapseExpanded`, `toggleExpand`, `onPickerChange`

Switch SVG from 100-unit viewBox bezier paths to 72px-wide straight lines (1.5px stroke). Add sticky "Reference ↓" / "Comparison ↓" column subheaders on first page render. Fix stroke-width in expand/collapse to match new line weight.

- [ ] **Step 1: Update `appendPage` — add column subheaders on first page**

At the top of the `for` loop inside `appendPage`, add a guard that injects subheaders when `start === 0`:

```js
function appendPage() {
  const start = _renderedCount;
  const end   = Math.min(start + PAGE_SIZE, _refGenes.length);
  if (start >= _refGenes.length) return;

  const refCol = _container.querySelector('#ga-ref-col');
  const cmpCol = _container.querySelector('#ga-cmp-col');
  const svgEl  = _container.querySelector('#ga-svg');

  // Inject sticky column subheaders on first render
  if (start === 0) {
    const subheadStyle = 'position:sticky;top:0;z-index:5;padding:5px 9px;font-size:8.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid;';
    refCol.insertAdjacentHTML('afterbegin',
      `<div style="${subheadStyle}background:#eff6ff;color:#3b82f6;border-color:#dbeafe;">Reference ↓</div>`);
    cmpCol.insertAdjacentHTML('afterbegin',
      `<div style="${subheadStyle}background:#fffbeb;color:#d97706;border-color:#fde68a;">Comparison ↓</div>`);
  }

  for (let i = start; i < end; i++) {
    const refGene   = _refGenes[i];
    const cmpGeneId = _orthologMap.get(refGene.id) ?? null;
    const cmpGene   = cmpGeneId ? _cmpGeneMap.get(cmpGeneId) : null;
    const catColor  = CATEGORY_COLORS[refGene.functional_category] ?? CATEGORY_COLOR_DEFAULT;

    refCol.appendChild(buildRow(refGene, catColor, true));
    cmpCol.appendChild(cmpGene ? buildRow(cmpGene, catColor, false, refGene.id) : buildGapRow());

    // SVG insertion follows in Step 2 below — replace the existing block:
```

- [ ] **Step 2: Update SVG element insertion in the `for` loop in `appendPage`**

Replace the existing SVG path/circle insertion block:

```js
    const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    if (cmpGene) {
      svgEl.insertAdjacentHTML('beforeend',
        `<path data-ref-id="${refGene.id}" d="M 0,${y} C 50,${y} 50,${y} 100,${y}"` +
        ` stroke="${catColor}" stroke-width="${refGene.gene_name ? 9 : 7}"` +
        ` fill="none" opacity="0.55"/>`);
    } else {
      svgEl.insertAdjacentHTML('beforeend',
        `<circle data-ref-id="${refGene.id}" cx="50" cy="${y}" r="4"` +
        ` fill="#fca5a5" opacity="0.8"/>`);
    }
```

With:

```js
    const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    if (cmpGene) {
      svgEl.insertAdjacentHTML('beforeend',
        `<line data-ref-id="${refGene.id}" x1="0" y1="${y}" x2="72" y2="${y}"` +
        ` stroke="${catColor}" stroke-width="1.5" opacity="0.65"/>`);
    } else {
      svgEl.insertAdjacentHTML('beforeend',
        `<circle data-ref-id="${refGene.id}" cx="36" cy="${y}" r="4"` +
        ` fill="#fca5a5" opacity="0.8"/>`);
    }
```

- [ ] **Step 3: Update SVG viewBox in `appendPage`**

Replace:

```js
  svgEl.setAttribute('viewBox', `0 0 100 ${totalH}`);
```

With:

```js
  svgEl.setAttribute('viewBox', `0 0 72 ${totalH}`);
```

- [ ] **Step 4: Update SVG viewBox reset in `onPickerChange`**

Find and replace:

```js
  _container.querySelector('#ga-svg').setAttribute('viewBox', '0 0 100 0');
```

With:

```js
  _container.querySelector('#ga-svg').setAttribute('viewBox', '0 0 72 0');
```

- [ ] **Step 5: Update expand highlight in `toggleExpand`**

Replace:

```js
  svgEl.querySelectorAll(`[data-ref-id="${refId}"]`).forEach(el => {
    el.setAttribute('stroke-width', '14');
    el.setAttribute('opacity', '0.85');
  });
```

With:

```js
  svgEl.querySelectorAll(`[data-ref-id="${refId}"]`).forEach(el => {
    el.setAttribute('stroke-width', '3');
    el.setAttribute('opacity', '0.9');
  });
```

- [ ] **Step 6: Update collapse restore in `collapseExpanded`**

Replace:

```js
  const refGene = _refGenes.find(g => g.id === _expandedRefId);
  const strokeW = refGene?.gene_name ? 9 : 7;
  svgEl.querySelectorAll(`[data-ref-id="${_expandedRefId}"]`).forEach(el => {
    el.setAttribute('stroke-width', String(strokeW));
    el.setAttribute('opacity', '0.55');
  });
```

With:

```js
  svgEl.querySelectorAll(`[data-ref-id="${_expandedRefId}"]`).forEach(el => {
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('opacity', '0.65');
  });
```

- [ ] **Step 7: Load genomes in browser and verify**
  - Connector column is ~72px wide
  - Lines are thin colored horizontals (not thick ribbons)
  - "— no ortholog —" rows show a small pink dot in the connector
  - "Reference ↓" and "Comparison ↓" sticky subheaders appear at top of columns
  - Clicking a row highlights its connector line, clicking again restores it

- [ ] **Step 8: Commit**

```bash
git add web/js/views/genome-alignment.js
git commit -m "feat: genome alignment — narrow connector column with thin SVG lines"
```

---

## Task 6: Expand card — gene detail on both columns + protein data

**Files:**
- Modify: `web/js/views/genome-alignment.js` — `expandRowEl`

Add → Gene detail link to the comparison column (currently only reference has it). Fetch protein mass and length lazily and inject into the card when available.

- [ ] **Step 1: Replace `expandRowEl` entirely**

```js
function expandRowEl(rowEl, gene, catColor, isRef) {
  rowEl.style.height   = 'auto';
  rowEl.style.overflow = 'visible';

  const badge   = CATEGORY_BADGE[gene.functional_category] ?? { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' };
  const catName = FUNC_LABELS[gene.functional_category] ?? gene.functional_category ?? 'Unknown';
  const product = gene.product ?? '';

  const body = document.createElement('div');
  body.className = 'ga-expand-body';
  body.style.cssText = [
    'position:absolute',
    `top:${ROW_HEIGHT}px`,
    'left:-4px',
    'right:0',
    'z-index:20',
    `background:${badge.bg}`,
    `border:1.5px solid ${badge.border}`,
    'border-top:none',
    'padding:6px 8px 8px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.08)',
  ].join(';');

  const protId = `ga-prot-${gene.id}`;
  body.innerHTML = [
    product ? `<div style="font-size:10px;color:#374151;margin-bottom:4px;">${escHtml(product)}</div>` : '',
    `<span style="display:inline-block;font-size:9px;padding:2px 6px;border-radius:4px;` +
      `background:${badge.bg};color:${badge.text};border:1px solid ${badge.border};margin-bottom:4px;">` +
      `${escHtml(catName)}</span>`,
    `<div id="${protId}" style="font-size:9px;color:#9ca3af;margin-top:2px;"></div>`,
    `<div style="margin-top:4px;"><a href="#" class="ga-detail-link" data-gene-id="${gene.id}" ` +
      `style="font-size:10px;color:#3b82f6;text-decoration:none;">→ Gene detail</a></div>`,
  ].join('');

  body.querySelector('.ga-detail-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.__openGeneId = gene.id;
    window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
  });

  rowEl.style.position = 'relative';
  rowEl.appendChild(body);

  // Lazy-load protein size data
  sb.from('proteins')
    .select('mass_kd,length_aa')
    .eq('gene_id', gene.id)
    .maybeSingle()
    .then(({ data }) => {
      const el = body.querySelector(`#${protId}`);
      if (!el || !data) return;
      const parts = [];
      if (data.length_aa) parts.push(`${data.length_aa} aa`);
      if (data.mass_kd)   parts.push(`${data.mass_kd} kDa`);
      if (parts.length) el.textContent = parts.join(' · ');
    });
}
```

- [ ] **Step 2: Verify `isRef` is no longer referenced in `expandRowEl`**

```bash
grep -n "isRef" web/js/views/genome-alignment.js
```

`isRef` is still a parameter in `toggleExpand` → `expandRowEl` call sites. The parameter can remain in the function signature for now (it's passed but unused). Confirm the function signature still matches its two call sites in `toggleExpand`:

```js
if (refRow) expandRowEl(refRow, refGene, catColor, true);
if (cmpGene) expandRowEl(cmpRow, cmpGene, catColor, false);
```

Both are unchanged — no edits needed to `toggleExpand`.

- [ ] **Step 3: Expand a gene row and verify**
  - Product description shows
  - Category badge shows
  - Protein aa/kDa appears within a moment (async)
  - "→ Gene detail" link appears in **both** reference and comparison columns
  - Clicking "→ Gene detail" navigates to the gene detail page

- [ ] **Step 4: Expand a gene with no ortholog (comparison side shows "— no ortholog —") and verify only the reference side expands with no JS errors**

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genome-alignment.js
git commit -m "feat: genome alignment — expand card shows gene detail on both sides + protein size"
```
