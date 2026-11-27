# Test-Driven Development (TDD) Test Matrix

Implementation follows **Iterative + TDD (Red -> Green -> Refactor)**: for each phase, write failing `pytest` test cases first, implement the minimum clean code to pass, refactor, and commit a green checkpoint. See `PLAN.md` for phase architecture/exit criteria and `TODO.md` for the live actionable task board.

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

## 2. Phase-to-Test Mapping

- **Phase 1 (`T1.1`–`T1.7`)** -> `test_db_and_domain.py`
- **Phase 2 (`T2.1`–`T2.10`)** -> `test_catalog_crud.py`, `test_bookings_and_conflicts.py`, `test_policy_and_privacy.py`
- **Phase 3 (`T3.1`–`T3.4`)** -> `test_analytics_and_charts.py`
- **Phase 4 (`T4.1`–`T4.5`)** -> `test_api_and_cli.py`

Track live progress in `TODO.md` and detailed technical deliverables in `PLAN.md`.
