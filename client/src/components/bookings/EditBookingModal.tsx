"use client";

import React, { useEffect, useState } from "react";
import type { BookingOut } from "@/types";
import { updateBooking } from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { dateTimeLocalToEpoch, epochToDateTimeLocal } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface EditBookingModalProps {
  booking: BookingOut | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: BookingOut) => void;
}

export function EditBookingModal({
  booking,
  open,
  onClose,
  onSaved,
}: EditBookingModalProps) {
  const { actorHeadersContext } = useActor();
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!booking || !open) return;
    setStartLocal(epochToDateTimeLocal(booking.start_time));
    setEndLocal(epochToDateTimeLocal(booking.end_time));
    setPurpose(booking.purpose ?? "");
    setNotes(booking.notes ?? "");
    setError(null);
  }, [booking, open]);

  if (!booking) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startSec = dateTimeLocalToEpoch(startLocal);
    const endSec = dateTimeLocalToEpoch(endLocal);
    if (!startSec || !endSec || endSec <= startSec) {
      setError("End time must be strictly after start time.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateBooking(actorHeadersContext, booking.booking_id, {
        start_time: startSec,
        end_time: endSec,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Failed to update booking."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit Booking #${booking.booking_id}`}
      subtitle={`${booking.resource_name ?? booking.resource_id} · Rescheduling re-runs 2-way conflict checks`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Start Time (UTC)
            </label>
            <input
              type="datetime-local"
              required
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              End Time (UTC)
            </label>
            <input
              type="datetime-local"
              required
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">Purpose</label>
          <input
            type="text"
            maxLength={500}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">Notes</label>
          <textarea
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
