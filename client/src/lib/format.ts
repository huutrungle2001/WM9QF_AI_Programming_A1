import type { ResourceType } from "@/types";

export function formatDateTime(epochSec: number): string {
  const date = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date) + " UTC";
}

export function formatShortDate(epochSec: number): string {
  const date = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatTimeRange(startSec: number, endSec: number): string {
  const start = new Date(startSec * 1000);
  const end = new Date(endSec * 1000);
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();

  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

  if (sameDay) {
    return `${formatShortDate(startSec)} · ${timeFmt.format(start)}–${timeFmt.format(end)} UTC`;
  }
  return `${formatShortDate(startSec)} ${timeFmt.format(start)} → ${formatShortDate(endSec)} ${timeFmt.format(end)} UTC`;
}

export function formatDuration(startSec: number, endSec: number): string {
  const diffSec = Math.max(0, endSec - startSec);
  const hours = diffSec / 3600;
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rem = Math.round((hours % 24) * 10) / 10;
    return `${days}d ${rem}h`;
  }
  if (Number.isInteger(hours)) {
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }
  const mins = Math.round(diffSec / 60);
  if (mins < 60) {
    return `${mins} min`;
  }
  return `${hours.toFixed(1)} hrs`;
}

export function epochToDateTimeLocal(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function dateTimeLocalToEpoch(value: string): number {
  if (!value) return 0;
  const iso = value.endsWith("Z") ? value : `${value}:00Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

export function defaultWindowForType(resourceType: ResourceType): {
  startLocal: string;
  endLocal: string;
} {
  // Default to next UTC hour, snapped cleanly for crisp demo UX
  const nowSec = Math.floor(Date.now() / 1000);
  const nextHourSec = Math.ceil(nowSec / 3600) * 3600 + 3600;
  const durationSec =
    resourceType === "specialist_equipment"
      ? 24 * 3600
      : resourceType === "academic_support"
        ? 3600
        : 2 * 3600;
  return {
    startLocal: epochToDateTimeLocal(nextHourSec),
    endLocal: epochToDateTimeLocal(nextHourSec + durationSec),
  };
}

export function formatPercent(value: number): string {
  // Backend rates may be 0..1 or 0..100; normalise cleanly
  const pct = value <= 1 && value >= 0 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
