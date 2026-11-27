"""Typed framework-free domain exceptions mapped to HTTP statuses in routers."""

from __future__ import annotations


class DomainError(Exception):
    """Base class for all application domain errors."""

    code: str = "domain_error"
    status_code: int = 400

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class UnauthorizedError(DomainError):
    """Raised when actor authentication context is missing or invalid (HTTP 401)."""

    code: str = "unauthorized"
    status_code: int = 401


class ForbiddenError(DomainError):
    """Raised when actor lacks permission or resource eligibility (HTTP 403)."""

    code: str = "forbidden"
    status_code: int = 403


class NotFoundError(DomainError):
    """Raised when a requested entity does not exist or is soft-deleted (HTTP 404)."""

    code: str = "not_found"
    status_code: int = 404


class ConflictError(DomainError):
    """Raised on slot overlaps, capacity exhaustion, user clashes, or unique violations (HTTP 409)."""

    code: str = "conflict"
    status_code: int = 409


class ValidationError(DomainError):
    """Raised on invalid domain inputs, policy limits, or illegal state transitions (HTTP 422)."""

    code: str = "validation_error"
    status_code: int = 422


# Compatibility aliases matching 04_ood_design.md terminology
AuthenticationError = UnauthorizedError
AuthorizationError = ForbiddenError
