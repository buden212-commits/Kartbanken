import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile } from "@/lib/storage";
import type { TileManifest } from "@/lib/ocad/tile-math";

export async function readTileManifest(manifestPath: string): Promise<TileManifest> {
  const buf = await readStoredFile(manifestPath);
  return JSON.parse(buf.toString("utf-8")) as TileManifest;
}

/**
 * Claim PROCESSING if not already building/ready. Caller runs buildTilePyramidForVersion after response.
 * Kept separate from tile-generate so status API does not load sharp.
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

export async function markTilePyramidPending(versionId: string): Promise<void> {
  await prisma.mapVersion.update({
    where: { id: versionId },
    data: { tileStatus: "PENDING", tileError: null, tileManifestPath: null },
  });
}
