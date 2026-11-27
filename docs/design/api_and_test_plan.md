# REST API Payloads & TDD Test Plan

This contract specifies concrete JSON payloads for `/api/v1` and the **Test-Driven Development (TDD)** matrix that drives implementation in `server/tests/` (Red -> Green -> Refactor).

---

## 1. Authentication & Actor Context Headers

Every `/api/v1/*` request carries lightweight actor headers (swappable for Warwick SSO / JWT in production without altering service code):

- `X-Role`: `admin` | `manager` | `student_services` | `member` *(required; missing/unknown -> `401 Unauthorized`)*
- `X-User-Id`: User ID in `users` (required when `X-Role: member`, optional for `admin`/`manager`/`student_services`)

---

## 2. Representative JSON Payloads

### 2.1 Create Resource with CTI Subtype (`POST /api/v1/resources`)

Uses a discriminated `details` object matching `resource_type` (`rooms`, `equipment_items`, or `support_services`) plus atomic `facilities: list[str]`.

**Example A — Room / Lab (`study_room`, `group_space`, or `computer_lab`)**:

```json
{
  "resource_id": "LIB-GSR-3",
  "resource_name": "Rootes Group Study 3",
  "resource_type": "group_space",
  "department_id": "LIB",
  "building_id": "MM-1016749",
  "location": "Rootes Group Study 3",
  "description": "Collaborative group room (open 09:00-22:00); consecutive hourly slots merge automatically.",
  "image_url": null,
  "requires_approval": false,
  "booking_eligibility": "students_only",
  "checkin_method": "pin",
  "facilities": ["Large Display Screen", "Whiteboard", "PIN Door Access"],
  "details": {
    "capacity": 8,
    "room_style": "study_pod"
  }
}
```

**Example B — Specialist Equipment (`specialist_equipment`)**:

```json
{
  "resource_id": "EQ-WMG-XR-02",
  "resource_name": "WMG Spatial Computing Kit",
  "resource_type": "specialist_equipment",
  "department_id": "WMG",
  "building_id": "MM-1016780",
  "location": "IMC — Digital Prototyping Counter",
  "description": "Loanable XR kit for student coursework demos (open 09:00-17:00; up to 3 days).",
  "requires_approval": true,
  "booking_eligibility": "all_users",
  "checkin_method": "none",
  "facilities": ["VR Headset", "Motion Controllers"],
  "details": {
    "category": "vr_xr",
    "quantity": 4,
    "specifications": "Headset, dual controllers, USB-C tether cable, padded case."
  }
}
```

**Example C — Academic Support (`academic_support`)**:

```json
{
  "resource_id": "SUP-WRITING-1TO1",
  "resource_name": "1-on-1 Academic Writing Mentor",
  "resource_type": "academic_support",
  "department_id": "ADC",
  "building_id": null,
  "location": "Online (MS Teams)",
  "description": "Open 09:00-17:00. Bring a draft section (up to 1,000 words) for structure and clarity feedback.",
  "requires_approval": false,
  "booking_eligibility": "students_only",
  "checkin_method": "none",
  "facilities": ["MS Teams Consultation"],
  "details": {
    "category": "writing",
    "max_attendees": 1,
    "host_name": "Academic Writing Mentors Team"
  }
}
```

### 2.2 Availability Lookup (`GET /api/v1/availability`)

- Query: `?start_time=1796126400&end_time=1796133600&resource_type=group_space&zone=Main+Site&facility=Whiteboard&min_capacity=4`
- Behaviour: Applies `PolicyGuard.allowed_eligibilities(actor)` directly in SQL (`booking_eligibility IN (...)`), checks `status = 'active'`, and returns only resources where overlapping blocking bookings `< resource.max_concurrent_bookings()` (`1` for rooms, `quantity` for equipment, `max_attendees` for support), annotated with `remaining_slots`.

### 2.3 Create Booking (`POST /api/v1/bookings`)

**Request**:

```json
{
  "user_id": "S1001",
  "resource_id": "LIB-GSR-7",
  "start_time": 1796126400,
  "end_time": 1796133600,
  "purpose": "WM9QF A1 Sprint Review — preparing presentation slides",
  "notes": "Need HDMI adapter at desk",
  "group_size": 4
}
```

**Response (`201 Created`)**:

```json
{
  "booking_id": 101,
  "user_id": "S1001",
  "user_name": "Alice Patel",
  "course": "MSc Applied AI",
  "department_id": "LIB",
  "resource_id": "LIB-GSR-7",
  "resource_name": "Rootes Group Study 2",
  "resource_type": "group_space",
  "start_time": 1796126400,
  "end_time": 1796133600,
  "status_id": "confirmed",
  "purpose": "WM9QF A1 Sprint Review — preparing presentation slides",
  "notes": "Need HDMI adapter at desk",
  "created_at": 1795790000,
  "updated_at": 1795790000
}
```

