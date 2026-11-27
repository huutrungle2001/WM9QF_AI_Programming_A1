#!/usr/bin/env python3
"""Deterministic SQLite database seeder for the Campus Learning Resources Booking System.

Loads canonical reference & resource data from database/seed_data.json, generates 50
synthetic users across all 4 roles/user types (with cohorts for k>=5 fairness tests),
and synthesises ~400 conflict-free multi-week bookings featuring an exam-week peak.
"""

from __future__ import annotations

import argparse
import json
import random
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = REPO_ROOT / "database" / "resource_bookings.db"
DEFAULT_SEED_DATA_PATH = REPO_ROOT / "database" / "seed_data.json"
DEFAULT_SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"

# Deterministic 8-week UTC anchor: Monday 2026-10-05 00:00:00 UTC -> Sunday 2026-11-29
ANCHOR_WEEK0_UTC = int(datetime(2026, 10, 5, 0, 0, 0, tzinfo=timezone.utc).timestamp())


def _build_synthetic_users() -> list[dict[str, Any]]:
    """Build 50 deterministic, realistic campus users covering all roles, types, and cohorts."""
    users: list[dict[str, Any]] = [
        # Well-known demo & operational staff accounts (8)
        {
            "user_id": "ADMIN1",
            "full_name": "Dr. Eleanor Vance",
            "email": "eleanor.vance@warwick.ac.uk",
            "user_type": "staff",
            "role": "admin",
            "course": None,
            "department_id": "IDG",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "ADMIN2",
            "full_name": "Marcus Thorne",
            "email": "marcus.thorne@warwick.ac.uk",
            "user_type": "staff",
            "role": "admin",
            "course": None,
            "department_id": "CENTRAL",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "MGR-LIB",
            "full_name": "Priya Nair",
            "email": "priya.nair@warwick.ac.uk",
            "user_type": "staff",
            "role": "manager",
            "course": None,
            "department_id": "LIB",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "MGR-CENTRAL",
            "full_name": "David Gallagher",
            "email": "david.gallagher@warwick.ac.uk",
            "user_type": "staff",
            "role": "manager",
            "course": None,
            "department_id": "CENTRAL",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "MGR-WMG",
            "full_name": "Hannah Okafor",
            "email": "hannah.okafor@warwick.ac.uk",
            "user_type": "staff",
            "role": "manager",
            "course": None,
            "department_id": "WMG",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "SS1",
            "full_name": "Claire Beaumont",
            "email": "claire.beaumont@warwick.ac.uk",
            "user_type": "staff",
            "role": "student_services",
            "course": None,
            "department_id": "STUEXP",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "SS2",
            "full_name": "Imran Siddiqui",
            "email": "imran.siddiqui@warwick.ac.uk",
            "user_type": "staff",
            "role": "student_services",
            "course": None,
            "department_id": "DOSO",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "STAFF1",
            "full_name": "Prof. Julian Mercer",
            "email": "julian.mercer@warwick.ac.uk",
            "user_type": "staff",
            "role": "member",
            "course": None,
            "department_id": "CS",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        # Additional academic/support staff members (4 -> 12 total staff)
        {
            "user_id": "STAFF2",
            "full_name": "Dr. Mei-Ling Zhou",
            "email": "meiling.zhou@warwick.ac.uk",
            "user_type": "staff",
            "role": "member",
            "course": None,
            "department_id": "WMG",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "STAFF3",
            "full_name": "Dr. Oliver Finch",
            "email": "oliver.finch@warwick.ac.uk",
            "user_type": "staff",
            "role": "member",
            "course": None,
            "department_id": "ECON",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "STAFF4",
            "full_name": "Dr. Amara Mensah",
            "email": "amara.mensah@warwick.ac.uk",
            "user_type": "staff",
            "role": "member",
            "course": None,
            "department_id": "LAW",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
        {
            "user_id": "STAFF5",
            "full_name": "Dr. Gareth Pritchard",
            "email": "gareth.pritchard@warwick.ac.uk",
            "user_type": "staff",
            "role": "member",
            "course": None,
            "department_id": "LIB",
            "has_accessibility_access": 0,
            "is_active": 1,
        },
    ]

    # 38 students across 5 main cohorts (>=5) and 2 small cohorts (<5) for k>=5 testing
    student_specs: list[tuple[str, str, str, str, str, int]] = [
        # Well-known demo students first
        ("S1001", "Alice Patel", "pg_student", "MSc Applied AI", "WMG", 0),
        ("S1002", "Benji Kowalski", "ug_student", "BSc Computer Science", "CS", 1),
        # Remaining MSc Applied AI (total 8)
        ("S1003", "Chloe Lindqvist", "pg_student", "MSc Applied AI", "WMG", 0),
        ("S1004", "Daniel Osei", "pg_student", "MSc Applied AI", "WMG", 0),
        ("S1005", "Fatima Al-Mansoor", "pg_student", "MSc Applied AI", "WMG", 1),
        ("S1006", "George Papadopoulos", "pg_student", "MSc Applied AI", "WMG", 0),
        ("S1007", "Haruka Tanaka", "pg_student", "MSc Applied AI", "WMG", 0),
        ("S1008", "Liam Gallagher-Reid", "pg_student", "MSc Applied AI", "WMG", 0),
        ("S1009", "Nadia Benali", "pg_student", "MSc Applied AI", "WMG", 0),
        # Remaining BSc Computer Science (total 8)
        ("S1010", "Aarav Sharma", "ug_student", "BSc Computer Science", "CS", 0),
        ("S1011", "Beatrice Rossi", "ug_student", "BSc Computer Science", "CS", 0),
        ("S1012", "Callum MacLeod", "ug_student", "BSc Computer Science", "CS", 0),
        ("S1013", "Dina Haddad", "ug_student", "BSc Computer Science", "CS", 1),
        ("S1014", "Ethan Brooks", "ug_student", "BSc Computer Science", "CS", 0),
        ("S1015", "Freya Johansson", "ug_student", "BSc Computer Science", "CS", 0),
        ("S1016", "Gabriel Silva", "ug_student", "BSc Computer Science", "CS", 0),
        # BEng Mechanical Engineering (total 7)
        ("S1017", "Henry Wu", "ug_student", "BEng Mechanical Engineering", "ENG", 0),
        ("S1018", "Isla Campbell", "ug_student", "BEng Mechanical Engineering", "ENG", 0),
        ("S1019", "Jaden Carter", "ug_student", "BEng Mechanical Engineering", "ENG", 0),
        ("S1020", "Kavya Krishnan", "ug_student", "BEng Mechanical Engineering", "ENG", 1),
        ("S1021", "Lucas Novak", "ug_student", "BEng Mechanical Engineering", "ENG", 0),
        ("S1022", "Maya Fernandez", "ug_student", "BEng Mechanical Engineering", "ENG", 0),
        ("S1023", "Noah Adeyemi", "ug_student", "BEng Mechanical Engineering", "ENG", 0),
        # BSc Economics (total 6)
        ("S1024", "Olivia Bennett", "ug_student", "BSc Economics", "ECON", 0),
        ("S1025", "Patrick Doyle", "ug_student", "BSc Economics", "ECON", 0),
        ("S1026", "Qian Chen", "ug_student", "BSc Economics", "ECON", 0),
        ("S1027", "Rohan Deshmukh", "ug_student", "BSc Economics", "ECON", 0),
        ("S1028", "Sofia Morales", "ug_student", "BSc Economics", "ECON", 0),
        ("S1029", "Theo Laurent", "ug_student", "BSc Economics", "ECON", 0),
        # PhD Computer Science (total 5, pgr_student)
        ("S1030", "Uma Subramanian", "pgr_student", "PhD Computer Science", "CS", 0),
        ("S1031", "Victor Popescu", "pgr_student", "PhD Computer Science", "CS", 1),
        ("S1032", "Wendy Zhang", "pgr_student", "PhD Computer Science", "CS", 0),
        ("S1033", "Xavier Moreau", "pgr_student", "PhD Computer Science", "CS", 0),
        ("S1034", "Yara Mansour", "pgr_student", "PhD Computer Science", "CS", 0),
        # Small cohort #1 (<5 students for k>=5 suppression: 2 students)
        ("S1035", "Zara Al-Khatib", "pg_student", "MA Ancient Visual Culture", "HISTART", 0),
        ("S1036", "Arthur Pendelton", "pg_student", "MA Ancient Visual Culture", "HISTART", 0),
        # Small cohort #2 (<5 students for k>=5 suppression: 2 students)
        ("S1037", "Elena Conti", "pgr_student", "PhD Renaissance Studies", "CSR", 0),
        ("S1038", "Sebastian Vogel", "pgr_student", "PhD Renaissance Studies", "CSR", 0),
    ]

    for uid, name, utype, course, dept, acc in student_specs:
        slug = name.lower().replace(" ", ".").replace("-", "")
        users.append(
            {
                "user_id": uid,
                "full_name": name,
                "email": f"{slug}.{uid.lower()}@warwick.ac.uk",
                "user_type": utype,
                "role": "member",
                "course": course,
                "department_id": dept,
                "has_accessibility_access": acc,
                "is_active": 1,
            }
        )

    assert len(users) == 50, f"Expected 50 synthetic users, built {len(users)}"
    return users


def _is_user_eligible(user: dict[str, Any], eligibility: str) -> bool:
    utype = user["user_type"]
    if eligibility == "all_users":
        return True
    if eligibility == "students_only":
        return utype in {"ug_student", "pg_student", "pgr_student"}
    if eligibility == "staff_only":
        return utype == "staff"
    if eligibility == "pg_only":
        return utype in {"pg_student", "pgr_student"}
    if eligibility == "pgr_and_staff":
        return utype in {"pgr_student", "staff"}
    if eligibility == "disability_only":
        return bool(user["has_accessibility_access"])
    return False


def _generate_synthetic_bookings(
    rng: random.Random,
    users: list[dict[str, Any]],
    resources: list[dict[str, Any]],
    equipment_by_id: dict[str, dict[str, Any]],
    support_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Synthesise 400 conflict-free multi-week bookings with an exam peak in weeks 6 & 7."""
    active_resources = [r for r in resources if r["status"] == "active"]
    by_type: dict[str, list[dict[str, Any]]] = {}
    for r in active_resources:
        by_type.setdefault(r["resource_type"], []).append(r)

    # Curated active subset (~120 resources) so >400 resources remain unbooked for underused analytics
    selected: list[dict[str, Any]] = []
    selected.extend(by_type.get("specialist_equipment", []))
    selected.extend(by_type.get("academic_support", [])[:18])
    selected.extend(by_type.get("computer_lab", [])[:12])

    # Balance group_space and study_room representation across all eligibility policies
    for rtype, special_cap, general_cap in (("group_space", 16, 26), ("study_room", 12, 24)):
        bucket = by_type.get(rtype, [])
        special = [
            r
            for r in bucket
            if r["booking_eligibility"] in {"disability_only", "pg_only", "pgr_and_staff", "students_only"}
        ]
        general = [
            r
            for r in bucket
            if r["booking_eligibility"] in {"all_users", "staff_only"}
        ]
        selected.extend(special[:special_cap])
        selected.extend(general[:general_cap])

    # Deduplicate while preserving deterministic order
    seen_ids: set[str] = set()
    active_pool: list[dict[str, Any]] = []
    for r in selected:
        if r["resource_id"] not in seen_ids:
            seen_ids.add(r["resource_id"])
            active_pool.append(r)

    # Pre-compute eligible users and concurrency ceiling for each pooled resource
    eligible_users_map: dict[str, list[dict[str, Any]]] = {}
    max_conc_map: dict[str, int] = {}
    pool_with_users: list[dict[str, Any]] = []
    for r in active_pool:
        rid = r["resource_id"]
        elig = [u for u in users if _is_user_eligible(u, r["booking_eligibility"])]
        if not elig:
            continue
        eligible_users_map[rid] = elig
        if r["resource_type"] == "specialist_equipment":
            max_conc_map[rid] = int(equipment_by_id[rid]["quantity"])
        elif r["resource_type"] == "academic_support":
            max_conc_map[rid] = int(support_by_id[rid]["max_attendees"])
        else:
            max_conc_map[rid] = 1
        pool_with_users.append(r)

    # Skew weights so popular study spaces & laptop pools stand out in top-booked analytics
    weights: list[float] = []
    for idx, r in enumerate(pool_with_users):
        w = 1.0
        if idx < 12:
            w = 4.5
        elif idx < 30:
            w = 2.4
        if r["resource_type"] == "specialist_equipment":
            w *= 1.8
        elif r["resource_type"] == "academic_support":
            w *= 1.3
        weights.append(w)

    # 8-week schedule totalling 400 bookings with strong exam-week surge in week 6 (idx 5) & week 7 (idx 6)
    weekly_targets = [34, 38, 42, 40, 44, 78, 82, 42]
    day_weights = [1.3, 1.5, 1.6, 1.5, 1.2, 0.45, 0.35]  # Mon..Sun
    hour_choices = list(range(8, 21))
    hour_weights = [0.4, 1.0, 1.8, 2.2, 1.9, 2.0, 2.5, 2.3, 1.8, 1.4, 1.0, 0.7, 0.4]

    purposes_by_type = {
        "study_room": [
            "Focused exam revision session",
            "Dissertation literature review",
            "Quiet coursework drafting",
            "Accessible quiet study session",
        ],
        "group_space": [
            "Module group project sprint",
            "Presentation rehearsal and slide review",
            "Collaborative problem-sheet workshop",
            "Research reading group discussion",
        ],
        "computer_lab": [
            "Machine learning model training lab",
            "Statistical modelling coursework",
            "Software engineering pair programming",
            "CAD simulation assignment work",
        ],
        "specialist_equipment": [
            "Coursework prototype demonstration loan",
            "Laptop loan for assessment preparation",
            "AV recording kit for student society talk",
            "VR/XR dissertation usability testing",
        ],
        "academic_support": [
            "1-on-1 academic writing feedback",
            "CV and graduate application review",
            "Research methods & statistics consultation",
            "Study skills workshop attendance",
        ],
    }

    # Track occupied intervals for blocking statuses (pending, confirmed)
    blocking_by_resource: dict[str, list[tuple[int, int]]] = {}
    blocking_by_user: dict[str, list[tuple[int, int]]] = {}
    # Also avoid duplicate non-blocking self-overlaps on identical completed windows
    all_by_user: dict[str, list[tuple[int, int]]] = {}

    bookings: list[dict[str, Any]] = []

    def _pick_status(week_idx: int, requires_approval: bool) -> str:
        roll = rng.random()
        if week_idx <= 4:
            if roll < 0.70:
                return "completed"
            if roll < 0.85:
                return "cancelled"
            if roll < 0.94:
                return "no_show"
            return "rejected" if requires_approval or rng.random() < 0.6 else "cancelled"
        if week_idx == 5:
            if roll < 0.62:
                return "completed"
            if roll < 0.76:
                return "cancelled"
            if roll < 0.86:
                return "no_show"
            if roll < 0.93:
                return "rejected"
            return "confirmed"
        if week_idx == 6:
            if roll < 0.42:
                return "completed"
            if roll < 0.72:
                return "confirmed"
            if roll < 0.84:
                return "cancelled"
            if roll < 0.92:
                return "no_show"
            return "rejected"
        # Week 7 (current/upcoming week)
        if roll < 0.50:
            return "confirmed"
        if roll < 0.78:
            return "pending" if (requires_approval or rng.random() < 0.7) else "confirmed"
        if roll < 0.90:
            return "cancelled"
        return "rejected"

    for week_idx, target_count in enumerate(weekly_targets):
        week_start = ANCHOR_WEEK0_UTC + week_idx * 7 * 86400
        placed = 0
        attempts = 0
        while placed < target_count and attempts < target_count * 40:
            attempts += 1
            res = rng.choices(pool_with_users, weights=weights, k=1)[0]
            rid = res["resource_id"]
            rtype = res["resource_type"]
            user = rng.choice(eligible_users_map[rid])
            uid = user["user_id"]

            day_offset = rng.choices(range(7), weights=day_weights, k=1)[0]
            hour = rng.choices(hour_choices, weights=hour_weights, k=1)[0]
            start_time = week_start + day_offset * 86400 + hour * 3600

            if rtype == "specialist_equipment":
                duration_sec = rng.choices([4 * 3600, 24 * 3600, 48 * 3600, 72 * 3600], weights=[2, 4, 3, 1], k=1)[0]
            elif rtype == "academic_support":
                duration_sec = rng.choices([3600, 2 * 3600], weights=[4, 1], k=1)[0]
            else:
                duration_sec = rng.choices([3600, 2 * 3600, 3 * 3600], weights=[5, 4, 1], k=1)[0]
            end_time = start_time + duration_sec

            status_id = _pick_status(week_idx, bool(res["requires_approval"]))
            is_blocking = status_id in {"pending", "confirmed"}

            # Enforce zero overlapping user conflicts on blocking slots (and avoid clutter)
            if is_blocking:
                if any(s < end_time and e > start_time for s, e in blocking_by_user.get(uid, [])):
                    continue
                res_overlaps = sum(
                    1 for s, e in blocking_by_resource.get(rid, []) if s < end_time and e > start_time
                )
                if res_overlaps >= max_conc_map[rid]:
                    continue
            else:
                if any(s < end_time and e > start_time for s, e in all_by_user.get(uid, [])):
                    continue

            purpose = rng.choice(purposes_by_type[rtype])
            notes: str | None = None
            if status_id == "rejected":
                notes = "Declined due to scheduled departmental priority booking."
            elif status_id == "cancelled":
                notes = "Cancelled by user prior to start time."
            elif status_id == "no_show":
                notes = "Check-in window elapsed without attendance."
            elif status_id == "confirmed" and res["requires_approval"]:
                notes = "Approved by learning resources manager."

            lead_seconds = rng.randint(2 * 3600, 5 * 86400)
            created_at = start_time - lead_seconds
            updated_at = created_at + rng.randint(0, min(lead_seconds, 86400))

            bookings.append(
                {
                    "user_id": uid,
                    "resource_id": rid,
                    "start_time": start_time,
                    "end_time": end_time,
                    "status_id": status_id,
                    "purpose": purpose,
                    "notes": notes,
                    "created_at": created_at,
                    "updated_at": updated_at,
                    "deleted_at": None,
                }
            )

            if is_blocking:
                blocking_by_user.setdefault(uid, []).append((start_time, end_time))
                blocking_by_resource.setdefault(rid, []).append((start_time, end_time))
            all_by_user.setdefault(uid, []).append((start_time, end_time))
            placed += 1

    return bookings


def _table_counts(conn: sqlite3.Connection) -> dict[str, int]:
    tables = [
        "departments",
        "buildings",
        "booking_statuses",
        "resources",
        "rooms",
        "equipment_items",
        "support_services",
        "facilities",
        "resource_facilities",
        "users",
        "bookings",
    ]
    return {t: int(conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]) for t in tables}


def seed_database(
    *,
    db_path: Path | str = DEFAULT_DB_PATH,
    seed_data_path: Path | str = DEFAULT_SEED_DATA_PATH,
    schema_path: Path | str = DEFAULT_SCHEMA_PATH,
    reset: bool = False,
    seed: int = 42,
) -> dict[str, int]:
    """Initialise the 11-table SQLite DB and load normalised Warwick + synthetic data."""
    db_file = Path(db_path)
    seed_file = Path(seed_data_path)
    schema_file = Path(schema_path)

    if reset and db_file.exists():
        db_file.unlink()
        for suffix in ("-wal", "-shm"):
            sidecar = Path(f"{db_file}{suffix}")
            if sidecar.exists():
                sidecar.unlink()

    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.executescript(schema_file.read_text(encoding="utf-8"))
        conn.execute("PRAGMA foreign_keys = ON;")

        existing_resources = conn.execute("SELECT COUNT(*) FROM resources").fetchone()[0]
        if existing_resources > 0 and not reset:
            return _table_counts(conn)

        payload = json.loads(seed_file.read_text(encoding="utf-8"))
        users = _build_synthetic_users()
        equipment_by_id = {e["resource_id"]: e for e in payload["equipment_items"]}
        support_by_id = {s["resource_id"]: s for s in payload["support_services"]}
        rng = random.Random(seed)
        bookings = _generate_synthetic_bookings(
            rng=rng,
            users=users,
            resources=payload["resources"],
            equipment_by_id=equipment_by_id,
            support_by_id=support_by_id,
        )

        with conn:
            conn.executemany(
                "INSERT INTO departments (department_id, department_name, faculty) "
                "VALUES (:department_id, :department_name, :faculty)",
                payload["departments"],
            )
            conn.executemany(
                "INSERT INTO buildings (building_id, building_name, zone, lat, lon, floor_count) "
                "VALUES (:building_id, :building_name, :zone, :lat, :lon, :floor_count)",
                payload["buildings"],
            )
            conn.executemany(
                "INSERT INTO booking_statuses (status_id, description, blocks_slot) "
                "VALUES (:status_id, :description, :blocks_slot)",
                payload["booking_statuses"],
            )
            conn.executemany(
                "INSERT INTO resources "
                "(resource_id, resource_name, resource_type, department_id, building_id, "
                "location, description, image_url, requires_approval, booking_eligibility, "
                "checkin_method, status) "
                "VALUES (:resource_id, :resource_name, :resource_type, :department_id, :building_id, "
                ":location, :description, :image_url, :requires_approval, :booking_eligibility, "
                ":checkin_method, :status)",
                payload["resources"],
            )
            conn.executemany(
                "INSERT INTO rooms (resource_id, capacity, room_style) "
                "VALUES (:resource_id, :capacity, :room_style)",
                payload["rooms"],
            )
            conn.executemany(
                "INSERT INTO equipment_items (resource_id, category, quantity, specifications) "
                "VALUES (:resource_id, :category, :quantity, :specifications)",
                payload["equipment_items"],
            )
            conn.executemany(
                "INSERT INTO support_services (resource_id, category, max_attendees, host_name) "
                "VALUES (:resource_id, :category, :max_attendees, :host_name)",
                payload["support_services"],
            )
            conn.executemany(
                "INSERT INTO facilities (facility_id, facility_name) "
                "VALUES (:facility_id, :facility_name)",
                payload["facilities"],
            )
            conn.executemany(
                "INSERT INTO resource_facilities (resource_id, facility_id) "
                "VALUES (:resource_id, :facility_id)",
                payload["resource_facilities"],
            )
            conn.executemany(
                "INSERT INTO users "
                "(user_id, full_name, email, user_type, role, course, department_id, "
                "has_accessibility_access, is_active) "
                "VALUES (:user_id, :full_name, :email, :user_type, :role, :course, :department_id, "
                ":has_accessibility_access, :is_active)",
                users,
            )
            conn.executemany(
                "INSERT INTO bookings "
                "(user_id, resource_id, start_time, end_time, status_id, purpose, notes, "
                "created_at, updated_at, deleted_at) "
                "VALUES (:user_id, :resource_id, :start_time, :end_time, :status_id, :purpose, :notes, "
                ":created_at, :updated_at, :deleted_at)",
                bookings,
            )

        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            raise RuntimeError(f"Foreign key check failed after seeding: {[dict(r) for r in fk_errors]}")

        return _table_counts(conn)
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Campus Learning Resources SQLite database.")
    parser.add_argument("--reset", action="store_true", help="Delete and rebuild the SQLite database from scratch.")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH, help="Target SQLite DB path.")
    parser.add_argument("--seed-data", type=Path, default=DEFAULT_SEED_DATA_PATH, help="Path to seed_data.json.")
    parser.add_argument("--schema-path", type=Path, default=DEFAULT_SCHEMA_PATH, help="Path to schema.sql.")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic RNG seed (default: 42).")
    args = parser.parse_args()

    counts = seed_database(
        db_path=args.db_path,
        seed_data_path=args.seed_data,
        schema_path=args.schema_path,
        reset=args.reset,
        seed=args.seed,
    )
    print(f"Seeded {args.db_path} (seed={args.seed}, reset={args.reset}):")
    for table, count in counts.items():
        print(f"  {table:22s}: {count}")


if __name__ == "__main__":
    main()
