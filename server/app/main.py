"""FastAPI application factory, CORS configuration, exception handlers, and router mount."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import AppSettings, BookingPolicyConfig
from app.database import DatabaseManager
from app.dependencies import build_service_container, wire_app_state
from app.domain.exceptions import (
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.routers import analytics, bookings, health, reference, resources, users


def _register_exception_handlers(app: FastAPI) -> None:
    """Map framework-free domain exceptions to consistent JSON error envelopes."""

    def _make_handler(status_code: int):
        async def _handler(_request: Request, exc: DomainError) -> JSONResponse:
            return JSONResponse(
                status_code=status_code,
                content={"detail": str(exc), "code": exc.code},
            )

        return _handler

    app.add_exception_handler(UnauthorizedError, _make_handler(401))
    app.add_exception_handler(ForbiddenError, _make_handler(403))
    app.add_exception_handler(NotFoundError, _make_handler(404))
    app.add_exception_handler(ConflictError, _make_handler(409))
    app.add_exception_handler(ValidationError, _make_handler(422))
    app.add_exception_handler(DomainError, _make_handler(400))


def create_app(
    db_manager: DatabaseManager | None = None,
    policy_config: BookingPolicyConfig | None = None,
    *,
    charts_dir: Path | str | None = None,
    settings: AppSettings | None = None,
) -> FastAPI:
    """Create and configure a FastAPI instance wired to the provided DB and policy config."""
    resolved_settings = settings or AppSettings.from_env()
    resolved_db = db_manager or DatabaseManager(resolved_settings.db_path)

    if (
        db_manager is None
        and isinstance(resolved_db.db_path, Path)
        and not resolved_db.db_path.exists()
    ):
        resolved_db.init_schema(resolved_settings.schema_path)

    container = build_service_container(
        db_manager=resolved_db,
        policy_config=policy_config,
        settings=resolved_settings,
        charts_dir=charts_dir,
    )

    app = FastAPI(
        title="Campus Learning Resources Booking & Analytics API",
        version="1.0.0",
        description=(
            "Unified REST API (/api/v1) for campus study rooms, group spaces, computer labs, "
            "specialist equipment loans, academic support sessions, and privacy-safe analytics."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            f"http://localhost:{resolved_settings.client_port}",
            f"http://127.0.0.1:{resolved_settings.client_port}",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    wire_app_state(app, container)
    _register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(reference.router)
    app.include_router(users.router)
    app.include_router(resources.router)
    app.include_router(bookings.router)
    app.include_router(analytics.router)

    return app


app = create_app()

