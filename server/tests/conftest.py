"""Shared pytest fixtures for isolated SQLite databases and test helpers."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure server/ and repo root are importable regardless of pytest invocation cwd.
_SERVER_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SERVER_DIR.parent
if str(_SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVER_DIR))
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from app.config import AppSettings, BookingPolicyConfig
from app.database import DatabaseManager


@pytest.fixture()
def repo_root() -> Path:
    """Return the repository root directory."""
    return _REPO_ROOT


@pytest.fixture()
def app_settings(tmp_path: Path) -> AppSettings:
    """Return AppSettings pointing to an isolated temporary SQLite database."""
    return AppSettings(
        schema_path=_REPO_ROOT / "database" / "schema.sql",
        seed_data_path=_REPO_ROOT / "database" / "seed_data.json",
        db_path=tmp_path / "test_resource_bookings.db",
        charts_dir=tmp_path / "charts",
        pseudonym_salt="test-salt-deterministic",
    )


@pytest.fixture()
def policy_config() -> BookingPolicyConfig:
    """Return default BookingPolicyConfig for domain validation tests."""
    return BookingPolicyConfig()


@pytest.fixture()
def db_manager(app_settings: AppSettings) -> DatabaseManager:
    """Return an initialised DatabaseManager backed by an isolated temp SQLite file."""
    manager = DatabaseManager(app_settings.db_path)
    manager.init_schema(app_settings.schema_path)
    return manager


@pytest.fixture()
def minimal_db(db_manager: DatabaseManager) -> DatabaseManager:
    """Populate minimal reference rows (dept, building, statuses, user, room) for DB tests."""
    with db_manager.transaction() as conn:
        conn.execute(
            "INSERT INTO departments (department_id, department_name, faculty) VALUES (?, ?, ?)",
            ("CS", "Computer Science", "Sci., Eng. and Med."),
        )
        conn.execute(
            "INSERT INTO buildings (building_id, building_name, zone, lat, lon, floor_count) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("MM-CS", "Computer Science Building", "Main Site", 52.383, -1.560, 3),
        )
        conn.executemany(
            "INSERT INTO booking_statuses (status_id, description, blocks_slot) VALUES (?, ?, ?)",
            [
                ("pending", "Pending approval", 1),
                ("confirmed", "Confirmed booking", 1),
                ("cancelled", "Cancelled booking", 0),
                ("rejected", "Rejected request", 0),
                ("completed", "Completed session", 0),
                ("no_show", "User did not attend", 0),
            ],
        )
        conn.execute(
            "INSERT INTO users "
            "(user_id, full_name, email, user_type, role, course, department_id, "
            "has_accessibility_access, is_active) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "S1001",
                "Alice Patel",
                "alice.patel@warwick.ac.uk",
                "pg_student",
                "member",
                "MSc Applied AI",
                "CS",
                0,
                1,
            ),
        )
        conn.execute(
            "INSERT INTO resources "
            "(resource_id, resource_name, resource_type, department_id, building_id, "
            "location, description, image_url, requires_approval, booking_eligibility, "
            "checkin_method, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "RM-CS-01",
                "CS Seminar Room 1",
                "group_space",
                "CS",
                "MM-CS",
                "CS0.01",
                "Group study room",
                None,
                0,
                "all_users",
                "none",
                "active",
            ),
        )
        conn.execute(
            "INSERT INTO rooms (resource_id, capacity, room_style) VALUES (?, ?, ?)",
            ("RM-CS-01", 8, "seminar"),
        )
    return db_manager
