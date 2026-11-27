"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Lock, RefreshCw } from "lucide-react";
import {
  RESOURCE_TYPE_SINGULAR,
  type CancellationBreakdown,
  type ChartExportResult,
  type DemandItem,
  type FairnessRow,
  type HeatmapCell,
  type OverviewKPI,
  type TrendPoint,
} from "@/types";
import {
  generateCharts,
  getCancellations,
  getDemand,
  getFairness,
  getHeatmap,
  getOverview,
  getTrends,
} from "@/lib/analytics.api";
import { ApiError } from "@/lib/api-client";
import { formatNumber, formatPercent } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { KpiGrid } from "@/components/analytics/KpiGrid";
import { TrendChart } from "@/components/analytics/TrendChart";
import { DemandHeatmap } from "@/components/analytics/DemandHeatmap";
import { FairnessTable } from "@/components/analytics/FairnessTable";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

export default function AdminOverviewPage() {
  const { actor, actorHeadersContext, canViewAnalytics, isRedactedRole } = useActor();

  const [overview, setOverview] = useState<OverviewKPI | null>(null);
  const [demand, setDemand] = useState<{
    top_booked: DemandItem[];
    underused: DemandItem[];
  }>({ top_booked: [], underused: [] });
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [cancellations, setCancellations] = useState<CancellationBreakdown[]>([]);
  const [cancelDim, setCancelDim] = useState<"resource_type" | "department_id">(
    "resource_type"
  );
  const [fairness, setFairness] = useState<FairnessRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ChartExportResult | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (!canViewAnalytics) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ov, dem, hm, tr, canc, fair] = await Promise.all([
        getOverview(actorHeadersContext),
        getDemand(actorHeadersContext, 8),
        getHeatmap(actorHeadersContext),
        getTrends(actorHeadersContext),
        getCancellations(actorHeadersContext, cancelDim),
        getFairness(actorHeadersContext),
      ]);
      setOverview(ov);
      setDemand(dem);
      setHeatmap(hm);
      setTrends(tr);
      setCancellations(canc);
      setFairness(fair);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Unable to load analytics."
      );
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext, canViewAnalytics, cancelDim]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics, actor.id]);

  const handleExportCharts = async () => {
    setExporting(true);
    setError(null);
    setExportResult(null);
    try {
      const result = await generateCharts(actorHeadersContext);
      setExportResult(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Failed to export PNG charts."
      );
    } finally {
      setExporting(false);
    }
  };

  if (!canViewAnalytics) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Admin Console access required"
        description="Switch to Admin, Manager, or Student Services in the role switcher to inspect campus analytics and fairness metrics."
        action={
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper"
          >
            Return to Explorer
          </Link>
        }
      />
    );
  }

  const demandColumns: Column<DemandItem>[] = [
    {
      key: "resource",
      header: "Resource",
      render: (item) => (
        <div className="min-w-0">
          <Link
            href={`/resources/${encodeURIComponent(item.resource_id)}`}
            className="font-medium text-ink hover:underline underline-offset-4 block truncate"
          >
            {item.resource_name}
          </Link>
          <span className="font-mono text-[11px] text-ash">
            {item.resource_id} · {item.department_id}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (item) => (
        <span className="text-[12.5px] text-slate-muted">
          {RESOURCE_TYPE_SINGULAR[item.resource_type]}
        </span>
      ),
    },
    {
      key: "bookings",
      header: "Bookings",
      align: "right",
      render: (item) => (
        <span className="font-semibold text-ink tabular-nums">
          {formatNumber(item.booking_count)}
        </span>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      render: (item) => (
        <span className="text-slate-muted tabular-nums">
          {item.total_hours.toFixed(1)}h
        </span>
      ),
    },
  ];

  const cancellationColumns: Column<CancellationBreakdown>[] = [
    {
      key: "label",
      header: cancelDim === "resource_type" ? "Resource Type" : "Department",
      render: (row) => (
        <span className="font-medium text-ink">
          {cancelDim === "resource_type" && row.label in RESOURCE_TYPE_SINGULAR
            ? RESOURCE_TYPE_SINGULAR[row.label as keyof typeof RESOURCE_TYPE_SINGULAR]
            : row.label}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-ink">{formatNumber(row.total_bookings)}</span>
      ),
    },
    {
      key: "cancelled",
      header: "Cancelled",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-slate-muted">
          {formatNumber(row.cancelled_count)} ({formatPercent(row.cancellation_rate)})
        </span>
      ),
    },
    {
      key: "rejected",
      header: "Rejected",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-slate-muted">
          {formatNumber(row.rejected_count)}
        </span>
      ),
    },
    {
      key: "no_show",
      header: "No-Show",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-sienna font-medium">
          {formatNumber(row.no_show_count)} ({formatPercent(row.no_show_rate)})
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-hairline pb-5">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
            Overview &amp; Analytics
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-muted">
            {isRedactedRole
              ? "Read-only utilisation, demand patterns, and k >= 5 course fairness reporting."
              : "Campus-wide utilisation KPIs, weekly demand pressure, cancellations, and fairness metrics."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            shape="pill"
            onClick={() => void loadAnalytics()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            shape="pill"
            loading={exporting}
            onClick={() => void handleExportCharts()}
          >
            <Download className="h-3.5 w-3.5" />
            Export PNG Charts
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadAnalytics()} />}

      {exportResult && (
        <div className="rounded-[16px] border border-hairline bg-mist p-4 text-[13px] text-ink">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Exported {exportResult.generated_files.length} PNG charts to{" "}
            <span className="font-mono text-[12px]">{exportResult.output_dir}</span>
          </div>
          {exportResult.generated_files.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {exportResult.generated_files.map((file) => (
                <span
                  key={file}
                  className="rounded-full bg-paper border border-hairline px-2.5 py-0.5 font-mono text-[11px] text-slate-muted"
                >
                  {file}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && !overview ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-28 rounded-[16px] bg-mist/70" />
            ))}
          </div>
          <div className="h-72 rounded-[16px] bg-mist/70" />
        </div>
      ) : (
        <>
          {overview && <KpiGrid overview={overview} />}

          <TrendChart points={trends} />
          <DemandHeatmap cells={heatmap} />

          {/* Top Booked vs Underused */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
                Most Booked Resources
              </h2>
              <DataTable
                columns={demandColumns}
                rows={demand.top_booked}
                rowKey={(item) => `top-${item.resource_id}`}
                emptyMessage="No top-booked demand data."
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
                Underused Resources
              </h2>
              <DataTable
                columns={demandColumns}
                rows={demand.underused}
                rowKey={(item) => `under-${item.resource_id}`}
                emptyMessage="No underused resources found."
              />
            </section>
          </div>

          {/* Cancellation Breakdown */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
                  Cancellation &amp; No-Show Breakdown
                </h2>
                <p className="mt-0.5 text-[12.5px] text-slate-muted">
                  Distinguishes manager rejections from user cancellations and no-shows.
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-mist p-1">
                {(
                  [
                    { id: "resource_type", label: "By Resource Type" },
                    { id: "department_id", label: "By Department" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setCancelDim(d.id)}
                    className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                      cancelDim === d.id
                        ? "bg-paper text-ink shadow-attio-card"
                        : "text-slate-muted hover:text-ink"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <DataTable
              columns={cancellationColumns}
              rows={cancellations}
              rowKey={(c) => `${c.dimension}-${c.label}`}
              emptyMessage="No cancellation breakdown data."
            />
          </section>

          {/* Course Fairness (k >= 5) */}
          <FairnessTable rows={fairness} />
        </>
      )}
    </div>
  );
}
