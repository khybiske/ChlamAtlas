# Pipeline Tab — Design Spec
**Date:** 2026-05-30  
**Status:** Approved for implementation

---

## Overview

The Pipeline tab is a lab-internal, status-dashboard view of mutants actively being developed across three collaborating labs (Hybiske/UW, Hefty/KU, Rockey/OSU). It is **only visible to lab members and admins** (enforced at both UI and RLS level).

Primary use case: weekly status check — "where does everything stand?" Secondary: personal highlighting (favorites) and coordinating lab hand-offs.

---

## Access Control

- Hidden from public users entirely (nav tab not rendered)
- RLS: all pipeline-related queries require `auth.uid()` in `lab_member` or `admin` role
- Favorites are user-specific (scoped to `auth.uid()`)
- Priority flag is global (visible to all lab members, writable by all lab members with a confirm step)

---

## Data Model Changes

### 1. `mutant_pipeline` — add WGS stage + per-stage completion metadata

The existing schema has 6 stage boolean columns (plasmid, transformation, cloning, genotyping/PCR, invitro, invivo). WGS (whole genome sequencing) is a distinct stage between PCR genotyping and in vitro testing, so it needs a new boolean column. Add WGS plus paired `_completed_by` / `_completed_date` columns for all 7 stages:

```sql
ALTER TABLE mutant_pipeline
  -- New WGS stage boolean (existing 6 booleans are kept as-is)
  ADD COLUMN wgs_complete               BOOLEAN NOT NULL DEFAULT false,

  -- Per-stage completion metadata (who + when)
  ADD COLUMN plasmid_completed_by       TEXT,
  ADD COLUMN plasmid_completed_date     DATE,
  ADD COLUMN transformation_completed_by  TEXT,
  ADD COLUMN transformation_completed_date DATE,
  ADD COLUMN cloning_completed_by       TEXT,
  ADD COLUMN cloning_completed_date     DATE,
  ADD COLUMN genotyping_completed_by    TEXT,   -- PCR genotyping
  ADD COLUMN genotyping_completed_date  DATE,
  ADD COLUMN wgs_completed_by           TEXT,
  ADD COLUMN wgs_completed_date         DATE,
  ADD COLUMN invitro_completed_by       TEXT,
  ADD COLUMN invitro_completed_date     DATE,
  ADD COLUMN invivo_completed_by        TEXT,
  ADD COLUMN invivo_completed_date      DATE;
```

Stage order in UI: Plasmid → Transform → Clone → PCR (genotyping_complete) → WGS (wgs_complete) → In vitro → In vivo.

### 2. `mutant_pipeline` — per-stage active assignments

Each stage can have an active assignee (person currently working on it, not yet done). Store as a JSONB object keyed by stage name:

```sql
ALTER TABLE mutant_pipeline
  ADD COLUMN active_assignments JSONB DEFAULT '{}'::jsonb;
-- Format: { "wgs": "DR", "invitro": "KH", "invivo": "SH" }
```

### 3. `mutants` — planned mutant flag

A "planned" mutant is a target gene identified for deletion/disruption that has not yet been made. It lives in the mutants table with `is_planned = true` and no mutant_id assigned yet.

```sql
ALTER TABLE mutants
  ADD COLUMN is_planned BOOLEAN NOT NULL DEFAULT false;
```

Planned mutants: `is_planned = true`, `mutant_id = null`, `target_genes` set, `creator` set, `show_in_pipeline = true`.

### 4. `mutants.priority` — change to boolean

Current: `priority TEXT`. Change to `priority BOOLEAN NOT NULL DEFAULT false`. Migrate existing non-null values to `true`.

```sql
ALTER TABLE mutants ALTER COLUMN priority TYPE BOOLEAN USING (priority IS NOT NULL AND priority != '');
ALTER TABLE mutants ALTER COLUMN priority SET DEFAULT false;
ALTER TABLE mutants ALTER COLUMN priority SET NOT NULL;
```

### 5. New table: `pipeline_favorites`

User-specific favorites. Many-to-many between users and mutants.

