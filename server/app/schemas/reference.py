"""Pydantic v2 DTOs for reference tables: departments, buildings, facilities, booking_statuses."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import CampusZone


class DepartmentCreate(BaseModel):
    department_id: str = Field(..., min_length=1, max_length=32)
    department_name: str = Field(..., min_length=1, max_length=200)
    faculty: str = Field(..., min_length=1, max_length=120)


class DepartmentUpdate(BaseModel):
    department_name: str | None = Field(default=None, min_length=1, max_length=200)
    faculty: str | None = Field(default=None, min_length=1, max_length=120)


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    department_id: str
    department_name: str
    faculty: str


class BuildingCreate(BaseModel):
    building_id: str = Field(..., min_length=1, max_length=64)
    building_name: str = Field(..., min_length=1, max_length=200)
    zone: CampusZone
    lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    lon: float | None = Field(default=None, ge=-180.0, le=180.0)
    floor_count: int = Field(default=1, ge=0)


class BuildingUpdate(BaseModel):
    building_name: str | None = Field(default=None, min_length=1, max_length=200)
    zone: CampusZone | None = None
    lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    lon: float | None = Field(default=None, ge=-180.0, le=180.0)
    floor_count: int | None = Field(default=None, ge=0)


class BuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    building_id: str
    building_name: str
    zone: CampusZone
    lat: float | None = None
    lon: float | None = None
    floor_count: int


class FacilityCreate(BaseModel):
    facility_id: str = Field(..., min_length=1, max_length=64)
    facility_name: str = Field(..., min_length=1, max_length=160)


class FacilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    facility_id: str
    facility_name: str


class BookingStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status_id: str
    description: str
    blocks_slot: bool
