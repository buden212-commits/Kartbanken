"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CourseSummary } from "@/lib/course/types";
import { formatDateOnly } from "@/lib/format";

type Props = {
  mapSlug: string;
  courses: CourseSummary[];
  sessionUserId: string;
  isAdmin: boolean;
  publishedVersionId: string | null;
};

const iconBtn =
  "group relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-ifk-blue/40 hover:bg-ifk-blue-pale hover:text-ifk-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30";
const iconBtnDanger =
  "group relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:pointer-events-none disabled:opacity-50";
const tooltip =
  "pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100";

function Tooltip({ label }: { label: string }) {
  return (
    <span role="tooltip" className={tooltip}>
      {label}
    </span>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M13.5 3.5 16.5 6.5M4 16v-2.5L13 6.5l2.5 2.5L6.5 16H4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M3 10s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M4.5 6h11M8 6V4.5h4V6M7 6v9.5h6V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CourseListPanel({
  mapSlug,
  courses,
  sessionUserId,
  isAdmin,
  publishedVersionId,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(courseId: string) {
    if (!window.confirm("Är du säker?")) return;
    setDeleting(courseId);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/courses/${courseId}`, {
      method: "DELETE",
    });
    setDeleting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Radering misslyckades");
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-slate-900">Banor ({courses.length})</h2>
        {publishedVersionId ? (
          <Link
            href={`/maps/${mapSlug}/bana`}
            className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-ifk-blue/90"
          >
            Lägg bana
          </Link>
        ) : (
          <span
            title="Kräver en publicerad kartversion"
            className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500"
          >
            Lägg bana
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Egna och publika banor på denna kartfil. Overlay påverkar aldrig kartfilen.
        {publishedVersionId
          ? " Banor ritas mot den publicerade kartversionen."
          : " Publicera en kartversion för att lägga banor."}
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {courses.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Inga banor skapade ännu.</p>
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200">
          <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
            <colgroup>
              <col />
              <col className="w-[18%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[4.5rem]" />
            </colgroup>
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-slate-700">Namn</th>
                <th className="px-2 py-2 text-left font-medium text-slate-700">Ägare</th>
                <th className="px-2 py-2 text-left font-medium text-slate-700">Skapad</th>
                <th className="px-2 py-2 text-left font-medium text-slate-700">Synlighet</th>
                <th className="px-2 py-2 text-left font-medium text-slate-700">Objekt</th>
                <th className="px-2 py-2 text-right font-medium text-slate-700">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {courses.map((course) => {
                const isOwner = course.createdBy.id === sessionUserId;
                const canDelete = isOwner || isAdmin;
                const ownerLabel = course.createdBy.name ?? course.createdBy.email;
                return (
                  <tr key={course.id}>
                    <td className="px-2 py-2" title={course.name}>
                      <span className="block truncate font-medium text-slate-900">
                        {course.name}
                      </span>
                    </td>
                    <td className="px-2 py-2" title={ownerLabel}>
                      <span className="block truncate text-slate-600">{ownerLabel}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                      {formatDateOnly(course.createdAt)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          course.isPublic
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {course.isPublic ? "Publik" : "Privat"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                      {course.objectCount}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <Link
                          href={`/maps/${mapSlug}/bana?course=${course.id}`}
                          aria-label={isOwner ? "Redigera bana" : "Visa bana"}
                          className={iconBtn}
                        >
                          {isOwner ? <PencilIcon /> : <EyeIcon />}
                          <Tooltip label={isOwner ? "Redigera bana" : "Visa bana"} />
                        </Link>
                        {canDelete && (
                          <button
                            type="button"
                            aria-label="Radera bana"
                            disabled={deleting === course.id}
                            onClick={() => void handleDelete(course.id)}
                            className={iconBtnDanger}
                          >
                            <TrashIcon />
                            <Tooltip
                              label={deleting === course.id ? "Raderar…" : "Radera bana"}
                            />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
