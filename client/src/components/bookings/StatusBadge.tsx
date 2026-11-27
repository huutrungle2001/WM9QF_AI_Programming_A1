import React from "react";
import { ShieldAlert } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  confirmed: { label: "Confirmed", tone: "emerald" },
  pending: { label: "Pending Approval", tone: "amber" },
  completed: { label: "Completed", tone: "indigo" },
  cancelled: { label: "Cancelled", tone: "slate" },
  rejected: { label: "Rejected", tone: "rose" },
  no_show: { label: "No-Show", tone: "rose" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "slate" as BadgeTone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function RedactedValue({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="text-slate-400">—</span>;
  }
  if (value === "[REDACTED]" || value.startsWith("ANON-")) {
    return (
      <Badge tone="redacted" className="text-[11px]">
        <ShieldAlert className="h-3 w-3 shrink-0" />
        {value}
      </Badge>
    );
  }
  return <span>{value}</span>;
}
