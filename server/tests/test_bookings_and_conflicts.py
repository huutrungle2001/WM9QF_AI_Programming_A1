"""Phase 2 TDD suite: Booking creation, 2-way conflict engine, concurrency, lifecycle, soft delete, CSV import."""

from __future__ import annotations

import pytest

from app.config import BookingPolicyConfig
from app.database import DatabaseManager
from app.domain.enums import (
    BookingEligibility,
    BookingStatusId,
    ResourceStatus,
    ResourceType,
    Role,
    RoomStyle,
    UserType,
)
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.repositories.booking_repo import BookingRepository
from app.repositories.reference_repo import ReferenceRepository
from app.repositories.resource_repo import ResourceRepository
from app.repositories.user_repo import UserRepository
from app.schemas.actor import ActorContext
from app.schemas.booking import BookingCreate, BookingFilter, BookingUpdate
from app.schemas.resource import (
    AvailabilityQuery,
    EquipmentDetails,
    ResourceCreate,
    ResourceUpdate,
    RoomDetails,
    SupportDetails,
)
from app.schemas.user import UserCreate
from app.services.booking_service import BookingService
from app.services.catalog_service import CatalogService
from app.services.policy import PolicyGuard

# Base deterministic timestamp: 2026-11-30 09:00:00 UTC
BASE_TS = 1796029200
HOUR = 3600

ADMIN = ActorContext(role=Role.ADMIN, user_id="ADMIN1", user_type=UserType.STAFF)
MANAGER = ActorContext(role=Role.MANAGER, user_id="MGR1", user_type=UserType.STAFF)
ALICE = ActorContext(role=Role.MEMBER, user_id="S1001", user_type=UserType.PG_STUDENT)


def _setup_services(db: DatabaseManager) -> tuple[CatalogService, BookingService]:
    ref_repo = ReferenceRepository(db)
    user_repo = UserRepository(db)
    res_repo = ResourceRepository(db)
    booking_repo = BookingRepository(db)
    policy = PolicyGuard(pseudonym_salt="test-salt")
    config = BookingPolicyConfig()
    catalog = CatalogService(ref_repo, user_repo, res_repo, booking_repo, policy)
    bookings = BookingService(db, booking_repo, res_repo, user_repo, policy, config)
    return catalog, bookings


def _seed_extra_users_and_resources(catalog: CatalogService) -> None:
    for uid, name, email in [
        ("S1002", "Bob Smith", "bob@warwick.ac.uk"),
        ("S1003", "Cara Jones", "cara@warwick.ac.uk"),
        ("S1004", "Dan Lee", "dan@warwick.ac.uk"),
    ]:
        catalog.create_user(
            ADMIN,
            UserCreate(
                user_id=uid,
                full_name=name,
                email=email,
                user_type=UserType.PG_STUDENT,
                role=Role.MEMBER,
                course="MSc Applied AI",
                department_id="CS",
            ),
        )

    catalog.create_resource(
        ADMIN,
        ResourceCreate(
            resource_id="RM-CS-02",
            resource_name="CS Seminar Room 2",
            resource_type=ResourceType.GROUP_SPACE,
            department_id="CS",
            building_id="MM-CS",
            location="CS0.02",
            requires_approval=False,
            booking_eligibility=BookingEligibility.ALL_USERS,
            details=RoomDetails(capacity=6, room_style=RoomStyle.SEMINAR),
        ),
    )
    catalog.create_resource(
        ADMIN,
        ResourceCreate(
            resource_id="EQ-POOL-2",
            resource_name="Portable Oscilloscope",
            resource_type=ResourceType.SPECIALIST_EQUIPMENT,
            department_id="CS",
            building_id="MM-CS",
            location="CS Lab Counter",
            requires_approval=True,
            booking_eligibility=BookingEligibility.ALL_USERS,
            details=EquipmentDetails(category="lab_hardware", quantity=2),
        ),
    )
    catalog.create_resource(
        ADMIN,
        ResourceCreate(
            resource_id="SUP-WS-2",
            resource_name="Python Debugging Clinic",
            resource_type=ResourceType.ACADEMIC_SUPPORT,
            department_id="CS",
            building_id=None,
            location="Online (MS Teams)",
            requires_approval=False,
            booking_eligibility=BookingEligibility.ALL_USERS,
            details=SupportDetails(category="study_skills", max_attendees=2, host_name="CS Tutors"),
        ),
    )


