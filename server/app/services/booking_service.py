"""Booking lifecycle, BEGIN IMMEDIATE 2-way conflict engine, soft delete, and CSV batch import."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from pydantic import ValidationError as PydanticValidationError

from app.config import BookingPolicyConfig
from app.database import DatabaseManager
from app.domain.enums import BookingStatusId, Role
from app.domain.exceptions import (
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.repositories.booking_repo import _UNSET, BookingRepository
from app.repositories.resource_repo import ResourceRepository
from app.repositories.user_repo import UserRepository
from app.schemas.actor import ActorContext
from app.schemas.booking import (
    BookingCreate,
    BookingFilter,
    BookingOut,
    BookingUpdate,
    ImportErrorItem,
    ImportSummary,
)
from app.services.policy import PolicyGuard

ALLOWED_TRANSITIONS: dict[BookingStatusId, frozenset[BookingStatusId]] = {
    BookingStatusId.PENDING: frozenset(
        {
            BookingStatusId.CONFIRMED,
            BookingStatusId.REJECTED,
            BookingStatusId.CANCELLED,
        }
    ),
    BookingStatusId.CONFIRMED: frozenset(
        {
            BookingStatusId.COMPLETED,
            BookingStatusId.NO_SHOW,
            BookingStatusId.CANCELLED,
        }
    ),
    BookingStatusId.CANCELLED: frozenset(),
    BookingStatusId.REJECTED: frozenset(),
    BookingStatusId.COMPLETED: frozenset(),
    BookingStatusId.NO_SHOW: frozenset(),
}

_TERMINAL_STATUSES: frozenset[BookingStatusId] = frozenset(
    {
        BookingStatusId.CANCELLED,
        BookingStatusId.REJECTED,
        BookingStatusId.COMPLETED,
        BookingStatusId.NO_SHOW,
    }
)

_TRANSITION_ACTION_MAP: dict[BookingStatusId, str] = {
    BookingStatusId.CONFIRMED: "booking:approve",
    BookingStatusId.REJECTED: "booking:reject",
    BookingStatusId.CANCELLED: "booking:cancel",
    BookingStatusId.COMPLETED: "booking:complete",
    BookingStatusId.NO_SHOW: "booking:no_show",
}


def _parse_timestamp(raw: str, field_name: str) -> int:
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError(f"Missing required field '{field_name}'.")
    try:
        return int(cleaned)
    except ValueError:
        pass
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError as exc:
        raise ValueError(
            f"Invalid timestamp '{cleaned}' for '{field_name}' (expected Unix integer or ISO-8601)."
        ) from exc


class BookingService:
    """Orchestrates atomic conflict-checked bookings, status transitions, soft deletes, and CSV import."""

    def __init__(
        self,
        db: DatabaseManager,
        booking_repo: BookingRepository,
        resource_repo: ResourceRepository,
        user_repo: UserRepository,
        policy: PolicyGuard,
        policy_config: BookingPolicyConfig | None = None,
    ) -> None:
        self.db = db
        self.booking_repo = booking_repo
        self.resource_repo = resource_repo
        self.user_repo = user_repo
        self.policy = policy
        self.policy_config = policy_config or BookingPolicyConfig()

    # ------------------------------------------------------------------
    # Create & Read
    # ------------------------------------------------------------------
    def create_booking(self, actor: ActorContext, dto: BookingCreate) -> BookingOut:
        self.policy.require_action(actor, "booking:create")

        if actor.role == Role.MEMBER and dto.user_id is not None and dto.user_id != actor.user_id:
            raise ForbiddenError("Members may only create bookings for themselves.")

        target_user_id = dto.user_id if dto.user_id is not None else actor.user_id
        if not target_user_id:
            raise ValidationError("user_id is required when actor context has no user_id.")

        target_user = self.user_repo.get_by_id(target_user_id)
        if target_user is None:
            raise NotFoundError(f"User '{target_user_id}' not found.")

        domain_resource = self.resource_repo.get_domain_resource(dto.resource_id)

        # Write-side RBAC, user active check, and eligibility guard
        self.policy.assert_can_book_for(actor, target_user, domain_resource)

        # Polymorphic subtype domain validation (status, duration limit, group_size)
        domain_resource.validate_booking_request(
            dto.start_time,
            dto.end_time,
            self.policy_config,
            dto.group_size,
        )

        # Atomic BEGIN IMMEDIATE transaction serialising conflict check + insert
        with self.db.immediate_transaction() as conn:
            res_overlaps = self.booking_repo.count_resource_overlaps(
                conn,
                domain_resource.resource_id,
                dto.start_time,
                dto.end_time,
            )
            max_conc = domain_resource.max_concurrent_bookings()
            if res_overlaps >= max_conc:
                raise ConflictError(
                    f"Resource '{domain_resource.resource_id}' has no available slots during "
                    f"the requested window ({res_overlaps}/{max_conc} occupied)."
                )

            user_overlaps = self.booking_repo.count_user_overlaps(
                conn,
                target_user.user_id,
                dto.start_time,
                dto.end_time,
            )
            if user_overlaps > 0:
                raise ConflictError(
                    f"User '{target_user.user_id}' already has an overlapping booking during "
                    "the requested window."
                )

            initial_status = domain_resource.initial_status(actor)
            booking_id = self.booking_repo.insert(
                conn,
                user_id=target_user.user_id,
                resource_id=domain_resource.resource_id,
                start_time=dto.start_time,
                end_time=dto.end_time,
                status_id=initial_status.value,
                purpose=dto.purpose,
                notes=dto.notes,
            )
            created = self.booking_repo.get_by_id(booking_id, conn=conn)

        assert created is not None
        return self.policy.project_booking(actor, created)

    def get_booking(self, actor: ActorContext, booking_id: int) -> BookingOut:
        self.policy.require_action(actor, "booking:read")
        booking = self.booking_repo.get_by_id(booking_id)
        if booking is None:
            raise NotFoundError(f"Booking '{booking_id}' not found.")
        self.policy.assert_can_view_booking(actor, booking)
        return self.policy.project_booking(actor, booking)

    def list_bookings(
        self,
        actor: ActorContext,
        filters: BookingFilter | None = None,
    ) -> list[BookingOut]:
        self.policy.require_action(actor, "booking:read")
        effective = filters.model_copy() if filters is not None else BookingFilter()

        if actor.role == Role.MEMBER:
            if actor.user_id is None:
                raise ForbiddenError("Member actor must provide user_id to list bookings.")
            if effective.user_id is not None and effective.user_id != actor.user_id:
                raise ForbiddenError("Members may only list their own bookings.")
            effective.user_id = actor.user_id

        rows = self.booking_repo.list_bookings(effective)
        return [self.policy.project_booking(actor, row) for row in rows]

    # ------------------------------------------------------------------
    # Update / Reschedule
    # ------------------------------------------------------------------
    def update_booking(
        self,
        actor: ActorContext,
        booking_id: int,
        dto: BookingUpdate,
    ) -> BookingOut:
        self.policy.require_action(actor, "booking:update")
        existing = self.booking_repo.get_by_id(booking_id)
        if existing is None:
            raise NotFoundError(f"Booking '{booking_id}' not found.")

        self.policy.assert_can_modify_booking(actor, existing)

        if BookingStatusId(existing.status_id) in _TERMINAL_STATUSES:
            raise ValidationError(
                f"Cannot modify booking '{booking_id}' in terminal status '{existing.status_id}'."
            )

        fields = dto.model_fields_set
        purpose_arg = dto.purpose if "purpose" in fields else _UNSET
        notes_arg = dto.notes if "notes" in fields else _UNSET
        rescheduling = (
            ("start_time" in fields and dto.start_time is not None)
            or ("end_time" in fields and dto.end_time is not None)
            or ("group_size" in fields and dto.group_size is not None)
        )

        if rescheduling:
            new_start = dto.start_time if dto.start_time is not None else existing.start_time
            new_end = dto.end_time if dto.end_time is not None else existing.end_time

            domain_resource = self.resource_repo.get_domain_resource(existing.resource_id)
            domain_resource.validate_booking_request(
                new_start,
                new_end,
                self.policy_config,
                dto.group_size,
            )

            with self.db.immediate_transaction() as conn:
                current = self.booking_repo.get_by_id(booking_id, conn=conn)
                if current is None:
                    raise NotFoundError(f"Booking '{booking_id}' not found.")

                res_overlaps = self.booking_repo.count_resource_overlaps(
                    conn,
                    existing.resource_id,
                    new_start,
                    new_end,
                    exclude_booking_id=booking_id,
                )
                max_conc = domain_resource.max_concurrent_bookings()
                if res_overlaps >= max_conc:
                    raise ConflictError(
                        f"Resource '{existing.resource_id}' has no available slots during the "
                        f"rescheduled window ({res_overlaps}/{max_conc} occupied)."
                    )

                user_overlaps = self.booking_repo.count_user_overlaps(
                    conn,
                    existing.user_id,
                    new_start,
                    new_end,
                    exclude_booking_id=booking_id,
                )
                if user_overlaps > 0:
                    raise ConflictError(
                        f"User '{existing.user_id}' already has an overlapping booking during "
                        "the rescheduled window."
                    )

                updated = self.booking_repo.update(
                    conn,
                    booking_id,
                    start_time=new_start,
                    end_time=new_end,
                    purpose=purpose_arg,
                    notes=notes_arg,
                )
        else:
            updated = self.booking_repo.update(
                None,
                booking_id,
                purpose=purpose_arg,
                notes=notes_arg,
            )

        return self.policy.project_booking(actor, updated)

    # ------------------------------------------------------------------
    # Lifecycle State Machine Transitions
    # ------------------------------------------------------------------
    def transition_status(
        self,
        actor: ActorContext,
        booking_id: int,
        target_status: BookingStatusId | str,
        notes: str | None = None,
    ) -> BookingOut:
        try:
            next_status = (
                target_status
                if isinstance(target_status, BookingStatusId)
                else BookingStatusId(str(target_status))
            )
        except ValueError as exc:
            raise ValidationError(f"Unknown target booking status '{target_status}'.") from exc

        required_action = _TRANSITION_ACTION_MAP.get(next_status)
        if required_action is None:
            raise ValidationError(
                f"Transition to status '{next_status.value}' is not supported."
            )
        self.policy.require_action(actor, required_action)

        existing = self.booking_repo.get_by_id(booking_id)
        if existing is None:
            raise NotFoundError(f"Booking '{booking_id}' not found.")

        if next_status == BookingStatusId.CANCELLED:
            self.policy.assert_can_modify_booking(actor, existing)

        current_status = BookingStatusId(existing.status_id)
        allowed_targets = ALLOWED_TRANSITIONS.get(current_status, frozenset())
        if next_status not in allowed_targets:
            raise ValidationError(
                f"Invalid status transition from '{current_status.value}' to '{next_status.value}'."
            )

        updated = self.booking_repo.update_status(booking_id, next_status.value, notes=notes)
        return self.policy.project_booking(actor, updated)

    def approve_booking(
        self,
        actor: ActorContext,
        booking_id: int,
        notes: str | None = None,
    ) -> BookingOut:
        return self.transition_status(actor, booking_id, BookingStatusId.CONFIRMED, notes=notes)

    def reject_booking(
        self,
        actor: ActorContext,
        booking_id: int,
        notes: str | None = None,
    ) -> BookingOut:
        return self.transition_status(actor, booking_id, BookingStatusId.REJECTED, notes=notes)

    def cancel_booking(
        self,
        actor: ActorContext,
        booking_id: int,
        notes: str | None = None,
    ) -> BookingOut:
        return self.transition_status(actor, booking_id, BookingStatusId.CANCELLED, notes=notes)

    def complete_booking(
        self,
        actor: ActorContext,
        booking_id: int,
        notes: str | None = None,
    ) -> BookingOut:
        return self.transition_status(actor, booking_id, BookingStatusId.COMPLETED, notes=notes)

    def mark_no_show(
        self,
        actor: ActorContext,
        booking_id: int,
        notes: str | None = None,
    ) -> BookingOut:
        return self.transition_status(actor, booking_id, BookingStatusId.NO_SHOW, notes=notes)

    # ------------------------------------------------------------------
    # Soft Delete (Admin Only)
    # ------------------------------------------------------------------
    def soft_delete_booking(self, actor: ActorContext, booking_id: int) -> None:
        self.policy.require_action(actor, "booking:soft_delete")
        self.booking_repo.soft_delete(booking_id)

    # ------------------------------------------------------------------
    # CSV Batch Import
    # ------------------------------------------------------------------
    def import_bookings_csv(self, actor: ActorContext, csv_content: str) -> ImportSummary:
        """Import bookings from CSV text, collecting line-numbered errors without aborting valid rows."""
        self.policy.require_action(actor, "booking:import")

        stripped = csv_content.strip()
        if not stripped:
            return ImportSummary(
                total_rows=0,
                imported_count=0,
                failed_count=0,
                created_booking_ids=[],
                errors=[],
            )

        reader = csv.DictReader(io.StringIO(stripped))
        created_ids: list[int] = []
        errors: list[ImportErrorItem] = []
        total_rows = 0

        for line_number, raw_row in enumerate(reader, start=2):
            if raw_row is None or all(not (v or "").strip() for v in raw_row.values()):
                continue
            total_rows += 1
            row = {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in raw_row.items() if k is not None}

            try:
                user_id = row.get("user_id") or None
                resource_id = row.get("resource_id") or ""
                if not resource_id:
                    raise ValidationError("Missing required field 'resource_id'.")
                start_time = _parse_timestamp(row.get("start_time") or "", "start_time")
                end_time = _parse_timestamp(row.get("end_time") or "", "end_time")

                purpose = row.get("purpose") or None
                notes = row.get("notes") or None
                raw_group = row.get("group_size") or ""
                group_size = int(raw_group) if raw_group else None

                dto = BookingCreate(
                    user_id=user_id,
                    resource_id=resource_id,
                    start_time=start_time,
                    end_time=end_time,
                    purpose=purpose,
                    notes=notes,
                    group_size=group_size,
                )
                created = self.create_booking(actor, dto)
                created_ids.append(created.booking_id)
            except (DomainError, PydanticValidationError, ValueError) as exc:
                errors.append(
                    ImportErrorItem(
                        line_number=line_number,
                        error=str(exc),
                        row_data=dict(row),
                    )
                )

        return ImportSummary(
            total_rows=total_rows,
            imported_count=len(created_ids),
            failed_count=len(errors),
            created_booking_ids=created_ids,
            errors=errors,
        )