```sql
CREATE TABLE pipeline_favorites (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutant_id  TEXT NOT NULL REFERENCES mutants(mutant_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, mutant_id)
);
-- RLS: users can read/write only their own rows
```

---

## UI Architecture

### Tab Icon

**Flow nodes** — three circles connected by lines. Used at two sizes:
- **Nav tab (22px):** three nodes, currently-active ones filled purple
- **Mutant list inline toggle (16px):** all-filled purple = in pipeline; all-outlined gray = not in pipeline. Binary, no partial fill at this size.

Tab label: **"Pipeline"** (kept from existing nav).

### Page Structure

```
[Page header: "Pipeline" + subtitle]    [Stage key card (top-right)]
[Toolbar: Expand all | Search]

[⭐ Favorites group]        — dynamic, logged-in user's starred mutants
[🔥 Priority group]         — all priority=true mutants across all types
[KO / Deletion group]       — CT-L2 chip | CM chip | (CT-D when available)
[Transposon group]          — CT-L2 chip | CM chip | (CT-D when available)
[Lucky 17 group]
[Chimeras group]
```

### Stage Key Card

Compact card, top-right, aligned with the strip column. Shows:
- Stage order: Plasmid · Transform · Clone · PCR · WGS · In vitro · In vivo
- Color legend: Done (green) | UW (purple) | KU (blue) | OSU (orange) | Stuck (red) | Not started (gray)

### Group Headers

Each group header contains (left to right):
- Group icon (star/flame SVG for Favorites/Priority; none for others)
- Group title (uppercase, small)
- Count badge
- Strain chips for KO/Deletion and Transposon groups (CT-L2, CM; CT-D when data exists)
- Sort dropdown button (↕ icon → dropdown: Progress / Mutant ID / Locus tag; default = Progress)
- Add button (right)
- Collapse button (right, visible when group is expanded beyond default)

**Default display:** 5 rows per group, then "N more · Show all | Collapse ↑" row.

### Mutant Row Layout

```
[priority border] [mutant ID] [gene (mono)] [type pill: LR/Tn] [strain tag] [flame icon] [star icon]    [stage strip: 7 pills] [›]
```

