# Actionable TODO Board

Granular, checkable tasks derived from `PLAN.md`. Tick off items sequentially per phase following **TDD (`[RED]` -> `[GREEN]` -> `[REFACTOR]`)**.

---

## Phase 0 — Research & Design Foundation *(Completed)*

- [x] `T0.1` `[DOCS]` Audit 6 Warwick campus portals, archive snapshots, screenshots & `database/raw/sources.json` (`sitemap` + `apis`)
- [x] `T0.2` `[DATA]` Build `database/scripts/etl.py` (+ `etl_mappings.json`) and generate `database/seed_data.json` (531 resources, 67 facilities, 3,126 links, 211 360° `image_url`s)
- [x] `T0.3` `[DOCS]` Finalise design suite `docs/design/00_research.md` .. `06_tdd_plan.md` + 6 diagrams (`.mmd` + `.png`)
- [x] `T0.4` `[DOCS]` Create `docs/SDLC.md`, `PLAN.md`, and `TODO.md`

---

## Phase 1 — Database Schema, Domain OOP & Deterministic Seed

- [x] `T1.1` `[SETUP]` Create `server/pyproject.toml`, `server/requirements.txt`, and package `__init__.py` files under `server/app/`
- [x] `T1.2` `[RED]` Create `server/tests/conftest.py` (isolated SQLite DB fixture) and write failing tests in `server/tests/test_db_and_domain.py`
- [x] `T1.3` `[GREEN]` Write `database/schema.sql` (11 tables, FKs, `CHECK` constraints, 5 partial/composite indexes)
- [x] `T1.4` `[GREEN]` Implement `server/app/config.py` (`AppSettings`, `BookingPolicyConfig`) and `server/app/database.py` (`DatabaseManager` with `PRAGMA foreign_keys=ON` & `BEGIN IMMEDIATE`)
- [x] `T1.5` `[GREEN]` Implement `server/app/domain/enums.py`, `exceptions.py`, and `resources.py` (`Resource(ABC)`, `RoomResource`, `EquipmentResource`, `AcademicSupportResource`, `ResourceFactory`)
- [x] `T1.6` `[GREEN]` Implement `database/scripts/seed_db.py` (load `seed_data.json` + 50 synthetic users + ~400 multi-week bookings with exam-week peak)
- [x] `T1.7` `[REFACTOR]` Run `pytest server/tests/test_db_and_domain.py -v` and `python3 database/scripts/seed_db.py --reset` -> verify zero FK errors and commit Phase 1

---

## Phase 2 — Repositories, Services, Conflict Engine & RBAC/Privacy

- [ ] `T2.1` `[RED]` Write failing tests in `server/tests/test_catalog_crud.py` (CTI CRUD, atomic rollback, facilities filter, soft retire/deactivate, SQL-injection probes)
- [ ] `T2.2` `[RED]` Write failing tests in `server/tests/test_bookings_and_conflicts.py` (exclusive clash, adjacent boundary `end == next_start`, pooled concurrency, user clash, state transitions, soft delete, CSV import)
- [ ] `T2.3` `[RED]` Write failing tests in `server/tests/test_policy_and_privacy.py` (4-role RBAC matrix, SQL eligibility pushdown, `403` direct-booking bypass, SHA-256 `ANON-...`, redacted `purpose`/`notes`)
- [ ] `T2.4` `[GREEN]` Implement Pydantic v2 schemas in `server/app/schemas/` (`actor.py`, `reference.py`, `user.py`, `resource.py`, `booking.py`)
- [ ] `T2.5` `[GREEN]` Implement `server/app/repositories/reference_repo.py` and `user_repo.py` (100% parameterised SQL)
- [ ] `T2.6` `[GREEN]` Implement `server/app/repositories/resource_repo.py` (atomic CTI writes, `facilities` sync, eligibility SQL pushdown)
- [ ] `T2.7` `[GREEN]` Implement `server/app/repositories/booking_repo.py` (`blocks_slot = 1` overlap queries, soft delete)
- [ ] `T2.8` `[GREEN]` Implement `server/app/services/policy.py` (`PolicyGuard`) and `catalog_service.py` (CRUD + availability lookup)
- [ ] `T2.9` `[GREEN]` Implement `server/app/services/booking_service.py` (`BEGIN IMMEDIATE` 2-way conflict engine, state machine, soft delete, CSV batch import)
- [ ] `T2.10` `[REFACTOR]` Run `pytest server/tests/ -v` -> verify all Phase 1–2 tests pass green and commit Phase 2

---

## Phase 3 — Analytics Queries & Matplotlib Visualisations

- [ ] `T3.1` `[RED]` Write failing tests in `server/tests/test_analytics_and_charts.py` (KPI accuracy, top/underused resources, 7x24 heatmap totals, weekly trend peak, `k >= 5` fairness suppression, 4 PNG files)
- [ ] `T3.2` `[GREEN]` Implement `server/app/repositories/analytics_repo.py` and `server/app/services/analytics_service.py`
- [ ] `T3.3` `[GREEN]` Implement `server/app/services/chart_service.py` (generate 4 PNG charts in `server/reports/charts/`)
- [ ] `T3.4` `[REFACTOR]` Run `pytest server/tests/ -v` and visually verify generated PNG charts -> commit Phase 3

---

## Phase 4 — FastAPI REST Layer, Thin CLI & Documentation

- [ ] `T4.1` `[RED]` Write failing tests in `server/tests/test_api_and_cli.py` (FastAPI `TestClient` CRUD/booking/analytics/error codes `401/403/404/409/422` + CLI smoke tests)
- [ ] `T4.2` `[GREEN]` Implement `server/app/dependencies.py`, `server/app/routers/` (`health`, `reference`, `users`, `resources`, `bookings`, `analytics`), and `server/app/main.py`
- [ ] `T4.3` `[GREEN]` Implement thin CLI in `server/app/cli/` (interactive menu + subcommands with formatted f-string tables)
- [ ] `T4.4` `[DOCS]` Write `README.md` (quickstart for setup, seed, `pytest`, FastAPI, CLI) and update `docs/SDLC.md` with TDD pass results
- [ ] `T4.5` `[REFACTOR]` Run full `pytest -v` suite + manual CLI & FastAPI `/docs` smoke test -> commit & push Phase 4

---

## Phase 5 — Assessment Delivery & Optional Web Client

- [ ] `T5.1` `[SDLC]` Conduct mock stakeholder interviews, record outcomes in `docs/SDLC.md`, and adjust `BookingPolicyConfig` if requested
- [ ] `T5.2` `[ADMIN]` Grant GitHub read access on `WM9QF_AI_Programming_A1` to `WashingtonEnyinna`, `dscroft`, and `amkayhani`
- [ ] `T5.3` `[SLIDES]` Assemble live presentation deck & demo script (architecture diagrams, Warwick portal screenshots, analytics charts, TDD output)
- [ ] `T5.4` `[OPTIONAL]` Scaffold `client/` web frontend consuming `/api/v1` (unified resource search, MazeMap pins, 360° room preview)
