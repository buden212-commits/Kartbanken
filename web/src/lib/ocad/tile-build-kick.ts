/**
 * A chunk claim is considered dead after this long. Chunks run inside a single
 * serverless invocation (maxDuration 300 s), so anything older has crashed or
 * been killed.
 */
const CHUNK_STALE_MS = 5 * 60 * 1000;

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
