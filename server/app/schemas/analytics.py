"""Pydantic v2 DTOs for operational analytics, fairness reports, and chart exports."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ResourceType


class OverviewKPI(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_bookings: int
    active_bookings: int
    confirmed_bookings: int
    pending_bookings: int
    completed_bookings: int
    cancelled_bookings: int
    rejected_bookings: int
    no_show_bookings: int
    active_rate: float
    cancellation_rate: float
    rejection_rate: float
    no_show_rate: float
    total_resources: int
    active_resources: int
    total_users: int
    active_users: int


class DemandItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    resource_id: str
    resource_name: str
    resource_type: ResourceType
    department_id: str
    booking_count: int
    total_hours: float


class HeatmapCell(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    day_of_week: int = Field(..., ge=0, le=6)
    day_name: str
    hour: int = Field(..., ge=0, le=23)
    booking_count: int


class TrendPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    week_label: str
    week_start_ts: int
    booking_count: int
    total_hours: float
    cancelled_count: int = 0


class CancellationBreakdown(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dimension: str
    label: str
    total_bookings: int
    cancelled_count: int
    rejected_count: int
    no_show_count: int
    cancellation_rate: float
    no_show_rate: float


class FairnessRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    course: str
    unique_users: int
    booking_count: int
    total_hours: float
    avg_hours_per_user: float
    is_suppressed: bool = False


class ChartExportResult(BaseModel):
    output_dir: str
    generated_files: list[str] = Field(default_factory=list)
