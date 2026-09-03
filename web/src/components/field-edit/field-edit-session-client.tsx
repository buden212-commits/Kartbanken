"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { fieldEditOverlaySvg } from "@/components/field-edit/field-edit-overlay";
import { FieldEditCadPanel } from "@/components/field-edit/field-edit-cad-panel";
import { FieldEditReviewDialog } from "@/components/field-edit/field-edit-review-dialog";
import { FieldEditSnapSettings } from "@/components/field-edit/field-edit-snap-settings";
import {
  FieldEditMapDraftBar,
  FieldEditMapToolbars,
  FieldEditPublishBar,
  stopFieldEditToolbarPointer,
  type FieldEditTool,
} from "@/components/field-edit/field-edit-toolbar";
import {
  buildSymbolGroups,
  defaultSymbolForKind,
  FieldEditSymbolPicker,
  symbolFromMapObject,
  type SymbolGroups,
} from "@/components/field-edit/field-edit-symbol-picker";
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
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
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
  countFieldEditChanges,
  hasFieldEditChanges,
  resolveObjectCoordinates,
  type FieldEditGeometryKind,
  type FieldEditModify,
  type FieldEditOps,
} from "@/lib/field-edit/types";
import { applyVertexMove, verticesForHandles } from "@/lib/field-edit/vertices";
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

const DEFAULT_HIT_DISTANCE = 35;
const DEFAULT_VERTEX_HIT_DISTANCE = 25;
const COARSE_HIT_DISTANCE = 50;
const COARSE_VERTEX_HIT_DISTANCE = 35;

