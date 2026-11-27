import React from "react";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import type { CampusZone } from "@/types";

interface CampusMapProps {
  buildingName?: string | null;
  buildingId?: string | null;
  location: string;
  zone?: CampusZone | null;
  lat?: number | null;
  lon?: number | null;
}

export function CampusMap({
  buildingName,
  buildingId,
  location,
  zone,
  lat,
  lon,
}: CampusMapProps) {
  const hasCoords = typeof lat === "number" && typeof lon === "number";

  const mazeMapUrl = hasCoords
    ? `https://use.mazemap.com/#v=1&campusid=195&center=${lon},${lat}&zoom=18`
    : `https://use.mazemap.com/#v=1&campusid=195&search=${encodeURIComponent(buildingName ?? location)}`;

  const osmUrl = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`
    : "https://www.openstreetmap.org/?mlat=52.3833&mlon=-1.5608#map=16/52.3833/-1.5608";

  const pinX = hasCoords
    ? Math.min(86, Math.max(14, ((lon - -1.572) / (-1.548 - -1.572)) * 100))
    : 50;
  const pinY = hasCoords
    ? Math.min(82, Math.max(18, (1 - (lat - 52.374) / (52.391 - 52.374)) * 100))
    : 50;

  return (
    <div className="rounded-[24px] border border-hairline bg-paper overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
        <span className="text-[13.5px] font-semibold text-ink">Campus Location</span>
        {zone && (
          <span className="text-[12px] font-medium text-slate-muted">{zone}</span>
        )}
      </div>

      <div className="relative h-44 bg-fog overflow-hidden border-b border-hairline">
        <svg
          className="absolute inset-0 h-full w-full text-hairline"
          aria-hidden="true"
        >
          <defs>
            <pattern id="campus-grid-v2" width="28" height="28" patternUnits="userSpaceOnUse">
              <path
                d="M 28 0 L 0 0 0 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#campus-grid-v2)" />
          <circle
            cx={`${pinX}%`}
            cy={`${pinY}%`}
            r="32"
            fill="rgba(23, 25, 28, 0.05)"
            stroke="rgba(23, 25, 28, 0.14)"
            strokeWidth="1"
          />
        </svg>

        <div
          style={{ left: `${pinX}%`, top: `${pinY}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper shadow-steep-subtle ring-4 ring-paper">
            <MapPin className="h-4 w-4" />
          </div>
          <span className="mt-1.5 rounded-full bg-paper px-2.5 py-0.5 text-[11.5px] font-medium text-ink border border-hairline whitespace-nowrap max-w-[220px] truncate">
            {buildingName ?? location}
          </span>
        </div>

        <div className="absolute bottom-3 left-4 rounded-full bg-paper px-2.5 py-0.5 font-mono text-[11px] text-slate-muted border border-hairline tabular-nums">
          {hasCoords ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "Online / Virtual"}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <div>
            <div className="text-[11.5px] text-ash">Building</div>
            <div className="mt-0.5 font-medium text-ink">
              {buildingName ?? "Online / Campus"}
            </div>
          </div>
          <div>
            <div className="text-[11.5px] text-ash">Room / Counter</div>
            <div className="mt-0.5 font-medium text-ink">{location}</div>
          </div>
          {buildingId && (
            <div>
              <div className="text-[11.5px] text-ash">Building ID</div>
              <div className="mt-0.5 font-mono text-[12px] text-slate-muted">
                {buildingId}
              </div>
            </div>
          )}
          <div>
            <div className="text-[11.5px] text-ash">Coordinates</div>
            <div className="mt-0.5 font-mono text-[12px] text-slate-muted tabular-nums">
              {hasCoords ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : "Not geo-pinned"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-3 border-t border-hairline">
          <a
            href={mazeMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-ink/85 transition-colors"
          >
            <Navigation className="h-3.5 w-3.5" />
            Open in MazeMap
          </a>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-hairline bg-paper px-4 py-2 text-[13px] font-medium text-ink hover:bg-fog transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            OpenStreetMap
          </a>
        </div>
      </div>
    </div>
  );
}
