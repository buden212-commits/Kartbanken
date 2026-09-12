"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type { Bbox } from "@/lib/checkout/types";
import {
  importChangeKey,
  type ImportDiffSample,
  type ImportEdgeObject,
  type ImportPartialAnalysis,
} from "@/lib/checkout/import-partial-types";
import { clearPreviewCache, fetchPreviewText } from "@/lib/ocad/preview-fetch";
import { extractSvgInner } from "@/lib/ocad/svg-utils";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  mapPointToScreen,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import { parseViewBoxString } from "@/lib/ocad/map-hit-test";
import { maxZoomForMapScale } from "@/lib/ocad/map-display-scale";

type Mode = "extent" | "edges" | "diff";
type MapBase = "full" | "affected";

export type ImportPartialMapHandle = {
  /** Zoomar och centrerar på ett enskilt objekt, t.ex. från ändringslistan. */
  focusOn: (target: {
    bbox?: [number, number, number, number] | null;
    centroid: [number, number];
  }) => void;
};

type Props = {
  previewUrl: string;
  analysis: ImportPartialAnalysis;
  mode: Mode;
  title: string;
  areaHref?: string;
  /** `${changeType}:${objectIndex}` för raden som är vald i listan. */
  selectedKey?: string | null;
  /** Ändringar som kryssats bort — ritas dämpade så det syns att de inte tillämpas. */
  excludedKeys?: ReadonlySet<string>;
  /** Anropas när man klickar på en markering i kartan; null när man klickar bredvid. */
  onSelectChange?: (change: ImportDiffSample | null) => void;
  ref?: Ref<ImportPartialMapHandle>;
};

type Scene = {
  inner: string;
  fill: string;
  fullViewBox: string;
  transform: SvgRootTransform;
  ocadMapScale: number;
};

type OverlayFlags = {
  edges: boolean;
  removed: boolean;
  added: boolean;
  modified: boolean;
};

const MIN_ZOOM = 0.2;
const ZOOM_IN_FACTOR = 1.5;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
const DRAG_THRESHOLD_PX = 5;
/** Markörernas radie på skärmen. Oberoende av zoom och utsnittets storlek. */
const MARKER_RADIUS_PX = 5;
/** Minsta kartfönster (meter) när man zoomar till ett enskilt objekt. */
const FOCUS_MIN_SPAN_METERS = 120;
/** Dämpad ton för ändringar som kryssats bort. */
const EXCLUDED_COLOR = "#94a3b8";
/** Träffytans bredd i skärmpixlar — tunna linjer ska gå att pricka utan att zooma. */
const HIT_STROKE_PX = 14;

function ringToPath(points: [number, number][]): string {
  return `M ${points.map(([x, y]) => `${x},${y}`).join(" L ")} Z`;
}

