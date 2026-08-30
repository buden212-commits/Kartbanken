"use client";

import { useEffect, useMemo, useState } from "react";
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

function tileUrl(mapSlug: string, versionId: string, t: TileCoord): string {
  return `/api/maps/${mapSlug}/versions/${versionId}/tiles/${t.z}/${t.x}/${t.y}`;
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
  const tiles = useMemo(
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

  const [failed, setFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setFailed({});
  }, [mapSlug, versionId]);

  return (
    <g data-map-tiles="true" style={{ pointerEvents: "none" }}>
      {tiles.map((t) => {
        const key = `${t.z}/${t.x}/${t.y}`;
        if (failed[key]) return null;
        const b = tileBounds(manifest, t.z, t.x, t.y);
        return (
          <image
            key={key}
            href={tileUrl(mapSlug, versionId, t)}
            x={b.minX}
            y={b.minY}
            width={b.maxX - b.minX}
            height={b.maxY - b.minY}
            preserveAspectRatio="none"
            onError={() => setFailed((prev) => ({ ...prev, [key]: true }))}
          />
        );
      })}
    </g>
  );
}
