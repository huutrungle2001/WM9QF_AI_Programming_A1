"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  Download,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
  UserX,
} from "lucide-react";
import {
  RESOURCE_TYPE_SINGULAR,
  type BookingOut,
  type BookingStatusId,
  type ImportSummary,
} from "@/types";
import {
  cancelBooking,
  completeBooking,
  deleteBooking,
  importBookingsCsv,
  markNoShow,
} from "@/lib/bookings.api";
import { ApiError } from "@/lib/api-client";
import { formatDuration, formatTimeRange } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { useBookings } from "@/hooks/useBookings";
import { RedactedValue, StatusBadge } from "@/components/bookings/StatusBadge";
import { EditBookingModal } from "@/components/bookings/EditBookingModal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

const STATUS_FILTERS: { value: BookingStatusId | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
  { value: "no_show", label: "No-Show" },
];

export default function AdminBookingsPage() {
  const {
    actor,
    actorHeadersContext,
    canViewAnalytics,
    canManageApprovals,
    isRedactedRole,
  } = useActor();

  const [statusFilter, setStatusFilter] = useState<BookingStatusId | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BookingOut | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // CSV Batch Import drawer/modal state
  const [importOpen, setImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const { bookings, loading, error, refresh } = useBookings({
    status_id: statusFilter === "all" ? undefined : statusFilter,
    limit: 250,
  });

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        String(b.booking_id).includes(q) ||
        b.resource_id.toLowerCase().includes(q) ||
        (b.resource_name?.toLowerCase().includes(q) ?? false) ||
        b.user_id.toLowerCase().includes(q) ||
        (b.user_name?.toLowerCase().includes(q) ?? false) ||
        (b.course?.toLowerCase().includes(q) ?? false) ||
        (b.purpose?.toLowerCase().includes(q) ?? false)
    );
  }, [bookings, search]);

  if (!canViewAnalytics) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Admin Console access required"
        description="Switch to Admin, Manager, or Student Services to view the campus-wide bookings register."
      />
    );
  }

  const runAction = async (
    bookingId: number,
    label: string,
    fn: () => Promise<unknown>
  ) => {
    setBusyId(bookingId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await fn();
      setActionSuccess(`Booking #${bookingId}: ${label}.`);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : `Failed to ${label}.`
      );
    } finally {
      setBusyId(null);
    }
  };

  const downloadSampleCsv = () => {
    const now = Math.ceil(Date.now() / 1000 / 3600) * 3600 + 48 * 3600;
    const sample = [
      "user_id,resource_id,start_time,end_time,purpose,notes",
      `S1001,LIB-GSR-7,${now},${now + 3600},WM9QF Sprint Planning,Projector requested`,
      `S1001,LIB-GSR-7,${now + 1800},${now + 5400},Intentional overlap clash test,Should report line error`,
    ].join("\n");
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "warwick_bookings_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
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
      await refresh();
    } catch (err) {
      setImportError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "CSV batch import failed."
      );
    } finally {
      setImporting(false);
    }
  };

  const columns: Column<BookingOut>[] = [
    {
      key: "booking",
      header: "Booking & Resource",
      render: (b) => (
        <div className="min-w-[180px]">
          <div className="flex items-center gap-2 text-[11.5px] text-ash">
            <span className="font-mono font-medium text-ink">#{b.booking_id}</span>
            {b.resource_type && <span>{RESOURCE_TYPE_SINGULAR[b.resource_type]}</span>}
          </div>
          <Link
            href={`/resources/${encodeURIComponent(b.resource_id)}`}
            className="mt-0.5 block font-medium text-ink hover:underline underline-offset-4"
          >
            {b.resource_name ?? b.resource_id}
          </Link>
          <div className="font-mono text-[11px] text-ash">{b.resource_id}</div>
        </div>
      ),
    },
    {
      key: "user",
      header: "User & Course",
      render: (b) => (
        <div className="text-[12.5px]">
          {b.user_name ? (
            <>
              <div className="font-medium text-ink">{b.user_name}</div>
              <div className="font-mono text-[11px] text-slate-muted">{b.user_id}</div>
            </>
          ) : (
            <RedactedValue value={b.user_id} />
          )}
          {b.course && <div className="mt-0.5 text-[11.5px] text-ash">{b.course}</div>}
        </div>
      ),
    },
    {
      key: "schedule",
      header: "Schedule (UTC)",
      render: (b) => (
        <div className="text-[12.5px] tabular-nums whitespace-nowrap">
          <div className="font-medium text-ink">
            {formatTimeRange(b.start_time, b.end_time)}
          </div>
          <div className="text-[11.5px] text-ash">
            {formatDuration(b.start_time, b.end_time)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => <StatusBadge status={b.status_id} />,
    },
    {
      key: "purpose",
      header: "Purpose & Notes",
      render: (b) => (
        <div className="max-w-[240px] text-[12.5px]">
          <div className="text-ink line-clamp-2">
            <RedactedValue value={b.purpose} />
          </div>
          {b.notes && (
            <div className="mt-0.5 text-[11.5px] text-slate-muted line-clamp-1">
              <RedactedValue value={b.notes} />
            </div>
          )}
        </div>
      ),
    },
    ...(!isRedactedRole
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "right" as const,
            render: (b: BookingOut) => {
              const isModifiable =
                b.status_id === "pending" || b.status_id === "confirmed";
              const isBusy = busyId === b.booking_id;
              return (
                <div className="inline-flex items-center justify-end gap-1">
                  {isModifiable && (
                    <Button
                      size="sm"
                      shape="compact"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => setEditing(b)}
                      title="Reschedule or edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isModifiable && (
                    <Button
                      size="sm"
                      shape="compact"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(b.booking_id, "cancelled", () =>
                          cancelBooking(actorHeadersContext, b.booking_id)
                        )
                      }
                      title="Cancel booking"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canManageApprovals && b.status_id === "confirmed" && (
                    <>
                      <Button
                        size="sm"
                        shape="compact"
                        variant="ghost"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction(b.booking_id, "marked completed", () =>
                            completeBooking(actorHeadersContext, b.booking_id)
                          )
                        }
                        title="Mark completed"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        shape="compact"
                        variant="ghost"
                        disabled={isBusy}
                        onClick={() =>
                          void runAction(b.booking_id, "marked no-show", () =>
                            markNoShow(actorHeadersContext, b.booking_id)
                          )
                        }
                        title="Mark no-show"
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {actor.role === "admin" && (
                    <Button
                      size="sm"
                      shape="compact"
                      variant="ghost"
                      className="text-sienna hover:bg-blush/60"
                      disabled={isBusy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Soft-delete booking #${b.booking_id}? (Sets deleted_at, preserves audit trail)`
                          )
                        ) {
                          void runAction(b.booking_id, "soft-deleted", () =>
                            deleteBooking(actorHeadersContext, b.booking_id)
                          );
                        }
                      }}
                      title="Admin soft-delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-hairline pb-5">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
            Bookings
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-muted tabular-nums">
            {loading
              ? "Loading campus bookings..."
              : `${filteredBookings.length} bookings shown`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            shape="compact"
            onClick={() => void refresh()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageApprovals && (
            <Button
              variant="primary"
              size="sm"
              shape="pill"
              onClick={() => {
                setImportSummary(null);
                setImportError(null);
                setCsvFile(null);
                setImportOpen(true);
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              Import CSV
            </Button>
          )}
        </div>
      </div>

      {isRedactedRole && (
        <div className="flex items-start gap-3 rounded-[14px] bg-blush px-4 py-3.5 text-[13px] text-sienna">
          <Shield className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Student Services redaction active:</span>{" "}
            identifiers are pseudonymised (<span className="font-mono">ANON-...</span>),
            free text is <span className="font-mono">[REDACTED]</span>, and all mutations are disabled.
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-ink text-paper"
                    : "text-slate-muted hover:bg-mist hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ash" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search booking, room, user..."
            className="w-full rounded-[10px] border border-hairline bg-paper py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      {actionError && <ErrorBanner message={actionError} />}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-[12px] bg-mist px-4 py-2.5 text-[13px] font-medium text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {actionSuccess}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filteredBookings}
        rowKey={(b) => b.booking_id}
        emptyMessage={loading ? "Loading bookings..." : "No bookings match this filter."}
      />

      <EditBookingModal
        booking={editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setActionSuccess("Booking updated successfully.");
          void refresh();
        }}
      />

      {/* Single-Column CSV Batch Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="CSV Batch Booking Import"
        subtitle="Uploads to POST /api/v1/bookings/import-csv with atomic 2-way conflict & PolicyGuard checks"
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-5">
          <form onSubmit={handleCsvUpload} className="space-y-4">
            <label className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-smoke bg-fog px-6 py-8 text-center cursor-pointer hover:border-ink transition-colors">
              <Upload className="h-6 w-6 text-ink" />
              <span className="mt-2.5 text-[14px] font-medium text-ink">
                {csvFile ? csvFile.name : "Select a .csv bookings file"}
              </span>
              <span className="mt-1 font-mono text-[11.5px] text-slate-muted">
                user_id, resource_id, start_time, end_time, purpose, notes
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {importError && <ErrorBanner message={importError} />}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                shape="pill"
                onClick={downloadSampleCsv}
              >
                <Download className="h-3.5 w-3.5" />
                Download Sample CSV
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                shape="pill"
                disabled={!csvFile}
                loading={importing}
              >
                Run Batch Import
              </Button>
            </div>
          </form>

          {importSummary && (
            <div className="space-y-3 border-t border-hairline pt-4">
              <div className="flex flex-wrap items-center gap-3 text-[13px] tabular-nums">
                <span className="rounded-full bg-mist px-3 py-1 font-medium text-ink">
                  Total: {importSummary.total_rows}
                </span>
                <span className="rounded-full bg-ink px-3 py-1 font-medium text-paper">
                  Imported: {importSummary.imported_count}
                </span>
                <span className="rounded-full bg-blush px-3 py-1 font-medium text-sienna">
                  Failed: {importSummary.failed_count}
                </span>
              </div>

              {importSummary.created_booking_ids.length > 0 && (
                <p className="rounded-[12px] bg-fog border border-hairline px-3.5 py-2.5 text-[12.5px] text-ink">
                  Created IDs:{" "}
                  <span className="font-mono">
                    {importSummary.created_booking_ids.map((id) => `#${id}`).join(", ")}
                  </span>
                </p>
              )}

              {importSummary.errors.length > 0 && (
                <DataTable
                  rows={importSummary.errors}
                  rowKey={(err) => `${err.line_number}-${err.error}`}
                  columns={[
                    {
                      key: "line",
                      header: "Line",
                      className: "w-20",
                      render: (err) => (
                        <span className="font-mono text-[12px] font-medium text-sienna tabular-nums">
                          Line {err.line_number}
                        </span>
                      ),
                    },
                    {
                      key: "error",
                      header: "Reason",
                      render: (err) => (
                        <span className="text-[12.5px] text-ink">{err.error}</span>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
