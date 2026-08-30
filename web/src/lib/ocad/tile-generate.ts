import sharp, { type OutputInfo } from "sharp";
import { createRequire } from "module";
import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile, uploadFile } from "@/lib/storage";
import {
  buildPreviewSvgPath,
  generateAndStorePreviewSvg,
  generateOcadSvgFiltered,
} from "@/lib/ocad/svg";
import { extractSvgInner, parseViewBox, type SvgBounds } from "@/lib/ocad/svg-utils";
import { IDENTITY_SVG_TRANSFORM } from "@/lib/ocad/svg-coords";
import { buildTileManifestPath, buildTilePath } from "@/lib/ocad/tile-paths";
import {
  TILE_FORMAT,
  TILE_MAX_Z_PREGEN,
  TILE_SIZE_PX,
  computeMaxTileZoom,
  tileBounds,
  tilesPerSide,
  type TileManifest,
} from "@/lib/ocad/tile-math";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{
    objects: Array<{
      objIndex?: {
        _index?: number;
        rc?: { min?: ArrayLike<number>; max?: ArrayLike<number> };
      };
      coordinates?: ArrayLike<number>[];
    }>;
    getBounds: () => number[];
    getCrs: () => { scale?: number };
  }>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function svgBoundsFromNative(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  yFlip: number,
): SvgBounds {
  const svgMinY = yFlip - Math.max(minY, maxY);
  const svgMaxY = yFlip - Math.min(minY, maxY);
  return {
    minX: Math.min(minX, maxX),
    minY: svgMinY,
    maxX: Math.max(minX, maxX),
    maxY: svgMaxY,
  };
}

