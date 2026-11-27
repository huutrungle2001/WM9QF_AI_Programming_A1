# Domain Research, Engineering Constitution & Design Decisions

This document captures the empirical campus-portal audit, non-negotiable engineering guardrails, and Architecture Decision Records (ADRs) that shaped `01_requirements.md` through `06_tdd_plan.md`.

---

## 1. Empirical Audit of Existing Warwick Booking Systems

Before designing the unified schema, we audited real University of Warwick booking portals (portal map & endpoints recorded in `database/raw/sources.json`, raw snapshots and slide screenshots archived under `database/raw/`). The audit directly confirms the scenario's core problem statement: campus learning resources are fragmented across incompatible silos.

| Portal / Source | What It Manages | Observed Access / Booking Behaviour | Fragmentation Pain Point |
| :--- | :--- | :--- | :--- |
| **Web Room Booking (WRB)** (`timetablingmanagement.warwick.ac.uk`) | 152 student-bookable central teaching/seminar rooms | Pending approval (`request_only="P"`); staff also access local/central rooms | Students cannot see AV equipment or 360° room views inside WRB; requires separate SiteBuilder lookups |
| **Warwick AV & SiteBuilder** (`warwick.ac.uk/.../roominformation/`) | 214 central rooms, 48 meeting rooms, 194 departmental rooms, 230 AV-tag records + 360° panoramas | Mix of public (`room-data.js`, `keywordSearch.htm`) and SSO-protected pages | Equipment metadata lives in a separate CMS from the booking engine; capacity figures occasionally drift between WRB and AV pages |
| **Library Room Booking & LibSpaces** (`roombooking.lib.warwick.ac.uk`, `studyspaces.warwick.ac.uk`) | Rootes Group Study rooms (PIN), 7 Accessible Study Rooms (card swipe), PG Hub rooms, Wolfson Research Exchange, live seat occupancy | Direct booking (auto-confirmed), PIN or ID-card access, eligibility splits (`students_only`, `pg_only`, `pgr_and_staff`, `disability_only`) | Completely separate portal and login flow from WRB; no combined cross-campus availability search |
| **IT Work Areas** (`search.warwick.ac.uk/workareas`) | 12 open-access PC labs (plus 8 IT Access Areas) | Walk-in live PC availability for students; whole-room teaching reservations for staff only | Separate metadata vs live status APIs; no unified calendar with other study spaces |
| **myAdvantage** (`myadvantage.warwick.ac.uk`) | 12 1-on-1 support appointment topics + 23 student skills/careers workshops | Online (MS Teams) or physical building sessions; 1-on-1 or capped group attendance | People/event bookings have no unified analytics alongside rooms and equipment |
| **Equipment Loans & MazeMap** (`api.mazemap.com`, Library Lockers, ServiceNow) | 205 campus buildings with lat/lon; Library Laptop Lockers (card swipe) & departmental loan kits (IDG, WMG, CS) | No central student-facing equipment inventory catalogue; loans split across lockers and ServiceNow tickets | Students and managers lack visibility into specialist hardware utilisation or availability |

---

## 2. Domain Purity Rule & Normalised Seed Coverage

**Core Principle**: *Design the relational schema and OOP domain strictly for the target domain first; treat raw Warwick portal exports purely as a seed adapter (`database/scripts/etl.py`).* Legacy portal fields (e.g. `source_system`, `source_external_id`, `request_only="P"`, HTML blobs) must never leak into canonical database tables.

Mapping the 5 scenario resource categories into our normalised `database/seed_data.json` yields **531 realistic campus resources** across **58 departments**, **205 buildings**, **67 facilities**, and **3,126 resource-facility links** (including **211 rooms with verified 360° panorama `image_url`s**):

| Scenario Category (`resource_type`) | CTI Subtype Table | Seeded Count | Real-World Examples in `seed_data.json` |
| :--- | :--- | :---: | :--- |
| `study_room` | `rooms` | 180 | Central small study rooms, 7 Accessible Study Rooms, Online Meeting Room, consultation rooms |
| `group_space` | `rooms` | 290 | Rootes Group Study 1–2, PG Hub Rooms, Wolfson Research Exchange, central/departmental seminar & lecture rooms |
| `computer_lab` | `rooms` | 20 | 12 Open-Access PC Work Areas (Windows/Linux) + 8 IT Access Areas |
| `specialist_equipment` | `equipment_items` | 6 | Library Laptop Locker Pool (24 units), IDG Loan Laptops, WMG VR/XR Kit, DCS GPU Workstation, Hybrid AV Kit |
| `academic_support` | `support_services` | 35 | 12 1-on-1 appointment services (Careers, Writing, Disability, Course Advice) + 23 workshops |

---

## 3. Engineering Constitution (Non-Negotiable Rules)

