# ChlamAtlas UI/UX Design Spec
**Date:** 2026-03-17
**Author:** Kevin Hybiske (Hybiske Lab, University of Washington)
**Status:** Approved for implementation

---

## Overview

ChlamAtlas is a model organism database (MOD) for the Chlamydia research community. This spec defines the complete UI/UX design for the web application — layout, navigation, components, data display patterns, and access control — across desktop and mobile.

The design philosophy: a well-designed scientific journal interface, not a generic database viewer. Clean white backgrounds, generous whitespace, data-rich detail pages that feel like profiles.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Database & Auth | Supabase (Postgres + RLS + Supabase Auth) |
| Frontend | Vanilla JS SPA |
| Styling | Tailwind CSS via CDN |
| Icons | Lucide icons (consistent, clean set) |
| 3D Viewer | Mol* (Molstar) — mmCIF from GitHub |
| Hosting | Vercel |

**No unnecessary dependencies.** Prefer simple, maintainable solutions.

---

## Typography & Brand

| Role | Font | Notes |
|---|---|---|
| Display / Brand | Cormorant Garamond 700 | Used for ChlamAtlas wordmark and hero headings |
| Body | DM Sans 400/500/600 | All UI text |
| Monospace | DM Mono 400/500 | Locus tags, numbers, IDs |

**Brand color:** `#1a6b4a` (deep green)
**Nav background:** `#0f4530` (dark green)
**Strain accent colors:** CT-L2 = `#7c3aed` (purple), CT-D = `#1d4ed8` (blue), CM = `#c2410c` (burnt orange)

---

## Access Tiers

Four tiers enforced at the **database level via RLS** — never front-end only.

> **Note:** CLAUDE.md describes three tiers (Public / Lab member / Admin). This spec introduces a fourth tier — **Community** — representing authenticated users who are not yet lab members. CLAUDE.md should be updated to reflect this before RLS policies are written.

| Tier | Description |
|---|---|
| **Guest** (unauthenticated) | Browse all genomic/proteomic/structural data; view published mutants only; no favorites or editing |
| **Community** (authenticated) | All guest access; can favorite genes/mutants; can add mutants and edit their own mutants; can submit gene annotations; no access to unpublished mutants or pipeline |
| **Lab member** | All community access; full read access including unpublished mutants and in-progress pipeline; can edit all mutants |
| **Admin** (Kevin) | Full read/write; toggle `is_published`; manage users; view annotation log |

`is_published: false` records must **never appear** in any public-facing query, even partially. This applies to browse views, search results, and any API endpoints.

Lab member access is granted manually by admin only. Users may request it via a subtle text link on their profile settings page — not in the popover or any prominently visible location.

**Favorites storage:** Stored in Supabase (persisted, cross-device), not localStorage. Requires a `favorites` table (user_id, entity_type, entity_id) not in the current CLAUDE.md schema — add during implementation.

**Community tier RLS ownership:** `mutants.creator` must map to `auth.users.id`. The RLS `USING` clause for Community write access is `creator = auth.uid()`. If `creator` is currently a display-name string rather than a UUID, add a `created_by_user_id uuid` column during schema migration and use that for RLS.

## Schema Additions From This Spec

The following tables and columns are introduced by this spec and are not in CLAUDE.md's data model. All must be created during implementation:

| Addition | Type | Purpose |
|---|---|---|
| `favorites` | New table | `(id, user_id uuid, entity_type text, entity_id uuid, created_at)` — stores user favorites |
| `site_config` | New table | `(key text pk, title text, body text, link_url text, link_label text)` — admin-editable featured spotlight card |
| `lab_member_requests` | New table | `(id, user_id uuid, requested_at, status text, reviewed_by, reviewed_at)` — tracks lab member access requests |
| `annotation_history` | New table | `(id, annotation_id uuid, field_name text, old_value text, new_value text, edited_by uuid, edited_at)` — powers annotation log before/after diff and revert |
| `site_updates` | New table | `(id, title text, category text, created_at)` — admin-managed recent updates list on home page |
| `users.role_request` | New column on users | `text nullable` — set to `'lab_member'` when user requests promotion; cleared on admin decision |

**Community role** must be added as a valid value for `users.role` (currently CLAUDE.md lists `public, lab_member, admin`; rename `public` → `guest` and add `community`).

