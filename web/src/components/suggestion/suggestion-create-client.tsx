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
  GPS_TRACK_MAX_ACCURACY_M,
  GPS_TRACK_MIN_DISTANCE_M,
  processGpsTrack,
  shouldAcceptGpsSample,
  type GpsTrackSample,
} from "@/lib/suggestion/gps-track";
import {
  MAX_SUGGESTION_GEOMETRIES,
  SUGGESTION_CATEGORY_LABELS,
  type SuggestionCategoryValue,
  type SuggestionGeometry,
} from "@/lib/suggestion/types";
import { uploadSuggestionAttachment } from "@/lib/upload-client";

type DrawTool = "pin" | "rectangle" | "polygon" | "line";

const NEUTRAL_BTN =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const TOOL_ACTIVE =
  "border-ifk-blue bg-ifk-blue text-white hover:bg-ifk-blue";
const TOOL_INACTIVE =
  "border-slate-300 text-slate-700 hover:border-ifk-blue hover:text-ifk-blue";

type Props = {
  mapSlug: string;
  mapTitle: string;
  versionId: string;
  versionNumber: number;
};

const TOOL_LABELS: Record<DrawTool, string> = {
  pin: "Punkt",
  rectangle: "Rektangel",
  polygon: "Polygon",
  line: "Linje",
};

const GEOMETRY_TYPE_LABELS: Record<SuggestionGeometry["type"], string> = {
  Point: "Punkt",
  Bbox: "Rektangel",
  Polygon: "Polygon",
  LineString: "Linje",
};

type CreateMapPanelProps = {
  mapSlug: string;
  versionId: string;
  mapMode: "draw" | "navigate";
  onMapModeChange: (mode: "draw" | "navigate") => void;
  drawPointerHandlers: MapDrawPointerHandlers;
  onDrawInterrupt: () => void;
  markings: SuggestionGeometry[];
  currentGeometry: SuggestionGeometry | null;
  draftGeometry: SuggestionGeometry | null;
  drawHint: string;
  markingCount: number;
  rootTransformRef: MutableRefObject<SvgRootTransform>;
  onOcadCrsReady: (crs: OcadCrsInfo | null) => void;
  onOcadMapScale: (scale: number) => void;
  gpsTrackingStatus: string | null;
  gpsTracking: boolean;
  canUseGpsTracking: boolean;
  onGpsTrackingToggle: () => void;
};

const MAP_MODE_BTN =
  "min-h-10 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition sm:flex-none sm:min-h-9 sm:px-4";
const MAP_MODE_ACTIVE = "border-ifk-blue bg-ifk-blue text-white";
const MAP_MODE_INACTIVE =
  "border-slate-300 bg-white text-slate-700 hover:border-ifk-blue hover:text-ifk-blue";
const GPS_TRACK_BTN =
  "min-h-10 w-full rounded-lg border px-3 py-2 text-sm font-medium transition sm:min-h-9 sm:w-auto sm:px-4";

