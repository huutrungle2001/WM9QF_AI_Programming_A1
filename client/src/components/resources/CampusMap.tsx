import React from "react";
import { Compass, ExternalLink, MapPin, Navigation } from "lucide-react";
import type { CampusZone } from "@/types";
import { Badge } from "@/components/ui/Badge";

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

  // Map Warwick coordinates (lat ~52.374..52.391, lon ~-1.572..-1.548) into a clean visual pin card
  const pinX = hasCoords
    ? Math.min(86, Math.max(14, ((lon - -1.572) / (-1.548 - -1.572)) * 100))
    : 50;
  const pinY = hasCoords
    ? Math.min(82, Math.max(18, (1 - (lat - 52.374) / (52.391 - 52.374)) * 100))
    : 50;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-warwick-700" />
          <span className="text-xs font-semibold text-slate-800">Campus Location</span>
        </div>
        {zone && <Badge tone="plum">{zone}</Badge>}
      </div>

      {/* Stylized Campus Coordinate Map Preview */}
      <div className="relative h-44 bg-gradient-to-br from-slate-50 via-warwick-50/30 to-indigo-50/40 overflow-hidden border-b border-slate-200">
        <svg
          className="absolute inset-0 h-full w-full text-slate-200/80"
          aria-hidden="true"
        >
          <defs>
            <pattern id="campus-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path
                d="M 28 0 L 0 0 0 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#campus-grid)" />
          <circle
            cx={`${pinX}%`}
            cy={`${pinY}%`}
            r="34"
            className="fill-warwick-500/10 stroke-warwick-400/40"
            strokeWidth="1"
          />
        </svg>

        <div
          style={{ left: `${pinX}%`, top: `${pinY}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warwick-700 text-white shadow-lg ring-4 ring-white">
            <MapPin className="h-4 w-4" />
          </div>
          <span className="mt-1.5 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 whitespace-nowrap max-w-[200px] truncate">
            {buildingName ?? location}
          </span>
        </div>

        <div className="absolute bottom-2.5 left-3 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[10px] text-slate-600 ring-1 ring-slate-200/80 tabular-nums">
          {hasCoords ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "Online / Virtual Venue"}
        </div>
      </div>

      {/* Building Metadata & Links */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[11px] text-slate-400">Building</div>
            <div className="mt-0.5 font-semibold text-slate-800">
              {buildingName ?? "Campus / Online"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Room / Counter</div>
            <div className="mt-0.5 font-medium text-slate-700">{location}</div>
          </div>
          {buildingId && (
            <div>
              <div className="text-[11px] text-slate-400">Building ID</div>
              <div className="mt-0.5 font-mono text-slate-600">{buildingId}</div>
            </div>
          )}
          <div>
            <div className="text-[11px] text-slate-400">Coordinates</div>
            <div className="mt-0.5 font-mono text-slate-600 tabular-nums">
              {hasCoords ? `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E` : "Not geo-pinned"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <a
            href={mazeMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-warwick-700 px-3 py-2 text-xs font-medium text-white hover:bg-warwick-800 transition-colors"
          >
            <Navigation className="h-3.5 w-3.5" />
            Open in MazeMap
          </a>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            OpenStreetMap
          </a>
        </div>
      </div>
    </div>
  );
}
