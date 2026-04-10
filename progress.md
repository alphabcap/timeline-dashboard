# Timeline Dashboard — Progress Log

> Last updated: 2026-04-10
> For AI assistants and human collaborators — this file documents what has been built, how things work, and what's left to do.

---

## Project Overview

**MAGIC Timeline Dashboard** — a React SPA that pulls project timeline data from Google Sheets and displays it in three views (Table, Timeline, Dashboard). Built for MAGIC Digital Marketing Agency to track client deliverables across team members.

### Tech Stack
- **React 19** + **Vite 8** + **Tailwind CSS 4.2** (no additional UI libraries)
- **Google Sheets API v4** — read-only data source for project timelines
- **GitHub Gist API** — shared "server" storage for team members, avatars, and assignments
- **Vercel** — hosting (connected to GitHub for auto-deploy on push)

### Key URLs
- **Production**: `https://timeline-dashboard-rose.vercel.app`
- **Alt deployment**: `https://timeline-dashboard-9t9j.vercel.app`
- **GitHub repo**: `github.com/alphabcap/timeline-dashboard` (public)
- **Vercel project**: Connected to GitHub — auto-deploys on push to `main`

---

## Architecture

```
src/
├── App.jsx                    # Main app — state management, header, routing between views
├── lib/
│   ├── sheetsApi.js           # Google Sheets API — batchGet for efficient data fetching
│   ├── gistStorage.js         # GitHub Gist read/write — team members + assignments
│   └── teamConfig.js          # Team member CRUD, role config, localStorage helpers
├── components/
│   ├── TimelineTable.jsx      # Table view — overdue/upcoming/done task tables
│   ├── TimelineView.jsx       # Timeline view — Gantt-style bars per client
│   ├── DashboardView.jsx      # Dashboard view — stats, health rows, Gantt chart
│   ├── AssignTeam.jsx         # Inline team assignment popup (portal-based)
│   ├── TeamFilterBar.jsx      # Header filter chips for team members
│   ├── TeamManager.jsx        # Modal for managing team members + avatars
│   ├── TeamAvatars.jsx        # Avatar display component
│   ├── ImageCropper.jsx       # Avatar crop tool
│   └── TimelineBar.jsx        # Individual Gantt bar component
└── assets/
    └── magic-logo.svg
```

### Data Flow
1. **Google Sheets** → `sheetsApi.js` fetches via `batchGet` (2 API calls per spreadsheet instead of N+1)
2. **App.jsx** holds all state: `liveTasks`, `teamMembers`, `assignments`, `remarks`
3. **localStorage** caches everything locally for fast load
4. **GitHub Gist** syncs team members and assignments across all users/devices

### Environment Variables (Vercel + `.env`)
| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_SHEETS_API_KEY` | Google Sheets API key (read-only) |
| `VITE_GIST_ID` | GitHub Gist ID for shared storage |
| `VITE_GITHUB_TOKEN` | GitHub PAT with `gist` scope (from `alphabcap` account) |

> **Important**: `VITE_*` vars are baked into the JS bundle at build time. Changing them in Vercel requires a redeploy.

---

## Completed Features

### 1. Google Sheets Batch API Optimization
**Problem**: N+1 API calls per spreadsheet (1 metadata + N tab fetches) — hit rate limits with 10+ concurrent users.
**Solution**: Use `values:batchGet` endpoint — now 2 calls total per spreadsheet (1 metadata + 1 batchGet for all tabs).
**File**: `src/lib/sheetsApi.js`

### 2. Three View Modes
- **Table View** (`TimelineTable.jsx`): Categorized tables — overdue, upcoming, done
- **Timeline View** (`TimelineView.jsx`): Gantt-style horizontal bars grouped by client
- **Dashboard View** (`DashboardView.jsx`): Stats cards, client health rows, mini Gantt chart

### 3. Team Management System
- **Team members** with roles: Creative, AE, PM (color-coded)
- **Avatar uploads** with image cropping (`ImageCropper.jsx`)
- **Team Manager modal** (`TeamManager.jsx`) for CRUD operations
- **Filter bar** (`TeamFilterBar.jsx`) in header — click avatar to filter by person

### 4. Server-Side Storage via GitHub Gist
**Problem**: Team data (members + avatars + assignments) was in localStorage — different per browser/device.
**Solution**: Use GitHub Gist as free shared JSON storage.
- **Team members + avatars** → `magic-team.json` in Gist
- **Assignments** → `magic-assignments.json` in Gist
- On load: pull from Gist → merge into local state
- On update: save to localStorage + push to Gist
**File**: `src/lib/gistStorage.js`

### 5. Team Assignment System
- **Inline assignment UI** (`AssignTeam.jsx`): Click to assign Creative/AE/PM per client
- **Desktop**: Positioned dropdown via React portal (escapes overflow clipping)
- **Mobile**: Bottom sheet with backdrop, drag handle, Done button
- **Persisted**: localStorage + GitHub Gist (synced across devices)

### 6. Mobile-Responsive Header
**Problem**: Single-row header was cramped on mobile, filter chips too small to tap.
**Solution**:
- **Mobile (<640px)**: 2-row layout
  - Row 1: Logo + icon-only view tabs + gear button
  - Row 2: Full-width scrollable filter chips with larger touch targets (32px vs 24px)
- **Desktop (>=640px)**: Single row, unchanged
**Files**: `src/App.jsx` (header), `src/components/TeamFilterBar.jsx`

### 7. Mobile Bottom Sheet for AssignTeam
**Problem**: Dropdown popup was clipped by parent `overflow-hidden` containers.
**Solution**:
- Render via `createPortal` to `document.body`
- Desktop: fixed-position dropdown with `getBoundingClientRect` positioning
- Mobile: full-screen backdrop + bottom sheet with body scroll lock

### 8. Security Hardening
- `.env` and `dist/` added to `.gitignore` (tokens were being exposed in public repo)
- Removed tracked `.env` and `dist/` from git history
- GitHub secret scanning auto-revoked exposed tokens — new tokens generated

### 9. Google Sheets Link per Row
- Every row in Table view has a small link icon (chain icon) after the Content/Topic column
- Clicking opens the correct Google Sheet at the exact tab: `https://docs.google.com/spreadsheets/d/{id}/edit#gid={gid}`
- **gid resolution**: Uses range-string parsing from `batchGet` response + metadata `sheetId` lookup
- **Hidden tabs skipped**: `meta.sheets` filtered by `!t.properties.hidden` to avoid ghost copies across spreadsheets
- **Tab deduplication**: `seenTabs` Set prevents same tab name from appearing multiple times across spreadsheets
- **Grouping key**: Uses `clientName::spreadsheetId` to keep tabs from different spreadsheets separate
- **Files**: `sheetsApi.js` (gid in task objects), `TimelineTable.jsx` (link icon rendering)

