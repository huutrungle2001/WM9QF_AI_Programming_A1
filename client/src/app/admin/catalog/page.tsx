"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, Plus, RefreshCw, Search } from "lucide-react";
import {
  CAMPUS_ZONES,
  type BuildingOut,
  type CampusZone,
  type DepartmentOut,
  type FacilityOut,
} from "@/types";
import {
  createBuilding,
  createDepartment,
  createFacility,
  listBuildings,
  listDepartments,
  listFacilities,
} from "@/lib/resources.api";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

type CatalogTab = "departments" | "buildings" | "facilities";

export default function AdminCatalogPage() {
  const { actor, actorHeadersContext, canManageCatalogue } = useActor();
  const [tab, setTab] = useState<CatalogTab>("departments");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [buildings, setBuildings] = useState<BuildingOut[]>([]);
  const [facilities, setFacilities] = useState<FacilityOut[]>([]);

  // Create modals
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Department form
  const [deptId, setDeptId] = useState("");
  const [deptName, setDeptName] = useState("");
  const [deptFaculty, setDeptFaculty] = useState("Science, Engineering & Medicine");

  // Building form
  const [bldId, setBldId] = useState("");
  const [bldName, setBldName] = useState("");
  const [bldZone, setBldZone] = useState<CampusZone>("Main Site");
  const [bldFloors, setBldFloors] = useState("3");
  const [bldLat, setBldLat] = useState("");
  const [bldLon, setBldLon] = useState("");

  // Facility form
  const [facId, setFacId] = useState("");
  const [facName, setFacName] = useState("");

  const loadCatalog = useCallback(async () => {
    if (!canManageCatalogue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [d, b, f] = await Promise.all([
        listDepartments(actorHeadersContext),
        listBuildings(actorHeadersContext),
        listFacilities(actorHeadersContext),
      ]);
      setDepartments(d);
      setBuildings(b);
      setFacilities(f);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Unable to load reference data."
      );
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext, canManageCatalogue]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, actor.id]);

  const q = search.trim().toLowerCase();

  const filteredDepts = useMemo(
    () =>
      !q
        ? departments
        : departments.filter(
            (d) =>
              d.department_id.toLowerCase().includes(q) ||
              d.department_name.toLowerCase().includes(q) ||
              d.faculty.toLowerCase().includes(q)
          ),
    [departments, q]
  );

  const filteredBuildings = useMemo(
    () =>
      !q
        ? buildings
        : buildings.filter(
            (b) =>
              b.building_id.toLowerCase().includes(q) ||
              b.building_name.toLowerCase().includes(q) ||
              b.zone.toLowerCase().includes(q)
          ),
    [buildings, q]
  );

  const filteredFacilities = useMemo(
    () =>
      !q
        ? facilities
        : facilities.filter(
            (f) =>
              f.facility_id.toLowerCase().includes(q) ||
              f.facility_name.toLowerCase().includes(q)
          ),
    [facilities, q]
  );

  if (!canManageCatalogue) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Manager or Admin role required"
        description="Switch to Admin or Manager to view and edit reference catalogue tables."
      />
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setFeedback(null);
    try {
      if (tab === "departments") {
        const created = await createDepartment(actorHeadersContext, {
          department_id: deptId.trim().toUpperCase(),
          department_name: deptName.trim(),
          faculty: deptFaculty.trim(),
        });
        setFeedback(`Added department ${created.department_id} (${created.department_name}).`);
        setDeptId("");
        setDeptName("");
      } else if (tab === "buildings") {
        const created = await createBuilding(actorHeadersContext, {
          building_id: bldId.trim(),
          building_name: bldName.trim(),
          zone: bldZone,
          floor_count: Math.max(1, Number(bldFloors) || 1),
          lat: bldLat.trim() ? Number(bldLat) : null,
          lon: bldLon.trim() ? Number(bldLon) : null,
        });
        setFeedback(`Added building ${created.building_name} (${created.building_id}).`);
        setBldId("");
        setBldName("");
        setBldLat("");
        setBldLon("");
      } else {
        const created = await createFacility(actorHeadersContext, {
          facility_id: facId.trim(),
          facility_name: facName.trim(),
        });
        setFeedback(`Added facility ${created.facility_name} (${created.facility_id}).`);
        setFacId("");
        setFacName("");
      }
      setCreateOpen(false);
      await loadCatalog();
    } catch (err) {
      setCreateError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Failed to create reference record."
      );
    } finally {
      setCreating(false);
    }
  };

  const deptColumns: Column<DepartmentOut>[] = [
    {
      key: "id",
      header: "Department ID",
      className: "w-36",
      render: (d) => <span className="font-mono text-[12px] font-medium text-ink">{d.department_id}</span>,
    },
    {
      key: "name",
      header: "Department Name",
      render: (d) => <span className="font-medium text-ink">{d.department_name}</span>,
    },
    {
      key: "faculty",
      header: "Faculty",
      render: (d) => <span className="text-slate-muted">{d.faculty}</span>,
    },
  ];

  const buildingColumns: Column<BuildingOut>[] = [
    {
      key: "id",
      header: "Building ID",
      className: "w-36",
      render: (b) => <span className="font-mono text-[12px] text-slate-muted">{b.building_id}</span>,
    },
    {
      key: "name",
      header: "Building Name",
      render: (b) => <span className="font-medium text-ink">{b.building_name}</span>,
    },
    {
      key: "zone",
      header: "Campus Zone",
      render: (b) => <span className="text-slate-muted">{b.zone}</span>,
    },
    {
      key: "floors",
      header: "Floors",
      align: "right",
      render: (b) => <span className="tabular-nums text-ink">{b.floor_count}</span>,
    },
    {
      key: "coords",
      header: "Coordinates",
      align: "right",
      render: (b) => (
        <span className="font-mono text-[11.5px] text-slate-muted tabular-nums">
          {typeof b.lat === "number" && typeof b.lon === "number"
            ? `${b.lat.toFixed(4)}, ${b.lon.toFixed(4)}`
            : "—"}
        </span>
      ),
    },
  ];

  const facilityColumns: Column<FacilityOut>[] = [
    {
      key: "id",
      header: "Facility ID",
      className: "w-44",
      render: (f) => <span className="font-mono text-[12px] text-slate-muted">{f.facility_id}</span>,
    },
    {
      key: "name",
      header: "Facility / AV Tag",
      render: (f) => <span className="font-medium text-ink">{f.facility_name}</span>,
    },
  ];

  const addLabel =
    tab === "departments"
      ? "New Department"
      : tab === "buildings"
        ? "New Building"
        : "New Facility";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-hairline pb-5">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
            Reference Data
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-muted tabular-nums">
            Departments ({formatNumber(departments.length)}) · Buildings ({formatNumber(buildings.length)}) · Facilities ({formatNumber(facilities.length)})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            shape="compact"
            onClick={() => void loadCatalog()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            shape="pill"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </Button>
        </div>
      </div>

      {/* 3 Tabs + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 border-b border-hairline sm:border-b-0">
          {(
            [
              { id: "departments", label: "Departments", count: departments.length },
              { id: "buildings", label: "Buildings", count: buildings.length },
              { id: "facilities", label: "Facilities", count: facilities.length },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSearch("");
                }}
                className={`rounded-[8px] px-3 py-1.5 text-[13.5px] font-medium transition-colors tabular-nums ${
                  active
                    ? "bg-ink text-paper"
                    : "text-slate-muted hover:bg-mist hover:text-ink"
                }`}
              >
                {item.label} ({formatNumber(item.count)})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ash" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="w-full rounded-[10px] border border-hairline bg-paper py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadCatalog()} />}
      {feedback && (
        <div className="flex items-center gap-2 rounded-[12px] bg-mist px-4 py-2.5 text-[13px] font-medium text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      )}

      {tab === "departments" && (
        <DataTable
          columns={deptColumns}
          rows={filteredDepts}
          rowKey={(d) => d.department_id}
          emptyMessage={loading ? "Loading departments..." : "No matching departments."}
        />
      )}

      {tab === "buildings" && (
        <DataTable
          columns={buildingColumns}
          rows={filteredBuildings}
          rowKey={(b) => b.building_id}
          emptyMessage={loading ? "Loading buildings..." : "No matching buildings."}
        />
      )}

      {tab === "facilities" && (
        <DataTable
          columns={facilityColumns}
          rows={filteredFacilities}
          rowKey={(f) => f.facility_id}
          emptyMessage={loading ? "Loading facilities..." : "No matching facilities."}
        />
      )}

      {/* Single-Column Create Reference Record Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={addLabel}
        subtitle="Adds a normalised reference entry to SQLite"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {tab === "departments" && (
            <>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Department Code *
                </label>
                <input
                  type="text"
                  required
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  placeholder="e.g. AI-LAB"
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Applied AI Research Centre"
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Faculty *
                </label>
                <input
                  type="text"
                  required
                  value={deptFaculty}
                  onChange={(e) => setDeptFaculty(e.target.value)}
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
            </>
          )}

          {tab === "buildings" && (
            <>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Building ID *
                </label>
                <input
                  type="text"
                  required
                  value={bldId}
                  onChange={(e) => setBldId(e.target.value)}
                  placeholder="e.g. MM-9999999"
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Building Name *
                </label>
                <input
                  type="text"
                  required
                  value={bldName}
                  onChange={(e) => setBldName(e.target.value)}
                  placeholder="e.g. Interdisciplinary Design Studio"
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Campus Zone *
                </label>
                <select
                  value={bldZone}
                  onChange={(e) => setBldZone(e.target.value as CampusZone)}
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                >
                  {CAMPUS_ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Floor Count *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={bldFloors}
                  onChange={(e) => setBldFloors(e.target.value)}
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Latitude <span className="font-normal text-ash">(opt)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={bldLat}
                    onChange={(e) => setBldLat(e.target.value)}
                    placeholder="52.3834"
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Longitude <span className="font-normal text-ash">(opt)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={bldLon}
                    onChange={(e) => setBldLon(e.target.value)}
                    placeholder="-1.5612"
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink tabular-nums"
                  />
                </div>
              </div>
            </>
          )}

          {tab === "facilities" && (
            <>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Facility ID *
                </label>
                <input
                  type="text"
                  required
                  value={facId}
                  onChange={(e) => setFacId(e.target.value)}
                  placeholder="e.g. FAC-4K-DISPLAY"
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink">
                  Facility Name *
                </label>
                <input
                  type="text"
                  required
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                  placeholder="e.g. 4K Interactive Display"
                  className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
            </>
          )}

          {createError && <ErrorBanner message={createError} />}

          <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
