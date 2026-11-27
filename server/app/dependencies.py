"""FastAPI dependency injection wiring and header-based ActorContext resolution."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, FastAPI, Header, Request

from app.config import AppSettings, BookingPolicyConfig
from app.database import DatabaseManager
from app.domain.enums import Role
from app.domain.exceptions import UnauthorizedError
from app.repositories.booking_repo import BookingRepository
from app.repositories.reference_repo import ReferenceRepository
from app.repositories.resource_repo import ResourceRepository
from app.repositories.user_repo import UserRepository
from app.schemas.actor import ActorContext
from app.services.analytics_service import AnalyticsService
from app.services.booking_service import BookingService
from app.services.catalog_service import CatalogService
from app.services.chart_service import ChartService
from app.services.policy import PolicyGuard


@dataclass
class ServiceContainer:
    """Shared service and repository graph used by both FastAPI and CLI adapters."""

    settings: AppSettings
    db_manager: DatabaseManager
    policy_config: BookingPolicyConfig
    policy_guard: PolicyGuard
    reference_repo: ReferenceRepository
    user_repo: UserRepository
    resource_repo: ResourceRepository
    booking_repo: BookingRepository
    catalog_service: CatalogService
    booking_service: BookingService
    analytics_service: AnalyticsService
    chart_service: ChartService


def build_service_container(
    *,
    db_manager: DatabaseManager | None = None,
    policy_config: BookingPolicyConfig | None = None,
    settings: AppSettings | None = None,
    charts_dir: Path | str | None = None,
) -> ServiceContainer:
    """Construct the full repository and service dependency graph."""
    resolved_settings = settings or AppSettings.from_env()
    resolved_db = db_manager or DatabaseManager(resolved_settings.db_path)
    resolved_policy_config = policy_config or BookingPolicyConfig()
    policy_guard = PolicyGuard(pseudonym_salt=resolved_settings.pseudonym_salt)

    reference_repo = ReferenceRepository(resolved_db)
    user_repo = UserRepository(resolved_db)
    resource_repo = ResourceRepository(resolved_db)
    booking_repo = BookingRepository(resolved_db)

    catalog_service = CatalogService(
        reference_repo=reference_repo,
        user_repo=user_repo,
        resource_repo=resource_repo,
        booking_repo=booking_repo,
        policy=policy_guard,
    )
    booking_service = BookingService(
        db=resolved_db,
        booking_repo=booking_repo,
        resource_repo=resource_repo,
        user_repo=user_repo,
        policy=policy_guard,
        policy_config=resolved_policy_config,
    )
    analytics_service = AnalyticsService(
        db=resolved_db,
        policy_config=resolved_policy_config,
    )
    resolved_charts_dir = (
        Path(charts_dir) if charts_dir is not None else resolved_settings.charts_dir
    )
    chart_service = ChartService(
        analytics_service,
        default_output_dir=resolved_charts_dir,
        policy_config=resolved_policy_config,
    )

    return ServiceContainer(
        settings=resolved_settings,
        db_manager=resolved_db,
        policy_config=resolved_policy_config,
        policy_guard=policy_guard,
        reference_repo=reference_repo,
        user_repo=user_repo,
        resource_repo=resource_repo,
        booking_repo=booking_repo,
        catalog_service=catalog_service,
        booking_service=booking_service,
        analytics_service=analytics_service,
        chart_service=chart_service,
    )


def wire_app_state(app: FastAPI, container: ServiceContainer) -> None:
    """Attach the service container onto FastAPI app.state for request-time DI."""
    app.state.container = container


def resolve_actor_context(
    raw_role: str | None,
    raw_user_id: str | None,
    user_repo: UserRepository,
) -> ActorContext:
    """Validate role/user headers and hydrate ActorContext from the users table."""
    if raw_role is None or not raw_role.strip():
        raise UnauthorizedError("Missing required X-Role header.")

    try:
        role = Role(raw_role.strip().lower())
    except ValueError as exc:
        valid = ", ".join(r.value for r in Role)
        raise UnauthorizedError(
            f"Invalid X-Role '{raw_role}'. Expected one of: {valid}."
        ) from exc

    user_id = raw_user_id.strip() if raw_user_id and raw_user_id.strip() else None

    if role == Role.MEMBER:
        if user_id is None:
            raise UnauthorizedError("X-User-Id header is required when X-Role is 'member'.")
        user = user_repo.get_by_id(user_id)
        if user is None:
            raise UnauthorizedError(f"User '{user_id}' was not found.")
        if not user.is_active:
            raise UnauthorizedError(f"User '{user_id}' is inactive.")
        return ActorContext(
            role=role,
            user_id=user.user_id,
            user_type=user.user_type,
            department_id=user.department_id,
            has_accessibility_access=user.has_accessibility_access,
        )

    if user_id is not None:
        user = user_repo.get_by_id(user_id)
        if user is not None:
            return ActorContext(
                role=role,
                user_id=user.user_id,
                user_type=user.user_type,
                department_id=user.department_id,
                has_accessibility_access=user.has_accessibility_access,
            )

    return ActorContext(role=role, user_id=user_id)


def get_container(request: Request) -> ServiceContainer:
    return request.app.state.container


def get_db_manager(container: ServiceContainer = Depends(get_container)) -> DatabaseManager:
    return container.db_manager


def get_user_repo(container: ServiceContainer = Depends(get_container)) -> UserRepository:
    return container.user_repo


def get_catalog_service(container: ServiceContainer = Depends(get_container)) -> CatalogService:
    return container.catalog_service


def get_booking_service(container: ServiceContainer = Depends(get_container)) -> BookingService:
    return container.booking_service


def get_analytics_service(
    container: ServiceContainer = Depends(get_container),
) -> AnalyticsService:
    return container.analytics_service


def get_chart_service(container: ServiceContainer = Depends(get_container)) -> ChartService:
    return container.chart_service


def get_actor_context(
    x_role: str | None = Header(default=None, alias="X-Role"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    user_repo: UserRepository = Depends(get_user_repo),
) -> ActorContext:
    """FastAPI dependency extracting and hydrating ActorContext from HTTP headers."""
    return resolve_actor_context(x_role, x_user_id, user_repo)

