# ChlamAtlas — Home Page & Nav Chrome Redesign
**Spec date:** 2026-04-05  
**Design direction:** C — Bold Editorial  
**Scope:** `web/index.html`, `web/js/views/home.js`, `web/css/app.css`

---

## Overview

Replace the current card-centric home page (rounded hero card + stat cards + strain portal cards) with a "Bold Editorial" layout that immediately communicates what ChlamAtlas is and provides clear entry points to all major data sections. The nav chrome gets minor updates: logo asset swap, auth greeting, Pipeline visibility gating.

The design is app-like in feel, not journal-like. Mobile and desktop are equally considered.

---

## Organism Color System (breaking change)

The strain color assignments change globally. These propagate to every place organisms are color-coded across the app (home page, gene lists, update dots, future strain indicators).

| Strain | Old color | New color | Rationale |
|--------|-----------|-----------|-----------|
| CT-L2 (L2/434) | `#7c3aed` purple | `#16a34a` green | Primary strain; green matches brand identity |
| CT-D (D/UW-3) | `#1d4ed8` blue | `#4b2e83` UW purple | D/UW-3 was discovered at UW — Husky purple |
| CM (Nigg) | `#c2410c` orange | `#2563eb` blue | Visually distinct from green and purple |

Update the Tailwind config color aliases (`ctd`, `ctl2`, `cm`) in `index.html` and any hardcoded hex values in `home.js`.

---

## Nav Chrome

### Desktop nav (`<header>`)

- **Height:** 56px — no change
- **Background:** `#0f4530` — no change
- **Logo (left):** `<img>` of white-elements PNG when Kevin provides the asset. Until then, text wordmark "ChlamAtlas" in Cormorant Garamond 700. Render with `onerror` fallback to text.
- **Tabs (center):** Home, Genomes, Mutants. **Pipeline tab hidden for `role = public`** (unauthenticated or public tier). Shown for `lab_member` and `admin`.
- **Auth area (right):**
  - Guest: "Sign in" button (existing style — border, hover bg)
  - Authenticated: plain text "Hello, [first name]" (`rgba(255,255,255,0.8)`, 13px, 500 weight). First name derived from `state.user.email.split('@')[0]` until display_name is available.

### Mobile top bar

- Same dark green, 52px height
- Left: logo + wordmark
- Right: "Sign in" (guest) or "Hello, [first name]" (authenticated)
- No tab row — navigation handled entirely by bottom nav

### Mobile bottom nav

- White background, 1px top border `#efefef`, iOS safe-area bottom padding
- **Guest:** 3 tabs — Home, Genomes, Mutants
- **Lab member / Admin:** 4 tabs — Home, Genomes, Mutants, Pipeline
- Active state: icon wrapped in `#dcfce7` rounded pill (8px radius), label color `#1a6b4a`
- Inactive: icon and label in `#9ca3af`
- Icons: Lucide SVGs (existing — no change)

---

## Home Page Layout

The home page renders into `#home-content`. The overall structure top-to-bottom:

1. Masthead (full-bleed dark green)
2. Entry blocks (white, border-bottom)
3. Lower section — Organisms + Updates (white)
4. Footer (light gray)

The existing `max-w-5xl mx-auto` main container constrains most content, but the **masthead must be full-bleed**. Achieve this by rendering it outside the main container constraint, or by giving the home tab its own wrapper that breaks out of `px-4`. The inner text content within the masthead uses `max-w-5xl` centering.

---

### 1. Masthead

**Background:** `#0f4530`, full viewport width.  
**Inner padding:** `max-w-5xl mx-auto`, `px-8 py-12` desktop, `px-5 py-7` mobile.

**Desktop layout:** CSS grid, `1fr auto`, gap 48px, align-items end.

Left column:
- `<h1>` "ChlamAtlas" — Cormorant Garamond 700, ~68px, white, `line-height: 1`
- `<p>` descriptor — "The integrated research database for *Chlamydia* — genomics, mutant phenotypes, structural biology, and multi-lab pipeline tracking across three model strains." DM Sans 15px, `rgba(255,255,255,0.6)`, max-width ~480px.

Right column (stats):
- Three stats stacked: Genes, Mutants, Model strains
- Value: DM Mono 500, 30px, white
- Label: 10px uppercase, `rgba(255,255,255,0.42)`, letter-spacing 0.09em
- Values loaded dynamically from Supabase (genes count, mutants count; strains is always 3)
- Show skeleton loaders while loading

**Mobile layout:** Stacked — h1, descriptor, then stats as a single horizontal row with vertical dividers between items.

---

### 2. Entry Blocks

White background. `border-bottom: 1px solid #ececec` separates it from the lower section.

**Desktop (lab member / admin):** 4 equal columns. Each column separated by `border-right: 1px solid #ececec` (last child: none). Each block:
- Emoji icon (22–26px)
- Verb label: 9.5px uppercase, `#1a6b4a`, letter-spacing 0.11em (e.g. "Browse", "Explore", "Track", "Coming soon")
- Title: 17px, 600 weight, `#111`
- Meta: DM Mono 12px, `#bbb` (e.g. "1,847 genes · 3 strains")
- Hover: `#f9fafb` background
- Cursor: pointer (except Search which is disabled)

**Desktop (guest / public):** 3 columns — Genomes, Mutants, Search. Pipeline column is entirely absent (not hidden via CSS, not rendered).