---

## Navigation

### Desktop
Top navigation bar (dark green `#0f4530`) with:
- Left: ChlamAtlas icon (26px, rounded) + "ChlamAtlas" wordmark (Cormorant Garamond)
- Center: Four primary tab links — **Home · Genomes · Mutants · Pipeline**
- Right: Universal search pill (opens search overlay) + UW block-W user chip (opens profile popover)

Pipeline tab is visible to **lab members and admin only**. Community and guest users do not see this tab.

### Mobile
Bottom tab bar (80px, white with top border) replacing desktop top tabs:
- **Home · Genomes · Mutants · Pipeline · Profile**
- Active tab: green label + green-tinted icon background
- Pipeline tab hidden for Guest and Community users (only lab members and admin)
- Top app bar (dark green) with contextual controls: back navigation, search, heart (favorites), edit

**Icon library:** Lucide icons throughout. Do not hand-draw SVG paths.

---

## Home Tab

### Desktop layout
Three-column layout: narrow left sidebar (240px) + main content (flex) + right sidebar (280px).

**Left sidebar:**
- Quick Access: pinned shortcuts to favorited genes/mutants (shown when authenticated; empty state for guests)

**Main:**
- Hero section (dark green bg, globe SVG backdrop): "Hello, [name]" greeting label (authenticated only; hidden for guests) → ChlamAtlas wordmark (Cormorant, 56–84px clamp) → italic subtitle "A Chlamydia research database" (single line, white-space: nowrap) → two CTA buttons (Browse Genomes / Explore Mutants)
- Stats bar: 3 Organisms · 2,687 Genes · 2,687 Structures · 421 Mutants · 3 Partner Labs
- Strain browser: 3 organism portal cards (colored top accent, full italic species name large, monospace abbreviation + gene count below, "Browse genome →" arrow)
- Featured / spotlight card (admin-curated; stored as a single row in a `site_config` table with fields: title, body, link_url, link_label; editable from admin panel)
- Recent updates list — driven by a `site_updates` table `(id, title text, category text, created_at)`; admin-managed entries. Category maps to strain accent color dot (e.g. "CT-L2" → purple, "Structures" → green)

**Right sidebar:**
- Contributing Labs: UW (block W, `#4b2e83` purple), OSU (beaver), KU (`#0051a5` blue)

### Mobile layout
- App bar: icon + ChlamAtlas wordmark + search icon + favorites heart (with badge count)
- Hero (dark green, globe SVG): greeting → title → subtitle → two CTA buttons
- Horizontal-scroll stats strip
- Stacked organism cards with strain color accent + chevron
- Recent updates (compact list)

---

## Genomes Tab

### Strain selection
Clicking Genomes opens strain selector (or defaults to CT-L2 as primary strain).

### Gene list (desktop: left panel; mobile: full screen)

**List item anatomy:**
- AlphaFold structure thumbnail (42×42px, gradient bg with structure preview)
- Locus tag (DM Mono, muted ink)
- Gene name (colored by functional category; blank if uncharacterized — never show "unnamed")
- Short description / product
- Category badges / protein characteristic icons (right-aligned)
- Pipeline pill row for mutants with pipeline data

**Functional category colors** (gene name text color):
| Category | Color |
|---|---|
| T3SS effectors/secreted | `#0d9488` teal |
| Inc membrane proteins | `#7c3aed` purple |
| Cell division / metabolic | `#d97706` amber |
| Regulatory / sigma factors | `#c2410c` burnt orange |
| Other characterized | `#1a6b4a` green |
| Uncharacterized | `#9ca3af` muted gray (no gene name displayed) |

**Protein characteristic icons** (small inline Lucide icons after gene name, category-colored):
- T3SS secreted/effector: export/upload arrow icon
- Inc membrane protein: layers/membrane icon
- Membrane protein: server/layers icon
- DNA binding protein: file-code or similar icon

**Filter chips (horizontal scroll on mobile, sidebar on desktop):**
All · Named only · T3SS · Inc proteins · Mutant available · Hypothetical · Membrane protein

### Gene detail page (desktop: right panel; mobile: full-screen with back nav)

**Header:** AlphaFold thumbnail (52px) + locus tag + gene name (colored) + functional category badge + product description + key stats (kDa / aa / localization)

