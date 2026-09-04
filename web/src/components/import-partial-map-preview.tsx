"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Bbox } from "@/lib/checkout/types";
import type {
  ImportDiffSample,
  ImportEdgeObject,
  ImportPartialAnalysis,
} from "@/lib/checkout/import-partial-types";
import { clearPreviewCache, fetchPreviewText } from "@/lib/ocad/preview-fetch";
import { extractSvgInner } from "@/lib/ocad/svg-utils";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";

type Mode = "extent" | "edges" | "diff";
type MapBase = "full" | "affected";

type Props = {
  previewUrl: string;
  analysis: ImportPartialAnalysis;
  mode: Mode;
  title: string;
  areaHref?: string;
};

type Scene = {
  inner: string;
  fill: string;
  fullViewBox: string;
  transform: SvgRootTransform;
};

type OverlayFlags = {
  edges: boolean;
  removed: boolean;
  added: boolean;
  modified: boolean;
};

function bboxToTuple(box: Bbox): [number, number, number, number] {
  return [box.minX, box.minY, box.maxX, box.maxY];
}

function paddedViewBox(
  extent: Bbox,
  transform: SvgRootTransform,
  fallback: string,
): string {
  const [minX, minY, maxX, maxY] = geoBboxToSvgUser(bboxToTuple(extent), transform);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return fallback;
  }
  const padX = width * 0.2;
  const padY = height * 0.2;
  return `${minX - padX} ${minY - padY} ${width + padX * 2} ${height + padY * 2}`;
}

function parseViewBoxSize(viewBox: string): { w: number; h: number } | null {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const w = Math.abs(parts[2]!);
  const h = Math.abs(parts[3]!);
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
}

function objectSvgBox(
  bbox: [number, number, number, number],
  transform: SvgRootTransform,
): { x: number; y: number; width: number; height: number } | null {
  const [minX, minY, maxX, maxY] = geoBboxToSvgUser(bbox, transform);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return null;
  return { x: minX, y: minY, width, height };
}

function defaultOverlays(mode: Mode): OverlayFlags {
  if (mode === "edges") {
    return { edges: true, removed: false, added: false, modified: false };
  }
  if (mode === "diff") {
    return { edges: false, removed: true, added: true, modified: true };
  }
  return { edges: false, removed: false, added: false, modified: false };
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-ifk-blue text-white"
          : "bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function OverlayCheckbox({
  checked,
  onChange,
  label,
  swatch,
  count,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  swatch: string;
  count?: number;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
      <input
        type="checkbox"
        className="rounded border-slate-300"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: swatch }}
        aria-hidden
      />
      <span>
        {label}
        {typeof count === "number" ? ` (${count})` : ""}
      </span>
    </label>
  );
}

