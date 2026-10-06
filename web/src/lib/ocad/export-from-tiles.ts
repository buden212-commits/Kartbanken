import sharp from "sharp";
import { fileExists, readStoredFile } from "@/lib/storage";
import { buildKartramFrameMarkup, parseKartramFromSvg } from "@/lib/ocad/kartram";
import {
  exportFrameBbox,
  type ExportFrame,
} from "@/lib/ocad/map-export";
import { rasterizeExportSvg } from "@/lib/ocad/export-rasterize";
import { buildTilePath } from "@/lib/ocad/tile-paths";
import { readTileManifest } from "@/lib/ocad/tile-status";
import {
  TILE_SIZE_PX,
  mapUnitsPerPixelAtZoom,
  tileBounds,
  tilesPerSide,
  type TileManifest,
} from "@/lib/ocad/tile-math";
import type { SvgBounds } from "@/lib/ocad/svg-utils";

const MAX_COMPOSITE_TILES = 64;
const TILE_LOAD_CONCURRENCY = 8;

export type VersionExportRasterInput = {
  mapFileId: string;
  versionNumber: number;
  storagePath: string;
  previewSvgPath: string;
  tileStatus: string | null;
  tileManifestPath: string | null;
  frame: ExportFrame;
  widthPx: number;
  heightPx: number;
  rotationDeg: number;
  suggestionOverlaySvg?: string;
  hudSvg?: string;
};

function expandBoundsForRotation(bounds: SvgBounds, rotationDeg: number): SvgBounds {
  if (!rotationDeg) return bounds;
  const rad = (Math.abs(rotationDeg) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const expW = width * cos + height * sin;
  const expH = width * sin + height * cos;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    minX: cx - expW / 2,
    minY: cy - expH / 2,
    maxX: cx + expW / 2,
    maxY: cy + expH / 2,
  };
}

function frameToBounds(frame: ExportFrame): SvgBounds {
  const box = exportFrameBbox(frame);
  return {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.width,
    maxY: box.y + box.height,
  };
}

function pickExportTileZoom(
  manifest: TileManifest,
  sourceBounds: SvgBounds,
  widthPx: number,
  heightPx: number,
): number {
  const needUpp = Math.min(
    (sourceBounds.maxX - sourceBounds.minX) / Math.max(1, widthPx),
    (sourceBounds.maxY - sourceBounds.minY) / Math.max(1, heightPx),
  );

  // Smallest z that is sharp enough (fewest tiles).
  let chosen = manifest.maxZ;
  for (let z = 0; z <= manifest.maxZ; z++) {
    if (mapUnitsPerPixelAtZoom(manifest, z).x <= needUpp) {
      chosen = z;
      break;
    }
  }

  for (let z = chosen; z >= 0; z--) {
    if (tilesCoveringBounds(manifest, z, sourceBounds).length <= MAX_COMPOSITE_TILES) {
      return z;
    }
  }
  return 0;
}

function tilesCoveringBounds(
  manifest: TileManifest,
  z: number,
  bounds: SvgBounds,
): Array<{ z: number; x: number; y: number }> {
  const n = tilesPerSide(z);
  const mapW = manifest.bounds.maxX - manifest.bounds.minX;
  const mapH = manifest.bounds.maxY - manifest.bounds.minY;
  if (!(mapW > 0) || !(mapH > 0) || n < 1) return [];

  const tileW = mapW / n;
  const tileH = mapH / n;

  const minX = Math.max(manifest.bounds.minX, bounds.minX);
  const maxX = Math.min(manifest.bounds.maxX, bounds.maxX);
  const minY = Math.max(manifest.bounds.minY, bounds.minY);
  const maxY = Math.min(manifest.bounds.maxY, bounds.maxY);
  if (!(maxX > minX) || !(maxY > minY)) return [];

  let x0 = Math.floor((minX - manifest.bounds.minX) / tileW);
  let x1 = Math.floor((maxX - manifest.bounds.minX) / tileW);
  let y0 = Math.floor((minY - manifest.bounds.minY) / tileH);
  let y1 = Math.floor((maxY - manifest.bounds.minY) / tileH);
  x0 = Math.max(0, Math.min(n - 1, x0));
  x1 = Math.max(0, Math.min(n - 1, x1));
  y0 = Math.max(0, Math.min(n - 1, y0));
  y1 = Math.max(0, Math.min(n - 1, y1));

  const out: Array<{ z: number; x: number; y: number }> = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      out.push({ z, x, y });
    }
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => run()),
  );
  return results;
}

