"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DiffMapPanel } from "@/components/diff-map-panel";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import {
  geoRingToSvgPoints,
  SUGGESTION_ORANGE,
  SUGGESTION_ORANGE_STROKE,
} from "@/lib/suggestion/geometry";
import type { SuggestionGeometry, SuggestionOverlayItem } from "@/lib/suggestion/types";

export function useSuggestionOverlays(mapSlug: string, mapVersionId: string) {
  const [overlays, setOverlays] = useState<SuggestionOverlayItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/maps/${mapSlug}/suggestions?overlay=1&mapVersionId=${encodeURIComponent(mapVersionId)}`,
        );
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
  }, [mapSlug, mapVersionId]);

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
  const { geometry } = item;
  const commonProps = {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick();
    },
    style: { cursor: "pointer" as const },
    "data-suggestion-id": item.id,
  };

  if (geometry.type === "Point") {
    const [x, y] = geoToSvgUserPoint(geometry.coordinates, rootTransform);
    return (
      <g {...commonProps}>
        <circle cx={x} cy={y} r={14} fill={SUGGESTION_ORANGE} fillOpacity={0.25} stroke="none" />
        <circle
          cx={x}
          cy={y}
          r={10}
          fill={SUGGESTION_ORANGE}
          fillOpacity={0.9}
          stroke={SUGGESTION_ORANGE_STROKE}
          strokeWidth={2}
        />
      </g>
    );
  }

  if (geometry.type === "Bbox") {
    const { minX, minY, maxX, maxY } = geometry.bbox;
    const [svgMinX, svgMinY, svgMaxX, svgMaxY] = geoBboxToSvgUser(
      [minX, minY, maxX, maxY],
      rootTransform,
    );
    const x = Math.min(svgMinX, svgMaxX);
    const y = Math.min(svgMinY, svgMaxY);
    const width = Math.abs(svgMaxX - svgMinX);
    const height = Math.abs(svgMaxY - svgMinY);
    return (
      <rect
        {...commonProps}
        x={x}
        y={y}
        width={width}
        height={height}
        fill={SUGGESTION_ORANGE}
        fillOpacity={0.25}
        stroke={SUGGESTION_ORANGE_STROKE}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    );
  }

  if (geometry.type === "Polygon") {
    return (
      <polygon
        {...commonProps}
        points={geoRingToSvgPoints(geometry.ring, rootTransform)}
        fill={SUGGESTION_ORANGE}
        fillOpacity={0.25}
        stroke={SUGGESTION_ORANGE_STROKE}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    );
  }

  return (
    <polyline
      {...commonProps}
      points={geoRingToSvgPoints(geometry.coordinates, rootTransform)}
      fill="none"
      stroke={SUGGESTION_ORANGE_STROKE}
      strokeWidth={2}
      strokeDasharray="6 4"
      strokeLinecap="round"
      strokeLinejoin="round"
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
  mapVersionId: string,
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
}: {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
}) {
  const { renderOverlay, toggle } = useSuggestionMapOverlayControls(mapSlug, versionId);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Öppna och pågående kartförslag på senaste publicerade version (v{versionNumber}).
          Klicka på en markering för att öppna förslaget.
        </p>
        {toggle}
      </div>
      <DiffMapPanel
        previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
        title="Kartförslag på kartan"
        mapSlug={mapSlug}
        versionId={versionId}
        renderSvgOverlay={renderOverlay}
      />
    </div>
  );
}
