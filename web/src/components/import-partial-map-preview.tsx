"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Bbox, CheckoutSelectionGeometry, PolygonRing } from "@/lib/checkout/types";
import { CheckoutSelectionType } from "@/lib/checkout/types";
import type {
  ImportDiffSample,
  ImportEdgeObject,
  ImportPartialAnalysis,
  ImportRiskRemoval,
} from "@/lib/checkout/import-partial-types";
import { IMPORT_RISK_ZONE_M, shrinkBbox } from "@/lib/checkout/import-partial-boundary";
import { bboxFromGeometry } from "@/lib/checkout/overlap";
import { clearPreviewCache, fetchPreviewText } from "@/lib/ocad/preview-fetch";
import { extractSvgInner } from "@/lib/ocad/svg-utils";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  svgUserToGeoPoint,
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
  /** Partial-map SVG (Kanter only). */
  importPreviewUrl?: string | null;
  forceDeleteObjectIndices?: number[];
  onToggleForceDelete?: (objectIndex: number) => void;
  selectedRiskObjectIndex?: number | null;
  onSelectRiskObject?: (objectIndex: number | null) => void;
  onBoundaryCommit?: (boundary: CheckoutSelectionGeometry) => void | Promise<void>;
  boundaryBusy?: boolean;
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
  risk: boolean;
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

function ringToSvgPoints(ring: PolygonRing, transform: SvgRootTransform): string {
  return ring
    .map(([x, y]) => {
      const [sx, sy] = geoToSvgUserPoint([x, y], transform);
      return `${sx},${sy}`;
    })
    .join(" ");
}

