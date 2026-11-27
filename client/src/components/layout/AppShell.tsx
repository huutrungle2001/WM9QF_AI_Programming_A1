"use client";

import React, { useState } from "react";
import { useActor } from "@/hooks/useActor";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { actor } = useActor();

  return (
    <div className="min-h-screen bg-canvas text-slate-900">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="lg:pl-64 flex min-h-screen flex-col">
        <Navbar onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          {/* Drop the previous actor's page data and in-flight results on a role switch. */}
          <React.Fragment key={actor.id}>{children}</React.Fragment>
        </main>
      </div>
    </div>
  );
}
