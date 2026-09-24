import {
  findExactDuplicateGroups,
  duplicateDedupIndexSets,
  type ExactDuplicateGroup,
} from "@/lib/ocad/exact-duplicates";
import {
  exportObjectsByIndices,
  markObjectsDeletedByIndices,
} from "@/lib/ocad/ocad-export-server";
import { readActiveObjectIndices } from "@/lib/ocad/ocad-integrate";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { sha256 } from "@/lib/hash";
import { buildMapVersionPath, readStoredFile, uploadFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export type DuplicateScanResult = {
  map: {
    id: string;
    slug: string;
    title: string;
    areaType: string;
  };
  version: {
    id: string;
    versionNumber: number;
    originalFilename: string;
    fileSizeBytes: number;
    objectCount: number | null;
    isPublished: boolean;
  };
  objectCount: number;
  parseDurationMs: number;
  scanDurationMs: number;
  duplicateGroupCount: number;
  /** Extra copies beyond the first in each group. */
  extraDuplicateCount: number;
  groups: ExactDuplicateGroup[];
  groupsTruncated: boolean;
};

const MAX_GROUPS_RETURNED = 500;

export async function scanMapVersionForDuplicates(
  versionId: string,
): Promise<DuplicateScanResult> {
  const version = await prisma.mapVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      versionNumber: true,
      originalFilename: true,
      fileSizeBytes: true,
      objectCount: true,
      isPublished: true,
      storagePath: true,
      mapFile: {
        select: { id: true, slug: true, title: true, areaType: true },
      },
    },
  });

  if (!version) {
    throw new Error("VERSION_NOT_FOUND");
  }

  const started = Date.now();
  const buffer = await readStoredFile(version.storagePath);
  const summary = await parseOcadBuffer(buffer, version.originalFilename);
  const groupsAll = findExactDuplicateGroups(summary.objects);
  const extraDuplicateCount = groupsAll.reduce((sum, group) => sum + (group.count - 1), 0);
  const groupsTruncated = groupsAll.length > MAX_GROUPS_RETURNED;
  const groups = groupsTruncated ? groupsAll.slice(0, MAX_GROUPS_RETURNED) : groupsAll;

  return {
    map: version.mapFile,
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      originalFilename: version.originalFilename,
      fileSizeBytes: version.fileSizeBytes,
      objectCount: version.objectCount,
      isPublished: version.isPublished,
    },
    objectCount: summary.objects.length,
    parseDurationMs: summary.parseDurationMs,
    scanDurationMs: Date.now() - started,
    duplicateGroupCount: groupsAll.length,
    extraDuplicateCount,
    groups,
    groupsTruncated,
  };
}

export type DuplicateExportKind = "duplicates" | "uniques";

export type DuplicateExportResult = {
  buffer: Buffer;
  fileName: string;
  keptObjects: number;
  kind: DuplicateExportKind;
  mapSlug: string;
  versionNumber: number;
};

async function loadVersionForDuplicateOps(versionId: string) {
  const version = await prisma.mapVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      versionNumber: true,
      originalFilename: true,
      storagePath: true,
      mapFileId: true,
      mapFile: {
        select: { id: true, slug: true, title: true, archivedAt: true },
      },
    },
  });
  if (!version) throw new Error("VERSION_NOT_FOUND");
  return version;
}

