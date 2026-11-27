"""Phase 1 TDD suite: 11-table DDL, constraints, OOP domain hierarchy, DTOs, and deterministic seed."""

from __future__ import annotations

import ast
import sqlite3
from pathlib import Path

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.config import AppSettings, BookingPolicyConfig
from app.database import DatabaseManager
from app.domain.enums import (
    BookingEligibility,
    BookingStatusId,
    CheckinMethod,
    ResourceStatus,
    ResourceType,
    Role,
    RoomStyle,
    UserType,
)
from app.domain.exceptions import (
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.domain.resources import (
    AcademicSupportResource,
    EquipmentResource,
    Resource,
    ResourceFactory,
    RoomResource,
)
from app.schemas.actor import ActorContext
from app.schemas.analytics import ChartExportResult, FairnessRow, OverviewKPI
from app.schemas.booking import BookingCreate, BookingOut
from app.schemas.resource import (
    AvailabilityQuery,
    EquipmentDetails,
    ResourceCreate,
    RoomDetails,
    SupportDetails,
)
from database.scripts.seed_db import seed_database


# ---------------------------------------------------------------------------
# 1. Database Schema, Foreign Keys, CHECK Constraints & Transactions
# ---------------------------------------------------------------------------


def test_schema_creates_all_11_tables_and_5_indexes(db_manager: DatabaseManager) -> None:
    expected_tables = {
        "departments",
        "buildings",
        "users",
        "resources",
        "rooms",
        "equipment_items",
        "support_services",
        "facilities",
        "resource_facilities",
        "booking_statuses",
        "bookings",
    }
    expected_indexes = {
        "idx_bookings_resource_window",
        "idx_bookings_user_window",
        "idx_bookings_start_time",
        "idx_resources_type_dept",
        "idx_resource_facilities_fac",
    }

    conn = db_manager.get_connection()
    try:
        tables = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        }
        assert tables == expected_tables

        indexes = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        }
        assert expected_indexes.issubset(indexes)

        # Verify exact column layouts on core & CTI tables.
        def cols(table: str) -> list[str]:
            return [row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]

        assert cols("resources") == [
            "resource_id",
            "resource_name",
            "resource_type",
            "department_id",
            "building_id",
            "location",
            "description",
            "image_url",
            "requires_approval",
            "booking_eligibility",
            "checkin_method",
            "status",
        ]
        assert cols("rooms") == ["resource_id", "capacity", "room_style"]
        assert cols("equipment_items") == ["resource_id", "category", "quantity", "specifications"]
        assert cols("support_services") == ["resource_id", "category", "max_attendees", "host_name"]
        assert cols("booking_statuses") == ["status_id", "description", "blocks_slot"]
        assert cols("bookings") == [
            "booking_id",
            "user_id",
            "resource_id",
            "start_time",
            "end_time",
            "status_id",
            "purpose",
            "notes",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
    finally:
        conn.close()


def test_foreign_keys_enforced_and_cascade_vs_restrict(minimal_db: DatabaseManager) -> None:
    conn = minimal_db.get_connection()
    try:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    finally:
        conn.close()

    # Reject broken FK on users.department_id
    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute(
                "INSERT INTO users (user_id, full_name, email, user_type, role, department_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                ("S9999", "Broken User", "broken@warwick.ac.uk", "ug_student", "member", "NO_SUCH_DEPT"),
            )

    # Reject broken FK on bookings.status_id
    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute(
                "INSERT INTO bookings (user_id, resource_id, start_time, end_time, status_id) "
                "VALUES (?, ?, ?, ?, ?)",
                ("S1001", "RM-CS-01", 1_700_000_000, 1_700_003_600, "nonexistent_status"),
            )

    # ON DELETE RESTRICT prevents deleting a department with users/resources
    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute("DELETE FROM departments WHERE department_id = ?", ("CS",))

    # ON DELETE CASCADE removes CTI subtype & resource_facilities when parent resource deleted
    with minimal_db.transaction() as conn:
        conn.execute(
            "INSERT INTO facilities (facility_id, facility_name) VALUES (?, ?)",
            ("WHITEBOARD", "Whiteboard"),
        )
        conn.execute(
            "INSERT INTO resource_facilities (resource_id, facility_id) VALUES (?, ?)",
            ("RM-CS-01", "WHITEBOARD"),
        )
        conn.execute("DELETE FROM resources WHERE resource_id = ?", ("RM-CS-01",))
        assert conn.execute("SELECT COUNT(*) FROM rooms WHERE resource_id = ?", ("RM-CS-01",)).fetchone()[0] == 0
        assert (
            conn.execute(
                "SELECT COUNT(*) FROM resource_facilities WHERE resource_id = ?", ("RM-CS-01",)
            ).fetchone()[0]
            == 0
        )


def test_booking_statuses_extensible_without_rigid_check(minimal_db: DatabaseManager) -> None:
    with minimal_db.transaction() as conn:
        conn.execute(
            "INSERT INTO booking_statuses (status_id, description, blocks_slot) VALUES (?, ?, ?)",
            ("waitlisted", "Queued waiting for cancellation", 0),
        )
        row = conn.execute(
            "SELECT status_id, blocks_slot FROM booking_statuses WHERE status_id = ?",
            ("waitlisted",),
        ).fetchone()
        assert row["status_id"] == "waitlisted"
        assert row["blocks_slot"] == 0

    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute(
                "INSERT INTO booking_statuses (status_id, description, blocks_slot) VALUES (?, ?, ?)",
                ("bad_flag", "Invalid blocks_slot", 2),
            )


def test_check_constraints_and_cti_one_to_one(minimal_db: DatabaseManager) -> None:
    # bookings CHECK (end_time > start_time)
    for bad_end in (1_700_000_000, 1_699_999_000):
        with pytest.raises(sqlite3.IntegrityError):
            with minimal_db.transaction() as conn:
                conn.execute(
                    "INSERT INTO bookings (user_id, resource_id, start_time, end_time, status_id) "
                    "VALUES (?, ?, ?, ?, ?)",
                    ("S1001", "RM-CS-01", 1_700_000_000, bad_end, "confirmed"),
                )

    # CTI 1:1 PK constraint on rooms(resource_id)
    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute(
                "INSERT INTO rooms (resource_id, capacity, room_style) VALUES (?, ?, ?)",
                ("RM-CS-01", 4, "study_pod"),
            )

    # Positive capacity / quantity / max_attendees CHECKs
    with minimal_db.transaction() as conn:
        conn.execute(
            "INSERT INTO resources "
            "(resource_id, resource_name, resource_type, department_id, building_id, location) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("EQ-TEST", "Test Kit", "specialist_equipment", "CS", "MM-CS", "Desk 1"),
        )
        conn.execute(
            "INSERT INTO resources "
            "(resource_id, resource_name, resource_type, department_id, building_id, location) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("SUP-TEST", "Test Support", "academic_support", "CS", None, "Online"),
        )
        conn.execute(
            "INSERT INTO resources "
            "(resource_id, resource_name, resource_type, department_id, building_id, location) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("RM-ZERO", "Bad Room", "study_room", "CS", "MM-CS", "CS0.99"),
        )

    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute("INSERT INTO rooms (resource_id, capacity, room_style) VALUES (?, ?, ?)", ("RM-ZERO", 0, "standard"))

    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute(
                "INSERT INTO equipment_items (resource_id, category, quantity) VALUES (?, ?, ?)",
                ("EQ-TEST", "laptop", 0),
            )

    with pytest.raises(sqlite3.IntegrityError):
        with minimal_db.transaction() as conn:
            conn.execute(
                "INSERT INTO support_services (resource_id, category, max_attendees) VALUES (?, ?, ?)",
                ("SUP-TEST", "writing", 0),
            )


def test_immediate_transaction_commit_and_rollback(minimal_db: DatabaseManager) -> None:
    with pytest.raises(RuntimeError, match="boom"):
        with minimal_db.immediate_transaction() as conn:
            conn.execute(
                "INSERT INTO facilities (facility_id, facility_name) VALUES (?, ?)",
                ("ROLLBACK-FAC", "Should Rollback"),
            )
            raise RuntimeError("boom")

    conn = minimal_db.get_connection()
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM facilities WHERE facility_id = ?", ("ROLLBACK-FAC",)
        ).fetchone()[0]
        assert count == 0
    finally:
        conn.close()

    with minimal_db.immediate_transaction() as conn:
        conn.execute(
            "INSERT INTO facilities (facility_id, facility_name) VALUES (?, ?)",
            ("COMMIT-FAC", "Committed Facility"),
        )

    conn = minimal_db.get_connection()
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM facilities WHERE facility_id = ?", ("COMMIT-FAC",)
        ).fetchone()[0]
        assert count == 1
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 2. Framework-Free OOP Domain Layer & ResourceFactory
# ---------------------------------------------------------------------------


