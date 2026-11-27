"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ActorContext, DemoActorPreset } from "@/types";

export const DEMO_ACTORS: DemoActorPreset[] = [
  {
    id: "ADMIN1",
    label: "Admin",
    full_name: "Dr. Eleanor Vance",
    subtitle: "Full system access · IDG",
    role: "admin",
    user_id: "ADMIN1",
    user_type: "staff",
    department_id: "IDG",
    has_accessibility_access: false,
    course: null,
  },
  {
    id: "MGR-LIB",
    label: "Library Manager",
    full_name: "Priya Nair",
    subtitle: "Approvals & analytics · Library",
    role: "manager",
    user_id: "MGR-LIB",
    user_type: "staff",
    department_id: "LIB",
    has_accessibility_access: false,
    course: null,
  },
  {
    id: "MGR-CENTRAL",
    label: "Central Manager",
    full_name: "David Gallagher",
    subtitle: "Approvals & catalogue · Central",
    role: "manager",
    user_id: "MGR-CENTRAL",
    user_type: "staff",
    department_id: "CENTRAL",
    has_accessibility_access: false,
    course: null,
  },
  {
    id: "SS1",
    label: "Student Services",
    full_name: "Claire Beaumont",
    subtitle: "Read-only · PII Redacted · k>=5",
    role: "student_services",
    user_id: "SS1",
    user_type: "staff",
    department_id: "STUEXP",
    has_accessibility_access: false,
    course: null,
  },
  {
    id: "S1001",
    label: "PG Student",
    full_name: "Alice Patel",
    subtitle: "MSc Applied AI · WMG",
    role: "member",
    user_id: "S1001",
    user_type: "pg_student",
    department_id: "WMG",
    has_accessibility_access: false,
    course: "MSc Applied AI",
  },
  {
    id: "S1002",
    label: "Accessible UG Student",
    full_name: "Benji Kowalski",
    subtitle: "BSc CS · Accessibility Priority",
    role: "member",
    user_id: "S1002",
    user_type: "ug_student",
    department_id: "CS",
    has_accessibility_access: true,
    course: "BSc Computer Science",
  },
  {
    id: "STAFF1",
    label: "Academic Staff",
    full_name: "Prof. Julian Mercer",
    subtitle: "Staff member · Computer Science",
    role: "member",
    user_id: "STAFF1",
    user_type: "staff",
    department_id: "CS",
    has_accessibility_access: false,
    course: null,
  },
];

const STORAGE_KEY = "warwick_booking_demo_actor_v1";

interface ActorContextValue {
  actor: DemoActorPreset;
  actorHeadersContext: ActorContext;
  presets: DemoActorPreset[];
  setActorById: (id: string) => void;
  canManageApprovals: boolean;
  canManageCatalogue: boolean;
  canViewAnalytics: boolean;
  canBook: boolean;
  isRedactedRole: boolean;
}

const ActorReactContext = createContext<ActorContextValue | null>(null);

export function ActorProvider({ children }: { children: React.ReactNode }) {
  const [actorId, setActorId] = useState<string | null>(null);

  useEffect(() => {
    let initialActorId = DEMO_ACTORS[0].id;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && DEMO_ACTORS.some((p) => p.id === saved)) {
        initialActorId = saved;
      }
    } catch {
      // Ignore storage access errors in restricted browsers
    }
    setActorId(initialActorId);
  }, []);

  const setActorById = (id: string) => {
    if (!DEMO_ACTORS.some((p) => p.id === id)) return;
    setActorId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore storage write errors
    }
  };

  const value = useMemo<ActorContextValue>(() => {
    const actor = DEMO_ACTORS.find((p) => p.id === actorId) ?? DEMO_ACTORS[0];
    const actorHeadersContext: ActorContext = {
      role: actor.role,
      user_id: actor.user_id,
      user_type: actor.user_type,
      department_id: actor.department_id,
      has_accessibility_access: actor.has_accessibility_access,
    };
    return {
      actor,
      actorHeadersContext,
      presets: DEMO_ACTORS,
      setActorById,
      canManageApprovals: actor.role === "admin" || actor.role === "manager",
      canManageCatalogue: actor.role === "admin" || actor.role === "manager",
      canViewAnalytics:
        actor.role === "admin" ||
        actor.role === "manager" ||
        actor.role === "student_services",
      canBook: actor.role !== "student_services",
      isRedactedRole: actor.role === "student_services",
    };
  }, [actorId]);

  // Mount data-fetching children only after the saved identity is resolved.
  if (actorId === null) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center bg-paper text-sm text-slate-muted">
        Loading workspace…
      </div>
    );
  }

  return (
    <ActorReactContext.Provider value={value}>
      {children}
    </ActorReactContext.Provider>
  );
}

export function useActor(): ActorContextValue {
  const ctx = useContext(ActorReactContext);
  if (!ctx) {
    throw new Error("useActor must be used within an ActorProvider.");
  }
  return ctx;
}
