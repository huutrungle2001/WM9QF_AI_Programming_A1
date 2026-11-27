"""Catalogue & availability orchestration service enforcing RBAC and SQL eligibility pushdown."""

from __future__ import annotations

from app.domain.enums import CampusZone, ResourceStatus, Role, UserType
from app.domain.exceptions import ForbiddenError, NotFoundError
from app.repositories.booking_repo import BookingRepository
from app.repositories.reference_repo import ReferenceRepository
from app.repositories.resource_repo import ResourceRepository
from app.repositories.user_repo import UserRepository
from app.schemas.actor import ActorContext
from app.schemas.reference import (
    BookingStatusOut,
    BuildingCreate,
    BuildingOut,
    BuildingUpdate,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    FacilityCreate,
    FacilityOut,
)
from app.schemas.resource import (
    AvailabilityQuery,
    AvailabilitySlot,
    ResourceCreate,
    ResourceFilter,
    ResourceOut,
    ResourceUpdate,
)
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.policy import PolicyGuard


class CatalogService:
    """Role-guarded service for reference data, users, CTI resources, and real-time availability."""

    def __init__(
        self,
        reference_repo: ReferenceRepository,
        user_repo: UserRepository,
        resource_repo: ResourceRepository,
        booking_repo: BookingRepository,
        policy: PolicyGuard,
    ) -> None:
        self.reference_repo = reference_repo
        self.user_repo = user_repo
        self.resource_repo = resource_repo
        self.booking_repo = booking_repo
        self.policy = policy

    # ------------------------------------------------------------------
    # Departments
    # ------------------------------------------------------------------
    def list_departments(self, actor: ActorContext) -> list[DepartmentOut]:
        self.policy.require_action(actor, "department:read")
        return self.reference_repo.list_departments()

    def get_department(self, actor: ActorContext, department_id: str) -> DepartmentOut:
        self.policy.require_action(actor, "department:read")
        dept = self.reference_repo.get_department(department_id)
        if dept is None:
            raise NotFoundError(f"Department '{department_id}' not found.")
        return dept

    def create_department(self, actor: ActorContext, dto: DepartmentCreate) -> DepartmentOut:
        self.policy.require_action(actor, "department:create")
        return self.reference_repo.create_department(dto)

    def update_department(
        self,
        actor: ActorContext,
        department_id: str,
        dto: DepartmentUpdate,
    ) -> DepartmentOut:
        self.policy.require_action(actor, "department:update")
        return self.reference_repo.update_department(department_id, dto)

    # ------------------------------------------------------------------
    # Buildings
    # ------------------------------------------------------------------
    def list_buildings(
        self,
        actor: ActorContext,
        zone: CampusZone | str | None = None,
    ) -> list[BuildingOut]:
        self.policy.require_action(actor, "building:read")
        return self.reference_repo.list_buildings(zone=zone)

    def get_building(self, actor: ActorContext, building_id: str) -> BuildingOut:
        self.policy.require_action(actor, "building:read")
        bldg = self.reference_repo.get_building(building_id)
        if bldg is None:
            raise NotFoundError(f"Building '{building_id}' not found.")
        return bldg

    def create_building(self, actor: ActorContext, dto: BuildingCreate) -> BuildingOut:
        self.policy.require_action(actor, "building:create")
        return self.reference_repo.create_building(dto)

    def update_building(
        self,
        actor: ActorContext,
        building_id: str,
        dto: BuildingUpdate,
    ) -> BuildingOut:
        self.policy.require_action(actor, "building:update")
        return self.reference_repo.update_building(building_id, dto)

    # ------------------------------------------------------------------
    # Facilities & Booking Statuses
    # ------------------------------------------------------------------
    def list_facilities(self, actor: ActorContext) -> list[FacilityOut]:
        self.policy.require_action(actor, "facility:read")
        return self.reference_repo.list_facilities()

    def create_facility(self, actor: ActorContext, dto: FacilityCreate) -> FacilityOut:
        self.policy.require_action(actor, "facility:create")
        return self.reference_repo.create_facility(dto)

    def list_booking_statuses(self, actor: ActorContext) -> list[BookingStatusOut]:
        self.policy.require_action(actor, "status:read")
        return self.reference_repo.list_booking_statuses()

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------
    def list_users(
        self,
        actor: ActorContext,
        *,
        role: Role | str | None = None,
        user_type: UserType | str | None = None,
        department_id: str | None = None,
        course: str | None = None,
        is_active: bool | None = None,
        search: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[UserOut]:
        self.policy.require_action(actor, "user:read")
        return self.user_repo.list_users(
            role=role,
            user_type=user_type,
            department_id=department_id,
            course=course,
            is_active=is_active,
            search=search,
            limit=limit,
            offset=offset,
        )

    def get_user(self, actor: ActorContext, user_id: str) -> UserOut:
        self.policy.require_action(actor, "user:read")
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError(f"User '{user_id}' not found.")
        return user

    def create_user(self, actor: ActorContext, dto: UserCreate) -> UserOut:
        self.policy.require_action(actor, "user:create")
        return self.user_repo.create(dto)

    def update_user(self, actor: ActorContext, user_id: str, dto: UserUpdate) -> UserOut:
        self.policy.require_action(actor, "user:update")
        return self.user_repo.update(user_id, dto)

    def deactivate_user(self, actor: ActorContext, user_id: str) -> UserOut:
        self.policy.require_action(actor, "user:deactivate")
        return self.user_repo.soft_deactivate(user_id)

    # ------------------------------------------------------------------
    # Resources (with Policy-to-SQL Pushdown)
    # ------------------------------------------------------------------
    def list_resources(
        self,
        actor: ActorContext,
        filters: ResourceFilter | None = None,
    ) -> list[ResourceOut]:
        self.policy.require_action(actor, "resource:read")
        allowed = self.policy.allowed_eligibilities(actor)
        return self.resource_repo.list_resources(filters=filters, allowed_eligibilities=allowed)

    def get_resource(self, actor: ActorContext, resource_id: str) -> ResourceOut:
        self.policy.require_action(actor, "resource:read")
        resource = self.resource_repo.get_by_id(resource_id)
        if resource is None:
            raise NotFoundError(f"Resource '{resource_id}' not found.")
        allowed = self.policy.allowed_eligibilities(actor)
        if allowed is not None and resource.booking_eligibility.value not in allowed:
            raise ForbiddenError(
                f"Actor is not eligible to view resource '{resource_id}' "
                f"(eligibility: '{resource.booking_eligibility.value}')."
            )
        return resource

    def create_resource(self, actor: ActorContext, dto: ResourceCreate) -> ResourceOut:
        self.policy.require_action(actor, "resource:create")
        return self.resource_repo.create(dto)

    def update_resource(
        self,
        actor: ActorContext,
        resource_id: str,
        dto: ResourceUpdate,
    ) -> ResourceOut:
        self.policy.require_action(actor, "resource:update")
        return self.resource_repo.update(resource_id, dto)

    def retire_resource(self, actor: ActorContext, resource_id: str) -> ResourceOut:
        self.policy.require_action(actor, "resource:retire")
        return self.resource_repo.soft_retire(resource_id)

    # ------------------------------------------------------------------
    # Availability Lookup
    # ------------------------------------------------------------------
    def check_availability(
        self,
        actor: ActorContext,
        query: AvailabilityQuery,
    ) -> list[AvailabilitySlot]:
        """Return active, eligible resources with remaining_slots > 0 for [start_time, end_time)."""
        self.policy.require_action(actor, "availability:read")
        allowed = self.policy.allowed_eligibilities(actor)

        resource_filter = ResourceFilter(
            resource_type=query.resource_type,
            department_id=query.department_id,
            building_id=query.building_id,
            zone=query.zone,
            facility=query.facility,
            min_capacity=query.min_capacity,
            status=ResourceStatus.ACTIVE,
            limit=1000,
            offset=0,
        )
        candidates = self.resource_repo.list_resources(
            filters=resource_filter,
            allowed_eligibilities=allowed,
        )
        if not candidates:
            return []

        active_counts = self.booking_repo.count_active_bookings_by_resource(
            [r.resource_id for r in candidates],
            query.start_time,
            query.end_time,
        )

        slots: list[AvailabilitySlot] = []
        for res in candidates:
            max_conc = res.max_concurrent_bookings or 1
            active = active_counts.get(res.resource_id, 0)
            remaining = max_conc - active
            if remaining > 0:
                slots.append(
                    AvailabilitySlot(
                        resource=res,
                        start_time=query.start_time,
                        end_time=query.end_time,
                        max_concurrent_bookings=max_conc,
                        active_bookings=active,
                        remaining_slots=remaining,
                    )
                )
        return slots
