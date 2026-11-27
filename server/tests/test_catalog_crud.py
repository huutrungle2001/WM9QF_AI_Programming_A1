"""Phase 2 TDD suite: Catalogue CRUD, CTI atomicity, N:M facilities, soft delete, and SQLi probes."""

from __future__ import annotations

import pytest

from app.database import DatabaseManager
from app.domain.enums import (
    BookingEligibility,
    CampusZone,
    CheckinMethod,
    ResourceStatus,
    ResourceType,
    Role,
    RoomStyle,
    UserType,
)
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.resources import AcademicSupportResource, EquipmentResource, RoomResource
from app.repositories.booking_repo import BookingRepository
from app.repositories.reference_repo import ReferenceRepository
from app.repositories.resource_repo import ResourceRepository
from app.repositories.user_repo import UserRepository
from app.schemas.actor import ActorContext
from app.schemas.reference import (
    BuildingCreate,
    BuildingUpdate,
    DepartmentCreate,
    DepartmentUpdate,
    FacilityCreate,
)
from app.schemas.resource import (
    EquipmentDetails,
    ResourceCreate,
    ResourceFilter,
    ResourceUpdate,
    RoomDetails,
    SupportDetails,
)
from app.schemas.user import UserCreate, UserUpdate
from app.services.catalog_service import CatalogService
from app.services.policy import PolicyGuard


def _make_catalog_service(db: DatabaseManager) -> tuple[CatalogService, ResourceRepository, UserRepository]:
    ref_repo = ReferenceRepository(db)
    user_repo = UserRepository(db)
    res_repo = ResourceRepository(db)
    booking_repo = BookingRepository(db)
    policy = PolicyGuard(pseudonym_salt="test-salt")
    svc = CatalogService(ref_repo, user_repo, res_repo, booking_repo, policy)
    return svc, res_repo, user_repo


ADMIN = ActorContext(role=Role.ADMIN, user_id="ADMIN1", user_type=UserType.STAFF)


def test_departments_buildings_facilities_and_statuses_crud(minimal_db: DatabaseManager) -> None:
    svc, _, _ = _make_catalog_service(minimal_db)

    # Department create, get, update, list, duplicate conflict
    dept = svc.create_department(
        ADMIN,
        DepartmentCreate(
            department_id="WMG",
            department_name="Warwick Manufacturing Group",
            faculty="Sci., Eng. and Med.",
        ),
    )
    assert dept.department_id == "WMG"
    assert svc.get_department(ADMIN, "WMG").department_name == "Warwick Manufacturing Group"

    updated_dept = svc.update_department(
        ADMIN,
        "WMG",
        DepartmentUpdate(department_name="WMG Engineering"),
    )
    assert updated_dept.department_name == "WMG Engineering"
    assert updated_dept.faculty == "Sci., Eng. and Med."
    assert len(svc.list_departments(ADMIN)) == 2

    with pytest.raises(ConflictError):
        svc.create_department(
            ADMIN,
            DepartmentCreate(
                department_id="WMG",
                department_name="Duplicate WMG",
                faculty="Sci., Eng. and Med.",
            ),
        )

    # Building create, get, update, filter by zone
    bldg = svc.create_building(
        ADMIN,
        BuildingCreate(
            building_id="MM-IMC",
            building_name="International Manufacturing Centre",
            zone=CampusZone.INNOVATION_CAMPUS,
            lat=52.3821,
            lon=-1.5612,
            floor_count=4,
        ),
    )
    assert bldg.zone == CampusZone.INNOVATION_CAMPUS
    updated_bldg = svc.update_building(ADMIN, "MM-IMC", BuildingUpdate(floor_count=5))
    assert updated_bldg.floor_count == 5
    assert len(svc.list_buildings(ADMIN, zone=CampusZone.INNOVATION_CAMPUS)) == 1
    assert len(svc.list_buildings(ADMIN, zone=CampusZone.MAIN_SITE)) == 1

    # Facility create & duplicate conflict
    fac = svc.create_facility(
        ADMIN,
        FacilityCreate(facility_id="WHITEBOARD", facility_name="Whiteboard"),
    )
    assert fac.facility_id == "WHITEBOARD"
    assert len(svc.list_facilities(ADMIN)) == 1
    with pytest.raises(ConflictError):
        svc.create_facility(
            ADMIN,
            FacilityCreate(facility_id="WB-2", facility_name="Whiteboard"),
        )

    # Booking statuses lookup
    statuses = svc.list_booking_statuses(ADMIN)
    status_map = {s.status_id: s.blocks_slot for s in statuses}
    assert status_map["pending"] is True
    assert status_map["confirmed"] is True
    assert status_map["cancelled"] is False
    assert status_map["rejected"] is False
    assert status_map["completed"] is False
    assert status_map["no_show"] is False


