"""Parameterised raw SQL analytics repository (100% ? placeholders, soft-delete safe)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.database import DatabaseManager
from app.domain.enums import ResourceType
from app.domain.exceptions import ValidationError
from app.schemas.analytics import (
    CancellationBreakdown,
    DemandItem,
    HeatmapCell,
    OverviewKPI,
    TrendPoint,
)

_DAY_NAMES: tuple[str, ...] = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

_CANCELLATION_GROUP_COLUMNS: dict[str, str] = {
    "resource_type": "r.resource_type",
    "department_id": "r.department_id",
}


def _validate_time_window(from_ts: int | None, to_ts: int | None) -> None:
    if from_ts is not None and to_ts is not None and from_ts > to_ts:
        raise ValidationError("from_ts must be less than or equal to to_ts.")


def _round_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(numerator / denominator, 4)


class AnalyticsRepository:
    """Read-only SQL aggregation repository for operational and fairness analytics."""

    def __init__(self, db: DatabaseManager) -> None:
        self._db = db

    @staticmethod
    def _time_clauses(
        from_ts: int | None,
        to_ts: int | None,
        *,
        alias: str = "b",
    ) -> tuple[list[str], list[Any]]:
        _validate_time_window(from_ts, to_ts)
        clauses: list[str] = []
        params: list[Any] = []
        if from_ts is not None:
            clauses.append(f"{alias}.start_time >= ?")
            params.append(from_ts)
        if to_ts is not None:
            clauses.append(f"{alias}.start_time <= ?")
            params.append(to_ts)
        return clauses, params

    def get_overview(
        self,
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> OverviewKPI:
        """Compute headline KPIs and status breakdown rates across non-deleted bookings."""
        where_clauses = ["b.deleted_at IS NULL"]
        time_clauses, params = self._time_clauses(from_ts, to_ts)
        where_clauses.extend(time_clauses)
        where_sql = " AND ".join(where_clauses)

        booking_sql = f"""
            SELECT
                COUNT(*) AS total_bookings,
                COALESCE(SUM(CASE WHEN bs.blocks_slot = 1 THEN 1 ELSE 0 END), 0) AS active_bookings,
                COALESCE(SUM(CASE WHEN b.status_id = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed_bookings,
                COALESCE(SUM(CASE WHEN b.status_id = 'pending' THEN 1 ELSE 0 END), 0) AS pending_bookings,
                COALESCE(SUM(CASE WHEN b.status_id = 'completed' THEN 1 ELSE 0 END), 0) AS completed_bookings,
                COALESCE(SUM(CASE WHEN b.status_id = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_bookings,
                COALESCE(SUM(CASE WHEN b.status_id = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected_bookings,
                COALESCE(SUM(CASE WHEN b.status_id = 'no_show' THEN 1 ELSE 0 END), 0) AS no_show_bookings
            FROM bookings b
            JOIN booking_statuses bs ON bs.status_id = b.status_id
            WHERE {where_sql}
        """

        resource_sql = """
            SELECT
                COUNT(*) AS total_resources,
                COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_resources
            FROM resources
        """

        user_sql = """
            SELECT
                COUNT(*) AS total_users,
                COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active_users
            FROM users
        """

        conn = self._db.get_connection()
        try:
            b_row = conn.execute(booking_sql, params).fetchone()
            r_row = conn.execute(resource_sql).fetchone()
            u_row = conn.execute(user_sql).fetchone()
        finally:
            conn.close()

        total = int(b_row["total_bookings"])
        active = int(b_row["active_bookings"])
        confirmed = int(b_row["confirmed_bookings"])
        pending = int(b_row["pending_bookings"])
        completed = int(b_row["completed_bookings"])
        cancelled = int(b_row["cancelled_bookings"])
        rejected = int(b_row["rejected_bookings"])
        no_show = int(b_row["no_show_bookings"])

        return OverviewKPI(
            total_bookings=total,
            active_bookings=active,
            confirmed_bookings=confirmed,
            pending_bookings=pending,
            completed_bookings=completed,
            cancelled_bookings=cancelled,
            rejected_bookings=rejected,
            no_show_bookings=no_show,
            active_rate=_round_rate(active, total),
            cancellation_rate=_round_rate(cancelled, total),
            rejection_rate=_round_rate(rejected, total),
            no_show_rate=_round_rate(no_show, total),
            total_resources=int(r_row["total_resources"]),
            active_resources=int(r_row["active_resources"]),
            total_users=int(u_row["total_users"]),
            active_users=int(u_row["active_users"]),
        )

    def get_most_booked(
        self,
        limit: int = 10,
        resource_type: str | None = None,
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> list[DemandItem]:
        """Rank resources descending by booking_count, then total_hours, then resource_id."""
        if limit < 1:
            raise ValidationError("limit must be at least 1.")

        where_clauses = ["b.deleted_at IS NULL"]
        time_clauses, params = self._time_clauses(from_ts, to_ts)
        where_clauses.extend(time_clauses)
        if resource_type is not None:
            where_clauses.append("r.resource_type = ?")
            params.append(str(resource_type))

        where_sql = " AND ".join(where_clauses)
        params.append(limit)

        sql = f"""
            SELECT
                r.resource_id,
                r.resource_name,
                r.resource_type,
                r.department_id,
                COUNT(b.booking_id) AS booking_count,
                COALESCE(SUM((b.end_time - b.start_time) / 3600.0), 0.0) AS total_hours
            FROM bookings b
            JOIN resources r ON r.resource_id = b.resource_id
            WHERE {where_sql}
            GROUP BY r.resource_id, r.resource_name, r.resource_type, r.department_id
            ORDER BY booking_count DESC, total_hours DESC, r.resource_id ASC
            LIMIT ?
        """

        conn = self._db.get_connection()
        try:
            rows = conn.execute(sql, params).fetchall()
        finally:
            conn.close()

        return [
            DemandItem(
                resource_id=row["resource_id"],
                resource_name=row["resource_name"],
                resource_type=ResourceType(row["resource_type"]),
                department_id=row["department_id"],
                booking_count=int(row["booking_count"]),
                total_hours=round(float(row["total_hours"]), 2),
            )
            for row in rows
        ]

    def get_underused(
        self,
        limit: int = 10,
        max_bookings: int = 2,
        resource_type: str | None = None,
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> list[DemandItem]:
        """List active resources with <= max_bookings (zero-booking resources first)."""
        if limit < 1:
            raise ValidationError("limit must be at least 1.")
        if max_bookings < 0:
            raise ValidationError("max_bookings must be non-negative.")

        join_clauses = ["b.resource_id = r.resource_id", "b.deleted_at IS NULL"]
        time_clauses, join_params = self._time_clauses(from_ts, to_ts)
        join_clauses.extend(time_clauses)
        join_sql = " AND ".join(join_clauses)

        where_clauses = ["r.status = 'active'"]
        where_params: list[Any] = []
        if resource_type is not None:
            where_clauses.append("r.resource_type = ?")
            where_params.append(str(resource_type))
        where_sql = " AND ".join(where_clauses)

        params = [*join_params, *where_params, max_bookings, limit]

        sql = f"""
            SELECT
                r.resource_id,
                r.resource_name,
                r.resource_type,
                r.department_id,
                COUNT(b.booking_id) AS booking_count,
                COALESCE(SUM((b.end_time - b.start_time) / 3600.0), 0.0) AS total_hours
            FROM resources r
            LEFT JOIN bookings b ON {join_sql}
            WHERE {where_sql}
            GROUP BY r.resource_id, r.resource_name, r.resource_type, r.department_id
            HAVING COUNT(b.booking_id) <= ?
            ORDER BY booking_count ASC, r.resource_id ASC
            LIMIT ?
        """

        conn = self._db.get_connection()
        try:
            rows = conn.execute(sql, params).fetchall()
        finally:
            conn.close()

        return [
            DemandItem(
                resource_id=row["resource_id"],
                resource_name=row["resource_name"],
                resource_type=ResourceType(row["resource_type"]),
                department_id=row["department_id"],
                booking_count=int(row["booking_count"]),
                total_hours=round(float(row["total_hours"]), 2),
            )
            for row in rows
        ]

    def get_busiest_times_heatmap(
        self,
        from_ts: int | None = None,
        to_ts: int | None = None,
        resource_type: str | None = None,
    ) -> list[HeatmapCell]:
        """Return a complete 7x24 (168-cell) UTC day-of-week x hour booking count matrix."""
        where_clauses = ["b.deleted_at IS NULL"]
        time_clauses, params = self._time_clauses(from_ts, to_ts)
        where_clauses.extend(time_clauses)
        if resource_type is not None:
            where_clauses.append("r.resource_type = ?")
            params.append(str(resource_type))
        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                (CAST(strftime('%w', b.start_time, 'unixepoch') AS INTEGER) + 6) % 7 AS day_of_week,
                CAST(strftime('%H', b.start_time, 'unixepoch') AS INTEGER) AS hour,
                COUNT(*) AS booking_count
            FROM bookings b
            JOIN resources r ON r.resource_id = b.resource_id
            WHERE {where_sql}
            GROUP BY day_of_week, hour
        """

        conn = self._db.get_connection()
        try:
            rows = conn.execute(sql, params).fetchall()
        finally:
            conn.close()

        counts: dict[tuple[int, int], int] = {
            (int(row["day_of_week"]), int(row["hour"])): int(row["booking_count"])
            for row in rows
        }

        return [
            HeatmapCell(
                day_of_week=day,
                day_name=_DAY_NAMES[day],
                hour=hour,
                booking_count=counts.get((day, hour), 0),
            )
            for day in range(7)
            for hour in range(24)
        ]

    def get_weekly_trends(
        self,
        from_ts: int | None = None,
        to_ts: int | None = None,
        resource_type: str | None = None,
    ) -> list[TrendPoint]:
        """Group non-deleted bookings chronologically by ISO week (UTC Monday 00:00)."""
        where_clauses = ["b.deleted_at IS NULL"]
        time_clauses, params = self._time_clauses(from_ts, to_ts)
        where_clauses.extend(time_clauses)
        if resource_type is not None:
            where_clauses.append("r.resource_type = ?")
            params.append(str(resource_type))
        where_sql = " AND ".join(where_clauses)

        week_start_expr = (
            "CAST(strftime('%s', date(b.start_time, 'unixepoch')) AS INTEGER) "
            "- (((CAST(strftime('%w', b.start_time, 'unixepoch') AS INTEGER) + 6) % 7) * 86400)"
        )

        sql = f"""
            SELECT
                {week_start_expr} AS week_start_ts,
                COUNT(*) AS booking_count,
                COALESCE(SUM((b.end_time - b.start_time) / 3600.0), 0.0) AS total_hours,
                COALESCE(SUM(CASE WHEN b.status_id = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count
            FROM bookings b
            JOIN resources r ON r.resource_id = b.resource_id
            WHERE {where_sql}
            GROUP BY week_start_ts
            ORDER BY week_start_ts ASC
        """

        conn = self._db.get_connection()
        try:
            rows = conn.execute(sql, params).fetchall()
        finally:
            conn.close()

        trends: list[TrendPoint] = []
        for row in rows:
            week_start = int(row["week_start_ts"])
            iso = datetime.fromtimestamp(week_start, tz=timezone.utc).isocalendar()
            trends.append(
                TrendPoint(
                    week_label=f"{iso.year}-W{iso.week:02d}",
                    week_start_ts=week_start,
                    booking_count=int(row["booking_count"]),
                    total_hours=round(float(row["total_hours"]), 2),
                    cancelled_count=int(row["cancelled_count"]),
                )
            )
        return trends

    def get_cancellation_breakdown(
        self,
        group_by: str = "resource_type",
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> list[CancellationBreakdown]:
        """Compute cancellation, rejection, and no-show rates grouped by a whitelisted column."""
        if group_by not in _CANCELLATION_GROUP_COLUMNS:
            allowed = ", ".join(sorted(_CANCELLATION_GROUP_COLUMNS))
            raise ValidationError(f"Invalid group_by '{group_by}'. Allowed values: {allowed}.")

        group_col = _CANCELLATION_GROUP_COLUMNS[group_by]
        where_clauses = ["b.deleted_at IS NULL"]
        time_clauses, params = self._time_clauses(from_ts, to_ts)
        where_clauses.extend(time_clauses)
        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                {group_col} AS label,
                COUNT(*) AS total_bookings,
                COALESCE(SUM(CASE WHEN b.status_id = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count,
                COALESCE(SUM(CASE WHEN b.status_id = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected_count,
                COALESCE(SUM(CASE WHEN b.status_id = 'no_show' THEN 1 ELSE 0 END), 0) AS no_show_count
            FROM bookings b
            JOIN resources r ON r.resource_id = b.resource_id
            WHERE {where_sql}
            GROUP BY {group_col}
            ORDER BY cancelled_count DESC, total_bookings DESC, label ASC
        """

        conn = self._db.get_connection()
        try:
            rows = conn.execute(sql, params).fetchall()
        finally:
            conn.close()

        results: list[CancellationBreakdown] = []
        for row in rows:
            total = int(row["total_bookings"])
            cancelled = int(row["cancelled_count"])
            rejected = int(row["rejected_count"])
            no_show = int(row["no_show_count"])
            results.append(
                CancellationBreakdown(
                    dimension=group_by,
                    label=str(row["label"]),
                    total_bookings=total,
                    cancelled_count=cancelled,
                    rejected_count=rejected,
                    no_show_count=no_show,
                    cancellation_rate=_round_rate(cancelled, total),
                    no_show_rate=_round_rate(no_show, total),
                )
            )
        return results

    def get_course_fairness_raw(
        self,
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> list[dict[str, Any]]:
        """Aggregate student bookings by non-null users.course prior to k-anonymity suppression."""
        where_clauses = [
            "b.deleted_at IS NULL",
            "u.user_type != 'staff'",
            "u.course IS NOT NULL",
            "TRIM(u.course) != ''",
        ]
        time_clauses, params = self._time_clauses(from_ts, to_ts)
        where_clauses.extend(time_clauses)
        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                u.course AS course,
                COUNT(DISTINCT b.user_id) AS unique_users,
                COUNT(b.booking_id) AS booking_count,
                COALESCE(SUM((b.end_time - b.start_time) / 3600.0), 0.0) AS total_hours
            FROM bookings b
            JOIN users u ON u.user_id = b.user_id
            WHERE {where_sql}
            GROUP BY u.course
            ORDER BY booking_count DESC, total_hours DESC, u.course ASC
        """

        conn = self._db.get_connection()
        try:
            rows = conn.execute(sql, params).fetchall()
        finally:
            conn.close()

        return [
            {
                "course": str(row["course"]),
                "unique_users": int(row["unique_users"]),
                "booking_count": int(row["booking_count"]),
                "total_hours": float(row["total_hours"]),
            }
            for row in rows
        ]

