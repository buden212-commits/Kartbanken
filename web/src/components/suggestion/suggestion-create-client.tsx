"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import { IDENTITY_SVG_TRANSFORM, svgUserToGeoPoint, type SvgRootTransform } from "@/lib/ocad/svg-coords";
import { renderSuggestionPinSvg } from "@/lib/suggestion/geometry";
import {
  SUGGESTION_CATEGORY_LABELS,
  type SuggestionCategoryValue,
  type SuggestionPointGeometry,
} from "@/lib/suggestion/types";

type Props = {
  mapSlug: string;
  mapTitle: string;
  versionId: string;
  versionNumber: number;
};

export function SuggestionCreateClient({
  mapSlug,
  mapTitle,
  versionId,
  versionNumber,
}: Props) {
  const router = useRouter();
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const [pin, setPin] = useState<SuggestionPointGeometry | null>(null);
  const [category, setCategory] = useState<SuggestionCategoryValue>("FEL_I_TERRANG");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent, svg: SVGSVGElement) => {
    const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
    if (!pt) return;
    const geo = svgUserToGeoPoint(pt, rootTransformRef.current);
    setPin({ type: "Point", coordinates: geo });
    setError(null);
  }, []);

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: () => {},
      onPointerUp: () => {},
    }),
    [handlePointerDown],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) {
      setError("Klicka på kartan för att placera en markering");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapVersionId: versionId,
          category,
          title: title.trim() || undefined,
          comment,
          geometry: pin,
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte spara kartförslaget");
      }
      router.push(`/maps/${mapSlug}/suggestions/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara kartförslaget");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}/versions/${versionId}`} className="link-muted text-sm">
        ← Tillbaka till kartvy
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold text-slate-900">Föreslå kartändring</h1>
        <p className="mt-2 text-sm text-slate-600">
          {mapTitle} · v{versionNumber}. Klicka på kartan för att markera platsen, skriv vad som
          bör ändras och spara. Förslaget påverkar inte kartfilen — en redaktör granskar det
          separat.
        </p>
      </div>

      <div className="mt-6">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
          title="Markera plats"
          mapSlug={mapSlug}
          versionId={versionId}
          interactionMode="draw"
          drawPointerHandlers={drawPointerHandlers}
          renderSvgOverlay={(rootTransform) => {
            rootTransformRef.current = rootTransform;
            if (!pin) return null;
            return (
              <g
                dangerouslySetInnerHTML={{
                  __html: renderSuggestionPinSvg(pin, rootTransform, { label: "FÖRSLAG" }),
                }}
              />
            );
          }}
          secondaryHeaderContent={
            <p className="text-xs text-amber-700">
              Ritläge — klicka på kartan för att placera markeringen.
              {pin ? " Markering placerad." : " Ingen markering ännu."}
            </p>
          }
        />
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="card mt-6 space-y-4">
        <div>
          <label htmlFor="category" className="form-label">
            Kategori
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SuggestionCategoryValue)}
            className="form-input"
          >
            {Object.entries(SUGGESTION_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="title" className="form-label">
            Rubrik (valfritt)
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="form-input"
            placeholder="Kort sammanfattning"
          />
        </div>
        <div>
          <label htmlFor="comment" className="form-label">
            Beskrivning
          </label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
            minLength={10}
            rows={4}
            className="form-input"
            placeholder="Beskriv vad som är fel, saknas eller bör förklaras (minst 10 tecken)."
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Sparar…" : "Skicka kartförslag"}
          </button>
          <Link
            href={`/maps/${mapSlug}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Avbryt
          </Link>
        </div>
      </form>
    </div>
  );
}
