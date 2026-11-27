"""Liveness and database readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.database import DatabaseManager
from app.dependencies import get_db_manager

router = APIRouter(tags=["health"])


def _check_database(db: DatabaseManager) -> dict[str, str]:
    conn = db.get_connection()
    try:
        conn.execute("SELECT 1").fetchone()
    finally:
        conn.close()
    return {"status": "ok", "database": "ready"}


@router.get("/health")
def health_check(db: DatabaseManager = Depends(get_db_manager)) -> dict[str, str]:
    """Root liveness and SQLite readiness check."""
    return _check_database(db)


@router.get("/api/v1/health")
def api_health_check(db: DatabaseManager = Depends(get_db_manager)) -> dict[str, str]:
    """Versioned API liveness and SQLite readiness check."""
    return _check_database(db)

