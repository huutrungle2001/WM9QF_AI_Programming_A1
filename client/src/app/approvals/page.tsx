"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  Lock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { RESOURCE_TYPE_SINGULAR } from "@/types";
import { approveBooking, rejectBooking } from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { formatDuration, formatTimeRange } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { useBookings } from "@/hooks/useBookings";
import { StatusBadge } from "@/components/bookings/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ApprovalsPage() {
  const { actor, actorHeadersContext, canManageApprovals } = useActor();
  const { bookings, loading, error, refresh } = useBookings({
    status_id: "pending",
    limit: 200,
  });

  const [notesById, setNotesById] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleDecision = async (bookingId: number, decision: "approve" | "reject") => {
    setBusyId(bookingId);
    setActionError(null);
    setActionSuccess(null);
    const notes = notesById[bookingId]?.trim() || null;

    try {
      if (decision === "approve") {
        await approveBooking(actorHeadersContext, bookingId, { notes });
        setActionSuccess(`Approved booking #${bookingId} (status -> confirmed).`);
      } else {
        await rejectBooking(actorHeadersContext, bookingId, { notes });
        setActionSuccess(`Rejected booking #${bookingId} (slot released).`);
      }
      setNotesById((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : `Could not ${decision} booking #${bookingId}.`
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!canManageApprovals) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Manager or Administrator Role Required"
        description={`You are currently signed in as ${actor.label} (${actor.role}). Switch to Admin (ADMIN1), Library Manager (MGR-LIB), or Central Manager (MGR-CENTRAL) in the top bar to approve or reject pending bookings.`}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Pending Approval Queue
            </h2>
            <p className="text-xs text-slate-500">
              Specialist equipment loans and approval-gated rooms awaiting decision ({bookings.length} pending)
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Queue
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      {actionError && <ErrorBanner message={actionError} />}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {actionSuccess}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-5 w-5" />}
          title="Approval queue is clear"
          description="All pending booking requests have been reviewed. New requests for approval-gated rooms or equipment will appear here automatically."
        />
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const isBusy = busyId === b.booking_id;
            return (
              <div
                key={b.booking_id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-400">
                        #{b.booking_id}
                      </span>
                      <StatusBadge status={b.status_id} />
                      {b.resource_type && (
                        <Badge tone="plum">
                          {RESOURCE_TYPE_SINGULAR[b.resource_type]}
                        </Badge>
                      )}
                      {b.department_id && (
                        <Badge tone="slate">{b.department_id}</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link
                        href={`/resources/${encodeURIComponent(b.resource_id)}`}
                        className="text-base font-semibold text-slate-900 hover:text-warwick-700"
                      >
                        {b.resource_name ?? b.resource_id}
                      </Link>
                      <span className="font-mono text-xs text-slate-400">
                        {b.resource_id}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
                      <span>
                        Requester:{" "}
                        <strong className="text-slate-900">
                          {b.user_name ?? b.user_id}
                        </strong>{" "}
                        <span className="font-mono text-slate-400">({b.user_id})</span>
                      </span>
                      {b.course && <span>Course: {b.course}</span>}
                      <span>
                        Slot:{" "}
                        <strong className="text-slate-900">
                          {formatTimeRange(b.start_time, b.end_time)}
                        </strong>{" "}
                        ({formatDuration(b.start_time, b.end_time)})
                      </span>
                    </div>

                    {b.purpose && (
                      <p className="text-xs text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        <span className="font-semibold text-slate-500 mr-1.5">Purpose:</span>
                        {b.purpose}
                      </p>
                    )}
                    {b.notes && (
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold text-slate-400 mr-1">Existing note:</span>
                        {b.notes}
                      </p>
                    )}
                  </div>

                  {/* Decision Controls */}
                  <div className="lg:w-80 shrink-0 space-y-2.5 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-5">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Decision Notes <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={notesById[b.booking_id] ?? ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [b.booking_id]: e.target.value,
                        }))
                      }
                      placeholder="e.g. Approved for sprint demo / Declined: priority maintenance"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        className="flex-1"
                        loading={isBusy}
                        onClick={() => void handleDecision(b.booking_id, "approve")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="flex-1"
                        loading={isBusy}
                        onClick={() => void handleDecision(b.booking_id, "reject")}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
