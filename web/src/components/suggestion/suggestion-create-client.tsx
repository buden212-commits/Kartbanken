"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { isGeoreferencedCrs, wgs84ToMapCoord, type OcadCrsInfo } from "@/lib/ocad/crs";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import {
  IDENTITY_SVG_TRANSFORM,
  svgUserToGeoPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import {
  isValidSuggestionBbox,
  isValidSuggestionLineCoordinates,
  isValidSuggestionPolygonRing,
  liveMapRenderOptions,
  normalizeSuggestionBbox,
  renderSuggestionGeometrySvg,
} from "@/lib/suggestion/geometry";
import {
  evaluateGpsSample,
  GPS_TRACK_MAX_ACCURACY_M,
  GPS_TRACK_MAX_JUMP_M,
  GPS_TRACK_MAX_SPEED_MPS,
  GPS_TRACK_MIN_DISTANCE_M,
  processGpsTrack,
  type GpsTrackSample,
} from "@/lib/suggestion/gps-track";
import { SuggestionSubmitDialog } from "@/components/suggestion/suggestion-submit-dialog";
import { SuggestionLineSymbolPicker } from "@/components/suggestion/suggestion-line-symbol-picker";
import { OfflineDraftStatus } from "@/components/offline-draft-status";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import {
  MAX_SUGGESTION_GEOMETRIES,
  type SuggestionGeometry,
} from "@/lib/suggestion/types";
import {
  createSuggestionDraftId,
  deleteSuggestionDraft,
  draftHasContent,
  emptyCreateDraft,
  getSuggestionDraft,
  mergeSuggestionDraft,
} from "@/lib/suggestion/offline-drafts";
import {
  SuggestionMapActionToolbar,
  SuggestionMapRightToolbars,
  type SuggestionDrawTool,
} from "@/components/suggestion/suggestion-draw-toolbar";
import { useSmoothedCompass } from "@/hooks/use-smoothed-compass";

type DrawTool = SuggestionDrawTool;

type Props = {
  mapSlug: string;
  mapTitle: string;
  versionId: string;
  versionNumber: number;
};

type CreateMapPanelProps = {
  mapSlug: string;
  versionId: string;
  mapMode: "draw" | "navigate";
  drawPointerHandlers: MapDrawPointerHandlers;
  onDrawInterrupt: () => void;
  markings: SuggestionGeometry[];
  currentGeometry: SuggestionGeometry | null;
  draftGeometry: SuggestionGeometry | null;
  gpsLiveGeometry: SuggestionGeometry | null;
  drawHint: string;
  markingCount: number;
  rootTransformRef: MutableRefObject<SvgRootTransform>;
  onOcadCrsReady: (crs: OcadCrsInfo | null) => void;
  onOcadMapScale: (scale: number) => void;
  onOcadLayersReady: (layers: OcadMapLayer[]) => void;
  gpsTrackingStatus: string | null;
  gpsTrackFollow: {
    active: boolean;
    mapCoordRef: MutableRefObject<[number, number] | null>;
    recenterToken: number;
  };
  mapBearing: number;
  compassStatus: string | null;
  gpsLineSymbolNum: number | null;
  onGpsLineSymbolChange: (symNum: number) => void;
  pendingGpsLineSymbolPick: boolean;
  ocadLayers: OcadMapLayer[];
  mapToolbarOverlay: React.ReactNode;
};

