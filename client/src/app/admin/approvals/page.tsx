"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Clock,
  Lock,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { RESOURCE_TYPE_SINGULAR, type BookingOut } from "@/types";
import { approveBooking, rejectBooking } from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatDuration, formatTimeRange } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { useBookings } from "@/hooks/useBookings";
import { StatusBadge } from "@/components/bookings/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

export default function AdminApprovalsPage() {
  const { actorHeadersContext, canManageApprovals } = useActor();
  const { bookings, loading, error, refresh } = useBookings({
    status_id: "pending",
    limit: 200,
  });

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredQueue = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        String(b.booking_id).includes(q) ||
        b.resource_id.toLowerCase().includes(q) ||
        (b.resource_name?.toLowerCase().includes(q) ?? false) ||
        b.user_id.toLowerCase().includes(q) ||
        (b.user_name?.toLowerCase().includes(q) ?? false) ||
        (b.purpose?.toLowerCase().includes(q) ?? false)
    );
  }, [bookings, search]);

  useEffect(() => {
    if (filteredQueue.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!filteredQueue.some((b) => b.booking_id === selectedId)) {
      setSelectedId(filteredQueue[0].booking_id);
    }
  }, [filteredQueue, selectedId]);

  const selected = useMemo(
    () => filteredQueue.find((b) => b.booking_id === selectedId) ?? null,
    [filteredQueue, selectedId]
  );

  if (!canManageApprovals) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Manager or Admin role required"
        description="Only departmental managers and administrators can approve or reject pending booking requests."
      />
    );
  }

  const handleDecision = async (booking: BookingOut, decision: "approve" | "reject") => {
    setBusyId(booking.booking_id);
    setFeedback(null);
    setActionError(null);
    const notes = reviewNotes[booking.booking_id]?.trim() || null;
    try {
      if (decision === "approve") {
        await approveBooking(actorHeadersContext, booking.booking_id, { notes });
        setFeedback(`Booking #${booking.booking_id} approved and confirmed.`);
      } else {
        await rejectBooking(actorHeadersContext, booking.booking_id, { notes });
        setFeedback(`Booking #${booking.booking_id} rejected and slot released.`);
      }
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : `Failed to ${decision} booking.`
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-hairline pb-5">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
            Approvals Queue
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-muted tabular-nums">
            {loading
              ? "Loading pending booking requests..."
              : `${bookings.length} pending ${bookings.length === 1 ? "request" : "requests"} awaiting sign-off`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ash" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter pending requests..."
              className="w-full rounded-[10px] border border-hairline bg-paper py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            shape="compact"
            onClick={() => void refresh()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      {actionError && <ErrorBanner message={actionError} />}
      {feedback && (
        <div className="flex items-center gap-2 rounded-[12px] bg-mist px-4 py-3 text-[13px] font-medium text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 animate-pulse">
          <div className="lg:col-span-5 space-y-2.5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-24 rounded-[14px] bg-mist/70" />
            ))}
          </div>
          <div className="lg:col-span-7 h-96 rounded-[16px] bg-mist/70" />
        </div>
      ) : filteredQueue.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Approvals queue is clear"
          description="All pending booking requests have been processed."
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left Queue */}
          <div className="lg:col-span-5 overflow-hidden rounded-[16px] border border-hairline bg-paper divide-y divide-hairline max-h-[680px] overflow-y-auto">
            {filteredQueue.map((item) => {
              const isSelected = item.booking_id === selected?.booking_id;
              return (
                <button
                  key={item.booking_id}
                  type="button"
                  onClick={() => setSelectedId(item.booking_id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    isSelected ? "bg-mist" : "bg-paper hover:bg-fog"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink truncate">
                        {item.resource_name ?? item.resource_id}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-slate-muted truncate">
                        {item.user_name ?? item.user_id}
                        {item.course ? ` · ${item.course}` : ""}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-ash shrink-0">
                      #{item.booking_id}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-slate-muted tabular-nums">
                    {formatTimeRange(item.start_time, item.end_time)}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Decision Inspector */}
          <aside className="lg:col-span-7 rounded-[16px] border border-hairline bg-paper p-6 lg:sticky lg:top-8">
            {selected && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[12px] text-slate-muted">
                      <span className="font-mono text-ash">#{selected.booking_id}</span>
                      {selected.resource_type && (
                        <>
                          <span className="text-smoke">·</span>
                          <span>{RESOURCE_TYPE_SINGULAR[selected.resource_type]}</span>
                        </>
                      )}
                    </div>
                    <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.015em] text-ink">
                      {selected.resource_name ?? selected.resource_id}
                    </h2>
                    <Link
                      href={`/resources/${encodeURIComponent(selected.resource_id)}`}
                      className="mt-1 inline-block text-[13px] font-medium text-ink hover:underline underline-offset-4"
                    >
                      Inspect resource ({selected.resource_id}) →
                    </Link>
                  </div>
                  <StatusBadge status={selected.status_id} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-[12px] bg-fog border border-hairline p-4 text-[13px]">
                  <div>
                    <div className="text-[11.5px] text-ash">Requester</div>
                    <div className="mt-0.5 font-medium text-ink">
                      {selected.user_name ?? selected.user_id}
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-muted">
                      <span className="font-mono">{selected.user_id}</span>
                      {selected.course ? ` · ${selected.course}` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-ash">Requested Window (UTC)</div>
                    <div className="mt-0.5 font-medium text-ink tabular-nums">
                      {formatTimeRange(selected.start_time, selected.end_time)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-muted tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-ash" />
                      {formatDuration(selected.start_time, selected.end_time)}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-[13.5px]">
                  <div>
                    <div className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-ash">
                      Purpose
                    </div>
                    <p className="mt-1 text-ink leading-relaxed">
                      {selected.purpose || <span className="text-ash">No purpose stated</span>}
                    </p>
                  </div>
                  {selected.notes && (
                    <div>
                      <div className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-ash">
                        Requester Notes
                      </div>
                      <p className="mt-1 text-slate-muted leading-relaxed">{selected.notes}</p>
                    </div>
                  )}
                  <p className="text-[11.5px] text-ash tabular-nums">
                    Submitted <span className="font-mono">{formatDateTime(selected.created_at)}</span>
                  </p>
                </div>

                <div className="border-t border-hairline pt-4 space-y-4">
                  <div>
                    <label className="block text-[12.5px] font-medium text-ink">
                      Manager decision notes <span className="font-normal text-ash">(optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={reviewNotes[selected.booking_id] ?? ""}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({
                          ...prev,
                          [selected.booking_id]: e.target.value,
                        }))
                      }
                      placeholder="Add collection instructions or rejection reason..."
                      className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="primary"
                      size="md"
                      shape="pill"
                      loading={busyId === selected.booking_id}
                      onClick={() => void handleDecision(selected, "approve")}
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="blush"
                      size="md"
                      shape="pill"
                      disabled={busyId === selected.booking_id}
                      onClick={() => void handleDecision(selected, "reject")}
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