**Gene context strip:** SVG chevron-arrow genes proportional to approximate gene lengths in bp, colored by category. Gene names abbreviated to gene symbol if available. Currently viewed gene highlighted. Centered horizontally on page. No length labels underneath. Scrollable horizontally on mobile. Show 3 flanking genes on each side of the current gene (7 genes total when possible; fewer at chromosome boundaries). Clicking a flanking gene navigates to that gene's detail page. Gene order and lengths derived from the `coordinates` field (start/end bp) on the `genes` table.

**Sub-tabs (horizontal scroll on mobile):**
Overview · Expression · Structure · Orthologs · Sequences · Mutants · Annotations

**Overview tab:**
- Function card: narrative description (free text; editable by authorized users)
- Protein characteristics: boolean fields (Membrane protein / Hypothetical / DNA binding / T3 secreted), each with short hint text
- Localization and oligomeric state
- Orthologs card: dot-colored by strain, locus + gene name + strain label

**Expression tab:**
- T0–T5 bar chart (interactive, hover for values). Use **Chart.js** (CDN) for charts — lightweight, compatible with Tailwind CDN approach, no build step required.
- Toggle between strains (where ortholog expression data exists) on same chart

**Structure tab (after Expression):**
- Static AlphaFold thumbnail (always visible as preview)
- Below thumbnail: "Load interactive 3D structure" button (Lucide `box` icon + text). Clicking loads Mol* inline.
- Mol* loads into an adjacent or expanded container; thumbnail remains visible during load. Configured with minimal toolbar; hide irrelevant options.
- Top homolog PDB match + description + confidence score

**Orthologs tab:** Full cross-strain ortholog table with reciprocal BLAST confidence

**Sequences tab:** FASTA sequences (gene and protein), downloadable

**Mutants tab:** List of mutants targeting this gene with pipeline pills

**Annotations tab:** Community evidence-based annotations with evidence codes and PubMed IDs

**Edit mode:** Floating pencil FAB (bottom right); authorized users only; opens Gene Annotation Modal

---

## Mutants Tab

### List view

**Filter/group by:** Collection (CT-L2 / CM / Lucky 17 / Chimeras) · Background strain · Mutation type · Target gene

**List item anatomy:**
- Mutant ID (DM Mono) + mutation type badge (colored)
- Target gene(s): locus tag + gene name, e.g. "CTL0496 incA" — blank gene name field if unnamed
- Pipeline pill row (6 pills: Transform / Clone / Genotype / In Vitro / In Vivo / Sequence; green=done, amber=in progress, gray=not started)
- Priority flame badge (🔥) for flagged mutants
- "Publicly available" indicator

Mutant IDs (e.g. KH001, YW082) are internal identifiers — do not over-emphasize.

**Mutation type badge colors:** The schema `mutation_type` enum uses mechanism labels (transposon / chemical / recombination / intron). Badge display maps these as follows:

| Schema value | Badge label | Color |
|---|---|---|
| `transposon` | Tn | pink/rose |
| `chemical` | Chem | blue |
| `recombination` | Recomb | green |
| `intron` | Intron | amber |
| other / null | — | gray |

### Mutant detail page

**Header:** Mutant ID + background strain chip + mutation type badge + priority flag

**Gene graphic:** Same chevron-arrow context strip as gene detail, showing the target gene(s) in context

**Sections:**
- Target genes (linked, with locus + name)
- Mutation info: type, collection, plasmid, markers
- Created by + created date (read-only)
- Labs shared with
- Publicly available toggle (admin/lab member only)

**Phenotype sections** (with emoji section headers):
- 🧬 Genotyping: method, result
- 🔬 In vitro testing: has_phenotype, description, images
- 🐭 In vivo testing: has_phenotype, description, images

**Edit mode:** Floating pencil FAB → opens Mutant Record Modal

---

## Pipeline Tab

*Visible to lab members and admin only.*

### Layout

**Stage summary strip** (top): count per stage; most active stage highlighted amber.

**Filter toolbar:** Lab chips (UW Hybiske / OSU Rockey / KU Hefty) + Mutation type + Background strain

**Stage accordion groups** (all open by default):
- Transform → Clone → Genotype → In Vitro → In Vivo → Sequence
- Each group: colored left bar + stage name + lab chips + count badge + chevron toggle
- Most active stage highlighted with amber border

