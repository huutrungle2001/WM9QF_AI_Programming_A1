"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserX,
} from "lucide-react";
import {
  RESOURCE_TYPE_SINGULAR,
  type BookingOut,
  type BookingStatusId,
} from "@/types";
import {
  cancelBooking,
  completeBooking,
  deleteBooking,
  markNoShow,
} from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { formatDuration, formatTimeRange } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { useBookings } from "@/hooks/useBookings";
import { RedactedValue, StatusBadge } from "@/components/bookings/StatusBadge";
import { EditBookingModal } from "@/components/bookings/EditBookingModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_TABS: { value: BookingStatusId | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
  { value: "no_show", label: "No-Show" },
];

export default function BookingsPage() {
  const { actor, actorHeadersContext, isRedactedRole, canManageApprovals } = useActor();
  const [statusFilter, setStatusFilter] = useState<BookingStatusId | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BookingOut | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { bookings, loading, error, refresh } = useBookings({
    status_id: statusFilter === "all" ? undefined : statusFilter,
    limit: 200,
  });

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      return (
        String(b.booking_id).includes(q) ||
        b.resource_id.toLowerCase().includes(q) ||
        (b.resource_name?.toLowerCase().includes(q) ?? false) ||
        b.user_id.toLowerCase().includes(q) ||
        (b.user_name?.toLowerCase().includes(q) ?? false) ||
        (b.course?.toLowerCase().includes(q) ?? false) ||
        (b.purpose?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [bookings, search]);

  const runAction = async (
    bookingId: number,
    label: string,
    fn: () => Promise<unknown>
  ) => {
    setBusyId(bookingId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await fn();
      setActionSuccess(`Booking #${bookingId}: ${label}.`);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : `Failed to ${label.toLowerCase()}.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Privacy Redaction Callout for student_services */}
      {isRedactedRole && (
        <div className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-5 py-4 text-fuchsia-950">
          <ShieldAlert className="h-5 w-5 shrink-0 text-fuchsia-700 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-sm text-fuchsia-900">
              Privacy Projection Active (Student Services Role)
            </p>
            <p className="mt-0.5 text-fuchsia-800">
              Personal identifiers are SHA-256 pseudonymised (<span className="font-mono font-semibold">ANON-...</span>),
              student names are stripped, and free-text <span className="font-mono">purpose</span> /{" "}
              <span className="font-mono">notes</span> fields are replaced with{" "}
              <span className="font-mono font-semibold">[REDACTED]</span> by PolicyGuard before leaving the backend.
            </p>
          </div>
        </div>
      )}

      {/* Status Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-warwick-700 text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking, room, user..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      {actionError && <ErrorBanner message={actionError} />}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {actionSuccess}
        </div>
      )}

      {/* Bookings Table */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-12 rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="No bookings match this view"
          description={
            actor.role === "member"
              ? "You have no bookings matching the active status filter. Explore campus resources to reserve a room or kit."
              : "No bookings found for the current filter combination."
          }
          action={
            <Link
              href="/"
              className="inline-flex items-center rounded-lg bg-warwick-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-warwick-800"
            >
              Explore Resources
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Booking / Resource
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  User & Course
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Schedule (UTC)
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Purpose & Notes
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBookings.map((b) => {
                const isModifiable =
                  !isRedactedRole &&
                  (b.status_id === "pending" || b.status_id === "confirmed");
                const isBusy = busyId === b.booking_id;

                return (
                  <tr key={b.booking_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-400">
                          #{b.booking_id}
                        </span>
                        {b.resource_type && (
                          <Badge tone="slate" className="text-[10px]">
                            {RESOURCE_TYPE_SINGULAR[b.resource_type]}
                          </Badge>
                        )}
                      </div>
                      <Link
                        href={`/resources/${encodeURIComponent(b.resource_id)}`}
                        className="mt-1 block font-semibold text-slate-900 hover:text-warwick-700"
                      >
                        {b.resource_name ?? b.resource_id}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">{b.resource_id}</div>
                    </td>

                    <td className="px-4 py-3.5 align-top text-xs">
                      <div className="font-medium text-slate-800">
                        {b.user_name ? (
                          b.user_name
                        ) : (
                          <RedactedValue value={b.user_id} />
                        )}
                      </div>
                      <div className="mt-1">
                        {b.user_name ? (
                          <span className="font-mono text-[11px] text-slate-500">
                            {b.user_id}
                          </span>
                        ) : (
                          <span className="text-[11px] text-fuchsia-700">Name stripped</span>
                        )}
                      </div>
                      {b.course && (
                        <div className="mt-0.5 text-[11px] text-slate-500">{b.course}</div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 align-top text-xs tabular-nums">
                      <div className="font-medium text-slate-800">
                        {formatTimeRange(b.start_time, b.end_time)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        Duration: {formatDuration(b.start_time, b.end_time)}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <StatusBadge status={b.status_id} />
                    </td>

                    <td className="px-4 py-3.5 align-top text-xs max-w-xs">
                      <div className="text-slate-700">
                        <RedactedValue value={b.purpose} />
                      </div>
                      {b.notes && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          <span className="text-slate-400 mr-1">Notes:</span>
                          <RedactedValue value={b.notes} />
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 align-top text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        {isModifiable && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isBusy}
                            onClick={() => setEditing(b)}
                            title="Edit purpose or reschedule"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        )}
                        {isModifiable && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isBusy}
                            className="text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                            onClick={() =>
                              void runAction(b.booking_id, "cancelled", () =>
                                cancelBooking(actorHeadersContext, b.booking_id)
                              )
                            }
                            title="Cancel booking (releases slot)"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        )}
                        {canManageApprovals && b.status_id === "confirmed" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              className="text-emerald-700 hover:bg-emerald-50"
                              onClick={() =>
                                void runAction(b.booking_id, "marked completed", () =>
                                  completeBooking(actorHeadersContext, b.booking_id)
                                )
                              }
                              title="Mark as completed"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              className="text-rose-700 hover:bg-rose-50"
                              onClick={() =>
                                void runAction(b.booking_id, "marked no-show", () =>
                                  markNoShow(actorHeadersContext, b.booking_id)
                                )
                              }
                              title="Mark as no-show"
                            >
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {actor.role === "admin" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isBusy}
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Soft-delete booking #${b.booking_id}? (Sets deleted_at, preserves audit trail)`
                                )
                              ) {
                                void runAction(b.booking_id, "soft-deleted", () =>
                                  deleteBooking(actorHeadersContext, b.booking_id)
                                );
                              }
                            }}
                            title="Admin soft-delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
