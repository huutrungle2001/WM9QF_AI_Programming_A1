"use client";

import React, { useEffect, useRef, useState } from "react";
import { Accessibility, Check, ChevronDown, Shield } from "lucide-react";
import { useActor } from "@/hooks/useActor";
import { ROLE_LABELS } from "@/types";

interface RoleSwitcherProps {
  variant?: "pill" | "sidebar";
}

function initialsFor(fullName: string): string {
  return fullName
    .split(" ")
    .filter((part) => !part.endsWith("."))
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

export function RoleSwitcher({ variant = "pill" }: RoleSwitcherProps) {
  const { actor, presets, setActorById } = useActor();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isSidebar = variant === "sidebar";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={
          isSidebar
            ? "flex w-full items-center justify-between gap-2 rounded-[10px] border border-hairline bg-paper px-2.5 py-2 text-left transition-colors hover:border-smoke/70"
            : "flex items-center gap-2 rounded-full border border-hairline bg-paper py-1 pl-1.5 pr-3 text-left transition-colors hover:border-smoke/70 hover:bg-fog"
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">
            {initialsFor(actor.full_name)}
          </span>
          <span className="min-w-0 truncate">
            <span className="block truncate text-[13px] font-medium text-ink leading-tight">
              {actor.label}
            </span>
            {isSidebar && (
              <span className="block truncate text-[11px] text-slate-muted leading-tight mt-0.5">
                {ROLE_LABELS[actor.role]}
              </span>
            )}
          </span>
          {!isSidebar && (
            <span className="hidden md:inline text-[12px] text-slate-muted">
              · {ROLE_LABELS[actor.role]}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-[300px] rounded-[16px] border border-hairline bg-paper p-1.5 shadow-steep-float ${
            isSidebar ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between px-2.5 py-2 border-b border-hairline">
            <span className="text-[12px] font-semibold text-ink">Switch demo role</span>
            <span className="font-mono text-[10.5px] text-ash">X-Role</span>
          </div>

          <div className="mt-1 space-y-0.5 max-h-[360px] overflow-y-auto">
            {presets.map((preset) => {
              const selected = preset.id === actor.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setActorById(preset.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-start justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                    selected ? "bg-mist text-ink" : "hover:bg-fog"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-medium text-ink">
                        {preset.label}
                      </span>
                      <span className="font-mono text-[10.5px] text-slate-muted">
                        {preset.id}
                      </span>
                      {preset.role === "student_services" && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-blush px-1.5 py-0.5 text-[10px] font-medium text-sienna">
                          <Shield className="h-2.5 w-2.5" />
                          Redacted
                        </span>
                      )}
                      {preset.has_accessibility_access && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-medium text-ink">
                          <Accessibility className="h-2.5 w-2.5" />
                          Accessible
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-slate-muted truncate">
                      {preset.full_name} · {preset.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center pt-0.5 shrink-0">
                    {selected && <Check className="h-3.5 w-3.5 text-ink" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
