# UI/UX Information Architecture & Design Specification (Skin 1: Steep + Attio)

This document defines the frontend Information Architecture (IA), page-level layout patterns, component boundaries, and visual design tokens for `client/` (Next.js App Router + TypeScript + Tailwind CSS).

---

## 1. Visual System — Steep + Attio Hybrid (Unified Monochrome + Warm Accent)

- **Consumer Aesthetic (`/`, `/resources`, `/resources/[id]`, `/bookings`)**: Modeled directly on **Steep** as implemented in **Warwick Events Hub** (`/Users/huutrungle2001/Documents/OnGoing/warwick_events_hub/fe/` + `refero/steep/DESIGN.md`). Editorial whitespace, paper/mist surfaces, 24px cards, pill actions, whisper-quiet single-row top navigation.
- **Admin Console Craft (`/admin/*`)**: Modeled on **Attio's** architectural precision (`refero/attio/DESIGN.md`)—crisp sidebar navigation, compact 1px-hairline data tables, high-signal master–detail queues—while **strictly reusing Steep's exact color & font tokens** (no cobalt blue clash).

### Core Tokens
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `ink` | `#17191c` | Primary typography, filled dark pill CTAs, active tabs |
| `paper` | `#ffffff` | Primary canvas, elevated cards, inputs, modal surfaces |
| `mist` | `#f2f2f3` | Quiet secondary cards, nested info strips, table header bands |
| `fog` | `#fafafb` | Alternating section background & subtle hover wash |
| `hairline` | `#ececec` | 1px borders, dividers, table rules |
| `slate-muted` | `#777b86` | Secondary body copy, helper text, subtitles |
| `ash` | `#979799` | Tertiary metadata, typographic tags |
| `smoke` | `#a3a6af` | Placeholders, disabled labels |
| `blush` | `#fbe1d1` | **Rare** warm editorial accent surface (at most 1 highlight moment per view) |
| `sienna` | `#5d2a1a` | Text on `blush` surfaces, chart trend stroke, peak emphasis |

### Typography Rules
- **Headings, Body & KPI Figures**: **Plus Jakarta Sans** (`next/font/google`, weights `400–700`, tight tracking `-0.015em` to `-0.025em` on headlines). Numeric KPIs use CSS `font-variant-numeric: tabular-nums` in **Plus Jakarta Sans** (NEVER `font-mono`).
- **Technical Codes Only**: **JetBrains Mono** strictly for IDs (`CTR-FAB507`, `ANON-...`), timestamps, and coordinates (`52.3834, -1.5612`).

### Strict Anti-AI-Slop Rules
- Never show a generic SaaS left sidebar on consumer routes (`/`, `/resources`, `/bookings`).
- Never show `Sparkles` contextual banners, `API Online · 25ms` telemetry pills, or decorative gradients.
- Never stack 4–5 colored pill badges per card; keep at most 1–2 restrained metadata indicators per card.
- Never alias Tailwind's `indigo`/`fuchsia`/`warwick` palettes as a shortcut; use clean semantic tokens.

---

## 2. Information Architecture (3 Zones, 2 Layout Shells)

```text
[Shell 1: Consumer Top Nav — single-row whisper-quiet header]
├── /                        Landing Page (Split Screen Hero + Bento Grid)
├── /resources               Resources Listing (Card Grid: 5-type Sections + Dynamic CTI Filters)
│   └── /resources/[id]      Resource Detail & Book (65/35 Split Screen + Sticky Booking Panel)
└── /bookings                My Bookings (Master–Detail: Upcoming / History / Cancelled)

[Shell 2: Admin Console — compact Attio-style Sidebar Layout]
└── /admin
    ├── /admin               Overview & Analytics (Bento Grid: KPIs, Trends, 7x24 Heatmap, Fairness k>=5, Export PNG)
    ├── /admin/approvals     Approvals Queue (Master–Detail pending inbox: Approve / Reject with notes)
    ├── /admin/bookings      Bookings Table (Table Layout + filters, soft delete, Single-Column CSV Batch Import modal/tab)
    ├── /admin/resources     Resources Table (Table Layout for 531 resources + Single-Column CTI Create/Edit form)
    ├── /admin/users         Users Table (Table Layout: 50 users, role/type/accessibility badges, deactivate)
    └── /admin/catalog       Reference Tables (Table Layout with 3 tabs: Departments | Buildings | Facilities)
```

### Role Visibility Across Shells
- **`member`**: Uses Shell 1 (`/`, `/resources`, `/resources/[id]`, `/bookings`). `Admin Console` link hidden or shows clean access notice.
- **`student_services`**: Can access `/admin` (Analytics & Fairness) and `/admin/bookings` in read-only privacy-protected mode (`ANON-...` IDs, `[REDACTED]` `purpose`/`notes`, zero mutating buttons).
- **`manager`**: Full Shell 1 + Shell 2 (`/admin`, `/admin/approvals`, `/admin/bookings`, `/admin/resources`, `/admin/catalog`).
- **`admin`**: Full access across every Consumer and Admin route, including `/admin/users` and booking soft-delete.

---

## 3. Page-by-Page Layout Blueprint

### 3.1 `/` — Landing Page (*Split Screen Hero + Bento Grid*)
- **Hero (Split Screen)**:
  - Left: Editorial Plus Jakarta Sans headline (e.g. *"One place for every Warwick study room, lab, kit & support session."*), concise subtitle, quick search bar (submits to `/resources?q=...`), and paired pill CTAs (`Explore Resources` filled dark pill + `My Bookings` ghost pill).
  - Right: One clean floating artifact preview showing live campus counts pulled from the API (531 resources, 205 buildings, 58 departments, 67 AV/facility tags) without clutter.
