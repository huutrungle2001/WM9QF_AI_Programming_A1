"""Framework-free OOP resource hierarchy (CTI archetypes) and ResourceFactory."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.config import BookingPolicyConfig
from app.domain.enums import (
    BookingEligibility,
    BookingStatusId,
    CheckinMethod,
    ResourceStatus,
    ResourceType,
    Role,
    RoomStyle,
)
from app.domain.exceptions import ValidationError

ROOM_RESOURCE_TYPES: frozenset[ResourceType] = frozenset(
    {
        ResourceType.STUDY_ROOM,
        ResourceType.GROUP_SPACE,
        ResourceType.COMPUTER_LAB,
    }
)


class ActorLike(Protocol):
    """Structural protocol for actor objects passed into domain hooks."""

    role: Role


@dataclass
class Resource(ABC):
    """Abstract supertype mirroring the 12 columns of resources plus attached facilities."""

    resource_id: str
    resource_name: str
    resource_type: ResourceType
    department_id: str
    building_id: str | None
    location: str
    description: str | None = None
    image_url: str | None = None
    requires_approval: bool = False
    booking_eligibility: BookingEligibility = BookingEligibility.ALL_USERS
    checkin_method: CheckinMethod = CheckinMethod.NONE
    status: ResourceStatus = ResourceStatus.ACTIVE
    facilities: list[str] = field(default_factory=list)

    def validate_active(self) -> None:
        """Ensure the resource is active before accepting new bookings."""
        if self.status != ResourceStatus.ACTIVE:
            raise ValidationError(
                f"Resource '{self.resource_id}' is currently '{self.status.value}' and cannot be booked."
            )

    def initial_status(self, actor: ActorLike) -> BookingStatusId:
        """Return PENDING for member bookings on approval-gated resources; otherwise CONFIRMED."""
        if self.requires_approval and actor.role == Role.MEMBER:
            return BookingStatusId.PENDING
        return BookingStatusId.CONFIRMED

    def _validate_time_window(
        self,
        start_time: int,
        end_time: int,
        config: BookingPolicyConfig,
    ) -> None:
        if end_time <= start_time:
            raise ValidationError("Booking end_time must be strictly greater than start_time.")
        duration = end_time - start_time
        max_seconds = self.max_duration_seconds(config)
        if duration > max_seconds:
            raise ValidationError(
                f"Requested duration ({duration}s) exceeds maximum allowed ({max_seconds}s) "
                f"for resource type '{self.resource_type.value}'."
            )

    @abstractmethod
    def max_concurrent_bookings(self) -> int:
        """Return the maximum number of overlapping blocking bookings allowed."""

    @abstractmethod
    def max_duration_seconds(self, config: BookingPolicyConfig) -> int:
        """Return the maximum permitted booking duration in seconds."""

    @abstractmethod
    def validate_booking_request(
        self,
        start_time: int,
        end_time: int,
        config: BookingPolicyConfig,
        group_size: int | None = None,
    ) -> None:
        """Validate a booking request against subtype-specific domain invariants."""

    @abstractmethod
    def subtype_table(self) -> str:
        """Return the CTI subtype table name for this resource."""

    @abstractmethod
    def subtype_payload(self) -> dict[str, Any]:
        """Return the column-value mapping for the CTI subtype table."""


@dataclass
class RoomResource(Resource):
    """Concrete physical room/lab resource backed by the rooms CTI table."""

    capacity: int = 1
    room_style: RoomStyle = RoomStyle.STANDARD

    def __post_init__(self) -> None:
        if self.resource_type not in ROOM_RESOURCE_TYPES:
            raise ValidationError(
                f"RoomResource requires a room resource_type, got '{self.resource_type}'."
            )
        if self.capacity <= 0:
            raise ValidationError("Room capacity must be greater than 0.")

    def max_concurrent_bookings(self) -> int:
        return 1

    def max_duration_seconds(self, config: BookingPolicyConfig) -> int:
        return config.max_room_hours * 3600

    def validate_booking_request(
        self,
        start_time: int,
        end_time: int,
        config: BookingPolicyConfig,
        group_size: int | None = None,
    ) -> None:
        self.validate_active()
        self._validate_time_window(start_time, end_time, config)
        if group_size is not None:
            if group_size < 1:
                raise ValidationError("group_size must be at least 1.")
            if group_size > self.capacity:
                raise ValidationError(
                    f"group_size ({group_size}) exceeds room capacity ({self.capacity}) "
                    f"for '{self.resource_id}'."
                )

    def subtype_table(self) -> str:
        return "rooms"

    def subtype_payload(self) -> dict[str, Any]:
        return {
            "resource_id": self.resource_id,
            "capacity": self.capacity,
            "room_style": self.room_style.value,
        }


@dataclass
class EquipmentResource(Resource):
    """Concrete loanable hardware pool backed by the equipment_items CTI table."""

    category: str = ""
    quantity: int = 1
    specifications: str | None = None

    def __post_init__(self) -> None:
        if self.resource_type != ResourceType.SPECIALIST_EQUIPMENT:
            raise ValidationError(
                f"EquipmentResource requires 'specialist_equipment', got '{self.resource_type}'."
            )
        if not self.category or not self.category.strip():
            raise ValidationError("Equipment category must be non-empty.")
        if self.quantity <= 0:
            raise ValidationError("Equipment quantity must be greater than 0.")

    def max_concurrent_bookings(self) -> int:
        return self.quantity

    def max_duration_seconds(self, config: BookingPolicyConfig) -> int:
        return config.max_equipment_loan_days * 86400

    def validate_booking_request(
        self,
        start_time: int,
        end_time: int,
        config: BookingPolicyConfig,
        group_size: int | None = None,
    ) -> None:
        self.validate_active()
        self._validate_time_window(start_time, end_time, config)
        if group_size is not None and group_size < 1:
            raise ValidationError("group_size must be at least 1.")

    def subtype_table(self) -> str:
        return "equipment_items"

    def subtype_payload(self) -> dict[str, Any]:
        return {
            "resource_id": self.resource_id,
            "category": self.category,
            "quantity": self.quantity,
            "specifications": self.specifications,
        }


@dataclass
class AcademicSupportResource(Resource):
    """Concrete consultation or group workshop backed by the support_services CTI table."""

    category: str = ""
    max_attendees: int = 1
    host_name: str | None = None

    def __post_init__(self) -> None:
        if self.resource_type != ResourceType.ACADEMIC_SUPPORT:
            raise ValidationError(
                f"AcademicSupportResource requires 'academic_support', got '{self.resource_type}'."
            )
        if not self.category or not self.category.strip():
            raise ValidationError("Support service category must be non-empty.")
        if self.max_attendees <= 0:
            raise ValidationError("Support service max_attendees must be greater than 0.")

    def max_concurrent_bookings(self) -> int:
        return self.max_attendees

    def max_duration_seconds(self, config: BookingPolicyConfig) -> int:
        return config.max_support_hours * 3600

    def validate_booking_request(
        self,
        start_time: int,
        end_time: int,
        config: BookingPolicyConfig,
        group_size: int | None = None,
    ) -> None:
        self.validate_active()
        self._validate_time_window(start_time, end_time, config)
        if group_size is not None:
            if group_size < 1:
                raise ValidationError("group_size must be at least 1.")
            if group_size > self.max_attendees:
                raise ValidationError(
                    f"group_size ({group_size}) exceeds max_attendees ({self.max_attendees}) "
                    f"for '{self.resource_id}'."
                )

    def subtype_table(self) -> str:
        return "support_services"

    def subtype_payload(self) -> dict[str, Any]:
        return {
            "resource_id": self.resource_id,
            "category": self.category,
            "max_attendees": self.max_attendees,
            "host_name": self.host_name,
        }


class ResourceFactory:
    """Factory instantiating concrete Resource subclasses from DB rows or Pydantic DTOs."""

    @staticmethod
    def _to_dict(row: Any) -> dict[str, Any]:
        if isinstance(row, dict):
            return row
        if hasattr(row, "keys"):
            return {k: row[k] for k in row.keys()}
        return dict(row)

    @classmethod
    def from_db_rows(
        cls,
        parent_row: Any,
        subtype_row: Any,
        facilities: Sequence[str] | None = None,
    ) -> Resource:
        """Hydrate a concrete Resource subclass from resources + its CTI subtype row."""
        parent = cls._to_dict(parent_row)
        subtype = cls._to_dict(subtype_row)
        try:
            resource_type = ResourceType(parent["resource_type"])
        except (KeyError, ValueError) as exc:
            raise ValidationError(f"Unknown resource_type: {parent.get('resource_type')}") from exc

        base_kwargs: dict[str, Any] = {
            "resource_id": parent["resource_id"],
            "resource_name": parent["resource_name"],
            "resource_type": resource_type,
            "department_id": parent["department_id"],
            "building_id": parent.get("building_id"),
            "location": parent["location"],
            "description": parent.get("description"),
            "image_url": parent.get("image_url"),
            "requires_approval": bool(parent.get("requires_approval", 0)),
            "booking_eligibility": BookingEligibility(
                parent.get("booking_eligibility", BookingEligibility.ALL_USERS)
            ),
            "checkin_method": CheckinMethod(parent.get("checkin_method", CheckinMethod.NONE)),
            "status": ResourceStatus(parent.get("status", ResourceStatus.ACTIVE)),
            "facilities": list(facilities) if facilities is not None else [],
        }

        if resource_type in ROOM_RESOURCE_TYPES:
            return RoomResource(
                **base_kwargs,
                capacity=int(subtype["capacity"]),
                room_style=RoomStyle(subtype.get("room_style", RoomStyle.STANDARD)),
            )
        if resource_type == ResourceType.SPECIALIST_EQUIPMENT:
            return EquipmentResource(
                **base_kwargs,
                category=str(subtype["category"]),
                quantity=int(subtype["quantity"]),
                specifications=subtype.get("specifications"),
            )
        if resource_type == ResourceType.ACADEMIC_SUPPORT:
            return AcademicSupportResource(
                **base_kwargs,
                category=str(subtype["category"]),
                max_attendees=int(subtype["max_attendees"]),
                host_name=subtype.get("host_name"),
            )
        raise ValidationError(f"Unsupported resource_type: {resource_type}")

    @classmethod
    def from_create_dto(cls, dto: Any) -> Resource:
        """Build and validate a concrete Resource subclass from a ResourceCreate DTO."""
        resource_type = ResourceType(dto.resource_type)
        details = dto.details
        base_kwargs: dict[str, Any] = {
            "resource_id": dto.resource_id,
            "resource_name": dto.resource_name,
            "resource_type": resource_type,
            "department_id": dto.department_id,
            "building_id": dto.building_id,
            "location": dto.location,
            "description": dto.description,
            "image_url": dto.image_url,
            "requires_approval": bool(dto.requires_approval),
            "booking_eligibility": BookingEligibility(dto.booking_eligibility),
            "checkin_method": CheckinMethod(dto.checkin_method),
            "status": ResourceStatus(dto.status),
            "facilities": list(dto.facilities),
        }

        if resource_type in ROOM_RESOURCE_TYPES:
            if not hasattr(details, "capacity") or not hasattr(details, "room_style"):
                raise ValidationError("Room resource types require RoomDetails (capacity, room_style).")
            return RoomResource(
                **base_kwargs,
                capacity=int(details.capacity),
                room_style=RoomStyle(details.room_style),
            )
        if resource_type == ResourceType.SPECIALIST_EQUIPMENT:
            if not hasattr(details, "quantity") or not hasattr(details, "category"):
                raise ValidationError("Equipment resources require EquipmentDetails (category, quantity).")
            return EquipmentResource(
                **base_kwargs,
                category=str(details.category),
                quantity=int(details.quantity),
                specifications=getattr(details, "specifications", None),
            )
        if resource_type == ResourceType.ACADEMIC_SUPPORT:
            if not hasattr(details, "max_attendees") or not hasattr(details, "category"):
                raise ValidationError("Support resources require SupportDetails (category, max_attendees).")
            return AcademicSupportResource(
                **base_kwargs,
                category=str(details.category),
                max_attendees=int(details.max_attendees),
                host_name=getattr(details, "host_name", None),
            )
        raise ValidationError(f"Unsupported resource_type: {resource_type}")