const SuggestionCreateMapPanel = memo(function SuggestionCreateMapPanel({
  mapSlug,
  versionId,
  mapMode,
  onMapModeChange,
  drawPointerHandlers,
  onDrawInterrupt,
  markings,
  currentGeometry,
  draftGeometry,
  drawHint,
  markingCount,
  rootTransformRef,
  onOcadCrsReady,
  onOcadMapScale,
  gpsTrackingStatus,
  gpsTracking,
  canUseGpsTracking,
  onGpsTrackingToggle,
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
      const overlay = draftGeometry ?? currentGeometry;
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
    [markings, currentGeometry, draftGeometry, rootTransformRef],
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
      secondaryHeaderContent={
        <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
          {gpsTrackingStatus && (
            <p className="rounded-lg border border-ifk-blue/30 bg-ifk-blue/5 px-3 py-2 text-xs text-ifk-blue">
              {gpsTrackingStatus}
            </p>
          )}
          <button
            type="button"
            disabled={!canUseGpsTracking && !gpsTracking}
            title={
              canUseGpsTracking ? undefined : "GPS-spårning kräver georefererad karta"
            }
            onClick={onGpsTrackingToggle}
            className={`${GPS_TRACK_BTN} ${
              gpsTracking
                ? "border-amber-600 bg-amber-600 text-white hover:bg-amber-700"
                : canUseGpsTracking
                  ? "border-ifk-blue bg-white text-ifk-blue hover:bg-ifk-blue/5"
                  : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {gpsTracking ? "Sluta spåra" : "GPS-spår"}
          </button>
          <div
            className="flex gap-2"
            role="group"
            aria-label="Kartläge"
          >
            <button
              type="button"
              onClick={() => onMapModeChange("draw")}
              className={`${MAP_MODE_BTN} ${mapMode === "draw" ? MAP_MODE_ACTIVE : MAP_MODE_INACTIVE}`}
              aria-pressed={mapMode === "draw"}
            >
              Rita
            </button>
            <button
              type="button"
              onClick={() => onMapModeChange("navigate")}
              className={`${MAP_MODE_BTN} ${mapMode === "navigate" ? MAP_MODE_ACTIVE : MAP_MODE_INACTIVE}`}
              aria-pressed={mapMode === "navigate"}
            >
              Navigera
            </button>
          </div>
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

  const [tool, setTool] = useState<DrawTool>("pin");
  const [mapMode, setMapMode] = useState<"draw" | "navigate">("draw");
  const [ocadCrs, setOcadCrs] = useState<OcadCrsInfo | null>(null);
  const [ocadMapScale, setOcadMapScale] = useState(15000);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsSampleCount, setGpsSampleCount] = useState(0);
  const [gpsLiveAccuracyM, setGpsLiveAccuracyM] = useState<number | null>(null);
  const [gpsTrackSummary, setGpsTrackSummary] = useState<{
    averageAccuracyMeters: number;
    rawPointCount: number;
    simplifiedPointCount: number;
  } | null>(null);
  const [markings, setMarkings] = useState<SuggestionGeometry[]>([]);
  const [geometry, setGeometry] = useState<SuggestionGeometry | null>(null);
  const [draftBbox, setDraftBbox] = useState<SuggestionGeometry | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [linePoints, setLinePoints] = useState<[number, number][]>([]);
  const [category, setCategory] = useState<SuggestionCategoryValue>("FEL_I_TERRANG");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  const clearFormFields = useCallback(() => {
    setCategory("FEL_I_TERRANG");
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

  const appendGpsSample = useCallback(
    (coords: GeolocationCoordinates) => {
      if (!ocadCrs || !isGeoreferencedCrs(ocadCrs)) return;

      const mapCoord = wgs84ToMapCoord(coords.longitude, coords.latitude, ocadCrs);
      if (!mapCoord) return;

      const accuracyMeters =
        typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy)
          ? coords.accuracy
          : GPS_TRACK_MAX_ACCURACY_M;

      setGpsLiveAccuracyM(accuracyMeters);

      const lastSample = gpsSamplesRef.current.at(-1) ?? null;
      if (
        !shouldAcceptGpsSample(mapCoord, accuracyMeters, lastSample, {
          minDistanceM: GPS_TRACK_MIN_DISTANCE_M,
          maxAccuracyM: GPS_TRACK_MAX_ACCURACY_M,
          mapScale: ocadMapScale,
        })
      ) {
        return;
      }

      const sample: GpsTrackSample = { mapCoord, accuracyMeters };
      gpsSamplesRef.current = [...gpsSamplesRef.current, sample];
      setGpsSampleCount(gpsSamplesRef.current.length);
      setLinePoints(gpsSamplesRef.current.map((item) => item.mapCoord));
      setGeometry(null);
      setGpsTrackSummary(null);
      setError(null);
    },
    [ocadCrs, ocadMapScale],
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
    setGpsSampleCount(0);
    setGpsTracking(true);
    setGpsTrackSummary(null);
    setGpsLiveAccuracyM(null);
    setTool("line");
    setMapMode("navigate");
    setGeometry(null);
    resetDraft();
    setLinePoints([]);
    setError(null);

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => appendGpsSample(pos.coords),
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
    setGpsLiveAccuracyM(null);

    const samples = gpsSamplesRef.current;
    const result = processGpsTrack(samples, { mapScale: ocadMapScale });
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
    });
    setError(null);
  }, [ocadMapScale, stopGpsWatch]);

  const cancelGpsTracking = useCallback(() => {
    stopGpsWatch();
    setGpsTracking(false);
    setGpsLiveAccuracyM(null);
    gpsSamplesRef.current = [];
    setGpsSampleCount(0);
    setLinePoints([]);
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

      if (tool === "pin") {
        setGeometry({ type: "Point", coordinates: geo });
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
    if (linePoints.length >= 1) return { type: "LineString", coordinates: linePoints };
    return null;
  }, [draftBbox, linePoints, polygonPoints]);

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
    return tool === "pin"
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
      return `Spårar GPS — ${gpsSampleCount} punkt${gpsSampleCount === 1 ? "" : "er"}. ${accuracyText}.`;
    }
    if (gpsTrackSummary) {
      return `Spår avslutat. Medelnoggrannhet ±${Math.round(gpsTrackSummary.averageAccuracyMeters)} m. ${gpsTrackSummary.rawPointCount} GPS-punkter förenklades till ${gpsTrackSummary.simplifiedPointCount} brytpunkter. Klicka «Lägg till ändring» om linjen ser bra ut.`;
    }
    return null;
  }, [gpsTracking, gpsSampleCount, gpsLiveAccuracyM, gpsTrackSummary]);

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

  function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setAttachmentFile(file);
    if (attachmentPreview) {
      URL.revokeObjectURL(attachmentPreview);
    }
    setAttachmentPreview(file ? URL.createObjectURL(file) : null);
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

      <div className="mt-4">
        <h1 className="text-2xl font-semibold text-slate-900">Föreslå kartändring</h1>
        <p className="mt-2 text-sm text-slate-600">
          {mapTitle} · v{versionNumber}. Markera plats eller område på kartan, skriv vad som bör
          ändras och spara. Förslaget påverkar inte kartfilen — en redaktör granskar det separat.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(TOOL_LABELS) as DrawTool[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={gpsTracking}
            onClick={() => handleToolChange(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tool === t && !gpsTracking ? TOOL_ACTIVE : TOOL_INACTIVE
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {TOOL_LABELS[t]}
          </button>
        ))}
        <button
          type="button"
          disabled={!canAddMarking}
          onClick={handleAddMarking}
          className={canAddMarking ? "btn-primary rounded-lg px-3 py-1.5 text-sm" : NEUTRAL_BTN}
        >
          Lägg till ändring
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Rensa
        </button>
        <button
          type="button"
          disabled={markings.length < 1}
          onClick={handleOpenSubmitDialog}
          className={
            markings.length > 0
              ? "btn-primary rounded-lg px-3 py-1.5 text-sm"
              : NEUTRAL_BTN
          }
        >
          {markings.length > 0
            ? `Skicka in kartförslag (${markings.length} st)`
            : "Skicka in kartförslag"}
        </button>
      </div>

      {error && !submitDialogOpen && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-6">
        <SuggestionCreateMapPanel
          mapSlug={mapSlug}
          versionId={versionId}
          mapMode={mapMode}
          onMapModeChange={setMapMode}
          drawPointerHandlers={drawPointerHandlers}
          onDrawInterrupt={handleDrawInterrupt}
          markings={markings}
          currentGeometry={geometry}
          draftGeometry={draftGeometry}
          drawHint={drawHint}
          markingCount={totalMarkingCount}
          rootTransformRef={rootTransformRef}
          onOcadCrsReady={handleOcadCrsReady}
          onOcadMapScale={handleOcadMapScale}
          gpsTrackingStatus={gpsTrackingStatus}
          gpsTracking={gpsTracking}
          canUseGpsTracking={canUseGpsTracking}
          onGpsTrackingToggle={handleGpsTrackingToggle}
        />
      </div>

      {submitDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-submit-dialog-title"
            onSubmit={(e) => void handleSubmit(e)}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-lg sm:max-w-lg sm:rounded-xl"
          >
            <h2 id="suggestion-submit-dialog-title" className="text-lg font-semibold text-slate-900">
              Skicka in kartförslag
            </h2>
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
                    {index + 1}. {GEOMETRY_TYPE_LABELS[marking.type]}
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
              <div>
                <label htmlFor="comment" className="form-label">
                  Beskrivning
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required
                  minLength={2}
                  rows={4}
                  autoFocus
                  className="form-input"
                  placeholder="Beskriv vad som är fel, saknas eller bör förklaras (minst 2 tecken)."
                />
              </div>
              <div>
                <label htmlFor="attachment" className="form-label">
                  Foto (valfritt)
                </label>
                <input
                  id="attachment"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAttachmentChange}
                  className="form-input"
                />
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