- **Left border:** orange = priority, red = stuck, yellow bg = "my" mutants (logged-in user's)
- **Flame icon (priority):** filled orange SVG = priority on; outlined gray = off. Clicking shows confirm popover. Global for all lab members.
- **Star icon (favorite):** filled gold SVG = favorited; outlined gray = not. Clicking toggles instantly. User-specific.
- **Strain tag:** small gray text label (CT-L2, CM) — only shown in consolidated KO/Deletion and Transposon groups where both strains are mixed
- **Planned rows:** dashed border, "PLANNED" chip in place of mutant ID, muted appearance
- **Stuck rows:** red left border + "⚠ stuck" inline label

### Stage Strip

Seven pills, uniform width (22×16px each), gap of 3px:
- **Done:** green fill + ✓
- **Active (UW):** purple tint + border + 2-char initials
- **Active (KU):** blue tint + border + 2-char initials
- **Active (OSU):** orange tint + border + 2-char initials
- **Stuck:** red tint + border + 2-char initials
- **Pending:** gray fill, empty
- **Planned (first stage only):** dashed border + gray initials of intended assignee

### Inline Expand Panel

Clicking a mutant row expands a panel below it (row turns purple-highlighted, chevron rotates to ∨). Clicking again collapses.

Panel contents:
1. **Top bar:** Mutant name + meta (type, strain, creator, date added to pipeline) | Remove from pipeline button | View full record → button
2. **Stage checklist:** 7 stage tiles arranged horizontally. Each tile shows:
   - Checkbox (checkable)
   - Stage name
   - **If done:** date stamp + who completed (shown below the name)
   - **If active/pending:** stage name only (no lab abbreviation shown here)
3. **Check-off interaction:** Clicking an unchecked stage tile opens an inline picker popup:
   - "Who completed?" → dropdown (K. Hybiske, S. Hefty, D. Rockey, Y. Wang, Other…)
   - "Date completed" → date input, defaults to today
   - Cancel | Save ✓ buttons
   - On save: tile becomes done, date + who appear, row strip updates
4. **Notes row:** existing `notes` field from mutants, italic, below stage checklist

**Remove from pipeline:** clicking button shows inline confirm strip: "Remove [ID] from pipeline? [Cancel] [Remove]"

**Priority confirm popover:** clicking the flame icon (whether on or off) shows a small floating popover:
- Turning on: "Mark [ID] as priority? All lab members will see this. [Cancel] [Mark priority]"
- Turning off: "Remove priority status? [Cancel] [Remove]"

### Strain Chip Toggles (KO/Deletion + Transposon groups)

Chips appear in group header. Active chip = colored (CT-L2 = purple tint, CM = orange tint). Clicking toggles visibility of that strain's rows within the group. Both on by default. CT-D chip appears only once CT-D mutants exist in the pipeline.

### Sort

Single "Sort" button with ↕ icon, opens dropdown:
- ✓ Progress (default) — sort by furthest stage reached (most advanced first)
- Mutant ID — alphabetical by mutant_id
- Locus tag — alphabetical by first target_gene locus tag

### Mutant List Integration

For lab members viewing any mutant list (CT-L2, CM, Chimeras, Lucky 17), each row shows a **pipeline toggle icon** (flow nodes, 16px) on the right side:
- **All nodes filled purple + "In pipeline" label:** mutant has `show_in_pipeline = true`
- **All nodes outlined gray + "Add to pipeline" label:** mutant has `show_in_pipeline = false`
- Clicking shows a simple confirm: "Add [ID] to pipeline?" or "Remove [ID] from pipeline?" → [Cancel] [Confirm]
- Toggling `show_in_pipeline` updates the mutants table

---

## Interactions Summary

| Action | Behavior |
|---|---|
| Click mutant row | Inline expand/collapse |
| Click stage tile (unchecked) | Open who/date picker |
| Save picker | Mark stage complete, update strip |
| Click flame (off) | Priority confirm → mark global priority |
| Click flame (on) | Priority confirm → remove priority |
| Click star | Instant toggle favorite (user-specific) |
| Click "Remove from pipeline" | Inline confirm → set show_in_pipeline=false |
| Click strain chip | Toggle visibility of that strain in group |
| Click Sort button | Open sort dropdown |
| Click "Show all" | Expand group to show all rows |
| Click "Collapse ↑" | Return to 5-row default |
| Click "Expand all" (toolbar) | Expand all groups to full |
| Pipeline icon in mutant list | Confirm → toggle show_in_pipeline |

---

## Supabase Queries

Key queries for the pipeline view:

```js
// Main pipeline fetch
sb.from('mutants')
  .select(`
    mutant_id, mutant_name, strain_id, target_genes, mutation_type,
    category, creator, priority, is_planned, is_archived, show_in_pipeline,
    mutant_pipeline (
      plasmid_complete, plasmid_completed_by, plasmid_completed_date,
      transformation_complete, transformation_completed_by, transformation_completed_date,
      cloning_complete, cloning_completed_by, cloning_completed_date,
      genotyping_complete, genotyping_completed_by, genotyping_completed_date,
      wgs_complete, wgs_completed_by, wgs_completed_date,
      invitro_test_complete, invitro_completed_by, invitro_completed_date,
      invivo_test_complete, invivo_completed_by, invivo_completed_date,
      active_assignments
    )
  `)
  .eq('show_in_pipeline', true)
  .eq('is_archived', false)
  .order('mutant_id')

// Favorites fetch (for logged-in user)
sb.from('pipeline_favorites')
  .select('mutant_id')
  .eq('user_id', state.userId)
```

---

## Files to Create / Modify

| File | Action |
|---|---|
| `web/js/views/pipeline.js` | Full rewrite |
| `web/js/views/mutants.js` | Add pipeline toggle icon to rows |
| `web/css/` (or inline) | Pipeline-specific styles |
| `schema/01_tables.sql` | Add new columns + pipeline_favorites table |
| Supabase migration SQL | Apply schema changes to live DB |

---

## Out of Scope (this implementation)

- Email notifications when priority status changes
- Batch operations (mark multiple mutants as complete simultaneously)
- Pipeline timeline / history view
- Mobile-specific design pass (tracked separately as item #12)
