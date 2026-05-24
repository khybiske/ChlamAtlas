# Spec: What's New & Roadmap Page

**Date:** 2026-05-24  
**Status:** Approved for implementation

---

## Overview

A standalone view accessible to authenticated users via the user dropdown menu. Shows a changelog of site updates, a list of planned features users can upvote, and a suggestion box that emails Kevin directly. Entirely client-side — no new Supabase tables or API calls required.

---

## Access

- Visible to signed-in users only (all roles: community, lab_member, admin)
- Triggered by a "What's New" item in the user dropdown, inserted above "Sign out"
- Loads as a hash route: `#roadmap`

---

## Layout

Three-column grid at desktop width, collapsing to a single stacked column on mobile. Standard app chrome (dark nav bar, white body). Page header with title "📋 What's New & Roadmap" and subtitle "Site updates, planned features, and suggestions."

---

## Section 1 — Changelog

**Data:** Hard-coded array at the top of `roadmap.js`. Each entry:

```js
{ version: 'v0.9.1', date: 'May 24, 2026', type: 'fix', description: '...' }
```

**Types:** `feat` (green badge) | `fix` (orange badge) | `data` (blue badge)

**Rendering:** Simple vertical list, newest first. Each row: version number (bold), type badge, date (right-aligned), description on the next line. No cards, no color backgrounds — just the inline badge provides the accent. New entries are added to this array at deploy time.

---

## Section 2 — Planned Features

**Data:** Hard-coded array in `roadmap.js`:

```js
{ id: 'mobile-audit', label: 'Mobile design audit', description: '...' }
```

**Upvotes:** Stored in `localStorage` under key `chlamatlas_votes` as a JSON object `{ [featureId]: count }`. No deduplication — casual engagement only. Clicking 👍 increments the count and persists it. Voted items show a green-tinted button so the click registers visually.

**Rendering:** Vertical list. Each row: 👍 button (with count), feature label. Sorted by vote count descending on render so most-wanted floats to the top.

---

## Section 3 — Suggestion Box

Fields: name (text input), suggestion (textarea). On submit, opens a `mailto:` link:

- **To:** khybiske@gmail.com  
- **Subject:** `ChlamAtlas feature suggestion`  
- **Body:** Name and suggestion text, URL-encoded

No backend, no API key, no new dependency. User's email client handles delivery.

---

## Files Changed

| File | Change |
|---|---|
| `web/js/views/roadmap.js` | New file — view render function + hard-coded data |
| `web/js/app.js` | Register `#roadmap` route; add "What's New" dropdown item |

---

## Out of Scope

- Admin UI for editing changelog or feature list (updated via code deploy)
- Server-side vote persistence (localStorage is intentional)
- Display of submitted suggestions in-app
- Access by unauthenticated users