def test_exclusive_room_overlap_blocked_and_adjacent_slots_allowed(minimal_db: DatabaseManager) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)

    b1 = bookings.create_booking(
        ALICE,
        BookingCreate(
            resource_id="RM-CS-01",
            start_time=BASE_TS,
            end_time=BASE_TS + 2 * HOUR,
            purpose="Sprint planning",
            group_size=4,
        ),
    )
    assert b1.status_id == BookingStatusId.CONFIRMED.value

    # Overlapping booking by another user on the same exclusive room -> ConflictError
    bob = ActorContext(role=Role.MEMBER, user_id="S1002", user_type=UserType.PG_STUDENT)
    with pytest.raises(ConflictError):
        bookings.create_booking(
            bob,
            BookingCreate(
                resource_id="RM-CS-01",
                start_time=BASE_TS + HOUR,
                end_time=BASE_TS + 3 * HOUR,
            ),
        )

    # Adjacent back-to-back slot (existing.end_time == new.start_time) is permitted!
    b2 = bookings.create_booking(
        bob,
        BookingCreate(
            resource_id="RM-CS-01",
            start_time=BASE_TS + 2 * HOUR,
            end_time=BASE_TS + 4 * HOUR,
        ),
    )
    assert b2.status_id == BookingStatusId.CONFIRMED.value

    # Same user can also book adjacent slot right after their own slot
    b3 = bookings.create_booking(
        ALICE,
        BookingCreate(
            resource_id="RM-CS-02",
            start_time=BASE_TS + 2 * HOUR,
            end_time=BASE_TS + 3 * HOUR,
        ),
    )
    assert b3.booking_id != b1.booking_id


def test_pooled_equipment_and_support_workshop_concurrency_and_availability(
    minimal_db: DatabaseManager,
) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)

    bob = ActorContext(role=Role.MEMBER, user_id="S1002", user_type=UserType.PG_STUDENT)
    cara = ActorContext(role=Role.MEMBER, user_id="S1003", user_type=UserType.PG_STUDENT)

    # Equipment quantity=2: 1st and 2nd overlapping bookings succeed (pending for member since requires_approval=1)
    e1 = bookings.create_booking(
        ALICE,
        BookingCreate(resource_id="EQ-POOL-2", start_time=BASE_TS, end_time=BASE_TS + 24 * HOUR),
    )
    assert e1.status_id == BookingStatusId.PENDING.value

    # Availability shows 1 remaining slot for EQ-POOL-2
    avail = catalog.check_availability(
        ADMIN,
        AvailabilityQuery(
            start_time=BASE_TS,
            end_time=BASE_TS + HOUR,
            resource_type=ResourceType.SPECIALIST_EQUIPMENT,
        ),
    )
    assert len(avail) == 1
    assert avail[0].resource.resource_id == "EQ-POOL-2"
    assert avail[0].max_concurrent_bookings == 2
    assert avail[0].active_bookings == 1
    assert avail[0].remaining_slots == 1

    e2 = bookings.create_booking(
        bob,
        BookingCreate(resource_id="EQ-POOL-2", start_time=BASE_TS, end_time=BASE_TS + 24 * HOUR),
    )
    assert e2.status_id == BookingStatusId.PENDING.value

    # Availability now returns empty for EQ-POOL-2 (0 remaining slots)
    avail_full = catalog.check_availability(
        ADMIN,
        AvailabilityQuery(
            start_time=BASE_TS,
            end_time=BASE_TS + HOUR,
            resource_type=ResourceType.SPECIALIST_EQUIPMENT,
        ),
    )
    assert avail_full == []

    # 3rd overlapping booking fails with ConflictError
    with pytest.raises(ConflictError):
        bookings.create_booking(
            cara,
            BookingCreate(resource_id="EQ-POOL-2", start_time=BASE_TS, end_time=BASE_TS + 2 * HOUR),
        )

    # Support workshop max_attendees=2: allows 2 concurrent, rejects 3rd
    ws_start = BASE_TS + 48 * HOUR
    ws_end = ws_start + HOUR
    bookings.create_booking(ALICE, BookingCreate(resource_id="SUP-WS-2", start_time=ws_start, end_time=ws_end))
    bookings.create_booking(bob, BookingCreate(resource_id="SUP-WS-2", start_time=ws_start, end_time=ws_end))
    with pytest.raises(ConflictError):
        bookings.create_booking(cara, BookingCreate(resource_id="SUP-WS-2", start_time=ws_start, end_time=ws_end))


def test_user_double_booking_across_two_rooms_blocked(minimal_db: DatabaseManager) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)

    bookings.create_booking(
        ALICE,
        BookingCreate(resource_id="RM-CS-01", start_time=BASE_TS, end_time=BASE_TS + 2 * HOUR),
    )
    with pytest.raises(ConflictError, match="overlapping booking"):
        bookings.create_booking(
            ALICE,
            BookingCreate(
                resource_id="RM-CS-02",
                start_time=BASE_TS + HOUR,
                end_time=BASE_TS + 3 * HOUR,
            ),
        )


