"use client";

import React, { useEffect } from "react";
import { MapPin, X } from "lucide-react";
import {
  RESOURCE_TYPE_SINGULAR,
  type BookingOut,
  type ResourceOut,
} from "@/types";
import { BookingPanel } from "./BookingPanel";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !resource) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/35 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-paper border-l border-hairline shadow-steep-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] text-slate-muted">
              <span>{RESOURCE_TYPE_SINGULAR[resource.resource_type]}</span>
              <span className="text-smoke">·</span>
              <span className="font-mono text-ash">{resource.resource_id}</span>
            </div>
            <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.015em] text-ink truncate">
              {resource.resource_name}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-slate-muted">
              <MapPin className="h-3.5 w-3.5 text-ash shrink-0" />
              <span className="truncate">
                {resource.location}
                {resource.building_name ? ` · ${resource.building_name}` : ""}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-muted hover:bg-mist hover:text-ink"
            aria-label="Close booking drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <BookingPanel
            resource={resource}
            initialStartEpoch={initialStartEpoch}
            initialEndEpoch={initialEndEpoch}
            onSuccess={onSuccess}
            variant="inline"
          />
        </div>
      </div>
    </div>
  );
}
