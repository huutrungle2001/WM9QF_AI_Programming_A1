"""Role-guarded analytics orchestration with k-anonymity small-cohort suppression."""

from __future__ import annotations

from app.config import BookingPolicyConfig
from app.database import DatabaseManager
from app.domain.enums import Role
from app.domain.exceptions import ForbiddenError, ValidationError
from app.repositories.analytics_repo import AnalyticsRepository
from app.schemas.actor import ActorContext
from app.schemas.analytics import (
    CancellationBreakdown,
    DemandItem,
    FairnessRow,
    HeatmapCell,
    OverviewKPI,
    TrendPoint,
)


class AnalyticsService:
    """Provides operational and privacy-safe fairness analytics to authorised roles."""

    ALLOWED_ROLES: frozenset[Role] = frozenset(
        {
            Role.ADMIN,
            Role.MANAGER,
            Role.STUDENT_SERVICES,
        }
    )

    def __init__(
        self,
        db: DatabaseManager,
        policy_config: BookingPolicyConfig | None = None,
    ) -> None:
        self._db = db
        self._repo = AnalyticsRepository(db)
        self._policy_config = policy_config or BookingPolicyConfig()

    @property
    def policy_config(self) -> BookingPolicyConfig:
        """Expose active booking policy configuration (e.g. k-anonymity threshold)."""
        return self._policy_config

    def _require_analytics_access(self, actor: ActorContext) -> None:
        if actor.role not in self.ALLOWED_ROLES:
            raise ForbiddenError(
                f"Role '{actor.role.value}' is not authorised to access analytics reports."
            )

    def get_overview(
        self,
        actor: ActorContext,
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> OverviewKPI:
        """Return headline booking, resource, and user KPIs."""
        self._require_analytics_access(actor)
        return self._repo.get_overview(from_ts=from_ts, to_ts=to_ts)

    def get_demand(
        self,
        actor: ActorContext,
        limit: int = 10,
        max_bookings: int = 2,
        resource_type: str | None = None,
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> dict[str, list[DemandItem]]:
        """Return both top-booked and underused (including zero-booking) resources."""
        self._require_analytics_access(actor)
        most_booked = self._repo.get_most_booked(
            limit=limit,
            resource_type=resource_type,
            from_ts=from_ts,
            to_ts=to_ts,
        )
        underused = self._repo.get_underused(
            limit=limit,
            max_bookings=max_bookings,
            resource_type=resource_type,
            from_ts=from_ts,
            to_ts=to_ts,
        )
        return {
            "most_booked": most_booked,
            "underused": underused,
        }

    def get_heatmap(
        self,
        actor: ActorContext,
        from_ts: int | None = None,
        to_ts: int | None = None,
        resource_type: str | None = None,
    ) -> list[HeatmapCell]:
        """Return the full 7x24 UTC demand heatmap grid."""
        self._require_analytics_access(actor)
        return self._repo.get_busiest_times_heatmap(
            from_ts=from_ts,
            to_ts=to_ts,
            resource_type=resource_type,
        )

    def get_trends(
        self,
        actor: ActorContext,
        from_ts: int | None = None,
        to_ts: int | None = None,
        resource_type: str | None = None,
    ) -> list[TrendPoint]:
        """Return weekly ISO booking trends to highlight semester pressure periods."""
        self._require_analytics_access(actor)
        return self._repo.get_weekly_trends(
            from_ts=from_ts,
            to_ts=to_ts,
            resource_type=resource_type,
        )

    def get_cancellations(
        self,
        actor: ActorContext,
        group_by: str = "resource_type",
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> list[CancellationBreakdown]:
        """Return cancellation, rejection, and no-show breakdowns by a whitelisted dimension."""
        self._require_analytics_access(actor)
        return self._repo.get_cancellation_breakdown(
            group_by=group_by,
            from_ts=from_ts,
            to_ts=to_ts,
        )

    def get_course_fairness(
        self,
        actor: ActorContext,
        from_ts: int | None = None,
        to_ts: int | None = None,
        min_cohort: int | None = None,
    ) -> list[FairnessRow]:
        """Return per-course usage with k-anonymity suppression for small student cohorts.

        Cohorts with fewer than threshold unique students (default policy_config.min_cohort)
        are merged into a single 'Other (<k)' bucket so individual students cannot be re-identified.
        """
        self._require_analytics_access(actor)
        threshold = self._policy_config.min_cohort if min_cohort is None else min_cohort
        if threshold < 1:
            raise ValidationError("min_cohort must be at least 1.")

        raw_rows = self._repo.get_course_fairness_raw(from_ts=from_ts, to_ts=to_ts)

        visible: list[FairnessRow] = []
        suppressed_users = 0
        suppressed_bookings = 0
        suppressed_hours = 0.0

        for row in raw_rows:
            unique_users = int(row["unique_users"])
            booking_count = int(row["booking_count"])
            total_hours = float(row["total_hours"])

            if unique_users < threshold:
                suppressed_users += unique_users
                suppressed_bookings += booking_count
                suppressed_hours += total_hours
            else:
                avg_hours = round(total_hours / unique_users, 2) if unique_users > 0 else 0.0
                visible.append(
                    FairnessRow(
                        course=str(row["course"]),
                        unique_users=unique_users,
                        booking_count=booking_count,
                        total_hours=round(total_hours, 2),
                        avg_hours_per_user=avg_hours,
                        is_suppressed=False,
                    )
                )

        if suppressed_bookings > 0 or suppressed_users > 0:
            avg_suppressed = (
                round(suppressed_hours / suppressed_users, 2) if suppressed_users > 0 else 0.0
            )
            visible.append(
                FairnessRow(
                    course=f"Other (<{threshold})",
                    unique_users=suppressed_users,
                    booking_count=suppressed_bookings,
                    total_hours=round(suppressed_hours, 2),
                    avg_hours_per_user=avg_suppressed,
                    is_suppressed=True,
                )
            )

        return visible

