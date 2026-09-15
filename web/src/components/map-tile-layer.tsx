"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  tileBounds,
  visibleTiles,
  type TileCoord,
  type TileManifest,
} from "@/lib/ocad/tile-math";
import type { SvgBounds } from "@/lib/ocad/svg-utils";

type Props = {
  mapSlug: string;
  versionId: string;
  manifest: TileManifest;
  viewBox: SvgBounds;
  containerWidth: number;
  containerHeight: number;
  panX: number;
  panY: number;
  zoom: number;
};

/** Detail tiles above the pregen levels are rendered on request and can fail. */
const MAX_TILE_ATTEMPTS = 4;
const RETRY_BASE_MS = 1200;

function tileKey(t: TileCoord): string {
  return `${t.z}/${t.x}/${t.y}`;
}

function tileUrl(
  mapSlug: string,
  versionId: string,
  t: TileCoord,
  attempt: number,
): string {
  const base = `/api/maps/${mapSlug}/versions/${versionId}/tiles/${t.z}/${t.x}/${t.y}`;
  return attempt > 0 ? `${base}?retry=${attempt}` : base;
}

function TileImages({
  tiles,
  manifest,
  mapSlug,
  versionId,
  attempts,
  onTileError,
  onTileLoad,
}: {
  tiles: TileCoord[];
  manifest: TileManifest;
  mapSlug: string;
  versionId: string;
  attempts: Record<string, number>;
  onTileError: (key: string) => void;
  onTileLoad?: (key: string) => void;
}) {
  return (
    <>
      {tiles.map((t) => {
        const key = tileKey(t);
        const attempt = attempts[key] ?? 0;
        if (attempt >= MAX_TILE_ATTEMPTS) return null;
        const b = tileBounds(manifest, t.z, t.x, t.y);
        return (
          <image
            key={`${key}#${attempt}`}
            href={tileUrl(mapSlug, versionId, t, attempt)}
            x={b.minX}
            y={b.minY}
            width={b.maxX - b.minX}
            height={b.maxY - b.minY}
            preserveAspectRatio="none"
            onError={() => onTileError(key)}
            onLoad={onTileLoad ? () => onTileLoad(key) : undefined}
          />
        );
      })}
    </>
  );
}

export function MapTileLayer({
  mapSlug,
  versionId,
  manifest,
  viewBox,
  containerWidth,
  containerHeight,
  panX,
  panY,
  zoom,
}: Props) {
  const detailTiles = useMemo(
    () =>
      visibleTiles({
        manifest,
        viewBox,
        containerWidth,
        containerHeight,
        panX,
        panY,
        zoom,
      }),
    [manifest, viewBox, containerWidth, containerHeight, panX, panY, zoom],
  );

  const detailZ = detailTiles[0]?.z ?? 0;
  const baseZ = Math.min(detailZ, manifest.maxZPregen);

  // Pregenerated tiles always exist, so this layer keeps the map covered while
  // detail tiles are still being generated — or if they never arrive.
  const baseTiles = useMemo(
    () =>
      baseZ === detailZ
        ? []
        : visibleTiles({
            manifest,
            viewBox,
            containerWidth,
            containerHeight,
            panX,
            panY,
            zoom,
            forceZ: baseZ,
            padTiles: 1,
          }),
    [manifest, viewBox, containerWidth, containerHeight, panX, panY, zoom, baseZ, detailZ],
  );

  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;
  const retryTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = retryTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    setAttempts({});
    setLoaded({});
  }, [mapSlug, versionId]);

  const handleTileLoad = useCallback((key: string) => {
    setLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const handleTileError = useCallback((key: string) => {
    if (retryTimers.current.has(key)) return;
    const attempt = attemptsRef.current[key] ?? 0;
    if (attempt >= MAX_TILE_ATTEMPTS) return;
    // Back off so a slow first generation is not hammered by retries.
    const delay = RETRY_BASE_MS * 2 ** attempt;
    const timer = setTimeout(() => {
      retryTimers.current.delete(key);
      setAttempts((prev) => {
        const current = prev[key] ?? 0;
        if (current >= MAX_TILE_ATTEMPTS) return prev;
        return { ...prev, [key]: current + 1 };
      });
    }, delay);
    retryTimers.current.set(key, timer);
  }, []);

  // Drop the coarse layer as soon as the sharp tiles cover the viewport, so the
  // map is only blurry while detail is still on its way.
  const detailCoversViewport =
    detailTiles.length > 0 && detailTiles.every((t) => loaded[tileKey(t)]);
  const showBase = baseTiles.length > 0 && !detailCoversViewport;

  return (
    <g data-map-tiles="true" style={{ pointerEvents: "none" }}>
      {showBase && (
        <TileImages
          tiles={baseTiles}
          manifest={manifest}
          mapSlug={mapSlug}
          versionId={versionId}
          attempts={attempts}
          onTileError={handleTileError}
        />
      )}
      <TileImages
        tiles={detailTiles}
        manifest={manifest}
        mapSlug={mapSlug}
        versionId={versionId}
        attempts={attempts}
        onTileError={handleTileError}
        onTileLoad={handleTileLoad}
      />
    </g>
  );
}
