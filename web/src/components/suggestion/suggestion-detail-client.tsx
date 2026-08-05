"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { renderSuggestionPinSvg } from "@/lib/suggestion/geometry";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  SuggestionStatus,
  type SuggestionDetail,
  type SuggestionStatusValue,
} from "@/lib/suggestion/types";
import { formatDate } from "@/lib/format";

type Props = {
  mapSlug: string;
  mapTitle: string;
  suggestion: SuggestionDetail;
  canReview: boolean;
  isOwner: boolean;
  isAdmin: boolean;
};

export function SuggestionDetailClient({
  mapSlug,
  mapTitle,
  suggestion: initial,
  canReview,
  isOwner,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState(initial);
  const [reviewComment, setReviewComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pin = suggestion.objects[0]?.geometry;
  const canDelete =
    isAdmin || (isOwner && suggestion.status === SuggestionStatus.OPEN);

  const statusClass =
    suggestion.status === SuggestionStatus.OPEN
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : suggestion.status === SuggestionStatus.IMPLEMENTED
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  const overlayLabel = useMemo(
    () => SUGGESTION_CATEGORY_LABELS[suggestion.category],
    [suggestion.category],
  );

  async function patchSuggestion(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/suggestions/${suggestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as SuggestionDetail & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte uppdatera förslaget");
      }
      setSuggestion(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera förslaget");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(status: SuggestionStatusValue) {
    await patchSuggestion({
      status,
      reviewComment: reviewComment.trim() || undefined,
    });
  }

  async function handleDelete() {
    if (!window.confirm("Radera detta kartförslag?")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/suggestions/${suggestion.id}`, {
      method: "DELETE",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kunde inte radera");
      return;
    }
    router.push(`/maps/${mapSlug}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}`} className="link-muted text-sm">
        ← {mapTitle}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {suggestion.title?.trim() || "Kartförslag"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            v{suggestion.versionNumber} · {SUGGESTION_CATEGORY_LABELS[suggestion.category]} ·{" "}
            {formatDate(suggestion.createdAt)}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusClass}`}>
          {SUGGESTION_STATUS_LABELS[suggestion.status]}
        </span>
      </div>

      <div className="card mt-6 space-y-3 text-sm text-slate-700">
        <p>
          <span className="font-medium text-slate-900">Skapad av:</span>{" "}
          {suggestion.createdBy.name?.trim() || suggestion.createdBy.email}
        </p>
        <p className="whitespace-pre-wrap">{suggestion.comment}</p>
        {suggestion.reviewComment && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="font-medium text-slate-900">Granskning:</span>{" "}
            {suggestion.reviewComment}
          </p>
        )}
        {suggestion.integratedVersionNumber != null && (
          <p>
            <span className="font-medium text-slate-900">Införd i version:</span> v
            {suggestion.integratedVersionNumber}
          </p>
        )}
      </div>

      <div className="mt-6">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${suggestion.mapVersionId}/preview`}
          title="Plats på kartan"
          mapSlug={mapSlug}
          versionId={suggestion.mapVersionId}
          renderSvgOverlay={(rootTransform) => {
            if (!pin || pin.type !== "Point") return null;
            return (
              <g
                dangerouslySetInnerHTML={{
                  __html: renderSuggestionPinSvg(pin, rootTransform, {
                    label: overlayLabel,
                    selected: true,
                  }),
                }}
              />
            );
          }}
        />
      </div>

      {canReview && suggestion.status === SuggestionStatus.OPEN && (
        <div className="card mt-6 space-y-4">
          <h2 className="text-lg font-medium text-slate-900">Granska förslag</h2>
          <div>
            <label htmlFor="reviewComment" className="form-label">
              Kommentar till skaparen (krävs vid avvisning)
            </label>
            <textarea
              id="reviewComment"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              className="form-input"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleReview(SuggestionStatus.IMPLEMENTED)}
              className="btn-primary"
            >
              Markera som införd
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleReview(SuggestionStatus.REJECTED)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Avvisa
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {canDelete && (
        <div className="mt-6">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleDelete()}
            className="text-sm text-red-600 hover:underline"
          >
            Radera kartförslag
          </button>
        </div>
      )}
    </div>
  );
}
