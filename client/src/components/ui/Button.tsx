"use client";

import React from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "blush" | "danger" | "success";
type Size = "sm" | "md" | "lg";
type Shape = "pill" | "compact";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-ink text-paper hover:bg-ink/85 focus-visible:ring-ink",
  secondary:
    "bg-paper text-ink border border-hairline hover:bg-fog hover:border-smoke/60 focus-visible:ring-ink",
  outline:
    "bg-transparent text-ink border border-ink hover:bg-ink hover:text-paper focus-visible:ring-ink",
  ghost:
    "bg-transparent text-slate-muted hover:bg-mist hover:text-ink focus-visible:ring-ink",
  blush:
    "bg-blush text-sienna hover:bg-blush/80 focus-visible:ring-sienna",
  danger:
    "bg-blush text-sienna hover:bg-blush/80 focus-visible:ring-sienna",
  success:
    "bg-ink text-paper hover:bg-ink/85 focus-visible:ring-ink",
};

const SIZE_CLASSES: Record<Size, Record<Shape, string>> = {
  sm: {
    pill: "px-3.5 py-1.5 text-[13px] gap-1.5 rounded-full",
    compact: "px-2.5 py-1.5 text-[12.5px] gap-1.5 rounded-[10px]",
  },
  md: {
    pill: "px-5 py-2.5 text-[14px] gap-2 rounded-full",
    compact: "px-3.5 py-2 text-[13.5px] gap-2 rounded-[10px]",
  },
  lg: {
    pill: "px-6 py-3 text-[15px] gap-2 rounded-full",
    compact: "px-4 py-2.5 text-[14px] gap-2 rounded-[10px]",
  },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  shape = "pill",
  loading = false,
  disabled,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-45 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size][shape]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
      {children}
    </button>
  );
}
