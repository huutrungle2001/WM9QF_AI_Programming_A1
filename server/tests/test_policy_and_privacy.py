"""Phase 2 TDD suite: 4-role RBAC matrix, Policy-to-SQL pushdown, 403 bypasses, and privacy redaction."""

from __future__ import annotations

import pytest

from app.config import BookingPolicyConfig
from app.database import DatabaseManager
from app.domain.enums import (
    BookingEligibility,
    CampusZone,
    ResourceType,
    Role,
    RoomStyle,
    UserType,
)
from app.domain.exceptions import ForbiddenError
from app.repositories.booking_repo import BookingRepository
from app.repositories.reference_repo import ReferenceRepository
from app.repositories.resource_repo import ResourceRepository
from app.repositories.user_repo import UserRepository
from app.schemas.actor import ActorContext
from app.schemas.booking import BookingCreate, BookingFilter, BookingUpdate
from app.schemas.reference import BuildingCreate, DepartmentCreate
from app.schemas.resource import AvailabilityQuery, ResourceCreate, ResourceFilter, RoomDetails
from app.schemas.user import UserCreate
from app.services.booking_service import BookingService
from app.services.catalog_service import CatalogService
from app.services.policy import PolicyGuard

BASE_TS = 1796029200
HOUR = 3600

ADMIN = ActorContext(role=Role.ADMIN, user_id="ADMIN1", user_type=UserType.STAFF)
MANAGER = ActorContext(role=Role.MANAGER, user_id="MGR1", user_type=UserType.STAFF)
STUDENT_SERVICES = ActorContext(role=Role.STUDENT_SERVICES, user_id="SS1", user_type=UserType.STAFF)


def _setup_world(db: DatabaseManager) -> tuple[CatalogService, BookingService, PolicyGuard]:
    ref_repo = ReferenceRepository(db)
    user_repo = UserRepository(db)
    res_repo = ResourceRepository(db)
    booking_repo = BookingRepository(db)
    policy = PolicyGuard(pseudonym_salt="deterministic-test-salt")
    catalog = CatalogService(ref_repo, user_repo, res_repo, booking_repo, policy)
    bookings = BookingService(db, booking_repo, res_repo, user_repo, policy, BookingPolicyConfig())

    # Users across user_types and accessibility flags
    catalog.create_user(
        ADMIN,
        UserCreate(
            user_id="UG1",
            full_name="Uma Undergrad",
            email="uma@warwick.ac.uk",
            user_type=UserType.UG_STUDENT,
            role=Role.MEMBER,
            course="BSc Computer Science",
            department_id="CS",
            has_accessibility_access=False,
        ),
    )
    catalog.create_user(
        ADMIN,
        UserCreate(
            user_id="PGR1",
            full_name="Priya Researcher",
            email="priya.pgr@warwick.ac.uk",
            user_type=UserType.PGR_STUDENT,
            role=Role.MEMBER,
            course="PhD Computer Science",
            department_id="CS",
            has_accessibility_access=False,
        ),
    )
    catalog.create_user(
        ADMIN,
        UserCreate(
            user_id="ACC1",
            full_name="Alex Accessible",
            email="alex.acc@warwick.ac.uk",
            user_type=UserType.PG_STUDENT,
            role=Role.MEMBER,
            course="MSc Applied AI",
            department_id="CS",
            has_accessibility_access=True,
        ),
    )
    catalog.create_user(
        ADMIN,
        UserCreate(
            user_id="STF1",
            full_name="Prof. Sam Staff",
            email="sam.staff@warwick.ac.uk",
            user_type=UserType.STAFF,
            role=Role.MEMBER,
            course=None,
            department_id="CS",
            has_accessibility_access=False,
        ),
    )

    # Resources covering every BookingEligibility tier
    eligibility_rooms = [
        ("RM-STUDENTS", BookingEligibility.STUDENTS_ONLY),
        ("RM-PG", BookingEligibility.PG_ONLY),
        ("RM-PGR-STAFF", BookingEligibility.PGR_AND_STAFF),
        ("RM-STAFF", BookingEligibility.STAFF_ONLY),
        ("RM-DISABILITY", BookingEligibility.DISABILITY_ONLY),
    ]
    for rid, elig in eligibility_rooms:
        catalog.create_resource(
            ADMIN,
            ResourceCreate(
                resource_id=rid,
                resource_name=f"Room {rid}",
                resource_type=ResourceType.STUDY_ROOM,
                department_id="CS",
                building_id="MM-CS",
                location=rid,
                booking_eligibility=elig,
                details=RoomDetails(capacity=4, room_style=RoomStyle.STUDY_POD),
            ),
        )
    return catalog, bookings, policy


