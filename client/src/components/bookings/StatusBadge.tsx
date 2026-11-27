import React from "react";
import { Shield } from "lucide-react";

const STATUS_META: Record<
  string,
  { label: string; dotClass: string; pillClass: string }
> = {
  confirmed: {
    label: "Confirmed",
    dotClass: "bg-ink",
    pillClass: "bg-mist text-ink border-transparent",
  },
  pending: {
    label: "Pending",
    dotClass: "bg-sienna",
    pillClass: "bg-blush/80 text-sienna border-transparent",
  },
  completed: {
    label: "Completed",
    dotClass: "bg-slate-muted",
    pillClass: "bg-fog text-slate-muted border-hairline",
  },
  cancelled: {
    label: "Cancelled",
    dotClass: "bg-ash",
    pillClass: "bg-paper text-ash border-hairline",
  },
  rejected: {
    label: "Rejected",
    dotClass: "bg-sienna/70",
    pillClass: "bg-paper text-sienna border-hairline",
  },
  no_show: {
    label: "No-Show",
    dotClass: "bg-sienna/70",
    pillClass: "bg-paper text-sienna border-hairline",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    dotClass: "bg-ash",
    pillClass: "bg-fog text-slate-muted border-hairline",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${meta.pillClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}

export function RedactedValue({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="text-ash">—</span>;
  }
  if (value === "[REDACTED]" || value.startsWith("ANON-")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[6px] bg-blush/80 px-2 py-0.5 font-mono text-[11.5px] font-medium text-sienna">
        <Shield className="h-3 w-3 shrink-0" />
        {value}
      </span>
    );
  }
  return <span>{value}</span>;
}
