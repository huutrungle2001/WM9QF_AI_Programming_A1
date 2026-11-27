"""Parameterised SQLite repository for bookings, overlap queries, and soft delete."""

from __future__ import annotations

import sqlite3
import time
from collections.abc import Sequence
from typing import Any

from app.database import DatabaseManager
from app.domain.enums import ResourceType
from app.domain.exceptions import ConflictError, DomainError, NotFoundError, ValidationError
from app.schemas.booking import BookingFilter, BookingOut

_UNSET: Any = object()

_BASE_BOOKING_SELECT = """
SELECT
    b.booking_id,
    b.user_id,
    u.full_name AS user_name,
    u.course AS course,
    r.department_id AS department_id,
    b.resource_id,
    r.resource_name AS resource_name,
    r.resource_type AS resource_type,
    b.start_time,
    b.end_time,
    b.status_id,
    b.purpose,
    b.notes,
    b.created_at,
    b.updated_at
FROM bookings b
JOIN users u ON b.user_id = u.user_id
JOIN resources r ON b.resource_id = r.resource_id
"""


def _row_to_booking(row: sqlite3.Row) -> BookingOut:
    return BookingOut(
        booking_id=int(row["booking_id"]),
        user_id=row["user_id"],
        user_name=row["user_name"],
        course=row["course"],
        department_id=row["department_id"],
        resource_id=row["resource_id"],
        resource_name=row["resource_name"],
        resource_type=ResourceType(row["resource_type"]) if row["resource_type"] else None,
        start_time=int(row["start_time"]),
        end_time=int(row["end_time"]),
        status_id=row["status_id"],
        purpose=row["purpose"],
        notes=row["notes"],
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
    )


def _map_booking_integrity_error(exc: sqlite3.IntegrityError) -> DomainError:
    msg = str(exc)
    if "FOREIGN KEY constraint failed" in msg or "CHECK constraint failed" in msg or "NOT NULL" in msg:
        return ValidationError(f"Booking violates a relational or check constraint ({msg}).")
    return ConflictError(f"Booking integrity error ({msg}).")