def test_policy_to_sql_pushdown_visibility_by_user_type_and_accessibility(
    minimal_db: DatabaseManager,
) -> None:
    catalog, _, _ = _setup_world(minimal_db)

    # Normal PG student (S1001, has_accessibility_access=False)
    pg_actor = ActorContext(
        role=Role.MEMBER,
        user_id="S1001",
        user_type=UserType.PG_STUDENT,
        has_accessibility_access=False,
    )
    pg_ids = {r.resource_id for r in catalog.list_resources(pg_actor)}
    assert pg_ids == {"RM-CS-01", "RM-STUDENTS", "RM-PG"}
    assert "RM-STAFF" not in pg_ids
    assert "RM-DISABILITY" not in pg_ids
    assert "RM-PGR-STAFF" not in pg_ids

    # Availability lookup also applies SQL pushdown
    pg_avail_ids = {
        slot.resource.resource_id
        for slot in catalog.check_availability(
            pg_actor, AvailabilityQuery(start_time=BASE_TS, end_time=BASE_TS + HOUR)
        )
    }
    assert pg_avail_ids == {"RM-CS-01", "RM-STUDENTS", "RM-PG"}

    # Accessible PG student sees disability_only in addition to PG tiers
    acc_actor = ActorContext(
        role=Role.MEMBER,
        user_id="ACC1",
        user_type=UserType.PG_STUDENT,
        has_accessibility_access=True,
    )
    acc_ids = {r.resource_id for r in catalog.list_resources(acc_actor)}
    assert acc_ids == {"RM-CS-01", "RM-STUDENTS", "RM-PG", "RM-DISABILITY"}

    # UG student sees all_users and students_only
    ug_actor = ActorContext(
        role=Role.MEMBER,
        user_id="UG1",
        user_type=UserType.UG_STUDENT,
        has_accessibility_access=False,
    )
    assert {r.resource_id for r in catalog.list_resources(ug_actor)} == {"RM-CS-01", "RM-STUDENTS"}

    # PGR student sees all_users, students_only, pg_only, pgr_and_staff
    pgr_actor = ActorContext(
        role=Role.MEMBER,
        user_id="PGR1",
        user_type=UserType.PGR_STUDENT,
        has_accessibility_access=False,
    )
    assert {r.resource_id for r in catalog.list_resources(pgr_actor)} == {
        "RM-CS-01",
        "RM-STUDENTS",
        "RM-PG",
        "RM-PGR-STAFF",
    }

    # Staff member sees all_users, staff_only, pgr_and_staff
    staff_actor = ActorContext(
        role=Role.MEMBER,
        user_id="STF1",
        user_type=UserType.STAFF,
        has_accessibility_access=False,
    )
    assert {r.resource_id for r in catalog.list_resources(staff_actor)} == {
        "RM-CS-01",
        "RM-STAFF",
        "RM-PGR-STAFF",
    }

    # Admin, Manager, Student Services see all 6 resources unfiltered
    for privileged in (ADMIN, MANAGER, STUDENT_SERVICES):
        assert len(catalog.list_resources(privileged, ResourceFilter(limit=100))) == 6


def test_direct_booking_bypass_against_ineligible_resources_returns_forbidden(
    minimal_db: DatabaseManager,
) -> None:
    catalog, bookings, _ = _setup_world(minimal_db)

    pg_actor = ActorContext(
        role=Role.MEMBER,
        user_id="S1001",
        user_type=UserType.PG_STUDENT,
        has_accessibility_access=False,
    )
    # Direct bypass on disability_only -> ForbiddenError (403)
    with pytest.raises(ForbiddenError):
        bookings.create_booking(
            pg_actor,
            BookingCreate(resource_id="RM-DISABILITY", start_time=BASE_TS, end_time=BASE_TS + HOUR),
        )
    # Direct bypass on staff_only -> ForbiddenError (403)
    with pytest.raises(ForbiddenError):
        bookings.create_booking(
            pg_actor,
            BookingCreate(resource_id="RM-STAFF", start_time=BASE_TS, end_time=BASE_TS + HOUR),
        )
    # Direct get_resource bypass -> ForbiddenError (403)
    with pytest.raises(ForbiddenError):
        catalog.get_resource(pg_actor, "RM-DISABILITY")

    # Accessible student CAN book RM-DISABILITY
    acc_actor = ActorContext(
        role=Role.MEMBER,
        user_id="ACC1",
        user_type=UserType.PG_STUDENT,
        has_accessibility_access=True,
    )
    created = bookings.create_booking(
        acc_actor,
        BookingCreate(resource_id="RM-DISABILITY", start_time=BASE_TS, end_time=BASE_TS + HOUR),
    )
    assert created.resource_id == "RM-DISABILITY"


