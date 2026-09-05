import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile, uploadFile } from "@/lib/storage";
import { parseOcadCrsFromSvg } from "@/lib/ocad/crs";
import { TILE_MANIFEST_VERSION, type TileManifest } from "@/lib/ocad/tile-math";
import { tileBuildChunkIsFree } from "@/lib/ocad/tile-build-kick";

export async function readTileManifest(manifestPath: string): Promise<TileManifest> {
  const buf = await readStoredFile(manifestPath);
  return JSON.parse(buf.toString("utf-8")) as TileManifest;
}

/**
 * Version 1 manifests predate georeferencing, which GPS and geo zoom need.
 * The tiles themselves are unaffected, so refresh the manifest from the stored
 * preview SVG instead of rebuilding the whole pyramid.
 */
export async function upgradeTileManifest(
  manifest: TileManifest,
  manifestPath: string,
  previewSvgPath: string | null,
): Promise<TileManifest> {
  if ((manifest.version ?? 1) >= TILE_MANIFEST_VERSION) return manifest;
  if (!previewSvgPath) return manifest;

  try {
    if (!(await fileExists(previewSvgPath))) return manifest;
    const svgText = (await readStoredFile(previewSvgPath)).toString("utf-8");
    const upgraded: TileManifest = {
      ...manifest,
      version: TILE_MANIFEST_VERSION,
      crs: parseOcadCrsFromSvg(svgText),
    };
    await uploadFile(manifestPath, Buffer.from(JSON.stringify(upgraded), "utf-8"));
    return upgraded;
  } catch (err) {
    console.warn("Tile manifest upgrade failed:", manifestPath, err);
    return manifest;
  }
}

/**
 * Take over the build when nothing is running. Returns claimed=true when the
 * caller should start the next chunk after the response.
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

  if (version.tileStatus === "PROCESSING" && !tileBuildChunkIsFree(version)) {
    return { claimed: false, status: "PROCESSING" };
  }

  const resuming = version.tileStatus === "PROCESSING" && version.tileBuildStage != null;

  await prisma.mapVersion.update({
    where: { id: versionId },
    data: {
      tileStatus: "PROCESSING",
      tileError: null,
      tileBuildStartedAt: new Date(),
      ...(resuming
        ? {}
        : {
            tileBuildTotal: null,
            tileBuildDone: 0,
            tileBuildCurrentZ: null,
            tileBuildMaxZPregen: null,
            tileBuildStage: null,
          }),
    },
  });
  return { claimed: true, status: "PROCESSING" };
}

export async function markTilePyramidPending(versionId: string): Promise<void> {
  await prisma.mapVersion.update({
    where: { id: versionId },
    data: {
      tileStatus: "PENDING",
      tileError: null,
      tileManifestPath: null,
      tileBuildTotal: null,
      tileBuildDone: 0,
      tileBuildCurrentZ: null,
      tileBuildMaxZPregen: null,
      tileBuildStartedAt: null,
      tileBuildStage: null,
    },
  });
}

export { tileBuildProgressFromVersion, type TileBuildProgress } from "./tile-progress";
