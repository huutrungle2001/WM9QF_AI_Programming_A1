"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  GraduationCap,
  Info,
  MapPin,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import {
  RESOURCE_TYPE_SINGULAR,
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
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "./StatusBadge";

interface BookingDrawerProps {
  resource: ResourceOut | null;
  open: boolean;
  onClose: () => void;
  initialStartEpoch?: number;
  initialEndEpoch?: number;
  onSuccess?: (booking: BookingOut) => void;
}

export function BookingDrawer({
  resource,
  open,
  onClose,
  initialStartEpoch,
  initialEndEpoch,
  onSuccess,
}: BookingDrawerProps) {
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
    if (!open || !resource) return;
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
      setGroupSize(resource.resource_type === "group_space" ? String(Math.min(4, resource.details.capacity)) : "1");
    } else {
      setGroupSize("");
    }
  }, [open, resource, initialStartEpoch, initialEndEpoch, actor.user_id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const startEpoch = useMemo(() => dateTimeLocalToEpoch(startLocal), [startLocal]);
  const endEpoch = useMemo(() => dateTimeLocalToEpoch(endLocal), [endLocal]);

  if (!open || !resource) return null;

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
        { label: "4 hours", hours: 4 },
        { label: "1 day", hours: 24 },
        { label: "2 days", hours: 48 },
        { label: "3 days", hours: 72 },
      ]
    : isSupport
      ? [
          { label: "1 hour", hours: 1 },
          { label: "2 hours", hours: 2 },
        ]
      : [
          { label: "1 hour", hours: 1 },
          { label: "2 hours", hours: 2 },
          { label: "3 hours", hours: 3 },
          { label: "4 hours", hours: 4 },
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

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="plum">{RESOURCE_TYPE_SINGULAR[resource.resource_type]}</Badge>
              {resource.requires_approval ? (
                <Badge tone="amber">Requires Approval</Badge>
              ) : (
                <Badge tone="emerald">Instant Confirmation</Badge>
              )}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-900 truncate">
              {resource.resource_name}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {resource.location}
                {resource.building_name ? ` · ${resource.building_name}` : ""}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close booking drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Polymorphic subtype summary banner */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-700">
            {roomDetails && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-warwick-700" />
                  <span>
                    Room capacity: <strong className="tabular-nums">{roomDetails.capacity}</strong>{" "}
                    · Style: <strong>{ROOM_STYLE_LABELS[roomDetails.room_style]}</strong>
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">{resource.resource_id}</span>
              </div>
            )}
            {equipmentDetails && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-warwick-700" />
                    <span>
                      Pooled equipment · <strong className="tabular-nums">{equipmentDetails.quantity}</strong>{" "}
                      concurrent units ({equipmentDetails.category})
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">{resource.resource_id}</span>
                </div>
                {equipmentDetails.specifications && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {equipmentDetails.specifications}
                  </p>
                )}
              </div>
            )}
            {supportDetails && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-warwick-700" />
                    <span>
                      {supportDetails.max_attendees === 1
                        ? "1-on-1 Consultation"
                        : `Workshop (up to ${supportDetails.max_attendees} attendees)`}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">{resource.resource_id}</span>
                </div>
                {supportDetails.host_name && (
                  <p className="text-[11px] text-slate-500">
                    Hosted by <strong>{supportDetails.host_name}</strong>
                  </p>
                )}
              </div>
            )}
          </div>

          {!canBook && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3.5 text-xs text-fuchsia-900">
              <ShieldAlert className="h-4 w-4 shrink-0 text-fuchsia-700 mt-0.5" />
              <div>
                <p className="font-semibold">Read-only Student Services Session</p>
                <p className="mt-0.5 text-fuchsia-800">
                  Switch to a Student, Staff, Manager, or Admin preset in the top bar to submit a booking.
                </p>
              </div>
            </div>
          )}

          {created ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-center gap-2.5 text-emerald-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-semibold">
                  {created.status_id === "pending"
                    ? "Booking Request Submitted for Approval"
                    : "Booking Confirmed"}
                </h3>
              </div>
              <p className="mt-2 text-xs text-emerald-900/80 leading-relaxed">
                Reference <span className="font-mono font-semibold">#{created.booking_id}</span> has been recorded for{" "}
                <strong>{created.resource_name ?? created.resource_id}</strong>.
              </p>
              <div className="mt-4 space-y-2 rounded-xl bg-white p-3.5 border border-emerald-200/80 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Status</span>
                  <StatusBadge status={created.status_id} />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Booked For</span>
                  <span className="font-medium text-slate-800">
                    {created.user_name ?? created.user_id}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Window</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {formatTimeRange(created.start_time, created.end_time)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {formatDuration(created.start_time, created.end_time)}
                  </span>
                </div>
              </div>
              <div className="mt-5 flex gap-2.5">
                <Button variant="primary" className="flex-1" onClick={onClose}>
                  Done
                </Button>
                <Button variant="secondary" onClick={() => setCreated(null)}>
                  Book Another Slot
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {(actor.role === "admin" || actor.role === "manager") && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Book on Behalf of User ID
                  </label>
                  <input
                    type="text"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    placeholder="e.g. S1001, S1002, STAFF1"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Leave as your ID ({actor.user_id}) or enter any campus user ID.
                  </p>
                </div>
              )}

              {/* Quick Duration Presets */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    {isEquipment ? "Loan Duration Preset" : "Session Length Preset"}
                  </label>
                  {startEpoch > 0 && endEpoch > startEpoch && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warwick-700 tabular-nums">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(startEpoch, endEpoch)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {durationPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPresetHours(preset.hours)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-warwick-400 hover:bg-warwick-50 hover:text-warwick-800 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {isEquipment ? "Collection Time (UTC)" : "Start Time (UTC)"}
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {isEquipment ? "Return Time (UTC)" : "End Time (UTC)"}
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
                  />
                </div>
              </div>

              {roomDetails && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Group Size{" "}
                    <span className="font-normal text-slate-400">
                      (max {roomDetails.capacity})
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={roomDetails.capacity}
                    value={groupSize}
                    onChange={(e) => setGroupSize(e.target.value)}
                    className="mt-1.5 w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {isEquipment
                    ? "Project / Loan Purpose"
                    : isSupport
                      ? "Topic / Questions for Advisor"
                      : "Booking Purpose"}{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={
                    isEquipment
                      ? "e.g. Coursework prototype demo or dissertation testing"
                      : isSupport
                        ? "e.g. Dissertation literature review structure feedback"
                        : "e.g. Group project sprint review"
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Notes{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Accessibility requirements, adapter requests, or supervisor reference"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
                />
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-indigo-50/70 border border-indigo-100 p-3 text-[11px] text-indigo-900">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-indigo-600" />
                <span>
                  {resource.requires_approval
                    ? "This resource enters the manager approval queue (status: pending) and temporarily reserves capacity until approved or rejected."
                    : "Two-way conflict protection checks both resource capacity and your overlapping schedule before confirming instantly."}
                </span>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={!canBook}
                >
                  <CalendarClock className="h-4 w-4" />
                  {resource.requires_approval ? "Request Approval" : "Confirm Booking"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
