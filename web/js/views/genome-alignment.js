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

const ROW_HEIGHT = 22; // px — fixed row height for ribbon Y calculation
const PAGE_SIZE  = 100;

// ── Module state (reset on each renderGenomeAlignment call) ──
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

  container.innerHTML = `
    <div id="ga-wrap" style="display:flex;flex-direction:column;height:calc(100vh - 56px);font-family:system-ui,sans-serif;">

      <!-- Sticky top bar -->
      <div id="ga-topbar" style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0;">

        <!-- Row 1: strain pickers + search -->
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;flex-wrap:wrap;">
          <select id="ga-ref-picker" style="border:1.5px solid #3b82f6;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;color:#1d4ed8;background:#fff;cursor:pointer;">
            <option value="">Reference genome…</option>
          </select>
          <span style="color:#94a3b8;font-size:16px;flex-shrink:0;">⇄</span>
          <select id="ga-cmp-picker" style="border:1.5px solid #d97706;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;color:#b45309;background:#fff;cursor:pointer;">
            <option value="">Comparison genome…</option>
          </select>
          <input id="ga-search" placeholder="🔍 Search gene…" style="margin-left:auto;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:12px;color:#374151;width:180px;outline:none;">
        </div>

        <!-- Row 2: jump chips (populated after gene load) -->
        <div id="ga-jump-row" style="display:none;align-items:center;gap:5px;padding:3px 12px 4px;flex-wrap:wrap;font-size:10px;">
          <span style="color:#94a3b8;font-weight:700;flex-shrink:0;letter-spacing:0.05em;">JUMP TO:</span>
          <div id="ga-jump-chips" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
        </div>

        <!-- Row 3: category legend (populated after gene load) -->
        <div id="ga-legend-row" style="display:none;align-items:center;gap:6px;padding:3px 12px 5px;flex-wrap:wrap;font-size:9px;"></div>

        <!-- Warning banner (same strain) -->
        <div id="ga-warning" style="display:none;padding:4px 12px;background:#fef9c3;color:#854d0e;font-size:11px;border-top:1px solid #fde68a;">
          ⚠️ Select two different genomes to compare.
        </div>

        <!-- Error banner -->
        <div id="ga-error" style="display:none;padding:6px 12px;background:#fef2f2;color:#991b1b;font-size:11px;border-top:1px solid #fecaca;">
          Failed to load genome data.
          <button id="ga-retry" style="margin-left:8px;font-size:11px;color:#1d4ed8;background:none;border:none;cursor:pointer;text-decoration:underline;">Retry</button>
        </div>
      </div>

      <!-- Empty state -->
      <div id="ga-empty" style="display:flex;align-items:center;justify-content:center;flex:1;color:#94a3b8;font-size:14px;">
        Select two genomes above to begin.
      </div>

      <!-- Gene list (hidden until data loaded) -->
      <div id="ga-list" style="display:none;flex:1;overflow-y:auto;">
        <div id="ga-columns" style="display:flex;min-height:100%;">
          <div id="ga-ref-col" style="width:38%;border-right:1px solid #f0f0f0;"></div>
          <div id="ga-ribbon-col" style="width:24%;position:relative;overflow:visible;">
            <svg id="ga-svg" width="100%" height="0"
              viewBox="0 0 100 0"
              preserveAspectRatio="none"
              style="position:absolute;top:0;left:0;pointer-events:none;"></svg>
          </div>
          <div id="ga-cmp-col" style="width:38%;border-left:1px solid #f0f0f0;"></div>
        </div>
        <div id="ga-sentinel" style="height:1px;"></div>
        <div id="ga-footer" style="display:none;padding:6px 12px;font-size:10px;color:#9ca3af;text-align:center;">
          Plasmid genes excluded from this view.
        </div>
      </div>

    </div>
  `;

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
    const label = `${s.emoji_icon ?? ''} ${s.common_name}`.trim();
    refPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
    cmpPicker.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${label}</option>`);
  });

  refPicker.addEventListener('change', onPickerChange);
  cmpPicker.addEventListener('change', onPickerChange);

  _container.querySelector('#ga-retry')?.addEventListener('click', () => {
    showError(false);
    onPickerChange();
  });
  _container.querySelector('#ga-search')?.addEventListener('input', onSearch);
}

function showError(visible) {
  _container.querySelector('#ga-error').style.display = visible ? 'block' : 'none';
}

function showWarning(visible) {
  _container.querySelector('#ga-warning').style.display = visible ? 'block' : 'none';
}
