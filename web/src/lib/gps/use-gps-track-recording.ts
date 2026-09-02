"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isGeoreferencedCrs, wgs84ToMapCoord, type OcadCrsInfo } from "@/lib/ocad/crs";
import {
  evaluateGpsSample,
  GPS_TRACK_MAX_ACCURACY_M,
  GPS_TRACK_MAX_JUMP_M,
  GPS_TRACK_MAX_SPEED_MPS,
  GPS_TRACK_MIN_DISTANCE_M,
  processGpsTrack,
  type GpsTrackSample,
} from "@/lib/suggestion/gps-track";

const GPS_UI_UPDATE_MS = 1000;
const GPS_LINE_RENDER_MS = 2000;

export type GpsTrackSummary = {
  averageAccuracyMeters: number;
  rawPointCount: number;
  simplifiedPointCount: number;
  rejectedJumpCount: number;
};

type Options = {
  ocadCrs: OcadCrsInfo | null;
  ocadMapScale: number;
  onTrackComplete?: (coordinates: [number, number][], summary: GpsTrackSummary) => void;
  onTrackError?: (message: string) => void;
  onTrackStart?: () => void;
};

export function useGpsTrackRecording({
  ocadCrs,
  ocadMapScale,
  onTrackComplete,
  onTrackError,
  onTrackStart,
}: Options) {
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsSamplesRef = useRef<GpsTrackSample[]>([]);
  const gpsRejectedJumpsRef = useRef(0);
  const gpsLatestMapCoordRef = useRef<[number, number] | null>(null);
  const gpsLastAccuracyRef = useRef<number | null>(null);
  const gpsUiUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsLineRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsTrackingRecenterToken, setGpsTrackingRecenterToken] = useState(0);
  const [gpsLineRenderTick, setGpsLineRenderTick] = useState(0);
  const [gpsSampleCount, setGpsSampleCount] = useState(0);
  const [gpsRejectedJumpCount, setGpsRejectedJumpCount] = useState(0);
  const [gpsLiveAccuracyM, setGpsLiveAccuracyM] = useState<number | null>(null);
  const [gpsTrackSummary, setGpsTrackSummary] = useState<GpsTrackSummary | null>(null);

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
      setGpsTrackSummary(null);
    },
    [ocadCrs, ocadMapScale, scheduleGpsLineRender, scheduleGpsUiUpdate],
  );

  const startGpsTracking = useCallback(() => {
    if (!isGeoreferencedCrs(ocadCrs)) {
      onTrackError?.("Kartan saknar georeferering — GPS-spårning fungerar inte.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onTrackError?.("Enheten stödjer inte GPS.");
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
    onTrackStart?.();

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => appendGpsSample(pos.coords, pos.timestamp),
      (err) => {
        stopGpsWatch();
        setGpsTracking(false);
        setGpsLiveAccuracyM(null);
        if (err.code === err.PERMISSION_DENIED) {
          onTrackError?.("Platsåtkomst nekades. Tillåt plats i webbläsaren.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          onTrackError?.("Kunde inte hämta GPS-position.");
        } else if (err.code === err.TIMEOUT) {
          onTrackError?.("GPS tog för lång tid. Försök igen.");
        } else {
          onTrackError?.("GPS-fel under spårning.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      },
    );
  }, [appendGpsSample, ocadCrs, onTrackError, onTrackStart, stopGpsWatch]);

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
      onTrackError?.(
        samples.length === 0
          ? "Inga GPS-punkter sparades — kontrollera mottagning och att du rör dig minst några meter."
          : "Spåret har för få punkter — gå längre eller försök igen med bättre GPS-mottagning.",
      );
      return;
    }

    const summary: GpsTrackSummary = {
      averageAccuracyMeters: result.averageAccuracyMeters,
      rawPointCount: result.rawPointCount,
      simplifiedPointCount: result.simplifiedPointCount,
      rejectedJumpCount: result.rejectedJumpCount,
    };
    setGpsTrackSummary(summary);
    onTrackComplete?.(result.coordinates, summary);
  }, [ocadMapScale, onTrackComplete, onTrackError, stopGpsWatch]);

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
    setGpsLineRenderTick(0);
    setGpsTrackSummary(null);
  }, [stopGpsWatch]);

  const toggleGpsTracking = useCallback(() => {
    if (gpsTracking) {
      stopGpsTracking();
    } else {
      startGpsTracking();
    }
  }, [gpsTracking, startGpsTracking, stopGpsTracking]);

  const gpsLiveCoordinates = useMemo((): [number, number][] => {
    if (!gpsTracking) return [];
    void gpsLineRenderTick;
    return gpsSamplesRef.current.map((item) => item.mapCoord);
  }, [gpsTracking, gpsLineRenderTick]);

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
      return `Spår avslutat. Medelnoggrannhet ±${Math.round(gpsTrackSummary.averageAccuracyMeters)} m. ${gpsTrackSummary.rawPointCount} GPS-punkter förenklades till ${gpsTrackSummary.simplifiedPointCount} brytpunkter.${jumpText}`;
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

  return {
    gpsTracking,
    gpsTrackFollow,
    gpsLiveCoordinates,
    gpsTrackingStatus,
    gpsTrackSummary,
    canUseGpsTracking,
    startGpsTracking,
    stopGpsTracking,
    cancelGpsTracking,
    toggleGpsTracking,
  };
}