### 10. Priority Marking (ไฟไหม้ / ฝากคิด)
- PM can mark any task row with 2 priority levels by clicking the fire icon next to client name
- **🔥 ไฟไหม้** (urgent): Full-row red/orange animated gradient, pulsing glow, flickering fire emoji, red left border
- **💭 ฝากคิด** (consider): Full-row soft amber gradient, gentle breathing glow, amber left border
- Click cycles: none → fire → think → none
- **Synced via Gist**: `magic-priorities.json` — all devices see the same priorities
- **Files**: `gistStorage.js` (load/save), `App.jsx` (state + Gist sync), `TimelineTable.jsx` (PriorityToggle + row CSS), `index.css` (fire/think animations)

### 11. Spreadsheet Color Coding
- Each Google Sheet (MAR26, APR26, FEB26...) gets a distinct background color
- Colors: violet, sky, amber, emerald, rose, cyan, fuchsia, lime
- Group rows have stronger color, sub-rows slightly lighter
- Left border stripe matches sheet color for quick visual identification
- **Files**: `sheetsApi.js` (FILE_COLORS with bg/sub/stripe), `TimelineTable.jsx` (applies border-l-4 + stripe)

---

## Known Issues & Gotchas

### Vercel Deployment
- Hobby plan — no team collaboration. Repo must be public for auto-deploy to work.
- Two Vercel projects exist: `9t9j` (original) and `rose` (primary). Both are now connected to GitHub.
- `VITE_*` env vars were once swapped in Vercel dashboard (GIST_ID had token value and vice versa) — always double-check.

### GitHub Tokens
- **Git push** uses PAT with `repo` scope (embedded in remote URL)
- **Gist API** uses PAT with `gist` scope (stored as `VITE_GITHUB_TOKEN`)
- These can be the same token if it has both scopes
- Token must be from `alphabcap` account (Gist owner) for write access

### Gist File Names
- Team members: `magic-team.json` (array of `{ name, role, avatar }`)
- Assignments: `magic-assignments.json` (object `{ "ClientName": { creative: "Name", ae: "Name", pm: "Name" } }`)
- Priorities: `magic-priorities.json` (object `{ "ClientName::Topic": "fire" | "think" }`)
- If files don't exist in the Gist, the app gracefully falls back to localStorage

---

## Pending / Future Work

- [ ] **Remove debug console.logs** — `gistStorage.js` and `App.jsx` had debug logging (mostly cleaned up, verify none remain)
- [ ] **Conflict resolution for Gist sync** — Currently last-write-wins. If two users update simultaneously, one write is lost. Could add timestamp-based merge.
- [ ] **Image crop for avatar uploads** — `ImageCropper.jsx` exists but may need polish
- [ ] **Auto-assign from responsibility text** — Parse Google Sheet "responsibility" column to auto-suggest team assignments
- [ ] **Remarks sync to Gist** — Remarks are still localStorage-only, could be synced like assignments
- [ ] **Offline support** — Service worker for caching when network is unavailable

---

## Git Remote Setup

```bash
# Remote URL includes PAT for push access
git remote set-url origin https://ghp_TOKEN@github.com/alphabcap/timeline-dashboard.git

# Standard workflow
git add <files>
git commit -m "message"
git push origin main
# Vercel auto-deploys from GitHub
```

---

## File-by-File Reference

| File | Lines | Purpose |
|---|---|---|
| `App.jsx` | ~430 | Main app: state, header, view routing, Gist sync |
| `sheetsApi.js` | ~300 | Google Sheets API: batchGet, task parsing, categorization |
| `gistStorage.js` | ~65 | Gist CRUD: team members + assignments |
| `teamConfig.js` | ~100 | Team roles, localStorage CRUD, role colors/config |
| `TimelineTable.jsx` | ~480 | Table view: overdue/upcoming/done sections |
| `TimelineView.jsx` | ~450 | Gantt timeline: horizontal bars per client |
| `DashboardView.jsx` | ~1200 | Dashboard: stats, health table, mini Gantt |
| `AssignTeam.jsx` | ~220 | Assignment popup: desktop dropdown + mobile bottom sheet |
| `TeamFilterBar.jsx` | ~80 | Header filter chips: avatar buttons per team member |
| `TeamManager.jsx` | ~280 | Team CRUD modal: add/edit/remove members + avatars |
| `ImageCropper.jsx` | ~200 | Canvas-based image crop for avatars |