def test_domain_layer_has_no_fastapi_or_sqlite3_imports(repo_root: Path) -> None:
    domain_dir = repo_root / "server" / "app" / "domain"
    py_files = sorted(domain_dir.glob("*.py"))
    assert py_files, "Expected domain .py files"

    forbidden = {"fastapi", "sqlite3"}
    for path in py_files:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0]
                    assert top not in forbidden, f"{path.name} imports forbidden module {top}"
            elif isinstance(node, ast.ImportFrom) and node.module:
                top = node.module.split(".")[0]
                assert top not in forbidden, f"{path.name} imports from forbidden module {top}"


def test_domain_exception_hierarchy() -> None:
    for cls in (UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, ValidationError):
        err = cls("sample error")
        assert isinstance(err, DomainError)
        assert str(err) == "sample error"


def test_resource_factory_from_db_rows_all_three_subclasses(minimal_db: DatabaseManager) -> None:
    # Test with real sqlite3.Row for RoomResource
    conn = minimal_db.get_connection()
    try:
        parent_row = conn.execute("SELECT * FROM resources WHERE resource_id = ?", ("RM-CS-01",)).fetchone()
        subtype_row = conn.execute("SELECT * FROM rooms WHERE resource_id = ?", ("RM-CS-01",)).fetchone()
    finally:
        conn.close()

    room = ResourceFactory.from_db_rows(parent_row, subtype_row, ["Whiteboard"])
    assert isinstance(room, Resource)
    assert isinstance(room, RoomResource)
    assert room.capacity == 8
    assert room.room_style == RoomStyle.SEMINAR
    assert room.facilities == ["Whiteboard"]
    assert room.subtype_table() == "rooms"
    assert room.subtype_payload() == {"resource_id": "RM-CS-01", "capacity": 8, "room_style": "seminar"}

    # EquipmentResource from dict rows
    eq = ResourceFactory.from_db_rows(
        {
            "resource_id": "EQ-LAP-1",
            "resource_name": "Library Laptop Pool",
            "resource_type": "specialist_equipment",
            "department_id": "LIB",
            "building_id": "MM-LIB",
            "location": "Floor 1 Lockers",
            "description": "Self-service laptop pool",
            "image_url": None,
            "requires_approval": 0,
            "booking_eligibility": "students_only",
            "checkin_method": "card_swipe",
            "status": "active",
        },
        {
            "resource_id": "EQ-LAP-1",
            "category": "laptop",
            "quantity": 24,
            "specifications": "Windows 11",
        },
        ["Card Swipe Access"],
    )
    assert isinstance(eq, EquipmentResource)
    assert eq.quantity == 24
    assert eq.subtype_table() == "equipment_items"
    assert eq.subtype_payload()["quantity"] == 24

    # AcademicSupportResource from dict rows
    sup = ResourceFactory.from_db_rows(
        {
            "resource_id": "SUP-WS-1",
            "resource_name": "Python Data Workshop",
            "resource_type": "academic_support",
            "department_id": "ADC",
            "building_id": None,
            "location": "Online (MS Teams)",
            "description": "Group workshop",
            "image_url": None,
            "requires_approval": 0,
            "booking_eligibility": "students_only",
            "checkin_method": "none",
            "status": "active",
        },
        {
            "resource_id": "SUP-WS-1",
            "category": "study_skills",
            "max_attendees": 20,
            "host_name": "ADC Team",
        },
    )
    assert isinstance(sup, AcademicSupportResource)
    assert sup.max_attendees == 20
    assert sup.subtype_table() == "support_services"
    assert sup.subtype_payload()["max_attendees"] == 20