export function FieldEditSessionClient({
  mapSlug,
  mapTitle,
  sessionId,
  selection,
  initialOps,
}: Props) {
  const router = useRouter();
  const [tool, setTool] = useState<FieldEditTool>("select");
  const [mapMode, setMapMode] = useState<"draw" | "navigate">("draw");
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
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<FieldEditReviewSummary | null>(null);
  const showReview = reviewSummary != null;
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
  const hitCycleRef = useRef<{ pointKey: string; indices: number[]; index: number } | null>(
    null,
  );
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const editorSettingsRef = useRef(editorSettings);
  editorSettingsRef.current = editorSettings;

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
      const snap = snapGeoPoint(geo, {
        objects,
        ops: opsRef.current,
        toleranceMapUnits,
        excludeObjectIndex,
      });
      return { point: snap?.point ?? geo, snap };
    },
    [objects, ocadMapScale],
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
      setSelectedObjectIndex(null);
      setSelectedVertexIndex(null);
      setError(null);
    },
    onTrackComplete: (coordinates) => {
      setDraftPoints(coordinates);
      setError(null);
    },
    onTrackError: (message) => setError(message),
  });

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

    fetchPreviewText(`/api/maps/${mapSlug}/field-edits/${sessionId}/preview?direct=1`)
      .then((svg) => {
        const layers = parseOcadLayersFromSvg(svg);
        const groups = buildSymbolGroups(layers);
        setSymbolGroups(groups);
      })
      .catch(() => {});

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
  }, [addKind, draftPoints, symbolNumber]);

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

  const undo = useCallback(() => {
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
    (objectIndex: number, coordinates: [number, number][]) => {
      const obj = objects.find((entry) => entry.i === objectIndex);
      if (!obj) return;
      updateOps((current) => {
        const kind = geometryKindFromType(obj.t);
        const existing = current.modifies.find((m) => m.objectIndex === objectIndex);
        const nextModify: FieldEditModify = {
          objectIndex,
          symbolNumber: existing?.symbolNumber ?? obj.s,
          geometryKind: kind,
          coordinates,
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
    updateOps((current) => {
      const deletes = current.deletes.includes(index)
        ? current.deletes.filter((id) => id !== index)
        : [...current.deletes.filter((id) => id !== index), index];
      const modifies = current.modifies.filter((m) => m.objectIndex !== index);
      return { ...current, deletes, modifies };
    });
    setSelectedObjectIndex(null);
    setSelectedVertexIndex(null);
  }, [selectedObjectIndex, updateOps]);

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
        if (selectedObjectIndex != null) {
          const obj = objects.find((o) => o.i === selectedObjectIndex);
          const coords =
            resolveObjectCoordinates(selectedObjectIndex, obj?.v ?? [], ops) ?? [];
          const handleCoords =
            obj?.t === "area" ? verticesForHandles(coords, obj.t) : coords;
          const vertexIndex = hitTestFieldEditVertex(handleCoords, geo, vertexHitDistance);
          if (vertexIndex != null && obj) {
            const startCoords =
              resolveObjectCoordinates(selectedObjectIndex, obj.v, opsRef.current) ??
              obj.v.map(([x, y]) => [x, y] as [number, number]);
            dragVertexRef.current = {
              objectIndex: selectedObjectIndex,
              vertexIndex,
              startCoords: startCoords.map(([x, y]) => [x, y] as [number, number]),
              objectType: obj.t,
            };
            setSelectedVertexIndex(vertexIndex);
            return;
          }
        }

        const hits = hitTestFieldEditObjects(objects, geo, hitDistance).filter(
          (entry) => !ops.deletes.includes(entry.i),
        );
        if (hits.length === 0) {
          setSelectedObjectIndex(null);
          setSelectedVertexIndex(null);
          hitCycleRef.current = null;
          return;
        }
        const pointKey = `${geo[0]!.toFixed(1)},${geo[1]!.toFixed(1)}`;
        const indices = hits.map((entry) => entry.i);
        const prev = hitCycleRef.current;
        const nextIndex =
          prev && prev.pointKey === pointKey && prev.indices.length > 0
            ? (prev.index + 1) % indices.length
            : 0;
        hitCycleRef.current = { pointKey, indices, index: nextIndex };
        setSelectedObjectIndex(indices[nextIndex]!);
        setSelectedVertexIndex(null);
        setError(null);
        setInfo(null);
        return;
      }

      if (tool === "delete") {
        const hit = hitTestFieldEditObject(objects, geo, hitDistance);
        if (!hit) {
          setError("Inget objekt hittades — zooma in och försök igen");
          return;
        }
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
        }
        setError(null);
        return;
      }

      if (tool === "addPoint") {
        const hit = hitTestFieldEditObject(objects, geo, hitDistance);
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
        const hit = hitTestFieldEditObject(objects, geo, hitDistance);
        if (hit && !ops.deletes.includes(hit.i)) {
          if (pickSymbolFromObject(hit, kind)) return;
        }
        setDraftPoints((prev) => [...prev, geo]);
        setError(null);
        setInfo(null);
      }
    },
    [objects, ops, pickSymbolFromObject, resolveSnapPoint, selectedObjectIndex, symbolNumber, tool, updateOps, gpsTracking, hitDistance, vertexHitDistance],
  );

  const handlePointerMove = useCallback(
    (_e: React.PointerEvent, svg: SVGSVGElement) => {
      const pt = screenToSvgPoint(svg, _e.clientX, _e.clientY);
      if (!pt) return;
      const rawGeo = svgUserToGeoPoint(pt, rootTransformRef.current);

      const drag = dragVertexRef.current;
      if (drag && tool === "select") {
        const { point: geo } = resolveSnapPoint(rawGeo, drag.objectIndex);
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
    [editorSettings.snapEnabled, resolveSnapPoint, selectedObjectIndex, tool, upsertModify],
  );

  const handlePointerUp = useCallback(() => {
    dragVertexRef.current = null;
    setSnapPreview(null);
  }, []);

  const finishDraft = useCallback(() => {
    if (symbolNumber === "") {
      setError("Välj symbol");
      return;
    }
    if (tool === "addLine") {
      if (draftPoints.length < 2) {
        setError("Linjen behöver minst 2 punkter");
        return;
      }
      updateOps((current) => ({
        ...current,
        adds: [
          ...current.adds,
          {
            kind: "line",
            coordinates: draftPoints,
            symbolNumber: Number(symbolNumber),
          },
        ],
      }));
    } else if (tool === "addArea") {
      if (draftPoints.length < 3) {
        setError("Ytan behöver minst 3 hörn");
        return;
      }
      updateOps((current) => ({
        ...current,
        adds: [
          ...current.adds,
          {
            kind: "area",
            ring: draftPoints,
            symbolNumber: Number(symbolNumber),
          },
        ],
      }));
    }
    setDraftPoints([]);
    setError(null);
  }, [draftPoints, symbolNumber, tool, updateOps]);

  const cancelDraft = useCallback(() => {
    setDraftPoints([]);
  }, []);

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
              objects,
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
            }),
          }}
        />
      );
    },
    [
      selection.geometry,
      objects,
      ops,
      selectedObjectIndex,
      selectedVertexIndex,
      draftPoints,
      draftKind,
      gpsLiveCoordinates,
      symbolPreview,
      draftHasSymbolPreview,
      snapPreview,
    ],
  );

  const selectedObject = useMemo(
    () =>
      selectedObjectIndex != null
        ? objects.find((entry) => entry.i === selectedObjectIndex) ?? null
        : null,
    [objects, selectedObjectIndex],
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
      const obj = objects.find((entry) => entry.i === selectedObjectIndex);
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
    setSelectedVertexIndex(null);
    if (next !== "select") setSelectedObjectIndex(null);
  }

  const handleDrawInterrupt = useCallback(() => {
    dragVertexRef.current = null;
    setSnapPreview(null);
  }, []);

  const handleGpsToggle = useCallback(() => {
    toggleGpsTracking();
  }, [toggleGpsTracking]);

  const toolHint = useMemo(() => {
    if (gpsTracking) {
      return `GPS-spårning — gå längs spåret du vill rita. Minst ${GPS_TRACK_MIN_DISTANCE_M} m mellan punkter. Klicka «Sluta spåra» när du är klar, välj linjesymbol och klicka «Klar».`;
    }
    if (tool === "select") {
      return "Klicka ett objekt för att markera det. Klicka igen på samma ställe för att bläddra bland överlappande objekt. Dra brytpunkter eller använd CAD-verktygen nedan. Snappning hjälper dig träffa befintliga linjer och hörn.";
    }
    if (tool === "addLine") {
      return "Klicka ett kartobjekt för att kopiera symbol, eller välj i listan — klicka sedan punkter längs linjen.";
    }
    if (tool === "addArea") {
      return "Klicka ett kartobjekt för att kopiera symbol, eller välj i listan — klicka sedan hörn runt ytan (minst 3).";
    }
    if (tool === "addPoint") {
      return "Klicka ett kartobjekt för att kopiera symbol, eller välj i listan — klicka sedan där punkten ska ligga.";
    }
    return null;
  }, [gpsTracking, tool]);

  const localBackup = loadLocalFieldEditOps(sessionId);
  const counts = useMemo(() => countFieldEditChanges(ops), [ops]);
  const countsLabel = `${counts.deletes} raderade · ${counts.modifies} ändrade · ${counts.adds} nya`;
  const syncLabel = syncing
    ? "Synkar…"
    : syncState === "saved"
      ? "Synkad"
      : "Sparat lokalt";

  const isDrawInteraction = mapMode === "draw" && !gpsTracking;
  const showDraftActions =
    isDrawInteraction && (tool === "addLine" || tool === "addArea");

  const mapToolbarOverlay = useMemo(
    () => (
      <>
        <FieldEditMapToolbars
          tool={tool}
          onToolChange={switchTool}
          drawDisabled={gpsTracking}
          mapMode={mapMode}
          onMapModeChange={setMapMode}
          gpsTracking={gpsTracking}
          canUseGpsTracking={canUseGpsTracking}
          onGpsToggle={handleGpsToggle}
        />
        {addKind && (
          <div
            data-map-toolbar
            className={`pointer-events-auto absolute inset-x-2 z-40 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:hidden ${
              showDraftActions ? "bottom-[8.5rem]" : "bottom-2"
            }`}
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
        <FieldEditMapDraftBar
          showDraftActions={showDraftActions}
          draftPointCount={draftPoints.length}
          onFinishDraft={finishDraft}
          onCancelDraft={cancelDraft}
          countsLabel={countsLabel}
          syncLabel={syncLabel}
        />
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
      draftPoints.length,
      finishDraft,
      cancelDraft,
      countsLabel,
      syncLabel,
    ],
  );

  const secondaryHeaderContent = (
    <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 sm:text-sm">
        <span>{countsLabel}</span>
        <span className="hidden sm:inline">·</span>
        <span>{syncLabel}</span>
        {showDraftActions && (
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              onClick={finishDraft}
              className="min-h-9 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Klar ({draftPoints.length} pkt)
            </button>
            <button
              type="button"
              onClick={cancelDraft}
              className="min-h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Avbryt ritning
            </button>
          </div>
        )}
      </div>
      {addKind && (
        <FieldEditSymbolPicker
          groups={symbolGroups}
          kind={addKind}
          value={symbolNumber}
          onChange={setSymbolNumber}
          favorites={favorites}
          onToggleFavorite={(sym) => toggleFavorite(addKind, sym)}
        />
      )}
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
      {localBackup && syncState !== "saved" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ändringar sparas i webbläsaren tills du publicerar. Vid nätverksfel behålls arbetet lokalt.
        </p>
      )}

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
        viewportClassName="h-[min(82dvh,780px)] min-h-[300px] sm:h-[min(70dvh,560px)] sm:min-h-[280px]"
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
              onApplyCoordinates={(coordinates) => {
                upsertModify(selectedObject.i, coordinates);
                setSelectedVertexIndex(null);
              }}
              onChangeSymbol={(sym) => upsertModifySymbol(selectedObject.i, sym)}
              onDelete={deleteSelectedObject}
              onMessage={setInfo}
              symbolGroups={symbolGroups}
              favorites={favorites}
              onToggleFavorite={(sym) =>
                toggleFavorite(geometryKindFromType(selectedObject.t), sym)
              }
            />
          </details>
          <div className="hidden sm:block">
            <FieldEditCadPanel
              selectedObject={selectedObject}
              ops={ops}
              mapScale={ocadMapScale}
              editorSettings={editorSettings}
              onEditorSettingsChange={updateEditorSettings}
              onApplyCoordinates={(coordinates) => {
                upsertModify(selectedObject.i, coordinates);
                setSelectedVertexIndex(null);
              }}
              onChangeSymbol={(sym) => upsertModifySymbol(selectedObject.i, sym)}
              onDelete={deleteSelectedObject}
              onMessage={setInfo}
              symbolGroups={symbolGroups}
              favorites={favorites}
              onToggleFavorite={(sym) =>
                toggleFavorite(geometryKindFromType(selectedObject.t), sym)
              }
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
