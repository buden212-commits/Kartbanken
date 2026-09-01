import { computeVersionDiff, parseMapVersion } from "@/lib/ocad/process-version";
import { prisma } from "@/lib/prisma";

/** Anta att pågående beräkning fortfarande körs — undvik parallella dubbelkörningar. */
const VERSION_DIFF_LEASE_MS = 15 * 60 * 1000;

type DiffProcessingMeta = {
  processingStartedAt?: string;
  error?: string;
};

function parseDiffMeta(summaryJson: string | null): DiffProcessingMeta {
  if (!summaryJson) return {};
  try {
    const parsed = JSON.parse(summaryJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    if (typeof parsed.added === "number") return {};
    return {
      processingStartedAt:
        typeof parsed.processingStartedAt === "string" ? parsed.processingStartedAt : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return {};
  }
}

function processingStartedAtMs(
  diffRecord: { createdAt: Date; summaryJson: string | null },
): number {
  const meta = parseDiffMeta(diffRecord.summaryJson);
  if (meta.processingStartedAt) {
    const t = Date.parse(meta.processingStartedAt);
    if (!Number.isNaN(t)) return t;
  }
  return diffRecord.createdAt.getTime();
}

function isActiveProcessingLease(
  diffRecord: { createdAt: Date; summaryJson: string | null; status: string },
): boolean {
  if (diffRecord.status !== "PROCESSING" && diffRecord.status !== "PENDING") {
    return false;
  }
  return Date.now() - processingStartedAtMs(diffRecord) < VERSION_DIFF_LEASE_MS;
}

function isVersionDiffStale(
  diffRecord: { createdAt: Date; summaryJson: string | null; status: string },
): boolean {
  if (diffRecord.status !== "PROCESSING" && diffRecord.status !== "PENDING") {
    return false;
  }
  return Date.now() - processingStartedAtMs(diffRecord) >= VERSION_DIFF_LEASE_MS;
}

async function claimVersionDiffProcessing(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
): Promise<void> {
  const processingStartedAt = new Date().toISOString();
  await prisma.versionDiff.upsert({
    where: { versionAId_versionBId: { versionAId, versionBId } },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "PROCESSING",
      summaryJson: JSON.stringify({ processingStartedAt }),
    },
    update: {
      status: "PROCESSING",
      summaryJson: JSON.stringify({ processingStartedAt }),
    },
  });
}

async function markVersionDiffError(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  error: string,
): Promise<void> {
  await prisma.versionDiff.upsert({
    where: { versionAId_versionBId: { versionAId, versionBId } },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "ERROR",
      summaryJson: JSON.stringify({ error }),
    },
    update: {
      status: "ERROR",
      summaryJson: JSON.stringify({ error }),
    },
  });
}

export type EnsureVersionDiffResult =
  | { status: "ok" }
  | { status: "processing" }
  | { status: "error"; error: string };

/**
 * Säkerställ att diff mellan två versioner är beräknad.
 * Kör beräkningen i anropet (inte bakgrund) så den faktiskt slutförs på Vercel.
 */
export async function ensureVersionDiffReady(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  options?: { force?: boolean },
): Promise<EnsureVersionDiffResult> {
  const force = options?.force ?? false;

  let diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId, versionBId } },
  });

  if (diffRecord?.status === "OK") {
    return { status: "ok" };
  }

  if (diffRecord?.status === "ERROR" && !force) {
    const meta = parseDiffMeta(diffRecord.summaryJson);
    return { status: "error", error: meta.error ?? "Diff misslyckades" };
  }

  if (!force && diffRecord && isActiveProcessingLease(diffRecord)) {
    return { status: "processing" };
  }

  await claimVersionDiffProcessing(mapFileId, versionAId, versionBId);

  try {
    await Promise.all([parseMapVersion(versionAId), parseMapVersion(versionBId)]);
    await computeVersionDiff(mapFileId, versionAId, versionBId);
    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Diff misslyckades";
    await markVersionDiffError(mapFileId, versionAId, versionBId, message);
    return { status: "error", error: message };
  }
}
