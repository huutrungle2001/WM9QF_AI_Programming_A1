"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Building2,
  CalendarPlus,
  CheckCircle2,
  Cpu,
  GraduationCap,
  KeyRound,
  Layers,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import {
  CHECKIN_LABELS,
  ELIGIBILITY_LABELS,
  RESOURCE_TYPE_SINGULAR,
  ROOM_STYLE_LABELS,
  isEquipmentDetails,
  isRoomDetails,
  isSupportDetails,
  type ResourceOut,
} from "@/types";
import { getResource, retireResource, updateResource } from "@/lib/resources.api";
import { ApiError } from "@/lib/api-client";
import { useActor } from "@/hooks/useActor";
import { PanoramaViewer } from "@/components/resources/PanoramaViewer";
import { CampusMap } from "@/components/resources/CampusMap";
import { BookingDrawer } from "@/components/bookings/BookingDrawer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

export default function ResourceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const resourceId = decodeURIComponent(params.id ?? "");
  const { actor, actorHeadersContext, canBook, canManageCatalogue } = useActor();

  const [resource, setResource] = useState<ResourceOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadResource = useCallback(async () => {
    if (!resourceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getResource(actorHeadersContext, resourceId);
      setResource(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.detail, code: err.code });
      } else {
        setError({ message: "Unable to load resource details." });
      }
      setResource(null);
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext, resourceId]);

  useEffect(() => {
    void loadResource();
  }, [loadResource, actor.id]);

  const handleToggleMaintenance = async () => {
    if (!resource) return;
    const nextStatus = resource.status === "maintenance" ? "active" : "maintenance";
    setActionLoading(true);
    setFeedback(null);
    try {
      const updated = await updateResource(actorHeadersContext, resource.resource_id, {
        status: nextStatus,
      });
      setResource(updated);
      setFeedback(`Resource status updated to "${updated.status}".`);
    } catch (err) {
      setError({
        message: err instanceof ApiError ? err.detail : "Failed to update resource status.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetire = async () => {
    if (!resource) return;
    if (!window.confirm(`Soft-retire "${resource.resource_name}" (status='retired')?`)) {
      return;
    }
    setActionLoading(true);
    try {
      await retireResource(actorHeadersContext, resource.resource_id);
      router.push("/");
    } catch (err) {
      setError({
        message: err instanceof ApiError ? err.detail : "Failed to retire resource.",
      });
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-44 rounded-lg bg-slate-200" />
        <div className="h-44 rounded-2xl bg-white border border-slate-200" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl bg-white border border-slate-200" />
          <div className="h-72 rounded-2xl bg-white border border-slate-200" />
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-warwick-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Resource Explorer
        </Link>
        <ErrorBanner
          message={error?.message ?? "Resource not found."}
          code={error?.code}
          onRetry={() => void loadResource()}
        />
      </div>
    );
  }

  const roomDetails = isRoomDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;
  const equipmentDetails = isEquipmentDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;
  const supportDetails = isSupportDetails(resource.details, resource.resource_type)
    ? resource.details
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-warwick-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Resource Explorer
        </Link>
        <span className="font-mono text-xs text-slate-400">
          ID: {resource.resource_id}
        </span>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {feedback}
        </div>
      )}

      {/* Hero Header Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="plum">
                {RESOURCE_TYPE_SINGULAR[resource.resource_type]}
              </Badge>
              <Badge
                tone={
                  resource.status === "active"
                    ? "emerald"
                    : resource.status === "maintenance"
                      ? "amber"
                      : "rose"
                }
              >
                {resource.status}
              </Badge>
              <Badge tone="indigo">
                {ELIGIBILITY_LABELS[resource.booking_eligibility]}
              </Badge>
              {resource.requires_approval ? (
                <Badge tone="amber">Manager Approval Required</Badge>
              ) : (
                <Badge tone="emerald">Instant Confirmation</Badge>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {resource.resource_name}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {resource.department_name
                  ? `${resource.department_name} (${resource.department_id})`
                  : resource.department_id}
                {resource.building_name ? ` · ${resource.building_name}` : ""}
              </p>
            </div>

            {resource.description && (
              <p className="max-w-3xl text-sm text-slate-600 leading-relaxed">
                {resource.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap lg:flex-col items-stretch gap-2 shrink-0 lg:w-52">
            <Button
              variant="primary"
              size="lg"
              disabled={!canBook || resource.status !== "active"}
              onClick={() => setDrawerOpen(true)}
            >
              <CalendarPlus className="h-4 w-4" />
              {resource.requires_approval ? "Request Booking" : "Book This Resource"}
            </Button>

            {canManageCatalogue && resource.status !== "retired" && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  loading={actionLoading}
                  onClick={() => void handleToggleMaintenance()}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  {resource.status === "maintenance" ? "Activate" : "Maintenance"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  disabled={actionLoading}
                  onClick={() => void handleRetire()}
                  title="Soft retire resource"
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Subtype Specifications Grid */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-5 border-t border-slate-100">
          {roomDetails && (
            <>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Users className="h-3.5 w-3.5" />
                  Room Capacity
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                  {roomDetails.capacity} people
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Layers className="h-3.5 w-3.5" />
                  Room Style
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {ROOM_STYLE_LABELS[roomDetails.room_style]}
                </div>
              </div>
            </>
          )}

          {equipmentDetails && (
            <>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Cpu className="h-3.5 w-3.5" />
                  Pool Quantity
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                  {equipmentDetails.quantity} units
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Layers className="h-3.5 w-3.5" />
                  Equipment Category
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 capitalize">
                  {equipmentDetails.category.replace(/_/g, " ")}
                </div>
              </div>
            </>
          )}

          {supportDetails && (
            <>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Max Attendees
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                  {supportDetails.max_attendees}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Users className="h-3.5 w-3.5" />
                  Host / Service Team
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">
                  {supportDetails.host_name ?? supportDetails.category}
                </div>
              </div>
            </>
          )}

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <KeyRound className="h-3.5 w-3.5" />
              Check-In Method
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {CHECKIN_LABELS[resource.checkin_method]}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Concurrency Ceiling
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {resource.max_concurrent_bookings ??
                (equipmentDetails
                  ? equipmentDetails.quantity
                  : supportDetails
                    ? supportDetails.max_attendees
                    : 1)}{" "}
              <span className="text-xs font-normal text-slate-500">slot(s)</span>
            </div>
          </div>
        </div>

        {/* Equipment technical specs callout */}
        {equipmentDetails && equipmentDetails.specifications && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-700">
            <div className="font-semibold text-slate-900 mb-1">Technical Specifications</div>
            <p className="leading-relaxed">{equipmentDetails.specifications}</p>
          </div>
        )}

        {/* Facility Tags */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2.5">
            <Building2 className="h-3.5 w-3.5 text-warwick-700" />
            Facilities & Amenities ({resource.facilities.length})
          </div>
          {resource.facilities.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {resource.facilities.map((fac) => (
                <Badge key={fac} tone="slate" className="text-xs">
                  {fac}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No facility tags recorded for this resource.</p>
          )}
        </div>
      </section>

      {/* Visual Media & Campus Map */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PanoramaViewer
          imageUrl={resource.image_url}
          resourceName={resource.resource_name}
          location={resource.location}
        />
        <CampusMap
          buildingName={resource.building_name}
          buildingId={resource.building_id}
          location={resource.location}
          zone={resource.zone}
          lat={resource.lat}
          lon={resource.lon}
        />
      </div>

      <BookingDrawer
        resource={resource}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={(created) =>
          setFeedback(
            `Created booking #${created.booking_id} (${created.status_id}).`
          )
        }
      />
    </div>
  );
}