function defaultOverlays(mode: Mode): OverlayFlags {
  if (mode === "edges") {
    return { edges: false, removed: false, added: false, modified: false, risk: true };
  }
  if (mode === "diff") {
    return { edges: false, removed: true, added: true, modified: true, risk: false };
  }
  return { edges: false, removed: false, added: false, modified: false, risk: false };
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
        active ? "bg-ifk-blue text-white" : "bg-white text-slate-700 hover:bg-slate-100"
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

function RiskMarkers({
  objects,
  transform,
  radius,
  forceDelete,
  selectedIndex,
  onSelect,
}: {
  objects: ImportRiskRemoval[];
  transform: SvgRootTransform;
  radius: number;
  forceDelete: Set<number>;
  selectedIndex: number | null;
  onSelect?: (objectIndex: number) => void;
}) {
  return (
    <>
      {objects.map((object) => {
        const [cx, cy] = geoToSvgUserPoint(object.centroid, transform);
        const marked = forceDelete.has(object.objectIndex);
        const selected = selectedIndex === object.objectIndex;
        const fill = marked ? "#dc2626" : "#ea580c";
        return (
          <circle
            key={`risk-${object.objectIndex}`}
            cx={cx}
            cy={cy}
            r={selected ? radius * 1.35 : radius}
            fill={fill}
            stroke={selected ? "#1e3a8a" : "#fff"}
            strokeWidth={selected ? 2 : 1}
            vectorEffect="non-scaling-stroke"
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(object.objectIndex);
            }}
          />
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
        const box = showBoxes && change.bbox ? objectSvgBox(change.bbox, transform) : null;
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

function BoundaryOverlay({
  boundary,
  transform,
  draftRing,
}: {
  boundary: CheckoutSelectionGeometry;
  transform: SvgRootTransform;
  draftRing: PolygonRing | null;
}) {
  const outer = bboxFromGeometry(boundary);
  const safe = shrinkBbox(outer, IMPORT_RISK_ZONE_M);
  const ring =
    boundary.type === CheckoutSelectionType.POLYGON ? boundary.ring : null;
  const [minX, minY, maxX, maxY] = geoBboxToSvgUser(bboxToTuple(outer), transform);
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <>
      {ring ? (
        <polygon
          points={ringToSvgPoints(ring, transform)}
          fill="rgba(37, 99, 235, 0.10)"
          stroke="#1d4ed8"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ) : width > 0 && height > 0 ? (
        <rect
          x={minX}
          y={minY}
          width={width}
          height={height}
          fill="rgba(37, 99, 235, 0.12)"
          stroke="#1d4ed8"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ) : null}
      {safe && (
        <rect
          x={geoBboxToSvgUser(bboxToTuple(safe), transform)[0]}
          y={geoBboxToSvgUser(bboxToTuple(safe), transform)[1]}
          width={
            geoBboxToSvgUser(bboxToTuple(safe), transform)[2] -
            geoBboxToSvgUser(bboxToTuple(safe), transform)[0]
          }
          height={
            geoBboxToSvgUser(bboxToTuple(safe), transform)[3] -
            geoBboxToSvgUser(bboxToTuple(safe), transform)[1]
          }
          fill="none"
          stroke="#ea580c"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {draftRing && draftRing.length > 0 && (
        <polyline
          points={ringToSvgPoints(draftRing, transform)}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth={2}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </>
  );
}

export function ImportPartialMapPreview({
  previewUrl,
  analysis,
  mode,
  title,
  areaHref,
  importPreviewUrl = null,
  forceDeleteObjectIndices = [],
  onToggleForceDelete,
  selectedRiskObjectIndex = null,
  onSelectRiskObject,
  onBoundaryCommit,
  boundaryBusy = false,
}: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [scene, setScene] = useState<Scene | null>(null);
  const [importScene, setImportScene] = useState<Scene | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [mapBase, setMapBase] = useState<MapBase>("full");
  const [overlays, setOverlays] = useState<OverlayFlags>(() => defaultOverlays(mode));
  const [baseOpacity, setBaseOpacity] = useState(40);
  const [showImportLayer, setShowImportLayer] = useState(true);
  const [swipePercent, setSwipePercent] = useState(100);
  const [drawPolygon, setDrawPolygon] = useState(false);
  const [draftRing, setDraftRing] = useState<PolygonRing>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const forceDelete = useMemo(
    () => new Set(forceDeleteObjectIndices),
    [forceDeleteObjectIndices],
  );
  const boundary = analysis.boundary ?? {
    type: CheckoutSelectionType.BBOX,
    bbox: analysis.extent,
  };
  const edgesMode = mode === "edges";

  useEffect(() => {
    setOverlays(defaultOverlays(mode));
    setMapBase("full");
    setDrawPolygon(false);
    setDraftRing([]);
    if (mode === "edges") {
      setBaseOpacity(40);
      setShowImportLayer(true);
      setSwipePercent(100);
    }
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
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Kunde inte ladda kartbild");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewUrl, retryKey]);

  useEffect(() => {
    if (!edgesMode || !importPreviewUrl) {
      setImportScene(null);
      setImportStatus("idle");
      setImportError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setImportStatus("loading");
    setImportError(null);
    fetchPreviewText(importPreviewUrl, {
      signal: controller.signal,
      bypassCache: retryKey > 0,
    })
      .then((text) => {
        if (cancelled) return;
        const extracted = extractSvgInner(text);
        if (!extracted.viewBox || !extracted.inner.trim()) {
          throw new Error("Importkartans bild saknar innehåll.");
        }
        setImportScene({
          inner: extracted.inner,
          fill: extracted.fill ?? "transparent",
          fullViewBox: extracted.viewBox,
          transform: extracted.rootTransform,
        });
        setImportStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setImportScene(null);
        setImportStatus("error");
        setImportError(err instanceof Error ? err.message : "Kunde inte ladda importkartan");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [edgesMode, importPreviewUrl, retryKey]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const viewExtent = bboxFromGeometry(boundary);
  const viewBox = useMemo(() => {
    if (!scene) return null;
    return paddedViewBox(viewExtent, scene.transform, scene.fullViewBox);
  }, [viewExtent, scene]);

  /** Same geo framing as head, but in the import SVG's own coordinate system. */
  const importViewBox = useMemo(() => {
    if (!importScene) return null;
    return paddedViewBox(viewExtent, importScene.transform, importScene.fullViewBox);
  }, [viewExtent, importScene]);

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

  function retry() {
    clearPreviewCache(previewUrl);
    if (importPreviewUrl) clearPreviewCache(importPreviewUrl);
    setScene(null);
    setImportScene(null);
    setRetryKey((n) => n + 1);
  }

  function setOverlay(key: keyof OverlayFlags, value: boolean) {
    setOverlays((prev) => ({ ...prev, [key]: value }));
  }

  function clientToSvgUser(clientX: number, clientY: number): [number, number] | null {
    const svg = svgRef.current;
    if (!svg || !viewBox) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return [local.x, local.y];
  }

  function handleMapClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!drawPolygon || !scene) return;
    const svgUser = clientToSvgUser(event.clientX, event.clientY);
    if (!svgUser) return;
    const geo = svgUserToGeoPoint(svgUser, scene.transform);
    setDraftRing((prev) => [...prev, geo]);
  }

  async function finishPolygon() {
    if (draftRing.length < 3 || !onBoundaryCommit) return;
    await onBoundaryCommit({ type: CheckoutSelectionType.POLYGON, ring: draftRing });
    setDraftRing([]);
    setDrawPolygon(false);
  }

  async function resetBoundaryToExtent() {
    if (!onBoundaryCommit) return;
    await onBoundaryCommit({
      type: CheckoutSelectionType.BBOX,
      bbox: analysis.extent,
    });
    setDraftRing([]);
    setDrawPolygon(false);
  }

  const importClip = edgesMode ? `inset(0 ${100 - swipePercent}% 0 0)` : undefined;

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
            {edgesMode && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <SegmentButton
                    active={baseOpacity === 40 && showImportLayer && swipePercent === 100}
                    onClick={() => {
                      setBaseOpacity(40);
                      setShowImportLayer(true);
                      setSwipePercent(100);
                    }}
                  >
                    Jämför
                  </SegmentButton>
                  <SegmentButton
                    active={!showImportLayer || swipePercent === 0}
                    onClick={() => {
                      setShowImportLayer(false);
                      setSwipePercent(0);
                      setBaseOpacity(100);
                    }}
                  >
                    Bara grund
                  </SegmentButton>
                  <SegmentButton
                    active={showImportLayer && swipePercent === 100 && baseOpacity === 0}
                    onClick={() => {
                      setShowImportLayer(true);
                      setSwipePercent(100);
                      setBaseOpacity(0);
                    }}
                  >
                    Bara import
                  </SegmentButton>
                </div>
                <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="w-24 shrink-0">Grundkarta</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={baseOpacity}
                    onChange={(event) => setBaseOpacity(Number(event.target.value))}
                    className="min-w-[8rem] flex-1"
                  />
                  <span className="w-10 text-right tabular-nums">{baseOpacity}%</span>
                </label>
                <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="w-24 shrink-0">Svep import</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={swipePercent}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setSwipePercent(value);
                      setShowImportLayer(value > 0);
                    }}
                    className="min-w-[8rem] flex-1"
                    disabled={!importScene}
                  />
                  <span className="w-10 text-right tabular-nums">{swipePercent}%</span>
                </label>
                {!importPreviewUrl && (
                  <p className="text-xs text-amber-700">
                    Importkartans bild saknas — markörer fungerar ändå.
                  </p>
                )}
                {importPreviewUrl && importStatus === "loading" && (
                  <p className="text-xs text-slate-500">Laddar importkartan…</p>
                )}
                {importPreviewUrl && importStatus === "error" && (
                  <p className="text-xs text-amber-700">
                    {importError ?? "Kunde inte ladda importkartan."}{" "}
                    <button type="button" className="underline" onClick={retry}>
                      Försök igen
                    </button>
                  </p>
                )}
                {importPreviewUrl && importStatus === "ready" && !importScene && (
                  <p className="text-xs text-amber-700">Importkartan kunde inte visas.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <SegmentButton
                    active={drawPolygon}
                    onClick={() => {
                      setDrawPolygon((value) => !value);
                      setDraftRing([]);
                    }}
                  >
                    Rita polygon
                  </SegmentButton>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 disabled:opacity-50"
                    disabled={draftRing.length < 3 || boundaryBusy || !onBoundaryCommit}
                    onClick={() => void finishPolygon()}
                  >
                    Använd polygon
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 disabled:opacity-50"
                    disabled={boundaryBusy || !onBoundaryCommit}
                    onClick={() => void resetBoundaryToExtent()}
                  >
                    Återställ blå ram
                  </button>
                </div>
                {drawPolygon && (
                  <p className="text-xs text-slate-500">
                    Klicka i kartan för hörnpunkter ({draftRing.length} st). Minst tre punkter, sedan
                    «Använd polygon».
                  </p>
                )}
                {boundaryBusy && (
                  <p className="text-xs text-slate-500">Uppdaterar analys efter ny gräns…</p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {mode === "edges" && (
                <>
                  <OverlayCheckbox
                    checked={overlays.risk}
                    onChange={(next) => setOverlay("risk", next)}
                    label="Riskzon"
                    swatch="#ea580c"
                    count={analysis.riskRemovals?.length ?? 0}
                  />
                  <OverlayCheckbox
                    checked={overlays.edges}
                    onChange={(next) => setOverlay("edges", next)}
                    label="Kantobjekt"
                    swatch="#f97316"
                    count={analysis.edgeCount}
                  />
                </>
              )}
              <OverlayCheckbox
                checked={overlays.removed}
                onChange={(next) => setOverlay("removed", next)}
                label="Raderas i original"
                swatch="#dc2626"
                count={analysis.diff.removed}
              />
              <OverlayCheckbox
                checked={overlays.added}
                onChange={(next) => setOverlay("added", next)}
                label="Nya i delkartan"
                swatch="#059669"
                count={analysis.diff.added}
              />
              <OverlayCheckbox
                checked={overlays.modified}
                onChange={(next) => setOverlay("modified", next)}
                label="Ändrade / ersatta"
                swatch="#d97706"
                count={analysis.diff.modified}
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
          <div className="relative h-full w-full">
            {/* Grundkarta — eget SVG-koordinatsystem */}
            {showMapBackground && (
              <svg
                viewBox={viewBox}
                fill={scene.fill}
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid meet"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden
              >
                <g
                  opacity={edgesMode ? baseOpacity / 100 : 1}
                  dangerouslySetInnerHTML={{ __html: scene.inner }}
                />
              </svg>
            )}
            {/* Importkarta — separat viewBox så samma geo-utsnitt syns rätt */}
            {edgesMode && showImportLayer && importScene && importViewBox && (
              <svg
                viewBox={importViewBox}
                fill={importScene.fill}
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid meet"
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ clipPath: importClip }}
                aria-hidden
              >
                <g dangerouslySetInnerHTML={{ __html: importScene.inner }} />
              </svg>
            )}
            {/* Markörer / gräns / klick — alltid i grundkartans koordinater */}
            <svg
              ref={svgRef}
              viewBox={viewBox}
              fill="transparent"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet"
              className={`absolute inset-0 h-full w-full ${drawPolygon ? "cursor-crosshair" : ""}`}
              onClick={handleMapClick}
            >
              <BoundaryOverlay
                boundary={boundary}
                transform={scene.transform}
                draftRing={draftRing}
              />
              {showOverlayControls && overlays.edges && (
                <EdgeMarkers
                  objects={analysis.edgeObjects}
                  transform={scene.transform}
                  radius={markerRadius}
                  showBoxes={showBoxes}
                />
              )}
              {edgesMode && overlays.risk && (analysis.riskRemovals?.length ?? 0) > 0 && (
                <RiskMarkers
                  objects={analysis.riskRemovals}
                  transform={scene.transform}
                  radius={markerRadius}
                  forceDelete={forceDelete}
                  selectedIndex={selectedRiskObjectIndex}
                  onSelect={(objectIndex) => {
                    onSelectRiskObject?.(objectIndex);
                  }}
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
          </div>
        )}
      </div>
    </div>
  );
}
