"use client";

import React, { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import type { HeatmapCell } from "@/types";
import { Badge } from "@/components/ui/Badge";

const DEFAULT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DemandHeatmapProps {
  cells: HeatmapCell[];
}

function cellBgClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "bg-slate-100 text-slate-300";
  const ratio = count / max;
  if (ratio < 0.2) return "bg-warwick-100 text-warwick-800";
  if (ratio < 0.4) return "bg-warwick-200 text-warwick-900";
  if (ratio < 0.6) return "bg-warwick-400 text-white";
  if (ratio < 0.8) return "bg-warwick-600 text-white";
  return "bg-warwick-800 text-white";
}

export function DemandHeatmap({ cells }: DemandHeatmapProps) {
  const [hovered, setHovered] = useState<{
    dayName: string;
    hour: number;
    count: number;
  } | null>(null);

  const { matrix, maxCount, peakCell, totalCount, dayNames } = useMemo(() => {
    const map = new Map<string, number>();
    const names = [...DEFAULT_DAYS];
    let max = 0;
    let total = 0;
    let peak: { dayName: string; hour: number; count: number } | null = null;

    for (const c of cells) {
      if (c.day_of_week >= 0 && c.day_of_week <= 6 && c.day_name) {
        names[c.day_of_week] = c.day_name.slice(0, 3);
      }
      const key = `${c.day_of_week}-${c.hour}`;
      map.set(key, c.booking_count);
      total += c.booking_count;
      if (c.booking_count > max) {
        max = c.booking_count;
        peak = {
          dayName: c.day_name || names[c.day_of_week] || `Day ${c.day_of_week}`,
          hour: c.hour,
          count: c.booking_count,
        };
      }
    }

    return {
      matrix: map,
      maxCount: max,
      peakCell: peak,
      totalCount: total,
      dayNames: names,
    };
  }, [cells]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            7 × 24 Demand Heatmap
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Booking starts distributed across weekday and UTC hour slots ({totalCount} total slots)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {peakCell && peakCell.count > 0 && (
            <Badge tone="plum">
              <Flame className="h-3 w-3" />
              Peak: {peakCell.dayName} {String(peakCell.hour).padStart(2, "0")}:00 ({peakCell.count})
            </Badge>
          )}
        </div>
      </div>

      {/* Live Hover Callout */}
      <div className="mb-3 flex items-center justify-between text-xs min-h-[24px]">
        <div className="text-slate-600 tabular-nums">
          {hovered ? (
            <span>
              <strong className="text-slate-900">
                {hovered.dayName} · {String(hovered.hour).padStart(2, "0")}:00–
                {String((hovered.hour + 1) % 24).padStart(2, "0")}:00 UTC
              </strong>
              : <strong className="text-warwick-700">{hovered.count}</strong>{" "}
              {hovered.count === 1 ? "booking" : "bookings"}
            </span>
          ) : (
            <span className="text-slate-400">
              Hover any hour cell to inspect exact slot demand.
            </span>
          )}
        </div>

        {/* Intensity Legend */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>Low</span>
          <span className="h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-200" />
          <span className="h-3 w-3 rounded bg-warwick-100" />
          <span className="h-3 w-3 rounded bg-warwick-200" />
          <span className="h-3 w-3 rounded bg-warwick-400" />
          <span className="h-3 w-3 rounded bg-warwick-600" />
          <span className="h-3 w-3 rounded bg-warwick-800" />
          <span>Peak</span>
        </div>
      </div>

      {/* 7x24 Responsive Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          {/* Hour Header */}
          <div className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1 mb-1.5">
            <div />
            {HOURS.map((h) => (
              <div
                key={h}
                className="text-center font-mono text-[10px] text-slate-400 tabular-nums"
              >
                {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
              </div>
            ))}
          </div>

          {/* Day Rows */}
          <div className="space-y-1">
            {dayNames.map((dayName, dayIdx) => (
              <div
                key={dayIdx}
                className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1 items-center"
              >
                <div className="text-xs font-medium text-slate-600 pr-2 text-right">
                  {dayName}
                </div>
                {HOURS.map((hour) => {
                  const count = matrix.get(`${dayIdx}-${hour}`) ?? 0;
                  const isHovered =
                    hovered?.dayName === dayName && hovered?.hour === hour;
                  return (
                    <button
                      key={hour}
                      type="button"
                      onMouseEnter={() => setHovered({ dayName, hour, count })}
                      onFocus={() => setHovered({ dayName, hour, count })}
                      onMouseLeave={() => setHovered(null)}
                      aria-label={`${dayName} ${String(hour).padStart(2, "0")}:00 - ${count} bookings`}
                      className={`h-7 rounded-md text-[10px] font-semibold tabular-nums flex items-center justify-center transition-transform ${cellBgClass(
                        count,
                        maxCount
                      )} ${
                        isHovered
                          ? "scale-110 ring-2 ring-warwick-900 z-10 shadow-sm"
                          : "hover:ring-1 hover:ring-warwick-500"
                      }`}
                    >
                      {count > 0 ? count : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
