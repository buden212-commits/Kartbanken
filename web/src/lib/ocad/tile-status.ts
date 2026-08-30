import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile } from "@/lib/storage";
import type { TileManifest } from "@/lib/ocad/tile-math";
import { isStaleTileBuild } from "@/lib/ocad/tile-build-kick";

export async function readTileManifest(manifestPath: string): Promise<TileManifest> {
  const buf = await readStoredFile(manifestPath);
  return JSON.parse(buf.toString("utf-8")) as TileManifest;
}

/**
 * Claim PROCESSING if not already building/ready. Caller runs build after response.
 * Stale PROCESSING (crashed background job) can be reclaimed.
 */
export async function claimTilePyramidBuild(versionId: string): Promise<{
  claimed: boolean;
  status: string;
  restarted: boolean;
}> {
  const version = await prisma.mapVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    return { claimed: false, status: "MISSING", restarted: false };
  }

  if (version.tileStatus === "READY" && version.tileManifestPath) {
    if (await fileExists(version.tileManifestPath)) {
      return { claimed: false, status: "READY", restarted: false };
    }
  }

  const wasProcessing = version.tileStatus === "PROCESSING";
  if (wasProcessing && !isStaleTileBuild(version)) {
    return { claimed: false, status: "PROCESSING", restarted: false };
  }

  await prisma.mapVersion.update({
    where: { id: versionId },
    data: {
      tileStatus: "PROCESSING",
      tileError: null,
      tileBuildTotal: null,
      tileBuildDone: 0,
      tileBuildCurrentZ: null,
      tileBuildMaxZPregen: null,
      tileBuildStartedAt: new Date(),
    },
  });
  return { claimed: true, status: "PROCESSING", restarted: wasProcessing };
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
    },
  });
}

export type TileBuildProgress = {
  total: number;
  done: number;
  remaining: number;
  percent: number;
  currentZ: number | null;
  maxZPregen: number | null;
  /** True while preview/OCD is prepared before tile count is known. */
  preparing: boolean;
};

export function tileBuildProgressFromVersion(version: {
  tileStatus: string;
  tileBuildTotal: number | null;
  tileBuildDone: number | null;
  tileBuildCurrentZ: number | null;
  tileBuildMaxZPregen: number | null;
  tileBuildStartedAt: Date | null;
}): TileBuildProgress | null {
  if (version.tileStatus !== "PROCESSING") return null;

  if (version.tileBuildTotal == null || version.tileBuildTotal <= 0) {
    return {
      total: 0,
      done: 0,
      remaining: 0,
      percent: 0,
      currentZ: null,
      maxZPregen: null,
      preparing: true,
    };
  }

  const total = version.tileBuildTotal;
  const done = Math.min(total, Math.max(0, version.tileBuildDone ?? 0));
  const remaining = Math.max(0, total - done);
  const percent = Math.min(100, Math.round((done / total) * 100));
  return {
    total,
    done,
    remaining,
    percent,
    currentZ:
      version.tileBuildCurrentZ != null && version.tileBuildCurrentZ >= 0
        ? version.tileBuildCurrentZ
        : null,
    maxZPregen: version.tileBuildMaxZPregen,
    preparing: false,
  };
}
