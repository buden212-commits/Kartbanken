"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { HelpLinkIcon, HelpSectionHeading } from "@/components/help-link-icon";
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
import {
  SuggestionLocationConfidenceField,
} from "@/components/suggestion/suggestion-location-confidence-field";
import { SuggestionCommentField } from "@/components/suggestion/suggestion-comment-field";
import {
  buildSuggestionCommentTemplate,
  suggestionMarkingGeometryLabel,
} from "@/lib/suggestion/suggestion-comment-template";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import {
  DEFAULT_SUGGESTION_LOCATION_CONFIDENCE,
  MAX_SUGGESTION_GEOMETRIES,
  SUGGESTION_CATEGORY_LABELS,
  type SuggestionCategoryValue,
  type SuggestionGeometry,
  type SuggestionLocationConfidenceValue,
} from "@/lib/suggestion/types";
import { uploadSuggestionAttachment } from "@/lib/upload-client";
import {
  SuggestionMapActionToolbar,
  SuggestionMapRightToolbars,
  type SuggestionDrawTool,
} from "@/components/suggestion/suggestion-draw-toolbar";

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
      basemap="tiles"
      exportEnabled={false}
      interactionMode={mapMode}
      drawPointerHandlers={mapMode === "draw" ? drawPointerHandlers : undefined}
      onDrawInterrupt={onDrawInterrupt}
      renderSvgOverlay={renderSvgOverlay}
      onOcadCrsReady={onOcadCrsReady}
      onOcadMapScale={onOcadMapScale}
      onOcadLayersReady={onOcadLayersReady}
      gpsTrackFollow={gpsTrackFollow}
      mapToolbarOverlay={mapToolbarOverlay}
      secondaryHeaderContent={
        <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
          {gpsTrackingStatus && (
            <p className="rounded-lg border border-ifk-blue/30 bg-ifk-blue/5 px-3 py-2 text-xs text-ifk-blue">
              {gpsTrackingStatus}
            </p>
          )}
          <p className={`text-xs ${mapMode === "draw" ? "text-amber-700" : "text-slate-600"}`}>
            {mapMode === "navigate"
              ? "Navigeringsläge — dra för att panorera och nyp med två fingrar för att zooma. Växla till Rita när du ska markera."
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
  const router = useRouter();
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const dragRef = useRef<{ start: [number, number]; current: [number, number] } | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsSamplesRef = useRef<GpsTrackSample[]>([]);
  const gpsRejectedJumpsRef = useRef(0);
  const gpsLatestMapCoordRef = useRef<[number, number] | null>(null);
  const gpsLastAccuracyRef = useRef<number | null>(null);
  const gpsUiUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsLineRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<DrawTool>("pin");
  const [mapMode, setMapMode] = useState<"draw" | "navigate">("navigate");
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
  const [category, setCategory] = useState<SuggestionCategoryValue>("FEL_I_TERRANG");
  const [locationConfidence, setLocationConfidence] = useState<SuggestionLocationConfidenceValue>(
    DEFAULT_SUGGESTION_LOCATION_CONFIDENCE,
  );
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  const clearFormFields = useCallback(() => {
    setCategory("FEL_I_TERRANG");
    setLocationConfidence(DEFAULT_SUGGESTION_LOCATION_CONFIDENCE);
    setTitle("");
    setComment("");
    setAttachmentFile(null);
    setAttachmentPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

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
      return `Spår avslutat. Medelnoggrannhet ±${Math.round(gpsTrackSummary.averageAccuracyMeters)} m. ${gpsTrackSummary.rawPointCount} GPS-punkter förenklades till ${gpsTrackSummary.simplifiedPointCount} brytpunkter.${jumpText} Klicka «Lägg till ändring» om linjen ser bra ut.`;
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

  const canAddMarking = finalizableGeometry !== null;
  const totalMarkingCount = markings.length + (finalizableGeometry ? 1 : 0);

  function handleToolChange(next: DrawTool) {
    if (gpsTracking) {
      cancelGpsTracking();
    }
    setTool(next);
    setMapMode("draw");
    setGeometry(null);
    resetDraft();
    setGpsTrackSummary(null);
    setError(null);
  }

  function handleAddMarking() {
    const toAdd = finalizableGeometry;
    if (!toAdd) return;
    if (markings.length >= MAX_SUGGESTION_GEOMETRIES) {
      setError(`Max ${MAX_SUGGESTION_GEOMETRIES} markeringar per förslag`);
      return;
    }
    setMarkings((prev) => [...prev, toAdd]);
    setGeometry(null);
    resetDraft();
    setGpsTrackSummary(null);
    setError(null);
  }

  function handleRemoveMarking(index: number) {
    setMarkings((prev) => prev.filter((_, i) => i !== index));
  }

  function handleClearAll() {
    if (gpsTracking) {
      cancelGpsTracking();
    }
    setMarkings([]);
    setGeometry(null);
    setGpsTrackSummary(null);
    clearFormFields();
    resetDraft();
    setError(null);
  }

  function applyAttachmentFile(file: File | null) {
    setAttachmentFile(file);
    setAttachmentPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    applyAttachmentFile(e.target.files?.[0] ?? null);
    e.target.value = "";
  }

  function handleOpenSubmitDialog() {
    if (markings.length < 1) {
      if (geometry || finalizableGeometry) {
        setError("Klicka «Lägg till ändring» innan du skickar, eller rensa den aktuella ritningen");
      } else {
        setError("Lägg till minst en markering på kartan");
      }
      return;
    }
    setError(null);
    if (!comment.trim()) {
      setComment(buildSuggestionCommentTemplate(markings));
    }
    setSubmitDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (markings.length < 1) {
      setError("Lägg till minst en markering på kartan");
      return;
    }
    const submissionComment = comment.trim();
    if (submissionComment.length < 2) {
      setError("Beskrivning krävs (minst 2 tecken)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let attachmentPath: string | undefined;
      if (attachmentFile) {
        const uploadRes = await uploadSuggestionAttachment(mapSlug, attachmentFile);
        const uploadData = (await uploadRes.json()) as { error?: string; attachmentPath?: string };
        if (!uploadRes.ok) {
          throw new Error(uploadData.error ?? "Kunde inte ladda upp bilden");
        }
        attachmentPath = uploadData.attachmentPath;
      }

      const res = await fetch(`/api/maps/${mapSlug}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapVersionId: versionId,
          category,
          locationConfidence,
          title: title.trim() || undefined,
          comment: submissionComment,
          geometries: markings,
          attachmentPath,
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte spara kartförslaget");
      }
      router.push(`/maps/${mapSlug}/suggestions/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara kartförslaget");
    } finally {
      setLoading(false);
    }
  }

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
          mapToolbarOverlay={
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
              />
            </>
          }
        />
      </div>

      {error && !submitDialogOpen && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {submitDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-submit-dialog-title"
            onSubmit={(e) => void handleSubmit(e)}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-lg sm:max-w-lg sm:rounded-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <HelpSectionHeading section="kartforslag" id="suggestion-submit-dialog-title">
                Skicka in kartförslag
              </HelpSectionHeading>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setSubmitDialogOpen(false);
                  setError(null);
                }}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Tillbaka
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Fyll i uppgifterna nedan och skicka in {markings.length}{" "}
              {markings.length === 1 ? "ändring" : "ändringar"} tillsammans.
            </p>
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {markings.map((marking, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between gap-2 text-sm text-slate-600"
                >
                  <span>
                    {index + 1}. {suggestionMarkingGeometryLabel(marking)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMarking(index)}
                    className="text-red-600 hover:underline"
                  >
                    Ta bort
                  </button>
                </li>
              ))}
            </ul>
            <fieldset className="mt-4 space-y-4">
              <div>
                <label htmlFor="category" className="form-label">
                  Kategori
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SuggestionCategoryValue)}
                  className="form-input"
                >
                  {Object.entries(SUGGESTION_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <SuggestionLocationConfidenceField
                name="Hur säker är du på platsen på kartan?"
                value={locationConfidence}
                onChange={setLocationConfidence}
                idPrefix="submit-location-confidence"
              />
              <div>
                <label htmlFor="title" className="form-label">
                  Rubrik (valfritt)
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  className="form-input"
                  placeholder="Kort sammanfattning"
                />
              </div>
              <SuggestionCommentField
                value={comment}
                onChange={setComment}
                ocadLayers={ocadLayers}
                markings={markings}
                disabled={loading}
              />
              <div>
                <p className="form-label">Foto (valfritt)</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="min-h-10 rounded-lg border border-ifk-blue px-3 py-2 text-sm font-medium text-ifk-blue hover:bg-ifk-blue/5"
                  >
                    Ta foto
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Välj bild
                  </button>
                  {attachmentFile && (
                    <button
                      type="button"
                      onClick={() => applyAttachmentFile(null)}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Ta bort foto
                    </button>
                  )}
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleAttachmentChange}
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                />
                <input
                  ref={galleryInputRef}
                  id="attachment"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  onChange={handleAttachmentChange}
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                />
                {attachmentFile && (
                  <p className="mt-2 text-xs text-slate-500">{attachmentFile.name}</p>
                )}
                {attachmentPreview && (
                  <img
                    src={attachmentPreview}
                    alt="Förhandsvisning av bilaga"
                    className="mt-2 max-h-48 rounded-lg border border-slate-200 object-contain"
                  />
                )}
              </div>
            </fieldset>
            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setSubmitDialogOpen(false);
                  setError(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Tillbaka
              </button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? "Sparar…" : `Skicka in kartförslag (${markings.length} st)`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