const SuggestionCreateMapPanel = memo(function SuggestionCreateMapPanel({
  mapSlug,
  versionId,
  mapMode,
  drawPointerHandlers,
  onDrawInterrupt,
  markings,
  currentGeometry,
  draftGeometry,
  gpsLiveGeometry,
  drawHint,
  markingCount,
  rootTransformRef,
  onOcadCrsReady,
  onOcadMapScale,
  onOcadLayersReady,
  gpsTrackingStatus,
  gpsTrackFollow,
  mapBearing,
  compassStatus,
  gpsLineSymbolNum,
  onGpsLineSymbolChange,
  pendingGpsLineSymbolPick,
  ocadLayers,
  mapToolbarOverlay,
}: CreateMapPanelProps) {
  const renderSvgOverlay = useCallback(
    (rootTransform: SvgRootTransform) => {
      rootTransformRef.current = rootTransform;
      const parts: string[] = [];
      for (const [index, marking] of markings.entries()) {
        parts.push(
          renderSuggestionGeometrySvg(marking, rootTransform, {
            label: String(index + 1),
            ...liveMapRenderOptions(),
          }),
        );
      }
      const nextLabel = String(markings.length + 1);
      const overlay = draftGeometry ?? currentGeometry ?? gpsLiveGeometry;
      if (overlay) {
        parts.push(
          renderSuggestionGeometrySvg(overlay, rootTransform, {
            label: nextLabel,
            draft: Boolean(draftGeometry && !currentGeometry),
            ...liveMapRenderOptions(),
          }),
        );
      }
      if (parts.length === 0) return null;
      return <g dangerouslySetInnerHTML={{ __html: parts.join("") }} />;
    },
    [markings, currentGeometry, draftGeometry, gpsLiveGeometry, rootTransformRef],
  );

  return (
    <DiffMapPanel
      previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
      title="Markera plats"
      mapSlug={mapSlug}
      versionId={versionId}
      interactionMode={mapMode}
      drawPointerHandlers={mapMode === "draw" ? drawPointerHandlers : undefined}
      onDrawInterrupt={onDrawInterrupt}
      renderSvgOverlay={renderSvgOverlay}
      onOcadCrsReady={onOcadCrsReady}
      onOcadMapScale={onOcadMapScale}
      onOcadLayersReady={onOcadLayersReady}
      gpsTrackFollow={gpsTrackFollow}
      mapBearing={mapBearing}
      autoStartGps
      mapToolbarOverlay={mapToolbarOverlay}
      secondaryHeaderContent={
        <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
          {gpsTrackingStatus && (
            <p className="rounded-lg border border-ifk-blue/30 bg-ifk-blue/5 px-3 py-2 text-xs text-ifk-blue">
              {gpsTrackingStatus}
            </p>
          )}
          {compassStatus && (
            <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {compassStatus}
            </p>
          )}
          {pendingGpsLineSymbolPick && (
            <SuggestionLineSymbolPicker
              layers={ocadLayers}
              value={gpsLineSymbolNum}
              onChange={onGpsLineSymbolChange}
            />
          )}
          <p className={`text-xs ${mapMode === "draw" ? "text-amber-700" : "text-slate-600"}`}>
            {mapMode === "navigate"
              ? "Navigeringsläge — dra för att panorera och nyp med två fingrar för att zooma. På mobil kan du slå på kompass (passa efter norr) i verktygsraden. Växla till Rita när du ska markera."
              : drawHint}
            {markingCount > 0
              ? ` ${markingCount} markering${markingCount === 1 ? "" : "ar"}.`
              : mapMode === "draw"
                ? " Ingen markering ännu."
                : ""}
          </p>
        </div>
      }
    />
  );
});

const GPS_UI_UPDATE_MS = 1000;
const GPS_LINE_RENDER_MS = 2000;

