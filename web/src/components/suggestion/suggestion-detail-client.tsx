"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { renderSuggestionGeometrySvg } from "@/lib/suggestion/geometry";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  SuggestionStatus,
  type SuggestionDetail,
  type SuggestionStatusValue,
} from "@/lib/suggestion/types";
import { formatDate } from "@/lib/format";

type CheckoutOption = {
  id: string;
  label: string;
  integratedVersionId: string | null;
};

type VersionOption = {
  id: string;
  versionNumber: number;
};

type Props = {
  mapSlug: string;
  mapTitle: string;
  suggestion: SuggestionDetail;
  canReview: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  checkoutOptions: CheckoutOption[];
  publishedVersions: VersionOption[];
};

function statusBadgeClass(status: SuggestionStatusValue): string {
  switch (status) {
    case SuggestionStatus.OPEN:
      return "bg-amber-50 text-amber-800 border-amber-200";
    case SuggestionStatus.IN_PROGRESS:
      return "bg-sky-50 text-sky-800 border-sky-200";
    case SuggestionStatus.IMPLEMENTED:
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function SuggestionDetailClient({
  mapSlug,
  mapTitle,
  suggestion: initial,
  canReview,
  isOwner,
  isAdmin,
  checkoutOptions,
  publishedVersions,
}: Props) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState(initial);
  const [reviewComment, setReviewComment] = useState("");
  const [selectedCheckoutId, setSelectedCheckoutId] = useState("");
  const [selectedIntegratedVersionId, setSelectedIntegratedVersionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const marking = suggestion.objects[0]?.geometry;
  const canDelete =
    isAdmin || (isOwner && suggestion.status === SuggestionStatus.OPEN);
  const canReviewNow =
    canReview &&
    (suggestion.status === SuggestionStatus.OPEN ||
      suggestion.status === SuggestionStatus.IN_PROGRESS);

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
    const body: Record<string, unknown> = {
      status,
      reviewComment: reviewComment.trim() || undefined,
    };
    if (status === SuggestionStatus.IMPLEMENTED) {
      if (selectedCheckoutId) body.checkoutId = selectedCheckoutId;
      if (selectedIntegratedVersionId) {
        body.integratedVersionId = selectedIntegratedVersionId;
      }
    }
    await patchSuggestion(body);
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
          {suggestion.appliesToOlderVersion && (
            <p className="mt-1 text-sm font-medium text-violet-700">
              Gäller version {suggestion.versionNumber}
            </p>
          )}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-medium ${statusBadgeClass(suggestion.status)}`}
        >
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
        {suggestion.hasAttachment && (
          <div>
            <span className="font-medium text-slate-900">Foto:</span>
            <img
              src={`/api/maps/${mapSlug}/suggestions/${suggestion.id}/attachment`}
              alt="Bilaga till kartförslag"
              className="mt-2 max-h-64 rounded-lg border border-slate-200 object-contain"
            />
          </div>
        )}
      </div>

      <div className="mt-6">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${suggestion.mapVersionId}/preview`}
          title="Plats på kartan"
          mapSlug={mapSlug}
          versionId={suggestion.mapVersionId}
          renderSvgOverlay={(rootTransform) => {
            if (!marking) return null;
            return (
              <g
                dangerouslySetInnerHTML={{
                  __html: renderSuggestionGeometrySvg(marking, rootTransform, {
                    label: overlayLabel,
                    selected: true,
                  }),
                }}
              />
            );
          }}
        />
      </div>

      {canReviewNow && (
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

          {checkoutOptions.length > 0 && (
            <div>
              <label htmlFor="checkoutId" className="form-label">
                Koppla checkout (valfritt, vid införande)
              </label>
              <select
                id="checkoutId"
                value={selectedCheckoutId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCheckoutId(id);
                  const match = checkoutOptions.find((c) => c.id === id);
                  if (match?.integratedVersionId) {
                    setSelectedIntegratedVersionId(match.integratedVersionId);
                  }
                }}
                className="form-input"
              >
                <option value="">— Ingen checkout —</option>
                {checkoutOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {publishedVersions.length > 0 && (
            <div>
              <label htmlFor="integratedVersionId" className="form-label">
                Införd i version (valfritt)
              </label>
              <select
                id="integratedVersionId"
                value={selectedIntegratedVersionId}
                onChange={(e) => setSelectedIntegratedVersionId(e.target.value)}
                className="form-input"
              >
                <option value="">— Välj version —</option>
                {publishedVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleReview(SuggestionStatus.IN_PROGRESS)}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm text-sky-800 hover:bg-sky-50"
            >
              Markera som pågår
            </button>
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
