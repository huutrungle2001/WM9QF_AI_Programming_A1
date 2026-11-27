"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarPlus,
  Camera,
  Cpu,
  GraduationCap,
  KeyRound,
  MapPin,
  Monitor,
  Users,
} from "lucide-react";
import {
  CHECKIN_LABELS,
  ELIGIBILITY_LABELS,
  RESOURCE_TYPE_SINGULAR,
  ROOM_STYLE_LABELS,
  isEquipmentDetails,
  isRoomDetails,
  isSupportDetails,
  type AvailabilitySlot,
  type ResourceOut,
  type ResourceType,
} from "@/types";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const TYPE_ICONS: Record<ResourceType, React.ComponentType<{ className?: string }>> = {
  study_room: BookOpen,
  group_space: Users,
  computer_lab: Monitor,
  specialist_equipment: Cpu,
  academic_support: GraduationCap,
};

const ELIGIBILITY_TONES: Record<string, BadgeTone> = {
  all_users: "slate",
  students_only: "indigo",
  staff_only: "plum",
  pg_only: "plum",
  pgr_and_staff: "indigo",
  disability_only: "emerald",
};

interface ResourceCardProps {
  resource: ResourceOut;
  availability?: AvailabilitySlot;
  onBook: (resource: ResourceOut) => void;
  canBook?: boolean;
}

export function ResourceCard({
  resource,
  availability,
  onBook,
  canBook = true,
}: ResourceCardProps) {
  const TypeIcon = TYPE_ICONS[resource.resource_type];
  const roomDetails = isRoomDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;
  const equipmentDetails = isEquipmentDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;
  const supportDetails = isSupportDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;

  const visibleFacilities = resource.facilities.slice(0, 3);
  const extraFacilities = Math.max(0, resource.facilities.length - 3);

  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-card hover:shadow-card-hover hover:border-warwick-200 transition-all">
      <div>
        {/* Top Row: Type & Status/Approval */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-warwick-50 text-warwick-700 ring-1 ring-warwick-200/70">
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-warwick-700">
                {RESOURCE_TYPE_SINGULAR[resource.resource_type]}
              </span>
              <div className="font-mono text-[10px] text-slate-400">
                {resource.resource_id}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {resource.image_url && (
              <span
                title="Room photo / 360° preview available"
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
              >
                <Camera className="h-3 w-3 text-warwick-600" />
                Photo
              </span>
            )}
            {resource.status !== "active" && (
              <Badge tone={resource.status === "maintenance" ? "amber" : "rose"}>
                {resource.status}
              </Badge>
            )}
          </div>
        </div>

        {/* Title & Location */}
        <Link
          href={`/resources/${encodeURIComponent(resource.resource_id)}`}
          className="mt-3 block group/link"
        >
          <h3 className="text-sm font-semibold text-slate-900 group-hover/link:text-warwick-700 transition-colors line-clamp-2">
            {resource.resource_name}
          </h3>
        </Link>

        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">
            {resource.building_name ?? resource.location}
            {resource.zone ? ` · ${resource.zone}` : ""}
          </span>
        </p>

        {/* Subtype Metric Strip */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 border border-slate-100">
          {roomDetails && (
            <>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <strong>{roomDetails.capacity}</strong> seats
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-600">
                {ROOM_STYLE_LABELS[roomDetails.room_style]}
              </span>
            </>
          )}
          {equipmentDetails && (
            <>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Cpu className="h-3.5 w-3.5 text-slate-400" />
                <strong>{equipmentDetails.quantity}</strong> units
              </span>
              <span className="text-slate-300">·</span>
              <span className="capitalize text-slate-600">
                {equipmentDetails.category.replace(/_/g, " ")}
              </span>
            </>
          )}
          {supportDetails && (
            <>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                Max <strong>{supportDetails.max_attendees}</strong>
              </span>
              {supportDetails.host_name && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="truncate text-slate-600">{supportDetails.host_name}</span>
                </>
              )}
            </>
          )}
        </div>

        {/* Policy & Check-in Badges */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone={ELIGIBILITY_TONES[resource.booking_eligibility] ?? "slate"}>
            {ELIGIBILITY_LABELS[resource.booking_eligibility]}
          </Badge>
          {resource.requires_approval ? (
            <Badge tone="amber">Approval Required</Badge>
          ) : (
            <Badge tone="emerald">Auto-Confirm</Badge>
          )}
          {resource.checkin_method !== "none" && (
            <Badge tone="slate">
              <KeyRound className="h-3 w-3" />
              {CHECKIN_LABELS[resource.checkin_method]}
            </Badge>
          )}
        </div>

        {/* Availability Remaining Slots Badge */}
        {availability && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 text-xs text-emerald-800">
            <span className="font-medium">Available in selected window</span>
            <span className="font-semibold tabular-nums">
              {availability.remaining_slots} / {availability.max_concurrent_bookings} free
            </span>
          </div>
        )}

        {/* Facilities */}
        {visibleFacilities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {visibleFacilities.map((fac) => (
              <span
                key={fac}
                className="rounded-md bg-slate-100/90 px-2 py-0.5 text-[11px] text-slate-600"
              >
                {fac}
              </span>
            ))}
            {extraFacilities > 0 && (
              <span className="rounded-md bg-slate-100/90 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                +{extraFacilities} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-5 flex items-center gap-2 pt-3.5 border-t border-slate-100">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          disabled={!canBook || resource.status !== "active"}
          onClick={() => onBook(resource)}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          {resource.requires_approval ? "Request Slot" : "Book Now"}
        </Button>
        <Link
          href={`/resources/${encodeURIComponent(resource.resource_id)}`}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          Details
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
