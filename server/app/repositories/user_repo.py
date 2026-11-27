"""Parameterised SQLite repository for campus users with soft deactivation."""

from __future__ import annotations

import sqlite3
from typing import Any

from app.database import DatabaseManager
from app.domain.enums import Role, UserType
from app.domain.exceptions import ConflictError, DomainError, NotFoundError, ValidationError
from app.schemas.user import UserCreate, UserOut, UserUpdate

_USER_COLUMNS = (
    "user_id, full_name, email, user_type, role, course, "
    "department_id, has_accessibility_access, is_active"
)


def _row_to_user(row: sqlite3.Row) -> UserOut:
    return UserOut(
        user_id=row["user_id"],
        full_name=row["full_name"],
        email=row["email"],
        user_type=UserType(row["user_type"]),
        role=Role(row["role"]),
        course=row["course"],
        department_id=row["department_id"],
        has_accessibility_access=bool(row["has_accessibility_access"]),
        is_active=bool(row["is_active"]),
    )


def _map_user_integrity_error(exc: sqlite3.IntegrityError, user_id: str) -> DomainError:
    msg = str(exc)
    if "UNIQUE constraint failed" in msg or "PRIMARY KEY constraint failed" in msg:
        return ConflictError(f"User '{user_id}' conflicts with an existing user_id or email ({msg}).")
    if "FOREIGN KEY constraint failed" in msg or "CHECK constraint failed" in msg or "NOT NULL" in msg:
        return ValidationError(f"User '{user_id}' violates a relational or check constraint ({msg}).")
    return ConflictError(f"User '{user_id}' integrity error ({msg}).")


class UserRepository:
    """Data-access layer for users; never performs hard deletes."""

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def create(self, dto: UserCreate) -> UserOut:
        try:
            with self.db.transaction(immediate=True) as conn:
                conn.execute(
                    f"INSERT INTO users ({_USER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        dto.user_id,
                        dto.full_name,
                        dto.email,
                        dto.user_type.value,
                        dto.role.value,
                        dto.course,
                        dto.department_id,
                        int(dto.has_accessibility_access),
                        int(dto.is_active),
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise _map_user_integrity_error(exc, dto.user_id) from exc

        return UserOut(
            user_id=dto.user_id,
            full_name=dto.full_name,
            email=dto.email,
            user_type=dto.user_type,
            role=dto.role,
            course=dto.course,
            department_id=dto.department_id,
            has_accessibility_access=dto.has_accessibility_access,
            is_active=dto.is_active,
        )

    def get_by_id(self, user_id: str, conn: sqlite3.Connection | None = None) -> UserOut | None:
        sql = f"SELECT {_USER_COLUMNS} FROM users WHERE user_id = ?"
        if conn is not None:
            row = conn.execute(sql, (user_id,)).fetchone()
        else:
            with self.db.transaction() as tx_conn:
                row = tx_conn.execute(sql, (user_id,)).fetchone()
        return _row_to_user(row) if row is not None else None

    def list_users(
        self,
        *,
        role: Role | str | None = None,
        user_type: UserType | str | None = None,
        department_id: str | None = None,
        course: str | None = None,
        is_active: bool | None = None,
        search: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[UserOut]:
        clauses: list[str] = []
        params: list[Any] = []

        if role is not None:
            clauses.append("role = ?")
            params.append(role.value if isinstance(role, Role) else str(role))
        if user_type is not None:
            clauses.append("user_type = ?")
            params.append(user_type.value if isinstance(user_type, UserType) else str(user_type))
        if department_id is not None:
            clauses.append("department_id = ?")
            params.append(department_id)
        if course is not None:
            clauses.append("course = ?")
            params.append(course)
        if is_active is not None:
            clauses.append("is_active = ?")
            params.append(1 if is_active else 0)
        if search:
            like_val = f"%{search}%"
            clauses.append("(full_name LIKE ? OR email LIKE ? OR user_id LIKE ?)")
            params.extend([like_val, like_val, like_val])

        where_sql = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT {_USER_COLUMNS} FROM users{where_sql} ORDER BY user_id ASC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with self.db.transaction() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
        return [_row_to_user(r) for r in rows]

    def update(self, user_id: str, dto: UserUpdate) -> UserOut:
        assignments: list[str] = []
        params: list[Any] = []
        fields = dto.model_fields_set

        if "full_name" in fields and dto.full_name is not None:
            assignments.append("full_name = ?")
            params.append(dto.full_name)
        if "email" in fields and dto.email is not None:
            assignments.append("email = ?")
            params.append(dto.email)
        if "user_type" in fields and dto.user_type is not None:
            assignments.append("user_type = ?")
            params.append(dto.user_type.value)
        if "role" in fields and dto.role is not None:
            assignments.append("role = ?")
            params.append(dto.role.value)
        if "course" in fields:
            assignments.append("course = ?")
            params.append(dto.course)
        if "department_id" in fields and dto.department_id is not None:
            assignments.append("department_id = ?")
            params.append(dto.department_id)
        if "has_accessibility_access" in fields and dto.has_accessibility_access is not None:
            assignments.append("has_accessibility_access = ?")
            params.append(int(dto.has_accessibility_access))
        if "is_active" in fields and dto.is_active is not None:
            assignments.append("is_active = ?")
            params.append(int(dto.is_active))

        try:
            with self.db.transaction(immediate=True) as conn:
                existing = conn.execute(
                    "SELECT user_id FROM users WHERE user_id = ?", (user_id,)
                ).fetchone()
                if existing is None:
                    raise NotFoundError(f"User '{user_id}' not found.")
                if assignments:
                    params.append(user_id)
                    conn.execute(
                        f"UPDATE users SET {', '.join(assignments)} WHERE user_id = ?",
                        tuple(params),
                    )
                row = conn.execute(
                    f"SELECT {_USER_COLUMNS} FROM users WHERE user_id = ?", (user_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise _map_user_integrity_error(exc, user_id) from exc

        return _row_to_user(row)

    def soft_deactivate(self, user_id: str) -> UserOut:
        with self.db.transaction(immediate=True) as conn:
            cursor = conn.execute(
                "UPDATE users SET is_active = 0 WHERE user_id = ?", (user_id,)
            )
            if cursor.rowcount == 0:
                raise NotFoundError(f"User '{user_id}' not found.")
            row = conn.execute(
                f"SELECT {_USER_COLUMNS} FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
        return _row_to_user(row)
