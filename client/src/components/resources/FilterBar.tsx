"use client";

import React from "react";
import {
  CalendarSearch,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  CAMPUS_ZONES,
  RESOURCE_TYPE_LABELS,
  type CampusZone,
  type FacilityOut,
  type ResourceType,
} from "@/types";
import { Button } from "@/components/ui/Button";

export interface ExplorerFilterState {
  resourceType: ResourceType | "all";
  search: string;
  zone: CampusZone | "";
  facility: string;
  minCapacity: string;
  availabilityEnabled: boolean;
  startLocal: string;
  endLocal: string;
}

const TYPE_TABS: { value: ResourceType | "all"; label: string }[] = [
  { value: "all", label: "All Resources" },
  { value: "study_room", label: RESOURCE_TYPE_LABELS.study_room },
  { value: "group_space", label: RESOURCE_TYPE_LABELS.group_space },
  { value: "computer_lab", label: RESOURCE_TYPE_LABELS.computer_lab },
  { value: "specialist_equipment", label: RESOURCE_TYPE_LABELS.specialist_equipment },
  { value: "academic_support", label: RESOURCE_TYPE_LABELS.academic_support },
];

interface FilterBarProps {
  filters: ExplorerFilterState;
  facilities: FacilityOut[];
  onChange: (next: ExplorerFilterState) => void;
  onReset: () => void;
  onCheckAvailability: () => void;
  availabilityLoading?: boolean;
}

export function FilterBar({
  filters,
  facilities,
  onChange,
  onReset,
  onCheckAvailability,
  availabilityLoading = false,
}: FilterBarProps) {
  const update = (patch: Partial<ExplorerFilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="space-y-4">
      {/* 5-Type Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TYPE_TABS.map((tab) => {
          const active = filters.resourceType === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => update({ resourceType: tab.value })}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                active
                  ? "bg-warwick-700 text-white shadow-sm"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filter Controls Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search */}
          <div className="md:col-span-4 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder="Search room, building, equipment, host..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
            />
          </div>

          {/* Campus Zone */}
          <div className="md:col-span-3">
            <select
              value={filters.zone}
              onChange={(e) => update({ zone: e.target.value as CampusZone | "" })}
              aria-label="Filter by campus zone"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
            >
              <option value="">All Campus Zones</option>
              {CAMPUS_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          {/* Facility */}
          <div className="md:col-span-3">
            <select
              value={filters.facility}
              onChange={(e) => update({ facility: e.target.value })}
              aria-label="Filter by facility"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
            >
              <option value="">All Facilities ({facilities.length})</option>
              {facilities.map((f) => (
                <option key={f.facility_id} value={f.facility_name}>
                  {f.facility_name}
                </option>
              ))}
            </select>
          </div>

          {/* Min Capacity */}
          <div className="md:col-span-2">
            <input
              type="number"
              min={1}
              value={filters.minCapacity}
              onChange={(e) => update({ minCapacity: e.target.value })}
              placeholder="Min cap."
              aria-label="Minimum capacity"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
            />
          </div>
        </div>

        {/* Availability Window Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.availabilityEnabled}
              onChange={(e) => update({ availabilityEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-warwick-700 focus:ring-warwick-600"
            />
            <CalendarSearch className="h-4 w-4 text-warwick-700" />
            Filter by live slot availability
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {filters.availabilityEnabled && (
              <>
                <input
                  type="datetime-local"
                  value={filters.startLocal}
                  onChange={(e) => update({ startLocal: e.target.value })}
                  aria-label="Availability start UTC"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs tabular-nums focus:border-warwick-600 focus:outline-none"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="datetime-local"
                  value={filters.endLocal}
                  onChange={(e) => update({ endLocal: e.target.value })}
                  aria-label="Availability end UTC"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs tabular-nums focus:border-warwick-600 focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="primary"
                  loading={availabilityLoading}
                  onClick={onCheckAvailability}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Check Free Slots
                </Button>
              </>
            )}

            <Button size="sm" variant="ghost" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
