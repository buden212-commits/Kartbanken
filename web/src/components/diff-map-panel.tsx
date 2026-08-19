"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { ChangeType } from "@/lib/ocad/diff-types";
import { formatChangeCentroid } from "@/lib/ocad/change-utils";
import {
  isGeoreferencedCrs,
  wgs84ToMapCoord,
  type OcadCrsInfo,
} from "@/lib/ocad/crs";
import { findChangeAtPoint, parseViewBoxString, screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import {
  buildMapLayerTransform,
  mapContentToScreen,
  panForCenteredMapPoint,
} from "@/lib/ocad/map-view-transform";
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
import { formatMapDisplayScale, maxZoomForMapScale } from "@/lib/ocad/map-display-scale";
import {
  createExportFrame,
  downloadMapOcd,
  downloadMapPdf,
  downloadMapGeoTiff,
  exportFrameBbox,
  pointInExportFrame,
  type ExportFrame,
  type ExportSettings,
} from "@/lib/ocad/map-export";
import { defaultOcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import { clearPreviewCache, fetchPreviewText } from "@/lib/ocad/preview-fetch";
import { MapExportControls } from "@/components/map-export-controls";
import { OcdSuggestionSymbolDialog } from "@/components/ocd-suggestion-symbol-dialog";
import type { OcdSuggestionSymbolMapping } from "@/lib/ocad/ocad-suggestion-export";
import { buildSuggestionExportOverlaySvg } from "@/lib/suggestion/geometry";
import type { SuggestionOverlayItem } from "@/lib/suggestion/types";

type GpsFix = {
  mapCoord: [number, number];
  accuracyMeters: number;
  latitude: number;
  longitude: number;
};

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

export type MapDrawPointerHandlers = {
  onPointerDown: (e: React.PointerEvent, svg: SVGSVGElement) => void;
  onPointerMove: (e: React.PointerEvent, svg: SVGSVGElement) => void;
  onPointerUp: (e: React.PointerEvent, svg: SVGSVGElement) => void;
};

type Props = {
  previewUrl: string;
  title: string;
  mapSlug: string;
  versionId: string;
  exportEnabled?: boolean;
  fullscreen?: boolean;
  focusTarget?: FocusTarget | null;
  /**
   * Bump when the user explicitly picks an object (list/map click).
   * Zoom-to-object runs only when this changes — not on every parent re-render
   * while the same object stays selected.
   */
  focusRequestId?: number;
  selectedChange?: OcadObjectChange | null;
  clickableItems?: ClickableItem[];
  onClearFocus?: () => void;
  onObjectClick?: (changeIndex: number) => void;
  /** Extra SVG overlay content rendered above map layers (e.g. checkout areas). */
  renderSvgOverlay?: (rootTransform: SvgRootTransform) => ReactNode;
  /** Open/in-progress kartförslag for raster export (PDF/GeoTIFF). Fetched on export if omitted. */
  suggestionOverlays?: SuggestionOverlayItem[];
  /** When "draw", viewport pointer events call drawPointerHandlers instead of pan. */
  interactionMode?: "navigate" | "draw";
  drawPointerHandlers?: MapDrawPointerHandlers;
  /** Called when a multi-touch gesture interrupts an in-progress draw (e.g. pinch-to-zoom). */
  onDrawInterrupt?: () => void;
  /** Replaces the default map title in the toolbar row. */
  headerContent?: ReactNode;
  /** Extra row below the main toolbar (e.g. checkout draw tools). */
  secondaryHeaderContent?: ReactNode;
  /** Floating controls inside the map viewport (e.g. draw tool icons). */
  mapToolbarOverlay?: ReactNode;
  /** Omit outer border/radius when nested inside another panel. */
  unboxed?: boolean;
  showLayerPanel?: boolean;
  /** Called when OCAD map scale is read from preview metadata. */
  onOcadMapScale?: (scale: number) => void;
  /** Called when georeferenced CRS is loaded from preview (or cleared on reload). */
  onOcadCrsReady?: (crs: OcadCrsInfo | null) => void;
  /** Called when OCAD layer tree is read from preview metadata. */
  onOcadLayersReady?: (layers: OcadMapLayer[]) => void;
  /**
   * Fit the viewport to a geo bbox (no highlight). Bump requestId to re-apply.
   */
  fitGeoBbox?: {
    bbox: Bbox;
    requestId: number;
  } | null;
  /**
   * Kartförslag GPS-spår: håll skala 1:50 och centrera på senaste position var 10:e sekund.
   */
  gpsTrackFollow?: {
    active: boolean;
    mapCoordRef: MutableRefObject<[number, number] | null>;
    /** Ökas när spårning startar eller första GPS-fix kommer. */
    recenterToken: number;
  } | null;
  /** Clockwise rotation in degrees (0 = north up). Used for compass mode. */
  mapBearing?: number;
};

const MIN_ZOOM = 0.2;
/** Zoom in/out by 50% per button click or wheel step. */
const ZOOM_IN_FACTOR = 1.5;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
/** Zoom level that shows the entire SVG (same as "Hela kartan"). */
const FIT_WHOLE_ZOOM = 1;
const POINT_ZOOM = 30;
const POINT_HIGHLIGHT_RADIUS_M = 5; // 10 m diameter in map units (meters)
const DRAG_THRESHOLD_PX = 5;
/** Fixed screen size for GPS reticle (overlay is outside zoom transform). */
const GPS_CROSSHAIR_SIZE_PX = 28;
/** Accuracy above this (meters) is shown as Osäker — marker and status turn red. */
const GPS_UNCERTAIN_ACCURACY_M = 20;
/** Re-center interval while recording a kartförslag GPS track. */
const GPS_TRACK_FOLLOW_INTERVAL_MS = 10_000;

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
  maxZoom: number,
): { pan: { x: number; y: number }; zoom: number } | null {
  if (containerWidth < 10 || containerHeight < 10) return null;

  const [svgX, svgY] = geoToSvgUserPoint(target.centroid, rootTransform);
  const screen0 = mapPointToScreen(svgX, svgY, viewBox, containerWidth, containerHeight);

  let targetZoom = POINT_ZOOM;
  if (target.objectType !== "point" && target.objectType !== "text") {
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(target.bbox, rootTransform);
    const bw = Math.max(maxX - minX, 5) * 1.4;
    const bh = Math.max(maxY - minY, 5) * 1.4;
    const vb = parseViewBoxString(viewBox);
    if (vb && vb.width > 0 && vb.height > 0) {
      const renderScale = Math.min(containerWidth / vb.width, containerHeight / vb.height);
      if (!(renderScale > 0)) return null;
      const visibleW = containerWidth / renderScale;
      const visibleH = containerHeight / renderScale;
      targetZoom = Math.min(visibleW / bw, visibleH / bh) * 0.85;
      targetZoom = Math.min(maxZoom, Math.max(MIN_ZOOM, targetZoom));
    }
  }

  if (!Number.isFinite(targetZoom) || !Number.isFinite(screen0[0]) || !Number.isFinite(screen0[1])) {
    return null;
  }

  const focalX = containerWidth / 2;
  const focalY = containerHeight / 2;
  const panX = focalX - screen0[0] * targetZoom;
  const panY = focalY - screen0[1] * targetZoom;
  if (!Number.isFinite(panX) || !Number.isFinite(panY)) return null;

  return {
    pan: { x: panX, y: panY },
    zoom: targetZoom,
  };
}

function zoomAtPoint(
  prevZoom: number,
  factor: number,
  prevPan: { x: number; y: number },
  focalX: number,
  focalY: number,
  maxZoom: number,
): { zoom: number; pan: { x: number; y: number } } {
  const nextZoom = Math.min(maxZoom, Math.max(MIN_ZOOM, prevZoom * factor));
  const ratio = nextZoom / prevZoom;
  return {
    zoom: nextZoom,
    pan: {
      x: focalX - (focalX - prevPan.x) * ratio,
      y: focalY - (focalY - prevPan.y) * ratio,
    },
  };
}

function SvgOverlaySafe({
  render,
  rootTransform,
}: {
  render?: (rootTransform: SvgRootTransform) => ReactNode;
  rootTransform: SvgRootTransform;
}) {
  if (!render) return null;
  try {
    return render(rootTransform);
  } catch {
    return null;
  }
}

export function DiffMapPanel({
  previewUrl,
  title,
  mapSlug,
  versionId,
  exportEnabled = true,
  fullscreen = false,
  focusTarget,
  focusRequestId,
  selectedChange,
  clickableItems = [],
  onClearFocus,
  onObjectClick,
  renderSvgOverlay,
  suggestionOverlays,
  interactionMode = "navigate",
  drawPointerHandlers,
  onDrawInterrupt,
  headerContent,
  secondaryHeaderContent,
  mapToolbarOverlay,
  unboxed = false,
  showLayerPanel = true,
  onOcadMapScale,
  onOcadCrsReady,
  onOcadLayersReady,
  fitGeoBbox = null,
  gpsTrackFollow = null,
  mapBearing = 0,
}: Props) {
  const [svgInner, setSvgInner] = useState<string | null>(null);
  const [svgFill, setSvgFill] = useState("transparent");
  const [fullViewBox, setFullViewBox] = useState<string | null>(null);
  const [rootTransform, setRootTransform] = useState<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(FIT_WHOLE_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [clickHint, setClickHint] = useState<string | null>(null);
  const [fullSvgText, setFullSvgText] = useState<string | null>(null);
  const [ocadMapScale, setOcadMapScale] = useState<number>(15000);
  const ocadMapScaleRef = useRef(ocadMapScale);
  ocadMapScaleRef.current = ocadMapScale;
  const maxZoom = useMemo(() => maxZoomForMapScale(ocadMapScale), [ocadMapScale]);
  const maxZoomRef = useRef(maxZoom);
  maxZoomRef.current = maxZoom;
  const [exportMode, setExportMode] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    scale: 10000,
    format: "A4",
    orientation: "portrait",
    outputFormat: "pdf",
    ocadVersion: 12,
    includeSuggestions: true,
  });
  const [exportFrame, setExportFrame] = useState<ExportFrame | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [ocdSymbolDialogOpen, setOcdSymbolDialogOpen] = useState(false);
  const [ocadCrs, setOcadCrs] = useState<OcadCrsInfo | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsCenteredOnceRef = useRef(false);
  const gpsFixRef = useRef<GpsFix | null>(null);
  gpsFixRef.current = gpsFix;
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const frameDragRef = useRef<{
    startSvgX: number;
    startSvgY: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);
  /** Suppresses draw pointer-up after pinch/pan gestures in draw mode. */
  const drawSuppressedRef = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  /** Last focus apply key — avoids re-zooming to ~1:500 on unrelated re-renders. */
  const lastFocusApplyKeyRef = useRef<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
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
    onOcadLayersReady?.([]);
    setOcadCrs(null);
    if (gpsWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setGpsEnabled(false);
    setGpsFix(null);
    setGpsError(null);
    setGpsStatus(null);
    gpsCenteredOnceRef.current = false;
    userInteractedRef.current = false;
    initialFitDoneRef.current = false;

    fetchPreviewText(previewUrl, { signal: controller.signal })
      .then((text) => {
        if (cancelled) return;
        const {
          inner,
          viewBox,
          fill,
          ocadMapScale: mapScale,
          ocadFileVersion,
          ocadCrs: crs,
          ocadLayers,
          rootTransform: transform,
        } = extractSvgInner(text);
        setSvgInner(inner);
        setSvgFill(fill ?? "transparent");
        setFullViewBox(viewBox);
        setRootTransform(transform);
        const resolvedScale = mapScale ?? crs?.scale ?? 15000;
        setOcadMapScale(resolvedScale);
        onOcadMapScale?.(resolvedScale);
        setOcadCrs(crs);
        setMapLayers(ocadLayers);
        setLayerVisibility(initialLayerVisibility(ocadLayers));
        onOcadLayersReady?.(ocadLayers);
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

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoad(true), 8000);
    return () => window.clearTimeout(timer);
  }, [loading]);

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

  const performExport = useCallback(
    async (ocdSuggestionSymbols?: OcdSuggestionSymbolMapping) => {
      if (!exportFrame) return;
      setExporting(true);
      setExportError(null);
      setOcdSymbolDialogOpen(false);
      try {
        const safeTitle = title.replace(/[^\w\s-åäöÅÄÖ]/g, "").trim() || "karta";

        const rasterExport =
          exportSettings.outputFormat === "geotiff" || exportSettings.outputFormat === "pdf";
        let suggestionOverlaySvg: string | undefined;
        if (rasterExport && exportSettings.includeSuggestions) {
          let overlays: SuggestionOverlayItem[];
          if (suggestionOverlays !== undefined) {
            overlays = suggestionOverlays;
          } else {
            overlays = [];
            try {
              const res = await fetch(
                `/api/maps/${mapSlug}/suggestions?overlay=1&mapVersionId=${encodeURIComponent(versionId)}`,
              );
              if (res.ok) {
                const data = (await res.json()) as { overlays?: SuggestionOverlayItem[] };
                overlays = data.overlays ?? [];
              }
            } catch {
              overlays = [];
            }
          }
          if (overlays.length > 0) {
            suggestionOverlaySvg = buildSuggestionExportOverlaySvg(overlays, rootTransform);
          }
        }

        if (exportSettings.outputFormat === "ocd") {
          const { versionWarning, suggestionWarnings } = await downloadMapOcd(
            mapSlug,
            versionId,
            exportFrame,
            exportSettings.ocadVersion,
            `${safeTitle}-${exportSettings.scale}`,
            exportSettings.includeSuggestions
              ? { includeSuggestions: true, suggestionSymbols: ocdSuggestionSymbols }
              : undefined,
          );
          if (versionWarning) {
            window.alert(versionWarning);
          }
          if (suggestionWarnings) {
            window.alert(suggestionWarnings);
          }
        } else if (exportSettings.outputFormat === "geotiff") {
          if (!fullSvgText) return;
          if (!isGeoreferencedCrs(ocadCrs)) {
            throw new Error(
              "Kartan saknar georeferering — GeoTIFF-export kräver EPSG-koordinater i filen.",
            );
          }
          await downloadMapGeoTiff(
            mapSlug,
            versionId,
            fullSvgText,
            exportFrame,
            `${safeTitle}-${exportSettings.scale}`,
            { suggestionOverlaySvg },
          );
        } else {
          if (!fullSvgText) return;
          await downloadMapPdf(fullSvgText, exportFrame, `${safeTitle}-${exportSettings.scale}`, {
            suggestionOverlaySvg,
          });
        }

        cancelExportMode();
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Export misslyckades");
      } finally {
        setExporting(false);
      }
    },
    [
      fullSvgText,
      exportFrame,
      title,
      exportSettings,
      mapSlug,
      versionId,
      cancelExportMode,
      ocadCrs,
      suggestionOverlays,
      rootTransform,
    ],
  );

  const handleExport = useCallback(async () => {
    if (!exportFrame) return;

    if (exportSettings.outputFormat === "ocd" && exportSettings.includeSuggestions) {
      setOcdSymbolDialogOpen(true);
      return;
    }

    await performExport();
  }, [exportFrame, exportSettings.outputFormat, exportSettings.includeSuggestions, performExport]);

  const viewStateRef = useRef({ pan: { x: 0, y: 0 }, zoom: FIT_WHOLE_ZOOM, bearing: 0 });
  viewStateRef.current = { pan, zoom, bearing: mapBearing };

  const markUserInteracted = useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  const fitWholeMap = useCallback(() => {
    setZoom(FIT_WHOLE_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!fullViewBox || loading || initialFitDoneRef.current) return;

    initialFitDoneRef.current = true;

    if (focusTarget || fitGeoBbox) return;

    if (!userInteractedRef.current) {
      fitWholeMap();
    }
  }, [fullViewBox, loading, focusTarget, fitGeoBbox, fitWholeMap]);

  useEffect(() => {
    setZoom((current) => Math.min(maxZoom, Math.max(MIN_ZOOM, current)));
  }, [maxZoom]);

  useEffect(() => {
    if (!focusTarget) {
      lastFocusApplyKeyRef.current = null;
      return;
    }
    if (!fullViewBox || loading) return;

    const applyKey =
      focusRequestId != null
        ? `req:${focusRequestId}`
        : [
            focusTarget.objectType,
            focusTarget.bbox.join(","),
            focusTarget.centroid.join(","),
          ].join(":");

    if (lastFocusApplyKeyRef.current === applyKey) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const next = focusOnTarget(
      focusTarget,
      rootTransform,
      fullViewBox,
      rect.width,
      rect.height,
      maxZoom,
    );
    if (!next) return;
    lastFocusApplyKeyRef.current = applyKey;
    setPan(next.pan);
    setZoom(next.zoom);
  }, [focusTarget, focusRequestId, fullViewBox, loading, rootTransform, maxZoom]);

  useEffect(() => {
    if (!fitGeoBbox || !fullViewBox || loading) return;

    const apply = () => {
      const viewport = viewportRef.current;
      if (!viewport) return false;
      const rect = viewport.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return false;

      const [minX, minY, maxX, maxY] = fitGeoBbox.bbox;
      const next = focusOnTarget(
        {
          bbox: fitGeoBbox.bbox,
          centroid: [(minX + maxX) / 2, (minY + maxY) / 2],
          objectType: "area",
        },
        rootTransform,
        fullViewBox,
        rect.width,
        rect.height,
        maxZoom,
      );
      if (!next) return false;
      setPan(next.pan);
      setZoom(next.zoom);
      return true;
    };

    if (apply()) return;

    // Viewport may not have layout yet (fullscreen flex) — retry next frames.
    let tries = 0;
    let raf = 0;
    const tick = () => {
      tries += 1;
      if (apply() || tries >= 20) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fitGeoBbox, fitGeoBbox?.requestId, fullViewBox, loading, rootTransform, maxZoom]);

  const adjustZoom = useCallback((factor: number, focal?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    markUserInteracted();
    const rect = viewport.getBoundingClientRect();
    const focalX = focal?.x ?? rect.width / 2;
    const focalY = focal?.y ?? rect.height / 2;
    const { pan: prevPan, zoom: prevZoom } = viewStateRef.current;
    const next = zoomAtPoint(prevZoom, factor, prevPan, focalX, focalY, maxZoomRef.current);
    setZoom(next.zoom);
    setPan(next.pan);
  }, [markUserInteracted]);

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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const delta = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
      adjustZoom(delta, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [adjustZoom]);

  const beginPinch = useCallback(() => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance < 1) return;
    pinchRef.current = {
      distance,
      zoom: viewStateRef.current.zoom,
      pan: { ...viewStateRef.current.pan },
    };
    dragRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      if ((e.target as Element).closest("[data-map-toolbar]")) {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) return;

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      viewport.setPointerCapture(e.pointerId);

      if (pointersRef.current.size >= 2) {
        beginPinch();
        if (interactionMode === "draw") {
          drawSuppressedRef.current = true;
          onDrawInterrupt?.();
        }
        e.preventDefault();
        return;
      }

      if (interactionMode === "draw" && drawPointerHandlers && svgRef.current) {
        drawPointerHandlers.onPointerDown(e, svgRef.current);
        e.preventDefault();
        return;
      }

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
        pointerId: e.pointerId,
      };
    },
    [
      beginPinch,
      drawPointerHandlers,
      exportMode,
      exportFrame,
      interactionMode,
      onDrawInterrupt,
      pan.x,
      pan.y,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinchRef.current && pointersRef.current.size >= 2) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const pts = [...pointersRef.current.values()];
        const [a, b] = pts;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < 1) return;

        const rect = viewport.getBoundingClientRect();
        const focalX = (a.x + b.x) / 2 - rect.left;
        const focalY = (a.y + b.y) / 2 - rect.top;
        const factor = distance / pinchRef.current.distance;
        const next = zoomAtPoint(
          pinchRef.current.zoom,
          factor,
          pinchRef.current.pan,
          focalX,
          focalY,
          maxZoomRef.current,
        );
        markUserInteracted();
        setZoom(next.zoom);
        setPan(next.pan);
        e.preventDefault();
        return;
      }

      if (interactionMode === "draw" && drawPointerHandlers && svgRef.current) {
        if (pointersRef.current.size <= 1 && !drawSuppressedRef.current) {
          drawPointerHandlers.onPointerMove(e, svgRef.current);
          e.preventDefault();
        }
        return;
      }

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
        e.preventDefault();
        return;
      }

      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragRef.current.moved = true;
        markUserInteracted();
      }
      setPan({
        x: dragRef.current.panX + dx,
        y: dragRef.current.panY + dy,
      });
      e.preventDefault();
    },
    [drawPointerHandlers, exportSettings, interactionMode, markUserInteracted, ocadMapScale],
  );

  const handleMapClick = useCallback(
    (clientX: number, clientY: number) => {
      if (exportMode) return;
      if (!onObjectClick || !svgRef.current || clickableItems.length === 0) return;

      const mapPoint = screenToSvgPoint(svgRef.current, clientX, clientY);
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

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const hadPointer = pointersRef.current.has(e.pointerId);
      pointersRef.current.delete(e.pointerId);

      if (viewportRef.current?.hasPointerCapture(e.pointerId)) {
        viewportRef.current.releasePointerCapture(e.pointerId);
      }

      if (interactionMode === "draw" && drawPointerHandlers && svgRef.current) {
        if (pointersRef.current.size >= 2) {
          beginPinch();
          e.preventDefault();
          return;
        }

        pinchRef.current = null;

        if (pointersRef.current.size === 0) {
          const suppressed = drawSuppressedRef.current;
          drawSuppressedRef.current = false;
          if (!suppressed) {
            drawPointerHandlers.onPointerUp(e, svgRef.current);
          }
          e.preventDefault();
        }
        return;
      }

      if (!hadPointer) return;

      if (viewportRef.current?.hasPointerCapture(e.pointerId)) {
        viewportRef.current.releasePointerCapture(e.pointerId);
      }

      if (pointersRef.current.size >= 2) {
        beginPinch();
        return;
      }

      pinchRef.current = null;

      if (frameDragRef.current) {
        frameDragRef.current = null;
        return;
      }

      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) {
        dragRef.current = null;
        return;
      }

      const wasClick = !dragRef.current.moved;
      dragRef.current = null;
      if (wasClick) handleMapClick(e.clientX, e.clientY);
    },
    [beginPinch, drawPointerHandlers, handleMapClick, interactionMode],
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const canUseGps = isGeoreferencedCrs(ocadCrs);

  const panToMapCoord = useCallback(
    (mapCoord: [number, number], targetZoom = 8, options?: { markInteraction?: boolean }) => {
      const viewport = viewportRef.current;
      if (!viewport || !fullViewBox) return;
      if (options?.markInteraction !== false) {
        markUserInteracted();
      }
      const rect = viewport.getBoundingClientRect();
      const nextZoom = Math.min(maxZoomRef.current, Math.max(MIN_ZOOM, targetZoom));
      const [svgX, svgY] = geoToSvgUserPoint(mapCoord, rootTransform);
      const [screenX, screenY] = mapPointToScreen(
        svgX,
        svgY,
        fullViewBox,
        rect.width,
        rect.height,
      );
      setZoom(nextZoom);
      setPan(
        panForCenteredMapPoint(
          screenX,
          screenY,
          rect.width,
          rect.height,
          nextZoom,
          mapBearing,
        ),
      );
    },
    [fullViewBox, mapBearing, markUserInteracted, rootTransform],
  );

  const panToMapCoordAtDisplayScale = useCallback(
    (mapCoord: [number, number]) => {
      const zoomAtMinScale = maxZoomForMapScale(ocadMapScaleRef.current);
      panToMapCoord(mapCoord, zoomAtMinScale, { markInteraction: false });
    },
    [panToMapCoord],
  );

  useEffect(() => {
    if (!gpsTrackFollow?.active || !fullViewBox) return;

    const follow = () => {
      const coord = gpsTrackFollow.mapCoordRef.current;
      if (coord) panToMapCoordAtDisplayScale(coord);
    };

    follow();
    const id = window.setInterval(follow, GPS_TRACK_FOLLOW_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    fullViewBox,
    gpsTrackFollow?.active,
    gpsTrackFollow?.mapCoordRef,
    gpsTrackFollow?.recenterToken,
    panToMapCoordAtDisplayScale,
  ]);

  /** Min position: zoom 1:50 vid första fix, sedan panorera hit var 10:e sekund. */
  useEffect(() => {
    if (!gpsEnabled || !fullViewBox || gpsTrackFollow?.active) return;

    const follow = () => {
      const fix = gpsFixRef.current;
      if (fix) panToMapCoordAtDisplayScale(fix.mapCoord);
    };

    follow();
    const id = window.setInterval(follow, GPS_TRACK_FOLLOW_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fullViewBox, gpsEnabled, gpsTrackFollow?.active, panToMapCoordAtDisplayScale]);

  const applyGpsPosition = useCallback(
    (coords: GeolocationCoordinates, autoCenter: boolean) => {
      if (!ocadCrs) return;
      const mapCoord = wgs84ToMapCoord(coords.longitude, coords.latitude, ocadCrs);
      if (!mapCoord) {
        setGpsError("Kunde inte konvertera GPS-position till kartan.");
        setGpsStatus(null);
        return;
      }

      const accuracyMeters =
        typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy)
          ? coords.accuracy
          : 25;

      setGpsFix({
        mapCoord,
        accuracyMeters,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setGpsError(null);
      setGpsStatus(
        accuracyMeters <= GPS_UNCERTAIN_ACCURACY_M
          ? `GPS ±${Math.round(accuracyMeters)} m`
          : `GPS ±${Math.round(accuracyMeters)} m (Osäker)`,
      );

      const vb = parseViewBoxString(fullViewBox);
      const [svgX, svgY] = geoToSvgUserPoint(mapCoord, rootTransform);
      const outside =
        !!vb &&
        (svgX < vb.x || svgX > vb.x + vb.width || svgY < vb.y || svgY > vb.y + vb.height);

      if (outside) {
        setGpsStatus("GPS utanför kartområdet");
      }

      if (autoCenter && !gpsCenteredOnceRef.current) {
        gpsCenteredOnceRef.current = true;
        // Zoom till 1:50 och centrera direkt vid första fix (följs upp var 10:e s).
        panToMapCoordAtDisplayScale(mapCoord);
      }
    },
    [fullViewBox, ocadCrs, panToMapCoordAtDisplayScale, rootTransform],
  );

  const stopGps = useCallback(() => {
    if (gpsWatchIdRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setGpsEnabled(false);
    setGpsFix(null);
    setGpsStatus(null);
    setGpsError(null);
    gpsCenteredOnceRef.current = false;
  }, []);

  const startGps = useCallback(() => {
    if (!canUseGps) {
      setGpsError("Kartan saknar georeferering — GPS kan inte visas.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Enheten stödjer inte GPS.");
      return;
    }

    setGpsEnabled(true);
    setGpsError(null);
    setGpsStatus("Hämtar position…");
    gpsCenteredOnceRef.current = false;

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => applyGpsPosition(pos.coords, true),
      (err) => {
        setGpsEnabled(false);
        setGpsStatus(null);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError("Platsåtkomst nekades. Tillåt plats i webbläsaren.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError("Kunde inte hämta GPS-position.");
        } else if (err.code === err.TIMEOUT) {
          setGpsError("GPS tog för lång tid. Försök igen.");
        } else {
          setGpsError("GPS-fel.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      },
    );
  }, [applyGpsPosition, canUseGps]);

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current != null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onOcadCrsReady?.(ocadCrs);
  }, [ocadCrs, onOcadCrsReady]);

  const gpsMarker = useMemo(() => {
    if (!gpsFix || !fullViewBox || !viewportRef.current) return null;
    const viewport = viewportRef.current;
    const rect = viewport.getBoundingClientRect();
    const [svgX, svgY] = geoToSvgUserPoint(gpsFix.mapCoord, rootTransform);
    const [baseX, baseY] = mapPointToScreen(
      svgX,
      svgY,
      fullViewBox,
      rect.width,
      rect.height,
    );
    const [x, y] = mapContentToScreen(baseX, baseY, rect.width, rect.height, {
      pan,
      zoom,
      bearing: mapBearing,
    });

    return {
      x,
      y,
      uncertain: gpsFix.accuracyMeters > GPS_UNCERTAIN_ACCURACY_M,
    };
  }, [fullViewBox, gpsFix, mapBearing, pan, rootTransform, zoom]);

  const gpsAccuracyUncertain = Boolean(
    gpsFix && gpsFix.accuracyMeters > GPS_UNCERTAIN_ACCURACY_M,
  );

  const highlightShape = focusTarget ? buildHighlightShape(focusTarget, rootTransform) : null;
  const exportBbox = exportFrame ? exportFrameBbox(exportFrame) : null;

  const infoChange = selectedChange ?? null;

  const toolbarBtn =
    "min-h-9 min-w-9 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition hover:border-ifk-blue hover:text-ifk-blue";
  const toolbarBtnPrimary =
    "min-h-9 rounded-md border border-ifk-blue/30 bg-ifk-blue-pale px-2.5 py-1.5 text-sm text-ifk-blue transition hover:border-ifk-blue disabled:opacity-40";

  return (
    <div
      className={`flex flex-col overflow-hidden bg-white ${
        unboxed ? "" : "rounded-xl border border-slate-200 shadow-sm"
      } ${fullscreen ? "h-full min-h-0" : ""}`}
    >
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        {headerContent ?? <h3 className="text-sm font-medium text-slate-800">{title}</h3>}
        <div className="flex flex-wrap items-center gap-2 text-slate-600">
          <button
            type="button"
            onClick={() => adjustZoom(ZOOM_OUT_FACTOR)}
            className={toolbarBtn}
            aria-label="Zooma ut"
          >
            −
          </button>
          <span
            className="min-w-[4.5rem] text-center text-xs tabular-nums text-slate-500"
            title="Nominal kartskala vid aktuell zoom"
          >
            {formatMapDisplayScale(ocadMapScale, zoom)}
          </span>
          <button
            type="button"
            onClick={() => adjustZoom(ZOOM_IN_FACTOR)}
            className={toolbarBtn}
            aria-label="Zooma in"
          >
            +
          </button>
          <button type="button" onClick={resetView} className={toolbarBtn}>
            Hela kartan
          </button>
          {canUseGps && (
            <>
              <button
                type="button"
                onClick={gpsEnabled ? stopGps : startGps}
                disabled={loading}
                className={gpsEnabled ? toolbarBtnPrimary : toolbarBtn}
              >
                {gpsEnabled ? "Stoppa GPS" : "Min position"}
              </button>
              {gpsFix && (
                <button
                  type="button"
                  onClick={() => panToMapCoordAtDisplayScale(gpsFix.mapCoord)}
                  className={toolbarBtnPrimary}
                  title="Centrera på din position i skala 1:50"
                >
                  Panorera hit
                </button>
              )}
            </>
          )}
          {focusTarget && onClearFocus && (
            <button type="button" onClick={onClearFocus} className={toolbarBtnPrimary}>
              Avmarkera
            </button>
          )}
          {!exportMode && exportEnabled && (
            <button
              type="button"
              onClick={startExportMode}
              disabled={loading || !fullSvgText}
              className={toolbarBtnPrimary}
            >
              Exportera
            </button>
          )}
        </div>
      </div>
      {secondaryHeaderContent}
      {(gpsStatus || gpsError) && (
        <div
          className={`border-b px-3 py-1.5 text-xs sm:px-4 ${
            gpsError || gpsAccuracyUncertain
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          {gpsError ?? gpsStatus}
        </div>
      )}

      {exportMode && (
        <MapExportControls
          settings={exportSettings}
          onChange={setExportSettings}
          onExport={handleExport}
          onCancel={cancelExportMode}
          exporting={exporting}
          error={exportError}
          suggestionOverlayCount={suggestionOverlays?.length}
        />
      )}

      <OcdSuggestionSymbolDialog
        layers={mapLayers}
        open={ocdSymbolDialogOpen}
        onCancel={() => setOcdSymbolDialogOpen(false)}
        onConfirm={(mapping) => {
          void performExport(mapping);
        }}
      />

      <div
        ref={viewportRef}
        className={`relative min-h-0 touch-none overflow-hidden bg-white select-none ${
          fullscreen ? "flex-1" : "h-[min(70dvh,560px)] min-h-[280px]"
        } ${
          exportMode
            ? "cursor-default"
            : interactionMode === "draw"
              ? "cursor-crosshair"
              : "cursor-grab active:cursor-grabbing"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {mapToolbarOverlay}

        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-white/90 px-6 text-center text-sm text-slate-600">
            <p>Laddar kartbild…</p>
            {slowLoad && (
              <p className="text-xs text-slate-500">Kartan är stor — det kan ta en stund.</p>
            )}
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
              transform: buildMapLayerTransform({ pan, zoom, bearing: mapBearing }),
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
              <SvgOverlaySafe render={renderSvgOverlay} rootTransform={rootTransform} />
            </svg>
          </div>
        )}

        {gpsMarker && (
          <div
            className="pointer-events-none absolute z-20 drop-shadow-sm"
            style={{
              left: gpsMarker.x,
              top: gpsMarker.y,
              width: GPS_CROSSHAIR_SIZE_PX,
              height: GPS_CROSSHAIR_SIZE_PX,
              transform: "translate(-50%, -50%)",
            }}
            aria-hidden
          >
            <svg
              viewBox="0 0 28 28"
              width={GPS_CROSSHAIR_SIZE_PX}
              height={GPS_CROSSHAIR_SIZE_PX}
              className="overflow-visible"
            >
              <circle
                cx="14"
                cy="14"
                r="11"
                fill="none"
                stroke="white"
                strokeWidth="3"
              />
              <circle
                cx="14"
                cy="14"
                r="11"
                fill="none"
                stroke={gpsMarker.uncertain ? "#dc2626" : "#64748b"}
                strokeWidth="1.5"
              />
              <line
                x1="9.5"
                y1="9.5"
                x2="18.5"
                y2="18.5"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1="18.5"
                y1="9.5"
                x2="9.5"
                y2="18.5"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1="9.5"
                y1="9.5"
                x2="18.5"
                y2="18.5"
                stroke={gpsMarker.uncertain ? "#dc2626" : "#64748b"}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="18.5"
                y1="9.5"
                x2="9.5"
                y2="18.5"
                stroke={gpsMarker.uncertain ? "#dc2626" : "#64748b"}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {Math.abs(mapBearing) > 0.5 && (
          <div
            className="pointer-events-none absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-xs font-semibold text-slate-700 shadow-sm"
            style={{ transform: `rotate(${-mapBearing}deg)` }}
            aria-hidden
          >
            N
          </div>
        )}

        {infoChange && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 max-w-xs rounded-lg border border-slate-200 bg-white/95 p-3 text-sm shadow-lg backdrop-blur sm:right-auto">
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

        {!infoChange && !clickHint && !exportMode && !mapToolbarOverlay && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 max-w-[calc(100%-1.5rem)] rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm">
            {interactionMode === "draw"
              ? "Ritläge — nyp med två fingrar för att zooma"
              : clickableItems.length > 0
                ? "Tryck på kartan för objektinfo · nyp för att zooma"
                : "Dra för att panorera · nyp eller +/− för att zooma"}
          </div>
        )}
      </div>

      {showLayerPanel && (
        <MapLayerPanel
          layers={mapLayers}
          visibility={layerVisibility}
          onToggle={toggleLayer}
          onShowAll={showAllLayers}
          onHideAll={hideAllLayers}
        />
      )}
    </div>
  );
}
