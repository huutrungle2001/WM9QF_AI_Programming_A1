"""Pydantic v2 DTOs for polymorphic CTI resources and availability queries."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import (
    BookingEligibility,
    CampusZone,
    CheckinMethod,
    ResourceStatus,
    ResourceType,
    RoomStyle,
)


class RoomDetails(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    capacity: int = Field(..., gt=0)
    room_style: RoomStyle = RoomStyle.STANDARD


class EquipmentDetails(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    category: str = Field(..., min_length=1, max_length=100)
    quantity: int = Field(default=1, gt=0)
    specifications: str | None = None


class SupportDetails(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    category: str = Field(..., min_length=1, max_length=100)
    max_attendees: int = Field(default=1, gt=0)
    host_name: str | None = None


ResourceDetails = RoomDetails | EquipmentDetails | SupportDetails

_ROOM_TYPES = {
    ResourceType.STUDY_ROOM,
    ResourceType.GROUP_SPACE,
    ResourceType.COMPUTER_LAB,
}


def _expected_details_class(resource_type: ResourceType) -> type[BaseModel]:
    if resource_type in _ROOM_TYPES:
        return RoomDetails
    if resource_type == ResourceType.SPECIALIST_EQUIPMENT:
        return EquipmentDetails
    if resource_type == ResourceType.ACADEMIC_SUPPORT:
        return SupportDetails
    raise ValueError(f"Unsupported resource_type: {resource_type}")


def _coerce_details_for_type(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    raw_type = data.get("resource_type")
    raw_details = data.get("details")
    if raw_type is None or raw_details is None:
        return data
    try:
        rtype = ResourceType(raw_type)
    except ValueError:
        return data
    expected_cls = _expected_details_class(rtype)
    if isinstance(raw_details, dict):
        updated = dict(data)
        updated["details"] = expected_cls.model_validate(raw_details)
        return updated
    if not isinstance(raw_details, expected_cls):
        raise ValueError(
            f"details must be {expected_cls.__name__} for resource_type '{rtype.value}', "
            f"got {type(raw_details).__name__}."
        )
    return data


class ResourceCreate(BaseModel):
    resource_id: str = Field(..., min_length=1, max_length=64)
    resource_name: str = Field(..., min_length=1, max_length=250)
    resource_type: ResourceType
    department_id: str = Field(..., min_length=1, max_length=32)
    building_id: str | None = Field(default=None, max_length=64)
    location: str = Field(..., min_length=1, max_length=250)
    description: str | None = None
    image_url: str | None = None
    requires_approval: bool = False
    booking_eligibility: BookingEligibility = BookingEligibility.ALL_USERS
    checkin_method: CheckinMethod = CheckinMethod.NONE
    status: ResourceStatus = ResourceStatus.ACTIVE
    facilities: list[str] = Field(default_factory=list)
    details: ResourceDetails

    @model_validator(mode="before")
    @classmethod
    def _validate_cti_details(cls, data: Any) -> Any:
        return _coerce_details_for_type(data)


class ResourceUpdate(BaseModel):
    resource_name: str | None = Field(default=None, min_length=1, max_length=250)
    department_id: str | None = Field(default=None, min_length=1, max_length=32)
    building_id: str | None = Field(default=None, max_length=64)
    location: str | None = Field(default=None, min_length=1, max_length=250)
    description: str | None = None
    image_url: str | None = None
    requires_approval: bool | None = None
    booking_eligibility: BookingEligibility | None = None
    checkin_method: CheckinMethod | None = None
    status: ResourceStatus | None = None
    facilities: list[str] | None = None
    details: dict[str, Any] | ResourceDetails | None = None


class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    resource_id: str
    resource_name: str
    resource_type: ResourceType
    department_id: str
    building_id: str | None = None
    location: str
    description: str | None = None
    image_url: str | None = None
    requires_approval: bool
    booking_eligibility: BookingEligibility
    checkin_method: CheckinMethod
    status: ResourceStatus
    facilities: list[str] = Field(default_factory=list)
    details: ResourceDetails
    department_name: str | None = None
    building_name: str | None = None
    zone: CampusZone | None = None
    lat: float | None = None
    lon: float | None = None
    max_concurrent_bookings: int | None = None

    @model_validator(mode="before")
    @classmethod
    def _validate_cti_details(cls, data: Any) -> Any:
        return _coerce_details_for_type(data)


class ResourceFilter(BaseModel):
    resource_type: ResourceType | None = None
    department_id: str | None = None
    building_id: str | None = None
    zone: CampusZone | None = None
    facility: str | None = None
    min_capacity: int | None = Field(default=None, ge=1)
    status: ResourceStatus | None = None
    search: str | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class AvailabilityQuery(BaseModel):
    start_time: int
    end_time: int
    resource_type: ResourceType | None = None
    department_id: str | None = None
    building_id: str | None = None
    zone: CampusZone | None = None
    facility: str | None = None
    min_capacity: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _check_window(self) -> AvailabilityQuery:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be strictly greater than start_time.")
        return self


class AvailabilitySlot(BaseModel):
    resource: ResourceOut
    start_time: int
    end_time: int
    max_concurrent_bookings: int
    active_bookings: int
    remaining_slots: int