function EdgeMarkers({
  objects,
  transform,
  radius,
  showBoxes,
}: {
  objects: ImportEdgeObject[];
  transform: SvgRootTransform;
  radius: number;
  showBoxes: boolean;
}) {
  return (
    <>
      {objects.map((object) => {
        const [cx, cy] = geoToSvgUserPoint(object.centroid, transform);
        const fill = object.likelyClipped ? "#dc2626" : "#f97316";
        const box = showBoxes ? objectSvgBox(object.bbox, transform) : null;
        return (
          <g key={`edge-${object.objectIndex}-${object.symbolNumber}`}>
            {box && (
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={`${fill}33`}
                stroke={fill}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill={fill}
              stroke="#fff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </>
  );
}

function DiffMarkers({
  changes,
  transform,
  radius,
  showBoxes,
  kinds,
}: {
  changes: ImportDiffSample[];
  transform: SvgRootTransform;
  radius: number;
  showBoxes: boolean;
  kinds: { removed: boolean; added: boolean; modified: boolean };
}) {
  return (
    <>
      {changes.map((change, index) => {
        if (change.changeType === "removed" && !kinds.removed) return null;
        if (change.changeType === "added" && !kinds.added) return null;
        if (change.changeType === "modified" && !kinds.modified) return null;

        const fill =
          change.changeType === "added"
            ? "#059669"
            : change.changeType === "removed"
              ? "#dc2626"
              : "#d97706";
        const [cx, cy] = geoToSvgUserPoint(change.centroid, transform);
        const box =
          showBoxes && change.bbox ? objectSvgBox(change.bbox, transform) : null;
        return (
          <g key={`diff-${change.changeType}-${change.objectIndex}-${index}`}>
            {box && (
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={`${fill}33`}
                stroke={fill}
                strokeWidth={change.changeType === "removed" ? 1.5 : 1.25}
                strokeDasharray={change.changeType === "removed" ? "4 3" : undefined}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill={fill}
              stroke="#fff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </>
  );
}

export function ImportPartialMapPreview({ previewUrl, analysis, mode, title, areaHref }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [scene, setScene] = useState<Scene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [mapBase, setMapBase] = useState<MapBase>("full");
  const [overlays, setOverlays] = useState<OverlayFlags>(() => defaultOverlays(mode));

  useEffect(() => {
    setOverlays(defaultOverlays(mode));
    setMapBase("full");
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setSlow(false);

    fetchPreviewText(previewUrl, {
      signal: controller.signal,
      bypassCache: retryKey > 0,
    })
      .then((text) => {
        if (cancelled) return;
        const extracted = extractSvgInner(text);
        if (!extracted.viewBox || !extracted.inner.trim()) {
          throw new Error(
            "Kartbilden saknar innehåll. Öppna området så kartan hinner laddas, och försök igen.",
          );
        }
        setScene({
          inner: extracted.inner,
          fill: extracted.fill ?? "transparent",
          fullViewBox: extracted.viewBox,
          transform: extracted.rootTransform,
        });
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Kunde inte ladda kartbild");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewUrl, retryKey]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const viewBox = useMemo(() => {
    if (!scene) return null;
    return paddedViewBox(analysis.extent, scene.transform, scene.fullViewBox);
  }, [analysis.extent, scene]);

  const frame = useMemo(() => {
    if (!scene) return null;
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(
      bboxToTuple(analysis.extent),
      scene.transform,
    );
    const width = maxX - minX;
    const height = maxY - minY;
    if (!(width > 0) || !(height > 0)) return null;
    return { x: minX, y: minY, width, height };
  }, [analysis.extent, scene]);

  const markerRadius = useMemo(() => {
    if (!viewBox) return 8;
    const size = parseViewBoxSize(viewBox);
    if (!size) return 8;
    return Math.max(size.w, size.h) * 0.008;
  }, [viewBox]);

  const mapChanges = analysis.diff.mapChanges ?? analysis.diff.samples;
  const showOverlayControls = mode === "edges" || mode === "diff";
  const showBoxes = mapBase === "affected";
  const showMapBackground = mapBase === "full";

  const removedCount = analysis.diff.removed;
  const addedCount = analysis.diff.added;
  const modifiedCount = analysis.diff.modified;

  function retry() {
    clearPreviewCache(previewUrl);
    setScene(null);
    setRetryKey((n) => n + 1);
  }

  function setOverlay(key: keyof OverlayFlags, value: boolean) {
    setOverlays((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
        <h3 className="text-sm font-medium text-slate-800">{title}</h3>
        {showOverlayControls && (
          <div className="flex flex-col gap-2">
            <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <SegmentButton active={mapBase === "full"} onClick={() => setMapBase("full")}>
                Hela kartan
              </SegmentButton>
              <SegmentButton
                active={mapBase === "affected"}
                onClick={() => setMapBase("affected")}
              >
                Bara berörda objekt
              </SegmentButton>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {mode === "edges" && (
                <OverlayCheckbox
                  checked={overlays.edges}
                  onChange={(next) => setOverlay("edges", next)}
                  label="Kantobjekt"
                  swatch="#f97316"
                  count={analysis.edgeCount}
                />
              )}
              <OverlayCheckbox
                checked={overlays.removed}
                onChange={(next) => setOverlay("removed", next)}
                label="Raderas i original"
                swatch="#dc2626"
                count={removedCount}
              />
              <OverlayCheckbox
                checked={overlays.added}
                onChange={(next) => setOverlay("added", next)}
                label="Nya i delkartan"
                swatch="#059669"
                count={addedCount}
              />
              <OverlayCheckbox
                checked={overlays.modified}
                onChange={(next) => setOverlay("modified", next)}
                label="Ändrade / ersatta"
                swatch="#d97706"
                count={modifiedCount}
              />
            </div>
          </div>
        )}
      </div>
      <div
        className={`relative flex h-[min(70dvh,560px)] min-h-[280px] items-center justify-center overflow-hidden ${
          showMapBackground ? "bg-white" : "bg-slate-100"
        }`}
      >
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-white text-sm text-slate-600">
            <p>Laddar kartbild…</p>
            {slow && (
              <p className="text-xs text-slate-500">Kartan är stor — det kan ta en stund.</p>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="z-10 flex max-w-md flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-red-600">
              {error ??
                "Kunde inte visa kartan. Öppna området och kontrollera att kartbilden laddas där."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={retry}
              >
                Försök igen
              </button>
              {areaHref && (
                <a
                  href={areaHref}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Öppna området
                </a>
              )}
            </div>
          </div>
        )}
        {scene && viewBox && status === "ready" && (
          <svg
            viewBox={viewBox}
            fill={showMapBackground ? scene.fill : "#f1f5f9"}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full max-h-full max-w-full"
          >
            {showMapBackground && (
              <g dangerouslySetInnerHTML={{ __html: scene.inner }} />
            )}
            {frame && (
              <rect
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                fill="rgba(37, 99, 235, 0.12)"
                stroke="#1d4ed8"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {showOverlayControls && overlays.edges && (
              <EdgeMarkers
                objects={analysis.edgeObjects}
                transform={scene.transform}
                radius={markerRadius}
                showBoxes={showBoxes}
              />
            )}
            {showOverlayControls &&
              (overlays.removed || overlays.added || overlays.modified) && (
                <DiffMarkers
                  changes={mapChanges}
                  transform={scene.transform}
                  radius={markerRadius * 0.85}
                  showBoxes={showBoxes}
                  kinds={{
                    removed: overlays.removed,
                    added: overlays.added,
                    modified: overlays.modified,
                  }}
                />
              )}
          </svg>
        )}
      </div>
    </div>
  );
}