def test_lifecycle_transitions_slot_release_and_terminal_immutability(
    minimal_db: DatabaseManager,
) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)
    bob = ActorContext(role=Role.MEMBER, user_id="S1002", user_type=UserType.PG_STUDENT)

    # Make RM-CS-01 require approval to test pending -> rejected -> slot immediately reusable
    catalog.update_resource(ADMIN, "RM-CS-01", ResourceUpdate(requires_approval=True))

    pending = bookings.create_booking(
        ALICE,
        BookingCreate(resource_id="RM-CS-01", start_time=BASE_TS, end_time=BASE_TS + HOUR),
    )
    assert pending.status_id == BookingStatusId.PENDING.value

    # Reject with manager notes releases slot and separates refusal from cancellation
    rejected = bookings.reject_booking(MANAGER, pending.booking_id, notes="Room needed for exam")
    assert rejected.status_id == BookingStatusId.REJECTED.value
    assert rejected.notes == "Room needed for exam"

    # Terminal state cannot transition further
    with pytest.raises(ValidationError):
        bookings.approve_booking(MANAGER, pending.booking_id)
    with pytest.raises(ValidationError):
        bookings.cancel_booking(ALICE, pending.booking_id)

    # Slot is immediately reusable by Bob
    pending_bob = bookings.create_booking(
        bob,
        BookingCreate(resource_id="RM-CS-01", start_time=BASE_TS, end_time=BASE_TS + HOUR),
    )
    confirmed_bob = bookings.approve_booking(MANAGER, pending_bob.booking_id, notes="Approved")
    assert confirmed_bob.status_id == BookingStatusId.CONFIRMED.value

    # Cancelling a confirmed booking releases slot immediately
    cancelled_bob = bookings.cancel_booking(bob, confirmed_bob.booking_id)
    assert cancelled_bob.status_id == BookingStatusId.CANCELLED.value
    with pytest.raises(ValidationError):
        bookings.complete_booking(MANAGER, cancelled_bob.booking_id)

    # Re-book same slot as Admin (auto-confirmed even when requires_approval=True) -> complete
    rebooked = bookings.create_booking(
        ADMIN,
        BookingCreate(
            user_id="S1001",
            resource_id="RM-CS-01",
            start_time=BASE_TS,
            end_time=BASE_TS + HOUR,
        ),
    )
    assert rebooked.status_id == BookingStatusId.CONFIRMED.value
    completed = bookings.complete_booking(MANAGER, rebooked.booking_id)
    assert completed.status_id == BookingStatusId.COMPLETED.value
    with pytest.raises(ValidationError):
        bookings.mark_no_show(MANAGER, completed.booking_id)

    # Test confirmed -> no_show
    later = bookings.create_booking(
        ADMIN,
        BookingCreate(
            user_id="S1001",
            resource_id="RM-CS-01",
            start_time=BASE_TS + 2 * HOUR,
            end_time=BASE_TS + 3 * HOUR,
        ),
    )
    no_show = bookings.mark_no_show(MANAGER, later.booking_id)
    assert no_show.status_id == BookingStatusId.NO_SHOW.value


def test_reschedule_excludes_self_and_validates_conflicts_and_limits(
    minimal_db: DatabaseManager,
) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)
    bob = ActorContext(role=Role.MEMBER, user_id="S1002", user_type=UserType.PG_STUDENT)

    b1 = bookings.create_booking(
        ALICE,
        BookingCreate(resource_id="RM-CS-01", start_time=BASE_TS, end_time=BASE_TS + 2 * HOUR),
    )
    bookings.create_booking(
        bob,
        BookingCreate(
            resource_id="RM-CS-01",
            start_time=BASE_TS + 3 * HOUR,
            end_time=BASE_TS + 5 * HOUR,
        ),
    )

    # Shifting own booking by +1h overlaps its own previous window but NOT Bob -> succeeds
    shifted = bookings.update_booking(
        ALICE,
        b1.booking_id,
        BookingUpdate(
            start_time=BASE_TS + HOUR,
            end_time=BASE_TS + 3 * HOUR,
            purpose="Shifted meeting",
        ),
    )
    assert shifted.start_time == BASE_TS + HOUR
    assert shifted.end_time == BASE_TS + 3 * HOUR
    assert shifted.purpose == "Shifted meeting"

    # Shifting into Bob's slot -> ConflictError
    with pytest.raises(ConflictError):
        bookings.update_booking(
            ALICE,
            b1.booking_id,
            BookingUpdate(start_time=BASE_TS + 2 * HOUR, end_time=BASE_TS + 4 * HOUR),
        )

    # Exceeding room max duration (5h > 4h default) -> ValidationError
    with pytest.raises(ValidationError):
        bookings.update_booking(
            ALICE,
            b1.booking_id,
            BookingUpdate(start_time=BASE_TS + 10 * HOUR, end_time=BASE_TS + 15 * HOUR),
        )

    # Rescheduling into user's own other booking on a different room -> ConflictError
    alice_other = bookings.create_booking(
        ALICE,
        BookingCreate(
            resource_id="RM-CS-02",
            start_time=BASE_TS + 6 * HOUR,
            end_time=BASE_TS + 7 * HOUR,
        ),
    )
    with pytest.raises(ConflictError, match="overlapping booking"):
        bookings.update_booking(
            ALICE,
            b1.booking_id,
            BookingUpdate(start_time=BASE_TS + 6 * HOUR, end_time=BASE_TS + 7 * HOUR),
        )

    # Cannot update a booking once cancelled (terminal state)
    bookings.cancel_booking(ALICE, alice_other.booking_id)
    with pytest.raises(ValidationError):
        bookings.update_booking(ALICE, alice_other.booking_id, BookingUpdate(purpose="Late edit"))


