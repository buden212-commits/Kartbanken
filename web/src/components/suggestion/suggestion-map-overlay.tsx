"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { type SvgRootTransform } from "@/lib/ocad/svg-coords";
import {
  bboxFromSuggestionGeometries,
  liveMapRenderOptions,
  renderSuggestionGeometrySvg,
} from "@/lib/suggestion/geometry";
import type { SuggestionOverlayItem, SuggestionSummary } from "@/lib/suggestion/types";
import { SuggestionListPanel } from "@/components/suggestion/suggestion-list-panel";

export function useSuggestionOverlays(mapSlug: string, mapVersionId?: string | null) {
  const [overlays, setOverlays] = useState<SuggestionOverlayItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({ overlay: "1" });
        if (mapVersionId) {
          params.set("mapVersionId", mapVersionId);
        }
        const res = await fetch(`/api/maps/${mapSlug}/suggestions?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { overlays?: SuggestionOverlayItem[] };
        if (!cancelled) {
          setOverlays(data.overlays ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapSlug, mapVersionId ?? ""]);

  return { overlays, loading };
}

function SuggestionOverlayShape({
  item,
  rootTransform,
  onClick,
}: {
  item: SuggestionOverlayItem;
  rootTransform: SvgRootTransform;
  onClick: () => void;
}) {
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ cursor: "pointer" }}
      data-suggestion-id={item.id}
      dangerouslySetInnerHTML={{
        __html: renderSuggestionGeometrySvg(
          item.geometry,
          rootTransform,
          liveMapRenderOptions({ label: item.markingLabel }),
        ),
      }}
    />
  );
}

export function SuggestionOverlayToggle({
  enabled,
  onChange,
  count,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  count: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-300"
      />
      Visa kartförslag ({count})
    </label>
  );
}

/** Hook returning overlay renderer + toggle UI for embedding in DiffMapPanel. */
export function useSuggestionMapOverlayControls(
  mapSlug: string,
  mapVersionId?: string | null,
  defaultEnabled = true,
) {
  const router = useRouter();
  const [showSuggestions, setShowSuggestions] = useState(defaultEnabled);
  const { overlays } = useSuggestionOverlays(mapSlug, mapVersionId);

  const renderOverlay = useCallback(
    (rootTransform: SvgRootTransform) => {
      if (!showSuggestions || overlays.length === 0) return null;
      return (
        <g data-suggestion-overlay-layer="true">
          {overlays.map((item, index) => (
            <SuggestionOverlayShape
              key={`${item.id}-${index}`}
              item={item}
              rootTransform={rootTransform}
              onClick={() => router.push(`/maps/${mapSlug}/suggestions/${item.id}`)}
            />
          ))}
        </g>
      );
    },
    [showSuggestions, mapSlug, overlays, router],
  );

  const toggle = (
    <SuggestionOverlayToggle
      enabled={showSuggestions}
      onChange={setShowSuggestions}
      count={overlays.length}
    />
  );

  return { overlays, showSuggestions, setShowSuggestions, renderOverlay, toggle };
}

export function SuggestionOverviewMap({
  mapSlug,
  versionId,
  versionNumber,
  fitGeoBbox = null,
}: {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
  fitGeoBbox?: {
    bbox: [number, number, number, number];
    requestId: number;
  } | null;
}) {
  const { renderOverlay, toggle } = useSuggestionMapOverlayControls(mapSlug, null);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Öppna och pågående kartförslag från alla versioner. Kartan visar senaste publicerade
          version (v{versionNumber}). Klicka på en markering för att öppna förslaget.
        </p>
        {toggle}
      </div>
      <DiffMapPanel
        previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
        title="Kartförslag på kartan"
        mapSlug={mapSlug}
        versionId={versionId}
        basemap="tiles"
        exportEnabled={false}
        renderSvgOverlay={renderOverlay}
        fitGeoBbox={fitGeoBbox}
      />
    </div>
  );
}

export function SuggestionAreaSection({
  mapSlug,
  versionId,
  versionNumber,
  suggestions,
  canReview,
  isAdmin,
}: {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
  suggestions: SuggestionSummary[];
  canReview: boolean;
  isAdmin: boolean;
}) {
  const { overlays } = useSuggestionOverlays(mapSlug, null);
  const fitRequestIdRef = useRef(0);
  const [fitGeoBbox, setFitGeoBbox] = useState<{
    bbox: [number, number, number, number];
    requestId: number;
  } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const zoomToSuggestion = useCallback(
    (suggestionId: string) => {
      const geometries = overlays
        .filter((item) => item.id === suggestionId)
        .map((item) => item.geometry);
      const bbox = bboxFromSuggestionGeometries(geometries);
      if (!bbox) return;
      fitRequestIdRef.current += 1;
      setFitGeoBbox({ bbox, requestId: fitRequestIdRef.current });
      setHighlightedId(suggestionId);
    },
    [overlays],
  );

  return (
    <>
      <section className="mt-10">
        <h2 className="text-lg font-medium text-slate-900">Kartförslag på kartan</h2>
        <div className="mt-2">
          <SuggestionOverviewMap
            mapSlug={mapSlug}
            versionId={versionId}
            versionNumber={versionNumber}
            fitGeoBbox={fitGeoBbox}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Klicka på ett kartförslag i listan nedan för att zooma kartan till markeringen.
        </p>
      </section>

      <SuggestionListPanel
        mapSlug={mapSlug}
        suggestions={suggestions}
        canReview={canReview}
        isAdmin={isAdmin}
        publishedVersionId={versionId}
        onZoomToSuggestion={zoomToSuggestion}
        highlightedSuggestionId={highlightedId}
        publishedVersionNumber={versionNumber}
      />
    </>
  );
}