def test_resource_factory_from_create_dto_and_polymorphic_rules(
    policy_config: BookingPolicyConfig,
) -> None:
    room_dto = ResourceCreate(
        resource_id="RM-TEST-1",
        resource_name="Group Study 1",
        resource_type=ResourceType.GROUP_SPACE,
        department_id="LIB",
        building_id="MM-1",
        location="Floor 2",
        requires_approval=True,
        booking_eligibility=BookingEligibility.STUDENTS_ONLY,
        checkin_method=CheckinMethod.PIN,
        facilities=["Whiteboard"],
        details=RoomDetails(capacity=6, room_style=RoomStyle.STUDY_POD),
    )
    eq_dto = ResourceCreate(
        resource_id="EQ-TEST-1",
        resource_name="VR Kit",
        resource_type=ResourceType.SPECIALIST_EQUIPMENT,
        department_id="WMG",
        building_id="MM-2",
        location="IMC Counter",
        details=EquipmentDetails(category="vr_xr", quantity=4, specifications="Headset + controllers"),
    )
    sup_dto = ResourceCreate(
        resource_id="SUP-TEST-1",
        resource_name="Writing Mentor",
        resource_type=ResourceType.ACADEMIC_SUPPORT,
        department_id="ADC",
        building_id=None,
        location="Online (MS Teams)",
        details=SupportDetails(category="writing", max_attendees=1, host_name="Writing Team"),
    )

    room = ResourceFactory.from_create_dto(room_dto)
    eq = ResourceFactory.from_create_dto(eq_dto)
    sup = ResourceFactory.from_create_dto(sup_dto)

    assert isinstance(room, RoomResource)
    assert isinstance(eq, EquipmentResource)
    assert isinstance(sup, AcademicSupportResource)

    # Polymorphic concurrency ceilings
    assert room.max_concurrent_bookings() == 1
    assert eq.max_concurrent_bookings() == 4
    assert sup.max_concurrent_bookings() == 1

    # Polymorphic max durations
    assert room.max_duration_seconds(policy_config) == 4 * 3600
    assert eq.max_duration_seconds(policy_config) == 7 * 86400
    assert sup.max_duration_seconds(policy_config) == 2 * 3600

    t0 = 1_796_000_000
    # Valid requests pass
    room.validate_booking_request(t0, t0 + 2 * 3600, policy_config, group_size=6)
    eq.validate_booking_request(t0, t0 + 3 * 86400, policy_config)
    sup.validate_booking_request(t0, t0 + 3600, policy_config, group_size=1)

    # Duration ceiling exceeded
    with pytest.raises(ValidationError):
        room.validate_booking_request(t0, t0 + 5 * 3600, policy_config)
    with pytest.raises(ValidationError):
        eq.validate_booking_request(t0, t0 + 8 * 86400, policy_config)
    with pytest.raises(ValidationError):
        sup.validate_booking_request(t0, t0 + 3 * 3600, policy_config)

    # Group size ceiling exceeded
    with pytest.raises(ValidationError):
        room.validate_booking_request(t0, t0 + 3600, policy_config, group_size=7)
    with pytest.raises(ValidationError):
        room.validate_booking_request(t0, t0 + 3600, policy_config, group_size=0)
    with pytest.raises(ValidationError):
        sup.validate_booking_request(t0, t0 + 3600, policy_config, group_size=2)

    # Invalid time window
    with pytest.raises(ValidationError):
        room.validate_booking_request(t0, t0, policy_config)

    # Inactive resource rejected
    room.status = ResourceStatus.MAINTENANCE
    with pytest.raises(ValidationError):
        room.validate_booking_request(t0, t0 + 3600, policy_config)

    # initial_status based on requires_approval + actor.role
    room.status = ResourceStatus.ACTIVE
    member = ActorContext(role=Role.MEMBER, user_id="S1001", user_type=UserType.PG_STUDENT)
    manager = ActorContext(role=Role.MANAGER, user_id="MGR-LIB", user_type=UserType.STAFF)
    admin = ActorContext(role=Role.ADMIN, user_id="ADMIN1", user_type=UserType.STAFF)
    assert room.initial_status(member) == BookingStatusId.PENDING
    assert room.initial_status(manager) == BookingStatusId.CONFIRMED
    assert room.initial_status(admin) == BookingStatusId.CONFIRMED
    assert eq.initial_status(member) == BookingStatusId.CONFIRMED


