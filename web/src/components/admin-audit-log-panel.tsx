"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import {
  AUDIT_LOG_INITIAL_VISIBLE,
  type AuditLogRow,
  type AuditLogSortDir,
  type AuditLogSortField,
  type AuditLogUserOption,
} from "@/lib/audit-log-query";

type Props = {
  rows: AuditLogRow[];
  users: AuditLogUserOption[];
  sort: AuditLogSortField;
  dir: AuditLogSortDir;
  userId?: string;
  truncated: boolean;
};

function sortIndicator(active: boolean, dir: AuditLogSortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ↑" : " ↓";
}

export function AdminAuditLogPanel({
  rows,
  users,
  sort,
  dir,
  userId,
  truncated,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [userId, sort, dir, rows]);

  const hasMore = rows.length > AUDIT_LOG_INITIAL_VISIBLE;
  const visibleRows = expanded ? rows : rows.slice(0, AUDIT_LOG_INITIAL_VISIBLE);
  const visibleCount = visibleRows.length;

  const pushParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value) params.delete(key);
        else params.set(key, value);
      }
      startTransition(() => {
        router.push(`/admin/loggning?${params.toString()}`);
      });
    },
    [router, searchParams],
  );

  function handleUserFilter(nextUserId: string) {
    pushParams({ user: nextUserId || undefined });
  }

  function handleSort(field: AuditLogSortField) {
    const nextDir: AuditLogSortDir =
      sort === field ? (dir === "asc" ? "desc" : "asc") : field === "date" ? "desc" : "asc";
    pushParams({ sort: field, dir: nextDir });
  }

  const sortBtn =
    "inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800";

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <label htmlFor="audit-user-filter" className="form-label">
            Filtrera på namn
          </label>
          <select
            id="audit-user-filter"
            value={userId ?? ""}
            onChange={(e) => handleUserFilter(e.target.value)}
            className="form-select"
          >
            <option value="">Alla användare</option>
            <option value="__system">System</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-sm text-slate-500">
          {rows.length === 0
            ? "Inga händelser"
            : hasMore && !expanded
              ? `Visar ${visibleCount} av ${rows.length} händelser`
              : `Visar ${rows.length} händelse${rows.length === 1 ? "" : "r"}`}
          {truncated ? " (max 1000 senaste)" : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Inga loggade händelser matchar filtret.</p>
      ) : (
        <>
          <ul className="mt-6 space-y-3 md:hidden">
            {visibleRows.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="font-medium text-slate-900">{row.userName}</p>
                <p className="mt-1 text-sm text-slate-700">{row.activity}</p>
                <p className="mt-2 text-xs text-slate-500">{formatDate(row.createdAt)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 pb-3 pt-4 pr-4">
                    <button type="button" onClick={() => handleSort("name")} className={sortBtn}>
                      Namn{sortIndicator(sort === "name", dir)}
                    </button>
                  </th>
                  <th className="pb-3 pt-4 pr-4">
                    <button
                      type="button"
                      onClick={() => handleSort("activity")}
                      className={sortBtn}
                    >
                      Aktivitet{sortIndicator(sort === "activity", dir)}
                    </button>
                  </th>
                  <th className="px-4 pb-3 pt-4">
                    <button type="button" onClick={() => handleSort("date")} className={sortBtn}>
                      Datum{sortIndicator(sort === "date", dir)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 pr-4 text-slate-900">{row.userName}</td>
                    <td className="py-3 pr-4 text-slate-700">{row.activity}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDate(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-ifk-blue hover:text-ifk-blue"
              >
                {expanded
                  ? `Visa färre (senaste ${AUDIT_LOG_INITIAL_VISIBLE})`
                  : `Visa alla ${rows.length} händelser`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
