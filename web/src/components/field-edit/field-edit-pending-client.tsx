"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FieldEditReviewSummary } from "@/lib/field-edit/review-summary";

type Props = {
  mapSlug: string;
  mapTitle: string;
  sessionId: string;
  summary: FieldEditReviewSummary;
  ownerLabel: string;
  isAdmin: boolean;
  isOwner: boolean;
};

export function FieldEditPendingClient({
  mapSlug,
  mapTitle,
  sessionId,
  summary,
  ownerLabel,
  isAdmin,
  isOwner,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishAfter, setPublishAfter] = useState(false);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/confirm-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish: publishAfter }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Godkännande misslyckades");
      return;
    }
    const data = await res.json();
    router.push(`/maps/${mapSlug}?published=v${data.versionNumber}`);
    router.refresh();
  }

  async function handleCancel() {
    if (!confirm("Avbryt fältredigeringen? Ändringarna publiceras inte.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Avbruten under granskning" }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kunde inte avbryta");
      return;
    }
    router.push(`/maps/${mapSlug}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
        <h2 className="text-lg font-semibold text-amber-950">Väntar på admin-godkännande</h2>
        <p className="mt-1 text-sm text-amber-900">
          {isOwner && !isAdmin
            ? "Din fältredigering är incheckad och väntar på att en administratör godkänner den."
            : `Fältredigering av ${ownerLabel} på ${mapTitle} väntar på godkännande.`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg border border-red-100 bg-red-50 px-2 py-3">
          <p className="text-lg font-semibold text-red-700">{summary.deletes}</p>
          <p className="text-xs text-red-800">Raderade</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-3">
          <p className="text-lg font-semibold text-amber-800">{summary.modifies}</p>
          <p className="text-xs text-amber-900">Ändrade</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-3">
          <p className="text-lg font-semibold text-emerald-700">{summary.adds}</p>
          <p className="text-xs text-emerald-800">Nya</p>
        </div>
      </div>

      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {summary.changes.map((change, index) => (
          <li key={`${change.kind}-${index}`}>{change.label}</li>
        ))}
      </ul>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={publishAfter}
                onChange={(e) => setPublishAfter(e.target.checked)}
                className="h-4 w-4"
              />
              Publicera versionen direkt
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={handleApprove}
              className="min-h-11 rounded-lg bg-ifk-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-ifk-blue/90 disabled:opacity-50"
            >
              {loading ? "Godkänner…" : "Godkänn och skapa version"}
            </button>
          </>
        )}
        {(isAdmin || isOwner) && (
          <button
            type="button"
            disabled={loading}
            onClick={handleCancel}
            className="min-h-11 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Avbryt fältredigering
          </button>
        )}
        <Link
          href={`/maps/${mapSlug}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Tillbaka till området
        </Link>
      </div>
    </div>
  );
}
