// ChlamAtlas — Genome Alignment tool
import { sb } from '../client.js?v=80';

// ── Constants (copied from genomes.js) ───────────────────────
const CATEGORY_COLORS = {
  'Amino acid metabolism':      '#E66729',
  'Cell envelope':              '#00A69D',
  'Cell processes':             '#0052A3',
  'Cofactor metabolism':        '#838FC7',
  'Energy metabolism':          '#EC1C24',
  'Inclusion membrane protein': '#E4B47E',
  'Inermediary metabolism':     '#9D270E',
  'Lipid metabolism':           '#6F2D90',
  'Membrane transport':         '#6DCFF5',
  'Nucleotide metabolism':      '#F497AE',
  'Other':                      '#EBEBEB',
  'Replication':                '#FFF100',
  'Secreted effector':          '#00A551',
  'Transcription':              '#FCB814',
  'Translation':                '#BED630',
  'Type III secretion':         '#8A5D3B',
  'Unknown':                    '#AAAAAA',
};
const CATEGORY_COLOR_DEFAULT = '#E5E7EB';

const CATEGORY_BADGE = {
  'Amino acid metabolism':      { bg:'#fff3ed', text:'#9a3412', border:'#fed7aa' },
  'Cell envelope':              { bg:'#f0fdfa', text:'#134e4a', border:'#99f6e4' },
  'Cell processes':             { bg:'#eff6ff', text:'#1e3a8a', border:'#bfdbfe' },
  'Cofactor metabolism':        { bg:'#f5f3ff', text:'#4c1d95', border:'#ddd6fe' },
  'Energy metabolism':          { bg:'#fef2f2', text:'#991b1b', border:'#fecaca' },
  'Inclusion membrane protein': { bg:'#fef9ee', text:'#a37742', border:'#f0d898' },
  'Inermediary metabolism':     { bg:'#fef2f2', text:'#7f1d1d', border:'#fecaca' },
  'Lipid metabolism':           { bg:'#faf5ff', text:'#581c87', border:'#e9d5ff' },
  'Membrane transport':         { bg:'#f0f9ff', text:'#0c4a6e', border:'#bae6fd' },
  'Nucleotide metabolism':      { bg:'#fdf2f8', text:'#831843', border:'#fbcfe8' },
  'Other':                      { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' },
  'Replication':                { bg:'#fefce8', text:'#713f12', border:'#fde68a' },
  'Secreted effector':          { bg:'#f0fdf4', text:'#14532d', border:'#86efac' },
  'Transcription':              { bg:'#fffbeb', text:'#78350f', border:'#fde68a' },
  'Translation':                { bg:'#f7fee7', text:'#365314', border:'#d9f99d' },
  'Type III secretion':         { bg:'#fdf4ef', text:'#5c3317', border:'#e8c9b3' },
  'Unknown':                    { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' },
};

const FUNC_LABELS = {
  'Amino acid metabolism':      'Amino acid',
  'Cell envelope':              'Cell envelope',
  'Cell processes':             'Cell processes',
  'Cofactor metabolism':        'Cofactor',
  'Energy metabolism':          'Energy',
  'Inclusion membrane protein': 'Inc',
  'Inermediary metabolism':     'Intermediary',
  'Lipid metabolism':           'Lipid',
  'Membrane transport':         'Transport',
  'Nucleotide metabolism':      'Nucleotide',
  'Other':                      'Other',
  'Replication':                'Replication',
  'Secreted effector':          'Secreted effector',
  'Transcription':              'Transcription',
  'Translation':                'Translation',
  'Type III secretion':         'T3SS',
  'Unknown':                    'Unknown',
};

const STRAIN_ICONS = {
  'CT-L2': '/design/icons_transparent/L2icon_transparent.png',
  'CT-D':  '/design/icons_transparent/CTDicon_transparent.png',
  'CM':    '/design/icons_transparent/CMicon_transparent.png',
};

const ROW_HEIGHT = 22; // px — fixed row height for ribbon Y calculation
const PAGE_SIZE  = 100;

// ── Module state (reset on each renderGenomeAlignment call) ──
let _loadGen      = 0;         // incremented on each load to cancel stale fetches
let _strains      = [];        // [{id, common_name, color_hex, emoji_icon}, ...]
let _refStrainId  = null;
let _cmpStrainId  = null;
let _refGenes     = [];        // ordered by sort_index
let _cmpGenes     = [];
let _orthologMap  = new Map(); // refGeneId → cmpGeneId
let _cmpGeneMap   = new Map(); // cmpGeneId → gene object
let _renderedCount = 0;
let _expandedRefId = null;     // currently expanded reference gene id
let _observer     = null;      // IntersectionObserver for pagination
let _container    = null;      // root container div
let _closePickersListener = null; // document click handler for custom pickers

// ── Entry point ──────────────────────────────────────────────
export async function renderGenomeAlignment(container) {
  _container    = container;
  _strains      = [];
  _refStrainId  = null;
  _cmpStrainId  = null;
  _refGenes     = [];
  _cmpGenes     = [];
  _orthologMap  = new Map();
  _cmpGeneMap   = new Map();
  _renderedCount = 0;
  _expandedRefId = null;
  if (_observer) { _observer.disconnect(); _observer = null; }
  if (_closePickersListener) {
    document.removeEventListener('click', _closePickersListener);
    _closePickersListener = null;
  }

  container.innerHTML = `
    <div id="ga-wrap" style="display:flex;height:calc(100vh - 56px);font-family:system-ui,sans-serif;background:#fff;overflow:hidden;">

      <!-- Left sidebar: Jump chips -->
      <div id="ga-sidebar-left" style="width:88px;flex-shrink:0;position:sticky;top:0;height:calc(100vh - 56px);display:flex;flex-direction:column;align-items:center;padding:24px 8px 16px;overflow-y:auto;border-right:1px solid #f0f4f8;">
        <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;">Jump to</div>
        <div id="ga-jump-chips" style="display:flex;flex-direction:column;width:100%;gap:4px;"></div>
      </div>

      <!-- Center column -->
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;">

        <!-- Sticky picker + col-headers area -->
        <div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
          <div id="ga-picker-row" style="padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;">
            <div id="ga-ref-picker-wrap" style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;border-radius:6px;padding:4px 8px;background:#fff;flex-shrink:0;">
              <img id="ga-ref-icon" style="width:16px;height:16px;object-fit:contain;display:none;flex-shrink:0;">
              <select id="ga-ref-picker" style="border:none;outline:none;font-size:12px;font-weight:600;color:#9ca3af;background:transparent;cursor:pointer;padding:0;">
                <option value="">Reference genome…</option>
              </select>
            </div>
            <span style="color:#94a3b8;font-size:16px;flex-shrink:0;">⇄</span>
            <div id="ga-cmp-picker-wrap" style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;border-radius:6px;padding:4px 8px;background:#fff;flex-shrink:0;">
              <img id="ga-cmp-icon" style="width:16px;height:16px;object-fit:contain;display:none;flex-shrink:0;">
              <select id="ga-cmp-picker" style="border:none;outline:none;font-size:12px;font-weight:600;color:#9ca3af;background:transparent;cursor:pointer;padding:0;">
                <option value="">Comparison genome…</option>
              </select>
            </div>
            <input id="ga-search" placeholder="🔍 Search gene…" style="border:1px solid #e2e8f0;border-radius:6px;padding:5px 10px;font-size:12px;color:#374151;width:170px;outline:none;background:#f8fafc;">
          </div>
          <!-- Column labels — shown after genes load, always above scroll content -->
          <div id="ga-col-headers" style="display:none;max-width:680px;margin:0 auto;width:100%;border-top:1px solid #f0f4f8;">
            <div style="display:flex;">
              <div style="flex:1;padding:3px 9px 4px;font-size:8px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Reference</div>
              <div style="width:72px;flex-shrink:0;"></div>
              <div style="flex:1;padding:3px 9px 4px;font-size:8px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Comparison</div>
            </div>
          </div>
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
          <div style="max-width:680px;margin:0 auto;display:flex;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.07),0 0 0 1px #e2e8f0;">
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
      <div id="ga-sidebar-right" style="width:110px;flex-shrink:0;position:sticky;top:0;height:calc(100vh - 56px);display:flex;flex-direction:column;padding:24px 10px 16px;overflow-y:auto;overflow-x:hidden;border-left:1px solid #f0f4f8;">
        <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;text-align:center;">Key</div>
        <div id="ga-legend-row"></div>
      </div>

    </div>
  `;

  _container.querySelector('#ga-retry')?.addEventListener('click', () => {
    showError(false);
    if (_strains.length === 0) {
      loadStrains();
    } else {
      onPickerChange();
    }
  });
  _container.querySelector('#ga-search')?.addEventListener('input', onSearch);

  await loadStrains();
}

// ── Strain loading ───────────────────────────────────────────
async function loadStrains() {
  const { data, error } = await sb
    .from('strains')
    .select('id,common_name,color_hex,emoji_icon')
    .eq('is_active', true)
    .order('common_name');

  if (error || !data?.length) {
    showError(true);
    return;
  }

  _strains = data;
  const refPicker = _container.querySelector('#ga-ref-picker');
  const cmpPicker = _container.querySelector('#ga-cmp-picker');

  data.forEach(s => {
    const label = s.common_name;
    refPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
    cmpPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
  });

  refPicker.addEventListener('change', onPickerChange);
  cmpPicker.addEventListener('change', onPickerChange);
}

function updatePickerDisplay(pickerId, iconElId, strainId) {
  const strain  = _strains.find(s => s.id === strainId);
  const picker  = _container.querySelector(`#${pickerId}`);
  const wrap    = _container.querySelector(`#${pickerId}-wrap`);
  const iconEl  = _container.querySelector(`#${iconElId}`);
  if (!strain || !picker || !iconEl) return;

  const color   = strain.color_hex ?? '#374151';
  const iconSrc = STRAIN_ICONS[strain.common_name] ?? '';

  // Border lives on the wrapper, text color on the select
  if (wrap) wrap.style.borderColor = color;
  picker.style.color = color;

  if (iconSrc) {
    iconEl.src           = iconSrc;
    iconEl.style.display = '';
  } else {
    iconEl.style.display = 'none';
  }
}

function showError(visible) {
  _container.querySelector('#ga-error').style.display = visible ? 'block' : 'none';
}

function showWarning(visible) {
  _container.querySelector('#ga-warning').style.display = visible ? 'block' : 'none';
}

// ── Strain selection handler ──────────────────────────────────
async function onPickerChange() {
  const refId = _container.querySelector('#ga-ref-picker').value;
  const cmpId = _container.querySelector('#ga-cmp-picker').value;

  if (refId) updatePickerDisplay('ga-ref-picker', 'ga-ref-icon', refId);
  if (cmpId) updatePickerDisplay('ga-cmp-picker', 'ga-cmp-icon', cmpId);

  if (!refId || !cmpId) return;

  if (refId === cmpId && refId !== '') {
    showWarning(true);
    return;
  }
  showWarning(false);

  _loadGen++;
  _refStrainId  = refId;
  _cmpStrainId  = cmpId;
  _renderedCount = 0;
  _expandedRefId = null;
  if (_observer) { _observer.disconnect(); _observer = null; }

  // Reset list
  _container.querySelector('#ga-ref-col').innerHTML  = '';
  _container.querySelector('#ga-cmp-col').innerHTML  = '';
  _container.querySelector('#ga-svg').innerHTML      = '';
  _container.querySelector('#ga-svg').setAttribute('height', '0');
  _container.querySelector('#ga-svg').setAttribute('viewBox', '0 0 72 0');
  _container.querySelector('#ga-list').style.display        = 'none';
  _container.querySelector('#ga-col-headers').style.display = 'none';
  _container.querySelector('#ga-empty').style.display       = 'flex';
  _container.querySelector('#ga-empty').textContent  = 'Loading…';
  _container.querySelector('#ga-legend-row').innerHTML = '';
  _container.querySelector('#ga-footer').style.display     = 'none';
  showError(false);

  await loadGenes();
}

async function loadGenes() {
  const gen = _loadGen;
  const GENE_COLS = 'id,locus_tag,gene_name,gene_symbol,product,functional_category,sort_index,is_characterized';

  const [refRes, cmpRes] = await Promise.all([
    sb.from('genes')
      .select(GENE_COLS)
      .eq('strain_id', _refStrainId)
      .lt('sort_index', 873)
      .order('sort_index'),
    sb.from('genes')
      .select(GENE_COLS)
      .eq('strain_id', _cmpStrainId)
      .lt('sort_index', 873)
      .order('sort_index'),
  ]);

  if (refRes.error || cmpRes.error) {
    showError(true);
    _container.querySelector('#ga-empty').textContent = 'Select two genomes above to begin.';
    return;
  }

  if (gen !== _loadGen) return;

  _refGenes = refRes.data ?? [];
  _cmpGenes = cmpRes.data ?? [];

  // Build cmpGeneMap for O(1) lookup
  _cmpGeneMap = new Map(_cmpGenes.map(g => [g.id, g]));

  // Fetch orthologs for this strain pair (both directions)
  const [o1, o2] = await Promise.all([
    sb.from('orthologs')
      .select('gene_id_a,gene_id_b')
      .eq('strain_id_a', _refStrainId)
      .eq('strain_id_b', _cmpStrainId),
    sb.from('orthologs')
      .select('gene_id_a,gene_id_b')
      .eq('strain_id_a', _cmpStrainId)
      .eq('strain_id_b', _refStrainId),
  ]);

  if (o1.error || o2.error) {
    showError(true);
    _container.querySelector('#ga-empty').textContent = 'Select two genomes above to begin.';
    return;
  }

  if (gen !== _loadGen) return;

  _orthologMap = new Map();
  const cmpIdSet = new Set(_cmpGenes.map(g => g.id));
  const refIdSet = new Set(_refGenes.map(g => g.id));

  for (const row of (o1.data ?? [])) {
    if (refIdSet.has(row.gene_id_a) && cmpIdSet.has(row.gene_id_b)) {
      _orthologMap.set(row.gene_id_a, row.gene_id_b);
    }
  }
  for (const row of (o2.data ?? [])) {
    if (refIdSet.has(row.gene_id_b) && cmpIdSet.has(row.gene_id_a)) {
      _orthologMap.set(row.gene_id_b, row.gene_id_a);
    }
  }

  // Ready to render
  buildJumpChips();
  buildLegend();
  _container.querySelector('#ga-empty').style.display      = 'none';
  _container.querySelector('#ga-list').style.display       = 'block';
  _container.querySelector('#ga-col-headers').style.display = 'block';
  _container.querySelector('#ga-footer').style.display     = 'block';
  appendPage();
  setupObserver();
}

// ── Navigation ───────────────────────────────────────────────
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

function jumpToIndex(targetIdx) {
  // Render all pages up to and including the target
  while (_renderedCount <= targetIdx && _renderedCount < _refGenes.length) {
    appendPage();
  }
  // Scroll the target row into view
  const refCol = _container.querySelector('#ga-ref-col');
  const rows   = refCol.querySelectorAll('.ga-row');
  const row    = rows[targetIdx];
  if (row) {
    row.scrollIntoView({ block: 'start', behavior: 'smooth' });
    row.style.outline = '2px solid #3b82f6';
    setTimeout(() => { row.style.outline = ''; }, 1500);
  }
}

function onSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  if (!query) return;

  const idx = _refGenes.findIndex(g =>
    g.locus_tag?.toLowerCase().includes(query) ||
    g.gene_name?.toLowerCase().includes(query) ||
    g.gene_symbol?.toLowerCase().includes(query)
  );
  if (idx === -1) return;

  jumpToIndex(idx);
}

// ── Rendering ────────────────────────────────────────────────
function appendPage() {
  const start = _renderedCount;
  const end   = Math.min(start + PAGE_SIZE, _refGenes.length);
  if (start >= _refGenes.length) return;

  const refCol = _container.querySelector('#ga-ref-col');
  const cmpCol = _container.querySelector('#ga-cmp-col');
  const svgEl  = _container.querySelector('#ga-svg');

  for (let i = start; i < end; i++) {
    const refGene   = _refGenes[i];
    const cmpGeneId = _orthologMap.get(refGene.id) ?? null;
    const cmpGene   = cmpGeneId ? _cmpGeneMap.get(cmpGeneId) : null;
    const catColor  = CATEGORY_COLORS[refGene.functional_category] ?? CATEGORY_COLOR_DEFAULT;

    refCol.appendChild(buildRow(refGene, catColor, true));
    cmpCol.appendChild(cmpGene ? buildRow(cmpGene, catColor, false, refGene.id) : buildGapRow());

    const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    if (cmpGene) {
      svgEl.insertAdjacentHTML('beforeend',
        `<line data-ref-id="${refGene.id}" x1="0" y1="${y}" x2="72" y2="${y}"` +
        ` stroke="${catColor}" stroke-width="1.5" opacity="0.2"/>`);
    } else {
      svgEl.insertAdjacentHTML('beforeend',
        `<circle data-ref-id="${refGene.id}" cx="36" cy="${y}" r="4"` +
        ` fill="#fca5a5" opacity="0.8"/>`);
    }
  }

  _renderedCount = end;
  const totalH = _renderedCount * ROW_HEIGHT;
  svgEl.setAttribute('height', totalH);
  svgEl.setAttribute('viewBox', `0 0 72 ${totalH}`);
}

function buildRow(gene, catColor, isRef, refId = null) {
  const named = !!(gene.gene_name || gene.gene_symbol);
  const displayName = gene.gene_name || gene.gene_symbol || '';
  const locusTag = gene.locus_tag ?? '';
  const r = parseInt(catColor.slice(1,3), 16);
  const g = parseInt(catColor.slice(3,5), 16);
  const b = parseInt(catColor.slice(5,7), 16);
  const bgTint = `rgba(${r},${g},${b},0.06)`;

  const row = document.createElement('div');
  row.className = 'ga-row';
  row.dataset.refId = isRef ? gene.id : (refId ?? gene.id);
  row.dataset.geneId = gene.id;
  row.style.cssText = [
    `height:${ROW_HEIGHT}px`,
    'overflow:hidden',
    'cursor:pointer',
    `border-left:4px solid ${catColor}`,
    `background:${bgTint}`,
    'display:flex',
    'align-items:center',
    'padding:0 6px 0 6px',
    'gap:5px',
    'box-sizing:border-box',
    'position:relative',
    'border-bottom:1px solid rgba(0,0,0,0.03)',
  ].join(';');

  const tagSpan = document.createElement('span');
  tagSpan.style.cssText = 'font-family:monospace;font-size:10px;flex-shrink:0;color:' +
    (named ? '#1a1a1a' : '#9ca3af');
  tagSpan.textContent = locusTag;
  row.appendChild(tagSpan);

  if (named) {
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = `font-size:10px;font-weight:700;color:${catColor};flex-shrink:0;`;
    nameSpan.textContent = '· ' + displayName;
    row.appendChild(nameSpan);
  }

  row.addEventListener('click', () => toggleExpand(row, gene, catColor, isRef));
  return row;
}

function buildGapRow() {
  const row = document.createElement('div');
  row.style.cssText = [
    `height:${ROW_HEIGHT}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:9px',
    'color:#d1d5db',
    'font-style:italic',
    'border-bottom:1px solid rgba(0,0,0,0.03)',
  ].join(';');
  row.textContent = '— no ortholog —';
  return row;
}

// ── Expand / collapse ────────────────────────────────────────
function toggleExpand(rowEl, gene, catColor, isRef) {
  const refId = rowEl.dataset.refId;

  // Collapse if clicking the already-expanded row
  if (_expandedRefId === refId) {
    collapseExpanded();
    return;
  }

  // Collapse previous
  if (_expandedRefId) collapseExpanded();

  _expandedRefId = refId;

  // Expand the ref row
  const refCol     = _container.querySelector('#ga-ref-col');
  const cmpCol     = _container.querySelector('#ga-cmp-col');
  const refRow     = refCol.querySelector(`.ga-row[data-ref-id="${refId}"]`);
  const cmpRow     = cmpCol.querySelector(`.ga-row[data-ref-id="${refId}"]`);

  const refGene = _refGenes.find(g => g.id === refId) ?? gene;
  if (refRow) expandRowEl(refRow, refGene, catColor, true);
  if (cmpRow) {
    const cmpGeneId = _orthologMap.get(refId);
    const cmpGene   = cmpGeneId ? _cmpGeneMap.get(cmpGeneId) : null;
    if (cmpGene) expandRowEl(cmpRow, cmpGene, catColor, false);
  }

  // Highlight ribbon path
  const svgEl = _container.querySelector('#ga-svg');
  svgEl.querySelectorAll(`[data-ref-id="${refId}"]`).forEach(el => {
    el.setAttribute('stroke-width', '3');
    el.setAttribute('opacity', '0.9');
  });
}

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

function collapseExpanded() {
  if (!_expandedRefId) return;

  const refCol = _container.querySelector('#ga-ref-col');
  const cmpCol = _container.querySelector('#ga-cmp-col');

  [refCol, cmpCol].forEach(col => {
    const row  = col.querySelector(`.ga-row[data-ref-id="${_expandedRefId}"]`);
    const body = row?.querySelector('.ga-expand-body');
    if (body) body.remove();
    if (row) {
      row.style.height   = `${ROW_HEIGHT}px`;
      row.style.overflow = 'hidden';
    }
  });

  // Restore ribbon
  const svgEl = _container.querySelector('#ga-svg');
  svgEl.querySelectorAll(`[data-ref-id="${_expandedRefId}"]`).forEach(el => {
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('opacity', '0.2');
  });

  _expandedRefId = null;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Pagination ───────────────────────────────────────────────
function setupObserver() {
  const sentinel = _container.querySelector('#ga-sentinel');
  if (!sentinel) return;

  _observer = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    if (_renderedCount >= _refGenes.length) {
      _observer.disconnect();
      return;
    }
    appendPage();
  }, {
    root: _container.querySelector('#ga-list'),
    rootMargin: '200px',
  });

  _observer.observe(sentinel);
}

// ── Legend ───────────────────────────────────────────────────
function buildLegend() {
  const legendRow = _container.querySelector('#ga-legend-row');
  if (!legendRow) return;
  legendRow.innerHTML = '';

  Object.entries(FUNC_LABELS).forEach(([cat, label]) => {
    const color = CATEGORY_COLORS[cat] ?? CATEGORY_COLOR_DEFAULT;
    const item  = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:10px;color:#64748b;padding:2.5px 0;';
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
    `<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#64748b;padding:2.5px 0;">` +
      `<svg width="20" height="4" style="flex-shrink:0"><line x1="0" y1="2" x2="20" y2="2" stroke="#888" stroke-width="1.5" opacity="0.6"/></svg>` +
      `Ortholog` +
    `</div>` +
    `<div style="display:flex;align-items:center;gap:5px;font-size:8.5px;color:#64748b;padding:2.5px 0;margin-top:2px;">` +
      `<svg width="20" height="10" style="flex-shrink:0"><circle cx="10" cy="5" r="3.5" fill="#fca5a5" opacity="0.85"/></svg>` +
      `No ortholog` +
    `</div>`;
  legendRow.appendChild(connectorLegend);
}
