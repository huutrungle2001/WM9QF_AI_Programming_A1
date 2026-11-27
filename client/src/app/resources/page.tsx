"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarSearch, RotateCcw, Search, X } from "lucide-react";
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
import { Badge } from "@/components/ui/Badge";
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

  // Room & common CTI filters
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
  const [availabilityEnabled, setAvailabilityEnabled] = useState(false);
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

  const executeAvailabilityCheck = useCallback(async () => {
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
  }, [availStart, availEnd, runCheck, selectedType, zone, buildingId, facility, minCapacity]);

  const handleToggleAvailability = (checked: boolean) => {
    setAvailabilityEnabled(checked);
    if (!checked) {
      clearAvailability();
    } else {
      void executeAvailabilityCheck();
    }
  };

  const clearAllFilters = () => {
    setSelectedType("all");
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
    setAvailabilityEnabled(false);
    clearAvailability();
    router.replace("/resources", { scroll: false });
  };

  const hasActiveFilter = Boolean(
    selectedType !== "all" ||
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
      availabilityEnabled ||
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
    <div className="flex flex-col">
      {/* Top Editorial Paper Band (ported cleanly from v1 Steep composer + CTI dynamic controls) */}
      <section className="border-b border-hairline bg-paper">
        <div className="mx-auto max-w-[1200px] px-4 pt-10 pb-8 sm:px-6 sm:pt-14 sm:pb-10">
          <div className="max-w-3xl">
            <p className="text-[13px] font-medium text-ash">
              University of Warwick · Campus Learning Resources
            </p>
            <h1 className="mt-3 text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[44px]">
              Book campus spaces, labs &amp; equipment
            </h1>
            <p className="mt-3 text-[16px] leading-[1.5] text-slate-muted sm:text-[17px]">
              Unified availability across study rooms, group spaces, computer labs, specialist kit, and academic support.
            </p>
          </div>

          <div className="mt-8 space-y-5">
            {/* Steep Composer Search Row + Inline Filter Controls */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-[16px] border border-hairline bg-paper p-2 pl-4 shadow-steep-subtle transition-colors focus-within:border-ink">
                <Search className="h-4 w-4 shrink-0 text-slate-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setVisibleLimit(24);
                  }}
                  placeholder="Search rooms, buildings, equipment, or advisors…"
                  aria-label="Search rooms, buildings, equipment, or advisors"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-smoke"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-muted transition-colors hover:bg-mist hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (availabilityEnabled) void executeAvailabilityCheck();
                  }}
                  aria-label="Filter resources"
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper transition-opacity hover:opacity-85"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Inline CTI-Aware Secondary Controls */}
              {selectedType === "specialist_equipment" ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:items-center">
                  <select
                    value={eqCategory}
                    onChange={(e) => setEqCategory(e.target.value)}
                    aria-label="Equipment Category"
                    className="h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] capitalize text-ink outline-none transition-colors hover:border-smoke focus:border-ink"
                  >
                    <option value="">All categories</option>
                    {equipmentCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>

                  <select
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
                    aria-label="Pickup Building"
                    className="h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink"
                  >
                    <option value="">All buildings</option>
                    {buildingsForCurrentType.map((b) => (
                      <option key={b.building_id} value={b.building_id}>
                        {b.building_name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={checkinMethod}
                    onChange={(e) => setCheckinMethod(e.target.value as CheckinMethod | "")}
                    aria-label="Check-in Method"
                    className="col-span-2 h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink sm:col-span-1"
                  >
                    <option value="">Any check-in</option>
                    {(Object.keys(CHECKIN_LABELS) as CheckinMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {CHECKIN_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : selectedType === "academic_support" ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:items-center">
                  <select
                    value={supCategory}
                    onChange={(e) => setSupCategory(e.target.value)}
                    aria-label="Topic Category"
                    className="h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] capitalize text-ink outline-none transition-colors hover:border-smoke focus:border-ink"
                  >
                    <option value="">All topics</option>
                    {supportCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>

                  <select
                    value={supFormat}
                    onChange={(e) => setSupFormat(e.target.value as "" | "online" | "in_person")}
                    aria-label="Session Format"
                    className="h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink"
                  >
                    <option value="">Online &amp; In-person</option>
                    <option value="online">Online (MS Teams)</option>
                    <option value="in_person">In-person</option>
                  </select>

                  <select
                    value={supSessionSize}
                    onChange={(e) => setSupSessionSize(e.target.value as "" | "one_on_one" | "workshop")}
                    aria-label="Session Size"
                    className="col-span-2 h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink sm:col-span-1"
                  >
                    <option value="">1-on-1 &amp; Workshops</option>
                    <option value="one_on_one">1-on-1</option>
                    <option value="workshop">Workshop</option>
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:items-center">
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value as CampusZone | "")}
                    aria-label="Filter by campus zone"
                    className="h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink"
                  >
                    <option value="">All zones</option>
                    {CAMPUS_ZONES.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>

                  <select
                    value={facility}
                    onChange={(e) => setFacility(e.target.value)}
                    aria-label="Filter by facility"
                    className="h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink lg:max-w-[200px]"
                  >
                    <option value="">All facilities</option>
                    {facilities.map((f) => (
                      <option key={f.facility_id} value={f.facility_name}>
                        {f.facility_name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={1}
                    value={minCapacity}
                    onChange={(e) => setMinCapacity(e.target.value)}
                    placeholder="Min seats"
                    aria-label="Minimum capacity"
                    className="col-span-2 h-[52px] rounded-[14px] border border-hairline bg-paper px-3.5 text-[14px] text-ink tabular-nums outline-none transition-colors placeholder:text-smoke hover:border-smoke focus:border-ink sm:col-span-1 lg:w-28"
                  />
                </div>
              )}
            </div>

            {/* Extra Room-only CTI refinements (Building + Room Style) when inside a Room tab */}
            {isRoomType(selectedType) && (
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  aria-label="Building"
                  className="h-9 rounded-full border border-hairline bg-fog px-3.5 text-[13px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink"
                >
                  <option value="">All buildings</option>
                  {buildingsForCurrentType.map((b) => (
                    <option key={b.building_id} value={b.building_id}>
                      {b.building_name}
                    </option>
                  ))}
                </select>

                <select
                  value={roomStyle}
                  onChange={(e) => setRoomStyle(e.target.value as RoomStyle | "")}
                  aria-label="Room Style"
                  className="h-9 rounded-full border border-hairline bg-fog px-3.5 text-[13px] text-ink outline-none transition-colors hover:border-smoke focus:border-ink"
                >
                  <option value="">All room styles</option>
                  {(Object.keys(ROOM_STYLE_LABELS) as RoomStyle[]).map((st) => (
                    <option key={st} value={st}>
                      {ROOM_STYLE_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Resource-Type Pill Tabs + Live Availability Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {TYPE_TABS.map((tab) => {
                  const active = selectedType === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => switchType(tab.value)}
                      className={
                        "cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors " +
                        (active
                          ? "bg-ink text-paper"
                          : "border border-hairline bg-paper text-slate-muted hover:border-smoke hover:text-ink")
                      }
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-hairline bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-smoke">
                  <input
                    type="checkbox"
                    checked={availabilityEnabled}
                    onChange={(e) => handleToggleAvailability(e.target.checked)}
                    className="h-3.5 w-3.5 accent-ink"
                  />
                  <CalendarSearch className="h-3.5 w-3.5 text-slate-muted" />
                  Live availability
                </label>

                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-slate-muted transition-colors hover:text-ink hover:underline underline-offset-4"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Expanded Live Availability Window */}
            {availabilityEnabled && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-mist px-5 py-3.5">
                  <span className="text-[13px] font-medium text-ink">
                    {selectedType === "specialist_equipment"
                      ? "Check free loan units in UTC date window"
                      : "Check free capacity in UTC window"}
                  </span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="datetime-local"
                      value={availStart}
                      onChange={(e) => setAvailStart(e.target.value)}
                      aria-label="Availability start UTC"
                      className="rounded-[12px] border border-hairline bg-paper px-3 py-1.5 text-[13px] text-ink tabular-nums outline-none focus:border-ink"
                    />
                    <span className="text-[13px] text-ash">to</span>
                    <input
                      type="datetime-local"
                      value={availEnd}
                      onChange={(e) => setAvailEnd(e.target.value)}
                      aria-label="Availability end UTC"
                      className="rounded-[12px] border border-hairline bg-paper px-3 py-1.5 text-[13px] text-ink tabular-nums outline-none focus:border-ink"
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      loading={availabilityLoading}
                      onClick={() => void executeAvailabilityCheck()}
                    >
                      Check free slots
                    </Button>
                  </div>
                </div>
                {availabilityError && <ErrorBanner message={availabilityError} />}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Catalogue Band on Fog White */}
      <section className="flex-1 bg-fog py-8 sm:py-10">
        <div className="mx-auto max-w-[1200px] space-y-8 px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] font-medium text-ink tabular-nums">
              {loading
                ? "Loading resources..."
                : `${formatNumber(filteredResources.length)} ${
                    availabilityEnabled
                      ? filteredResources.length === 1
                        ? "available resource"
                        : "available resources"
                      : filteredResources.length === 1
                        ? "resource"
                        : "resources"
                  }`}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-muted">
              <span>
                Eligible view for{" "}
                <strong className="font-medium text-ink">{actor.full_name}</strong>
              </span>
              {actor.has_accessibility_access && (
                <Badge tone="blush">Accessibility rooms unlocked</Badge>
              )}
            </div>
          </div>

          {error && <ErrorBanner message={error} onRetry={() => void loadCatalogue()} />}

          {/* Loading Skeletons */}
          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 animate-pulse">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-64 rounded-[24px] border border-hairline bg-paper"
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
        </div>
      </section>

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
