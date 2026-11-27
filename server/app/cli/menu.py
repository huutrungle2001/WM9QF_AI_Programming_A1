"""Interactive role-aware CLI menu delegating 100% to the core service layer."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from app.cli.formatting import (
    format_section_header,
    format_timestamp,
    parse_timestamp_arg,
    render_table,
)
from app.dependencies import ServiceContainer, resolve_actor_context
from app.domain.enums import ResourceStatus, ResourceType
from app.domain.exceptions import DomainError
from app.schemas.actor import ActorContext
from app.schemas.booking import BookingCreate, BookingFilter, BookingUpdate
from app.schemas.resource import AvailabilityQuery, ResourceFilter

DEMO_PRESETS: tuple[tuple[str, str, str | None, str], ...] = (
    ("1", "admin", "ADMIN1", "Admin (Dr. Eleanor Vance)"),
    ("2", "manager", "MGR-LIB", "Library Manager (Priya Nair)"),
    ("3", "student_services", "SS1", "Student Services (Claire Beaumont — Redacted)"),
    ("4", "member", "S1001", "PG Student (Alice Patel — MSc Applied AI)"),
    ("5", "member", "S1002", "Accessible UG Student (Benji Kowalski)"),
    ("6", "member", "STAFF1", "Academic Staff Member (Prof. Julian Mercer)"),
)


class InteractiveMenu:
    """Guided terminal walkthrough over CatalogService, BookingService, AnalyticsService, and ChartService."""

    def __init__(
        self,
        container: ServiceContainer,
        initial_actor: ActorContext,
        *,
        input_fn: Callable[[str], str] = input,
        output_fn: Callable[[str], None] = print,
    ) -> None:
        self.container = container
        self.actor = initial_actor
        self._input = input_fn
        self._out = output_fn

    def _prompt(self, label: str, default: str | None = None) -> str:
        suffix = f" [{default}]" if default is not None else ""
        raw = self._input(f"{label}{suffix}: ").strip()
        if not raw and default is not None:
            return default
        return raw

    def _actor_banner(self) -> str:
        user_part = self.actor.user_id or "-"
        type_part = self.actor.user_type.value if self.actor.user_type else "unassigned"
        return (
            f"Active Actor: role={self.actor.role.value} | "
            f"user_id={user_part} | user_type={type_part} | "
            f"accessibility={'Yes' if self.actor.has_accessibility_access else 'No'}"
        )

    def run(self) -> int:
        """Execute the interactive menu loop until exit (0) or EOF."""
        self._out(format_section_header("Campus Learning Resources Booking & Analytics CLI"))
        while True:
            self._out("")
            self._out(self._actor_banner())
            self._out("-" * 64)
            self._out(" 1. Switch Role / Demo Actor")
            self._out(" 2. Browse Resources")
            self._out(" 3. Check Availability")
            self._out(" 4. View Bookings")
            self._out(" 5. Create Booking")
            self._out(" 6. Update / Reschedule Booking")
            self._out(" 7. Approve / Reject / Cancel Booking")
            self._out(" 8. View Analytics Dashboard")
            self._out(" 9. Export 4 PNG Charts")
            self._out("10. Import Bookings from CSV")
            self._out(" 0. Exit")
            self._out("-" * 64)

            try:
                choice = self._input("Select option [0-10]: ").strip()
            except (EOFError, KeyboardInterrupt):
                self._out("\nExiting CLI menu.")
                return 0

            if choice in {"0", "q", "quit", "exit"}:
                self._out("Goodbye.")
                return 0

            try:
                if choice == "1":
                    self._handle_switch_role()
                elif choice == "2":
                    self._handle_browse_resources()
                elif choice == "3":
                    self._handle_check_availability()
                elif choice == "4":
                    self._handle_view_bookings()
                elif choice == "5":
                    self._handle_create_booking()
                elif choice == "6":
                    self._handle_update_booking()
                elif choice == "7":
                    self._handle_transition_booking()
                elif choice == "8":
                    self._handle_view_analytics()
                elif choice == "9":
                    self._handle_export_charts()
                elif choice == "10":
                    self._handle_import_csv()
                else:
                    self._out(f"Unknown choice '{choice}'. Please select 0-10.")
            except (EOFError, KeyboardInterrupt):
                self._out("\nExiting CLI menu.")
                return 0
            except DomainError as exc:
                self._out(f"[ERROR:{exc.code}] {exc}")
            except ValueError as exc:
                self._out(f"[INVALID INPUT] {exc}")

    def _handle_switch_role(self) -> None:
        self._out(format_section_header("Switch Role / Demo Actor"))
        for key, role, uid, label in DEMO_PRESETS:
            self._out(f"  {key}. {label} ({role} / {uid})")
        self._out("  7. Custom role & user_id")

        sel = self._prompt("Choose preset [1-7]", "1")
        preset_map = {p[0]: (p[1], p[2]) for p in DEMO_PRESETS}
        if sel in preset_map:
            role_str, user_id = preset_map[sel]
        elif sel == "7":
            role_str = self._prompt("Role (admin/manager/student_services/member)", "admin")
            raw_uid = self._prompt("User ID (blank for none)", "")
            user_id = raw_uid or None
        else:
            raise ValueError(f"Unknown preset '{sel}'.")

        self.actor = resolve_actor_context(role_str, user_id, self.container.user_repo)
        self._out(f"Switched to: {self._actor_banner()}")

    def _handle_browse_resources(self) -> None:
        self._out(format_section_header("Browse Resources"))
        raw_type = self._prompt(
            "Resource type filter (study_room/group_space/computer_lab/specialist_equipment/academic_support or blank)",
            "",
        )
        search = self._prompt("Search keyword (or blank)", "")
        limit_str = self._prompt("Limit", "15")

        rtype = ResourceType(raw_type) if raw_type else None
        filters = ResourceFilter(
            resource_type=rtype,
            search=search or None,
            status=ResourceStatus.ACTIVE,
            limit=max(1, int(limit_str)),
        )
        resources = self.container.catalog_service.list_resources(self.actor, filters)
        rows = [
            [
                r.resource_id,
                r.resource_name,
                r.resource_type.value,
                r.department_id,
                r.booking_eligibility.value,
                r.max_concurrent_bookings or 1,
                "Approval" if r.requires_approval else "Auto",
            ]
            for r in resources
        ]
        self._out(
            render_table(
                ["ID", "Name", "Type", "Dept", "Eligibility", "Slots", "Confirm"],
                rows,
                max_col_width=32,
            )
        )

    def _handle_check_availability(self) -> None:
        self._out(format_section_header("Check Availability"))
        start_raw = self._prompt("Start time (Unix or ISO-8601 UTC)", "2026-12-07T10:00:00Z")
        end_raw = self._prompt("End time (Unix or ISO-8601 UTC)", "2026-12-07T12:00:00Z")
        raw_type = self._prompt("Resource type filter (or blank)", "")

        start_ts = parse_timestamp_arg(start_raw, "start_time")
        end_ts = parse_timestamp_arg(end_raw, "end_time")
        query = AvailabilityQuery(
            start_time=start_ts,
            end_time=end_ts,
            resource_type=ResourceType(raw_type) if raw_type else None,
        )
        slots = self.container.catalog_service.check_availability(self.actor, query)
        rows = [
            [
                s.resource.resource_id,
                s.resource.resource_name,
                s.resource.resource_type.value,
                s.resource.department_id,
                f"{s.remaining_slots}/{s.max_concurrent_bookings}",
            ]
            for s in slots[:20]
        ]
        self._out(
            render_table(
                ["Resource ID", "Name", "Type", "Dept", "Remaining"],
                rows,
                max_col_width=34,
            )
        )
        if len(slots) > 20:
            self._out(f"(Showing first 20 of {len(slots)} available resources.)")

    def _handle_view_bookings(self) -> None:
        self._out(format_section_header("View Bookings"))
        status_filter = self._prompt("Status filter (pending/confirmed/cancelled/etc. or blank)", "")
        limit_str = self._prompt("Limit", "15")

        bookings = self.container.booking_service.list_bookings(
            self.actor,
            BookingFilter(status_id=status_filter or None, limit=max(1, int(limit_str))),
        )
        rows = [
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
        ]
        self._out(
            render_table(
                ["ID", "User", "Resource", "Start", "End", "Status", "Purpose"],
                rows,
                max_col_width=28,
            )
        )

    def _handle_create_booking(self) -> None:
        self._out(format_section_header("Create Booking"))
        resource_id = self._prompt("Resource ID")
        default_user = self.actor.user_id or "S1001"
        user_id = self._prompt("User ID", default_user)
        start_raw = self._prompt("Start time (Unix or ISO-8601 UTC)")
        end_raw = self._prompt("End time (Unix or ISO-8601 UTC)")
        purpose = self._prompt("Purpose (optional)", "")
        notes = self._prompt("Notes (optional)", "")
        group_raw = self._prompt("Group size (optional)", "")

        dto = BookingCreate(
            user_id=user_id or None,
            resource_id=resource_id,
            start_time=parse_timestamp_arg(start_raw, "start_time"),
            end_time=parse_timestamp_arg(end_raw, "end_time"),
            purpose=purpose or None,
            notes=notes or None,
            group_size=int(group_raw) if group_raw else None,
        )
        created = self.container.booking_service.create_booking(self.actor, dto)
        self._out(
            f"Created booking #{created.booking_id} ({created.status_id}) for {created.resource_id} "
            f"[{format_timestamp(created.start_time)} -> {format_timestamp(created.end_time)}]."
        )

    def _handle_update_booking(self) -> None:
        self._out(format_section_header("Update / Reschedule Booking"))
        booking_id = int(self._prompt("Booking ID"))
        start_raw = self._prompt("New start time (blank to keep)", "")
        end_raw = self._prompt("New end time (blank to keep)", "")
        purpose = self._prompt("New purpose (blank to keep)", "")
        notes = self._prompt("New notes (blank to keep)", "")

        payload: dict[str, object] = {}
        if start_raw:
            payload["start_time"] = parse_timestamp_arg(start_raw, "start_time")
        if end_raw:
            payload["end_time"] = parse_timestamp_arg(end_raw, "end_time")
        if purpose:
            payload["purpose"] = purpose
        if notes:
            payload["notes"] = notes

        updated = self.container.booking_service.update_booking(
            self.actor, booking_id, BookingUpdate(**payload)
        )
        self._out(
            f"Updated booking #{updated.booking_id}: {updated.status_id} "
            f"[{format_timestamp(updated.start_time)} -> {format_timestamp(updated.end_time)}]."
        )

    def _handle_transition_booking(self) -> None:
        self._out(format_section_header("Booking Lifecycle Action"))
        booking_id = int(self._prompt("Booking ID"))
        action = self._prompt("Action (approve/reject/cancel/complete/no-show)", "cancel").lower()
        notes = self._prompt("Notes (optional)", "") or None

        svc = self.container.booking_service
        if action == "approve":
            result = svc.approve_booking(self.actor, booking_id, notes=notes)
        elif action == "reject":
            result = svc.reject_booking(self.actor, booking_id, notes=notes)
        elif action == "cancel":
            result = svc.cancel_booking(self.actor, booking_id, notes=notes)
        elif action == "complete":
            result = svc.complete_booking(self.actor, booking_id, notes=notes)
        elif action in {"no-show", "no_show"}:
            result = svc.mark_no_show(self.actor, booking_id, notes=notes)
        else:
            raise ValueError(f"Unsupported lifecycle action '{action}'.")

        self._out(f"Booking #{result.booking_id} transitioned to '{result.status_id}'.")

    def _handle_view_analytics(self) -> None:
        self._out(format_section_header("Analytics Dashboard"))
        svc = self.container.analytics_service

        overview = svc.get_overview(self.actor)
        self._out(
            render_table(
                ["Metric", "Value"],
                [
                    ["Total Bookings", overview.total_bookings],
                    ["Active (Confirmed + Pending)", f"{overview.active_bookings} ({overview.active_rate * 100:.1f}%)"],
                    ["Completed", overview.completed_bookings],
                    ["Cancelled", f"{overview.cancelled_bookings} ({overview.cancellation_rate * 100:.1f}%)"],
                    ["Rejected", f"{overview.rejected_bookings} ({overview.rejection_rate * 100:.1f}%)"],
                    ["No-Show", f"{overview.no_show_bookings} ({overview.no_show_rate * 100:.1f}%)"],
                    ["Active Resources", f"{overview.active_resources}/{overview.total_resources}"],
                    ["Active Users", f"{overview.active_users}/{overview.total_users}"],
                ],
            )
        )

        demand = svc.get_demand(self.actor, limit=5)
        self._out("\nTop Booked Resources:")
        self._out(
            render_table(
                ["Resource ID", "Name", "Type", "Bookings", "Hours"],
                [
                    [d.resource_id, d.resource_name, d.resource_type.value, d.booking_count, d.total_hours]
                    for d in demand["most_booked"]
                ],
                max_col_width=32,
            )
        )

        fairness = svc.get_course_fairness(self.actor)
        self._out("\nCourse Fairness (k-Anonymised):")
        self._out(
            render_table(
                ["Course", "Users", "Bookings", "Total Hours", "Avg Hrs/User", "Suppressed"],
                [
                    [f.course, f.unique_users, f.booking_count, f.total_hours, f.avg_hours_per_user, f.is_suppressed]
                    for f in fairness
                ],
                max_col_width=32,
            )
        )

    def _handle_export_charts(self) -> None:
        self._out(format_section_header("Export 4 PNG Charts"))
        out_dir_raw = self._prompt(
            "Output directory (blank for default)",
            str(self.container.settings.charts_dir),
        )
        result = self.container.chart_service.export_charts(
            self.actor, output_dir=out_dir_raw or None
        )
        self._out(f"Exported {len(result.generated_files)} charts to {result.output_dir}:")
        for fname in result.generated_files:
            self._out(f"  - {fname}")

    def _handle_import_csv(self) -> None:
        self._out(format_section_header("CSV Batch Booking Import"))
        csv_path_str = self._prompt("Path to CSV file")
        csv_path = Path(csv_path_str)
        if not csv_path.is_file():
            raise ValueError(f"CSV file not found: {csv_path}")

        summary = self.container.booking_service.import_bookings_csv(
            self.actor, csv_path.read_text(encoding="utf-8-sig")
        )
        self._out(
            f"Import complete: total={summary.total_rows}, "
            f"imported={summary.imported_count}, failed={summary.failed_count}."
        )
        if summary.created_booking_ids:
            self._out(f"Created booking IDs: {summary.created_booking_ids}")
        if summary.errors:
            self._out(
                render_table(
                    ["Line", "Error"],
                    [[err.line_number, err.error] for err in summary.errors],
                    max_col_width=70,
                )
            )