# ---------------------------------------------------------------------------
# 3. Shared Pydantic v2 DTO Contracts
# ---------------------------------------------------------------------------


def test_pydantic_resource_create_disambiguates_raw_dict_details() -> None:
    # Raw dict payload for academic_support must produce SupportDetails (NOT EquipmentDetails)
    sup_dto = ResourceCreate.model_validate(
        {
            "resource_id": "SUP-RAW-1",
            "resource_name": "Writing Advice",
            "resource_type": "academic_support",
            "department_id": "ADC",
            "location": "Online (MS Teams)",
            "details": {"category": "writing", "max_attendees": 1, "host_name": "ADC"},
        }
    )
    assert isinstance(sup_dto.details, SupportDetails)
    assert sup_dto.details.max_attendees == 1

    # Mismatched details rejected
    with pytest.raises(PydanticValidationError):
        ResourceCreate.model_validate(
            {
                "resource_id": "RM-BAD",
                "resource_name": "Bad Room",
                "resource_type": "study_room",
                "department_id": "LIB",
                "location": "Floor 1",
                "details": {"category": "laptop", "quantity": 2},
            }
        )


def test_pydantic_booking_and_analytics_dtos() -> None:
    with pytest.raises(PydanticValidationError):
        BookingCreate(resource_id="RM-1", start_time=1000, end_time=1000)

    with pytest.raises(PydanticValidationError):
        AvailabilityQuery(start_time=2000, end_time=1000)

    out = BookingOut(
        booking_id=1,
        user_id="S1001",
        resource_id="RM-1",
        start_time=1000,
        end_time=4600,
        status_id="confirmed",
        created_at=900,
        updated_at=900,
    )
    assert out.booking_id == 1

    kpi = OverviewKPI(
        total_bookings=10,
        active_bookings=5,
        confirmed_bookings=4,
        pending_bookings=1,
        completed_bookings=3,
        cancelled_bookings=1,
        rejected_bookings=0,
        no_show_bookings=1,
        active_rate=0.5,
        cancellation_rate=0.1,
        rejection_rate=0.0,
        no_show_rate=0.1,
        total_resources=531,
        active_resources=530,
        total_users=50,
        active_users=50,
    )
    assert kpi.total_resources == 531
    row = FairnessRow(
        course="Other (<5)",
        unique_users=3,
        booking_count=9,
        total_hours=12.5,
        avg_hours_per_user=4.17,
        is_suppressed=True,
    )
    assert row.is_suppressed is True
    chart_res = ChartExportResult(output_dir="/tmp/charts", generated_files=["a.png"])
    assert len(chart_res.generated_files) == 1


