"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  Pencil,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { RESOURCE_TYPE_SINGULAR, type BookingOut } from "@/types";
import { cancelBooking } from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatDuration, formatTimeRange } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { useBookings } from "@/hooks/useBookings";
import { RedactedValue, StatusBadge } from "@/components/bookings/StatusBadge";
import { EditBookingModal } from "@/components/bookings/EditBookingModal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

type Segment = "all" | "upcoming" | "pending" | "history";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "pending", label: "Pending" },
  { value: "history", label: "History" },
];

export default function MyBookingsPage() {
  const { actor, actorHeadersContext, isRedactedRole } = useActor();
  const [segment, setSegment] = useState<Segment>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<BookingOut | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { bookings, loading, error, refresh } = useBookings({ limit: 200 });

  const filteredBookings = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const q = search.trim().toLowerCase();

    return bookings.filter((b) => {
      if (segment === "upcoming") {
        if (b.status_id !== "confirmed" && b.status_id !== "pending") return false;
        if (b.end_time < nowSec && b.status_id === "confirmed") return false;
      } else if (segment === "pending") {
        if (b.status_id !== "pending") return false;
      } else if (segment === "history") {
        if (
          b.status_id !== "completed" &&
          b.status_id !== "cancelled" &&
          b.status_id !== "rejected" &&
          b.status_id !== "no_show"
        ) {
          return false;
        }
      }

      if (!q) return true;
      return (
        String(b.booking_id).includes(q) ||
        b.resource_id.toLowerCase().includes(q) ||
        (b.resource_name?.toLowerCase().includes(q) ?? false) ||
        b.user_id.toLowerCase().includes(q) ||
        (b.user_name?.toLowerCase().includes(q) ?? false) ||
        (b.purpose?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [bookings, segment, search]);

  // Ensure a valid selection is active whenever list changes
  useEffect(() => {
    if (filteredBookings.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!filteredBookings.some((b) => b.booking_id === selectedId)) {
      setSelectedId(filteredBookings[0].booking_id);
    }
  }, [filteredBookings, selectedId]);

  const selectedBooking = useMemo(
    () => filteredBookings.find((b) => b.booking_id === selectedId) ?? null,
    [filteredBookings, selectedId]
  );

  const handleCancel = async (booking: BookingOut) => {
    setBusyId(booking.booking_id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await cancelBooking(actorHeadersContext, booking.booking_id);
      setActionSuccess(`Booking #${booking.booking_id} cancelled and slot released.`);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Failed to cancel booking."
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] sm:text-[38px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink">
            {actor.role === "member" ? "My Bookings" : "Bookings Overview"}
          </h1>
          <p className="mt-1.5 text-[15px] text-slate-muted">
            {actor.role === "member"
              ? `Reservations for ${actor.full_name} (${actor.user_id})`
              : isRedactedRole
                ? "Privacy-protected read-only view across campus reservations."
                : "Inspect reservations, reschedule windows, or open the Admin Console table."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {actor.role !== "member" && (
            <Link
              href="/admin/bookings"
              className="text-[13.5px] font-medium text-slate-muted hover:text-ink underline underline-offset-4 mr-1"
            >
              Open Admin Table →
            </Link>
          )}
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Student Services Redaction Notice */}
      {isRedactedRole && (
        <div className="flex items-start gap-3 rounded-[18px] bg-blush px-5 py-4 text-sienna">
          <Shield className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="text-[13px] leading-relaxed">
            <p className="font-semibold">Privacy projection active (Student Services)</p>
            <p className="mt-0.5 opacity-90">
              User identifiers are pseudonymised (<span className="font-mono">ANON-...</span>),
              names are removed, free-text fields are replaced with{" "}
              <span className="font-mono">[REDACTED]</span>, and mutating actions are disabled.
            </p>
          </div>
        </div>
      )}

      {/* Segmented Tabs + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-1 rounded-full bg-mist p-1 self-start">
          {SEGMENTS.map((seg) => {
            const active = segment === seg.value;
            return (
              <button
                key={seg.value}
                type="button"
                onClick={() => setSegment(seg.value)}
                className={`rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors ${
                  active
                    ? "bg-paper text-ink shadow-attio-card"
                    : "text-slate-muted hover:text-ink"
                }`}
              >
                {seg.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ash" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resource, ID, purpose..."
            aria-label="Search bookings"
            className="w-full rounded-full border border-hairline bg-paper py-2 pl-10 pr-4 text-[13.5px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      {actionError && <ErrorBanner message={actionError} />}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-[14px] bg-mist px-4 py-3 text-[13.5px] font-medium text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Master-Detail Body */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 animate-pulse">
          <div className="lg:col-span-5 space-y-2.5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-24 rounded-[18px] bg-mist/70" />
            ))}
          </div>
          <div className="lg:col-span-7 h-96 rounded-[24px] bg-mist/70" />
        </div>
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="No bookings in this view"
          description={
            actor.role === "member"
              ? "You don't have any reservations matching this filter yet."
              : "No bookings match the current segment or search query."
          }
          action={
            <Link
              href="/resources"
              className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-paper hover:opacity-85"
            >
              Explore Resources
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left Pane: Master List */}
          <div
            data-testid="bookings-master-list"
            className="lg:col-span-5 overflow-hidden rounded-[24px] border border-hairline bg-paper divide-y divide-hairline max-h-[720px] overflow-y-auto"
          >
            {filteredBookings.map((b) => {
              const selected = b.booking_id === selectedBooking?.booking_id;
              return (
                <button
                  key={b.booking_id}
                  type="button"
                  data-booking-row={b.booking_id}
                  data-user-id={b.user_id}
                  onClick={() => setSelectedId(b.booking_id)}
                  className={`w-full text-left px-5 py-4 transition-colors ${
                    selected ? "bg-mist" : "bg-paper hover:bg-fog"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-ink truncate">
                        {b.resource_name ?? b.resource_id}
                      </p>
                      <p className="mt-1 text-[13px] text-slate-muted tabular-nums">
                        {formatTimeRange(b.start_time, b.end_time)}
                      </p>
                    </div>
                    <StatusBadge status={b.status_id} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ash">
                    <span className="font-mono">#{b.booking_id}</span>
                    <span>·</span>
                    <span className="font-mono text-slate-muted">{b.user_id}</span>
                    {b.user_name && (
                      <>
                        <span>·</span>
                        <span className="truncate">{b.user_name}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Pane: Detail Inspector */}
          <aside
            data-testid="booking-detail-inspector"
            className="lg:col-span-7 rounded-[24px] border border-hairline bg-paper p-6 sm:p-8 shadow-steep-subtle lg:sticky lg:top-24"
          >
            {selectedBooking && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-5">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 text-[12.5px] text-slate-muted">
                      <span className="font-mono text-ash">
                        #{selectedBooking.booking_id}
                      </span>
                      {selectedBooking.resource_type && (
                        <>
                          <span className="text-smoke">·</span>
                          <span>
                            {RESOURCE_TYPE_SINGULAR[selectedBooking.resource_type]}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
                      {selectedBooking.resource_name ?? selectedBooking.resource_id}
                    </h2>
                    <Link
                      href={`/resources/${encodeURIComponent(selectedBooking.resource_id)}`}
                      className="inline-block text-[13.5px] font-medium text-ink hover:underline underline-offset-4"
                    >
                      Open resource page ({selectedBooking.resource_id}) →
                    </Link>
                  </div>
                  <StatusBadge status={selectedBooking.status_id} />
                </div>

                {/* Key Schedule & Requester Info */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-[18px] bg-mist p-5 text-[13.5px]">
                  <div>
                    <div className="text-[11.5px] text-slate-muted">Schedule (UTC)</div>
                    <div className="mt-1 font-medium text-ink tabular-nums">
                      {formatTimeRange(
                        selectedBooking.start_time,
                        selectedBooking.end_time
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-muted tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-ash" />
                      {formatDuration(
                        selectedBooking.start_time,
                        selectedBooking.end_time
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11.5px] text-slate-muted">Booked by</div>
                    <div className="mt-1 font-medium text-ink">
                      {selectedBooking.user_name ? (
                        selectedBooking.user_name
                      ) : (
                        <RedactedValue value={selectedBooking.user_id} />
                      )}
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-muted">
                      {selectedBooking.user_name && (
                        <span className="font-mono mr-2">
                          {selectedBooking.user_id}
                        </span>
                      )}
                      {selectedBooking.course && <span>{selectedBooking.course}</span>}
                    </div>
                  </div>
                </div>

                {/* Purpose & Notes */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[12.5px] font-medium uppercase tracking-[0.04em] text-ash">
                      Purpose
                    </h3>
                    <div className="mt-1.5 text-[14.5px] leading-relaxed text-ink">
                      <RedactedValue value={selectedBooking.purpose} />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[12.5px] font-medium uppercase tracking-[0.04em] text-ash">
                      Notes
                    </h3>
                    <div className="mt-1.5 text-[14px] leading-relaxed text-slate-muted">
                      <RedactedValue value={selectedBooking.notes} />
                    </div>
                  </div>
                </div>

                {/* Audit Timestamps */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-hairline pt-4 text-[12px] text-ash tabular-nums">
                  <span>
                    Created:{" "}
                    <span className="font-mono">
                      {formatDateTime(selectedBooking.created_at)}
                    </span>
                  </span>
                  <span>
                    Updated:{" "}
                    <span className="font-mono">
                      {formatDateTime(selectedBooking.updated_at)}
                    </span>
                  </span>
                </div>

                {/* Actions (hidden for student_services and closed bookings) */}
                {!isRedactedRole &&
                  (selectedBooking.status_id === "pending" ||
                    selectedBooking.status_id === "confirmed") && (
                    <div
                      data-testid="booking-inspector-actions"
                      className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5"
                    >
                      <Button
                        variant="primary"
                        size="md"
                        disabled={busyId === selectedBooking.booking_id}
                        onClick={() => setEditing(selectedBooking)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Reschedule / Edit
                      </Button>
                      <Button
                        variant="blush"
                        size="md"
                        loading={busyId === selectedBooking.booking_id}
                        onClick={() => void handleCancel(selectedBooking)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Cancel Booking
                      </Button>
                    </div>
                  )}
              </div>
            )}
          </aside>
        </div>
      )}

      <EditBookingModal
        booking={editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setActionSuccess("Booking updated successfully.");
          void refresh();
        }}
      />
    </div>
  );
}
