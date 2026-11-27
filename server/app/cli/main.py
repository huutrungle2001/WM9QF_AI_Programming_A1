"""Scriptable argparse CLI entry point sharing the exact same service layer as FastAPI."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.cli.formatting import (
    format_section_header,
    format_timestamp,
    parse_timestamp_arg,
    render_table,
)
from app.cli.menu import InteractiveMenu
from app.config import REPO_ROOT, AppSettings
from app.database import DatabaseManager
from app.dependencies import build_service_container, resolve_actor_context
from app.domain.enums import CampusZone, ResourceStatus, ResourceType, Role
from app.domain.exceptions import DomainError
from app.schemas.booking import BookingCreate, BookingFilter
from app.schemas.resource import AvailabilityQuery, ResourceFilter


def _build_parser() -> argparse.ArgumentParser:
    shared_opts = argparse.ArgumentParser(add_help=False)
    shared_opts.add_argument(
        "--role",
        choices=[r.value for r in Role],
        default=argparse.SUPPRESS,
        help="Actor role (default: admin).",
    )
    shared_opts.add_argument(
        "--user-id",
        default=argparse.SUPPRESS,
        help="Actor user ID (required for role=member).",
    )
    shared_opts.add_argument(
        "--db-path",
        type=Path,
        default=argparse.SUPPRESS,
        help="Path to SQLite database file.",
    )

    parser = argparse.ArgumentParser(
        prog="python3 -m app.cli.main",
        description="Campus Learning Resources Booking & Analytics CLI.",
    )
    parser.add_argument(
        "--role",
        choices=[r.value for r in Role],
        default="admin",
        help="Actor role (default: admin).",
    )
    parser.add_argument(
        "--user-id",
        default=None,
        help="Actor user ID (required for role=member).",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Path to SQLite database file (default: database/resource_bookings.db).",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # menu
    subparsers.add_parser("menu", parents=[shared_opts], help="Launch interactive CLI menu.")

    # seed
    p_seed = subparsers.add_parser(
        "seed", parents=[shared_opts], help="Seed the SQLite database deterministically."
    )
    p_seed.add_argument("--reset", action="store_true", help="Delete and rebuild DB from scratch.")
    p_seed.add_argument("--seed", type=int, default=42, help="Deterministic RNG seed (default: 42).")

    # resources
    p_res = subparsers.add_parser(
        "resources", parents=[shared_opts], help="List campus resources with filters."
    )
    p_res.add_argument("--type", dest="resource_type", choices=[t.value for t in ResourceType])
    p_res.add_argument("--department", dest="department_id")
    p_res.add_argument("--building", dest="building_id")
    p_res.add_argument("--zone", choices=[z.value for z in CampusZone])
    p_res.add_argument("--facility")
    p_res.add_argument("--min-capacity", type=int)
    p_res.add_argument("--status", choices=[s.value for s in ResourceStatus])
    p_res.add_argument("--search")
    p_res.add_argument("--limit", type=int, default=25)
    p_res.add_argument("--offset", type=int, default=0)

    # availability
    p_avail = subparsers.add_parser(
        "availability", parents=[shared_opts], help="Check resource availability for a time window."
    )
    p_avail.add_argument("--start", required=True, help="Start time (Unix or ISO-8601 UTC).")
    p_avail.add_argument("--end", required=True, help="End time (Unix or ISO-8601 UTC).")
    p_avail.add_argument("--type", dest="resource_type", choices=[t.value for t in ResourceType])
    p_avail.add_argument("--department", dest="department_id")
    p_avail.add_argument("--building", dest="building_id")
    p_avail.add_argument("--zone", choices=[z.value for z in CampusZone])
    p_avail.add_argument("--facility")
    p_avail.add_argument("--min-capacity", type=int)
    p_avail.add_argument("--limit", type=int, default=25)

    # bookings
    p_bks = subparsers.add_parser(
        "bookings", parents=[shared_opts], help="List and filter bookings."
    )
    p_bks.add_argument("--user", dest="filter_user_id")
    p_bks.add_argument("--resource", dest="resource_id")
    p_bks.add_argument("--type", dest="resource_type", choices=[t.value for t in ResourceType])
    p_bks.add_argument("--department", dest="department_id")
    p_bks.add_argument("--course")
    p_bks.add_argument("--status", dest="status_id")
    p_bks.add_argument("--from", dest="from_ts")
    p_bks.add_argument("--to", dest="to_ts")
    p_bks.add_argument("--limit", type=int, default=25)
    p_bks.add_argument("--offset", type=int, default=0)

    # book
    p_book = subparsers.add_parser(
        "book", parents=[shared_opts], help="Create a new conflict-checked booking."
    )
    p_book.add_argument("--resource", dest="resource_id", required=True)
    p_book.add_argument("--start", required=True, help="Start time (Unix or ISO-8601 UTC).")
    p_book.add_argument("--end", required=True, help="End time (Unix or ISO-8601 UTC).")
    p_book.add_argument("--user", dest="target_user_id", help="Target user ID (defaults to --user-id).")
    p_book.add_argument("--purpose")
    p_book.add_argument("--notes")
    p_book.add_argument("--group-size", type=int)

    # cancel
    p_cancel = subparsers.add_parser(
        "cancel", parents=[shared_opts], help="Cancel an existing booking."
    )
    p_cancel.add_argument("booking_id", type=int, help="Booking ID to cancel.")
    p_cancel.add_argument("--notes", help="Optional cancellation note.")

    # import-csv
    p_imp = subparsers.add_parser(
        "import-csv", parents=[shared_opts], help="Batch import bookings from a CSV file."
    )
    p_imp.add_argument("csv_path", type=Path, help="Path to the CSV file.")

    # analytics
    p_ana = subparsers.add_parser(
        "analytics", parents=[shared_opts], help="Display operational and fairness analytics tables."
    )
    p_ana.add_argument(
        "--report",
        choices=["all", "overview", "demand", "heatmap", "trends", "cancellations", "fairness"],
        default="all",
    )
    p_ana.add_argument("--limit", type=int, default=10)
    p_ana.add_argument("--group-by", default="resource_type")
    p_ana.add_argument("--min-cohort", type=int, default=None)
    p_ana.add_argument("--from", dest="from_ts")
    p_ana.add_argument("--to", dest="to_ts")

    # charts
    p_charts = subparsers.add_parser(
        "charts", parents=[shared_opts], help="Generate 4 Matplotlib PNG analytics charts."
    )
    p_charts.add_argument("--output-dir", type=Path, default=None)
    p_charts.add_argument("--top-limit", type=int, default=10)
    p_charts.add_argument("--min-cohort", type=int, default=None)
    p_charts.add_argument("--from", dest="from_ts")
    p_charts.add_argument("--to", dest="to_ts")

    # serve
    p_serve = subparsers.add_parser(
        "serve", parents=[shared_opts], help="Start the FastAPI REST server via Uvicorn."
    )
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.add_argument("--reload", action="store_true")

    return parser


def _run_seed(args: argparse.Namespace, settings: AppSettings) -> int:
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    from database.scripts.seed_db import seed_database

    target_db = args.db_path or settings.db_path
    counts = seed_database(
        db_path=target_db,
        seed_data_path=settings.seed_data_path,
        schema_path=settings.schema_path,
        reset=args.reset,
        seed=args.seed,
    )
    print(f"Seeded {target_db} (seed={args.seed}, reset={args.reset}):")
    print(render_table(["Table", "Rows"], [[t, c] for t, c in counts.items()]))
    return 0


def _run_analytics(args: argparse.Namespace, container, actor) -> int:
    svc = container.analytics_service
    from_ts = parse_timestamp_arg(args.from_ts, "from") if args.from_ts else None
    to_ts = parse_timestamp_arg(args.to_ts, "to") if args.to_ts else None
    report = args.report

    if report in {"all", "overview"}:
        ov = svc.get_overview(actor, from_ts=from_ts, to_ts=to_ts)
        print(format_section_header("Overview KPIs"))
        print(
            render_table(
                ["Metric", "Value"],
                [
                    ["Total Bookings", ov.total_bookings],
                    ["Active Bookings", f"{ov.active_bookings} ({ov.active_rate * 100:.1f}%)"],
                    ["Confirmed", ov.confirmed_bookings],
                    ["Pending", ov.pending_bookings],
                    ["Completed", ov.completed_bookings],
                    ["Cancelled", f"{ov.cancelled_bookings} ({ov.cancellation_rate * 100:.1f}%)"],
                    ["Rejected", f"{ov.rejected_bookings} ({ov.rejection_rate * 100:.1f}%)"],
                    ["No-Show", f"{ov.no_show_bookings} ({ov.no_show_rate * 100:.1f}%)"],
                    ["Active Resources", f"{ov.active_resources}/{ov.total_resources}"],
                    ["Active Users", f"{ov.active_users}/{ov.total_users}"],
                ],
            )
        )

    if report in {"all", "demand"}:
        demand = svc.get_demand(actor, limit=args.limit, from_ts=from_ts, to_ts=to_ts)
        print(format_section_header("Most Booked Resources"))
        print(
            render_table(
                ["Resource ID", "Name", "Type", "Dept", "Bookings", "Hours"],
                [
                    [d.resource_id, d.resource_name, d.resource_type.value, d.department_id, d.booking_count, d.total_hours]
                    for d in demand["most_booked"]
                ],
                max_col_width=32,
            )
        )
        print(format_section_header("Underused Resources"))
        print(
            render_table(
                ["Resource ID", "Name", "Type", "Dept", "Bookings", "Hours"],
                [
                    [d.resource_id, d.resource_name, d.resource_type.value, d.department_id, d.booking_count, d.total_hours]
                    for d in demand["underused"]
                ],
                max_col_width=32,
            )
        )

    if report in {"all", "heatmap"}:
        cells = svc.get_heatmap(actor, from_ts=from_ts, to_ts=to_ts)
        top_cells = sorted([c for c in cells if c.booking_count > 0], key=lambda c: (-c.booking_count, c.day_of_week, c.hour))[:15]
        print(format_section_header("Peak Demand Slots (Day x Hour UTC)"))
        print(
            render_table(
                ["Day", "Hour (UTC)", "Bookings"],
                [[c.day_name, f"{c.hour:02d}:00", c.booking_count] for c in top_cells],
            )
        )

    if report in {"all", "trends"}:
        trends = svc.get_trends(actor, from_ts=from_ts, to_ts=to_ts)
        print(format_section_header("Weekly Booking Trends"))
        print(
            render_table(
                ["ISO Week", "Bookings", "Total Hours", "Cancelled"],
                [[t.week_label, t.booking_count, t.total_hours, t.cancelled_count] for t in trends],
            )
        )

    if report in {"all", "cancellations"}:
        group_by = "department_id" if args.group_by == "department" else args.group_by
        rows = svc.get_cancellations(actor, group_by=group_by, from_ts=from_ts, to_ts=to_ts)
        print(format_section_header(f"Cancellation & No-Show Breakdown ({group_by})"))
        print(
            render_table(
                ["Label", "Total", "Cancelled", "Rejected", "No-Show", "Cancel %", "No-Show %"],
                [
                    [
                        r.label,
                        r.total_bookings,
                        r.cancelled_count,
                        r.rejected_count,
                        r.no_show_count,
                        f"{r.cancellation_rate * 100:.1f}%",
                        f"{r.no_show_rate * 100:.1f}%",
                    ]
                    for r in rows
                ],
            )
        )

    if report in {"all", "fairness"}:
        fairness = svc.get_course_fairness(
            actor, from_ts=from_ts, to_ts=to_ts, min_cohort=args.min_cohort
        )
        print(format_section_header("Course Fairness (k-Anonymised)"))
        print(
            render_table(
                ["Course", "Unique Users", "Bookings", "Total Hours", "Avg Hrs/User", "Suppressed"],
                [
                    [f.course, f.unique_users, f.booking_count, f.total_hours, f.avg_hours_per_user, f.is_suppressed]
                    for f in fairness
                ],
                max_col_width=32,
            )
        )

    return 0


def main(argv: list[str] | None = None) -> int:
    """Parse CLI arguments, hydrate ActorContext, and dispatch to the requested subcommand."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    settings = AppSettings.from_env()
    if args.command == "seed":
        return _run_seed(args, settings)

    if args.command == "serve":
        import uvicorn

        uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)
        return 0

    db_path = args.db_path or settings.db_path
    db_manager = DatabaseManager(db_path)
    container = build_service_container(db_manager=db_manager, settings=settings)

    try:
        actor = resolve_actor_context(args.role, args.user_id, container.user_repo)

        if args.command == "menu":
            return InteractiveMenu(container, actor).run()

        if args.command == "resources":
            filters = ResourceFilter(
                resource_type=ResourceType(args.resource_type) if args.resource_type else None,
                department_id=args.department_id,
                building_id=args.building_id,
                zone=CampusZone(args.zone) if args.zone else None,
                facility=args.facility,
                min_capacity=args.min_capacity,
                status=ResourceStatus(args.status) if args.status else None,
                search=args.search,
                limit=args.limit,
                offset=args.offset,
            )
            items = container.catalog_service.list_resources(actor, filters)
            print(
                render_table(
                    ["ID", "Name", "Type", "Dept", "Status", "Eligibility", "Slots"],
                    [
                        [
                            r.resource_id,
                            r.resource_name,
                            r.resource_type.value,
                            r.department_id,
                            r.status.value,
                            r.booking_eligibility.value,
                            r.max_concurrent_bookings or 1,
                        ]
                        for r in items
                    ],
                    max_col_width=34,
                )
            )
            return 0

        if args.command == "availability":
            start_ts = parse_timestamp_arg(args.start, "start")
            end_ts = parse_timestamp_arg(args.end, "end")
            query = AvailabilityQuery(
                start_time=start_ts,
                end_time=end_ts,
                resource_type=ResourceType(args.resource_type) if args.resource_type else None,
                department_id=args.department_id,
                building_id=args.building_id,
                zone=CampusZone(args.zone) if args.zone else None,
                facility=args.facility,
                min_capacity=args.min_capacity,
            )
            slots = container.catalog_service.check_availability(actor, query)
            print(
                render_table(
                    ["Resource ID", "Name", "Type", "Dept", "Remaining"],
                    [
                        [
                            s.resource.resource_id,
                            s.resource.resource_name,
                            s.resource.resource_type.value,
                            s.resource.department_id,
                            f"{s.remaining_slots}/{s.max_concurrent_bookings}",
                        ]
                        for s in slots[: args.limit]
                    ],
                    max_col_width=34,
                )
            )
            return 0

        if args.command == "bookings":
            filters = BookingFilter(
                user_id=args.filter_user_id,
                resource_id=args.resource_id,
                resource_type=ResourceType(args.resource_type) if args.resource_type else None,
                department_id=args.department_id,
                course=args.course,
                status_id=args.status_id,
                from_ts=parse_timestamp_arg(args.from_ts, "from") if args.from_ts else None,
                to_ts=parse_timestamp_arg(args.to_ts, "to") if args.to_ts else None,
                limit=args.limit,
                offset=args.offset,
            )
            bookings = container.booking_service.list_bookings(actor, filters)
            print(
                render_table(
                    ["ID", "User", "Resource", "Start", "End", "Status", "Purpose"],
                    [
                        [
                            b.booking_id,
                            b.user_id,
                            b.resource_id,
                            format_timestamp(b.start_time),
                            format_timestamp(b.end_time),
                            b.status_id,
                            b.purpose,
                        ]
                        for b in bookings
                    ],
                    max_col_width=30,
                )
            )
            return 0

        if args.command == "book":
            dto = BookingCreate(
                user_id=args.target_user_id or actor.user_id,
                resource_id=args.resource_id,
                start_time=parse_timestamp_arg(args.start, "start"),
                end_time=parse_timestamp_arg(args.end, "end"),
                purpose=args.purpose,
                notes=args.notes,
                group_size=args.group_size,
            )
            created = container.booking_service.create_booking(actor, dto)
            print(
                render_table(
                    ["Booking ID", "User", "Resource", "Start", "End", "Status"],
                    [
                        [
                            created.booking_id,
                            created.user_id,
                            created.resource_id,
                            format_timestamp(created.start_time),
                            format_timestamp(created.end_time),
                            created.status_id,
                        ]
                    ],
                )
            )
            return 0

        if args.command == "cancel":
            cancelled = container.booking_service.cancel_booking(
                actor, args.booking_id, notes=args.notes
            )
            print(f"Booking #{cancelled.booking_id} cancelled (status={cancelled.status_id}).")
            return 0

        if args.command == "import-csv":
            if not args.csv_path.is_file():
                print(f"Error: CSV file not found: {args.csv_path}", file=sys.stderr)
                return 1
            summary = container.booking_service.import_bookings_csv(
                actor, args.csv_path.read_text(encoding="utf-8-sig")
            )
            print(
                f"Import Summary: total={summary.total_rows}, "
                f"imported={summary.imported_count}, failed={summary.failed_count}"
            )
            if summary.created_booking_ids:
                print(f"Created booking IDs: {summary.created_booking_ids}")
            if summary.errors:
                print(
                    render_table(
                        ["Line", "Error"],
                        [[e.line_number, e.error] for e in summary.errors],
                        max_col_width=72,
                    )
                )
            return 0

        if args.command == "analytics":
            return _run_analytics(args, container, actor)

        if args.command == "charts":
            from_ts = parse_timestamp_arg(args.from_ts, "from") if args.from_ts else None
            to_ts = parse_timestamp_arg(args.to_ts, "to") if args.to_ts else None
            result = container.chart_service.export_charts(
                actor,
                output_dir=args.output_dir,
                from_ts=from_ts,
                to_ts=to_ts,
                top_limit=args.top_limit,
                min_cohort=args.min_cohort,
            )
            print(f"Exported {len(result.generated_files)} PNG charts to {result.output_dir}:")
            for fname in result.generated_files:
                print(f"  - {fname}")
            return 0

        return 0
    except (DomainError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