*(When viewed by `student_services`: `user_id` becomes `"ANON-8f2a9c10d4"`, `user_name` is `null`, and `purpose`/`notes` become `"[REDACTED]"`.)*

### 2.4 Status Transitions & Soft Delete Endpoints

| Method | Endpoint | Purpose | Roles |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/bookings/{booking_id}/approve` | `pending` -> `confirmed` (optional manager note in `notes`) | `admin`, `manager` |
| `POST` | `/api/v1/bookings/{booking_id}/reject` | `pending` -> `rejected` (releases slot) | `admin`, `manager` |
| `POST` | `/api/v1/bookings/{booking_id}/cancel` | `pending`/`confirmed` -> `cancelled` (releases slot) | `admin`, `manager`, owner `member` |
| `POST` | `/api/v1/bookings/{booking_id}/complete` | `confirmed` -> `completed` | `admin`, `manager` |
| `POST` | `/api/v1/bookings/{booking_id}/no-show` | `confirmed` -> `no_show` | `admin`, `manager` |
| `DELETE` | `/api/v1/bookings/{booking_id}` | **Soft delete**: sets `deleted_at = now` (`204 No Content`) | `admin` |
| `DELETE` | `/api/v1/resources/{resource_id}` | **Soft retire**: sets `status = 'retired'` (`204 No Content`) | `admin`, `manager` |
| `DELETE` | `/api/v1/users/{user_id}` | **Soft deactivate**: sets `is_active = 0` (`204 No Content`) | `admin` |

### 2.5 Standard Error Response Body

```json
{
  "detail": "Resource LIB-GSR-7 is already booked during the requested window.",
  "code": "conflict"
}
```

---

## 3. TDD Test Matrix (`server/tests/`)

Every phase follows **Red -> Green -> Refactor**: write failing `pytest` cases first, implement the minimum clean code to pass, then refactor.

| Test Module | Priority Scenarios Covered |
| :--- | :--- |
| **`test_db_and_domain.py`** | 11-table DDL creation; `PRAGMA foreign_keys=ON` rejects broken FKs; `CHECK (end_time > start_time)`; CTI 1:1 invariant; `ResourceFactory` instantiates `RoomResource` / `EquipmentResource` / `AcademicSupportResource`; polymorphic `validate_booking_request()` (duration limits, capacity ceiling, inactive resource); deterministic `seed_db.py` loads all 531 Warwick resources + synthetic users & multi-week bookings. |
| **`test_catalog_crud.py`** | CRUD across `departments`, `buildings`, `users`, `resources` (all 3 CTI subtypes + rollback atomicity if subtype write fails), and N:M `facilities` filtering; soft retire (`resources.status='retired'`) and soft deactivate (`users.is_active=0`); SQL injection probes (`' OR 1=1 --`, `'; DROP TABLE bookings; --`) in search & filter parameters. |
| **`test_bookings_and_conflicts.py`** | Exclusive room overlap blocked (`409`); adjacent back-to-back slots (`end == next_start`) permitted; pooled equipment (`quantity=2`) / workshop (`max_attendees=2`) allows 2 concurrent bookings and rejects the 3rd; user double-booking across two different rooms blocked; cancelled/rejected slots immediately reusable; `pending` -> `confirmed` approval and `pending` -> `rejected` refusal (with optional `notes`) separate refusals from cancellations; invalid terminal-state transitions rejected (`422`); soft delete (`deleted_at`) excludes row from normal queries and conflict checks; CSV batch import reports line-numbered validation & clash errors. |
| **`test_policy_and_privacy.py`** | 4-role RBAC matrix (`admin`, `manager`, `student_services`, `member`); Policy-to-SQL pushdown hides `staff_only` & `disability_only` resources from normal `pg_student` while revealing `pg_only` rooms; direct `POST /bookings` bypass attempt against `disability_only` room returns `403`; `member` cannot cancel/view another student's booking (`403`); `student_services` gets SHA-256 pseudonymised IDs, `"[REDACTED]"` `purpose`/`notes`, `null` name, and `k >= 5` small-cohort suppression in fairness report. |
| **`test_analytics_and_charts.py`** | Overview KPI accuracy (active, cancelled, rejected, no-show rates); most-booked vs zero-booking underused resources; 7x24 day-by-hour demand heatmap totals match booking counts; weekly trend aggregation detects exam pressure peak; 4 PNG charts generated non-empty in temp output directory. |
| **`test_api_and_cli.py`** | FastAPI `TestClient` end-to-end flows (`/health`, `/api/v1/resources`, `/availability`, `/bookings` create/approve/cancel/soft-delete, `/analytics/*`, error codes `401/403/404/409/422`); CLI interactive menu & subcommands smoke test with scripted stdin/stdout. |
