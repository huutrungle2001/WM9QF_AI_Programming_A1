import React from "react";

export type BadgeTone =
  | "ink"
  | "mist"
  | "outline"
  | "blush"
  | "subtle"
  | "redacted";

const TONE_CLASSES: Record<BadgeTone, string> = {
  ink: "bg-ink text-paper border-transparent",
  mist: "bg-mist text-ink border-transparent",
  outline: "bg-paper text-slate-muted border-hairline",
  blush: "bg-blush text-sienna border-transparent",
  subtle: "bg-fog text-slate-muted border-hairline",
  redacted: "bg-blush text-sienna border-transparent font-mono",
};

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = "mist", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5 ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
