import { prisma } from "@/lib/prisma";
import { suggestionObjectTypeForGeometry } from "./access";
import {
  SuggestionStatus,
  type SuggestionDetail,
  type SuggestionSummary,
  type SuggestionGeometry,
} from "./types";

const suggestionWithUserSelect = {
  id: true,
  mapFileId: true,
  mapVersionId: true,
  createdById: true,
  status: true,
  category: true,
  locationConfidence: true,
  title: true,
  comment: true,
  reviewComment: true,
  reviewedAt: true,
  checkoutId: true,
  integratedVersionId: true,
  attachmentPath: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
  integratedVersion: { select: { versionNumber: true } },
  _count: { select: { objects: true } },
} as const;

function parseGeometryJson(json: string) {
  return JSON.parse(json) as SuggestionDetail["objects"][0]["geometry"];
}

export async function getLatestPublishedVersionNumber(
  mapFileId: string,
): Promise<number | null> {
  const latest = await prisma.mapVersion.findFirst({
    where: { mapFileId, isPublished: true },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return latest?.versionNumber ?? null;
}

export function appliesToOlderVersion(
  suggestionVersionNumber: number,
  latestPublishedVersionNumber: number | null,
): boolean {
  if (latestPublishedVersionNumber == null) return false;
  return suggestionVersionNumber < latestPublishedVersionNumber;
}

export function serializeSuggestionSummary(
  suggestion: {
    id: string;
    status: string;
    category: string;
    locationConfidence: string;
    title: string | null;
    comment: string;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    mapVersionId: string;
    attachmentPath: string | null;
    createdBy: { id: string; name: string | null; email: string };
    reviewedBy: { id: string; name: string | null; email: string } | null;
    mapVersion: { versionNumber: number };
    _count: { objects: number };
  },
  latestPublishedVersionNumber: number | null,
): SuggestionSummary {
  return {
    id: suggestion.id,
    status: suggestion.status as SuggestionSummary["status"],
    category: suggestion.category as SuggestionSummary["category"],
    locationConfidence: suggestion.locationConfidence as SuggestionSummary["locationConfidence"],
    title: suggestion.title,
    comment: suggestion.comment,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
    mapVersionId: suggestion.mapVersionId,
    versionNumber: suggestion.mapVersion.versionNumber,
    appliesToOlderVersion: appliesToOlderVersion(
      suggestion.mapVersion.versionNumber,
      latestPublishedVersionNumber,
    ),
    hasAttachment: Boolean(suggestion.attachmentPath),
    createdBy: suggestion.createdBy,
    reviewedAt: suggestion.reviewedAt?.toISOString() ?? null,
    reviewedBy: suggestion.reviewedBy,
    objectCount: suggestion._count.objects,
  };
}

export function serializeSuggestionDetail(
  suggestion: {
    id: string;
    status: string;
    category: string;
    locationConfidence: string;
    title: string | null;
    comment: string;
    reviewComment: string | null;
    reviewedAt: Date | null;
    checkoutId: string | null;
    integratedVersionId: string | null;
    attachmentPath: string | null;
    createdAt: Date;
    updatedAt: Date;
    mapVersionId: string;
    createdBy: { id: string; name: string | null; email: string };
    reviewedBy: { id: string; name: string | null; email: string } | null;
    mapVersion: { versionNumber: number };
    integratedVersion: { versionNumber: number } | null;
    objects: Array<{
      id: string;
      objectType: string;
      geometryJson: string;
      sortOrder: number;
    }>;
    _count?: { objects: number };
  },
  latestPublishedVersionNumber: number | null,
): SuggestionDetail {
  const objects = suggestion.objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((obj) => ({
      id: obj.id,
      objectType: obj.objectType as SuggestionDetail["objects"][0]["objectType"],
      geometry: parseGeometryJson(obj.geometryJson),
      sortOrder: obj.sortOrder,
    }));

  return {
    ...serializeSuggestionSummary(
      {
        ...suggestion,
        _count: suggestion._count ?? { objects: objects.length },
      },
      latestPublishedVersionNumber,
    ),
    reviewComment: suggestion.reviewComment,
    checkoutId: suggestion.checkoutId,
    integratedVersionId: suggestion.integratedVersionId,
    integratedVersionNumber: suggestion.integratedVersion?.versionNumber ?? null,
    objects,
  };
}

export async function listSuggestionsForMap(mapFileId: string, status?: string) {
  return prisma.mapSuggestion.findMany({
    where: {
      mapFileId,
      mapVersion: { isPublished: true },
      ...(status ? { status } : {}),
    },
    select: suggestionWithUserSelect,
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function listPendingSuggestionsForMap(mapFileId: string) {
  return prisma.mapSuggestion.findMany({
    where: {
      mapFileId,
      status: { in: [SuggestionStatus.OPEN, SuggestionStatus.IN_PROGRESS] },
    },
    select: suggestionWithUserSelect,
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function listSuggestionOverlaysForVersion(
  mapFileId: string,
  mapVersionId: string,
) {
  const rows = await prisma.mapSuggestion.findMany({
    where: {
      mapFileId,
      mapVersionId,
      status: { in: [SuggestionStatus.OPEN, SuggestionStatus.IN_PROGRESS] },
      mapVersion: { isPublished: true },
    },
    select: {
      id: true,
      status: true,
      category: true,
      objects: {
        orderBy: { sortOrder: "asc" },
        select: { geometryJson: true, sortOrder: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.flatMap((row) =>
    row.objects.map((obj) => ({
      id: row.id,
      status: row.status as SuggestionSummary["status"],
      category: row.category as SuggestionSummary["category"],
      sortOrder: obj.sortOrder,
      geometry: parseGeometryJson(obj.geometryJson),
    })),
  );
}

/** Öppna och pågående kartförslag på alla versioner (för områdessidan). */
export async function listPendingSuggestionOverlaysForMap(mapFileId: string) {
  const rows = await prisma.mapSuggestion.findMany({
    where: {
      mapFileId,
      status: { in: [SuggestionStatus.OPEN, SuggestionStatus.IN_PROGRESS] },
    },
    select: {
      id: true,
      status: true,
      category: true,
      objects: {
        orderBy: { sortOrder: "asc" },
        select: { geometryJson: true, sortOrder: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.flatMap((row) =>
    row.objects.map((obj) => ({
      id: row.id,
      status: row.status as SuggestionSummary["status"],
      category: row.category as SuggestionSummary["category"],
      sortOrder: obj.sortOrder,
      geometry: parseGeometryJson(obj.geometryJson),
    })),
  );
}

export async function countOpenSuggestionsForUser(mapFileId: string, userId: string) {
  return prisma.mapSuggestion.count({
    where: {
      mapFileId,
      createdById: userId,
      status: SuggestionStatus.OPEN,
    },
  });
}

export async function listPendingSuggestionsByVersion(mapFileId: string): Promise<
  {
    versionId: string;
    versionNumber: number;
    open: number;
    inProgress: number;
  }[]
> {
  const rows = await prisma.mapSuggestion.findMany({
    where: {
      mapFileId,
      status: { in: [SuggestionStatus.OPEN, SuggestionStatus.IN_PROGRESS] },
    },
    select: {
      status: true,
      mapVersion: { select: { id: true, versionNumber: true } },
    },
  });

  const byVersion = new Map<
    string,
    { versionId: string; versionNumber: number; open: number; inProgress: number }
  >();

  for (const row of rows) {
    let entry = byVersion.get(row.mapVersion.id);
    if (!entry) {
      entry = {
        versionId: row.mapVersion.id,
        versionNumber: row.mapVersion.versionNumber,
        open: 0,
        inProgress: 0,
      };
      byVersion.set(row.mapVersion.id, entry);
    }
    if (row.status === SuggestionStatus.OPEN) entry.open += 1;
    if (row.status === SuggestionStatus.IN_PROGRESS) entry.inProgress += 1;
  }

  return [...byVersion.values()].sort((a, b) => b.versionNumber - a.versionNumber);
}

/** @deprecated Använd listPendingSuggestionsByVersion */
export async function countPendingSuggestionsForMap(mapFileId: string): Promise<{
  open: number;
  inProgress: number;
}> {
  const rows = await listPendingSuggestionsByVersion(mapFileId);
  return rows.reduce(
    (acc, row) => ({
      open: acc.open + row.open,
      inProgress: acc.inProgress + row.inProgress,
    }),
    { open: 0, inProgress: 0 },
  );
}

export async function getSuggestionById(suggestionId: string) {
  return prisma.mapSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      createdBy: { select: { id: true, name: true, email: true, receiveNotifications: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
      integratedVersion: { select: { versionNumber: true } },
      objects: { orderBy: { sortOrder: "asc" } },
      _count: { select: { objects: true } },
    },
  });
}

export async function createSuggestion(params: {
  mapFileId: string;
  mapVersionId: string;
  createdById: string;
  category: string;
  locationConfidence: string;
  title: string | null;
  comment: string;
  geometries: SuggestionGeometry[];
  attachmentPath?: string | null;
}) {
  return prisma.mapSuggestion.create({
    data: {
      mapFileId: params.mapFileId,
      mapVersionId: params.mapVersionId,
      createdById: params.createdById,
      category: params.category,
      locationConfidence: params.locationConfidence,
      title: params.title,
      comment: params.comment,
      attachmentPath: params.attachmentPath ?? null,
      objects: {
        create: params.geometries.map((geometry, sortOrder) => ({
          objectType: suggestionObjectTypeForGeometry(geometry),
          geometryJson: JSON.stringify(geometry),
          sortOrder,
        })),
      },
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
      integratedVersion: { select: { versionNumber: true } },
      objects: { orderBy: { sortOrder: "asc" } },
      _count: { select: { objects: true } },
    },
  });
}

export async function updateSuggestion(
  suggestionId: string,
  data: {
    category?: string;
    locationConfidence?: string;
    title?: string | null;
    comment?: string;
    status?: string;
    reviewComment?: string | null;
    reviewedById?: string | null;
    reviewedAt?: Date | null;
    checkoutId?: string | null;
    integratedVersionId?: string | null;
    geometry?: SuggestionGeometry;
  },
) {
  return prisma.$transaction(async (tx) => {
    if (data.geometry) {
      const objectType = suggestionObjectTypeForGeometry(data.geometry);
      await tx.mapSuggestionObject.deleteMany({ where: { suggestionId } });
      await tx.mapSuggestionObject.create({
        data: {
          suggestionId,
          objectType,
          geometryJson: JSON.stringify(data.geometry),
          sortOrder: 0,
        },
      });
    }

    const { geometry: _g, ...updateData } = data;

    return tx.mapSuggestion.update({
      where: { id: suggestionId },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true, receiveNotifications: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
        integratedVersion: { select: { versionNumber: true } },
        objects: { orderBy: { sortOrder: "asc" } },
        _count: { select: { objects: true } },
      },
    });
  });
}

export async function deleteSuggestion(suggestionId: string) {
  return prisma.mapSuggestion.delete({ where: { id: suggestionId } });
}
