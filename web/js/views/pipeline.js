// ChlamAtlas — Pipeline tab (v82 rewrite)
import { sb, state } from '../client.js?v=82';

// ─────────────────────────────────────────────────────────────
// SECTION 1: Constants, helpers, data layer (Task 4)
// ─────────────────────────────────────────────────────────────

export const STAGES = [
  { key: 'plasmid',        label: 'Plasmid',   short: 'Plasmid',
    dbBool: 'plasmid_complete',        dbBy: 'plasmid_completed_by',        dbDate: 'plasmid_completed_date' },
  { key: 'transformation', label: 'Transform', short: 'Transform',
    dbBool: 'transformation_complete', dbBy: 'transformation_completed_by', dbDate: 'transformation_completed_date' },
  { key: 'cloning',        label: 'Clone',     short: 'Clone',
    dbBool: 'cloning_complete',        dbBy: 'cloning_completed_by',        dbDate: 'cloning_completed_date' },
  { key: 'genotyping',     label: 'PCR',       short: 'PCR',
    dbBool: 'genotyping_complete',     dbBy: 'genotyping_completed_by',     dbDate: 'genotyping_completed_date' },
  { key: 'wgs',            label: 'WGS',       short: 'WGS',
    dbBool: 'wgs_complete',            dbBy: 'wgs_completed_by',            dbDate: 'wgs_completed_date' },
  { key: 'invitro',        label: 'In vitro',  short: 'Vitro',
    dbBool: 'invitro_test_complete',   dbBy: 'invitro_completed_by',        dbDate: 'invitro_completed_date' },
  { key: 'invivo',         label: 'In vivo',   short: 'Vivo',
    dbBool: 'invivo_test_complete',    dbBy: 'invivo_completed_by',         dbDate: 'invivo_completed_date' },
];

export const PERSONNEL = {
  'K. Hybiske':  { initials: 'KH', lab: 'uw' },
  'Y. Wang':     { initials: 'YW', lab: 'uw' },
  'J. Hester':   { initials: 'JH', lab: 'uw' },
  'S. Hefty':    { initials: 'SH', lab: 'ku' },
  'D. Rockey':   { initials: 'DR', lab: 'osu' },
};
export const PERSONNEL_NAMES = Object.keys(PERSONNEL);

// Module state — reset on each renderPipeline() call
let _allMutants  = [];
let _favorites   = new Set();
let _userId      = null;
let _expandedIds = new Set();
let _container   = null;
const _sort         = { ko: 'progress', tn: 'progress', lucky17: 'progress', chimeras: 'progress' };
const _strainFilter = { ko: new Set(['CT-L2', 'CM']), tn: new Set(['CT-L2', 'CM']) };
const _showAll      = {};

