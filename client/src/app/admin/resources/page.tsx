"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  CheckCircle2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import {
  CHECKIN_LABELS,
  ELIGIBILITY_LABELS,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_SINGULAR,
  ROOM_STYLE_LABELS,
  isEquipmentDetails,
  isRoomDetails,
  isSupportDetails,
  type BookingEligibility,
  type BuildingOut,
  type CheckinMethod,
  type DepartmentOut,
  type FacilityOut,
  type ResourceCreate,
  type ResourceOut,
  type ResourceStatus,
  type ResourceType,
  type RoomStyle,
} from "@/types";
import {
  createResource,
  listBuildings,
  listDepartments,
  listFacilities,
  listResources,
  retireResource,
  updateResource,
} from "@/lib/resources.api";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

export default function AdminResourcesPage() {
  const { actor, actorHeadersContext, canManageCatalogue } = useActor();

  const [resources, setResources] = useState<ResourceOut[]>([]);
  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [buildings, setBuildings] = useState<BuildingOut[]>([]);
  const [facilities, setFacilities] = useState<FacilityOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Table filters
  const [typeFilter, setTypeFilter] = useState<ResourceType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ResourceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  // Single-column CTI create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType>("group_space");
  const [departmentId, setDepartmentId] = useState("LIB");
  const [buildingId, setBuildingId] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [eligibility, setEligibility] = useState<BookingEligibility>("all_users");
  const [checkinMethod, setCheckinMethod] = useState<CheckinMethod>("none");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  // CTI subtype fields
  const [capacity, setCapacity] = useState("8");
  const [roomStyle, setRoomStyle] = useState<RoomStyle>("study_pod");
  const [eqCategory, setEqCategory] = useState("vr_xr");
  const [eqQuantity, setEqQuantity] = useState("4");
  const [eqSpecs, setEqSpecs] = useState("");
  const [supCategory, setSupCategory] = useState("writing");
  const [supMaxAttendees, setSupMaxAttendees] = useState("1");
  const [supHostName, setSupHostName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!canManageCatalogue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [resList, deptList, bldList, facList] = await Promise.all([
        listResources(actorHeadersContext, { limit: 1000 }),
        listDepartments(actorHeadersContext),
        listBuildings(actorHeadersContext),
        listFacilities(actorHeadersContext),
      ]);
      setResources(resList);
      setDepartments(deptList);
      setBuildings(bldList);
      setFacilities(facList);
      if (deptList.length > 0 && !deptList.some((d) => d.department_id === departmentId)) {
        setDepartmentId(deptList[0].department_id);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Unable to load resources catalogue."
      );
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext, canManageCatalogue, departmentId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, actor.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (typeFilter !== "all" && r.resource_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.resource_id.toLowerCase().includes(q) ||
        r.resource_name.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        (r.building_name?.toLowerCase().includes(q) ?? false) ||
        r.department_id.toLowerCase().includes(q)
      );
    });
  }, [resources, typeFilter, statusFilter, search]);

  if (!canManageCatalogue) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Manager or Admin role required"
        description="Switch to an Admin or Manager role to inspect and maintain the campus resource catalogue."
      />
    );
  }

  const handleToggleMaintenance = async (res: ResourceOut) => {
    const nextStatus: ResourceStatus =
      res.status === "maintenance" ? "active" : "maintenance";
    setBusyId(res.resource_id);
    setError(null);
    setFeedback(null);
    try {
      const updated = await updateResource(actorHeadersContext, res.resource_id, {
        status: nextStatus,
      });
      setResources((prev) =>
        prev.map((item) =>
          item.resource_id === updated.resource_id ? updated : item
        )
      );
      setFeedback(`${updated.resource_id} set to "${updated.status}".`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Failed to update resource status."
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRetire = async (res: ResourceOut) => {
    if (!window.confirm(`Soft-retire ${res.resource_name} (${res.resource_id})?`)) {
      return;
    }
    setBusyId(res.resource_id);
    setError(null);
    setFeedback(null);
    try {
      await retireResource(actorHeadersContext, res.resource_id);
      setFeedback(`${res.resource_id} retired.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to retire resource.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleFacility = (name: string) => {
    setSelectedFacilities((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const isRoomType =
    resourceType === "study_room" ||
    resourceType === "group_space" ||
    resourceType === "computer_lab";

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    const details: ResourceCreate["details"] = isRoomType
      ? { capacity: Math.max(1, Number(capacity) || 1), room_style: roomStyle }
      : resourceType === "specialist_equipment"
        ? {
            category: eqCategory.trim() || "general",
            quantity: Math.max(1, Number(eqQuantity) || 1),
            specifications: eqSpecs.trim() || null,
          }
        : {
            category: supCategory.trim() || "general",
            max_attendees: Math.max(1, Number(supMaxAttendees) || 1),
            host_name: supHostName.trim() || null,
          };

    const payload: ResourceCreate = {
      resource_id: resourceId.trim(),
      resource_name: resourceName.trim(),
      resource_type: resourceType,
      department_id: departmentId,
      building_id: buildingId || null,
      location: location.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      requires_approval: requiresApproval,
      booking_eligibility: eligibility,
      checkin_method: checkinMethod,
      facilities: selectedFacilities,
      details,
    };

    try {
      const created = await createResource(actorHeadersContext, payload);
      setFeedback(`Created ${created.resource_name} (${created.resource_id}).`);
      setCreateOpen(false);
      setResourceId("");
      setResourceName("");
      setLocation("");
      setDescription("");
      setImageUrl("");
      setSelectedFacilities([]);
      await loadAll();
    } catch (err) {
      setCreateError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Failed to create resource."
      );
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<ResourceOut>[] = [
    {
      key: "name",
      header: "Resource",
      render: (r) => (
        <div className="min-w-[180px]">
          <Link
            href={`/resources/${encodeURIComponent(r.resource_id)}`}
            className="font-medium text-ink hover:underline underline-offset-4 block"
          >
            {r.resource_name}
          </Link>
          <span className="font-mono text-[11px] text-ash">{r.resource_id}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className="text-[12.5px] text-slate-muted whitespace-nowrap">
          {RESOURCE_TYPE_SINGULAR[r.resource_type]}
        </span>
      ),
    },
    {
      key: "location",
      header: "Building & Location",
      render: (r) => (
        <div className="text-[12.5px]">
          <div className="text-ink">{r.building_name ?? r.location}</div>
          <div className="text-[11.5px] text-ash">
            {r.department_id}
            {r.zone ? ` · ${r.zone}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "spec",
      header: "Capacity / Pool",
      render: (r) => {
        if (isRoomDetails(r.details, r.resource_type)) {
          return (
            <span className="text-[12.5px] text-ink tabular-nums">
              {r.details.capacity} seats · {ROOM_STYLE_LABELS[r.details.room_style]}
            </span>
          );
        }
        if (isEquipmentDetails(r.details, r.resource_type)) {
          return (
            <span className="text-[12.5px] text-ink tabular-nums">
              {r.details.quantity} units · {r.details.category}
            </span>
          );
        }
        if (isSupportDetails(r.details, r.resource_type)) {
          return (
            <span className="text-[12.5px] text-ink tabular-nums">
              Max {r.details.max_attendees} · {r.building_id === null ? "Online" : "In-person"}
            </span>
          );
        }
        return <span className="text-ash">—</span>;
      },
    },
    {
      key: "policy",
      header: "Policy",
      render: (r) => (
        <div className="text-[12px] text-slate-muted">
          <div>{ELIGIBILITY_LABELS[r.booking_eligibility]}</div>
          <div className="text-[11px] text-ash">
            {r.requires_approval ? "Approval required" : "Auto-confirm"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium capitalize ${
            r.status === "active"
              ? "bg-mist text-ink"
              : r.status === "maintenance"
                ? "bg-blush text-sienna"
                : "bg-fog text-ash border border-hairline"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              r.status === "active"
                ? "bg-ink"
                : r.status === "maintenance"
                  ? "bg-sienna"
                  : "bg-ash"
            }`}
          />
          {r.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => {
        const isBusy = busyId === r.resource_id;
        return (
          <div className="inline-flex items-center justify-end gap-1">
            {r.status !== "retired" && (
              <>
                <Button
                  size="sm"
                  shape="compact"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => void handleToggleMaintenance(r)}
                  title="Toggle active / maintenance"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  {r.status === "maintenance" ? "Activate" : "Maint."}
                </Button>
                <Button
                  size="sm"
                  shape="compact"
                  variant="ghost"
                  className="text-sienna hover:bg-blush/60"
                  disabled={isBusy}
                  onClick={() => void handleRetire(r)}
                  title="Soft retire resource"
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-hairline pb-5">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
            Resources Catalogue
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-muted tabular-nums">
            {loading
              ? "Loading catalogue..."
              : `${formatNumber(filtered.length)} of ${formatNumber(resources.length)} resources`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            shape="compact"
            onClick={() => void loadAll()}
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
            New Resource
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by resource type"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as ResourceType | "all");
              setVisibleCount(50);
            }}
            className="h-9 rounded-[10px] border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-ink focus:outline-none"
          >
            <option value="all">All types</option>
            {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ResourceStatus | "all");
              setVisibleCount(50);
            }}
            className="h-9 rounded-[10px] border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-ink focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ash" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(50);
            }}
            placeholder="Search ID, name, building..."
            className="w-full rounded-[10px] border border-hairline bg-paper py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadAll()} />}
      {feedback && (
        <div className="flex items-center gap-2 rounded-[12px] bg-mist px-4 py-2.5 text-[13px] font-medium text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered.slice(0, visibleCount)}
        rowKey={(r) => r.resource_id}
        emptyMessage={loading ? "Loading resources..." : "No resources match this filter."}
      />

      {filtered.length > visibleCount && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            shape="pill"
            onClick={() => setVisibleCount((n) => n + 50)}
          >
            Load more ({formatNumber(filtered.length - visibleCount)} remaining)
          </Button>
        </div>
      )}

      {/* Single-Column Polymorphic CTI Create Resource Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Resource"
        subtitle="Polymorphic Class Table Inheritance (RoomDetails / EquipmentDetails / SupportDetails)"
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Resource Type *
            </label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as ResourceType)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Resource ID *
            </label>
            <input
              type="text"
              required
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="e.g. LIB-GSR-99"
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Resource Name *
            </label>
            <input
              type="text"
              required
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder="e.g. Rootes Group Study 9"
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Department *
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.department_id} — {d.department_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Campus Building <span className="font-normal text-ash">(optional)</span>
            </label>
            <select
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              <option value="">None / Online Venue</option>
              {buildings.map((b) => (
                <option key={b.building_id} value={b.building_id}>
                  {b.building_name} ({b.zone})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Location *
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Library Floor 2 or Online (MS Teams)"
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Booking Eligibility
            </label>
            <select
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value as BookingEligibility)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              {(Object.keys(ELIGIBILITY_LABELS) as BookingEligibility[]).map((el) => (
                <option key={el} value={el}>
                  {ELIGIBILITY_LABELS[el]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Check-in Method
            </label>
            <select
              value={checkinMethod}
              onChange={(e) => setCheckinMethod(e.target.value as CheckinMethod)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              {(Object.keys(CHECKIN_LABELS) as CheckinMethod[]).map((m) => (
                <option key={m} value={m}>
                  {CHECKIN_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2.5 text-[13px] font-medium text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4 rounded accent-ink"
            />
            Requires manager approval before confirmation
          </label>

          {/* Polymorphic CTI Subtype Section */}
          <div className="rounded-[16px] bg-mist p-4 space-y-3.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-slate-muted">
              {isRoomType
                ? "RoomDetails (CTI Subtype)"
                : resourceType === "specialist_equipment"
                  ? "EquipmentDetails (CTI Subtype)"
                  : "SupportDetails (CTI Subtype)"}
            </p>

            {isRoomType && (
              <>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Seat Capacity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Room Style *
                  </label>
                  <select
                    value={roomStyle}
                    onChange={(e) => setRoomStyle(e.target.value as RoomStyle)}
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink"
                  >
                    {(Object.keys(ROOM_STYLE_LABELS) as RoomStyle[]).map((s) => (
                      <option key={s} value={s}>
                        {ROOM_STYLE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {resourceType === "specialist_equipment" && (
              <>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Equipment Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={eqCategory}
                    onChange={(e) => setEqCategory(e.target.value)}
                    placeholder="e.g. vr_xr, laptop, av_kit"
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Pool Quantity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={eqQuantity}
                    onChange={(e) => setEqQuantity(e.target.value)}
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Technical Specifications
                  </label>
                  <textarea
                    rows={2}
                    value={eqSpecs}
                    onChange={(e) => setEqSpecs(e.target.value)}
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink"
                  />
                </div>
              </>
            )}

            {resourceType === "academic_support" && (
              <>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Support Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={supCategory}
                    onChange={(e) => setSupCategory(e.target.value)}
                    placeholder="e.g. writing, careers, study_skills"
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Max Attendees *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={supMaxAttendees}
                    onChange={(e) => setSupMaxAttendees(e.target.value)}
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-ink">
                    Host / Advisory Team
                  </label>
                  <input
                    type="text"
                    value={supHostName}
                    onChange={(e) => setSupHostName(e.target.value)}
                    placeholder="e.g. Academic Writing Mentors Team"
                    className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Description <span className="font-normal text-ash">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              360° / Room Photo URL <span className="font-normal text-ash">(optional)</span>
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://warwick.ac.uk/..."
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink"
            />
          </div>

          {facilities.length > 0 && (
            <div>
              <label className="block text-[12.5px] font-medium text-ink mb-2">
                Facilities ({selectedFacilities.length} selected)
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto rounded-[12px] border border-hairline bg-fog p-3">
                {facilities.map((fac) => {
                  const active = selectedFacilities.includes(fac.facility_name);
                  return (
                    <button
                      key={fac.facility_id}
                      type="button"
                      onClick={() => toggleFacility(fac.facility_name)}
                      className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                        active
                          ? "bg-ink text-paper"
                          : "bg-paper text-slate-muted border border-hairline hover:text-ink"
                      }`}
                    >
                      {fac.facility_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {createError && <ErrorBanner message={createError} />}

          <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Resource
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
