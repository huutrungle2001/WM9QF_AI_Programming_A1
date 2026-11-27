"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Compass, Info, Sparkles } from "lucide-react";
import type {
  AvailabilitySlot,
  FacilityOut,
  ResourceOut,
} from "@/types";
import {
  checkAvailability,
  listFacilities,
  listResources,
} from "@/lib/resources.api";
import { ApiError } from "@/lib/api-client";
import { dateTimeLocalToEpoch, defaultWindowForType } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import {
  FilterBar,
  type ExplorerFilterState,
} from "@/components/resources/FilterBar";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { BookingDrawer } from "@/components/bookings/BookingDrawer";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const PAGE_SIZE = 48;

function createInitialFilters(): ExplorerFilterState {
  const defaults = defaultWindowForType("group_space");
  return {
    resourceType: "all",
    search: "",
    zone: "",
    facility: "",
    minCapacity: "",
    availabilityEnabled: false,
    startLocal: defaults.startLocal,
    endLocal: defaults.endLocal,
  };
}

export default function ResourceExplorerPage() {
  const { actor, actorHeadersContext, canBook } = useActor();
  const [filters, setFilters] = useState<ExplorerFilterState>(createInitialFilters);
  const [facilities, setFacilities] = useState<FacilityOut[]>([]);
  const [resources, setResources] = useState<ResourceOut[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [bookingTarget, setBookingTarget] = useState<ResourceOut | null>(null);

  useEffect(() => {
    let active = true;
    listFacilities(actorHeadersContext)
      .then((data) => {
        if (active) setFacilities(data);
      })
      .catch(() => {
        if (active) setFacilities([]);
      });
    return () => {
      active = false;
    };
  }, [actorHeadersContext]);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listResources(actorHeadersContext, {
        resource_type: filters.resourceType === "all" ? undefined : filters.resourceType,
        zone: filters.zone || undefined,
        facility: filters.facility || undefined,
        min_capacity: filters.minCapacity ? Number(filters.minCapacity) : undefined,
        search: filters.search.trim() || undefined,
        status: "active",
        limit,
        offset: 0,
      });
      setResources(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.detail, code: err.code });
      } else {
        setError({ message: "Unable to load campus resources." });
      }
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [
    actorHeadersContext,
    filters.resourceType,
    filters.zone,
    filters.facility,
    filters.minCapacity,
    filters.search,
    limit,
  ]);

  const runAvailabilityCheck = useCallback(async () => {
    const startSec = dateTimeLocalToEpoch(filters.startLocal);
    const endSec = dateTimeLocalToEpoch(filters.endLocal);
    if (!startSec || !endSec || endSec <= startSec) {
      setError({
        message: "Availability end time must be strictly after start time.",
        code: "invalid_window",
      });
      return;
    }

    setAvailabilityLoading(true);
    setError(null);
    try {
      const slots = await checkAvailability(actorHeadersContext, {
        start_time: startSec,
        end_time: endSec,
        resource_type: filters.resourceType === "all" ? undefined : filters.resourceType,
        zone: filters.zone || undefined,
        facility: filters.facility || undefined,
        min_capacity: filters.minCapacity ? Number(filters.minCapacity) : undefined,
      });
      setAvailabilitySlots(slots);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.detail, code: err.code });
      } else {
        setError({ message: "Availability lookup failed." });
      }
      setAvailabilitySlots(null);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [
    actorHeadersContext,
    filters.startLocal,
    filters.endLocal,
    filters.resourceType,
    filters.zone,
    filters.facility,
    filters.minCapacity,
  ]);

  // Debounce catalogue fetch when filters or actor change
  useEffect(() => {
    if (filters.availabilityEnabled) {
      void runAvailabilityCheck();
      return;
    }
    setAvailabilitySlots(null);
    const timer = window.setTimeout(() => {
      void fetchCatalog();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [fetchCatalog, filters.availabilityEnabled, runAvailabilityCheck, actor.id]);

  // Apply local search filter when availability endpoint is active
  const displayedItems = useMemo(() => {
    if (filters.availabilityEnabled && availabilitySlots) {
      const q = filters.search.trim().toLowerCase();
      return availabilitySlots
        .filter((slot) => {
          if (!q) return true;
          const r = slot.resource;
          return (
            r.resource_name.toLowerCase().includes(q) ||
            r.resource_id.toLowerCase().includes(q) ||
            r.location.toLowerCase().includes(q) ||
            (r.building_name?.toLowerCase().includes(q) ?? false)
          );
        })
        .map((slot) => ({ resource: slot.resource, availability: slot }));
    }
    return resources.map((r) => ({ resource: r, availability: undefined }));
  }, [filters.availabilityEnabled, filters.search, availabilitySlots, resources]);

  const handleReset = () => {
    setFilters(createInitialFilters());
    setLimit(PAGE_SIZE);
    setAvailabilitySlots(null);
  };

  const isBusy = filters.availabilityEnabled ? availabilityLoading : loading;

  return (
    <div className="space-y-6">
      {/* Contextual Policy Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warwick-200/80 bg-gradient-to-r from-warwick-50 via-white to-indigo-50/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5 text-xs text-slate-700">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warwick-700 text-white shrink-0">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="font-semibold text-slate-900">
              Viewing as {actor.label} ({actor.full_name})
            </span>
            <span className="hidden sm:inline text-slate-500">
              {" "}
              — Catalogue eligibility is enforced server-side via PolicyGuard SQL pushdown.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="plum" className="tabular-nums">
            {displayedItems.length} {filters.availabilityEnabled ? "free resources" : "resources"}
          </Badge>
          {actor.has_accessibility_access && (
            <Badge tone="emerald">Accessibility Rooms Unlocked</Badge>
          )}
        </div>
      </div>

      <FilterBar
        filters={filters}
        facilities={facilities}
        onChange={(next) => {
          setFilters(next);
          if (!next.availabilityEnabled) {
            setAvailabilitySlots(null);
          }
        }}
        onReset={handleReset}
        onCheckAvailability={() => void runAvailabilityCheck()}
        availabilityLoading={availabilityLoading}
      />

      {error && (
        <ErrorBanner
          message={error.message}
          code={error.code}
          onRetry={() =>
            filters.availabilityEnabled ? void runAvailabilityCheck() : void fetchCatalog()
          }
        />
      )}

      {isBusy ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-64 rounded-2xl border border-slate-200 bg-white p-5 animate-pulse"
            >
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="mt-3 h-5 w-3/4 rounded bg-slate-200" />
              <div className="mt-2 h-3.5 w-1/2 rounded bg-slate-100" />
              <div className="mt-5 h-10 w-full rounded-xl bg-slate-100" />
              <div className="mt-4 flex gap-2">
                <div className="h-5 w-20 rounded-full bg-slate-100" />
                <div className="h-5 w-20 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedItems.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-5 w-5" />}
          title="No matching resources found"
          description={
            filters.availabilityEnabled
              ? "No eligible active resources have free capacity in that time window. Try widening the filters or picking a different slot."
              : "Try clearing one of your filters or switching to another demo role to inspect different eligibility tiers."
          }
          action={
            <Button variant="secondary" size="sm" onClick={handleReset}>
              Clear All Filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayedItems.map(({ resource, availability }) => (
              <ResourceCard
                key={resource.resource_id}
                resource={resource}
                availability={availability}
                canBook={canBook}
                onBook={(res) => setBookingTarget(res)}
              />
            ))}
          </div>

          {!filters.availabilityEnabled && resources.length >= limit && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
              >
                Load More Resources
              </Button>
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <Info className="h-3.5 w-3.5" />
                Showing first {resources.length} matching records
              </span>
            </div>
          )}
        </>
      )}

      <BookingDrawer
        resource={bookingTarget}
        open={Boolean(bookingTarget)}
        onClose={() => setBookingTarget(null)}
        initialStartEpoch={
          filters.availabilityEnabled
            ? dateTimeLocalToEpoch(filters.startLocal)
            : undefined
        }
        initialEndEpoch={
          filters.availabilityEnabled
            ? dateTimeLocalToEpoch(filters.endLocal)
            : undefined
        }
        onSuccess={() => {
          if (filters.availabilityEnabled) {
            void runAvailabilityCheck();
          }
        }}
      />
    </div>
  );
}
