"""Pydantic v2 DTOs for bookings, lifecycle transitions, filtering, and CSV import."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.enums import ResourceType


class BookingCreate(BaseModel):
    user_id: str | None = Field(default=None, min_length=1, max_length=64)
    resource_id: str = Field(..., min_length=1, max_length=64)
    start_time: int
    end_time: int
    purpose: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)
    group_size: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _check_window(self) -> BookingCreate:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be strictly greater than start_time.")
        return self


class BookingUpdate(BaseModel):
    start_time: int | None = None
    end_time: int | None = None
    purpose: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)
    group_size: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _check_partial_window(self) -> BookingUpdate:
        if self.start_time is not None and self.end_time is not None:
            if self.end_time <= self.start_time:
                raise ValueError("end_time must be strictly greater than start_time.")
        return self


class BookingTransitionRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=1000)


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    booking_id: int
    user_id: str
    user_name: str | None = None
    course: str | None = None
    department_id: str | None = None
    resource_id: str
    resource_name: str | None = None
    resource_type: ResourceType | None = None
    start_time: int
    end_time: int
    status_id: str
    purpose: str | None = None
    notes: str | None = None
    created_at: int
    updated_at: int


class BookingFilter(BaseModel):
    user_id: str | None = None
    resource_id: str | None = None
    resource_type: ResourceType | None = None
    department_id: str | None = None
    course: str | None = None
    status_id: str | None = None
    from_ts: int | None = None
    to_ts: int | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class ImportErrorItem(BaseModel):
    line_number: int = Field(..., ge=1)
    error: str
    row_data: dict[str, Any] | None = None


class ImportSummary(BaseModel):
    total_rows: int = Field(..., ge=0)
    imported_count: int = Field(..., ge=0)
    failed_count: int = Field(..., ge=0)
    created_booking_ids: list[int] = Field(default_factory=list)
    errors: list[ImportErrorItem] = Field(default_factory=list)
