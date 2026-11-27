"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  Lock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
import { formatPercent } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { KpiGrid } from "@/components/analytics/KpiGrid";
import { DemandHeatmap } from "@/components/analytics/DemandHeatmap";
import { TrendChart } from "@/components/analytics/TrendChart";
import { FairnessTable } from "@/components/analytics/FairnessTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";

type CancellationDim = "resource_type" | "department_id";

export default function AnalyticsPage() {
  const { actor, actorHeadersContext, canViewAnalytics } = useActor();

  const [overview, setOverview] = useState<OverviewKPI | null>(null);
  const [demand, setDemand] = useState<{ top_booked: DemandItem[]; underused: DemandItem[] }>({
    top_booked: [],
    underused: [],
  });
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [cancellations, setCancellations] = useState<CancellationBreakdown[]>([]);
  const [fairness, setFairness] = useState<FairnessRow[]>([]);
  const [cancelDim, setCancelDim] = useState<CancellationDim>("resource_type");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ChartExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, dm, hm, tr, cn, fr] = await Promise.all([
        getOverview(actorHeadersContext),
        getDemand(actorHeadersContext, 10),
        getHeatmap(actorHeadersContext),
        getTrends(actorHeadersContext),
        getCancellations(actorHeadersContext, cancelDim),
        getFairness(actorHeadersContext),
      ]);
      setOverview(ov);
      setDemand(dm);
      setHeatmap(hm);
      setTrends(tr);
      setCancellations(cn);
      setFairness(fr);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Unable to load analytics dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext, cancelDim]);

  useEffect(() => {
    if (canViewAnalytics) {
      void loadAnalytics();
    }
  }, [canViewAnalytics, loadAnalytics, actor.id]);

  const handleExportCharts = async () => {
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const res = await generateCharts(actorHeadersContext);
      setExportResult(res);
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Chart export failed."
      );
    } finally {
      setExporting(false);
    }
  };

  if (!canViewAnalytics) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Analytics Restricted to Operational & Student Services Roles"
        description={`You are signed in as ${actor.label} (${actor.role}). Switch to Admin (ADMIN1), Library Manager (MGR-LIB), or Student Services (SS1) in the top bar to inspect utilisation KPIs, peak heatmaps, and k>=5 fairness analytics.`}
      />
    );
  }

  const demandColumns: Column<DemandItem>[] = [
    {
      key: "resource",
      header: "Resource",
      render: (item) => (
        <div>
          <div className="font-semibold text-slate-900 text-xs">{item.resource_name}</div>
          <div className="font-mono text-[11px] text-slate-400">
            {item.resource_id} · {item.department_id}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (item) => (
        <Badge tone="slate" className="text-[10px]">
          {RESOURCE_TYPE_SINGULAR[item.resource_type]}
        </Badge>
      ),
    },
    {
      key: "bookings",
      header: "Bookings",
      align: "right",
      render: (item) => (
        <span className="font-semibold tabular-nums text-slate-900">
          {item.booking_count}
        </span>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      render: (item) => (
        <span className="tabular-nums text-slate-600">{item.total_hours.toFixed(1)}h</span>
      ),
    },
  ];

  const cancellationColumns: Column<CancellationBreakdown>[] = [
    {
      key: "label",
      header: cancelDim === "resource_type" ? "Resource Type" : "Department",
      render: (c) => <span className="font-semibold text-slate-900">{c.label}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (c) => <span className="tabular-nums">{c.total_bookings}</span>,
    },
    {
      key: "cancelled",
      header: "Cancelled",
      align: "right",
      render: (c) => <span className="tabular-nums text-amber-700 font-medium">{c.cancelled_count}</span>,
    },
    {
      key: "rejected",
      header: "Rejected",
      align: "right",
      render: (c) => <span className="tabular-nums text-slate-600">{c.rejected_count}</span>,
    },
    {
      key: "no_show",
      header: "No-Show",
      align: "right",
      render: (c) => <span className="tabular-nums text-rose-700 font-medium">{c.no_show_count}</span>,
    },
    {
      key: "cancel_rate",
      header: "Cancel Rate",
      align: "right",
      render: (c) => (
        <Badge tone="amber" className="tabular-nums">
          {formatPercent(c.cancellation_rate)}
        </Badge>
      ),
    },
    {
      key: "noshow_rate",
      header: "No-Show Rate",
      align: "right",
      render: (c) => (
        <Badge tone="rose" className="tabular-nums">
          {formatPercent(c.no_show_rate)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Campus Utilisation & Fairness Overview
          </h2>
          <p className="text-xs text-slate-500">
            Live SQL aggregations supporting Learning Resources Manager & Student Services decisions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void loadAnalytics()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={exporting}
            onClick={() => void handleExportCharts()}
          >
            <Download className="h-3.5 w-3.5" />
            Export PNG Charts
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadAnalytics()} />}
      {exportError && <ErrorBanner message={exportError} />}
      {exportResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Exported {exportResult.generated_files.length} Matplotlib PNG charts to{" "}
            <span className="font-mono">{exportResult.output_dir}</span>
          </div>
          {exportResult.generated_files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {exportResult.generated_files.map((file) => (
                <span
                  key={file}
                  className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-emerald-800 ring-1 ring-emerald-200"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-28 rounded-2xl bg-white border border-slate-200" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-white border border-slate-200" />
        </div>
      ) : (
        <>
          {overview && <KpiGrid overview={overview} />}

          {/* Weekly Trend & 7x24 Heatmap */}
          <TrendChart points={trends} />
          <DemandHeatmap cells={heatmap} />

          {/* Top Booked vs Underused Tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-warwick-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Most Booked Resources
                </h3>
              </div>
              <DataTable
                columns={demandColumns}
                rows={demand.top_booked}
                rowKey={(item) => `top-${item.resource_id}`}
                emptyMessage="No top-booked demand data available."
              />
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Underused / Zero-Booking Resources
                </h3>
              </div>
              <DataTable
                columns={demandColumns}
                rows={demand.underused}
                rowKey={(item) => `under-${item.resource_id}`}
                emptyMessage="No underused resources found."
              />
            </section>
          </div>

          {/* Cancellation & No-Show Breakdown */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Cancellation & No-Show Breakdown
                </h3>
                <p className="text-xs text-slate-500">
                  Separate operational refusals (rejected) from user cancellations and no-shows
                </p>
              </div>
              <div className="flex gap-1">
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
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      cancelDim === d.id
                        ? "bg-warwick-700 text-white"
                        : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
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
              emptyMessage="No cancellation breakdown data available."
            />
          </section>

          {/* Course Fairness with k >= 5 Suppression */}
          <FairnessTable rows={fairness} />
        </>
      )}
    </div>
  );
}
