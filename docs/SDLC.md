# Software Development Lifecycle (SDLC), Stakeholder Interviews & Reflection

This document provides the process governance, stakeholder interview framework, TDD evidence structure, and critical reflection supporting **Learning Outcomes 4 & 5** of WM9QF Assessment A1.

---

## 1. Selected SDLC Methodology: Iterative Development + TDD

We adopted **Iterative Development paired with Test-Driven Development (TDD)** across four incremental delivery phases (`06_tdd_plan.md`).

### Why Iterative + TDD Fits This Project

| Methodology | Strengths | Limitations for WM9QF A1 | Verdict |
| :--- | :--- | :--- | :--- |
| **Waterfall** | Clear upfront documentation and formal phase gates | Rigid against mid-project requirement refinements discovered during mock stakeholder interviews; delays working software until the end | Too rigid |
| **Throwaway Prototyping** | Fast early visual demo | Encourages ad-hoc code, weak relational integrity, and missing automated tests | Fails engineering & TDD rubric |
| **Full Scrum** | Strong cross-functional cadence for long multi-month products | Ceremony overhead (multi-sprint velocity, release burn-downs) is disproportionate for a compact academic prototype | Unnecessary overhead |
| **Iterative + TDD (Chosen)** | Stabilises core relational schema and architecture early, then delivers verifiable working increments (DB/Domain -> CRUD/Conflicts/RBAC -> Analytics/Charts -> API/CLI) with automated tests guarding every refactor | Requires discipline to write tests first and keep docs synced after schema refinements | **Best fit** |

### Mapping the 7 Standard SDLC Phases to Repository Artefacts

| SDLC Phase | Concrete Artefacts in This Repository |
| :--- | :--- |
| **1. Requirements Analysis** | `docs/design/00_research.md` (portal audit), `docs/design/01_requirements.md` (Actors, FR/NFR, Business Rules), Section 2 below (Stakeholder Interviews) |
| **2. System Architecture** | `docs/design/02_system_architecture.md`, `diagrams/layered_architecture.png`, `diagrams/dependency_flow.png` |
| **3. Detailed Design** | `docs/design/03_data_models.md` (`diagrams/erd.png`), `docs/design/04_ood_design.md` (`diagrams/class_diagram.png`), `diagrams/booking_state.png`, `diagrams/booking_sequence.png`, `docs/design/05_api_contracts.md` |
| **4. Implementation** | `database/schema.sql`, `database/scripts/{etl,seed_db}.py`, `server/app/{domain,schemas,repositories,services,routers,cli}/` |
| **5. Testing (TDD)** | `docs/design/06_tdd_plan.md`, `server/tests/` (6 automated `pytest` suites executed Red -> Green -> Refactor per phase) |
| **6. Deployment & Delivery** | `README.md` (reproducible setup/run guide), FastAPI OpenAPI `/docs`, live CLI & chart demonstration, GitHub repository shared with markers |
| **7. Maintenance & Evolution** | `BookingPolicyConfig` externalised rules (zero-migration policy tuning), modular `ResourceFactory` for future resource types, Section 5 roadmap |

---

## 2. Stakeholder Interviews (Preparation & Policy Adjustment Log)

### Design Strategy: Separating Engineering Core from Policy Knobs

Core domain invariants (relational integrity, double-booking prevention, full CRUD, soft delete, RBAC architecture) are built up front from an **Admin-First Core** so stakeholder answers tune runtime policies in `BookingPolicyConfig` rather than blocking architecture or forcing database rewrites.

### Prepared Interview Questions

#### Stakeholder 1 — Learning Resources Manager (Efficiency, Reliability & Planning)
1. **Usage Quotas & Fair Lead Times**: Should students have a daily/weekly booking cap (e.g. max 2 bookings/day or 6 hours/week) and a maximum advance booking horizon (e.g. 14 days) to prevent exam-period hoarding?
2. **Underused & Overbooked Thresholds**: What utilisation rate or booking-count threshold should flag a room/equipment item as *underused* vs *overbooked* in monthly planning reports?
3. **Approval Workflow**: Beyond centrally timetabled lecture rooms and specialist lab kits, should any other resource types start in `pending` for manager approval, or should standard study spaces auto-confirm?
4. **Maintenance Disruption Policy**: When a manager places an active room into `maintenance`, should existing future bookings auto-cancel with a note, or remain flagged for manual re-allocation?
5. **Operational Reporting Format**: Which outputs matter most to non-technical staff — top/bottom utilisation tables, 7x24 peak heatmaps, cancellation/no-show breakdowns, or exportable PNG charts for slide packs?

#### Stakeholder 2 — Student Services Representative (Fairness, Accessibility & Privacy)
1. **Defining Fair Access Across Courses**: When measuring course fairness, should we compare total bookings per course, bookings per active student, or peak-hour share — and is `k >= 5` students per cohort sufficient to prevent re-identification?
2. **Privacy Boundary on Booking Records**: Should Student Services only view pseudonymised IDs (`ANON-...`) with `purpose` and `notes` redacted, or strictly aggregated summary metrics with zero row-level access?
3. **Accessible Study Rooms & Data Minimisation**: Is a single boolean eligibility flag (`has_accessibility_access`, storing zero medical details) acceptable under university data-minimisation policy?
4. **Peak Semester Pressure**: Which time windows (e.g. revision/exam weeks, afternoon peaks 13:00–17:00) are most critical to highlight in weekly trend reports to justify extended opening hours?
5. **Late Cancellations & No-Shows**: Should repeated no-shows be tracked purely as an anonymised operational KPI, or trigger a warning policy?

### Stakeholder Interview Outcomes & Design Adjustments Log