export function SuggestionCreateClient({
  mapSlug,
  mapTitle,
  versionId,
  versionNumber,
}: Props) {
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const dragRef = useRef<{ start: [number, number]; current: [number, number] } | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsSamplesRef = useRef<GpsTrackSample[]>([]);
  const gpsRejectedJumpsRef = useRef(0);
  const gpsLatestMapCoordRef = useRef<[number, number] | null>(null);
  const gpsLastAccuracyRef = useRef<number | null>(null);
  const gpsUiUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsLineRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tool, setTool] = useState<DrawTool>("pin");
  const [mapMode, setMapMode] = useState<"draw" | "navigate">("navigate");
  const [compassMode, setCompassMode] = useState(false);
  const [gpsLineSymbolNum, setGpsLineSymbolNum] = useState<number | null>(null);
  const [ocadCrs, setOcadCrs] = useState<OcadCrsInfo | null>(null);
  const [ocadLayers, setOcadLayers] = useState<OcadMapLayer[]>([]);
  const [ocadMapScale, setOcadMapScale] = useState(15000);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsTrackingRecenterToken, setGpsTrackingRecenterToken] = useState(0);
  const [gpsLineRenderTick, setGpsLineRenderTick] = useState(0);
  const [gpsSampleCount, setGpsSampleCount] = useState(0);
  const [gpsRejectedJumpCount, setGpsRejectedJumpCount] = useState(0);
  const [gpsLiveAccuracyM, setGpsLiveAccuracyM] = useState<number | null>(null);
  const [gpsTrackSummary, setGpsTrackSummary] = useState<{
    averageAccuracyMeters: number;
    rawPointCount: number;
    simplifiedPointCount: number;
    rejectedJumpCount: number;
  } | null>(null);
  const [markings, setMarkings] = useState<SuggestionGeometry[]>([]);
  const [geometry, setGeometry] = useState<SuggestionGeometry | null>(null);
  const [draftBbox, setDraftBbox] = useState<SuggestionGeometry | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [linePoints, setLinePoints] = useState<[number, number][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftQueued, setDraftQueued] = useState(false);
  const [online, setOnline] = useState(true);
  const draftId = createSuggestionDraftId(mapSlug, versionId);

  const resetDraft = useCallback(() => {
    setDraftBbox(null);
    setPolygonPoints([]);
    setLinePoints([]);
    dragRef.current = null;
  }, []);

  const stopGpsWatch = useCallback(() => {
    if (gpsWatchIdRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    if (gpsUiUpdateTimerRef.current != null) {
      clearTimeout(gpsUiUpdateTimerRef.current);
      gpsUiUpdateTimerRef.current = null;
    }
    if (gpsLineRenderTimerRef.current != null) {
      clearTimeout(gpsLineRenderTimerRef.current);
      gpsLineRenderTimerRef.current = null;
    }
  }, []);

  const scheduleGpsUiUpdate = useCallback(() => {
    if (gpsUiUpdateTimerRef.current != null) return;
    gpsUiUpdateTimerRef.current = setTimeout(() => {
      gpsUiUpdateTimerRef.current = null;
      setGpsSampleCount(gpsSamplesRef.current.length);
      setGpsLiveAccuracyM(gpsLastAccuracyRef.current);
      setGpsRejectedJumpCount(gpsRejectedJumpsRef.current);
    }, GPS_UI_UPDATE_MS);
  }, []);

  const scheduleGpsLineRender = useCallback((immediate = false) => {
    if (immediate) {
      if (gpsLineRenderTimerRef.current != null) {
        clearTimeout(gpsLineRenderTimerRef.current);
        gpsLineRenderTimerRef.current = null;
      }
      setGpsLineRenderTick((tick) => tick + 1);
      return;
    }
    if (gpsLineRenderTimerRef.current != null) return;
    gpsLineRenderTimerRef.current = setTimeout(() => {
      gpsLineRenderTimerRef.current = null;
      setGpsLineRenderTick((tick) => tick + 1);
    }, GPS_LINE_RENDER_MS);
  }, []);

  useEffect(() => {
    return () => {
      stopGpsWatch();
    };
  }, [stopGpsWatch]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await getSuggestionDraft(draftId);
      if (cancelled) {
        setDraftReady(true);
        return;
      }
      if (draft) {
        if (draft.markings.length > 0) setMarkings(draft.markings);
        if (draft.currentGeometry) setGeometry(draft.currentGeometry);
        if (draft.polygonPoints.length > 0) setPolygonPoints(draft.polygonPoints);
        if (draft.linePoints.length > 0) setLinePoints(draft.linePoints);
        if (draftHasContent(draft)) setDraftRestored(true);
        if (draft.wantsSync) setDraftQueued(true);
      }
      setDraftReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const patch = {
          markings,
          currentGeometry: geometry,
          polygonPoints,
          linePoints,
        };
        const existing = await getSuggestionDraft(draftId);
        if (
          markings.length === 0 &&
          !geometry &&
          polygonPoints.length === 0 &&
          linePoints.length === 0 &&
          existing &&
          !existing.wantsSync &&
          !existing.comment.trim() &&
          !existing.title.trim() &&
          !existing.photoBlob
        ) {
          await deleteSuggestionDraft(draftId);
          return;
        }
        await mergeSuggestionDraft(draftId, patch, () =>
          emptyCreateDraft({ mapSlug, versionId }),
        );
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftId, draftReady, geometry, linePoints, mapSlug, markings, polygonPoints, versionId]);

  const handleOcadCrsReady = useCallback((crs: OcadCrsInfo | null) => {
    setOcadCrs(crs);
  }, []);

  const handleOcadMapScale = useCallback((scale: number) => {
    setOcadMapScale(scale);
  }, []);

  const handleOcadLayersReady = useCallback((layers: OcadMapLayer[]) => {
    setOcadLayers(layers);
  }, []);

  const appendGpsSample = useCallback(
    (coords: GeolocationCoordinates, timestampMs: number) => {
      if (!ocadCrs || !isGeoreferencedCrs(ocadCrs)) return;

      const mapCoord = wgs84ToMapCoord(coords.longitude, coords.latitude, ocadCrs);
      if (!mapCoord) return;

      const accuracyMeters =
        typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy)
          ? coords.accuracy
          : GPS_TRACK_MAX_ACCURACY_M;

      gpsLastAccuracyRef.current = accuracyMeters;

      const lastSample = gpsSamplesRef.current.at(-1) ?? null;
      const evaluation = evaluateGpsSample(
        mapCoord,
        accuracyMeters,
        timestampMs,
        lastSample,
        {
          minDistanceM: GPS_TRACK_MIN_DISTANCE_M,
          maxAccuracyM: GPS_TRACK_MAX_ACCURACY_M,
          maxSpeedMps: GPS_TRACK_MAX_SPEED_MPS,
          maxJumpM: GPS_TRACK_MAX_JUMP_M,
          mapScale: ocadMapScale,
        },
      );

      if (!evaluation.accepted) {
        if (evaluation.reason === "jump") {
          gpsRejectedJumpsRef.current += 1;
          scheduleGpsUiUpdate();
        }
        return;
      }

      gpsSamplesRef.current = [...gpsSamplesRef.current, evaluation.sample];
      gpsLatestMapCoordRef.current = evaluation.sample.mapCoord;
      const isFirstSample = gpsSamplesRef.current.length === 1;
      if (isFirstSample) {
        setGpsTrackingRecenterToken((token) => token + 1);
        scheduleGpsUiUpdate();
        scheduleGpsLineRender(true);
      } else {
        scheduleGpsUiUpdate();
        scheduleGpsLineRender();
      }
      setGeometry(null);
      setGpsTrackSummary(null);
      setError(null);
    },
    [ocadCrs, ocadMapScale, scheduleGpsLineRender, scheduleGpsUiUpdate],
  );

  const startGpsTracking = useCallback(() => {
    if (!isGeoreferencedCrs(ocadCrs)) {
      setError("Kartan saknar georeferering — GPS-spårning fungerar inte.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Enheten stödjer inte GPS.");
      return;
    }

    stopGpsWatch();
    gpsSamplesRef.current = [];
    gpsRejectedJumpsRef.current = 0;
    gpsLatestMapCoordRef.current = null;
    gpsLastAccuracyRef.current = null;
    setGpsSampleCount(0);
    setGpsRejectedJumpCount(0);
    setGpsTracking(true);
    setGpsTrackingRecenterToken((token) => token + 1);
    setGpsLineRenderTick(0);
    setGpsTrackSummary(null);
    setGpsLiveAccuracyM(null);
    setCompassMode(false);
    setTool("line");
    setMapMode("navigate");
    setGeometry(null);
    resetDraft();
    setLinePoints([]);
    setError(null);

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => appendGpsSample(pos.coords, pos.timestamp),
      (err) => {
        stopGpsWatch();
        setGpsTracking(false);
        setGpsLiveAccuracyM(null);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Platsåtkomst nekades. Tillåt plats i webbläsaren.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Kunde inte hämta GPS-position.");
        } else if (err.code === err.TIMEOUT) {
          setError("GPS tog för lång tid. Försök igen.");
        } else {
          setError("GPS-fel under spårning.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      },
    );
  }, [appendGpsSample, ocadCrs, resetDraft, stopGpsWatch]);

  const stopGpsTracking = useCallback(() => {
    stopGpsWatch();
    setGpsTracking(false);
    setGpsLiveAccuracyM(gpsLastAccuracyRef.current);
    gpsLatestMapCoordRef.current = null;

    const samples = gpsSamplesRef.current;
    const result = processGpsTrack(samples, {
      mapScale: ocadMapScale,
      rejectedJumpCount: gpsRejectedJumpsRef.current,
    });
    if (!result) {
      gpsSamplesRef.current = [];
      setGpsSampleCount(0);
      setLinePoints([]);
      setError(
        samples.length === 0
          ? "Inga GPS-punkter sparades — kontrollera mottagning och att du rör dig minst några meter."
          : "Spåret har för få punkter — gå längre eller försök igen med bättre GPS-mottagning.",
      );
      return;
    }

    setLinePoints(result.coordinates);
    setGeometry({ type: "LineString", coordinates: result.coordinates });
    setGpsLineSymbolNum(null);
    setGpsTrackSummary({
      averageAccuracyMeters: result.averageAccuracyMeters,
      rawPointCount: result.rawPointCount,
      simplifiedPointCount: result.simplifiedPointCount,
      rejectedJumpCount: result.rejectedJumpCount,
    });
    setError(null);
  }, [ocadMapScale, stopGpsWatch]);

  const cancelGpsTracking = useCallback(() => {
    stopGpsWatch();
    setGpsTracking(false);
    setGpsLiveAccuracyM(null);
    gpsSamplesRef.current = [];
    gpsRejectedJumpsRef.current = 0;
    gpsLatestMapCoordRef.current = null;
    gpsLastAccuracyRef.current = null;
    setGpsSampleCount(0);
    setGpsRejectedJumpCount(0);
    setLinePoints([]);
    setGpsLineRenderTick(0);
  }, [stopGpsWatch]);

  const handleDrawInterrupt = useCallback(() => {
    resetDraft();
  }, [resetDraft]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      if (gpsTracking) return;
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);

      if (tool === "pin" || tool === "delete") {
        setGeometry({
          type: "Point",
          coordinates: geo,
          ...(tool === "delete" ? { intent: "delete" as const } : {}),
        });
        setDraftBbox(null);
        setPolygonPoints([]);
        setLinePoints([]);
        setError(null);
        return;
      }

      if (tool === "rectangle") {
        dragRef.current = { start: pt, current: pt };
        setGeometry(null);
        setDraftBbox(null);
        setPolygonPoints([]);
        setLinePoints([]);
        return;
      }

      if (tool === "polygon") {
        setPolygonPoints((prev) => [...prev, geo]);
        setDraftBbox(null);
        setLinePoints([]);
        setGeometry(null);
        setError(null);
        return;
      }

      if (tool === "line") {
        setLinePoints((prev) => [...prev, geo]);
        setDraftBbox(null);
        setPolygonPoints([]);
        setGeometry(null);
        setError(null);
      }
    },
    [tool, gpsTracking],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      if (tool !== "rectangle" || !dragRef.current) return;
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      dragRef.current.current = pt;
      const startGeo = svgUserToGeoPoint(dragRef.current.start, rootTransformRef.current);
      const endGeo = svgUserToGeoPoint(pt, rootTransformRef.current);
      const bbox = normalizeSuggestionBbox(startGeo, endGeo);
      setDraftBbox({ type: "Bbox", bbox });
    },
    [tool],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent, _svg: SVGSVGElement) => {
      if (tool !== "rectangle" || !dragRef.current) return;
      const startGeo = svgUserToGeoPoint(dragRef.current.start, rootTransformRef.current);
      const endGeo = svgUserToGeoPoint(dragRef.current.current, rootTransformRef.current);
      dragRef.current = null;
      const bbox = normalizeSuggestionBbox(startGeo, endGeo);
      if (!isValidSuggestionBbox(bbox)) {
        setDraftBbox(null);
        setError("Rektangeln är för liten — dra ut ett större område");
        return;
      }
      setGeometry({ type: "Bbox", bbox });
      setDraftBbox(null);
      setError(null);
    },
    [tool],
  );

  const draftGeometry = useMemo((): SuggestionGeometry | null => {
    if (draftBbox) return draftBbox;
    if (polygonPoints.length >= 2) return { type: "Polygon", ring: polygonPoints };
    if (!gpsTracking && linePoints.length >= 1) {
      return { type: "LineString", coordinates: linePoints };
    }
    return null;
  }, [draftBbox, gpsTracking, linePoints, polygonPoints]);

  const gpsLiveGeometry = useMemo((): SuggestionGeometry | null => {
    if (!gpsTracking) return null;
    void gpsLineRenderTick;
    const coordinates = gpsSamplesRef.current.map((item) => item.mapCoord);
    if (coordinates.length < 1) return null;
    return { type: "LineString", coordinates };
  }, [gpsTracking, gpsLineRenderTick]);

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  const drawHint = useMemo(() => {
    if (gpsTracking) {
      return `GPS-spårning — gå längs spåret du vill markera. Minst ${GPS_TRACK_MIN_DISTANCE_M} m mellan punkter. Klicka «Sluta spåra» när du är klar.`;
    }
    return tool === "delete"
      ? "Ritläge — klicka på objektet som ska raderas, klicka sedan Lägg till ändring."
      : tool === "pin"
        ? "Ritläge — klicka på kartan för att placera en punkt, klicka sedan Lägg till ändring."
        : tool === "rectangle"
          ? "Ritläge — dra en rektangel på kartan och klicka sedan Lägg till ändring."
          : tool === "polygon"
            ? "Ritläge — klicka hörn (minst 3), klicka sedan Lägg till ändring."
            : "Ritläge — klicka punkter längs linjen (minst 2), klicka sedan Lägg till ändring.";
  }, [tool, gpsTracking]);

  const gpsTrackingStatus = useMemo(() => {
    if (gpsTracking) {
      const accuracyText =
        gpsLiveAccuracyM != null
          ? `Senaste noggrannhet ±${Math.round(gpsLiveAccuracyM)} m`
          : "Väntar på GPS-fix…";
      const jumpText =
        gpsRejectedJumpCount > 0
          ? ` ${gpsRejectedJumpCount} GPS-hopp filtrerades bort.`
          : "";
      return `Spårar GPS — ${gpsSampleCount} punkt${gpsSampleCount === 1 ? "" : "er"}. ${accuracyText}.${jumpText}`;
    }
    if (gpsTrackSummary) {
      const jumpText =
        gpsTrackSummary.rejectedJumpCount > 0
          ? ` ${gpsTrackSummary.rejectedJumpCount} GPS-hopp filtrerades bort under spårningen.`
          : "";
      return `Spår avslutat. Medelnoggrannhet ±${Math.round(gpsTrackSummary.averageAccuracyMeters)} m. ${gpsTrackSummary.rawPointCount} GPS-punkter förenklades till ${gpsTrackSummary.simplifiedPointCount} brytpunkter.${jumpText} Välj linjelager nedan och klicka «Lägg till ändring» om spåret ser bra ut.`;
    }
    return null;
  }, [gpsTracking, gpsSampleCount, gpsLiveAccuracyM, gpsRejectedJumpCount, gpsTrackSummary]);

  const gpsTrackFollow = useMemo(
    () => ({
      active: gpsTracking,
      mapCoordRef: gpsLatestMapCoordRef,
      recenterToken: gpsTrackingRecenterToken,
    }),
    [gpsTracking, gpsTrackingRecenterToken],
  );

  const canUseGpsTracking = isGeoreferencedCrs(ocadCrs);

  const compassActive =
    compassMode &&
    mapMode === "navigate" &&
    !gpsTracking &&
    !gpsTrackSummary;
  const {
    bearing: compassBearing,
    error: compassError,
    pending: compassPending,
    supported: compassSupported,
  } = useSmoothedCompass({
    active: compassActive,
    grivationRad: ocadCrs?.grivation ?? 0,
  });
  const mapBearing = compassActive ? compassBearing : 0;

  const compassStatus = useMemo(() => {
    if (compassError) return compassError;
    if (compassPending) return "Startar kompass…";
    if (compassActive) {
      return "Kompass aktiv — kartan roterar mjukt efter telefonens riktning. Stoppa kompassen för att återgå till norr uppåt.";
    }
    return null;
  }, [compassActive, compassError, compassPending]);

  useEffect(() => {
    if (mapMode === "draw" && compassMode) {
      setCompassMode(false);
    }
  }, [compassMode, mapMode]);

  useEffect(() => {
    if (gpsTracking && compassMode) {
      setCompassMode(false);
    }
  }, [compassMode, gpsTracking]);

  const handleCompassToggle = useCallback(() => {
    setCompassMode((prev) => !prev);
  }, []);

  const handleGpsTrackingToggle = useCallback(() => {
    if (gpsTracking) {
      stopGpsTracking();
    } else {
      startGpsTracking();
    }
  }, [gpsTracking, startGpsTracking, stopGpsTracking]);

  const finalizableGeometry = useMemo((): SuggestionGeometry | null => {
    if (geometry) return geometry;
    if (tool === "polygon" && polygonPoints.length >= 3) {
      if (!isValidSuggestionPolygonRing(polygonPoints)) return null;
      return { type: "Polygon", ring: polygonPoints };
    }
    if (tool === "line" && linePoints.length >= 2) {
      if (!isValidSuggestionLineCoordinates(linePoints)) return null;
      return { type: "LineString", coordinates: linePoints };
    }
    return null;
  }, [geometry, linePoints, polygonPoints, tool]);

  const pendingGpsLine = Boolean(gpsTrackSummary && geometry?.type === "LineString");

  const canAddMarking =
    finalizableGeometry !== null && (!pendingGpsLine || gpsLineSymbolNum != null);
  const totalMarkingCount = markings.length + (finalizableGeometry ? 1 : 0);

  const handleToolChange = useCallback(
    (next: DrawTool) => {
      if (gpsTracking) {
        cancelGpsTracking();
      }
      setTool(next);
      setMapMode("draw");
      setGeometry(null);
      resetDraft();
      setGpsTrackSummary(null);
      setGpsLineSymbolNum(null);
      setError(null);
    },
    [cancelGpsTracking, gpsTracking, resetDraft],
  );

  const handleGpsLineSymbolChange = useCallback((symNum: number) => {
    setGpsLineSymbolNum(symNum);
  }, []);

  const handleAddMarking = useCallback(() => {
    const toAdd = finalizableGeometry;
    if (!toAdd) return;
    if (pendingGpsLine && gpsLineSymbolNum == null) {
      setError("Välj linjelager innan du lägger till GPS-spåret.");
      return;
    }
    if (markings.length >= MAX_SUGGESTION_GEOMETRIES) {
      setError(`Max ${MAX_SUGGESTION_GEOMETRIES} markeringar per förslag`);
      return;
    }
    const withSymbol =
      pendingGpsLine && toAdd.type === "LineString" && gpsLineSymbolNum != null
        ? { ...toAdd, symbolNum: gpsLineSymbolNum }
        : toAdd;
    setMarkings((prev) => [...prev, withSymbol]);
    setGeometry(null);
    resetDraft();
    setGpsTrackSummary(null);
    setGpsLineSymbolNum(null);
    setError(null);
  }, [finalizableGeometry, gpsLineSymbolNum, markings.length, pendingGpsLine, resetDraft]);

  const handleRemoveMarking = useCallback((index: number) => {
    setMarkings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearAll = useCallback(() => {
    if (gpsTracking) {
      cancelGpsTracking();
    }
    setMarkings([]);
    setGeometry(null);
    setGpsTrackSummary(null);
    setGpsLineSymbolNum(null);
    resetDraft();
    setError(null);
  }, [cancelGpsTracking, gpsTracking, resetDraft]);

  const handleOpenSubmitDialog = useCallback(() => {
    if (markings.length < 1) {
      if (geometry || finalizableGeometry) {
        setError("Klicka «Lägg till ändring» innan du skickar, eller rensa den aktuella ritningen");
      } else {
        setError("Lägg till minst en markering på kartan");
      }
      return;
    }
    setError(null);
    setSubmitDialogOpen(true);
  }, [finalizableGeometry, geometry, markings.length]);

  const handleCloseSubmitDialog = useCallback(() => {
    setSubmitDialogOpen(false);
  }, []);

  const handleSubmitted = useCallback(() => {
    setMarkings([]);
    setGeometry(null);
    resetDraft();
    setSubmitDialogOpen(false);
    setDraftQueued(false);
    setDraftRestored(false);
  }, [resetDraft]);

  const handleQueued = useCallback(() => {
    setSubmitDialogOpen(false);
    setDraftQueued(true);
  }, []);

  const mapToolbarOverlay = useMemo(
    () => (
      <>
        <SuggestionMapActionToolbar
          canAddMarking={canAddMarking}
          markingCount={markings.length}
          onAddMarking={handleAddMarking}
          onClear={handleClearAll}
          onSubmit={handleOpenSubmitDialog}
        />
        <SuggestionMapRightToolbars
          tool={tool}
          onToolChange={handleToolChange}
          drawDisabled={gpsTracking}
          mapMode={mapMode}
          onMapModeChange={setMapMode}
          gpsTracking={gpsTracking}
          canUseGpsTracking={canUseGpsTracking}
          onGpsTrackingToggle={handleGpsTrackingToggle}
          compassActive={compassMode}
          onCompassToggle={handleCompassToggle}
          compassSupported={compassSupported}
          compassDisabled={gpsTracking || Boolean(gpsTrackSummary)}
        />
      </>
    ),
    [
      canAddMarking,
      canUseGpsTracking,
      compassMode,
      compassSupported,
      gpsTracking,
      handleAddMarking,
      handleClearAll,
      handleCompassToggle,
      handleGpsTrackingToggle,
      handleOpenSubmitDialog,
      handleToolChange,
      mapMode,
      markings.length,
      tool,
    ],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}/versions/${versionId}`} className="link-muted text-sm">
        ← Tillbaka till kartvy
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Föreslå kartändring</h1>
          <p className="mt-2 text-sm text-slate-600">
            {mapTitle} · v{versionNumber}. Markera plats eller område på kartan, skriv vad som bör
            ändras och spara. Förslaget påverkar inte kartfilen — en redaktör granskar det separat.
          </p>
        </div>
        <HelpLinkIcon section="kartforslag" className="mt-1 shrink-0" />
      </div>

      <OfflineDraftStatus
        online={online}
        restored={draftRestored}
        queued={draftQueued}
      />

      <div className="mt-6">
        <SuggestionCreateMapPanel
          mapSlug={mapSlug}
          versionId={versionId}
          mapMode={mapMode}
          drawPointerHandlers={drawPointerHandlers}
          onDrawInterrupt={handleDrawInterrupt}
          markings={markings}
          currentGeometry={geometry}
          draftGeometry={draftGeometry}
          gpsLiveGeometry={gpsLiveGeometry}
          drawHint={drawHint}
          markingCount={totalMarkingCount}
          rootTransformRef={rootTransformRef}
          onOcadCrsReady={handleOcadCrsReady}
          onOcadMapScale={handleOcadMapScale}
          onOcadLayersReady={handleOcadLayersReady}
          gpsTrackingStatus={gpsTrackingStatus}
          gpsTrackFollow={gpsTrackFollow}
          mapBearing={mapBearing}
          compassStatus={compassStatus}
          gpsLineSymbolNum={gpsLineSymbolNum}
          onGpsLineSymbolChange={handleGpsLineSymbolChange}
          pendingGpsLineSymbolPick={pendingGpsLine}
          ocadLayers={ocadLayers}
          mapToolbarOverlay={mapToolbarOverlay}
        />
      </div>

      {error && !submitDialogOpen && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {submitDialogOpen && (
        <SuggestionSubmitDialog
          mapSlug={mapSlug}
          versionId={versionId}
          markings={markings}
          ocadLayers={ocadLayers}
          onClose={handleCloseSubmitDialog}
          onRemoveMarking={handleRemoveMarking}
          onSubmitted={handleSubmitted}
          onQueued={handleQueued}
        />
      )}
    </div>
  );
}