class BookingRepository:
    """Data-access layer for bookings with blocks_slot=1 overlap checks and soft delete."""

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Overlap & Availability Counts (strict adjacent-safe inequalities)
    # ------------------------------------------------------------------
    def count_resource_overlaps(
        self,
        conn: sqlite3.Connection,
        resource_id: str,
        start_time: int,
        end_time: int,
        exclude_booking_id: int | None = None,
    ) -> int:
        sql = (
            "SELECT COUNT(*) AS cnt "
            "FROM bookings b "
            "JOIN booking_statuses bs ON b.status_id = bs.status_id "
            "WHERE b.resource_id = ? "
            "AND bs.blocks_slot = 1 "
            "AND b.deleted_at IS NULL "
            "AND b.start_time < ? "
            "AND b.end_time > ?"
        )
        params: list[Any] = [resource_id, end_time, start_time]
        if exclude_booking_id is not None:
            sql += " AND b.booking_id != ?"
            params.append(exclude_booking_id)
        row = conn.execute(sql, tuple(params)).fetchone()
        return int(row["cnt"]) if row is not None else 0

    def count_user_overlaps(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        start_time: int,
        end_time: int,
        exclude_booking_id: int | None = None,
    ) -> int:
        sql = (
            "SELECT COUNT(*) AS cnt "
            "FROM bookings b "
            "JOIN booking_statuses bs ON b.status_id = bs.status_id "
            "WHERE b.user_id = ? "
            "AND bs.blocks_slot = 1 "
            "AND b.deleted_at IS NULL "
            "AND b.start_time < ? "
            "AND b.end_time > ?"
        )
        params: list[Any] = [user_id, end_time, start_time]
        if exclude_booking_id is not None:
            sql += " AND b.booking_id != ?"
            params.append(exclude_booking_id)
        row = conn.execute(sql, tuple(params)).fetchone()
        return int(row["cnt"]) if row is not None else 0

    def count_active_bookings_by_resource(
        self,
        resource_ids: Sequence[str],
        start_time: int,
        end_time: int,
    ) -> dict[str, int]:
        ids = list(resource_ids)
        if not ids:
            return {}
        placeholders = ", ".join("?" for _ in ids)
        sql = (
            "SELECT b.resource_id, COUNT(*) AS cnt "
            "FROM bookings b "
            "JOIN booking_statuses bs ON b.status_id = bs.status_id "
            f"WHERE b.resource_id IN ({placeholders}) "
            "AND bs.blocks_slot = 1 "
            "AND b.deleted_at IS NULL "
            "AND b.start_time < ? "
            "AND b.end_time > ? "
            "GROUP BY b.resource_id"
        )
        params: list[Any] = [*ids, end_time, start_time]
        with self.db.transaction() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
        return {str(r["resource_id"]): int(r["cnt"]) for r in rows}

    # ------------------------------------------------------------------
    # CRUD & Soft Delete
    # ------------------------------------------------------------------
    def insert(
        self,
        conn: sqlite3.Connection | None,
        *,
        user_id: str,
        resource_id: str,
        start_time: int,
        end_time: int,
        status_id: str,
        purpose: str | None = None,
        notes: str | None = None,
        now_ts: int | None = None,
    ) -> int:
        ts = int(time.time()) if now_ts is None else now_ts
        sql = (
            "INSERT INTO bookings "
            "(user_id, resource_id, start_time, end_time, status_id, purpose, notes, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        params = (user_id, resource_id, start_time, end_time, status_id, purpose, notes, ts, ts)
        try:
            if conn is not None:
                cursor = conn.execute(sql, params)
                return int(cursor.lastrowid)
            with self.db.immediate_transaction() as tx_conn:
                cursor = tx_conn.execute(sql, params)
                return int(cursor.lastrowid)
        except sqlite3.IntegrityError as exc:
            raise _map_booking_integrity_error(exc) from exc

    def get_by_id(
        self,
        booking_id: int,
        *,
        include_deleted: bool = False,
        conn: sqlite3.Connection | None = None,
    ) -> BookingOut | None:
        sql = f"{_BASE_BOOKING_SELECT} WHERE b.booking_id = ?"
        if not include_deleted:
            sql += " AND b.deleted_at IS NULL"
        if conn is not None:
            row = conn.execute(sql, (booking_id,)).fetchone()
        else:
            with self.db.transaction() as tx_conn:
                row = tx_conn.execute(sql, (booking_id,)).fetchone()
        return _row_to_booking(row) if row is not None else None

    def list_bookings(self, filters: BookingFilter | None = None) -> list[BookingOut]:
        effective = filters if filters is not None else BookingFilter()
        clauses: list[str] = ["b.deleted_at IS NULL"]
        params: list[Any] = []

        if effective.user_id is not None:
            clauses.append("b.user_id = ?")
            params.append(effective.user_id)
        if effective.resource_id is not None:
            clauses.append("b.resource_id = ?")
            params.append(effective.resource_id)
        if effective.resource_type is not None:
            clauses.append("r.resource_type = ?")
            params.append(effective.resource_type.value)
        if effective.department_id is not None:
            clauses.append("r.department_id = ?")
            params.append(effective.department_id)
        if effective.course is not None:
            clauses.append("u.course = ?")
            params.append(effective.course)
        if effective.status_id is not None:
            clauses.append("b.status_id = ?")
            params.append(effective.status_id)
        if effective.from_ts is not None:
            clauses.append("b.start_time >= ?")
            params.append(effective.from_ts)
        if effective.to_ts is not None:
            clauses.append("b.start_time <= ?")
            params.append(effective.to_ts)

        sql = (
            f"{_BASE_BOOKING_SELECT} "
            f"WHERE {' AND '.join(clauses)} "
            "ORDER BY b.start_time ASC, b.booking_id ASC "
            "LIMIT ? OFFSET ?"
        )
        params.extend([effective.limit, effective.offset])

        with self.db.transaction() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
        return [_row_to_booking(r) for r in rows]

    def update(
        self,
        conn: sqlite3.Connection | None,
        booking_id: int,
        *,
        start_time: int | None = None,
        end_time: int | None = None,
        purpose: str | None = _UNSET,
        notes: str | None = _UNSET,
        updated_at: int | None = None,
    ) -> BookingOut:
        ts = int(time.time()) if updated_at is None else updated_at
        assignments: list[str] = ["updated_at = ?"]
        params: list[Any] = [ts]

        if start_time is not None:
            assignments.append("start_time = ?")
            params.append(start_time)
        if end_time is not None:
            assignments.append("end_time = ?")
            params.append(end_time)
        if purpose is not _UNSET:
            assignments.append("purpose = ?")
            params.append(purpose)
        if notes is not _UNSET:
            assignments.append("notes = ?")
            params.append(notes)

        params.append(booking_id)
        sql = (
            f"UPDATE bookings SET {', '.join(assignments)} "
            "WHERE booking_id = ? AND deleted_at IS NULL"
        )

        try:
            if conn is not None:
                cursor = conn.execute(sql, tuple(params))
                if cursor.rowcount == 0:
                    raise NotFoundError(f"Booking '{booking_id}' not found.")
                updated = self.get_by_id(booking_id, conn=conn)
            else:
                with self.db.immediate_transaction() as tx_conn:
                    cursor = tx_conn.execute(sql, tuple(params))
                    if cursor.rowcount == 0:
                        raise NotFoundError(f"Booking '{booking_id}' not found.")
                    updated = self.get_by_id(booking_id, conn=tx_conn)
        except sqlite3.IntegrityError as exc:
            raise _map_booking_integrity_error(exc) from exc

        assert updated is not None
        return updated

    def update_status(
        self,
        booking_id: int,
        status_id: str,
        *,
        notes: str | None = None,
        updated_at: int | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> BookingOut:
        ts = int(time.time()) if updated_at is None else updated_at
        assignments = ["status_id = ?", "updated_at = ?"]
        params: list[Any] = [status_id, ts]
        if notes is not None:
            assignments.append("notes = ?")
            params.append(notes)
        params.append(booking_id)

        sql = (
            f"UPDATE bookings SET {', '.join(assignments)} "
            "WHERE booking_id = ? AND deleted_at IS NULL"
        )

        try:
            if conn is not None:
                cursor = conn.execute(sql, tuple(params))
                if cursor.rowcount == 0:
                    raise NotFoundError(f"Booking '{booking_id}' not found.")
                updated = self.get_by_id(booking_id, conn=conn)
            else:
                with self.db.immediate_transaction() as tx_conn:
                    cursor = tx_conn.execute(sql, tuple(params))
                    if cursor.rowcount == 0:
                        raise NotFoundError(f"Booking '{booking_id}' not found.")
                    updated = self.get_by_id(booking_id, conn=tx_conn)
        except sqlite3.IntegrityError as exc:
            raise _map_booking_integrity_error(exc) from exc

        assert updated is not None
        return updated

    def soft_delete(self, booking_id: int, deleted_at: int | None = None) -> None:
        ts = int(time.time()) if deleted_at is None else deleted_at
        with self.db.immediate_transaction() as conn:
            cursor = conn.execute(
                "UPDATE bookings SET deleted_at = ?, updated_at = ? "
                "WHERE booking_id = ? AND deleted_at IS NULL",
                (ts, ts, booking_id),
            )
            if cursor.rowcount == 0:
                raise NotFoundError(f"Booking '{booking_id}' not found.")
