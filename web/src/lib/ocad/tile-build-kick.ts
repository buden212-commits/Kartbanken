import { prisma } from "@/lib/prisma";
import { runAfterResponse } from "@/lib/background";

/**
 * A chunk claim is considered dead after this long. Chunks run inside a single
 * serverless invocation (maxDuration 300 s), so anything older has crashed or
 * been killed.
 */
const CHUNK_STALE_MS = 6 * 60 * 1000;

export async function markTileBuildFailed(versionId: string, message: string): Promise<void> {
  await prisma.mapVersion.update({
    where: { id: versionId },
    data: {
      tileStatus: "ERROR",
      tileError: message,
      tileBuildStartedAt: null,
    },
  });
}

/** True when no worker currently holds the build (finished chunk, crash, or never started). */
export function tileBuildChunkIsFree(version: {
  tileStatus: string;
  tileBuildStartedAt: Date | null;
}): boolean {
  if (version.tileStatus !== "PROCESSING") return false;
  const started = version.tileBuildStartedAt?.getTime();
  if (!started) return true;
  return Date.now() - started > CHUNK_STALE_MS;
}

/**
 * Run the next build chunk after the HTTP response. Each chunk renders one
 * zoom level (or quadrant) so a single invocation never exceeds its limit;
 * the client keeps polling and each poll starts the following chunk.
 */
export function scheduleTileBuildChunk(versionId: string): void {
  runAfterResponse(async () => {
    try {
      const { runNextTileBuildChunk } = await import("@/lib/ocad/tile-generate");
      await runNextTileBuildChunk(versionId);
    } catch (err) {
      console.error("Tile build chunk failed:", versionId, err);
      const message = err instanceof Error ? err.message : "Kunde inte bygga karttiles";
      await markTileBuildFailed(versionId, message);
    }
  });
}
