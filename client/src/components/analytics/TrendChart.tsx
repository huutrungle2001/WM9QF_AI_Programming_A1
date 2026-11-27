"use client";

import React, { useMemo, useState } from "react";
import type { TrendPoint } from "@/types";

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
      <div className="rounded-[16px] border border-hairline bg-paper p-6 text-center text-[14px] text-slate-muted">
        No weekly trend data available yet.
      </div>
    );
  }

  const svgWidth = 700;
  const svgHeight = 250;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 24;
  const padBottom = 38;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;
  const stepX = chartW / points.length;
  const barW = Math.min(42, Math.max(16, stepX * 0.54));

  const yFor = (val: number) => padTop + chartH - (val / maxCount) * chartH;
  const xCenter = (idx: number) => padLeft + stepX * idx + stepX / 2;

  const linePath = points
    .map(
      (pt, idx) =>
        `${idx === 0 ? "M" : "L"} ${xCenter(idx).toFixed(1)} ${yFor(pt.booking_count).toFixed(1)}`
    )
    .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(maxCount * r));
  const selected =
    activeIdx !== null
      ? points[activeIdx]
      : peakIndex >= 0
        ? points[peakIndex]
        : null;

  return (
    <div className="rounded-[16px] border border-hairline bg-paper p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
            Weekly Booking Trends
          </h3>
          <p className="mt-0.5 text-[12.5px] text-slate-muted">
            Weekly booking volume and reserved hours across term
          </p>
        </div>
        {peakIndex >= 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blush px-3 py-1 text-[12px] font-medium text-sienna tabular-nums">
            Peak: {points[peakIndex].week_label} ({points[peakIndex].booking_count})
          </span>
        )}
      </div>

      {selected && (
        <div className="mb-4 flex flex-wrap items-center gap-5 rounded-[12px] bg-fog border border-hairline px-4 py-2.5 text-[12.5px] tabular-nums">
          <span className="font-semibold text-ink">
            {activeIdx !== null ? "Selected" : "Peak week"}: {selected.week_label}
          </span>
          <span className="text-slate-muted">
            Bookings: <strong className="font-semibold text-ink">{selected.booking_count}</strong>
          </span>
          <span className="text-slate-muted">
            Hours: <strong className="font-semibold text-ink">{selected.total_hours.toFixed(1)}h</strong>
          </span>
          <span className="text-slate-muted">
            Cancelled: <strong className="font-semibold text-sienna">{selected.cancelled_count}</strong>
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
          {yTicks.map((tick, idx) => {
            const y = yFor(tick);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  x2={svgWidth - padRight}
                  y1={y}
                  y2={y}
                  stroke="#ececec"
                  strokeDasharray={tick === 0 ? undefined : "3 3"}
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#979799"
                  fontSize="10.5"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Monochrome bars */}
          {points.map((pt, idx) => {
            const isPeak = idx === peakIndex;
            const isActive = idx === activeIdx;
            const x = xCenter(idx) - barW / 2;
            const y = yFor(pt.booking_count);
            const h = Math.max(2, padTop + chartH - y);
            const fill = isActive
              ? "#17191c"
              : isPeak
                ? "#d4d4d8"
                : "#f2f2f3";

            return (
              <g
                key={pt.week_label}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={6}
                  fill={fill}
                  stroke={isPeak || isActive ? "#17191c" : "#ececec"}
                  strokeWidth={isActive ? 1.2 : 1}
                />
                <text
                  x={xCenter(idx)}
                  y={svgHeight - 14}
                  textAnchor="middle"
                  fill={isPeak || isActive ? "#17191c" : "#777b86"}
                  fontSize="10.5"
                  fontWeight={isPeak || isActive ? 600 : 400}
                >
                  {pt.week_label}
                </text>
              </g>
            );
          })}

          {/* Sienna trend line */}
          <path
            d={linePath}
            fill="none"
            stroke="#5d2a1a"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {points.map((pt, idx) => {
            const isPeak = idx === peakIndex;
            const isActive = idx === activeIdx;
            return (
              <circle
                key={`pt-${pt.week_label}`}
                cx={xCenter(idx)}
                cy={yFor(pt.booking_count)}
                r={isPeak || isActive ? 4.5 : 3}
                fill={isPeak ? "#5d2a1a" : "#ffffff"}
                stroke="#5d2a1a"
                strokeWidth={2}
                pointerEvents="none"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
