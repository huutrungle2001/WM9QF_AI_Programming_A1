import React from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarCheck2,
  Users,
} from "lucide-react";
import type { OverviewKPI } from "@/types";
import { formatNumber, formatPercent } from "@/lib/format";

interface KpiGridProps {
  overview: OverviewKPI;
}

export function KpiGrid({ overview }: KpiGridProps) {
  const cards = [
    {
      label: "Total Bookings",
      value: formatNumber(overview.total_bookings),
      sub: `${formatNumber(overview.completed_bookings)} completed · ${formatNumber(overview.pending_bookings)} pending`,
      icon: CalendarCheck2,
      accent: "bg-warwick-50 text-warwick-700 ring-warwick-200",
    },
    {
      label: "Active Utilisation Rate",
      value: formatPercent(overview.active_rate),
      sub: `${formatNumber(overview.active_bookings)} active (${formatNumber(overview.confirmed_bookings)} confirmed)`,
      icon: Activity,
      accent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    },
    {
      label: "Cancellation & No-Show",
      value: formatPercent(overview.cancellation_rate),
      sub: `No-show: ${formatPercent(overview.no_show_rate)} · Rejected: ${formatPercent(overview.rejection_rate)}`,
      icon: AlertTriangle,
      accent: "bg-amber-50 text-amber-700 ring-amber-200",
    },
    {
      label: "Active Resources",
      value: `${formatNumber(overview.active_resources)} / ${formatNumber(overview.total_resources)}`,
      sub: "5 resource types across Warwick campus",
      icon: Building2,
      accent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    },
    {
      label: "Active Campus Users",
      value: `${formatNumber(overview.active_users)} / ${formatNumber(overview.total_users)}`,
      sub: "UG, PG, PGR & Staff accounts",
      icon: Users,
      accent: "bg-slate-100 text-slate-700 ring-slate-200",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">{card.label}</span>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${card.accent}`}
              >
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {card.value}
              </div>
              <p className="mt-1 text-[11px] text-slate-500 leading-snug tabular-nums">
                {card.sub}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
