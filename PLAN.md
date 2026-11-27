# Implementation Plan — Campus Learning Resources Booking & Analytics System

This document is the detailed technical execution plan translating `docs/design/00_research.md` through `06_tdd_plan.md` into five incremental delivery phases. Actionable task checkboxes live in `TODO.md`.

---

## Guiding Delivery Principles

- **Strict TDD (Red -> Green -> Refactor)**: Write failing `pytest` cases first for each phase, implement the minimum clean code to pass, then refactor and commit a green checkpoint.
- **Global Python Environment**: Run directly on the machine's Python 3.11+ environment (`fastapi 0.165.0`, `pydantic`, `pytest`, `httpx`, `matplotlib`) with no `.venv`.
- **Zero Schema Leakage / Zero Hard Deletes**: Stick strictly to the locked 11-table 3NF CTI schema (`database/schema.sql`), UTC Unix epoch `INTEGER` timestamps, 100% parameterised raw SQL (`?`), and soft delete (`deleted_at`, `status='retired'`, `is_active=0`).

---

## Phase 1 — Database Schema, Domain OOP & Deterministic Seed

**Objective**: Establish the relational database foundation, pure-Python OOP domain hierarchy, and repeatable seeding pipeline from real Warwick campus data.

### Deliverables
- `database/schema.sql`: Canonical 11-table DDL (`departments`, `buildings`, `users`, `resources`, `rooms`, `equipment_items`, `support_services`, `facilities`, `resource_facilities`, `booking_statuses`, `bookings`) with `PRAGMA foreign_keys = ON`, `CHECK` constraints (`end_time > start_time`, positive capacities/quantities), and 5 partial/composite indexes.
- `server/pyproject.toml` & `server/requirements.txt`: Package metadata and pinned runtime/test dependencies.
- `server/app/config.py`: `AppSettings` (DB path, reports path, pseudonymisation salt) and `BookingPolicyConfig` (tunable duration ceilings, quota knobs, `k`-anonymity threshold `min_cohort = 5`).
- `server/app/database.py`: `DatabaseManager` managing SQLite connections (`PRAGMA foreign_keys = ON`, `sqlite3.Row`, context managers for normal and `BEGIN IMMEDIATE` write transactions) and schema initialisation from `database/schema.sql`.
- `server/app/domain/`: Framework-free OOP layer:
  - `enums.py`: `Role`, `UserType`, `ResourceType`, `RoomStyle`, `BookingEligibility`, `CheckinMethod`, `ResourceStatus`, `BookingStatusId`.
  - `exceptions.py`: `DomainError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`.
  - `resources.py`: `Resource(ABC)` + `RoomResource` (`max_concurrent_bookings=1`), `EquipmentResource` (`=quantity`), `AcademicSupportResource` (`=max_attendees`) + `ResourceFactory`.
- `database/scripts/seed_db.py`: Idempotent/deterministic seeder loading `database/catalog.json` (58 departments, 205 buildings, 6 booking statuses, 531 resources, 67 facilities, 3,126 links) plus 50 realistic synthetic users across all 4 roles/user types and ~400 multi-week bookings with a realistic exam-week demand spike, cancellations, rejections, and no-shows.
- `server/tests/conftest.py` & `server/tests/test_db_and_domain.py`.

### Exit Criteria
- `pytest server/tests/test_db_and_domain.py -v` passes 100%.
- Running `python3 database/scripts/seed_db.py --reset` builds `database/campus_bookings.db` cleanly with zero FK violations (`PRAGMA foreign_key_check` empty).

---

## Phase 2 — Repositories, Services, Conflict Engine & RBAC/Privacy

**Objective**: Build the complete application core (CRUD, availability, atomic conflict prevention, state machine, CSV import, and two-layer RBAC + privacy enforcement).

### Deliverables
- `server/app/schemas/`: Pydantic v2 DTOs for `ActorContext`, reference tables, users, polymorphic resource create/update/read payloads (`details` discriminated by `resource_type`), bookings, status transitions, availability slots, and CSV import reports.
- `server/app/repositories/` (100% parameterised SQL, zero business logic):
  - `reference_repo.py`: CRUD for `departments`, `buildings`, `facilities`, and `booking_statuses` lookup.
  - `user_repo.py`: CRUD + soft deactivate (`is_active = 0`).
  - `resource_repo.py`: Atomic 2-table CTI create/update (`resources` + subtype + `resource_facilities`), filtered browse with Policy-to-SQL pushdown (`booking_eligibility IN (...)`), soft retire (`status = 'retired'`).
  - `booking_repo.py`: Overlap counting queries (joining `booking_statuses.blocks_slot = 1` and filtering `deleted_at IS NULL`), user clash checks, CRUD, status updates, and soft delete (`deleted_at`).
