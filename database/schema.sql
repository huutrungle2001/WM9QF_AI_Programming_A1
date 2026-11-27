-- Canonical 11-table 3NF Class Table Inheritance (CTI) Schema
-- Campus Learning Resources Booking & Analytics System (SQLite3)

PRAGMA foreign_keys = ON;

-- 1. Departments
CREATE TABLE IF NOT EXISTS departments (
    department_id   TEXT PRIMARY KEY,
    department_name TEXT NOT NULL UNIQUE,
    faculty         TEXT NOT NULL
);

-- 2. Buildings
CREATE TABLE IF NOT EXISTS buildings (
    building_id   TEXT PRIMARY KEY,
    building_name TEXT NOT NULL,
    zone          TEXT NOT NULL CHECK (zone IN ('Main Site', 'Gibbet Hill Site', 'Westwood Site', 'Innovation Campus')),
    lat           REAL,
    lon           REAL,
    floor_count   INTEGER NOT NULL DEFAULT 1 CHECK (floor_count >= 0)
);

-- 3. Users
CREATE TABLE IF NOT EXISTS users (
    user_id                  TEXT PRIMARY KEY,
    full_name                TEXT NOT NULL,
    email                    TEXT NOT NULL UNIQUE,
    user_type                TEXT NOT NULL CHECK (user_type IN ('ug_student', 'pg_student', 'pgr_student', 'staff')),
    role                     TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'student_services', 'member')),
    course                   TEXT,
    department_id            TEXT NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    has_accessibility_access INTEGER NOT NULL DEFAULT 0 CHECK (has_accessibility_access IN (0, 1)),
    is_active                INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- 4. Resources (CTI Supertype)
CREATE TABLE IF NOT EXISTS resources (
    resource_id         TEXT PRIMARY KEY,
    resource_name       TEXT NOT NULL,
    resource_type       TEXT NOT NULL CHECK (resource_type IN (
                            'study_room',
                            'group_space',
                            'computer_lab',
                            'specialist_equipment',
                            'academic_support'
                        )),
    department_id       TEXT NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    building_id         TEXT REFERENCES buildings(building_id) ON DELETE RESTRICT,
    location            TEXT NOT NULL,
    description         TEXT,
    image_url           TEXT,
    requires_approval   INTEGER NOT NULL DEFAULT 0 CHECK (requires_approval IN (0, 1)),
    booking_eligibility TEXT NOT NULL DEFAULT 'all_users' CHECK (booking_eligibility IN (
                            'all_users',
                            'students_only',
                            'staff_only',
                            'pg_only',
                            'pgr_and_staff',
                            'disability_only'
                        )),
    checkin_method      TEXT NOT NULL DEFAULT 'none' CHECK (checkin_method IN ('none', 'pin', 'card_swipe')),
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired'))
);

-- 5. Rooms (CTI Subtype for study_room, group_space, computer_lab)
CREATE TABLE IF NOT EXISTS rooms (
    resource_id TEXT PRIMARY KEY REFERENCES resources(resource_id) ON DELETE CASCADE,
    capacity    INTEGER NOT NULL CHECK (capacity > 0),
    room_style  TEXT NOT NULL DEFAULT 'standard' CHECK (room_style IN (
                    'seminar',
                    'lecture',
                    'boardroom',
                    'study_pod',
                    'flexible',
                    'standard'
                ))
);

-- 6. Equipment Items (CTI Subtype for specialist_equipment)
CREATE TABLE IF NOT EXISTS equipment_items (
    resource_id    TEXT PRIMARY KEY REFERENCES resources(resource_id) ON DELETE CASCADE,
    category       TEXT NOT NULL,
    quantity       INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    specifications TEXT
);

-- 7. Support Services (CTI Subtype for academic_support)
CREATE TABLE IF NOT EXISTS support_services (
    resource_id   TEXT PRIMARY KEY REFERENCES resources(resource_id) ON DELETE CASCADE,
    category      TEXT NOT NULL,
    max_attendees INTEGER NOT NULL DEFAULT 1 CHECK (max_attendees > 0),
    host_name     TEXT
);

-- 8. Facilities (Atomic feature lookup)
CREATE TABLE IF NOT EXISTS facilities (
    facility_id   TEXT PRIMARY KEY,
    facility_name TEXT NOT NULL UNIQUE
);

-- 9. Resource-Facilities (N:M join table)
CREATE TABLE IF NOT EXISTS resource_facilities (
    resource_id TEXT NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
    PRIMARY KEY (resource_id, facility_id)
);

-- 10. Booking Statuses (Extensible lookup table; natural string PK)
CREATE TABLE IF NOT EXISTS booking_statuses (
    status_id   TEXT PRIMARY KEY CHECK (length(trim(status_id)) > 0),
    description TEXT NOT NULL,
    blocks_slot INTEGER NOT NULL CHECK (blocks_slot IN (0, 1))
);

-- 11. Bookings (Central transactional table; UTC Unix epoch INTEGER timestamps)
CREATE TABLE IF NOT EXISTS bookings (
    booking_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    resource_id TEXT NOT NULL REFERENCES resources(resource_id) ON DELETE RESTRICT,
    start_time  INTEGER NOT NULL,
    end_time    INTEGER NOT NULL CHECK (end_time > start_time),
    status_id   TEXT NOT NULL REFERENCES booking_statuses(status_id) ON DELETE RESTRICT,
    purpose     TEXT,
    notes       TEXT,
    created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
    updated_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
    deleted_at  INTEGER
);

-- Partial & Composite Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_resource_window
    ON bookings(resource_id, start_time, end_time, status_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_user_window
    ON bookings(user_id, start_time, end_time, status_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_start_time
    ON bookings(start_time)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_resources_type_dept
    ON resources(resource_type, department_id, status);

CREATE INDEX IF NOT EXISTS idx_resource_facilities_fac
    ON resource_facilities(facility_id, resource_id);
