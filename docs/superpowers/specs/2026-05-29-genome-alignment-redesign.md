# Genome Alignment Redesign — Design Spec
**Date:** 2026-05-29  
**Status:** Approved

---

## Problem

The current genome alignment view uses full browser width for two gene columns with a 24%-wide SVG ribbon area. This creates too much horizontal dead space, the ribbon connectors (filled bezier curves) read as mysterious rather than conveying synteny, and the jump chips + legend consume vertical real estate in the topbar. The tool doesn't immediately read as a side-by-side comparison.

---

## Design Decisions

### 1. Overall Layout

Three-column page layout replacing the current single scrollable area:

```
[ Left sidebar ] [ Center: pickers + gene columns ] [ Right sidebar ]
```

- **Left sidebar** (`88px` fixed): Jump-to chips, sticky alongside scroll
- **Center** (flex:1): Genome pickers row + scrollable gene comparison
- **Right sidebar** (`110px` fixed): Category key + connector legend, sticky alongside scroll
- All white background — no gray page tint
- Subtle `border-right` on left sidebar, `border-left` on right sidebar

### 2. Center — Genome Pickers

- Single sticky row below the navbar, centered over the gene columns
- Contains: ref picker `⇄` cmp picker + search box (right-aligned in the same row)
- Picker styling is **dynamic**: border and text color set to `strain.color_hex` after selection
- Picker displays a **strain icon** (16×16 `<img>`) next to the strain name
  - Since `<select>` cannot render images, implement as a **custom dropdown** (button + popover list)
  - Icon paths from existing mapping:
    - CT-L2 → `/design/icons_transparent/L2icon_transparent.png`
    - CT-D → `/design/icons_transparent/CTDicon_transparent.png`
    - CM → `/design/icons_transparent/CMicon_transparent.png`
  - Before selection: neutral styling (gray border, placeholder text)
  - After selection: border + label color = `strain.color_hex`

### 3. Center — Gene Columns

- **Max-width: 680px**, `margin: 0 auto` — centered in the available space between sidebars
- Wrapped in a white rounded card with a subtle box-shadow and border
- Three sub-columns:
  - **Reference column** (`flex: 1`): sticky "Reference ↓" subheader in blue tint
  - **Connector column** (`72px` fixed): SVG with thin `1.5px` category-colored horizontal lines for orthologs; `r=4` red dot for no-ortholog
  - **Comparison column** (`flex: 1`): sticky "Comparison ↓" subheader in amber tint
- Column subheaders are sticky within the scroll container (not viewport-sticky)
- Gene rows: `22px` height, `border-left: 4px solid {catColor}`, faint category bg tint, monospace locus tag + colored gene name

### 4. Connector Column

- **Width: 72px** (up from current ~24% which was visually dominant)
- Background: `#fafafa`, bordered with `#ececec` on both sides
- SVG lines: `stroke-width: 1.5`, category color, `opacity: 0.65`
- No-ortholog indicator: filled circle `r=4`, `fill: #fca5a5`, `opacity: 0.8`
- On row expand: highlight matching path/circle to `stroke-width: 3`, `opacity: 0.9`
- Replaces the current filled bezier ribbon approach entirely

### 5. Left Sidebar — Jump Chips

- Label: "JUMP TO" in small caps (`8px`, `#94a3b8`)
- `24px` top padding from navbar (visual breathing room)
- Each chip: monospace, `8.5px`, white bg, `#e2e8f0` border, rounded — hover state goes blue
- Chips are generated from reference genome after load (every 100 genes + end)
- Chips remain visible and functional as user scrolls the gene list

### 6. Right Sidebar — Key

- Label: "KEY" in small caps
- `24px` top padding from navbar
- One row per functional category: 8px colored dot + label (`8.5px`, `#64748b`)
- Below a divider: two rows showing connector legend:
  - `————` line + "Ortholog"
  - `●` dot + "No ortholog"

### 7. Expand on Click

Keep existing expand behavior. Add to expanded card:
- **→ Gene detail** link on **both** reference and comparison columns (currently only reference has it)
- Gene length (aa) and protein mass (kDa) if available from proteins table join

### 8. Removed from Topbar

- Jump chip row (moved to left sidebar)
- Category legend row (moved to right sidebar)
- Topbar now has one row only: pickers + search

### 9. Spacing / Visual Hierarchy

From top to bottom:
1. Global nav (dark green, 46px)
2. Picker row (white, 1px bottom border) — pickers centered
3. `16px` padding before gene card
4. Column subheaders (sticky within scroll, blue/amber tint)
5. Gene rows

---

## Files Affected

- `web/js/views/genome-alignment.js` — primary change (full layout rewrite)

## What Stays the Same

- Jump chip scroll-to logic
- Gene search logic
- IntersectionObserver pagination
- Expand/collapse row behavior
- Category color constants
- Ortholog data fetching
- Stale-fetch guard (`_loadGen`)
