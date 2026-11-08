import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MapVersionSource = {
  UPLOAD: "UPLOAD",
  INTEGRATION: "INTEGRATION",
  FIELD_EDIT: "FIELD_EDIT",
  DUPLICATE_CLEANUP: "DUPLICATE_CLEANUP",
} as const;

export type MapVersionSource = (typeof MapVersionSource)[keyof typeof MapVersionSource];

/** Sources built on the server from the previous head — OCAD object indices stay stable. */
export const INDEX_PRESERVING_SOURCES: string[] = [
  MapVersionSource.INTEGRATION,
  MapVersionSource.FIELD_EDIT,
  MapVersionSource.DUPLICATE_CLEANUP,
];

/**
 * Versions whose file is fully stored. `upload-init` creates a placeholder row
 * (no contentHash) before the file exists — it must never be treated as head.
 */
export const COMPLETED_VERSION_WHERE = {
  contentHash: { not: null },
} satisfies Prisma.MapVersionWhereInput;

export async function findHeadVersion(mapFileId: string) {
  return prisma.mapVersion.findFirst({
    where: { mapFileId, ...COMPLETED_VERSION_WHERE },
    orderBy: { versionNumber: "desc" },
  });
}

export class HeadVersionChangedError extends Error {
  constructor() {
    super(
      "Kartan fick en ny version medan ändringarna sparades. Försök igen — ändringarna appliceras då på den senaste versionen.",
    );
    this.name = "HeadVersionChangedError";
  }
}

/**
 * Takes the per-map advisory lock (released at commit) and verifies head.
 * Shared by version creation and checkout reservation so both are serialized.
 */
export async function lockMapAndVerifyHead(
  tx: Prisma.TransactionClient,
  mapFileId: string,
  expectedHeadId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${mapFileId}))`;

  const head = await tx.mapVersion.findFirst({
    where: { mapFileId, ...COMPLETED_VERSION_WHERE },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  if (head?.id !== expectedHeadId) {
    throw new HeadVersionChangedError();
  }
}

/**
 * Serializes version creation per map (advisory lock, released at commit) and
 * verifies that head is still `expectedHeadId`. Returns the next free versionNumber.
 * Prevents two integrations from both building on the same head, which would
 * silently drop the first one's changes.
 */
export async function lockMapAndAllocateVersionNumber(
  tx: Prisma.TransactionClient,
  mapFileId: string,
  expectedHeadId: string,
): Promise<number> {
  await lockMapAndVerifyHead(tx, mapFileId, expectedHeadId);

  const max = await tx.mapVersion.aggregate({
    where: { mapFileId },
    _max: { versionNumber: true },
  });
  return (max._max.versionNumber ?? 0) + 1;
}

/**
 * True when a non-index-preserving version (manual upload) was added after
 * `baseVersionId`. Object indices from the checkout export no longer point at
 * the same objects in head then.
 */
export async function hasManualUploadSinceBase(
  mapFileId: string,
  baseVersionId: string,
  headVersionId: string,
): Promise<boolean> {
  if (baseVersionId === headVersionId) return false;
  const [base, head] = await Promise.all([
    prisma.mapVersion.findUnique({ where: { id: baseVersionId }, select: { versionNumber: true } }),
    prisma.mapVersion.findUnique({ where: { id: headVersionId }, select: { versionNumber: true } }),
  ]);
  if (!base || !head) return true;

  const manual = await prisma.mapVersion.count({
    where: {
      mapFileId,
      ...COMPLETED_VERSION_WHERE,
      versionNumber: { gt: base.versionNumber, lte: head.versionNumber },
      source: { notIn: INDEX_PRESERVING_SOURCES },
    },
  });
  return manual > 0;
}