# ---------------------------------------------------------------------------
# 4. Deterministic Seed Pipeline (seed_db.py)
# ---------------------------------------------------------------------------


def test_deterministic_seed_loads_531_resources_50_users_and_conflict_free_bookings(
    app_settings: AppSettings,
) -> None:
    counts_first = seed_database(
        db_path=app_settings.db_path,
        seed_data_path=app_settings.seed_data_path,
        schema_path=app_settings.schema_path,
        reset=True,
        seed=42,
    )

    assert counts_first["departments"] == 58
    assert counts_first["buildings"] == 205
    assert counts_first["booking_statuses"] == 6
    assert counts_first["resources"] == 531
    assert counts_first["rooms"] == 490
    assert counts_first["equipment_items"] == 6
    assert counts_first["support_services"] == 35
    assert counts_first["facilities"] == 67
    assert counts_first["resource_facilities"] == 3126
    assert counts_first["users"] == 50
    assert 350 <= counts_first["bookings"] <= 450

    mgr = DatabaseManager(app_settings.db_path)
    conn = mgr.get_connection()
    try:
        # Zero FK violations
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []

        # Verify CTI 1:1 coverage across all 531 resources
        missing_rooms = conn.execute(
            "SELECT COUNT(*) FROM resources r LEFT JOIN rooms rm ON r.resource_id = rm.resource_id "
            "WHERE r.resource_type IN ('study_room', 'group_space', 'computer_lab') AND rm.resource_id IS NULL"
        ).fetchone()[0]
        missing_eq = conn.execute(
            "SELECT COUNT(*) FROM resources r LEFT JOIN equipment_items e ON r.resource_id = e.resource_id "
            "WHERE r.resource_type = 'specialist_equipment' AND e.resource_id IS NULL"
        ).fetchone()[0]
        missing_sup = conn.execute(
            "SELECT COUNT(*) FROM resources r LEFT JOIN support_services s ON r.resource_id = s.resource_id "
            "WHERE r.resource_type = 'academic_support' AND s.resource_id IS NULL"
        ).fetchone()[0]
        assert (missing_rooms, missing_eq, missing_sup) == (0, 0, 0)

        # Verify users coverage: all 4 roles, all 4 user_types, well-known demo users, courses, accessibility
        roles = {r["role"] for r in conn.execute("SELECT DISTINCT role FROM users").fetchall()}
        user_types = {r["user_type"] for r in conn.execute("SELECT DISTINCT user_type FROM users").fetchall()}
        assert roles == {"admin", "manager", "student_services", "member"}
        assert user_types == {"ug_student", "pg_student", "pgr_student", "staff"}

        demo_ids = {
            r["user_id"]
            for r in conn.execute(
                "SELECT user_id FROM users WHERE user_id IN "
                "('ADMIN1', 'MGR-LIB', 'MGR-CENTRAL', 'SS1', 'S1001', 'S1002', 'STAFF1')"
            ).fetchall()
        }
        assert demo_ids == {"ADMIN1", "MGR-LIB", "MGR-CENTRAL", "SS1", "S1001", "S1002", "STAFF1"}

        course_counts = {
            r["course"]: r["cnt"]
            for r in conn.execute(
                "SELECT course, COUNT(*) AS cnt FROM users WHERE course IS NOT NULL GROUP BY course"
            ).fetchall()
        }
        large_courses = [c for c, cnt in course_counts.items() if cnt >= 6]
        small_courses = [c for c, cnt in course_counts.items() if cnt < 5]
        assert len(large_courses) >= 4
        assert len(small_courses) >= 1

        acc_users = conn.execute(
            "SELECT COUNT(*) FROM users WHERE has_accessibility_access = 1"
        ).fetchone()[0]
        assert acc_users >= 3

        # Verify bookings: all 6 statuses present, spans 8 weeks, exam peak in week 6/7, underused resources left
        statuses = {r["status_id"] for r in conn.execute("SELECT DISTINCT status_id FROM bookings").fetchall()}
        assert statuses == {"pending", "confirmed", "cancelled", "rejected", "completed", "no_show"}

        min_start, max_start = conn.execute(
            "SELECT MIN(start_time), MAX(start_time) FROM bookings"
        ).fetchone()
        span_weeks = (max_start - min_start) / (7 * 86400)
        assert span_weeks >= 6.5

        # Compute weekly counts relative to min_start week
        week_rows = conn.execute(
            "SELECT CAST((start_time - ?) / (7 * 86400) AS INTEGER) AS wk, COUNT(*) AS cnt "
            "FROM bookings GROUP BY wk ORDER BY wk",
            (min_start,),
        ).fetchall()
        week_counts = {r["wk"]: r["cnt"] for r in week_rows}
        normal_avg = sum(week_counts.get(w, 0) for w in range(0, 5)) / 5
        peak_avg = sum(week_counts.get(w, 0) for w in (5, 6)) / 2
        assert peak_avg > normal_avg * 1.4, f"Expected exam-week peak in week 6/7, got {week_counts}"

        # Some resources left unbooked for underused analytics
        booked_resources = conn.execute("SELECT COUNT(DISTINCT resource_id) FROM bookings").fetchone()[0]
        assert 30 <= booked_resources < 531

        # Zero user double-booking on blocking slots
        user_clashes = conn.execute(
            """
            SELECT COUNT(*)
            FROM bookings b1
            JOIN booking_statuses s1 ON b1.status_id = s1.status_id
            JOIN bookings b2 ON b1.user_id = b2.user_id AND b1.booking_id < b2.booking_id
            JOIN booking_statuses s2 ON b2.status_id = s2.status_id
            WHERE b1.deleted_at IS NULL AND b2.deleted_at IS NULL
              AND s1.blocks_slot = 1 AND s2.blocks_slot = 1
              AND b1.start_time < b2.end_time AND b1.end_time > b2.start_time
            """
        ).fetchone()[0]
        assert user_clashes == 0

        # Zero resource concurrency violations on blocking slots
        blocking_rows = conn.execute(
            """
            SELECT b.booking_id, b.resource_id, b.start_time, b.end_time,
                   COALESCE(e.quantity, s.max_attendees, 1) AS max_conc
            FROM bookings b
            JOIN booking_statuses bs ON b.status_id = bs.status_id
            LEFT JOIN equipment_items e ON b.resource_id = e.resource_id
            LEFT JOIN support_services s ON b.resource_id = s.resource_id
            WHERE b.deleted_at IS NULL AND bs.blocks_slot = 1
            """
        ).fetchall()
        by_res: dict[str, list[sqlite3.Row]] = {}
        for row in blocking_rows:
            by_res.setdefault(row["resource_id"], []).append(row)
        for res_id, rows in by_res.items():
            limit = rows[0]["max_conc"]
            for r in rows:
                overlapping = sum(
                    1 for other in rows if other["start_time"] < r["end_time"] and other["end_time"] > r["start_time"]
                )
                assert overlapping <= limit, f"Resource {res_id} exceeded concurrency limit {limit}"

        snapshot_first = conn.execute(
            "SELECT user_id, resource_id, start_time, end_time, status_id FROM bookings ORDER BY booking_id"
        ).fetchall()
    finally:
        conn.close()

    # Re-seeding with --reset and same seed is 100% deterministic
    counts_second = seed_database(
        db_path=app_settings.db_path,
        seed_data_path=app_settings.seed_data_path,
        schema_path=app_settings.schema_path,
        reset=True,
        seed=42,
    )
    assert counts_second == counts_first

    conn2 = mgr.get_connection()
    try:
        snapshot_second = conn2.execute(
            "SELECT user_id, resource_id, start_time, end_time, status_id FROM bookings ORDER BY booking_id"
        ).fetchall()
        assert [tuple(r) for r in snapshot_second] == [tuple(r) for r in snapshot_first]
    finally:
        conn2.close()
