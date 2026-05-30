# Pipeline Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Pipeline tab from a basic list into a full status-dashboard with consolidated groups, per-stage progress strips, inline expand + check-off, priority/favorites toggles, strain chip filtering, and a pipeline toggle in the mutant list.

**Architecture:** All pipeline view state (sort, strain filter, expand state) is local to `pipeline.js`. Favorites are stored in a new `pipeline_favorites` Supabase table. The page is a full rewrite of `pipeline.js` — same exported function signature `renderPipeline(container)`, same Tailwind + custom CSS approach as other views. No external dependencies added.

**Tech Stack:** Vanilla JS ES modules, Supabase JS client (`sb` from `client.js`), Tailwind CSS (CDN), custom `pipeline.css`, existing `state` object from `client.js`.

**Spec:** `docs/design/2026-05-30-pipeline-tab-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `schema/migrations/029_pipeline_enhancements.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 029_pipeline_enhancements.sql
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ── 1. mutant_pipeline: add WGS stage boolean ─────────────────────────────
ALTER TABLE mutant_pipeline
  ADD COLUMN IF NOT EXISTS wgs_complete BOOLEAN NOT NULL DEFAULT false;

-- ── 2. mutant_pipeline: per-stage completion metadata ─────────────────────
ALTER TABLE mutant_pipeline
  ADD COLUMN IF NOT EXISTS plasmid_completed_by          TEXT,
  ADD COLUMN IF NOT EXISTS plasmid_completed_date        DATE,
  ADD COLUMN IF NOT EXISTS transformation_completed_by   TEXT,
  ADD COLUMN IF NOT EXISTS transformation_completed_date DATE,
  ADD COLUMN IF NOT EXISTS cloning_completed_by          TEXT,
  ADD COLUMN IF NOT EXISTS cloning_completed_date        DATE,
  ADD COLUMN IF NOT EXISTS genotyping_completed_by       TEXT,
  ADD COLUMN IF NOT EXISTS genotyping_completed_date     DATE,
  ADD COLUMN IF NOT EXISTS wgs_completed_by              TEXT,
  ADD COLUMN IF NOT EXISTS wgs_completed_date            DATE,
  ADD COLUMN IF NOT EXISTS invitro_completed_by          TEXT,
  ADD COLUMN IF NOT EXISTS invitro_completed_date        DATE,
  ADD COLUMN IF NOT EXISTS invivo_completed_by           TEXT,
  ADD COLUMN IF NOT EXISTS invivo_completed_date         DATE;

-- ── 3. mutant_pipeline: per-stage active assignments ─────────────────────
-- JSONB format: { "wgs": {"who": "D. Rockey", "initials": "DR", "lab": "osu"} }
ALTER TABLE mutant_pipeline
  ADD COLUMN IF NOT EXISTS active_assignments JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 4. mutants: planned mutant flag ──────────────────────────────────────
ALTER TABLE mutants
  ADD COLUMN IF NOT EXISTS is_planned BOOLEAN NOT NULL DEFAULT false;

-- ── 5. mutants: priority → boolean ───────────────────────────────────────
-- Current type is TEXT; migrate existing non-null/non-empty values to true
ALTER TABLE mutants
  ALTER COLUMN priority TYPE BOOLEAN
    USING (priority IS NOT NULL AND trim(priority) != '');
ALTER TABLE mutants
  ALTER COLUMN priority SET DEFAULT false,
  ALTER COLUMN priority SET NOT NULL;

-- ── 6. pipeline_favorites table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_favorites (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutant_id  TEXT NOT NULL REFERENCES mutants(mutant_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mutant_id)
);

-- ── 7. schema/01_tables.sql sync note ────────────────────────────────────
-- After applying this migration, manually update schema/01_tables.sql to
-- reflect these columns so the canonical schema stays accurate.
```

- [ ] **Step 2: Apply migration in Supabase**

  Open Supabase Dashboard → SQL Editor → paste contents of `029_pipeline_enhancements.sql` → Run.

  Expected: no errors. If `priority` migration fails due to unexpected text values, first run:
  ```sql
  SELECT DISTINCT priority FROM mutants WHERE priority IS NOT NULL;
  ```
  and review before retrying.

- [ ] **Step 3: Verify columns exist**

  In SQL Editor:
  ```sql
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name IN ('mutant_pipeline', 'mutants', 'pipeline_favorites')
  ORDER BY table_name, ordinal_position;
  ```
  Expected: `wgs_complete`, `active_assignments`, `is_planned`, `priority` (boolean), all `_completed_by`/`_completed_date` columns, and `pipeline_favorites` table present.

- [ ] **Step 4: Commit migration file**

  ```bash
  git add schema/migrations/029_pipeline_enhancements.sql
  git commit -m "feat: pipeline DB migration — wgs stage, completion metadata, favorites, planned flag"
  ```

---

## Task 2: RLS Policies for pipeline_favorites

**Files:**
- Modify: `schema/02_rls.sql` (append)
- Apply in Supabase SQL Editor

- [ ] **Step 1: Write and apply RLS policies**

  In Supabase SQL Editor:
  ```sql
  -- Enable RLS
  ALTER TABLE pipeline_favorites ENABLE ROW LEVEL SECURITY;

  -- Lab members and admins can read their own favorites
  CREATE POLICY "pipeline_favorites_select"
    ON pipeline_favorites FOR SELECT
    USING (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM users u WHERE u.id = auth.uid()
          AND u.role IN ('lab_member', 'admin') AND u.is_approved
      )
    );

  -- Lab members and admins can insert their own favorites
  CREATE POLICY "pipeline_favorites_insert"
    ON pipeline_favorites FOR INSERT
    WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM users u WHERE u.id = auth.uid()
          AND u.role IN ('lab_member', 'admin') AND u.is_approved
      )
    );

  -- Lab members and admins can delete their own favorites
  CREATE POLICY "pipeline_favorites_delete"
    ON pipeline_favorites FOR DELETE
    USING (auth.uid() = user_id);
  ```

- [ ] **Step 2: Append policies to schema/02_rls.sql**

  Append the SQL above (with a `-- pipeline_favorites` header comment) to the end of `schema/02_rls.sql`.

- [ ] **Step 3: Commit**

  ```bash
  git add schema/02_rls.sql
  git commit -m "feat: RLS policies for pipeline_favorites"
  ```

---

## Task 3: Pipeline CSS

**Files:**
- Create: `web/css/pipeline.css`
- Modify: `web/index.html` (add link tag)

- [ ] **Step 1: Create `web/css/pipeline.css`**

```css
/* ── Pipeline tab custom styles ───────────────────────── */

