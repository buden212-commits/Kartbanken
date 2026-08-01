"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { ChangeType } from "@/lib/ocad/diff-types";
import { formatChangeCentroid } from "@/lib/ocad/change-utils";
import { findChangeAtPoint, parseViewBoxString, screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  IDENTITY_SVG_TRANSFORM,
  mapPointToScreen,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import { extractSvgInner, type OcadMapLayer } from "@/lib/ocad/svg-utils";
import { flattenOcadLayers, initialLayerVisibility } from "@/lib/ocad/layers";
import { MapLayerPanel } from "@/components/map-layer-panel";
import {
  createExportFrame,
  downloadMapOcd,
  downloadMapPdf,
  exportFrameBbox,
  pointInExportFrame,
  type ExportFrame,
  type ExportSettings,
} from "@/lib/ocad/map-export";
import { defaultOcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import { clearPreviewCache, fetchPreviewText } from "@/lib/ocad/preview-fetch";
import { MapExportControls } from "@/components/map-export-controls";

type Bbox = [number, number, number, number];

type FocusTarget = {
  bbox: Bbox;
  centroid: [number, number];
  objectType: "point" | "line" | "area" | "text" | "unknown";
};

const CHANGE_LABELS: Record<ChangeType, string> = {
  added: "Tillagd",
  removed: "Borttagen",
  modified: "Ändrad",
};

const CHANGE_COLORS: Record<ChangeType, string> = {
  added: "text-emerald-600",
  removed: "text-red-600",
  modified: "text-amber-600",
};

const OBJECT_TYPE_LABELS: Record<OcadObjectChange["type"], string> = {
  point: "Punkt",
  line: "Linje",
  area: "Yta",
  text: "Text",
  unknown: "Okänd",
};

type ClickableItem = {
  change: OcadObjectChange;
  index: number;
};

type Props = {
  previewUrl: string;
  title: string;
  mapSlug: string;
  versionId: string;
  exportEnabled?: boolean;
  focusTarget?: FocusTarget | null;
  selectedChange?: OcadObjectChange | null;
  clickableItems?: ClickableItem[];
  onClearFocus?: () => void;
  onObjectClick?: (changeIndex: number) => void;
};

const MAX_ZOOM = 30;
const MIN_ZOOM = 0.2;
const INITIAL_ZOOM = 4;
const POINT_ZOOM = 30;
const POINT_HIGHLIGHT_RADIUS_M = 5; // 10 m diameter in map units (meters)
const DRAG_THRESHOLD_PX = 5;

type HighlightShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number };

function buildHighlightShape(
  focusTarget: FocusTarget,
  rootTransform: SvgRootTransform,
): HighlightShape {
  if (focusTarget.objectType === "point" || focusTarget.objectType === "text") {
    const [cx, cy] = geoToSvgUserPoint(focusTarget.centroid, rootTransform);
    return { kind: "circle", cx, cy, r: POINT_HIGHLIGHT_RADIUS_M };
  }

  const [minX, minY, maxX, maxY] = geoBboxToSvgUser(focusTarget.bbox, rootTransform);
  return {
    kind: "rect",
    x: minX,
    y: minY,
    w: Math.max(maxX - minX, 2),
    h: Math.max(maxY - minY, 2),
  };
}

function focusOnTarget(
  target: FocusTarget,
  rootTransform: SvgRootTransform,
  viewBox: string,
  containerWidth: number,
  containerHeight: number,
): { pan: { x: number; y: number }; zoom: number } {
  const [svgX, svgY] = geoToSvgUserPoint(target.centroid, rootTransform);
  const screen0 = mapPointToScreen(svgX, svgY, viewBox, containerWidth, containerHeight);

  let targetZoom = POINT_ZOOM;
  if (target.objectType !== "point") {
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(target.bbox, rootTransform);
    const bw = Math.max(maxX - minX, 5) * 1.4;
    const bh = Math.max(maxY - minY, 5) * 1.4;
    const vb = parseViewBoxString(viewBox);
    if (vb) {
      const renderScale = Math.min(containerWidth / vb.width, containerHeight / vb.height);
      const visibleW = containerWidth / renderScale;
      const visibleH = containerHeight / renderScale;
      targetZoom = Math.min(visibleW / bw, visibleH / bh) * 0.85;
      targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
    }
  }

  const focalX = containerWidth / 2;
  const focalY = containerHeight / 2;

  return {
    pan: {
      x: focalX - screen0[0] * targetZoom,
      y: focalY - screen0[1] * targetZoom,
    },
    zoom: targetZoom,
  };
}

function zoomAtPoint(
  prevZoom: number,
  factor: number,
  prevPan: { x: number; y: number },
  focalX: number,
  focalY: number,
): { zoom: number; pan: { x: number; y: number } } {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
  const ratio = nextZoom / prevZoom;
  return {
    zoom: nextZoom,
    pan: {
      x: focalX - (focalX - prevPan.x) * ratio,
      y: focalY - (focalY - prevPan.y) * ratio,
    },
  };
}

export function DiffMapPanel({
  previewUrl,
  title,
  mapSlug,
  versionId,
  exportEnabled = true,
  focusTarget,
  selectedChange,
  clickableItems = [],
  onClearFocus,
  onObjectClick,
}: Props) {
  const [svgInner, setSvgInner] = useState<string | null>(null);
  const [svgFill, setSvgFill] = useState("transparent");
  const [fullViewBox, setFullViewBox] = useState<string | null>(null);
  const [rootTransform, setRootTransform] = useState<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [clickHint, setClickHint] = useState<string | null>(null);
  const [fullSvgText, setFullSvgText] = useState<string | null>(null);
  const [ocadMapScale, setOcadMapScale] = useState<number>(15000);
  const [exportMode, setExportMode] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    scale: 10000,
    format: "A4",
    orientation: "portrait",
    outputFormat: "pdf",
    ocadVersion: 12,
  });
  const [exportFrame, setExportFrame] = useState<ExportFrame | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const frameDragRef = useRef<{
    startSvgX: number;
    startSvgY: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [mapLayers, setMapLayers] = useState<OcadMapLayer[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSvgInner(null);
    setFullViewBox(null);
    setFullSvgText(null);
    setMapLayers([]);
    setLayerVisibility({});

    fetchPreviewText(previewUrl, { signal: controller.signal })
      .then((text) => {
        if (cancelled) return;
        const {
          inner,
          viewBox,
          fill,
          ocadMapScale: mapScale,
          ocadFileVersion,
          ocadLayers,
          rootTransform: transform,
        } = extractSvgInner(text);
        setSvgInner(inner);
        setSvgFill(fill ?? "transparent");
        setFullViewBox(viewBox);
        setRootTransform(transform);
        setOcadMapScale(mapScale ?? 15000);
        setMapLayers(ocadLayers);
        setLayerVisibility(initialLayerVisibility(ocadLayers));
        setExportSettings((prev) => ({
          ...prev,
          ocadVersion: defaultOcadExportVersion(ocadFileVersion),
        }));
        setFullSvgText(text);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Fel vid laddning");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewUrl, reloadKey]);

  const retryPreviewLoad = useCallback(() => {
    clearPreviewCache(previewUrl);
    setReloadKey((key) => key + 1);
  }, [previewUrl]);

  const toggleLayer = useCallback((layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: prev[layerId] === false,
    }));
  }, []);

  const showAllLayers = useCallback(() => {
    setLayerVisibility(
      Object.fromEntries(flattenOcadLayers(mapLayers).map((layer) => [layer.id, true])),
    );
  }, [mapLayers]);

  const hideAllLayers = useCallback(() => {
    setLayerVisibility(
      Object.fromEntries(flattenOcadLayers(mapLayers).map((layer) => [layer.id, false])),
    );
  }, [mapLayers]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !svgInner || mapLayers.length === 0) return;

    const flat = flattenOcadLayers(mapLayers);
    const groupVisibility = new Map<number, boolean>();
    for (const layer of flat) {
      if (layer.kind === "group") {
        groupVisibility.set(layer.groupId, layerVisibility[layer.id] !== false);
      }
    }

    for (const layer of flat) {
      if (layer.kind === "symbol") {
        const el = svg.querySelector(`[data-ocad-layer-id="${layer.id}"]`);
        if (!(el instanceof SVGGElement)) continue;
        const groupOn =
          layer.groupId < 0 ? true : groupVisibility.get(layer.groupId) !== false;
        const symbolOn = layerVisibility[layer.id] !== false;
        el.style.display = groupOn && symbolOn ? "" : "none";
        continue;
      }

      if (layer.kind === "group") {
        const el =
          svg.querySelector(`[data-ocad-layer-id="${layer.id}"]`) ??
          (layer.groupId >= 0
            ? svg.querySelector(`[data-ocad-layer="${layer.groupId}"]`)
            : null);
        if (el instanceof SVGGElement) {
          el.style.display = layerVisibility[layer.id] === false ? "none" : "";
        }
      }
    }
  }, [mapLayers, layerVisibility, svgInner]);

  const initExportFrame = useCallback(() => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (!svg || !viewport) return null;

    const rect = viewport.getBoundingClientRect();
    const center = screenToSvgPoint(svg, rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!center) return null;

    return createExportFrame(center[0], center[1], exportSettings, ocadMapScale);
  }, [exportSettings, ocadMapScale]);

  const startExportMode = useCallback(() => {
    setExportError(null);
    setExportMode(true);
    requestAnimationFrame(() => {
      const frame = initExportFrame();
      if (frame) setExportFrame(frame);
    });
  }, [initExportFrame]);

  const cancelExportMode = useCallback(() => {
    setExportMode(false);
    setExportFrame(null);
    setExportError(null);
    setExporting(false);
    frameDragRef.current = null;
  }, []);

  useEffect(() => {
    if (!exportMode || !exportFrame) return;
    setExportFrame((prev) => {
      if (!prev) return prev;
      return createExportFrame(prev.centerX, prev.centerY, exportSettings, ocadMapScale);
    });
  }, [exportSettings, exportMode, ocadMapScale]);

  const handleExport = useCallback(async () => {
    if (!exportFrame) return;
    setExporting(true);
    setExportError(null);
    try {
      const safeTitle = title.replace(/[^\w\s-åäöÅÄÖ]/g, "").trim() || "karta";

      if (exportSettings.outputFormat === "ocd") {
        const { versionWarning } = await downloadMapOcd(
          mapSlug,
          versionId,
          exportFrame,
          exportSettings.ocadVersion,
          `${safeTitle}-${exportSettings.scale}`,
        );
        if (versionWarning) {
          window.alert(versionWarning);
        }
      } else {
        if (!fullSvgText) return;
        await downloadMapPdf(fullSvgText, exportFrame, `${safeTitle}-${exportSettings.scale}`);
      }

      cancelExportMode();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setExporting(false);
    }
  }, [
    fullSvgText,
    exportFrame,
    title,
    exportSettings,
    mapSlug,
    versionId,
    cancelExportMode,
  ]);

  const viewStateRef = useRef({ pan: { x: 0, y: 0 }, zoom: INITIAL_ZOOM });
  viewStateRef.current = { pan, zoom };

  useEffect(() => {
    if (!fullViewBox || loading) return;

    if (!focusTarget) {
      setPan({ x: 0, y: 0 });
      setZoom(INITIAL_ZOOM);
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const { pan: nextPan, zoom: nextZoom } = focusOnTarget(
      focusTarget,
      rootTransform,
      fullViewBox,
      rect.width,
      rect.height,
    );
    setPan(nextPan);
    setZoom(nextZoom);
  }, [focusTarget, fullViewBox, loading, rootTransform]);

  const adjustZoom = useCallback((factor: number, focal?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const focalX = focal?.x ?? rect.width / 2;
    const focalY = focal?.y ?? rect.height / 2;
    const { pan: prevPan, zoom: prevZoom } = viewStateRef.current;
    const next = zoomAtPoint(prevZoom, factor, prevPan, focalX, focalY);
    setZoom(next.zoom);
    setPan(next.pan);
  }, []);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  const showClickHint = useCallback((message: string) => {
    setClickHint(message);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setClickHint(null), 2500);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      adjustZoom(delta, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [adjustZoom],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (exportMode && exportFrame && svgRef.current) {
        const pt = screenToSvgPoint(svgRef.current, e.clientX, e.clientY);
        if (pt && pointInExportFrame(pt[0], pt[1], exportFrame)) {
          frameDragRef.current = {
            startSvgX: pt[0],
            startSvgY: pt[1],
            centerX: exportFrame.centerX,
            centerY: exportFrame.centerY,
          };
          e.preventDefault();
          return;
        }
      }

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
        moved: false,
      };
    },
    [exportMode, exportFrame, pan.x, pan.y],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const frameDrag = frameDragRef.current;
      if (frameDrag && svgRef.current) {
        const pt = screenToSvgPoint(svgRef.current, e.clientX, e.clientY);
        if (pt) {
          const dx = pt[0] - frameDrag.startSvgX;
          const dy = pt[1] - frameDrag.startSvgY;
          const nextCenterX = frameDrag.centerX + dx;
          const nextCenterY = frameDrag.centerY + dy;
          setExportFrame((prev) =>
            prev
              ? createExportFrame(nextCenterX, nextCenterY, exportSettings, ocadMapScale)
              : prev,
          );
        }
        return;
      }

      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragRef.current.moved = true;
      }
      setPan({
        x: dragRef.current.panX + dx,
        y: dragRef.current.panY + dy,
      });
    },
    [exportSettings, ocadMapScale],
  );

  const handleMapClick = useCallback(
    (e: React.MouseEvent) => {
      if (exportMode) return;
      if (!onObjectClick || !svgRef.current || clickableItems.length === 0) return;

      const mapPoint = screenToSvgPoint(svgRef.current, e.clientX, e.clientY);
      if (!mapPoint) return;

      const viewBox = parseViewBoxString(fullViewBox);
      const changes = clickableItems.map((item) => item.change);
      const hit = findChangeAtPoint(mapPoint, changes, viewBox, rootTransform);

      if (hit) {
        const globalIndex = clickableItems[hit.index]?.index;
        if (globalIndex !== undefined) {
          onObjectClick(globalIndex);
        }
        setClickHint(null);
        return;
      }

      showClickHint("Inget ändrat objekt vid denna punkt.");
    },
    [fullViewBox, clickableItems, onObjectClick, showClickHint, rootTransform, exportMode],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (frameDragRef.current) {
        frameDragRef.current = null;
        return;
      }
      if (!dragRef.current) return;
      const wasClick = !dragRef.current.moved;
      dragRef.current = null;
      if (wasClick) handleMapClick(e);
    },
    [handleMapClick],
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const highlightShape = focusTarget ? buildHighlightShape(focusTarget, rootTransform) : null;
  const exportBbox = exportFrame ? exportFrameBbox(exportFrame) : null;

  const infoChange = selectedChange ?? null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h3 className="text-sm font-medium text-slate-800">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => adjustZoom(0.8)}
            className="rounded border border-slate-300 px-2 py-0.5 transition hover:border-ifk-blue hover:text-ifk-blue"
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => adjustZoom(1.25)}
            className="rounded border border-slate-300 px-2 py-0.5 transition hover:border-ifk-blue hover:text-ifk-blue"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded border border-slate-300 px-2 py-0.5 transition hover:border-ifk-blue hover:text-ifk-blue"
          >
            Hela kartan
          </button>
          {focusTarget && onClearFocus && (
            <button
              type="button"
              onClick={onClearFocus}
              className="rounded border border-ifk-blue/30 bg-ifk-blue-pale px-2 py-0.5 text-ifk-blue transition hover:border-ifk-blue"
            >
              Avmarkera
            </button>
          )}
          {!exportMode && exportEnabled && (
            <button
              type="button"
              onClick={startExportMode}
              disabled={loading || !fullSvgText}
              className="rounded border border-ifk-blue/30 bg-ifk-blue-pale px-2 py-0.5 text-ifk-blue transition hover:border-ifk-blue disabled:opacity-40"
            >
              Exportera
            </button>
          )}
        </div>
      </div>

      {exportMode && (
        <MapExportControls
          settings={exportSettings}
          onChange={setExportSettings}
          onExport={handleExport}
          onCancel={cancelExportMode}
          exporting={exporting}
          error={exportError}
        />
      )}

      <div
        ref={viewportRef}
        className={`relative h-[480px] overflow-hidden bg-white ${exportMode ? "cursor-default" : "cursor-crosshair active:cursor-grabbing"}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 text-sm text-slate-600">
            Laddar kartbild…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 px-6 text-center text-sm text-red-600">
            <p>{error}</p>
            <button
              type="button"
              onClick={retryPreviewLoad}
              className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 transition hover:border-ifk-blue hover:text-ifk-blue"
            >
              Försök igen
            </button>
          </div>
        )}
        {svgInner && fullViewBox && (
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg
              ref={svgRef}
              viewBox={fullViewBox}
              fill={svgFill}
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet"
              className="h-full w-full max-h-full max-w-full"
            >
              {highlightShape?.kind === "circle" && (
                <circle
                  cx={highlightShape.cx}
                  cy={highlightShape.cy}
                  r={highlightShape.r}
                  fill="rgba(0, 76, 136, 0.2)"
                  stroke="#004C88"
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {highlightShape?.kind === "rect" && (
                <rect
                  x={highlightShape.x}
                  y={highlightShape.y}
                  width={highlightShape.w}
                  height={highlightShape.h}
                  fill="rgba(0, 76, 136, 0.2)"
                  stroke="#004C88"
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {exportMode && exportBbox && (
                <rect
                  x={exportBbox.x}
                  y={exportBbox.y}
                  width={exportBbox.width}
                  height={exportBbox.height}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
              <g dangerouslySetInnerHTML={{ __html: svgInner }} />
            </svg>
          </div>
        )}

        {infoChange && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-xs rounded-lg border border-slate-200 bg-white/95 p-3 text-sm shadow-lg backdrop-blur">
            <p className={`font-medium ${CHANGE_COLORS[infoChange.changeType]}`}>
              {CHANGE_LABELS[infoChange.changeType]}
            </p>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex gap-2">
                <dt className="text-slate-500">Symbol</dt>
                <dd className="font-mono text-slate-800">
                  {infoChange.symbolNumber} · {infoChange.symbolName}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">Typ</dt>
                <dd className="text-slate-800">{OBJECT_TYPE_LABELS[infoChange.type]}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">Position</dt>
                <dd className="font-mono text-slate-700">
                  {formatChangeCentroid(infoChange)}
                </dd>
              </div>
              {infoChange.text && (
                <div className="flex gap-2">
                  <dt className="text-slate-500">Text</dt>
                  <dd className="text-slate-800">&quot;{infoChange.text}&quot;</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {clickHint && !infoChange && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-lg">
            {clickHint}
          </div>
        )}

        {!infoChange && !clickHint && !exportMode && clickableItems.length > 0 && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm">
            Klicka på kartan för objektinfo
          </div>
        )}
      </div>

      <MapLayerPanel
        layers={mapLayers}
        visibility={layerVisibility}
        onToggle={toggleLayer}
        onShowAll={showAllLayers}
        onHideAll={hideAllLayers}
      />
    </div>
  );
}