def test_user_crud_and_soft_deactivate(minimal_db: DatabaseManager) -> None:
    svc, _, user_repo = _make_catalog_service(minimal_db)

    created = svc.create_user(
        ADMIN,
        UserCreate(
            user_id="S2001",
            full_name="Ben Carter",
            email="ben.carter@warwick.ac.uk",
            user_type=UserType.UG_STUDENT,
            role=Role.MEMBER,
            course="BSc Computer Science",
            department_id="CS",
            has_accessibility_access=False,
        ),
    )
    assert created.is_active is True
    assert created.user_type == UserType.UG_STUDENT

    # Duplicate email raises ConflictError
    with pytest.raises(ConflictError):
        svc.create_user(
            ADMIN,
            UserCreate(
                user_id="S2002",
                full_name="Other User",
                email="ben.carter@warwick.ac.uk",
                user_type=UserType.UG_STUDENT,
                department_id="CS",
            ),
        )

    # Invalid department FK raises ValidationError
    with pytest.raises(ValidationError):
        svc.create_user(
            ADMIN,
            UserCreate(
                user_id="S2003",
                full_name="Ghost Dept",
                email="ghost@warwick.ac.uk",
                user_type=UserType.UG_STUDENT,
                department_id="NO-SUCH-DEPT",
            ),
        )

    # Update user
    updated = svc.update_user(
        ADMIN,
        "S2001",
        UserUpdate(has_accessibility_access=True, course="MEng Computer Science"),
    )
    assert updated.has_accessibility_access is True
    assert updated.course == "MEng Computer Science"

    # Soft deactivate preserves row with is_active = 0 (zero hard delete)
    deactivated = svc.deactivate_user(ADMIN, "S2001")
    assert deactivated.is_active is False
    persisted = user_repo.get_by_id("S2001")
    assert persisted is not None
    assert persisted.is_active is False

    # Filter active vs inactive users
    active_users = svc.list_users(ADMIN, is_active=True)
    assert all(u.user_id != "S2001" for u in active_users)
    inactive_users = svc.list_users(ADMIN, is_active=False)
    assert [u.user_id for u in inactive_users] == ["S2001"]