function objectSvgBounds(
  obj: {
    objIndex?: { rc?: { min?: ArrayLike<number>; max?: ArrayLike<number> } };
    coordinates?: ArrayLike<number>[];
  },
  yFlip: number,
): SvgBounds | null {
  const rc = obj.objIndex?.rc;
  if (
    rc?.min &&
    rc?.max &&
    isFiniteNumber(rc.min[0]) &&
    isFiniteNumber(rc.min[1]) &&
    isFiniteNumber(rc.max[0]) &&
    isFiniteNumber(rc.max[1])
  ) {
    return svgBoundsFromNative(rc.min[0], rc.min[1], rc.max[0], rc.max[1], yFlip);
  }

  const coords = obj.coordinates;
  if (!coords || coords.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of coords) {
    const x = coord[0];
    const y = coord[1];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return svgBoundsFromNative(minX, minY, maxX, maxY, yFlip);
}

function boundsIntersect(a: SvgBounds, b: SvgBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function rewriteSvgViewBox(svgText: string, bounds: SvgBounds, widthPx: number, heightPx: number): string {
  const vb = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
  let out = svgText.replace(/viewBox=["'][^"']*["']/i, `viewBox="${vb}"`);
  if (/width=["']/i.test(out)) {
    out = out.replace(/width=["'][^"']*["']/i, `width="${widthPx}"`);
  } else {
    out = out.replace(/<svg/i, `<svg width="${widthPx}"`);
  }
  if (/height=["']/i.test(out)) {
    out = out.replace(/height=["'][^"']*["']/i, `height="${heightPx}"`);
  } else {
    out = out.replace(/<svg/i, `<svg height="${heightPx}"`);
  }
  out = out.replace(/preserveAspectRatio=["'][^"']*["']/i, `preserveAspectRatio="none"`);
  if (!/preserveAspectRatio=/i.test(out)) {
    out = out.replace(/<svg/i, `<svg preserveAspectRatio="none"`);
  }
  return out;
}

async function rasterizeSvgRegion(
  svgText: string,
  bounds: SvgBounds,
  widthPx = TILE_SIZE_PX,
  heightPx = TILE_SIZE_PX,
): Promise<Buffer> {
  const clipped = rewriteSvgViewBox(svgText, bounds, widthPx, heightPx);
  return sharp(Buffer.from(clipped, "utf-8"), {
    density: 96,
    limitInputPixels: false,
  })
    .resize(widthPx, heightPx, { fit: "fill" })
    .webp({ quality: 80 })
    .toBuffer();
}

async function uploadTile(
  mapFileId: string,
  versionNumber: number,
  z: number,
  x: number,
  y: number,
  webp: Buffer,
): Promise<void> {
  const path = buildTilePath(mapFileId, versionNumber, z, x, y);
  await uploadFile(path, webp);
}

async function ensurePreviewSvg(version: {
  id: string;
  mapFileId: string;
  versionNumber: number;
  storagePath: string;
  previewSvgPath: string | null;
}): Promise<{ svgText: string; previewSvgPath: string }> {
  let previewSvgPath = version.previewSvgPath;
  if (!previewSvgPath || !(await fileExists(previewSvgPath))) {
    previewSvgPath = buildPreviewSvgPath(version.mapFileId, version.versionNumber);
    const ocd = await readStoredFile(version.storagePath);
    await generateAndStorePreviewSvg(ocd, previewSvgPath);
    await prisma.mapVersion.update({
      where: { id: version.id },
      data: { previewSvgPath },
    });
  }
  const svgBuffer = await readStoredFile(previewSvgPath);
  return { svgText: svgBuffer.toString("utf-8"), previewSvgPath };
}

function buildManifestFromSvg(
  svgText: string,
  yFlip: number,
  scale: number,
): TileManifest {
  const bounds = parseViewBox(svgText);
  if (!bounds) {
    throw new Error("Kunde inte läsa viewBox från preview-SVG");
  }
  const { rootTransform } = extractSvgInner(svgText);
  const maxZ = computeMaxTileZoom(scale);
  return {
    version: 1,
    bounds,
    tileSize: TILE_SIZE_PX,
    minZ: 0,
    maxZPregen: Math.min(TILE_MAX_Z_PREGEN, maxZ),
    maxZ,
    scale,
    format: TILE_FORMAT,
    yFlip,
    rootTransform: rootTransform ?? IDENTITY_SVG_TRANSFORM,
  };
}

async function rasterizeFullBounds(
  svgText: string,
  bounds: SvgBounds,
  widthPx: number,
  heightPx: number,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const prepared = rewriteSvgViewBox(svgText, bounds, widthPx, heightPx);
  return sharp(Buffer.from(prepared, "utf-8"), {
    density: 96,
    limitInputPixels: false,
  })
    .resize(widthPx, heightPx, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function uploadTilesFromRaster(params: {
  raster: Buffer;
  width: number;
  height: number;
  channels: number;
  z: number;
  mapFileId: string;
  versionNumber: number;
  /** Origin tile indices when raster is a quadrant of a larger grid. */
  originTileX?: number;
  originTileY?: number;
}): Promise<void> {
  const {
    raster,
    width,
    height,
    channels,
    z,
    mapFileId,
    versionNumber,
    originTileX = 0,
    originTileY = 0,
  } = params;

  const tilesX = Math.floor(width / TILE_SIZE_PX);
  const tilesY = Math.floor(height / TILE_SIZE_PX);

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const left = tx * TILE_SIZE_PX;
      const top = ty * TILE_SIZE_PX;
      const webp = await sharp(raster, {
        raw: { width, height, channels: channels as 1 | 2 | 3 | 4 },
      })
        .extract({ left, top, width: TILE_SIZE_PX, height: TILE_SIZE_PX })
        .webp({ quality: 80 })
        .toBuffer();
      await uploadTile(
        mapFileId,
        versionNumber,
        z,
        originTileX + tx,
        originTileY + ty,
        webp,
      );
    }
  }
}

async function generatePregenTiles(
  svgText: string,
  manifest: TileManifest,
  mapFileId: string,
  versionNumber: number,
): Promise<void> {
  const bounds = manifest.bounds;

  // z0–z2: one full-map render each (small enough)
  for (let z = 0; z <= Math.min(2, manifest.maxZPregen); z++) {
    const n = tilesPerSide(z);
    const px = n * TILE_SIZE_PX;
    const { data, info } = await rasterizeFullBounds(svgText, bounds, px, px);
    await uploadTilesFromRaster({
      raster: data,
      width: info.width,
      height: info.height,
      channels: info.channels,
      z,
      mapFileId,
      versionNumber,
    });
  }

  if (manifest.maxZPregen < 3) return;

  // z3: 4096² full render
  {
    const z = 3;
    const px = tilesPerSide(z) * TILE_SIZE_PX;
    const { data, info } = await rasterizeFullBounds(svgText, bounds, px, px);
    await uploadTilesFromRaster({
      raster: data,
      width: info.width,
      height: info.height,
      channels: info.channels,
      z,
      mapFileId,
      versionNumber,
    });
  }

  if (manifest.maxZPregen < 4) return;

  // z4: four 4096² quadrants → 16×16 tiles without holding 8192² in memory
  {
    const z = 4;
    const n = tilesPerSide(z);
    const half = n / 2;
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    const quads: Array<{ bounds: SvgBounds; originX: number; originY: number }> = [
      {
        bounds: { minX: bounds.minX, minY: bounds.minY, maxX: midX, maxY: midY },
        originX: 0,
        originY: 0,
      },
      {
        bounds: { minX: midX, minY: bounds.minY, maxX: bounds.maxX, maxY: midY },
        originX: half,
        originY: 0,
      },
      {
        bounds: { minX: bounds.minX, minY: midY, maxX: midX, maxY: bounds.maxY },
        originX: 0,
        originY: half,
      },
      {
        bounds: { minX: midX, minY: midY, maxX: bounds.maxX, maxY: bounds.maxY },
        originX: half,
        originY: half,
      },
    ];

    const quadPx = half * TILE_SIZE_PX;
    for (const quad of quads) {
      const { data, info } = await rasterizeFullBounds(
        svgText,
        quad.bounds,
        quadPx,
        quadPx,
      );
      await uploadTilesFromRaster({
        raster: data,
        width: info.width,
        height: info.height,
        channels: info.channels,
        z,
        mapFileId,
        versionNumber,
        originTileX: quad.originX,
        originTileY: quad.originY,
      });
    }
  }
}

export async function generateOnDemandTile(params: {
  ocdBuffer: Buffer;
  manifest: TileManifest;
  mapFileId: string;
  versionNumber: number;
  z: number;
  x: number;
  y: number;
}): Promise<Buffer> {
  const { ocdBuffer, manifest, mapFileId, versionNumber, z, x, y } = params;
  const bounds = tileBounds(manifest, z, x, y);

  const ocadFile = await readOcad(ocdBuffer, { quietWarnings: true });
  const indices = new Set<number>();
  for (const obj of ocadFile.objects) {
    const idx = obj.objIndex?._index;
    if (idx == null) continue;
    const objBounds = objectSvgBounds(obj, manifest.yFlip);
    if (objBounds && boundsIntersect(objBounds, bounds)) {
      indices.add(idx);
    }
  }

  let svg: string;
  if (indices.size === 0) {
    // Empty tile — solid white
    return sharp({
      create: {
        width: TILE_SIZE_PX,
        height: TILE_SIZE_PX,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .webp({ quality: 80 })
      .toBuffer();
  }

  svg = await generateOcadSvgFiltered(ocdBuffer, indices, bounds);
  const webp = await rasterizeSvgRegion(svg, bounds);
  await uploadTile(mapFileId, versionNumber, z, x, y, webp);
  return webp;
}

export async function readTileManifest(manifestPath: string): Promise<TileManifest> {
  const buf = await readStoredFile(manifestPath);
  return JSON.parse(buf.toString("utf-8")) as TileManifest;
}

/**
 * Build z0–maxZPregen tiles and write manifest. Idempotent via tileStatus lock.
 */
export async function buildTilePyramidForVersion(versionId: string): Promise<void> {
  const version = await prisma.mapVersion.findUnique({ where: { id: versionId } });
  if (!version) return;

  if (version.tileStatus === "READY" && version.tileManifestPath) {
    if (await fileExists(version.tileManifestPath)) return;
  }

  // Allow re-entry when claimTilePyramidBuild already set PROCESSING
  const alreadyClaimed = version.tileStatus === "PROCESSING";
  if (!alreadyClaimed) {
    await prisma.mapVersion.update({
      where: { id: versionId },
      data: { tileStatus: "PROCESSING", tileError: null },
    });
  }

  try {
    const { svgText } = await ensurePreviewSvg(version);
    const ocdBuffer = await readStoredFile(version.storagePath);
    const ocadFile = await readOcad(ocdBuffer, { quietWarnings: true });
    const rawBounds = ocadFile.getBounds();
    const yFlip =
      rawBounds && rawBounds.length >= 4 ? rawBounds[1]! + rawBounds[3]! : 0;
    const scale =
      typeof ocadFile.getCrs()?.scale === "number" && ocadFile.getCrs().scale! > 0
        ? ocadFile.getCrs().scale!
        : 15000;

    const manifest = buildManifestFromSvg(svgText, yFlip, scale);
    await generatePregenTiles(svgText, manifest, version.mapFileId, version.versionNumber);

    const manifestPath = buildTileManifestPath(version.mapFileId, version.versionNumber);
    await uploadFile(manifestPath, Buffer.from(JSON.stringify(manifest), "utf-8"));

    await prisma.mapVersion.update({
      where: { id: versionId },
      data: {
        tileStatus: "READY",
        tileManifestPath: manifestPath,
        tileError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tile-generering misslyckades";
    console.error("Tile pyramid failed:", versionId, err);
    await prisma.mapVersion.update({
      where: { id: versionId },
      data: { tileStatus: "ERROR", tileError: message },
    });
    throw err;
  }
}

/**
 * Claim PROCESSING if not already building/ready. Caller runs buildTilePyramidForVersion after response.
 */
export async function claimTilePyramidBuild(versionId: string): Promise<{
  claimed: boolean;
  status: string;
}> {
  const version = await prisma.mapVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    return { claimed: false, status: "MISSING" };
  }

  if (version.tileStatus === "READY" && version.tileManifestPath) {
    if (await fileExists(version.tileManifestPath)) {
      return { claimed: false, status: "READY" };
    }
  }

  if (version.tileStatus === "PROCESSING") {
    return { claimed: false, status: "PROCESSING" };
  }

  await prisma.mapVersion.update({
    where: { id: versionId },
    data: { tileStatus: "PROCESSING", tileError: null },
  });
  return { claimed: true, status: "PROCESSING" };
}

export async function rebuildTilePyramid(versionId: string): Promise<void> {
  await prisma.mapVersion.update({
    where: { id: versionId },
    data: { tileStatus: "PENDING", tileError: null, tileManifestPath: null },
  });
  await buildTilePyramidForVersion(versionId);
}
