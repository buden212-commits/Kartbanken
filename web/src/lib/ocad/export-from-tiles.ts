import sharp from "sharp";
import { readStoredFile } from "@/lib/storage";
import { buildKartramFrameMarkup, parseKartramFromSvg } from "@/lib/ocad/kartram";
import {
  exportFrameBbox,
  type ExportFrame,
} from "@/lib/ocad/map-export";
import { rasterizeExportSvg } from "@/lib/ocad/export-rasterize";
import { ocadSvgYFlip, rasterizeOcadRegionPng } from "@/lib/ocad/tile-generate";
import type { SvgBounds } from "@/lib/ocad/svg-utils";

/** Print-resolution cells. Small enough that area hatch/struct patterns survive rasterizing. */
const CELL_PX = 512;
const CELL_CONCURRENCY = 3;

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
  onProgress?: (progress: { label: string; done?: number; total?: number }) => void;
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

/**
 * Draw the export window from the OCD file at print resolution, in cells.
 * Stored overview tiles are too coarse: lake fills and marsh hatching disappear.
 */
async function rasterizeVectorFrame(params: {
  mapFileId: string;
  versionNumber: number;
  storagePath: string;
  sourceBounds: SvgBounds;
  overscanW: number;
  overscanH: number;
  onProgress?: (progress: { label: string; done?: number; total?: number }) => void;
}): Promise<Buffer> {
  params.onProgress?.({ label: "Läser kartfilen" });
  const ocdBuffer = await readStoredFile(params.storagePath);
  const cacheKey = `${params.mapFileId}/v${params.versionNumber}`;
  const yFlip = await ocadSvgYFlip(ocdBuffer, cacheKey);
  const spanX = params.sourceBounds.maxX - params.sourceBounds.minX;
  const spanY = params.sourceBounds.maxY - params.sourceBounds.minY;

  const cells: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
    bounds: SvgBounds;
  }> = [];

  for (let top = 0; top < params.overscanH; top += CELL_PX) {
    for (let left = 0; left < params.overscanW; left += CELL_PX) {
      const width = Math.min(CELL_PX, params.overscanW - left);
      const height = Math.min(CELL_PX, params.overscanH - top);
      cells.push({
        left,
        top,
        width,
        height,
        bounds: {
          minX: params.sourceBounds.minX + (left / params.overscanW) * spanX,
          maxX: params.sourceBounds.minX + ((left + width) / params.overscanW) * spanX,
          minY: params.sourceBounds.minY + (top / params.overscanH) * spanY,
          maxY: params.sourceBounds.minY + ((top + height) / params.overscanH) * spanY,
        },
      });
    }
  }

  params.onProgress?.({ label: "Ritar kartan", done: 0, total: cells.length });
  let finished = 0;
  const parts = await mapPool(cells, CELL_CONCURRENCY, async (cell) => {
    const png = await rasterizeOcadRegionPng({
      ocdBuffer,
      cacheKey,
      yFlip,
      bounds: cell.bounds,
      widthPx: cell.width,
      heightPx: cell.height,
    });
    finished += 1;
    params.onProgress?.({ label: "Ritar kartan", done: finished, total: cells.length });
    return { input: png, left: cell.left, top: cell.top };
  });

  params.onProgress?.({ label: "Sätter ihop bilden" });

  return sharp({
    create: {
      width: params.overscanW,
      height: params.overscanH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(parts)
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
 * Rasterize the chosen paper window from the map file at print resolution.
 * Falls back to the stored preview SVG only if that render fails.
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

  const report = input.onProgress;

  try {
    mapPng = await rasterizeVectorFrame({
      mapFileId: input.mapFileId,
      versionNumber: input.versionNumber,
      storagePath: input.storagePath,
      sourceBounds,
      overscanW,
      overscanH,
      onProgress: report,
    });
  } catch (error) {
    console.warn("Vector export failed, falling back to preview SVG:", error);
    mapPng = null;
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
    report?.({ label: "Ritar kartan" });
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
    report?.({ label: "Lägger till ram och kartförslag" });
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
    report?.({ label: "Roterar kartan" });
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

  report?.({ label: "Lägger till skala" });

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
