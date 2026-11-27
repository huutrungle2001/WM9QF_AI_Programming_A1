"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Shield } from "lucide-react";
import {
  ROOM_STYLE_LABELS,
  isEquipmentDetails,
  isRoomDetails,
  isSupportDetails,
  type BookingOut,
  type ResourceOut,
} from "@/types";
import { createBooking } from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import {
  dateTimeLocalToEpoch,
  defaultWindowForType,
  epochToDateTimeLocal,
  formatDuration,
  formatTimeRange,
} from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "./StatusBadge";

interface BookingPanelProps {
  resource: ResourceOut;
  initialStartEpoch?: number;
  initialEndEpoch?: number;
  onSuccess?: (booking: BookingOut) => void;
  variant?: "card" | "inline";
}

export function BookingPanel({
  resource,
  initialStartEpoch,
  initialEndEpoch,
  onSuccess,
  variant = "card",
}: BookingPanelProps) {
  const { actor, actorHeadersContext, canBook } = useActor();

  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<BookingOut | null>(null);

  useEffect(() => {
    setError(null);
    setCreated(null);
    setPurpose("");
    setNotes("");
    setTargetUserId(actor.user_id ?? "");

    if (initialStartEpoch && initialEndEpoch && initialEndEpoch > initialStartEpoch) {
      setStartLocal(epochToDateTimeLocal(initialStartEpoch));
      setEndLocal(epochToDateTimeLocal(initialEndEpoch));
    } else {
      const defaults = defaultWindowForType(resource.resource_type);
      setStartLocal(defaults.startLocal);
      setEndLocal(defaults.endLocal);
    }

    if (isRoomDetails(resource.details, resource.resource_type)) {
      setGroupSize(
        resource.resource_type === "group_space"
          ? String(Math.min(4, resource.details.capacity))
          : "1"
      );
    } else {
      setGroupSize("");
    }
  }, [resource, initialStartEpoch, initialEndEpoch, actor.user_id]);

  const startEpoch = useMemo(() => dateTimeLocalToEpoch(startLocal), [startLocal]);
  const endEpoch = useMemo(() => dateTimeLocalToEpoch(endLocal), [endLocal]);

  const roomDetails = isRoomDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;
  const equipmentDetails = isEquipmentDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;
  const supportDetails = isSupportDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;
  const isEquipment = Boolean(equipmentDetails);
  const isSupport = Boolean(supportDetails);
  const isRoom = Boolean(roomDetails);

  const durationPresets = isEquipment
    ? [
        { label: "4 hrs", hours: 4 },
        { label: "1 day", hours: 24 },
        { label: "2 days", hours: 48 },
        { label: "3 days", hours: 72 },
      ]
    : isSupport
      ? [
          { label: "1 hr", hours: 1 },
          { label: "2 hrs", hours: 2 },
        ]
      : [
          { label: "1 hr", hours: 1 },
          { label: "2 hrs", hours: 2 },
          { label: "3 hrs", hours: 3 },
          { label: "4 hrs", hours: 4 },
        ];

  const applyPresetHours = (hours: number) => {
    const base = startEpoch || Math.ceil(Date.now() / 1000 / 3600) * 3600 + 3600;
    setStartLocal(epochToDateTimeLocal(base));
    setEndLocal(epochToDateTimeLocal(base + hours * 3600));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBook) {
      setError("Student Services role is read-only and cannot create bookings.");
      return;
    }
    if (resource.status !== "active") {
      setError(`This resource is currently marked ${resource.status} and cannot be booked.`);
      return;
    }
    if (!startEpoch || !endEpoch || endEpoch <= startEpoch) {
      setError("End time must be strictly after start time.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createBooking(actorHeadersContext, {
        user_id:
          actor.role === "admin" || actor.role === "manager"
            ? targetUserId.trim() || actor.user_id || undefined
            : actor.user_id ?? undefined,
        resource_id: resource.resource_id,
        start_time: startEpoch,
        end_time: endEpoch,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
        group_size: isRoom && groupSize ? Number(groupSize) : null,
      });
      setCreated(result);
      onSuccess?.(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Could not submit booking request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const wrapperClass =
    variant === "card"
      ? "rounded-[24px] border border-hairline bg-paper p-6 shadow-steep-subtle"
      : "";

  const bookingTitle = isEquipment
    ? "Reserve equipment loan"
    : isSupport
      ? "Book support session"
      : "Reserve this space";

  const windowSummary =
    startEpoch > 0 && endEpoch > startEpoch
      ? formatDuration(startEpoch, endEpoch)
      : null;

  return (
    <div className={wrapperClass}>
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-ink">
          {bookingTitle}
        </h2>
        <p className="mt-1 text-[13px] text-slate-muted">
          {resource.requires_approval
            ? "Requires manager approval before confirmation"
            : "Instant confirmation on available slots"}
        </p>
      </div>

      <div className="mt-4 rounded-[14px] bg-mist px-3.5 py-2.5 text-[12.5px] text-slate-muted tabular-nums">
        {roomDetails && (
          <span>
            <strong className="font-medium text-ink">{roomDetails.capacity} seats</strong> ·{" "}
            {ROOM_STYLE_LABELS[roomDetails.room_style]}
          </span>
        )}
        {equipmentDetails && (
          <span>
            <strong className="font-medium text-ink">{equipmentDetails.quantity} units</strong> in
            pool · Multi-day loan supported
          </span>
        )}
        {supportDetails && (
          <span>
            <strong className="font-medium text-ink">
              {supportDetails.max_attendees === 1
                ? "1-on-1 session"
                : `Workshop · max ${supportDetails.max_attendees}`}
            </strong>
            {supportDetails.host_name ? ` · ${supportDetails.host_name}` : ""}
          </span>
        )}
      </div>

      {!canBook && (
        <div className="mt-4 flex items-start gap-2.5 rounded-[14px] bg-blush p-3.5 text-[12.5px] text-sienna">
          <Shield className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Read-only Student Services role</p>
            <p className="mt-0.5 opacity-90">
              Switch to a Student, Staff, Manager, or Admin preset to submit a booking.
            </p>
          </div>
        </div>
      )}

      {created ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-[18px] bg-mist p-5">
            <div className="flex items-center gap-2 text-ink">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <h3 className="text-[15px] font-semibold">
                {created.status_id === "pending"
                  ? "Request submitted for approval"
                  : "Booking confirmed"}
              </h3>
            </div>
            <p className="mt-1.5 text-[13px] text-slate-muted">
              Reference{" "}
              <span className="font-mono font-medium text-ink">#{created.booking_id}</span>{" "}
              recorded for {created.resource_name ?? created.resource_id}.
            </p>

            <dl className="mt-4 space-y-2 border-t border-hairline pt-3 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-muted">Status</dt>
                <dd>
                  <StatusBadge status={created.status_id} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-muted">Booked for</dt>
                <dd className="font-medium text-ink">
                  {created.user_name ?? created.user_id}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-muted">Window</dt>
                <dd className="font-medium text-ink tabular-nums text-right">
                  {formatTimeRange(created.start_time, created.end_time)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/bookings"
              className="inline-flex flex-1 items-center justify-center rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper hover:bg-ink/85 transition-colors"
            >
              View My Bookings
            </Link>
            <Button variant="secondary" size="md" onClick={() => setCreated(null)}>
              Book another
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {(actor.role === "admin" || actor.role === "manager") && (
            <div>
              <label className="block text-[12.5px] font-medium text-ink">
                Book on behalf of User ID
              </label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="e.g. S1001"
                className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-ink">
                {isEquipment ? "Loan length" : "Quick duration"}
              </span>
              {windowSummary && (
                <span className="text-[12px] text-slate-muted tabular-nums">
                  {windowSummary}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {durationPresets.map((preset) => (
                <button
                  key={preset.hours}
                  type="button"
                  onClick={() => applyPresetHours(preset.hours)}
                  className="rounded-full border border-hairline bg-paper px-3 py-1 text-[12px] font-medium text-ink hover:bg-mist transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[12.5px] font-medium text-ink">
                {isEquipment ? "Pickup (UTC)" : "Start time (UTC)"}
              </label>
              <input
                type="datetime-local"
                required
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[12.5px] font-medium text-ink">
                {isEquipment ? "Return (UTC)" : "End time (UTC)"}
              </label>
              <input
                type="datetime-local"
                required
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums focus:border-ink focus:outline-none"
              />
            </div>
          </div>

          {isRoom && roomDetails && (
            <div>
              <label className="block text-[12.5px] font-medium text-ink">
                Group size{" "}
                <span className="font-normal text-ash">
                  (max {roomDetails.capacity})
                </span>
              </label>
              <input
                type="number"
                min={1}
                max={roomDetails.capacity}
                value={groupSize}
                onChange={(e) => setGroupSize(e.target.value)}
                className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums focus:border-ink focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Purpose <span className="font-normal text-ash">(optional)</span>
            </label>
            <input
              type="text"
              maxLength={500}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={
                isEquipment
                  ? "e.g. Coursework prototype testing"
                  : isSupport
                    ? "e.g. Dissertation structure review"
                    : "e.g. Group project sprint review"
              }
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Notes <span className="font-normal text-ash">(optional)</span>
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Accessibility needs, cables, or special requests..."
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-[12px] bg-blush px-3.5 py-2.5 text-[12.5px] font-medium text-sienna leading-relaxed">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            shape="pill"
            className="w-full"
            loading={submitting}
            disabled={!canBook || resource.status !== "active"}
          >
            {resource.requires_approval ? "Submit for approval" : "Confirm booking"}
          </Button>
        </form>
      )}
    </div>
  );
}