function bboxToTuple(box: Bbox): [number, number, number, number] {
  return [box.minX, box.minY, box.maxX, box.maxY];
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

/** Fit viewport to a geo bbox (padded), same approach as DiffMapPanel focus. */
function fitGeoBoxView(
  box: [number, number, number, number],
  transform: SvgRootTransform,
  viewBox: string,
  containerWidth: number,
  containerHeight: number,
  maxZoom: number,
): { pan: { x: number; y: number }; zoom: number } | null {
  if (containerWidth < 10 || containerHeight < 10) return null;
  const [minX, minY, maxX, maxY] = geoBboxToSvgUser(box, transform);
  const bw = Math.max(maxX - minX, 5) * 1.4;
  const bh = Math.max(maxY - minY, 5) * 1.4;
  const vb = parseViewBoxString(viewBox);
  if (!vb || !(vb.width > 0) || !(vb.height > 0)) return null;
  const renderScale = Math.min(containerWidth / vb.width, containerHeight / vb.height);
  if (!(renderScale > 0)) return null;
  const visibleW = containerWidth / renderScale;
  const visibleH = containerHeight / renderScale;
  let targetZoom = Math.min(visibleW / bw, visibleH / bh) * 0.85;
  targetZoom = Math.min(maxZoom, Math.max(MIN_ZOOM, targetZoom));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const screen0 = mapPointToScreen(cx, cy, viewBox, containerWidth, containerHeight);
  const panX = containerWidth / 2 - screen0[0] * targetZoom;
  const panY = containerHeight / 2 - screen0[1] * targetZoom;
  if (!Number.isFinite(targetZoom) || !Number.isFinite(panX) || !Number.isFinite(panY)) {
    return null;
  }
  return { pan: { x: panX, y: panY }, zoom: targetZoom };
}

/**
 * Ett enskilt objekt får ett minsta fönster runt sig. En sten har noll utbredning
 * och skulle annars zooma till max, där omgivningen — det man ska bedöma mot —
 * inte längre syns.
 */
function focusBox(
  bbox: [number, number, number, number] | null | undefined,
  centroid: [number, number],
): [number, number, number, number] {
  const [cx, cy] = centroid;
  const minX = Math.min(bbox?.[0] ?? cx, cx);
  const minY = Math.min(bbox?.[1] ?? cy, cy);
  const maxX = Math.max(bbox?.[2] ?? cx, cx);
  const maxY = Math.max(bbox?.[3] ?? cy, cy);
  const padX = Math.max(0, (FOCUS_MIN_SPAN_METERS - (maxX - minX)) / 2);
  const padY = Math.max(0, (FOCUS_MIN_SPAN_METERS - (maxY - minY)) / 2);
  return [minX - padX, minY - padY, maxX + padX, maxY + padY];
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

/**
 * Konturen ritas när objektet har en vertexkedja: ett dike eller en stig går
 * att bedöma på formen, en ruta runt den gör det inte. Punktobjekt saknar kedja
 * och markeras i stället med sin ring.
 */
function ObjectOutline({
  outline,
  transform,
  color,
  strokeWidth,
  closed,
  dashed,
}: {
  outline: [number, number][];
  transform: SvgRootTransform;
  color: string;
  strokeWidth: number;
  closed: boolean;
  dashed?: string;
}) {
  const points = outline.map((point) => geoToSvgUserPoint(point, transform));
  if (points.length < 2) return null;
  const d = `M ${points.map(([x, y]) => `${x},${y}`).join(" L ")}${closed ? " Z" : ""}`;
  return (
    <>
      <path
        d={d}
        fill={closed ? `${color}26` : "none"}
        stroke="#fff"
        strokeWidth={strokeWidth * 2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeOpacity={0.75}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    </>
  );
}

/**
 * Osynlig träffyta ovanpå markeringen. Själva markeringen är för tunn att pricka,
 * särskilt utzoomad, så klick fångas av en bred genomskinlig kopia i stället.
 * `data-change-key` gör att pekaruppsläppet kan slå upp vilken ändring som träffades.
 */
function HitArea({
  changeKey,
  outline,
  transform,
  cx,
  cy,
  radius,
  strokeWidth,
  closed,
}: {
  changeKey: string;
  outline?: [number, number][];
  transform: SvgRootTransform;
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  closed: boolean;
}) {
  if (outline && outline.length >= 2) {
    const points = outline.map((point) => geoToSvgUserPoint(point, transform));
    const d = `M ${points.map(([x, y]) => `${x},${y}`).join(" L ")}${closed ? " Z" : ""}`;
    return (
      <path
        data-change-key={changeKey}
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents={closed ? "all" : "stroke"}
        className="cursor-pointer"
      />
    );
  }
  return (
    <circle
      data-change-key={changeKey}
      cx={cx}
      cy={cy}
      r={radius}
      fill="transparent"
      pointerEvents="all"
      className="cursor-pointer"
    />
  );
}

/** Ihålig ring med vit halo — symbolen under ska gå att känna igen. */
function PointMarker({
  cx,
  cy,
  radius,
  color,
  strokeWidth,
  dashed,
}: {
  cx: number;
  cy: number;
  radius: number;
  color: string;
  strokeWidth: number;
  dashed?: string;
}) {
  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#fff"
        strokeWidth={strokeWidth * 2.5}
        strokeOpacity={0.75}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    </>
  );
}

function EdgeMarkers({
  objects,
  transform,
  radius,
  strokePx,
  showBoxes,
}: {
  objects: ImportEdgeObject[];
  transform: SvgRootTransform;
  radius: number;
  strokePx: (px: number) => number;
  showBoxes: boolean;
}) {
  return (
    <>
      {objects.map((object) => {
        const [cx, cy] = geoToSvgUserPoint(object.centroid, transform);
        const fill = object.likelyClipped ? "#dc2626" : "#f97316";
        const box = showBoxes && !object.outline ? objectSvgBox(object.bbox, transform) : null;
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
                strokeWidth={strokePx(1.5)}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {object.outline && (
              <ObjectOutline
                outline={object.outline}
                transform={transform}
                color={fill}
                strokeWidth={strokePx(2)}
                closed={object.type === "area"}
              />
            )}
            {!object.outline && (
              <PointMarker cx={cx} cy={cy} radius={radius} color={fill} strokeWidth={strokePx(2)} />
            )}
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
  strokePx,
  showBoxes,
  kinds,
  selectedKey,
  excludedKeys,
  selectable,
}: {
  changes: ImportDiffSample[];
  transform: SvgRootTransform;
  radius: number;
  strokePx: (px: number) => number;
  showBoxes: boolean;
  kinds: { removed: boolean; added: boolean; modified: boolean };
  selectedKey?: string | null;
  excludedKeys?: ReadonlySet<string>;
  selectable: boolean;
}) {
  // Den valda ändringen ritas sist så den inte hamnar under grannarna.
  const ordered = selectedKey
    ? [...changes].sort((a, b) => {
        const aSel = importChangeKey(a.changeType, a.objectIndex) === selectedKey ? 1 : 0;
        const bSel = importChangeKey(b.changeType, b.objectIndex) === selectedKey ? 1 : 0;
        return aSel - bSel;
      })
    : changes;

  return (
    <>
      {ordered.map((change, index) => {
        if (change.changeType === "removed" && !kinds.removed) return null;
        if (change.changeType === "added" && !kinds.added) return null;
        if (change.changeType === "modified" && !kinds.modified) return null;

        const key = importChangeKey(change.changeType, change.objectIndex);
        const excluded = excludedKeys?.has(key) ?? false;
        const selected = selectedKey === key;
        const fill = excluded
          ? EXCLUDED_COLOR
          : change.changeType === "added"
            ? "#059669"
            : change.changeType === "removed"
              ? "#dc2626"
              : "#d97706";
        const [cx, cy] = geoToSvgUserPoint(change.centroid, transform);
        const box =
          showBoxes && change.bbox && !change.outline
            ? objectSvgBox(change.bbox, transform)
            : null;
        const dashed = change.changeType === "removed" ? "5 3" : undefined;
        return (
          <g
            key={`diff-${change.changeType}-${change.objectIndex}-${index}`}
            opacity={excluded ? 0.55 : 1}
          >
            {selected && (
              <circle
                cx={cx}
                cy={cy}
                r={radius * 3.5}
                fill="none"
                stroke="#1d4ed8"
                strokeWidth={strokePx(2)}
                strokeDasharray={`${strokePx(5)} ${strokePx(4)}`}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {box && (
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={`${fill}26`}
                stroke={fill}
                strokeWidth={strokePx(change.changeType === "removed" ? 1.5 : 1.25)}
                strokeDasharray={dashed}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {change.outline && (
              <ObjectOutline
                outline={change.outline}
                transform={transform}
                color={fill}
                strokeWidth={strokePx(2)}
                closed={change.type === "area"}
                dashed={dashed}
              />
            )}
            {!change.outline && (
              <PointMarker
                cx={cx}
                cy={cy}
                radius={radius}
                color={fill}
                strokeWidth={strokePx(2)}
                dashed={dashed}
              />
            )}
            {selectable && (
              <HitArea
                changeKey={key}
                outline={change.outline}
                transform={transform}
                cx={cx}
                cy={cy}
                radius={Math.max(radius * 2, radius + strokePx(6))}
                strokeWidth={strokePx(HIT_STROKE_PX)}
                closed={change.type === "area"}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

export function ImportPartialMapPreview({
  previewUrl,
  analysis,
  mode,
  title,
  areaHref,
  selectedKey,
  excludedKeys,
  onSelectChange,
  ref,
}: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [scene, setScene] = useState<Scene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [mapBase, setMapBase] = useState<MapBase>("full");
  const [overlays, setOverlays] = useState<OverlayFlags>(() => defaultOverlays(mode));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fitToken, setFitToken] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const viewStateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  viewStateRef.current = { zoom, pan };
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  const maxZoom = useMemo(
    () => maxZoomForMapScale(scene?.ocadMapScale ?? 15000),
    [scene?.ocadMapScale],
  );
  const maxZoomRef = useRef(maxZoom);
  maxZoomRef.current = maxZoom;

  const mapChanges = analysis.diff.mapChanges ?? analysis.diff.samples;
  const changeByKey = useMemo(
    () =>
      new Map(
        mapChanges.map((change) => [
          importChangeKey(change.changeType, change.objectIndex),
          change,
        ]),
      ),
    [mapChanges],
  );

  useEffect(() => {
    setOverlays(defaultOverlays(mode));
    setMapBase("full");
  }, [mode]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewportSize({ width: rect.width, height: rect.height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

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
          ocadMapScale: extracted.ocadMapScale ?? 15000,
        });
        setStatus("ready");
        setFitToken((n) => n + 1);
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

  const applyFit = useCallback(() => {
    if (!scene || status !== "ready") return false;
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const rect = viewport.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    const next = fitGeoBoxView(
      bboxToTuple(analysis.extent),
      scene.transform,
      scene.fullViewBox,
      rect.width,
      rect.height,
      maxZoomRef.current,
    );
    if (!next) return false;
    setPan(next.pan);
    setZoom(next.zoom);
    return true;
  }, [analysis.extent, scene, status]);

  useEffect(() => {
    if (applyFit()) return;
    let tries = 0;
    let raf = 0;
    const tick = () => {
      tries += 1;
      if (applyFit() || tries >= 20) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyFit, fitToken]);

  const focusOn = useCallback<ImportPartialMapHandle["focusOn"]>(
    (target) => {
      const viewport = viewportRef.current;
      if (!scene || !viewport) return;
      const rect = viewport.getBoundingClientRect();
      const next = fitGeoBoxView(
        focusBox(target.bbox, target.centroid),
        scene.transform,
        scene.fullViewBox,
        rect.width,
        rect.height,
        maxZoom,
      );
      if (!next) return;
      setPan(next.pan);
      setZoom(next.zoom);
      // Listan ligger under kartan; utan detta zoomar man till något man inte ser.
      viewport.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    [maxZoom, scene],
  );

  useImperativeHandle(ref, () => ({ focusOn }), [focusOn]);

  const adjustZoom = useCallback((factor: number, focal?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const focalX = focal?.x ?? rect.width / 2;
    const focalY = focal?.y ?? rect.height / 2;
    const { pan: prevPan, zoom: prevZoom } = viewStateRef.current;
    const next = zoomAtPoint(prevZoom, factor, prevPan, focalX, focalY, maxZoomRef.current);
    setZoom(next.zoom);
    setPan(next.pan);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || status !== "ready") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
      adjustZoom(factor, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [adjustZoom, status]);

  const beginPinch = useCallback(() => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
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
      if ((e.target as Element).closest("[data-map-toolbar]")) return;
      const viewport = viewportRef.current;
      if (!viewport) return;

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      viewport.setPointerCapture(e.pointerId);

      if (pointersRef.current.size >= 2) {
        beginPinch();
        e.preventDefault();
        return;
      }

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: viewStateRef.current.pan.x,
        panY: viewStateRef.current.pan.y,
        moved: false,
        pointerId: e.pointerId,
      };
    },
    [beginPinch],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchRef.current && pointersRef.current.size >= 2) {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const pts = [...pointersRef.current.values()];
      const [a, b] = pts;
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (distance < 1) return;
      const rect = viewport.getBoundingClientRect();
      const focalX = (a!.x + b!.x) / 2 - rect.left;
      const focalY = (a!.y + b!.y) / 2 - rect.top;
      const factor = distance / pinchRef.current.distance;
      const next = zoomAtPoint(
        pinchRef.current.zoom,
        factor,
        pinchRef.current.pan,
        focalX,
        focalY,
        maxZoomRef.current,
      );
      setZoom(next.zoom);
      setPan(next.pan);
      e.preventDefault();
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }
    if (drag.moved) {
      setPan({ x: drag.panX + dx, y: drag.panY + dy });
      e.preventDefault();
    }
  }, []);

  /**
   * Pekaren fångas av vyn för att panorering ska fungera, så ett vanligt
   * click-event på markeringen är inte att lita på. I stället görs träfftestet
   * mot DOM:en vid uppsläppet — bara när fingret/musen inte flyttat sig.
   */
  const pickChangeAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!onSelectChange) return;
      const element = document.elementFromPoint(clientX, clientY);
      const hit = element?.closest?.("[data-change-key]");
      const key = hit?.getAttribute("data-change-key") ?? null;
      onSelectChange(key ? (changeByKey.get(key) ?? null) : null);
    },
    [changeByKey, onSelectChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      const wasPinching = pinchRef.current != null;
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      if (pointersRef.current.size === 1) {
        beginPinch();
      }
      const drag = dragRef.current;
      if (drag?.pointerId === e.pointerId) {
        dragRef.current = null;
        if (!drag.moved && !wasPinching && e.type !== "pointercancel") {
          pickChangeAt(e.clientX, e.clientY);
        }
      }
      try {
        viewportRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [beginPinch, pickChangeAt],
  );

  const frame = useMemo(() => {
    if (!scene) return null;
    const ring = analysis.ring?.length >= 3 ? analysis.ring : null;
    // Kärnan kan bestå av flera ringar: ytterkontur plus tomrum där delkartan
    // saknar innehåll. Tillsammans med even-odd ger de exakt den skyddade zonen.
    const coreSource =
      analysis.coreRings?.length > 0
        ? analysis.coreRings
        : analysis.coreRing?.length >= 3
          ? [analysis.coreRing]
          : [];
    if (ring) {
      const points = ring.map((point) => geoToSvgUserPoint(point, scene.transform));
      if (points.length < 3) return null;
      const coreParts = coreSource
        .filter((part) => part.length >= 3)
        .map((part) => part.map((point) => geoToSvgUserPoint(point, scene.transform)));
      return { kind: "polygon" as const, points, coreParts };
    }
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(
      bboxToTuple(analysis.extent),
      scene.transform,
    );
    const width = maxX - minX;
    const height = maxY - minY;
    if (!(width > 0) || !(height > 0)) return null;
    return { kind: "rect" as const, x: minX, y: minY, width, height };
  }, [analysis.coreRing, analysis.coreRings, analysis.extent, analysis.ring, scene]);

  /**
   * SVG:n är CSS-skalad av zoomen, så både markörer och linjebredder måste
   * räknas om för att hålla samma storlek på skärmen oavsett zoom och hur
   * stort utsnittet är. Utan det blir markörerna stora klumpar som täcker kartan.
   */
  const mapViewBox = useMemo(
    () => (scene ? parseViewBoxString(scene.fullViewBox) : null),
    [scene],
  );

  const userUnitsPerPixel = useMemo(() => {
    if (!scene || viewportSize.width < 10 || viewportSize.height < 10) return null;
    const vb = parseViewBoxString(scene.fullViewBox);
    if (!vb || !(vb.width > 0) || !(vb.height > 0)) return null;
    const renderScale = Math.min(
      viewportSize.width / vb.width,
      viewportSize.height / vb.height,
    );
    if (!(renderScale > 0)) return null;
    return 1 / (renderScale * zoom);
  }, [scene, viewportSize, zoom]);

  const markerRadius = useMemo(() => {
    if (userUnitsPerPixel) return userUnitsPerPixel * MARKER_RADIUS_PX;
    if (!scene) return 8;
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(
      bboxToTuple(analysis.extent),
      scene.transform,
    );
    return Math.max(Math.max(maxX - minX, maxY - minY, 1) * 0.002, 2);
  }, [analysis.extent, scene, userUnitsPerPixel]);

  const strokePx = useCallback((px: number) => px / zoom, [zoom]);

  const showOverlayControls = mode === "edges" || mode === "diff";
  // Kartan visas i båda lägena — utan den går det inte att bedöma om en ändring
  // är rimlig. «Dämpad» lägger bara en slöja över så markeringarna träder fram.
  const showBoxes = mapBase === "affected";
  const dimMap = mapBase === "affected";

  function retry() {
    clearPreviewCache(previewUrl);
    setScene(null);
    setRetryKey((n) => n + 1);
  }

  function setOverlay(key: keyof OverlayFlags, value: boolean) {
    setOverlays((prev) => ({ ...prev, [key]: value }));
  }

  const toolbarBtn =
    "min-h-8 min-w-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 transition hover:border-ifk-blue hover:text-ifk-blue";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-800">{title}</h3>
          {status === "ready" && (
            <div className="flex flex-wrap items-center gap-1.5" data-map-toolbar>
              <button
                type="button"
                className={toolbarBtn}
                onClick={() => adjustZoom(ZOOM_OUT_FACTOR)}
                aria-label="Zooma ut"
              >
                −
              </button>
              <button
                type="button"
                className={toolbarBtn}
                onClick={() => adjustZoom(ZOOM_IN_FACTOR)}
                aria-label="Zooma in"
              >
                +
              </button>
              <button
                type="button"
                className={toolbarBtn}
                onClick={() => setFitToken((n) => n + 1)}
              >
                Återställ
              </button>
            </div>
          )}
        </div>
        {showOverlayControls && (
          <div className="flex flex-col gap-2">
            <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <SegmentButton active={mapBase === "full"} onClick={() => setMapBase("full")}>
                Kartan i full färg
              </SegmentButton>
              <SegmentButton
                active={mapBase === "affected"}
                onClick={() => setMapBase("affected")}
              >
                Dämpa kartan
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
        {status === "ready" && (
          <p className="text-xs text-slate-500">
            Dra för att panorera · mushjul eller nyp för att zooma · +/− i verktygsraden
            {onSelectChange ? " · klicka på en markering för att välja den i listan" : ""}
          </p>
        )}
      </div>
      <div
        ref={viewportRef}
        className={`relative h-[min(70svh,560px)] min-h-[280px] touch-none overflow-hidden ${
          status === "ready" ? "cursor-grab active:cursor-grabbing bg-white" : "bg-white"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
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
        {scene && status === "ready" && (
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg
              viewBox={scene.fullViewBox}
              fill={scene.fill}
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet"
              className="h-full w-full max-h-full max-w-full"
            >
              <g dangerouslySetInnerHTML={{ __html: scene.inner }} />
              {dimMap && (
                <rect
                  x={mapViewBox?.x ?? 0}
                  y={mapViewBox?.y ?? 0}
                  width={mapViewBox?.width ?? 0}
                  height={mapViewBox?.height ?? 0}
                  fill="#ffffff"
                  fillOpacity={0.62}
                  pointerEvents="none"
                />
              )}
              {frame && frame.kind === "rect" && (
                <rect
                  x={frame.x}
                  y={frame.y}
                  width={frame.width}
                  height={frame.height}
                  fill="rgba(37, 99, 235, 0.10)"
                  stroke="#1d4ed8"
                  strokeWidth={strokePx(1.75)}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
              {frame && frame.kind === "polygon" && (
                <>
                  {/*
                    Bara den skyddade zonen tonas (ringen minus kärnan via
                    evenodd) så att kartan syns oskymd där borttag jämförs.
                  */}
                  <path
                    d={[ringToPath(frame.points), ...frame.coreParts.map(ringToPath)].join(" ")}
                    fillRule="evenodd"
                    fill="rgba(37, 99, 235, 0.18)"
                    stroke="none"
                    pointerEvents="none"
                  />
                  <path
                    d={ringToPath(frame.points)}
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth={strokePx(1.75)}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                  {frame.coreParts.length > 0 && (
                    <path
                      d={frame.coreParts.map(ringToPath).join(" ")}
                      fill="none"
                      stroke="#047857"
                      strokeWidth={strokePx(1.25)}
                      strokeDasharray={`${strokePx(6)} ${strokePx(4)}`}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                </>
              )}
              {showOverlayControls && overlays.edges && (
                <EdgeMarkers
                  objects={analysis.edgeObjects}
                  transform={scene.transform}
                  radius={markerRadius}
                  strokePx={strokePx}
                  showBoxes={showBoxes}
                />
              )}
              {showOverlayControls &&
                (overlays.removed || overlays.added || overlays.modified) && (
                  <DiffMarkers
                    changes={mapChanges}
                    transform={scene.transform}
                    radius={markerRadius * 0.85}
                    strokePx={strokePx}
                    showBoxes={showBoxes}
                    kinds={{
                      removed: overlays.removed,
                      added: overlays.added,
                      modified: overlays.modified,
                    }}
                    selectedKey={selectedKey}
                    excludedKeys={excludedKeys}
                    selectable={onSelectChange != null}
                  />
                )}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