- `server/app/services/`:
  - `policy.py` (`PolicyGuard`): 4-role RBAC matrix, `allowed_eligibilities(actor)` SQL pushdown helper, `assert_can_book_for()` write guard, and `project_booking()` privacy redaction (SHA-256 `ANON-...` IDs, `"[REDACTED]"` `purpose`/`notes`, stripped name/email for `student_services`).
  - `catalog_service.py`: Role-checked CRUD for departments, buildings, users, resources, facilities, and availability computation (`remaining_slots`).
  - `booking_service.py`: `BEGIN IMMEDIATE` atomic booking creation/rescheduling, 2-way overlap check, `ALLOWED_TRANSITIONS` state machine (`approve`, `reject`, `cancel`, `complete`, `no_show`), soft delete, and line-numbered CSV batch import.
- `server/tests/test_catalog_crud.py`, `test_bookings_and_conflicts.py`, `test_policy_and_privacy.py`.

### Exit Criteria
- All Phase 1 + Phase 2 tests pass (`pytest server/tests/ -v`), including SQL-injection probes, back-to-back boundary tests (`end == next_start`), pooled concurrency limits, `403` bypass checks, and `student_services` redaction.

---

## Phase 3 — Analytics Queries & Matplotlib Visualisations

**Objective**: Deliver decision-support analytics for Learning Resources Manager and privacy-safe fairness/pressure reports for Student Services Representative.

### Deliverables
- `server/app/repositories/analytics_repo.py`: Parameterised aggregate SQL queries (KPI overview, top-booked & zero-booking underused resources, 7x24 day-by-hour demand matrix, weekly booking trend, course fairness with unique student counts).
- `server/app/services/analytics_service.py`: Role-guarded analytics orchestration with `k >= 5` small-cohort suppression (`"Other (<5)"`) in `course_fairness()`.
- `server/app/services/chart_service.py`: Non-interactive Matplotlib (`Agg` backend) generator saving 4 clean, presentation-ready PNG charts to `server/reports/charts/`:
  1. `top_booked_resources.png` (horizontal bar chart)
  2. `busiest_times_heatmap.png` (7x24 day-by-hour demand heatmap)
  3. `weekly_booking_trends.png` (line chart highlighting exam pressure peak)
  4. `course_fairness_and_status.png` (course share with `k >= 5` grouping + status breakdown)
- `server/tests/test_analytics_and_charts.py`.

### Exit Criteria
- All analytics formulas verified against controlled fixture datasets; all 4 PNG files generated non-empty in temp output directory; `pytest` passes green.

---

## Phase 4 — FastAPI REST Layer, Thin CLI & Documentation

**Objective**: Expose the shared service core through both a clean REST API (`/api/v1` + OpenAPI `/docs`) and an interactive/subcommand CLI with formatted f-string tables, plus complete setup docs.

### Deliverables
- `server/app/dependencies.py`: FastAPI `Depends` wiring for `DatabaseManager`, services, and `get_actor_context()` reading `X-Role` / `X-User-Id` (`401` on invalid/missing headers).
- `server/app/routers/`: `health.py`, `reference.py`, `users.py`, `resources.py`, `bookings.py`, `analytics.py`.
- `server/app/main.py`: FastAPI app factory, domain exception -> HTTP status mapping (`401/403/404/409/422`), CORS middleware for future `client/`.
- `server/app/cli/`: Thin interactive menu + subcommands with f-string aligned tables (headers + separators), role switching, full CRUD/availability/analytics/chart export.
- `server/tests/test_api_and_cli.py`.
- `README.md`: End-to-end quickstart (setup, seed, `pytest`, FastAPI `uvicorn`, CLI demo commands) + updated `docs/SDLC.md` with actual TDD run results.

### Exit Criteria
- Full `pytest -v` passes 100% across all 6 test suites.
- Manual smoke check passes for both `uvicorn` OpenAPI `/docs` and CLI interactive walkthrough.

---

## Phase 5 — Presentation Polish & Optional Web Client (`client/`)

**Objective**: Prepare the live assessment demo, stakeholder interview adjustments, and (time permitting) a lightweight web frontend consuming `/api/v1`.

### Deliverables
- Conduct mock stakeholder interviews -> log decisions in `docs/SDLC.md` -> tune `BookingPolicyConfig` if needed.
- Grant GitHub read access on `WM9QF_AI_Programming_A1` to `WashingtonEnyinna`, `dscroft`, `amkayhani`.
- Build presentation deck using `docs/design/diagrams/*.png`, `database/raw/**/screenshots/*.png`, and `server/reports/charts/*.png`.
- *(Optional Product Extension)* Scaffold `client/` web UI consuming `/api/v1` with unified resource discovery, MazeMap coordinates (`lat`/`lon`), and 360° panorama previews (`image_url`).
