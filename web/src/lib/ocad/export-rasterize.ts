import sharp from "sharp";

export type ExportRasterizeInput = {
  mapSvg: string;
  hudSvg?: string;
  rotationDeg: number;
  widthPx: number;
  heightPx: number;
};

/**
 * Match tile rasterization: SVG already declares pixel width/height.
 * High density (e.g. 200) makes librsvg over-compute on large OCAD SVGs and
 * can hang the export request for minutes with no useful progress.
 */
const SVG_RASTER_DENSITY = 96;
/** Fallback SVG path only — tile export should finish well under this. */
const RASTER_TIMEOUT_SECONDS = 240;

/**
 * Rasterize export SVG with librsvg (sharp). Chromium's Image→canvas path
 * leaves area patterns/structure symbols unrotated relative to geometry;
 * sharp applies a consistent CTM so page tilt keeps symbols aligned.
 */
export async function rasterizeExportSvg(input: ExportRasterizeInput): Promise<Buffer> {
  const widthPx = Math.max(1, Math.round(input.widthPx));
  const heightPx = Math.max(1, Math.round(input.heightPx));
  const rotationDeg = Number.isFinite(input.rotationDeg) ? input.rotationDeg : 0;

  const svgOptions = {
    density: SVG_RASTER_DENSITY,
    limitInputPixels: false as const,
  };

  let mapPng = await sharp(Buffer.from(input.mapSvg, "utf-8"), svgOptions)
    .resize(widthPx, heightPx, { fit: "fill" })
    .timeout({ seconds: RASTER_TIMEOUT_SECONDS })
    .png()
    .toBuffer();

  if (rotationDeg) {
    const rotated = await sharp(mapPng)
      .rotate(rotationDeg, { background: "#ffffff" })
      .timeout({ seconds: RASTER_TIMEOUT_SECONDS })
      .png()
      .toBuffer({ resolveWithObject: true });

    const left = Math.max(0, Math.floor((rotated.info.width - widthPx) / 2));
    const top = Math.max(0, Math.floor((rotated.info.height - heightPx) / 2));
    const extractWidth = Math.min(widthPx, rotated.info.width - left);
    const extractHeight = Math.min(heightPx, rotated.info.height - top);

    if (extractWidth < 1 || extractHeight < 1) {
      throw new Error("Ogiltig storlek efter rotering av exportbild");
    }

    mapPng = await sharp(rotated.data)
      .extract({
        left,
        top,
        width: extractWidth,
        height: extractHeight,
      })
      .resize(widthPx, heightPx, { fit: "fill" })
      .timeout({ seconds: RASTER_TIMEOUT_SECONDS })
      .png()
      .toBuffer();
  }

  const hudSvg = input.hudSvg?.trim();
  if (!hudSvg) {
    return mapPng;
  }

  const hudPng = await sharp(Buffer.from(hudSvg, "utf-8"), svgOptions)
    .resize(widthPx, heightPx, { fit: "fill" })
    .ensureAlpha()
    .timeout({ seconds: RASTER_TIMEOUT_SECONDS })
    .png()
    .toBuffer();

  return sharp(mapPng)
    .composite([{ input: hudPng, top: 0, left: 0 }])
    .timeout({ seconds: RASTER_TIMEOUT_SECONDS })
    .png()
    .toBuffer();
}
