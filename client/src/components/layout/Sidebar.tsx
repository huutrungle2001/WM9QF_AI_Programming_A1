"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CheckSquare,
  Compass,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useActor } from "@/hooks/useActor";
import { Badge } from "@/components/ui/Badge";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Discovery & Bookings",
    items: [
      {
        href: "/",
        label: "Resource Explorer",
        description: "Rooms, labs, equipment & support",
        icon: Compass,
      },
      {
        href: "/bookings",
        label: "Bookings",
        description: "Schedule, edit & cancel slots",
        icon: CalendarClock,
      },
    ],
  },
  {
    title: "Operations & Insights",
    items: [
      {
        href: "/approvals",
        label: "Approvals Queue",
        description: "Pending manager decisions",
        icon: CheckSquare,
        badge: "Mgr",
      },
      {
        href: "/analytics",
        label: "Analytics & Fairness",
        description: "Heatmap, trends & k>=5",
        icon: BarChart3,
      },
      {
        href: "/admin",
        label: "Admin & Catalogue",
        description: "Resources, CSV import & users",
        icon: Settings2,
        badge: "Admin",
      },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { actor, isRedactedRole } = useActor();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/resources/");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200">
        <Link href="/" className="flex items-center gap-2.5" onClick={onCloseMobile}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warwick-700 text-white shadow-sm">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-slate-900">
              Warwick Spaces
            </div>
            <div className="text-[11px] font-medium text-warwick-700">
              Learning Resources
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                      active
                        ? "bg-warwick-50 text-warwick-800 font-semibold ring-1 ring-warwick-200/80"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active
                          ? "text-warwick-700"
                          : "text-slate-400 group-hover:text-slate-600"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              active
                                ? "bg-warwick-100 text-warwick-800"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-normal text-slate-400 truncate">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3.5">
        <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Active Headers
            </span>
            {isRedactedRole && (
              <Badge tone="redacted" className="text-[10px]">
                PII Shield
              </Badge>
            )}
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-600">
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">X-Role</span>
              <span className="font-semibold text-warwick-800">{actor.role}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">X-User-Id</span>
              <span className="font-semibold text-slate-800">{actor.user_id ?? "—"}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">PolicyGuard RBAC enforced</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {navContent}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-slate-900/40 backdrop-blur-[1px]"
          onClick={onCloseMobile}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
