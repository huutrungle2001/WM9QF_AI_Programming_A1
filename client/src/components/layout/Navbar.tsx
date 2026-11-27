"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActor } from "@/hooks/useActor";
import { RoleSwitcher } from "./RoleSwitcher";

export function WarwickSpacesMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="28" height="28" rx="8" fill="#17191c" />
      <path
        d="M7.5 10L10.5 18.5L14 11.5L17.5 18.5L20.5 10"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { canViewAnalytics } = useActor();

  const links = [
    { href: "/", label: "Overview", active: pathname === "/" },
    {
      href: "/resources",
      label: "Resources",
      active: pathname === "/resources" || pathname.startsWith("/resources/"),
    },
    {
      href: "/bookings",
      label: "My Bookings",
      active: pathname === "/bookings" || pathname.startsWith("/bookings/"),
    },
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-hairline bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center justify-start min-w-0">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 text-ink transition-opacity hover:opacity-80"
          >
            <WarwickSpacesMark className="h-7 w-7" />
            <span className="text-[15.5px] font-semibold tracking-[-0.02em]">
              Warwick Spaces
            </span>
          </Link>
        </div>

        <nav
          aria-label="Primary navigation"
          className="flex items-center justify-center gap-4 sm:gap-7 text-[14.5px]"
        >
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`py-1 transition-colors whitespace-nowrap ${
                item.active
                  ? "font-medium text-ink"
                  : "text-slate-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {canViewAnalytics && (
            <Link
              href="/admin"
              className={`hidden sm:inline-block py-1 transition-colors whitespace-nowrap ${
                pathname.startsWith("/admin")
                  ? "font-medium text-ink"
                  : "text-slate-muted hover:text-ink"
              }`}
            >
              Admin Console
            </Link>
          )}
        </nav>

        <div className="flex items-center justify-end gap-3 shrink-0">
          <RoleSwitcher variant="pill" />
        </div>
      </div>
    </header>
  );
}
