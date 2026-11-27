"""Parameterised SQLite repository for atomic CTI resources, N:M facilities, and SQL pushdown."""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Sequence
from typing import Any

from pydantic import ValidationError as PydanticValidationError

from app.database import DatabaseManager
from app.domain.enums import (
    BookingEligibility,
    CampusZone,
    CheckinMethod,
    ResourceStatus,
    ResourceType,
)
from app.domain.exceptions import ConflictError, DomainError, NotFoundError, ValidationError
from app.domain.resources import (
    ROOM_RESOURCE_TYPES,
    AcademicSupportResource,
    EquipmentResource,
    Resource,
    ResourceFactory,
    RoomResource,
)
from app.schemas.resource import (
    EquipmentDetails,
    ResourceCreate,
    ResourceDetails,
    ResourceFilter,
    ResourceOut,
    ResourceUpdate,
    RoomDetails,
    SupportDetails,
)

_BASE_RESOURCE_SELECT = """
SELECT
    r.resource_id,
    r.resource_name,
    r.resource_type,
    r.department_id,
    r.building_id,
    r.location,
    r.description,
    r.image_url,
    r.requires_approval,
    r.booking_eligibility,
    r.checkin_method,
    r.status,
    d.department_name,
    b.building_name,
    b.zone,
    b.lat,
    b.lon,
    rm.capacity AS room_capacity,
    rm.room_style AS room_style,
    eq.category AS eq_category,
    eq.quantity AS eq_quantity,
    eq.specifications AS eq_specifications,
    ss.category AS ss_category,
    ss.max_attendees AS ss_max_attendees,
    ss.host_name AS ss_host_name
FROM resources r
LEFT JOIN departments d ON r.department_id = d.department_id
LEFT JOIN buildings b ON r.building_id = b.building_id
LEFT JOIN rooms rm ON r.resource_id = rm.resource_id
LEFT JOIN equipment_items eq ON r.resource_id = eq.resource_id
LEFT JOIN support_services ss ON r.resource_id = ss.resource_id
"""


def _slugify_facility(name: str) -> str:
    slug = re.sub(r"[^A-Z0-9]+", "-", name.strip().upper()).strip("-")
    return slug or "FACILITY"


def _map_resource_integrity_error(exc: sqlite3.IntegrityError, resource_id: str) -> DomainError:
    msg = str(exc)
    if "UNIQUE constraint failed" in msg or "PRIMARY KEY constraint failed" in msg:
        return ConflictError(f"Resource '{resource_id}' already exists ({msg}).")
    if "FOREIGN KEY constraint failed" in msg or "CHECK constraint failed" in msg or "NOT NULL" in msg:
        return ValidationError(f"Resource '{resource_id}' violates a relational or check constraint ({msg}).")
    return ConflictError(f"Resource '{resource_id}' integrity error ({msg}).")


def _extract_subtype_dict(row: sqlite3.Row) -> dict[str, Any]:
    rtype = ResourceType(row["resource_type"])
    if rtype in ROOM_RESOURCE_TYPES:
        if row["room_capacity"] is None:
            raise ValidationError(f"Missing CTI rooms row for resource '{row['resource_id']}'.")
        return {
            "resource_id": row["resource_id"],
            "capacity": row["room_capacity"],
            "room_style": row["room_style"],
        }
    if rtype == ResourceType.SPECIALIST_EQUIPMENT:
        if row["eq_category"] is None:
            raise ValidationError(
                f"Missing CTI equipment_items row for resource '{row['resource_id']}'."
            )
        return {
            "resource_id": row["resource_id"],
            "category": row["eq_category"],
            "quantity": row["eq_quantity"],
            "specifications": row["eq_specifications"],
        }
    if rtype == ResourceType.ACADEMIC_SUPPORT:
        if row["ss_category"] is None:
            raise ValidationError(
                f"Missing CTI support_services row for resource '{row['resource_id']}'."
            )
        return {
            "resource_id": row["resource_id"],
            "category": row["ss_category"],
            "max_attendees": row["ss_max_attendees"],
            "host_name": row["ss_host_name"],
        }
    raise ValidationError(f"Unsupported resource_type '{rtype}'.")


