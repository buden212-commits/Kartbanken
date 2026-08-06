"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SuggestionSummary } from "@/lib/suggestion/types";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  SuggestionStatus,
  formatSuggestionStatusAttribution,
} from "@/lib/suggestion/types";
import { formatDateOnly } from "@/lib/format";

type Props = {
  mapSlug: string;
  suggestions: SuggestionSummary[];
  canReview: boolean;
  isAdmin: boolean;
  /** Zoom the area overview map to this suggestion (områdessidan). */
  onZoomToSuggestion?: (id: string) => void;
  highlightedSuggestionId?: string | null;
};

function statusBadgeClass(status: SuggestionSummary["status"]): string {
  switch (status) {
    case SuggestionStatus.OPEN:
      return "text-amber-700";
    case SuggestionStatus.IN_PROGRESS:
      return "text-sky-700";
    case SuggestionStatus.IMPLEMENTED:
      return "text-emerald-700";
    default:
      return "text-slate-600";
  }
}

export function SuggestionListPanel({
  mapSlug,
  suggestions,
  canReview,
  isAdmin,
  onZoomToSuggestion,
  highlightedSuggestionId = null,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const filtered = suggestions.filter((s) => (filter === "ALL" ? true : s.status === filter));
  const openCount = suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length;
  const inProgressCount = suggestions.filter(
    (s) => s.status === SuggestionStatus.IN_PROGRESS,
  ).length;
  const exportableCount = openCount + inProgressCount;

  async function handleExportPdf() {
    setExportingPdf(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/suggestions/export/pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "PDF-export misslyckades");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match?.[1] ?? "kartforslag-rapport.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF-export misslyckades");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Radera detta kartförslag?")) return;
    setDeleting(id);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/suggestions/${id}`, { method: "DELETE" });
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
        <h2 className="text-lg font-medium text-slate-900">
          Kartförslag ({openCount} öppna
          {inProgressCount > 0 ? `, ${inProgressCount} pågår` : ""})
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {exportableCount > 0 && (
            <button
              type="button"
              disabled={exportingPdf}
              onClick={() => void handleExportPdf()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exportingPdf ? "Exporterar…" : `Exportera PDF (${exportableCount})`}
            </button>
          )}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
          <option value="OPEN">Öppna</option>
          <option value="IN_PROGRESS">Pågår</option>
          <option value="IMPLEMENTED">Införda</option>
          <option value="REJECTED">Avvisade</option>
          <option value="ALL">Alla</option>
        </select>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Förslag på ändringar i terrängen. Syns på publicerade versioner och granskas av redaktörer.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Inga kartförslag i denna vy.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {filtered.map((s) => {
            const statusAttribution = formatSuggestionStatusAttribution(
              s.status,
              s.reviewedBy,
              s.reviewedAt,
              formatDateOnly,
            );
            return (
            <li
              key={s.id}
              className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${
                onZoomToSuggestion ? "cursor-pointer hover:bg-slate-50" : ""
              } ${highlightedSuggestionId === s.id ? "bg-orange-50/80" : ""}`}
              onClick={
                onZoomToSuggestion
                  ? () => onZoomToSuggestion(s.id)
                  : undefined
              }
              onKeyDown={
                onZoomToSuggestion
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onZoomToSuggestion(s.id);
                      }
                    }
                  : undefined
              }
              role={onZoomToSuggestion ? "button" : undefined}
              tabIndex={onZoomToSuggestion ? 0 : undefined}
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/maps/${mapSlug}/suggestions/${s.id}`}
                  className="font-medium text-ifk-blue hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.title?.trim() || SUGGESTION_CATEGORY_LABELS[s.category]}
                  {s.hasAttachment ? " 📷" : ""}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{s.comment}</p>
                <p className={`mt-1 text-xs ${statusBadgeClass(s.status)}`}>
                  v{s.versionNumber}
                  {s.appliesToOlderVersion && (
                    <span className="ml-1 font-medium text-violet-700">
                      · Gäller version {s.versionNumber}
                    </span>
                  )}
                  {" · "}
                  {SUGGESTION_STATUS_LABELS[s.status]} ·{" "}
                  {s.createdBy.name?.trim() || s.createdBy.email} · {formatDateOnly(s.createdAt)}
                </p>
                {statusAttribution && (
                  <p className="mt-0.5 text-xs text-slate-500">{statusAttribution}</p>
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={deleting === s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(s.id);
                  }}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Radera
                </button>
              )}
            </li>
            );
          })}
        </ul>
      )}

      {!canReview && (
        <p className="mt-3 text-xs text-slate-500">
          Öppna en publicerad kartversion och välj «Föreslå ändring» för att lämna ett nytt förslag.
        </p>
      )}
    </section>
  );
}
