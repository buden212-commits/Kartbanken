import { prisma } from "@/lib/prisma";
import { runAfterResponse } from "@/lib/background";

/** Stuck in preview/OCD read before tile count is known. */
const PREPARE_STALE_MS = 2 * 60 * 1000;
/** Overall build timeout (large maps). */
const BUILD_STALE_MS = 15 * 60 * 1000;

export async function markTileBuildFailed(versionId: string, message: string): Promise<void> {
  await prisma.mapVersion.update({
    where: { id: versionId },
    data: {
      tileStatus: "ERROR",
      tileError: message,
      tileBuildTotal: null,
      tileBuildDone: null,
      tileBuildCurrentZ: null,
      tileBuildMaxZPregen: null,
      tileBuildStartedAt: null,
    },
  });
}

export function isStaleTileBuild(version: {
  tileStatus: string;
  tileBuildStartedAt: Date | null;
  tileBuildTotal: number | null;
}): boolean {
  if (version.tileStatus !== "PROCESSING") return false;
  const started = version.tileBuildStartedAt?.getTime();
  if (!started) return true;
  const elapsed = Date.now() - started;
  if (version.tileBuildTotal == null && elapsed > PREPARE_STALE_MS) return true;
  if (elapsed > BUILD_STALE_MS) return true;
  return false;
}

/** Schedule tile pyramid build after HTTP response; errors are persisted on MapVersion. */
export function scheduleTilePyramidBuild(versionId: string): void {
  runAfterResponse(async () => {
    try {
      const { buildTilePyramidForVersion } = await import("@/lib/ocad/tile-generate");
      await buildTilePyramidForVersion(versionId);
    } catch (err) {
      console.error("Tile pyramid background build failed:", versionId, err);
      const message =
        err instanceof Error ? err.message : "Kunde inte bygga karttiles";
      await markTileBuildFailed(versionId, message);
    }
  });
}
