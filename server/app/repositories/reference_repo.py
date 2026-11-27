"""Parameterised SQLite repository for reference tables (departments, buildings, facilities, statuses)."""

from __future__ import annotations

import sqlite3
from typing import Any

from app.database import DatabaseManager
from app.domain.enums import CampusZone
from app.domain.exceptions import ConflictError, DomainError, NotFoundError, ValidationError
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


def _map_integrity_error(exc: sqlite3.IntegrityError, entity: str) -> DomainError:
    msg = str(exc)
    if "UNIQUE constraint failed" in msg or "PRIMARY KEY constraint failed" in msg:
        return ConflictError(f"{entity} already exists or violates a unique constraint ({msg}).")
    if "FOREIGN KEY constraint failed" in msg or "CHECK constraint failed" in msg or "NOT NULL" in msg:
        return ValidationError(f"{entity} violates a relational or check constraint ({msg}).")
    return ConflictError(f"{entity} integrity error ({msg}).")


class ReferenceRepository:
    """Data-access layer for departments, buildings, facilities, and booking_statuses."""

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Departments
    # ------------------------------------------------------------------
    def create_department(self, dto: DepartmentCreate) -> DepartmentOut:
        try:
            with self.db.transaction(immediate=True) as conn:
                conn.execute(
                    "INSERT INTO departments (department_id, department_name, faculty) "
                    "VALUES (?, ?, ?)",
                    (dto.department_id, dto.department_name, dto.faculty),
                )
        except sqlite3.IntegrityError as exc:
            raise _map_integrity_error(exc, f"Department '{dto.department_id}'") from exc
        return DepartmentOut(
            department_id=dto.department_id,
            department_name=dto.department_name,
            faculty=dto.faculty,
        )

    def get_department(self, department_id: str) -> DepartmentOut | None:
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT department_id, department_name, faculty "
                "FROM departments WHERE department_id = ?",
                (department_id,),
            ).fetchone()
        if row is None:
            return None
        return DepartmentOut(**dict(row))

    def list_departments(self) -> list[DepartmentOut]:
        with self.db.transaction() as conn:
            rows = conn.execute(
                "SELECT department_id, department_name, faculty "
                "FROM departments ORDER BY department_id ASC"
            ).fetchall()
        return [DepartmentOut(**dict(r)) for r in rows]

    def update_department(self, department_id: str, dto: DepartmentUpdate) -> DepartmentOut:
        assignments: list[str] = []
        params: list[Any] = []
        fields = dto.model_fields_set
        if "department_name" in fields and dto.department_name is not None:
            assignments.append("department_name = ?")
            params.append(dto.department_name)
        if "faculty" in fields and dto.faculty is not None:
            assignments.append("faculty = ?")
            params.append(dto.faculty)

        try:
            with self.db.transaction(immediate=True) as conn:
                existing = conn.execute(
                    "SELECT department_id, department_name, faculty "
                    "FROM departments WHERE department_id = ?",
                    (department_id,),
                ).fetchone()
                if existing is None:
                    raise NotFoundError(f"Department '{department_id}' not found.")
                if assignments:
                    params.append(department_id)
                    conn.execute(
                        f"UPDATE departments SET {', '.join(assignments)} WHERE department_id = ?",
                        tuple(params),
                    )
                updated = conn.execute(
                    "SELECT department_id, department_name, faculty "
                    "FROM departments WHERE department_id = ?",
                    (department_id,),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise _map_integrity_error(exc, f"Department '{department_id}'") from exc
        return DepartmentOut(**dict(updated))

    # ------------------------------------------------------------------
    # Buildings
    # ------------------------------------------------------------------
    def create_building(self, dto: BuildingCreate) -> BuildingOut:
        try:
            with self.db.transaction(immediate=True) as conn:
                conn.execute(
                    "INSERT INTO buildings (building_id, building_name, zone, lat, lon, floor_count) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        dto.building_id,
                        dto.building_name,
                        dto.zone.value,
                        dto.lat,
                        dto.lon,
                        dto.floor_count,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise _map_integrity_error(exc, f"Building '{dto.building_id}'") from exc
        return BuildingOut(
            building_id=dto.building_id,
            building_name=dto.building_name,
            zone=dto.zone,
            lat=dto.lat,
            lon=dto.lon,
            floor_count=dto.floor_count,
        )

    def get_building(self, building_id: str) -> BuildingOut | None:
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT building_id, building_name, zone, lat, lon, floor_count "
                "FROM buildings WHERE building_id = ?",
                (building_id,),
            ).fetchone()
        if row is None:
            return None
        return BuildingOut(**dict(row))

    def list_buildings(self, zone: CampusZone | str | None = None) -> list[BuildingOut]:
        sql = (
            "SELECT building_id, building_name, zone, lat, lon, floor_count "
            "FROM buildings"
        )
        params: list[Any] = []
        if zone is not None:
            zone_val = zone.value if isinstance(zone, CampusZone) else str(zone)
            sql += " WHERE zone = ?"
            params.append(zone_val)
        sql += " ORDER BY building_name ASC, building_id ASC"
        with self.db.transaction() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
        return [BuildingOut(**dict(r)) for r in rows]

    def update_building(self, building_id: str, dto: BuildingUpdate) -> BuildingOut:
        assignments: list[str] = []
        params: list[Any] = []
        fields = dto.model_fields_set
        if "building_name" in fields and dto.building_name is not None:
            assignments.append("building_name = ?")
            params.append(dto.building_name)
        if "zone" in fields and dto.zone is not None:
            assignments.append("zone = ?")
            params.append(dto.zone.value)
        if "lat" in fields:
            assignments.append("lat = ?")
            params.append(dto.lat)
        if "lon" in fields:
            assignments.append("lon = ?")
            params.append(dto.lon)
        if "floor_count" in fields and dto.floor_count is not None:
            assignments.append("floor_count = ?")
            params.append(dto.floor_count)

        try:
            with self.db.transaction(immediate=True) as conn:
                existing = conn.execute(
                    "SELECT building_id FROM buildings WHERE building_id = ?",
                    (building_id,),
                ).fetchone()
                if existing is None:
                    raise NotFoundError(f"Building '{building_id}' not found.")
                if assignments:
                    params.append(building_id)
                    conn.execute(
                        f"UPDATE buildings SET {', '.join(assignments)} WHERE building_id = ?",
                        tuple(params),
                    )
                updated = conn.execute(
                    "SELECT building_id, building_name, zone, lat, lon, floor_count "
                    "FROM buildings WHERE building_id = ?",
                    (building_id,),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise _map_integrity_error(exc, f"Building '{building_id}'") from exc
        return BuildingOut(**dict(updated))

    # ------------------------------------------------------------------
    # Facilities
    # ------------------------------------------------------------------
    def create_facility(self, dto: FacilityCreate) -> FacilityOut:
        try:
            with self.db.transaction(immediate=True) as conn:
                conn.execute(
                    "INSERT INTO facilities (facility_id, facility_name) VALUES (?, ?)",
                    (dto.facility_id, dto.facility_name),
                )
        except sqlite3.IntegrityError as exc:
            raise _map_integrity_error(exc, f"Facility '{dto.facility_id}'") from exc
        return FacilityOut(facility_id=dto.facility_id, facility_name=dto.facility_name)

    def get_facility(self, facility_id: str) -> FacilityOut | None:
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT facility_id, facility_name FROM facilities WHERE facility_id = ?",
                (facility_id,),
            ).fetchone()
        if row is None:
            return None
        return FacilityOut(**dict(row))

    def get_facility_by_name(self, facility_name: str) -> FacilityOut | None:
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT facility_id, facility_name FROM facilities WHERE facility_name = ?",
                (facility_name,),
            ).fetchone()
        if row is None:
            return None
        return FacilityOut(**dict(row))

    def list_facilities(self) -> list[FacilityOut]:
        with self.db.transaction() as conn:
            rows = conn.execute(
                "SELECT facility_id, facility_name FROM facilities ORDER BY facility_name ASC"
            ).fetchall()
        return [FacilityOut(**dict(r)) for r in rows]

    # ------------------------------------------------------------------
    # Booking Statuses (read-only lookup)
    # ------------------------------------------------------------------
    def list_booking_statuses(self) -> list[BookingStatusOut]:
        with self.db.transaction() as conn:
            rows = conn.execute(
                "SELECT status_id, description, blocks_slot "
                "FROM booking_statuses ORDER BY status_id ASC"
            ).fetchall()
        return [
            BookingStatusOut(
                status_id=r["status_id"],
                description=r["description"],
                blocks_slot=bool(r["blocks_slot"]),
            )
            for r in rows
        ]

    def get_booking_status(self, status_id: str) -> BookingStatusOut | None:
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT status_id, description, blocks_slot "
                "FROM booking_statuses WHERE status_id = ?",
                (status_id,),
            ).fetchone()
        if row is None:
            return None
        return BookingStatusOut(
            status_id=row["status_id"],
            description=row["description"],
            blocks_slot=bool(row["blocks_slot"]),
        )
