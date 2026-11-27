"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  PlusCircle,
  Upload,
  UserMinus,
  Users,
} from "lucide-react";
import {
  CHECKIN_LABELS,
  ELIGIBILITY_LABELS,
  RESOURCE_TYPE_SINGULAR,
  ROOM_STYLE_LABELS,
  USER_TYPE_LABELS,
  type BookingEligibility,
  type BuildingOut,
  type CheckinMethod,
  type DepartmentOut,
  type FacilityOut,
  type ImportSummary,
  type ResourceCreate,
  type ResourceOut,
  type ResourceType,
  type RoomStyle,
  type UserOut,
} from "@/types";
import {
  createResource,
  deactivateUser,
  listBuildings,
  listDepartments,
  listFacilities,
  listUsers,
} from "@/lib/resources.api";
import { importBookingsCsv } from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { useActor } from "@/hooks/useActor";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";

type AdminTab = "create_resource" | "csv_import" | "directory";

const SAMPLE_CSV = `user_id,resource_id,start_time,end_time,purpose,notes
S1001,LIB-GSR-7,1796205600,1796212800,WM9QF Group Sprint,HDMI cable needed
S1002,LIB-GSR-7,1796212800,1796216400,Accessible Study Session,Adjacent slot
`;

export default function AdminPage() {
  const { actor, actorHeadersContext, canManageCatalogue } = useActor();
  const [tab, setTab] = useState<AdminTab>("create_resource");

  // Reference & Directory data
  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [buildings, setBuildings] = useState<BuildingOut[]>([]);
  const [facilities, setFacilities] = useState<FacilityOut[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  // Polymorphic Create Resource form state
  const [resourceId, setResourceId] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType>("group_space");
  const [departmentId, setDepartmentId] = useState("LIB");
  const [buildingId, setBuildingId] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [eligibility, setEligibility] = useState<BookingEligibility>("all_users");
  const [checkinMethod, setCheckinMethod] = useState<CheckinMethod>("none");
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  // Room details
  const [capacity, setCapacity] = useState("6");
  const [roomStyle, setRoomStyle] = useState<RoomStyle>("study_pod");
  // Equipment details
  const [eqCategory, setEqCategory] = useState("laptop");
  const [eqQuantity, setEqQuantity] = useState("4");
  const [eqSpecs, setEqSpecs] = useState("");
  // Support details
  const [supCategory, setSupCategory] = useState("writing");
  const [supMaxAttendees, setSupMaxAttendees] = useState("1");
  const [supHostName, setSupHostName] = useState("");

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdResource, setCreatedResource] = useState<ResourceOut | null>(null);

  // CSV Import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const loadReferenceData = useCallback(async () => {
    setDirLoading(true);
    setDirError(null);
    try {
      const [depts, bldgs, facs, usrList] = await Promise.all([
        listDepartments(actorHeadersContext),
        listBuildings(actorHeadersContext),
        listFacilities(actorHeadersContext),
        listUsers(actorHeadersContext).catch(() => [] as UserOut[]),
      ]);
      setDepartments(depts);
      setBuildings(bldgs);
      setFacilities(facs);
      setUsers(usrList);
      if (depts.length > 0 && !depts.some((d) => d.department_id === departmentId)) {
        setDepartmentId(depts[0].department_id);
      }
    } catch (err) {
      setDirError(
        err instanceof ApiError ? err.detail : "Unable to load catalogue reference data."
      );
    } finally {
      setDirLoading(false);
    }
  }, [actorHeadersContext, departmentId]);

  useEffect(() => {
    if (canManageCatalogue) {
      void loadReferenceData();
    }
  }, [canManageCatalogue, loadReferenceData, actor.id]);

  if (!canManageCatalogue) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Admin or Manager Access Required"
        description={`You are currently signed in as ${actor.label} (${actor.role}). Switch to Admin (ADMIN1) or a Manager preset in the top bar to manage resources, import CSV bookings, or inspect the campus directory.`}
      />
    );
  }

  const isRoomType =
    resourceType === "study_room" ||
    resourceType === "group_space" ||
    resourceType === "computer_lab";

  const toggleFacility = (name: string) => {
    setSelectedFacilities((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreatedResource(null);

    let details: ResourceCreate["details"];
    if (isRoomType) {
      details = {
        capacity: Math.max(1, Number(capacity) || 1),
        room_style: roomStyle,
      };
    } else if (resourceType === "specialist_equipment") {
      details = {
        category: eqCategory.trim() || "general",
        quantity: Math.max(1, Number(eqQuantity) || 1),
        specifications: eqSpecs.trim() || null,
      };
    } else {
      details = {
        category: supCategory.trim() || "consultation",
        max_attendees: Math.max(1, Number(supMaxAttendees) || 1),
        host_name: supHostName.trim() || null,
      };
    }

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
      status: "active",
      facilities: selectedFacilities,
      details,
    };

    try {
      const created = await createResource(actorHeadersContext, payload);
      setCreatedResource(created);
      setResourceId("");
      setResourceName("");
      setLocation("");
      setDescription("");
      setImageUrl("");
      setSelectedFacilities([]);
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

  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setImporting(true);
    setImportError(null);
    setImportSummary(null);
    try {
      const summary = await importBookingsCsv(actorHeadersContext, csvFile);
      setImportSummary(summary);
    } catch (err) {
      setImportError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "CSV import request failed."
      );
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_bookings_import.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeactivateUser = async (userId: string) => {
    if (!window.confirm(`Soft-deactivate user ${userId} (is_active = 0)?`)) return;
    try {
      await deactivateUser(actorHeadersContext, userId);
      await loadReferenceData();
    } catch (err) {
      setDirError(
        err instanceof ApiError ? err.detail : "Failed to deactivate user."
      );
    }
  };

  const userColumns: Column<UserOut>[] = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        <div>
          <div className="font-semibold text-slate-900">{u.full_name}</div>
          <div className="font-mono text-[11px] text-slate-400">
            {u.user_id} · {u.email}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type & Role",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone="slate">{USER_TYPE_LABELS[u.user_type]}</Badge>
          <Badge tone={u.role === "admin" ? "plum" : u.role === "manager" ? "indigo" : "emerald"}>
            {u.role}
          </Badge>
        </div>
      ),
    },
    {
      key: "dept",
      header: "Department / Course",
      render: (u) => (
        <div className="text-xs">
          <span className="font-semibold text-slate-800">{u.department_id}</span>
          {u.course && <div className="text-slate-500">{u.course}</div>}
        </div>
      ),
    },
    {
      key: "flags",
      header: "Status",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={u.is_active ? "emerald" : "rose"}>
            {u.is_active ? "Active" : "Inactive"}
          </Badge>
          {u.has_accessibility_access && <Badge tone="indigo">Accessible</Badge>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Action",
      align: "right",
      render: (u) =>
        actor.role === "admin" && u.is_active ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50"
            onClick={() => void handleDeactivateUser(u.user_id)}
            title="Soft-deactivate user"
          >
            <UserMinus className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        ),
    },
  ];

  const deptColumns: Column<DepartmentOut>[] = [
    {
      key: "id",
      header: "Code",
      render: (d) => <span className="font-mono text-xs font-semibold text-warwick-800">{d.department_id}</span>,
    },
    {
      key: "name",
      header: "Department Name",
      render: (d) => <span className="font-medium text-slate-900">{d.department_name}</span>,
    },
    {
      key: "faculty",
      header: "Faculty",
      render: (d) => <Badge tone="slate">{d.faculty}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("create_resource")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            tab === "create_resource"
              ? "bg-warwick-700 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <PlusCircle className="h-4 w-4" />
          Create Resource (CTI)
        </button>
        <button
          type="button"
          onClick={() => setTab("csv_import")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            tab === "csv_import"
              ? "bg-warwick-700 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          CSV Batch Import
        </button>
        <button
          type="button"
          onClick={() => setTab("directory")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            tab === "directory"
              ? "bg-warwick-700 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Users className="h-4 w-4" />
          Users & Departments ({users.length} / {departments.length})
        </button>
      </div>

      {dirError && <ErrorBanner message={dirError} onRetry={() => void loadReferenceData()} />}

      {/* TAB 1: POLYMORPHIC CREATE RESOURCE */}
      {tab === "create_resource" && (
        <form
          onSubmit={handleCreateResource}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card space-y-6"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Add Campus Resource (Polymorphic CTI)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Subtype <span className="font-mono">details</span> fields adapt automatically to match{" "}
              <span className="font-mono">RoomDetails</span>, <span className="font-mono">EquipmentDetails</span>, or{" "}
              <span className="font-mono">SupportDetails</span>.
            </p>
          </div>

          {createdResource && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              Created <strong>{createdResource.resource_name}</strong> (
              <span className="font-mono">{createdResource.resource_id}</span>) successfully.
            </div>
          )}
          {createError && <ErrorBanner message={createError} />}

          {/* Core Supertype Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Resource Type *
              </label>
              <select
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value as ResourceType)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
              >
                {(Object.keys(RESOURCE_TYPE_SINGULAR) as ResourceType[]).map((t) => (
                  <option key={t} value={t}>
                    {RESOURCE_TYPE_SINGULAR[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Resource ID *
              </label>
              <input
                type="text"
                required
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                placeholder="e.g. LIB-GSR-99 or EQ-WMG-XR-09"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Resource Name *
              </label>
              <input
                type="text"
                required
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                placeholder="e.g. Rootes Group Study 9"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none focus:ring-2 focus:ring-warwick-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Department *
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none"
              >
                {departments.length === 0 ? (
                  <option value={departmentId}>{departmentId}</option>
                ) : (
                  departments.map((d) => (
                    <option key={d.department_id} value={d.department_id}>
                      {d.department_id} — {d.department_name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Campus Building <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none"
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
              <label className="block text-xs font-semibold text-slate-700">
                Room / Counter Location *
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Library Floor 2 or Online (MS Teams)"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Booking Eligibility
              </label>
              <select
                value={eligibility}
                onChange={(e) => setEligibility(e.target.value as BookingEligibility)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none"
              >
                {(Object.keys(ELIGIBILITY_LABELS) as BookingEligibility[]).map((el) => (
                  <option key={el} value={el}>
                    {ELIGIBILITY_LABELS[el]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Check-in Method
              </label>
              <select
                value={checkinMethod}
                onChange={(e) => setCheckinMethod(e.target.value as CheckinMethod)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-warwick-600 focus:outline-none"
              >
                {(Object.keys(CHECKIN_LABELS) as CheckinMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {CHECKIN_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-warwick-700 focus:ring-warwick-600"
                />
                Requires Manager Approval
              </label>
            </div>
          </div>

          {/* Polymorphic Subtype Details Block */}
          <div className="rounded-xl border border-warwick-200 bg-warwick-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-warwick-800">
                Subtype Details:{" "}
                {isRoomType
                  ? "RoomDetails"
                  : resourceType === "specialist_equipment"
                    ? "EquipmentDetails"
                    : "SupportDetails"}
              </h3>
              <Badge tone="plum">CTI 1:1 Subtype</Badge>
            </div>

            {isRoomType && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Seat Capacity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Room Style *
                  </label>
                  <select
                    value={roomStyle}
                    onChange={(e) => setRoomStyle(e.target.value as RoomStyle)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {(Object.keys(ROOM_STYLE_LABELS) as RoomStyle[]).map((s) => (
                      <option key={s} value={s}>
                        {ROOM_STYLE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {resourceType === "specialist_equipment" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Equipment Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={eqCategory}
                    onChange={(e) => setEqCategory(e.target.value)}
                    placeholder="e.g. vr_xr, laptop, av_kit"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Pool Quantity (Concurrent Loans) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={eqQuantity}
                    onChange={(e) => setEqQuantity(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Technical Specifications
                  </label>
                  <textarea
                    rows={2}
                    value={eqSpecs}
                    onChange={(e) => setEqSpecs(e.target.value)}
                    placeholder="Hardware model, accessories included, collection instructions..."
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {resourceType === "academic_support" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Support Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={supCategory}
                    onChange={(e) => setSupCategory(e.target.value)}
                    placeholder="e.g. writing, careers, maths"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Max Attendees *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={supMaxAttendees}
                    onChange={(e) => setSupMaxAttendees(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Host / Advisory Team
                  </label>
                  <input
                    type="text"
                    value={supHostName}
                    onChange={(e) => setSupHostName(e.target.value)}
                    placeholder="e.g. Academic Writing Mentors Team"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Optional Description, Image URL & Facilities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Description <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opening hours, usage guidelines, or room features..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                360° / Room Photo URL <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://warwick.ac.uk/..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {facilities.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Facilities ({selectedFacilities.length} selected)
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {facilities.map((fac) => {
                  const active = selectedFacilities.includes(fac.facility_name);
                  return (
                    <button
                      key={fac.facility_id}
                      type="button"
                      onClick={() => toggleFacility(fac.facility_name)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "bg-warwick-700 text-white"
                          : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {fac.facility_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button type="submit" loading={creating} size="lg">
              <PlusCircle className="h-4 w-4" />
              Create Resource
            </Button>
          </div>
        </form>
      )}

      {/* TAB 2: CSV BATCH BOOKING IMPORT */}
      {tab === "csv_import" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  CSV Batch Booking Import
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Upload a CSV file to <span className="font-mono">POST /api/v1/bookings/import-csv</span>.
                  Every row passes through full 2-way conflict checks and PolicyGuard validation with line-numbered errors.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={downloadSampleCsv}>
                Download Sample CSV
              </Button>
            </div>

            <form onSubmit={handleCsvUpload} className="space-y-4">
              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center cursor-pointer hover:border-warwick-400 hover:bg-warwick-50/30 transition-colors">
                <Upload className="h-7 w-7 text-warwick-700" />
                <span className="mt-2 text-sm font-semibold text-slate-800">
                  {csvFile ? csvFile.name : "Choose a .csv bookings file"}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  Columns: <span className="font-mono">user_id, resource_id, start_time, end_time, purpose, notes</span>
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                />
              </label>

              {importError && <ErrorBanner message={importError} />}

              <div className="flex justify-end">
                <Button type="submit" disabled={!csvFile} loading={importing}>
                  <Upload className="h-4 w-4" />
                  Run Batch Import
                </Button>
              </div>
            </form>
          </div>

          {importSummary && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Import Summary</h3>
                <div className="flex flex-wrap gap-2 tabular-nums">
                  <Badge tone="slate">Total Rows: {importSummary.total_rows}</Badge>
                  <Badge tone="emerald">Imported: {importSummary.imported_count}</Badge>
                  <Badge tone={importSummary.failed_count > 0 ? "rose" : "slate"}>
                    Failed: {importSummary.failed_count}
                  </Badge>
                </div>
              </div>

              {importSummary.created_booking_ids.length > 0 && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-900">
                  Created booking IDs:{" "}
                  <span className="font-mono font-semibold">
                    {importSummary.created_booking_ids.map((id) => `#${id}`).join(", ")}
                  </span>
                </div>
              )}

              {importSummary.errors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-700 mb-2">
                    Line-Numbered Validation & Clash Errors ({importSummary.errors.length})
                  </h4>
                  <DataTable
                    rows={importSummary.errors}
                    rowKey={(err) => `${err.line_number}-${err.error}`}
                    columns={[
                      {
                        key: "line",
                        header: "Line",
                        className: "w-20",
                        render: (err) => (
                          <span className="font-mono text-xs font-semibold text-rose-700 tabular-nums">
                            Line {err.line_number}
                          </span>
                        ),
                      },
                      {
                        key: "error",
                        header: "Error Reason",
                        render: (err) => (
                          <span className="text-xs font-medium text-rose-800">{err.error}</span>
                        ),
                      },
                      {
                        key: "row",
                        header: "Row Data",
                        render: (err) => (
                          <code className="text-[11px] text-slate-500">
                            {err.row_data ? JSON.stringify(err.row_data) : "—"}
                          </code>
                        ),
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: USERS & DEPARTMENTS DIRECTORY */}
      {tab === "directory" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-warwick-700" />
                Campus Users ({users.length})
              </h2>
              {dirLoading && <span className="text-xs text-slate-400">Loading...</span>}
            </div>
            <DataTable
              columns={userColumns}
              rows={users}
              rowKey={(u) => u.user_id}
              emptyMessage="No users returned (requires Admin or Manager role)."
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-warwick-700" />
              Warwick Departments ({departments.length})
            </h2>
            <DataTable
              columns={deptColumns}
              rows={departments}
              rowKey={(d) => d.department_id}
              emptyMessage="No departments available."
            />
          </section>
        </div>
      )}
    </div>
  );
}
