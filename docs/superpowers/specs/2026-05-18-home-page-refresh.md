# Home Page Refresh — Design Spec
_Date: 2026-05-18_

## Overview

A content and functionality update to the ChlamAtlas home page. Focus is on structure, navigation, and the new Community section. Visual/design polish (hero background pattern, deeper frontend-design pass) is deferred to a separate session.

---

## 1. Navbar additions

Two new buttons added to the right side of the header, between the primary nav tabs and the Sign in / user menu:

**Search button**
- Labeled pill: magnifying glass icon + "Search" text
- Style: `background: rgba(255,255,255,0.1)`, `border: 1px solid rgba(255,255,255,0.2)`, rounded
- Behavior: stub for now (no-op click); wired to a future full-screen search modal overlay
- Visible to all users (authenticated and guest)

**Saved button**
- Labeled pill: heart icon + "Saved" text
- Same style as Search button
- Behavior: stub for now; navigates to a future Favorites page
- Visible to all users; when guest clicks it, prompt to sign in (future)

Both buttons sit between the primary tabs and the auth area on desktop. On mobile they join the bottom nav or collapse into a menu (defer mobile nav treatment to a future session).

---

## 2. Home page structure

### Remove
- The existing "entry blocks" row (Genomes | Mutants | Pipeline | Search grid) is removed entirely.
- The existing two-column lower section (Model Organisms list | Recent Updates) is removed.

### Replace with
Three equal-width columns (`grid-template-columns: 1fr 1fr 1fr`) inside a `max-width: 960px` container, separated by `1px solid #f0f0f0` column dividers. Each column has `padding: 36px 28px 40px`.

On mobile, columns stack vertically in order: Genomes → Mutants → Community.

---

## 3. Genomes column

**Section header:** `🧬 Genomes` — `font-size: 13px`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.1em`, `color: #1a6b4a`. No subtitle.

**Three strain cards** (stacked, `gap: 7px`), each a clickable row:
- `background: white`, `border: 1px solid #e5e7eb`, `border-left: 3px solid <strain-color>`, `border-radius: 7px`, `padding: 12px 14px`
- Hover: `background: #fafafa`
- No background color tint — white only, color accent via left border only
- Content per card:
  - Strain code (e.g. `CT-L2`) — bold, strain color
  - Species name in italic (e.g. _C. trachomatis L2/434_)
  - Gene count in monospace muted text (e.g. `894 genes`)
- Click navigates to Genomes tab with that strain pre-selected (existing `window.__preferredStrain` mechanism)

Strain colors: CT-L2 `#16a34a`, CT-D `#4b2e83`, CM `#2563eb`

No "Browse all →" link.

---

## 4. Mutants column

**Section header:** `🔬 Mutants` — same style as Genomes header. No subtitle.

**Four collection rows** (stacked, `gap: 7px`), each a clickable row:
- `background: white`, `border: 1px solid #e5e7eb`, `border-radius: 7px`, `padding: 11px 13px`
- Left side: circular avatar (36×36px, emoji) + name + count
- Right side: `›` chevron in muted gray
- Hover: `background: #fafafa`
- Click navigates to Mutants tab with that collection pre-selected (existing `window.__mutantCollection` mechanism)

Collections:
| Collection | Avatar bg | Emoji | Label | Count |
|---|---|---|---|---|
| CT_L2 | `#dcfce7` | 🧫 | C. trachomatis | ~250 mutants |
| CM | `#dbeafe` | 🐭 | C. muridarum | ~50 mutants |
| Lucky17 | `#fef9c3` | ⭐ | Lucky 17 | 17 |
| Chimeras | `#fdf4ff` | 🔀 | Chimeras | ~300 mutants |

No "Browse all →" link. Avatar images: use existing `/design/L2icon.jpg` etc. if available, fall back to emoji placeholders.

---

## 5. Community column

**Section header:** `🌍 Community` — same style as other section headers. No subtitle.

All widgets stack vertically with `gap: 10px`.

