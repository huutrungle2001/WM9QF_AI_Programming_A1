"""Reference catalogue routes: departments, buildings, facilities, and booking statuses."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_actor_context, get_catalog_service
from app.domain.enums import CampusZone
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
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/api/v1", tags=["reference"])


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> list[DepartmentOut]:
    return catalog_service.list_departments(actor)


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> DepartmentOut:
    return catalog_service.create_department(actor, payload)


@router.get("/departments/{department_id}", response_model=DepartmentOut)
def get_department(
    department_id: str,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> DepartmentOut:
    return catalog_service.get_department(actor, department_id)


@router.patch("/departments/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: str,
    payload: DepartmentUpdate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> DepartmentOut:
    return catalog_service.update_department(actor, department_id, payload)


@router.get("/buildings", response_model=list[BuildingOut])
def list_buildings(
    zone: CampusZone | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> list[BuildingOut]:
    return catalog_service.list_buildings(actor, zone=zone)


@router.post("/buildings", response_model=BuildingOut, status_code=status.HTTP_201_CREATED)
def create_building(
    payload: BuildingCreate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> BuildingOut:
    return catalog_service.create_building(actor, payload)


@router.get("/buildings/{building_id}", response_model=BuildingOut)
def get_building(
    building_id: str,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> BuildingOut:
    return catalog_service.get_building(actor, building_id)


@router.patch("/buildings/{building_id}", response_model=BuildingOut)
def update_building(
    building_id: str,
    payload: BuildingUpdate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> BuildingOut:
    return catalog_service.update_building(actor, building_id, payload)


@router.get("/facilities", response_model=list[FacilityOut])
def list_facilities(
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> list[FacilityOut]:
    return catalog_service.list_facilities(actor)


@router.post("/facilities", response_model=FacilityOut, status_code=status.HTTP_201_CREATED)
def create_facility(
    payload: FacilityCreate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> FacilityOut:
    return catalog_service.create_facility(actor, payload)


@router.get("/booking-statuses", response_model=list[BookingStatusOut])
def list_booking_statuses(
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> list[BookingStatusOut]:
    return catalog_service.list_booking_statuses(actor)

