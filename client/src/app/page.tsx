"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Cpu,
  GraduationCap,
  Monitor,
  Search,
  Users,
} from "lucide-react";
import {
  RESOURCE_TYPE_LABELS,
  type BuildingOut,
  type DepartmentOut,
  type FacilityOut,
  type ResourceOut,
  type ResourceType,
} from "@/types";
import {
  listBuildings,
  listDepartments,
  listFacilities,
  listResources,
} from "@/lib/resources.api";
import { formatNumber } from "@/lib/format";
import { useActor } from "@/hooks/useActor";

const CATEGORY_CARDS: {
  type: ResourceType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    type: "study_room",
    title: "Study Rooms",
    description: "Quiet individual desks, accessible study rooms, and seminar spaces across campus.",
    icon: BookOpen,
  },
  {
    type: "group_space",
    title: "Group Spaces",
    description: "Collaborative pods and presentation rooms with large displays and whiteboards.",
    icon: Users,
  },
  {
    type: "computer_lab",
    title: "Computer Labs",
    description: "Departmental workstations equipped for coding, CAD, data science, and teaching.",
    icon: Monitor,
  },
  {
    type: "specialist_equipment",
    title: "Specialist Equipment",
    description: "Multi-day loans for VR/XR headsets, laptops, cameras, and lab prototyping kits.",
    icon: Cpu,
  },
  {
    type: "academic_support",
    title: "Academic Support",
    description: "1-on-1 writing mentors, careers advice, maths help, and online MS Teams workshops.",
    icon: GraduationCap,
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { actor, actorHeadersContext } = useActor();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<ResourceOut[]>([]);
  const [buildings, setBuildings] = useState<BuildingOut[]>([]);
  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [facilities, setFacilities] = useState<FacilityOut[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      listResources(actorHeadersContext, { limit: 1000 }),
      listBuildings(actorHeadersContext),
      listDepartments(actorHeadersContext),
      listFacilities(actorHeadersContext),
    ])
      .then(([resList, bldList, deptList, facList]) => {
        if (!active) return;
        setResources(resList);
        setBuildings(bldList);
        setDepartments(deptList);
        setFacilities(facList);
      })
      .catch(() => {
        // Landing page degrades gracefully if API is unreachable
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actor.id, actorHeadersContext]);

  const countsByType = useMemo(() => {
    const map: Record<ResourceType, number> = {
      study_room: 0,
      group_space: 0,
      computer_lab: 0,
      specialist_equipment: 0,
      academic_support: 0,
    };
    for (const r of resources) {
      map[r.resource_type] = (map[r.resource_type] ?? 0) + 1;
    }
    return map;
  }, [resources]);

  const maxTypeCount = useMemo(
    () => Math.max(1, ...Object.values(countsByType)),
    [countsByType]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/resources?q=${encodeURIComponent(trimmed)}` : "/resources");
  };

  return (
    <div className="bg-paper">
      {/* Split Screen Hero */}
      <section className="mx-auto max-w-[1200px] px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-6">
            <p className="text-[13px] font-medium text-slate-muted">
              University of Warwick · Campus Learning Resources
            </p>

            <h1 className="text-[38px] sm:text-[50px] font-semibold leading-[1.08] tracking-[-0.025em] text-ink">
              One place for every Warwick study room, lab, kit &amp; support session.
            </h1>

            <p className="max-w-[540px] text-[17px] leading-[1.5] text-slate-muted">
              Check real-time availability, reserve spaces across four campus zones, and manage
              every booking from a single unified portal.
            </p>

            {/* Steep Composer-style quick search */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex max-w-[540px] items-center gap-2 rounded-[16px] border border-hairline bg-paper p-2 pl-4 shadow-steep-subtle focus-within:border-ink/40 transition-colors"
            >
              <Search className="h-4 w-4 shrink-0 text-ash" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search FAB5.07, Rootes study pods, VR kits, writing..."
                aria-label="Search campus resources"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-smoke"
              />
              <button
                type="submit"
                aria-label="Search resources"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-opacity hover:opacity-85"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* Paired Steep Pill CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/resources"
                className="inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-paper transition-opacity hover:opacity-85"
              >
                Explore Resources
              </Link>
              <Link
                href="/bookings"
                className="inline-flex items-center justify-center rounded-full border border-ink bg-transparent px-6 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                My Bookings
              </Link>
            </div>
          </div>

          {/* Right Column: Clean Floating Live Campus Artifact */}
          <div className="lg:col-span-5">
            <div className="steep-floating border border-hairline/70 p-6 sm:p-7">
              <div className="flex items-baseline justify-between gap-2 pb-5 border-b border-hairline">
                <div>
                  <p className="text-[12.5px] font-medium text-slate-muted">
                    Live campus directory
                  </p>
                  <p className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums">
                    {loading ? "—" : formatNumber(resources.length)}
                  </p>
                  <p className="mt-1 text-[13px] text-ash">
                    Eligible resources for {actor.label}
                  </p>
                </div>
                <Link
                  href="/resources"
                  className="text-[13px] font-medium text-ink hover:underline underline-offset-4"
                >
                  View all →
                </Link>
              </div>

              {/* 3 compact live campus totals */}
              <div className="grid grid-cols-3 gap-3 py-5 border-b border-hairline tabular-nums">
                <div>
                  <div className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
                    {loading ? "—" : formatNumber(buildings.length)}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-muted">Buildings</div>
                </div>
                <div>
                  <div className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
                    {loading ? "—" : formatNumber(departments.length)}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-muted">Departments</div>
                </div>
                <div>
                  <div className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
                    {loading ? "—" : formatNumber(facilities.length)}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-muted">AV &amp; Facilities</div>
                </div>
              </div>

              {/* Quiet proportional breakdown by resource type */}
              <div className="pt-5 space-y-3">
                {(Object.keys(countsByType) as ResourceType[]).map((type) => {
                  const count = countsByType[type];
                  const widthPct = Math.max(6, Math.round((count / maxTypeCount) * 100));
                  return (
                    <Link
                      key={type}
                      href={`/resources?type=${type}`}
                      className="group block"
                    >
                      <div className="flex items-center justify-between text-[13px] tabular-nums">
                        <span className="font-medium text-ink group-hover:underline underline-offset-4">
                          {RESOURCE_TYPE_LABELS[type]}
                        </span>
                        <span className="text-slate-muted">
                          {loading ? "—" : formatNumber(count)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-mist">
                        <div
                          className="h-full rounded-full bg-ink/80 transition-all duration-300 group-hover:bg-sienna"
                          style={{ width: loading ? "0%" : `${widthPct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid: 5 Resource Categories + 1 Blush/Sienna Editorial Highlight */}
      <section className="border-t border-hairline bg-fog/60">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.02em] text-ink">
                Browse by resource type
              </h2>
              <p className="mt-1.5 text-[15px] text-slate-muted">
                Jump directly into tailored filters for rooms, equipment pools, or advisory sessions.
              </p>
            </div>
            <Link
              href="/resources"
              className="text-[14.5px] font-medium text-ink hover:underline underline-offset-4"
            >
              Browse entire catalogue →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORY_CARDS.map((card) => {
              const Icon = card.icon;
              const count = countsByType[card.type];
              return (
                <Link
                  key={card.type}
                  href={`/resources?type=${card.type}`}
                  className="group steep-mist-card flex flex-col justify-between p-7 transition-colors hover:bg-mist/75"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink">
                        <Icon className="h-[18px] w-[18px] stroke-[1.75]" />
                      </span>
                      <span className="text-[13px] font-medium text-slate-muted tabular-nums">
                        {loading ? "—" : `${formatNumber(count)} available`}
                      </span>
                    </div>
                    <h3 className="mt-6 text-[20px] font-semibold tracking-[-0.015em] text-ink">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-[14.5px] leading-[1.5] text-slate-muted">
                      {card.description}
                    </p>
                  </div>

                  <div className="mt-7 text-[14px] font-medium text-ink group-hover:underline underline-offset-4">
                    Explore {card.title.toLowerCase()} →
                  </div>
                </Link>
              );
            })}

            {/* 6th Bento Tile: Single tasteful blush/sienna editorial highlight */}
            <div className="steep-blush-card flex flex-col justify-between p-7">
              <div>
                <p className="text-[12.5px] font-medium uppercase tracking-[0.04em] opacity-80">
                  Unified Campus Portal
                </p>
                <h3 className="mt-4 text-[22px] font-semibold leading-[1.25] tracking-[-0.015em]">
                  Six fragmented campus booking portals, consolidated into one.
                </h3>
                <p className="mt-3 text-[14.5px] leading-[1.5] opacity-90">
                  Library study pods, central teaching rooms, WMG kit loans, accessibility
                  spaces, and academic mentoring — with automatic conflict prevention and fair
                  course-level analytics.
                </p>
              </div>
              <div className="mt-7 flex items-center justify-between text-[13.5px] font-medium">
                <span>Real-time slot checks</span>
                <Link
                  href="/bookings"
                  className="underline underline-offset-4 hover:opacity-80"
                >
                  Manage bookings →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