*(Complete during/immediately after the live mock stakeholder interview to document requirement refinement for LO 5.)*

| Date | Stakeholder | Requirement / Policy Clarified | Concrete System / Config Change Applied |
| :--- | :--- | :--- | :--- |
| *TBC* | Learning Resources Manager | *Record quota, threshold, and reporting decisions here* | *Update `BookingPolicyConfig` / analytics thresholds / `docs/design/`* |
| *TBC* | Student Services Representative | *Record privacy, k-anonymity, and fairness metric decisions here* | *Update `PolicyGuard` / `AnalyticsService.course_fairness()`* |

---

## 3. Test-Driven Development (TDD) & Quality Assurance Evidence

Each implementation phase in `docs/design/06_tdd_plan.md` follows a strict **Red -> Green -> Refactor** loop:

1. **Red**: Add targeted `pytest` test cases in `server/tests/` for the phase's database invariants, domain rules, API contracts, RBAC/privacy guards, or analytics formulas; verify they fail before implementation.
2. **Green**: Implement the minimum clean repository, domain, service, or router code needed to make the suite pass.
3. **Refactor**: Eliminate duplication, check type hints and SQL parameterisation, re-run the full `pytest` suite, and create a focused Git commit per phase.

Evidence to capture for the presentation slides:
- Full `pytest -v` output showing all 6 test suites passing.
- Concrete examples of bug/edge-case tests (back-to-back boundary `end == next_start`, concurrent pool exhaustion on equipment/workshops, SQL injection payloads, `403` bypass prevention, `k < 5` cohort suppression).
- Git commit log showing incremental design -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 progression.

### Verification on the automation branch

- `python3 -m pytest server/tests/ -q`: **57 passed**, spanning six test modules.
- From `client/`, `npm run typecheck` and `npm run build` passed. The local Orca browser regression `node --test client/tests/actor-role.e2e.mjs` passed against a disposable seeded database.
- Live browser smoke verified resource filters and availability, booking creation and clashes, manager approval, cancellation surviving a reload, analytics and four PNG exports, and the Student Services read-only view. The smoke did not cover every admin or rescheduling path.
- Integration uncovered a frontend hydration race during role switching and a CORS configuration issue on non-default local ports. Both were fixed with regression tests.
- Orca workers assisted with implementation and testing. The team still needs to critically review and revise the prototype and document actual human contributions and AI use before submission.

---

## 4. Team Collaboration & Git Workflow

- **Repository**: The course requires a private GitHub repo for submission. Confirm the visibility of `WM9QF_AI_Programming_A1` and grant the required tutors read access before grading.
- **Commit Discipline**: Conventional Commits (`docs(...)`, `feat(...)`, `test(...)`, `fix(...)`, `refactor(...)`) with small, reviewable phase checkpoints rather than one bulk upload.
- **Code Standards**: Python 3.11+, type annotations, PEP 8 formatting, 100% parameterised SQL, zero hardcoded absolute paths.

### Member Contribution Matrix *(Update as team members complete modules)*

| Team Member | Primary Responsibilities | Key Files / Modules | Verification & Review |
| :--- | :--- | :--- | :--- |
| *Member 1* | Portal audit, 3NF CTI DB design, `schema.sql`, `etl.py`, `seed_db.py`, Domain OOP | `database/`, `server/app/domain/` | `test_db_and_domain.py` |
| *Member 2* | Repositories, Booking conflict engine, RBAC/Privacy `PolicyGuard` | `server/app/repositories/`, `server/app/services/` | `test_catalog_crud.py`, `test_bookings_and_conflicts.py`, `test_policy_and_privacy.py` |
| *Member 3* | Analytics SQL, Matplotlib charts, FastAPI routers, CLI & presentation | `analytics_*`, `chart_service.py`, `routers/`, `cli/` | `test_analytics_and_charts.py`, `test_api_and_cli.py` |

---

## 5. Critical Reflection, Limitations & Future Improvements

### Challenges Encountered & How We Responded
- **Over-modelling vs Flexibility**: Early schema drafts included separate tables for 5 resource types plus portal-specific fields (`noise_zone`, `min_group_size`, `access_pin`, `delivery_mode`). Auditing real Warwick datasets revealed high redundancy (e.g. `noise_zone` duplicated `resource_type` on 99.6% of rooms; `access_pin` applied to <1% of resources). Refactoring to a lean 11-table CTI schema before writing implementation code avoided costly later migrations.
- **Inconsistent External Data**: Warwick's WRB portal and AV room pages occasionally disagreed on room capacity and building naming (e.g. `"Ramphal, University of Warwick"` vs `"Ramphal"`). Isolating all data cleaning inside `database/scripts/etl.py` kept the application schema completely clean.

### Current Prototype Limitations & Future Roadmap
1. **Authentication**: `X-Role` / `X-User-Id` headers select a demo actor, not an authenticated identity. Run locally with synthetic users and bookings only. A deployment needs server-verified identity and a server-side minimum privacy threshold.
2. **Database Scalability**: SQLite with `BEGIN IMMEDIATE` cleanly handles single-node prototype concurrency; high-concurrency university deployment would migrate the same parameterised SQL schema to PostgreSQL with exclusion constraints (`EXCLUDE USING gist`).
3. **Live Portal Integration**: Currently seeded from verified point-in-time snapshots (`database/raw/`); a production version would schedule incremental sync jobs against official campus APIs.
4. **Web Client (`client/`)**: The prototype shows campus location and panorama previews where metadata is available. A richer floor-map integration remains future work.
5. **Advanced Booking Features**: Recurring series bookings, automated waitlists, calendar (`.ics`) invites, and email/Teams reminders.
