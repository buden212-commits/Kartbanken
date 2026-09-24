import { findExactDuplicateGroups, type ExactDuplicateGroup } from "@/lib/ocad/exact-duplicates";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { readStoredFile } from "@/lib/storage";
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
