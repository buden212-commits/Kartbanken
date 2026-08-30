import type { SvgBounds } from "./svg-utils";
import type { SvgRootTransform } from "./svg-coords";
import { maxZoomForMapScale } from "./map-display-scale";

export const TILE_SIZE_PX = 512;
export const TILE_FORMAT = "webp" as const;
/** Highest zoom level fully pregenerated after upload. */
export const TILE_MAX_Z_PREGEN = 4;

export type TileManifest = {
  version: 1;
  bounds: SvgBounds;
  tileSize: number;
  minZ: number;
  maxZPregen: number;
  maxZ: number;
  scale: number;
  format: typeof TILE_FORMAT;
  /** OCAD native Y-flip used when filtering objects for on-demand tiles. */
  yFlip: number;
  rootTransform: SvgRootTransform;
};

export type TileCoord = { z: number; x: number; y: number };

export function computeMaxTileZoom(ocadMapScale: number): number {
  const cssMaxZoom = maxZoomForMapScale(ocadMapScale);
  return Math.max(TILE_MAX_Z_PREGEN, Math.ceil(Math.log2(Math.max(cssMaxZoom, 1))));
}

export function tilesPerSide(z: number): number {
  return 2 ** z;
}

/** Number of pregenerated tiles for zoom levels 0…maxZPregen inclusive. */
export function countPregenTiles(maxZPregen: number): number {
  let total = 0;
  for (let z = 0; z <= maxZPregen; z++) {
    const n = tilesPerSide(z);
    total += n * n;
  }
  return total;
}

export function tileBounds(manifest: TileManifest, z: number, x: number, y: number): SvgBounds {
  const n = tilesPerSide(z);
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const height = manifest.bounds.maxY - manifest.bounds.minY;
  const tileW = width / n;
  const tileH = height / n;
  const minX = manifest.bounds.minX + x * tileW;
  const minY = manifest.bounds.minY + y * tileH;
  return {
    minX,
    minY,
    maxX: minX + tileW,
    maxY: minY + tileH,
  };
}

export function isValidTileCoord(z: number, x: number, y: number, maxZ: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < 0 || z > maxZ) return false;
  const n = tilesPerSide(z);
  return x >= 0 && y >= 0 && x < n && y < n;
}

/**
 * Visible tiles for a CSS zoom/pan viewport that displays an SVG with
 * preserveAspectRatio="xMidYMid meet" and transform translate(pan) scale(zoom).
 */
export function visibleTiles(params: {
  manifest: TileManifest;
  viewBox: SvgBounds;
  containerWidth: number;
  containerHeight: number;
  panX: number;
  panY: number;
  zoom: number;
  padTiles?: number;
}): TileCoord[] {
  const {
    manifest,
    viewBox,
    containerWidth,
    containerHeight,
    panX,
    panY,
    zoom,
    padTiles = 1,
  } = params;

  if (!(containerWidth > 0) || !(containerHeight > 0) || !(zoom > 0)) {
    return [{ z: 0, x: 0, y: 0 }];
  }

  const vbW = viewBox.maxX - viewBox.minX;
  const vbH = viewBox.maxY - viewBox.minY;
  if (!(vbW > 0) || !(vbH > 0)) return [{ z: 0, x: 0, y: 0 }];

  const meetScale = Math.min(containerWidth / vbW, containerHeight / vbH);
  const offsetX = (containerWidth - vbW * meetScale) / 2;
  const offsetY = (containerHeight - vbH * meetScale) / 2;

  // Screen → SVG user space (inverse of meet + pan/zoom transform)
  const screenToSvg = (sx: number, sy: number): { x: number; y: number } => {
    const localX = (sx - panX) / zoom;
    const localY = (sy - panY) / zoom;
    return {
      x: viewBox.minX + (localX - offsetX) / meetScale,
      y: viewBox.minY + (localY - offsetY) / meetScale,
    };
  };

  const corners = [
    screenToSvg(0, 0),
    screenToSvg(containerWidth, 0),
    screenToSvg(0, containerHeight),
    screenToSvg(containerWidth, containerHeight),
  ];
  let minX = Math.min(...corners.map((c) => c.x));
  let maxX = Math.max(...corners.map((c) => c.x));
  let minY = Math.min(...corners.map((c) => c.y));
  let maxY = Math.max(...corners.map((c) => c.y));

  minX = Math.max(manifest.bounds.minX, minX);
  maxX = Math.min(manifest.bounds.maxX, maxX);
  minY = Math.max(manifest.bounds.minY, minY);
  maxY = Math.min(manifest.bounds.maxY, maxY);

  // CSS zoom ≈ detail multiplier; pick tile z near log2(zoom)
  const idealZ = Math.log2(Math.max(zoom, 1));
  const z = Math.max(0, Math.min(manifest.maxZ, Math.round(idealZ)));

  const n = tilesPerSide(z);
  const tileW = (manifest.bounds.maxX - manifest.bounds.minX) / n;
  const tileH = (manifest.bounds.maxY - manifest.bounds.minY) / n;

  let x0 = Math.floor((minX - manifest.bounds.minX) / tileW) - padTiles;
  let x1 = Math.floor((maxX - manifest.bounds.minX) / tileW) + padTiles;
  let y0 = Math.floor((minY - manifest.bounds.minY) / tileH) - padTiles;
  let y1 = Math.floor((maxY - manifest.bounds.minY) / tileH) + padTiles;

  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(n - 1, x1);
  y1 = Math.min(n - 1, y1);

  const out: TileCoord[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      out.push({ z, x, y });
    }
  }
  return out.length > 0 ? out : [{ z: 0, x: 0, y: 0 }];
}

/** Avoid unused-param lint when refining later; keep helper for callers. */
export function mapUnitsPerPixelAtZoom(
  manifest: TileManifest,
  z: number,
): { x: number; y: number } {
  const n = tilesPerSide(z);
  return {
    x: (manifest.bounds.maxX - manifest.bounds.minX) / (n * TILE_SIZE_PX),
    y: (manifest.bounds.maxY - manifest.bounds.minY) / (n * TILE_SIZE_PX),
  };
}
