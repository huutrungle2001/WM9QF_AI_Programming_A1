import React from "react";
import { Shield } from "lucide-react";
import type { FairnessRow } from "@/types";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatNumber } from "@/lib/format";

interface FairnessTableProps {
  rows: FairnessRow[];
}

export function FairnessTable({ rows }: FairnessTableProps) {
  const suppressedRow = rows.find((r) => r.is_suppressed);

  const columns: Column<FairnessRow>[] = [
    {
      key: "course",
      header: "Course Cohort",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span
            className={
              row.is_suppressed ? "font-semibold text-sienna" : "font-medium text-ink"
            }
          >
            {row.course}
          </span>
          {row.is_suppressed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blush px-2 py-0.5 text-[11px] font-medium text-sienna">
              <Shield className="h-3 w-3" />
              k &gt;= 5 merged
            </span>
          )}
        </div>
      ),
    },
    {
      key: "unique_users",
      header: "Unique Students",
      align: "right",
      render: (row) => (
        <span className="tabular-nums font-medium text-ink">
          {formatNumber(row.unique_users)}
        </span>
      ),
    },
    {
      key: "booking_count",
      header: "Bookings",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-slate-muted">
          {formatNumber(row.booking_count)}
        </span>
      ),
    },
    {
      key: "total_hours",
      header: "Total Hours",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-slate-muted">
          {row.total_hours.toFixed(1)}h
        </span>
      ),
    },
    {
      key: "avg_hours_per_user",
      header: "Avg Hours / User",
      align: "right",
      render: (row) => (
        <span className="tabular-nums font-semibold text-ink">
          {row.avg_hours_per_user.toFixed(2)}h
        </span>
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
            Course Access Fairness (k-Anonymity &gt;= 5)
          </h3>
          <p className="mt-0.5 text-[12.5px] text-slate-muted">
            Small cohorts with fewer than 5 unique students are automatically merged into{" "}
            <span className="font-mono text-[11.5px] text-ink">Other (&lt;5)</span> to prevent re-identification.
          </p>
        </div>
        {suppressedRow && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blush px-3 py-1 text-[12px] font-medium text-sienna tabular-nums">
            <Shield className="h-3.5 w-3.5" />
            {suppressedRow.unique_users} students protected in {suppressedRow.course}
          </span>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.course}
        rowClassName={(row) => (row.is_suppressed ? "bg-blush/35" : "")}
        emptyMessage="No course fairness records available."
      />
    </section>
  );
}