### 5a. User map
- Container: `background: #eff6ff`, `border: 1px solid #dbeafe`, `border-radius: 8px`, `padding: 14px`
- Inner map area: `height: 110px`, `background: #e8f2ff`, `border-radius: 5px`
- **Implementation:** placeholder styled div for now. Real map requires geocoding `city`/`country` fields from the `users` table (Supabase). Use a lightweight library (e.g. [svg-world-map](https://github.com/raphaeltheriault/svg-world-map) or hand-rolled SVG) — defer to a future session.
- Caption below map: live query — "N researchers · N countries" from users with lat/lng populated
- Placeholder caption: "Researchers worldwide"

### 5b. Stats panel
Single `panel` card (`background: white`, `border: 1px solid #e5e7eb`, `border-radius: 7px`, `padding: 12px 14px`). Two items side by side, divided by a `1px` vertical rule:

**Left — Users count**
- Label: "USERS" (uppercase, muted)
- Value: live count of `users` table rows — `SELECT count(*) FROM users`
- Font: `26px`, `font-weight: 700`, DM Mono

**Right — Annotations sparkline**
- Label: "ANNOTATIONS OVER TIME" (uppercase, muted)
- SVG bar chart, all-time monthly buckets: `SELECT date_trunc('month', created_at), count(*) FROM annotations GROUP BY 1 ORDER BY 1`
- Bar colors: gradient from `#bfdbfe` (oldest) to `#1d4ed8` (most recent)
- Bar width: `8px`, gap `6px`, height scaled to max value, `border-radius: 1px`
- Month labels: single-letter initials below bars, `font-size: 4.5px`, `fill: #d1d5db`
- No total count label
- SVG fills full available width of the right cell

### 5c. Top contributors
Panel card, compact single-line rows, `gap: 5px`:
- Medal emoji + name (bold) + lab affiliation (muted) + count (monospace, far right)
- Show top 3 (🥇🥈🥉)
- Data: `SELECT user_id, count(*) FROM annotations GROUP BY user_id ORDER BY count DESC LIMIT 3`, joined to `users` for display name and lab affiliation
- Label: "TOP CONTRIBUTORS" (panel-label style)

### 5d. Cycling activity strip
- `background: #f9fafb`, `border: 1px solid #e5e7eb`, `border-radius: 7px`, `padding: 10px 14px`
- Green pulse dot (7px circle, `#16a34a`) + activity text
- One item shown at a time; cycles every 4 seconds with a 400ms opacity fade transition
- Data source: `site_updates` table (existing), ordered by `created_at DESC`, limit 10
- Format: "[display_name] edited [gene/mutant name] · [relative time]"
- Relative time: "Xh ago", "yesterday", "X days ago" — computed client-side from `created_at`
- Implementation: ~12 lines JS — `setInterval` + opacity transition

---

## 6. Removed from home page

- Entry blocks row (Genomes / Mutants / Search tiles)
- Model Organisms section (content absorbed into Genomes column)
- Recent Updates section (content absorbed into Community cycling strip)
- Search entry block (moved to navbar as a stub)

The `site_updates` table and `loadUpdates` function are retained; the cycling strip uses the same data.

---

## 7. Data requirements summary

| Widget | Query | Status |
|---|---|---|
| Masthead stats | `genes` count, `mutants` count | Existing |
| Genome gene counts | `strains` with embedded `genes(count)` | Existing |
| Mutant collection counts | `mutants` grouped by `collection` | New query |
| Map user count / countries | `users` with location data | Placeholder for now |
| Users stat | `count(*)` from `users` | New query |
| Annotations sparkline | `annotations` grouped by month | New query |
| Top contributors | `annotations` grouped by `user_id` | New query |
| Cycling activity | `site_updates` order by date | Existing |

---

## 8. Not in scope for this session

- Search modal functionality (navbar button is a stub)
- Saved/Favorites page (navbar button is a stub)
- Mobile bottom nav additions for Search/Saved
- Real world map (requires geocoding pipeline)
- Hero background pattern refinement (deferred design pass)
- Column height balancing between sections (revisit after build with real data)