// ── Helpers ───────────────────────────────────────────────────

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  // Parse as local date to avoid UTC offset shifts
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toInitials(name) {
  if (!name) return '??';
  const p = PERSONNEL[name];
  if (p) return p.initials;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function toLab(name) {
  if (!name) return '';
  const p = PERSONNEL[name];
  return p ? p.lab : '';
}

function progressScore(pipe) {
  if (!pipe) return 0;
  return STAGES.filter(s => pipe[s.dbBool]).length;
}

function categoryKey(m) {
  const cat = (m.category || '').toLowerCase();
  const type = (m.mutation_type || '').toLowerCase();
  if (cat.includes('lucky') || cat === 'lucky 17') return 'lucky17';
  if (cat.includes('chimera')) return 'chimeras';
  if (type === 'transposon' || type === 'tn') return 'tn';
  return 'ko';
}

function strainLabel(m) {
  const s = (m.strain_id || '').toUpperCase();
  if (s.includes('L2')) return 'CT-L2';
  if (s.includes('CM') || s.includes('MURIDARUM')) return 'CM';
  if (s.includes('CT-D') || s.includes('CTD') || s.includes('D/UW')) return 'CT-D';
  // Fallback: pass through the strain_id as-is
  return m.strain_id || '';
}

async function fetchData() {
  const selectCols = STAGES.flatMap(s => [s.dbBool, s.dbBy, s.dbDate]).join(',\n      ');

  const [mutantsRes, favRes] = await Promise.all([
    sb.from('mutants')
      .select(`
        mutant_id, mutant_name, category, strain_id, target_genes, mutation_type,
        description, status, creator, notes, is_priority, is_planned, stuck_stage,
        mutant_pipeline (
          ${selectCols},
          active_assignments
        )
      `)
      .eq('show_in_pipeline', true)
      .order('mutant_id', { ascending: true }),

    _userId
      ? sb.from('pipeline_favorites')
          .select('mutant_id')
          .eq('user_id', _userId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (mutantsRes.error) {
    console.error('[Pipeline] fetch error:', mutantsRes.error);
    _allMutants = [];
  } else {
    // Flatten mutant_pipeline (1:1 relation returned as array)
    _allMutants = (mutantsRes.data || []).map(m => ({
      ...m,
      pipe: Array.isArray(m.mutant_pipeline) ? (m.mutant_pipeline[0] ?? null) : (m.mutant_pipeline ?? null),
    }));
  }

  if (!favRes.error && favRes.data) {
    _favorites = new Set(favRes.data.map(r => r.mutant_id));
  }
}

// ─────────────────────────────────────────────────────────────
// SECTION 2: Stage strip + mutant row (Task 5)
// ─────────────────────────────────────────────────────────────

const FLAME_ON  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#f97316" stroke="none"><path d="M12 2C11 5.5 10 7 10 9c0 .8.6 1.5 1.2 1.5C12 10.5 12.5 9.5 12.5 8.5 13.5 10 15 12 15 14a3 3 0 0 1-6 0c0-3.5 3-8 3-12z"/></svg>`;
const FLAME_OFF = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round"><path d="M12 2C11 5.5 10 7 10 9c0 .8.6 1.5 1.2 1.5C12 10.5 12.5 9.5 12.5 8.5 13.5 10 15 12 15 14a3 3 0 0 1-6 0c0-3.5 3-8 3-12z"/></svg>`;
const STAR_ON   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12,2 14.6,8.6 22,9.3 16.5,14.3 18.2,21.2 12,17.5 5.8,21.2 7.5,14.3 2,9.3 9.4,8.6"/></svg>`;
const STAR_OFF  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 14.6,8.6 22,9.3 16.5,14.3 18.2,21.2 12,17.5 5.8,21.2 7.5,14.3 2,9.3 9.4,8.6"/></svg>`;

function stageStrip(pipe, stuckStage, isPlanned, activeAssignments) {
  const aa = activeAssignments || {};
  const pills = STAGES.map(s => {
    const done   = pipe && pipe[s.dbBool];
    const who    = done ? (pipe[s.dbBy] || '') : '';
    const active = !done && aa[s.key];
    const stuck  = !done && stuckStage === s.key;

    let cls, inner, title;

    if (done) {
      cls   = 'pl-sd pl-sd-done';
      inner = '✓';
      title = `${s.label}: done${who ? ' by ' + who : ''}`;
    } else if (stuck) {
      const initials = active ? (active.initials || toInitials(active.who)) : '';
      cls   = 'pl-sd pl-sd-stuck';
      inner = initials || '!';
      title = `${s.label}: stuck${active ? ' (' + active.who + ')' : ''}`;
    } else if (active) {
      const lab      = active.lab || toLab(active.who);
      const labCls   = lab ? `pl-sd-${lab}` : 'pl-sd-pending';
      const initials = active.initials || toInitials(active.who);
      cls   = `pl-sd ${labCls}`;
      inner = initials;
      title = `${s.label}: assigned to ${active.who}`;
    } else if (isPlanned) {
      // First incomplete stage on a planned mutant
      const firstIncomplete = STAGES.find(st => !(pipe && pipe[st.dbBool]));
      if (firstIncomplete && firstIncomplete.key === s.key) {
        cls   = 'pl-sd pl-sd-planned';
        inner = '…';
        title = `${s.label}: planned`;
      } else {
        cls   = 'pl-sd pl-sd-pending';
        inner = '';
        title = s.label;
      }
    } else {
      cls   = 'pl-sd pl-sd-pending';
      inner = '';
      title = s.label;
    }

    return `<span class="${cls}" title="${esc(title)}">${inner}</span>`;
  });

  return `<div data-stage-strip style="display:flex;align-items:center;gap:2px;">${pills.join('')}</div>`;
}

function mutantRow(m, { showStrain = false } = {}) {
  const mutantId = m.mutant_id;
  const pipe     = m.pipe;
  const aa       = pipe?.active_assignments || {};
  const isPriority = !!m.is_priority;
  const isStuck    = !!(m.stuck_stage);
  const isMine     = !!(state.userProfile?.display_name && m.creator === state.userProfile.display_name);
  const isPlanned  = !!m.is_planned;
  const isExpanded = _expandedIds.has(mutantId);
  const isFav      = _favorites.has(mutantId);

  let rowCls = 'pl-row';
  if (isPriority) rowCls += ' is-priority';
  if (isStuck)    rowCls += ' is-stuck';
  if (isMine)     rowCls += ' is-mine';
  if (isPlanned)  rowCls += ' is-planned';
  if (isExpanded) rowCls += ' is-expanded';

  // Gene display — first target gene
  const genes = m.target_genes || [];
  const firstGene = genes[0] || '';
  const moreGenes = genes.length > 1 ? ` +${genes.length - 1}` : '';

  // Mutation type pill
  const typeText = (m.mutation_type || '').toLowerCase().includes('transposon') ||
                   (m.mutation_type || '').toLowerCase() === 'tn' ? 'Tn' : 'LR';
  const typePillCls = typeText === 'Tn'
    ? 'text-[9px] font-bold px-1.5 py-0 rounded bg-orange-50 text-orange-700 border border-orange-200 flex-shrink-0'
    : 'text-[9px] font-bold px-1.5 py-0 rounded bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0';

  // Strain chip
  const sl = strainLabel(m);
  const strainChipCls = sl === 'CT-L2' ? 'pl-strain-chip pl-chip-l2'
                       : sl === 'CM'    ? 'pl-strain-chip pl-chip-cm'
                       : sl === 'CT-D'  ? 'pl-strain-chip pl-chip-ctd'
                       : 'pl-strain-chip pl-chip-off';

  const plannedChip = isPlanned
    ? `<span class="text-[9px] font-semibold px-1.5 py-0 rounded bg-gray-100 text-gray-400 border border-dashed border-gray-300 flex-shrink-0 mr-0.5">planned</span>`
    : '';

  const stuckNote = isStuck
    ? `<span class="text-[10px] text-red-500 ml-1">⚠ stuck</span>`
    : '';

  const stripHtml = stageStrip(pipe, m.stuck_stage, isPlanned, aa);
  const chevron   = isExpanded ? '∨' : '›';

  // Priority confirm popover (embedded in flame button)
  const newPriVal = isPriority ? 'false' : 'true';
  const confirmMsg = isPriority
    ? 'Remove priority flag?'
    : 'Mark as priority?';
  const priorityConfirm = `
    <div id="pc-${esc(mutantId)}" class="pl-priority-confirm" onclick="event.stopPropagation()">
      <p class="text-xs font-semibold text-gray-700 mb-2">${confirmMsg}</p>
      <div style="display:flex;gap:6px;">
        <button onclick="window.__plConfirmPriority('${esc(mutantId)}',${newPriVal})"
                class="text-xs font-semibold px-3 py-1 rounded-lg bg-orange-500 text-white">Yes</button>
        <button onclick="window.__plIconClick(event,'priority-close','${esc(mutantId)}')"
                class="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-600">Cancel</button>
      </div>
    </div>`;

  return `
<div class="${rowCls}" id="row-${esc(mutantId)}" data-mutant-id="${esc(mutantId)}" onclick="window.__plRowClick(event,'${esc(mutantId)}')">
  <!-- Left: chips + ID + gene -->
  <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;overflow:hidden;">
    ${plannedChip}
    <span class="text-xs font-bold text-gray-900 flex-shrink-0">${esc(mutantId)}</span>
    ${firstGene ? `<span class="text-[10px] text-gray-400 font-mono truncate">${esc(firstGene)}${moreGenes}</span>` : ''}
    <span class="${typePillCls}">${typeText}</span>
    ${showStrain ? `<span class="${strainChipCls}">${esc(sl)}</span>` : ''}
    ${stuckNote}
  </div>
  <!-- Middle: flame + star -->
  <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;margin:0 6px;position:relative;">
    <button class="pl-icon-btn" onclick="window.__plIconClick(event,'priority','${esc(mutantId)}')"
            title="${isPriority ? 'Remove priority' : 'Mark priority'}" aria-label="Priority">
      ${isPriority ? FLAME_ON : FLAME_OFF}
      ${priorityConfirm}
    </button>
    <button class="pl-icon-btn" onclick="window.__plIconClick(event,'fav','${esc(mutantId)}')"
            title="${isFav ? 'Remove from favorites' : 'Add to favorites'}" aria-label="Favorite">
      ${isFav ? STAR_ON : STAR_OFF}
    </button>
  </div>
  <!-- Right: stage strip + chevron -->
  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
    ${stripHtml}
    <span class="text-gray-300 text-sm flex-shrink-0" id="chev-${esc(mutantId)}">${chevron}</span>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3: Expand panel (Task 6)
// ─────────────────────────────────────────────────────────────

function expandPanel(m) {
  const mutantId = m.mutant_id;
  const pipe     = m.pipe;
  const aa       = pipe?.active_assignments || {};

  // Top bar content
  const geneName = (m.target_genes || []).join(', ') || '—';
  const strainLbl = strainLabel(m);
  const metaStr   = [strainLbl, m.mutation_type, m.creator].filter(Boolean).join(' · ');

  // Stage checklist tiles
  const tiles = STAGES.map(s => {
    const done    = pipe && pipe[s.dbBool];
    const who     = done ? (pipe[s.dbBy] || '') : '';
    const dt      = done ? (pipe[s.dbDate] || '') : '';
    const active  = !done && aa[s.key];
    const stuck   = !done && m.stuck_stage === s.key;

    let tileCls = 'pl-stage-tile';
    if (done)   tileCls += ' tile-done';
    else if (active) tileCls += ' tile-active';
    else if (stuck)  tileCls += ' tile-stuck';

    const cbCls  = done ? 'pl-tile-cb checked' : 'pl-tile-cb';
    const cbInner = done ? '✓' : '';

    const subtext = done
      ? `<span style="font-size:8px;color:#6b7280;margin-top:2px;text-align:center;">${fmtDate(dt)}${who ? '<br>' + esc(who) : ''}</span>`
      : active
        ? `<span style="font-size:8px;color:#7c3aed;margin-top:2px;">${esc(active.who || '')}</span>`
        : '';

    // Today's date for default picker value
    const today = new Date().toISOString().split('T')[0];

    // Person select options
    const personOpts = PERSONNEL_NAMES.map(n =>
      `<option value="${esc(n)}">${esc(n)}</option>`
    ).join('');

    const picker = `
      <div id="picker-${esc(mutantId)}-${s.key}" class="pl-picker-popup" onclick="event.stopPropagation()">
        <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:6px;">${esc(s.label)}</div>
        <label style="font-size:10px;color:#6b7280;display:block;margin-bottom:2px;">Who completed it?</label>
        <select id="picker-who-${esc(mutantId)}-${s.key}"
                style="font-size:11px;width:100%;border:1px solid #d1d5db;border-radius:6px;padding:4px 6px;margin-bottom:4px;"
                onchange="window.__plPickerSelectChange('${esc(mutantId)}','${s.key}')">
          <option value="">— select —</option>
          ${personOpts}
          <option value="__other__">Other…</option>
        </select>
        <div id="picker-other-wrap-${esc(mutantId)}-${s.key}" style="display:none;margin-bottom:4px;">
          <input type="text" id="picker-other-${esc(mutantId)}-${s.key}"
                 placeholder="Name" style="font-size:11px;width:100%;border:1px solid #d1d5db;border-radius:6px;padding:4px 6px;box-sizing:border-box;" />
        </div>
        <label style="font-size:10px;color:#6b7280;display:block;margin-bottom:2px;">Date</label>
        <input type="date" id="picker-date-${esc(mutantId)}-${s.key}"
               value="${today}"
               style="font-size:11px;width:100%;border:1px solid #d1d5db;border-radius:6px;padding:4px 6px;margin-bottom:6px;box-sizing:border-box;" />
        <div style="display:flex;gap:5px;">
          <button onclick="window.__plPickerSave('${esc(mutantId)}','${s.key}')"
                  style="font-size:10px;font-weight:600;padding:4px 10px;border-radius:6px;background:#7c3aed;color:white;border:none;cursor:pointer;flex:1;">Save</button>
          <button onclick="window.__plPickerCancel('${esc(mutantId)}','${s.key}')"
                  style="font-size:10px;padding:4px 10px;border-radius:6px;background:#f3f4f6;color:#6b7280;border:none;cursor:pointer;">Cancel</button>
        </div>
      </div>`;

    return `
      <div class="${tileCls}" id="tile-${esc(mutantId)}-${s.key}"
           onclick="window.__plTileClick(event,'${esc(mutantId)}','${s.key}')">
        <div class="${cbCls}">${cbInner}</div>
        <span style="font-size:9px;font-weight:600;color:#374151;text-align:center;">${esc(s.label)}</span>
        ${subtext}
        ${!done ? picker : ''}
      </div>`;
  }).join('');

  // Notes
  const notesHtml = m.notes
    ? `<div style="margin-top:12px;font-size:11px;color:#6b7280;border-top:1px solid #ede9fe;padding-top:10px;">
         <span style="font-weight:600;color:#374151;">Notes: </span>${esc(m.notes)}
       </div>`
    : '';

  return `
<div class="pl-expand-panel open" id="expand-${esc(mutantId)}">
  <!-- Top bar -->
  <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:12px;font-weight:700;color:#1f2937;">${esc(m.mutant_name || mutantId)}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:1px;">${esc(geneName)} · ${esc(metaStr)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
      <!-- Remove -->
      <button id="rm-btn-${esc(mutantId)}"
              onclick="window.__plShowRemoveConfirm('${esc(mutantId)}')"
              style="font-size:10px;padding:3px 9px;border-radius:6px;border:1px solid #fca5a5;color:#b91c1c;background:white;cursor:pointer;">
        Remove
      </button>
      <div id="rm-confirm-${esc(mutantId)}" class="pl-remove-confirm" onclick="event.stopPropagation()">
        <span style="color:#b91c1c;">Remove from pipeline?</span>
        <button onclick="window.__plConfirmRemove('${esc(mutantId)}')"
                style="font-size:10px;font-weight:600;padding:3px 8px;background:#ef4444;color:white;border:none;border-radius:5px;cursor:pointer;">Yes</button>
        <button onclick="window.__plHideRemoveConfirm('${esc(mutantId)}')"
                style="font-size:10px;padding:3px 8px;background:#f3f4f6;color:#6b7280;border:none;border-radius:5px;cursor:pointer;">Cancel</button>
      </div>
      <!-- View full record -->
      <button onclick="window.__plGoToMutant('${esc(mutantId)}')"
              style="font-size:10px;padding:3px 9px;border-radius:6px;border:1px solid #c4b5fd;color:#7c3aed;background:white;cursor:pointer;">
        View full record →
      </button>
    </div>
  </div>

  <!-- Stage checklist -->
  <div style="display:flex;flex-wrap:wrap;gap:6px;">
    ${tiles}
  </div>

  ${notesHtml}
</div>`;
}

// ─────────────────────────────────────────────────────────────
// SECTION 4: Interaction handlers (Task 7)
// ─────────────────────────────────────────────────────────────

window.__plRowClick = function(event, mutantId) {
  // Ignore clicks on interactive inner elements
  if (event.target.closest('.pl-icon-btn, .pl-priority-confirm, .pl-picker-popup, .pl-remove-confirm')) return;

  const row = document.getElementById(`row-${mutantId}`);
  if (!row) return;

  if (_expandedIds.has(mutantId)) {
    // Collapse
    _expandedIds.delete(mutantId);
    row.classList.remove('is-expanded');
    const chev = document.getElementById(`chev-${mutantId}`);
    if (chev) chev.textContent = '›';
    const panel = document.getElementById(`expand-${mutantId}`);
    if (panel) panel.remove();
  } else {
    // Expand
    _expandedIds.add(mutantId);
    row.classList.add('is-expanded');
    const chev = document.getElementById(`chev-${mutantId}`);
    if (chev) chev.textContent = '∨';
    const m = _allMutants.find(x => x.mutant_id === mutantId);
    if (m) {
      row.insertAdjacentHTML('afterend', expandPanel(m));
      _wirePickerSelects(mutantId);
    }
  }
};

function _wirePickerSelects(_mutantId) {
  // onchange="window.__plPickerSelectChange(...)" on each select handles show/hide of the
  // "Other…" input — no additional DOM listener needed here. This function is kept as a
  // hook in case future pickers need post-render wiring.
}

window.__plPickerSelectChange = function(mutantId, stageKey) {
  const sel  = document.getElementById(`picker-who-${mutantId}-${stageKey}`);
  const wrap = document.getElementById(`picker-other-wrap-${mutantId}-${stageKey}`);
  if (sel && wrap) wrap.style.display = sel.value === '__other__' ? 'block' : 'none';
};

window.__plTileClick = function(event, mutantId, stageKey) {
  event.stopPropagation();
  const m = _allMutants.find(x => x.mutant_id === mutantId);
  if (!m) return;
  const stage = STAGES.find(s => s.key === stageKey);
  if (!stage) return;

  // Can't uncheck a done stage
  if (m.pipe && m.pipe[stage.dbBool]) return;

  const pickerId = `picker-${mutantId}-${stageKey}`;
  const picker   = document.getElementById(pickerId);
  const tile     = document.getElementById(`tile-${mutantId}-${stageKey}`);
  if (!picker) return;

  // Close other open pickers
  document.querySelectorAll('.pl-picker-popup.open').forEach(p => {
    if (p.id !== pickerId) {
      p.classList.remove('open');
      const tileId = p.id.replace('picker-', 'tile-');
      const t = document.getElementById(tileId);
      if (t) t.classList.remove('tile-picking');
    }
  });

  const isOpen = picker.classList.contains('open');
  picker.classList.toggle('open', !isOpen);
  if (tile) tile.classList.toggle('tile-picking', !isOpen);
};

window.__plPickerCancel = function(mutantId, stageKey) {
  const picker = document.getElementById(`picker-${mutantId}-${stageKey}`);
  if (picker) picker.classList.remove('open');
  const tile = document.getElementById(`tile-${mutantId}-${stageKey}`);
  if (tile) tile.classList.remove('tile-picking');
};

window.__plPickerSave = async function(mutantId, stageKey) {
  const stage = STAGES.find(s => s.key === stageKey);
  if (!stage) return;

  const sel    = document.getElementById(`picker-who-${mutantId}-${stageKey}`);
  const other  = document.getElementById(`picker-other-${mutantId}-${stageKey}`);
  const dateEl = document.getElementById(`picker-date-${mutantId}-${stageKey}`);

  let who = sel ? sel.value : '';
  if (who === '__other__') who = other ? other.value.trim() : '';
  const dt = dateEl ? dateEl.value : '';

  if (!who) {
    alert('Please select who completed this stage.');
    return;
  }

  const { error } = await sb.from('mutant_pipeline')
    .update({
      [stage.dbBool]: true,
      [stage.dbBy]:   who,
      [stage.dbDate]: dt || null,
    })
    .eq('mutant_id', mutantId);

  if (error) {
    console.error('[Pipeline] picker save error:', error);
    alert('Save failed: ' + error.message);
    return;
  }

  // Update local data
  const m = _allMutants.find(x => x.mutant_id === mutantId);
  if (m) {
    if (!m.pipe) m.pipe = {};
    m.pipe[stage.dbBool] = true;
    m.pipe[stage.dbBy]   = who;
    m.pipe[stage.dbDate] = dt || null;
  }

  // Replace expand panel
  const panel = document.getElementById(`expand-${mutantId}`);
  if (panel && m) {
    panel.outerHTML = expandPanel(m);
    _wirePickerSelects(mutantId);
  }

  // Refresh stage strip in row
  _refreshRowStrip(mutantId);
};

function _refreshRowStrip(mutantId) {
  const row = document.getElementById(`row-${mutantId}`);
  if (!row) return;
  const stripEl = row.querySelector('[data-stage-strip]');
  if (!stripEl) return;
  const m = _allMutants.find(x => x.mutant_id === mutantId);
  if (!m) return;
  const aa = m.pipe?.active_assignments || {};
  const newStrip = stageStrip(m.pipe, m.stuck_stage, !!m.is_planned, aa);
  // Parse and replace
  const tmp = document.createElement('div');
  tmp.innerHTML = newStrip;
  stripEl.replaceWith(tmp.firstElementChild);
}

window.__plIconClick = function(event, action, mutantId) {
  event.stopPropagation();
  if (action === 'priority') {
    // Close all other priority popovers
    document.querySelectorAll('.pl-priority-confirm.open').forEach(el => {
      if (el.id !== `pc-${mutantId}`) el.classList.remove('open');
    });
    const pc = document.getElementById(`pc-${mutantId}`);
    if (pc) pc.classList.toggle('open');
  } else if (action === 'priority-close') {
    const pc = document.getElementById(`pc-${mutantId}`);
    if (pc) pc.classList.remove('open');
  } else if (action === 'fav') {
    _toggleFavorite(mutantId);
  }
};

async function _toggleFavorite(mutantId) {
  if (!_userId) return;
  const isFav = _favorites.has(mutantId);
  if (isFav) {
    const { error } = await sb.from('pipeline_favorites').delete()
      .eq('user_id', _userId)
      .eq('mutant_id', mutantId);
    if (error) { console.error('[Pipeline] fav delete error:', error); return; }
    _favorites.delete(mutantId);
  } else {
    const { error } = await sb.from('pipeline_favorites').insert({
      user_id:   _userId,
      mutant_id: mutantId,
    });
    if (error) { console.error('[Pipeline] fav insert error:', error); return; }
    _favorites.add(mutantId);
  }
  _rerenderAll();
}

window.__plConfirmPriority = async function(mutantId, newValue) {
  // Close popover
  const pc = document.getElementById(`pc-${mutantId}`);
  if (pc) pc.classList.remove('open');

  const boolVal = newValue === true || newValue === 'true';

  const { error } = await sb.from('mutants')
    .update({ is_priority: boolVal })
    .eq('mutant_id', mutantId);

  if (error) {
    console.error('[Pipeline] priority update error:', error);
    return;
  }

  const m = _allMutants.find(x => x.mutant_id === mutantId);
  if (m) m.is_priority = boolVal;

  _rerenderAll();
};

window.__plShowRemoveConfirm = function(mutantId) {
  const btn     = document.getElementById(`rm-btn-${mutantId}`);
  const confirm = document.getElementById(`rm-confirm-${mutantId}`);
  if (btn)     btn.style.display     = 'none';
  if (confirm) confirm.classList.add('open');
};

window.__plHideRemoveConfirm = function(mutantId) {
  const btn     = document.getElementById(`rm-btn-${mutantId}`);
  const confirm = document.getElementById(`rm-confirm-${mutantId}`);
  if (btn)     btn.style.display     = '';
  if (confirm) confirm.classList.remove('open');
};

window.__plConfirmRemove = async function(mutantId) {
  const { error } = await sb.from('mutants')
    .update({ show_in_pipeline: false })
    .eq('mutant_id', mutantId);

  if (error) {
    console.error('[Pipeline] remove error:', error);
    return;
  }

  _allMutants = _allMutants.filter(x => x.mutant_id !== mutantId);
  _expandedIds.delete(mutantId);
  _rerenderAll();
};

window.__plGoToMutant = function(mutantId) {
  window.__openMutant = mutantId;
  const tabBtn = document.querySelector('[data-tab="mutants"]');
  if (tabBtn) tabBtn.click();
};

function _rerenderAll() {
  const content = _container?.querySelector('#pl-content');
  if (!content) return;
  content.innerHTML = buildAllGroups();
  _expandedIds.forEach(id => _wirePickerSelects(id));
}

// Close popovers/dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.pl-priority-confirm')) {
    document.querySelectorAll('.pl-priority-confirm.open').forEach(el => el.classList.remove('open'));
  }
  if (!e.target.closest('.pl-sort-dropdown') && !e.target.closest('[data-sort-btn]')) {
    document.querySelectorAll('.pl-sort-dropdown.open').forEach(el => el.classList.remove('open'));
  }
});

// ─────────────────────────────────────────────────────────────
// SECTION 5: Group renderer + renderPipeline() (Task 8)
// ─────────────────────────────────────────────────────────────

const FLAME_GROUP = FLAME_ON;
const STAR_GROUP  = STAR_ON;

const GROUP_DEFS = [
  { key: 'favorites',  title: 'Favorites',     icon: 'star',  strainFilter: false },
  { key: 'priority',   title: 'Priority',      icon: 'flame', strainFilter: false },
  { key: 'ko',         title: 'KO / Deletion', icon: null,    strainFilter: true  },
  { key: 'tn',         title: 'Transposon',    icon: null,    strainFilter: true  },
  { key: 'lucky17',    title: 'Lucky 17',      icon: null,    strainFilter: false },
  { key: 'chimeras',   title: 'Chimeras',      icon: null,    strainFilter: false },
];

function groupMutants(key) {
  let list;
  if (key === 'favorites') {
    list = _allMutants.filter(m => _favorites.has(m.mutant_id));
  } else if (key === 'priority') {
    list = _allMutants.filter(m => !!m.is_priority);
  } else {
    list = _allMutants.filter(m => categoryKey(m) === key);
    // Strain filter for ko/tn
    if (_strainFilter[key] && _strainFilter[key].size > 0) {
      list = list.filter(m => _strainFilter[key].has(strainLabel(m)));
    }
  }

  // Sort
  const sortKey = _sort[key] || 'progress';
  if (sortKey === 'progress') {
    list = [...list].sort((a, b) => progressScore(b.pipe) - progressScore(a.pipe));
  } else if (sortKey === 'id') {
    list = [...list].sort((a, b) => a.mutant_id.localeCompare(b.mutant_id));
  } else if (sortKey === 'recent') {
    // Most recently active = highest stage score (approximation without dates)
    list = [...list].sort((a, b) => progressScore(b.pipe) - progressScore(a.pipe));
  }

  return list;
}

function availableStrains(key) {
  let base;
  if (key === 'ko')  base = _allMutants.filter(m => categoryKey(m) === 'ko');
  else if (key === 'tn') base = _allMutants.filter(m => categoryKey(m) === 'tn');
  else base = _allMutants;
  const seen = new Set();
  base.forEach(m => seen.add(strainLabel(m)));
  return [...seen];
}

function renderGroup(def) {
  const { key, title, icon, strainFilter } = def;
  const allInGroup = groupMutants(key);

  // Skip empty favorites/priority
  if ((key === 'favorites' || key === 'priority') && allInGroup.length === 0) return '';

  const showAll    = !!_showAll[key];
  const PAGE_SIZE  = 5;
  const visible    = showAll ? allInGroup : allInGroup.slice(0, PAGE_SIZE);
  const hasMore    = allInGroup.length > PAGE_SIZE;

  const showStrain = strainFilter; // show strain tag in row when there's a filter

  // Icon
  const iconHtml = icon === 'star' ? STAR_GROUP
                 : icon === 'flame' ? FLAME_GROUP
                 : '';

  // Strain chips
  let strainChipsHtml = '';
  if (strainFilter) {
    const strains = availableStrains(key);
    const filter  = _strainFilter[key] || new Set();
    strainChipsHtml = strains.map(s => {
      const on     = filter.has(s);
      const baseCls = s === 'CT-L2' ? 'pl-chip-l2'
                    : s === 'CM'    ? 'pl-chip-cm'
                    : s === 'CT-D'  ? 'pl-chip-ctd'
                    : '';
      const cls = `pl-strain-chip ${on ? baseCls : 'pl-chip-off'}`;
      return `<span class="${cls}" onclick="window.__plToggleStrain('${esc(key)}','${esc(s)}')">${esc(s)}</span>`;
    }).join('');
  }

  // Sort dropdown
  const currentSort = _sort[key] || 'progress';
  const sortOpts = [
    { v: 'progress', l: 'By progress' },
    { v: 'id',       l: 'By ID'       },
    { v: 'recent',   l: 'Recent'      },
  ];
  const sortDropdown = `
    <div style="position:relative;display:inline-block;">
      <button data-sort-btn="${esc(key)}"
              onclick="event.stopPropagation();document.getElementById('sort-dd-${esc(key)}').classList.toggle('open')"
              style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid #e5e7eb;background:white;color:#6b7280;cursor:pointer;">
        ${sortOpts.find(o => o.v === currentSort)?.l ?? 'Sort'} ▾
      </button>
      <div id="sort-dd-${esc(key)}" class="pl-sort-dropdown">
        ${sortOpts.map(o => `
          <div onclick="window.__plSetSort('${esc(key)}','${o.v}')"
               style="font-size:11px;padding:8px 12px;cursor:pointer;${currentSort===o.v?'font-weight:700;color:#7c3aed;':''}"
               onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background=''">${o.l}</div>
        `).join('')}
      </div>
    </div>`;

  // Add button (only for non-favorites/non-priority groups)
  const addBtn = (key !== 'favorites' && key !== 'priority')
    ? `<button onclick="window.__plAddMutant('${esc(key)}')"
               style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid #c4b5fd;color:#7c3aed;background:white;cursor:pointer;">+ Add</button>`
    : '';

  // Group header
  const header = `
    <div style="display:flex;align-items:center;gap:6px;padding:10px 14px 8px;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;">
      ${iconHtml ? `<span style="display:flex;align-items:center;">${iconHtml}</span>` : ''}
      <span style="font-size:13px;font-weight:700;color:#1f2937;">${esc(title)}</span>
      <span style="font-size:10px;color:#9ca3af;background:#f3f4f6;border-radius:10px;padding:1px 6px;">${allInGroup.length}</span>
      ${strainChipsHtml ? `<div style="display:flex;gap:4px;align-items:center;">${strainChipsHtml}</div>` : ''}
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center;">
        ${sortDropdown}
        ${addBtn}
      </div>
    </div>`;

  // Rows
  const rowsHtml = visible.map(m => {
    const rowHtml    = mutantRow(m, { showStrain });
    const panelHtml  = _expandedIds.has(m.mutant_id) ? expandPanel(m) : '';
    return rowHtml + panelHtml;
  }).join('');

  // Show-all row
  let showAllRow = '';
  if (hasMore) {
    if (showAll) {
      showAllRow = `<div class="pl-show-all-row">
        <button onclick="window.__plShowAll('${esc(key)}',false)" style="cursor:pointer;background:none;border:none;color:#9ca3af;font-size:11px;">
          Show less ∧
        </button>
      </div>`;
    } else {
      showAllRow = `<div class="pl-show-all-row">
        <button onclick="window.__plShowAll('${esc(key)}',true)" style="cursor:pointer;background:none;border:none;color:#9ca3af;font-size:11px;">
          Show all ${allInGroup.length} ∨
        </button>
      </div>`;
    }
  }

  return `
<div class="mb-4" id="group-${esc(key)}">
  <div style="background:white;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);">
    ${header}
    <div id="group-rows-${esc(key)}">
      ${rowsHtml || '<div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">No mutants in this group.</div>'}
    </div>
    ${showAllRow}
  </div>
</div>`;
}

// Group interaction handlers
window.__plToggleStrain = function(groupKey, strain) {
  if (!_strainFilter[groupKey]) return;
  if (_strainFilter[groupKey].has(strain)) {
    _strainFilter[groupKey].delete(strain);
  } else {
    _strainFilter[groupKey].add(strain);
  }
  _rerenderAll();
};

window.__plSetSort = function(groupKey, sortValue) {
  _sort[groupKey] = sortValue;
  // Close sort dropdown
  const dd = document.getElementById(`sort-dd-${groupKey}`);
  if (dd) dd.classList.remove('open');
  _rerenderAll();
};

window.__plShowAll = function(groupKey, showAll) {
  _showAll[groupKey] = showAll;
  _rerenderAll();
};

window.__plAddMutant = async function(groupKey) {
  const mid = (prompt('Enter mutant ID to add to pipeline:') || '').trim().toUpperCase();
  if (!mid) return;

  const { error } = await sb.from('mutants')
    .update({ show_in_pipeline: true })
    .eq('mutant_id', mid);

  if (error) {
    alert('Could not add mutant: ' + error.message);
    return;
  }

  // Re-fetch and re-render
  await renderPipeline(_container);
};

window.__plExpandAll = function() {
  _allMutants.forEach(m => _expandedIds.add(m.mutant_id));
  _rerenderAll();
};

window.__plSearch = function(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('.pl-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    const visible = (!q || text.includes(q)) ? '' : 'none';
    row.style.display = visible;
    const panel = _container?.querySelector(`#expand-${CSS.escape(row.dataset.mutantId)}`);
    if (panel) panel.style.display = visible;
  });
};

function stageKeyCard() {
  const items = [
    { cls: 'skp-done',    label: 'Done'      },
    { cls: 'skp-uw',      label: 'UW'        },
    { cls: 'skp-ku',      label: 'KU'        },
    { cls: 'skp-osu',     label: 'OSU'       },
    { cls: 'skp-stuck',   label: 'Stuck'     },
    { cls: 'skp-pending', label: 'Pending'   },
  ];
  const pills = items.map(({ cls, label }) =>
    `<span class="${cls}" style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:4px;color:#374151;">${label}</span>`
  ).join('');

  return `
<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px;margin-bottom:14px;font-size:10px;color:#6b7280;">
  <span style="font-weight:600;color:#374151;">Stage strip key:</span>
  <span style="font-size:9px;font-weight:600;color:#374151;">Plasmid → Transform → Clone → PCR → WGS → Vitro → Vivo</span>
  <span style="margin-left:auto;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">${pills}</span>
</div>`;
}

function buildAllGroups() {
  return GROUP_DEFS.map(def => renderGroup(def)).join('');
}

export async function renderPipeline(container) {
  _container   = container;
  _userId      = state.user?.id ?? null;
  _expandedIds = new Set(); // reset expansion on full render

  container.innerHTML = `
    <div style="padding:18px 0 10px;">
      <h2 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 2px;">Pipeline</h2>
      <p style="font-size:12px;color:#9ca3af;margin:0;">Multi-lab mutant development tracker</p>
    </div>

    ${stageKeyCard()}

    <!-- Toolbar -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="search" placeholder="Search mutants…"
             oninput="window.__plSearch(this.value)"
             style="font-size:12px;padding:6px 12px;border:1px solid #e5e7eb;border-radius:8px;flex:1;min-width:160px;outline:none;" />
      <button id="pl-expand-all" onclick="window.__plExpandAll()"
              style="font-size:11px;padding:6px 12px;border-radius:8px;border:1px solid #e5e7eb;background:white;color:#6b7280;cursor:pointer;">
        Expand all
      </button>
    </div>

    <!-- Main content -->
    <div id="pl-content">
      <!-- loading skeleton -->
      <div style="background:white;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;padding:16px;">
        ${Array.from({length: 6}, () =>
          `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6;">
            <div style="width:80px;height:10px;background:#f3f4f6;border-radius:4px;"></div>
            <div style="flex:1;height:10px;background:#f3f4f6;border-radius:4px;"></div>
            <div style="display:flex;gap:3px;">${Array.from({length:7}, () =>
              `<div style="width:22px;height:16px;background:#f3f4f6;border-radius:4px;"></div>`
            ).join('')}</div>
          </div>`
        ).join('')}
      </div>
    </div>
  `;

  // Load data
  await fetchData();

  // Render groups
  const content = container.querySelector('#pl-content');
  if (content) content.innerHTML = buildAllGroups();

  // Wire picker selects for any already-expanded rows
  _expandedIds.forEach(id => _wirePickerSelects(id));
}
