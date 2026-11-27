"""Operational analytics, k-anonymised fairness, and PNG chart export routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import (
    get_actor_context,
    get_analytics_service,
    get_chart_service,
)
from app.domain.enums import ResourceType
from app.schemas.actor import ActorContext
from app.schemas.analytics import (
    CancellationBreakdown,
    ChartExportResult,
    DemandItem,
    FairnessRow,
    HeatmapCell,
    OverviewKPI,
    TrendPoint,
)
from app.services.analytics_service import AnalyticsService
from app.services.chart_service import ChartService

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/overview", response_model=OverviewKPI)
def get_overview(
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> OverviewKPI:
    return analytics_service.get_overview(actor, from_ts=from_ts, to_ts=to_ts)


@router.get("/demand", response_model=dict[str, list[DemandItem]])
def get_demand(
    limit: int = Query(default=10, ge=1, le=100),
    max_bookings: int = Query(default=2, ge=0),
    resource_type: ResourceType | None = Query(default=None),
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> dict[str, list[DemandItem]]:
    result = analytics_service.get_demand(
        actor,
        limit=limit,
        max_bookings=max_bookings,
        resource_type=resource_type.value if resource_type is not None else None,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    # Expose both 'most_booked' (canonical contract) and 'top_booked' (frontend alias).
    return {
        "most_booked": result["most_booked"],
        "top_booked": result["most_booked"],
        "underused": result["underused"],
    }


@router.get("/heatmap", response_model=list[HeatmapCell])
def get_heatmap(
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    resource_type: ResourceType | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> list[HeatmapCell]:
    return analytics_service.get_heatmap(
        actor,
        from_ts=from_ts,
        to_ts=to_ts,
        resource_type=resource_type.value if resource_type is not None else None,
    )


@router.get("/trends", response_model=list[TrendPoint])
def get_trends(
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    resource_type: ResourceType | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> list[TrendPoint]:
    return analytics_service.get_trends(
        actor,
        from_ts=from_ts,
        to_ts=to_ts,
        resource_type=resource_type.value if resource_type is not None else None,
    )


@router.get("/cancellations", response_model=list[CancellationBreakdown])
def get_cancellations(
    group_by: str | None = Query(default=None),
    dimension: str | None = Query(default=None),
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> list[CancellationBreakdown]:
    raw_group = group_by or dimension or "resource_type"
    effective_group = "department_id" if raw_group == "department" else raw_group
    return analytics_service.get_cancellations(
        actor,
        group_by=effective_group,
        from_ts=from_ts,
        to_ts=to_ts,
    )


@router.get("/fairness", response_model=list[FairnessRow])
def get_fairness(
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    min_cohort: int | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
) -> list[FairnessRow]:
    return analytics_service.get_course_fairness(
        actor,
        from_ts=from_ts,
        to_ts=to_ts,
        min_cohort=min_cohort,
    )


@router.post("/charts", response_model=ChartExportResult)
def export_charts(
    output_dir: str | None = Query(default=None),
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    top_limit: int = Query(default=10, ge=1, le=50),
    min_cohort: int | None = Query(default=None),
    actor: ActorContext = Depends(get_actor_context),
    chart_service: ChartService = Depends(get_chart_service),
) -> ChartExportResult:
    return chart_service.export_charts(
        actor,
        output_dir=output_dir,
        from_ts=from_ts,
        to_ts=to_ts,
        top_limit=top_limit,
        min_cohort=min_cohort,
    )

