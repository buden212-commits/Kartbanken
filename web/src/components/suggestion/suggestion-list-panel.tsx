"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SuggestionSummary } from "@/lib/suggestion/types";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  SuggestionStatus,
} from "@/lib/suggestion/types";
import { formatDateOnly } from "@/lib/format";

type Props = {
  mapSlug: string;
  suggestions: SuggestionSummary[];
  canReview: boolean;
  isAdmin: boolean;
};

export function SuggestionListPanel({
  mapSlug,
  suggestions,
  canReview,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = suggestions.filter((s) => (filter === "ALL" ? true : s.status === filter));
  const openCount = suggestions.filter((s) => s.status === SuggestionStatus.OPEN).length;

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
          Kartförslag ({openCount} öppna)
        </h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="OPEN">Öppna</option>
          <option value="IMPLEMENTED">Införda</option>
          <option value="REJECTED">Avvisade</option>
          <option value="ALL">Alla</option>
        </select>
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
          {filtered.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/maps/${mapSlug}/suggestions/${s.id}`}
                  className="font-medium text-ifk-blue hover:underline"
                >
                  {s.title?.trim() || SUGGESTION_CATEGORY_LABELS[s.category]}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{s.comment}</p>
                <p className="mt-1 text-xs text-slate-500">
                  v{s.versionNumber} · {SUGGESTION_STATUS_LABELS[s.status]} ·{" "}
                  {s.createdBy.name?.trim() || s.createdBy.email} · {formatDateOnly(s.createdAt)}
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={deleting === s.id}
                  onClick={() => void handleDelete(s.id)}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Radera
                </button>
              )}
            </li>
          ))}
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
