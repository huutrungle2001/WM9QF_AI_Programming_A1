"""TDD suite for AnalyticsRepository, AnalyticsService, and ChartService."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.config import BookingPolicyConfig
from app.database import DatabaseManager
from app.domain.enums import ResourceType, Role, UserType
from app.domain.exceptions import ForbiddenError, ValidationError
from app.repositories.analytics_repo import AnalyticsRepository
from app.schemas.actor import ActorContext
from app.services.analytics_service import AnalyticsService
from app.services.chart_service import ChartService

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _utc_ts(year: int, month: int, day: int, hour: int, minute: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, tzinfo=timezone.utc).timestamp())


@pytest.fixture()
def admin_actor() -> ActorContext:
    return ActorContext(role=Role.ADMIN, user_id="A1", user_type=UserType.STAFF, department_id="CS")


@pytest.fixture()
def manager_actor() -> ActorContext:
    return ActorContext(role=Role.MANAGER, user_id="M1", user_type=UserType.STAFF, department_id="CS")


@pytest.fixture()
def student_services_actor() -> ActorContext:
    return ActorContext(
        role=Role.STUDENT_SERVICES, user_id="SS1", user_type=UserType.STAFF, department_id="CS"
    )


@pytest.fixture()
def member_actor() -> ActorContext:
    return ActorContext(
        role=Role.MEMBER, user_id="S_AI_1", user_type=UserType.PG_STUDENT, department_id="CS"
    )


@pytest.fixture()
def analytics_db(db_manager: DatabaseManager) -> DatabaseManager:
    """Controlled deterministic dataset with exact known KPIs, peaks, and cohorts.

    Dataset summary (non-deleted bookings = 20):
    - Statuses:
      * confirmed (blocks_slot=1): 5
      * pending (blocks_slot=1):   2
      * completed (blocks_slot=0): 7
      * cancelled (blocks_slot=0): 3
      * rejected (blocks_slot=0):  1
      * no_show (blocks_slot=0):   2
      -> active_bookings = 7 (0.35), cancelled = 3 (0.15), rejected = 1 (0.05), no_show = 2 (0.10)
    - Plus 2 soft-deleted bookings (deleted_at IS NOT NULL) that MUST be ignored everywhere:
      * 1 on RM-ZERO (keeps RM-ZERO at 0 active bookings)
      * 1 on RM-HOT
    - Resources (total=5, active=4):
      * RM-HOT (group_space, CS, active): 13 bookings, 26.0h
      * RM-MID (study_room, CS, active):   6 bookings, 9.0h
      * EQ-LOW (specialist_equipment, WMG, active): 1 booking, 4.0h
      * RM-ZERO (group_space, CS, active): 0 non-deleted bookings, 0.0h
      * RM-RETIRED (study_room, CS, retired): 0 bookings (excluded from active underused)
    - Users (total=16, active=15):
      * 6 students in "MSc Applied AI" (cohort >= 5) -> 8 bookings, 16.0h
      * 5 students in "BSc Computer Science" (cohort == 5) -> 6 bookings, 10.0h
      * 2 students in "MA Classics" (cohort < 5) -> 3 bookings, 6.0h
      * 1 student in "PhD Rare Studies" (cohort < 5) -> 2 bookings, 5.0h
      * 1 active staff admin (A1, course=None) -> 1 booking, 2.0h
      * 1 inactive staff member (U_INACTIVE, is_active=0, course=None) -> 0 bookings
    - Weeks (UTC ISO weeks):
      * 2026-W46 (Mon 2026-11-09): 4 bookings (1 cancelled)
      * 2026-W47 (Mon 2026-11-16): 11 bookings (1 cancelled)  <-- EXAM PRESSURE PEAK
      * 2026-W48 (Mon 2026-11-23): 5 bookings (1 cancelled)
    """
    with db_manager.transaction() as conn:
        conn.executemany(
            "INSERT INTO departments (department_id, department_name, faculty) VALUES (?, ?, ?)",
            [
                ("CS", "Computer Science", "SEM"),
                ("WMG", "WMG", "SEM"),
            ],
        )
        conn.execute(
            "INSERT INTO buildings (building_id, building_name, zone, lat, lon, floor_count) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("MM-CS", "CS Building", "Main Site", 52.383, -1.560, 3),
        )
        conn.executemany(
            "INSERT INTO booking_statuses (status_id, description, blocks_slot) VALUES (?, ?, ?)",
            [
                ("pending", "Pending approval", 1),
                ("confirmed", "Confirmed booking", 1),
                ("cancelled", "Cancelled booking", 0),
                ("rejected", "Rejected request", 0),
                ("completed", "Completed session", 0),
                ("no_show", "User did not attend", 0),
            ],
        )

        users = [
            # 6 MSc Applied AI students
            *[
                (
                    f"S_AI_{i}",
                    f"AI Student {i}",
                    f"ai{i}@warwick.ac.uk",
                    "pg_student",
                    "member",
                    "MSc Applied AI",
                    "CS",
                    0,
                    1,
                )
                for i in range(1, 7)
            ],
            # 5 BSc Computer Science students
            *[
                (
                    f"S_CS_{i}",
                    f"CS Student {i}",
                    f"cs{i}@warwick.ac.uk",
                    "ug_student",
                    "member",
                    "BSc Computer Science",
                    "CS",
                    0,
                    1,
                )
                for i in range(1, 6)
            ],
            # 2 MA Classics students (< 5)
            ("S_CL_1", "Classics 1", "cl1@warwick.ac.uk", "pg_student", "member", "MA Classics", "CS", 0, 1),
            ("S_CL_2", "Classics 2", "cl2@warwick.ac.uk", "pg_student", "member", "MA Classics", "CS", 0, 1),
            # 1 PhD Rare Studies student (< 5)
            (
                "S_RS_1",
                "Rare 1",
                "rs1@warwick.ac.uk",
                "pgr_student",
                "member",
                "PhD Rare Studies",
                "WMG",
                0,
                1,
            ),
            # 1 active staff admin
            ("A1", "Admin One", "admin1@warwick.ac.uk", "staff", "admin", None, "CS", 0, 1),
            # 1 inactive user
            ("U_INACTIVE", "Former Staff", "old@warwick.ac.uk", "staff", "member", None, "WMG", 0, 0),
        ]
        conn.executemany(
            "INSERT INTO users "
            "(user_id, full_name, email, user_type, role, course, department_id, "
            "has_accessibility_access, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            users,
        )

        resources = [
            ("RM-HOT", "Hot Group Room", "group_space", "CS", "MM-CS", "CS0.01", "Popular room", None, 0, "all_users", "none", "active"),
            ("RM-MID", "Mid Study Room", "study_room", "CS", "MM-CS", "CS0.02", "Study room", None, 0, "all_users", "none", "active"),
            ("EQ-LOW", "VR Kit", "specialist_equipment", "WMG", "MM-CS", "IMC 1", "XR kit", None, 1, "all_users", "none", "active"),
            ("RM-ZERO", "Unused Group Pod", "group_space", "CS", "MM-CS", "CS0.03", "Quiet pod", None, 0, "all_users", "none", "active"),
            ("RM-RETIRED", "Old Room", "study_room", "CS", "MM-CS", "CS0.99", "Retired", None, 0, "all_users", "none", "retired"),
        ]
        conn.executemany(
            "INSERT INTO resources "
            "(resource_id, resource_name, resource_type, department_id, building_id, location, "
            "description, image_url, requires_approval, booking_eligibility, checkin_method, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            resources,
        )
        conn.executemany(
            "INSERT INTO rooms (resource_id, capacity, room_style) VALUES (?, ?, ?)",
            [
                ("RM-HOT", 8, "study_pod"),
                ("RM-MID", 4, "standard"),
                ("RM-ZERO", 6, "study_pod"),
                ("RM-RETIRED", 4, "standard"),
            ],
        )
        conn.execute(
            "INSERT INTO equipment_items (resource_id, category, quantity, specifications) VALUES (?, ?, ?, ?)",
            ("EQ-LOW", "vr_xr", 2, "Headset"),
        )

        # Tuples: (user_id, resource_id, start_ts, duration_min, status_id, deleted_at)
        bookings = [
            # --- Week 2026-W46 (Mon 2026-11-09 .. Sun 2026-11-15): 4 bookings (1 cancelled) ---
            ("S_AI_1", "RM-HOT", _utc_ts(2026, 11, 9, 10), 120, "completed", None),   # Mon 10:00, 2h
            ("S_AI_2", "RM-HOT", _utc_ts(2026, 11, 10, 14), 120, "completed", None),  # Tue 14:00, 2h
            ("S_CS_1", "RM-MID", _utc_ts(2026, 11, 11, 10), 90, "cancelled", None),   # Wed 10:00, 1.5h
            ("S_CL_1", "RM-HOT", _utc_ts(2026, 11, 12, 16), 120, "completed", None),  # Thu 16:00, 2h
            # --- Week 2026-W47 (Mon 2026-11-16 .. Sun 2026-11-22): 11 bookings (1 cancelled) PEAK ---
            ("S_AI_3", "RM-HOT", _utc_ts(2026, 11, 16, 10), 120, "completed", None),  # Mon 10:00, 2h
            ("S_AI_4", "RM-HOT", _utc_ts(2026, 11, 16, 14), 120, "completed", None),  # Mon 14:00, 2h
            ("S_AI_5", "RM-HOT", _utc_ts(2026, 11, 17, 10), 120, "confirmed", None),  # Tue 10:00, 2h
            ("S_AI_6", "RM-HOT", _utc_ts(2026, 11, 17, 14), 120, "cancelled", None),  # Tue 14:00, 2h
            ("S_CS_2", "RM-HOT", _utc_ts(2026, 11, 18, 10), 120, "confirmed", None),  # Wed 10:00, 2h
            ("S_CS_3", "RM-MID", _utc_ts(2026, 11, 18, 14), 90, "completed", None),   # Wed 14:00, 1.5h
            ("S_CS_4", "RM-MID", _utc_ts(2026, 11, 19, 10), 90, "no_show", None),     # Thu 10:00, 1.5h
            ("S_CS_5", "RM-MID", _utc_ts(2026, 11, 19, 14), 90, "confirmed", None),   # Thu 14:00, 1.5h
            ("S_CL_2", "RM-HOT", _utc_ts(2026, 11, 20, 10), 120, "pending", None),    # Fri 10:00, 2h
            ("S_RS_1", "EQ-LOW", _utc_ts(2026, 11, 20, 11), 240, "rejected", None),   # Fri 11:00, 4h
            ("A1", "RM-HOT", _utc_ts(2026, 11, 21, 10), 120, "completed", None),      # Sat 10:00, 2h
            # --- Week 2026-W48 (Mon 2026-11-23 .. Sun 2026-11-29): 5 bookings (1 cancelled) ---
            ("S_AI_1", "RM-HOT", _utc_ts(2026, 11, 23, 10), 120, "confirmed", None),  # Mon 10:00, 2h
            ("S_AI_2", "RM-HOT", _utc_ts(2026, 11, 24, 10), 120, "confirmed", None),  # Tue 10:00, 2h
            ("S_CS_1", "RM-HOT", _utc_ts(2026, 11, 25, 10), 120, "no_show", None),    # Wed 10:00, 2h
            ("S_CL_1", "RM-MID", _utc_ts(2026, 11, 26, 10), 120, "pending", None),    # Thu 10:00, 2h
            ("S_RS_1", "RM-MID", _utc_ts(2026, 11, 29, 18), 60, "cancelled", None),   # Sun 18:00, 1h
            # --- Soft-deleted bookings (MUST be excluded everywhere) ---
            ("S_AI_1", "RM-ZERO", _utc_ts(2026, 11, 18, 9), 120, "confirmed", _utc_ts(2026, 11, 18, 8)),
            ("S_RS_1", "RM-HOT", _utc_ts(2026, 11, 18, 12), 120, "cancelled", _utc_ts(2026, 11, 18, 11)),
        ]
        conn.executemany(
            "INSERT INTO bookings "
            "(user_id, resource_id, start_time, end_time, status_id, purpose, notes, deleted_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (u, r, start, start + dur * 60, status, "Study session", None, deleted)
                for (u, r, start, dur, status, deleted) in bookings
            ],
        )
    return db_manager


def test_overview_kpi_exact_math(analytics_db: DatabaseManager, admin_actor: ActorContext) -> None:
    svc = AnalyticsService(analytics_db)
    kpi = svc.get_overview(admin_actor)

    assert kpi.total_bookings == 20
    assert kpi.active_bookings == 7
    assert kpi.confirmed_bookings == 5
    assert kpi.pending_bookings == 2
    assert kpi.completed_bookings == 7
    assert kpi.cancelled_bookings == 3
    assert kpi.rejected_bookings == 1
    assert kpi.no_show_bookings == 2

    assert kpi.active_rate == pytest.approx(0.35)
    assert kpi.cancellation_rate == pytest.approx(0.15)
    assert kpi.rejection_rate == pytest.approx(0.05)
    assert kpi.no_show_rate == pytest.approx(0.10)

    assert kpi.total_resources == 5
    assert kpi.active_resources == 4
    assert kpi.total_users == 16
    assert kpi.active_users == 15


def test_overview_empty_db_zero_rates(db_manager: DatabaseManager, admin_actor: ActorContext) -> None:
    svc = AnalyticsService(db_manager)
    kpi = svc.get_overview(admin_actor)

    assert kpi.total_bookings == 0
    assert kpi.active_bookings == 0
    assert kpi.active_rate == 0.0
    assert kpi.cancellation_rate == 0.0
    assert kpi.rejection_rate == 0.0
    assert kpi.no_show_rate == 0.0
    assert kpi.total_resources == 0
    assert kpi.total_users == 0


def test_overview_time_window_and_validation(
    analytics_db: DatabaseManager, admin_actor: ActorContext
) -> None:
    svc = AnalyticsService(analytics_db)
    w47_start = _utc_ts(2026, 11, 16, 0)
    w47_end = _utc_ts(2026, 11, 22, 23, 59)

    kpi = svc.get_overview(admin_actor, from_ts=w47_start, to_ts=w47_end)
    assert kpi.total_bookings == 11
    assert kpi.cancelled_bookings == 1
    assert kpi.rejected_bookings == 1

    with pytest.raises(ValidationError):
        svc.get_overview(admin_actor, from_ts=w47_end, to_ts=w47_start)


def test_demand_most_booked_and_zero_booking_underused(
    analytics_db: DatabaseManager, manager_actor: ActorContext
) -> None:
    svc = AnalyticsService(analytics_db)
    demand = svc.get_demand(manager_actor, limit=10, max_bookings=2)

    most_booked = demand["most_booked"]
    assert [item.resource_id for item in most_booked] == ["RM-HOT", "RM-MID", "EQ-LOW"]
    assert most_booked[0].booking_count == 13
    assert most_booked[0].total_hours == pytest.approx(26.0)
    assert most_booked[1].booking_count == 6
    assert most_booked[1].total_hours == pytest.approx(9.0)
    assert most_booked[2].booking_count == 1
    assert most_booked[2].total_hours == pytest.approx(4.0)

    underused = demand["underused"]
    # Zero-booking active resource MUST appear first; retired resource MUST be excluded;
    # soft-deleted booking on RM-ZERO must NOT count as a booking.
    assert [item.resource_id for item in underused] == ["RM-ZERO", "EQ-LOW"]
    assert underused[0].booking_count == 0
    assert underused[0].total_hours == pytest.approx(0.0)
    assert underused[1].booking_count == 1

    # Filtered by resource_type
    group_demand = svc.get_demand(
        manager_actor, limit=10, max_bookings=2, resource_type=ResourceType.GROUP_SPACE
    )
    assert [item.resource_id for item in group_demand["most_booked"]] == ["RM-HOT"]
    assert [item.resource_id for item in group_demand["underused"]] == ["RM-ZERO"]


def test_heatmap_full_grid_and_total_matches_bookings(
    analytics_db: DatabaseManager, manager_actor: ActorContext
) -> None:
    svc = AnalyticsService(analytics_db)
    cells = svc.get_heatmap(manager_actor)

    assert len(cells) == 7 * 24
    assert [c.day_name for c in cells[::24]] == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    assert sum(c.booking_count for c in cells) == 20

    cell_map = {(c.day_of_week, c.hour): c.booking_count for c in cells}
    # Mondays at 10:00 UTC: Nov 9, Nov 16, Nov 23 -> 3 bookings
    assert cell_map[(0, 10)] == 3
    # Sunday at 18:00 UTC: Nov 29 -> 1 booking
    assert cell_map[(6, 18)] == 1
    # Empty slot
    assert cell_map[(6, 3)] == 0


def test_weekly_trends_iso_weeks_and_peak_detection(
    analytics_db: DatabaseManager, student_services_actor: ActorContext
) -> None:
    svc = AnalyticsService(analytics_db)
    trends = svc.get_trends(student_services_actor)

    assert [t.week_label for t in trends] == ["2026-W46", "2026-W47", "2026-W48"]
    assert trends[0].week_start_ts == _utc_ts(2026, 11, 9, 0)
    assert trends[1].week_start_ts == _utc_ts(2026, 11, 16, 0)
    assert trends[2].week_start_ts == _utc_ts(2026, 11, 23, 0)

    assert [t.booking_count for t in trends] == [4, 11, 5]
    assert [t.cancelled_count for t in trends] == [1, 1, 1]
    assert sum(t.booking_count for t in trends) == 20

    peak = max(trends, key=lambda t: t.booking_count)
    assert peak.week_label == "2026-W47"
    assert peak.booking_count == 11


def test_cancellation_breakdown_whitelisting_and_rates(
    analytics_db: DatabaseManager, manager_actor: ActorContext
) -> None:
    svc = AnalyticsService(analytics_db)

    by_type = {row.label: row for row in svc.get_cancellations(manager_actor, group_by="resource_type")}
    assert by_type["group_space"].dimension == "resource_type"
    assert by_type["group_space"].total_bookings == 13
    assert by_type["group_space"].cancelled_count == 1
    assert by_type["group_space"].no_show_count == 1
    assert by_type["group_space"].cancellation_rate == pytest.approx(round(1 / 13, 4))

    assert by_type["study_room"].total_bookings == 6
    assert by_type["study_room"].cancelled_count == 2
    assert by_type["study_room"].no_show_count == 1
    assert by_type["study_room"].cancellation_rate == pytest.approx(round(2 / 6, 4))

    assert by_type["specialist_equipment"].total_bookings == 1
    assert by_type["specialist_equipment"].rejected_count == 1

    by_dept = {row.label: row for row in svc.get_cancellations(manager_actor, group_by="department_id")}
    assert by_dept["CS"].total_bookings == 19
    assert by_dept["WMG"].total_bookings == 1
    assert by_dept["WMG"].rejected_count == 1

    with pytest.raises(ValidationError):
        svc.get_cancellations(manager_actor, group_by="user_id; DROP TABLE bookings; --")


def test_course_fairness_k_anonymity_suppression(
    analytics_db: DatabaseManager, student_services_actor: ActorContext
) -> None:
    svc = AnalyticsService(analytics_db, policy_config=BookingPolicyConfig(min_cohort=5))
    rows = svc.get_course_fairness(student_services_actor)

    courses = [r.course for r in rows]
    assert "MSc Applied AI" in courses
    assert "BSc Computer Science" in courses
    assert "Other (<5)" in courses
    # Suppressed cohorts MUST NOT leak their names
    assert "MA Classics" not in courses
    assert "PhD Rare Studies" not in courses

    by_course = {r.course: r for r in rows}
    ai = by_course["MSc Applied AI"]
    assert ai.unique_users == 6
    assert ai.booking_count == 8
    assert ai.total_hours == pytest.approx(16.0)
    assert ai.avg_hours_per_user == pytest.approx(round(16.0 / 6, 2))
    assert ai.is_suppressed is False

    cs = by_course["BSc Computer Science"]
    assert cs.unique_users == 5
    assert cs.booking_count == 6
    assert cs.total_hours == pytest.approx(10.0)
    assert cs.avg_hours_per_user == pytest.approx(2.0)
    assert cs.is_suppressed is False

    # Suppressed row merges MA Classics (2 users, 3 bookings, 6h) + PhD Rare Studies (1 user, 2 bookings, 5h)
    other = by_course["Other (<5)"]
    assert other.unique_users == 3
    assert other.booking_count == 5
    assert other.total_hours == pytest.approx(11.0)
    assert other.avg_hours_per_user == pytest.approx(round(11.0 / 3, 2))
    assert other.is_suppressed is True

    # Custom min_cohort=2 keeps MA Classics visible and suppresses only PhD Rare Studies
    relaxed = {r.course: r for r in svc.get_course_fairness(student_services_actor, min_cohort=2)}
    assert "MA Classics" in relaxed
    assert relaxed["MA Classics"].is_suppressed is False
    assert "Other (<2)" in relaxed
    assert relaxed["Other (<2)"].unique_users == 1
    assert relaxed["Other (<2)"].is_suppressed is True


def test_rbac_allowed_roles_and_member_forbidden(
    analytics_db: DatabaseManager,
    admin_actor: ActorContext,
    manager_actor: ActorContext,
    student_services_actor: ActorContext,
    member_actor: ActorContext,
    tmp_path: Path,
) -> None:
    svc = AnalyticsService(analytics_db)
    chart_svc = ChartService(svc)

    # All three privileged/reporting roles succeed
    for actor in (admin_actor, manager_actor, student_services_actor):
        assert svc.get_overview(actor).total_bookings == 20
        assert len(svc.get_heatmap(actor)) == 168

    # Member is strictly forbidden on every analytics & chart method
    with pytest.raises(ForbiddenError):
        svc.get_overview(member_actor)
    with pytest.raises(ForbiddenError):
        svc.get_demand(member_actor)
    with pytest.raises(ForbiddenError):
        svc.get_heatmap(member_actor)
    with pytest.raises(ForbiddenError):
        svc.get_trends(member_actor)
    with pytest.raises(ForbiddenError):
        svc.get_cancellations(member_actor)
    with pytest.raises(ForbiddenError):
        svc.get_course_fairness(member_actor)

    blocked_dir = tmp_path / "blocked_charts"
    with pytest.raises(ForbiddenError):
        chart_svc.export_charts(member_actor, output_dir=blocked_dir)
    assert not blocked_dir.exists()


def test_sqli_resistance_in_analytics_filters(
    analytics_db: DatabaseManager, admin_actor: ActorContext
) -> None:
    repo = AnalyticsRepository(analytics_db)
    payload = "group_space' OR '1'='1"

    assert repo.get_most_booked(resource_type=payload) == []
    assert repo.get_underused(resource_type=payload) == []
    assert sum(c.booking_count for c in repo.get_busiest_times_heatmap(resource_type=payload)) == 0
    assert repo.get_weekly_trends(resource_type=payload) == []

    # Verify table integrity unaffected
    assert AnalyticsService(analytics_db).get_overview(admin_actor).total_bookings == 20


def test_chart_service_exports_all_four_pngs(
    analytics_db: DatabaseManager, student_services_actor: ActorContext, tmp_path: Path
) -> None:
    out_dir = tmp_path / "charts"
    chart_svc = ChartService(AnalyticsService(analytics_db))
    result = chart_svc.export_charts(student_services_actor, output_dir=out_dir)

    expected_files = [
        "top_booked_resources.png",
        "busiest_times_heatmap.png",
        "weekly_booking_trends.png",
        "course_fairness_and_status.png",
    ]
    assert Path(result.output_dir) == out_dir
    assert result.generated_files == expected_files

    for filename in expected_files:
        path = out_dir / filename
        assert path.exists(), f"Missing expected chart {filename}"
        raw = path.read_bytes()
        assert len(raw) > 5_000, f"Chart {filename} looks unexpectedly small ({len(raw)} bytes)"
        assert raw.startswith(PNG_SIGNATURE), f"Chart {filename} is not a valid PNG"


def test_chart_service_handles_empty_database(
    db_manager: DatabaseManager, admin_actor: ActorContext, tmp_path: Path
) -> None:
    out_dir = tmp_path / "empty_charts"
    chart_svc = ChartService(db_manager)
    result = chart_svc.export_charts(admin_actor, output_dir=out_dir)

    assert len(result.generated_files) == 4
    for filename in result.generated_files:
        path = out_dir / filename
        assert path.exists()
        raw = path.read_bytes()
        assert len(raw) > 1_000
        assert raw.startswith(PNG_SIGNATURE)

