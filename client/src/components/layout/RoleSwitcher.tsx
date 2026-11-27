"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ShieldAlert, Accessibility, UserCog } from "lucide-react";
import { useActor } from "@/hooks/useActor";
import { ROLE_LABELS, type Role } from "@/types";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const ROLE_TONES: Record<Role, BadgeTone> = {
  admin: "plum",
  manager: "indigo",
  student_services: "redacted",
  member: "emerald",
};

export function RoleSwitcher() {
  const { actor, presets, setActorById } = useActor();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-left shadow-sm hover:border-warwick-300 hover:bg-warwick-50/40 transition-colors"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warwick-700 text-xs font-semibold text-white">
          {actor.full_name
            .split(" ")
            .filter((part) => !part.endsWith("."))
            .slice(0, 2)
            .map((p) => p[0])
            .join("")}
        </div>
        <div className="hidden sm:block leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-900">{actor.label}</span>
            <span className="font-mono text-[10px] text-slate-500">{actor.id}</span>
          </div>
          <div className="text-[11px] text-slate-500">{actor.full_name}</div>
        </div>
        <Badge tone={ROLE_TONES[actor.role]} className="hidden md:inline-flex">
          {ROLE_LABELS[actor.role]}
        </Badge>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl z-50">
          <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <UserCog className="h-3.5 w-3.5 text-warwick-700" />
              Demo Actor / Role Switcher
            </div>
            <span className="font-mono text-[10px] text-slate-400">X-Role · X-User-Id</span>
          </div>

          <div className="mt-1 space-y-0.5 max-h-96 overflow-y-auto">
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
                  className={`w-full flex items-start justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? "bg-warwick-50 ring-1 ring-warwick-200"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-900">
                        {preset.label}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                        {preset.id}
                      </span>
                      {preset.role === "student_services" && (
                        <span
                          title="PII redacted & k>=5 suppressed"
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-fuchsia-700"
                        >
                          <ShieldAlert className="h-3 w-3" />
                          Redacted
                        </span>
                      )}
                      {preset.has_accessibility_access && (
                        <span
                          title="Accessibility rooms unlocked"
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-700"
                        >
                          <Accessibility className="h-3 w-3" />
                          Accessible
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600 truncate">
                      {preset.full_name}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {preset.subtitle}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge tone={ROLE_TONES[preset.role]}>{preset.role}</Badge>
                    {selected && <Check className="h-3.5 w-3.5 text-warwick-700" />}
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
