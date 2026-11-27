"""Headless Matplotlib chart generator exporting presentation-ready PNG visualisations."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

from app.config import AppSettings, BookingPolicyConfig  # noqa: E402
from app.database import DatabaseManager  # noqa: E402
from app.domain.enums import ResourceType  # noqa: E402
from app.schemas.actor import ActorContext  # noqa: E402
from app.schemas.analytics import (  # noqa: E402
    ChartExportResult,
    DemandItem,
    FairnessRow,
    HeatmapCell,
    OverviewKPI,
    TrendPoint,
)
from app.services.analytics_service import AnalyticsService  # noqa: E402

_DPI = 150
_TYPE_COLORS: dict[ResourceType, str] = {
    ResourceType.GROUP_SPACE: "#2563EB",
    ResourceType.STUDY_ROOM: "#0D9488",
    ResourceType.COMPUTER_LAB: "#7C3AED",
    ResourceType.SPECIALIST_EQUIPMENT: "#EA580C",
    ResourceType.ACADEMIC_SUPPORT: "#DB2777",
}
_TYPE_LABELS: dict[ResourceType, str] = {
    ResourceType.GROUP_SPACE: "Group Space",
    ResourceType.STUDY_ROOM: "Study Room",
    ResourceType.COMPUTER_LAB: "Computer Lab",
    ResourceType.SPECIALIST_EQUIPMENT: "Specialist Equipment",
    ResourceType.ACADEMIC_SUPPORT: "Academic Support",
}


def _truncate_label(text: str, max_len: int = 34) -> str:
    return text if len(text) <= max_len else f"{text[: max_len - 1]}…"


def _style_axes(ax: plt.Axes) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#CBD5E1")
    ax.spines["bottom"].set_color("#CBD5E1")
    ax.tick_params(colors="#334155", labelsize=9)


class ChartService:
    """Exports the 4 canonical analytics PNG charts using the headless Agg backend."""

    CHART_FILENAMES: tuple[str, ...] = (
        "top_booked_resources.png",
        "busiest_times_heatmap.png",
        "weekly_booking_trends.png",
        "course_fairness_and_status.png",
    )

    def __init__(
        self,
        analytics_or_db: AnalyticsService | DatabaseManager,
        default_output_dir: Path | str | None = None,
        policy_config: BookingPolicyConfig | None = None,
    ) -> None:
        if isinstance(analytics_or_db, DatabaseManager):
            self._analytics = AnalyticsService(analytics_or_db, policy_config=policy_config)
        else:
            self._analytics = analytics_or_db
        self._default_output_dir = (
            Path(default_output_dir) if default_output_dir is not None else AppSettings().charts_dir
        )

    def export_charts(
        self,
        actor: ActorContext,
        output_dir: Path | str | None = None,
        *,
        from_ts: int | None = None,
        to_ts: int | None = None,
        top_limit: int = 10,
        min_cohort: int | None = None,
    ) -> ChartExportResult:
        """Query analytics (enforcing RBAC) and export all 4 PNG charts to output_dir."""
        overview = self._analytics.get_overview(actor, from_ts=from_ts, to_ts=to_ts)
        demand = self._analytics.get_demand(actor, limit=top_limit, from_ts=from_ts, to_ts=to_ts)
        heatmap = self._analytics.get_heatmap(actor, from_ts=from_ts, to_ts=to_ts)
        trends = self._analytics.get_trends(actor, from_ts=from_ts, to_ts=to_ts)
        fairness = self._analytics.get_course_fairness(
            actor, from_ts=from_ts, to_ts=to_ts, min_cohort=min_cohort
        )

        out_dir = Path(output_dir) if output_dir is not None else self._default_output_dir
        out_dir.mkdir(parents=True, exist_ok=True)

        self._render_top_booked_resources(
            demand["most_booked"], out_dir / "top_booked_resources.png"
        )
        self._render_busiest_times_heatmap(heatmap, out_dir / "busiest_times_heatmap.png")
        self._render_weekly_booking_trends(trends, out_dir / "weekly_booking_trends.png")
        effective_k = (
            min_cohort
            if min_cohort is not None
            else self._analytics.policy_config.min_cohort
        )
        self._render_course_fairness_and_status(
            fairness, overview, out_dir / "course_fairness_and_status.png", min_cohort=effective_k
        )

        return ChartExportResult(
            output_dir=str(out_dir),
            generated_files=list(self.CHART_FILENAMES),
        )

    @staticmethod
    def _render_top_booked_resources(items: list[DemandItem], output_path: Path) -> None:
        fig, ax = plt.subplots(figsize=(10.5, 6.2), dpi=_DPI)
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")
        try:
            ax.set_title(
                "Top Booked Campus Learning Resources",
                fontsize=14,
                fontweight="bold",
                color="#0F172A",
                pad=14,
            )
            if not items:
                ax.text(
                    0.5,
                    0.5,
                    "No booking records available for the selected range.",
                    ha="center",
                    va="center",
                    fontsize=11,
                    color="#64748B",
                    transform=ax.transAxes,
                )
                ax.axis("off")
            else:
                labels = [
                    f"{_truncate_label(item.resource_name, 30)} ({item.department_id})"
                    for item in items
                ]
                counts = [item.booking_count for item in items]
                colors = [_TYPE_COLORS.get(item.resource_type, "#3B82F6") for item in items]
                y_pos = list(range(len(items)))

                bars = ax.barh(y_pos, counts, color=colors, height=0.64, edgecolor="none")
                ax.set_yticks(y_pos)
                ax.set_yticklabels(labels)
                ax.invert_yaxis()
                ax.set_xlabel("Total Non-Deleted Bookings", fontsize=10, color="#334155", labelpad=8)
                ax.grid(axis="x", linestyle="--", alpha=0.35, color="#94A3B8")
                ax.set_axisbelow(True)
                _style_axes(ax)

                max_count = max(counts)
                ax.set_xlim(0, max_count * 1.28 + 0.5)
                for bar, item in zip(bars, items):
                    width = bar.get_width()
                    ax.text(
                        width + max(max_count * 0.015, 0.15),
                        bar.get_y() + bar.get_height() / 2.0,
                        f"{item.booking_count} ({item.total_hours:.1f}h)",
                        va="center",
                        ha="left",
                        fontsize=8.5,
                        color="#1E293B",
                        fontweight="medium",
                    )

                present_types = list(dict.fromkeys(item.resource_type for item in items))
                legend_handles = [
                    Patch(facecolor=_TYPE_COLORS[rt], label=_TYPE_LABELS[rt])
                    for rt in present_types
                    if rt in _TYPE_COLORS
                ]
                if legend_handles:
                    ax.legend(
                        handles=legend_handles,
                        title="Resource Type",
                        loc="lower right",
                        frameon=True,
                        facecolor="#F8FAFC",
                        edgecolor="#E2E8F0",
                        fontsize=8.5,
                        title_fontsize=8.5,
                    )

            fig.tight_layout()
            fig.savefig(output_path, dpi=_DPI, bbox_inches="tight")
        finally:
            plt.close(fig)

    @staticmethod
    def _render_busiest_times_heatmap(cells: list[HeatmapCell], output_path: Path) -> None:
        matrix = [[0 for _ in range(24)] for _ in range(7)]
        for cell in cells:
            matrix[cell.day_of_week][cell.hour] = cell.booking_count

        max_val = max((cell.booking_count for cell in cells), default=0)
        peak_cell = max(cells, key=lambda c: c.booking_count, default=None)

        fig, ax = plt.subplots(figsize=(13.0, 5.2), dpi=_DPI)
        fig.patch.set_facecolor("white")
        try:
            vmax = max(max_val, 1)
            im = ax.imshow(matrix, aspect="auto", cmap="YlGnBu", vmin=0, vmax=vmax)

            day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            hour_labels = [f"{h:02d}:00" for h in range(24)]
            ax.set_yticks(range(7))
            ax.set_yticklabels(day_labels, fontsize=9.5, fontweight="medium", color="#1E293B")
            ax.set_xticks(range(24))
            ax.set_xticklabels(hour_labels, rotation=45, ha="right", fontsize=8.5, color="#334155")
            ax.set_xlabel("Start Hour (UTC)", fontsize=10, color="#334155", labelpad=8)
            ax.set_ylabel("Day of Week", fontsize=10, color="#334155", labelpad=8)

            subtitle = (
                f"Peak Slot: {peak_cell.day_name} {peak_cell.hour:02d}:00 UTC "
                f"({peak_cell.booking_count} bookings)"
                if peak_cell is not None and peak_cell.booking_count > 0
                else "No bookings in selected range"
            )
            ax.set_title(
                f"Campus Resource Demand Heatmap (Day × Hour UTC)\n{subtitle}",
                fontsize=13,
                fontweight="bold",
                color="#0F172A",
                pad=12,
            )

            ax.set_xticks([x - 0.5 for x in range(1, 24)], minor=True)
            ax.set_yticks([y - 0.5 for y in range(1, 7)], minor=True)
            ax.grid(which="minor", color="white", linestyle="-", linewidth=1.2)
            ax.tick_params(which="minor", bottom=False, left=False)

            threshold = vmax * 0.55
            for d in range(7):
                for h in range(24):
                    val = matrix[d][h]
                    if val > 0:
                        txt_color = "white" if val >= threshold else "#0F172A"
                        ax.text(
                            h,
                            d,
                            str(val),
                            ha="center",
                            va="center",
                            color=txt_color,
                            fontsize=7.5,
                            fontweight="bold",
                        )

            cbar = fig.colorbar(im, ax=ax, pad=0.02, shrink=0.92)
            cbar.set_label("Bookings", fontsize=9.5, color="#334155")
            cbar.ax.tick_params(labelsize=8.5, colors="#334155")

            fig.tight_layout()
            fig.savefig(output_path, dpi=_DPI, bbox_inches="tight")
        finally:
            plt.close(fig)

    @staticmethod
    def _render_weekly_booking_trends(trends: list[TrendPoint], output_path: Path) -> None:
        fig, ax = plt.subplots(figsize=(10.5, 5.4), dpi=_DPI)
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")
        try:
            ax.set_title(
                "Weekly Booking Volume & Total Hours Trend",
                fontsize=14,
                fontweight="bold",
                color="#0F172A",
                pad=14,
            )
            if not trends:
                ax.text(
                    0.5,
                    0.5,
                    "No weekly trend data available for the selected range.",
                    ha="center",
                    va="center",
                    fontsize=11,
                    color="#64748B",
                    transform=ax.transAxes,
                )
                ax.axis("off")
            else:
                x = list(range(len(trends)))
                labels = [t.week_label for t in trends]
                counts = [t.booking_count for t in trends]
                hours = [t.total_hours for t in trends]
                cancelled = [t.cancelled_count for t in trends]

                line_bookings = ax.plot(
                    x,
                    counts,
                    marker="o",
                    linewidth=2.5,
                    markersize=7,
                    color="#2563EB",
                    label="Bookings",
                    zorder=4,
                )
                ax.fill_between(x, counts, color="#2563EB", alpha=0.10, zorder=2)

                bar_cancelled = ax.bar(
                    x,
                    cancelled,
                    width=0.35,
                    color="#F97316",
                    alpha=0.55,
                    label="Cancelled",
                    zorder=3,
                )

                ax.set_xticks(x)
                ax.set_xticklabels(
                    labels,
                    rotation=25 if len(labels) > 6 else 0,
                    ha="right" if len(labels) > 6 else "center",
                )
                ax.set_xlabel("ISO Week (UTC)", fontsize=10, color="#334155", labelpad=8)
                ax.set_ylabel("Booking Count", fontsize=10, color="#1D4ED8", labelpad=8)
                ax.set_ylim(0, max(counts) * 1.28 + 1)
                ax.grid(axis="y", linestyle="--", alpha=0.35, color="#94A3B8")
                ax.set_axisbelow(True)
                _style_axes(ax)

                ax2 = ax.twinx()
                line_hours = ax2.plot(
                    x,
                    hours,
                    marker="s",
                    linestyle="--",
                    linewidth=2.0,
                    markersize=5.5,
                    color="#0D9488",
                    label="Total Hours",
                    zorder=3,
                )
                ax2.set_ylabel("Total Booked Hours", fontsize=10, color="#0F766E", labelpad=8)
                ax2.set_ylim(0, max(hours) * 1.28 + 1)
                ax2.spines["top"].set_visible(False)
                ax2.spines["right"].set_color("#CBD5E1")
                ax2.tick_params(colors="#0F766E", labelsize=9)

                peak_idx = max(range(len(trends)), key=lambda i: trends[i].booking_count)
                peak = trends[peak_idx]
                offset_x = -65 if peak_idx == len(trends) - 1 and len(trends) > 1 else 14
                ax.annotate(
                    f"Peak: {peak.week_label}\n{peak.booking_count} bookings ({peak.total_hours:.1f}h)",
                    xy=(peak_idx, peak.booking_count),
                    xytext=(offset_x, 22),
                    textcoords="offset points",
                    fontsize=8.5,
                    fontweight="bold",
                    color="#1E3A8A",
                    bbox={"boxstyle": "round,pad=0.35", "fc": "#EFF6FF", "ec": "#2563EB", "lw": 1.0},
                    arrowprops={"arrowstyle": "->", "color": "#2563EB", "lw": 1.3},
                    zorder=5,
                )

                handles = [*line_bookings, bar_cancelled, *line_hours]
                legend_labels = [h.get_label() for h in handles]
                ax.legend(
                    handles,
                    legend_labels,
                    loc="upper left",
                    frameon=True,
                    facecolor="#F8FAFC",
                    edgecolor="#E2E8F0",
                    fontsize=8.5,
                )

            fig.tight_layout()
            fig.savefig(output_path, dpi=_DPI, bbox_inches="tight")
        finally:
            plt.close(fig)

    @staticmethod
    def _render_course_fairness_and_status(
        fairness: list[FairnessRow],
        overview: OverviewKPI,
        output_path: Path,
        *,
        min_cohort: int = 5,
    ) -> None:
        fig, (ax_left, ax_right) = plt.subplots(1, 2, figsize=(14.0, 5.8), dpi=_DPI)
        fig.patch.set_facecolor("white")
        try:
            fig.suptitle(
                "Student Course Fairness (k-Anonymised) & Booking Lifecycle Breakdown",
                fontsize=14,
                fontweight="bold",
                color="#0F172A",
                y=0.98,
            )

            # Panel 1: Course Fairness
            ax_left.set_facecolor("white")
            ax_left.set_title(
                f"Bookings by Course (k ≥ {min_cohort} Grouping)",
                fontsize=11.5,
                fontweight="bold",
                color="#1E293B",
                pad=10,
            )
            if not fairness:
                ax_left.text(
                    0.5,
                    0.5,
                    "No student course booking data available.",
                    ha="center",
                    va="center",
                    fontsize=10.5,
                    color="#64748B",
                    transform=ax_left.transAxes,
                )
                ax_left.axis("off")
            else:
                y_pos = list(range(len(fairness)))
                labels = [_truncate_label(row.course, 28) for row in fairness]
                counts = [row.booking_count for row in fairness]
                colors = ["#94A3B8" if row.is_suppressed else "#0EA5E9" for row in fairness]

                bars = ax_left.barh(y_pos, counts, color=colors, height=0.62)
                ax_left.set_yticks(y_pos)
                ax_left.set_yticklabels(labels)
                ax_left.invert_yaxis()
                ax_left.set_xlabel("Total Bookings", fontsize=9.5, color="#334155")
                ax_left.grid(axis="x", linestyle="--", alpha=0.35, color="#94A3B8")
                ax_left.set_axisbelow(True)
                _style_axes(ax_left)

                max_c = max(counts)
                ax_left.set_xlim(0, max_c * 1.42 + 0.5)
                for bar, row in zip(bars, fairness):
                    ax_left.text(
                        bar.get_width() + max(max_c * 0.015, 0.12),
                        bar.get_y() + bar.get_height() / 2.0,
                        f"{row.booking_count} ({row.unique_users}u, {row.avg_hours_per_user:.1f}h/u)",
                        va="center",
                        ha="left",
                        fontsize=8.0,
                        color="#1E293B",
                    )

                legend_items = [
                    Patch(facecolor="#0EA5E9", label="Cohort ≥ k"),
                    Patch(facecolor="#94A3B8", label="Suppressed (<k)"),
                ]
                ax_left.legend(
                    handles=legend_items,
                    loc="lower right",
                    frameon=True,
                    facecolor="#F8FAFC",
                    edgecolor="#E2E8F0",
                    fontsize=8.0,
                )

            # Panel 2: Booking Status Breakdown
            ax_right.set_facecolor("white")
            ax_right.set_title(
                f"Booking Status Breakdown (n = {overview.total_bookings})",
                fontsize=11.5,
                fontweight="bold",
                color="#1E293B",
                pad=10,
            )
            status_specs = [
                ("Completed", overview.completed_bookings, "#10B981"),
                ("Confirmed", overview.confirmed_bookings, "#2563EB"),
                ("Pending", overview.pending_bookings, "#F59E0B"),
                ("Cancelled", overview.cancelled_bookings, "#F97316"),
                ("Rejected", overview.rejected_bookings, "#8B5CF6"),
                ("No-Show", overview.no_show_bookings, "#EF4444"),
            ]
            if overview.total_bookings == 0:
                ax_right.text(
                    0.5,
                    0.5,
                    "No booking status records available.",
                    ha="center",
                    va="center",
                    fontsize=10.5,
                    color="#64748B",
                    transform=ax_right.transAxes,
                )
                ax_right.axis("off")
            else:
                s_labels = [s[0] for s in status_specs]
                s_counts = [s[1] for s in status_specs]
                s_colors = [s[2] for s in status_specs]
                s_y = list(range(len(status_specs)))

                bars = ax_right.barh(s_y, s_counts, color=s_colors, height=0.6)
                ax_right.set_yticks(s_y)
                ax_right.set_yticklabels(s_labels)
                ax_right.invert_yaxis()
                ax_right.set_xlabel("Bookings", fontsize=9.5, color="#334155")
                ax_right.grid(axis="x", linestyle="--", alpha=0.35, color="#94A3B8")
                ax_right.set_axisbelow(True)
                _style_axes(ax_right)

                max_s = max(s_counts)
                ax_right.set_xlim(0, max_s * 1.32 + 0.5)
                for bar, count in zip(bars, s_counts):
                    pct = (count / overview.total_bookings) * 100.0
                    ax_right.text(
                        bar.get_width() + max(max_s * 0.015, 0.12),
                        bar.get_y() + bar.get_height() / 2.0,
                        f"{count} ({pct:.1f}%)",
                        va="center",
                        ha="left",
                        fontsize=8.5,
                        color="#1E293B",
                        fontweight="medium",
                    )

            fig.tight_layout(rect=(0, 0, 1, 0.94))
            fig.savefig(output_path, dpi=_DPI, bbox_inches="tight")
        finally:
            plt.close(fig)