def _domain_to_details(resource: Resource) -> ResourceDetails:
    if isinstance(resource, RoomResource):
        return RoomDetails(capacity=resource.capacity, room_style=resource.room_style)
    if isinstance(resource, EquipmentResource):
        return EquipmentDetails(
            category=resource.category,
            quantity=resource.quantity,
            specifications=resource.specifications,
        )
    if isinstance(resource, AcademicSupportResource):
        return SupportDetails(
            category=resource.category,
            max_attendees=resource.max_attendees,
            host_name=resource.host_name,
        )
    raise ValidationError(f"Unsupported domain resource subclass: {type(resource).__name__}")


def _hydrate_resource_out(row: sqlite3.Row, facilities: list[str]) -> ResourceOut:
    subtype_dict = _extract_subtype_dict(row)
    domain_res = ResourceFactory.from_db_rows(row, subtype_dict, facilities)
    return ResourceOut(
        resource_id=domain_res.resource_id,
        resource_name=domain_res.resource_name,
        resource_type=domain_res.resource_type,
        department_id=domain_res.department_id,
        building_id=domain_res.building_id,
        location=domain_res.location,
        description=domain_res.description,
        image_url=domain_res.image_url,
        requires_approval=domain_res.requires_approval,
        booking_eligibility=domain_res.booking_eligibility,
        checkin_method=domain_res.checkin_method,
        status=domain_res.status,
        facilities=list(domain_res.facilities),
        details=_domain_to_details(domain_res),
        department_name=row["department_name"],
        building_name=row["building_name"],
        zone=CampusZone(row["zone"]) if row["zone"] is not None else None,
        lat=row["lat"],
        lon=row["lon"],
        max_concurrent_bookings=domain_res.max_concurrent_bookings(),
    )