def test_resource_cti_crud_all_three_subtypes_and_facilities_filtering(
    minimal_db: DatabaseManager,
) -> None:
    svc, res_repo, _ = _make_catalog_service(minimal_db)

    # 1. Room (computer_lab) with auto-created facilities
    lab = svc.create_resource(
        ADMIN,
        ResourceCreate(
            resource_id="LAB-CS-101",
            resource_name="CS Linux Lab",
            resource_type=ResourceType.COMPUTER_LAB,
            department_id="CS",
            building_id="MM-CS",
            location="CS1.01",
            description="Dual-boot Ubuntu and Windows workstations",
            requires_approval=False,
            booking_eligibility=BookingEligibility.STUDENTS_ONLY,
            checkin_method=CheckinMethod.CARD_SWIPE,
            facilities=["Linux Workstations", "Whiteboard", "Projector"],
            details=RoomDetails(capacity=30, room_style=RoomStyle.SEMINAR),
        ),
    )
    assert lab.department_name == "Computer Science"
    assert lab.building_name == "Computer Science Building"
    assert lab.zone == CampusZone.MAIN_SITE
    assert lab.max_concurrent_bookings == 1
    assert set(lab.facilities) == {"Linux Workstations", "Whiteboard", "Projector"}
    assert isinstance(res_repo.get_domain_resource("LAB-CS-101"), RoomResource)

    # 2. Specialist equipment
    kit = svc.create_resource(
        ADMIN,
        ResourceCreate(
            resource_id="EQ-VR-01",
            resource_name="VR Spatial Kit",
            resource_type=ResourceType.SPECIALIST_EQUIPMENT,
            department_id="CS",
            building_id="MM-CS",
            location="CS Reception Counter",
            requires_approval=True,
            booking_eligibility=BookingEligibility.ALL_USERS,
            facilities=["VR Headset", "Motion Controllers"],
            details=EquipmentDetails(
                category="vr_xr",
                quantity=4,
                specifications="Meta Quest Pro + tether cable",
            ),
        ),
    )
    assert kit.max_concurrent_bookings == 4
    assert isinstance(res_repo.get_domain_resource("EQ-VR-01"), EquipmentResource)

    # 3. Academic support (online, building_id=None)
    support = svc.create_resource(
        ADMIN,
        ResourceCreate(
            resource_id="SUP-WRITE-01",
            resource_name="Academic Writing Workshop",
            resource_type=ResourceType.ACADEMIC_SUPPORT,
            department_id="CS",
            building_id=None,
            location="Online (MS Teams)",
            requires_approval=False,
            booking_eligibility=BookingEligibility.PG_ONLY,
            facilities=["MS Teams Consultation"],
            details=SupportDetails(
                category="writing",
                max_attendees=12,
                host_name="Dr. Sarah Chen",
            ),
        ),
    )
    assert support.building_id is None
    assert support.max_concurrent_bookings == 12
    assert isinstance(res_repo.get_domain_resource("SUP-WRITE-01"), AcademicSupportResource)

    # Filter by facility name and by auto-generated facility_id
    by_name = svc.list_resources(ADMIN, ResourceFilter(facility="Linux Workstations"))
    assert [r.resource_id for r in by_name] == ["LAB-CS-101"]
    by_slug = svc.list_resources(ADMIN, ResourceFilter(facility="LINUX-WORKSTATIONS"))
    assert [r.resource_id for r in by_slug] == ["LAB-CS-101"]

    # Filter by min_capacity (only rooms meeting threshold)
    big_rooms = svc.list_resources(ADMIN, ResourceFilter(min_capacity=20))
    assert [r.resource_id for r in big_rooms] == ["LAB-CS-101"]

    # Update resource subtype details & replace facilities atomically
    updated_kit = svc.update_resource(
        ADMIN,
        "EQ-VR-01",
        ResourceUpdate(
            status=ResourceStatus.MAINTENANCE,
            facilities=["VR Headset", "USB-C Cable"],
            details={"quantity": 6},
        ),
    )
    assert updated_kit.status == ResourceStatus.MAINTENANCE
    assert updated_kit.max_concurrent_bookings == 6
    assert set(updated_kit.facilities) == {"VR Headset", "USB-C Cable"}

    # Soft retire preserves row with status='retired'
    retired = svc.retire_resource(ADMIN, "LAB-CS-101")
    assert retired.status == ResourceStatus.RETIRED
    assert svc.get_resource(ADMIN, "LAB-CS-101").status == ResourceStatus.RETIRED
    active_only = svc.list_resources(ADMIN, ResourceFilter(status=ResourceStatus.ACTIVE))
    assert all(r.resource_id != "LAB-CS-101" for r in active_only)


