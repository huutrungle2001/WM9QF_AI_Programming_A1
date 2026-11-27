"""Application settings and configurable booking policies."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT: Path = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class AppSettings:
    """Runtime paths and privacy configuration resolving relative to the repository root."""

    schema_path: Path = REPO_ROOT / "database" / "schema.sql"
    seed_data_path: Path = REPO_ROOT / "database" / "seed_data.json"
    db_path: Path = REPO_ROOT / "database" / "resource_bookings.db"
    charts_dir: Path = REPO_ROOT / "server" / "reports" / "charts"
    pseudonym_salt: str = "warwick-campus-booking-salt-v1"

    @classmethod
    def from_env(cls) -> AppSettings:
        """Construct settings with optional environment variable overrides."""
        defaults = cls()
        return cls(
            schema_path=Path(os.environ.get("BOOKING_SCHEMA_PATH", defaults.schema_path)),
            seed_data_path=Path(os.environ.get("BOOKING_SEED_DATA_PATH", defaults.seed_data_path)),
            db_path=Path(os.environ.get("BOOKING_DB_PATH", defaults.db_path)),
            charts_dir=Path(os.environ.get("BOOKING_CHARTS_DIR", defaults.charts_dir)),
            pseudonym_salt=os.environ.get("BOOKING_PSEUDONYM_SALT", defaults.pseudonym_salt),
        )


@dataclass(frozen=True)
class BookingPolicyConfig:
    """Tunable institutional policy knobs (duration ceilings, quotas, and k-anonymity)."""

    max_room_hours: int = 4
    max_equipment_loan_days: int = 7
    max_support_hours: int = 2
    min_cohort: int = 5
    max_active_bookings_per_user: int = 10
    booking_horizon_days: int = 30