- **Bento Grid (Below the fold)**:
  - 5 clean cards mapping directly to the 5 scenario `resource_type` categories (`Study Rooms`, `Group Spaces`, `Computer Labs`, `Specialist Equipment`, `Academic Support`), each linking directly to `/resources?type=<type>`.
  - One subtle `blush` / `sienna` editorial highlight tile summarizing the unified portal consolidation (replacing 6 fragmented campus portals).

### 3.2 `/resources` — Resources Listing (*Sectioned Card Grid + Dynamic CTI Filters*)
- **Top Type Tabs**: `All`, `Study Rooms`, `Group Spaces`, `Computer Labs`, `Specialist Equipment`, `Academic Support`.
- **Mode A — `All` Tab (Sectioned Discovery)**:
  - Displays up to 5 clean horizontal sections (one per `resource_type`), showing 3–4 representative cards each + `View all (N) ->` link that switches into that category tab.
  - When a search query or live availability window is active on `All`, switches smoothly to a flat filtered Card Grid.
- **Mode B — Specific Category Tab (CTI-Specific Dynamic Filters)**:
  - **Rooms (`study_room`, `group_space`, `computer_lab`)**: Search · Campus Zone · Building · Min Capacity · Room Style (`seminar`, `study_pod`, `boardroom`, `lecture`, `flexible`, `standard`) · Facility/AV tag · Live Availability (Date + Start/End hours).
  - **Specialist Equipment (`specialist_equipment`)**: Search · Equipment Category · Pickup Building · Check-in Method · Live Availability (From Date -> To Date multi-day loan window).
  - **Academic Support (`academic_support`)**: Search · Topic Category · Format (`Online` vs `In-person` via `building_id === null`) · Session Size (`1-on-1` vs `Workshop`) · Live Availability (Date + Time).
- **Card Craft**: `24px` radius, quiet `#f2f2f3` mist or `1px #ececec` hairline white card, room name, building/location, single primary metric (`12 seats · Seminar`, `24 units`, or `1-on-1 · Online`), max 1–2 restrained metadata tags, subtle top-right `360°` indicator if `image_url` exists, dark pill `Book` + ghost link `Details ->`.

### 3.3 `/resources/[id]` — Resource Detail & Book (*65/35 Split Screen*)
- **Left Column (65%)**: Back breadcrumb, editorial title + mono `resource_id`, 360° / Room Photo viewer (`image_url`), subtype specifications grid, typographic AV/facility tag list (no heavy colored boxes), description, and clean Campus Location card with building coordinates (`lat`, `lon`) + MazeMap / OpenStreetMap link.
- **Right Column (35%, sticky)**: Inline polymorphic **Booking Panel** (adapts inputs for Room hourly slot, Equipment multi-day loan, or Academic Support session), shows approval expectation (`Instant confirmation` vs `Requires approval`), handles `409` conflict & `403` eligibility messages cleanly.

### 3.4 `/bookings` — My Bookings (*Master–Detail*)
- **Left Pane (Master List)**: Segmented filter (`Upcoming`, `Pending`, `History`, `All`), compact scannable rows showing resource name, date/time window, and quiet status dot/pill.
- **Right Pane (Detail Inspector)**: Full details of selected booking — resource link, location, time window, `purpose`, `notes`, timestamps, plus inline **Reschedule / Edit Purpose** modal trigger and **Cancel Booking** action.
- Preserve `<React.Fragment key={actor.id}>` remount guard so switching actors never flashes stale booking rows.

### 3.5 `/admin/*` — Admin Console (*Attio-Style Sidebar Layout*)
- **Compact Sidebar (`232px`)**: Brand link back to Consumer site (`<- Back to Explorer`), active role badge, grouped navigation:
  - *Insights*: `Overview & Analytics` (`/admin`)
  - *Operations*: `Approvals Queue` (`/admin/approvals`, shows live pending count), `Bookings` (`/admin/bookings`)
  - *Catalogue*: `Resources` (`/admin/resources`), `Users` (`/admin/users`), `Reference Data` (`/admin/catalog`)
- **`/admin` (Bento Grid)**: 4–5 crisp KPI tiles (Plus Jakarta Sans figures), Weekly Booking Trend chart (monochrome bars + `#5d2a1a` sienna line + peak callout), 7×24 Demand Heatmap (mist -> ash -> sienna -> ink), Top Booked & Underused tables, Cancellation Breakdown, Course Fairness table highlighting `k >= 5` suppressed `Other (<5)`, and `Export PNG Charts` pill CTA.
- **`/admin/approvals` (Master–Detail)**: Left pane lists `pending` requests; right pane inspects requester, resource, window, `purpose`, optional manager `notes` input, and paired `Approve` (dark pill) / `Reject` (blush/sienna pill) buttons.
- **`/admin/bookings` (Table Layout + Single-Column CSV Import)**: Dense hairline table with status/search filters, `student_services` redaction styling (`ANON-...` / `[REDACTED]`), admin soft-delete button, and a clean `Import CSV` drawer/tab using Single-Column layout with line-numbered `ImportSummary`.
- **`/admin/resources` (Table Layout + Single-Column CTI Form)**: Dense hairline table of all 531 resources (filter by type/status/search, toggle `active`/`maintenance`, soft retire), plus `+ New Resource` opening a clean Single-Column polymorphic CTI form (`RoomDetails` / `EquipmentDetails` / `SupportDetails`).
- **`/admin/users` (Table Layout)**: All users with role, `user_type`, course, department, accessibility flag, active status, create user modal, and soft deactivate.
- **`/admin/catalog` (Table Layout with 3 Tabs)**: Clean entity tables + create forms for `Departments` (58), `Buildings` (205, with zone & lat/lon), and `Facilities` (67).