**Row columns:** ID · Target gene (locus + gene name, blank if unnamed) · Mutation type badge · 6 pipeline pills · Current stage chip · Responsible lab

**Row interaction:** Click → context popup near cursor with two actions:
- View mutant record
- Edit pipeline progress (opens Pipeline Progress Modal)
- Dismisses on outside click

### Mobile adaptation
Same stage accordion structure; row click opens iOS-style **bottom sheet** (slide up from bottom) with same two actions.

---

## Search

**Universal search bar** in desktop nav (pill shape, opens overlay). On mobile, magnifying glass icon in top app bar opens full-screen search overlay.

**Search overlay:**
- Live results as user types (debounced)
- Results grouped by type: Genes · Mutants · (future: publications)
- Gene result: thumbnail + locus tag + gene name + strain label
- Mutant result: ID + mutation type badge + target gene + pipeline pills
- Cancel / ESC to dismiss

---

## Favorites

**Heart icon** in nav (desktop: right side; mobile: top app bar, with count badge).

Click opens a popover that drops down from the heart icon position.

**Popover contents:**
- Favorited Genes section (with thumbnails and locus/name)
- Favorited Mutants section (with ID and pipeline pills)
- Separate sections, not mixed

Favoriting available to community members and above.

---

## Edit Modals

All edit modals share:
- Dark semi-transparent overlay behind
- White modal card, rounded corners, max-width ~640px (desktop) / full-screen on mobile
- Footer audit line: "Last edited [date] by [user]"
- Delete button bottom-left (danger, admin/authorized only)

**Access control per modal:**
| Modal | Who can open |
|---|---|
| Pipeline Progress Modal | Lab member, Admin |
| Mutant Record Modal (edit) | Community (own mutants only), Lab member (all), Admin |
| Gene Annotation Modal | Community (goes live immediately, full audit log captured, admin can revert), Lab member, Admin |

### Pipeline Progress Modal

Fields:
- Priority toggle (🔥 badge; amber-tinted row when on)
- Stage selector: full-text buttons — Transform / Clone / Genotype / In Vitro / In Vivo / Sequence
- Date fields per stage (completed date)
- Responsible lab dropdown (UW Hybiske / OSU Rockey / KU Hefty)
- Genotyping method dropdown
- Stocks available at: 4 checkboxes (UW Hybiske / UW Bob / OSU Rockey / KU Hefty) — "UW Hybiske" = Hybiske Lab main site; "UW Bob" = Bob's lab, a separate UW physical site (senior scientist). Confirm Bob's surname/full label before finalizing the UI label.
- Pipeline notes textarea

### Mutant Record Modal

Fields:
- Mutant ID + background strain (read-only header)
- Created by + created date (read-only, styled as `field-readonly`)
- Target gene chips (add/remove)
- Mutation type dropdown + Collection dropdown
- Plasmid field
- Resistance / fluorescent markers: combobox — pick from existing OR type new ("Add X as new marker" option)
- Labs shared with: checkboxes
- Publicly available toggle
- Notes textarea

### Gene Annotation Modal

Fields:
- Info callout: NCBI/UniProt fields (read-only, labeled as external source)
- Gene symbol + functional category dropdown
- Aliases (comma-separated)
- Boolean protein characteristics (each with hint text):
  - Membrane protein
  - Hypothetical
  - DNA binding protein
  - Type III secreted
- Localization dropdown + oligomeric state dropdown
- Function narrative textarea
- Evidence code + PubMed ID
- Curator note

---

## User System & Auth

### Sign-up flow
Open sign-up → Community role automatically. No pending state for new users.

### Profile popover (drops from user chip in desktop nav)

Contents:
- Institution logo (44px, pre-populated SVG for known domains; Clearbit fallback; initials fallback)
- Display name + email + institution name
- Role badge (Admin / Lab member / Community)
- Approved badge (if applicable)
- Stats: favorited genes / favorited mutants / total edits
- Contribution summary: mutants added / annotations edited / pipeline updates
- Actions: Edit profile · Admin panel (admin only) · Sign out

**Institution logo strategy:**
1. Pre-populated SVG lookup by email domain (UW = block W `#4b2e83`; OSU = beaver; KU = `#0051a5`)
2. Initials fallback (no Clearbit — deprecated/unreliable for free use)

