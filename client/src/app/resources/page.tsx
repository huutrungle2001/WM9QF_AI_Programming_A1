"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Search, SlidersHorizontal, X } from "lucide-react";
import {
  CAMPUS_ZONES,
  CHECKIN_LABELS,
  RESOURCE_TYPE_LABELS,
  ROOM_STYLE_LABELS,
  isEquipmentDetails,
  isRoomDetails,
  isSupportDetails,
  type AvailabilitySlot,
  type BuildingOut,
  type CampusZone,
  type CheckinMethod,
  type FacilityOut,
  type ResourceOut,
  type ResourceType,
  type RoomStyle,
} from "@/types";
import {
  listBuildings,
  listFacilities,
  listResources,
} from "@/lib/resources.api";
import { ApiError } from "@/lib/api-client";
import {
  dateTimeLocalToEpoch,
  defaultWindowForType,
  formatNumber,
} from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { useAvailability } from "@/hooks/useAvailability";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { BookingDrawer } from "@/components/bookings/BookingDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

const TYPE_TABS: { value: ResourceType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "study_room", label: "Study Rooms" },
  { value: "group_space", label: "Group Spaces" },
  { value: "computer_lab", label: "Computer Labs" },
  { value: "specialist_equipment", label: "Specialist Equipment" },
  { value: "academic_support", label: "Academic Support" },
];

const ORDERED_TYPES: ResourceType[] = [
  "study_room",
  "group_space",
  "computer_lab",
  "specialist_equipment",
  "academic_support",
];

function isRoomType(t: ResourceType | "all"): boolean {
  return t === "study_room" || t === "group_space" || t === "computer_lab";
}

function parseTypeParam(raw: string | null): ResourceType | "all" {
  if (
    raw === "study_room" ||
    raw === "group_space" ||
    raw === "computer_lab" ||
    raw === "specialist_equipment" ||
    raw === "academic_support"
  ) {
    return raw;
  }
  return "all";
}

function ResourcesExplorerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { actor, actorHeadersContext, canBook } = useActor();
  const {
    slots: availabilitySlots,
    loading: availabilityLoading,
    error: availabilityError,
    runCheck,
    clear: clearAvailability,
  } = useAvailability();

  const [selectedType, setSelectedType] = useState<ResourceType | "all">(() =>
    parseTypeParam(searchParams.get("type"))
  );
  const [search, setSearch] = useState<string>(() => searchParams.get("q") ?? "");

  // Room CTI filters
  const [zone, setZone] = useState<CampusZone | "">("");
  const [buildingId, setBuildingId] = useState<string>("");
  const [minCapacity, setMinCapacity] = useState<string>("");
  const [roomStyle, setRoomStyle] = useState<RoomStyle | "">("");
  const [facility, setFacility] = useState<string>("");

  // Equipment CTI filters
  const [eqCategory, setEqCategory] = useState<string>("");
  const [checkinMethod, setCheckinMethod] = useState<CheckinMethod | "">("");

  // Support CTI filters
  const [supCategory, setSupCategory] = useState<string>("");
  const [supFormat, setSupFormat] = useState<"" | "online" | "in_person">("");
  const [supSessionSize, setSupSessionSize] = useState<"" | "one_on_one" | "workshop">("");

  // Live Availability panel
  const [showAvailability, setShowAvailability] = useState(false);
  const [availStart, setAvailStart] = useState<string>(
    () => defaultWindowForType("group_space").startLocal
  );
  const [availEnd, setAvailEnd] = useState<string>(
    () => defaultWindowForType("group_space").endLocal
  );

  // Catalogue & reference data
  const [allResources, setAllResources] = useState<ResourceOut[]>([]);
  const [buildings, setBuildings] = useState<BuildingOut[]>([]);
  const [facilities, setFacilities] = useState<FacilityOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(24);

  // Quick booking drawer
  const [bookingResource, setBookingResource] = useState<ResourceOut | null>(null);

  // Sync URL query params into state when navigated from hero/bento
  const urlType = searchParams.get("type");
  const urlQ = searchParams.get("q");
  useEffect(() => {
    setSelectedType(parseTypeParam(urlType));
    if (urlQ !== null) setSearch(urlQ);
  }, [urlType, urlQ]);

  const loadCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resList, bldList, facList] = await Promise.all([
        listResources(actorHeadersContext, { limit: 1000 }),
        listBuildings(actorHeadersContext),
        listFacilities(actorHeadersContext),
      ]);
      setAllResources(resList);
      setBuildings(bldList);
      setFacilities(facList);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Unable to load campus resources."
      );
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue, actor.id]);

  const switchType = (nextType: ResourceType | "all") => {
    setSelectedType(nextType);
    setVisibleLimit(24);
    // Reset subtype-specific filters when changing category
    setZone("");
    setBuildingId("");
    setMinCapacity("");
    setRoomStyle("");
    setFacility("");
    setEqCategory("");
    setCheckinMethod("");
    setSupCategory("");
    setSupFormat("");
    setSupSessionSize("");
    clearAvailability();

    if (nextType !== "all") {
      const win = defaultWindowForType(nextType);
      setAvailStart(win.startLocal);
      setAvailEnd(win.endLocal);
    }

    const sp = new URLSearchParams();
    if (nextType !== "all") sp.set("type", nextType);
    if (search.trim()) sp.set("q", search.trim());
    const qs = sp.toString();
    router.replace(qs ? `/resources?${qs}` : "/resources", { scroll: false });
  };

  // Derived subtype facets
  const equipmentCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of allResources) {
      if (isEquipmentDetails(r.details, r.resource_type)) {
        set.add(r.details.category);
      }
    }
    return Array.from(set).sort();
  }, [allResources]);

  const supportCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of allResources) {
      if (isSupportDetails(r.details, r.resource_type)) {
        set.add(r.details.category);
      }
    }
    return Array.from(set).sort();
  }, [allResources]);

  const buildingsForCurrentType = useMemo(() => {
    if (selectedType === "all") return buildings;
    const usedIds = new Set(
      allResources
        .filter((r) => r.resource_type === selectedType && r.building_id)
        .map((r) => r.building_id as string)
    );
    return buildings.filter((b) => usedIds.has(b.building_id));
  }, [allResources, buildings, selectedType]);

  const availabilityById = useMemo(() => {
    const map = new Map<string, AvailabilitySlot>();
    if (availabilitySlots) {
      for (const slot of availabilitySlots) {
        map.set(slot.resource.resource_id, slot);
      }
    }
    return map;
  }, [availabilitySlots]);

  const filteredResources = useMemo(() => {
    const base = availabilitySlots
      ? availabilitySlots.map((s) => s.resource)
      : allResources;
    const q = search.trim().toLowerCase();
    const minCapNum = minCapacity ? Number(minCapacity) : null;

    return base.filter((r) => {
      if (selectedType !== "all" && r.resource_type !== selectedType) return false;
      if (zone && r.zone !== zone) return false;
      if (buildingId && r.building_id !== buildingId) return false;
      if (facility && !r.facilities.includes(facility)) return false;
      if (checkinMethod && r.checkin_method !== checkinMethod) return false;

      if (isRoomDetails(r.details, r.resource_type)) {
        if (minCapNum && r.details.capacity < minCapNum) return false;
        if (roomStyle && r.details.room_style !== roomStyle) return false;
      } else {
        if (minCapNum || roomStyle) return false;
      }

      if (eqCategory) {
        if (
          !isEquipmentDetails(r.details, r.resource_type) ||
          r.details.category !== eqCategory
        ) {
          return false;
        }
      }

      if (supCategory || supFormat || supSessionSize) {
        if (!isSupportDetails(r.details, r.resource_type)) return false;
        if (supCategory && r.details.category !== supCategory) return false;
        if (supFormat === "online" && r.building_id !== null) return false;
        if (supFormat === "in_person" && r.building_id === null) return false;
        if (supSessionSize === "one_on_one" && r.details.max_attendees !== 1) return false;
        if (supSessionSize === "workshop" && r.details.max_attendees <= 1) return false;
      }

      if (q) {
        const hay = [
          r.resource_id,
          r.resource_name,
          r.location,
          r.building_name ?? "",
          r.department_name ?? "",
          r.department_id,
          r.description ?? "",
          r.facilities.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    allResources,
    availabilitySlots,
    selectedType,
    zone,
    buildingId,
    facility,
    checkinMethod,
    minCapacity,
    roomStyle,
    eqCategory,
    supCategory,
    supFormat,
    supSessionSize,
    search,
  ]);

  const countsByType = useMemo(() => {
    const map: Record<ResourceType, number> = {
      study_room: 0,
      group_space: 0,
      computer_lab: 0,
      specialist_equipment: 0,
      academic_support: 0,
    };
    for (const r of allResources) {
      map[r.resource_type] = (map[r.resource_type] ?? 0) + 1;
    }
    return map;
  }, [allResources]);

  const handleRunAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const startEpoch = dateTimeLocalToEpoch(availStart);
    const endEpoch = dateTimeLocalToEpoch(availEnd);
    if (!startEpoch || !endEpoch || endEpoch <= startEpoch) return;
    await runCheck({
      start_time: startEpoch,
      end_time: endEpoch,
      resource_type: selectedType === "all" ? undefined : selectedType,
      zone: zone || undefined,
      building_id: buildingId || undefined,
      facility: facility || undefined,
      min_capacity: minCapacity ? Number(minCapacity) : undefined,
    });
  };

  const clearAllFilters = () => {
    setSearch("");
    setZone("");
    setBuildingId("");
    setMinCapacity("");
    setRoomStyle("");
    setFacility("");
    setEqCategory("");
    setCheckinMethod("");
    setSupCategory("");
    setSupFormat("");
    setSupSessionSize("");
    clearAvailability();
  };

  const hasActiveFilter = Boolean(
    search.trim() ||
      zone ||
      buildingId ||
      minCapacity ||
      roomStyle ||
      facility ||
      eqCategory ||
      checkinMethod ||
      supCategory ||
      supFormat ||
      supSessionSize ||
      availabilitySlots
  );

  const isSectionedAllMode = selectedType === "all" && !hasActiveFilter;

  const groupedSections = useMemo(() => {
    return ORDERED_TYPES.map((type) => {
      const items = allResources.filter((r) => r.resource_type === type);
      return {
        type,
        label: RESOURCE_TYPE_LABELS[type],
        total: items.length,
        preview: items.slice(0, 3),
      };
    }).filter((sec) => sec.total > 0);
  }, [allResources]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 space-y-8">
      {/* Editorial Page Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] sm:text-[40px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink">
            Campus Resources
          </h1>
          <p className="mt-2 text-[15.5px] text-slate-muted">
            {loading
              ? "Loading eligible spaces, equipment pools, and support services..."
              : `${formatNumber(filteredResources.length)} ${
                  availabilitySlots ? "available" : "eligible"
                } resources${selectedType !== "all" ? ` in ${RESOURCE_TYPE_LABELS[selectedType]}` : ""}`}
          </p>
        </div>

        {/* Quick Search + Availability Toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ash" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleLimit(24);
              }}
              placeholder="Search name, building, tag..."
              aria-label="Filter resources by keyword"
              className="w-full rounded-full border border-hairline bg-paper py-2 pl-10 pr-8 text-[14px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ash hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant={showAvailability || availabilitySlots ? "primary" : "secondary"}
            size="md"
            shape="pill"
            onClick={() => setShowAvailability((v) => !v)}
          >
            <CalendarClock className="h-4 w-4" />
            {availabilitySlots ? "Availability Active" : "Check Availability"}
          </Button>
        </div>
      </div>

      {/* Top Resource Type Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-hairline">
        {TYPE_TABS.map((tab) => {
          const active = selectedType === tab.value;
          const count =
            tab.value === "all"
              ? allResources.length
              : countsByType[tab.value];
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchType(tab.value)}
              className={`relative whitespace-nowrap px-3.5 py-2.5 text-[14px] transition-colors ${
                active
                  ? "font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-ink"
                  : "text-slate-muted hover:text-ink"
              }`}
            >
              <span>{tab.label}</span>
              {!loading && (
                <span className="ml-1.5 text-[12px] text-ash tabular-nums">
                  {formatNumber(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dynamic CTI-Specific Filter Bar (visible on specific category tabs) */}
      {selectedType !== "all" && (
        <section
          aria-label="Category filters"
          className="rounded-[20px] border border-hairline bg-fog/80 p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-muted" />
              <span>
                {isRoomType(selectedType)
                  ? "Space filters"
                  : selectedType === "specialist_equipment"
                    ? "Equipment loan filters"
                    : "Academic support filters"}
              </span>
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[12.5px] font-medium text-slate-muted hover:text-ink underline underline-offset-4"
              >
                Reset filters
              </button>
            )}
          </div>

          {/* Rooms CTI Filters */}
          {isRoomType(selectedType) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <select
                aria-label="Campus Zone"
                value={zone}
                onChange={(e) => setZone(e.target.value as CampusZone | "")}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">All campus zones</option>
                {CAMPUS_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>

              <select
                aria-label="Building"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">All buildings</option>
                {buildingsForCurrentType.map((b) => (
                  <option key={b.building_id} value={b.building_id}>
                    {b.building_name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                value={minCapacity}
                onChange={(e) => setMinCapacity(e.target.value)}
                placeholder="Min seats..."
                aria-label="Minimum capacity"
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink tabular-nums placeholder:text-smoke focus:border-ink focus:outline-none"
              />

              <select
                aria-label="Room Style"
                value={roomStyle}
                onChange={(e) => setRoomStyle(e.target.value as RoomStyle | "")}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">All room styles</option>
                {(Object.keys(ROOM_STYLE_LABELS) as RoomStyle[]).map((st) => (
                  <option key={st} value={st}>
                    {ROOM_STYLE_LABELS[st]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Facility or AV tag"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">Any AV / facility</option>
                {facilities.map((f) => (
                  <option key={f.facility_id} value={f.facility_name}>
                    {f.facility_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Specialist Equipment CTI Filters */}
          {selectedType === "specialist_equipment" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                aria-label="Equipment Category"
                value={eqCategory}
                onChange={(e) => setEqCategory(e.target.value)}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink capitalize focus:border-ink focus:outline-none"
              >
                <option value="">All equipment categories</option>
                {equipmentCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replace(/_/g, " ")}
                  </option>
                ))}
              </select>

              <select
                aria-label="Pickup Building"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">All pickup buildings</option>
                {buildingsForCurrentType.map((b) => (
                  <option key={b.building_id} value={b.building_id}>
                    {b.building_name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Check-in Method"
                value={checkinMethod}
                onChange={(e) => setCheckinMethod(e.target.value as CheckinMethod | "")}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">Any check-in method</option>
                {(Object.keys(CHECKIN_LABELS) as CheckinMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {CHECKIN_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Academic Support CTI Filters */}
          {selectedType === "academic_support" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                aria-label="Topic Category"
                value={supCategory}
                onChange={(e) => setSupCategory(e.target.value)}
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink capitalize focus:border-ink focus:outline-none"
              >
                <option value="">All support topics</option>
                {supportCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replace(/_/g, " ")}
                  </option>
                ))}
              </select>

              <select
                aria-label="Session Format"
                value={supFormat}
                onChange={(e) =>
                  setSupFormat(e.target.value as "" | "online" | "in_person")
                }
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">Online &amp; In-person</option>
                <option value="online">Online (MS Teams)</option>
                <option value="in_person">In-person on campus</option>
              </select>

              <select
                aria-label="Session Size"
                value={supSessionSize}
                onChange={(e) =>
                  setSupSessionSize(e.target.value as "" | "one_on_one" | "workshop")
                }
                className="h-10 rounded-[12px] border border-hairline bg-paper px-3 text-[13.5px] text-ink focus:border-ink focus:outline-none"
              >
                <option value="">1-on-1 &amp; Workshops</option>
                <option value="one_on_one">1-on-1 Consultation</option>
                <option value="workshop">Group Workshop</option>
              </select>
            </div>
          )}
        </section>
      )}

      {/* Live Availability Window Panel */}
      {showAvailability && (
        <form
          onSubmit={handleRunAvailability}
          className="rounded-[20px] border border-hairline bg-paper p-5 shadow-steep-subtle space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[14.5px] font-semibold text-ink">
                {selectedType === "specialist_equipment"
                  ? "Multi-day loan availability"
                  : selectedType === "academic_support"
                    ? "Support slot availability"
                    : "Real-time hourly availability"}
              </h2>
              <p className="text-[12.5px] text-slate-muted">
                Checks active bookings and concurrency limits via{" "}
                <span className="font-mono text-[11.5px]">GET /api/v1/availability</span>.
              </p>
            </div>
            {availabilitySlots && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearAvailability()}
              >
                Clear availability filter
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
            <div>
              <label className="block text-[12px] font-medium text-ink">
                {selectedType === "specialist_equipment" ? "From (UTC)" : "Start (UTC)"}
              </label>
              <input
                type="datetime-local"
                required
                value={availStart}
                onChange={(e) => setAvailStart(e.target.value)}
                className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink">
                {selectedType === "specialist_equipment" ? "To (UTC)" : "End (UTC)"}
              </label>
              <input
                type="datetime-local"
                required
                value={availEnd}
                onChange={(e) => setAvailEnd(e.target.value)}
                className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums focus:border-ink focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={availabilityLoading}
                className="flex-1"
              >
                Find free slots
              </Button>
            </div>
          </div>
          {availabilityError && <ErrorBanner message={availabilityError} />}
        </form>
      )}

      {error && <ErrorBanner message={error} onRetry={() => void loadCatalogue()} />}

      {/* Loading Skeletons */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 animate-pulse">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-52 rounded-[24px] bg-mist/70"
            />
          ))}
        </div>
      ) : isSectionedAllMode ? (
        /* Mode A: Sectioned Discovery across the 5 resource types */
        <div className="space-y-12">
          {groupedSections.map((section) => (
            <section key={section.type} className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  {section.label}
                </h2>
                <button
                  type="button"
                  onClick={() => switchType(section.type)}
                  className="text-[14px] font-medium text-ink hover:underline underline-offset-4 tabular-nums"
                >
                  View all ({formatNumber(section.total)}) →
                </button>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {section.preview.map((resource) => (
                  <ResourceCard
                    key={resource.resource_id}
                    resource={resource}
                    canBook={canBook}
                    onBook={setBookingResource}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : filteredResources.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No matching resources"
          description="Try broadening your search, clearing a filter, or selecting a different time window."
          action={
            <Button variant="secondary" onClick={clearAllFilters}>
              Reset all filters
            </Button>
          }
        />
      ) : (
        /* Mode B: Flat Filtered Card Grid */
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredResources.slice(0, visibleLimit).map((resource) => (
              <ResourceCard
                key={resource.resource_id}
                resource={resource}
                availability={availabilityById.get(resource.resource_id)}
                canBook={canBook}
                onBook={setBookingResource}
              />
            ))}
          </div>

          {filteredResources.length > visibleLimit && (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setVisibleLimit((n) => n + 24)}
              >
                Show more ({formatNumber(filteredResources.length - visibleLimit)} remaining)
              </Button>
            </div>
          )}
        </div>
      )}

      <BookingDrawer
        resource={bookingResource}
        open={Boolean(bookingResource)}
        onClose={() => setBookingResource(null)}
        initialStartEpoch={
          availabilitySlots ? dateTimeLocalToEpoch(availStart) : undefined
        }
        initialEndEpoch={
          availabilitySlots ? dateTimeLocalToEpoch(availEnd) : undefined
        }
      />
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 text-[14px] text-slate-muted">
          Loading resources...
        </div>
      }
    >
      <ResourcesExplorerContent />
    </Suspense>
  );
}
