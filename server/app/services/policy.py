"""Single source of truth for 4-role RBAC, Policy-to-SQL pushdown, and UK GDPR redaction."""

from __future__ import annotations

import hashlib

from app.config import AppSettings
from app.domain.enums import BookingEligibility, Role, UserType
from app.domain.exceptions import ForbiddenError, ValidationError
from app.domain.resources import Resource
from app.schemas.actor import ActorContext
from app.schemas.booking import BookingOut
from app.schemas.user import UserOut

ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.ADMIN: frozenset({"*"}),
    Role.MANAGER: frozenset(
        {
            "department:read",
            "building:read",
            "facility:read",
            "facility:create",
            "status:read",
            "user:read",
            "resource:read",
            "resource:create",
            "resource:update",
            "resource:retire",
            "availability:read",
            "booking:read",
            "booking:create",
            "booking:update",
            "booking:approve",
            "booking:reject",
            "booking:cancel",
            "booking:complete",
            "booking:no_show",
            "booking:import",
            "analytics:read",
            "charts:export",
        }
    ),
    Role.STUDENT_SERVICES: frozenset(
        {
            "department:read",
            "building:read",
            "facility:read",
            "status:read",
            "resource:read",
            "availability:read",
            "booking:read",
            "analytics:read",
            "charts:export",
        }
    ),
    Role.MEMBER: frozenset(
        {
            "department:read",
            "building:read",
            "facility:read",
            "status:read",
            "resource:read",
            "availability:read",
            "booking:read",
            "booking:create",
            "booking:update",
            "booking:cancel",
        }
    ),
}


class PolicyGuard:
    """Enforces 4-role RBAC, resource eligibility pushdown, ownership, and privacy projection."""

    def __init__(self, pseudonym_salt: str | None = None) -> None:
        self._pseudonym_salt = (
            pseudonym_salt if pseudonym_salt is not None else AppSettings().pseudonym_salt
        )

    def require_action(self, actor: ActorContext, action: str) -> None:
        """Raise ForbiddenError if actor's role does not permit the requested action."""
        perms = ROLE_PERMISSIONS.get(actor.role, frozenset())
        if "*" in perms or action in perms:
            return
        raise ForbiddenError(
            f"Role '{actor.role.value}' is not permitted to perform action '{action}'."
        )

    @staticmethod
    def eligibilities_for_user(
        user_type: UserType | None,
        has_accessibility_access: bool,
    ) -> list[str]:
        """Compute exact BookingEligibility values permitted for a given user_type and flag."""
        allowed: list[BookingEligibility] = [BookingEligibility.ALL_USERS]

        if user_type == UserType.UG_STUDENT:
            allowed.append(BookingEligibility.STUDENTS_ONLY)
        elif user_type == UserType.PG_STUDENT:
            allowed.extend([BookingEligibility.STUDENTS_ONLY, BookingEligibility.PG_ONLY])
        elif user_type == UserType.PGR_STUDENT:
            allowed.extend(
                [
                    BookingEligibility.STUDENTS_ONLY,
                    BookingEligibility.PG_ONLY,
                    BookingEligibility.PGR_AND_STAFF,
                ]
            )
        elif user_type == UserType.STAFF:
            allowed.extend([BookingEligibility.STAFF_ONLY, BookingEligibility.PGR_AND_STAFF])

        if has_accessibility_access:
            allowed.append(BookingEligibility.DISABILITY_ONLY)

        return [e.value for e in allowed]

    def allowed_eligibilities(self, actor: ActorContext) -> list[str] | None:
        """Return None (unrestricted) for staff roles or exact allowed list for members."""
        if actor.role in (Role.ADMIN, Role.MANAGER, Role.STUDENT_SERVICES):
            return None
        return self.eligibilities_for_user(actor.user_type, actor.has_accessibility_access)

    def assert_can_book_for(
        self,
        actor: ActorContext,
        target_user: UserOut,
        resource: Resource,
    ) -> None:
        """Validate target user activity, ownership (for members), and resource eligibility."""
        self.require_action(actor, "booking:create")

        if not target_user.is_active:
            raise ValidationError(
                f"User '{target_user.user_id}' is inactive and cannot hold new bookings."
            )

        if actor.role == Role.MEMBER:
            if actor.user_id is None or actor.user_id != target_user.user_id:
                raise ForbiddenError("Members may only create bookings for themselves.")

        permitted = self.eligibilities_for_user(
            target_user.user_type, target_user.has_accessibility_access
        )
        if resource.booking_eligibility.value not in permitted:
            raise ForbiddenError(
                f"User '{target_user.user_id}' ({target_user.user_type.value}) is not eligible "
                f"to book resource '{resource.resource_id}' "
                f"(eligibility: '{resource.booking_eligibility.value}')."
            )

    # Compatibility alias matching docs/design/04_ood_design.md
    assert_eligible_for_resource = assert_can_book_for

    def assert_can_view_booking(self, actor: ActorContext, booking: BookingOut) -> None:
        """Ensure members can only view their own bookings; staff roles can view all."""
        self.require_action(actor, "booking:read")
        if actor.role == Role.MEMBER:
            if actor.user_id is None or booking.user_id != actor.user_id:
                raise ForbiddenError("Members may only view their own bookings.")

    def assert_can_modify_booking(self, actor: ActorContext, booking: BookingOut) -> None:
        """Ensure only admin/manager or owning member can modify/cancel; student_services is read-only."""
        if actor.role in (Role.ADMIN, Role.MANAGER):
            return
        if actor.role == Role.STUDENT_SERVICES:
            raise ForbiddenError("Student Services role has read-only access to bookings.")
        if actor.role == Role.MEMBER:
            if actor.user_id is None or booking.user_id != actor.user_id:
                raise ForbiddenError("Members may only modify or cancel their own bookings.")
            return
        raise ForbiddenError(f"Role '{actor.role.value}' cannot modify bookings.")

    # Compatibility alias matching docs/design/04_ood_design.md
    assert_booking_owner_or_staff = assert_can_modify_booking

    def pseudonymise_user_id(self, user_id: str) -> str:
        """Deterministic salted SHA-256 pseudonymisation -> ANON-<10 hex chars>."""
        digest = hashlib.sha256(f"{self._pseudonym_salt}:{user_id}".encode("utf-8")).hexdigest()
        return f"ANON-{digest[:10]}"

    def project_booking(self, actor: ActorContext, booking: BookingOut) -> BookingOut:
        """Apply UK GDPR redaction for student_services; pass through unchanged for other roles."""
        if actor.role != Role.STUDENT_SERVICES:
            return booking
        return booking.model_copy(
            update={
                "user_id": self.pseudonymise_user_id(booking.user_id),
                "user_name": None,
                "purpose": "[REDACTED]" if booking.purpose is not None else None,
                "notes": "[REDACTED]" if booking.notes is not None else None,
            }
        )
