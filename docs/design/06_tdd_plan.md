# Test-Driven Development (TDD) Plan & Implementation Checklist

Implementation follows **Iterative + TDD (Red -> Green -> Refactor)**: for each phase, write failing `pytest` test cases first, implement the minimum clean code to pass, refactor, and commit a green checkpoint.

---

## 1. TDD Test Matrix (`server/tests/`)

| Test Module | Priority Scenarios Covered |
| :--- | :--- |
| **`test_db_and_domain.py`** | 11-table DDL creation; `PRAGMA foreign_keys=ON` rejects broken FKs; `CHECK (end_time > start_time)`; CTI 1:1 invariant; `ResourceFactory` instantiates `RoomResource` / `EquipmentResource` / `AcademicSupportResource`; polymorphic `validate_booking_request()` (duration limits, capacity ceiling, inactive resource); deterministic `seed_db.py` loads all 531 Warwick resources + synthetic users & multi-week bookings. |
| **`test_catalog_crud.py`** | CRUD across `departments`, `buildings`, `users`, `resources` (all 3 CTI subtypes + rollback atomicity if subtype write fails), and N:M `facilities` filtering; soft retire (`resources.status='retired'`) and soft deactivate (`users.is_active=0`); SQL injection probes (`' OR 1=1 --`, `'; DROP TABLE bookings; --`) in search & filter parameters. |
| **`test_bookings_and_conflicts.py`** | Exclusive room overlap blocked (`409`); adjacent back-to-back slots (`end == next_start`) permitted; pooled equipment (`quantity=2`) / workshop (`max_attendees=2`) allows 2 concurrent bookings and rejects the 3rd; user double-booking across two different rooms blocked; cancelled/rejected slots immediately reusable; `pending` -> `confirmed` approval and `pending` -> `rejected` refusal (with optional `notes`) separate refusals from cancellations; invalid terminal-state transitions rejected (`422`); soft delete (`deleted_at`) excludes row from normal queries and conflict checks; CSV batch import reports line-numbered validation & clash errors. |
| **`test_policy_and_privacy.py`** | 4-role RBAC matrix (`admin`, `manager`, `student_services`, `member`); Policy-to-SQL pushdown hides `staff_only` & `disability_only` resources from normal `pg_student` while revealing `pg_only` rooms; direct `POST /bookings` bypass attempt against `disability_only` room returns `403`; `member` cannot cancel/view another student's booking (`403`); `student_services` gets SHA-256 pseudonymised IDs, `"[REDACTED]"` `purpose`/`notes`, `null` name, and `k >= 5` small-cohort suppression in fairness report. |
| **`test_analytics_and_charts.py`** | Overview KPI accuracy (active, cancelled, rejected, no-show rates); most-booked vs zero-booking underused resources; 7x24 day-by-hour demand heatmap totals match booking counts; weekly trend aggregation detects exam pressure peak; 4 PNG charts generated non-empty in temp output directory. |
| **`test_api_and_cli.py`** | FastAPI `TestClient` end-to-end flows (`/health`, `/api/v1/resources`, `/availability`, `/bookings` create/approve/cancel/soft-delete, `/analytics/*`, error codes `401/403/404/409/422`); CLI interactive menu & subcommands smoke test with scripted stdin/stdout. |

---

## 2. Phased Implementation Checklist

### Phase 1 — Database Schema, Domain OOP & Deterministic Seed
- [ ] `T1.1` Create `server/pyproject.toml`, `server/requirements.txt`, and `server/tests/conftest.py` (in-memory / temp SQLite fixtures).
- [ ] `T1.2` Write failing tests in `server/tests/test_db_and_domain.py`.
- [ ] `T1.3` Implement `database/schema.sql` (11 tables, FKs, CHECKs, partial indexes) and `server/app/config.py` (`BookingPolicyConfig`) + `server/app/database.py`.
- [ ] `T1.4` Implement `server/app/domain/exceptions.py`, `enums.py`, and `resources.py` (`Resource(ABC)`, `RoomResource`, `EquipmentResource`, `AcademicSupportResource`, `ResourceFactory`).
- [ ] `T1.5` Implement `database/scripts/seed_db.py` (loads `database/catalog.json` + synthetic users & multi-week bookings with exam pressure spike).
- [ ] `T1.6` Verify `pytest server/tests/test_db_and_domain.py` passes green and commit Phase 1.

### Phase 2 — Repositories, Services, Conflict Engine & RBAC/Privacy
- [ ] `T2.1` Write failing tests in `test_catalog_crud.py`, `test_bookings_and_conflicts.py`, and `test_policy_and_privacy.py`.
- [ ] `T2.2` Implement Pydantic DTOs in `server/app/schemas/`.
- [ ] `T2.3` Implement repositories (`reference_repo.py`, `user_repo.py`, `resource_repo.py`, `booking_repo.py`) with 100% parameterised SQL and atomic CTI transactions.
- [ ] `T2.4` Implement `PolicyGuard` (`server/app/services/policy.py`), `CatalogService`, and `BookingService` (`BEGIN IMMEDIATE` 2-way overlap check, state machine, soft delete, CSV import).
- [ ] `T2.5` Verify all Phase 1 + Phase 2 tests pass green and commit Phase 2.

### Phase 3 — Analytics Queries & Matplotlib Visualisations
- [ ] `T3.1` Write failing tests in `server/tests/test_analytics_and_charts.py`.
- [ ] `T3.2` Implement `analytics_repo.py` and `analytics_service.py` (overview KPIs, top/underused resources, 7x24 heatmap, weekly trends, `k >= 5` course fairness).
- [ ] `T3.3` Implement `chart_service.py` generating 4 clean PNG visualisations in `server/reports/charts/`.
- [ ] `T3.4` Verify all tests pass green and commit Phase 3.

### Phase 4 — FastAPI REST Layer, Thin CLI & Project Docs
- [ ] `T4.1` Write failing tests in `server/tests/test_api_and_cli.py`.
- [ ] `T4.2` Implement FastAPI routers (`health`, `reference`, `users`, `resources`, `bookings`, `analytics`), exception handlers, and `server/app/main.py`.
- [ ] `T4.3` Implement thin CLI in `server/app/cli/` (interactive menu + subcommands with f-string tables, delegating to services).
- [ ] `T4.4` Run full `pytest` suite, finalise `README.md` and update `docs/SDLC.md` with test/interview evidence, and commit Phase 4.
