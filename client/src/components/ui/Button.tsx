"use client";

import React from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-warwick-700 text-white hover:bg-warwick-800 shadow-sm focus-visible:ring-warwick-600",
  secondary:
    "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm focus-visible:ring-warwick-600",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 shadow-sm focus-visible:ring-rose-500",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm focus-visible:ring-emerald-500",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-3.5 py-2 text-sm gap-2 rounded-lg",
  lg: "px-4 py-2.5 text-sm gap-2 rounded-xl",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
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
      className={`inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
      {children}
    </button>
  );
}
