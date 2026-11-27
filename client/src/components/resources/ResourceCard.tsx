"use client";

import React from "react";
import Link from "next/link";
import { Camera, MapPin } from "lucide-react";
import {
  ELIGIBILITY_LABELS,
  RESOURCE_TYPE_SINGULAR,
  ROOM_STYLE_LABELS,
  isEquipmentDetails,
  isRoomDetails,
  isSupportDetails,
  type AvailabilitySlot,
  type ResourceOut,
} from "@/types";
import { Button } from "@/components/ui/Button";

interface ResourceCardProps {
  resource: ResourceOut;
  availability?: AvailabilitySlot;
  onBook: (resource: ResourceOut) => void;
  canBook?: boolean;
  surface?: "paper" | "mist";
}

function primaryMetricFor(resource: ResourceOut): string {
  if (isRoomDetails(resource.details, resource.resource_type)) {
    return `${resource.details.capacity} seats · ${ROOM_STYLE_LABELS[resource.details.room_style]}`;
  }
  if (isEquipmentDetails(resource.details, resource.resource_type)) {
    const cat = resource.details.category
      .replace(/_/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    return `${resource.details.quantity} units · ${cat}`;
  }
  if (isSupportDetails(resource.details, resource.resource_type)) {
    const mode = resource.building_id === null ? "Online" : "In-person";
    const size =
      resource.details.max_attendees === 1
        ? "1-on-1"
        : `Up to ${resource.details.max_attendees}`;
    return `${size} · ${mode}${resource.details.host_name ? ` · ${resource.details.host_name}` : ""}`;
  }
  return RESOURCE_TYPE_SINGULAR[resource.resource_type];
}

export function ResourceCard({
  resource,
  availability,
  onBook,
  canBook = true,
  surface = "paper",
}: ResourceCardProps) {
  const metric = primaryMetricFor(resource);
  const visibleFacilities = resource.facilities.slice(0, 3);
  const extraFacilities = Math.max(0, resource.facilities.length - 3);

  const locationLine = resource.building_name
    ? resource.zone
      ? `${resource.building_name} · ${resource.zone}`
      : resource.building_name
    : resource.location;

  return (
    <article
      className={`group flex flex-col justify-between rounded-[24px] p-6 transition-colors ${
        surface === "mist"
          ? "bg-mist hover:bg-mist/80"
          : "border border-hairline bg-paper hover:border-smoke"
      }`}
    >
      <div>
        {/* Quiet top metadata row */}
        <div className="flex items-center justify-between gap-3 text-[12px] text-ash">
          <span className="truncate font-medium text-slate-muted">
            {RESOURCE_TYPE_SINGULAR[resource.resource_type]}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {resource.image_url && (
              <span
                title="360° / Room photo available"
                className="inline-flex items-center text-slate-muted"
              >
                <Camera className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="font-mono text-[11px] text-ash">
              {resource.resource_id}
            </span>
          </div>
        </div>

        {/* Resource title */}
        <Link
          href={`/resources/${encodeURIComponent(resource.resource_id)}`}
          className="mt-2.5 block"
        >
          <h3 className="text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-ink transition-opacity group-hover:opacity-75 line-clamp-2">
            {resource.resource_name}
          </h3>
        </Link>

        {/* Location */}
        <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-slate-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-muted" />
          <span className="truncate">{locationLine}</span>
        </p>

        {/* Quiet Mist Spec Strip */}
        <div
          className={`mt-4 rounded-[14px] px-3.5 py-2.5 text-[13px] font-medium text-ink tabular-nums ${
            surface === "mist" ? "bg-paper" : "bg-mist"
          }`}
        >
          <span className="block truncate">{metric}</span>
        </div>

        {/* Restrained Policy Line (max 1-2 metadata notes) */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {resource.requires_approval ? (
            <span className="font-medium text-sienna">Approval required</span>
          ) : (
            <span className="text-slate-muted">Instant confirmation</span>
          )}
          {resource.booking_eligibility !== "all_users" && (
            <>
              <span className="text-ash">·</span>
              <span className="text-slate-muted">
                {ELIGIBILITY_LABELS[resource.booking_eligibility]}
              </span>
            </>
          )}
          {resource.status !== "active" && (
            <>
              <span className="text-ash">·</span>
              <span className="capitalize font-medium text-sienna">{resource.status}</span>
            </>
          )}
        </div>

        {/* Availability slot readout when live availability filter is active */}
        {availability && (
          <div className="mt-3 flex items-center justify-between rounded-[12px] border border-hairline bg-fog px-3 py-1.5 text-[12px] text-ink">
            <span className="text-slate-muted">Free in window</span>
            <span className="font-semibold tabular-nums">
              {availability.remaining_slots} / {availability.max_concurrent_bookings} free
            </span>
          </div>
        )}

        {/* Quiet Typographic Facility Tags */}
        {visibleFacilities.length > 0 && (
          <p className="mt-3 truncate text-[12.5px] text-ash">
            {visibleFacilities.map((fac, idx) => (
              <React.Fragment key={fac}>
                {idx > 0 && <span className="mx-1.5">·</span>}
                {fac}
              </React.Fragment>
            ))}
            {extraFacilities > 0 && (
              <span className="ml-1.5">+{extraFacilities}</span>
            )}
          </p>
        )}
      </div>

      {/* Matched Steep Pill Action Pair covering card width */}
      <div className="mt-6 flex items-center gap-2.5 border-t border-hairline pt-4">
        <Button
          variant="primary"
          size="sm"
          shape="pill"
          className="flex-1"
          disabled={!canBook || resource.status !== "active"}
          onClick={() => onBook(resource)}
        >
          {resource.requires_approval ? "Request slot" : "Book now"}
        </Button>
        <Link
          href={`/resources/${encodeURIComponent(resource.resource_id)}`}
          className="inline-flex items-center justify-center rounded-full border border-ink px-4 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-mist whitespace-nowrap"
        >
          Details →
        </Link>
      </div>
    </article>
  );
}
