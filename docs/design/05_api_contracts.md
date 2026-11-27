# REST API Contracts (`/api/v1`)

This contract specifies the authentication headers, concrete JSON request/response payloads, status transition actions, and error envelopes for `/api/v1`. See `06_tdd_plan.md` for the Test-Driven Development matrix and implementation checklist.

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
