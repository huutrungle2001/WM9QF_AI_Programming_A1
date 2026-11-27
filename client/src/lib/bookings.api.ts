import type {
  ActorContext,
  BookingCreate,
  BookingFilter,
  BookingOut,
  BookingTransitionRequest,
  BookingUpdate,
  ImportSummary,
} from "@/types";
import { apiRequest } from "./api-client";

export async function listBookings(
  actor: ActorContext,
  filters: BookingFilter = {}
): Promise<BookingOut[]> {
  return apiRequest<BookingOut[]>("/bookings", {
    actor,
    params: {
      user_id: filters.user_id,
      resource_id: filters.resource_id,
      resource_type: filters.resource_type,
      department_id: filters.department_id,
      course: filters.course,
      status_id: filters.status_id,
      from_ts: filters.from_ts,
      to_ts: filters.to_ts,
      limit: filters.limit,
      offset: filters.offset,
    },
  });
}

export async function getBooking(
  actor: ActorContext,
  bookingId: number
): Promise<BookingOut> {
  return apiRequest<BookingOut>(`/bookings/${bookingId}`, { actor });
}

export async function createBooking(
  actor: ActorContext,
  payload: BookingCreate
): Promise<BookingOut> {
  return apiRequest<BookingOut>("/bookings", {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function updateBooking(
  actor: ActorContext,
  bookingId: number,
  payload: BookingUpdate
): Promise<BookingOut> {
  return apiRequest<BookingOut>(`/bookings/${bookingId}`, {
    method: "PATCH",
    actor,
    body: payload,
  });
}

export async function approveBooking(
  actor: ActorContext,
  bookingId: number,
  payload: BookingTransitionRequest = {}
): Promise<BookingOut> {
  return apiRequest<BookingOut>(`/bookings/${bookingId}/approve`, {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function rejectBooking(
  actor: ActorContext,
  bookingId: number,
  payload: BookingTransitionRequest = {}
): Promise<BookingOut> {
  return apiRequest<BookingOut>(`/bookings/${bookingId}/reject`, {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function cancelBooking(
  actor: ActorContext,
  bookingId: number,
  payload: BookingTransitionRequest = {}
): Promise<BookingOut> {
  return apiRequest<BookingOut>(`/bookings/${bookingId}/cancel`, {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function completeBooking(
  actor: ActorContext,
  bookingId: number,
  payload: BookingTransitionRequest = {}
): Promise<BookingOut> {
  return apiRequest<BookingOut>(`/bookings/${bookingId}/complete`, {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function markNoShow(
  actor: ActorContext,
  bookingId: number,
  payload: BookingTransitionRequest = {}
): Promise<BookingOut> {
  return apiRequest<BookingOut>(`/bookings/${bookingId}/no-show`, {
    method: "POST",
    actor,
    body: payload,
  });
}

export async function deleteBooking(
  actor: ActorContext,
  bookingId: number
): Promise<void> {
  return apiRequest<void>(`/bookings/${bookingId}`, {
    method: "DELETE",
    actor,
  });
}

export async function importBookingsCsv(
  actor: ActorContext,
  file: File
): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<ImportSummary>("/bookings/import-csv", {
    method: "POST",
    actor,
    formData,
  });
}