1. **Domain-First 3NF Schema (Zero JSON Columns)**: Every table in `database/schema.sql` uses atomic scalar columns, consistent `<entity>_id` naming, and `PRAGMA foreign_keys = ON`. Multi-valued attributes use explicit join tables (`resource_facilities`).
2. **Zero Hard Deletes**: Cancelled bookings transition to `cancelled`; admin booking deletion sets `bookings.deleted_at`; retiring resources sets `resources.status = 'retired'`; deactivating users sets `users.is_active = 0`. Historical auditability and analytics remain intact.
3. **100% Parameterised Raw SQL**: All SQL lives strictly inside `server/app/repositories/` using `?` placeholders. Zero string-interpolated user values.
4. **Atomic Concurrency Control**: Overlap detection and booking insertion run inside SQLite `BEGIN IMMEDIATE` transactions to prevent double-booking race conditions.
5. **Single Access-Control & Privacy Boundary**: `PolicyGuard` (`server/app/services/policy.py`) is the single source of truth for RBAC, Policy-to-SQL eligibility pushdown, and UK GDPR privacy redaction (`ANON-...` SHA-256 pseudonymisation, redacted `purpose`/`notes`, `k >= 5` cohort suppression).
6. **Framework-Free OOP Domain**: `server/app/domain/` contains pure Python OOP (`Resource(ABC)` + 3 concrete subclasses + `ResourceFactory`) with zero `fastapi` or `sqlite3` imports.
7. **Thin Adapters**: FastAPI routers (`server/app/routers/`) and the CLI (`server/app/cli/`) contain zero business logic; both delegate to shared services.
8. **Strict TDD (Red -> Green -> Refactor)**: Automated `pytest` tests are written before or alongside every feature phase and must pass green before each phase commit.

---

## 4. Architecture Decision Records (ADRs & Key Trade-Offs)

| ID | Decision | Alternatives Considered | Rationale & Trade-Off |
| :--- | :--- | :--- | :--- |
| **ADR-01** | **3-pillar monorepo (`database/` + `server/` + `client/`) with Admin-First Core + `ActorContext`** | Monolithic CLI-only script; building auth UI before core CRUD | Building full CRUD/booking/analytics core first with `ActorContext` threaded through every service method ensures both admin operations and role-restricted views share one cohesive engine, while allowing a future web client without refactoring backend logic. |
| **ADR-02** | **Class Table Inheritance (CTI — 11 tables, 3 subtype tables: `rooms`, `equipment_items`, `support_services`)** | Single Table Inheritance (STI — 8 flat tables); 5 separate subtype tables (1 per `resource_type`) | 5 subtypes would duplicate columns across `study_room`/`group_space`/`computer_lab`. STI would leave `host_name` NULL on 93% of rows and `specifications` NULL on 99%. CTI with 3 structural archetypes preserves 3NF and maps 1:1 to our 3 OOP subclasses; the small trade-off is a `LEFT JOIN` on detail reads and a 2-table transaction on create. |
| **ADR-03** | **Lean `rooms` (3 cols: `resource_id`, `capacity`, `room_style`) + N:M `facilities` + shared `resources.description`** | Storing `noise_zone`, `min_group_size`, `has_tutor_station`, `os_type` as fixed columns on `rooms` | Audit showed `noise_zone` mirrored `resource_type` on 488/490 rooms (99.6%), and `min_group_size` lacked source data on >450 rooms. Moving equipment/OS/accessibility features to `facilities` and edge-case rules to `resources.description` prevents brittle schema bloat. |
| **ADR-04** | **Separate `facilities` (room tags) from `equipment_items` (bookable assets)** | Merging all hardware into one table | Fixed room fixtures (projectors, whiteboards, Solstice casting) cannot be booked independently of the room and belong in N:M `facilities`. Borrowable items with stock counts (laptop lockers, VR kits, GPU stations) are standalone bookable `resources` with `equipment_items.quantity`. |
| **ADR-05** | **Minimal `support_services` (4 cols: `resource_id`, `category`, `max_attendees`, `host_name`)** | Adding `delivery_mode`, `session_kind`, and `host_user_id` FK | Online vs in-person is already expressed cleanly by `resources.building_id` (`NULL` vs building ID) + `resources.location` (`Online (MS Teams)` vs room). 1-on-1 vs workshop is expressed by `max_attendees` (`1` vs `> 1`). Team-hosted services rarely map to one `user_id`, so free-text `host_name` avoids synthetic host accounts. |
| **ADR-06** | **Lookup table `booking_statuses` with natural string PK (`'pending'`, `'confirmed'`, ...) and `blocks_slot` flag** | Integer enum `0..5`; inline `CHECK` constraint only | Matches the brief's suggested `booking_statuses` table, keeps SQL/JSON human-readable without magic numbers, and centralises slot-blocking semantics (`blocks_slot = 1`) so conflict queries never repeat hardcoded status lists. |
| **ADR-07** | **Lean `bookings` (11 cols: `purpose` + `notes`, UTC Unix epoch `INTEGER`, `deleted_at`; dropped `access_pin` & `reason_category`)** | Keeping `reason_category` + `public_reference` + `private_notes` + `access_pin` | `reason_category` duplicated `resource_type`; `access_pin` only applied to 3/531 rooms (<1%) while `resources.checkin_method` already captures door-access policy. Keeping `purpose` (maps to brief's *reason for booking*) and `notes` (flexible operational/rejection remarks) applies cleanly to all 3 resource types. |
| **ADR-08** | **Two-layer access control: Policy-to-SQL pushdown (reads) + `PolicyGuard` assertion (writes)** | Filtering eligible resources only in Python after `SELECT *`; trusting UI to hide forbidden rooms | SQL pushdown (`booking_eligibility IN (...)`) keeps pagination and availability queries fast and accurate for UI/CLI. Re-validating inside `BookingService` blocks direct API/CLI bypass attempts with `403 Forbidden`. |
