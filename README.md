# Campus Learning Resources Booking & Analytics System

A unified university resource booking, approval, and utilisation analytics platform built around a canonical **11-table 3NF Class Table Inheritance (CTI)** SQLite schema populated with **531 real University of Warwick resources** (study rooms, group spaces, computer labs, specialist equipment pools, and academic support services), **205 buildings**, and **58 departments**.

The FastAPI REST API (`/api/v1`) and CLI share the same booking, catalogue, and analytics services. Student Services views redact identifying fields and group small cohorts by default.

**Local demo only:** The actor headers select a demo persona; they do not authenticate anyone. Keep the API and web client on loopback, use synthetic users and bookings, and do not expose the demo to a network.

---

## Prerequisites

- **Python 3.11+** with packages from `server/requirements.txt` (`fastapi`, `uvicorn`, `pydantic`, `matplotlib`, `httpx`, `pytest`, `python-multipart`)
- **Node.js 20+ & npm** (optional, for the Next.js web client in `client/`)

Install Python packages if needed:

```bash
pip install -r server/requirements.txt
```

---

## Quick Start

### 1. Seed the Deterministic SQLite Database

Seeds `database/resource_bookings.db` with 531 catalogue entries, 50 synthetic users, and 400 sample bookings featuring an exam-week demand surge. Use `--reset` only when you intend to delete and rebuild a disposable demo database.

```bash
python3 database/scripts/seed_db.py
```

### 2. Run the Full TDD Suite (`pytest`)

Runs all Phase 1–4 unit, integration, RBAC/privacy, analytics/charts, FastAPI `TestClient`, and CLI tests against isolated temporary SQLite databases:

```bash
pytest server/tests/ -v
```

### 3. Start the FastAPI REST API & Inspect OpenAPI Docs

```bash
cd server
uvicorn app.main:app --host 127.0.0.1 --reload
```

- Health check: `http://127.0.0.1:8000/health` (and `/api/v1/health`)
- Interactive Swagger UI: `http://127.0.0.1:8000/docs`

### 4. Run the Thin CLI (Subcommands & Interactive Menu)

From `server/`:

```bash
# Launch guided interactive menu (role switching, booking CRUD, analytics, charts, CSV import)
python3 -m app.cli.main menu

# Browse resources as a PG student (Policy-to-SQL pushdown hides staff_only & disability_only)
python3 -m app.cli.main --role member --user-id S1001 resources --type group_space --limit 10

# Check real-time availability (accepts Unix epoch seconds or ISO-8601 UTC)
python3 -m app.cli.main availability --start 2026-12-07T09:00:00Z --end 2026-12-07T11:00:00Z --type group_space

# Create and cancel a booking
python3 -m app.cli.main --role member --user-id S1001 book --resource LIB-GSR-6 --start 2026-12-15T10:00:00Z --end 2026-12-15T12:00:00Z --purpose "Sprint Review"
python3 -m app.cli.main --role member --user-id S1001 cancel 401 --notes "Rescheduled"

# Batch import sample CSVs (clean vs line-numbered validation & clash report)
python3 -m app.cli.main --role admin import-csv ../database/samples/sample_bookings.csv
python3 -m app.cli.main --role admin import-csv ../database/samples/sample_bookings_with_errors.csv

# View operational & k>=5 fairness analytics tables
python3 -m app.cli.main --role student_services analytics --report all

# Export 4 Matplotlib PNG charts to server/reports/charts/
python3 -m app.cli.main --role manager charts

# Start the FastAPI server directly via the CLI
python3 -m app.cli.main serve --reload
```

### 5. Start the Next.js Web UI (`client/`)

With the FastAPI server running on `http://127.0.0.1:8000`:

```bash
cd client
npm install
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000` and use the top-bar **Role Switcher** to inspect Admin, Manager, Student Services (UK GDPR redacted), PG Student, Accessible UG Student, and Academic Staff views.

---

## Demo Actor Headers (`/api/v1/*`)

Every `/api/v1/*` request identifies its caller via lightweight actor headers:

| Persona | `X-Role` | `X-User-Id` | User Type | Access & Privacy Scope |
| :--- | :--- | :--- | :--- | :--- |
| **System Admin** | `admin` | `ADMIN1` | `staff` | Full CRUD, approvals, soft delete, CSV import, all analytics & charts |
| **Library Manager** | `manager` | `MGR-LIB` | `staff` | Resource CRUD, approve/reject/complete/no-show, CSV import, analytics & charts |
| **Student Services** | `student_services` | `SS1` | `staff` | Read-only; `user_id` SHA-256 pseudonymised (`ANON-...`), `purpose`/`notes` `"[REDACTED]"`, `k >= 5` fairness |
| **PG Student** | `member` | `S1001` | `pg_student` | Own bookings only; sees `all_users`, `students_only`, `pg_only` (hides `staff_only` & `disability_only`) |
| **Accessible UG Student** | `member` | `S1002` | `ug_student` | Own bookings only; `has_accessibility_access=1` unlocks `disability_only` rooms |
| **Academic Staff** | `member` | `STAFF1` | `staff` | Own bookings only; sees `all_users`, `staff_only`, `pgr_and_staff` |

---

## Example `curl` Workflows

```bash
# Check availability
curl -H "X-Role: member" -H "X-User-Id: S1001" \
  "http://127.0.0.1:8000/api/v1/availability?start_time=2026-12-07T09:00:00Z&end_time=2026-12-07T11:00:00Z&resource_type=group_space"

# Batch import bookings via raw CSV (also supports multipart file upload and JSON {"csv_content": "..."})
curl -X POST http://127.0.0.1:8000/api/v1/bookings/import-csv \
  -H "X-Role: admin" -H "X-User-Id: ADMIN1" -H "Content-Type: text/csv" \
  --data-binary @database/samples/sample_bookings_with_errors.csv

# Inspect UK GDPR redacted bookings as Student Services
curl -H "X-Role: student_services" -H "X-User-Id: SS1" \
  "http://127.0.0.1:8000/api/v1/bookings?limit=5"

# Export 4 PNG analytics charts
curl -X POST -H "X-Role: manager" -H "X-User-Id: MGR-LIB" \
  "http://127.0.0.1:8000/api/v1/analytics/charts"
```

---

## Key Architecture & Files

- **Database & ETL**: `database/schema.sql` (11-table 3NF CTI DDL), `database/seed_data.json`, `database/scripts/seed_db.py`, `database/samples/*.csv`
- **Backend Core**: `server/app/domain/` (framework-free OOP CTI hierarchy), `server/app/repositories/` (100% parameterised SQL), `server/app/services/` (`PolicyGuard`, `CatalogService`, `BookingService`, `AnalyticsService`, `ChartService`)
- **Thin Adapters**: `server/app/routers/` & `server/app/main.py` (FastAPI `/api/v1`), `server/app/cli/` (`argparse` subcommands + interactive menu)
- **Web UI**: `client/` (Next.js App Router + TypeScript + Tailwind consuming `/api/v1`)
- **Generated Charts**: `server/reports/charts/` (`top_booked_resources.png`, `busiest_times_heatmap.png`, `weekly_booking_trends.png`, `course_fairness_and_status.png`)