def test_soft_delete_excludes_from_queries_and_conflict_checks(minimal_db: DatabaseManager) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)

    created = bookings.create_booking(
        ALICE,
        BookingCreate(resource_id="RM-CS-01", start_time=BASE_TS, end_time=BASE_TS + HOUR),
    )
    bookings.soft_delete_booking(ADMIN, created.booking_id)

    # Excluded from get_booking and list_bookings
    with pytest.raises(NotFoundError):
        bookings.get_booking(ADMIN, created.booking_id)
    assert bookings.list_bookings(ADMIN, BookingFilter(resource_id="RM-CS-01")) == []

    # Row still exists physically in DB with non-null deleted_at
    with minimal_db.transaction() as conn:
        row = conn.execute(
            "SELECT deleted_at FROM bookings WHERE booking_id = ?", (created.booking_id,)
        ).fetchone()
    assert row is not None
    assert row["deleted_at"] is not None

    # Same slot can now be booked without conflict
    replacement = bookings.create_booking(
        ALICE,
        BookingCreate(resource_id="RM-CS-01", start_time=BASE_TS, end_time=BASE_TS + HOUR),
    )
    assert replacement.booking_id != created.booking_id


def test_inactive_resource_or_user_cannot_be_booked(minimal_db: DatabaseManager) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)

    catalog.update_resource(ADMIN, "RM-CS-02", ResourceUpdate(status=ResourceStatus.MAINTENANCE))
    # Maintenance resource is excluded from availability results
    avail_ids = {
        slot.resource.resource_id
        for slot in catalog.check_availability(
            ADMIN, AvailabilityQuery(start_time=BASE_TS, end_time=BASE_TS + HOUR)
        )
    }
    assert "RM-CS-02" not in avail_ids
    assert "RM-CS-01" in avail_ids

    with pytest.raises(ValidationError):
        bookings.create_booking(
            ALICE,
            BookingCreate(resource_id="RM-CS-02", start_time=BASE_TS, end_time=BASE_TS + HOUR),
        )

    catalog.deactivate_user(ADMIN, "S1002")
    with pytest.raises(ValidationError):
        bookings.create_booking(
            ADMIN,
            BookingCreate(
                user_id="S1002",
                resource_id="RM-CS-01",
                start_time=BASE_TS,
                end_time=BASE_TS + HOUR,
            ),
        )


def test_csv_batch_import_reports_line_numbered_validation_and_clash_errors(
    minimal_db: DatabaseManager,
) -> None:
    catalog, bookings = _setup_services(minimal_db)
    _seed_extra_users_and_resources(catalog)

    csv_text = "\n".join(
        [
            "user_id,resource_id,start_time,end_time,purpose,notes,group_size",
            f"S1001,RM-CS-01,{BASE_TS},{BASE_TS + HOUR},Valid row 1,,2",
            f"S1002,RM-CS-01,{BASE_TS},{BASE_TS + HOUR},Clashes with line 2,,2",
            f"S1003,RM-CS-01,{BASE_TS + 2 * HOUR},{BASE_TS + HOUR},Invalid window end<start,,1",
            f"S1003,RM-CS-01,{BASE_TS + 2 * HOUR},{BASE_TS + 3 * HOUR},Group too large,,99",
            f"S1002,RM-CS-02,{BASE_TS + HOUR},{BASE_TS + 2 * HOUR},Valid row 2,Bring laptop,3",
        ]
    )

    summary = bookings.import_bookings_csv(MANAGER, csv_text)
    assert summary.total_rows == 5
    assert summary.imported_count == 2
    assert summary.failed_count == 3
    assert len(summary.created_booking_ids) == 2

    error_lines = [err.line_number for err in summary.errors]
    assert error_lines == [3, 4, 5]
    assert "no available slots" in summary.errors[0].error.lower() or "conflict" in summary.errors[0].error.lower()
