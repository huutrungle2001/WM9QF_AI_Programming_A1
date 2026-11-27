"""Booking lifecycle, status transitions, soft delete, and CSV batch import routes."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, Request, Response, status

from app.dependencies import get_actor_context, get_booking_service
from app.domain.enums import ResourceType
from app.domain.exceptions import ValidationError
from app.schemas.actor import ActorContext
from app.schemas.booking import (
    BookingCreate,
    BookingFilter,
    BookingOut,
    BookingTransitionRequest,
    BookingUpdate,
    ImportSummary,
)
from app.services.booking_service import BookingService

router = APIRouter(prefix="/api/v1", tags=["bookings"])


async def _extract_csv_content(request: Request) -> str:
    """Accept raw text/csv, JSON {"csv_content": ...}, or multipart file upload."""
    content_type = (request.headers.get("content-type") or "").lower()

    if "multipart/form-data" in content_type:
        form = await request.form()
        upload = form.get("file")
        if upload is None:
            for value in form.values():
                if hasattr(value, "read"):
                    upload = value
                    break
        if upload is not None and hasattr(upload, "read"):
            raw_bytes = await upload.read()
            try:
                return raw_bytes.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise ValidationError("Uploaded CSV file must be valid UTF-8 text.") from exc
        csv_field = form.get("csv_content")
        if isinstance(csv_field, str):
            return csv_field
        raise ValidationError("Multipart request must include a 'file' upload or 'csv_content' field.")

    if "application/json" in content_type:
        try:
            payload = await request.json()
        except Exception as exc:
            raise ValidationError("Invalid JSON body for CSV import.") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("csv_content"), str):
            raise ValidationError("JSON body must contain a string 'csv_content' field.")
        return payload["csv_content"]

    raw_bytes = await request.body()
    try:
        return raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValidationError("CSV request body must be valid UTF-8 text.") from exc


@router.get("/bookings", response_model=list[BookingOut])
def list_bookings(
    user_id: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    resource_type: ResourceType | None = Query(default=None),
    department_id: str | None = Query(default=None),
    course: str | None = Query(default=None),
    status_id: str | None = Query(default=None),
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> list[BookingOut]:
    filters = BookingFilter(
        user_id=user_id,
        resource_id=resource_id,
        resource_type=resource_type,
        department_id=department_id,
        course=course,
        status_id=status_id,
        from_ts=from_ts,
        to_ts=to_ts,
        limit=limit,
        offset=offset,
    )
    return booking_service.list_bookings(actor, filters)


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    return booking_service.create_booking(actor, payload)


@router.post("/bookings/import-csv", response_model=ImportSummary)
async def import_bookings_csv(
    request: Request,
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> ImportSummary:
    csv_content = await _extract_csv_content(request)
    return booking_service.import_bookings_csv(actor, csv_content)


@router.get("/bookings/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: int,
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    return booking_service.get_booking(actor, booking_id)


@router.patch("/bookings/{booking_id}", response_model=BookingOut)
def update_booking(
    booking_id: int,
    payload: BookingUpdate,
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    return booking_service.update_booking(actor, booking_id, payload)


@router.delete("/bookings/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def soft_delete_booking(
    booking_id: int,
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> Response:
    booking_service.soft_delete_booking(actor, booking_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/bookings/{booking_id}/approve", response_model=BookingOut)
def approve_booking(
    booking_id: int,
    payload: BookingTransitionRequest | None = Body(default=None),
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    notes = payload.notes if payload is not None else None
    return booking_service.approve_booking(actor, booking_id, notes=notes)


@router.post("/bookings/{booking_id}/reject", response_model=BookingOut)
def reject_booking(
    booking_id: int,
    payload: BookingTransitionRequest | None = Body(default=None),
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    notes = payload.notes if payload is not None else None
    return booking_service.reject_booking(actor, booking_id, notes=notes)


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(
    booking_id: int,
    payload: BookingTransitionRequest | None = Body(default=None),
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    notes = payload.notes if payload is not None else None
    return booking_service.cancel_booking(actor, booking_id, notes=notes)


@router.post("/bookings/{booking_id}/complete", response_model=BookingOut)
def complete_booking(
    booking_id: int,
    payload: BookingTransitionRequest | None = Body(default=None),
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    notes = payload.notes if payload is not None else None
    return booking_service.complete_booking(actor, booking_id, notes=notes)


@router.post("/bookings/{booking_id}/no-show", response_model=BookingOut)
def mark_no_show(
    booking_id: int,
    payload: BookingTransitionRequest | None = Body(default=None),
    actor: ActorContext = Depends(get_actor_context),
    booking_service: BookingService = Depends(get_booking_service),
) -> BookingOut:
    notes = payload.notes if payload is not None else None
    return booking_service.mark_no_show(actor, booking_id, notes=notes)

