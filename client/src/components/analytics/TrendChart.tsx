"use client";

import React, { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import type { TrendPoint } from "@/types";
import { Badge } from "@/components/ui/Badge";

interface TrendChartProps {
  points: TrendPoint[];
}

export function TrendChart({ points }: TrendChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const { maxCount, peakIndex } = useMemo(() => {
    let max = 0;
    let pIdx = -1;
    points.forEach((pt, idx) => {
      if (pt.booking_count > max) {
        max = pt.booking_count;
        pIdx = idx;
      }
    });
    return { maxCount: Math.max(max, 1), peakIndex: pIdx };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-card">
        No weekly trend data available yet.
      </div>
    );
  }

  const svgWidth = 680;
  const svgHeight = 250;
  const padLeft = 42;
  const padRight = 20;
  const padTop = 26;
  const padBottom = 38;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;
  const stepX = chartW / points.length;
  const barW = Math.min(44, Math.max(18, stepX * 0.56));

  const yFor = (val: number) => padTop + chartH - (val / maxCount) * chartH;
  const xCenter = (idx: number) => padLeft + stepX * idx + stepX / 2;

  const linePath = points
    .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${xCenter(idx).toFixed(1)} ${yFor(pt.booking_count).toFixed(1)}`)
    .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(maxCount * r));
  const selected = activeIdx !== null ? points[activeIdx] : peakIndex >= 0 ? points[peakIndex] : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Weekly Booking Trends & Pressure Peak
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Weekly booking volume and total reserved hours across the teaching term
          </p>
        </div>
        {peakIndex >= 0 && (
          <Badge tone="plum">
            <TrendingUp className="h-3 w-3" />
            Peak Week: {points[peakIndex].week_label} ({points[peakIndex].booking_count} bookings)
          </Badge>
        )}
      </div>

      {/* Selected / Peak Readout */}
      {selected && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 px-3.5 py-2 text-xs border border-slate-100 tabular-nums">
          <span className="font-semibold text-slate-900">
            {activeIdx !== null ? "Selected:" : "Peak:"} {selected.week_label}
          </span>
          <span className="text-slate-600">
            Bookings: <strong className="text-warwick-800">{selected.booking_count}</strong>
          </span>
          <span className="text-slate-600">
            Hours: <strong className="text-slate-900">{selected.total_hours.toFixed(1)}h</strong>
          </span>
          <span className="text-slate-600">
            Cancelled: <strong className="text-rose-700">{selected.cancelled_count}</strong>
          </span>
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[480px]"
          role="img"
          aria-label="Weekly booking trends chart"
        >
          {/* Horizontal grid lines */}
          {yTicks.map((tick, idx) => {
            const y = yFor(tick);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  x2={svgWidth - padRight}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={tick === 0 ? undefined : "3 3"}
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {points.map((pt, idx) => {
            const isPeak = idx === peakIndex;
            const isActive = idx === activeIdx;
            const x = xCenter(idx) - barW / 2;
            const y = yFor(pt.booking_count);
            const h = Math.max(2, padTop + chartH - y);
            const cancelH =
              pt.cancelled_count > 0
                ? Math.max(2, (pt.cancelled_count / maxCount) * chartH)
                : 0;

            return (
              <g
                key={pt.week_label}
                className="cursor-pointer"
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={6}
                  className={
                    isPeak
                      ? "fill-warwick-600 transition-colors"
                      : isActive
                        ? "fill-indigo-400 transition-colors"
                        : "fill-warwick-200 hover:fill-warwick-300 transition-colors"
                  }
                />
                {cancelH > 0 && (
                  <rect
                    x={x}
                    y={padTop + chartH - cancelH}
                    width={barW}
                    height={cancelH}
                    rx={3}
                    className="fill-rose-400/75"
                  />
                )}
                <text
                  x={xCenter(idx)}
                  y={y - 7}
                  textAnchor="middle"
                  className={`text-[10px] font-semibold ${
                    isPeak ? "fill-warwick-800" : "fill-slate-600"
                  }`}
                >
                  {pt.booking_count}
                </text>
                <text
                  x={xCenter(idx)}
                  y={svgHeight - 14}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {pt.week_label}
                </text>
              </g>
            );
          })}

          {/* Overlay Trend Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#3b1f44"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none"
          />
          {points.map((pt, idx) => (
            <circle
              key={`dot-${pt.week_label}`}
              cx={xCenter(idx)}
              cy={yFor(pt.booking_count)}
              r={idx === peakIndex ? 4.5 : 3}
              className={
                idx === peakIndex
                  ? "fill-white stroke-warwick-800 stroke-[2.5] pointer-events-none"
                  : "fill-warwick-700 pointer-events-none"
              }
            />
          ))}
        </svg>
      </div>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warwick-200" />
          Weekly Bookings
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warwick-600" />
          Exam Pressure Peak
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-400/80" />
          Cancelled Share
        </span>
      </div>
    </div>
  );
}