def test_resource_cti_create_rolls_back_atomically_on_subtype_failure(
    minimal_db: DatabaseManager,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    svc, res_repo, _ = _make_catalog_service(minimal_db)

    def _boom(conn, resource):  # type: ignore[no-untyped-def]
        raise RuntimeError("Simulated CTI subtype write failure")

    monkeypatch.setattr(res_repo, "_insert_subtype", _boom)

    with pytest.raises(RuntimeError, match="Simulated CTI subtype write failure"):
        svc.create_resource(
            ADMIN,
            ResourceCreate(
                resource_id="RM-ORPHAN-TEST",
                resource_name="Should Rollback",
                resource_type=ResourceType.STUDY_ROOM,
                department_id="CS",
                building_id="MM-CS",
                location="CS9.99",
                facilities=["Whiteboard"],
                details=RoomDetails(capacity=4, room_style=RoomStyle.STUDY_POD),
            ),
        )

    # Verify zero orphan rows exist in resources, rooms, or resource_facilities
    assert res_repo.get_by_id("RM-ORPHAN-TEST") is None
    with minimal_db.transaction() as conn:
        parent_cnt = conn.execute(
            "SELECT COUNT(*) FROM resources WHERE resource_id = ?", ("RM-ORPHAN-TEST",)
        ).fetchone()[0]
        fac_cnt = conn.execute(
            "SELECT COUNT(*) FROM resource_facilities WHERE resource_id = ?", ("RM-ORPHAN-TEST",)
        ).fetchone()[0]
    assert parent_cnt == 0
    assert fac_cnt == 0


def test_resource_cti_update_rolls_back_atomically_on_subtype_failure(
    minimal_db: DatabaseManager,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    svc, res_repo, _ = _make_catalog_service(minimal_db)

    def _boom(conn, resource):  # type: ignore[no-untyped-def]
        raise RuntimeError("Simulated CTI subtype update failure")

    monkeypatch.setattr(res_repo, "_update_subtype", _boom)

    with pytest.raises(RuntimeError, match="Simulated CTI subtype update failure"):
        svc.update_resource(
            ADMIN,
            "RM-CS-01",
            ResourceUpdate(
                resource_name="Should Not Persist",
                details={"capacity": 20},
            ),
        )

    # Parent row must remain untouched after rollback
    persisted = svc.get_resource(ADMIN, "RM-CS-01")
    assert persisted.resource_name == "CS Seminar Room 1"
    assert persisted.details.capacity == 8  # type: ignore[union-attr]


@pytest.mark.parametrize(
    "payload",
    [
        "' OR 1=1 --",
        "'; DROP TABLE bookings; --",
        "\" UNION SELECT user_id FROM users --",
        "%'; DELETE FROM resources; --",
    ],
)
def test_sql_injection_probes_are_harmless(minimal_db: DatabaseManager, payload: str) -> None:
    svc, _, _ = _make_catalog_service(minimal_db)

    # Search, facility, department_id, and user search probes return empty safely
    assert svc.list_resources(ADMIN, ResourceFilter(search=payload)) == []
    assert svc.list_resources(ADMIN, ResourceFilter(facility=payload)) == []
    assert svc.list_resources(ADMIN, ResourceFilter(department_id=payload)) == []
    assert svc.list_users(ADMIN, search=payload) == []

    # Verify tables remain completely intact
    with minimal_db.transaction() as conn:
        res_count = conn.execute("SELECT COUNT(*) FROM resources").fetchone()[0]
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        booking_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='bookings'"
        ).fetchone()
    assert res_count == 1
    assert user_count == 1
    assert booking_table is not None


def test_not_found_errors_for_missing_catalog_entities(minimal_db: DatabaseManager) -> None:
    svc, _, _ = _make_catalog_service(minimal_db)

    with pytest.raises(NotFoundError):
        svc.get_department(ADMIN, "MISSING")
    with pytest.raises(NotFoundError):
        svc.get_building(ADMIN, "MISSING")
    with pytest.raises(NotFoundError):
        svc.get_user(ADMIN, "MISSING")
    with pytest.raises(NotFoundError):
        svc.get_resource(ADMIN, "MISSING")
    with pytest.raises(NotFoundError):
        svc.retire_resource(ADMIN, "MISSING")
    with pytest.raises(NotFoundError):
        svc.deactivate_user(ADMIN, "MISSING")
