import React from "react";

export type BadgeTone =
  | "plum"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "redacted";

const TONE_CLASSES: Record<BadgeTone, string> = {
  plum: "bg-warwick-50 text-warwick-800 ring-warwick-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  redacted: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300 font-mono",
};

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = "slate", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
