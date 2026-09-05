"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { fieldEditOverlaySvg } from "@/components/field-edit/field-edit-overlay";
import {
  closedRing,
  applyVertexMove,
  insertVertexOnSegmentWithKinds,
  removeVertexAtWithKinds,
  setVertexKindAt,
  verticesForHandles,
} from "@/lib/field-edit/vertices";
import { nearestPointOnPolyline, distance2d } from "@/lib/field-edit/polyline-geometry";
import {
  defaultBezierControlsForPolyline,
  hitTestBezierControl,
  sampleBezierPolyline,
  type BezierSegmentControls,
} from "@/lib/field-edit/geometry-tools";
import { FieldEditCadPanel, type CadCutTool, type CadVertexTool } from "@/components/field-edit/field-edit-cad-panel";
import { FieldEditReviewDialog } from "@/components/field-edit/field-edit-review-dialog";
import { FieldEditSnapSettings } from "@/components/field-edit/field-edit-snap-settings";
import {
  FieldEditMapToolbars,
  FieldEditPublishBar,
  stopFieldEditToolbarPointer,
  type FieldEditTool,
} from "@/components/field-edit/field-edit-toolbar";
import {
  buildSymbolGroups,
  buildSymbolGroupsFromCatalog,
  defaultSymbolForKind,
  FieldEditSymbolPicker,
  symbolFromMapObject,
  type SymbolGroups,
} from "@/components/field-edit/field-edit-symbol-picker";
import type { FieldEditSymbolCatalogEntry } from "@/lib/field-edit/symbol-catalog-shared";
import type { CheckoutSelection } from "@/lib/checkout/types";
import {
  emptyFieldEditFavorites,
  parseFieldEditFavorites,
  toggleFavoriteSymbol,
  type FieldEditFavoriteSymbols,
} from "@/lib/field-edit/favorites";
import {
  geometryKindFromType,
  hitTestFieldEditObject,
  hitTestFieldEditObjects,
  hitTestFieldEditVertex,
} from "@/lib/field-edit/hit-test";
import {
  addIndexFromSyntheticObjectId,
  isSyntheticAddObjectId,
  mergeFieldEditObjectsWithAdds,
  syntheticAddObjectId,
  type FieldEditObjectEntry,
} from "@/lib/field-edit/object-index";
import {
  clearLocalFieldEditOps,
  loadLocalFieldEditOps,
  mergeInitialOps,
  saveLocalFieldEditOps,
} from "@/lib/field-edit/local-storage";
import {
  loadFieldEditEditorSettings,
  saveFieldEditEditorSettings,
  type FieldEditEditorSettings,
} from "@/lib/field-edit/editor-settings";
import {
  buildFieldEditReviewSummary,
  type FieldEditReviewSummary,
} from "@/lib/field-edit/review-summary";
import { snapGeoPoint, type SnapResult } from "@/lib/field-edit/snap";
import { useGpsTrackRecording } from "@/lib/gps/use-gps-track-recording";
import {
  cutLineGap,
  findLineCutHit,
  holeIsInsideOuter,
  normalizeHoleRing,
  polygonAreaAbs,
  splitAreaByCutLine,
  splitLineAtPoint,
} from "@/lib/field-edit/cut-geometry";
import {
  areasCanMerge,
  linesCanMerge,
  mergeAreaObjects,
  mergeLineObjects,
  sameMergeSymbol,
} from "@/lib/field-edit/merge-geometry";
import { planFillOrBorderOrDuplicate } from "@/lib/field-edit/fill-or-border";
import {
  rectangularAreaRing,
  rectangularCorners,
  rectangularEdgeLength,
  rectangularLineCoords,
} from "@/lib/field-edit/rectangular-geometry";
import {
  axisLength,
  circleRingFromDiameter,
  ellipseMinorAxisEnds,
  ellipseRingFromAxes,
} from "@/lib/field-edit/circular-geometry";
import {
  freehandMinSampleDistanceM,
  maybeAppendFreehandPoint,
  smoothFreehandPolyline,
  type FreehandSmoothingFactor,
} from "@/lib/field-edit/freehand-geometry";
import {
  countFieldEditChanges,
  cycleVertexKind,
  hasFieldEditChanges,
  resolveObjectCoordinates,
  resolveObjectHoles,
  resolveObjectVertexKinds,
  vertexKindsForStoredCoordinates,
  type FieldEditGeometryKind,
  type FieldEditModify,
  type FieldEditOps,
  type FieldEditVertexKind,
} from "@/lib/field-edit/types";
import { metersToMapUnits, type OcadCrsInfo } from "@/lib/ocad/crs";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import { parseOcadLayersFromSvg } from "@/lib/ocad/svg-utils";
import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import { fetchPreviewText } from "@/lib/ocad/preview-fetch";
import { GPS_TRACK_MIN_DISTANCE_M } from "@/lib/suggestion/gps-track";
import {
  IDENTITY_SVG_TRANSFORM,
  svgUserToGeoPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";


type Props = {
  mapSlug: string;
  mapTitle: string;
  sessionId: string;
  selection: CheckoutSelection;
  initialOps: FieldEditOps;
};

type BezierDrawGesture =
  | { phase: "idle" }
  | { phase: "drag_p1"; p0: [number, number]; p1: [number, number] }
  | { phase: "await_p2"; p0: [number, number]; p1: [number, number] }
  | {
      phase: "drag_p3";
      p0: [number, number];
      p1: [number, number];
      p2: [number, number];
      p3: [number, number];
    };

type RectangularDrawGesture =
  | { phase: "idle" }
  | { phase: "drag_edge1"; p0: [number, number]; p1: [number, number] }
  | { phase: "await_edge2"; p0: [number, number]; p1: [number, number] }
  | {
      phase: "drag_edge2";
      p0: [number, number];
      p1: [number, number];
      p2: [number, number];
      p3: [number, number];
    }
  | {
      phase: "ready";
      p0: [number, number];
      p1: [number, number];
      p2: [number, number];
      p3: [number, number];
    };

type CircleDrawGesture =
  | { phase: "idle" }
  | { phase: "drag_diameter"; a: [number, number]; b: [number, number] };

type EllipseDrawGesture =
  | { phase: "idle" }
  | { phase: "drag_major"; a: [number, number]; b: [number, number] }
  | { phase: "await_minor"; a: [number, number]; b: [number, number] }
  | { phase: "drag_minor"; a: [number, number]; b: [number, number]; q: [number, number] };

const DEFAULT_HIT_DISTANCE = 35;
const DEFAULT_VERTEX_HIT_DISTANCE = 25;
const COARSE_HIT_DISTANCE = 50;
const COARSE_VERTEX_HIT_DISTANCE = 35;
/** Minimum first-edge length in map units before accepting rectangular base. */
const RECT_MIN_EDGE = 1e-3;

export function FieldEditSessionClient({
  mapSlug,
  mapTitle,
  sessionId,
  selection,
  initialOps,
}: Props) {
  const router = useRouter();
  const [tool, setTool] = useState<FieldEditTool>("select");
  const [mapMode, setMapMode] = useState<"draw" | "navigate">("navigate");
  const [hitDistance, setHitDistance] = useState(DEFAULT_HIT_DISTANCE);
  const [vertexHitDistance, setVertexHitDistance] = useState(DEFAULT_VERTEX_HIT_DISTANCE);
  const [opsHistory, setOpsHistory] = useState<FieldEditOps[]>(() => [
    mergeInitialOps(sessionId, initialOps),
  ]);
  const ops = opsHistory[opsHistory.length - 1]!;
  const [objects, setObjects] = useState<FieldEditObjectEntry[]>([]);
  const [symbolGroups, setSymbolGroups] = useState<SymbolGroups>({
    point: [],
    line: [],
    area: [],
  });
  const [favorites, setFavorites] = useState<FieldEditFavoriteSymbols>(() =>
    emptyFieldEditFavorites(),
  );
  const [symbolNumber, setSymbolNumber] = useState<number | "">("");
  const [selectedObjectIndex, setSelectedObjectIndex] = useState<number | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [bezierEdit, setBezierEdit] = useState<{
    objectIndex: number;
    objectType: "line" | "area";
    anchors: [number, number][];
    controls: BezierSegmentControls[];
  } | null>(null);
  const [bezierDrawMode, setBezierDrawMode] = useState(false);
  const [rectangularDrawMode, setRectangularDrawMode] = useState(false);
  const [circleDrawMode, setCircleDrawMode] = useState(false);
  const [ellipseDrawMode, setEllipseDrawMode] = useState(false);
  const [freehandDrawMode, setFreehandDrawMode] = useState(false);
  const [rectangularGesture, setRectangularGesture] = useState<RectangularDrawGesture>({
    phase: "idle",
  });
  const [circleGesture, setCircleGesture] = useState<CircleDrawGesture>({ phase: "idle" });
  const [ellipseGesture, setEllipseGesture] = useState<EllipseDrawGesture>({ phase: "idle" });
  const [bezierDraftAnchors, setBezierDraftAnchors] = useState<[number, number][]>([]);
  const [bezierDraftControls, setBezierDraftControls] = useState<BezierSegmentControls[]>(
    [],
  );
  const [bezierGesture, setBezierGesture] = useState<BezierDrawGesture>({ phase: "idle" });
  const [cadVertexTool, setCadVertexTool] = useState<CadVertexTool>("off");
  const [cadCutTool, setCadCutTool] = useState<CadCutTool>("off");
  const [cutDraftPoints, setCutDraftPoints] = useState<[number, number][]>([]);
  const [mergeActive, setMergeActive] = useState(false);
  const [mergeObjectIndices, setMergeObjectIndices] = useState<number[]>([]);
  const cutLineDragRef = useRef<{
    segmentIndex: number;
    point: [number, number];
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<FieldEditReviewSummary | null>(null);
  const showReview = reviewSummary != null;
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showLocalBackupToast, setShowLocalBackupToast] = useState(false);
  const [editorSettings, setEditorSettings] = useState<FieldEditEditorSettings>(() =>
    loadFieldEditEditorSettings(),
  );
  const [snapPreview, setSnapPreview] = useState<SnapResult | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "saved" | "local" | "error">("local");
  const [ocadCrs, setOcadCrs] = useState<OcadCrsInfo | null>(null);
  const [ocadMapScale, setOcadMapScale] = useState(15000);
  const [symbolPreview, setSymbolPreview] = useState<{ svgInner: string; maskedIndices: number[] }>({
    svgInner: "",
    maskedIndices: [],
  });
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequestRef = useRef(0);
  const dragVertexRef = useRef<{
    objectIndex: number;
    vertexIndex: number;
    startCoords: [number, number][];
    objectType: FieldEditObjectEntry["t"];
  } | null>(null);
  const dragBezierControlRef = useRef<{
    segmentIndex: number;
    which: "p1" | "p2";
  } | null>(null);
  const holdCycleRef = useRef<{
    indices: number[];
    index: number;
    startClientX: number;
    startClientY: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const pendingVertexDragRef = useRef<{
    objectIndex: number;
    vertexIndex: number;
    startCoords: [number, number][];
    objectType: FieldEditObjectEntry["t"];
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const advanceHoldCycleRef = useRef<() => void>(() => {});
  const opsRef = useRef(ops);
  const freehandDrawingRef = useRef(false);
  const finishDraftRef = useRef<() => void>(() => {});
  const freehandPointerDownRef = useRef<{
    clientX: number;
    clientY: number;
    pointsAtDown: number;
  } | null>(null);
  opsRef.current = ops;
  const editableObjects = useMemo(
    () => mergeFieldEditObjectsWithAdds(objects, ops.adds),
    [objects, ops.adds],
  );

  /** Efter tillagt objekt: behåll ritverktyget så man kan fortsätta rita. */
  const afterAddObject = useCallback(() => {
    setSelectedObjectIndex(null);
    setSelectedVertexIndex(null);
    setBezierEdit(null);
    setCadVertexTool("off");
    setCadCutTool("off");
    setInfo("Objekt tillagt — fortsätt rita, eller byt till «Välj / redigera» för att ändra.");
  }, []);

  const editorSettingsRef = useRef(editorSettings);
  editorSettingsRef.current = editorSettings;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const symbolNumberRef = useRef(symbolNumber);
  symbolNumberRef.current = symbolNumber;
  const selectedObjectIndexRef = useRef(selectedObjectIndex);
  selectedObjectIndexRef.current = selectedObjectIndex;
  const draftPointsRef = useRef(draftPoints);
  draftPointsRef.current = draftPoints;
  const bezierDraftAnchorsRef = useRef(bezierDraftAnchors);
  bezierDraftAnchorsRef.current = bezierDraftAnchors;
  const rectangularGestureRef = useRef(rectangularGesture);
  rectangularGestureRef.current = rectangularGesture;
  const circleGestureRef = useRef(circleGesture);
  circleGestureRef.current = circleGesture;
  const ellipseGestureRef = useRef(ellipseGesture);
  ellipseGestureRef.current = ellipseGesture;
  const cutDraftPointsRef = useRef(cutDraftPoints);
  cutDraftPointsRef.current = cutDraftPoints;

  const clearHoldCycle = useCallback(() => {
    if (holdCycleRef.current?.timer) {
      clearTimeout(holdCycleRef.current.timer);
    }
    holdCycleRef.current = null;
  }, []);

  useEffect(() => () => clearHoldCycle(), [clearHoldCycle]);

  advanceHoldCycleRef.current = () => {
    const current = holdCycleRef.current;
    if (!current || current.indices.length < 2) {
      clearHoldCycle();
      return;
    }
    current.index = (current.index + 1) % current.indices.length;
    const nextId = current.indices[current.index]!;
    setSelectedObjectIndex(nextId);
    setSelectedVertexIndex(null);
    setBezierEdit(null);
    setCadVertexTool("off");
    setMergeActive(false);
    setMergeObjectIndices([]);
    pendingVertexDragRef.current = null;
    setInfo(
      `Överlappande objekt ${current.index + 1}/${current.indices.length} — håll kvar för nästa`,
    );
    current.timer = setTimeout(() => advanceHoldCycleRef.current(), 1000);
  };

  const updateEditorSettings = useCallback((next: FieldEditEditorSettings) => {
    setEditorSettings(next);
    saveFieldEditEditorSettings(next);
  }, []);

  const resolveSnapPoint = useCallback(
    (
      geo: [number, number],
      excludeObjectIndex: number | null = null,
    ): { point: [number, number]; snap: SnapResult | null } => {
      const settings = editorSettingsRef.current;
      if (!settings.snapEnabled) {
        return { point: geo, snap: null };
      }
      const toleranceMapUnits = metersToMapUnits(settings.snapToleranceM, ocadMapScale);
      const currentOps = opsRef.current;
      const currentTool = toolRef.current;

      let matchSymbolNumber: number | null = null;
      if (
        currentTool === "addPoint" ||
        currentTool === "addLine" ||
        currentTool === "addArea"
      ) {
        const sym = symbolNumberRef.current;
        matchSymbolNumber = sym === "" ? null : Number(sym);
      } else {
        const symbolSourceIndex = excludeObjectIndex ?? selectedObjectIndexRef.current;
        if (symbolSourceIndex != null) {
          const entry = editableObjects.find((o) => o.i === symbolSourceIndex);
          if (entry) {
            matchSymbolNumber =
              currentOps.modifies.find((m) => m.objectIndex === symbolSourceIndex)
                ?.symbolNumber ?? entry.s;
          }
        }
      }

      const extraVertices: [number, number][] = [];
      const pushUnique = (vertex: [number, number]) => {
        if (extraVertices.some((v) => v[0] === vertex[0] && v[1] === vertex[1])) return;
        extraVertices.push(vertex);
      };
      if (currentTool === "addLine" || currentTool === "addArea") {
        const draftStart = draftPointsRef.current[0];
        if (draftStart) pushUnique(draftStart);
        const bezierStart = bezierDraftAnchorsRef.current[0];
        if (bezierStart) pushUnique(bezierStart);
        const rect = rectangularGestureRef.current;
        if (rect.phase !== "idle" && "p0" in rect) {
          pushUnique(rect.p0);
        }
        const circle = circleGestureRef.current;
        if (circle.phase !== "idle" && "a" in circle) {
          pushUnique(circle.a);
        }
        const ellipse = ellipseGestureRef.current;
        if (ellipse.phase !== "idle" && "a" in ellipse) {
          pushUnique(ellipse.a);
        }
      }
      if (currentTool === "select") {
        const cutStart = cutDraftPointsRef.current[0];
        if (cutStart) pushUnique(cutStart);
      }

      const snap = snapGeoPoint(geo, {
        objects: editableObjects,
        ops: currentOps,
        toleranceMapUnits,
        excludeObjectIndex,
        matchSymbolNumber,
        extraVertices,
      });
      return { point: snap?.point ?? geo, snap };
    },
    [editableObjects, ocadMapScale],
  );

  const addKind: FieldEditGeometryKind | null =
    tool === "addPoint" ? "point" : tool === "addLine" ? "line" : tool === "addArea" ? "area" : null;

  const draftKind: "line" | "area" | null =
    tool === "addLine" ? "line" : tool === "addArea" ? "area" : null;

  const {
    gpsTracking,
    gpsTrackFollow,
    gpsLiveCoordinates,
    gpsTrackingStatus,
    canUseGpsTracking,
    toggleGpsTracking,
    cancelGpsTracking,
  } = useGpsTrackRecording({
    ocadCrs,
    ocadMapScale,
    onTrackStart: () => {
      setTool("addLine");
      setMapMode("navigate");
      setDraftPoints([]);
      setBezierDraftAnchors([]);
      setBezierDraftControls([]);
      setBezierGesture({ phase: "idle" });
      setBezierDrawMode(false);
      setRectangularDrawMode(false);
      setCircleDrawMode(false);
      setEllipseDrawMode(false);
      setRectangularGesture({ phase: "idle" });
      setCircleGesture({ phase: "idle" });
      setEllipseGesture({ phase: "idle" });
      setSelectedObjectIndex(null);
      setSelectedVertexIndex(null);
      setBezierEdit(null);
      setError(null);
    },
    onTrackComplete: (coordinates) => {
      setDraftPoints(coordinates);
      setError(null);
    },
    onTrackError: (message) => setError(message),
  });

  const clearBezierEdit = useCallback(() => {
    setBezierEdit(null);
    dragBezierControlRef.current = null;
  }, []);

  const clearBezierDraft = useCallback(() => {
    setBezierDraftAnchors([]);
    setBezierDraftControls([]);
    setBezierGesture({ phase: "idle" });
  }, []);

  const clearRectangularGesture = useCallback(() => {
    setRectangularGesture({ phase: "idle" });
  }, []);

  const clearCircleGesture = useCallback(() => {
    setCircleGesture({ phase: "idle" });
  }, []);

  const clearEllipseGesture = useCallback(() => {
    setEllipseGesture({ phase: "idle" });
  }, []);

  const rectangularCornersFromGesture = useCallback(
    (g: RectangularDrawGesture): [[number, number], [number, number], [number, number], [number, number]] | null => {
      if (g.phase === "drag_edge2" || g.phase === "ready") {
        return [g.p0, g.p1, g.p2, g.p3];
      }
      return null;
    },
    [],
  );

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setHitDistance(coarse ? COARSE_HIT_DISTANCE : DEFAULT_HIT_DISTANCE);
    setVertexHitDistance(coarse ? COARSE_VERTEX_HIT_DISTANCE : DEFAULT_VERTEX_HIT_DISTANCE);
  }, []);

  useEffect(() => {
    fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/objects`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.objects)) setObjects(data.objects);
      })
      .catch(() => {});

    fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/symbols`)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data.symbols)) throw new Error("symbols missing");
        const groups = buildSymbolGroupsFromCatalog(
          data.symbols as FieldEditSymbolCatalogEntry[],
        );
        setSymbolGroups(groups);
      })
      .catch(() => {
        // Fallback without icons if catalogue endpoint fails.
        fetchPreviewText(`/api/maps/${mapSlug}/field-edits/${sessionId}/preview`)
          .then((svg) => {
            const layers = parseOcadLayersFromSvg(svg);
            setSymbolGroups(buildSymbolGroups(layers));
          })
          .catch(() => {});
      });

    fetch("/api/user/field-edit-favorites")
      .then((res) => res.json())
      .then((data) => {
        if (data.favorites) {
          setFavorites(parseFieldEditFavorites(JSON.stringify(data.favorites)));
        }
      })
      .catch(() => {});
  }, [mapSlug, sessionId]);

  useEffect(() => {
    if (addKind) {
      setSymbolNumber(defaultSymbolForKind(symbolGroups, addKind, favorites));
    }
  }, [addKind, favorites, symbolGroups]);

  const draftPreview = useMemo(() => {
    if (symbolNumber === "" || !addKind || addKind === "point") return null;
    if (bezierDrawMode && (tool === "addLine" || tool === "addArea")) {
      if (bezierDraftAnchors.length < 2 || bezierDraftControls.length === 0) return null;
      const sampled = sampleBezierPolyline(
        bezierDraftAnchors,
        bezierDraftControls,
        false,
        8,
      );
      if (addKind === "line" && sampled.length >= 2) {
        return {
          kind: "line" as const,
          symbolNumber: Number(symbolNumber),
          coordinates: sampled,
        };
      }
      if (addKind === "area" && sampled.length >= 3) {
        return {
          kind: "area" as const,
          symbolNumber: Number(symbolNumber),
          coordinates: closedRing(sampled),
        };
      }
      return null;
    }
    if (
      rectangularDrawMode &&
      (tool === "addLine" || tool === "addArea") &&
      (rectangularGesture.phase === "drag_edge2" || rectangularGesture.phase === "ready")
    ) {
      const corners = rectangularCornersFromGesture(rectangularGesture);
      if (!corners) return null;
      if (addKind === "line") {
        return {
          kind: "line" as const,
          symbolNumber: Number(symbolNumber),
          coordinates: rectangularLineCoords(corners),
        };
      }
      return {
        kind: "area" as const,
        symbolNumber: Number(symbolNumber),
        coordinates: rectangularAreaRing(corners),
      };
    }
    if (
      circleDrawMode &&
      (tool === "addLine" || tool === "addArea") &&
      circleGesture.phase === "drag_diameter"
    ) {
      const ring = circleRingFromDiameter(circleGesture.a, circleGesture.b);
      if (!ring || ring.length < 3) return null;
      if (addKind === "line") {
        return {
          kind: "line" as const,
          symbolNumber: Number(symbolNumber),
          coordinates: closedRing(ring),
        };
      }
      return {
        kind: "area" as const,
        symbolNumber: Number(symbolNumber),
        coordinates: closedRing(ring),
      };
    }
    if (
      ellipseDrawMode &&
      (tool === "addLine" || tool === "addArea") &&
      ellipseGesture.phase === "drag_minor"
    ) {
      const ring = ellipseRingFromAxes(ellipseGesture.a, ellipseGesture.b, ellipseGesture.q);
      if (!ring || ring.length < 3) return null;
      if (addKind === "line") {
        return {
          kind: "line" as const,
          symbolNumber: Number(symbolNumber),
          coordinates: closedRing(ring),
        };
      }
      return {
        kind: "area" as const,
        symbolNumber: Number(symbolNumber),
        coordinates: closedRing(ring),
      };
    }
    if (addKind === "line" && draftPoints.length >= 2) {
      return {
        kind: "line" as const,
        symbolNumber: Number(symbolNumber),
        coordinates: draftPoints,
      };
    }
    if (addKind === "area" && draftPoints.length >= 3) {
      return {
        kind: "area" as const,
        symbolNumber: Number(symbolNumber),
        coordinates: draftPoints,
      };
    }
    return null;
  }, [
    addKind,
    bezierDraftAnchors,
    bezierDraftControls,
    bezierDrawMode,
    circleDrawMode,
    circleGesture,
    draftPoints,
    ellipseDrawMode,
    ellipseGesture,
    rectangularCornersFromGesture,
    rectangularDrawMode,
    rectangularGesture,
    symbolNumber,
    tool,
  ]);

  const draftHasSymbolPreview = draftPreview != null;

  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      const requestId = ++previewRequestRef.current;
      if (!hasFieldEditChanges(ops) && !draftPreview) {
        setSymbolPreview({ svgInner: "", maskedIndices: [] });
        return;
      }
      try {
        const res = await fetch(
          `/api/maps/${mapSlug}/field-edits/${sessionId}/symbol-preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ops, draft: draftPreview }),
          },
        );
        if (!res.ok || previewRequestRef.current !== requestId) return;
        const data = await res.json();
        setSymbolPreview({
          svgInner: typeof data.svgInner === "string" ? data.svgInner : "",
          maskedIndices: Array.isArray(data.maskedIndices)
            ? data.maskedIndices.filter((value: unknown) => typeof value === "number")
            : [],
        });
      } catch {
        // Behåll föregående förhandsvisning vid tillfälliga fel.
      }
    }, 400);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [draftPreview, mapSlug, ops, sessionId]);

  const scheduleServerSync = useCallback(
    (nextOps: FieldEditOps) => {
      saveLocalFieldEditOps(sessionId, nextOps);
      setSyncState("local");
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        setSyncing(true);
        const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/ops`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextOps),
        });
        setSyncing(false);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Kunde inte synka till servern — ändringar finns lokalt");
          setSyncState("error");
          return;
        }
        setSyncState("saved");
        setError(null);
      }, 1500);
    },
    [mapSlug, sessionId],
  );

  const updateOps = useCallback(
    (updater: (current: FieldEditOps) => FieldEditOps) => {
      setOpsHistory((history) => {
        const current = history[history.length - 1]!;
        const next = updater(current);
        const withNext = [...history, next];
        const capped = withNext.length > 11 ? withNext.slice(withNext.length - 11) : withNext;
        scheduleServerSync(next);
        return capped;
      });
    },
    [scheduleServerSync],
  );

  const commitCurveRing = useCallback(
    (ring: [number, number][], forTool: "addLine" | "addArea") => {
      if (symbolNumber === "") {
        setError("Välj symbol");
        return false;
      }
      const closed = closedRing(ring);
      if (closed.length < 3) {
        setError("Kurvan gav för få punkter");
        return false;
      }
      if (forTool === "addLine") {
        updateOps((current) => ({
          ...current,
          adds: [
            ...current.adds,
            {
              kind: "line",
              coordinates: closed,
              symbolNumber: Number(symbolNumber),
            },
          ],
        }));
      } else {
        updateOps((current) => ({
          ...current,
          adds: [
            ...current.adds,
            {
              kind: "area",
              ring: closed,
              symbolNumber: Number(symbolNumber),
            },
          ],
        }));
      }
      setError(null);
      afterAddObject();
      return true;
    },
    [afterAddObject, symbolNumber, updateOps],
  );

  const undo = useCallback(() => {
    setBezierEdit(null);
    dragBezierControlRef.current = null;
    setOpsHistory((history) => {
      if (history.length <= 1) return history;
      const nextHistory = history.slice(0, -1);
      const previous = nextHistory[nextHistory.length - 1]!;
      scheduleServerSync(previous);
      return nextHistory;
    });
    setSelectedVertexIndex(null);
  }, [scheduleServerSync]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  const toggleFavorite = useCallback(
    (kind: FieldEditGeometryKind, symNum: number) => {
      setFavorites((current) => {
        const next = toggleFavoriteSymbol(current, kind, symNum);
        void fetch("/api/user/field-edit-favorites", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: next }),
        }).catch(() => {});
        return next;
      });
    },
    [],
  );

  const pickSymbolFromObject = useCallback(
    (obj: FieldEditObjectEntry, kind: FieldEditGeometryKind): boolean => {
      const sym = symbolFromMapObject(obj, kind);
      if (sym == null) {
        setInfo("Kartobjektet passar inte för vald geometrityp — välj symbol manuellt.");
        return false;
      }
      setSymbolNumber(sym);
      setInfo(`Symbol ${formatOcadSymbolNumber(sym)} vald från kartobjekt.`);
      setError(null);
      return true;
    },
    [],
  );

  const upsertModify = useCallback(
    (
      objectIndex: number,
      coordinates: [number, number][],
      vertexKinds?: FieldEditVertexKind[],
      holes?: [number, number][][] | null,
    ) => {
      if (isSyntheticAddObjectId(objectIndex)) {
        const addIndex = addIndexFromSyntheticObjectId(objectIndex);
        updateOps((current) => {
          const existing = current.adds[addIndex];
          if (!existing) return current;
          const adds = current.adds.slice();
          if (existing.kind === "point") {
            const pt = coordinates[0] ?? [existing.x, existing.y];
            adds[addIndex] = {
              kind: "point",
              x: pt[0],
              y: pt[1],
              symbolNumber: existing.symbolNumber,
            };
          } else if (existing.kind === "line") {
            let resolvedKinds = vertexKinds;
            if (resolvedKinds && resolvedKinds.length !== coordinates.length) {
              resolvedKinds = vertexKindsForStoredCoordinates(
                coordinates,
                resolvedKinds,
                "line",
              );
            }
            adds[addIndex] = {
              kind: "line",
              coordinates,
              symbolNumber: existing.symbolNumber,
              ...(resolvedKinds
                ? { vertexKinds: resolvedKinds }
                : existing.vertexKinds && existing.vertexKinds.length === coordinates.length
                  ? { vertexKinds: existing.vertexKinds }
                  : {}),
            };
          } else {
            let resolvedKinds = vertexKinds;
            if (resolvedKinds && resolvedKinds.length !== coordinates.length) {
              resolvedKinds = vertexKindsForStoredCoordinates(
                coordinates,
                resolvedKinds,
                "area",
              );
            }
            const resolvedHoles =
              holes === null
                ? undefined
                : holes !== undefined
                  ? holes
                  : existing.holes;
            adds[addIndex] = {
              kind: "area",
              ring: coordinates,
              symbolNumber: existing.symbolNumber,
              ...(resolvedKinds
                ? { vertexKinds: resolvedKinds }
                : existing.vertexKinds && existing.vertexKinds.length === coordinates.length
                  ? { vertexKinds: existing.vertexKinds }
                  : {}),
              ...(resolvedHoles && resolvedHoles.length > 0 ? { holes: resolvedHoles } : {}),
            };
          }
          return { ...current, adds };
        });
        return;
      }
      const obj = objects.find((entry) => entry.i === objectIndex);
      if (!obj) return;
      updateOps((current) => {
        const kind = geometryKindFromType(obj.t);
        const existing = current.modifies.find((m) => m.objectIndex === objectIndex);
        let resolvedKinds: FieldEditVertexKind[] | undefined;
        if (vertexKinds) {
          if (vertexKinds.length === coordinates.length) {
            resolvedKinds = vertexKinds;
          } else {
            resolvedKinds = vertexKindsForStoredCoordinates(coordinates, vertexKinds, kind);
          }
        } else if (
          existing?.vertexKinds &&
          existing.vertexKinds.length === existing.coordinates.length &&
          existing.coordinates.length === coordinates.length
        ) {
          resolvedKinds = existing.vertexKinds;
        }
        const resolvedHoles =
          holes === null
            ? undefined
            : holes !== undefined
              ? holes
              : existing?.holes;
        const nextModify: FieldEditModify = {
          objectIndex,
          symbolNumber: existing?.symbolNumber ?? obj.s,
          geometryKind: kind,
          coordinates,
          ...(resolvedKinds ? { vertexKinds: resolvedKinds } : {}),
          ...(resolvedHoles && resolvedHoles.length > 0 ? { holes: resolvedHoles } : {}),
        };
        const modifies = existing
          ? current.modifies.map((m) => (m.objectIndex === objectIndex ? nextModify : m))
          : [...current.modifies, nextModify];
        const deletes = current.deletes.filter((id) => id !== objectIndex);
        return { ...current, modifies, deletes };
      });
    },
    [objects, updateOps],
  );

  const upsertModifySymbol = useCallback(
    (objectIndex: number, nextSymbolNumber: number) => {
      if (isSyntheticAddObjectId(objectIndex)) {
        const addIndex = addIndexFromSyntheticObjectId(objectIndex);
        updateOps((current) => {
          const existing = current.adds[addIndex];
          if (!existing) return current;
          const adds = current.adds.slice();
          adds[addIndex] = { ...existing, symbolNumber: nextSymbolNumber };
          return { ...current, adds };
        });
        return;
      }
      const obj = objects.find((entry) => entry.i === objectIndex);
      if (!obj) return;
      updateOps((current) => {
        const kind = geometryKindFromType(obj.t);
        const existing = current.modifies.find((m) => m.objectIndex === objectIndex);
        const coordinates =
          existing?.coordinates ??
          resolveObjectCoordinates(objectIndex, obj.v, current) ??
          obj.v.map(([x, y]) => [x, y] as [number, number]);
        const nextModify: FieldEditModify = {
          objectIndex,
          symbolNumber: nextSymbolNumber,
          geometryKind: kind,
          coordinates,
          ...(existing?.vertexKinds && existing.vertexKinds.length === coordinates.length
            ? { vertexKinds: existing.vertexKinds }
            : {}),
        };
        const modifies = existing
          ? current.modifies.map((m) => (m.objectIndex === objectIndex ? nextModify : m))
          : [...current.modifies, nextModify];
        const deletes = current.deletes.filter((id) => id !== objectIndex);
        return { ...current, modifies, deletes };
      });
    },
    [objects, updateOps],
  );

  const deleteSelectedObject = useCallback(() => {
    if (selectedObjectIndex == null) return;
    const index = selectedObjectIndex;
    if (isSyntheticAddObjectId(index)) {
      const addIndex = addIndexFromSyntheticObjectId(index);
      updateOps((current) => {
        if (addIndex < 0 || addIndex >= current.adds.length) return current;
        const adds = current.adds.filter((_, i) => i !== addIndex);
        return { ...current, adds };
      });
      setSelectedObjectIndex(null);
      setSelectedVertexIndex(null);
      setBezierEdit(null);
      setCadVertexTool("off");
      setCadCutTool("off");
      setMergeObjectIndices((prev) =>
        prev
          .map((id) => {
            if (!isSyntheticAddObjectId(id)) return id;
            const idx = addIndexFromSyntheticObjectId(id);
            if (idx === addIndex) return null;
            if (idx > addIndex) return syntheticAddObjectId(idx - 1);
            return id;
          })
          .filter((id): id is number => id != null),
      );
      setInfo("Nytt objekt borttaget.");
      return;
    }
    updateOps((current) => {
      const deletes = current.deletes.includes(index)
        ? current.deletes.filter((id) => id !== index)
        : [...current.deletes.filter((id) => id !== index), index];
      const modifies = current.modifies.filter((m) => m.objectIndex !== index);
      return { ...current, deletes, modifies };
    });
    setSelectedObjectIndex(null);
    setSelectedVertexIndex(null);
    setBezierEdit(null);
    setCadVertexTool("off");
    setCadCutTool("off");
    setCutDraftPoints([]);
    setMergeActive(false);
    setMergeObjectIndices([]);
    cutLineDragRef.current = null;
  }, [selectedObjectIndex, updateOps]);

  const changeCutTool = useCallback((tool: CadCutTool) => {
    setCadCutTool(tool);
    setCutDraftPoints([]);
    cutLineDragRef.current = null;
    if (tool !== "off") {
      setCadVertexTool("off");
      setMergeActive(false);
      setMergeObjectIndices([]);
    }
  }, []);

  const changeVertexTool = useCallback((tool: CadVertexTool) => {
    setCadVertexTool(tool);
    if (tool !== "off") {
      setCadCutTool("off");
      setCutDraftPoints([]);
      cutLineDragRef.current = null;
      setMergeActive(false);
      setMergeObjectIndices([]);
    }
  }, []);

  const cancelCut = useCallback(() => {
    setCutDraftPoints([]);
    cutLineDragRef.current = null;
    setCadCutTool("off");
    setInfo(null);
  }, []);

  const cancelMerge = useCallback(() => {
    setMergeActive(false);
    setMergeObjectIndices([]);
    setInfo(null);
  }, []);

  const objectSymbolAndKind = useCallback(
    (objectIndex: number) => {
      const obj = editableObjects.find((entry) => entry.i === objectIndex);
      if (!obj || (obj.t !== "line" && obj.t !== "area")) return null;
      const symbol = isSyntheticAddObjectId(objectIndex)
        ? obj.s
        : opsRef.current.modifies.find((m) => m.objectIndex === objectIndex)?.symbolNumber ??
          obj.s;
      return {
        symbolNumber: symbol,
        kind: geometryKindFromType(obj.t),
        type: obj.t as "line" | "area",
        obj,
      };
    },
    [editableObjects],
  );

  const toggleMerge = useCallback(() => {
    if (mergeActive) {
      cancelMerge();
      return;
    }
    if (selectedObjectIndex == null) return;
    const meta = objectSymbolAndKind(selectedObjectIndex);
    if (!meta) {
      setInfo("Sammanfoga gäller linjer och ytor.");
      return;
    }
    setCadVertexTool("off");
    setCadCutTool("off");
    setCutDraftPoints([]);
    cutLineDragRef.current = null;
    setBezierEdit(null);
    setMergeActive(true);
    setMergeObjectIndices([selectedObjectIndex]);
    setInfo(
      meta.type === "line"
        ? "Sammanfoga: klicka fler linjer med samma symbol (ändpunkter nära varandra)."
        : "Sammanfoga: klicka fler ytor med samma symbol som överlappar.",
    );
  }, [cancelMerge, mergeActive, objectSymbolAndKind, selectedObjectIndex]);

  const mergeToleranceMapUnits = useMemo(
    () => metersToMapUnits(editorSettings.snapToleranceM, ocadMapScale),
    [editorSettings.snapToleranceM, ocadMapScale],
  );

  const canApplyMerge = useMemo(() => {
    if (!mergeActive || mergeObjectIndices.length < 2 || selectedObjectIndex == null) {
      return false;
    }
    const primary = objectSymbolAndKind(selectedObjectIndex);
    if (!primary) return false;
    const rings: [number, number][][] = [];
    for (const idx of mergeObjectIndices) {
      const meta = objectSymbolAndKind(idx);
      if (!meta || !sameMergeSymbol(primary, meta) || meta.type !== primary.type) return false;
      const coords =
        resolveObjectCoordinates(idx, meta.obj.v, ops) ?? meta.obj.v;
      rings.push(coords.map(([x, y]) => [x, y] as [number, number]));
    }
    if (primary.type === "line") {
      return (
        linesCanMerge(rings, mergeToleranceMapUnits) &&
        mergeLineObjects(rings, mergeToleranceMapUnits).length === 1
      );
    }
    return areasCanMerge(rings) && mergeAreaObjects(rings).length === 1;
  }, [
    mergeActive,
    mergeObjectIndices,
    mergeToleranceMapUnits,
    objectSymbolAndKind,
    ops,
    selectedObjectIndex,
  ]);

  const applyMerge = useCallback(() => {
    if (selectedObjectIndex == null || mergeObjectIndices.length < 2) return;
    const primary = objectSymbolAndKind(selectedObjectIndex);
    if (!primary) return;

    const rings: [number, number][][] = [];
    const others: number[] = [];
    for (const idx of mergeObjectIndices) {
      const meta = objectSymbolAndKind(idx);
      if (!meta || !sameMergeSymbol(primary, meta) || meta.type !== primary.type) {
        setInfo("Alla objekt måste ha samma symbol och typ.");
        return;
      }
      const coords =
        resolveObjectCoordinates(idx, meta.obj.v, opsRef.current) ?? meta.obj.v;
      rings.push(coords.map(([x, y]) => [x, y] as [number, number]));
      if (idx !== selectedObjectIndex) others.push(idx);
    }

    let merged: [number, number][] | null = null;
    if (primary.type === "line") {
      const parts = mergeLineObjects(rings, mergeToleranceMapUnits);
      if (parts.length !== 1 || !parts[0]) {
        setInfo(
          "Linjerna kan inte sammanfogas — ändpunkterna måste ligga inom snappningstoleransen.",
        );
        return;
      }
      merged = parts[0];
    } else {
      const parts = mergeAreaObjects(rings);
      if (parts.length !== 1 || !parts[0]) {
        setInfo("Ytorna kan inte sammanfogas — de måste överlappa.");
        return;
      }
      merged = parts[0];
    }

    const mergedCoords = merged;
    const count = mergeObjectIndices.length;
    let nextSelectedIndex = selectedObjectIndex;
    updateOps((current) => {
      let adds = current.adds.slice();
      let modifies = current.modifies.slice();
      let deletes = current.deletes.slice();

      // Remove other members first (highest synthetic index first so indices stay valid).
      const syntheticOthers = others
        .filter((idx) => isSyntheticAddObjectId(idx))
        .map((idx) => addIndexFromSyntheticObjectId(idx))
        .sort((a, b) => b - a);
      for (const addIndex of syntheticOthers) {
        if (addIndex >= 0 && addIndex < adds.length) adds.splice(addIndex, 1);
      }
      for (const idx of others) {
        if (isSyntheticAddObjectId(idx)) continue;
        modifies = modifies.filter((m) => m.objectIndex !== idx);
        if (!deletes.includes(idx)) deletes.push(idx);
      }

      if (isSyntheticAddObjectId(selectedObjectIndex)) {
        const primaryAddIndex = addIndexFromSyntheticObjectId(selectedObjectIndex);
        const removedAbove = syntheticOthers.filter((i) => i < primaryAddIndex).length;
        const adjusted = primaryAddIndex - removedAbove;
        const existing = adds[adjusted];
        if (existing && existing.kind === "line") {
          adds[adjusted] = {
            kind: "line",
            coordinates: mergedCoords,
            symbolNumber: existing.symbolNumber,
          };
        } else if (existing && existing.kind === "area") {
          adds[adjusted] = {
            kind: "area",
            ring: mergedCoords,
            symbolNumber: existing.symbolNumber,
          };
        }
        nextSelectedIndex = syntheticAddObjectId(adjusted);
        deletes = deletes.filter((id) => id !== selectedObjectIndex && id >= 0);
        return { ...current, adds, modifies, deletes };
      }

      const existing = modifies.find((m) => m.objectIndex === selectedObjectIndex);
      const nextModify: FieldEditModify = {
        objectIndex: selectedObjectIndex,
        symbolNumber: existing?.symbolNumber ?? primary.symbolNumber,
        geometryKind: primary.kind,
        coordinates: mergedCoords,
      };
      modifies = existing
        ? modifies.map((m) => (m.objectIndex === selectedObjectIndex ? nextModify : m))
        : [...modifies, nextModify];
      deletes = deletes.filter((id) => id !== selectedObjectIndex);
      return { ...current, adds, modifies, deletes };
    });
    setSelectedObjectIndex(nextSelectedIndex);
    setMergeActive(false);
    setMergeObjectIndices([]);
    setSelectedVertexIndex(null);
    setInfo(
      primary.type === "line"
        ? `Sammanfogade ${count} linjer till ett objekt.`
        : `Sammanfogade ${count} ytor till ett objekt.`,
    );
  }, [
    mergeObjectIndices,
    mergeToleranceMapUnits,
    objectSymbolAndKind,
    selectedObjectIndex,
    updateOps,
  ]);

  const applyFillOrBorder = useCallback(
    (args: {
      targetSymbol: number;
      targetKind: FieldEditGeometryKind;
      useHoles: boolean;
    }) => {
      if (selectedObjectIndex == null) return;
      const obj = editableObjects.find((entry) => entry.i === selectedObjectIndex);
      if (!obj) return;
      const objectSymbol =
        opsRef.current.modifies.find((m) => m.objectIndex === selectedObjectIndex)
          ?.symbolNumber ?? obj.s;
      const coordinates =
        resolveObjectCoordinates(selectedObjectIndex, obj.v, opsRef.current) ?? obj.v;
      const holes = resolveObjectHoles(selectedObjectIndex, opsRef.current);
      const plan = planFillOrBorderOrDuplicate({
        objectType: obj.t,
        objectSymbol,
        coordinates: coordinates.map(([x, y]) => [x, y] as [number, number]),
        holes,
        bbox: obj.b,
        targetSymbol: args.targetSymbol,
        targetKind: args.targetKind,
        bboxPadMapUnits: metersToMapUnits(2, ocadMapScale),
        useHoles: args.useHoles,
      });
      if ("error" in plan) {
        setInfo(plan.error);
        return;
      }
      updateOps((current) => ({
        ...current,
        adds: [...current.adds, ...plan.adds],
      }));
      setInfo(plan.label);
    },
    [objects, ocadMapScale, selectedObjectIndex, updateOps],
  );

  const applySplitParts = useCallback(
    (
      objectIndex: number,
      objectType: "line" | "area",
      partA: [number, number][],
      partB: [number, number][],
      preferSmallerSelection: boolean,
    ) => {
      const obj = editableObjects.find((entry) => entry.i === objectIndex);
      if (!obj) return;
      const symbol = isSyntheticAddObjectId(objectIndex)
        ? obj.s
        : opsRef.current.modifies.find((m) => m.objectIndex === objectIndex)?.symbolNumber ??
          obj.s;
      let keep = partA;
      let added = partB;
      if (preferSmallerSelection && objectType === "area") {
        if (polygonAreaAbs(partB) < polygonAreaAbs(partA)) {
          keep = partB;
          added = partA;
        }
      }
      upsertModify(objectIndex, keep, undefined, objectType === "area" ? [] : null);
      updateOps((current) => ({
        ...current,
        adds: [
          ...current.adds,
          objectType === "line"
            ? { kind: "line" as const, coordinates: added, symbolNumber: symbol }
            : { kind: "area" as const, ring: added, symbolNumber: symbol },
        ],
      }));
      setCadCutTool("off");
      setCutDraftPoints([]);
      cutLineDragRef.current = null;
      setSelectedVertexIndex(null);
      setInfo(
        objectType === "line"
          ? "Linjen delad i två objekt."
          : "Ytan delad i två objekt (mindre delen vald).",
      );
    },
    [editableObjects, updateOps, upsertModify],
  );

  const finishCut = useCallback(() => {
    if (selectedObjectIndex == null) return;
    const obj = editableObjects.find((entry) => entry.i === selectedObjectIndex);
    if (!obj) return;
    const coords =
      resolveObjectCoordinates(selectedObjectIndex, obj.v, opsRef.current) ?? obj.v;

    if (cadCutTool === "cutArea" && obj.t === "area") {
      if (cutDraftPoints.length < 2) {
        setInfo("Klipplinjen behöver minst två punkter.");
        return;
      }
      const result = splitAreaByCutLine(coords, cutDraftPoints, hitDistance);
      if (!result) {
        setInfo("Klipplinjen måste börja och sluta nära ytans kant.");
        return;
      }
      applySplitParts(selectedObjectIndex, "area", result.a, result.b, true);
      return;
    }

    if (cadCutTool === "cutHole" && obj.t === "area") {
      const hole = normalizeHoleRing(cutDraftPoints);
      if (!hole) {
        setInfo("Hålet behöver minst tre hörn.");
        return;
      }
      if (!holeIsInsideOuter(coords, hole)) {
        setInfo("Hålet måste ligga innanför ytan.");
        return;
      }
      const existingHoles = resolveObjectHoles(selectedObjectIndex, opsRef.current);
      upsertModify(selectedObjectIndex, coords, undefined, [...existingHoles, hole]);
      setCadCutTool("off");
      setCutDraftPoints([]);
      setInfo("Hål utklippt i ytan.");
      return;
    }
  }, [
    applySplitParts,
    cadCutTool,
    cutDraftPoints,
    hitDistance,
    objects,
    selectedObjectIndex,
    upsertModify,
  ]);

  const startBezierEdit = useCallback(() => {
    setCadVertexTool("off");
    setCadCutTool("off");
    setCutDraftPoints([]);
    if (selectedObjectIndex == null) return;
    const obj = editableObjects.find((entry) => entry.i === selectedObjectIndex);
    if (!obj || (obj.t !== "line" && obj.t !== "area")) return;
    const coords =
      resolveObjectCoordinates(selectedObjectIndex, obj.v, opsRef.current) ?? obj.v;
    const anchors = verticesForHandles(coords, obj.t).map(
      ([x, y]) => [x, y] as [number, number],
    );
    if (anchors.length < 2) {
      setInfo("Bézier-kurva behöver minst två brytpunkter.");
      return;
    }
    const closed = obj.t === "area";
    setBezierEdit({
      objectIndex: selectedObjectIndex,
      objectType: obj.t,
      anchors,
      controls: defaultBezierControlsForPolyline(anchors, closed),
    });
    setSelectedVertexIndex(null);
    setInfo(
      "Bézier-läge: dra de orangefärgade kontrollpunkterna (P1/P2) för att forma bågen, sedan «Tillämpa kurva».",
    );
  }, [editableObjects, selectedObjectIndex]);

  const applyBezierEdit = useCallback(() => {
    if (!bezierEdit) return;
    const closed = bezierEdit.objectType === "area";
    const sampled = sampleBezierPolyline(
      bezierEdit.anchors,
      bezierEdit.controls,
      closed,
      10,
    );
    const minPoints = closed ? 3 : 2;
    if (sampled.length < minPoints) {
      setInfo("Kurvan gav för få punkter — justera kontrollpunkterna.");
      return;
    }
    const coordinates = closed ? closedRing(sampled) : sampled;
    upsertModify(bezierEdit.objectIndex, coordinates);
    setBezierEdit(null);
    dragBezierControlRef.current = null;
    setSelectedVertexIndex(null);
    setInfo(
      `Bézier-kurva tillämpad: ${bezierEdit.anchors.length} brytpunkter → ${sampled.length} punkter.`,
    );
  }, [bezierEdit, upsertModify]);

  const cancelBezierEdit = useCallback(() => {
    clearBezierEdit();
    setInfo(null);
  }, [clearBezierEdit]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      if (gpsTracking) return;
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      const rawGeo = svgUserToGeoPoint(pt, rootTransformRef.current);
      const excludeIndex =
        tool === "select" && selectedObjectIndex != null ? selectedObjectIndex : null;
      const { point: geo, snap } = resolveSnapPoint(rawGeo, excludeIndex);
      setSnapPreview(snap);

      if (tool === "select") {
        if (bezierEdit && bezierEdit.objectIndex === selectedObjectIndex) {
          const closed = bezierEdit.objectType === "area";
          const controlHit = hitTestBezierControl(
            bezierEdit.anchors,
            bezierEdit.controls,
            closed,
            geo,
            vertexHitDistance,
          );
          if (controlHit) {
            dragBezierControlRef.current = controlHit;
            setSelectedVertexIndex(null);
            return;
          }
          const vertexIndex = hitTestFieldEditVertex(
            bezierEdit.anchors,
            geo,
            vertexHitDistance,
          );
          if (vertexIndex != null) {
            dragVertexRef.current = {
              objectIndex: bezierEdit.objectIndex,
              vertexIndex,
              startCoords: bezierEdit.anchors.map(([x, y]) => [x, y] as [number, number]),
              objectType: bezierEdit.objectType,
            };
            setSelectedVertexIndex(vertexIndex);
            return;
          }
          return;
        }

        if (selectedObjectIndex != null) {
          const obj = editableObjects.find((o) => o.i === selectedObjectIndex);
          const coords =
            resolveObjectCoordinates(selectedObjectIndex, obj?.v ?? [], ops) ?? [];
          const handleCoords =
            obj?.t === "area" ? verticesForHandles(coords, obj.t) : coords;

          if (
            cadCutTool === "cutLine" &&
            obj?.t === "line" &&
            handleCoords.length >= 2
          ) {
            const hit = findLineCutHit(handleCoords, geo, hitDistance);
            if (!hit) {
              setInfo("Klicka på linjen för att klippa.");
              return;
            }
            cutLineDragRef.current = {
              segmentIndex: hit.segmentIndex,
              point: hit.point,
              startClientX: e.clientX,
              startClientY: e.clientY,
            };
            return;
          }

          if (
            (cadCutTool === "cutArea" || cadCutTool === "cutHole") &&
            obj?.t === "area"
          ) {
            setCutDraftPoints((prev) => [...prev, geo]);
            setInfo(
              cadCutTool === "cutArea"
                ? `Klipplinje: ${cutDraftPoints.length + 1} punkter — «Tillämpa klipp» när den går från kant till kant.`
                : `Hål: ${cutDraftPoints.length + 1} hörn — minst 3, sedan «Tillämpa klipp».`,
            );
            return;
          }

          if (
            cadVertexTool !== "off" &&
            obj &&
            (obj.t === "line" || obj.t === "area")
          ) {
            const kinds = resolveObjectVertexKinds(
              selectedObjectIndex,
              handleCoords.length,
              ops,
            );
            const minPoints = obj.t === "line" ? 2 : 3;
            const vertexIndex = hitTestFieldEditVertex(
              handleCoords,
              geo,
              vertexHitDistance,
            );

            if (cadVertexTool === "remove") {
              if (vertexIndex != null) {
                const result = removeVertexAtWithKinds(
                  coords,
                  kinds,
                  obj.t,
                  vertexIndex,
                  minPoints,
                );
                if (!result) {
                  setInfo(`Kan inte radera — minst ${minPoints} brytpunkter krävs.`);
                  return;
                }
                upsertModify(selectedObjectIndex, result.coordinates, result.vertexKinds);
                setSelectedVertexIndex(null);
                setInfo("Brytpunkt raderad.");
                return;
              }
              setInfo("Klicka på en brytpunkt för att radera den.");
              return;
            }

            if (cadVertexTool === "toggleType") {
              if (vertexIndex != null) {
                const currentKind = kinds[vertexIndex] ?? "normal";
                const nextKind = cycleVertexKind(currentKind);
                const result = setVertexKindAt(coords, kinds, obj.t, vertexIndex, nextKind);
                if (!result) return;
                upsertModify(selectedObjectIndex, result.coordinates, result.vertexKinds);
                setSelectedVertexIndex(vertexIndex);
                const label =
                  nextKind === "normal"
                    ? "normal"
                    : nextKind === "corner"
                      ? "hörn"
                      : "streck";
                setInfo(`Brytpunkt → ${label}.`);
                return;
              }
              setInfo("Klicka på en brytpunkt för att växla typ.");
              return;
            }

            const addKind: FieldEditVertexKind =
              cadVertexTool === "addCorner"
                ? "corner"
                : cadVertexTool === "addDash"
                  ? "dash"
                  : "normal";
            const addLabel =
              addKind === "normal" ? "normal" : addKind === "corner" ? "hörn" : "streck";

            // OCAD: in add mode, clicking an existing vertex converts its type.
            if (vertexIndex != null) {
              const result = setVertexKindAt(coords, kinds, obj.t, vertexIndex, addKind);
              if (!result) return;
              upsertModify(selectedObjectIndex, result.coordinates, result.vertexKinds);
              setSelectedVertexIndex(vertexIndex);
              setInfo(`Brytpunkt ändrad till ${addLabel}.`);
              return;
            }

            const hitPolyline =
              obj.t === "area" ? closedRing(handleCoords) : handleCoords;
            const nearest = nearestPointOnPolyline(geo, hitPolyline);
            if (!nearest || nearest.distance > hitDistance) {
              setInfo(`Klicka närmare linjen för att lägga till en ${addLabel}-brytpunkt.`);
              return;
            }
            const tooClose = handleCoords.some(
              (v) => distance2d(v, nearest.point) < vertexHitDistance * 0.35,
            );
            if (tooClose) {
              setInfo("För nära en befintlig brytpunkt — välj en annan plats.");
              return;
            }
            const result = insertVertexOnSegmentWithKinds(
              coords,
              kinds,
              obj.t,
              nearest.segmentIndex,
              nearest.point,
              addKind,
            );
            upsertModify(selectedObjectIndex, result.coordinates, result.vertexKinds);
            setSelectedVertexIndex(null);
            setInfo(`${addLabel === "normal" ? "Normal" : addLabel === "hörn" ? "Hörn" : "Streck"}brytpunkt tillagd.`);
            return;
          }

          const vertexIndex = hitTestFieldEditVertex(handleCoords, geo, vertexHitDistance);
          if (vertexIndex != null && obj) {
            // Defer drag until the pointer moves — so hold-to-cycle can run on overlaps.
            const startCoords =
              resolveObjectCoordinates(selectedObjectIndex, obj.v, opsRef.current) ??
              obj.v.map(([x, y]) => [x, y] as [number, number]);
            pendingVertexDragRef.current = {
              objectIndex: selectedObjectIndex,
              vertexIndex,
              startCoords: startCoords.map(([x, y]) => [x, y] as [number, number]),
              objectType: obj.t,
              startClientX: e.clientX,
              startClientY: e.clientY,
            };
            setSelectedVertexIndex(vertexIndex);
            // Fall through so overlapping objects can still be cycled by holding.
          }
        }

        const hits = hitTestFieldEditObjects(editableObjects, geo, hitDistance).filter(
          (entry) => !ops.deletes.includes(entry.i),
        );
        if (hits.length === 0) {
          clearHoldCycle();
          // Vertex handles can be slightly outside the object hit radius — keep pending drag.
          if (pendingVertexDragRef.current) {
            setInfo(null);
            return;
          }
          if (mergeActive) {
            setInfo("Klicka ett objekt med samma symbol för att lägga till i sammanfogningen.");
            return;
          }
          setSelectedObjectIndex(null);
          setSelectedVertexIndex(null);
          setBezierEdit(null);
          setCadVertexTool("off");
          setCadCutTool("off");
          setCutDraftPoints([]);
          setMergeActive(false);
          setMergeObjectIndices([]);
          return;
        }

        if (mergeActive && selectedObjectIndex != null) {
          const primary = objectSymbolAndKind(selectedObjectIndex);
          if (!primary) {
            cancelMerge();
            return;
          }
          const candidate =
            hits.find((hit) => {
              const meta = objectSymbolAndKind(hit.i);
              return meta && sameMergeSymbol(primary, meta) && meta.type === primary.type;
            }) ?? null;
          if (!candidate) {
            setInfo("Objektet har annan symbol eller typ — välj samma symbol.");
            return;
          }
          setMergeObjectIndices((prev) => {
            if (prev.includes(candidate.i)) {
              if (candidate.i === selectedObjectIndex) return prev;
              const next = prev.filter((id) => id !== candidate.i);
              setInfo(`Borttagen från sammanfogning (${next.length} objekt).`);
              return next;
            }
            const next = [...prev, candidate.i];
            setInfo(`Tillagd i sammanfogning (${next.length} objekt).`);
            return next;
          });
          clearHoldCycle();
          setError(null);
          return;
        }

        const indices = hits.map((entry) => entry.i);
        let startIndex = 0;
        if (selectedObjectIndex != null) {
          const existing = indices.indexOf(selectedObjectIndex);
          if (existing >= 0) startIndex = existing;
        }
        const chosen = indices[startIndex]!;
        setSelectedObjectIndex(indices[startIndex]!);
        if (pendingVertexDragRef.current?.objectIndex !== chosen) {
          pendingVertexDragRef.current = null;
          setSelectedVertexIndex(null);
        }
        setBezierEdit(null);
        setCadCutTool("off");
        setCutDraftPoints([]);
        cutLineDragRef.current = null;
        setMergeActive(false);
        setMergeObjectIndices([]);
        setError(null);

        clearHoldCycle();
        if (indices.length > 1) {
          holdCycleRef.current = {
            indices,
            index: startIndex,
            startClientX: e.clientX,
            startClientY: e.clientY,
            timer: null,
          };
          holdCycleRef.current.timer = setTimeout(
            () => advanceHoldCycleRef.current(),
            1000,
          );
          setInfo(
            `Överlappande objekt ${startIndex + 1}/${indices.length} — håll kvar för nästa`,
          );
        } else {
          setInfo(null);
        }
        return;
      }

      if (tool === "delete") {
        const hit = hitTestFieldEditObject(editableObjects, geo, hitDistance);
        if (!hit) {
          setError("Inget objekt hittades — zooma in och försök igen");
          return;
        }
        if (isSyntheticAddObjectId(hit.i)) {
          const addIndex = addIndexFromSyntheticObjectId(hit.i);
          updateOps((current) => {
            if (addIndex < 0 || addIndex >= current.adds.length) return current;
            return { ...current, adds: current.adds.filter((_, idx) => idx !== addIndex) };
          });
          const remapSynthetic = (id: number | null): number | null => {
            if (id == null || !isSyntheticAddObjectId(id)) return id;
            const idx = addIndexFromSyntheticObjectId(id);
            if (idx === addIndex) return null;
            if (idx > addIndex) return syntheticAddObjectId(idx - 1);
            return id;
          };
          setSelectedObjectIndex((prev) => remapSynthetic(prev));
          setMergeObjectIndices((prev) =>
            prev
              .map((id) => remapSynthetic(id))
              .filter((id): id is number => id != null),
          );
        } else {
          updateOps((current) => {
            const deletes = current.deletes.includes(hit.i)
              ? current.deletes.filter((id) => id !== hit.i)
              : [...current.deletes.filter((id) => id !== hit.i), hit.i];
            const modifies = current.modifies.filter((m) => m.objectIndex !== hit.i);
            return { ...current, deletes, modifies };
          });
          if (selectedObjectIndex === hit.i) {
            setSelectedObjectIndex(null);
            setSelectedVertexIndex(null);
            setBezierEdit(null);
          }
        }
        if (isSyntheticAddObjectId(hit.i) && selectedObjectIndex === hit.i) {
          setSelectedVertexIndex(null);
          setBezierEdit(null);
        }
        setError(null);
        return;
      }

      if (tool === "addPoint") {
        const hit = hitTestFieldEditObject(editableObjects, geo, hitDistance);
        if (hit && !ops.deletes.includes(hit.i)) {
          if (pickSymbolFromObject(hit, "point")) return;
        }
        if (symbolNumber === "") {
          setError("Välj en punkt-symbol eller klicka på ett kartobjekt");
          return;
        }
        updateOps((current) => ({
          ...current,
          adds: [
            ...current.adds,
            { kind: "point", x: geo[0], y: geo[1], symbolNumber: Number(symbolNumber) },
          ],
        }));
        setError(null);
        setInfo(null);
        return;
      }

      if (tool === "addLine" || tool === "addArea") {
        const kind = tool === "addLine" ? "line" : "area";
        const hit = hitTestFieldEditObject(editableObjects, geo, hitDistance);
        if (hit && !ops.deletes.includes(hit.i)) {
          const noDraftYet =
            draftPoints.length === 0 &&
            bezierDraftAnchors.length === 0 &&
            bezierGesture.phase === "idle" &&
            rectangularGesture.phase === "idle" &&
            circleGesture.phase === "idle" &&
            ellipseGesture.phase === "idle";
          if (noDraftYet && pickSymbolFromObject(hit, kind)) return;
        }

        if (rectangularDrawMode) {
          if (rectangularGesture.phase === "idle") {
            setRectangularGesture({ phase: "drag_edge1", p0: geo, p1: geo });
            setInfo("Rektangel: dra längsta sidan till nästa hörn, släpp.");
            setError(null);
            return;
          }
          if (rectangularGesture.phase === "await_edge2") {
            const [p0, p1, p2, p3] = rectangularCorners(
              rectangularGesture.p0,
              rectangularGesture.p1,
              geo,
            );
            setRectangularGesture({
              phase: "drag_edge2",
              p0,
              p1,
              p2,
              p3,
            });
            setInfo("Dra vinkelrätt till tredje hörnet — streckad linje visar hela rektangeln.");
            return;
          }
          if (rectangularGesture.phase === "ready") {
            // Click finishes (OCAD).
            if (symbolNumber === "") {
              setError("Välj symbol");
              return;
            }
            const corners: [
              [number, number],
              [number, number],
              [number, number],
              [number, number],
            ] = [
              rectangularGesture.p0,
              rectangularGesture.p1,
              rectangularGesture.p2,
              rectangularGesture.p3,
            ];
            if (tool === "addLine") {
              updateOps((current) => ({
                ...current,
                adds: [
                  ...current.adds,
                  {
                    kind: "line",
                    coordinates: rectangularLineCoords(corners),
                    symbolNumber: Number(symbolNumber),
                    vertexKinds: ["corner", "corner", "corner", "corner", "corner"],
                  },
                ],
              }));
            } else {
              updateOps((current) => ({
                ...current,
                adds: [
                  ...current.adds,
                  {
                    kind: "area",
                    ring: rectangularAreaRing(corners),
                    symbolNumber: Number(symbolNumber),
                    vertexKinds: ["corner", "corner", "corner", "corner", "corner"],
                  },
                ],
              }));
            }
            setRectangularGesture({ phase: "idle" });
            setInfo("Rektangel skapad. Börja nästa eller byt verktyg.");
            setError(null);
            return;
          }
          return;
        }

        if (circleDrawMode) {
          if (circleGesture.phase === "idle") {
            setCircleGesture({ phase: "drag_diameter", a: geo, b: geo });
            setInfo("Cirkel: dra diametern från kant till kant, släpp för att skapa.");
            setError(null);
            return;
          }
          return;
        }

        if (ellipseDrawMode) {
          if (ellipseGesture.phase === "idle") {
            setEllipseGesture({ phase: "drag_major", a: geo, b: geo });
            setInfo("Ellips: dra längsta axeln till andra kanten, släpp.");
            setError(null);
            return;
          }
          if (ellipseGesture.phase === "await_minor") {
            setEllipseGesture({
              phase: "drag_minor",
              a: ellipseGesture.a,
              b: ellipseGesture.b,
              q: geo,
            });
            setInfo("Dra kortare axeln vinkelrätt genom centrum, släpp för att skapa.");
            return;
          }
          return;
        }

        if (bezierDrawMode) {
          if (bezierGesture.phase === "idle") {
            const last = bezierDraftAnchors[bezierDraftAnchors.length - 1];
            // Continue from last breakpoint when a draft already exists.
            const start = bezierDraftAnchors.length > 0 ? (last as [number, number]) : geo;
            setBezierGesture({ phase: "drag_p1", p0: start, p1: geo });
            setError(null);
            setInfo(null);
            return;
          }
          if (bezierGesture.phase === "await_p2") {
            setBezierGesture({
              phase: "drag_p3",
              p0: bezierGesture.p0,
              p1: bezierGesture.p1,
              p2: geo,
              p3: geo,
            });
            return;
          }
          return;
        }

        if (freehandDrawMode) {
          freehandPointerDownRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            pointsAtDown: draftPoints.length,
          };
          freehandDrawingRef.current = true;
          const factor = editorSettingsRef.current.freehandSmoothingFactor;
          const minDist = metersToMapUnits(
            freehandMinSampleDistanceM(factor),
            ocadMapScale,
          );
          setDraftPoints((prev) => {
            const next = maybeAppendFreehandPoint(prev, geo, minDist);
            return next ?? prev;
          });
          setError(null);
          setInfo(
            draftPoints.length >= 2
              ? "Frihand: fortsätt dra, eller klicka igen / «Klar» för att avsluta."
              : "Frihand: dra längs linjen. Klicka igen eller «Klar» när du är färdig.",
          );
          return;
        }

        setDraftPoints((prev) => [...prev, geo]);
        setError(null);
        setInfo(null);
      }
    },
    [
      bezierDraftAnchors,
      bezierDrawMode,
      bezierEdit,
      bezierGesture,
      cadVertexTool,
      cadCutTool,
      cancelMerge,
      cutDraftPoints.length,
      clearHoldCycle,
      draftPoints.length,
      mergeActive,
      objectSymbolAndKind,
      editableObjects,
      ops,
      pickSymbolFromObject,
      rectangularDrawMode,
      rectangularGesture,
      circleDrawMode,
      circleGesture,
      ellipseDrawMode,
      ellipseGesture,
      resolveSnapPoint,
      selectedObjectIndex,
      symbolNumber,
      tool,
      updateOps,
      upsertModify,
      gpsTracking,
      hitDistance,
      vertexHitDistance,
      freehandDrawMode,
      draftPoints.length,
      ocadMapScale,
    ],
  );

  const handlePointerMove = useCallback(
    (_e: React.PointerEvent, svg: SVGSVGElement) => {
      const pt = screenToSvgPoint(svg, _e.clientX, _e.clientY);
      if (!pt) return;
      const rawGeo = svgUserToGeoPoint(pt, rootTransformRef.current);

      const HOLD_MOVE_CANCEL_PX = 12;
      const hold = holdCycleRef.current;
      if (hold) {
        const moved = Math.hypot(
          _e.clientX - hold.startClientX,
          _e.clientY - hold.startClientY,
        );
        if (moved > HOLD_MOVE_CANCEL_PX) {
          clearHoldCycle();
        }
      }

      const pending = pendingVertexDragRef.current;
      if (pending && !dragVertexRef.current && tool === "select") {
        const moved = Math.hypot(
          _e.clientX - pending.startClientX,
          _e.clientY - pending.startClientY,
        );
        if (moved > HOLD_MOVE_CANCEL_PX) {
          clearHoldCycle();
          dragVertexRef.current = {
            objectIndex: pending.objectIndex,
            vertexIndex: pending.vertexIndex,
            startCoords: pending.startCoords,
            objectType: pending.objectType,
          };
          pendingVertexDragRef.current = null;
        }
      }

      if (
        freehandDrawMode &&
        freehandDrawingRef.current &&
        (tool === "addLine" || tool === "addArea")
      ) {
        const factor = editorSettingsRef.current.freehandSmoothingFactor;
        const minDist = metersToMapUnits(
          freehandMinSampleDistanceM(factor),
          ocadMapScale,
        );
        setDraftPoints((prev) => {
          const next = maybeAppendFreehandPoint(prev, rawGeo, minDist);
          return next ?? prev;
        });
        setSnapPreview(null);
        return;
      }

      if (
        rectangularDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        (rectangularGesture.phase === "drag_edge1" ||
          rectangularGesture.phase === "drag_edge2")
      ) {
        const { point: geo } = resolveSnapPoint(rawGeo, null);
        if (rectangularGesture.phase === "drag_edge1") {
          setRectangularGesture({
            phase: "drag_edge1",
            p0: rectangularGesture.p0,
            p1: geo,
          });
        } else {
          const [p0, p1, p2, p3] = rectangularCorners(
            rectangularGesture.p0,
            rectangularGesture.p1,
            geo,
          );
          setRectangularGesture({
            phase: "drag_edge2",
            p0,
            p1,
            p2,
            p3,
          });
        }
        setSnapPreview(null);
        return;
      }

      if (
        circleDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        circleGesture.phase === "drag_diameter"
      ) {
        const { point: geo } = resolveSnapPoint(rawGeo, null);
        setCircleGesture({
          phase: "drag_diameter",
          a: circleGesture.a,
          b: geo,
        });
        setSnapPreview(null);
        return;
      }

      if (
        ellipseDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        (ellipseGesture.phase === "drag_major" || ellipseGesture.phase === "drag_minor")
      ) {
        const { point: geo } = resolveSnapPoint(rawGeo, null);
        if (ellipseGesture.phase === "drag_major") {
          setEllipseGesture({
            phase: "drag_major",
            a: ellipseGesture.a,
            b: geo,
          });
        } else {
          setEllipseGesture({
            phase: "drag_minor",
            a: ellipseGesture.a,
            b: ellipseGesture.b,
            q: geo,
          });
        }
        setSnapPreview(null);
        return;
      }

      if (
        bezierDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        (bezierGesture.phase === "drag_p1" || bezierGesture.phase === "drag_p3")
      ) {
        const { point: geo } = resolveSnapPoint(rawGeo, null);
        if (bezierGesture.phase === "drag_p1") {
          setBezierGesture({ ...bezierGesture, p1: geo });
        } else {
          setBezierGesture({ ...bezierGesture, p3: geo });
        }
        setSnapPreview(null);
        return;
      }

      const bezierDrag = dragBezierControlRef.current;
      if (bezierDrag && tool === "select") {
        const geo = rawGeo;
        setBezierEdit((current) => {
          if (!current) return current;
          const controls = current.controls.map((seg, index) => {
            if (index !== bezierDrag.segmentIndex) return seg;
            return {
              ...seg,
              [bezierDrag.which]: [geo[0], geo[1]] as [number, number],
            };
          });
          return { ...current, controls };
        });
        return;
      }

      const drag = dragVertexRef.current;
      if (drag && tool === "select") {
        const { point: geo } = resolveSnapPoint(rawGeo, drag.objectIndex);
        if (bezierEdit && bezierEdit.objectIndex === drag.objectIndex) {
          const nextAnchors = applyVertexMove(
            drag.startCoords,
            drag.objectType,
            drag.vertexIndex,
            geo,
          );
          const anchors = verticesForHandles(nextAnchors, drag.objectType);
          setBezierEdit((current) =>
            current
              ? {
                  ...current,
                  anchors: anchors.map(([x, y]) => [x, y] as [number, number]),
                }
              : current,
          );
          return;
        }
        const next = applyVertexMove(
          drag.startCoords,
          drag.objectType,
          drag.vertexIndex,
          geo,
        );
        upsertModify(drag.objectIndex, next);
        return;
      }

      const shouldPreviewSnap =
        editorSettings.snapEnabled &&
        (tool === "addLine" ||
          tool === "addArea" ||
          tool === "addPoint" ||
          (tool === "select" && selectedObjectIndex != null));
      if (!shouldPreviewSnap) {
        setSnapPreview(null);
        return;
      }

      const excludeIndex =
        tool === "select" && selectedObjectIndex != null ? selectedObjectIndex : null;
      const { snap } = resolveSnapPoint(rawGeo, excludeIndex);
      setSnapPreview(snap);
    },
    [
      bezierDrawMode,
      bezierEdit,
      bezierGesture,
      clearHoldCycle,
      circleDrawMode,
      circleGesture,
      editorSettings.snapEnabled,
      ellipseDrawMode,
      ellipseGesture,
      freehandDrawMode,
      ocadMapScale,
      rectangularDrawMode,
      rectangularGesture,
      resolveSnapPoint,
      selectedObjectIndex,
      tool,
      upsertModify,
    ],
  );

  const handlePointerUp = useCallback(
    (_e?: React.PointerEvent, _svg?: SVGSVGElement) => {
      clearHoldCycle();
      pendingVertexDragRef.current = null;

      if (freehandDrawMode && (tool === "addLine" || tool === "addArea")) {
        const wasDrawing = freehandDrawingRef.current;
        freehandDrawingRef.current = false;
        const down = freehandPointerDownRef.current;
        freehandPointerDownRef.current = null;
        if (wasDrawing && down && _e) {
          const moved = Math.hypot(_e.clientX - down.clientX, _e.clientY - down.clientY);
          // Short second click finishes (OCAD freehand).
          if (moved < 10 && down.pointsAtDown >= 2) {
            finishDraftRef.current();
            setSnapPreview(null);
            return;
          }
        }
        if (draftPoints.length >= 2) {
          setInfo('Frihand: fortsätt dra, eller klicka igen / «Klar» för att avsluta.');
        }
        setSnapPreview(null);
        // Fall through only when not handling freehand exclusively — return to avoid other modes.
        return;
      }

      if (
        rectangularDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        rectangularGesture.phase === "drag_edge1"
      ) {
        if (rectangularEdgeLength(rectangularGesture.p0, rectangularGesture.p1) < RECT_MIN_EDGE) {
          setRectangularGesture({ phase: "idle" });
          setInfo("Dra en längre sida — börja med den längsta sidan.");
          setSnapPreview(null);
          return;
        }
        setRectangularGesture({
          phase: "await_edge2",
          p0: rectangularGesture.p0,
          p1: rectangularGesture.p1,
        });
        setInfo("Tryck och dra vinkelrätt till tredje hörnet.");
        setSnapPreview(null);
        return;
      }

      if (
        rectangularDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        rectangularGesture.phase === "drag_edge2"
      ) {
        const width = rectangularEdgeLength(rectangularGesture.p1, rectangularGesture.p2);
        if (width < RECT_MIN_EDGE) {
          setRectangularGesture({
            phase: "await_edge2",
            p0: rectangularGesture.p0,
            p1: rectangularGesture.p1,
          });
          setInfo("Dra ut bredden, sedan släpp. Klicka för att avsluta när förhandsvisningen syns.");
          setSnapPreview(null);
          return;
        }
        setRectangularGesture({
          phase: "ready",
          p0: rectangularGesture.p0,
          p1: rectangularGesture.p1,
          p2: rectangularGesture.p2,
          p3: rectangularGesture.p3,
        });
        setInfo("Klicka för att avsluta, eller tryck «Klar».");
        setSnapPreview(null);
        return;
      }

      if (
        circleDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        circleGesture.phase === "drag_diameter"
      ) {
        if (axisLength(circleGesture.a, circleGesture.b) < RECT_MIN_EDGE) {
          setCircleGesture({ phase: "idle" });
          setInfo("Dra en längre diameter — från kant till motsatt kant.");
          setSnapPreview(null);
          return;
        }
        const ring = circleRingFromDiameter(circleGesture.a, circleGesture.b);
        setCircleGesture({ phase: "idle" });
        setSnapPreview(null);
        if (!ring) {
          setInfo("Cirkel: dra diametern från kant till kant, släpp för att skapa.");
          return;
        }
        if (commitCurveRing(ring, tool)) {
          setInfo("Cirkel skapad. Börja nästa eller byt verktyg.");
        }
        return;
      }

      if (
        ellipseDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        ellipseGesture.phase === "drag_major"
      ) {
        if (axisLength(ellipseGesture.a, ellipseGesture.b) < RECT_MIN_EDGE) {
          setEllipseGesture({ phase: "idle" });
          setInfo("Dra en längre axel först — det blir ellipsens längsta sida.");
          setSnapPreview(null);
          return;
        }
        setEllipseGesture({
          phase: "await_minor",
          a: ellipseGesture.a,
          b: ellipseGesture.b,
        });
        setInfo("Tryck och dra kortare axeln vinkelrätt genom centrum.");
        setSnapPreview(null);
        return;
      }

      if (
        ellipseDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        ellipseGesture.phase === "drag_minor"
      ) {
        const minorEnds = ellipseMinorAxisEnds(
          ellipseGesture.a,
          ellipseGesture.b,
          ellipseGesture.q,
        );
        const minorLen = minorEnds ? axisLength(minorEnds[0], minorEnds[1]) : 0;
        if (minorLen < RECT_MIN_EDGE) {
          setEllipseGesture({
            phase: "await_minor",
            a: ellipseGesture.a,
            b: ellipseGesture.b,
          });
          setInfo("Dra ut den kortare axeln, sedan släpp för att skapa.");
          setSnapPreview(null);
          return;
        }
        const ring = ellipseRingFromAxes(
          ellipseGesture.a,
          ellipseGesture.b,
          ellipseGesture.q,
        );
        setEllipseGesture({ phase: "idle" });
        setSnapPreview(null);
        if (!ring) {
          setInfo("Ellips: dra längsta axeln → släpp → dra kortare axeln → släpp.");
          return;
        }
        if (commitCurveRing(ring, tool)) {
          setInfo("Ellips skapad. Börja nästa eller byt verktyg.");
        }
        return;
      }

      const cutDrag = cutLineDragRef.current;
      if (
        cutDrag &&
        cadCutTool === "cutLine" &&
        selectedObjectIndex != null &&
        _e &&
        _svg
      ) {
        cutLineDragRef.current = null;
        const obj = editableObjects.find((o) => o.i === selectedObjectIndex);
        if (obj?.t === "line") {
          const coords =
            resolveObjectCoordinates(selectedObjectIndex, obj.v, opsRef.current) ??
            obj.v;
          const pt = screenToSvgPoint(_svg, _e.clientX, _e.clientY);
          if (pt) {
            const rawGeo = svgUserToGeoPoint(pt, rootTransformRef.current);
            const { point: geo } = resolveSnapPoint(rawGeo, selectedObjectIndex);
            const endHit = findLineCutHit(coords, geo, hitDistance);
            const moved = Math.hypot(
              _e.clientX - cutDrag.startClientX,
              _e.clientY - cutDrag.startClientY,
            );
            if (endHit && moved > 12) {
              const gap = cutLineGap(
                coords,
                cutDrag.segmentIndex,
                cutDrag.point,
                endHit.segmentIndex,
                endHit.point,
              );
              if (gap) {
                applySplitParts(selectedObjectIndex, "line", gap.a, gap.b, false);
                setSnapPreview(null);
                return;
              }
            }
            const split = splitLineAtPoint(
              coords,
              cutDrag.segmentIndex,
              cutDrag.point,
            );
            if (split) {
              applySplitParts(selectedObjectIndex, "line", split.a, split.b, false);
              setSnapPreview(null);
              return;
            }
            setInfo("Kunde inte klippa linjen här.");
          }
        }
      }
      cutLineDragRef.current = null;

      if (
        bezierDrawMode &&
        (tool === "addLine" || tool === "addArea") &&
        (bezierGesture.phase === "drag_p1" || bezierGesture.phase === "drag_p3")
      ) {
        if (bezierGesture.phase === "drag_p1") {
          setBezierGesture({
            phase: "await_p2",
            p0: bezierGesture.p0,
            p1: bezierGesture.p1,
          });
          setInfo("Tryck ner på P2 och släpp på nästa brytpunkt.");
        } else {
          const { p0, p1, p2, p3 } = bezierGesture;
          setBezierDraftAnchors((prev) => (prev.length === 0 ? [p0, p3] : [...prev, p3]));
          setBezierDraftControls((prev) => [...prev, { p1, p2 }]);
          setBezierGesture({ phase: "idle" });
          setInfo(
            "Segment sparat. Fortsätt från sista brytpunkten, eller klicka «Klar» när du är färdig.",
          );
        }
        dragVertexRef.current = null;
        dragBezierControlRef.current = null;
        setSnapPreview(null);
        return;
      }

      dragVertexRef.current = null;
      dragBezierControlRef.current = null;
      setSnapPreview(null);
    },
    [applySplitParts, bezierDrawMode, bezierGesture, cadCutTool, clearHoldCycle, circleDrawMode, circleGesture, commitCurveRing, draftPoints.length, ellipseDrawMode, ellipseGesture, freehandDrawMode, hitDistance, objects, rectangularDrawMode, rectangularGesture, resolveSnapPoint, selectedObjectIndex, tool],
  );

  const finishDraft = useCallback(() => {
    if (symbolNumber === "") {
      setError("Välj symbol");
      return;
    }
    if (
      circleDrawMode &&
      (tool === "addLine" || tool === "addArea") &&
      circleGesture.phase === "drag_diameter"
    ) {
      if (axisLength(circleGesture.a, circleGesture.b) < RECT_MIN_EDGE) {
        setError("Dra en längre diameter först.");
        return;
      }
      const ring = circleRingFromDiameter(circleGesture.a, circleGesture.b);
      if (!ring) {
        setError("Kunde inte skapa cirkeln.");
        return;
      }
      setCircleGesture({ phase: "idle" });
      commitCurveRing(ring, tool);
      return;
    }
    if (
      ellipseDrawMode &&
      (tool === "addLine" || tool === "addArea") &&
      ellipseGesture.phase === "drag_minor"
    ) {
      const minorEnds = ellipseMinorAxisEnds(
        ellipseGesture.a,
        ellipseGesture.b,
        ellipseGesture.q,
      );
      const minorLen = minorEnds ? axisLength(minorEnds[0], minorEnds[1]) : 0;
      if (minorLen < RECT_MIN_EDGE) {
        setError("Dra ut den kortare axeln först.");
        return;
      }
      const ring = ellipseRingFromAxes(ellipseGesture.a, ellipseGesture.b, ellipseGesture.q);
      if (!ring) {
        setError("Kunde inte skapa ellipsen.");
        return;
      }
      setEllipseGesture({ phase: "idle" });
      commitCurveRing(ring, tool);
      return;
    }
    if (
      rectangularDrawMode &&
      (tool === "addLine" || tool === "addArea") &&
      (rectangularGesture.phase === "ready" || rectangularGesture.phase === "drag_edge2")
    ) {
      const corners = rectangularCornersFromGesture(rectangularGesture);
      if (!corners) {
        setError("Rita klart rektangeln först (två sidor).");
        return;
      }
      if (tool === "addLine") {
        updateOps((current) => ({
          ...current,
          adds: [
            ...current.adds,
            {
              kind: "line",
              coordinates: rectangularLineCoords(corners),
              symbolNumber: Number(symbolNumber),
              vertexKinds: ["corner", "corner", "corner", "corner", "corner"],
            },
          ],
        }));
      } else {
        updateOps((current) => ({
          ...current,
          adds: [
            ...current.adds,
            {
              kind: "area",
              ring: rectangularAreaRing(corners),
              symbolNumber: Number(symbolNumber),
              vertexKinds: ["corner", "corner", "corner", "corner", "corner"],
            },
          ],
        }));
      }
      setRectangularGesture({ phase: "idle" });
      setError(null);
      afterAddObject();
      return;
    }
    if (tool === "addLine") {
      let coordinates: [number, number][];
      if (bezierDrawMode) {
        if (bezierDraftAnchors.length < 2 || bezierDraftControls.length === 0) {
          setError("Linjen behöver minst ett Bézier-segment (2 brytpunkter)");
          return;
        }
        coordinates = sampleBezierPolyline(
          bezierDraftAnchors,
          bezierDraftControls,
          false,
          10,
        );
        if (coordinates.length < 2) {
          setError("Kurvan gav för få punkter");
          return;
        }
      } else {
        if (draftPoints.length < 2) {
          setError("Linjen behöver minst 2 punkter");
          return;
        }
        coordinates = freehandDrawMode
          ? smoothFreehandPolyline(
              draftPoints,
              editorSettings.freehandSmoothingFactor,
              ocadMapScale,
              2,
            )
          : draftPoints;
      }
      updateOps((current) => ({
        ...current,
        adds: [
          ...current.adds,
          {
            kind: "line",
            coordinates,
            symbolNumber: Number(symbolNumber),
          },
        ],
      }));
    } else if (tool === "addArea") {
      let ring: [number, number][];
      if (bezierDrawMode) {
        if (bezierDraftAnchors.length < 3 || bezierDraftControls.length < 2) {
          setError("Ytan behöver minst 3 brytpunkter (två Bézier-segment)");
          return;
        }
        const closing = defaultBezierControlsForPolyline(bezierDraftAnchors, true);
        const closeSeg = closing[closing.length - 1]!;
        const controls = [...bezierDraftControls, closeSeg];
        const sampled = sampleBezierPolyline(
          bezierDraftAnchors,
          controls,
          true,
          10,
        );
        ring = closedRing(sampled);
        if (ring.length < 3) {
          setError("Kurvan gav för få punkter");
          return;
        }
      } else {
        if (draftPoints.length < 3) {
          setError("Ytan behöver minst 3 hörn");
          return;
        }
        ring = freehandDrawMode
          ? smoothFreehandPolyline(
              draftPoints,
              editorSettings.freehandSmoothingFactor,
              ocadMapScale,
              3,
            )
          : draftPoints;
      }
      updateOps((current) => ({
        ...current,
        adds: [
          ...current.adds,
          {
            kind: "area",
            ring,
            symbolNumber: Number(symbolNumber),
          },
        ],
      }));
    }
    setDraftPoints([]);
    clearBezierDraft();
    clearRectangularGesture();
    clearCircleGesture();
    clearEllipseGesture();
    freehandDrawingRef.current = false;
    freehandPointerDownRef.current = null;
    setError(null);
    afterAddObject();
  }, [
    bezierDraftAnchors,
    bezierDraftControls,
    bezierDrawMode,
    circleDrawMode,
    circleGesture,
    clearBezierDraft,
    clearCircleGesture,
    clearEllipseGesture,
    clearRectangularGesture,
    commitCurveRing,
    draftPoints,
    editorSettings.freehandSmoothingFactor,
    ellipseDrawMode,
    ellipseGesture,
    freehandDrawMode,
    ocadMapScale,
    rectangularCornersFromGesture,
    rectangularDrawMode,
    rectangularGesture,
    afterAddObject,
    symbolNumber,
    tool,
    updateOps,
  ]);
  finishDraftRef.current = finishDraft;

  const cancelDraft = useCallback(() => {
    setDraftPoints([]);
    clearBezierDraft();
    clearRectangularGesture();
    clearCircleGesture();
    clearEllipseGesture();
    freehandDrawingRef.current = false;
    freehandPointerDownRef.current = null;
  }, [clearBezierDraft, clearCircleGesture, clearEllipseGesture, clearRectangularGesture]);

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  const renderSvgOverlay = useCallback(
    (transform: SvgRootTransform) => {
      rootTransformRef.current = transform;
      return (
        <g
          dangerouslySetInnerHTML={{
            __html: fieldEditOverlaySvg({
              transform,
              selectionGeometry: selection.geometry,
              objects: editableObjects,
              ops,
              selectedObjectIndex,
              selectedVertexIndex,
              draftPoints,
              draftKind,
              gpsLivePoints: gpsLiveCoordinates,
              symbolPreviewInner: symbolPreview.svgInner,
              maskedObjectIndices: symbolPreview.maskedIndices,
              draftHasSymbolPreview,
              snapPreview,
              bezierEdit:
                bezierEdit && bezierEdit.objectIndex === selectedObjectIndex
                  ? {
                      anchors: bezierEdit.anchors,
                      controls: bezierEdit.controls,
                      closed: bezierEdit.objectType === "area",
                    }
                  : null,
              bezierDraw:
                bezierDrawMode && (tool === "addLine" || tool === "addArea")
                  ? {
                      anchors: bezierDraftAnchors,
                      controls: bezierDraftControls,
                      live:
                        bezierGesture.phase === "drag_p1" ||
                        bezierGesture.phase === "await_p2"
                          ? {
                              p0: bezierGesture.p0,
                              p1: bezierGesture.p1,
                            }
                          : bezierGesture.phase === "drag_p3"
                            ? {
                                p0: bezierGesture.p0,
                                p1: bezierGesture.p1,
                                p2: bezierGesture.p2,
                                p3: bezierGesture.p3,
                              }
                            : null,
                    }
                  : null,
              cutDraftPoints: cadCutTool !== "off" ? cutDraftPoints : [],
              mergeObjectIndices: mergeActive ? mergeObjectIndices : [],
              rectangularDraw: (() => {
                if (!rectangularDrawMode || (tool !== "addLine" && tool !== "addArea")) {
                  return null;
                }
                const g = rectangularGesture;
                if (g.phase === "drag_edge1") {
                  return {
                    solid: [g.p0, g.p1] as [number, number][],
                    dashed: [] as [number, number][],
                    fill: false,
                  };
                }
                if (g.phase === "await_edge2") {
                  return {
                    solid: [g.p0, g.p1] as [number, number][],
                    dashed: [] as [number, number][],
                    fill: false,
                  };
                }
                if (g.phase === "drag_edge2" || g.phase === "ready") {
                  return {
                    solid: [g.p0, g.p1, g.p2] as [number, number][],
                    dashed: [g.p2, g.p3, g.p0] as [number, number][],
                    fill: tool === "addArea",
                  };
                }
                return null;
              })(),
              curveDraw: (() => {
                if (
                  (!circleDrawMode && !ellipseDrawMode) ||
                  (tool !== "addLine" && tool !== "addArea")
                ) {
                  return null;
                }
                if (circleDrawMode && circleGesture.phase === "drag_diameter") {
                  const ring =
                    circleRingFromDiameter(circleGesture.a, circleGesture.b) ??
                    ([] as [number, number][]);
                  return {
                    ring,
                    fill: tool === "addArea",
                    axesSolid: [circleGesture.a, circleGesture.b] as [number, number][],
                  };
                }
                if (ellipseDrawMode) {
                  const g = ellipseGesture;
                  if (g.phase === "drag_major" || g.phase === "await_minor") {
                    return {
                      ring: [] as [number, number][],
                      fill: false,
                      axesSolid: [g.a, g.b] as [number, number][],
                    };
                  }
                  if (g.phase === "drag_minor") {
                    const ring =
                      ellipseRingFromAxes(g.a, g.b, g.q) ?? ([] as [number, number][]);
                    const minor = ellipseMinorAxisEnds(g.a, g.b, g.q);
                    return {
                      ring,
                      fill: tool === "addArea",
                      axesSolid: [g.a, g.b] as [number, number][],
                      axesDashed: minor
                        ? ([minor[0], minor[1]] as [number, number][])
                        : undefined,
                    };
                  }
                }
                return null;
              })(),
            }),
          }}
        />
      );
    },
    [
      selection.geometry,
      editableObjects,
      ops,
      selectedObjectIndex,
      selectedVertexIndex,
      draftPoints,
      draftKind,
      gpsLiveCoordinates,
      symbolPreview,
      draftHasSymbolPreview,
      snapPreview,
      bezierEdit,
      bezierDrawMode,
      cadCutTool,
      cutDraftPoints,
      mergeActive,
      mergeObjectIndices,
      rectangularDrawMode,
      rectangularGesture,
      circleDrawMode,
      circleGesture,
      ellipseDrawMode,
      ellipseGesture,
      bezierDraftAnchors,
      bezierDraftControls,
      bezierGesture,
      tool,
    ],
  );

  const selectedObject = useMemo(
    () =>
      selectedObjectIndex != null
        ? editableObjects.find((entry) => entry.i === selectedObjectIndex) ?? null
        : null,
    [editableObjects, selectedObjectIndex],
  );

  function handleOpenReview() {
    if (!hasFieldEditChanges(ops)) {
      setError("Gör minst en ändring innan du checkar in");
      return;
    }
    setReviewSummary(buildFieldEditReviewSummary(ops, objects));
    setError(null);
  }

  async function handleConfirmSubmit() {
    saveLocalFieldEditOps(sessionId, ops);
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    });
    setPublishing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Incheckning misslyckades");
      return;
    }
    clearLocalFieldEditOps(sessionId);
    setReviewSummary(null);
    router.push(
      `/maps/${mapSlug}?message=${encodeURIComponent("Fältredigeringen är inskickad och väntar på admin-godkännande")}`,
    );
    router.refresh();
  }

  function handleCancelReview() {
    setReviewSummary(null);
  }

  async function handleCancel() {
    if (!confirm("Avbryt fältredigeringen? Lokala ändringar försvinner.")) return;
    clearLocalFieldEditOps(sessionId);
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kunde inte avbryta");
      return;
    }
    router.push(`/maps/${mapSlug}`);
    router.refresh();
  }

  function switchTool(next: FieldEditTool) {
    if (gpsTracking) {
      cancelGpsTracking();
    }
    const addKindForTool: FieldEditGeometryKind | null =
      next === "addPoint" ? "point" : next === "addLine" ? "line" : next === "addArea" ? "area" : null;
    if (addKindForTool && selectedObjectIndex != null) {
      const obj = editableObjects.find((entry) => entry.i === selectedObjectIndex);
      if (obj && !ops.deletes.includes(obj.i)) {
        const sym = symbolFromMapObject(obj, addKindForTool);
        if (sym != null) {
          setSymbolNumber(sym);
        }
      }
    }
    setTool(next);
    setMapMode("draw");
    setDraftPoints([]);
    clearBezierDraft();
    clearRectangularGesture();
    clearCircleGesture();
    clearEllipseGesture();
    setSelectedVertexIndex(null);
    setBezierEdit(null);
    setCadVertexTool("off");
    if (next !== "addLine" && next !== "addArea") {
      setBezierDrawMode(false);
      setRectangularDrawMode(false);
      setCircleDrawMode(false);
      setEllipseDrawMode(false);
      setFreehandDrawMode(false);
      freehandDrawingRef.current = false;
      freehandPointerDownRef.current = null;
    }
    if (next !== "select") setSelectedObjectIndex(null);
  }

  function cycleLineAreaDrawMode(forTool: "addLine" | "addArea") {
    if (gpsTracking) {
      cancelGpsTracking();
    }
    const onThisTool = tool === forTool;
    // Cycle: vanlig → rektangel → cirkel → ellips → Bézier → frihand → vanlig
    let next: "normal" | "rectangular" | "circle" | "ellipse" | "bezier" | "freehand";
    if (!onThisTool) {
      next = "rectangular";
    } else if (freehandDrawMode) {
      next = "normal";
    } else if (bezierDrawMode) {
      next = "freehand";
    } else if (ellipseDrawMode) {
      next = "bezier";
    } else if (circleDrawMode) {
      next = "ellipse";
    } else if (rectangularDrawMode) {
      next = "circle";
    } else {
      next = "rectangular";
    }

    setTool(forTool);
    setMapMode("draw");
    setDraftPoints([]);
    clearBezierDraft();
    clearRectangularGesture();
    clearCircleGesture();
    clearEllipseGesture();
    freehandDrawingRef.current = false;
    freehandPointerDownRef.current = null;
    setSelectedObjectIndex(null);
    setSelectedVertexIndex(null);
    setBezierEdit(null);
    setBezierDrawMode(next === "bezier");
    setRectangularDrawMode(next === "rectangular");
    setCircleDrawMode(next === "circle");
    setEllipseDrawMode(next === "ellipse");
    setFreehandDrawMode(next === "freehand");
    setError(null);
    if (next === "rectangular") {
      setInfo(
        "Rektangelläge (R): dra längsta sidan → släpp → dra vinkelrätt → klicka för att avsluta. Klicka linje-/ytaverktyget igen för cirkel.",
      );
    } else if (next === "circle") {
      setInfo(
        "Cirkelläge (C): dra diametern från kant till kant, släpp för att skapa. Klicka verktyget igen för ellips.",
      );
    } else if (next === "ellipse") {
      setInfo(
        "Ellipsläge (E): dra längsta axeln → släpp → dra kortare axeln vinkelrätt genom centrum → släpp. Klicka verktyget igen för Bézier.",
      );
    } else if (next === "bezier") {
      setInfo(
        "Bézier-läge (B): tryck ner på brytpunkt och dra mot P1, sedan tryck på P2 och släpp på nästa brytpunkt. Klicka verktyget igen för frihand.",
      );
    } else if (next === "freehand") {
      setInfo(
        "Frihandsläge (F): tryck kort och dra längs linjen (eller ytan). Klicka igen eller «Klar» för att avsluta. Utjämning 1–3 under snappning. Klicka verktyget igen för vanlig ritning.",
      );
    } else {
      setInfo(
        "Vanlig ritning: klicka brytpunkter. Klicka linje-/ytaverktyget igen för att växla läge (R → C → E → B → F).",
      );
    }
  }

  const handleDrawInterrupt = useCallback(() => {
    dragVertexRef.current = null;
    dragBezierControlRef.current = null;
    if (bezierGesture.phase === "drag_p1" || bezierGesture.phase === "drag_p3") {
      setBezierGesture({ phase: "idle" });
    }
    if (
      rectangularGesture.phase === "drag_edge1" ||
      rectangularGesture.phase === "drag_edge2"
    ) {
      setRectangularGesture({ phase: "idle" });
    }
    if (circleGesture.phase === "drag_diameter") {
      setCircleGesture({ phase: "idle" });
    }
    if (ellipseGesture.phase === "drag_major" || ellipseGesture.phase === "drag_minor") {
      setEllipseGesture({ phase: "idle" });
    }
    setSnapPreview(null);
  }, [bezierGesture.phase, circleGesture.phase, ellipseGesture.phase, rectangularGesture.phase]);

  const handleGpsToggle = useCallback(() => {
    toggleGpsTracking();
  }, [toggleGpsTracking]);

  const toolHint = useMemo(() => {
    if (gpsTracking) {
      return `GPS-spårning — gå längs spåret du vill rita. Minst ${GPS_TRACK_MIN_DISTANCE_M} m mellan punkter. Klicka «Sluta spåra» när du är klar, välj linjesymbol och klicka «Klar».`;
    }
    if (tool === "select") {
      return "Tryck på ett objekt för att markera det. Vid överlapp: håll kvar — efter 1 sekund markeras nästa, och så vidare. Dra brytpunkter eller använd CAD-verktygen nedan. Snappning hjälper dig träffa befintliga linjer och hörn.";
    }
    if (tool === "addLine") {
      if (freehandDrawMode) {
        return "Frihandslinje: tryck och dra längs linjen. Klicka igen eller «Klar» för att avsluta. Utjämning 1–3 under snappning. Klicka linjeverktyget igen för vanlig ritning.";
      }
      if (bezierDrawMode) {
        return "Bézier-linje: tryck ner på brytpunkt → dra mot P1 → släpp; tryck på P2 → släpp på nästa brytpunkt. Klicka linjeverktyget igen för frihand.";
      }
      if (ellipseDrawMode) {
        return "Ellipsläge: dra längsta axeln → släpp → dra kortare axeln vinkelrätt genom centrum → släpp. Klicka linjeverktyget igen för Bézier.";
      }
      if (circleDrawMode) {
        return "Cirkelläge: dra diametern från kant till kant, släpp för att skapa. Klicka linjeverktyget igen för ellips.";
      }
      if (rectangularDrawMode) {
        return "Rektangelläge: dra längsta sidan → släpp → dra vinkelrätt till tredje hörnet → klicka för att avsluta. Klicka linjeverktyget igen för cirkel.";
      }
      return "Klicka ett kartobjekt för att kopiera symbol, eller välj i listan — klicka sedan punkter längs linjen. Klicka linjeverktyget igen för att växla läge (R → C → E → B → F).";
    }
    if (tool === "addArea") {
      if (freehandDrawMode) {
        return "Frihandsytan: tryck och dra runt ytan. Klicka igen eller «Klar» för att avsluta (minst 3 punkter). Klicka ytaverktyget igen för vanlig ritning.";
      }
      if (bezierDrawMode) {
        return "Bézier-yta: samma gest som linje (P0→P1, P2→P3). Minst 3 brytpunkter. Klicka ytaverktyget igen för frihand.";
      }
      if (ellipseDrawMode) {
        return "Ellipsläge: dra längsta axeln → släpp → dra kortare axeln vinkelrätt genom centrum → släpp. Klicka ytaverktyget igen för Bézier.";
      }
      if (circleDrawMode) {
        return "Cirkelläge: dra diametern från kant till kant, släpp för att skapa. Klicka ytaverktyget igen för ellips.";
      }
      if (rectangularDrawMode) {
        return "Rektangelläge: dra längsta sidan → släpp → dra vinkelrätt till tredje hörnet → klicka för att avsluta. Klicka ytaverktyget igen för cirkel.";
      }
      return "Klicka ett kartobjekt för att kopiera symbol, eller välj i listan — klicka sedan hörn runt ytan (minst 3). Klicka ytaverktyget igen för att växla läge (R → C → E → B → F).";
    }
    if (tool === "addPoint") {
      return "Klicka ett kartobjekt för att kopiera symbol, eller välj i listan — klicka sedan där punkten ska ligga.";
    }
    return null;
  }, [
    bezierDrawMode,
    circleDrawMode,
    ellipseDrawMode,
    freehandDrawMode,
    gpsTracking,
    rectangularDrawMode,
    tool,
  ]);

  const hasLocalBackup = loadLocalFieldEditOps(sessionId) != null;
  const counts = useMemo(() => countFieldEditChanges(ops), [ops]);
  const countsLabel = `${counts.deletes} raderade · ${counts.modifies} ändrade · ${counts.adds} nya`;
  const syncLabel = syncing
    ? "Synkar…"
    : syncState === "saved"
      ? "Synkad"
      : "Sparat lokalt";

  useEffect(() => {
    if (!(hasLocalBackup && syncState !== "saved")) {
      setShowLocalBackupToast(false);
      return;
    }
    setShowLocalBackupToast(true);
    const timer = window.setTimeout(() => setShowLocalBackupToast(false), 7000);
    return () => window.clearTimeout(timer);
  }, [hasLocalBackup, sessionId, syncState]);

  const isDrawInteraction = mapMode === "draw" && !gpsTracking;
  const draftPointCount = rectangularDrawMode
    ? rectangularGesture.phase === "ready" || rectangularGesture.phase === "drag_edge2"
      ? 4
      : rectangularGesture.phase === "drag_edge1" || rectangularGesture.phase === "await_edge2"
        ? 2
        : 0
    : circleDrawMode
      ? circleGesture.phase === "drag_diameter"
        ? 2
        : 0
      : ellipseDrawMode
        ? ellipseGesture.phase === "drag_minor"
          ? 4
          : ellipseGesture.phase === "drag_major" || ellipseGesture.phase === "await_minor"
            ? 2
            : 0
        : bezierDrawMode
          ? bezierDraftAnchors.length
          : draftPoints.length;
  const showDraftActions =
    isDrawInteraction && (tool === "addLine" || tool === "addArea");

  const mapToolbarOverlay = useMemo(
    () => (
      <>
        {showLocalBackupToast && (
          <div
            data-map-toolbar
            role="status"
            className="pointer-events-auto absolute left-2 right-14 top-2 z-40 max-w-md rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 shadow-lg backdrop-blur sm:right-auto"
            onPointerDown={stopFieldEditToolbarPointer}
          >
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-xs leading-snug text-amber-950 sm:text-sm">
                Ändringar sparas i webbläsaren tills du publicerar. Vid nätverksfel behålls
                arbetet lokalt.
              </p>
              <button
                type="button"
                aria-label="Stäng"
                className="shrink-0 rounded px-1.5 py-0.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                onClick={() => setShowLocalBackupToast(false)}
              >
                ×
              </button>
            </div>
          </div>
        )}
        <FieldEditMapToolbars
          tool={tool}
          onToolChange={switchTool}
          drawDisabled={gpsTracking}
          mapMode={mapMode}
          onMapModeChange={setMapMode}
          gpsTracking={gpsTracking}
          canUseGpsTracking={canUseGpsTracking}
          onGpsToggle={handleGpsToggle}
          canUndo={opsHistory.length > 1}
          onUndo={undo}
          bezierDrawMode={bezierDrawMode}
          rectangularDrawMode={rectangularDrawMode}
          circleDrawMode={circleDrawMode}
          ellipseDrawMode={ellipseDrawMode}
          freehandDrawMode={freehandDrawMode}
          onCycleLineAreaDrawMode={cycleLineAreaDrawMode}
          showDraftActions={showDraftActions}
          draftPointCount={draftPointCount}
          onFinishDraft={finishDraft}
          onCancelDraft={cancelDraft}
        />
        {addKind && (
          <div
            data-map-toolbar
            className="pointer-events-auto absolute inset-x-2 bottom-2 z-40 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur"
            onPointerDown={stopFieldEditToolbarPointer}
          >
            <FieldEditSymbolPicker
              groups={symbolGroups}
              kind={addKind}
              value={symbolNumber}
              onChange={setSymbolNumber}
              favorites={favorites}
              onToggleFavorite={(sym) => toggleFavorite(addKind, sym)}
            />
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Klicka ett kartobjekt på kartan för att kopiera dess symbol.
            </p>
          </div>
        )}
      </>
    ),
    [
      tool,
      addKind,
      symbolGroups,
      symbolNumber,
      favorites,
      toggleFavorite,
      gpsTracking,
      mapMode,
      canUseGpsTracking,
      handleGpsToggle,
      showDraftActions,
      draftPointCount,
      bezierDrawMode,
      rectangularDrawMode,
      circleDrawMode,
      ellipseDrawMode,
      freehandDrawMode,
      finishDraft,
      cancelDraft,
      opsHistory.length,
      undo,
      showLocalBackupToast,
    ],
  );

  const secondaryHeaderContent = (
    <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 sm:text-sm">
        <span>{countsLabel}</span>
        <span className="hidden sm:inline">·</span>
        <span>{syncLabel}</span>
      </div>
      {gpsTrackingStatus && (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:text-sm">
          {gpsTrackingStatus}
          {!gpsTracking && draftPoints.length >= 2 && tool === "addLine" && (
            <> Välj linjesymbol och klicka «Klar».</>
          )}
        </p>
      )}
      {toolHint && (
        <p
          className={`text-xs sm:text-sm ${
            isDrawInteraction ? "text-amber-800" : "text-slate-600"
          }`}
        >
          {mapMode === "navigate" && !gpsTracking
            ? "Navigeringsläge — dra för att panorera och nyp med två fingrar för att zooma. Växla till Rita när du ska redigera."
            : toolHint}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <DiffMapPanel
        previewUrl={`/api/maps/${mapSlug}/field-edits/${sessionId}/preview`}
        title={mapTitle}
        mapSlug={mapSlug}
        versionId={sessionId}
        exportEnabled={false}
        interactionMode={gpsTracking || mapMode === "navigate" ? "navigate" : "draw"}
        drawPointerHandlers={isDrawInteraction ? drawPointerHandlers : undefined}
        onDrawInterrupt={handleDrawInterrupt}
        renderSvgOverlay={renderSvgOverlay}
        onOcadCrsReady={setOcadCrs}
        onOcadMapScale={setOcadMapScale}
        gpsTrackFollow={gpsTrackFollow}
        mapToolbarOverlay={mapToolbarOverlay}
        secondaryHeaderContent={secondaryHeaderContent}
        viewportClassName="h-[min(82svh,780px)] min-h-[300px] sm:h-[min(70svh,560px)] sm:min-h-[280px]"
      />

      <details className="rounded-xl border border-slate-200 bg-slate-50 sm:hidden">
        <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-slate-800">
          Snappning och inställningar
        </summary>
        <div className="px-3 pb-3">
          <FieldEditSnapSettings settings={editorSettings} onChange={updateEditorSettings} />
        </div>
      </details>
      <div className="hidden sm:block">
        <FieldEditSnapSettings settings={editorSettings} onChange={updateEditorSettings} />
      </div>

      {selectedObject && tool === "select" && !ops.deletes.includes(selectedObject.i) && (
        <>
          <details className="rounded-xl border border-ifk-blue/20 bg-ifk-blue/5 sm:hidden">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
              CAD-verktyg
            </summary>
            <FieldEditCadPanel
              selectedObject={selectedObject}
              ops={ops}
              mapScale={ocadMapScale}
              editorSettings={editorSettings}
              onEditorSettingsChange={updateEditorSettings}
              onApplyCoordinates={(coordinates, vertexKinds) => {
                upsertModify(selectedObject.i, coordinates, vertexKinds);
                setSelectedVertexIndex(null);
                setBezierEdit(null);
              }}
              onChangeSymbol={(sym) => upsertModifySymbol(selectedObject.i, sym)}
              onDelete={deleteSelectedObject}
              onMessage={setInfo}
              symbolGroups={symbolGroups}
              favorites={favorites}
              onToggleFavorite={(sym) =>
                toggleFavorite(geometryKindFromType(selectedObject.t), sym)
              }
              bezierActive={
                bezierEdit != null && bezierEdit.objectIndex === selectedObject.i
              }
              onStartBezier={startBezierEdit}
              onApplyBezier={applyBezierEdit}
              onCancelBezier={cancelBezierEdit}
              vertexTool={cadVertexTool}
              onVertexToolChange={changeVertexTool}
              cutTool={cadCutTool}
              onCutToolChange={changeCutTool}
              cutDraftPoints={cutDraftPoints}
              onFinishCut={finishCut}
              onCancelCut={cancelCut}
              mergeActive={mergeActive}
              mergeCount={mergeObjectIndices.length}
              canApplyMerge={canApplyMerge}
              onToggleMerge={toggleMerge}
              onApplyMerge={applyMerge}
              onCancelMerge={cancelMerge}
              onFillOrBorder={applyFillOrBorder}
            />
          </details>
          <div className="hidden sm:block">
            <FieldEditCadPanel
              selectedObject={selectedObject}
              ops={ops}
              mapScale={ocadMapScale}
              editorSettings={editorSettings}
              onEditorSettingsChange={updateEditorSettings}
              onApplyCoordinates={(coordinates, vertexKinds) => {
                upsertModify(selectedObject.i, coordinates, vertexKinds);
                setSelectedVertexIndex(null);
                setBezierEdit(null);
              }}
              onChangeSymbol={(sym) => upsertModifySymbol(selectedObject.i, sym)}
              onDelete={deleteSelectedObject}
              onMessage={setInfo}
              symbolGroups={symbolGroups}
              favorites={favorites}
              onToggleFavorite={(sym) =>
                toggleFavorite(geometryKindFromType(selectedObject.t), sym)
              }
              bezierActive={
                bezierEdit != null && bezierEdit.objectIndex === selectedObject.i
              }
              onStartBezier={startBezierEdit}
              onApplyBezier={applyBezierEdit}
              onCancelBezier={cancelBezierEdit}
              vertexTool={cadVertexTool}
              onVertexToolChange={changeVertexTool}
              cutTool={cadCutTool}
              onCutToolChange={changeCutTool}
              cutDraftPoints={cutDraftPoints}
              onFinishCut={finishCut}
              onCancelCut={cancelCut}
              mergeActive={mergeActive}
              mergeCount={mergeObjectIndices.length}
              canApplyMerge={canApplyMerge}
              onToggleMerge={toggleMerge}
              onApplyMerge={applyMerge}
              onCancelMerge={cancelMerge}
              onFillOrBorder={applyFillOrBorder}
            />
          </div>
        </>
      )}

      {info && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <FieldEditPublishBar
        publishing={publishing}
        canUndo={opsHistory.length > 1}
        onUndo={undo}
        onPublish={handleOpenReview}
        onCancel={handleCancel}
        countsLabel={countsLabel}
        syncLabel={syncLabel}
      />

      {showReview && reviewSummary && (
        <FieldEditReviewDialog
          summary={reviewSummary}
          submitting={publishing}
          onConfirm={handleConfirmSubmit}
          onCancel={handleCancelReview}
        />
      )}
    </div>
  );
}
