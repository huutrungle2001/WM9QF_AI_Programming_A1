"""User management routes delegating strictly to CatalogService."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status

from app.dependencies import get_actor_context, get_catalog_service
from app.domain.enums import Role, UserType
from app.schemas.actor import ActorContext
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/api/v1", tags=["users"])


@router.get("/users", response_model=list[UserOut])
def list_users(
    role: Role | None = Query(default=None),
    user_type: UserType | None = Query(default=None),
    department_id: str | None = Query(default=None),
    course: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> list[UserOut]:
    return catalog_service.list_users(
        actor,
        role=role,
        user_type=user_type,
        department_id=department_id,
        course=course,
        is_active=is_active,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> UserOut:
    return catalog_service.create_user(actor, payload)


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: str,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> UserOut:
    return catalog_service.get_user(actor, user_id)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> UserOut:
    return catalog_service.update_user(actor, user_id, payload)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: str,
    actor: ActorContext = Depends(get_actor_context),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> Response:
    catalog_service.deactivate_user(actor, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