function safeFileStem(title: string): string {
  return (
    title.replace(/[^\wåäöÅÄÖ\-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") ||
    "karta"
  );
}

/**
 * Export either all objects that belong to duplicate groups, or only objects
 * that appear once (not in any duplicate group).
 */
export async function exportDuplicateScanSubset(
  versionId: string,
  kind: DuplicateExportKind,
): Promise<DuplicateExportResult> {
  const version = await loadVersionForDuplicateOps(versionId);
  const buffer = await readStoredFile(version.storagePath);
  const summary = await parseOcadBuffer(buffer, version.originalFilename);
  const groups = findExactDuplicateGroups(summary.objects);
  const { allInDuplicateGroups } = duplicateDedupIndexSets(groups);

  if (kind === "duplicates") {
    if (allInDuplicateGroups.size === 0) {
      throw new Error("NO_DUPLICATES");
    }
    const exported = exportObjectsByIndices(buffer, allInDuplicateGroups);
    return {
      buffer: exported.buffer,
      fileName: `${safeFileStem(version.mapFile.title)}-v${version.versionNumber}-dubbletter.ocd`,
      keptObjects: exported.keptObjects,
      kind,
      mapSlug: version.mapFile.slug,
      versionNumber: version.versionNumber,
    };
  }

  const active = readActiveObjectIndices(buffer);
  const uniqueIndices = new Set<number>();
  for (const index of active) {
    if (!allInDuplicateGroups.has(index)) uniqueIndices.add(index);
  }
  if (uniqueIndices.size === 0) {
    throw new Error("NO_UNIQUES");
  }
  const exported = exportObjectsByIndices(buffer, uniqueIndices);
  return {
    buffer: exported.buffer,
    fileName: `${safeFileStem(version.mapFile.title)}-v${version.versionNumber}-unika.ocd`,
    keptObjects: exported.keptObjects,
    kind,
    mapSlug: version.mapFile.slug,
    versionNumber: version.versionNumber,
  };
}

export type DedupeMapVersionResult = {
  versionId: string;
  versionNumber: number;
  deletedCount: number;
  duplicateGroupCount: number;
  mapSlug: string;
};

/**
 * Soft-delete extra copies in each exact-duplicate group (keep lowest objectIndex)
 * and create a new unpublished map version.
 */
export async function dedupeMapVersion(
  versionId: string,
  userId: string,
): Promise<DedupeMapVersionResult> {
  const version = await loadVersionForDuplicateOps(versionId);
  if (version.mapFile.archivedAt) {
    throw new Error("MAP_ARCHIVED");
  }

  const head = await prisma.mapVersion.findFirst({
    where: { mapFileId: version.mapFileId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });
  if (!head || head.id !== version.id) {
    throw new Error("NOT_HEAD_VERSION");
  }

  const sourceBuffer = await readStoredFile(version.storagePath);
  const summary = await parseOcadBuffer(sourceBuffer, version.originalFilename);
  const groups = findExactDuplicateGroups(summary.objects);
  const { extras } = duplicateDedupIndexSets(groups);

  if (extras.size === 0) {
    throw new Error("NO_DUPLICATES");
  }

  const working = Buffer.from(sourceBuffer);
  const { deleted } = markObjectsDeletedByIndices(working, extras);
  if (deleted === 0) {
    throw new Error("NO_DUPLICATES");
  }

  try {
    await parseOcadBuffer(working, "dedupe-preview.ocd");
  } catch {
    throw new Error("RESULT_INVALID");
  }

  const nextVersionNumber = head.versionNumber + 1;
  const storagePath = buildMapVersionPath(version.mapFileId, nextVersionNumber);
  const storedRef = await uploadFile(storagePath, working);
  const contentHash = sha256(working);
  const comment = `Borttagna dubbletter (${deleted} extra objekt i ${groups.length} grupper)`;

  const created = await prisma.mapVersion.create({
    data: {
      mapFileId: version.mapFileId,
      versionNumber: nextVersionNumber,
      storagePath: storedRef,
      originalFilename: `${safeFileStem(version.mapFile.title)}-v${nextVersionNumber}-utan-dubbletter.ocd`,
      fileSizeBytes: working.byteLength,
      contentHash,
      uploadedById: userId,
      comment,
      parseStatus: "PENDING",
    },
  });

  try {
    await processVersionAfterUpload(version.mapFileId, created.id, version.id);
  } catch (postErr) {
    console.error("[admin-duplicate-dedupe] post-process failed:", postErr);
  }

  return {
    versionId: created.id,
    versionNumber: created.versionNumber,
    deletedCount: deleted,
    duplicateGroupCount: groups.length,
    mapSlug: version.mapFile.slug,
  };
}

export type DuplicateScanMapOption = {
  id: string;
  slug: string;
  title: string;
  areaType: string;
  archivedAt: Date | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    isPublished: boolean;
    objectCount: number | null;
    originalFilename: string;
    fileSizeBytes: number;
  }>;
};

/** Active maps with recent versions for the admin duplicate scanner. */
export async function listMapsForDuplicateScan(): Promise<DuplicateScanMapOption[]> {
  const maps = await prisma.mapFile.findMany({
    where: { archivedAt: null },
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      areaType: true,
      archivedAt: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 20,
        select: {
          id: true,
          versionNumber: true,
          isPublished: true,
          objectCount: true,
          originalFilename: true,
          fileSizeBytes: true,
        },
      },
    },
  });

  return maps.filter((map) => map.versions.length > 0);
}