async function loadTileWebp(params: {
  manifest: TileManifest;
  mapFileId: string;
  versionNumber: number;
  storagePath: string;
  z: number;
  x: number;
  y: number;
}): Promise<Buffer> {
  const tilePath = buildTilePath(
    params.mapFileId,
    params.versionNumber,
    params.z,
    params.x,
    params.y,
  );
  try {
    if (await fileExists(tilePath)) {
      return await readStoredFile(tilePath);
    }
  } catch {
    // regenerate below
  }

  const ocdBuffer = await readStoredFile(params.storagePath);
  const { generateOnDemandTile } = await import("@/lib/ocad/tile-generate");
  return generateOnDemandTile({
    ocdBuffer,
    manifest: params.manifest,
    mapFileId: params.mapFileId,
    versionNumber: params.versionNumber,
    z: params.z,
    x: params.x,
    y: params.y,
  });
}

async function rasterizeFromTiles(params: {
  manifest: TileManifest;
  mapFileId: string;
  versionNumber: number;
  storagePath: string;
  sourceBounds: SvgBounds;
  overscanW: number;
  overscanH: number;
}): Promise<Buffer> {
  const { manifest, sourceBounds, overscanW, overscanH } = params;
  const z = pickExportTileZoom(manifest, sourceBounds, overscanW, overscanH);
  const coords = tilesCoveringBounds(manifest, z, sourceBounds);
  if (coords.length === 0) {
    throw new Error("Inga tiles täcker exportområdet");
  }

  const upp = mapUnitsPerPixelAtZoom(manifest, z);
  const canvasW = Math.max(1, Math.ceil((sourceBounds.maxX - sourceBounds.minX) / upp.x));
  const canvasH = Math.max(1, Math.ceil((sourceBounds.maxY - sourceBounds.minY) / upp.y));

  const composites = (
    await mapPool(coords, TILE_LOAD_CONCURRENCY, async (coord) => {
      const webp = await loadTileWebp({
        manifest,
        mapFileId: params.mapFileId,
        versionNumber: params.versionNumber,
        storagePath: params.storagePath,
        z: coord.z,
        x: coord.x,
        y: coord.y,
      });

      const bounds = tileBounds(manifest, coord.z, coord.x, coord.y);
      const intersectMinX = Math.max(bounds.minX, sourceBounds.minX);
      const intersectMinY = Math.max(bounds.minY, sourceBounds.minY);
      const intersectMaxX = Math.min(bounds.maxX, sourceBounds.maxX);
      const intersectMaxY = Math.min(bounds.maxY, sourceBounds.maxY);
      if (!(intersectMaxX > intersectMinX) || !(intersectMaxY > intersectMinY)) {
        return null;
      }

      const srcLeft = Math.max(0, Math.round((intersectMinX - bounds.minX) / upp.x));
      const srcTop = Math.max(0, Math.round((intersectMinY - bounds.minY) / upp.y));
      const dstLeft = Math.max(0, Math.round((intersectMinX - sourceBounds.minX) / upp.x));
      const dstTop = Math.max(0, Math.round((intersectMinY - sourceBounds.minY) / upp.y));
      const width = Math.min(
        TILE_SIZE_PX - srcLeft,
        canvasW - dstLeft,
        Math.round((intersectMaxX - intersectMinX) / upp.x),
      );
      const height = Math.min(
        TILE_SIZE_PX - srcTop,
        canvasH - dstTop,
        Math.round((intersectMaxY - intersectMinY) / upp.y),
      );
      if (width < 1 || height < 1) return null;

      const cropped = await sharp(webp)
        .extract({ left: srcLeft, top: srcTop, width, height })
        .png({ compressionLevel: 6, effort: 1 })
        .toBuffer();

      return { input: cropped, left: dstLeft, top: dstTop };
    })
  ).filter((part): part is NonNullable<typeof part> => part != null);

  const composed = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 6, effort: 1 })
    .toBuffer();

  return sharp(composed)
    .resize(overscanW, overscanH, { fit: "fill" })
    .png({ compressionLevel: 6, effort: 1 })
    .toBuffer();
}

async function rasterizePreviewFallback(
  previewSvgText: string,
  frame: ExportFrame,
  overscanW: number,
  overscanH: number,
  widthPx: number,
  heightPx: number,
): Promise<Buffer> {
  const { buildClippedExportSvg } = await import("@/lib/ocad/map-export");
  const mapSvg = buildClippedExportSvg(
    previewSvgText,
    {
      ...frame,
      widthUnits: frame.widthUnits * (overscanW / Math.max(1, widthPx)),
      heightUnits: frame.heightUnits * (overscanH / Math.max(1, heightPx)),
    },
    overscanW,
    overscanH,
    "",
    undefined,
    undefined,
    0,
  );
  return rasterizeExportSvg({
    mapSvg,
    rotationDeg: 0,
    widthPx: overscanW,
    heightPx: overscanH,
  });
}

