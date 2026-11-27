"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArrowLeft, CheckCircle2, Wrench } from "lucide-react";
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
import { BookingPanel } from "@/components/bookings/BookingPanel";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

export default function ResourceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const resourceId = decodeURIComponent(params.id ?? "");
  const { actor, actorHeadersContext, canManageCatalogue } = useActor();

  const [resource, setResource] = useState<ResourceOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
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
      router.push("/resources");
    } catch (err) {
      setError({
        message: err instanceof ApiError ? err.detail : "Failed to retire resource.",
      });
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 space-y-6 animate-pulse">
        <div className="h-5 w-36 rounded-full bg-mist" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-24 rounded-[24px] bg-mist/70" />
            <div className="h-80 rounded-[24px] bg-mist/70" />
          </div>
          <div className="lg:col-span-4 h-96 rounded-[24px] bg-mist/70" />
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 space-y-5">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Resources
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

  const concurrencyCeiling =
    resource.max_concurrent_bookings ??
    (equipmentDetails
      ? equipmentDetails.quantity
      : supportDetails
        ? supportDetails.max_attendees
        : 1);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Resources
        </Link>
        <span className="font-mono text-[12px] text-ash">{resource.resource_id}</span>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-[14px] bg-mist px-4 py-3 text-[13.5px] font-medium text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      )}

      {/* 65 / 35 Split Screen */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left 65% Column (8 cols) */}
        <div className="lg:col-span-8 space-y-7 min-w-0">
          {/* Editorial Title Block */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-slate-muted">
              <span className="font-medium text-ink">
                {RESOURCE_TYPE_SINGULAR[resource.resource_type]}
              </span>
              <span className="text-smoke">·</span>
              <span>{ELIGIBILITY_LABELS[resource.booking_eligibility]}</span>
              {resource.status !== "active" && (
                <>
                  <span className="text-smoke">·</span>
                  <span className="font-medium text-sienna capitalize">
                    {resource.status}
                  </span>
                </>
              )}
            </div>

            <h1 className="text-[30px] sm:text-[38px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink">
              {resource.resource_name}
            </h1>

            <p className="text-[15px] text-slate-muted">
              {resource.department_name
                ? `${resource.department_name} (${resource.department_id})`
                : resource.department_id}
              {resource.building_name ? ` · ${resource.building_name}` : ` · ${resource.location}`}
            </p>
          </div>

          {/* 360° / Room Photo Viewer */}
          <PanoramaViewer
            imageUrl={resource.image_url}
            resourceName={resource.resource_name}
            location={resource.location}
          />

          {/* Subtype Specifications Strip */}
          <section className="rounded-[24px] bg-mist p-6">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.04em] text-slate-muted mb-4">
              Specifications
            </h2>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 tabular-nums">
              {roomDetails && (
                <>
                  <div>
                    <div className="text-[12px] text-slate-muted">Capacity</div>
                    <div className="mt-1 text-[20px] font-semibold tracking-[-0.015em] text-ink">
                      {roomDetails.capacity} seats
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-slate-muted">Room style</div>
                    <div className="mt-1 text-[17px] font-semibold text-ink">
                      {ROOM_STYLE_LABELS[roomDetails.room_style]}
                    </div>
                  </div>
                </>
              )}

              {equipmentDetails && (
                <>
                  <div>
                    <div className="text-[12px] text-slate-muted">Pool quantity</div>
                    <div className="mt-1 text-[20px] font-semibold tracking-[-0.015em] text-ink">
                      {equipmentDetails.quantity} units
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-slate-muted">Category</div>
                    <div className="mt-1 text-[17px] font-semibold text-ink capitalize">
                      {equipmentDetails.category.replace(/_/g, " ")}
                    </div>
                  </div>
                </>
              )}

              {supportDetails && (
                <>
                  <div>
                    <div className="text-[12px] text-slate-muted">Max attendees</div>
                    <div className="mt-1 text-[20px] font-semibold tracking-[-0.015em] text-ink">
                      {supportDetails.max_attendees}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-slate-muted">Host team</div>
                    <div className="mt-1 text-[15px] font-semibold text-ink">
                      {supportDetails.host_name ?? supportDetails.category}
                    </div>
                  </div>
                </>
              )}

              <div>
                <div className="text-[12px] text-slate-muted">Check-in</div>
                <div className="mt-1 text-[15px] font-semibold text-ink">
                  {CHECKIN_LABELS[resource.checkin_method]}
                </div>
              </div>

              <div>
                <div className="text-[12px] text-slate-muted">Concurrent slots</div>
                <div className="mt-1 text-[20px] font-semibold tracking-[-0.015em] text-ink">
                  {concurrencyCeiling}
                </div>
              </div>
            </div>

            {equipmentDetails?.specifications && (
              <div className="mt-5 border-t border-hairline pt-4">
                <div className="text-[12px] font-medium text-slate-muted">
                  Hardware specifications
                </div>
                <p className="mt-1 text-[14px] leading-[1.55] text-ink">
                  {equipmentDetails.specifications}
                </p>
              </div>
            )}
          </section>

          {/* Description & Typographic Facilities */}
          <section className="space-y-6 border-t border-hairline pt-6">
            {resource.description && (
              <div>
                <h2 className="text-[16px] font-semibold text-ink">About this resource</h2>
                <p className="mt-2 text-[15px] leading-[1.65] text-ink/90">
                  {resource.description}
                </p>
              </div>
            )}

            <div>
              <h2 className="text-[16px] font-semibold text-ink">
                Facilities &amp; AV ({resource.facilities.length})
              </h2>
              {resource.facilities.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[14px] text-slate-muted">
                  {resource.facilities.map((fac) => (
                    <span key={fac} className="inline-flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-ash" />
                      <span>{fac}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[14px] text-ash">
                  No AV or facility tags listed for this resource.
                </p>
              )}
            </div>
          </section>

          {/* Campus Location Card */}
          <CampusMap
            buildingName={resource.building_name}
            buildingId={resource.building_id}
            location={resource.location}
            zone={resource.zone}
            lat={resource.lat}
            lon={resource.lon}
          />
        </div>

        {/* Right 35% Sticky Column (4 cols) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
          <BookingPanel
            resource={resource}
            onSuccess={(created) =>
              setFeedback(
                `Booking #${created.booking_id} recorded (${created.status_id}).`
              )
            }
          />

          {canManageCatalogue && resource.status !== "retired" && (
            <div className="rounded-[20px] border border-hairline bg-fog p-4 space-y-2.5">
              <p className="text-[12px] font-medium text-slate-muted">
                Catalogue controls
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  loading={actionLoading}
                  onClick={() => void handleToggleMaintenance()}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  {resource.status === "maintenance" ? "Set Active" : "Maintenance"}
                </Button>
                <Button
                  variant="blush"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => void handleRetire()}
                  title="Soft retire resource"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Retire
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
