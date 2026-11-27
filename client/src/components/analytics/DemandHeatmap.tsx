"use client";

import React, { useMemo, useState } from "react";
import type { HeatmapCell } from "@/types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DemandHeatmapProps {
  cells: HeatmapCell[];
}

function cellTone(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "bg-fog text-ash/60";
  const ratio = count / max;
  if (ratio <= 0.25) return "bg-mist text-ink";
  if (ratio <= 0.5) return "bg-smoke/45 text-ink";
  if (ratio <= 0.75) return "bg-blush text-sienna font-medium";
  if (ratio < 0.92) return "bg-sienna text-paper font-medium";
  return "bg-ink text-paper font-semibold";
}

export function DemandHeatmap({ cells }: DemandHeatmapProps) {
  const [hovered, setHovered] = useState<{
    day: string;
    hour: number;
    count: number;
  } | null>(null);

  const { grid, maxCount, peakCell } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    let peak: { day: string; hour: number; count: number } | null = null;

    for (const cell of cells) {
      const key = `${cell.day_of_week}-${cell.hour}`;
      map.set(key, cell.booking_count);
      if (cell.booking_count > max) {
        max = cell.booking_count;
        peak = {
          day: DAY_NAMES[cell.day_of_week] ?? cell.day_name,
          hour: cell.hour,
          count: cell.booking_count,
        };
      }
    }
    return { grid: map, maxCount: max, peakCell: peak };
  }, [cells]);

  const activeReadout = hovered ?? peakCell;

  return (
    <div className="rounded-[16px] border border-hairline bg-paper p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
            7 × 24 Demand Heatmap
          </h3>
          <p className="mt-0.5 text-[12.5px] text-slate-muted">
            Booking starts distributed across weekday and UTC hour
          </p>
        </div>

        {activeReadout && (
          <div className="rounded-full bg-mist px-3 py-1 text-[12px] font-medium text-ink tabular-nums">
            {hovered ? "Hovered" : "Peak"}: {activeReadout.day}{" "}
            {String(activeReadout.hour).padStart(2, "0")}:00 ·{" "}
            {activeReadout.count} bookings
          </div>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1 mb-1.5">
            <div />
            {HOURS.map((hr) => (
              <div
                key={hr}
                className="text-center font-mono text-[10px] text-ash tabular-nums"
              >
                {hr % 2 === 0 ? String(hr).padStart(2, "0") : ""}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {DAY_NAMES.map((day, dayIdx) => (
              <div
                key={day}
                className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1 items-center"
              >
                <span className="text-[11.5px] font-medium text-slate-muted">
                  {day}
                </span>
                {HOURS.map((hr) => {
                  const count = grid.get(`${dayIdx}-${hr}`) ?? 0;
                  return (
                    <button
                      key={hr}
                      type="button"
                      onMouseEnter={() => setHovered({ day, hour: hr, count })}
                      onMouseLeave={() => setHovered(null)}
                      title={`${day} ${String(hr).padStart(2, "0")}:00 — ${count} bookings`}
                      className={`h-7 rounded-[6px] text-[10.5px] tabular-nums transition-transform hover:scale-[1.06] ${cellTone(
                        count,
                        maxCount
                      )}`}
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

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-[11.5px] text-slate-muted">
        <span>Low</span>
        <span className="h-3.5 w-3.5 rounded-[4px] border border-hairline bg-fog" />
        <span className="h-3.5 w-3.5 rounded-[4px] bg-mist" />
        <span className="h-3.5 w-3.5 rounded-[4px] bg-smoke/45" />
        <span className="h-3.5 w-3.5 rounded-[4px] bg-blush" />
        <span className="h-3.5 w-3.5 rounded-[4px] bg-sienna" />
        <span className="h-3.5 w-3.5 rounded-[4px] bg-ink" />
        <span>Peak</span>
      </div>
    </div>
  );
}
