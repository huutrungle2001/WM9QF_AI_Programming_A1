import React from "react";
import type { OverviewKPI } from "@/types";
import { formatNumber, formatPercent } from "@/lib/format";

interface KpiGridProps {
  overview: OverviewKPI;
}

export function KpiGrid({ overview }: KpiGridProps) {
  const cards = [
    {
      label: "Total bookings",
      value: formatNumber(overview.total_bookings),
      detail: `${formatNumber(overview.confirmed_bookings)} confirmed · ${formatNumber(overview.completed_bookings)} completed`,
      warm: false,
    },
    {
      label: "Active utilisation",
      value: formatPercent(overview.active_rate),
      detail: `${formatNumber(overview.active_bookings)} active blocking slots`,
      warm: false,
    },
    {
      label: "Pending approvals",
      value: formatNumber(overview.pending_bookings),
      detail: "Awaiting departmental sign-off",
      warm: overview.pending_bookings > 0,
    },
    {
      label: "Cancellation rate",
      value: formatPercent(overview.cancellation_rate),
      detail: `${formatNumber(overview.cancelled_bookings)} cancelled · ${formatPercent(overview.no_show_rate)} no-show`,
      warm: false,
    },
    {
      label: "Active catalogue",
      value: formatNumber(overview.active_resources),
      detail: `of ${formatNumber(overview.total_resources)} resources · ${formatNumber(overview.active_users)} users`,
      warm: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-[16px] border p-5 ${
            card.warm
              ? "border-transparent bg-blush text-sienna"
              : "border-hairline bg-paper text-ink"
          }`}
        >
          <p
            className={`text-[12.5px] font-medium ${
              card.warm ? "text-sienna/80" : "text-slate-muted"
            }`}
          >
            {card.label}
          </p>
          <p className="mt-2 font-sans text-[28px] font-semibold leading-none tracking-[-0.025em] tabular-nums">
            {card.value}
          </p>
          <p
            className={`mt-2.5 text-[12px] leading-snug tabular-nums ${
              card.warm ? "text-sienna/80" : "text-ash"
            }`}
          >
            {card.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