**Lab member access request flow:**
1. Community user clicks a subtle text link ("Request lab member access") on their profile settings page — not in the popover, not prominent.
2. Clicking creates a row in `lab_member_requests` and sets `users.role_request = 'lab_member'`.
3. Admin sees the user in the **Pending** filter of the admin Users tab (amber-tinted row).
4. Admin approves (sets `users.role = 'lab_member'`, clears `role_request`) or declines (clears `role_request` only).
5. Guest and Community sign-ups are **never** in a pending state — they receive their role immediately on sign-up.

### Admin panel

**Users tab:**
- Filter toolbar: search + All / Pending / Lab members chips
- Table: user identity + institution logo, institution name, inline role dropdown (immediate), active/pending status pill, joined date, Approve / Deactivate buttons
- Pending rows: amber-tinted background

**Annotation log tab:**
- Per-edit entries: who edited, which field, on which gene
- Before/after diff display per edit
- Field-type badge (colored by field category)
- Revert button (admin only)

**Bug Reports / Feedback tabs:** Placeholder ("coming soon") — deferred to Phase 2.

**Tour / onboarding:** Deferred to Phase 2.

---

## Mobile-Specific Patterns

### Navigation
Bottom tab bar (80px) replaces desktop top-nav tabs. Five items: Home / Genomes / Mutants / Pipeline / Profile.

### Layout adaptations
- Three-panel desktop → list → full-screen detail with back navigation on mobile
- Desktop sidebar filters → horizontal-scroll filter chips
- Desktop search pill → full-screen search overlay (magnifying glass tap)
- Desktop profile popover → Profile tab in bottom nav
- Desktop context menu (row click) → iOS-style bottom sheet (slide up from bottom, with handle, dimmed overlay behind)

### Bottom sheet pattern
- Triggered by row tap (pipeline list, mutant list)
- Handle bar at top
- Mutant identity header (ID + locus + gene name)
- Two action rows with icon + label + sub-label
- Dismisses on overlay tap or swipe down

---

## URL Routing

The SPA uses hash-based routing (`#/genomes/CT-L2/CTL0496`) so deep links work without server-side route handling on Vercel.

Filter state is preserved in the URL for shareable deep links. Examples:
- `#/genomes/CT-L2?filter=T3SS` — gene list with T3SS filter active
- `#/mutants?collection=lucky17` — mutant list filtered to Lucky 17 collection
- `#/genomes/CT-L2/CTL0496` — gene detail page

---

## Empty States

All list views and detail tabs must handle missing data gracefully. Convention: muted gray message centered in the content area, no error styling.

| View | Empty state message |
|---|---|
| Gene list (no results for filter) | "No genes match this filter." |
| Expression tab (no data) | "No expression data available for this gene." |
| Structure tab (no AF model) | "No AlphaFold structure available." |
| Orthologs tab (no orthologs) | "No orthologs identified for this gene." |
| Mutants tab on gene detail | "No mutants targeting this gene." |
| Favorites popover (nothing favorited) | "No favorites yet. Heart a gene or mutant to save it here." |
| Search overlay (no results) | "No results for '[query]'." |

---

## Search & RLS

Search results must respect the same RLS visibility rules as all other queries:
- Unpublished mutants (`is_published: false`) never appear in search for Guest or Community users
- Lab members and Admin see all results including unpublished mutants
- This must be enforced server-side (Supabase RLS on the search query) — never client-side filtering

---

## Data Display Conventions

- Locus tags are the canonical gene identifier (DM Mono, always shown)
- Gene names shown only if assigned; never display "unnamed" or placeholder text
- `is_published: false` records never appear in any public-facing query
- All dates stored ISO 8601 UTC; displayed as human-readable (e.g. "Mar 14, 2026")
- Mutant IDs (KH001, YW082) are internal identifiers — shown in DM Mono, not over-emphasized
- Pipeline pills: 6 colored rectangles, no text/icons inside (green = done, amber = in progress, gray = not started)

---

## Out of Scope (deferred)

- Tour / onboarding system → Phase 2
- Bug report / feedback form → Phase 2
- Additional strain support (Cpn, ocular CT, rectal CT) → Phase 3
- API endpoints for programmatic access → Phase 3
- Downloadable FASTA in bulk → Phase 3
