import React from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { FairnessRow } from "@/types";
import { Badge } from "@/components/ui/Badge";

interface FairnessTableProps {
  rows: FairnessRow[];
}

export function FairnessTable({ rows }: FairnessTableProps) {
  const maxHours = Math.max(...rows.map((r) => r.total_hours), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Course Access Fairness & Equity
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Bookings and reserved hours per academic programme with k-anonymity small-cohort protection
          </p>
        </div>
        <Badge tone="plum">
          <ShieldCheck className="h-3.5 w-3.5" />
          k &ge; 5 Suppression Active
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Course / Cohort
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                Unique Users
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                Bookings
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Hours
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                Avg Hrs / User
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-44">
                Share
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                  No course fairness records available.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const suppressed =
                  row.is_suppressed || row.course.toLowerCase().includes("other (<5)");
                const barPct = Math.max(4, Math.round((row.total_hours / maxHours) * 100));

                return (
                  <tr
                    key={row.course}
                    className={
                      suppressed
                        ? "bg-fuchsia-50/40 hover:bg-fuchsia-50/70"
                        : "hover:bg-slate-50/80"
                    }
                  >
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{row.course}</span>
                        {suppressed && (
                          <Badge tone="redacted" className="text-[10px]">
                            <ShieldAlert className="h-3 w-3" />
                            k&lt;5 Suppressed Cohort
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-700 font-medium">
                      {row.unique_users}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">
                      {row.booking_count}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-900">
                      {row.total_hours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-warwick-800 font-semibold">
                      {row.avg_hours_per_user.toFixed(2)}h
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          style={{ width: `${barPct}%` }}
                          className={`h-full rounded-full ${
                            suppressed ? "bg-fuchsia-500" : "bg-warwick-600"
                          }`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
