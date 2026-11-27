"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { checkHealth, type HealthStatus } from "@/lib/api-client";
import { RoleSwitcher } from "./RoleSwitcher";

const ROUTE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Unified Resource Explorer",
    subtitle: "Discover and book Warwick study rooms, labs, equipment, and academic support",
  },
  "/bookings": {
    title: "Bookings",
    subtitle: "Role-scoped reservations, status lifecycle, and rescheduling",
  },
  "/approvals": {
    title: "Approvals Queue",
    subtitle: "Review pending requests requiring departmental or manager sign-off",
  },
  "/analytics": {
    title: "Analytics & Fairness",
    subtitle: "Utilisation KPIs, peak demand heatmap, semester trends & k>=5 privacy reporting",
  },
  "/admin": {
    title: "Admin & Catalogue",
    subtitle: "Polymorphic resource creation, CSV batch import, users & departments",
  },
};

interface NavbarProps {
  onOpenMobile: () => void;
}

export function Navbar({ onOpenMobile }: NavbarProps) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const probe = useCallback(async () => {
    setChecking(true);
    const result = await checkHealth();
    setHealth(result);
    setChecking(false);
  }, []);

  useEffect(() => {
    void probe();
    const timer = window.setInterval(() => {
      void probe();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [probe]);

  const meta = pathname.startsWith("/resources/")
    ? {
        title: "Resource Detail",
        subtitle: "Metadata, room panorama preview, campus coordinates & booking",
      }
    : (ROUTE_TITLES[pathname] ?? {
        title: "Campus Learning Resources",
        subtitle: "University of Warwick Booking Platform",
      });

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobile}
          className="lg:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
            {meta.title}
          </h1>
          <p className="hidden md:block text-xs text-slate-500 truncate">
            {meta.subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => void probe()}
          title="Check FastAPI /health connectivity"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
            health === null
              ? "bg-slate-100 text-slate-600 ring-slate-200"
              : health.ok
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100/70"
                : "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100/70"
          }`}
        >
          {checking ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : health?.ok ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">
            {health === null
              ? "Checking API"
              : health.ok
                ? `API Online · ${health.latencyMs}ms`
                : "API Offline"}
          </span>
        </button>

        <RoleSwitcher />
      </div>
    </header>
  );
}