class ResourceRepository:
    """Data-access layer for CTI resources, N:M facilities, and Policy-to-SQL pushdown."""

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Internal CTI & Facility Transaction Helpers
    # ------------------------------------------------------------------
    def _insert_parent(self, conn: sqlite3.Connection, resource: Resource) -> None:
        conn.execute(
            "INSERT INTO resources ("
            "resource_id, resource_name, resource_type, department_id, building_id, "
            "location, description, image_url, requires_approval, booking_eligibility, "
            "checkin_method, status"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                resource.resource_id,
                resource.resource_name,
                resource.resource_type.value,
                resource.department_id,
                resource.building_id,
                resource.location,
                resource.description,
                resource.image_url,
                int(resource.requires_approval),
                resource.booking_eligibility.value,
                resource.checkin_method.value,
                resource.status.value,
            ),
        )

    def _insert_subtype(self, conn: sqlite3.Connection, resource: Resource) -> None:
        table = resource.subtype_table()
        payload = resource.subtype_payload()
        if table == "rooms":
            conn.execute(
                "INSERT INTO rooms (resource_id, capacity, room_style) VALUES (?, ?, ?)",
                (payload["resource_id"], payload["capacity"], payload["room_style"]),
            )
        elif table == "equipment_items":
            conn.execute(
                "INSERT INTO equipment_items (resource_id, category, quantity, specifications) "
                "VALUES (?, ?, ?, ?)",
                (
                    payload["resource_id"],
                    payload["category"],
                    payload["quantity"],
                    payload["specifications"],
                ),
            )
        elif table == "support_services":
            conn.execute(
                "INSERT INTO support_services (resource_id, category, max_attendees, host_name) "
                "VALUES (?, ?, ?, ?)",
                (
                    payload["resource_id"],
                    payload["category"],
                    payload["max_attendees"],
                    payload["host_name"],
                ),
            )
        else:
            raise ValidationError(f"Unsupported CTI subtype table '{table}'.")

    def _update_subtype(self, conn: sqlite3.Connection, resource: Resource) -> None:
        table = resource.subtype_table()
        payload = resource.subtype_payload()
        if table == "rooms":
            conn.execute(
                "UPDATE rooms SET capacity = ?, room_style = ? WHERE resource_id = ?",
                (payload["capacity"], payload["room_style"], payload["resource_id"]),
            )
        elif table == "equipment_items":
            conn.execute(
                "UPDATE equipment_items SET category = ?, quantity = ?, specifications = ? "
                "WHERE resource_id = ?",
                (
                    payload["category"],
                    payload["quantity"],
                    payload["specifications"],
                    payload["resource_id"],
                ),
            )
        elif table == "support_services":
            conn.execute(
                "UPDATE support_services SET category = ?, max_attendees = ?, host_name = ? "
                "WHERE resource_id = ?",
                (
                    payload["category"],
                    payload["max_attendees"],
                    payload["host_name"],
                    payload["resource_id"],
                ),
            )
        else:
            raise ValidationError(f"Unsupported CTI subtype table '{table}'.")

    def _ensure_facility_id(self, conn: sqlite3.Connection, raw_label: str) -> str:
        cleaned = raw_label.strip()
        existing = conn.execute(
            "SELECT facility_id FROM facilities "
            "WHERE LOWER(facility_name) = LOWER(?) OR LOWER(facility_id) = LOWER(?)",
            (cleaned, cleaned),
        ).fetchone()
        if existing is not None:
            return str(existing["facility_id"])

        base_slug = _slugify_facility(cleaned)
        candidate = base_slug
        suffix = 2
        while (
            conn.execute(
                "SELECT 1 FROM facilities WHERE facility_id = ?", (candidate,)
            ).fetchone()
            is not None
        ):
            candidate = f"{base_slug}-{suffix}"
            suffix += 1

        conn.execute(
            "INSERT INTO facilities (facility_id, facility_name) VALUES (?, ?)",
            (candidate, cleaned),
        )
        return candidate

    def _sync_facilities(
        self,
        conn: sqlite3.Connection,
        resource_id: str,
        facility_labels: Sequence[str],
    ) -> None:
        conn.execute("DELETE FROM resource_facilities WHERE resource_id = ?", (resource_id,))
        seen_ids: set[str] = set()
        for label in facility_labels:
            cleaned = label.strip()
            if not cleaned:
                continue
            fac_id = self._ensure_facility_id(conn, cleaned)
            if fac_id not in seen_ids:
                seen_ids.add(fac_id)
                conn.execute(
                    "INSERT INTO resource_facilities (resource_id, facility_id) VALUES (?, ?)",
                    (resource_id, fac_id),
                )

    def _fetch_facilities_map(
        self,
        conn: sqlite3.Connection,
        resource_ids: Sequence[str],
    ) -> dict[str, list[str]]:
        if not resource_ids:
            return {}
        placeholders = ", ".join("?" for _ in resource_ids)
        rows = conn.execute(
            "SELECT rf.resource_id, f.facility_name "
            "FROM resource_facilities rf "
            "JOIN facilities f ON rf.facility_id = f.facility_id "
            f"WHERE rf.resource_id IN ({placeholders}) "
            "ORDER BY f.facility_name ASC",
            tuple(resource_ids),
        ).fetchall()
        result: dict[str, list[str]] = {rid: [] for rid in resource_ids}
        for row in rows:
            result[row["resource_id"]].append(row["facility_name"])
        return result

    def _get_joined_row(self, conn: sqlite3.Connection, resource_id: str) -> sqlite3.Row | None:
        return conn.execute(
            f"{_BASE_RESOURCE_SELECT} WHERE r.resource_id = ?",
            (resource_id,),
        ).fetchone()

    # ------------------------------------------------------------------
    # Public Repository Operations
    # ------------------------------------------------------------------
    def create(self, dto: ResourceCreate) -> ResourceOut:
        domain_res = ResourceFactory.from_create_dto(dto)
        try:
            with self.db.immediate_transaction() as conn:
                self._insert_parent(conn, domain_res)
                self._insert_subtype(conn, domain_res)
                self._sync_facilities(conn, domain_res.resource_id, domain_res.facilities)
                row = self._get_joined_row(conn, domain_res.resource_id)
                fac_map = self._fetch_facilities_map(conn, [domain_res.resource_id])
        except sqlite3.IntegrityError as exc:
            raise _map_resource_integrity_error(exc, dto.resource_id) from exc

        assert row is not None
        return _hydrate_resource_out(row, fac_map.get(domain_res.resource_id, []))

    def get_by_id(
        self,
        resource_id: str,
        conn: sqlite3.Connection | None = None,
    ) -> ResourceOut | None:
        if conn is not None:
            row = self._get_joined_row(conn, resource_id)
            if row is None:
                return None
            fac_map = self._fetch_facilities_map(conn, [resource_id])
            return _hydrate_resource_out(row, fac_map.get(resource_id, []))

        with self.db.transaction() as tx_conn:
            row = self._get_joined_row(tx_conn, resource_id)
            if row is None:
                return None
            fac_map = self._fetch_facilities_map(tx_conn, [resource_id])
            return _hydrate_resource_out(row, fac_map.get(resource_id, []))

    def get_domain_resource(
        self,
        resource_id: str,
        conn: sqlite3.Connection | None = None,
    ) -> Resource:
        if conn is not None:
            row = self._get_joined_row(conn, resource_id)
            if row is None:
                raise NotFoundError(f"Resource '{resource_id}' not found.")
            fac_map = self._fetch_facilities_map(conn, [resource_id])
            return ResourceFactory.from_db_rows(
                row, _extract_subtype_dict(row), fac_map.get(resource_id, [])
            )

        with self.db.transaction() as tx_conn:
            row = self._get_joined_row(tx_conn, resource_id)
            if row is None:
                raise NotFoundError(f"Resource '{resource_id}' not found.")
            fac_map = self._fetch_facilities_map(tx_conn, [resource_id])
            return ResourceFactory.from_db_rows(
                row, _extract_subtype_dict(row), fac_map.get(resource_id, [])
            )

    def list_resources(
        self,
        filters: ResourceFilter | None = None,
        allowed_eligibilities: Sequence[str] | None = None,
    ) -> list[ResourceOut]:
        effective = filters if filters is not None else ResourceFilter()
        clauses: list[str] = []
        params: list[Any] = []

        if allowed_eligibilities is not None:
            elig_list = list(allowed_eligibilities)
            if not elig_list:
                return []
            placeholders = ", ".join("?" for _ in elig_list)
            clauses.append(f"r.booking_eligibility IN ({placeholders})")
            params.extend(elig_list)

        if effective.resource_type is not None:
            clauses.append("r.resource_type = ?")
            params.append(effective.resource_type.value)
        if effective.department_id is not None:
            clauses.append("r.department_id = ?")
            params.append(effective.department_id)
        if effective.building_id is not None:
            clauses.append("r.building_id = ?")
            params.append(effective.building_id)
        if effective.zone is not None:
            clauses.append("b.zone = ?")
            params.append(effective.zone.value)
        if effective.status is not None:
            clauses.append("r.status = ?")
            params.append(effective.status.value)
        if effective.min_capacity is not None:
            clauses.append("rm.capacity >= ?")
            params.append(effective.min_capacity)
        if effective.facility is not None:
            clauses.append(
                "EXISTS ("
                "SELECT 1 FROM resource_facilities rf "
                "JOIN facilities f ON rf.facility_id = f.facility_id "
                "WHERE rf.resource_id = r.resource_id "
                "AND (LOWER(f.facility_name) = LOWER(?) OR LOWER(f.facility_id) = LOWER(?))"
                ")"
            )
            params.extend([effective.facility, effective.facility])
        if effective.search:
            like_val = f"%{effective.search}%"
            clauses.append(
                "(r.resource_name LIKE ? OR r.location LIKE ? OR COALESCE(r.description, '') LIKE ?)"
            )
            params.extend([like_val, like_val, like_val])

        where_sql = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"{_BASE_RESOURCE_SELECT}{where_sql} ORDER BY r.resource_id ASC LIMIT ? OFFSET ?"
        params.extend([effective.limit, effective.offset])

        with self.db.transaction() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
            resource_ids = [r["resource_id"] for r in rows]
            fac_map = self._fetch_facilities_map(conn, resource_ids)

        return [_hydrate_resource_out(r, fac_map.get(r["resource_id"], [])) for r in rows]

    def update(self, resource_id: str, dto: ResourceUpdate) -> ResourceOut:
        try:
            with self.db.immediate_transaction() as conn:
                existing_row = self._get_joined_row(conn, resource_id)
                if existing_row is None:
                    raise NotFoundError(f"Resource '{resource_id}' not found.")

                existing_facs = self._fetch_facilities_map(conn, [resource_id]).get(resource_id, [])
                existing_subtype = _extract_subtype_dict(existing_row)
                fields = dto.model_fields_set

                # Build merged parent row for domain validation and SQL update
                assignments: list[str] = []
                params: list[Any] = []
                parent_merged = {k: existing_row[k] for k in existing_row.keys()}

                if "resource_name" in fields and dto.resource_name is not None:
                    assignments.append("resource_name = ?")
                    params.append(dto.resource_name)
                    parent_merged["resource_name"] = dto.resource_name
                if "department_id" in fields and dto.department_id is not None:
                    assignments.append("department_id = ?")
                    params.append(dto.department_id)
                    parent_merged["department_id"] = dto.department_id
                if "building_id" in fields:
                    assignments.append("building_id = ?")
                    params.append(dto.building_id)
                    parent_merged["building_id"] = dto.building_id
                if "location" in fields and dto.location is not None:
                    assignments.append("location = ?")
                    params.append(dto.location)
                    parent_merged["location"] = dto.location
                if "description" in fields:
                    assignments.append("description = ?")
                    params.append(dto.description)
                    parent_merged["description"] = dto.description
                if "image_url" in fields:
                    assignments.append("image_url = ?")
                    params.append(dto.image_url)
                    parent_merged["image_url"] = dto.image_url
                if "requires_approval" in fields and dto.requires_approval is not None:
                    assignments.append("requires_approval = ?")
                    params.append(int(dto.requires_approval))
                    parent_merged["requires_approval"] = int(dto.requires_approval)
                if "booking_eligibility" in fields and dto.booking_eligibility is not None:
                    assignments.append("booking_eligibility = ?")
                    params.append(dto.booking_eligibility.value)
                    parent_merged["booking_eligibility"] = dto.booking_eligibility.value
                if "checkin_method" in fields and dto.checkin_method is not None:
                    assignments.append("checkin_method = ?")
                    params.append(dto.checkin_method.value)
                    parent_merged["checkin_method"] = dto.checkin_method.value
                if "status" in fields and dto.status is not None:
                    assignments.append("status = ?")
                    params.append(dto.status.value)
                    parent_merged["status"] = dto.status.value

                merged_subtype = dict(existing_subtype)
                subtype_changed = False
                if "details" in fields and dto.details is not None:
                    subtype_changed = True
                    rtype = ResourceType(existing_row["resource_type"])
                    raw_patch = (
                        dto.details.model_dump()
                        if hasattr(dto.details, "model_dump")
                        else dict(dto.details)
                    )
                    candidate_details = {
                        k: v for k, v in merged_subtype.items() if k != "resource_id"
                    }
                    candidate_details.update(raw_patch)
                    try:
                        if rtype in ROOM_RESOURCE_TYPES:
                            validated = RoomDetails.model_validate(candidate_details)
                        elif rtype == ResourceType.SPECIALIST_EQUIPMENT:
                            validated = EquipmentDetails.model_validate(candidate_details)
                        elif rtype == ResourceType.ACADEMIC_SUPPORT:
                            validated = SupportDetails.model_validate(candidate_details)
                        else:
                            raise ValidationError(f"Unsupported resource_type '{rtype}'.")
                    except PydanticValidationError as exc:
                        raise ValidationError(f"Invalid subtype details: {exc}") from exc
                    merged_subtype = {"resource_id": resource_id, **validated.model_dump()}

                next_facilities = (
                    list(dto.facilities)
                    if ("facilities" in fields and dto.facilities is not None)
                    else existing_facs
                )

                # Validate complete merged resource through ResourceFactory before persisting
                merged_domain = ResourceFactory.from_db_rows(
                    parent_merged, merged_subtype, next_facilities
                )

                if assignments:
                    params.append(resource_id)
                    conn.execute(
                        f"UPDATE resources SET {', '.join(assignments)} WHERE resource_id = ?",
                        tuple(params),
                    )
                if subtype_changed:
                    self._update_subtype(conn, merged_domain)
                if "facilities" in fields and dto.facilities is not None:
                    self._sync_facilities(conn, resource_id, next_facilities)

                updated_row = self._get_joined_row(conn, resource_id)
                updated_facs = self._fetch_facilities_map(conn, [resource_id]).get(resource_id, [])
        except sqlite3.IntegrityError as exc:
            raise _map_resource_integrity_error(exc, resource_id) from exc

        assert updated_row is not None
        return _hydrate_resource_out(updated_row, updated_facs)

    def soft_retire(self, resource_id: str) -> ResourceOut:
        with self.db.immediate_transaction() as conn:
            cursor = conn.execute(
                "UPDATE resources SET status = ? WHERE resource_id = ?",
                (ResourceStatus.RETIRED.value, resource_id),
            )
            if cursor.rowcount == 0:
                raise NotFoundError(f"Resource '{resource_id}' not found.")
            row = self._get_joined_row(conn, resource_id)
            facs = self._fetch_facilities_map(conn, [resource_id]).get(resource_id, [])
        assert row is not None
        return _hydrate_resource_out(row, facs)
