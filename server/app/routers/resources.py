"""Resource catalogue and real-time availability routes."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Response, status

from app.dependencies import get_actor_context, get_catalog_service
from app.domain.enums import CampusZone, ResourceStatus, ResourceType
from app.domain.exceptions import ValidationError
from app.schemas.actor import ActorContext
from app.schemas.resource import (
    AvailabilityQuery,
    AvailabilitySlot,
    ResourceCreate,
    ResourceFilter,
    ResourceOut,
    ResourceUpdate,
)
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/api/v1", tags=["resources"])


def _parse_epoch_param(raw: str, param_name: str) -> int:
    cleaned = raw.strip()
    if not cleaned:
        raise ValidationError(f"Query parameter '{param_name}' cannot be empty.")
    try:
        return int(cleaned)
    except ValueError:
        pass
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError as exc:
        raise ValidationError(
            f"Invalid timestamp '{cleaned}' for '{param_name}' (expected Unix seconds or ISO-8601 UTC)."
        ) from exc


@router.get("/resources", response_model=list[ResourceOut])
def list_resources(
    resource_type: ResourceType | None = Query(default=None),
    department_id: str | None = Query(default=None),
    building_id: str | None = Query(default=None),
    zone: CampusZone | None = Query(default=None),
    facility: str | None = Query(default=None),
    min_capacity: int | None = Query(default=None, ge=1),
    status_filter: ResourceStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> list[ResourceOut]:
    filters = ResourceFilter(
        resource_type=resource_type,
        department_id=department_id,
        building_id=building_id,
        zone=zone,
        facility=facility,
        min_capacity=min_capacity,
        status=status_filter,
        search=search,
        limit=limit,
        offset=offset,
    )
    return catalog_service.list_resources(actor, filters)


@router.post("/resources", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
def create_resource(
    payload: ResourceCreate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> ResourceOut:
    return catalog_service.create_resource(actor, payload)


@router.get("/resources/{resource_id}", response_model=ResourceOut)
def get_resource(
    resource_id: str,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> ResourceOut:
    return catalog_service.get_resource(actor, resource_id)


@router.patch("/resources/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: str,
    payload: ResourceUpdate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> ResourceOut:
    return catalog_service.update_resource(actor, resource_id, payload)


@router.delete("/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def retire_resource(
    resource_id: str,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> Response:
    catalog_service.retire_resource(actor, resource_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/availability", response_model=list[AvailabilitySlot])
def check_availability(
    start_time: str = Query(..., description="Window start (Unix epoch seconds or ISO-8601 UTC)"),
    end_time: str = Query(..., description="Window end (Unix epoch seconds or ISO-8601 UTC)"),
    resource_type: ResourceType | None = Query(default=None),
    department_id: str | None = Query(default=None),
    building_id: str | None = Query(default=None),
    zone: CampusZone | None = Query(default=None),
    facility: str | None = Query(default=None),
    min_capacity: int | None = Query(default=None, ge=1),
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> list[AvailabilitySlot]:
    start_ts = _parse_epoch_param(start_time, "start_time")
    end_ts = _parse_epoch_param(end_time, "end_time")
    if end_ts <= start_ts:
        raise ValidationError("end_time must be strictly greater than start_time.")

    query = AvailabilityQuery(
        start_time=start_ts,
        end_time=end_ts,
        resource_type=resource_type,
        department_id=department_id,
        building_id=building_id,
        zone=zone,
        facility=facility,
        min_capacity=min_capacity,
    )
    return catalog_service.check_availability(actor, query)