/**
 * Rasterize an export frame by compositing map tiles when available.
 * Falls back to preview SVG only if tiles are missing.
 */
export async function rasterizeVersionExport(input: VersionExportRasterInput): Promise<Buffer> {
  const paperBounds = frameToBounds(input.frame);
  const sourceBounds = expandBoundsForRotation(paperBounds, input.rotationDeg);

  const rad = (Math.abs(input.rotationDeg) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const overscanW = Math.max(1, Math.round(input.widthPx * cos + input.heightPx * sin));
  const overscanH = Math.max(1, Math.round(input.widthPx * sin + input.heightPx * cos));

  let mapPng: Buffer | null = null;

  if (input.tileStatus === "READY" && input.tileManifestPath) {
    try {
      if (await fileExists(input.tileManifestPath)) {
        const manifest = await readTileManifest(input.tileManifestPath);
        mapPng = await rasterizeFromTiles({
          manifest,
          mapFileId: input.mapFileId,
          versionNumber: input.versionNumber,
          storagePath: input.storagePath,
          sourceBounds,
          overscanW,
          overscanH,
        });
      }
    } catch (error) {
      console.warn("Tile-based export failed, falling back to SVG:", error);
      mapPng = null;
    }
  }

  let previewSvgText: string | null = null;
  const needPreview =
    !mapPng ||
    Boolean(input.suggestionOverlaySvg?.trim()) ||
    Boolean(input.hudSvg?.trim());

  if (needPreview || !mapPng) {
    try {
      previewSvgText = (await readStoredFile(input.previewSvgPath)).toString("utf-8");
    } catch {
      if (!mapPng) throw new Error("Kunde inte läsa kartpreview");
      previewSvgText = null;
    }
  }

  if (!mapPng) {
    if (!previewSvgText) throw new Error("Kunde inte läsa kartpreview");
    mapPng = await rasterizePreviewFallback(
      previewSvgText,
      input.frame,
      overscanW,
      overscanH,
      input.widthPx,
      input.heightPx,
    );
  }

  // Kartram + suggestions in paper coordinates, centered on the overscan canvas.
  const paperBox = exportFrameBbox(input.frame);
  const kartram =
    previewSvgText != null
      ? buildKartramFrameMarkup(parseKartramFromSvg(previewSvgText), paperBox)
      : "";
  const suggestion = input.suggestionOverlaySvg?.trim() ?? "";
  const overlayBody = [kartram, suggestion].filter(Boolean).join("\n");
  if (overlayBody) {
    const overlaySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="transparent" viewBox="${paperBox.x} ${paperBox.y} ${paperBox.width} ${paperBox.height}" width="${input.widthPx}" height="${input.heightPx}">
${overlayBody}
</svg>`;
    const overlayPng = await rasterizeExportSvg({
      mapSvg: overlaySvg,
      rotationDeg: 0,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });
    const padLeft = Math.max(0, Math.floor((overscanW - input.widthPx) / 2));
    const padTop = Math.max(0, Math.floor((overscanH - input.heightPx) / 2));
    mapPng = await sharp(mapPng)
      .composite([{ input: overlayPng, left: padLeft, top: padTop }])
      .png({ compressionLevel: 6, effort: 1 })
      .toBuffer();
  }

  if (input.rotationDeg) {
    const rotated = await sharp(mapPng)
      .rotate(input.rotationDeg, { background: "#ffffff" })
      .png({ compressionLevel: 6, effort: 1 })
      .toBuffer({ resolveWithObject: true });

    const left = Math.max(0, Math.floor((rotated.info.width - input.widthPx) / 2));
    const top = Math.max(0, Math.floor((rotated.info.height - input.heightPx) / 2));
    const extractWidth = Math.min(input.widthPx, rotated.info.width - left);
    const extractHeight = Math.min(input.heightPx, rotated.info.height - top);

    mapPng = await sharp(rotated.data)
      .extract({ left, top, width: extractWidth, height: extractHeight })
      .resize(input.widthPx, input.heightPx, { fit: "fill" })
      .png({ compressionLevel: 6, effort: 1 })
      .toBuffer();
  } else if (overscanW !== input.widthPx || overscanH !== input.heightPx) {
    mapPng = await sharp(mapPng)
      .resize(input.widthPx, input.heightPx, { fit: "fill" })
      .png({ compressionLevel: 6, effort: 1 })
      .toBuffer();
  }

  const hudSvg = input.hudSvg?.trim();
  if (!hudSvg) return mapPng;

  const hudPng = await rasterizeExportSvg({
    mapSvg: hudSvg,
    rotationDeg: 0,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
  });

  return sharp(mapPng)
    .composite([{ input: hudPng, top: 0, left: 0 }])
    .png({ compressionLevel: 6, effort: 1 })
    .toBuffer();
}
