"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accessibility,
  CheckCircle2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  UserX,
} from "lucide-react";
import {
  ROLE_LABELS,
  USER_TYPE_LABELS,
  type DepartmentOut,
  type Role,
  type UserCreate,
  type UserOut,
  type UserType,
} from "@/types";
import {
  createUser,
  deactivateUser,
  listDepartments,
  listUsers,
} from "@/lib/resources.api";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { useActor } from "@/hooks/useActor";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

export default function AdminUsersPage() {
  const { actor, actorHeadersContext, canManageCatalogue } = useActor();
  const isAdmin = actor.role === "admin";

  const [users, setUsers] = useState<UserOut[]>([]);
  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  // Create user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState<UserType>("pg_student");
  const [role, setRole] = useState<Role>("member");
  const [course, setCourse] = useState("");
  const [departmentId, setDepartmentId] = useState("WMG");
  const [hasAccessibility, setHasAccessibility] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!canManageCatalogue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [usrList, deptList] = await Promise.all([
        listUsers(actorHeadersContext),
        listDepartments(actorHeadersContext),
      ]);
      setUsers(usrList);
      setDepartments(deptList);
      if (deptList.length > 0 && !deptList.some((d) => d.department_id === departmentId)) {
        setDepartmentId(deptList[0].department_id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [actorHeadersContext, canManageCatalogue, departmentId]);

  useEffect(() => {
    void loadData();
  }, [loadData, actor.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.user_id.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.course?.toLowerCase().includes(q) ?? false) ||
        u.department_id.toLowerCase().includes(q)
      );
    });
  }, [users, roleFilter, search]);

  if (!canManageCatalogue) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" />}
        title="Admin or Manager role required"
        description="Switch to Admin or Manager to view the campus users directory."
      />
    );
  }

  const handleDeactivate = async (user: UserOut) => {
    if (!window.confirm(`Soft-deactivate ${user.full_name} (${user.user_id})?`)) {
      return;
    }
    setBusyId(user.user_id);
    setError(null);
    setFeedback(null);
    try {
      await deactivateUser(actorHeadersContext, user.user_id);
      setFeedback(`User ${user.user_id} deactivated.`);
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Failed to deactivate user."
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const payload: UserCreate = {
      user_id: userId.trim(),
      full_name: fullName.trim(),
      email: email.trim(),
      user_type: userType,
      role,
      course: course.trim() || null,
      department_id: departmentId,
      has_accessibility_access: hasAccessibility,
      is_active: true,
    };
    try {
      const created = await createUser(actorHeadersContext, payload);
      setFeedback(`Created user ${created.full_name} (${created.user_id}).`);
      setCreateOpen(false);
      setUserId("");
      setFullName("");
      setEmail("");
      setCourse("");
      setHasAccessibility(false);
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError
          ? `${err.detail} (HTTP ${err.status})`
          : "Failed to create user."
      );
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<UserOut>[] = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        <div>
          <div className="font-medium text-ink">{u.full_name}</div>
          <div className="text-[11.5px] text-slate-muted">
            <span className="font-mono text-ink">{u.user_id}</span> · {u.email}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role & Type",
      render: (u) => (
        <div className="text-[12.5px]">
          <div className="font-medium text-ink">{ROLE_LABELS[u.role]}</div>
          <div className="text-[11.5px] text-slate-muted">
            {USER_TYPE_LABELS[u.user_type]}
          </div>
        </div>
      ),
    },
    {
      key: "course",
      header: "Course & Department",
      render: (u) => (
        <div className="text-[12.5px]">
          <div className="text-ink">{u.course ?? <span className="text-ash">—</span>}</div>
          <div className="font-mono text-[11px] text-ash">{u.department_id}</div>
        </div>
      ),
    },
    {
      key: "access",
      header: "Accessibility",
      render: (u) =>
        u.has_accessibility_access ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blush px-2.5 py-0.5 text-[11.5px] font-medium text-sienna">
            <Accessibility className="h-3 w-3" />
            Priority
          </span>
        ) : (
          <span className="text-[12px] text-ash">Standard</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
            u.is_active
              ? "bg-mist text-ink"
              : "bg-fog text-ash border border-hairline"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              u.is_active ? "bg-ink" : "bg-ash"
            }`}
          />
          {u.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "right" as const,
            render: (u: UserOut) =>
              u.is_active ? (
                <Button
                  size="sm"
                  shape="compact"
                  variant="ghost"
                  className="text-sienna hover:bg-blush/60"
                  disabled={busyId === u.user_id}
                  onClick={() => void handleDeactivate(u)}
                  title="Soft deactivate user"
                >
                  <UserX className="h-3.5 w-3.5" />
                  Deactivate
                </Button>
              ) : (
                <span className="text-[12px] text-ash">—</span>
              ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-hairline pb-5">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
            Users
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-muted tabular-nums">
            {loading
              ? "Loading users..."
              : `${formatNumber(filtered.length)} of ${formatNumber(users.length)} registered users`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            shape="compact"
            onClick={() => void loadData()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              shape="pill"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              New User
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
          className="h-9 rounded-[10px] border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-ink focus:outline-none"
        >
          <option value="all">All roles</option>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ash" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, course..."
            className="w-full rounded-[10px] border border-hairline bg-paper py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-smoke focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadData()} />}
      {feedback && (
        <div className="flex items-center gap-2 rounded-[12px] bg-mist px-4 py-2.5 text-[13px] font-medium text-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.user_id}
        emptyMessage={loading ? "Loading users..." : "No users found."}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create User"
        subtitle="Add a campus member, manager, student services analyst, or administrator"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-[12.5px] font-medium text-ink">User ID *</label>
            <input
              type="text"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. S1099"
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-ink">Full Name *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Maya Chen"
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-ink">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="m.chen@warwick.ac.uk"
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-ink">User Type *</label>
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value as UserType)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              {(Object.keys(USER_TYPE_LABELS) as UserType[]).map((ut) => (
                <option key={ut} value={ut}>
                  {USER_TYPE_LABELS[ut]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-ink">Role *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-ink">Department *</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            >
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.department_id} — {d.department_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-ink">
              Course <span className="font-normal text-ash">(optional)</span>
            </label>
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. MSc Applied AI"
              className="mt-1.5 w-full rounded-[12px] border border-hairline bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2.5 text-[13px] font-medium text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={hasAccessibility}
              onChange={(e) => setHasAccessibility(e.target.checked)}
              className="h-4 w-4 rounded accent-ink"
            />
            Grant accessibility-priority booking eligibility
          </label>

          {createError && <ErrorBanner message={createError} />}

          <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create User
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