**Mobile (lab member / admin):** 2×2 grid. Internal borders: right border between col 1/2, bottom border between rows. Same content as desktop blocks.

**Mobile (guest / public):** 2-up top row (Genomes | Mutants) with right border between them + bottom border below. Search spans full width beneath as a single-row item with icon on the left and text on the right (horizontal layout). Search is always `opacity: 0.32`, non-interactive.

**Blocks:**
| Block | Icon | Verb | Title | Meta |
|-------|------|------|-------|------|
| Genomes | 🧬 | Browse | Genomes | `{gene_count} genes · 3 strains` (same async load as masthead stats) |
| Mutants | 🔬 | Explore | Mutants | `{mutant_count}+ characterized` (same async load as masthead stats) |
| Pipeline | ⚗️ | Track | Pipeline | Multi-lab progress |
| Search | 🔍 | Coming soon | Search | Universal search |

---

### 3. Lower Section

White background. `max-w-5xl mx-auto px-8 py-9` desktop, `px-5 py-6` mobile.

**Desktop:** 2-column equal grid, gap 56px.  
**Mobile:** Single column — Organisms first, divider, Updates below.

**Section labels:** 9.5px, 700 weight, uppercase, `#1a6b4a`, letter-spacing 0.1em.

#### Model Organisms

Three clickable rows. Clicking navigates to the Genomes tab filtered to that strain (dispatches `chlamatlas:navigate` with `{ tab: 'genomes', strain: 'CT-L2' }` etc.).

Each row:
- 3px × 36px colored left bar (strain color)
- Italic species name (14px, 500 weight, `#222`)
- Strain descriptor below name (11.5px, `#bbb`)
- Chevron `›` on right (`#ddd`)
- Gene count (DM Mono 12px, `#ccc`) — loaded from Supabase
- `border-bottom: 1px solid #f3f3f3` between rows

CT-L2 descriptor: "CT-L2 · Primary experimental strain"  
CT-D descriptor: "CT-D · Discovered at UW"  
CM descriptor: "CM · Mouse model strain"

#### Recent Updates

Loaded from `site_updates` table: `select id, title, category, created_at order by created_at desc limit 5`.

Each row:
- 6px colored dot (use organism color for CT-L2/CT-D/CM categories; `#6b7280` default)
- Update text (13px, `#444`, line-height 1.45)
- Date (10.5px, `#ccc`, short format: "Mar 15")
- `border-bottom: 1px solid #f5f5f5` between rows

If no updates: render nothing (omit the section, not an empty state).

---

### 4. Footer

**Background:** `#f9f9f9`. **Top border:** 1px `#efefef`.  
**Padding:** `px-8 py-5` desktop, `px-5 py-4` mobile.  
**Max-width:** `max-w-5xl mx-auto`.

Contents:
- "Hybiske Lab" — 11.5px, 600 weight, `#444`
- "University of Washington · Seattle, WA" — 11px, `#aaa`
- Link row: "How to cite" · "GitHub" · "Contact" — 11px, `#1a6b4a`

**"How to cite" behavior:** Opens a small modal (or inline expand) with:
```
Hybiske et al., manuscript in preparation.
ChlamAtlas: an integrated Chlamydia research database.
https://chlamatlas.org — Hybiske Lab, University of Washington.
```
Include a copy-to-clipboard button. When the paper is published, update this string in `site_config` table (key: `citation`) so it's admin-editable without a deploy.

**GitHub link:** `https://github.com/khybiske/ChlamAtlas`, opens in new tab.  
**Contact link:** `mailto:khybiske@uw.edu`.

---

## Removed Elements

The following elements from the current `home.js` are **removed** in this redesign:

- Rounded hero card (`<div class="relative overflow-hidden rounded-2xl mt-5 mb-6">`)
- Globe SVG backdrop
- Hero CTA buttons ("Browse Genomes", "Explore Mutants")
- Scrollable stats bar (`#stats-bar`)
- Strain portal cards (3-column `grid gap-3 sm:grid-cols-3`)
- Spotlight card (`#spotlight-card`, `site_config` spotlight query)
- Two-column spotlight + updates grid

The `loadSpotlight()` function and its `site_config` query are deleted. The `site_config` table can remain for future use (e.g. citation string), but the spotlight feature is not part of this design.

---

## Implementation Files

| File | Change |
|------|--------|
| `web/index.html` | Update Tailwind color aliases (`ctl2`, `ctd`, `cm`); add `max-w-5xl` home wrapper tweak for full-bleed masthead |
| `web/js/views/home.js` | Full rewrite of `renderHome()` and helper functions |
| `web/css/app.css` | Add `.home-masthead` full-bleed helper; update any hardcoded organism hex values |
| `web/js/app.js` | Auth area rendering: add "Hello, [name]" state; Pipeline tab visibility logic |

---

## Access Control Summary

| Element | Guest | Lab Member | Admin |
|---------|-------|------------|-------|
| Pipeline desktop nav tab | Hidden | Visible | Visible |
| Pipeline mobile bottom tab | Hidden | Visible | Visible |
| Pipeline entry block | Hidden | Visible | Visible |
| "Hello, Kevin" greeting | — | ✓ | ✓ |
| Recent Updates | Visible | Visible | Visible |

All hiding is conditional rendering based on `state.user?.role`, not CSS `display:none`. Nothing about Pipeline should appear in the DOM for guest users.