/* Stage strip pills — uniform 22×16px */
.pl-sd {
  width: 22px; height: 16px; border-radius: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; flex-shrink: 0;
}
.pl-sd-done    { background: #bbf7d0; color: #15803d; }
.pl-sd-pending { background: #f3f4f6; }
.pl-sd-uw      { background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }
.pl-sd-ku      { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
.pl-sd-osu     { background: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }
.pl-sd-stuck   { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
.pl-sd-planned { background: #f9fafb; color: #9ca3af; border: 1px dashed #d1d5db; }

/* Mutant row */
.pl-row {
  display: flex; align-items: center;
  padding: 0 14px; border-bottom: 1px solid #f3f4f6;
  cursor: pointer; transition: background 0.1s; min-height: 40px;
  position: relative;
}
.pl-row:last-child { border-bottom: none; }
.pl-row:hover { background: #f9fafb; }
.pl-row.is-priority { border-left: 2.5px solid #f97316; padding-left: 11.5px; }
.pl-row.is-stuck    { border-left: 2.5px solid #ef4444; padding-left: 11.5px; }
.pl-row.is-mine     { background: #fefce8; }
.pl-row.is-planned  { background: #fafafa; }
.pl-row.is-expanded { background: #f8f7ff; border-left: 2.5px solid #7c3aed; padding-left: 11.5px; }
.pl-row.is-priority.is-mine { background: #fefce8; }

/* Icon toggle buttons (flame + star) */
.pl-icon-btn {
  width: 22px; height: 22px; display: inline-flex; align-items: center;
  justify-content: center; border-radius: 5px; cursor: pointer;
  background: transparent; border: none; padding: 0; position: relative;
  flex-shrink: 0;
}
.pl-icon-btn:hover { background: rgba(0,0,0,0.05); }

/* Priority confirm popover */
.pl-priority-confirm {
  display: none; position: absolute; top: calc(100% + 4px); left: 0; z-index: 50;
  background: white; border: 1px solid #fed7aa; border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12); padding: 10px 12px; min-width: 220px;
  text-align: left;
}
.pl-priority-confirm.open { display: block; }

/* Sort dropdown */
.pl-sort-dropdown {
  display: none; position: absolute; top: calc(100% + 4px); right: 0; z-index: 30;
  background: white; border: 1px solid #e5e7eb; border-radius: 9px;
  box-shadow: 0 4px 16px rgba(0,0,0,.1); min-width: 140px; overflow: hidden;
}
.pl-sort-dropdown.open { display: block; }

/* Expand panel */
.pl-expand-panel {
  display: none; border-top: 1px solid #ede9fe; background: #faf9ff;
  padding: 14px 16px 16px;
}
.pl-expand-panel.open { display: block; }

/* Stage checklist tile */
.pl-stage-tile {
  display: flex; flex-direction: column; align-items: center;
  background: white; border: 1px solid #e5e7eb; border-radius: 9px;
  padding: 8px 10px; min-width: 76px; cursor: pointer;
  transition: border-color 0.1s; position: relative; user-select: none;
}
.pl-stage-tile:hover { border-color: #c4b5fd; }
.pl-stage-tile.tile-done   { border-color: #86efac; background: #f0fdf4; }
.pl-stage-tile.tile-active { border-color: #c4b5fd; background: #faf5ff; }
.pl-stage-tile.tile-stuck  { border-color: #fca5a5; background: #fff5f5; }
.pl-stage-tile.tile-picking { border-color: #7c3aed; box-shadow: 0 0 0 2px #ede9fe; }

/* Stage checkbox */
.pl-tile-cb {
  width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #d1d5db;
  background: white; display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #15803d; margin-bottom: 5px; flex-shrink: 0;
}
.pl-tile-cb.checked { background: #bbf7d0; border-color: #86efac; }

/* Stage picker popup */
.pl-picker-popup {
  display: none; position: absolute; top: calc(100% + 6px); left: 50%;
  transform: translateX(-50%); background: white; border: 1px solid #c4b5fd;
  border-radius: 10px; padding: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.1);
  z-index: 40; min-width: 175px;
}
.pl-picker-popup.open { display: block; }

/* Remove confirm strip */
.pl-remove-confirm {
  display: none; align-items: center; gap: 7px; background: #fff5f5;
  border: 1px solid #fca5a5; border-radius: 8px; padding: 7px 11px; font-size: 11px;
}
.pl-remove-confirm.open { display: flex; }

/* Strain chips */
.pl-strain-chip {
  font-size: 10px; font-weight: 600; border-radius: 5px; padding: 2px 8px;
  cursor: pointer; border: 1px solid transparent; transition: all .12s; user-select: none;
}
.pl-chip-l2  { background: #ede9fe; color: #5b21b6; border-color: #c4b5fd; }
.pl-chip-cm  { background: #ffedd5; color: #c2410c; border-color: #fdba74; }
.pl-chip-ctd { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
.pl-chip-off { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; }

/* Show-all / collapse row */
.pl-show-all-row {
  padding: 8px 14px; font-size: 11px; color: #9ca3af;
  text-align: center; border-top: 1px solid #f3f4f6;
}
```

- [ ] **Step 2: Link in `web/index.html`**

  Find the existing `<link>` tags in `index.html` (or just before the closing `</head>`) and add:
  ```html
  <link rel="stylesheet" href="/css/pipeline.css">
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add web/css/pipeline.css web/index.html
  git commit -m "feat: pipeline CSS — stage pills, row states, expand panel, tiles"
  ```

---

## Task 4: Pipeline.js — Constants, Helpers, Data Fetch

**Files:**
- Modify: `web/js/views/pipeline.js` (full rewrite — start fresh)

Replace the entire file. Start with constants and data layer only; rendering functions come in Tasks 5–8.

- [ ] **Step 1: Write the new pipeline.js skeleton**

```js
// ChlamAtlas — Pipeline tab
import { sb, state } from '../client.js?v=82';

// ── Stage configuration ────────────────────────────────────────────────────
// Order matters: this is the left-to-right display order in the strip.
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

// Known personnel → {initials, lab}. Add new members here as needed.
export const PERSONNEL = {
  'K. Hybiske':  { initials: 'KH', lab: 'uw' },
  'Y. Wang':     { initials: 'YW', lab: 'uw' },
  'J. Hester':   { initials: 'JH', lab: 'uw' },
  'S. Hefty':    { initials: 'SH', lab: 'ku' },
  'D. Rockey':   { initials: 'DR', lab: 'osu' },
};

// Ordered list for the picker dropdown
export const PERSONNEL_NAMES = Object.keys(PERSONNEL);

// Lab → CSS class suffix (matches .pl-sd-uw, .pl-sd-ku, .pl-sd-osu in pipeline.css)
export const LAB_CLASS = { uw: 'uw', ku: 'ku', osu: 'osu' };

// ── Module state ──────────────────────────────────────────────────────────
// All view state is local to this module; reset on each renderPipeline() call.
let _allMutants  = [];  // raw data from Supabase
let _favorites   = new Set(); // mutant_ids favorited by current user
let _userId      = null;
let _expandedIds = new Set(); // mutant_ids currently expanded
let _container   = null;

// Per-group sort preference: groupKey → 'progress' | 'id' | 'locus'
const _sort = { ko: 'progress', tn: 'progress', lucky17: 'progress', chimeras: 'progress' };

// Per-group strain filter: groupKey → Set of strains to show (e.g. {'CT-L2', 'CM'})
const _strainFilter = { ko: new Set(['CT-L2', 'CM']), tn: new Set(['CT-L2', 'CM']) };

// Per-group collapse state: groupKey → boolean (true = show all)
const _showAll = {};

// ── Helpers ───────────────────────────────────────────────────────────────

/** Escape HTML special chars in a string. */
export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Format a DATE string (YYYY-MM-DD) for display: "May 15, 2026" */
export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Derive initials from a display name. "D. Rockey" → "DR", "K. Hybiske" → "KH" */
export function toInitials(name) {
  if (!name) return '?';
  const p = PERSONNEL[name];
  if (p) return p.initials;
  // fallback: first letter of each word
  return name.split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

/** Get lab CSS class suffix for a display name. Returns 'uw'|'ku'|'osu'|'' */
export function toLab(name) {
  if (!name) return '';
  return PERSONNEL[name]?.lab ?? '';
}

/**
 * Returns progress score for a mutant (for "Progress" sort).
 * Higher = more stages complete.
 */
export function progressScore(pipe) {
  if (!pipe) return 0;
  return STAGES.filter(s => pipe[s.dbBool]).length;
}

/**
 * Determine category key for grouping.
 * Returns 'ko' | 'tn' | 'lucky17' | 'chimeras'
 */
export function categoryKey(m) {
  const cat = (m.category ?? '').toLowerCase();
  if (cat.includes('lucky') || cat === 'lucky 17') return 'lucky17';
  if (cat.includes('chimera'))                       return 'chimeras';
  const type = (m.mutation_type ?? '').toLowerCase();
  if (type === 'transposon' || type === 'tn')        return 'tn';
  // Lambda Red, recombination, intron → KO/Deletion
  return 'ko';
}

/** Strain display label for a mutant_id or strain_id */
export function strainLabel(m) {
  const s = m.strain_id ?? '';
  if (s === 'CT-D') return 'CT-D';
  if (s === 'CM')   return 'CM';
  return 'CT-L2';
}

// ── Data fetching ─────────────────────────────────────────────────────────

async function fetchData() {
  const selectCols = STAGES.flatMap(s => [s.dbBool, s.dbBy, s.dbDate]).join(',\n      ');
  const [mutantsRes, favsRes] = await Promise.all([
    sb.from('mutants').select(`
      mutant_id, mutant_name, strain_id, target_genes, mutation_type,
      category, creator, priority, is_planned, is_archived, show_in_pipeline,
      stuck_stage, notes,
      mutant_pipeline (
        ${selectCols},
        active_assignments
      )
    `)
    .eq('show_in_pipeline', true)
    .eq('is_archived', false)
    .order('mutant_id', { ascending: true }),

    _userId
      ? sb.from('pipeline_favorites').select('mutant_id').eq('user_id', _userId)
      : Promise.resolve({ data: [] }),
  ]);

  if (mutantsRes.error) throw mutantsRes.error;
  _allMutants = mutantsRes.data ?? [];
  _favorites  = new Set((favsRes.data ?? []).map(r => r.mutant_id));
}
```

- [ ] **Step 2: Verify the file loads without errors**

  Open the browser, log in as a lab member, click the Pipeline tab. The browser console should show no import errors. The tab will render blank/empty — that's expected at this stage.

- [ ] **Step 3: Commit**

  ```bash
  git add web/js/views/pipeline.js
  git commit -m "feat: pipeline.js — constants, helpers, data fetch layer"
  ```

---

## Task 5: Stage Strip and Mutant Row Renderers

**Files:**
- Modify: `web/js/views/pipeline.js` (append functions)

- [ ] **Step 1: Append `stageStrip()` to pipeline.js**

```js
// ── Stage strip ───────────────────────────────────────────────────────────

/**
 * Renders the 7-pill stage strip for a mutant row.
 * @param {object|null} pipe - mutant_pipeline row (or null if missing)
 * @param {string|null} stuckStage - value of mutants.stuck_stage
 * @param {boolean} isPlanned - true if this is a planned (not-yet-made) mutant
 * @param {object} activeAssignments - JSONB: { stageName: {who, initials, lab} }
 */
function stageStrip(pipe, stuckStage, isPlanned, activeAssignments) {
  return `<div data-stage-strip style="display:flex;align-items:center;gap:3px;flex-shrink:0;margin-left:8px;">
    ${STAGES.map((s, i) => {
      if (!pipe) return `<div class="pl-sd pl-sd-pending" title="${s.label}"></div>`;

      const done   = !!pipe[s.dbBool];
      const stuck  = !done && stuckStage && stuckStage.toLowerCase() === s.key;
      const active = !done && !stuck && activeAssignments?.[s.key];

      if (done) {
        const by = pipe[s.dbBy];
        return `<div class="pl-sd pl-sd-done" title="${s.label}${by ? ' — ' + by : ''}">✓</div>`;
      }
      if (stuck) {
        const aa = activeAssignments?.[s.key];
        const initials = aa?.initials ?? '?';
        return `<div class="pl-sd pl-sd-stuck" title="${s.label} — stuck">${esc(initials)}</div>`;
      }
      if (active) {
        const lab = active.lab ?? '';
        const cls = lab ? `pl-sd-${lab}` : 'pl-sd-uw';
        return `<div class="pl-sd ${cls}" title="${s.label} — ${esc(active.who)}">${esc(active.initials)}</div>`;
      }
      // Pending — for planned mutants, show assignee initials in first stage if available
      if (isPlanned && i === 0 && activeAssignments?.[s.key]) {
        const aa = activeAssignments[s.key];
        return `<div class="pl-sd pl-sd-planned" title="${s.label} — planned">${esc(aa.initials)}</div>`;
      }
      return `<div class="pl-sd pl-sd-pending" title="${s.label}"></div>`;
    }).join('')}
  </div>`;
}
```

- [ ] **Step 2: Append `mutantRow()` to pipeline.js**

```js
// ── Mutant row ────────────────────────────────────────────────────────────

// SVG icons (inline, reused in every row)
const FLAME_ON  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#f97316" stroke="none"><path d="M12 2C11 5.5 10 7 10 9c0 .8.6 1.5 1.2 1.5C12 10.5 12.5 9.5 12.5 8.5 13.5 10 15 12 15 14a3 3 0 0 1-6 0c0-3.5 3-8 3-12z"/></svg>`;
const FLAME_OFF = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round"><path d="M12 2C11 5.5 10 7 10 9c0 .8.6 1.5 1.2 1.5C12 10.5 12.5 9.5 12.5 8.5 13.5 10 15 12 15 14a3 3 0 0 1-6 0c0-3.5 3-8 3-12z"/></svg>`;
const STAR_ON   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12,2 14.6,8.6 22,9.3 16.5,14.3 18.2,21.2 12,17.5 5.8,21.2 7.5,14.3 2,9.3 9.4,8.6"/></svg>`;
const STAR_OFF  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 14.6,8.6 22,9.3 16.5,14.3 18.2,21.2 12,17.5 5.8,21.2 7.5,14.3 2,9.3 9.4,8.6"/></svg>`;

/**
 * Renders a single mutant row (the collapsed view).
 * @param {object} m - mutant record (includes mutant_pipeline array)
 * @param {object} opts
 * @param {boolean} opts.showStrain - show the strain label tag
 */
function mutantRow(m, { showStrain = false } = {}) {
  const pipe   = m.mutant_pipeline?.[0] ?? null;
  const active = pipe?.active_assignments ?? {};
  const isFav  = _favorites.has(m.mutant_id);
  const isExp  = _expandedIds.has(m.mutant_id);
  const isMine = state.user && m.creator === state.userProfile?.display_name;

  const rowClasses = [
    'pl-row',
    m.priority  ? 'is-priority' : '',
    m.stuck_stage ? 'is-stuck'  : '',
    m.is_planned  ? 'is-planned' : '',
    isMine        ? 'is-mine'    : '',
    isExp         ? 'is-expanded': '',
  ].filter(Boolean).join(' ');

  const mutType = (m.mutation_type ?? '').toLowerCase();
  const typeLabel = mutType === 'transposon' || mutType === 'tn' ? 'Tn' : 'LR';
  const typeCls   = typeLabel === 'Tn'
    ? 'background:#fef3c7;color:#92400e;'
    : 'background:#ede9fe;color:#6d28d9;';

  const genes = (m.target_genes ?? []).slice(0, 2).join(', ');

  const strainTag = showStrain
    ? `<span style="font-size:9px;color:#9ca3af;flex-shrink:0;">${esc(strainLabel(m))}</span>`
    : '';

  const stuckNote = m.stuck_stage
    ? `<span style="font-size:9.5px;color:#ef4444;flex-shrink:0;">⚠ stuck</span>`
    : '';

  const plannedChip = m.is_planned
    ? `<span style="font-size:9px;font-weight:700;color:#9ca3af;background:#f3f4f6;border-radius:3px;padding:1.5px 5px;flex-shrink:0;">PLANNED</span>`
    : '';

  const mid = m.is_planned
    ? `<span style="font-size:13px;font-weight:500;color:#9ca3af;flex-shrink:0;">—</span>`
    : `<span style="font-size:13px;font-weight:700;color:#111;flex-shrink:0;">${esc(m.mutant_id)}</span>`;

  // Priority confirm popover (hidden by default; shown on flame click)
  const priorityAction = m.priority ? 'Remove priority status?' : `Mark ${esc(m.mutant_id)} as priority?`;
  const prioritySub    = m.priority ? '' : 'All lab members will see this.';
  const priorityOkTxt  = m.priority ? 'Remove' : 'Mark priority';
  const priorityOkCls  = m.priority ? 'background:#ef4444;' : 'background:#f97316;';

  return `
    <div class="${rowClasses}"
         data-mutant-id="${esc(m.mutant_id)}"
         data-is-planned="${m.is_planned ? '1' : '0'}"
         onclick="window.__plRowClick(event, '${esc(m.mutant_id)}')">
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;">
        ${plannedChip}
        ${mid}
        ${genes ? `<span style="font-size:11px;color:#6b7280;font-family:SF Mono,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${esc(genes)}</span>` : ''}
        <span style="font-size:9px;font-weight:700;border-radius:3px;padding:1.5px 5px;flex-shrink:0;${typeCls}">${typeLabel}</span>
        ${strainTag}
        ${stuckNote}
      </div>

      <!-- Priority + favorite icon buttons (stop row click) -->
      <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;" onclick="event.stopPropagation()">
        <!-- Flame / priority -->
        <button class="pl-icon-btn" data-action="priority" data-mutant-id="${esc(m.mutant_id)}"
                title="${m.priority ? 'Remove priority' : 'Mark as priority'}"
                onclick="window.__plIconClick(event,'priority','${esc(m.mutant_id)}')">
          ${m.priority ? FLAME_ON : FLAME_OFF}
          <!-- Priority confirm popover -->
          <div class="pl-priority-confirm" id="pc-${esc(m.mutant_id)}" onclick="event.stopPropagation()">
            <div style="font-size:11px;font-weight:600;color:#111;margin-bottom:3px;">${priorityAction}</div>
            ${prioritySub ? `<div style="font-size:10px;color:#6b7280;margin-bottom:9px;">${prioritySub}</div>` : '<div style="margin-bottom:9px;"></div>'}
            <div style="display:flex;gap:6px;justify-content:flex-end;">
              <button style="font-size:10px;color:#6b7280;background:white;border:1px solid #e5e7eb;border-radius:5px;padding:3px 9px;cursor:pointer;"
                      onclick="event.stopPropagation();document.getElementById('pc-${esc(m.mutant_id)}').classList.remove('open')">Cancel</button>
              <button style="font-size:10px;color:white;${priorityOkCls}border:none;border-radius:5px;padding:3px 9px;font-weight:600;cursor:pointer;"
                      onclick="event.stopPropagation();window.__plConfirmPriority('${esc(m.mutant_id)}',${m.priority ? 'false' : 'true'})">${priorityOkTxt}</button>
            </div>
          </div>
        </button>
        <!-- Star / favorite -->
        <button class="pl-icon-btn" data-action="fav" data-mutant-id="${esc(m.mutant_id)}"
                title="${isFav ? 'Remove from favorites' : 'Add to favorites'}"
                onclick="window.__plIconClick(event,'fav','${esc(m.mutant_id)}')">
          ${isFav ? STAR_ON : STAR_OFF}
        </button>
      </div>

      ${stageStrip(pipe, m.stuck_stage, m.is_planned, active)}
      <span style="color:#d1d5db;font-size:12px;margin-left:6px;flex-shrink:0;" class="pl-chev" data-mutant-id="${esc(m.mutant_id)}">${isExp ? '∨' : '›'}</span>
    </div>`;
}
```

- [ ] **Step 3: Verify in browser**

  At this point, calling `mutantRow(m)` in the browser console with a test object should return a valid HTML string. No visual output yet.

- [ ] **Step 4: Commit**

  ```bash
  git add web/js/views/pipeline.js
  git commit -m "feat: pipeline.js — stageStrip and mutantRow renderers"
  ```

---

## Task 6: Expand Panel Renderer

**Files:**
- Modify: `web/js/views/pipeline.js` (append functions)

- [ ] **Step 1: Append `expandPanel()` to pipeline.js**

```js
// ── Expand panel ──────────────────────────────────────────────────────────

/**
 * Renders the inline expand panel for a mutant.
 * Shown below the row when _expandedIds contains the mutant's id.
 */
function expandPanel(m) {
  const pipe   = m.mutant_pipeline?.[0] ?? null;
  const active = pipe?.active_assignments ?? {};
  const id     = esc(m.mutant_id ?? 'PLAN');
  const label  = m.is_planned ? 'Planned target' : esc(m.mutant_id);

  const tiles = STAGES.map(s => {
    const done    = !!(pipe?.[s.dbBool]);
    const byName  = pipe?.[s.dbBy] ?? '';
    const byDate  = pipe?.[s.dbDate] ?? '';
    const stuck   = !done && m.stuck_stage?.toLowerCase() === s.key;

    const tileCls = done ? 'tile-done' : stuck ? 'tile-stuck' : active[s.key] ? 'tile-active' : '';
    const cbCls   = done ? 'checked'  : '';

    return `
      <div class="pl-stage-tile ${tileCls}" data-stage="${s.key}" data-mutant-id="${id}"
           onclick="window.__plTileClick(event,'${id}','${s.key}')">
        <div class="pl-tile-cb ${cbCls}">${done ? '✓' : ''}</div>
        <div style="font-size:10px;font-weight:600;color:#374151;text-align:center;line-height:1.2;">${s.label}</div>
        ${done && byDate  ? `<div style="font-size:9px;color:#9ca3af;margin-top:3px;text-align:center;">${fmtDate(byDate)}</div>` : ''}
        ${done && byName  ? `<div style="font-size:9px;font-weight:600;color:#6d28d9;margin-top:2px;text-align:center;">${esc(byName)}</div>` : ''}

        <!-- Picker popup (hidden; shown by __plTileClick) -->
        <div class="pl-picker-popup" id="picker-${id}-${s.key}" onclick="event.stopPropagation()">
          <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Who completed?</div>
          <select style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;padding:4px 6px;color:#374151;background:white;margin-bottom:7px;">
            <option value="">Select person…</option>
            ${PERSONNEL_NAMES.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
            <option value="__other__">Other / free text…</option>
          </select>
          <div id="picker-other-wrap-${id}-${s.key}" style="display:none;margin-bottom:7px;">
            <input type="text" placeholder="Name…"
                   style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;padding:4px 6px;color:#374151;background:white;">
          </div>
          <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Date completed</div>
          <input type="date" id="picker-date-${id}-${s.key}" value="${new Date().toISOString().split('T')[0]}"
                 style="width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;padding:4px 6px;color:#374151;background:white;margin-bottom:7px;">
          <div style="display:flex;gap:5px;justify-content:flex-end;">
            <button style="font-size:10px;color:#6b7280;cursor:pointer;background:white;border:1px solid #e5e7eb;border-radius:5px;padding:3px 8px;"
                    onclick="window.__plPickerCancel('${id}','${s.key}')">Cancel</button>
            <button style="font-size:10px;color:white;cursor:pointer;background:#6d28d9;border:none;border-radius:5px;padding:3px 8px;font-weight:600;"
                    onclick="window.__plPickerSave('${id}','${s.key}')">Save ✓</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Remove-from-pipeline button + confirm strip
  const removeHtml = m.is_planned
    ? `<button id="rm-btn-${id}" style="font-size:11px;font-weight:500;border-radius:7px;padding:5px 11px;cursor:pointer;border:1px solid #fca5a5;background:white;color:#dc2626;white-space:nowrap;"
              onclick="window.__plShowRemoveConfirm('${id}')">Remove planned target</button>`
    : `<button id="rm-btn-${id}" style="font-size:11px;font-weight:500;border-radius:7px;padding:5px 11px;cursor:pointer;border:1px solid #fca5a5;background:white;color:#dc2626;white-space:nowrap;"
              onclick="window.__plShowRemoveConfirm('${id}')">Remove from pipeline</button>`;

  return `
    <div class="pl-expand-panel open" id="expand-${id}">
      <!-- Top bar -->
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#111;">${label}${m.mutant_name ? ' — ' + esc(m.mutant_name) : ''}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">
            ${esc(m.mutation_type ?? '')} · ${esc(strainLabel(m))} · ${m.creator ? 'Created by ' + esc(m.creator) : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <div id="rm-wrap-${id}">${removeHtml}</div>
          <div class="pl-remove-confirm" id="rm-confirm-${id}">
            <span style="color:#7f1d1d;font-weight:500;flex:1;">Remove ${label} from pipeline?</span>
            <button style="font-size:11px;color:#6b7280;cursor:pointer;background:white;border:1px solid #e5e7eb;border-radius:5px;padding:3px 9px;"
                    onclick="window.__plHideRemoveConfirm('${id}')">Cancel</button>
            <button style="font-size:11px;color:white;cursor:pointer;background:#dc2626;border:none;border-radius:5px;padding:3px 9px;font-weight:600;"
                    onclick="window.__plConfirmRemove('${id}')">Remove</button>
          </div>
          ${m.is_planned ? '' : `<button style="font-size:11px;font-weight:500;border-radius:7px;padding:5px 11px;cursor:pointer;border:none;background:#6d28d9;color:white;"
                onclick="window.__plGoToMutant('${id}')">View full record →</button>`}
        </div>
      </div>

      <!-- Stage checklist -->
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Stage completion — click to update</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${tiles}</div>

      ${m.notes ? `<div style="border-top:1px solid #ede9fe;padding-top:10px;margin-top:10px;font-size:11px;color:#6b7280;font-style:italic;">${esc(m.notes)}</div>` : ''}
    </div>`;
}
```

- [ ] **Step 2: Commit**

  ```bash
  git add web/js/views/pipeline.js
  git commit -m "feat: pipeline.js — expandPanel renderer with stage tiles and picker markup"
  ```

---

## Task 7: Interaction Handlers

**Files:**
- Modify: `web/js/views/pipeline.js` (append event handlers)

These are attached to `window` so inline onclick handlers in the HTML can reach them without module scope issues (consistent with the pattern used elsewhere in this codebase).

- [ ] **Step 1: Append all handlers to pipeline.js**

```js
// ── Event handlers (attached to window for inline onclick access) ─────────

/** Row click: toggle expand panel. */
window.__plRowClick = function(event, mutantId) {
  // Don't expand if click was on an icon button or picker
  if (event.target.closest('.pl-icon-btn, .pl-priority-confirm, .pl-picker-popup, .pl-remove-confirm')) return;

  if (_expandedIds.has(mutantId)) {
    _expandedIds.delete(mutantId);
  } else {
    _expandedIds.add(mutantId);
  }
  // Re-render just this row + its panel in place
  const rowEl = _container.querySelector(`.pl-row[data-mutant-id="${CSS.escape(mutantId)}"]`);
  const panelEl = _container.querySelector(`#expand-${CSS.escape(mutantId)}`);
  const m = _allMutants.find(x => x.mutant_id === mutantId);
  if (!rowEl || !m) return;

  const expanded = _expandedIds.has(mutantId);
  rowEl.className = rowEl.className.replace('is-expanded', '').trim() + (expanded ? ' is-expanded' : '');
  const chev = rowEl.querySelector('.pl-chev');
  if (chev) chev.textContent = expanded ? '∨' : '›';

  if (expanded && !panelEl) {
    // Insert panel after row
    rowEl.insertAdjacentHTML('afterend', expandPanel(m));
    _wirePickerSelects(mutantId);
  } else if (!expanded && panelEl) {
    panelEl.remove();
  }
};

/** Wire the "Other / free text…" select option for pickers */
function _wirePickerSelects(mutantId) {
  STAGES.forEach(s => {
    const sel = _container.querySelector(`#picker-${CSS.escape(mutantId)}-${s.key} select`);
    const wrap = _container.querySelector(`#picker-other-wrap-${CSS.escape(mutantId)}-${s.key}`);
    if (sel && wrap) {
      sel.addEventListener('change', () => {
        wrap.style.display = sel.value === '__other__' ? 'block' : 'none';
      });
    }
  });
}

/** Stage tile click: open picker popup. */
window.__plTileClick = function(event, mutantId, stageKey) {
  event.stopPropagation();
  const m = _allMutants.find(x => x.mutant_id === mutantId);
  const pipe = m?.mutant_pipeline?.[0];
  const stage = STAGES.find(s => s.key === stageKey);
  if (!stage || !pipe) return;
  if (pipe[stage.dbBool]) return; // already done — do nothing on click for now

  // Close any other open pickers
  _container.querySelectorAll('.pl-picker-popup.open').forEach(p => {
    if (p.id !== `picker-${mutantId}-${stageKey}`) p.classList.remove('open');
  });
  const picker = _container.querySelector(`#picker-${CSS.escape(mutantId)}-${stageKey}`);
  picker?.classList.toggle('open');
  const tile = picker?.closest('.pl-stage-tile');
  tile?.classList.toggle('tile-picking', picker?.classList.contains('open'));
};

/** Cancel picker. */
window.__plPickerCancel = function(mutantId, stageKey) {
  const picker = _container.querySelector(`#picker-${CSS.escape(mutantId)}-${stageKey}`);
  picker?.classList.remove('open');
  picker?.closest('.pl-stage-tile')?.classList.remove('tile-picking');
};

/** Save picker: mark stage complete in Supabase and update UI. */
window.__plPickerSave = async function(mutantId, stageKey) {
  const picker = _container.querySelector(`#picker-${CSS.escape(mutantId)}-${stageKey}`);
  if (!picker) return;

  const sel     = picker.querySelector('select');
  const otherIn = picker.querySelector('input[type=text]');
  const dateIn  = picker.querySelector('input[type=date]');
  let who  = sel?.value === '__other__' ? (otherIn?.value?.trim() ?? '') : (sel?.value ?? '');
  const dt = dateIn?.value ?? new Date().toISOString().split('T')[0];
  if (!who) { alert('Please select who completed this stage.'); return; }

  const stage = STAGES.find(s => s.key === stageKey);
  if (!stage) return;

  const { error } = await sb.from('mutant_pipeline').update({
    [stage.dbBool]: true,
    [stage.dbBy]:   who,
    [stage.dbDate]: dt,
  }).eq('mutant_id', mutantId);

  if (error) { alert('Save failed: ' + error.message); return; }

  // Update local data
  const m    = _allMutants.find(x => x.mutant_id === mutantId);
  const pipe = m?.mutant_pipeline?.[0];
  if (pipe) {
    pipe[stage.dbBool] = true;
    pipe[stage.dbBy]   = who;
    pipe[stage.dbDate] = dt;
  }

  // Re-render the expand panel in place
  const panelEl = _container.querySelector(`#expand-${CSS.escape(mutantId)}`);
  if (panelEl && m) {
    panelEl.outerHTML = expandPanel(m);
    _wirePickerSelects(mutantId);
  }
  // Also refresh the stage strip in the row
  _refreshRowStrip(mutantId);
};

/** Refresh the stage strip inside an already-rendered row. */
function _refreshRowStrip(mutantId) {
  const m    = _allMutants.find(x => x.mutant_id === mutantId);
  const pipe = m?.mutant_pipeline?.[0] ?? null;
  const rowEl = _container.querySelector(`.pl-row[data-mutant-id="${CSS.escape(mutantId)}"]`);
  if (!rowEl || !m) return;
  const oldStrip = rowEl.querySelector('[data-stage-strip]');
  if (oldStrip) {
    const newStrip = document.createElement('div');
    newStrip.innerHTML = stageStrip(pipe, m.stuck_stage, m.is_planned, pipe?.active_assignments ?? {});
    oldStrip.replaceWith(newStrip.firstChild);
  }
}

/** Icon button click: priority or favorite */
window.__plIconClick = function(event, action, mutantId) {
  event.stopPropagation();
  if (action === 'priority') {
    // Toggle confirm popover visibility
    const pc = document.getElementById(`pc-${mutantId}`);
    document.querySelectorAll('.pl-priority-confirm.open').forEach(el => {
      if (el !== pc) el.classList.remove('open');
    });
    pc?.classList.toggle('open');
  } else if (action === 'fav') {
    _toggleFavorite(mutantId);
  }
};

/** Instantly toggle favorite and re-render the row icon. */
async function _toggleFavorite(mutantId) {
  if (!_userId) return;
  const isFav = _favorites.has(mutantId);
  if (isFav) {
    await sb.from('pipeline_favorites').delete()
      .eq('user_id', _userId).eq('mutant_id', mutantId);
    _favorites.delete(mutantId);
  } else {
    await sb.from('pipeline_favorites').insert({ user_id: _userId, mutant_id: mutantId });
    _favorites.add(mutantId);
  }
  _rerenderGroupsWithId(mutantId);
}

/** Confirm priority change and write to DB. */
window.__plConfirmPriority = async function(mutantId, newValue) {
  document.getElementById(`pc-${mutantId}`)?.classList.remove('open');
  const { error } = await sb.from('mutants').update({ priority: newValue === 'true' || newValue === true })
    .eq('mutant_id', mutantId);
  if (error) { alert('Failed: ' + error.message); return; }
  const m = _allMutants.find(x => x.mutant_id === mutantId);
  if (m) m.priority = (newValue === 'true' || newValue === true);
  _rerenderGroupsWithId(mutantId);
};

/** Show remove confirm strip. */
window.__plShowRemoveConfirm = function(mutantId) {
  document.getElementById(`rm-btn-${mutantId}`)?.closest('#rm-wrap-' + mutantId)?.classList.add('hidden');
  document.getElementById(`rm-confirm-${mutantId}`)?.classList.add('open');
};
window.__plHideRemoveConfirm = function(mutantId) {
  document.getElementById(`rm-btn-${mutantId}`)?.closest('#rm-wrap-' + mutantId)?.classList.remove('hidden');
  document.getElementById(`rm-confirm-${mutantId}`)?.classList.remove('open');
};

/** Confirm remove from pipeline. */
window.__plConfirmRemove = async function(mutantId) {
  const { error } = await sb.from('mutants').update({ show_in_pipeline: false })
    .eq('mutant_id', mutantId);
  if (error) { alert('Failed: ' + error.message); return; }
  _allMutants = _allMutants.filter(x => x.mutant_id !== mutantId);
  _expandedIds.delete(mutantId);
  _rerenderAll();
};

/** Navigate to mutant in the Mutants tab. */
window.__plGoToMutant = function(mutantId) {
  window.__openMutant = mutantId;
  document.querySelector('[data-tab="mutants"]')?.click();
};

/**
 * Re-render all groups that contain a specific mutant.
 * Called after priority/fav changes to refresh affected groups without full reload.
 */
function _rerenderGroupsWithId(mutantId) {
  // Full re-render is simplest and fast enough for ~50 mutants
  _rerenderAll();
}

/** Re-render the entire pipeline content area. */
function _rerenderAll() {
  const content = _container.querySelector('#pl-content');
  if (content) content.innerHTML = buildAllGroups();
  _bindGroupInteractions();
}

// Close popovers on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.pl-priority-confirm.open').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.pl-sort-dropdown.open').forEach(el => el.classList.remove('open'));
});
```

- [ ] **Step 2: Commit**

  ```bash
  git add web/js/views/pipeline.js
  git commit -m "feat: pipeline.js — all interaction handlers (expand, picker, priority, favorites, remove)"
  ```

---

## Task 8: Group Renderer and Page Assembly

**Files:**
- Modify: `web/js/views/pipeline.js` (append remaining functions + `renderPipeline`)

- [ ] **Step 1: Append group building functions**

```js
// ── Group helpers ─────────────────────────────────────────────────────────

const GROUP_DEFS = [
  { key: 'favorites',  title: 'Favorites',     icon: 'star',  strainFilter: false },
  { key: 'priority',   title: 'Priority',      icon: 'flame', strainFilter: false },
  { key: 'ko',         title: 'KO / Deletion', icon: null,    strainFilter: true  },
  { key: 'tn',         title: 'Transposon',    icon: null,    strainFilter: true  },
  { key: 'lucky17',    title: 'Lucky 17',      icon: null,    strainFilter: false },
  { key: 'chimeras',   title: 'Chimeras',      icon: null,    strainFilter: false },
];

const FLAME_GROUP = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#f97316" stroke="none"><path d="M12 2C11 5.5 10 7 10 9c0 .8.6 1.5 1.2 1.5C12 10.5 12.5 9.5 12.5 8.5 13.5 10 15 12 15 14a3 3 0 0 1-6 0c0-3.5 3-8 3-12z"/></svg>`;
const STAR_GROUP  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12,2 14.6,8.6 22,9.3 16.5,14.3 18.2,21.2 12,17.5 5.8,21.2 7.5,14.3 2,9.3 9.4,8.6"/></svg>`;

const SORT_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>`;

/** Get mutants for a group key, already filtered and sorted. */
function groupMutants(key) {
  let list;
  if (key === 'favorites') {
    list = _allMutants.filter(m => _favorites.has(m.mutant_id));
  } else if (key === 'priority') {
    list = _allMutants.filter(m => m.priority);
  } else {
    list = _allMutants.filter(m => categoryKey(m) === key);
  }

  // Apply strain filter for ko/tn
  if ((key === 'ko' || key === 'tn') && _strainFilter[key].size < 3) {
    list = list.filter(m => _strainFilter[key].has(strainLabel(m)));
  }

  // Sort
  const sortKey = _sort[key] ?? 'progress';
  if (sortKey === 'progress') {
    list = [...list].sort((a, b) => {
      const pa = progressScore(a.mutant_pipeline?.[0]);
      const pb = progressScore(b.mutant_pipeline?.[0]);
      return pb - pa || (a.mutant_id ?? '').localeCompare(b.mutant_id ?? '');
    });
  } else if (sortKey === 'id') {
    list = [...list].sort((a, b) => (a.mutant_id ?? '').localeCompare(b.mutant_id ?? ''));
  } else if (sortKey === 'locus') {
    list = [...list].sort((a, b) => {
      const la = (a.target_genes?.[0] ?? '');
      const lb = (b.target_genes?.[0] ?? '');
      return la.localeCompare(lb);
    });
  }
  return list;
}

/** Available strains for a given group (only strains present in data). */
function availableStrains(key) {
  const all = _allMutants.filter(m => categoryKey(m) === key);
  return [...new Set(all.map(strainLabel))];
}

/** Render a full group section. */
function renderGroup(def) {
  const { key, title, icon, strainFilter } = def;
  const mutants = groupMutants(key);
  const showStrain = key === 'ko' || key === 'tn';
  const defaultShow = 5;
  const showingAll  = !!_showAll[key];
  const visible     = showingAll ? mutants : mutants.slice(0, defaultShow);
  const hidden      = mutants.length - visible.length;

  const iconSvg = icon === 'flame' ? FLAME_GROUP : icon === 'star' ? STAR_GROUP : '';

  // Strain chips for ko/tn groups
  const strains = strainFilter ? availableStrains(key) : [];
  const chipHtml = strains.map(s => {
    const cls = s === 'CT-L2' ? 'l2' : s === 'CM' ? 'cm' : 'ctd';
    const active = _strainFilter[key]?.has(s) ?? true;
    return `<span class="pl-strain-chip pl-chip-${cls}${active ? '' : ' pl-chip-off'}"
                  data-group="${key}" data-strain="${esc(s)}"
                  onclick="window.__plToggleStrain('${key}','${esc(s)}')">${esc(s)}</span>`;
  }).join('');

  const sortKey = _sort[key] ?? 'progress';
  const sortDropdown = (key !== 'favorites' && key !== 'priority') ? `
    <div style="position:relative;">
      <button style="display:flex;align-items:center;gap:4px;background:white;border:1px solid #e5e7eb;border-radius:7px;padding:4px 9px;font-size:11px;color:#6b7280;cursor:pointer;"
              onclick="event.stopPropagation();document.getElementById('sd-${key}').classList.toggle('open')">
        ${SORT_ICON} Sort
      </button>
      <div class="pl-sort-dropdown" id="sd-${key}">
        ${['progress','id','locus'].map(s => `
          <div style="padding:8px 12px;font-size:11px;color:${sortKey===s?'#6d28d9':'#374151'};cursor:pointer;font-weight:${sortKey===s?'600':'400'};"
               onclick="window.__plSetSort('${key}','${s}')">
            ${sortKey===s?'✓ ':'　'}${s==='progress'?'Progress':s==='id'?'Mutant ID':'Locus tag'}
          </div>`).join('')}
      </div>
    </div>` : '';

  const addBtn = `
    <button style="display:flex;align-items:center;gap:4px;background:white;border:1px solid #e5e7eb;border-radius:7px;padding:4px 10px;font-size:11px;font-weight:500;color:#6b7280;cursor:pointer;"
            onclick="window.__plAddMutant('${key}')">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add
    </button>`;

  const rowsHtml = visible.length === 0
    ? `<div style="padding:14px;text-align:center;color:#9ca3af;font-size:12px;">No mutants${strainFilter && _strainFilter[key]?.size === 0 ? ' — enable a strain filter above' : ''}.</div>`
    : visible.map(m => mutantRow(m, { showStrain }) + ((_expandedIds.has(m.mutant_id)) ? expandPanel(m) : '')).join('');

  const showAllRow = hidden > 0
    ? `<div class="pl-show-all-row">${hidden} more ·
         <a href="#" onclick="event.preventDefault();window.__plShowAll('${key}',true)">Show all</a>
         &nbsp;|&nbsp;
         <button class="collapse-btn" onclick="window.__plShowAll('${key}',false)"
                 style="font-size:11px;color:#6366f1;font-weight:500;cursor:pointer;background:none;border:none;">Collapse ↑</button>
       </div>`
    : showingAll && mutants.length > defaultShow
      ? `<div class="pl-show-all-row">
           <button onclick="window.__plShowAll('${key}',false)"
                   style="font-size:11px;color:#6366f1;font-weight:500;cursor:pointer;background:none;border:none;">Collapse ↑</button>
         </div>`
      : '';

  return `
    <div class="mb-5" data-group="${key}">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:7px;padding:0 2px;">
        ${iconSvg}
        <span style="font-size:11.5px;font-weight:700;color:#374151;letter-spacing:.04em;text-transform:uppercase;">${esc(title)}</span>
        <span style="font-size:11px;color:#9ca3af;">${mutants.length}</span>
        ${chipHtml ? `<div style="display:flex;gap:4px;">${chipHtml}</div>` : ''}
        <div style="display:flex;gap:6px;margin-left:auto;align-items:center;">
          ${sortDropdown}
          ${key !== 'favorites' && key !== 'priority' ? addBtn : ''}
        </div>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:14px;overflow:visible;">
        ${rowsHtml}
        ${showAllRow}
      </div>
    </div>`;
}

/** Render all groups. */
function buildAllGroups() {
  return GROUP_DEFS.map(def => {
    // Skip Favorites and Priority groups if empty
    if ((def.key === 'favorites' || def.key === 'priority') && groupMutants(def.key).length === 0) return '';
    return renderGroup(def);
  }).join('');
}

// ── Group interaction handlers ─────────────────────────────────────────────

window.__plToggleStrain = function(groupKey, strain) {
  const f = _strainFilter[groupKey];
  if (!f) return;
  if (f.has(strain)) { f.delete(strain); } else { f.add(strain); }
  _rerenderAll();
};

window.__plSetSort = function(groupKey, sortValue) {
  _sort[groupKey] = sortValue;
  document.getElementById(`sd-${groupKey}`)?.classList.remove('open');
  _rerenderAll();
};

window.__plShowAll = function(groupKey, showAll) {
  _showAll[groupKey] = showAll;
  _rerenderAll();
};

window.__plAddMutant = function(groupKey) {
  // Minimal: prompt for mutant_id and open the mutant in the Mutants tab.
  // A more complete "add planned target" modal can be built in a follow-up.
  const mid = prompt('Enter mutant ID to add to pipeline (or type PLAN_XXX for a planned target):');
  if (!mid?.trim()) return;
  sb.from('mutants').update({ show_in_pipeline: true }).eq('mutant_id', mid.trim())
    .then(({ error }) => {
      if (error) { alert('Not found or error: ' + error.message); return; }
      renderPipeline(_container); // full reload
    });
};

function _bindGroupInteractions() {
  // Nothing needed — all interactions use window.__ handlers
}
```

- [ ] **Step 2: Append the stage key card + renderPipeline()**

```js
// ── Stage key card ────────────────────────────────────────────────────────
function stageKeyCard() {
  const items = [
    { cls: 'skp-done',    label: 'Done'        },
    { cls: 'skp-uw',      label: 'UW active'   },
    { cls: 'skp-ku',      label: 'KU active'   },
    { cls: 'skp-osu',     label: 'OSU active'  },
    { cls: 'skp-stuck',   label: 'Stuck'       },
    { cls: 'skp-pending', label: 'Not started' },
  ];
  const legendHtml = items.map(({ cls, label }) =>
    `<div style="display:flex;align-items:center;gap:4px;font-size:9.5px;color:#6b7280;">
       <div style="width:18px;height:12px;border-radius:3px;" class="${cls}"></div>${esc(label)}
     </div>`).join('');

  return `
    <div style="flex-shrink:0;background:white;border:1px solid #e5e7eb;border-radius:12px;padding:9px 14px;min-width:230px;max-width:280px;">
      <div style="font-size:9.5px;color:#6b7280;margin-bottom:7px;line-height:1.5;">
        <strong style="color:#374151;">Stages:</strong> Plasmid · Transform · Clone · PCR · WGS · In vitro · In vivo
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px 10px;">${legendHtml}</div>
    </div>`;
}

// ── Main export ───────────────────────────────────────────────────────────

export async function renderPipeline(container) {
  _container = container;
  _userId = state.user?.id ?? null;

  // Reset per-render state (but preserve sort/filter prefs across re-renders within session)
  _expandedIds.clear();

  container.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:14px;margin-top:20px;">
      <div>
        <h2 style="font-size:21px;font-weight:700;color:#111;">Pipeline</h2>
        <p style="font-size:12px;color:#9ca3af;margin-top:2px;">Multi-lab mutant development · Lab members only</p>
      </div>
      ${stageKeyCard()}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
      <button id="pl-expand-all" style="font-size:11px;color:#6b7280;background:white;border:1px solid #e5e7eb;border-radius:7px;padding:5px 11px;cursor:pointer;font-weight:500;">Expand all ▾</button>
      <input id="pl-search" type="text" placeholder="Search pipeline…"
             style="margin-left:auto;background:white;border:1px solid #e5e7eb;border-radius:8px;padding:5px 10px;font-size:12px;color:#374151;outline:none;min-width:180px;"
             oninput="window.__plSearch(this.value)">
    </div>
    <div id="pl-content">
      <div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px;">Loading pipeline…</div>
    </div>`;

  try {
    await fetchData();
  } catch (err) {
    container.querySelector('#pl-content').innerHTML =
      `<p style="color:#ef4444;font-size:13px;padding:20px;">${esc(err.message)}</p>`;
    return;
  }

  container.querySelector('#pl-content').innerHTML = buildAllGroups();

  // Expand all button
  container.querySelector('#pl-expand-all')?.addEventListener('click', () => {
    _allMutants.forEach(m => _expandedIds.add(m.mutant_id));
    _rerenderAll();
  });
}

/** Simple search: hide rows whose ID/gene doesn't match query. */
window.__plSearch = function(query) {
  const q = query.toLowerCase().trim();
  _container.querySelectorAll('.pl-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
};
```

- [ ] **Step 3: Update the import version in `app.js`**

  In `web/js/app.js`, change:
  ```js
  import { renderPipeline } from './views/pipeline.js?v=65';
  ```
  to:
  ```js
  import { renderPipeline } from './views/pipeline.js?v=82';
  ```

- [ ] **Step 4: Add the CSS color classes that stageKeyCard references**

  Append to `web/css/pipeline.css`:
  ```css
  /* Stage key legend pills */
  .skp-done    { background: #bbf7d0; }
  .skp-uw      { background: #ede9fe; border: 1px solid #c4b5fd; }
  .skp-ku      { background: #dbeafe; border: 1px solid #93c5fd; }
  .skp-osu     { background: #ffedd5; border: 1px solid #fdba74; }
  .skp-stuck   { background: #fee2e2; border: 1px solid #fca5a5; }
  .skp-pending { background: #f3f4f6; }
  ```

- [ ] **Step 5: Load in browser and verify**

  Log in as a lab member, navigate to Pipeline tab.
  
  Expected:
  - Page loads with "Loading pipeline…" then renders groups
  - Mutants appear grouped: KO/Deletion, Transposon, Lucky 17, Chimeras
  - Stage strips show colored pills for active stages
  - Clicking a row expands the inline panel
  - Check console for JS errors — there should be none

- [ ] **Step 6: Commit**

  ```bash
  git add web/js/views/pipeline.js web/js/app.js web/css/pipeline.css
  git commit -m "feat: pipeline.js — group renderer, page chrome, renderPipeline() assembly"
  ```

---

## Task 9: Mutant List — Pipeline Toggle Icon

**Files:**
- Modify: `web/js/views/mutants.js`

The mutant list already renders rows. This task adds a pipeline toggle icon (flow nodes SVG, 16px) to the right side of each row. Lab members only. Clicking confirms and toggles `show_in_pipeline`.

- [ ] **Step 1: Locate the row rendering function in mutants.js**

  Search for the function that renders individual mutant rows (look for `data-mid` or the row template string). It will be in a `map()` call over the mutant list.

- [ ] **Step 2: Add the pipeline toggle icon SVG helpers at top of mutants.js**

  Near the top of `mutants.js` (after imports), add:
  ```js
  // Pipeline toggle icons — lab members only, shown in each mutant row
  const PL_ICON_ON = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="4" cy="12" r="3" fill="#7c3aed"/>
    <line x1="7" y1="12" x2="9" y2="12" stroke="#7c3aed" stroke-width="2"/>
    <circle cx="12" cy="12" r="3" fill="#7c3aed"/>
    <line x1="15" y1="12" x2="17" y2="12" stroke="#7c3aed" stroke-width="2"/>
    <circle cx="20" cy="12" r="3" fill="#7c3aed"/>
  </svg>`;

  const PL_ICON_OFF = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="4" cy="12" r="3" fill="none" stroke="#d1d5db" stroke-width="2"/>
    <line x1="7" y1="12" x2="9" y2="12" stroke="#d1d5db" stroke-width="2"/>
    <circle cx="12" cy="12" r="3" fill="none" stroke="#d1d5db" stroke-width="2"/>
    <line x1="15" y1="12" x2="17" y2="12" stroke="#d1d5db" stroke-width="2"/>
    <circle cx="20" cy="12" r="3" fill="none" stroke="#d1d5db" stroke-width="2"/>
  </svg>`;
  ```

- [ ] **Step 3: Find where the mutant row HTML is built and add the toggle button**

  In the row template, immediately before the closing `</div>` of the row (or alongside other action icons), add:

  ```js
  // Inside the row template string, after existing content:
  ${(['lab_member','admin'].includes(state.userRole)) ? `
    <button
      style="display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:4px;cursor:pointer;border-radius:5px;flex-shrink:0;"
      title="${m.show_in_pipeline ? 'Remove from pipeline' : 'Add to pipeline'}"
      onclick="event.stopPropagation();window.__mutPipelineToggle(event,'${esc(m.mutant_id)}',${m.show_in_pipeline ? 'true' : 'false'})"
      data-pipeline-btn="${esc(m.mutant_id)}">
      ${m.show_in_pipeline ? PL_ICON_ON : PL_ICON_OFF}
    </button>` : ''}
  ```

  Note: `m.show_in_pipeline` must be included in the Supabase select query for mutant rows. Add `show_in_pipeline` to the select string if it isn't there already.

- [ ] **Step 4: Add the toggle handler (append to mutants.js)**

  ```js
  window.__mutPipelineToggle = async function(event, mutantId, currentlyIn) {
    event.stopPropagation();
    const newVal = !currentlyIn;
    const msg = newVal
      ? `Add ${mutantId} to the Pipeline tab?`
      : `Remove ${mutantId} from the Pipeline tab?`;
    if (!confirm(msg)) return;

    const { error } = await sb.from('mutants')
      .update({ show_in_pipeline: newVal })
      .eq('mutant_id', mutantId);
    if (error) { alert('Error: ' + error.message); return; }

    // Update the icon in place
    const btn = document.querySelector(`[data-pipeline-btn="${CSS.escape(mutantId)}"]`);
    if (btn) {
      btn.title = newVal ? 'Remove from pipeline' : 'Add to pipeline';
      btn.innerHTML = newVal ? PL_ICON_ON : PL_ICON_OFF;
      btn.setAttribute('onclick',
        `event.stopPropagation();window.__mutPipelineToggle(event,'${mutantId}',${newVal})`);
    }
  };
  ```

  Note: `confirm()` is used here for the simple confirm requirement. This matches the AppSheet pattern and keeps this task simple. If a custom in-row confirm is preferred, it can be added in a follow-up.

- [ ] **Step 5: Update import version in app.js**

  Increment the `?v=` on the mutants.js import in `app.js`.

- [ ] **Step 6: Verify**

  As a lab member, open any mutant list. Each row should show the flow-nodes icon on the right. Clicking it on a mutant NOT in the pipeline should prompt "Add [ID] to the Pipeline tab?" — confirm and then verify the Pipeline tab shows the mutant.

- [ ] **Step 7: Commit**

  ```bash
  git add web/js/views/mutants.js web/js/app.js
  git commit -m "feat: mutant list — pipeline toggle icon for lab members"
  ```

---

## Task 10: Pipeline Tab Nav Icon

**Files:**
- Modify: `web/index.html` — the pipeline tab button in the nav

- [ ] **Step 1: Find the Pipeline tab button in index.html**

  Search for `data-tab="pipeline"`. It will have either an emoji or no icon.

- [ ] **Step 2: Replace/add the icon SVG**

  Set the button content to use the flow-nodes SVG at nav size (22px):

  ```html
  <!-- Flow nodes icon for Pipeline nav tab -->
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;">
    <circle cx="4" cy="12" r="3" fill="currentColor"/>
    <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
    <line x1="15" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="2"/>
    <circle cx="20" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
  </svg>
  <span>Pipeline</span>
  ```

  The partially-open last node at nav size hints at "in progress / ongoing" — appropriate for a pipeline tracker.

- [ ] **Step 3: Verify**

  Check that the tab icon renders at nav size and that the tab label "Pipeline" is visible. The icon should look like the flow-nodes design from the brainstorm mockups.

- [ ] **Step 4: Commit**

  ```bash
  git add web/index.html
  git commit -m "feat: pipeline nav tab — flow nodes icon"
  ```

---

## Task 11: Schema Doc Sync + Push

**Files:**
- Modify: `schema/01_tables.sql` — add new columns to documentation
- Push to `origin/dev`

- [ ] **Step 1: Update schema/01_tables.sql**

  In the `mutant_pipeline` CREATE TABLE block, add the new columns (with comments). In the `mutants` CREATE TABLE block, update `priority` to `BOOLEAN DEFAULT false`, and add `is_planned BOOLEAN NOT NULL DEFAULT false`. Add the `pipeline_favorites` table definition.

- [ ] **Step 2: Final smoke test**

  As a lab member:
  1. Pipeline tab loads without errors
  2. Mutants appear in correct groups
  3. Stage strips show correct colors and initials
  4. Click a row → expand panel opens with stage tiles
  5. Click an unchecked tile → picker popup appears
  6. Fill picker → save → tile turns green with date+who, strip updates
  7. Click flame icon → confirm popover appears → confirm → row updates
  8. Click star → instantly toggles → Favorites group updates
  9. "Remove from pipeline" → confirm → mutant disappears from list
  10. In mutant list → pipeline icon appears → clicking toggles correctly

- [ ] **Step 3: Commit and push**

  ```bash
  git add schema/01_tables.sql
  git commit -m "docs: update schema/01_tables.sql to reflect migration 029"
  git push origin dev
  ```

  Vercel will build a preview URL for review.

---

## Summary of files changed

| File | Change |
|---|---|
| `schema/migrations/029_pipeline_enhancements.sql` | New — DB migration |
| `schema/01_tables.sql` | Updated column docs |
| `schema/02_rls.sql` | Appended pipeline_favorites policies |
| `web/css/pipeline.css` | New — custom pipeline styles |
| `web/index.html` | Added pipeline.css link + nav icon |
| `web/js/views/pipeline.js` | Full rewrite |
| `web/js/views/mutants.js` | Added pipeline toggle icon |
| `web/js/app.js` | Updated import versions |
