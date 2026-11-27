"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useActor } from "@/hooks/useActor";
import { Sidebar } from "./Sidebar";
import { Navbar, WarwickSpacesMark } from "./Navbar";
import { RoleSwitcher } from "./RoleSwitcher";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { actor } = useActor();

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <div className="lg:pl-[232px] flex min-h-screen flex-col">
          {/* Compact mobile bar for admin console */}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-hairline bg-paper px-4 lg:hidden">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-muted hover:bg-mist hover:text-ink"
                aria-label="Open admin navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <WarwickSpacesMark className="h-6 w-6" />
              <span className="text-[14px] font-semibold text-ink">Admin Console</span>
            </div>
            <RoleSwitcher variant="pill" />
          </header>

          <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 py-6 sm:px-8 sm:py-8">
            {/* Drop the previous actor's page data and in-flight results on a role switch. */}
            <React.Fragment key={actor.id}>{children}</React.Fragment>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <Navbar />
      <main className="flex-1 w-full">
        {/* Drop the previous actor's page data and in-flight results on a role switch. */}
        <React.Fragment key={actor.id}>{children}</React.Fragment>
      </main>
      <footer className="border-t border-hairline bg-paper">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 text-[13px] text-ash">
          <span>Warwick Spaces · Unified Campus Learning Resources</span>
          <span>University of Warwick · Rooms, Labs, Equipment &amp; Academic Support</span>
        </div>
      </footer>
    </div>
  );
}
