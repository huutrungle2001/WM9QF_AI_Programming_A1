"use client";

import React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
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
    const cat = resource.details.category.replace(/_/g, " ");
    return `${resource.details.quantity} units · ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
  }
  if (isSupportDetails(resource.details, resource.resource_type)) {
    const mode = resource.building_id === null ? "Online" : "In-person";
    const size =
      resource.details.max_attendees === 1
        ? "1-on-1"
        : `Up to ${resource.details.max_attendees}`;
    return `${size} · ${mode}`;
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
  const secondaryNote =
    resource.status !== "active"
      ? resource.status === "maintenance"
        ? "Maintenance"
        : "Retired"
      : resource.requires_approval
        ? "Approval required"
        : resource.booking_eligibility !== "all_users"
          ? ELIGIBILITY_LABELS[resource.booking_eligibility]
          : "Instant booking";

  const locationLine = resource.building_name
    ? resource.zone
      ? `${resource.building_name} · ${resource.zone}`
      : resource.building_name
    : resource.location;

  return (
    <article
      className={`group flex flex-col justify-between rounded-[24px] p-5 sm:p-6 transition-colors ${
        surface === "mist"
          ? "bg-mist hover:bg-mist/80"
          : "border border-hairline bg-paper hover:bg-fog"
      }`}
    >
      <div>
        {/* Quiet top metadata row */}
        <div className="flex items-center justify-between gap-2 text-[12px] text-ash">
          <span className="truncate font-medium text-slate-muted">
            {RESOURCE_TYPE_SINGULAR[resource.resource_type]}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {resource.image_url && (
              <span
                title="360° / Room photo available"
                className="font-mono text-[11px] font-medium text-ink"
              >
                360°
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
          <h3 className="text-[17px] font-semibold leading-[1.3] tracking-[-0.015em] text-ink group-hover:underline underline-offset-4 line-clamp-2">
            {resource.resource_name}
          </h3>
        </Link>

        {/* Location */}
        <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-slate-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-ash" />
          <span className="truncate">{locationLine}</span>
        </p>

        {/* Single primary metric + quiet secondary indicator (max 2 indicators total) */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] tabular-nums">
          <span className="font-medium text-ink">{metric}</span>
          <span className="text-smoke">·</span>
          <span
            className={
              resource.requires_approval || resource.status !== "active"
                ? "text-sienna font-medium"
                : "text-slate-muted"
            }
          >
            {secondaryNote}
          </span>
        </div>

        {/* Availability slot readout when live availability filter is active */}
        {availability && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-0.5 text-[12px] font-medium text-ink tabular-nums">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" />
            {availability.remaining_slots} of {availability.max_concurrent_bookings} free
          </p>
        )}
      </div>

      {/* Bottom action row */}
      <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-hairline">
        <Button
          variant="primary"
          size="sm"
          shape="pill"
          disabled={!canBook || resource.status !== "active"}
          onClick={() => onBook(resource)}
        >
          {resource.requires_approval ? "Request" : "Book"}
        </Button>
        <Link
          href={`/resources/${encodeURIComponent(resource.resource_id)}`}
          className="text-[13.5px] font-medium text-ink hover:underline underline-offset-4"
        >
          Details →
        </Link>
      </div>
    </article>
  );
}