def test_member_ownership_isolation_and_four_role_rbac_matrix(minimal_db: DatabaseManager) -> None:
    catalog, bookings, _ = _setup_world(minimal_db)

    alice = ActorContext(role=Role.MEMBER, user_id="S1001", user_type=UserType.PG_STUDENT)
    ug = ActorContext(role=Role.MEMBER, user_id="UG1", user_type=UserType.UG_STUDENT)

    alice_booking = bookings.create_booking(
        alice,
        BookingCreate(
            resource_id="RM-CS-01",
            start_time=BASE_TS,
            end_time=BASE_TS + HOUR,
            purpose="Dissertation notes",
        ),
    )

    # UG cannot book on Alice's behalf
    with pytest.raises(ForbiddenError):
        bookings.create_booking(
            ug,
            BookingCreate(
                user_id="S1001",
                resource_id="RM-STUDENTS",
                start_time=BASE_TS + 2 * HOUR,
                end_time=BASE_TS + 3 * HOUR,
            ),
        )

    # UG cannot view, update, or cancel Alice's booking
    with pytest.raises(ForbiddenError):
        bookings.get_booking(ug, alice_booking.booking_id)
    with pytest.raises(ForbiddenError):
        bookings.update_booking(ug, alice_booking.booking_id, BookingUpdate(purpose="Hijack"))
    with pytest.raises(ForbiddenError):
        bookings.cancel_booking(ug, alice_booking.booking_id)

    # Member cannot list another user's bookings or perform manager/admin actions
    assert bookings.list_bookings(ug) == []
    with pytest.raises(ForbiddenError):
        bookings.list_bookings(ug, BookingFilter(user_id="S1001"))
    with pytest.raises(ForbiddenError):
        catalog.create_department(
            alice, DepartmentCreate(department_id="NEW", department_name="New", faculty="Arts")
        )
    with pytest.raises(ForbiddenError):
        bookings.soft_delete_booking(alice, alice_booking.booking_id)

    # Manager CAN manage resources & approve/cancel bookings, CANNOT create departments/buildings/users or soft-delete bookings
    with pytest.raises(ForbiddenError):
        catalog.create_department(
            MANAGER, DepartmentCreate(department_id="NEW", department_name="New", faculty="Arts")
        )
    with pytest.raises(ForbiddenError):
        catalog.create_building(
            MANAGER,
            BuildingCreate(
                building_id="B-NEW",
                building_name="New Bldg",
                zone=CampusZone.MAIN_SITE,
            ),
        )
    with pytest.raises(ForbiddenError):
        catalog.deactivate_user(MANAGER, "UG1")
    with pytest.raises(ForbiddenError):
        bookings.soft_delete_booking(MANAGER, alice_booking.booking_id)

    # Student Services is strictly read-only (cannot create/modify/cancel/delete bookings or catalogue)
    with pytest.raises(ForbiddenError):
        bookings.create_booking(
            STUDENT_SERVICES,
            BookingCreate(
                user_id="S1001",
                resource_id="RM-CS-01",
                start_time=BASE_TS + 4 * HOUR,
                end_time=BASE_TS + 5 * HOUR,
            ),
        )
    with pytest.raises(ForbiddenError):
        bookings.cancel_booking(STUDENT_SERVICES, alice_booking.booking_id)
    with pytest.raises(ForbiddenError):
        catalog.list_users(STUDENT_SERVICES)


def test_student_services_privacy_redaction_and_deterministic_pseudonymisation(
    minimal_db: DatabaseManager,
) -> None:
    _, bookings, policy = _setup_world(minimal_db)
    alice = ActorContext(role=Role.MEMBER, user_id="S1001", user_type=UserType.PG_STUDENT)

    b1 = bookings.create_booking(
        alice,
        BookingCreate(
            resource_id="RM-CS-01",
            start_time=BASE_TS,
            end_time=BASE_TS + HOUR,
            purpose="Private counselling prep",
            notes="Sensitive student note",
        ),
    )
    b2 = bookings.create_booking(
        alice,
        BookingCreate(
            resource_id="RM-CS-01",
            start_time=BASE_TS + 2 * HOUR,
            end_time=BASE_TS + 3 * HOUR,
            purpose=None,
            notes=None,
        ),
    )

    # Admin sees full unredacted fields
    admin_view = bookings.get_booking(ADMIN, b1.booking_id)
    assert admin_view.user_id == "S1001"
    assert admin_view.user_name == "Alice Patel"
    assert admin_view.purpose == "Private counselling prep"
    assert admin_view.notes == "Sensitive student note"

    # Student Services receives deterministic SHA-256 ANON-<10hex>, null name, redacted purpose/notes
    ss_view_1 = bookings.get_booking(STUDENT_SERVICES, b1.booking_id)
    ss_view_2 = bookings.get_booking(STUDENT_SERVICES, b2.booking_id)
    expected_anon = policy.pseudonymise_user_id("S1001")

    assert expected_anon.startswith("ANON-")
    assert len(expected_anon) == len("ANON-") + 10
    assert ss_view_1.user_id == expected_anon
    assert ss_view_2.user_id == expected_anon  # Deterministic across bookings
    assert ss_view_1.user_id != "S1001"
    assert ss_view_1.user_name is None
    assert ss_view_1.purpose == "[REDACTED]"
    assert ss_view_1.notes == "[REDACTED]"
    assert ss_view_1.course == "MSc Applied AI"

    # Null purpose/notes stay None rather than fabricating redacted strings
    assert ss_view_2.purpose is None
    assert ss_view_2.notes is None

    # List endpoint also projects redaction for student_services
    ss_list = bookings.list_bookings(STUDENT_SERVICES)
    assert len(ss_list) == 2
    assert all(item.user_id == expected_anon and item.user_name is None for item in ss_list)
