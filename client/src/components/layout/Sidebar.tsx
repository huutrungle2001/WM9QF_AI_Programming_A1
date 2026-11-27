"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookMarked,
  Boxes,
  CalendarClock,
  CheckSquare,
  Database,
  Users,
  X,
} from "lucide-react";
import { useActor } from "@/hooks/useActor";
import { listBookings } from "@/lib/bookings.api";
import { RoleSwitcher } from "./RoleSwitcher";
import { WarwickSpacesMark } from "./Navbar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  showPendingCount?: boolean;
  roles?: ("admin" | "manager" | "student_services")[];
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Insights",
    items: [
      {
        href: "/admin",
        label: "Overview & Analytics",
        icon: BarChart3,
        exact: true,
        roles: ["admin", "manager", "student_services"],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/admin/approvals",
        label: "Approvals Queue",
        icon: CheckSquare,
        showPendingCount: true,
        roles: ["admin", "manager"],
      },
      {
        href: "/admin/bookings",
        label: "Bookings",
        icon: CalendarClock,
        roles: ["admin", "manager", "student_services"],
      },
    ],
  },
  {
    title: "Catalogue",
    items: [
      {
        href: "/admin/resources",
        label: "Resources",
        icon: Boxes,
        roles: ["admin", "manager"],
      },
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        roles: ["admin", "manager"],
      },
      {
        href: "/admin/catalog",
        label: "Reference Data",
        icon: Database,
        roles: ["admin", "manager"],
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
  const { actor, actorHeadersContext, canManageApprovals, isRedactedRole } = useActor();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!canManageApprovals) {
      setPendingCount(null);
      return;
    }
    let active = true;
    listBookings(actorHeadersContext, { status_id: "pending", limit: 200 })
      .then((rows) => {
        if (active) setPendingCount(rows.length);
      })
      .catch(() => {
        if (active) setPendingCount(null);
      });
    return () => {
      active = false;
    };
  }, [actor.id, actorHeadersContext, canManageApprovals, pathname]);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navContent = (
    <div className="flex h-full flex-col bg-fog border-r border-hairline">
      <div className="flex h-14 items-center justify-between px-4 border-b border-hairline">
        <Link
          href="/"
          onClick={onCloseMobile}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Explorer
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden rounded-full p-1 text-slate-muted hover:bg-mist hover:text-ink"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3.5 pt-4 pb-3 border-b border-hairline space-y-3">
        <div className="flex items-center gap-2 px-1">
          <WarwickSpacesMark className="h-6 w-6" />
          <div className="min-w-0 leading-tight">
            <div className="text-[13.5px] font-semibold tracking-[-0.015em] text-ink truncate">
              Warwick Spaces
            </div>
            <div className="text-[11px] text-slate-muted">Admin Console</div>
          </div>
        </div>
        <RoleSwitcher variant="sidebar" />
      </div>

      <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              actor.role === "member" ||
              !item.roles ||
              item.roles.includes(actor.role)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title}>
              <div className="px-2.5 mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ash">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = isActive(item.href, item.exact);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={`group flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors ${
                        active
                          ? "bg-paper text-ink font-medium shadow-attio-card"
                          : "text-slate-muted hover:bg-mist/80 hover:text-ink"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 stroke-[1.6] ${
                            active ? "text-ink" : "text-slate-muted group-hover:text-ink"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.showPendingCount && pendingCount !== null && pendingCount > 0 && (
                        <span className="rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold text-sienna tabular-nums">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-hairline px-4 py-3 text-[11.5px] text-slate-muted">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-ash">{actor.user_id ?? "—"}</span>
          <span className="rounded-full bg-mist px-2 py-0.5 font-mono text-[10.5px] text-ink">
            {actor.role}
          </span>
        </div>
        {isRedactedRole && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-sienna">
            <BookMarked className="h-3 w-3 shrink-0" />
            Read-only · PII redacted
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-[232px]">
        {navContent}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-ink/35 backdrop-blur-[1px]"
          onClick={onCloseMobile}
        >
          <div
            className="fixed inset-y-0 left-0 w-[256px] max-w-[85vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
